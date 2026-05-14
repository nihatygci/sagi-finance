/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           SAGI Finance — Mobile Back Handler v1.1               ║
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

  const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia('(max-width: 1023px)').matches;

  // ─── Durum ───────────────────────────────────────────────────────
  const State = {
    exitPending: false,
    exitTimer: null,
    _exitToastEl: null,
  };

  // ─── Yardımcı fonksiyonlar ────────────────────────────────────────

  function getOpenModal() {
    return document.querySelector('.modal-overlay.active');
  }

  function isSidebarOpen() {
    const sb = document.getElementById('sidebar');
    return sb && sb.classList.contains('active');
  }

  function closeSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mobileOverlay');
    if (sb) sb.classList.remove('active');
    if (ov) ov.classList.remove('active');
  }

  function isSettingsDetailOpen() {
    const hash = window.location.hash;
    if (!hash.includes('/settings')) return false;
    return !!document.querySelector('.settings-detail-panel.active');
  }

  function getCurrentRoute() {
    const hash = window.location.hash.replace('#', '').replace(/^\/+$/, '');
    return hash || '/dashboard';
  }

  function isOnDashboard() {
    const hash = window.location.hash;
    if (!hash || hash === '#' || hash === '#/' || hash === '#/dashboard') return true;
    return false;
  }

  // ─── Çıkış toast'u ────────────────────────────────────────────────

  function showExitToast() {
    if (State._exitToastEl && document.body.contains(State._exitToastEl)) return;

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

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '96px',
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

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

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
      if (id === 'modalCatPicker') {
        if (window.UI && UI.CatPicker) UI.CatPicker.close();
      } else if (id === 'modalImportChoice') {
        if (window.App && App.Controllers && App.Controllers.Settings) {
          App.Controllers.Settings._cancelImport();
        }
      } else {
        if (window.UI && UI.Modals) UI.Modals.close(id);
        else modal.classList.remove('active');
      }
      // Modal closing animasyonu 230ms — bittikten sonra sentinel push et
      setTimeout(pushSentinel, 280);
      return;
    }

    // 2️⃣ Sidebar açık mı?
    if (isSidebarOpen()) {
      closeSidebar();
      setTimeout(pushSentinel, 100);
      return;
    }

    // 3️⃣ Ayarlar alt sayfası açık mı?
    if (isSettingsDetailOpen()) {
      if (window.App && App.Controllers && App.Controllers.Settings) {
        App.Controllers.Settings.closeSection();
      }
      // closeSection slide-out animasyonu ~200ms
      setTimeout(pushSentinel, 280);
      return;
    }

    // 4️⃣ Dashboard dışı bir sayfadayız — dashboard'a dön
    if (!isOnDashboard()) {
      window.location.hash = '#/dashboard';
      // Router view geçiş animasyonu 200ms
      setTimeout(pushSentinel, 260);
      return;
    }

    // 5️⃣ Dashboard'dayız — çıkış onayı
    if (State.exitPending) {
      clearTimeout(State.exitTimer);
      State.exitPending = false;
      hideExitToast();
      window.history.go(-1);
      return;
    }

    State.exitPending = true;
    showExitToast();
    State.exitTimer = setTimeout(() => {
      State.exitPending = false;
      hideExitToast();
    }, 3500);
    // Sentinel'i yenile ki ikinci basış yakalanabilsin
    setTimeout(pushSentinel, 100);
  }

  // ─── History API entegrasyonu ─────────────────────────────────────

  let _sentinelActive = false;

  function pushSentinel() {
    window.history.pushState({ sagiBackSentinel: true }, '', window.location.href);
    _sentinelActive = true;
  }

  function onPopState(e) {
    if (e.state && e.state.sagiBackSentinel) {
      _sentinelActive = false;
      // handleBack içindeki her dal kendi timing'iyle pushSentinel çağırıyor
      handleBack();
    }
  }

  // ─── Route değişimi takibi ────────────────────────────────────────

  window.addEventListener('hashchange', () => {
    if (State.exitPending) {
      State.exitPending = false;
      clearTimeout(State.exitTimer);
      hideExitToast();
    }
    if (isSidebarOpen()) closeSidebar();
  });

  // ─── Sidebar açılışını izle ───────────────────────────────────────

  function patchSidebarToggle() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === 'class') {
          if (sb.classList.contains('active')) {
            pushSentinel();
          }
        }
      });
    });

    observer.observe(sb, { attributes: true });
  }

  // ─── Modal açılışını izle ─────────────────────────────────────────

  function patchModalOpen() {
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
    window.addEventListener('popstate', onPopState);

    pushSentinel();

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

    document.addEventListener('DOMContentLoaded', () => {
      if (window.Core && Core.on) {
        Core.on('routeChanged', () => {
          patchModalOpen();
          patchSettingsDetail();
        });
      }
    });

    console.log('[SAGI BackHandler] Başlatıldı. v1.1');
  }

  // ─── Dışa aktar ───────────────────────────────────────────────────
  window.SAGIBackHandler = {
    handleBack,
    pushSentinel,
    getState: () => ({ ...State }),
  };

  init();

})();