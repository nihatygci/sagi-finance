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

    // App Check (reCAPTCHA Enterprise) — Monitor modu.
    // reCAPTCHA provider kendi div'ini document.body'ye ekler; bu script
    // <head>'de çalıştığı için body hazır olana kadar bekliyoruz.
    function startAppCheck() {
      try {
        if (typeof firebase.appCheck === 'function') {
          firebase.appCheck().activate(
            new firebase.appCheck.ReCaptchaEnterpriseProvider('6Lfo68gtAAAAADdgXKKj5H-aEgVf1wh1PSjVvG8I'),
            true
          );
          console.log('[SAGI] App Check etkinleştirildi (Monitor modu).');
        } else {
          console.warn('[SAGI] App Check SDK yüklenmedi, atlanıyor.');
        }
      } catch (appCheckErr) {
        console.warn('[SAGI] App Check başlatma hatası (uygulama normal devam ediyor):', appCheckErr);
      }
    }

    if (document.body) {
      startAppCheck();
    } else {
      document.addEventListener('DOMContentLoaded', startAppCheck, { once: true });
    }

    const db = firebase.firestore();

    db.settings({ experimentalAutoDetectLongPolling: true, merge: true });

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
        }, 0);
      });

    console.log('[SAGI] Firebase Firestore başlatıldı.');
  } catch (e) {
    console.warn('[SAGI] Firebase başlatma hatası:', e);
    window._fbErr   = (e && e.message) || 'init-failed';
    window._fbDB    = null;
    window._fbReady = false;
  }
})();