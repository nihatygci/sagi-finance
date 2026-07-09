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
    // Fallback: mergeState yoksa — per-field settings + _updatedAt item merge
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
      // Tombstone filtresi
      const allTomb = Object.assign({}, local._tombstones || {}, remote._tombstones || {});
      merged[col] = Array.from(map.values()).filter(function(i) { return i && i.id && !allTomb[i.id]; });
    });
    // Tombstone birleştirme
    merged._tombstones = Object.assign({}, local._tombstones || {}, remote._tombstones || {});
    // Settings per-field merge (fallback)
    const localMod  = (local.settings  && local.settings.lastModified)  || 0;
    const remoteMod = (remote.settings && remote.settings.lastModified) || 0;
    const localStTs  = (local.settings  && local.settings._settingsTs)  || {};
    const remoteStTs = (remote.settings && remote.settings._settingsTs) || {};
    const PER_FIELD = ['theme','lang','anim','privacy','currency','name',
      'plusFont','plusColor','plusCustomColors','plusPlan',
      'bnavItems','notifMaster','notifications','chatTrialStart'];
    const mergedSettings = Object.assign({}, remote.settings || {}, local.settings || {});
    PER_FIELD.forEach(function(k) {
      const lTs = localStTs[k]  || localMod;
      const rTs = remoteStTs[k] || remoteMod;
      if (rTs > lTs) mergedSettings[k] = (remote.settings || {})[k];
    });
    // chatTrialStart — özel kural: "en erken başlayan kazanır"
    (function() {
      var lTrial = parseInt((local.settings  || {}).chatTrialStart) || 0;
      var rTrial = parseInt((remote.settings || {}).chatTrialStart) || 0;
      if (lTrial && rTrial) {
        mergedSettings.chatTrialStart = Math.min(lTrial, rTrial).toString();
      } else if (lTrial || rTrial) {
        mergedSettings.chatTrialStart = (lTrial || rTrial).toString();
      }
    })();
    const mergedStTs = Object.assign({}, remoteStTs, localStTs);
    PER_FIELD.forEach(function(k) {
      const rTs = remoteStTs[k] || 0;
      if (rTs > (localStTs[k] || 0)) mergedStTs[k] = rTs;
    });
    mergedSettings._settingsTs  = mergedStTs;
    mergedSettings.lastModified = Math.max(localMod, remoteMod);
    merged.settings = mergedSettings;
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

    // ── "Bu key gerçekten Firestore'da var oldu mu" kaydı ────────────────
    // _lastSyncedVersion ve hasMeaningfulLocalData() ikisi de sayfa
    // yenilemesinde veya boş-ama-gerçek bir hesapta yanıltıcı olabiliyor:
    //   - _lastSyncedVersion her sayfa yüklemesinde 0'a resetlenir.
    //   - hasMeaningfulLocalData() yeni oluşturulmuş ama içine hiç veri
    //     eklenmemiş bir hesapta (wallets=[], transactions=[]) false döner,
    //     oysa key gerçekten Firestore'da var olmuştu.
    // Bunun yerine: bir key'in var olduğu doğrulandığı AN localStorage'a
    // kalıcı olarak yazıyoruz. Sayfa yenilense de bu bilgi kaybolmaz.
    _KEY_CONFIRMED_LS: 'sagi_key_confirmed',
    // Bir key'i "gerçekten Firestore'da var olduğu doğrulandı" olarak
    // işaretledikten sonra kısa bir SÜRE (grace period) tanıyoruz.
    //
    // KRİTİK BUG (bulundu): createAccount() → doc'u yazıp await ile
    // ONAY ALDIKTAN SONRA _attachListener(key) çağırıyor. Ama Firestore'un
    // multi-tab IndexedDB persistence'ı ile YENİ takılan bir onSnapshot
    // listener'ın İLK event'i, henüz o an tazelenmemiş yerel cache'ten
    // gelebiliyor ve "doc yok" diyebiliyor — RACE CONDITION, doc aslında
    // saniyenin onda biri önce yazıldı ve gerçekten var. Bizim silinme
    // kontrolümüz bunu görünce anında "silinmiş!" deyip kullanıcıyı YENİ
    // OLUŞTURDUĞU hesaptan atıyordu (test: "yeni anahtar oluşturdum,
    // zaten anında modal düşüyor önüme"). Çözüm: _markKeyConfirmed()
    // çağrıldıktan sonraki birkaç saniye içinde gelen "doc yok" sinyallerini
    // silinme kanıtı SAYMIYORUZ — cache'in yetişmesi için zaman tanıyoruz.
    // Gerçek bir silinme bu pencere kapandıktan hemen sonra zaten bir
    // sonraki pull/onSnapshot event'inde yakalanır, hiçbir şey kaçmaz.
    _GRACE_MS: 6000,
    _graceUntil: 0,
    _markKeyConfirmed(key) {
      try { localStorage.setItem(this._KEY_CONFIRMED_LS, this._docId(key)); } catch (_) {}
      this._graceUntil = Date.now() + this._GRACE_MS;
    },
    _isKeyConfirmed(key) {
      try {
        const saved = localStorage.getItem(this._KEY_CONFIRMED_LS);
        return !!saved && saved === this._docId(key);
      } catch (_) { return false; }
    },
    _inGracePeriod() {
      return Date.now() < this._graceUntil;
    },

    // ── "Silinmiş sayılsın mı?" — asıl karar noktası ──────────────────────
    // SADECE _isKeyConfirmed()'e (tek slotlu, kırılgan bir localStorage
    // bayrağı) güvenmek YETERSİZ çıktı: testte bir key başarıyla
    // oluşturulup Firestore'a yazılmasına rağmen bu bayrak boş (null)
    // kalabiliyor (ör. bayrak farklı bir temizlik işleminde silinmiş,
    // farklı sekme/oturumda set edilmiş, vb.) — sonuç: silinme fark
    // edilmiyor, kullanıcı sessizce ölü key'in üzerine yeni veri yazıp
    // hesabı "diriltiyor". Bunu önlemek için İKİNCİ, DAHA GÜVENİLİR bir
    // sinyal daha ekliyoruz: Core.state.settings.onboarded === true.
    // Onboarding tamamlanmışsa bu cihaz zaten kurulu, gerçek bir hesaba
    // sahip demektir — o an aktif olan syncKey de (bu fonksiyona giren
    // `key` parametresi) ZATEN o gerçek hesabın key'idir. Böyle bir
    // cihazda remote doc'un birden "yok" çıkması, %99 ihtimalle key
    // hiç var olmadı değil — SİLİNDİ demektir. Tek istisna: createAccount()
    // henüz onboarding bitmeden (ör. yeni cihaz kurulumu ortasında)
    // yazma denemesi başarısız olduysa — o durumda onboarded zaten
    // false'tur, bu yüzden yanlış alarm vermez.
    //
    // NOT: _inGracePeriod() kontrolü BURADA DEĞİL, çağıran taraflarda
    // yapılıyor (_pull, push transaction, onSnapshot) — çünkü grace
    // period'da bile "silinmiş mi" sorusunun cevabı teknik olarak aynı
    // kalır, sadece o cevaba göre AKSİYON ALIP ALMAYACAĞIMIZ değişir.
    _isKeyDeletionConfirmed(key) {
      if (this._isKeyConfirmed(key)) return true;
      if (Core.state && Core.state.settings && Core.state.settings.onboarded && Core.state.settings.syncKey === key) {
        return true;
      }
      return false;
    },

    // ── Remote'da key bulunamadı durumu ──────────────────────────────────
    // Firebase'deki doc kaybolmuşsa (deleteAccount, admin silmesi, vb.)
    // OTOMATİK sign-out yapmıyoruz ve key'i sıfırlamıyoruz — çünkü bu durum
    // bir daha o key'e asla otomatik yazılmaması gerektiği anlamına gelir.
    // Kullanıcı ekranda net bir uyarı görüp kendisi "Çıkış Yap" demeli.
    // Bu fonksiyon çağrıldıktan sonra: listener kapanır, hiçbir push/pull
    // denemesi yapılmaz, key localStorage'da AYNEN durur (silinmez) —
    // böylece "Çıkış Yap" butonuna basılana kadar üzerine bir daha
    // otomatik yazma denemesi olmaz.
    _keyNotFoundShown: false,
    _handleRemoteDeleted() {
      this._detachListener();
      if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
      this._emitStatus('idle');
      if (this._keyNotFoundShown) return; // modal zaten açık
      this._keyNotFoundShown = true;
      console.warn('[Cloud] _handleRemoteDeleted tetiklendi — key silinmiş kabul edildi, modal açılıyor.');

      // ── Loader'ı kapat ────────────────────────────────────────────────
      // KRİTİK: Bu, modal açma kodundan AYRI bir try/catch'te olmalı.
      // Önceki sürümde ikisi TEK bir try bloğundaydı — loader'ı kapatan
      // satırlardan biri (herhangi bir sebeple) exception fırlatırsa, aynı
      // try bloğundaki modal açma satırı da HİÇ ÇALIŞMIYORDU ve hata
      // sessizce yutuluyordu (boş catch). Sonuç: loader gider, modal asla
      // açılmaz, kullanıcı boş ve etkileşimsiz bir ekranda kalır. Artık
      // birbirinden bağımsızlar; biri patlasa bile diğeri çalışır.
      try {
        var loaderEl = document.getElementById('appLoader');
        if (loaderEl) {
          // Senkron olarak HEM opacity HEM display:none — fade animasyonuna
          // ve gecikmeli remove()'a güvenmiyoruz; loader anında görsel ve
          // etkileşimsel olarak devre dışı kalsın (z-index 999999 olduğu
          // için opacity:0 bile olsa stacking'de en üstte kalabilir).
          loaderEl.style.pointerEvents = 'none';
          loaderEl.style.opacity = '0';
          loaderEl.style.display = 'none';
          setTimeout(function () {
            try { if (loaderEl.parentNode) loaderEl.remove(); } catch (_) {}
          }, 50);
        }
      } catch (e) {
        console.error('[Cloud] _handleRemoteDeleted: loader kapatma hatası:', e);
      }

      // ── Modalı aç ────────────────────────────────────────────────────
      this._openKeyNotFoundModal(0);
    },

    // UI henüz hazır olmayabilir (script sırası / DOM henüz kurulmamış
    // olabilir) — birkaç kez kısa aralıklarla dener, sessizce vazgeçmez.
    _openKeyNotFoundModal(attempt) {
      try {
        // NOT: window.UI KULLANMA — index.html'de `const UI = {...}` top-level
        // script scope'ta tanımlı, bu yüzden window.UI HER ZAMAN undefined
        // döner (tıpkı daha önce bulunan window.App bugında olduğu gibi:
        // let/const ile tanımlanan top-level değişkenler window nesnesine
        // eklenmez). typeof kontrolü kullanmak zorundayız.
        if (typeof UI !== 'undefined' && UI.Modals && typeof UI.Modals.open === 'function') {
          var el = document.getElementById('modalKeyNotFound');
          if (!el) {
            console.error('[Cloud] modalKeyNotFound elementi DOM\'da bulunamadı!');
            return;
          }
          UI.Modals.open('modalKeyNotFound');
          // Emniyet: .active class'ı gerçekten eklendi mi doğrula.
          setTimeout(function () {
            if (!el.classList.contains('active')) {
              console.error('[Cloud] modalKeyNotFound açılamadı (active class eklenmedi) — zorla ekleniyor.');
              el.classList.add('active');
            }
          }, 50);
          return;
        }
      } catch (e) {
        console.error('[Cloud] _openKeyNotFoundModal hatası:', e);
      }
      if (attempt < 20) { // max ~4sn dener (20 × 200ms)
        var self = this;
        setTimeout(function () { self._openKeyNotFoundModal(attempt + 1); }, 200);
      } else {
        console.error('[Cloud] modalKeyNotFound hiç açılamadı — UI hazır olmadı.');
      }
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
      if (!key || !this.isAvailable()) { this._lastPullDocExists = null; return false; }

      const snap = await this._docRef(key).get();
      // Doc'un GERÇEKTEN var olup olmadığını ayrı işaretliyoruz — bu fonksiyon
      // false döndürebilir hem "doc yok" hem "doc var ama state alanı boş/bozuk"
      // durumunda. Bu ikisi ÇOK FARKLI şeyler: biri "hesap silinmiş", diğeri
      // "hesap var ama veri formatı sorunlu". _boot() bu ikisini karıştırmasın
      // diye net bir sinyal veriyoruz.
      this._lastPullDocExists = snap.exists;
      if (!snap.exists) {
        // KRİTİK FIX: Bu kontrol BURADA, _pull()'un içinde olmalı — sadece
        // _boot()'ta değil. Çünkü _pull() sadece açılışta değil,
        // visibilitychange ('visible' — sekme/uygulama tekrar öne geldiğinde)
        // ve 'online' (internet geri geldiğinde) event'lerinden de SESSİZCE
        // çağrılıyor ve sonucu hiç kontrol edilmiyordu (`.catch(()=>{})` /
        // `.then()`). Kontrol sadece _boot()'ta olduğu için: kullanıcı
        // uygulamayı açık bırakıp başka cihazdan hesabını silerse, bu cihaz
        // sekmeye geri dönüldüğünde veya wifi toparlandığında key'in
        // silindiğini ASLA fark etmiyordu — ta ki kullanıcı bir kayıt/
        // değişiklik yapıp push tetiklenene kadar (push zaten kendi içinde
        // REMOTE_DELETED kontrolü yapıyordu). Kontrolü tek noktada (_pull)
        // merkezileştirip onu çağıran HER yeri (boot, visibilitychange,
        // online, forceSync) otomatik olarak kapsıyoruz.
        if (this._inGracePeriod()) {
          console.warn('[Cloud] _pull: doc yok ama grace period içindeyiz (yeni oluşturuldu/login olundu, cache henüz yetişmemiş olabilir) — modal AÇILMIYOR, bekleniyor. key=' + key);
        } else if (this._isKeyDeletionConfirmed(key)) {
          console.warn('[Cloud] _pull: bu key silinmiş kabul ediliyor (confirmedLS veya onboarded sinyali). key=' + key +
            ' isKeyConfirmedLS=' + this._isKeyConfirmed(key) + ' onboarded=' + !!(Core.state.settings && Core.state.settings.onboarded));
          this._handleRemoteDeleted();
        } else {
          console.warn('[Cloud] _pull: remote doc yok AMA bu key hiç confirm edilmemiş VE onboarded=false (yeni/hiç bağlanılmamış hesap olabilir) — modal AÇILMIYOR. key=' + key);
        }
        return false; // createAccount yapılmamış veya silinmiş
      }

      // Doc gerçekten var — bu key'in geçerliliğini kalıcı olarak işaretle.
      this._markKeyConfirmed(key);

      const data = snap.data() || {};
      const remoteState = data.state;
      if (!remoteState) return false; // Doc var ama state alanı yok — silinmiş DEĞİL

      // Version'ı kaydet — conflict detection için
      _lastSyncedVersion = typeof data.version === 'number' ? data.version : 0;

      // Local ve remote'u merge et
      const merged = _merge(Core.state, remoteState);
      merged.settings.syncKey = key;

      Core.state = merged;
      // KRİTİK FIX: bkz. index.html'deki window._refreshMergeBaseline yorumu.
      // Bu çağrı olmadan, buradan gelen yeni kayıtlar hemen silinirse
      // tombstone üretilmez, silme diğer cihazlara yansımaz.
      if (typeof window._refreshMergeBaseline === 'function') window._refreshMergeBaseline();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      // NOT: clearPendingPush burada YOK — pending flag sadece push başarıyla
      // tamamlandığında silinir. Pull, remote'tan veri alsa bile local'de
      // push edilmemiş değişiklikler olabilir.

      try { Core.emit('stateChanged', Core.state); } catch (e) {}
      try { Core.emit('cloudRemoteUpdate'); } catch (e) {}
      this._rerenderActiveView();

      return true;
    },

    // ══════════════════════════════════════════════════════════════════════
    // PUSH — Local state'i Firestore'a yaz
    //
    // Conflict resolution — tek Firestore Transaction içinde:
    //   1. Doc'u oku.
    //   2. remote.version !== _lastSyncedVersion → başka cihaz yazmış.
    //      Transaction içinde merge yap, merge'li state'i yaz, version++.
    //      (Merge transaction dışına taşınmıyor — convergence garantisi için
    //       merge + write atomik olmalı.)
    //   3. Eşleşiyorsa direkt yaz, version++.
    //
    // Uygulama katmanında max PUSH_MAX_RETRIES kez deniyoruz.
    // ══════════════════════════════════════════════════════════════════════
    async _push(retryCount) {
      const key = Core.state.settings.syncKey;
      if (!key || !this.isAvailable()) return;
      if (_pushInFlight) return;

      retryCount = retryCount || 0;
      if (retryCount >= PUSH_MAX_RETRIES) {
        console.warn('[Cloud] Max retry aşıldı — push iptal.');
        try { Core.DB.markPendingPush(); } catch (_) {}
        try { localStorage.setItem(PENDING_KEY, '1'); } catch (_) {}
        this._emitStatus('error');
        return;
      }

      _pushInFlight = true;
      this._emitStatus('syncing');

      try {
        const db   = window._fbDB;
        const ref  = this._docRef(key);
        const self = this;
        let newVersion = 0;
        let didMerge   = false;

        await db.runTransaction(async function (tx) {
          const snap = await tx.get(ref);

          if (snap.exists) {
            const data      = snap.data() || {};
            const remoteVer = typeof data.version === 'number' ? data.version : 0;

            if (remoteVer !== _lastSyncedVersion) {
              // ── Conflict: başka cihaz yazmış — merge et ve yaz ──────
              console.info('[Cloud] Conflict — transaction içinde merge yapılıyor. remote v' + remoteVer + ' local v' + _lastSyncedVersion);
              const remoteState = data.state || {};
              const merged = _merge(Core.state, remoteState);
              merged.settings.syncKey = key;
              Core.state = merged;
              // KRİTİK FIX: bkz. index.html'deki window._refreshMergeBaseline yorumu.
              if (typeof window._refreshMergeBaseline === 'function') window._refreshMergeBaseline();
              _lastSyncedVersion = remoteVer;
              didMerge = true;
            }

            newVersion = (typeof data.version === 'number' ? data.version : 0) + 1;
          } else {
            // Doc yok.
            // Bu key daha önce Firestore'da var olduğu doğrulanmışsa (createAccount
            // veya başarılı bir pull ile) → Firebase'den SİLİNMİŞ demektir
            // (admin, deleteAccount veya başka cihaz sildi). Silinen key'i
            // yeniden YARATMA — push'u durdur.
            // NOT: _lastSyncedVersion yerine kalıcı _isKeyConfirmed kullanıyoruz —
            // sayfa yenilemesinde _lastSyncedVersion sıfırlanır ama bu kayıt kalır.
            if (!self._inGracePeriod() && self._isKeyDeletionConfirmed(key)) {
              throw new Error('REMOTE_DELETED');
            }
            newVersion = 1;
          }

          const payload = {
            state:        _stateForCloud(Core.state),
            lastModified: Core.state.settings.lastModified || Date.now(),
            version:      newVersion,
          };
          tx.set(ref, payload);
        });

        // ── Transaction başarılı ────────────────────────────────────
        _lastSyncedVersion = newVersion;
        _lastPushedVersion = newVersion;
        Core.DB.clearPendingPush();
        try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
        this.lastError = '';

        // Merge olduysa localStorage'ı güncelle ve UI'ı yenile
        if (didMerge) {
          localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
          try { Core.emit('stateChanged', Core.state); } catch (e) {}
          try { Core.emit('cloudRemoteUpdate'); } catch (e) {}
          self._rerenderActiveView();
        }

        this._emitStatus('ok');

      } catch (e) {
        console.warn('[Cloud] push hatası:', e);
        this.lastError = e.message || '';

        if (e && e.message === 'REMOTE_DELETED') {
          // Firebase'deki key silinmiş — bir daha bu key'e otomatik yazma
          // denemesi yapma. Key'i sıfırlamıyoruz; kullanıcı zorunlu uyarı
          // modalından kendisi "Çıkış Yap" demeli.
          console.warn('[Cloud] Remote doc silindi.');
          this._handleRemoteDeleted();
          try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
          try { Core.DB.clearPendingPush(); } catch (_) {}
          return;
        }

        // Firestore transaction'ı kendi retry'ını yapar (ABORTED, UNAVAILABLE).
        // Biz sadece ağ hatalarında pending bırakıp çıkıyoruz.
        try { localStorage.setItem(PENDING_KEY, '1'); } catch (_) {}
        try { Core.DB.markPendingPush(); } catch (_) {}
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
          if (!snap.exists) {
            // Doc yok — üç senaryo:
            // a) İlk kez listener bağlandı, bu key hiç confirm edilmemiş → normal
            // b) Bu key daha önce Firestore'da var olduğu doğrulanmıştı
            //    (createAccount veya başarılı pull ile) → şimdi doc yok →
            //    hesap silinmiş demektir.
            // c) GRACE PERIOD: az önce createAccount/login ile confirm edildi —
            //    bu onSnapshot'ın İLK event'i cache henüz yetişmediği için
            //    yanlışlıkla "yok" diyor olabilir (bulunan gerçek bug buydu:
            //    yeni hesap oluşturunca anında kendi kendini "silinmiş" sayıp
            //    kullanıcıyı yeni oluşturduğu hesaptan atıyordu). Bu durumda
            //    sessizce yok say, birazdan gelecek doğru event'i bekle.
            if (self._inGracePeriod()) {
              console.warn('[Cloud] onSnapshot: doc yok ama grace period içindeyiz (muhtemelen cache race) — modal AÇILMIYOR. key=' + key);
            } else if (self._isKeyDeletionConfirmed(key)) {
              console.warn('[Cloud] onSnapshot: bu key silinmiş kabul ediliyor (confirmedLS veya onboarded sinyali). key=' + key);
              self._handleRemoteDeleted();
            }
            return;
          }

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

          // Aynı version — offline cache'den gelen yansıma, skip
          if (remoteVer > 0 && remoteVer === _lastSyncedVersion) return;

          // Başka cihazdan gelen gerçek update
          _lastSyncedVersion = remoteVer;

          const merged = _merge(Core.state, remoteState);
          merged.settings.syncKey = Core.state.settings.syncKey;

          Core.state = merged;
          // KRİTİK FIX: bkz. index.html'deki window._refreshMergeBaseline yorumu.
          if (typeof window._refreshMergeBaseline === 'function') window._refreshMergeBaseline();
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
        const pullResult = await this._pull();

        // pull false döndü → iki AYRI durum olabilir, ayırt etmemiz lazım:
        // a) this._lastPullDocExists === false → doc GERÇEKTEN yok (silinmiş
        //    ya da hiç yazılmamış).
        // b) this._lastPullDocExists === true  → doc VAR ama içindeki state
        //    alanı boş/bozuk — bu SİLİNME değil, farklı bir sorun. Bu durumda
        //    key-not-found uyarısı YANLIŞ olur (geçerli bir hesaba "silinmiş"
        //    denip kullanıcı gereksiz yere çıkışa zorlanır).
        // NOT: Silinme kontrolü artık _pull()'un içinde merkezi olarak
        // yapılıyor (bkz. _pull), _handleRemoteDeleted() zaten çağrılmış
        // ve loader kapatılmış olur. Bu blok sadece _keyNotFoundShown
        // set edildiyse fonksiyondan erken çıkmak için bir emniyet katmanı.
        if (!pullResult && this._lastPullDocExists === false && this._keyNotFoundShown) {
          return;
        }

        // Pending (offline iken birikmiş) push varsa gönder — her iki key kontrol
        var _bootHasPending = !!(localStorage.getItem(PENDING_KEY) ||
          (Core.DB && Core.DB.hasPendingPush && Core.DB.hasPendingPush()));
        if (_bootHasPending) {
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

    // Promise-tabanlı bekleme — App.init() bunu await edebilir.
    // isAvailable() asenkron olarak true olur (Firestore persistence ayarı
    // resolve olunca); App.init() loading ekranındayken bu resolve olmadan
    // key kontrolüne geçmemeli, yoksa kontrol tamamen atlanıp dashboard
    // key silinmiş olsa bile render edilir. maxWaitMs dolarsa false ile
    // resolve olur (gerçekten offline/engelliyse sonsuza kadar beklemeyiz).
    _awaitAvailable(maxWaitMs) {
      var self = this;
      if (this.isAvailable()) return Promise.resolve(true);
      return new Promise(function (resolve) {
        var waited = 0;
        var step = 50;
        (function poll() {
          if (self.isAvailable()) { resolve(true); return; }
          waited += step;
          if (waited >= maxWaitMs) { resolve(false); return; }
          setTimeout(poll, step);
        })();
      });
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
    // Kolon listesi tek yerde tanımlı — hem burada hem preview modalının
    // kategori etiketleme kısmında (index.html) AYNI liste kullanılmalı.
    _SYNC_COLS: ['wallets','transactions','recurring','goals','debts','categories','budgets'],
    _localBreakdown() {
      const details = {};
      let total = 0;
      this._SYNC_COLS.forEach(function (col) {
        const n = (Core.state[col] || []).length;
        if (n) details[col] = { newFromRemote: 0, newFromLocal: n };
        total += n;
      });
      return { details, total };
    },
    async analyzeSync() {
      if (!this.isAvailable() || !Core.state.settings.syncKey) {
        return { status: 'unavailable' };
      }
      try {
        const snap = await this._docRef().get();
        if (!snap.exists) {
          // Bulutta doc hiç yok — UI'nin "şu veriler buluta gönderilecek"
          // önizlemesini gösterebilmesi için yerel veri dökümünü de
          // hesaplayıp dönüyoruz (diff durumuyla AYNI şekil: details +
          // totalNewFromRemote/totalNewFromLocal).
          const lb = this._localBreakdown();
          return { status: 'no-remote', totalNewFromRemote: 0, totalNewFromLocal: lb.total, details: lb.details };
        }

        const data = snap.data() || {};
        const remoteState = data.state;
        if (!remoteState) {
          const lb = this._localBreakdown();
          return { status: 'no-remote', totalNewFromRemote: 0, totalNewFromLocal: lb.total, details: lb.details };
        }

        const COLS = this._SYNC_COLS;
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

      // Güvenlik notu: createAccount, Core.state'in o anki içeriğini yeni key'e
      // yazar. Eğer local'de anlamlı veri varsa (örn. önceki signOut'tan kalan),
      // bu veri otomatik olarak yeni hesaba taşınmış olur. UI katmanı
      // (cloudCreate) bunu kullanıcıya sormalı — burası sadece görünürlük için log basar.
      if (this.hasMeaningfulLocalData && this.hasMeaningfulLocalData()) {
        console.warn('[Cloud] createAccount: local state\'te veri var, yeni hesaba taşınacak. UI katmanı kullanıcıya sormuş olmalı.');
      }

      // Plus kimlik bilgilerini HER ZAMAN sıfırla — yeni hesap Plus'sız başlar.
      // Eski bir Plus key'den çıkıp yeni hesap oluşturulsa bile, önceki hesabın
      // Plus rengi/fontu/planı yeni hesaba sızmamalı.
      Core.state.settings.plusPlan          = '';
      Core.state.settings.plusFont          = '';
      Core.state.settings.plusColor         = '';
      Core.state.settings.plusCustomColors  = [];
      Core.state.settings.plusKey           = '';
      Core.state.settings.chatTrialStart    = '';
      Core.state.settings.plusStatus        = '';
      Core.state.settings.plusExpiresAt     = null;
      Core.state.settings.plusCancelledAt   = '';
      Core.state.settings.plusProvider      = '';
      Core.state.settings.plusPurchaseToken = '';
      // KRİTİK FIX: Aynı prensip kişiselleştirme/kimlik alanları için de
      // geçerli olmalı — yeni key oluşturmak, 0'dan giriş yapmakla AYNI
      // hesaba gelmeli. Önceden sadece Plus alanları sıfırlanıyordu; isim,
      // tema (koyu/açık mod) ve sohbet geçmişi eski hesaptan sızmaya devam
      // ediyordu (özellikle signOut() sonrası, ki o local veriyi kasıtlı
      // olarak bırakır — bkz. Settings.handleKeyNotFoundSignOut yorumu).
      Core.state.settings.name  = '';
      Core.state.settings.theme = 'light';
      // CSS görsel sıfırla
      try {
        const el = document.documentElement;
        el.style.removeProperty('--brand-accent');
        el.style.removeProperty('--brand-accent-light');
        el.style.removeProperty('--brand-accent-subtle');
        el.style.removeProperty('--brand-accent-soft');
        el.style.removeProperty('--brand-accent-medium');
        el.style.removeProperty('--font-display');
        el.style.removeProperty('--font-sans');
        document.body.style.fontFamily = '';
      } catch(e) {}
      // localStorage'dan Plus + sohbet key'lerini temizle (sohbet geçmişi ve
      // deneme süresi cache'i "sagi_chat_*" — yeni hesaba asla taşınmamalı)
      try {
        ['sagi_plus_font','sagi_plus_color','sagi_plus_custom_colors','sagi_chat_trial_start','sagi_chat_messages'].forEach(k => {
          try { localStorage.removeItem(k); } catch(_) {}
        });
      } catch(e) {}

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
        this._markKeyConfirmed(key);
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
    // mode:
    //   'merge'   (varsayılan) — local ve remote'u birleştirir. Onboarding'de
    //             (local zaten boş/yeni kurulum) güvenli davranış budur.
    //   'replace' — remote veriyi OLDUĞU GİBİ alır, local'i merge etmeden
    //             üzerine yazar. "Mevcut bir hesaba bağlan" senaryosunda
    //             kullanıcı zaten dolu bir local state'ten geliyorsa ve
    //             hedef hesabın verisini istiyorsa kullanılır — boş/farklı
    //             bir hesaba kendi local verisinin sessizce sızmasını önler.
    async loginWithKey(rawKey, mode) {
      mode = mode || 'merge';
      const key = this.normalizeKey(rawKey);
      if (!this.isValidKey(key))   throw new Error('INVALID_KEY');
      if (!this.isAvailable())     throw new Error('CLOUD_UNAVAILABLE');

      const fwd = await this._resolvePlusKey(key);
      if (fwd && fwd !== key) return this.loginWithKey(fwd, mode);

      const exists = await this._docExists(key);
      if (!exists) throw new Error('NOT_FOUND');

      if (mode === 'replace') {
        // Remote state'i doğrudan al, local'i merge etmeden değiştir.
        const snap = await this._docRef(key).get();
        const data = snap.data() || {};
        const remoteState = data.state || {};
        _lastSyncedVersion = typeof data.version === 'number' ? data.version : 0;
        _lastPushedVersion = -1;
        this._markKeyConfirmed(key);

        const fresh = JSON.parse(JSON.stringify(remoteState));
        fresh.settings = fresh.settings || {};
        fresh.settings.syncKey = key;
        // Kullanıcının yerel tema/dil tercihini koru (cloud'da olmayabilir)
        fresh.settings.theme = fresh.settings.theme || Core.state.settings.theme;
        fresh.settings.lang  = fresh.settings.lang  || Core.state.settings.lang;

        Core.state = fresh;
        // KRİTİK FIX: bkz. index.html'deki window._refreshMergeBaseline yorumu.
        // Burada "merge" değil tam bir REPLACE var ama sonuç aynı: Core.state
        // dışarıdan değişti, taban çizgisi (_prevIdSets) buna göre tazelenmezse
        // sonraki bir silme işlemi tombstone'suz kalır.
        if (typeof window._refreshMergeBaseline === 'function') window._refreshMergeBaseline();
        localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
        Core.DB.clearPendingPush();

        this._attachListener(key);
        try { Core.emit('stateChanged', Core.state); } catch (e) {}
        try { Core.emit('cloudRemoteUpdate'); } catch (e) {}
        this._emitStatus('ok');
        return Core.state;
      }

      // mode === 'merge' (eski/varsayılan davranış)
      //
      // KRİTİK FIX: Bu cihazda ÖNCEKİ bir hesaptan kalma yerel chatTrialStart
      // (ör. daha önce bu cihazda kullanılmış BAŞKA bir key'in deneme
      // damgası) burada temizlenmezse, mergeState()'teki "chatTrialStart:
      // hangi taraf varsa o kazanır" kuralı bu eski/bitmiş damgayı, şimdi
      // giriş yapılan (ve belki de hiç deneme başlatmamış) hesaba taşırdı.
      // Sonuç: "yeni/başka key'e giriş yaptım, sohbete girer girmez deneme
      // süresi dolmuş" görünürdü. Aynı sızıntı isim ve sohbet geçmişi için
      // de geçerli — bu alanları temizleyip asıl kaynağı (remote pull/merge)
      // belirleyici kılıyoruz.
      delete Core.state.settings.chatTrialStart;
      Core.state.settings.name = '';
      try {
        localStorage.removeItem('sagi_chat_trial_start');
        localStorage.removeItem('sagi_chat_messages');
      } catch(e) {}

      Core.state.settings.syncKey = key;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      await this._boot();
      return Core.state;
    },

    // ══════════════════════════════════════════════════════════════════════
    // PLUS SATIN ALMA — upgrade / cancel / restore
    // syncKey'in PLUS- prefix'i KALICIDIR, asla değiştirilmez (doc ID key'den
    // türetiliyor — prefix değişirse kullanıcı farklı bir Firestore dokümanına
    // düşer ve verisi "kaybolmuş" görünür). Gerçek erişim plusStatus/
    // plusExpiresAt alanlarıyla kontrol edilir.
    // ══════════════════════════════════════════════════════════════════════

    // purchaseInfo: { purchaseToken, provider ('google_play'), plan ('monthly'|'yearly'|'lifetime'), expiresAt (ms epoch|null — lifetime için null) }
    // Worker tarafında purchaseToken DOĞRULANDIKTAN SONRA çağrılmalı.
    async upgradeToPlus(purchaseInfo) {
      if (!this.isAvailable()) throw new Error('CLOUD_UNAVAILABLE');
      const currentKey = Core.state.settings.syncKey;
      if (!currentKey) throw new Error('NO_SYNC_KEY');

      const alreadyPlusKey = currentKey.startsWith('PLUS-');
      const plusKey = alreadyPlusKey ? currentKey : ('PLUS-' + currentKey.replace(/^PLUS-/, ''));

      Core.state.settings.plusStatus        = 'active';
      Core.state.settings.plusExpiresAt     = purchaseInfo.expiresAt || null; // lifetime = null
      Core.state.settings.plusCancelledAt   = '';
      Core.state.settings.plusProvider      = purchaseInfo.provider || 'google_play';
      Core.state.settings.plusPurchaseToken = purchaseInfo.purchaseToken || '';
      Core.state.settings.plusPlan          = purchaseInfo.plan || 'lifetime';
      Core.state.settings.lastModified      = Date.now();

      if (alreadyPlusKey) {
        // Zaten PLUS- key'deyiz (yeniden abone olma / restore) — sadece push et.
        localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
        await this._docRef(plusKey).set({
          state:        _stateForCloud(Core.state),
          lastModified: Core.state.settings.lastModified,
          version:      firebase.firestore.FieldValue.increment(1),
        }, { merge: true });
        this._emitStatus('ok');
        try { Core.emit('stateChanged', Core.state); } catch (e) {}
        return plusKey;
      }

      // İlk kez Plus'a geçiliyor: finansal veriyi PLUS-{key} dokümanına kopyala,
      // plain dokümanda forwardKey bırak (böylece _resolvePlusKey eski
      // cihaz/sekmeleri otomatik olarak PLUS-key'e yönlendirir).
      Core.state.settings.syncKey = plusKey;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      const payload = {
        state:        _stateForCloud(Core.state),
        lastModified: Core.state.settings.lastModified,
        version:      1,
        createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      };

      try {
        await this._docRef(plusKey).set(payload);
      } catch (e) {
        console.error('[Cloud] upgradeToPlus yazma hatası:', e);
        this.lastError = e.message || 'write-failed';
        this._emitStatus('error');
        throw e;
      }

      try {
        await this._docRef(currentKey).set({ forwardKey: plusKey }, { merge: true });
      } catch (e) {
        console.warn('[Cloud] upgradeToPlus: forwardKey yazılamadı (kritik değil):', e);
      }

      _lastSyncedVersion = 1;
      _lastPushedVersion = 1;
      this._markKeyConfirmed(plusKey);
      this._attachListener(plusKey);
      this._emitStatus('ok');
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
      return plusKey;
    },

    // ── Gerçek satın alma akışı bunu kullanır ─────────────────────────────
    // Worker'ın /verify-purchase endpoint'i purchaseToken'ı Play API'ye
    // doğrulattıktan SONRA Firestore'a authoritative veriyi zaten yazdı.
    // Client'ın işi: syncKey'i plusKey'e çevirip cloud'dan TAZE veriyi çekmek.
    // (upgradeToPlus() client-side yazan eski/manuel yol — worker akışı
    // kurulduktan sonra sadece dev/test fallback'i olarak kalır.)
    async applyVerifiedPlusKey(plusKey) {
      if (!this.isValidKey(plusKey)) throw new Error('INVALID_KEY');
      Core.state.settings.syncKey = plusKey;
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
      if (this.isAvailable()) {
        await this.loginWithKey(plusKey, 'replace');
      }
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
      return Core.state;
    },

    // ── COPF: Cancellation of Plus Features ──────────────────────────────
    // Anında erişimi KESMEZ — plusExpiresAt'e kadar Plus özellikleri çalışmaya
    // devam eder (standart abonelik iptali UX'i). syncKey DEĞİŞMEZ.
    async cancelPlus() {
      if (!(typeof App !== 'undefined' && App.Plus && App.Plus.isPlusUser())) {
        throw new Error('NOT_PLUS_USER');
      }
      const s = Core.state.settings;

      s.plusStatus      = 'cancelled';
      s.plusCancelledAt = Date.now();
      s.lastModified     = Date.now();
      localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));

      if (this.isAvailable() && s.syncKey) {
        try {
          await this._docRef(s.syncKey).set({
            state:        _stateForCloud(Core.state),
            lastModified: s.lastModified,
            version:      firebase.firestore.FieldValue.increment(1),
          }, { merge: true });
        } catch (e) {
          console.warn('[Cloud] cancelPlus: push hatası (local zaten güncellendi):', e);
        }
      }
      try { Core.emit('stateChanged', Core.state); } catch (e) {}
      return true;
    },

    // ── Restore Purchases (iskelet) ───────────────────────────────────────
    // Google Play Billing / Digital Goods API'den purchase geçmişini okuyup
    // purchaseToken'ı worker'a gönderip doğrulatarak upgradeToPlus() çağıracak.
    // Billing entegrasyonu (ayrı iş) kodlanınca burası doldurulacak.
    async restorePurchases() {
      throw new Error('NOT_IMPLEMENTED');
    },

    // Local state'te kullanıcı için anlamlı sayılacak veri var mı?
    // "replace" uyarısı gösterip göstermeyeceğimize karar vermek için kullanılır.
    hasMeaningfulLocalData() {
      const s = Core.state;
      if (!s) return false;
      const arrays = ['wallets','transactions','goals','debts','categories','budgets','recurring'];
      return arrays.some(k => Array.isArray(s[k]) && s[k].length > 0);
    },

    // Bağlanılmak istenen key'in (henüz giriş yapılmadan) cloud'daki verisi
    // anlamlı bir şey içeriyor mu? "İki hesapta da veri var" uyarısı için kullanılır.
    async hasMeaningfulRemoteData(rawKey) {
      try {
        const key = this.normalizeKey(rawKey);
        if (!this.isValidKey(key) || !this.isAvailable()) return false;
        const snap = await this._docRef(key).get();
        if (!snap.exists) return false;
        const data = snap.data() || {};
        const remoteState = data.state || {};
        const arrays = ['wallets','transactions','goals','debts','categories','budgets','recurring'];
        return arrays.some(k => Array.isArray(remoteState[k]) && remoteState[k].length > 0);
      } catch (e) {
        return false;
      }
    },

    // ── signOut ───────────────────────────────────────────────────────────
    signOut() {
      this._detachListener();
      if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
      _lastSyncedVersion = 0;
      _lastPushedVersion = -1;
      this._keyNotFoundShown = false; // sonraki bir key için modal tekrar açılabilsin

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
      // KRİTİK FIX: bkz. index.html'deki window._refreshMergeBaseline yorumu.
      if (typeof window._refreshMergeBaseline === 'function') window._refreshMergeBaseline();
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
      // Bekleyen timer varsa debounce'u iptal et ve hemen push yap
      if (_pushTimer) {
        clearTimeout(_pushTimer);
        _pushTimer = null;
        Cloud._push();
      }
      // Push devam ediyorsa veya timer vardıysa failsafe pending flag yaz.
      // Sayfa kapanırsa bir sonraki açılışta retry yapılır.
      if (_pushTimer || _pushInFlight) {
        try { localStorage.setItem(PENDING_KEY, '1'); } catch (_) {}
        try { Core.DB.markPendingPush(); } catch (_) {}
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
  //
  // KRİTİK: window.__sagiForceLocalWipe kontrolü BURADA olmak zorunda.
  // Bulunan bug: handleKeyNotFoundSignOut() localStorage'daki sagi_v1_data'yı
  // silip location.reload() çağırıyordu — ama bu handler, reload'un
  // tetiklediği unload sürecinde araya girip hafızadaki (hâlâ eski
  // onboarded:true değerini taşıyan) Core.state'i AYNEN GERİ YAZIYORDU.
  // Sonuç: wipe localStorage'da doğrulanmış şekilde başarılıydı ama
  // reload tamamlanmadan saniyenin küçük bir kısmında sessizce geri
  // alınıyordu — kullanıcı "Çıkış Yap"a basınca hâlâ dashboard'a
  // düşüyordu. Bilinçli bir yerel wipe sırasında bu handler'ın araya
  // girmemesi için bayrak kontrolü ekliyoruz.
  window.addEventListener('pagehide', function () {
    if (window.__sagiForceLocalWipe) return;
    if (!Core || !Core.state || !Core.DB) return;
    localStorage.setItem(Core.DB.key, JSON.stringify(Core.state));
    // Sadece bekleyen push varsa flag'i set et
    if (Core.state.settings.syncKey && (_pushTimer || (Core.DB.hasPendingPush && Core.DB.hasPendingPush()))) {
      try { localStorage.setItem(PENDING_KEY, '1'); } catch (_) {}
      if (Core.DB.markPendingPush) Core.DB.markPendingPush();
    }
  });

  // ── Online: pending push varsa gönder, listener'ı yeniden bağla ──────
  window.addEventListener('online', function () {
    if (!Core.state.settings.syncKey || !Cloud.isAvailable()) return;
    console.log('[Cloud] Online — pending flush başlıyor.');

    // Listener kopmuşsa yeniden bağla
    if (!_unsub) Cloud._attachListener(Core.state.settings.syncKey);

    // Taze pull + pending push (her iki key kontrol edilir)
    var _hasPending = !!(localStorage.getItem(PENDING_KEY) || (Core.DB && Core.DB.hasPendingPush && Core.DB.hasPendingPush()));
    Cloud._pull()
      .then(function () {
        if (_hasPending) {
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