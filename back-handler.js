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
 * ║   - SAGI Chat paneli (#sagiChatPanel, 'open' class'ı) ve Plus     ║
 * ║     onboarding overlay'i (#sagiObOverlay, class değil DOM         ║
 * ║     ekleme/çıkarma ile açılıyor) artık geri/ESC kapsamında        ║
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

  // KRİTİK EKLEME: plus.js'teki SAGI Chat paneli (#sagiChatPanel, 'active'
  // DEĞİL 'open' class'ıyla açılıyor) ve Plus onboarding overlay'i
  // (#sagiObOverlay, class toggle değil — açılışta document.body'ye
  // eklenip kapanışta .remove() ile tamamen kaldırılıyor) .modal-overlay
  // class'ını KULLANMIYOR, bu yüzden getOpenModal() bunları hiç görmüyordu.
  // Geri/ESC bu ikisinde çalışmıyordu. getOpenOverlay() üçünü de tek yerden
  // önceliklendiriyor.
  function getOpenOverlay() {
    const modal = getOpenModal();
    if (modal) return { kind: 'modal', el: modal };

    const chatPanel = document.getElementById('sagiChatPanel');
    if (chatPanel && chatPanel.classList.contains('open')) {
      return { kind: 'sagiChat', el: chatPanel };
    }

    const obOverlay = document.getElementById('sagiObOverlay');
    if (obOverlay) return { kind: 'sagiOb', el: obOverlay };

    return null;
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

    // 1️⃣ Açık modal / SAGI Chat / Plus onboarding overlay var mı?
    const overlay = getOpenOverlay();
    if (overlay) {
      if (overlay.kind === 'sagiChat') {
        if (window.App && App.SAGIChat && App.SAGIChat.close) App.SAGIChat.close();
        else overlay.el.classList.remove('open');
      } else if (overlay.kind === 'sagiOb') {
        if (window.App && App.PlusOnboarding && App.PlusOnboarding.hide) App.PlusOnboarding.hide();
        else overlay.el.remove();
      } else {
        const id = overlay.el.id;
        if (id === 'modalCatPicker') {
          if (window.UI && UI.CatPicker) UI.CatPicker.close();
        } else if (id === 'modalImportChoice') {
          if (window.App && App.Controllers && App.Controllers.Settings) {
            App.Controllers.Settings._cancelImport();
          }
        } else {
          if (window.UI && UI.Modals) UI.Modals.close(id);
          else overlay.el.classList.remove('active');
        }
      }
      // Modal/panel kapanış animasyonu ~230-350ms — bittikten sonra sentinel push et
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
    // KRİTİK FIX (v1.3): Koruma yoktu — MutationObserver her class/DOM
    // değişikliğinde (bir modal açıkken dashboard'un kendi kendine yeniden
    // render olması, bir toast'ın gelip gitmesi, bir grafik animasyonu vb.)
    // pushSentinel()'i tekrar tekrar çağırıyordu. Bu iki ayrı gerçek soruna
    // yol açıyordu:
    //  1) "Bir basış = bir kapanış" garantisi bozuluyordu — aynı açık katman
    //     için birden fazla sentinel yığılınca, geri tuşuna bir kez basmak
    //     sadece EN ÜSTTEKİ fazladan sentinel'i tüketiyordu, kullanıcı hâlâ
    //     aynı modalde kalıyor ve "geri tuşu çalışmıyor" gibi görünüyordu.
    //  2) history.pushState() çok sık çağrılınca (Chrome'da ~100 çağrı/10sn
    //     sınırı var) tarayıcı bir noktadan sonra pushState'i sessizce
    //     yok sayıyor/hata fırlatıyor — bu da normal route navigasyonunu
    //     (uygulamanın kendi location.hash tabanlı geçişlerini) etkileyip
    //     "sayfa geçişi yapamıyorum" hissi yaratabiliyordu.
    // Çözüm: zaten bir sentinel'in üzerindeysek (_sentinelActive true) tekrar
    // push etmiyoruz — bir açık katman için tam olarak BİR sentinel yeterli
    // ve doğru olan budur. onPopState, handleBack'ten ÖNCE _sentinelActive'i
    // false'a çekiyor, yani "bir sonraki basış için yeniden kur" akışı
    // (handleBack içindeki setTimeout(pushSentinel,...) çağrıları) hiç
    // etkilenmiyor — o an zaten false olduğu için normal şekilde push eder.
    if (_sentinelActive) return;
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

  // SAGI Chat paneli 'active' değil 'open' class'ı kullanıyor — ayrı kontrol.
  function isNowOpenTrapElement(el) {
    if (!(el instanceof Element)) return false;
    if (isTrackedTrapElement(el)) return el.classList.contains('active');
    if (el.id === 'sagiChatPanel') return el.classList.contains('open');
    return false;
  }

  // #sagiObOverlay class toggle değil, doğrudan DOM'a ekleme/çıkarma ile
  // açılıp kapanıyor — varlığının kendisi "açık" demek.
  function isStandaloneOverlayNode(el) {
    return el instanceof Element && el.id === 'sagiObOverlay';
  }

  function initUniversalTrapObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Durum 1: izlenen bir eleman aktif class'ını ALDI (var olan eleman)
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (isNowOpenTrapElement(m.target)) {
            pushSentinel();
            return;
          }
        }
        // Durum 2: DOM'a YENİ eklenen bir modal/overlay doğrudan açık geldi
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (isNowOpenTrapElement(node) || isStandaloneOverlayNode(node)) {
              pushSentinel();
              return;
            }
            // NOT: Nested querySelector taraması buradan KALDIRILDI. Tüm
            // dinamik overlay'ler (bkz. plus.js'teki appendChild çağrıları)
            // doğrudan document.body'nin ÇOCUĞU olarak ekleniyor — hiçbiri
            // başka bir konteynerin içine iç içe eklenmiyor. O yüzden bu
            // node'un kendisini kontrol etmek yeterli, içini taramaya gerek
            // yok (ki bu tarama zaten aşağıdaki asıl performans düzeltmesiyle
            // artık pratikte hiç tetiklenmiyor olurdu).
          }
        }
      }
    });

    // KRİTİK PERFORMANS FIX: Eskiden TEK bir observe() çağrısıyla hem
    // attributes hem childList, subtree:true (yani document.body'nin
    // ALTINDAKİ HER ŞEY) izleniyordu. childList+subtree:true, SPA'nın her
    // route geçişinde/chart yeniden çiziminde/liste render'ında DOM'da olan
    // YÜZLERCE değişikliği de yakalıyordu ve her birinde querySelector
    // taraması çalıştırıyordu — bu da ana thread'i kilitleyip sayfa
    // geçişlerini donduruyordu ("sayfalar arası geçiş yapamıyorum" bug'ı
    // buydu). Çözüm: iki ayrı observe() çağrısı, farklı kapsamlarla —
    // attributes hâlâ subtree:true (ucuz: sadece class değişince tetiklenir,
    // attributeFilter ile zaten filtreli), childList ise subtree:FALSE
    // (sadece document.body'nin DOĞRUDAN çocukları) çünkü kontrol ettik:
    // plus.js'teki tüm dinamik overlay'ler (#sagiObOverlay dahil) zaten
    // document.body.appendChild(...) ile doğrudan body'ye ekleniyor, hiçbiri
    // iç içe değil. Aynı observer instance'ı birden fazla observe() çağrısını
    // destekler, callback ikisinden gelen mutation'ları da alır.
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
    observer.observe(document.body, {
      childList: true,
      subtree: false,
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