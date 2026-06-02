// ════════════════════════════════════════════════════════════════
//  SAGI Finance — CORE (Çakışmasız Senkronizasyon Desteği)
// ────────────────────────────────────────────────────────────────
// Uygulamanın temel state yönetimi ve event sistemi
// ════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // localStorage anahtarı
  const DB_KEY = 'sagi-state';

  // Varsayılan state (genişletilmiş)
  const DEFAULT_STATE = {
    settings: {
      syncKey: '',
      lastModified: Date.now(),
      lastSyncVersion: 0,
      notifications: {
        abonelik: false,
        borc: false,
        butce: false,
        haftalik: false,
        krediKarti: false,
        hedef: false,
        buyukHarcama: false,
        doviz: false
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
    _syncMeta: {
      lastPull: 0,
      lastPush: 0,
      pendingChanges: false
    }
  };

  // State'i localStorage'dan yükle (derin merge ile)
  function loadState() {
    try {
      const saved = localStorage.getItem(DB_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Derin merge yap
        const merged = JSON.parse(JSON.stringify(DEFAULT_STATE));
        
        // Settings merge
        merged.settings = { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) };
        if (parsed.settings?.notifications) {
          merged.settings.notifications = { ...DEFAULT_STATE.settings.notifications, ...parsed.settings.notifications };
        }
        
        // Ana array'leri merge et
        ['wallets', 'transactions', 'recurring', 'goals', 'debts', 'budgets', 'notifInbox'].forEach(key => {
          if (Array.isArray(parsed[key])) merged[key] = parsed[key];
        });
        
        if (parsed.paidMonths) merged.paidMonths = parsed.paidMonths;
        if (parsed._syncMeta) merged._syncMeta = parsed._syncMeta;
        
        return merged;
      }
    } catch(e) {
      console.warn('[Core] State yüklenemedi:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
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

  // Benzersiz ID üretici
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }

  // Core nesnesini oluştur
  window.Core = {
    state: loadState(),
    
    // Mevcut state'in kopyasını al (immutable işlemler için)
    getState: function() {
      return JSON.parse(JSON.stringify(this.state));
    },

    DB: {
      key: DB_KEY,
      save: function() {
        Core.state.settings.lastModified = Date.now();
        Core.state._syncMeta = Core.state._syncMeta || { lastPull: 0, lastPush: 0, pendingChanges: true };
        Core.state._syncMeta.pendingChanges = true;
        Core.state._syncMeta.lastPush = Date.now();
        saveState();
        emit('stateChanged', Core.state);
        if (Core.Cloud && Core.Cloud.isAvailable && Core.Cloud.isAvailable()) {
          Core.Cloud.queuePush(false);
        }
      },
      saveNow: function() {
        Core.state.settings.lastModified = Date.now();
        Core.state._syncMeta = Core.state._syncMeta || { lastPull: 0, lastPush: 0, pendingChanges: true };
        Core.state._syncMeta.pendingChanges = true;
        Core.state._syncMeta.lastPush = Date.now();
        saveState();
        emit('stateChanged', Core.state);
        if (Core.Cloud && Core.Cloud.isAvailable && Core.Cloud.isAvailable()) {
          Core.Cloud.queuePush(true);
        }
      },
      // Sadece local'e kaydet, cloud push tetikleme (bulut güncellemesi için)
      saveLocalOnly: function() {
        Core.state.settings.lastModified = Date.now();
        saveState();
        emit('stateChanged', Core.state);
      }
    },

    // Event sistemi
    emit: emit,
    on: on,
    off: off,

    // State'i kaydet (Cloud modülü bunu kullanacak)
    save: function() {
      Core.state.settings.lastModified = Date.now();
      Core.state._syncMeta = Core.state._syncMeta || { lastPull: 0, lastPush: 0, pendingChanges: true };
      Core.state._syncMeta.pendingChanges = true;
      saveState();
      emit('stateChanged', Core.state);
    },

    // Yardımcı fonksiyonlar
    Utils: {
      generateId: generateId,
      formatDate: function(d) {
        return d ? new Date(d).toLocaleDateString('tr-TR') : '';
      },
      formatMoney: function(amount, currency) {
        if (Core.state.settings.privacy === 'on') return '***';
        const cur = currency || Core.state.settings.currency || 'TRY';
        try {
          return new Intl.NumberFormat(cur === 'TRY' ? 'tr-TR' : 'en-US', {
            style: 'currency',
            currency: cur,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(amount || 0);
        } catch(e) {
          return (amount || 0).toFixed(2) + ' ' + cur;
        }
      }
    },

    // Cloud modülü buraya enjekte edilecek
    Cloud: null
  };

  console.log('[SAGI] Core başlatıldı. SyncKey:', Core.state.settings.syncKey ? 'mevcut' : 'yok');
})();