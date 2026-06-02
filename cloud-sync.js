/* ════════════════════════════════════════════════════════════════════
   SAGI Finance — CLOUD SYNC v2 (Conflict-free)
   ────────────────────────────────────────────────────────────────────
   • Transaction + document version ile çakışmasız senkronizasyon
   • Offline cihaz açıldığında önce pull, sonra merge
   • ID bazlı merge ile veri kaybını önleme
   ════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const Cloud = {
    // Durum
    status: "idle",           // 'idle' | 'syncing' | 'ok' | 'error' | 'offline' | 'unavailable'
    lastError: "",
    lastSyncTime: 0,

    // Internal
    _pushTimer: null,
    _pushDelay: 1000,          // 1 saniye debounce
    _unsubscribe: null,
    _isPushing: false,
    _isPulling: false,
    _lastKnownVersion: 0,      // Firestore dokümanının son bilinen versiyonu
    _lastKnownModTime: 0,      // Son bilinen modification time
    _retryCount: 0,
    _maxRetries: 3,
    
    // Firestore koleksiyon yolu
    _COLLECTION: "users",

    // ── Kullanılabilirlik ─────────────────────────────────────────────
    isAvailable() {
      return !!(window._fbReady && window._fbDB && window.firebase);
    },

    _emitStatus(s) {
      this.status = s;
      try { Core.emit("cloudStatusChanged", s); } catch(e) {}
    },

    // ── Anahtar üretimi & doğrulama ───────────────────────────────────
    generateKey() {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      const hex = Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      return hex.match(/.{4}/g).join("-");
    },

    normalizeKey(raw) {
      if (!raw) return "";
      const clean = String(raw).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
      if (clean.length !== 16) return "";
      return clean.match(/.{4}/g).join("-");
    },

    isValidKey(key) {
      return /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(key || "");
    },

    _docId(key) {
      return (key || "").replace(/-/g, "");
    },

    _doc(key) {
      if (!this.isAvailable()) return null;
      return window._fbDB.collection(this._COLLECTION).doc(this._docId(key));
    },

    // ── VERİ MERGE (ID bazlı, son değişiklik kazanır) ──────────────────
    _mergeStates(remote, local) {
      if (!remote) return JSON.parse(JSON.stringify(local));
      if (!local) return JSON.parse(JSON.stringify(remote));
      
      const merged = JSON.parse(JSON.stringify(remote));
      
      // Helper: item'ları id bazlı merge et
      const mergeArrayById = (existing, incoming, idField = 'id') => {
        if (!incoming || !Array.isArray(incoming)) return existing || [];
        const map = new Map();
        
        // Önce mevcutları ekle
        (existing || []).forEach(item => {
          if (item && item[idField]) map.set(item[idField], JSON.parse(JSON.stringify(item)));
        });
        
        // Sonra gelenleri merge et (daha yeni olan kazanır)
        incoming.forEach(item => {
          if (!item || !item[idField]) return;
          const existingItem = map.get(item[idField]);
          if (!existingItem) {
            map.set(item[idField], JSON.parse(JSON.stringify(item)));
          } else {
            // lastModified veya timestamp'e göre karşılaştır
            const existingTime = existingItem.lastModified || existingItem.createdAt || existingItem.ts || 0;
            const incomingTime = item.lastModified || item.createdAt || item.ts || 0;
            if (incomingTime >= existingTime) {
              map.set(item[idField], JSON.parse(JSON.stringify(item)));
            }
          }
        });
        
        return Array.from(map.values());
      };
      
      // Tüm koleksiyonları merge et
      merged.wallets = mergeArrayById(remote.wallets, local.wallets);
      merged.transactions = mergeArrayById(remote.transactions, local.transactions);
      merged.recurring = mergeArrayById(remote.recurring, local.recurring);
      merged.goals = mergeArrayById(remote.goals, local.goals);
      merged.debts = mergeArrayById(remote.debts, local.debts);
      merged.budgets = mergeArrayById(remote.budgets, local.budgets);
      merged.notifInbox = mergeArrayById(remote.notifInbox, local.notifInbox, 'id');
      merged.paidMonths = { ...(remote.paidMonths || {}), ...(local.paidMonths || {}) };
      
      // Settings: local tercih edilir (syncKey hariç)
      const savedSyncKey = local.settings?.syncKey || remote.settings?.syncKey;
      merged.settings = {
        ...(remote.settings || {}),
        ...(local.settings || {}),
        syncKey: savedSyncKey
      };
      
      // Sync meta'yı koru
      merged._syncMeta = {
        lastPull: Date.now(),
        lastPush: local._syncMeta?.lastPush || 0,
        pendingChanges: false
      };
      
      return merged;
    },

    // ── TRANSACTION ile GÜVENLİ PUSH ───────────────────────────────────
    async _safePush(isRetry = false) {
      if (!this.isAvailable()) {
        this._emitStatus("unavailable");
        return false;
      }
      
      const syncKey = Core.state.settings?.syncKey;
      if (!syncKey) return false;
      if (this._isPushing) {
        console.log('[Cloud] Push zaten devam ediyor, atlanıyor');
        return false;
      }
      
      this._isPushing = true;
      this._emitStatus("syncing");
      
      const docRef = this._doc(syncKey);
      const newModTime = Date.now();
      
      try {
        // Firestore transaction ile atomic update
        const result = await window._fbDB.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(docRef);
          const currentData = snapshot.exists ? snapshot.data() : null;
          const currentVersion = currentData?.version || 0;
          const currentModTime = currentData?.lastModified || 0;
          
          // Eğer remote daha yeniyse ve biz push yapmaya çalışıyorsak
          // önce pull yapmamız gerekir (çakışma)
          if (currentModTime > this._lastKnownModTime && currentVersion > this._lastKnownVersion && !isRetry) {
            console.log('[Cloud] Push sırasında çakışma tespit edildi, önce pull yapılıyor');
            this._isPushing = false;
            await this._safePull();
            return { conflicted: true };
          }
          
          // Yerel state'i hazırla
          Core.state.settings.lastModified = newModTime;
          Core.state._syncMeta = Core.state._syncMeta || { lastPull: 0, lastPush: 0, pendingChanges: false };
          Core.state._syncMeta.lastPush = newModTime;
          Core.state._syncMeta.pendingChanges = false;
          
          const newVersion = Math.max(currentVersion, this._lastKnownVersion) + 1;
          
          if (!snapshot.exists) {
            // Yeni doküman oluştur
            transaction.set(docRef, {
              state: Core.state,
              lastModified: newModTime,
              version: newVersion,
              createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            // Mevcut dokümanı güncelle
            transaction.update(docRef, {
              state: Core.state,
              lastModified: newModTime,
              version: newVersion,
              updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
          }
          
          this._lastKnownVersion = newVersion;
          this._lastKnownModTime = newModTime;
          
          return { success: true, version: newVersion };
        });
        
        if (result.conflicted) {
          // Çakışma varsa ve retry yapmadıysak tekrar dene
          if (this._retryCount < this._maxRetries) {
            this._retryCount++;
            console.log(`[Cloud] Push çakışması, ${this._retryCount}. retry...`);
            await new Promise(r => setTimeout(r, 500 * this._retryCount));
            this._isPushing = false;
            return this._safePush(true);
          }
          this._retryCount = 0;
          this._emitStatus("error");
          return false;
        }
        
        // Başarılı push
        Core.DB.saveLocalOnly(); // Local'e kaydet ama tekrar push tetikleme
        this._retryCount = 0;
        this.lastError = "";
        this.lastSyncTime = Date.now();
        this._emitStatus("ok");
        
        console.log('[Cloud] Push başarılı, version:', result.version);
        return true;
        
      } catch (e) {
        console.error('[Cloud] Push hatası:', e);
        this.lastError = e?.message || "push-failed";
        this._emitStatus(navigator.onLine === false ? "offline" : "error");
        
        // Transaction aborted hatası (çakışma)
        if (e.code === "aborted" && this._retryCount < this._maxRetries) {
          this._retryCount++;
          console.log(`[Cloud] Transaction aborted, ${this._retryCount}. retry...`);
          await new Promise(r => setTimeout(r, 500 * this._retryCount));
          this._isPushing = false;
          return this._safePush(true);
        }
        
        this._retryCount = 0;
        return false;
      } finally {
        this._isPushing = false;
      }
    },

    // ── GÜVENLİ PULL (remote'dan al ve merge et) ────────────────────────
    async _safePull() {
      if (!this.isAvailable()) return false;
      
      const syncKey = Core.state.settings?.syncKey;
      if (!syncKey) return false;
      if (this._isPulling) {
        console.log('[Cloud] Pull zaten devam ediyor, atlanıyor');
        return false;
      }
      
      this._isPulling = true;
      
      try {
        const docRef = this._doc(syncKey);
        const snapshot = await docRef.get();
        
        if (!snapshot.exists) {
          console.log('[Cloud] Doküman bulunamadı, pull atlanıyor');
          return false;
        }
        
        const remoteData = snapshot.data();
        const remoteVersion = remoteData.version || 0;
        const remoteModTime = remoteData.lastModified || 0;
        const localModTime = Core.state.settings?.lastModified || 0;
        
        // Sadece remote daha yeniyse pull yap
        if (remoteModTime > localModTime || remoteVersion > this._lastKnownVersion) {
          console.log('[Cloud] Pull yapılıyor... local:', localModTime, 'remote:', remoteModTime);
          
          const savedSyncKey = Core.state.settings.syncKey;
          const newState = this._mergeStates(remoteData.state, Core.state);
          newState.settings.syncKey = savedSyncKey;
          
          Core.state = newState;
          this._lastKnownVersion = remoteVersion;
          this._lastKnownModTime = remoteModTime;
          
          Core.DB.saveLocalOnly();
          
          try { Core.emit('stateChanged', Core.state); } catch(e) {}
          try { Core.emit('cloudRemoteUpdate', Core.state); } catch(e) {}
          this._rerenderActiveView();
          
          console.log('[Cloud] Pull tamamlandı, version:', remoteVersion);
          return true;
        }
        
        this._lastKnownVersion = remoteVersion;
        this._lastKnownModTime = remoteModTime;
        return false;
        
      } catch (e) {
        console.warn('[Cloud] Pull hatası:', e);
        return false;
      } finally {
        this._isPulling = false;
      }
    },

    // ── İLK PULL (uygulama başlangıcında) ──────────────────────────────
    async _initialPull() {
      if (!this.isAvailable() || !Core.state.settings?.syncKey) return false;
      
      try {
        const docRef = this._doc(Core.state.settings.syncKey);
        const snapshot = await docRef.get();
        
        if (!snapshot.exists) return false;
        
        const remoteData = snapshot.data();
        const remoteModTime = remoteData.lastModified || 0;
        const localModTime = Core.state.settings?.lastModified || 0;
        
        this._lastKnownVersion = remoteData.version || 0;
        this._lastKnownModTime = remoteModTime;
        
        if (remoteModTime > localModTime) {
          console.log('[Cloud] İlk pull: remote daha yeni, merge yapılıyor');
          const savedKey = Core.state.settings.syncKey;
          const newState = this._mergeStates(remoteData.state, Core.state);
          newState.settings.syncKey = savedKey;
          Core.state = newState;
          Core.DB.saveLocalOnly();
          try { Core.emit('stateChanged', Core.state); } catch(e) {}
          this._rerenderActiveView();
        } else if (localModTime > remoteModTime) {
          console.log('[Cloud] İlk pull: local daha yeni, push yapılıyor');
          await this._safePush();
        }
        
        return true;
      } catch(e) {
        console.warn('[Cloud] İlk pull hatası:', e);
        return false;
      }
    },

    // ── Yeni hesap aç ─────────────────────────────────────────────────
    async createAccount() {
      console.log('[Cloud] createAccount çağrıldı');
      
      if (!this.isAvailable()) {
        throw new Error('CLOUD_UNAVAILABLE');
      }
      
      const key = this.generateKey();
      Core.state.settings.syncKey = key;
      Core.state.settings.lastModified = Date.now();
      Core.state._syncMeta = { lastPull: 0, lastPush: Date.now(), pendingChanges: false };
      
      // Local'e kaydet
      Core.DB.saveLocalOnly();
      
      const docRef = this._doc(key);
      
      try {
        await docRef.set({
          state: Core.state,
          lastModified: Core.state.settings.lastModified,
          version: 1,
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        
        this._lastKnownVersion = 1;
        this._lastKnownModTime = Core.state.settings.lastModified;
        this._emitStatus("ok");
        this.attachListener();
        
        console.log('[Cloud] Hesap oluşturuldu, key:', key);
        return key;
      } catch (e) {
        console.error('[Cloud] Hesap oluşturma hatası:', e);
        this._emitStatus("error");
        this.lastError = e?.message || "create-failed";
        throw e;
      }
    },

    // ── Mevcut anahtarla giriş ────────────────────────────────────────
    async loginWithKey(rawKey) {
      console.log('[Cloud] loginWithKey çağrıldı');
      
      const key = this.normalizeKey(rawKey);
      if (!this.isValidKey(key)) {
        throw new Error("INVALID_KEY");
      }
      
      if (!this.isAvailable()) {
        throw new Error('CLOUD_UNAVAILABLE');
      }
      
      const docRef = this._doc(key);
      let snapshot;
      
      try {
        snapshot = await docRef.get();
      } catch (e) {
        console.error('[Cloud] Doküman okuma hatası:', e);
        this._emitStatus("error");
        throw e;
      }
      
      if (!snapshot.exists) {
        throw new Error("NOT_FOUND");
      }
      
      const remoteData = snapshot.data();
      const remoteModTime = remoteData.lastModified || 0;
      const localModTime = Core.state.settings?.lastModified || 0;
      
      this._lastKnownVersion = remoteData.version || 0;
      this._lastKnownModTime = remoteModTime;
      
      // Eğer remote daha yeniyse veya eşitse, remote'u kullan
      if (remoteModTime >= localModTime) {
        const newState = this._mergeStates(remoteData.state, Core.state);
        newState.settings.syncKey = key;
        Core.state = newState;
      } else {
        // Local daha yeniyse, local'i koru
        Core.state.settings.syncKey = key;
      }
      
      Core.state.settings.lastModified = Date.now();
      Core.DB.saveLocalOnly();
      
      // Push yap (local'i buluta yaz)
      await this._safePush();
      
      this._emitStatus("ok");
      this.attachListener();
      
      console.log('[Cloud] Giriş başarılı');
      return Core.state;
    },

    // ── Realtime listener ─────────────────────────────────────────────
    attachListener() {
      if (!this.isAvailable() || !Core.state.settings?.syncKey) return;
      this.detachListener();
      
      const docRef = this._doc(Core.state.settings.syncKey);
      
      this._unsubscribe = docRef.onSnapshot(
        async (snapshot) => {
          // Push yaparken kendi snapshot'ımızı ignore et
          if (this._isPushing) {
            console.log('[Cloud] Snapshot ignore: push devam ediyor');
            return;
          }
          
          if (!snapshot.exists) return;
          
          const remoteData = snapshot.data();
          const remoteVersion = remoteData.version || 0;
          const remoteModTime = remoteData.lastModified || 0;
          const localModTime = Core.state.settings?.lastModified || 0;
          
          // Sadece remote daha yeniyse pull yap
          if (remoteModTime > localModTime && remoteVersion > this._lastKnownVersion) {
            console.log('[Cloud] Snapshot: remote değişiklik tespit edildi, pull yapılıyor');
            await this._safePull();
          }
          
          this._lastKnownVersion = remoteVersion;
          this._lastKnownModTime = remoteModTime;
          
          if (this.status !== "ok") this._emitStatus("ok");
        },
        (error) => {
          console.warn('[Cloud] Listener hatası:', error);
          this.lastError = error?.message || "listener-error";
          this._emitStatus(navigator.onLine === false ? "offline" : "error");
        }
      );
      
      console.log('[Cloud] Listener bağlandı');
    },

    detachListener() {
      if (this._unsubscribe) {
        try { this._unsubscribe(); } catch(e) {}
        this._unsubscribe = null;
        console.log('[Cloud] Listener ayrıldı');
      }
    },

    // ── Debounced push ────────────────────────────────────────────────
    queuePush(immediate = false) {
      if (!this.isAvailable() || !Core.state.settings?.syncKey) return;
      if (this._isPushing) return;
      
      if (this._pushTimer) clearTimeout(this._pushTimer);
      
      if (immediate) {
        this._pushTimer = null;
        this._safePush();
      } else {
        this._pushTimer = setTimeout(() => {
          this._pushTimer = null;
          this._safePush();
        }, this._pushDelay);
      }
    },

    // ── Manuel zorla senkronizasyon ────────────────────────────────────
    async forceSync() {
      if (!this.isAvailable() || !Core.state.settings?.syncKey) {
        throw new Error('CLOUD_UNAVAILABLE');
      }
      
      if (this._pushTimer) {
        clearTimeout(this._pushTimer);
        this._pushTimer = null;
      }
      
      this._emitStatus('syncing');
      
      // Önce pull yap
      await this._safePull();
      // Sonra push yap
      await this._safePush();
      
      this._emitStatus('ok');
      return 'synced';
    },

    // ── Bu cihazdan çıkış ─────────────────────────────────────────────
    signOut() {
      this.detachListener();
      
      if (this._pushTimer) {
        clearTimeout(this._pushTimer);
        this._pushTimer = null;
      }
      
      Core.state.settings.syncKey = "";
      Core.state.settings.lastModified = Date.now();
      Core.state._syncMeta = { lastPull: 0, lastPush: 0, pendingChanges: false };
      this._lastKnownVersion = 0;
      this._lastKnownModTime = 0;
      
      Core.DB.saveLocalOnly();
      this._emitStatus("idle");
      
      try { Core.emit("stateChanged", Core.state); } catch(e) {}
      console.log('[Cloud] Çıkış yapıldı');
    },
    
    // ── Hesabı tamamen sil ────────────────────────────────────────────
    async deleteAccount() {
      const syncKey = Core.state.settings?.syncKey;
      
      this.detachListener();
      
      if (this._pushTimer) {
        clearTimeout(this._pushTimer);
        this._pushTimer = null;
      }
      
      // Firebase'den sil
      if (syncKey && this.isAvailable()) {
        try {
          await this._doc(syncKey).delete();
          console.log('[Cloud] Doküman silindi:', syncKey);
        } catch (e) {
          console.warn('[Cloud] Doküman silme hatası:', e);
        }
      }
      
      // Local state'i sıfırla
      const emptyState = {
        settings: {
          syncKey: '',
          lastModified: Date.now(),
          notifications: {
            abonelik: false, borc: false, butce: false, haftalik: false,
            krediKarti: false, hedef: false, buyukHarcama: false, doviz: false
          },
          notifMaster: false,
          theme: 'light',
          lang: 'tr',
          anim: 'on',
          privacy: 'off',
          currency: 'TRY',
          cachedRates: null,
          bnavItems: ['dashboard', 'wallets', 'transactions', 'settings'],
          qaItems: ['addTx', 'addRecurring', 'addGoal', 'addDebt'],
          name: '',
          onboarded: false
        },
        wallets: [],
        transactions: [],
        recurring: [],
        goals: [],
        debts: [],
        budgets: [],
        notifInbox: [],
        paidMonths: {},
        _syncMeta: { lastPull: 0, lastPush: 0, pendingChanges: false }
      };
      
      Core.state = emptyState;
      this._lastKnownVersion = 0;
      this._lastKnownModTime = 0;
      
      Core.DB.saveLocalOnly();
      this._emitStatus('idle');
      
      try { Core.emit('stateChanged', Core.state); } catch(e) {}
      console.log('[Cloud] Hesap silindi');
    },

    // ── Aktif view'i yenile ───────────────────────────────────────────
    _rerenderActiveView() {
      try {
        const hash = window.location.hash.replace("#", "") || "/dashboard";
        const c = (window.App && App.Controllers) || null;
        if (!c) return;
        
        // Bottom bar yenile
        if (c.BottomBar) {
          const items = Core.state.settings.bnavItems;
          if (Array.isArray(items) && items.length > 0) {
            try { localStorage.setItem(c.BottomBar.STORAGE_KEY, JSON.stringify(items)); } catch(e) {}
          }
          c.BottomBar.renderNav();
        }
        
        // Tema & dil uygula
        if (c.Settings) {
          c.Settings.applyTheme && c.Settings.applyTheme();
          if (Core.state.settings.lang && window.LANG !== Core.state.settings.lang) {
            window.LANG = Core.state.settings.lang;
            typeof applyLang === 'function' && applyLang();
          }
        }
        
        // View yenileme
        const viewMap = {
          '/dashboard': () => c.Dashboard && c.Dashboard.render && c.Dashboard.render(),
          '/wallets': () => c.Wallets && c.Wallets.render && c.Wallets.render(),
          '/transactions': () => c.Transactions && c.Transactions.renderSetup && c.Transactions.renderSetup(),
          '/analytics': () => c.Analytics && c.Analytics.render && c.Analytics.render(),
          '/recurring': () => c.Recurring && c.Recurring.render && c.Recurring.render(),
          '/goals': () => c.Goals && c.Goals.render && c.Goals.render(),
          '/debts': () => c.Debts && c.Debts.render && c.Debts.render(),
          '/settings': () => c.Settings && c.Settings.renderForm && c.Settings.renderForm(),
          '/notifications': () => c.NotifInbox && c.NotifInbox.render && c.NotifInbox.render()
        };
        
        const renderer = viewMap[hash];
        if (renderer) renderer();
        
      } catch (e) {
        console.warn("[Cloud] Re-render hatası:", e);
      }
    },

    // ── Firebase hazır olana kadar bekle ve bağlan ──────────────────────
    _waitForFirebase(attempts = 0) {
      if (this.isAvailable()) {
        console.log('[Cloud] Firebase hazır, bağlanılıyor...');
        if (Core.state.settings?.syncKey && !this._unsubscribe) {
          this._initialPull().then(() => {
            this.attachListener();
            this._emitStatus('ok');
          }).catch(() => {
            this.attachListener();
          });
        } else {
          this._emitStatus('idle');
        }
        return;
      }
      
      if (attempts >= 50) { // 10 saniye max bekle (200ms * 50)
        console.warn('[Cloud] Firebase 10sn içinde hazır olmadı');
        this._emitStatus('unavailable');
        return;
      }
      
      setTimeout(() => this._waitForFirebase(attempts + 1), 200);
    }
  };

  // ── Core'a enjekte et ────────────────────────────────────────────
  window.Cloud = Cloud;
  
  if (typeof window.Core !== 'undefined') {
    window.Core.Cloud = Cloud;
    console.log('[SAGI] Cloud Core\'a bağlandı');
  }

  // ── Visibility change handlers ────────────────────────────────────
  document.addEventListener('visibilitychange', function() {
    if (!Cloud.isAvailable() || !Core.state.settings?.syncKey) return;
    
    if (document.visibilityState === 'hidden') {
      // Arka plana geçerken push yap
      if (Cloud._pushTimer) {
        clearTimeout(Cloud._pushTimer);
        Cloud._pushTimer = null;
      }
      Cloud._safePush().catch(() => {});
      
    } else if (document.visibilityState === 'visible') {
      // Öne gelirken pull yap
      Cloud._safePull().catch(() => {});
    }
  });

  // ── Sayfa kapanırken son push ─────────────────────────────────────
  window.addEventListener('pagehide', function() {
    if (!Cloud.isAvailable() || !Core.state.settings?.syncKey) return;
    if (Cloud._pushTimer) {
      clearTimeout(Cloud._pushTimer);
      Cloud._pushTimer = null;
    }
    // Senkron olarak lastModified güncelle ve local'e kaydet
    Core.state.settings.lastModified = Date.now();
    Core.DB.saveLocalOnly();
  });

  window.addEventListener('beforeunload', function() {
    if (!Cloud.isAvailable() || !Core.state.settings?.syncKey) return;
    if (Cloud._pushTimer) {
      clearTimeout(Cloud._pushTimer);
      Cloud._pushTimer = null;
      Core.state.settings.lastModified = Date.now();
      Core.DB.saveLocalOnly();
    }
  });

  // ── DOMContentLoaded'da Firebase hazırlığını başlat ────────────────
  window.addEventListener('DOMContentLoaded', function() {
    if (typeof window.Core !== 'undefined') {
      window.Core.Cloud = Cloud;
    }
    
    // Firebase polling başlat
    Cloud._waitForFirebase();
  });

})();