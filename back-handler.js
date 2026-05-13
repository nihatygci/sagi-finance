/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           SAGI Finance — Mobile Back Handler v1.0               ║
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
 * ╚══════════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  // ─── Yardımcı: Bu JS PWA/mobil tarayıcıda mı çalışıyor?
  // Desktop'ta da çalışır ama toast ve davranış mobil odaklıdır.
  const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia('(max-width: 1023px)').matches;

  // ─── Durum ───────────────────────────────────────────────────────
  const State = {
    // Geri basılmasını bekleme modu (çıkış onayı için)
    exitPending: false,
    exitTimer: null,
    // Toast elemanı referansı
    _exitToastEl: null,
  };

  // ─── Yardımcı fonksiyonlar ────────────────────────────────────────

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
    if (sb) sb.classList.remove('active');
    if (ov) ov.classList.remove('active');
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
    // Boş hash, sadece "/" veya hiç hash yok → dashboard kabul et
    return hash || '/dashboard';
  }

  /**
   * Dashboard'da mıyız?
   * sagi/          → hash yok           → dashboard ✓
   * sagi/#/        → hash sadece "/"    → dashboard ✓
   * sagi/#/dashboard                    → dashboard ✓
   */
  function isOnDashboard() {
    const hash = window.location.hash; // ham değer
    if (!hash || hash === '#' || hash === '#/' || hash === '#/dashboard') return true;
    return false;
  }

  // ─── Çıkış toast'u ────────────────────────────────────────────────

  function showExitToast() {
    // Zaten varsa tekrar oluşturma
    if (State._exitToastEl && document.body.contains(State._exitToastEl)) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = 'sagi-exit-toast';
    toast.innerHTML = `
      <svg style="width:18px;height:18px;flex-shrink:0" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span>Çıkmak için tekrar basın</span>
    `;

    // Stil — mevcut CSS değişkenlerini kullan
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '96px',            // bottom nav'ın üstü
      left: '50%',
      transform: 'translateX(-50%) translateY(16px)',
      zIndex: '9999',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 20px',
      background: 'var(--bg-surface)',
      color: 'var(--text-main)',
      border: '1px solid var(--border-light)',
      borderRadius: '99px',
      boxShadow: 'var(--shadow-floating)',
      fontSize: '14px',
      fontWeight: '600',
      fontFamily: 'var(--font-sans)',
      opacity: '0',
      transition: 'opacity .25s, transform .28s cubic-bezier(.16,1,.3,1)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    });

    document.body.appendChild(toast);
    State._exitToastEl = toast;

    // Animasyonu tetikle
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // 3.5 sn sonra kaldır
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(16px)';
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
        if (State._exitToastEl === toast) State._exitToastEl = null;
      }, 350);
    }, 3500);
  }

  function hideExitToast() {
    if (State._exitToastEl) {
      State._exitToastEl.style.opacity = '0';
      setTimeout(() => {
        if (State._exitToastEl && State._exitToastEl.parentNode) {
          State._exitToastEl.remove();
        }
        State._exitToastEl = null;
      }, 300);
    }
  }

  // ─── Geri tuşu ana mantığı ────────────────────────────────────────

  function handleBack() {
    // 1️⃣ Açık modal var mı?
    const modal = getOpenModal();
    if (modal) {
      const id = modal.id;
      // Özel kapama mantığı olan modaller
      if (id === 'modalCatPicker') {
        if (window.UI && UI.CatPicker) UI.CatPicker.close();
      } else if (id === 'modalImportChoice') {
        if (window.App && App.Controllers && App.Controllers.Settings) {
          App.Controllers.Settings._cancelImport();
        }
      } else {
        // Standart modal kapat
        if (window.UI && UI.Modals) UI.Modals.close(id);
        else modal.classList.remove('active');
      }
      return; // işlem tamamlandı
    }

    // 2️⃣ Sidebar açık mı?
    if (isSidebarOpen()) {
      closeSidebar();
      return;
    }

    // 3️⃣ Ayarlar alt sayfası açık mı?
    if (isSettingsDetailOpen()) {
      if (window.App && App.Controllers && App.Controllers.Settings) {
        App.Controllers.Settings.closeSection();
      }
      return;
    }

    // 4️⃣ Dashboard dışı bir sayfadayız — dashboard'a dön
    if (!isOnDashboard()) {
      window.location.hash = '#/dashboard';
      return;
    }

    // 5️⃣ Dashboard'dayız — çıkış onayı
    if (State.exitPending) {
      // İkinci basış → gerçekten çık
      clearTimeout(State.exitTimer);
      State.exitPending = false;
      hideExitToast();
      // PWA standalone modda history.back() sekmeyi kapatır;
      // normal tarayıcıda bir önceki tarayıcı sayfasına gider.
      window.history.go(-1);
      return;
    }

    // İlk basış → toast göster, 3.5 sn bekle
    State.exitPending = true;
    showExitToast();

    State.exitTimer = setTimeout(() => {
      State.exitPending = false;
      hideExitToast();
    }, 3500);
  }

  // ─── History API entegrasyonu ─────────────────────────────────────
  //
  // Tarayıcı geri tuşu popstate olayını ateşler.
  // Strateji: uygulama başlangıcında ve her route değişiminde
  // history stack'e bir "sentinel" (koruyucu) state ekliyoruz.
  // Geri tuşuna basılınca popstate gelir, sentinel'i algılarız,
  // handleBack() çağırırız ve hemen yeni bir sentinel push ederiz —
  // böylece tarayıcı geri geçmişine hiç "gerçek" adım atmamış olur.
  //

  let _sentinelActive = false;

  function pushSentinel() {
    // Mevcut URL'yi koruyarak sahte bir state ekle
    window.history.pushState({ sagiBackSentinel: true }, '', window.location.href);
    _sentinelActive = true;
  }

  function onPopState(e) {
    if (e.state && e.state.sagiBackSentinel) {
      // Bu bizim sentinel'imizdi — popstate'i uygulama mantığıyla işle
      _sentinelActive = false;
      handleBack();
      // Yeni sentinel push et (kullanıcı tekrar geri basabilsin)
      // küçük delay: handleBack içindeki hash değişiminin tamamlanmasını bekle
      setTimeout(pushSentinel, 50);
    }
    // Eğer state sentinel değilse (gerçek tarayıcı navigasyonu) dokunma.
  }

  // ─── Route değişimi takibi ────────────────────────────────────────
  //
  // Uygulama hash tabanlı router kullanıyor (#/dashboard vb.).
  // Hash değiştiğinde exit pending durumunu sıfırlıyoruz.
  //

  window.addEventListener('hashchange', () => {
    // Exit pending sıfırla
    if (State.exitPending) {
      State.exitPending = false;
      clearTimeout(State.exitTimer);
      hideExitToast();
    }
    // Sidebar açıksa kapat (navigasyon oldu)
    if (isSidebarOpen()) closeSidebar();
  });

  // ─── Sidebar açılışını izle ───────────────────────────────────────
  //
  // Sidebar açıldığında sentinel yeniden push ederiz ki
  // geri tuşu önce sidebar'ı kapatsın.
  //

  function patchSidebarToggle() {
    // MutationObserver ile sidebar 'active' sınıfını izle
    const sb = document.getElementById('sidebar');
    if (!sb) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === 'class') {
          const isOpen = sb.classList.contains('active');
          if (isOpen) {
            // Sidebar açıldı — sentinel'in üstüne bir daha push et
            // böylece geri tuşu önce sidebar'ı kapatır
            pushSentinel();
          }
        }
      });
    });

    observer.observe(sb, { attributes: true });
  }

  // ─── Modal açılışını izle ─────────────────────────────────────────
  //
  // Modal açıldığında da sentinel push ederiz.
  //

  function patchModalOpen() {
    // Tüm modal-overlay elemanlarını izle
    document.querySelectorAll('.modal-overlay').forEach((modal) => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          if (m.attributeName === 'class') {
            if (modal.classList.contains('active')) {
              pushSentinel();
            }
          }
        });
      });
      observer.observe(modal, { attributes: true });
    });
  }

  // ─── Ayarlar detail paneli açılışını izle ─────────────────────────

  function patchSettingsDetail() {
    document.querySelectorAll('.settings-detail-panel').forEach((panel) => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          if (m.attributeName === 'class') {
            if (panel.classList.contains('active')) {
              pushSentinel();
            }
          }
        });
      });
      observer.observe(panel, { attributes: true });
    });
  }

  // ─── Başlatma ─────────────────────────────────────────────────────

  function init() {
    // popstate dinleyicisi
    window.addEventListener('popstate', onPopState);

    // İlk sentinel
    pushSentinel();

    // Elemanlar DOM'da hazır olduğunda izleyicileri kur
    const ready = () => {
      patchSidebarToggle();
      patchModalOpen();
      patchSettingsDetail();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ready);
    } else {
      ready();
    }

    // DOMContentLoaded'dan sonra App.init() çağrıldığında
    // dinamik modal'lar ve paneller de izlenmeli.
    // Core.on('routeChanged') event'ini kullanarak route değişiminde
    // yeni eklenen elemanları da izle.
    document.addEventListener('DOMContentLoaded', () => {
      if (window.Core && Core.on) {
        Core.on('routeChanged', () => {
          // Her route değişiminde yeni eklenen modalları da yakala
          patchModalOpen();
          patchSettingsDetail();
        });
      }
    });

    console.log('[SAGI BackHandler] Başlatıldı. Mobil geri tuşu yönetimi aktif.');
  }

  // ─── Dışa aktar (debugging için) ─────────────────────────────────
  window.SAGIBackHandler = {
    handleBack,
    pushSentinel,
    getState: () => ({ ...State }),
  };

  // ─── Başlat ───────────────────────────────────────────────────────
  init();

})();