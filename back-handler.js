/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           SAGI Finance — Mobile Back Handler v1.2               ║
 * ║                                                                  ║
 * ║  Mobil tarayıcı/PWA geri tuşu (popstate) VE web'de ESC tuşu     ║
 * ║  davranışını uygulama mantığına entegre eder. History API       ║
 * ║  üzerinden her UI katmanı için ayrı geri adımı yönetir.         ║
 * ║                                                                  ║
 * ║  Öncelik sırası (en yüksekten en düşüğe):                       ║
 * ║    1. Açık modal → modalı kapat                                 ║
 * ║    2. Açık sidebar → sidebar'ı kapat                            ║
 * ║    3. Ayarlar alt sayfası açık → ayarlar menüsüne dön          ║
 * ║    4. Ana route dışı → önceki route'a git                       ║
 * ║    5. Ana sayfa (dashboard) → mobilde "Çıkmak için tekrar       ║
 * ║       basın" toast'ı; masaüstü web'de (ESC) no-op                ║
 * ║                                                                  ║
 * ║  v1.2 değişiklikleri:                                            ║
 * ║   - onPopState artık _sentinelActive'i kontrol ediyor (eski      ║
 * ║     e.state.sagiBackSentinel kontrolü normal hash navigasyonları ║
 * ║     araya girince neredeyse hiç true olmuyordu — ana bug)        ║
 * ║   - ESC tuşu için doğrudan handleBack() çağrısı eklendi          ║
 * ║   - Modal/sidebar/ayarlar paneli tespiti tek, evrensel bir       ║
 * ║     MutationObserver'a taşındı (document.body, subtree:true) —   ║
 * ║     sonradan DOM'a eklenen modallar artık kaçmıyor                ║
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
    // KRİTİK FIX: Bu adım (çift basışta gerçekten uygulamadan çıkma) sadece
    // mobil/PWA/TWA'da anlamlı — masaüstü web'de ESC ile buraya düşüldüğünde
    // "tekrar basarsan çıkarız" tarzı bir davranış olmamalı (tarayıcı
    // sekmesini kapatmaya/geri gitmeye çalışmak kullanıcıyı şaşırtır).
    // IS_MOBILE tanımlıydı ama hiç kullanılmıyordu — artık gerçek ayrımı
    // burada yapıyor.
    if (!IS_MOBILE) {
      setTimeout(pushSentinel, 100);
      return;
    }

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
    // KRİTİK FIX: history.pushState() sonrası geri tuşuna basılınca,
    // popstate event'inin e.state'i GİDİLEN (bir önceki) entry'nin state'idir
    // — az önce ATLADIĞIMIZ sentinel'in state'i DEĞİL. Yani location.hash ile
    // yapılan her normal route değişimi (state=null) araya girdiğinde bu
    // eski kontrol (e.state && e.state.sagiBackSentinel) her zaman false
    // dönüyordu ve handleBack() neredeyse hiç çalışmıyordu — geri tuşu
    // sessizce "hiçbir şey yapmamış" gibi görünüyordu. _sentinelActive zaten
    // tam bunun için vardı ama hiç okunmuyordu; asıl sinyal bu olmalı: "az
    // önce bizim bastırdığımız sentinel entry üzerindeydik ve şimdi bir
    // popstate oldu" = kullanıcı gerçekten geri tuşuna bastı.
    if (_sentinelActive) {
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

  // ─── Modal / sidebar / ayarlar panel açılışını izle ────────────────
  // KRİTİK FIX: Eskiden 3 ayrı fonksiyon (patchSidebarToggle/patchModalOpen/
  // patchSettingsDetail), SADECE kendi çağrıldığı ANDA DOM'da zaten var olan
  // elemanlara MutationObserver takıyordu (querySelectorAll anlık bir liste
  // döndürür, sonradan DOM'a eklenen elemanları KAPSAMAZ). Route değişiminde
  // (routeChanged event'i) tekrar çağrılıyordu ama aynı route içinde
  // sonradan dinamik oluşturulan bir modal (ör. bir buton tıklanınca
  // innerHTML/appendChild ile eklenen modal) hiç izlenmiyordu — o modal
  // açıldığında sentinel push edilmediği için geri tuşu/ESC o modalda hiç
  // çalışmıyordu. "Bazı modallarda çalışıyor bazılarında çalışmıyor" hissi
  // buradan geliyordu. Artık document.body üzerinde TEK bir observer var,
  // subtree:true ile — hem sonradan eklenen elemanları hem de class
  // değişikliklerini DOM'da nerede/ne zaman olursa olsun yakalıyor, ayrı
  // patch fonksiyonlarına veya routeChanged'e bağımlı kalmıyor.
  function isTrackedTrapElement(el) {
    if (!(el instanceof Element)) return false;
    return el.classList.contains('modal-overlay') ||
           el.id === 'sidebar' ||
           el.classList.contains('settings-detail-panel');
  }

  function initUniversalTrapObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Durum 1: izlenen bir eleman 'active' class'ı ALDI (var olan eleman)
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (isTrackedTrapElement(m.target) && m.target.classList.contains('active')) {
            pushSentinel();
            return;
          }
        }
        // Durum 2: DOM'a YENİ eklenen bir modal doğrudan 'active' class'ıyla geldi
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (isTrackedTrapElement(node) && node.classList.contains('active')) {
              pushSentinel();
              return;
            }
            // Eklenen node'un içinde aktif bir modal/panel varsa (nested) onu da yakala
            const nested = node.querySelector && node.querySelector('.modal-overlay.active, #sidebar.active, .settings-detail-panel.active');
            if (nested) { pushSentinel(); return; }
          }
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
      childList: true,
    });
  }

  // ─── Başlatma ─────────────────────────────────────────────────────

  // ─── ESC tuşu (web) ────────────────────────────────────────────────
  // KRİTİK FIX: Dosyada ESC için HİÇ kod yoktu — sadece popstate (mobil/PWA
  // donanım geri tuşu) dinleniyordu. ESC, tarayıcı history'sini tetiklemez,
  // bu yüzden web'de bu sistem baştan beri devre dışıydı. ESC, history/
  // sentinel mekanizmasından tamamen bağımsız olarak DOĞRUDAN handleBack()'i
  // çağırır — history.pushState/popstate'e hiç ihtiyaç yok.
  function onKeyDown(e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    handleBack();
  }

  function init() {
    window.addEventListener('popstate', onPopState);
    document.addEventListener('keydown', onKeyDown);

    pushSentinel();

    const ready = () => {
      initUniversalTrapObserver();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ready);
    } else {
      ready();
    }

    console.log('[SAGI BackHandler] Başlatıldı. v1.2');
  }

  // ─── Dışa aktar ───────────────────────────────────────────────────
  window.SAGIBackHandler = {
    handleBack,
    pushSentinel,
    getState: () => ({ ...State }),
  };

  init();

})();