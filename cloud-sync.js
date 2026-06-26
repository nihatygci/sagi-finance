/* ════════════════════════════════════════════════════════════════════
   SAGI Finance — CLOUD SYNC  v3.0  (Collection-based architecture)
   ────────────────────────────────────────────────────────────────────
   Yeni mimari:
     users/{key}/settings          → tek doküman
     users/{key}/transactions/{id} → her işlem ayrı doküman
     users/{key}/wallets/{id}
     users/{key}/goals/{id}
     users/{key}/debts/{id}
     users/{key}/recurring/{id}
     users/{key}/categories/{id}
     users/{key}/budgets/{id}
     users/{key}/meta              → hesap meta bilgisi

   Bu yapıyla:
   • Firestore'un offline persistence'ı her dokümanı ayrı cache'ler
     → offline yazma SDK queue'sunda bekler, online olunca otomatik gider
   • onSnapshot collection'ı dinler → sadece değişen doküman gelir
   • İki cihaz aynı anda farklı item'a yazarsa çakışma olmaz
   • Migration: users/{key} blob dokümanı varsa otomatik taşınır

   Geriye uyumluluk:
   • plus.js'deki users/{key}/assistant/memory ve users/{key}/chat/messages
     bu mimariden bağımsız, dokunulmaz
   • forwardKey / PLUS- key yapısı korunur
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const COLLECTIONS = ['transactions','wallets','goals','debts','recurring','categories','budgets'];

  const Cloud = {
    status: 'idle',
    lastError: '',
    _unsubscribes: [],   // her collection listener'ı için ayrı unsub
    _settingsUnsub: null,

    // ─────────────────────────────────────────────────────────────────
    isAvailable() {
      return !!(window._fbReady && window._fbDB);
    },

    _emitStatus(s) {
      this.status = s;
      try { Core.emit('cloudStatusChanged', s); } catch(e) {}
    },

    // ── Key yönetimi ─────────────────────────────────────────────────
    generateKey() {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      return Array.from(buf).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{4}/g).join('-');
    },

    normalizeKey(raw) {
      if (!raw) return '';
      const str = String(raw).trim();
      const plusMatch = str.match(/^PLUS[-]?([0-9A-Fa-f-]{16,19})$/i);
      if (plusMatch) {
        const hex = plusMatch[1].replace(/[^0-9a-fA-F]/g,'').toUpperCase();
        if (hex.length === 16) return 'PLUS-' + hex.match(/.{4}/g).join('-');
      }
      const clean = str.replace(/[^0-9a-fA-F]/g,'').toUpperCase();
      if (clean.length === 16) return clean.match(/.{4}/g).join('-');
      return '';
    },

    isValidKey(key) {
      const k = key || '';
      return /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(k)
          || /^PLUS-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(k);
    },

    _docId(key) { return (key || '').replace(/-/g, ''); },

    // users/{key} root ref
    _userRef(key) {
      if (!this.isAvailable()) return null;
      return window._fbDB.collection('users').doc(this._docId(key || Core.state.settings.syncKey));
    },

    // users/{key}/{collection}
    _col(colName, key) {
      const ref = this._userRef(key);
      if (!ref) return null;
      return ref.collection(colName);
    },

    // ── Firebase hazır olunca başlat ─────────────────────────────────
    _waitForFirebaseAndNotify(attempts) {
      if (attempts === undefined) attempts = 0;
      if (this.isAvailable()) {
        if (Core.state.settings && Core.state.settings.syncKey && this._unsubscribes.length === 0) {
          this._boot().catch(e => console.warn('[Cloud] boot hatası:', e));
        } else {
          this._emitStatus('idle');
        }
        return;
      }
      if (attempts >= 40) { console.warn('[Cloud] Firebase 10sn içinde hazır olmadı.'); return; }
      setTimeout(() => this._waitForFirebaseAndNotify(attempts + 1), 250);
    },

    // ── Boot: migration kontrolü → veri yükle → listener'ları bağla ─
    async _boot() {
      const key = Core.state.settings.syncKey;
      if (!key || !this.isAvailable()) return;

      this._emitStatus('syncing');
      try {
        // PLUS yönlendirme kontrolü
        const redirectKey = await this._resolvePlusKey(key);
        if (redirectKey && redirectKey !== key) {
          Core.state.settings.syncKey = redirectKey;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          return this._boot();
        }

        // Eski blob migration kontrolü
        await this._migrateIfNeeded(key);

        // İlk yükleme: tüm collection'ları bir kez çek
        await this._initialLoad(key);

        // Realtime listener'ları bağla
        this.attachListeners(key);

        this._emitStatus('ok');
      } catch(e) {
        console.warn('[Cloud] boot hatası:', e);
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
      }
    },

    // ── PLUS yönlendirme ─────────────────────────────────────────────
    async _resolvePlusKey(key) {
      if (!this.isAvailable()) return null;
      try {
        // users/{key} meta doc'unda forwardKey var mı?
        const metaSnap = await this._userRef(key).collection('meta').doc('info').get();
        if (metaSnap.exists) {
          const meta = metaSnap.data();
          if (meta && meta.forwardKey) return this.normalizeKey(meta.forwardKey) || meta.forwardKey;
        }
        // Eski blob doc'unda forwardKey?
        const blobSnap = await window._fbDB.collection('users').doc(this._docId(key)).get();
        if (blobSnap.exists) {
          const blob = blobSnap.data();
          if (blob && blob.forwardKey) return this.normalizeKey(blob.forwardKey) || blob.forwardKey;
          if (blob && blob.state && blob.state.settings && blob.state.settings.syncKey) {
            const rsk = blob.state.settings.syncKey;
            if (rsk !== key && rsk.startsWith('PLUS-')) return rsk;
          }
        }
        // PLUS-{key} doc var mı?
        if (!key.startsWith('PLUS-')) {
          const plusKey = 'PLUS-' + key;
          const plusSnap = await window._fbDB.collection('users').doc(this._docId(plusKey)).get();
          if (plusSnap.exists) {
            // Eski doc'a forwardKey yaz (best-effort)
            try { await window._fbDB.collection('users').doc(this._docId(key)).set({ forwardKey: plusKey }, { merge: true }); } catch(e) {}
            return plusKey;
          }
        }
      } catch(e) { console.warn('[Cloud] PLUS kontrol hatası:', e); }
      return null;
    },

    // ── Migration: eski blob → sub-collection ────────────────────────
    // users/{key} dokümanında state alanı varsa (eski format) → migrate et
    async _migrateIfNeeded(key) {
      try {
        const blobRef = window._fbDB.collection('users').doc(this._docId(key));
        const blobSnap = await blobRef.get();
        if (!blobSnap.exists) return;
        const blob = blobSnap.data();
        // state alanı yok ya da zaten migrated → çık
        if (!blob || !blob.state || blob._migrated) return;

        console.log('[Cloud] Migration başladı — blob → sub-collection');
        const state = blob.state;
        const userRef = this._userRef(key);
        const batch = window._fbDB.batch();

        // Her collection'ı taşı
        COLLECTIONS.forEach(col => {
          const items = Array.isArray(state[col]) ? state[col] : [];
          items.forEach(item => {
            if (!item || !item.id) return;
            const docRef = userRef.collection(col).doc(item.id);
            batch.set(docRef, { ...item, _updatedAt: item._updatedAt || Date.now(), _deleted: false });
          });
        });

        // Settings'i taşı
        if (state.settings) {
          batch.set(userRef.collection('settings').doc('main'), {
            ...state.settings,
            _updatedAt: Date.now()
          });
        }

        // Meta
        batch.set(userRef.collection('meta').doc('info'), {
          syncKey: key,
          migratedAt: Date.now(),
          createdAt: blob.createdAt || null,
          consentDate: (state.settings && state.settings.consentDate) || null,
        });

        // Eski blob doc'u migrated olarak işaretle (silme — veri güvenliği için)
        batch.set(blobRef, { _migrated: true, _migratedAt: Date.now() }, { merge: true });

        await batch.commit();
        console.log('[Cloud] Migration tamamlandı.');
      } catch(e) {
        console.warn('[Cloud] Migration hatası:', e);
        // Migration başarısız olsa da devam et — eski blob'dan yükle
      }
    },

    // ── İlk yükleme: tüm collection'ları çek ────────────────────────
    async _initialLoad(key) {
      const userRef = this._userRef(key);
      // Paralel çek
      const [settingsSnap, ...colSnaps] = await Promise.all([
        userRef.collection('settings').doc('main').get(),
        ...COLLECTIONS.map(col => userRef.collection(col).where('_deleted','==',false).get())
      ]);

      // Settings
      if (settingsSnap.exists) {
        const remoteSettings = settingsSnap.data() || {};
        // syncKey'i koru, diğerlerini remote'tan al (per-field merge)
        Core.state.settings = this._mergeSettings(Core.state.settings, remoteSettings);
      }
      Core.state.settings.syncKey = key;

      // Collection'lar
      COLLECTIONS.forEach((col, i) => {
        const snap = colSnaps[i];
        const remoteMap = new Map();
        snap.forEach(doc => remoteMap.set(doc.id, { id: doc.id, ...doc.data() }));

        const localMap = new Map();
        (Core.state[col] || []).forEach(item => { if (item && item.id) localMap.set(item.id, item); });

        // Merge: her item için _updatedAt'i karşılaştır
        const merged = new Map();
        remoteMap.forEach((remoteItem, id) => merged.set(id, remoteItem));
        localMap.forEach((localItem, id) => {
          const remoteItem = merged.get(id);
          if (!remoteItem) {
            // Sadece local'de var — push edilecek (offline'da eklenmiş)
            merged.set(id, localItem);
          } else {
            const lTs = localItem._updatedAt || 0;
            const rTs = remoteItem._updatedAt || 0;
            merged.set(id, lTs > rTs ? localItem : remoteItem);
          }
        });

        Core.state[col] = Array.from(merged.values()).filter(item => !item._deleted);
      });

      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      try { Core.emit('stateChanged', Core.state); } catch(e) {}
      this._rerenderActiveView();

      // Local'de olup remote'da olmayan item'ları push et (offline'da eklenmişti)
      await this._pushLocalOnlyItems(key);
    },

    // Offline'da eklenip henüz Firestore'a gitmeyen item'ları yaz
    async _pushLocalOnlyItems(key) {
      const userRef = this._userRef(key);
      // Her collection için local'dekini Firestore'a yaz (set + merge:true)
      // Firestore offline cache'de zaten varsa üstüne yazar, yoksa ekler
      for (const col of COLLECTIONS) {
        const items = Core.state[col] || [];
        for (const item of items) {
          if (!item || !item.id) continue;
          try {
            await userRef.collection(col).doc(item.id).set(
              { ...item, _deleted: false, _updatedAt: item._updatedAt || Date.now() },
              { merge: true }
            );
          } catch(e) { /* offline ise SDK queue'ya alır */ }
        }
      }
    },

    // ── Settings merge (per-field) ────────────────────────────────────
    _mergeSettings(local, remote) {
      const FIELD_KEYS = ['theme','lang','anim','privacy','currency','name',
        'plusFont','plusColor','plusCustomColors','plusPlan',
        'bnavItems','notifMaster','notifications'];
      const localTs  = local._settingsTs  || {};
      const remoteTs = remote._settingsTs || {};
      const localMod  = local.lastModified  || 0;
      const remoteMod = remote.lastModified || 0;
      const merged = Object.assign({}, remote, local); // local base
      FIELD_KEYS.forEach(k => {
        const lTs = localTs[k]  || localMod;
        const rTs = remoteTs[k] || remoteMod;
        if (rTs > lTs) merged[k] = remote[k]; // remote daha yeni
      });
      const mergedTs = Object.assign({}, remoteTs, localTs);
      FIELD_KEYS.forEach(k => { if ((remoteTs[k]||0) > (localTs[k]||0)) mergedTs[k] = remoteTs[k]; });
      merged._settingsTs = mergedTs;
      merged.syncKey = local.syncKey; // her zaman local key
      return merged;
    },

    // ── Realtime listener'lar ─────────────────────────────────────────
    attachListeners(key) {
      this.detachListeners();
      if (!this.isAvailable() || !key) return;
      const userRef = this._userRef(key);

      // Settings listener
      this._settingsUnsub = userRef.collection('settings').doc('main')
        .onSnapshot(snap => {
          if (!snap.exists) return;
          const remoteSettings = snap.data() || {};
          const newSettings = this._mergeSettings(Core.state.settings, remoteSettings);
          newSettings.syncKey = key;
          Core.state.settings = newSettings;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          try { Core.emit('stateChanged', Core.state); } catch(e) {}
          this._applySettingsSideEffects(newSettings);
        }, err => console.warn('[Cloud] settings listener hatası:', err));

      // Her collection için listener
      COLLECTIONS.forEach(col => {
        const unsub = userRef.collection(col)
          .where('_deleted','==',false)
          .onSnapshot(snap => {
            snap.docChanges().forEach(change => {
              const item = { id: change.doc.id, ...change.doc.data() };
              if (change.type === 'removed' || item._deleted) {
                Core.state[col] = (Core.state[col] || []).filter(x => x.id !== item.id);
              } else {
                // added veya modified
                const arr = Core.state[col] || [];
                const idx = arr.findIndex(x => x.id === item.id);
                const localItem = idx >= 0 ? arr[idx] : null;
                const localTs  = (localItem && localItem._updatedAt) || 0;
                const remoteTs = item._updatedAt || 0;
                if (!localItem) {
                  Core.state[col] = [...arr, item];
                } else if (remoteTs >= localTs) {
                  const newArr = [...arr];
                  newArr[idx] = item;
                  Core.state[col] = newArr;
                }
                // localTs > remoteTs → local daha yeni, dokunma (henüz push edilmemiş)
              }
            });
            localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
            try { Core.emit('stateChanged', Core.state); } catch(e) {}
            this._rerenderActiveView();
          }, err => console.warn('[Cloud]', col, 'listener hatası:', err));
        this._unsubscribes.push(unsub);
      });

      this._emitStatus('ok');
    },

    detachListeners() {
      if (this._settingsUnsub) { try { this._settingsUnsub(); } catch(e) {} this._settingsUnsub = null; }
      this._unsubscribes.forEach(fn => { try { fn(); } catch(e) {} });
      this._unsubscribes = [];
    },

    // Geriye uyumluluk için alias
    detachListener() { this.detachListeners(); },
    get _unsubscribe() { return this._unsubscribes.length > 0 ? true : null; },

    // ── Tek item yaz ─────────────────────────────────────────────────
    // Core.DB.save() → _writeItem() çağrılır, blob push DEĞİL
    async _writeItem(col, item) {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (!item || !item.id) return;
      try {
        await this._userRef().collection(col).doc(item.id).set(
          { ...item, _deleted: false, _updatedAt: item._updatedAt || Date.now() },
          { merge: true }
        );
      } catch(e) {
        // Offline: Firestore SDK otomatik queue'ya alır, online olunca gönderir
        console.warn('[Cloud] _writeItem offline/hata (SDK queue\'ya alındı):', col, item.id);
      }
    },

    // Birden fazla item'ı batch yaz
    async _writeBatch(writes) {
      // writes: [{col, item}]
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (!writes || writes.length === 0) return;
      const userRef = this._userRef();
      const batch = window._fbDB.batch();
      writes.forEach(({ col, item }) => {
        if (!item || !item.id) return;
        const ref = userRef.collection(col).doc(item.id);
        batch.set(ref, { ...item, _deleted: false, _updatedAt: item._updatedAt || Date.now() }, { merge: true });
      });
      try {
        await batch.commit();
      } catch(e) {
        console.warn('[Cloud] _writeBatch offline/hata (SDK queue\'ya alındı)');
      }
    },

    // Soft delete
    async _deleteItem(col, id) {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      try {
        await this._userRef().collection(col).doc(id).set(
          { _deleted: true, _updatedAt: Date.now() },
          { merge: true }
        );
      } catch(e) {
        console.warn('[Cloud] _deleteItem offline/hata (SDK queue\'ya alındı):', col, id);
      }
    },

    // Settings yaz
    async _writeSettings() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      try {
        const s = { ...Core.state.settings, _updatedAt: Date.now() };
        await this._userRef().collection('settings').doc('main').set(s, { merge: true });
      } catch(e) {
        console.warn('[Cloud] _writeSettings offline/hata (SDK queue\'ya alındı)');
      }
    },

    // ── queuePush: DB.save() her çağırdığında buraya gelir ───────────
    // Yeni mimaride "tüm state'i push" yok.
    // Bunun yerine son değişen item'ları Firestore'a yazar.
    // Core.DB.save() çağrısı sonrası _pendingWrites set edilmeli.
    // Ama mevcut index.html'de hangi item değişti bilinmiyor — o yüzden
    // save() sonrası tüm state'i tarayıp diff alıyoruz.
    _pendingWrites: [],   // {col, item} listesi
    _pushTimer: null,
    _pushDelay: 800,

    queuePush(immediate) {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (this._pushTimer) clearTimeout(this._pushTimer);
      const doIt = () => {
        this._pushTimer = null;
        this._flushPending();
      };
      if (immediate) { doIt(); return; }
      this._pushTimer = setTimeout(doIt, this._pushDelay);
    },

    // Pending write'ları varsa yaz, yoksa diff al ve yaz
    async _flushPending() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      this._emitStatus('syncing');
      try {
        if (this._pendingWrites.length > 0) {
          const writes = [...this._pendingWrites];
          this._pendingWrites = [];
          await this._writeBatch(writes);
        } else {
          // Fallback: settings yaz (en azından settings güncel kalsın)
          await this._writeSettings();
        }
        if (Core.DB && Core.DB.clearPendingPush) Core.DB.clearPendingPush();
        this.lastError = '';
        this._emitStatus('ok');
      } catch(e) {
        console.warn('[Cloud] _flushPending hatası:', e);
        this.lastError = e.message || '';
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
      }
    },

    // Belirli bir item'ı queue'ya ekle (index.html'de item değişince çağrılabilir)
    markDirty(col, item) {
      if (!col || !item || !item.id) return;
      // Aynı id zaten varsa güncelle
      const idx = this._pendingWrites.findIndex(w => w.col === col && w.item.id === item.id);
      if (idx >= 0) this._pendingWrites[idx] = { col, item };
      else this._pendingWrites.push({ col, item });
    },

    // ── forceSync: kullanıcı butonu ──────────────────────────────────
    async forceSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (this._pushTimer) { clearTimeout(this._pushTimer); this._pushTimer = null; }
      this._emitStatus('syncing');
      try {
        await this._initialLoad(Core.state.settings.syncKey);
        await this._flushPending();
        this._emitStatus('ok');
        return 'merged';
      } catch(e) {
        console.warn('[Cloud] forceSync hatası:', e);
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
        throw e;
      }
    },

    async forcePush() {
      return this.forceSync();
    },

    // ── analyzeSync ──────────────────────────────────────────────────
    async analyzeSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return { status: 'unavailable' };
      try {
        const userRef = this._userRef();
        const counts = {};
        let totalNewFromRemote = 0, totalNewFromLocal = 0;
        for (const col of COLLECTIONS) {
          const snap = await userRef.collection(col).where('_deleted','==',false).get();
          const remoteIds = new Set();
          snap.forEach(doc => remoteIds.add(doc.id));
          const localIds = new Set((Core.state[col] || []).map(x => x && x.id).filter(Boolean));
          let newFromRemote = 0, newFromLocal = 0;
          remoteIds.forEach(id => { if (!localIds.has(id)) newFromRemote++; });
          localIds.forEach(id => { if (!remoteIds.has(id)) newFromLocal++; });
          if (newFromRemote || newFromLocal) counts[col] = { newFromRemote, newFromLocal };
          totalNewFromRemote += newFromRemote;
          totalNewFromLocal  += newFromLocal;
        }
        if (totalNewFromRemote === 0 && totalNewFromLocal === 0) return { status: 'in-sync' };
        return { status: 'diff', willMerge: true, totalNewFromRemote, totalNewFromLocal, details: counts };
      } catch(e) {
        return { status: 'error', error: e };
      }
    },

    // ── createAccount ────────────────────────────────────────────────
    async createAccount() {
      console.log('[Cloud] createAccount çağrıldı');
      if (!this.isAvailable()) {
        const err = new Error('CLOUD_UNAVAILABLE');
        err.detail = window._fbErr || 'sdk-missing';
        throw err;
      }
      const key = this.generateKey();
      Core.state.settings.syncKey = key;
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      const userRef = this._userRef(key);
      const batch = window._fbDB.batch();

      // Settings
      batch.set(userRef.collection('settings').doc('main'), {
        ...Core.state.settings, _updatedAt: Date.now()
      });

      // Meta
      const consentPayload = {};
      if (Core.state.settings.consentDate) {
        consentPayload.consentDate    = Core.state.settings.consentDate;
        consentPayload.consentVersion = Core.state.settings.consentVersion || null;
        consentPayload.consentLang    = Core.state.settings.consentLang    || null;
        consentPayload.consentMethod  = Core.state.settings.consentMethod  || null;
      }
      batch.set(userRef.collection('meta').doc('info'), {
        syncKey: key,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...consentPayload
      });

      // Mevcut local item'lar
      COLLECTIONS.forEach(col => {
        (Core.state[col] || []).forEach(item => {
          if (!item || !item.id) return;
          batch.set(userRef.collection(col).doc(item.id), {
            ...item, _deleted: false, _updatedAt: item._updatedAt || Date.now()
          });
        });
      });

      try {
        await batch.commit();
      } catch(e) {
        console.error('[Cloud] createAccount yazma hatası:', e.code, e.message);
        this._emitStatus('error');
        this.lastError = e.message || 'write-failed';
        throw e;
      }

      this._emitStatus('ok');
      this.attachListeners(key);
      return key;
    },

    // ── loginWithKey ─────────────────────────────────────────────────
    async loginWithKey(rawKey) {
      console.log('[Cloud] loginWithKey:', rawKey);
      const key = this.normalizeKey(rawKey);
      if (!this.isValidKey(key)) throw new Error('INVALID_KEY');

      // PLUS yönlendirme
      const redirectKey = await this._resolvePlusKey(key);
      if (redirectKey && redirectKey !== key) {
        return this.loginWithKey(redirectKey);
      }

      // Hesap var mı?
      const metaSnap = await this._userRef(key).collection('meta').doc('info').get();
      const blobSnap = await window._fbDB.collection('users').doc(this._docId(key)).get();

      if (!metaSnap.exists && (!blobSnap.exists || !blobSnap.data() || (!blobSnap.data().state && !blobSnap.data()._migrated))) {
        throw new Error('NOT_FOUND');
      }

      Core.state.settings.syncKey = key;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      await this._boot();
      return Core.state;
    },

    // ── signOut ──────────────────────────────────────────────────────
    signOut() {
      this.detachListeners();
      if (this._pushTimer) { clearTimeout(this._pushTimer); this._pushTimer = null; }
      Core.state.settings.syncKey = '';
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      this._emitStatus('idle');
      try { Core.emit('stateChanged', Core.state); } catch(e) {}
    },

    // ── deleteAccount ─────────────────────────────────────────────────
    async deleteAccount() {
      const key = Core.state.settings.syncKey;
      this.detachListeners();
      if (this._pushTimer) { clearTimeout(this._pushTimer); this._pushTimer = null; }

      if (key && this.isAvailable()) {
        try {
          const userRef = this._userRef(key);
          // Sub-collection'ları sil
          for (const col of [...COLLECTIONS, 'settings', 'meta']) {
            const snap = await userRef.collection(col).get();
            const batch = window._fbDB.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }
          // Eski blob doc
          await window._fbDB.collection('users').doc(this._docId(key)).delete();
          console.log('[Cloud] Hesap silindi:', key);
        } catch(e) { console.warn('[Cloud] deleteAccount hatası:', e); }
      }

      localStorage.removeItem(Core.DB.key);
      Core.state = JSON.parse(JSON.stringify({
        settings: {
          syncKey:'', lastModified: Date.now(),
          notifications:{abonelik:false,borc:false,butce:false,haftalik:false,krediKarti:false,hedef:false,buyukHarcama:false,doviz:false},
          notifMaster:false, theme:'light', lang:'tr', anim:'on', privacy:'off', currency:'TRY',
          consentDate:null, consentVersion:null, consentLang:null, consentMethod:null,
        },
        wallets:[], transactions:[], recurring:[], goals:[], debts:[], categories:[], budgets:[], _tombstones:{}
      }));
      this._emitStatus('idle');
      try { Core.emit('stateChanged', Core.state); } catch(e) {}
    },

    // ── Settings side effects ─────────────────────────────────────────
    _applySettingsSideEffects(settings) {
      try {
        const c = window.App && App.Controllers;
        if (!c) return;
        if (c.Settings) {
          c.Settings.applyTheme && c.Settings.applyTheme();
          if (settings.lang && window.LANG !== settings.lang) {
            window.LANG = settings.lang;
            typeof applyLang === 'function' && applyLang();
          }
        }
        if (c.BottomBar) {
          const items = settings.bnavItems;
          if (Array.isArray(items) && items.length > 0) {
            try { localStorage.setItem(c.BottomBar.STORAGE_KEY, JSON.stringify(items)); } catch(e) {}
          }
          c.BottomBar.renderNav();
        }
      } catch(e) {}
    },

    // ── Active view yeniden render ────────────────────────────────────
    _rerenderActiveView() {
      try {
        const hash = window.location.hash.replace('#','') || '/dashboard';
        const c = window.App && App.Controllers;
        if (!c) return;
        this._applySettingsSideEffects(Core.state.settings);
        if      (hash === '/dashboard')    c.Dashboard    && c.Dashboard.render    && c.Dashboard.render();
        else if (hash === '/wallets')      c.Wallets      && c.Wallets.render      && c.Wallets.render();
        else if (hash === '/transactions') c.Transactions && c.Transactions.renderSetup && c.Transactions.renderSetup();
        else if (hash === '/analytics')    c.Analytics    && c.Analytics.render    && c.Analytics.render();
        else if (hash === '/recurring')    c.Recurring    && c.Recurring.render    && c.Recurring.render();
        else if (hash === '/goals')        c.Goals        && c.Goals.render        && c.Goals.render();
        else if (hash === '/debts')        c.Debts        && c.Debts.render        && c.Debts.render();
        else if (hash === '/settings')     c.Settings     && c.Settings.renderForm && c.Settings.renderForm();
      } catch(e) { console.warn('[Cloud] rerender hatası:', e); }
    },
  };

  // ── Core'a bağla ────────────────────────────────────────────────────
  window.Cloud = Cloud;
  if (typeof window.Core !== 'undefined') {
    window.Core.Cloud = Cloud;
    console.log('[SAGI] Cloud v3 Core\'a bağlandı.');
  }

  // ── Lifecycle eventleri ──────────────────────────────────────────────
  document.addEventListener('visibilitychange', function() {
    if (!Cloud.isAvailable() || !Core.state.settings.syncKey) return;
    if (document.visibilityState === 'hidden') {
      // Bekleyen yazmalar varsa flush et
      if (Cloud._pendingWrites.length > 0 || Cloud._pushTimer) {
        if (Cloud._pushTimer) { clearTimeout(Cloud._pushTimer); Cloud._pushTimer = null; }
        Cloud._flushPending().catch(() => {});
      }
    } else if (document.visibilityState === 'visible') {
      // Öne gelince listener'lar zaten canlı, onSnapshot otomatik günceller
      // Ama listener kopmuşsa yeniden bağlan
      if (Cloud._unsubscribes.length === 0 && Cloud.isAvailable()) {
        Cloud.attachListeners(Core.state.settings.syncKey);
      }
    }
  });

  window.addEventListener('pagehide', function() {
    if (!Core.state.settings.syncKey) return;
    localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
  });

  window.addEventListener('online', function() {
    if (!Core.state.settings.syncKey || !Cloud.isAvailable()) return;
    console.log('[Cloud] Online olundu.');
    // Listener'lar kopmuş olabilir — yeniden bağlan
    if (Cloud._unsubscribes.length === 0) {
      Cloud.attachListeners(Core.state.settings.syncKey);
    }
    // Pending yazmaları gönder
    if (Core.DB && Core.DB.hasPendingPush && Core.DB.hasPendingPush()) {
      Cloud._flushPending().catch(() => {});
    }
  });

  window.addEventListener('offline', function() {
    if (!Core.state.settings.syncKey) return;
    Cloud._emitStatus('offline');
    // Listener'ları kesmiyoruz — SDK offline persistence halleder
  });

  window.addEventListener('DOMContentLoaded', function() {
    if (typeof window.Core !== 'undefined') window.Core.Cloud = Cloud;
    if (window.Core && window.Core.Cloud && window._fbReady && window._fbDB) {
      window.Core.Cloud.status = 'idle';
      setTimeout(() => { try { window.Core.emit('cloudStatusChanged', 'idle'); } catch(e) {} }, 0);
    }
  }, true);

})();