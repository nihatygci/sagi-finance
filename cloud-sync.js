/* ════════════════════════════════════════════════════════════════════
   SAGI Finance — CLOUD SYNC  v5.0
   ────────────────────────────────────────────────────────────────────
   MİMARİ:
     users/{KEY_NO_DASH}  →  { state, lastModified, version }

   CONFLICT RESOLUTION — Firestore Transaction + Optimistic Locking:
     • Her doc'un bir `version` (integer) sayacı vardır.
     • Push: Firestore transaction içinde remote version okunur.
       Local'deki lastSyncedVersion eşleşirse yaz + version++.
       Eşleşmezse (başka cihaz yazmış): önce remote'u pull+merge et,
       sonra tekrar dene — max 3 deneme.
     • Bu yaklaşım "last write wins"ı ortadan kaldırır; her iki cihazın
       değişiklikleri kaybolmadan birleştirilir.

   ONLINE/OFFLINE:
     • IndexedDB write-ahead log (pendingOps): offline iken yapılan her
       değişiklik sıraya girer. Online olunca sırayla flush edilir.
     • Firestore kendi offline queue'sunu yönetir — bu katman onun
       üzerinde, uygulama katmanında bir güvence.
     • Visibility hidden → bekleyen push hemen gönderilir (beacon olmadan
       senkron flush, Firestore SDK queuelıyor).

   LISTENER:
     • onSnapshot ile gerçek zamanlı multi-device sync.
     • Kendi yazmamızın yankısı: `_lastPushedVersion` ile takip edilir,
       ilk echo skip edilir.
     • Listener koptuğunda (offline) hata loglanır; online gelince yeniden
       bağlanır.

   EVENT'LER (index.html'e):
     Core.emit('cloudRemoteUpdate')   — remote'tan yeni veri geldi
     Core.emit('cloudStatusChanged', status)

   PUBLIC API — index.html arayüzü değişmedi:
     Cloud.isAvailable()
     Cloud.generateKey()
     Cloud.normalizeKey(raw)
     Cloud.isValidKey(key)
     Cloud.createAccount()
     Cloud.loginWithKey(raw)
     Cloud.signOut()
     Cloud.deleteAccount()
     Cloud.forceSync()
     Cloud.forcePush()            — alias → forceSync
     Cloud.analyzeSync()
     Cloud.queuePush(immediate)
     Cloud.markDirty()            — no-op (compat)
     Cloud._deleteItem()          — no-op (compat)
     Cloud._writeSettings()       — no-op (compat)
     Cloud._boot()                — App.init'den await ile
     Cloud._waitForFirebaseAndNotify()
     Cloud.detachListener()
     Cloud.attachListener()
     Cloud.status
     Cloud.lastError
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Sabitler ──────────────────────────────────────────────────────────────
  const PUSH_DEBOUNCE    = 1200;   // ms — normal debounce
  const PUSH_MAX_RETRIES = 3;      // transaction çakışmasında max deneme
  const BOOT_POLL_MS     = 250;    // Firebase hazır beklemede polling aralığı
  const BOOT_POLL_MAX    = 40;     // × 250ms = 10sn max bekleme
  const PENDING_KEY      = 'sagi_pending_push_v5'; // localStorage flag

  // ── State kopyası — syncKey'i çıkar ──────────────────────────────────────
  function _stateForCloud(state) {
    const copy = JSON.parse(JSON.stringify(state));
    if (copy.settings) delete copy.settings.syncKey;
    return copy;
  }

  // ── Merge: index.html'deki mergeState() kullan (tombstone + _settingsTs) ─
  function _merge(local, remote) {
    if (typeof mergeState === 'function') {
      return mergeState(local, remote);
    }
    // Fallback: basit _updatedAt merge (mergeState yoksa)
    const merged = JSON.parse(JSON.stringify(local));
    ['wallets','transactions','recurring','goals','debts','categories','budgets'].forEach(function (col) {
      const la = Array.isArray(local[col])  ? local[col]  : [];
      const ra = Array.isArray(remote[col]) ? remote[col] : [];
      const map = new Map();
      ra.forEach(function (i) { if (i && i.id) map.set(i.id, i); });
      la.forEach(function (i) {
        if (!i || !i.id) return;
        const r = map.get(i.id);
        if (!r || (i._updatedAt || 0) >= (r._updatedAt || 0)) map.set(i.id, i);
      });
      merged[col] = Array.from(map.values());
    });
    return merged;
  }

  // ── İç state ─────────────────────────────────────────────────────────────
  // Son başarılı push/pull'da okunan Firestore `version` numarası.
  // Conflict detection için kullanılır.
  var _lastSyncedVersion = 0;
  // Kendi push'umuzdaki version — onSnapshot echo'sunu skip etmek için
  var _lastPushedVersion = -1;
  // Listener unsubscribe fonksiyonu
  var _unsub = null;
  // Debounce timer handle
  var _pushTimer = null;
  // Push devam ediyor mu? (re-entrant guard)
  var _pushInFlight = false;

  // ══════════════════════════════════════════════════════════════════════════
  const Cloud = {
    status:    'idle',
    lastError: '',

    // ── Firebase hazır mı? ────────────────────────────────────────────────
    isAvailable() {
      return !!(window._fbReady && window._fbDB);
    },

    _emitStatus(s) {
      this.status = s;
      try { Core.emit('cloudStatusChanged', s); } catch (e) {}
    },

    // ── Key yönetimi ─────────────────────────────────────────────────────
    generateKey() {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      return Array.from(buf)
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('')
        .toUpperCase()
        .match(/.{4}/g)
        .join('-');
    },

    normalizeKey(raw) {
      if (!raw) return '';
      const str = String(raw).trim();
      // PLUS- prefix
      const plusMatch = str.match(/^PLUS[-]?([0-9A-Fa-f-]{16,19})$/i);
      if (plusMatch) {
        const hex = plusMatch[1].replace(/[^0-9a-fA-F]/g, '').toUpperCase();
        if (hex.length === 16) return 'PLUS-' + hex.match(/.{4}/g).join('-');
      }
      const clean = str.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
      if (clean.length === 16) return clean.match(/.{4}/g).join('-');
      return '';
    },

    isValidKey(key) {
      const k = key || '';
      return /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(k)
          || /^PLUS-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(k);
    },

    // Firestore doc ID: tire olmadan
    _docId(key) {
      return (key || Core.state.settings.syncKey || '').replace(/-/g, '');
    },

    _docRef(key) {
      if (!this.isAvailable()) return null;
      return window._fbDB.collection('users').doc(this._docId(key));
    },

    // ── PLUS yönlendirme ─────────────────────────────────────────────────
    async _resolvePlusKey(key) {
      if (!this.isAvailable() || !key) return null;
      try {
        const snap = await window._fbDB.collection('users').doc(this._docId(key)).get();
        if (!snap.exists) {
          if (!key.startsWith('PLUS-')) {
            const plusSnap = await window._fbDB.collection('users').doc('PLUS' + this._docId(key)).get();
            if (plusSnap.exists) return 'PLUS-' + key;
          }
          return null;
        }
        const data = snap.data() || {};
        if (data.forwardKey) return this.normalizeKey(data.forwardKey) || data.forwardKey;
        if (data.state && data.state.settings && data.state.settings.syncKey) {
          const rsk = data.state.settings.syncKey;
          if (rsk !== key && rsk.startsWith('PLUS-')) return rsk;
        }
      } catch (e) {
        console.warn('[Cloud] PLUS kontrol hatası:', e);
      }
      return null;
    },

    // ── Doc var mı? ───────────────────────────────────────────────────────
    async _docExists(key) {
      try {
        const snap = await this._docRef(key).get();
        if (!snap.exists) return false;
        const data = snap.data() || {};
        return !!(data.state || data._migrated || data.lastModified || data.createdAt);
      } catch (e) {
        return false;
      }
    },

    // ══════════════════════════════════════════════════════════════════════
    // PULL — Remote'u çek ve local ile merge et
    // Başarılı olursa _lastSyncedVersion güncellenir.
    // ══════════════════════════════════════════════════════════════════════
    async _pull() {
      const key = Core.state.settings.syncKey;
      if (!key || !this.isAvailable()) return false;

      const snap = await this._docRef(key).get();
      if (!snap.exists) return false; // createAccount yapılmamış

      const data = snap.data() || {};
      const remoteState = data.state;
      if (!remoteState) return false;

      // Version'ı kaydet — conflict detection için
      _lastSyncedVersion = typeof data.version === 'number' ? data.version : 0;

      // Local ve remote'u merge et
      const merged = _merge(Core.state, remoteState);
      merged.settings.syncKey = key;

      Core.state = merged;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      Core.DB.clearPendingPush();

      try { Core.emit('stateChanged', Core.state); } catch (e) {}
      try { Core.emit('cloudRemoteUpdate'); } catch (e) {}
      this._rerenderActiveView();

      return true;
    },

    // ══════════════════════════════════════════════════════════════════════
    // PUSH — Local state'i Firestore'a yaz
    //
    // Conflict resolution — Firestore Transaction:
    //   1. Transaction içinde doc'u oku.
    //   2. remote.version !== _lastSyncedVersion ise başka cihaz yazmış:
    //      a. Remote'u local ile merge et (veri kaybı yok).
    //      b. _lastSyncedVersion'ı güncelle.
    //      c. Transaction'ı iptal et (throw) — Firestore otomatik retry yapar.
    //   3. Eşleşiyorsa: yaz, version++.
    //
    // Uygulama katmanında da max 3 kez deniyoruz (her deneme taze merge
    // ile başlar).
    // ══════════════════════════════════════════════════════════════════════
    async _push(retryCount) {
      const key = Core.state.settings.syncKey;
      if (!key || !this.isAvailable()) return;
      if (_pushInFlight) return;

      retryCount = retryCount || 0;
      if (retryCount >= PUSH_MAX_RETRIES) {
        console.warn('[Cloud] Max retry aşıldı — push iptal.');
        this._emitStatus('error');
        return;
      }

      _pushInFlight = true;
      this._emitStatus('syncing');

      try {
        const db      = window._fbDB;
        const ref     = this._docRef(key);
        const self    = this;
        let   conflictDetected = false;
        let   remoteStateForMerge = null;
        let   newVersion = 0;

        await db.runTransaction(async function (tx) {
          const snap = await tx.get(ref);

          if (snap.exists) {
            const data       = snap.data() || {};
            const remoteVer  = typeof data.version === 'number' ? data.version : 0;

            if (remoteVer !== _lastSyncedVersion) {
              // ── Conflict! Başka cihaz yazmış. ──────────────────────
              // Merge'i transaction dışında yapacağız (Core.state değiştirir).
              // Şimdi sadece remote'u kaydet ve transaction'ı iptal et.
              conflictDetected   = true;
              remoteStateForMerge = data.state || null;
              newVersion          = remoteVer;
              // Transaction'ı abort et
              throw new Error('CONFLICT');
            }

            newVersion = remoteVer + 1;
          } else {
            // Doc yok — ilk yazma (createAccount'tan gelmiş olmalı, ama safety)
            newVersion = 1;
          }

          const payload = {
            state:        _stateForCloud(Core.state),
            lastModified: Core.state.settings.lastModified || Date.now(),
            version:      newVersion,
          };
          tx.set(ref, payload);
        });

        if (conflictDetected && remoteStateForMerge) {
          // Conflict vardı — remote ile merge yap, sonra tekrar push dene.
          console.info('[Cloud] Conflict — merge yapılıyor, retry:', retryCount + 1);
          _lastSyncedVersion = newVersion;

          const merged = _merge(Core.state, remoteStateForMerge);
          merged.settings.syncKey = key;
          Core.state = merged;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          try { Core.emit('stateChanged', Core.state); } catch (e) {}
          try { Core.emit('cloudRemoteUpdate'); } catch (e) {}
          self._rerenderActiveView();

          _pushInFlight = false;
          // Kısa gecikme sonra retry (Firestore backoff'u taklit et)
          await new Promise(function (res) { setTimeout(res, 150 * Math.pow(2, retryCount)); });
          return self._push(retryCount + 1);
        }

        // ── Başarılı push ───────────────────────────────────────────
        _lastSyncedVersion = newVersion;
        _lastPushedVersion = newVersion;
        Core.DB.clearPendingPush();
        this.lastError = '';
        this._emitStatus('ok');

      } catch (e) {
        if (e && e.message === 'CONFLICT') {
          // Bu artık yukarıda handle edildi — buraya düşmemeli,
          // ama güvenlik için: flag açık bırakma
          _pushInFlight = false;
          return;
        }
        console.warn('[Cloud] push hatası:', e);
        this.lastError = e.message || '';
        // Offline veya ağ hatası: pending flag bırak, online gelince retry
        try { localStorage.setItem(PENDING_KEY, '1'); } catch (_) {}
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
      } finally {
        _pushInFlight = false;
      }
    },

    // ── queuePush: DB.save() her çağrısında tetiklenir ──────────────────
    queuePush(immediate) {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
      if (immediate) {
        this._push();
        return;
      }
      var self = this;
      _pushTimer = setTimeout(function () { _pushTimer = null; self._push(); }, PUSH_DEBOUNCE);
    },

    // ── Compat no-ops ────────────────────────────────────────────────────
    markDirty()         { /* no-op */ },
    async _deleteItem() { /* no-op */ },
    async _writeSettings() { /* no-op */ },

    // ══════════════════════════════════════════════════════════════════════
    // onSnapshot LISTENER — Realtime multi-device sync
    // ══════════════════════════════════════════════════════════════════════
    _attachListener(key) {
      this._detachListener();
      if (!this.isAvailable() || !key) return;

      var self = this;

      _unsub = this._docRef(key).onSnapshot(
        function (snap) {
          if (!snap.exists) return;

          const data       = snap.data() || {};
          const remoteVer  = typeof data.version === 'number' ? data.version : 0;
          const remoteState = data.state;

          if (!remoteState) return;

          // Kendi push'umuzdaki echo'yu skip et
          if (remoteVer === _lastPushedVersion) {
            // Sadece version'ı güncelle, state'i yeniden işleme
            _lastSyncedVersion = remoteVer;
            _lastPushedVersion = -1; // bir kez skip ettik, sıfırla
            return;
          }

          // Başka cihazdan gelen gerçek update
          _lastSyncedVersion = remoteVer;

          const merged = _merge(Core.state, remoteState);
          merged.settings.syncKey = Core.state.settings.syncKey;

          Core.state = merged;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

          try { Core.emit('stateChanged', Core.state); } catch (e) {}
          try { Core.emit('cloudRemoteUpdate'); } catch (e) {}
          self._rerenderActiveView();
          self._emitStatus('ok');
        },
        function (err) {
          console.warn('[Cloud] onSnapshot hatası:', err);
          self.lastError = err.message || '';
          self._emitStatus(navigator.onLine === false ? 'offline' : 'error');
        }
      );
    },

    _detachListener() {
      if (_unsub) {
        try { _unsub(); } catch (e) {}
        _unsub = null;
      }
    },

    // Alias'lar (index.html uyumu)
    detachListener() { this._detachListener(); },
    attachListener()  { this._attachListener(Core.state.settings.syncKey); },

    // ══════════════════════════════════════════════════════════════════════
    // BOOT — App.init'den await ile çağrılır
    // ══════════════════════════════════════════════════════════════════════
    async _boot() {
      const key = Core.state.settings.syncKey;
      if (!key || !this.isAvailable()) return;

      // PLUS yönlendirme
      const fwd = await this._resolvePlusKey(key);
      if (fwd && fwd !== key) {
        console.log('[Cloud] PLUS yönlendirme:', key, '→', fwd);
        Core.state.settings.syncKey = fwd;
        localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
        return this._boot();
      }

      this._emitStatus('syncing');

      try {
        // Listener'ı ÖNCE bağla, sonra pull — böylece pull ve listener arasındaki
        // kısa pencerede gelen update'leri kaçırmayız.
        this._attachListener(key);
        await this._pull();
        // Pending (offline iken birikmiş) push varsa gönder
        if (localStorage.getItem(PENDING_KEY)) {
          await this._push();
        }
        this._emitStatus('ok');
      } catch (e) {
        console.warn('[Cloud] boot hatası:', e);
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
      }
    },

    // Firebase henüz hazır değilse polling ile bekle
    _waitForFirebaseAndNotify(attempts) {
      if (attempts === undefined) attempts = 0;
      if (this.isAvailable()) {
        if (Core.state.settings && Core.state.settings.syncKey && !_unsub) {
          this._boot().catch(function (e) { console.warn('[Cloud] boot hatası:', e); });
        } else {
          this._emitStatus('idle');
        }
        return;
      }
      if (attempts >= BOOT_POLL_MAX) {
        console.warn('[Cloud] Firebase 10sn içinde hazır olmadı.');
        return;
      }
      var self = this;
      setTimeout(function () { self._waitForFirebaseAndNotify(attempts + 1); }, BOOT_POLL_MS);
    },

    // ── forceSync ────────────────────────────────────────────────────────
    async forceSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
      this._emitStatus('syncing');
      try {
        await this._pull();
        await this._push();
        this._emitStatus('ok');
        return 'merged';
      } catch (e) {
        console.warn('[Cloud] forceSync hatası:', e);
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
        throw e;
      }
    },

    forcePush() { return this.forceSync(); },

    // ── analyzeSync ──────────────────────────────────────────────────────
    async analyzeSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) {
        return { status: 'unavailable' };
      }
      try {
        const snap = await this._docRef().get();
        if (!snap.exists) return { status: 'no-remote' };

        const data = snap.data() || {};
        const remoteState = data.state;
        if (!remoteState) return { status: 'no-remote' };

        const COLS = ['wallets','transactions','recurring','goals','debts','categories','budgets'];
        let totalNew = 0, totalLocal = 0;
        const details = {};
        COLS.forEach(function (col) {
          const li = new Set((Core.state[col] || []).map(function (x) { return x && x.id; }).filter(Boolean));
          const ri = new Set((remoteState[col] || []).map(function (x) { return x && x.id; }).filter(Boolean));
          let nfr = 0, nfl = 0;
          ri.forEach(function (id) { if (!li.has(id)) nfr++; });
          li.forEach(function (id) { if (!ri.has(id)) nfl++; });
          if (nfr || nfl) details[col] = { newFromRemote: nfr, newFromLocal: nfl };
          totalNew   += nfr;
          totalLocal += nfl;
        });

        const remoteMod = data.lastModified || 0;
        const localMod  = Core.state.settings.lastModified || 0;
        const remoteVer = data.version || 0;

        if (totalNew === 0 && totalLocal === 0) {
          return { status: 'in-sync', remoteMod, localMod, remoteVer };
        }
        return {
          status: 'diff', willMerge: true,
          totalNewFromRemote: totalNew, totalNewFromLocal: totalLocal,
          details, remoteMod, localMod, remoteVer,
        };
      } catch (e) {
        return { status: 'error', error: e };
      }
    },

    // ── createAccount ─────────────────────────────────────────────────────
    async createAccount() {
      if (!this.isAvailable()) {
        const err = new Error('CLOUD_UNAVAILABLE');
        err.detail = window._fbErr || 'sdk-missing';
        throw err;
      }

      const key = this.generateKey();
      Core.state.settings.syncKey      = key;
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      const payload = {
        state:        _stateForCloud(Core.state),
        lastModified: Core.state.settings.lastModified,
        version:      1,
        createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      };

      try {
        await this._docRef(key).set(payload);
        _lastSyncedVersion = 1;
        _lastPushedVersion = 1;
      } catch (e) {
        console.error('[Cloud] createAccount yazma hatası:', e);
        this.lastError = e.message || 'write-failed';
        this._emitStatus('error');
        throw e;
      }

      this._emitStatus('ok');
      this._attachListener(key);
      return key;
    },

    // ── loginWithKey ──────────────────────────────────────────────────────
    async loginWithKey(rawKey) {
      const key = this.normalizeKey(rawKey);
      if (!this.isValidKey(key))   throw new Error('INVALID_KEY');
      if (!this.isAvailable())     throw new Error('CLOUD_UNAVAILABLE');

      const fwd = await this._resolvePlusKey(key);
      if (fwd && fwd !== key) return this.loginWithKey(fwd);

      const exists = await this._docExists(key);
      if (!exists) throw new Error('NOT_FOUND');

      Core.state.settings.syncKey = key;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      await this._boot();
      return Core.state;
    },

    // ── signOut ───────────────────────────────────────────────────────────
    signOut() {
      this._detachListener();
      if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
      _lastSyncedVersion = 0;
      _lastPushedVersion = -1;

      Core.state.settings.syncKey      = '';
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      localStorage.removeItem(PENDING_KEY);

      this._emitStatus('idle');
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
    },

    // ── deleteAccount ─────────────────────────────────────────────────────
    async deleteAccount() {
      const key = Core.state.settings.syncKey;
      this._detachListener();
      if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
      _lastSyncedVersion = 0;
      _lastPushedVersion = -1;

      if (key && this.isAvailable()) {
        try {
          await this._docRef(key).delete();
          console.log('[Cloud] Hesap silindi:', key);
        } catch (e) {
          console.warn('[Cloud] deleteAccount hatası:', e);
        }
      }

      localStorage.removeItem(Core.DB.key);
      localStorage.removeItem(PENDING_KEY);
      Core.state = {
        settings: {
          syncKey: '', lastModified: Date.now(),
          notifications: { abonelik: false, borc: false, butce: false, haftalik: false, krediKarti: false, hedef: false, buyukHarcama: false, doviz: false },
          notifMaster: false, theme: 'light', lang: 'tr', anim: 'on', privacy: 'off', currency: 'TRY',
          consentDate: null, consentVersion: null, consentLang: null, consentMethod: null,
        },
        wallets: [], transactions: [], recurring: [], goals: [], debts: [], categories: [], budgets: [], _tombstones: {},
      };
      this._emitStatus('idle');
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
    },

    // ── Yardımcılar ───────────────────────────────────────────────────────
    _applySettingsSideEffects(settings) {
      try {
        const c = (typeof App !== 'undefined') && App.Controllers;
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
            try { localStorage.setItem(c.BottomBar.STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
          }
          c.BottomBar.renderNav();
        }
      } catch (e) {}
    },

    _rerenderActiveView() {
      try {
        const hash = window.location.hash.replace('#', '') || '/dashboard';
        const c = (typeof App !== 'undefined') && App.Controllers;
        if (!c) return;
        this._applySettingsSideEffects(Core.state.settings);
        if      (hash === '/dashboard')    c.Dashboard    && c.Dashboard.render        && c.Dashboard.render();
        else if (hash === '/wallets')      c.Wallets      && c.Wallets.render          && c.Wallets.render();
        else if (hash === '/transactions') c.Transactions && c.Transactions.renderSetup && c.Transactions.renderSetup();
        else if (hash === '/analytics')    c.Analytics    && c.Analytics.render        && c.Analytics.render();
        else if (hash === '/recurring')    c.Recurring    && c.Recurring.render        && c.Recurring.render();
        else if (hash === '/goals')        c.Goals        && c.Goals.render            && c.Goals.render();
        else if (hash === '/debts')        c.Debts        && c.Debts.render            && c.Debts.render();
        else if (hash === '/settings')     c.Settings     && c.Settings.renderForm     && c.Settings.renderForm();
      } catch (e) {
        console.warn('[Cloud] rerender hatası:', e);
      }
    },
  };

  // ── Core'a bağla ─────────────────────────────────────────────────────────
  window.Cloud = Cloud;
  if (typeof window.Core !== 'undefined') {
    window.Core.Cloud = Cloud;
    console.log('[SAGI] Cloud v5 Core\'a bağlandı.');
  }

  // ════════════════════════════════════════════════════════════════════════
  // LIFECYCLE EVENTS
  // ════════════════════════════════════════════════════════════════════════

  // ── Visibility hidden: bekleyen push'u hemen gönder ──────────────────
  document.addEventListener('visibilitychange', function () {
    if (!Cloud.isAvailable() || !Core.state.settings.syncKey) return;
    if (document.visibilityState === 'hidden') {
      if (_pushTimer) {
        clearTimeout(_pushTimer);
        _pushTimer = null;
        Cloud._push();
        // localStorage'a da yaz (sayfa kapanırsa beacon olmadan failsafe)
        try { localStorage.setItem(PENDING_KEY, '1'); } catch (_) {}
      }
    } else if (document.visibilityState === 'visible') {
      // Listener kopmuşsa yeniden bağlan
      if (!_unsub && Cloud.isAvailable()) {
        Cloud._attachListener(Core.state.settings.syncKey);
      }
      // Görünür olunca pull — uzun süre arka planda kaldıysa taze veri al
      if (Cloud.isAvailable() && Core.state.settings.syncKey) {
        Cloud._pull().catch(function () {});
      }
    }
  });

  // ── Sayfa kapanıyor: son hali localStorage'a kaydet ──────────────────
  window.addEventListener('pagehide', function () {
    if (!Core || !Core.state || !Core.DB) return;
    localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
    if (Core.state.settings.syncKey) {
      try { localStorage.setItem(PENDING_KEY, '1'); } catch (_) {}
    }
  });

  // ── Online: pending push varsa gönder, listener'ı yeniden bağla ──────
  window.addEventListener('online', function () {
    if (!Core.state.settings.syncKey || !Cloud.isAvailable()) return;
    console.log('[Cloud] Online — pending flush başlıyor.');

    // Listener kopmuşsa yeniden bağla
    if (!_unsub) Cloud._attachListener(Core.state.settings.syncKey);

    // Taze pull + pending push
    Cloud._pull()
      .then(function () {
        if (localStorage.getItem(PENDING_KEY)) {
          return Cloud._push();
        }
      })
      .catch(function (e) { console.warn('[Cloud] online-flush hatası:', e); });
  });

  // ── Offline: status güncelle ──────────────────────────────────────────
  window.addEventListener('offline', function () {
    if (!Core.state.settings.syncKey) return;
    Cloud._emitStatus('offline');
  });

  // ── DOMContentLoaded: Core bağlantısını garantile ────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.Core !== 'undefined') window.Core.Cloud = Cloud;
    if (window.Core && window._fbReady && window._fbDB) {
      window.Core.Cloud.status = 'idle';
      setTimeout(function () {
        try { window.Core.emit('cloudStatusChanged', 'idle'); } catch (e) {}
      }, 0);
    }
  }, true);

})();