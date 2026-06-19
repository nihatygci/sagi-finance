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
          this._initialPull().then((forwarded) => {
            if (forwarded) return; // forwardKey ile geçiş yapıldı, listener bağlama
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
        // forwardKey varsa — direkt geç
        if (data && data.forwardKey) {
          const newKey = data.forwardKey;
          console.log('[Cloud] initialPull forwardKey:', newKey);
          this.detachListener();
          Core.state.settings.syncKey = newKey;
          Core.state.settings.lastModified = 0;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          this.loginWithKey(newKey).then(() => {
            setTimeout(() => window.location.reload(), 300);
          }).catch(e => console.warn('[Cloud] forwardKey login hatası:', e));
          return true;
        }
        if (!data || !data.state) return;
        // forwardKey yoksa — remote syncKey PLUS key mi?
        // devActivate eski doc'taki syncKey'i PLUS key olarak güncelledi
        const remoteSyncKey = data.state && data.state.settings && data.state.settings.syncKey;
        const currentKey = Core.state.settings.syncKey || '';
        if (remoteSyncKey && remoteSyncKey !== currentKey && remoteSyncKey.startsWith('PLUS-')) {
          console.log('[Cloud] Remote syncKey PLUS, geçiliyor:', remoteSyncKey);
          this.detachListener();
          Core.state.settings.syncKey = remoteSyncKey;
          Core.state.settings.lastModified = 0;
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          this.loginWithKey(remoteSyncKey).then(() => {
            setTimeout(() => window.location.reload(), 300);
          }).catch(e => console.warn('[Cloud] PLUS geçiş hatası:', e));
          return true;
        }
        // forwardKey ve remoteSyncKey yoksa — PLUS-{key} doc'u var mı proaktif kontrol
        // devActivate forwardKey yazmayı başaramadıysa bu güvence yakalar
        if (!currentKey.startsWith('PLUS-')) {
          try {
            const plusKey = 'PLUS-' + currentKey;
            const plusSnap = await this._doc(plusKey).get();
            if (plusSnap.exists && plusSnap.data() && plusSnap.data().state) {
              console.log('[Cloud] initialPull: PLUS doc bulundu, geçiliyor:', plusKey);
              try {
                await this._doc(currentKey).set({ forwardKey: plusKey, lastModified: Date.now() }, { merge: true });
              } catch(e) { console.warn('[Cloud] forwardKey yazılamadı:', e); }
              this.detachListener();
              Core.state.settings.syncKey = plusKey;
              Core.state.settings.lastModified = 0;
              localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
              this.loginWithKey(plusKey).then(() => {
                setTimeout(() => window.location.reload(), 300);
              }).catch(e => console.warn('[Cloud] PLUS geçiş hatası:', e));
              return true;
            }
          } catch(e) { console.warn('[Cloud] PLUS doc kontrol hatası:', e); }
        }

        const remoteMod = data.lastModified || 0;
        const localMod = (Core.state.settings && Core.state.settings.lastModified) || 0;

        console.log('[Cloud] initialPull — local:', localMod, 'remote:', remoteMod);

        if (remoteMod === localMod) {
          // Eşit — zaten senkron
          return;
        }

        // ── Array-level merge — hiçbir taraf diğerini topyekûn ezmez ──────
        // Eskiden: "kim daha yeni" → tek taraf kazanır, diğeri kaybolur.
        // Şimdi: ID bazlı birleştirme. Bir cihaz günlerce offline kalıp
        // değişiklik yapsa da, online'a döndüğünde o değişiklikler kaybolmaz;
        // diğer cihazın değişiklikleriyle birleşir. Silme işlemleri tombstone
        // sayesinde geri dirilmez. Core.mergeState, index.html'deki inline
        // Core objesine eklenmiştir (core.js dosyası artık kullanılmıyor).
        console.log('[Cloud] initialPull: merge ediliyor (local + remote).');
        const savedKey = Core.state.settings.syncKey;
        const merged = Core.mergeState(Core.state, data.state);
        Core.state = merged;
        Core.state.settings.syncKey = savedKey;
        localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
        // Listener ilk snapshot'ı suppress etsin — biz zaten aynı veriyi çektik
        this._suppressNextRemote = true;
        try { Core.emit('stateChanged', Core.state); } catch(e) {}
        try { Core.emit('cloudRemoteUpdate', Core.state); } catch(e) {}
        this._rerenderActiveView();

        // Merge sonucu hem yerelden hem uzaktan farklı olabilir (örn. iki
        // tarafın da yeni kayıtları birleşti) — bu yeni birleşik hali
        // buluta geri yaz ki diğer cihazlar da görsün.
        await this._doPush();
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
      // ── Consent verisini Firestore top-level'a ekle (denetim kaydı) ──
      const consentPayload = {};
      if (Core.state.settings.consentDate) {
        consentPayload.consentDate    = Core.state.settings.consentDate;
        consentPayload.consentVersion = Core.state.settings.consentVersion || null;
        consentPayload.consentLang    = Core.state.settings.consentLang || null;
        consentPayload.consentMethod  = Core.state.settings.consentMethod || null;
      }
      try {
        await docRef.set({
          state: Core.state,
          lastModified: Core.state.settings.lastModified,
          pushId: pushId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          ...consentPayload,
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
      if (!data) throw new Error("NOT_FOUND");

      // ── PLUS yönlendirme — state kontrolünden ÖNCE yapılmalı ─────────
      // 1) forwardKey: devActivate eski doc'a forwardKey yazıyor
      //    state olmasa bile buraya bakılmalı — önce kontrol et
      if (data.forwardKey) {
        const fwdKey = this.normalizeKey(data.forwardKey) || data.forwardKey;
        console.log('[Cloud] loginWithKey: forwardKey bulundu, yönlendiriliyor:', fwdKey);
        return this.loginWithKey(fwdKey);
      }
      // 2) state.settings.syncKey PLUS- ile başlıyorsa: eski normal key ile
      //    giriş yapıldı ama hesap PLUS'a yükseltilmiş — PLUS doc'una geç
      const remoteSyncKey = data.state && data.state.settings && data.state.settings.syncKey;
      if (remoteSyncKey && remoteSyncKey !== key && remoteSyncKey.startsWith('PLUS-')) {
        console.log('[Cloud] loginWithKey: remote PLUS key bulundu, geçiliyor:', remoteSyncKey);
        return this.loginWithKey(remoteSyncKey);
      }
      // 3) forwardKey ve remoteSyncKey yoksa — PLUS-{key} doc'u var mı proaktif kontrol et
      //    devActivate forwardKey yazmayı başaramadıysa bu güvence yakalar
      if (!key.startsWith('PLUS-')) {
        try {
          const plusKey = 'PLUS-' + key;
          const plusSnap = await this._doc(plusKey).get();
          if (plusSnap.exists && plusSnap.data() && plusSnap.data().state) {
            console.log('[Cloud] loginWithKey: PLUS doc bulundu, geçiliyor:', plusKey);
            // Eski doc'a forwardKey yaz — bir daha bu kontrolü yapmak zorunda kalmayalım
            try {
              await this._doc(key).set({ forwardKey: plusKey, lastModified: Date.now() }, { merge: true });
              console.log('[Cloud] loginWithKey: forwardKey eski doc\'a yazıldı.');
            } catch(e) { console.warn('[Cloud] forwardKey yazılamadı:', e); }
            return this.loginWithKey(plusKey);
          }
        } catch(e) { console.warn('[Cloud] PLUS doc kontrol hatası:', e); }
      }
      // ─────────────────────────────────────────────────────────────────

      if (!data.state) throw new Error("NOT_FOUND");

      // ── Yerel veri varsa merge et, topyekûn ezme ──────────────────────
      // Kullanıcı bu cihazda offline iken zaten işlem yapmış olabilir.
      // O veriyi kaybetmeden buluttaki veriyle birleştir.
      const hasLocalData = (Core.state.transactions && Core.state.transactions.length > 0)
        || (Core.state.wallets && Core.state.wallets.length > 0);

      if (hasLocalData) {
        console.log('[Cloud] loginWithKey: yerel veri mevcut, merge ediliyor.');
        Core.state = Core.mergeState(Core.state, data.state);
      } else {
        Core.state = data.state;
      }

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
      }, data.state.settings || {}, hasLocalData ? Core.state.settings : {});
      // syncKey: girilen key'i yaz — PLUS doc'una redirect gelince
      // recursive call'da key zaten PLUS key olacak, doğru yazılır
      Core.state.settings.syncKey = key;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      this._emitStatus("ok");
      this.attachListener();

      if (hasLocalData) {
        await this._doPush();
      }

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

          // remoteSyncKey PLUS- ile başlıyorsa: devActivate bu cihazda çalıştı ama
          // bu cihaz başka bir cihazdan açık — PLUS doc'una geç
          const _rsk = data.state.settings && data.state.settings.syncKey;
          const _lk  = Core.state.settings.syncKey || '';
          if (_rsk && _rsk !== _lk && _rsk.startsWith('PLUS-')) {
            console.log('[Cloud] onSnapshot: remote PLUS key bulundu, geçiliyor:', _rsk);
            this.detachListener();
            Core.state.settings.syncKey = _rsk;
            Core.state.settings.lastModified = 0;
            localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
            this.loginWithKey(_rsk).then(() => {
              setTimeout(() => window.location.reload(), 500);
            }).catch(e => console.warn('[Cloud] onSnapshot PLUS geçiş hatası:', e));
            return;
          }

          // Kendi push'umuzu pushId ile tanı — boolean suppress yerine güvenli yöntem
          if (data.pushId && data.pushId === this._lastPushId) {
            this._lastPushId = null;
            return;
          }

          const remoteMod = data.lastModified || 0;
          const localMod =
            (Core.state.settings && Core.state.settings.lastModified) || 0;
          if (remoteMod !== localMod) {
            // ── Array-level merge — bkz. _initialPull yorumu ──────────────
            console.log("[Cloud] Uzak değişiklik alındı, merge ediliyor.");
            const savedKey = Core.state.settings.syncKey;
            const merged = Core.mergeState(Core.state, data.state);
            Core.state = merged;
            Core.state.settings.syncKey = savedKey;
            Core.state.settings.lastModified = remoteMod;
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
      // ── Consent verisini Firestore top-level'a ekle (denetim kaydı) ──
      const consentPayload = {};
      if (Core.state.settings.consentDate) {
        consentPayload.consentDate    = Core.state.settings.consentDate;
        consentPayload.consentVersion = Core.state.settings.consentVersion || null;
        consentPayload.consentLang    = Core.state.settings.consentLang || null;
        consentPayload.consentMethod  = Core.state.settings.consentMethod || null;
      }
      try {
        await docRef.set(
          {
            state: Core.state,
            lastModified: pushTimestamp,
            pushId: pushId,
            ...consentPayload,
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
    // ── Senkronizasyon ÖN ANALİZİ — hiçbir şey değiştirmez, sadece karşılaştırır ──
    // Kullanıcı "Senkronize Et" butonuna basmadan önce ne olacağını görsün diye:
    // buluttaki veriyle yereli kıyaslar, hangi taraf da kaç yeni/farklı kayıt
    // olduğunu sayar, sonucu döner. Hiçbir yazma işlemi yapmaz (read-only).
    async analyzeSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) {
        return { status: 'unavailable' };
      }
      const docRef = this._doc(Core.state.settings.syncKey);
      try {
        const snap = await docRef.get();
        const localMod = (Core.state.settings && Core.state.settings.lastModified) || 0;

        if (!snap.exists) {
          return { status: 'cloud-empty', willPush: true };
        }

        const data = snap.data();
        const remoteMod = (data && data.lastModified) || 0;
        const remoteState = data && data.state;

        if (remoteMod === localMod) {
          return { status: 'in-sync' };
        }
        if (!remoteState) {
          return { status: 'cloud-empty', willPush: true };
        }

        // Hangi taraf da, diğerinde olmayan kaç ID var — kullanıcıya somut
        // bir özet vermek için (örn. "2 yeni işlem buluttan gelecek").
        const counts = {};
        const ARRS = ['wallets','transactions','recurring','goals','debts','categories','budgets'];
        let totalNewFromRemote = 0, totalNewFromLocal = 0;
        ARRS.forEach(key => {
          const localArr = Array.isArray(Core.state[key]) ? Core.state[key] : [];
          const remoteArr = Array.isArray(remoteState[key]) ? remoteState[key] : [];
          const localIds = new Set(localArr.map(x => x && x.id).filter(Boolean));
          const remoteIds = new Set(remoteArr.map(x => x && x.id).filter(Boolean));
          let newFromRemote = 0, newFromLocal = 0;
          remoteIds.forEach(id => { if (!localIds.has(id)) newFromRemote++; });
          localIds.forEach(id => { if (!remoteIds.has(id)) newFromLocal++; });
          if (newFromRemote || newFromLocal) counts[key] = { newFromRemote, newFromLocal };
          totalNewFromRemote += newFromRemote;
          totalNewFromLocal += newFromLocal;
        });

        return {
          status: 'diff',
          willMerge: true,
          totalNewFromRemote,
          totalNewFromLocal,
          details: counts,
          remoteMod,
          localMod,
        };
      } catch (e) {
        console.warn('[Cloud] analyzeSync hatası:', e);
        return { status: 'error', error: e };
      }
    },

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

        if (remoteMod === localMod) {
          console.log('[Cloud] forceSync: zaten senkron.');
          this._emitStatus('ok');
          return 'in-sync';
        }

        // ── Array-level merge ──────────────────────────────────────────
        console.log('[Cloud] forceSync: merge ediliyor.');
        const savedKey = Core.state.settings.syncKey;
        const merged = Core.mergeState(Core.state, data.state);
        Core.state = merged;
        Core.state.settings.syncKey = savedKey;
        localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
        this._emitStatus('ok');
        try { Core.emit('stateChanged', Core.state); } catch(e) {}
        try { Core.emit('cloudRemoteUpdate', Core.state); } catch(e) {}
        this._rerenderActiveView();
        await this._doPush();
        return 'merged';
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
          consentDate: null,
          consentVersion: null,
          consentLang: null,
          consentMethod: null,
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
    }

    // Firebase bu noktada henüz hazır olmayabilir (persistence async).
    // firebase-config.js'in .finally() bloğu hazır olunca listener'ı bağlıyor.
    // Eğer _fbReady zaten true ise (nadir ama mümkün) burada da handle et.
    if (window.Core && window.Core.Cloud) {
      if (window._fbReady && window._fbDB) {
        window.Core.Cloud.status = 'idle';
        setTimeout(function() {
          try { window.Core.emit('cloudStatusChanged', 'idle'); } catch(e) {}
        }, 0);
      }
      // _fbReady false ise firebase-config.js .finally() bloğu devralır — burada bekleme yok
    }
  }, true /* capture — App.init()'in DOMContentLoaded'ından önce çalışır */);

})();