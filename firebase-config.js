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
    const db = firebase.firestore();

    // _fbDB'yi hemen ata — persistence bitmeden önce de Firestore kullanılabilir.
    // _fbReady'i ise persistence promise'i settle olduktan sonra set ediyoruz;
    // böylece Cloud modülü Firestore tam hazırken devreye giriyor.
    window._fbDB = db;

    // synchronizeTabs:true → çoklu sekme desteği
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
        // Persistence başarılı da olsa başarısız da olsa Firestore çalışır;
        // _fbReady'i burada true yapıyoruz ki Cloud modülü zamanlamayı kaçırmasın.
        window._fbReady = true;
        console.log('[SAGI] Firebase Firestore hazır.');
        // App.init'in setTimeout zinciri (200ms+400ms=~600ms) listener'ı kayıt eder.
        // Firebase persistence genellikle bundan önce biter; 700ms geciktiriyoruz
        // ki cloudStatusChanged listener'ı kesinlikle kayıtlı olsun.
        setTimeout(function() {
          if (window.Core && window.Core.Cloud) {
            window.Core.Cloud.status = 'idle';
            try { window.Core.emit('cloudStatusChanged', 'idle'); } catch(e) {}
          }
        }, 700);
      });

    console.log('[SAGI] Firebase Firestore başlatıldı (persistence bekleniyor).');
  } catch (e) {
    console.warn('[SAGI] Firebase başlatma hatası:', e);
    window._fbErr   = (e && e.message) || 'init-failed';
    window._fbDB    = null;
    window._fbReady = false;
  }
})();