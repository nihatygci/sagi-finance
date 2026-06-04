/* ════════════════════════════════════════════════════════════════════
   SAGI Finance — CLOUD SYNC
   ────────────────────────────────────────────────────────────────────
   Firebase Cloud Firestore üzerinden cihazlar arası senkronizasyon.

   • 16 haneli hex anahtar (XXXX-XXXX-XXXX-XXXX) cihazlar arası
     eşleşme için kullanılır. Anahtar Firestore'da bir doküman ID'si
     olarak saklanır: users/{key16}
   • Yerel her save sonrası 1.5 sn debounce ile buluta push.
   • onSnapshot ile gerçek zamanlı pull — başka cihazda yapılan
     değişiklikler bu cihazda otomatik görünür.
   • lastModified timestamp ile çakışma çözülür: son yazan kazanır.

   Bu modül yüklendiğinde Core.Cloud namespace'ini Core'a ekler.
   Firebase yüklenememişse modül sessizce devre dışı kalır;
   uygulama offline çalışmaya devam eder.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  // Core henüz tanımlanmadıysa bekle (script sırası garantili olsun diye yine de
  // index.html'de bu dosya inline scriptlerden ÖNCE çağrılıyor; yine de güvenli kontrol).
  if (typeof window.Core === "undefined") {
    // Core daha sonra tanımlanacak — biz attığımız zamanı gözleyip enjekte ederiz.
    // En basit yol: Core'u tanımlayan scriptin altında bu modül zaten import ediliyor.
    // Bu durumda direkt Core'a Cloud'u eklemek için window'a koymadan önce hazırla.
    window.__SAGI_CLOUD_PENDING__ = true;
  }

  // ── Cloud namespace ──────────────────────────────────────────────────
  const Cloud = {
    // Durum
    status: "idle", // 'idle' | 'syncing' | 'ok' | 'error' | 'offline' | 'unavailable'
    lastError: "",

    // Internal
    _pushTimer: null,
    _pushDelay: 700,
    _unsubscribe: null,
    _lastPushId: null,

    // Firestore koleksiyon yolu
    _COLLECTION: "users",

    // ── Kullanılabilirlik ─────────────────────────────────────────────
    isAvailable() {
      return !!(window._fbReady && window._fbDB);
    },

    // Firebase persistence henüz settle olmadıysa (enablePersistence async)
    // _fbReady false kalabilir. Bu metod max 5sn polling yaparak hazır olunca
    // cloudStatusChanged emit eder; böylece Onboarding butonları aktif olur.
    _waitForFirebaseAndNotify(attempts) {
      if (attempts === undefined) attempts = 0;
      if (this.isAvailable()) {
        console.log('[Cloud] Firebase polling: hazır, emit ediliyor.');
        if (Core.state.settings && Core.state.settings.syncKey && !this._unsubscribe) {
          // Önce pull yap — tamamlanınca listener'ı bağla
          // Listener bağlanmadan önce pull bitmiş olacak, suppress race condition olmaz
          this._initialPull().then(() => {
            this.attachListener();
            this._emitStatus('ok');
          }).catch(() => {
            // Pull hata verse bile listener'ı bağla
            this.attachListener();
          });
        } else {
          this._emitStatus('idle');
        }
        return;
      }
      if (attempts >= 40) {
        console.warn('[Cloud] Firebase 10sn içinde hazır olmadı, offline kalındı.');
        return;
      }
      setTimeout(() => this._waitForFirebaseAndNotify(attempts + 1), 250);
    },

    async _initialPull() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      try {
        const docRef = this._doc(Core.state.settings.syncKey);
        const snap = await docRef.get();
        if (!snap.exists) return;
        const data = snap.data();
        if (!data || !data.state) return;

        const remoteMod = data.lastModified || 0;
        const localMod = (Core.state.settings && Core.state.settings.lastModified) || 0;

        console.log('[Cloud] initialPull — local:', localMod, 'remote:', remoteMod);

        if (remoteMod > localMod) {
          console.log('[Cloud] initialPull: bulut daha yeni, pull yapılıyor.');
          const savedKey = Core.state.settings.syncKey;
          Core.state = data.state;
          Core.state.settings = Object.assign({
            notifications: { abonelik:false, borc:false, butce:false, haftalik:false,
              krediKarti:false, hedef:false, buyukHarcama:false, doviz:false },
            notifMaster: false, theme: 'light', lang: 'tr', anim: 'on',
            privacy: 'off', currency: 'TRY', cachedRates: null,
          }, data.state.settings || {});
          Core.state.settings.syncKey = savedKey;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          // Listener ilk snapshot'ı suppress etsin — biz zaten aynı veriyi çektik
          this._suppressNextRemote = true;
          try { Core.emit('stateChanged', Core.state); } catch(e) {}
          try { Core.emit('cloudRemoteUpdate', Core.state); } catch(e) {}
          this._rerenderActiveView();
        } else if (localMod > remoteMod) {
          // Yerel daha yeni — kapanışta push kaçmış olabilir, şimdi push yap
          console.log('[Cloud] initialPull: yerel daha yeni, push yapılıyor.');
          await this._doPush();
        }
        // Eşitse bir şey yapma
      } catch(e) {
        console.warn('[Cloud] initialPull hatası:', e);
      }
    },

    _checkFirebase() {
      if (window._fbReady && window._fbDB) {
        console.log('[Cloud] Firebase hazır, durum güncellendi.');
        this._emitStatus('idle');
      }
    },

    _emitStatus(s) {
      this.status = s;
      try {
        Core.emit("cloudStatusChanged", s);
      } catch (e) {}
    },

    // ── Anahtar üretimi & doğrulama ───────────────────────────────────
    // 16-hane hex: 8 byte rastgele = 64 bit entropi
    generateKey() {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      const hex = Array.from(buf)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      return hex.match(/.{4}/g).join("-");
    },

    // Kullanıcı girdisini normalize et: tire/boşluk temizle, büyült
    normalizeKey(raw) {
      if (!raw) return "";
      const str = String(raw).trim();
      // PLUS prefix: PLUS-XXXX-XXXX-XXXX-XXXX veya PLUSXXXXXXXXXXXXXXXX
      const plusMatch = str.match(/^PLUS[-]?([0-9A-Fa-f-]{16,19})$/i);
      if (plusMatch) {
        const hex = plusMatch[1].replace(/[^0-9a-fA-F]/g, '').toUpperCase();
        if (hex.length === 16) return 'PLUS-' + hex.match(/.{4}/g).join('-');
      }
      // Normal 16 haneli key
      const clean = str.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
      if (clean.length === 16) return clean.match(/.{4}/g).join("-");
      return "";
    },

    isValidKey(key) {
      const k = key || "";
      if (/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(k)) return true;
      if (/^PLUS-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(k)) return true;
      return false;
    },

    // Firestore doc ID'si — tireler kaldırılır (16 char)
    _docId(key) {
      return (key || "").replace(/-/g, "");
    },

    _doc(key) {
      if (!this.isAvailable()) return null;
      return window._fbDB.collection(this._COLLECTION).doc(this._docId(key));
    },

    // ── Yeni hesap aç ─────────────────────────────────────────────────
    // Mevcut yerel state'i alır, yeni anahtar üretir, Firestore'a yazar.
    async createAccount() {
  console.log('[Cloud DEBUG] createAccount çağrıldı');
  console.log('[Cloud DEBUG] isAvailable:', this.isAvailable());
  console.log('[Cloud DEBUG] _fbReady:', window._fbReady);
  console.log('[Cloud DEBUG] _fbDB:', window._fbDB);
  
  if (!this.isAvailable()) {
    const err = new Error('CLOUD_UNAVAILABLE');
    err.detail = window._fbErr || 'sdk-missing';
    console.error('[Cloud DEBUG] UNAVAILABLE nedeni:', err.detail);
    throw err;
  }
      const key = this.generateKey();
      Core.state.settings.syncKey = key;
      Core.state.settings.lastModified = Date.now();
      // localStorage'a yaz (save'i bypass — push'u biz manuel yapıyoruz)
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      // Firestore'a yaz
      const docRef = this._doc(key);
      const pushId = Math.random().toString(36).slice(2);
      this._lastPushId = pushId;
      try {
        await docRef.set({
          state: Core.state,
          lastModified: Core.state.settings.lastModified,
          pushId: pushId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.error('[Cloud] HATA DETAYI:', e.code, e.message, e);
        // Yazma başarısız: anahtar yerel state'te kalır ama bulutla bağlı değildir
        this._lastPushId = null;
        this._emitStatus("error");
        this.lastError = (e && e.message) || "write-failed";
        throw e;
      }

      this._emitStatus("ok");
      this.attachListener();
      return key;
    },

    // ── Mevcut anahtarla giriş ────────────────────────────────────────
    async loginWithKey(rawKey) {
  console.log('[Cloud DEBUG] loginWithKey çağrıldı, key:', rawKey);
  console.log('[Cloud DEBUG] isAvailable:', this.isAvailable());
      const key = this.normalizeKey(rawKey);
      if (!this.isValidKey(key)) {
        throw new Error("INVALID_KEY");
      }

      const docRef = this._doc(key);
      let snap;
      try {
        snap = await docRef.get();
      } catch (e) {
        console.error('[Cloud] HATA DETAYI:', e.code, e.message, e);
        this._emitStatus("error");
        this.lastError = (e && e.message) || "read-failed";
        throw e;
      }
      if (!snap.exists) throw new Error("NOT_FOUND");

      const data = snap.data();
      if (!data || !data.state) throw new Error("NOT_FOUND");

      // Buluttaki state'i yerel state'in üzerine yaz
      Core.state = data.state;
      // Eksik settings alanlarını tamamla (eski sürüm uyumluluğu)
      Core.state.settings = Object.assign({
        notifications: { abonelik:false, borc:false, butce:false, haftalik:false,
          krediKarti:false, hedef:false, buyukHarcama:false, doviz:false },
        notifMaster: false,
        theme: 'light',
        lang: 'tr',
        anim: 'on',
        privacy: 'off',
        currency: 'TRY',
        cachedRates: null,
      }, data.state.settings || {});
      Core.state.settings.syncKey = key;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      this._emitStatus("ok");
      this.attachListener();
      return Core.state;
    },

    // ── Realtime listener ─────────────────────────────────────────────
    attachListener() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      this.detachListener();

      const docRef = this._doc(Core.state.settings.syncKey);
      this._unsubscribe = docRef.onSnapshot(
        (snap) => {
          // İlk snapshot — bağlandık
          if (this.status !== "ok") this._emitStatus("ok");

          if (!snap.exists) return;
          const data = snap.data();
          // forwardKey varsa — bu key plus'a yükseltildi, yeni key'e geç
          if (data && data.forwardKey) {
            const newKey = data.forwardKey;
            console.log('[Cloud] forwardKey alındı, yeni key:', newKey);
            this.detachListener();
            Core.state.settings.syncKey = newKey;
            Core.state.settings.lastModified = 0; // pull zorla
            localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
            // Yeni key'den veri çek ve listener bağla
            this.loginWithKey(newKey).then(() => {
              setTimeout(() => window.location.reload(), 500);
            }).catch(e => console.warn('[Cloud] forwardKey login hatası:', e));
            return;
          }
          if (!data || !data.state) return;

          // Kendi push'umuzu pushId ile tanı — boolean suppress yerine güvenli yöntem
          if (data.pushId && data.pushId === this._lastPushId) {
            this._lastPushId = null;
            return;
          }

          const remoteMod = data.lastModified || 0;
          const localMod =
            (Core.state.settings && Core.state.settings.lastModified) || 0;
            if (remoteMod > localMod) {
            console.log("[Cloud] Uzak değişiklik alındı, yerel güncelleniyor.");
            const savedKey = Core.state.settings.syncKey;
            Core.state = data.state;
            // Eksik settings alanlarını tamamla (eski sürüm uyumluluğu)
            Core.state.settings = Object.assign({
              notifications: { abonelik:false, borc:false, butce:false, haftalik:false,
                krediKarti:false, hedef:false, buyukHarcama:false, doviz:false },
              notifMaster: false,
              theme: 'light',
              lang: 'tr',
              anim: 'on',
              privacy: 'off',
              currency: 'TRY',
              cachedRates: null,
            }, data.state.settings || {});
            Core.state.settings.syncKey = savedKey;
            localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
            try {
              Core.emit("stateChanged", Core.state);
            } catch (e) {}
            try {
              Core.emit("cloudRemoteUpdate", Core.state);
            } catch (e) {}
            this._rerenderActiveView();
          }
        },
        (err) => {
          console.warn("[Cloud] Listener hatası:", err);
          this.lastError = (err && err.message) || "";
          this._emitStatus(navigator.onLine === false ? "offline" : "error");
        },
      );
    },

    detachListener() {
      if (this._unsubscribe) {
        try {
          this._unsubscribe();
        } catch (e) {}
        this._unsubscribe = null;
      }
    },

    _rerenderActiveView() {
      try {
        const hash = window.location.hash.replace("#", "") || "/dashboard";
        const c = (window.App && App.Controllers) || null;
        if (!c) return;

        // bnavItems değiştiyse alt menüyü her durumda yenile
        // (localStorage'daki eski key'i de güncelle — uyumluluk için)
        if (c.BottomBar) {
          const items = Core.state.settings.bnavItems;
          if (Array.isArray(items) && items.length > 0) {
            try { localStorage.setItem(c.BottomBar.STORAGE_KEY, JSON.stringify(items)); } catch(e) {}
          }
          c.BottomBar.renderNav();
        }

        // Tema & dil değiştiyse uygula
        if (c.Settings) {
          c.Settings.applyTheme && c.Settings.applyTheme();
          if (Core.state.settings.lang && window.LANG !== Core.state.settings.lang) {
            window.LANG = Core.state.settings.lang;
            typeof applyLang === 'function' && applyLang();
          }
        }

        if (hash === "/dashboard")
          c.Dashboard && c.Dashboard.render && c.Dashboard.render();
        else if (hash === "/wallets")
          c.Wallets && c.Wallets.render && c.Wallets.render();
        else if (hash === "/transactions")
          c.Transactions &&
            c.Transactions.renderSetup &&
            c.Transactions.renderSetup();
        else if (hash === "/analytics")
          c.Analytics && c.Analytics.render && c.Analytics.render();
        else if (hash === "/recurring")
          c.Recurring && c.Recurring.render && c.Recurring.render();
        else if (hash === "/goals")
          c.Goals && c.Goals.render && c.Goals.render();
        else if (hash === "/debts")
          c.Debts && c.Debts.render && c.Debts.render();
        else if (hash === "/settings")
          c.Settings && c.Settings.renderForm && c.Settings.renderForm();
      } catch (e) {
        console.warn("[Cloud] Re-render hatası:", e);
      }
    },

    // ── Debounced push ────────────────────────────────────────────────
    queuePush(immediate) {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (this._pushTimer) clearTimeout(this._pushTimer);
      if (immediate) {
        this._pushTimer = null;
        return this._doPush();
      }
      this._pushTimer = setTimeout(() => {
        this._pushTimer = null;
        this._doPush();
      }, this._pushDelay);
    },

    async _doPush() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      this._emitStatus("syncing");
      const docRef = this._doc(Core.state.settings.syncKey);
      // pushId: bu push'a özgü ID — snapshot gelince kendi push'umuzu tanırız
      const pushId = Math.random().toString(36).slice(2);
      this._lastPushId = pushId;
      // lastModified push ÖNCESINDE güncellenmez — push başarılı olunca güncellenir
      const pushTimestamp = Date.now();
      try {
        await docRef.set(
          {
            state: Core.state,
            lastModified: pushTimestamp,
            pushId: pushId,
          },
          { merge: false },
        );
        // Push başarılı — şimdi local'i güncelle
        Core.state.settings.lastModified = pushTimestamp;
        localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
        this.lastError = "";
        this._emitStatus("ok");
      } catch (e) {
        console.error('[Cloud DEBUG] Push hatası — code:', e.code, '| message:', e.message);
        console.warn("[Cloud] Push hatası:", e);
        this._lastPushId = null;
        this.lastError = (e && e.message) || "";
        this._emitStatus(navigator.onLine === false ? "offline" : "error");
      }
    },

    // ── Manuel zorla push ─────────────────────────────────────────────
    async forcePush() {
      if (this._pushTimer) {
        clearTimeout(this._pushTimer);
        this._pushTimer = null;
      }
      return this._doPush();
    },

    // ── Akıllı senkronizasyon — lastModified karşılaştır, kazananı uygula ──
    async forceSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) return;
      if (this._pushTimer) { clearTimeout(this._pushTimer); this._pushTimer = null; }

      this._emitStatus('syncing');
      const docRef = this._doc(Core.state.settings.syncKey);
      try {
        const snap = await docRef.get();
        const localMod = (Core.state.settings && Core.state.settings.lastModified) || 0;

        if (!snap.exists) {
          // Bulutta hiç veri yok — push yap
          console.log('[Cloud] forceSync: bulutta veri yok, push yapılıyor.');
          return this._doPush();
        }

        const data = snap.data();
        const remoteMod = (data && data.lastModified) || 0;

        console.log('[Cloud] forceSync — local:', localMod, 'remote:', remoteMod);

        if (remoteMod > localMod) {
          // Bulut daha yeni — pull yap
          console.log('[Cloud] forceSync: bulut daha yeni, pull yapılıyor.');
          const savedKey = Core.state.settings.syncKey;
          Core.state = data.state;
          Core.state.settings = Object.assign({
            notifications: { abonelik:false, borc:false, butce:false, haftalik:false,
              krediKarti:false, hedef:false, buyukHarcama:false, doviz:false },
            notifMaster: false, theme: 'light', lang: 'tr', anim: 'on',
            privacy: 'off', currency: 'TRY', cachedRates: null,
          }, data.state.settings || {});
          Core.state.settings.syncKey = savedKey;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          this._emitStatus('ok');
          try { Core.emit('stateChanged', Core.state); } catch(e) {}
          try { Core.emit('cloudRemoteUpdate', Core.state); } catch(e) {}
          this._rerenderActiveView();
          return 'pulled';
        } else if (localMod > remoteMod) {
          // Yerel daha yeni — push yap
          console.log('[Cloud] forceSync: yerel daha yeni, push yapılıyor.');
          return this._doPush();
        } else {
          // Eşit — zaten senkron
          console.log('[Cloud] forceSync: zaten senkron.');
          this._emitStatus('ok');
          return 'in-sync';
        }
      } catch(e) {
        console.warn('[Cloud] forceSync hatası:', e);
        this._emitStatus(navigator.onLine === false ? 'offline' : 'error');
        throw e;
      }
    },

    // ── Bu cihazdan çıkış ─────────────────────────────────────────────
    // Yerel veriler kalır; bulutla bağlantı kesilir.
    signOut() {
      this.detachListener();
      Core.state.settings.syncKey = "";
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      this._emitStatus("idle");
      try {
        Core.emit("stateChanged", Core.state);
      } catch (e) {}
    },
    
    // ── Hesabı tamamen sil ────────────────────────────────────────────
    // Firestore'daki dokümanı siler, listener'ı keser, localStorage'ı temizler.
    async deleteAccount() {
      const key = Core.state.settings.syncKey;

      // Listener'ı hemen kes — silme sırasında snapshot gelmesin
      this.detachListener();
      if (this._pushTimer) { clearTimeout(this._pushTimer); this._pushTimer = null; }

      // Firebase'den sil (key varsa)
      if (key && this.isAvailable()) {
        try {
          await this._doc(key).delete();
          console.log('[Cloud] Firestore dokümanı silindi:', key);
        } catch (e) {
          console.warn('[Cloud] Firestore silme hatası:', e);
          // Silme başarısız olsa da yerel temizliğe devam et
        }
      }

      // Yerel her şeyi temizle
      localStorage.removeItem(Core.DB.key);
      Core.state = JSON.parse(JSON.stringify({
        settings: {
          syncKey: '',
          lastModified: Date.now(),
          notifications: { abonelik:false, borc:false, butce:false, haftalik:false,
            krediKarti:false, hedef:false, buyukHarcama:false, doviz:false },
          notifMaster: false,
          theme: 'light',
          lang: 'tr',
          anim: 'on',
          privacy: 'off',
          currency: 'TRY',
        },
        wallets:[], transactions:[], recurring:[], goals:[], debts:[], categories:[]
      }));

      this._emitStatus('idle');
      try { Core.emit('stateChanged', Core.state); } catch(e) {}
    },
  };
  

  // ── Core'a enjekte et ────────────────────────────────────────────
  window.Cloud = Cloud;

  if (typeof window.Core !== 'undefined') {
    window.Core.Cloud = Cloud;
    console.log('[SAGI] Cloud Core\'a bağlandı. Durum:', Cloud.status);
  }

  // ── Kapanışta & arka plana geçişte push ──────────────────────────

  // FIX: pagehide'da Firestore push'u kaldırıldı — tarayıcı async işlemi
  // tamamlamadan sayfayı öldürür, push hiçbir zaman ulaşmıyordu.
  // Güvence: visibilitychange:hidden'da push zaten gönderilir.
  // Burada sadece senkron olan local kayıt yapılır.
  window.addEventListener('pagehide', function() {
    if (!Core.state.settings.syncKey) return;
    if (Cloud._pushTimer) {
      clearTimeout(Cloud._pushTimer);
      Cloud._pushTimer = null;
    }
    // NOT: lastModified burada güncellenmez — Firebase'e ulaşmadan kapanırsa
    // sahte yeni timestamp local'de kalır ve sonraki açılışta eski veri push'lanır.
    localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
  });

  window.addEventListener('beforeunload', function() {
    if (!Cloud.isAvailable() || !Core.state.settings.syncKey) return;
    if (Cloud._pushTimer) {
      clearTimeout(Cloud._pushTimer);
      Cloud._pushTimer = null;
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
    }
  });

  // FIX: visibilitychange:hidden — artık her zaman lastModified güncellenir
  // ve push başlatılır (sadece bekleyen timer varsa değil, her zaman).
  // Bu sayede telefon arka plana alındığında veri Firebase'e gider.
  // visible — öne gelince pull yap, başka cihazda değişiklik olmuş olabilir.
  document.addEventListener('visibilitychange', function() {
    if (!Cloud.isAvailable() || !Core.state.settings.syncKey) return;
    if (document.visibilityState === 'hidden') {
      // Timer varsa iptal et
      if (Cloud._pushTimer) {
        clearTimeout(Cloud._pushTimer);
        Cloud._pushTimer = null;
      }
      // lastModified'ı senkron güncelle ve local'e yaz
      Core.state.settings.lastModified = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      // Firestore push'u başlat — mobil hemen öldürmeyebilir, şansımız var
      Cloud._doPush().catch(() => {});
    } else if (document.visibilityState === 'visible') {
      // Öne gelince initialPull yap — başka cihazda değişiklik olmuş olabilir
      Cloud._initialPull().catch(() => {});
    }
  });

  window.addEventListener('DOMContentLoaded', function() {
    if (typeof window.Core !== 'undefined') {
      window.Core.Cloud = Cloud;
      console.log('[SAGI] Cloud DOMContentLoaded Core\'a re-enjekte edildi. Firebase:', window._fbReady);
    }

    // Firebase hazırsa Cloud durumunu güncelle ve UI'yi bilgilendir
    if (window.Core && window.Core.Cloud) {
      if (window._fbReady && window._fbDB) {
        window.Core.Cloud.status = 'idle';
        // Kısa bir timeout ile App.init() tamamlandıktan sonra emit et;
        // böylece Settings/Onboarding controller'ları listener'larını
        // kaydetmiş olur ve cloudStatusChanged'i yakalarlar.
        setTimeout(function() {
          try { window.Core.emit('cloudStatusChanged', 'idle'); } catch(e) {}
        }, 0);
      }
    }
  }, true /* capture — App.init()'in DOMContentLoaded'ından önce çalışır */);

})();