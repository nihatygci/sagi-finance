/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           SAGI Finance — Mobile Back Handler v2.0               ║
 * ║                                                                  ║
 * ║  Mobil tarayıcı/PWA geri tuşu davranışını uygulama mantığına   ║
 * ║  entegre eder. History API üzerinden her UI katmanı için        ║
 * ║  ayrı geri adımı yönetir.                                       ║
 * ║                                                                  ║
 * ║  Öncelik sırası (en yüksekten en düşüğe):                       ║
 * ║    1. Açık modal → modalı kapat                                 ║
 * ║    2. Açık sidebar → sidebar'ı kapat                            ║
 * ║    3. Ayarlar alt sayfası açık → ayarlar menüsüne dön          ║
 * ║    4. Ana route dışı → önceki route'a git                       ║
 * ║    5. Ana sayfa (dashboard) → "Çıkmak için tekrar basın" toast  ║
 * ║                                                                  ║
 * ║  v2.0 Değişiklikler:                                            ║
 * ║    - Bellek sızıntısı düzeltildi (Observer disconnect)          ║
 * ║    - Rekürsif popstate döngüsü engellendi                       ║
 * ║    - History stack şişmesi önlendi (katman sayacı)              ║
 * ║    - Toast çıkış mekanizması güvenilir hale getirildi           ║
 * ║    - Sidebar kapanma sorunu düzeltildi                          ║
 * ║    - Sert bağımlılıklar gevşetildi (try-catch + event tabanlı)  ║
 * ║    - Sabit değerler yapılandırılabilir hale geldi               ║
 * ║    - Hash route kontrolü normalize edildi                       ║
 * ║    - Çıkış fonksiyonu PWA/tarayıcı ayrımı yapıyor              ║
 * ║    - Test edilebilir API eklendi                                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  // ─── Yapılandırma ──────────────────────────────────────────────
  const CONFIG = {
    TOAST_DURATION: 3500,        // Toast görünme süresi (ms)
    TOAST_ANIMATION: 300,        // Toast animasyon süresi (ms)
    SENTINEL_DELAY: 50,          // Sentinel push gecikmesi (ms)
    EXIT_DEBOUNCE: 300,          // Çıkış debounce süresi (ms)
    TOAST_BOTTOM: '96px',        // Toast alt konumu
    TOAST_Z_INDEX: '9999',       // Toast z-index
  };

  // ─── Durum ─────────────────────────────────────────────────────
  const State = {
    exitPending: false,
    exitTimer: null,
    exitDebounceTimer: null,     // Çıkış debounce timer'ı
    _exitToastEl: null,
    handlingBack: false,         // Rekürsif handleBack engeli
    layerCount: 0,               // Açık katman sayacı
  };

  // ─── Observer referansları (temizlik için) ─────────────────────
  const observers = [];

  // ─── Yardımcı fonksiyonlar ────────────────────────────────────

  /** Tüm observer'ları temizle */
  function disconnectAllObservers() {
    observers.forEach(obs => {
      try { obs.disconnect(); } catch (e) { /* ignore */ }
    });
    observers.length = 0;
  }

  /** Açık modal var mı? */
  function getOpenModal() {
    return document.querySelector('.modal-overlay.active');
  }

  /** Sidebar açık mı? */
  function isSidebarOpen() {
    const sb = document.getElementById('sidebar');
    return sb && sb.classList.contains('active');
  }

  /** Sidebar'ı kapat */
  function closeSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mobileOverlay');

    if (sb && sb.classList.contains('active')) {
      sb.classList.remove('active');
    }
    if (ov && ov.classList.contains('active')) {
      ov.classList.remove('active');
    }

    // Event tabanlı bildirim (sidebar modülü dinleyebilir)
    window.dispatchEvent(new CustomEvent('sagi:sidebarClosed', {
      detail: { triggeredBy: 'backHandler' }
    }));

    // Sidebar kapatılınca layerCount'u azalt
    if (State.layerCount > 0) {
      State.layerCount--;
    }
  }

  /** Ayarlar alt sayfası (detail panel) açık mı? */
  function isSettingsDetailOpen() {
    const hash = window.location.hash;
    if (!hash.includes('/settings')) return false;
    return !!document.querySelector('.settings-detail-panel.active');
  }

  /** Mevcut hash route */
  function getCurrentRoute() {
    const hash = window.location.hash.replace('#', '').replace(/^\/+$/, '');
    return hash || '/dashboard';
  }

  /**
   * Dashboard'da mıyız?
   * Normalize edilmiş kontrol:
   *   sagi/          → hash yok           → dashboard ✓
   *   sagi/#/        → hash sadece "/"    → dashboard ✓
   *   sagi/#/dashboard                    → dashboard ✓
   *   sagi/#/Dashboard                    → dashboard ✓
   *   sagi/#/dashboard/                   → dashboard ✓
   */
  function isOnDashboard() {
    const hash = window.location.hash;
    if (!hash || hash === '#' || hash === '#/') return true;

    // Normalize: # işaretini kaldır, slash'ları temizle, küçük harfe çevir
    const route = hash
      .replace(/^#\/?/, '')   // Baştaki # ve / kaldır
      .replace(/\/+$/, '')    // Sondaki slash'ları kaldır
      .toLowerCase()
      .trim();

    return route === '' || route === 'dashboard';
  }

  /** Sidebar açılış/kapanış durumunu event olarak bildir */
  function notifySidebarState(isOpen) {
    window.dispatchEvent(new CustomEvent('sagi:sidebarStateChanged', {
      detail: { isOpen }
    }));
  }

  // ─── Çıkış toast'u ────────────────────────────────────────────

  function showExitToast() {
    // Zaten varsa tekrar oluşturma
    if (State._exitToastEl && document.body.contains(State._exitToastEl)) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = 'sagi-exit-toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <svg style="width:18px;height:18px;flex-shrink:0" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span>Çıkmak için tekrar basın</span>
    `;

    // Stil — mevcut CSS değişkenlerini kullan
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: CONFIG.TOAST_BOTTOM,
      left: '50%',
      transform: 'translateX(-50%) translateY(16px)',
      zIndex: CONFIG.TOAST_Z_INDEX,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 20px',
      background: 'var(--bg-surface, #fff)',
      color: 'var(--text-main, #333)',
      border: '1px solid var(--border-light, #e0e0e0)',
      borderRadius: '99px',
      boxShadow: 'var(--shadow-floating, 0 4px 16px rgba(0,0,0,.12))',
      fontSize: '14px',
      fontWeight: '600',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      opacity: '0',
      transition: `opacity .25s ease, transform .28s cubic-bezier(.16,1,.3,1)`,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      userSelect: 'none',
    });

    document.body.appendChild(toast);
    State._exitToastEl = toast;

    // Animasyonu tetikle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });
    });

    // Otomatik kaldır
    const removeToast = () => {
      if (!toast.parentNode) return;

      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(16px)';

      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
        if (State._exitToastEl === toast) {
          State._exitToastEl = null;
        }
      }, CONFIG.TOAST_ANIMATION);
    };

    // Belirtilen süre sonra otomatik kaldır
    toast._autoRemoveTimer = setTimeout(() => {
      // Süre doldu, toast'ı kaldır ve exitPending'i sıfırla
      removeToast();
      State.exitPending = false;
    }, CONFIG.TOAST_DURATION);

    // Toast referansına timer'ı ekle (iptal edebilmek için)
    toast._autoRemoveTimerRef = toast._autoRemoveTimer;
  }

  function hideExitToast(immediate = false) {
    if (!State._exitToastEl) return;

    const toast = State._exitToastEl;

    // Otomatik kaldırma timer'ını iptal et
    if (toast._autoRemoveTimerRef) {
      clearTimeout(toast._autoRemoveTimerRef);
      toast._autoRemoveTimerRef = null;
    }

    if (immediate) {
      // Anında kaldır
      if (toast.parentNode) {
        toast.remove();
      }
      State._exitToastEl = null;
      return;
    }

    // Animasyonlu kaldır
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(16px)';

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
      if (State._exitToastEl === toast) {
        State._exitToastEl = null;
      }
    }, CONFIG.TOAST_ANIMATION);
  }

  /** Exit pending durumunu tamamen sıfırla */
  function resetExitState() {
    State.exitPending = false;
    if (State.exitTimer) {
      clearTimeout(State.exitTimer);
      State.exitTimer = null;
    }
    if (State.exitDebounceTimer) {
      clearTimeout(State.exitDebounceTimer);
      State.exitDebounceTimer = null;
    }
    hideExitToast(true);
  }

  /** Uygulamadan çık */
  function exitApp() {
    // PWA standalone mod kontrolü
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         navigator.standalone; // iOS Safari

    if (isStandalone) {
      // PWA modunda: sekmeyi/tarayıcıyı kapat
      try {
        // Android için
        if (window.navigator.app && window.navigator.app.exitApp) {
          window.navigator.app.exitApp();
        } else {
          // Fallback: geçmişi temizle ve kapat
          window.location.replace('about:blank');
        }
      } catch (e) {
        // En son çare
        window.close();
        // close() çalışmazsa en azından boş sayfaya git
        setTimeout(() => {
          window.location.replace('about:blank');
        }, 100);
      }
    } else {
      // Normal tarayıcı: bir önceki sayfaya dön
      // Eğer geçmiş yoksa ana sayfaya git
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.replace('about:blank');
      }
    }
  }

  // ─── Geri tuşu ana mantığı ────────────────────────────────────

  function handleBack() {
    // Rekürsif çağrı engeli
    if (State.handlingBack) {
      console.warn('[SAGI BackHandler] Rekürsif handleBack çağrısı engellendi.');
      return;
    }

    State.handlingBack = true;

    try {
      // 1️⃣ Açık modal var mı?
      const modal = getOpenModal();
      if (modal) {
        const id = modal.id;
        let closed = false;

        // Özel kapama mantığı olan modaller
        if (id === 'modalCatPicker') {
          try {
            if (window.UI && window.UI.CatPicker && typeof window.UI.CatPicker.close === 'function') {
              window.UI.CatPicker.close();
              closed = true;
            }
          } catch (e) {
            console.warn('[SAGI BackHandler] CatPicker kapatma hatası:', e);
          }
        } else if (id === 'modalImportChoice') {
          try {
            if (window.App && window.App.Controllers && window.App.Controllers.Settings &&
                typeof window.App.Controllers.Settings._cancelImport === 'function') {
              window.App.Controllers.Settings._cancelImport();
              closed = true;
            }
          } catch (e) {
            console.warn('[SAGI BackHandler] ImportChoice kapatma hatası:', e);
          }
        }

        // Standart kapatma (özel kapatma çalışmadıysa)
        if (!closed) {
          try {
            if (window.UI && window.UI.Modals && typeof window.UI.Modals.close === 'function') {
              window.UI.Modals.close(id);
              closed = true;
            }
          } catch (e) {
            console.warn('[SAGI BackHandler] UI.Modals.close hatası:', e);
          }
        }

        // Son çare: doğrudan DOM manipülasyonu
        if (!closed) {
          modal.classList.remove('active');
        }

        // Event fırlat (diğer modüller haberdar olsun)
        window.dispatchEvent(new CustomEvent('sagi:modalClosed', {
          detail: { modalId: id, triggeredBy: 'backHandler' }
        }));

        // Katman sayacını azalt
        if (State.layerCount > 0) {
          State.layerCount--;
        }

        return; // işlem tamamlandı
      }

      // 2️⃣ Sidebar açık mı?
      if (isSidebarOpen()) {
        closeSidebar();
        notifySidebarState(false);
        return;
      }

      // 3️⃣ Ayarlar alt sayfası açık mı?
      if (isSettingsDetailOpen()) {
        let closed = false;

        try {
          if (window.App && window.App.Controllers && window.App.Controllers.Settings &&
              typeof window.App.Controllers.Settings.closeSection === 'function') {
            window.App.Controllers.Settings.closeSection();
            closed = true;
          }
        } catch (e) {
          console.warn('[SAGI BackHandler] Settings closeSection hatası:', e);
        }

        // Fallback: DOM üzerinden kapat
        if (!closed) {
          const detailPanel = document.querySelector('.settings-detail-panel.active');
          if (detailPanel) {
            detailPanel.classList.remove('active');
            closed = true;
          }
        }

        // Event fırlat
        window.dispatchEvent(new CustomEvent('sagi:settingsDetailClosed', {
          detail: { triggeredBy: 'backHandler' }
        }));

        // Katman sayacını azalt
        if (State.layerCount > 0) {
          State.layerCount--;
        }

        return;
      }

      // 4️⃣ Dashboard dışı bir sayfadayız — dashboard'a dön
      if (!isOnDashboard()) {
        // Mevcut route'u kaydet (debugging için)
        const previousRoute = getCurrentRoute();
        window.location.hash = '#/dashboard';

        window.dispatchEvent(new CustomEvent('sagi:routeBack', {
          detail: { from: previousRoute, to: '/dashboard', triggeredBy: 'backHandler' }
        }));

        return;
      }

      // 5️⃣ Dashboard'dayız — çıkış onayı mekanizması

      // Çıkış debounce kontrolü (hızlı ardışık basışları engelle)
      if (State.exitDebounceTimer) {
        return; // Henüz debounce süresi dolmadı
      }

      if (State.exitPending) {
        // İkinci basış → gerçekten çık
        clearTimeout(State.exitTimer);
        State.exitTimer = null;

        resetExitState();

        window.dispatchEvent(new CustomEvent('sagi:appExit', {
          detail: { triggeredBy: 'backHandler' }
        }));

        exitApp();
        return;
      }

      // İlk basış → toast göster, bekleme moduna geç
      State.exitPending = true;
      showExitToast();

      // Toast süresi dolduğunda exitPending otomatik sıfırlanır (showExitToast içinde)
      // ama biz yine de ekstra bir timer tutalım (showExitToast içindeki timer'a ek olarak)
      State.exitTimer = setTimeout(() => {
        // Bu timer toast'tan önce tetiklenirse (olmamalı ama garanti olsun)
        if (State.exitPending) {
          State.exitPending = false;
          hideExitToast();
        }
      }, CONFIG.TOAST_DURATION + CONFIG.TOAST_ANIMATION + 100);

      // Debounce timer'ı - ardışık basışları engelle
      State.exitDebounceTimer = setTimeout(() => {
        State.exitDebounceTimer = null;
      }, CONFIG.EXIT_DEBOUNCE);

    } finally {
      // handlingBack bayrağını her durumda sıfırla
      State.handlingBack = false;
    }
  }

  // ─── History API entegrasyonu ─────────────────────────────────

  let _sentinelActive = false;

  function pushSentinel() {
    // Eğer zaten aktif sentinel varsa ve layerCount 0'dan büyükse tekrar push etme
    // (stack şişmesini önle)
    if (State.layerCount === 0 && _sentinelActive) {
      return; // Zaten bir sentinel var, tekrar ekleme
    }

    // Mevcut URL'yi koruyarak sahte bir state ekle
    try {
      window.history.pushState(
        { sagiBackSentinel: true, layer: State.layerCount, timestamp: Date.now() },
        '',
        window.location.href
      );
      _sentinelActive = true;
      State.layerCount++;
    } catch (e) {
      console.warn('[SAGI BackHandler] pushState başarısız:', e);
    }
  }

  function onPopState(e) {
    // handlingBack kontrolü - rekürsif çağrıları engelle
    if (State.handlingBack) {
      console.warn('[SAGI BackHandler] handlingBack aktif, popstate yoksayılıyor.');
      return;
    }

    // Sentinel state kontrolü
    if (e.state && e.state.sagiBackSentinel) {
      _sentinelActive = false;

      // Layer count'u güncelle (state'ten al veya manuel azalt)
      if (e.state.layer !== undefined) {
        State.layerCount = Math.max(0, (e.state.layer || 1) - 1);
      } else if (State.layerCount > 0) {
        State.layerCount--;
      }

      handleBack();

      // Yeni sentinel push et (küçük delay: handleBack içindeki işlemlerin tamamlanmasını bekle)
      if (!State.handlingBack) {
        setTimeout(() => {
          if (State.layerCount === 0 && !_sentinelActive) {
            pushSentinel();
          }
        }, CONFIG.SENTINEL_DELAY);
      }
    }
    // Eğer state sentinel değilse (gerçek tarayıcı navigasyonu) - dokunma,
    // tarayıcının normal davranışına izin ver.
  }

  // ─── Route değişimi takibi ────────────────────────────────────

  window.addEventListener('hashchange', () => {
    // Exit pending durumunu sıfırla (yeni sayfaya gidildi)
    resetExitState();

    // Sidebar açıksa kapat
    if (isSidebarOpen()) {
      closeSidebar();
      notifySidebarState(false);
      console.log('[SAGI BackHandler] Sidebar, route değişimi nedeniyle kapatıldı.');
    }

    // Yeni route bilgisini event olarak bildir
    const newRoute = getCurrentRoute();
    window.dispatchEvent(new CustomEvent('sagi:routeChanged', {
      detail: { route: newRoute, timestamp: Date.now() }
    }));
  });

  // ─── Sidebar açılışını izle ───────────────────────────────────

  function patchSidebarToggle() {
    const sb = document.getElementById('sidebar');
    if (!sb) {
      console.warn('[SAGI BackHandler] Sidebar elementi bulunamadı.');
      return;
    }

    // Varsa eski observer'ı temizle (sidebar'a özel)
    const existingObserver = observers.find(
      obs => obs._targetElement === sb
    );
    if (existingObserver) {
      existingObserver.disconnect();
      const idx = observers.indexOf(existingObserver);
      if (idx > -1) observers.splice(idx, 1);
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === 'class') {
          const wasActive = m.oldValue && m.oldValue.includes('active');
          const isActive = sb.classList.contains('active');

          // Sadece kapalı → açık geçişinde sentinel ekle
          if (!wasActive && isActive) {
            if (!_sentinelActive || State.layerCount === 0) {
              pushSentinel();
            }
            notifySidebarState(true);

            window.dispatchEvent(new CustomEvent('sagi:sidebarOpened', {
              detail: { triggeredBy: 'user' }
            }));
          }

          // Açık → kapalı geçişinde layerCount'u azalt
          if (wasActive && !isActive) {
            if (State.layerCount > 0) {
              State.layerCount--;
            }
            notifySidebarState(false);
          }
        }
      });
    });

    // Eski değerleri de alabilmek için attributeOldValue
    observer.observe(sb, { attributes: true, attributeOldValue: true });
    observer._targetElement = sb;
    observers.push(observer);
  }

  // ─── Modal açılışını izle ─────────────────────────────────────

  function patchModalOpen() {
    document.querySelectorAll('.modal-overlay').forEach((modal) => {
      // Bu modal için zaten observer var mı kontrol et
      const hasObserver = observers.some(obs => obs._targetElement === modal);
      if (hasObserver) return;

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          if (m.attributeName === 'class') {
            const wasActive = m.oldValue && m.oldValue.includes('active');
            const isActive = modal.classList.contains('active');

            // Kapalı → açık
            if (!wasActive && isActive) {
              if (!_sentinelActive || State.layerCount === 0) {
                pushSentinel();
              }

              window.dispatchEvent(new CustomEvent('sagi:modalOpened', {
                detail: { modalId: modal.id, triggeredBy: 'user' }
              }));
            }

            // Açık → kapalı
            if (wasActive && !isActive) {
              if (State.layerCount > 0) {
                State.layerCount--;
              }

              window.dispatchEvent(new CustomEvent('sagi:modalClosed', {
                detail: { modalId: modal.id, triggeredBy: 'user' }
              }));
            }
          }
        });
      });

      observer.observe(modal, { attributes: true, attributeOldValue: true });
      observer._targetElement = modal;
      observers.push(observer);
    });
  }

  // ─── Ayarlar detail paneli açılışını izle ─────────────────────

  function patchSettingsDetail() {
    document.querySelectorAll('.settings-detail-panel').forEach((panel) => {
      const hasObserver = observers.some(obs => obs._targetElement === panel);
      if (hasObserver) return;

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          if (m.attributeName === 'class') {
            const wasActive = m.oldValue && m.oldValue.includes('active');
            const isActive = panel.classList.contains('active');

            if (!wasActive && isActive) {
              if (!_sentinelActive || State.layerCount === 0) {
                pushSentinel();
              }

              window.dispatchEvent(new CustomEvent('sagi:settingsDetailOpened', {
                detail: { triggeredBy: 'user' }
              }));
            }

            if (wasActive && !isActive) {
              if (State.layerCount > 0) {
                State.layerCount--;
              }

              window.dispatchEvent(new CustomEvent('sagi:settingsDetailClosed', {
                detail: { triggeredBy: 'user' }
              }));
            }
          }
        });
      });

      observer.observe(panel, { attributes: true, attributeOldValue: true });
      observer._targetElement = panel;
      observers.push(observer);
    });
  }

  // ─── Periyodik temizlik ───────────────────────────────────────

  /** DOM'dan kaldırılmış elementlerin observer'larını temizle */
  function cleanupOrphanedObservers() {
    for (let i = observers.length - 1; i >= 0; i--) {
      const obs = observers[i];
      if (obs._targetElement && !document.body.contains(obs._targetElement)) {
        try { obs.disconnect(); } catch (e) { /* ignore */ }
        observers.splice(i, 1);
      }
    }
  }

  // ─── Başlatma ─────────────────────────────────────────────────

  function init() {
    // Eski observer'ları temizle (hot reload durumunda)
    disconnectAllObservers();

    // popstate dinleyicisi
    window.addEventListener('popstate', onPopState);

    // İlk sentinel
    pushSentinel();

    // Elemanlar DOM'da hazır olduğunda izleyicileri kur
    const setupObservers = () => {
      patchSidebarToggle();
      patchModalOpen();
      patchSettingsDetail();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupObservers);
    } else {
      setupObservers();
    }

    // Core event bus entegrasyonu
    const initCoreIntegration = () => {
      if (window.Core && typeof window.Core.on === 'function') {
        try {
          window.Core.on('routeChanged', () => {
            // Her route değişiminde yeni eklenen modalları da yakala
            cleanupOrphanedObservers();
            patchModalOpen();
            patchSettingsDetail();
          });
        } catch (e) {
          console.warn('[SAGI BackHandler] Core.on entegrasyonu başarısız:', e);
        }
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCoreIntegration);
    } else {
      initCoreIntegration();
    }

    // Periyodik observer temizliği (her 30 saniyede bir)
    setInterval(cleanupOrphanedObservers, 30000);

    console.log('[SAGI BackHandler v2.0] Başlatıldı. Mobil geri tuşu yönetimi aktif.');
  }

  // ─── Global olayları dinle (debugging ve dış entegrasyon için) ─

  /**
   * Dışarıdan katman ekleme (özel UI bileşenleri için)
   * Kullanım: window.dispatchEvent(new CustomEvent('sagi:addLayer'))
   */
  window.addEventListener('sagi:addLayer', () => {
    if (!_sentinelActive || State.layerCount === 0) {
      pushSentinel();
    }
  });

  /**
   * Dışarıdan katman kaldırma
   * Kullanım: window.dispatchEvent(new CustomEvent('sagi:removeLayer'))
   */
  window.addEventListener('sagi:removeLayer', () => {
    if (State.layerCount > 0) {
      State.layerCount--;
    }
  });

  // ─── Dışa aktar (debugging ve test için) ──────────────────────

  window.SAGIBackHandler = {
    // Temel fonksiyonlar
    handleBack,
    pushSentinel,

    // Durum okuma
    getState: () => ({
      exitPending: State.exitPending,
      layerCount: State.layerCount,
      handlingBack: State.handlingBack,
      sentinelActive: _sentinelActive,
    }),

    // Yardımcı fonksiyonlar
    isOnDashboard,
    isSidebarOpen,
    isSettingsDetailOpen,
    getOpenModal,
    getCurrentRoute,

    // Kontrol fonksiyonları
    closeSidebar,
    resetExitState,
    exitApp,
    hideExitToast,
    showExitToast,

    // Temizlik
    cleanupOrphanedObservers,
    disconnectAllObservers,

    // Observer yenileme
    refreshObservers: () => {
      cleanupOrphanedObservers();
      patchModalOpen();
      patchSettingsDetail();
      patchSidebarToggle();
    },

    // Konfigürasyon
    CONFIG,

    // Versiyon
    version: '2.0.0',
  };

  // ─── Başlat ───────────────────────────────────────────────────
  init();

})();