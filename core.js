// ════════════════════════════════════════════════════════════════
//  SAGI Finance — CORE
// ────────────────────────────────────────────────────────────────
// Uygulamanın temel state yönetimi ve event sistemi
// ════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // localStorage anahtarı
  const DB_KEY = 'sagi-state';

  // Varsayılan state
  const DEFAULT_STATE = {
    settings: {
      syncKey: '',
      lastModified: Date.now(),
      notifications: {
        abonelik: false,
        borc: false,
        butce: false,
        haftalik: false
      },
      // ── Yasal onay kaydı ─────────────────────────────────────────────
      // consentDate    : ISO timestamp — kullanıcının onay verdiği an
      // consentVersion : Kabul edilen politika sürümü (privacy.html/terms.html sürümü)
      // consentLang    : Onay sırasında hangi dilde gösterildi
      consentDate: null,
      consentVersion: null,
      consentLang: null,
    },
    wallets: [],
    transactions: [],
    recurring: [],
    goals: [],
    debts: [],
    categories: [],
    notifInbox: [],
    paidMonths: {}
  };

  // State'i localStorage'dan yükle
  function loadState() {
    try {
      const saved = localStorage.getItem(DB_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Object.assign({}, DEFAULT_STATE, parsed, {
          settings: Object.assign({}, DEFAULT_STATE.settings, parsed.settings || {}),
          notifInbox: Array.isArray(parsed.notifInbox) ? parsed.notifInbox : []
        });
      }
    } catch(e) {
      console.warn('[Core] State yüklenemedi:', e);
    }
    // Yeni cihaz — lastModified 0 yap ki cloud'dan pull yapılsın
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    fresh.settings.lastModified = 0;
    return fresh;
  }

  // State'i localStorage'a kaydet
  function saveState() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(Core.state));
    } catch(e) {
      console.warn('[Core] State kaydedilemedi:', e);
    }
  }

  // Event sistemi
  const listeners = {};

  function emit(eventName, data) {
    if (!listeners[eventName]) return;
    listeners[eventName].forEach(fn => {
      try { fn(data); } catch(e) { console.warn(`[Core] Event hatası (${eventName}):`, e); }
    });
  }

  function on(eventName, fn) {
    if (!listeners[eventName]) listeners[eventName] = [];
    listeners[eventName].push(fn);
  }

  function off(eventName, fn) {
    if (!listeners[eventName]) return;
    listeners[eventName] = listeners[eventName].filter(f => f !== fn);
  }

  // Core nesnesini oluştur
  window.Core = {
    state: loadState(),

    DB: {
      key: DB_KEY,
      save: function() {
        saveState();
        if (Core.Cloud && Core.Cloud.isAvailable && Core.Cloud.isAvailable()) {
          Core.Cloud.queuePush();
        }
      },
      saveNow: function() {
        saveState();
        if (Core.Cloud && Core.Cloud.isAvailable && Core.Cloud.isAvailable()) {
          Core.Cloud.queuePush(true);
        }
      }
    },

    // Event sistemi
    emit: emit,
    on: on,
    off: off,

    // State'i kaydet (Cloud modülü bunu kullanacak)
    save: function() {
      Core.state.settings.lastModified = Date.now();
      saveState();
      emit('stateChanged', Core.state);
    },

    // Cloud modülü buraya enjekte edilecek
    Cloud: null
  };

  console.log('[SAGI] Core başlatıldı. State:', Core.state.settings.syncKey ? 'senkronize' : 'yeni');
})();