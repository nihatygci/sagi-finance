(function () {
  'use strict';

  const firebaseConfig = {
    apiKey:            "AIzaSyCh-OTrLLOgovQWGgWH4FkmkHxKrcC3Py0",
    authDomain:        "sagi-finance.firebaseapp.com",
    projectId:         "sagi-finance",
    storageBucket:     "sagi-finance.firebasestorage.app",
    messagingSenderId: "757118584754",
    appId:             "1:757118584754:web:908cec1e596490478d86ab",
    measurementId:     "G-126D10KFSK"
  };

  window._fbReady = false;
  window._fbDB    = null;
  window._fbErr   = '';

  if (typeof firebase === 'undefined') {
    console.warn('[SAGI] Firebase SDK yüklenmedi — uygulama yalnızca offline çalışacak.');
    window._fbErr = 'sdk-missing';
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);

    // ── App Check (reCAPTCHA Enterprise) ────────────────────────────────────
    // GÜVENLİK: App Check, Firestore'a gelen isteklerin gerçekten bu
    // uygulamadan geldiğini doğrulayan bir katman ekliyor. initializeApp'ten
    // HEMEN SONRA, firebase.firestore() çağrılmadan ÖNCE etkinleştirilmeli.
    //
    // ÖNEMLİ: Bu sadece App Check token'larının İSTEKLERE eklenmesini sağlar.
    // Firestore'un bu token'ları ZORUNLU tutup tutmayacağı (Enforce modu)
    // AYRI bir ayar — Firebase Console → App Check → APIs → Firestore'da
    // elle değiştirilir. Bu kod tek başına hiçbir mevcut kullanıcıyı
    // etkilemez/kilitlemez; sadece token göndermeye başlar (Monitor modunda).
    // Enforce moduna geçiş, App Check'in birkaç gün "Monitor"da sorunsuz
    // çalıştığı doğrulandıktan SONRA, ayrı bir adımda yapılmalı.
    try {
      if (typeof firebase.appCheck === 'function') {
        firebase.appCheck().activate(
          new firebase.appCheck.ReCaptchaEnterpriseProvider('6Lfo68gtAAAAADdgXKKj5H-aEgVf1wh1PSjVvG8I'),
          true // isTokenAutoRefreshEnabled
        );
        console.log('[SAGI] App Check etkinleştirildi (Monitor modu).');
      } else {
        console.warn('[SAGI] App Check SDK yüklenmedi, atlanıyor.');
      }
    } catch (appCheckErr) {
      // App Check başarısız olsa bile uygulamanın geri kalanı normal çalışmaya
      // devam etmeli — bu opsiyonel bir güvenlik katmanı, tek nokta arızası
      // olmamalı.
      console.warn('[SAGI] App Check başlatma hatası (uygulama normal devam ediyor):', appCheckErr);
    }

    // ── Yeni Firestore persistence API ───────────────────────────────────────
    // enablePersistence() → deprecated (Firebase 10.x uyarısı)
    // Yeni yol: initializeFirestore() + experimentalForceLongPolling veya
    // cache ayarı. Compat SDK'da (firebase/compat) doğrudan cache ayarı
    // settings() üzerinden yapılıyor.
    //
    // Compat SDK (CDN firebase-app-compat + firestore-compat) kullanıyoruz;
    // bu durumda enableMultiTabIndexedDbPersistence yerine settings() +
    // experimentalAutoDetectLongPolling yapıyoruz, persistence'ı
    // enablePersistence() ile ama synchronizeTabs:true ile veriyoruz.
    // Deprecation uyarısını almamak için SDK'yı modüler API'ye geçirmek
    // gerekir — ama bu CDN compat yapısını bozar.
    //
    // ÇÖZÜM: Firebase SDK versiyonunu 9.x modüler'e yükseltmek yerine
    // mevcut compat SDK'da uyarıyı bastırıyoruz (production'da console.warn
    // zaten kullanıcıya görünmüyor) ve settings() üzerinden cache'i
    // yapılandırıyoruz.
    //
    // Eğer ileride modüler SDK'ya geçilirse:
    //   import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
    //   const db = initializeFirestore(app, {
    //     localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    //   });

    const db = firebase.firestore();

    // settings() persistence'tan ÖNCE çağrılmalı
    db.settings({ experimentalAutoDetectLongPolling: true, merge: true });

    // _fbDB'yi hemen ata — persistence bitmeden önce de Firestore kullanılabilir
    window._fbDB = db;

    db.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        if (err.code === 'failed-precondition') {
          console.info('[SAGI] Persistence: çoklu sekme aktif, tek sekme modu.');
        } else if (err.code === 'unimplemented') {
          console.info('[SAGI] Tarayıcı offline persistence desteklemiyor.');
        } else {
          console.warn('[SAGI] Persistence hatası:', err);
        }
      })
      .finally(() => {
        window._fbReady = true;
        console.log('[SAGI] Firebase Firestore hazır.');

        // Cloud modülü DOMContentLoaded'da _fbReady=false gördüyse
        // şimdi listener'ı bağla (race condition düzeltmesi)
        setTimeout(function () {
          if (window.Core && window.Core.Cloud) {
            window.Core.Cloud.status = 'idle';
            if (
              Core.state &&
              Core.state.settings &&
              Core.state.settings.syncKey &&
              !window.Core.Cloud._unsubscribe
            ) {
              console.log('[SAGI] Firebase geç hazır oldu, listener şimdi bağlanıyor.');
              window.Core.Cloud.attachListener();
            }
            try { window.Core.emit('cloudStatusChanged', 'idle'); } catch (e) {}
          }
        }, 0); // setTimeout 0 — micro-task queue bittikten hemen sonra
      });

    console.log('[SAGI] Firebase Firestore başlatıldı.');
  } catch (e) {
    console.warn('[SAGI] Firebase başlatma hatası:', e);
    window._fbErr   = (e && e.message) || 'init-failed';
    window._fbDB    = null;
    window._fbReady = false;
  }
})();