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
        window._fbReady = true;
        console.log('[SAGI] Firebase Firestore hazır.');
        // App.init'in setTimeout zinciri tamamlandıktan sonra emit et
        // ve syncKey varsa listener'ı bağla (race condition düzeltmesi)
        setTimeout(function() {
          if (window.Core && window.Core.Cloud) {
            window.Core.Cloud.status = 'idle';
            // syncKey var ama listener henüz bağlanamamışsa şimdi bağla
            if (Core.state && Core.state.settings && Core.state.settings.syncKey
                && !window.Core.Cloud._unsubscribe) {
              console.log('[SAGI] Firebase geç hazır oldu, listener şimdi bağlanıyor.');
              window.Core.Cloud.attachListener();
            }
            try { window.Core.emit('cloudStatusChanged', window.Core.Cloud.status); } catch(e) {}
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