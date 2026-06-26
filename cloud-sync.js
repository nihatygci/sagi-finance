/* ════════════════════════════════════════════════════════════════════
   SAGI Finance — CLOUD SYNC  v4.0  (Single-doc, last-write-wins)
   ────────────────────────────────────────────────────────────────────
   Mimari:
     users/{KEY_NO_DASH}  →  { state: <full state>, lastModified: number }

   • Firestore rules ile birebir uyumlu (state + lastModified zorunlu)
   • Her cihaz tüm state blob'unu yazar — sub-collection yok, migration yok
   • Merge: item bazında _updatedAt, settings bazında _settingsTs
   • onSnapshot → anlık çok cihaz senkronu
   • Offline: Firestore SDK kendi queue'sunu yönetir
   • plus.js sub-collection'ları (assistant, chat) — DOKUNULMAZ

   Public API (index.html ile arayüz):
     Cloud.isAvailable()          → Firebase hazır mı
     Cloud.generateKey()          → yeni key üret
     Cloud.normalizeKey(raw)      → KEY formatını düzelt
     Cloud.isValidKey(key)        → geçerli mi
     Cloud.createAccount()        → hesap oluştur + key döndür
     Cloud.loginWithKey(raw)      → giriş yap
     Cloud.signOut()              → çıkış
     Cloud.deleteAccount()        → hesabı sil
     Cloud.forceSync()            → manuel senkronize et
     Cloud.forcePush()            → alias
     Cloud.analyzeSync()          → fark analizi
     Cloud.queuePush(immediate)   → DB.save() çağrısından tetiklenir
     Cloud.markDirty(col, item)   → DB._markDirtyFromSnapshots'tan
     Cloud._deleteItem(col, id)   → DB._markDirtyFromSnapshots'tan
     Cloud._writeSettings()       → DB._markDirtyFromSnapshots'tan
     Cloud._waitForFirebaseAndNotify() → App.init'den
     Cloud._boot()                → App.init'den (await)
     Cloud.detachListener()       → alias, index.html'deki çağrı için
     Cloud.status                 → 'idle'|'syncing'|'ok'|'error'|'offline'
     Cloud.lastError
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Sabitler ─────────────────────────────────────────────────────────
  const PUSH_DELAY  = 1200;   // ms — debounce süresi
  const BOOT_RETRY  = 40;     // × 250ms = 10sn
  const MERGEABLE   = ['wallets','transactions','recurring','goals','debts','categories','budgets'];

  // ── Yardımcı: state kopyası (syncKey temizle) ────────────────────────
  function _stateForCloud(state) {
    // syncKey bulutta gereksiz ve gizlilik riski; yazarken çıkar
    const copy = JSON.parse(JSON.stringify(state));
    if (copy.settings) delete copy.settings.syncKey;
    return copy;
  }

  // ── Merge: remote blob'u local state ile birleştir ───────────────────
  // index.html'deki mergeState() zaten aynı mantığı yapıyor; biz onu kullanıyoruz.
  function _merge(local, remote) {
    if (typeof mergeState === 'function') {
      return mergeState(local, remote);
    }
    // fallback: basit _updatedAt bazlı merge
    const merged = JSON.parse(JSON.stringify(local));
    MERGEABLE.forEach(function (col) {
      const localArr  = Array.isArray(local[col])  ? local[col]  : [];
      const remoteArr = Array.isArray(remote[col]) ? remote[col] : [];
      const map = new Map();
      remoteArr.forEach(function (item) { if (item && item.id) map.set(item.id, item); });
      localArr.forEach(function (item) {
        if (!item || !item.id) return;
        const r = map.get(item.id);
        if (!r || (item._updatedAt || 0) >= (r._updatedAt || 0)) map.set(item.id, item);
      });
      merged[col] = Array.from(map.values());
    });
    return merged;
  }

  // ════════════════════════════════════════════════════════════════════
  const Cloud = {
    status:    'idle',
    lastError: '',
    _unsub:    null,   // onSnapshot unsubscribe
    _timer:    null,   // debounce timer
    _pushing:  false,  // çift push engeli

    // ── Firebase durumu ─────────────────────────────────────────────
    isAvailable() {
      return !!(window._fbReady && window._fbDB);
    },

    _emitStatus(s) {
      this.status = s;
      try { Core.emit('cloudStatusChanged', s); } catch (e) {}
    },

    // ── Key yönetimi ─────────────────────────────────────────────────
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

    // ── PLUS yönlendirme ─────────────────────────────────────────────
    // users/{KEY} doc'unda forwardKey var mı?
    async _resolvePlusKey(key) {
      if (!this.isAvailable() || !key) return null;
      try {
        const snap = await window._fbDB.collection('users').doc(this._docId(key)).get();
        if (!snap.exists) {
          // Normal key ile yoksa PLUS-{key} var mı diye bak
          if (!key.startsWith('PLUS-')) {
            const plusSnap = await window._fbDB.collection('users').doc('PLUS' + this._docId(key)).get();
            if (plusSnap.exists) return 'PLUS-' + key;
          }
          return null;
        }
        const data = snap.data() || {};
        if (data.forwardKey) return this.normalizeKey(data.forwardKey) || data.forwardKey;
        // Eski v2/v3 sub-collection mimarisi: state içinde syncKey farklıysa
        if (data.state && data.state.settings && data.state.settings.syncKey) {
          const rsk = data.state.settings.syncKey;
          if (rsk !== key && rsk.startsWith('PLUS-')) return rsk;
        }
      } catch (e) {
        console.warn('[Cloud] PLUS kontrol hatası:', e);
      }
      return null;
    },

    // ── Hesap doc var mı kontrolü ─────────────────────────────────────
    async _docExists(key) {
      try {
        const snap = await this._docRef(key).get();
        if (!snap.exists) return false;
        const data = snap.data() || {};
        // Geçerli format: state field veya _migrated flag veya herhangi bir içerik
        return !!(data.state || data._migrated || data.lastModified || data.createdAt);
      } catch (e) {
        return false;
      }
    },

    // ── Boot ──────────────────────────────────────────────────────────
    // App.init'den await ile çağrılır.
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
        // İlk pull: remote state'i çek ve merge et
        await this._pull();
        // Listener bağla
        this._attachListener(key);
        this._emitStatus('ok');
      } catch (e) {
        console.warn('[Cloud] boot hatası:', e);
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
      }
    },

    // Firebase henüz hazır değilse polling ile bekle, sonra _boot'u çağır
    _waitForFirebaseAndNotify(attempts) {
      if (attempts === undefined) attempts = 0;
      if (this.isAvailable()) {
        if (Core.state.settings && Core.state.settings.syncKey && !this._unsub) {
          this._boot().catch(function (e) { console.warn('[Cloud] boot hatası:', e); });
        } else {
          this._emitStatus('idle');
        }
        return;
      }
      if (attempts >= BOOT_RETRY) {
        console.warn('[Cloud] Firebase 10sn içinde hazır olmadı.');
        return;
      }
      var self = this;
      setTimeout(function () { self._waitForFirebaseAndNotify(attempts + 1); }, 250);
    },

    // ── Pull: remote → local merge ────────────────────────────────────
    async _pull() {
      const key = Core.state.settings.syncKey;
      if (!key || !this.isAvailable()) return;

      const snap = await this._docRef(key).get();
      if (!snap.exists) return; // henüz hesap yok — createAccount yapılmamış

      const data = snap.data() || {};
      const remoteState = data.state;
      if (!remoteState) return;

      // Merge
      const merged = _merge(Core.state, remoteState);
      merged.settings.syncKey = key; // her zaman local key

      Core.state = merged;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
      this._rerenderActiveView();
    },

    // ── onSnapshot listener ───────────────────────────────────────────
    _attachListener(key) {
      this._detachListener();
      if (!this.isAvailable() || !key) return;

      var self = this;
      var isFirst = true; // ilk snapshot = _pull'dan az önce çektik, skip

      this._unsub = this._docRef(key).onSnapshot(
        function (snap) {
          if (isFirst) { isFirst = false; return; } // _pull zaten yaptı
          if (!snap.exists) return;

          const data = snap.data() || {};
          const remoteState = data.state;
          if (!remoteState) return;

          // Push timer aktifse (bu cihaz yazmak üzere) gelen snapshot büyük
          // ihtimalle bizim kendi yazmamızın yankısı — ama merge yine de doğru çalışır
          const merged = _merge(Core.state, remoteState);
          merged.settings.syncKey = Core.state.settings.syncKey;
          Core.state = merged;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          try { Core.emit('stateChanged', Core.state); } catch (e) {}
          self._rerenderActiveView();
          self._emitStatus('ok');
        },
        function (err) {
          console.warn('[Cloud] onSnapshot hatası:', err);
          self._emitStatus(navigator.onLine === false ? 'offline' : 'error');
          self.lastError = err.message || '';
        }
      );
    },

    _detachListener() {
      if (this._unsub) {
        try { this._unsub(); } catch (e) {}
        this._unsub = null;
      }
    },

    // Geriye uyumluluk alias'ı (index.html'de detachListener() çağrısı var)
    detachListener() { this._detachListener(); },
    attachListener()  { this._attachListener(Core.state.settings.syncKey); },

    // ── Push: local → Firestore ───────────────────────────────────────
    async _push() {
      const key = Core.state.settings.syncKey;
      if (!key || !this.isAvailable()) return;
      if (this._pushing) return;
      this._pushing = true;
      this._emitStatus('syncing');
      try {
        const payload = {
          state:        _stateForCloud(Core.state),
          lastModified: Core.state.settings.lastModified || Date.now()
        };
        await this._docRef(key).set(payload);
        if (Core.DB && Core.DB.clearPendingPush) Core.DB.clearPendingPush();
        this.lastError = '';
        this._emitStatus('ok');
      } catch (e) {
        console.warn('[Cloud] push hatası:', e);
        this.lastError = e.message || '';
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
      } finally {
        this._pushing = false;
      }
    },

    // ── queuePush: DB.save() her çağrısında tetiklenir ───────────────
    queuePush(immediate) {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      if (immediate) { this._push(); return; }
      var self = this;
      this._timer = setTimeout(function () { self._timer = null; self._push(); }, PUSH_DELAY);
    },

    // ── DB._markDirtyFromSnapshots API uyumu ─────────────────────────
    // Bu yeni mimaride "tek item yaz" yok — tüm state blob push edilir.
    // Ama index.html bu metodları çağırıyor, null-safe olsun yeter.
    markDirty(/* col, item */) {
      // no-op — queuePush zaten tüm state'i push eder
    },
    async _deleteItem(/* col, id */) {
      // no-op — item state'den zaten silindi, queuePush push edecek
    },
    async _writeSettings() {
      // no-op — queuePush tüm state'i (settings dahil) push eder
    },

    // ── forceSync / forcePush ─────────────────────────────────────────
    async forceSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
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

    // ── analyzeSync ──────────────────────────────────────────────────
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

        let totalNewFromRemote = 0, totalNewFromLocal = 0;
        const details = {};
        MERGEABLE.forEach(function (col) {
          const localIds  = new Set((Core.state[col] || []).map(function (x) { return x && x.id; }).filter(Boolean));
          const remoteIds = new Set((remoteState[col] || []).map(function (x) { return x && x.id; }).filter(Boolean));
          let nfr = 0, nfl = 0;
          remoteIds.forEach(function (id) { if (!localIds.has(id))  nfr++; });
          localIds.forEach(function (id)  { if (!remoteIds.has(id)) nfl++; });
          if (nfr || nfl) details[col] = { newFromRemote: nfr, newFromLocal: nfl };
          totalNewFromRemote += nfr;
          totalNewFromLocal  += nfl;
        });

        const remoteMod = data.lastModified || 0;
        const localMod  = Core.state.settings.lastModified || 0;
        if (totalNewFromRemote === 0 && totalNewFromLocal === 0) {
          return { status: 'in-sync', remoteMod, localMod };
        }
        return { status: 'diff', willMerge: true, totalNewFromRemote, totalNewFromLocal, details, remoteMod, localMod };
      } catch (e) {
        return { status: 'error', error: e };
      }
    },

    // ── createAccount ────────────────────────────────────────────────
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
        createdAt:    firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        await this._docRef(key).set(payload);
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

    // ── loginWithKey ─────────────────────────────────────────────────
    async loginWithKey(rawKey) {
      const key = this.normalizeKey(rawKey);
      if (!this.isValidKey(key)) throw new Error('INVALID_KEY');
      if (!this.isAvailable())   throw new Error('CLOUD_UNAVAILABLE');

      // PLUS yönlendirme
      const fwd = await this._resolvePlusKey(key);
      if (fwd && fwd !== key) return this.loginWithKey(fwd);

      // Hesap var mı?
      const exists = await this._docExists(key);
      if (!exists) throw new Error('NOT_FOUND');

      Core.state.settings.syncKey = key;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      await this._boot();
      return Core.state;
    },

    // ── signOut ──────────────────────────────────────────────────────
    signOut() {
      this._detachListener();
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      Core.state.settings.syncKey      = '';
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      this._emitStatus('idle');
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
    },

    // ── deleteAccount ─────────────────────────────────────────────────
    async deleteAccount() {
      const key = Core.state.settings.syncKey;
      this._detachListener();
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }

      if (key && this.isAvailable()) {
        try {
          await this._docRef(key).delete();
          console.log('[Cloud] Hesap silindi:', key);
        } catch (e) {
          console.warn('[Cloud] deleteAccount hatası:', e);
        }
      }

      localStorage.removeItem(Core.DB.key);
      Core.state = {
        settings: {
          syncKey: '', lastModified: Date.now(),
          notifications: { abonelik: false, borc: false, butce: false, haftalik: false, krediKarti: false, hedef: false, buyukHarcama: false, doviz: false },
          notifMaster: false, theme: 'light', lang: 'tr', anim: 'on', privacy: 'off', currency: 'TRY',
          consentDate: null, consentVersion: null, consentLang: null, consentMethod: null,
        },
        wallets: [], transactions: [], recurring: [], goals: [], debts: [], categories: [], budgets: [], _tombstones: {}
      };
      this._emitStatus('idle');
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
    },

    // ── Yardımcılar ───────────────────────────────────────────────────
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
        if      (hash === '/dashboard')    c.Dashboard    && c.Dashboard.render    && c.Dashboard.render();
        else if (hash === '/wallets')      c.Wallets      && c.Wallets.render      && c.Wallets.render();
        else if (hash === '/transactions') c.Transactions && c.Transactions.renderSetup && c.Transactions.renderSetup();
        else if (hash === '/analytics')    c.Analytics    && c.Analytics.render    && c.Analytics.render();
        else if (hash === '/recurring')    c.Recurring    && c.Recurring.render    && c.Recurring.render();
        else if (hash === '/goals')        c.Goals        && c.Goals.render        && c.Goals.render();
        else if (hash === '/debts')        c.Debts        && c.Debts.render        && c.Debts.render();
        else if (hash === '/settings')     c.Settings     && c.Settings.renderForm && c.Settings.renderForm();
      } catch (e) {
        console.warn('[Cloud] rerender hatası:', e);
      }
    },
  };

  // ── Core'a bağla ─────────────────────────────────────────────────────
  window.Cloud = Cloud;
  if (typeof window.Core !== 'undefined') {
    window.Core.Cloud = Cloud;
    console.log('[SAGI] Cloud v4 Core\'a bağlandı.');
  }

  // ── Lifecycle event'leri ──────────────────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (!Cloud.isAvailable() || !Core.state.settings.syncKey) return;
    if (document.visibilityState === 'hidden') {
      // Bekleyen push varsa hemen gönder
      if (Cloud._timer) {
        clearTimeout(Cloud._timer);
        Cloud._timer = null;
        Cloud._push().catch(function () {});
      }
    } else if (document.visibilityState === 'visible') {
      // Listener kopmuşsa yeniden bağlan
      if (!Cloud._unsub && Cloud.isAvailable()) {
        Cloud._attachListener(Core.state.settings.syncKey);
      }
    }
  });

  window.addEventListener('pagehide', function () {
    if (!Core.state.settings.syncKey) return;
    localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
  });

  window.addEventListener('online', function () {
    if (!Core.state.settings.syncKey || !Cloud.isAvailable()) return;
    console.log('[Cloud] Online olundu.');
    if (!Cloud._unsub) Cloud._attachListener(Core.state.settings.syncKey);
    // Pending push varsa gönder
    if (Core.DB && Core.DB.hasPendingPush && Core.DB.hasPendingPush()) {
      Cloud._push().catch(function () {});
    }
  });

  window.addEventListener('offline', function () {
    if (!Core.state.settings.syncKey) return;
    Cloud._emitStatus('offline');
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.Core !== 'undefined') window.Core.Cloud = Cloud;
    if (window.Core && window.Core.Cloud && window._fbReady && window._fbDB) {
      window.Core.Cloud.status = 'idle';
      setTimeout(function () { try { window.Core.emit('cloudStatusChanged', 'idle'); } catch (e) {} }, 0);
    }
  }, true);

})();