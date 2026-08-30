/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           SAGI Finance — Mobile Back Handler v2.0                ║
 * ║                                                                  ║
 * ║  SADECE küçük ekranlar / modaller için: fiziksel geri tuşu       ║
 * ║  (popstate) ve web'de ESC tuşu, o an açık olan EN ÜST katmanı    ║
 * ║  kapatır. Sayfa/route geçişleri bu dosyanın kapsamı DIŞINDA —    ║
 * ║  hiçbirine karışmıyor, hiçbirini yönetmiyor.                     ║
 * ║                                                                  ║
 * ║  Öncelik sırası (en yüksekten en düşüğe):                        ║
 * ║    1. Açık modal / SAGI Chat / Plus onboarding overlay → kapat   ║
 * ║    2. Açık Hızlı İşlem paneli → kapat                            ║
 * ║    3. Açık sidebar → kapat                                       ║
 * ║    4. Açık ayarlar alt sayfası → ayarlar menüsüne dön            ║
 * ║    Hiçbiri açık değilse: HİÇBİR ŞEY YAPMA. Fiziksel geri tuşu/    ║
 * ║    ESC normal tarayıcı/TWA davranışına bırakılır.                ║
 * ║                                                                  ║
 * ║  v2.0 — KAPSAM DARALTILDI + İKİ DİNLEYİCİ ÇAKIŞMASI DÜZELTİLDİ:  ║
 * ║   1) "Sayfa geçişi" ile ilgili HER ŞEY kaldırıldı: dashboard'a   ║
 * ║      otomatik dönüş, "çıkmak için tekrar bas" toast'ı, route     ║
 * ║      takibi (isOnDashboard/getCurrentRoute). Bunlar, uygulamanın ║
 * ║      kendi hash-tabanlı navigasyonuyla history.pushState()       ║
 * ║      üzerinden çakışıp "sayfalar arası geçemiyorum" bug'ına yol  ║
 * ║      açıyordu. Artık bu dosya route'lara HİÇ dokunmuyor.         ║
 * ║   2) index.html'in sonunda bu dosyadan TAMAMEN BAĞIMSIZ, kendi   ║
 * ║      ESC dinleyicisi (document.addEventListener('keydown',...))  ║
 * ║      bulundu ve kaldırıldı. İKİ dinleyici aynı anda kayıtlıydı — ║
 * ║      bu ciddi bir güvenlik hatasına yol açıyordu: inline         ║
 * ║      dinleyicide "modalKeyNotFound ESC ile ASLA kapanmaz" kuralı ║
 * ║      vardı ama back-handler.js'in KENDİ mantığında bu istisna    ║
 * ║      hiç yoktu — yani inline dinleyici doğru şekilde "hiçbir şey ║
 * ║      yapma" deyip dursa bile, back-handler.js'in dinleyicisi AYNI║
 * ║      ESC basışında bağımsız çalışıp modalKeyNotFound'u YİNE DE   ║
 * ║      kapatıyordu (session güvenliği bypass riski). Bu istisna    ║
 * ║      artık TEK yerde (burada) uygulanıyor.                       ║
 * ║      Ayrıca o inline dinleyicinin kendisi de 2 noktada BOZUKTU:  ║
 * ║      yanlış sidebar ID'si (#appSidebar — gerçek ID #sidebar) ve  ║
 * ║      yanlış Hızlı İşlem paneli class'ı (.active — gerçek .open)  ║
 * ║      kontrol ediyordu, o dallar hiçbir zaman çalışmıyordu.       ║
 * ║   3) Hızlı İşlem paneli (#quickActionsPanel) artık bu dosyanın   ║
 * ║      bildiği katmanlardan biri (doğru .open class'ıyla).         ║
 * ║   4) MutationObserver YOK — bir önceki sürümde kaldırılmıştı,    ║
 * ║      öyle kalıyor. index.html/plus.js'teki gerçek açılış         ║
 * ║      noktaları (UI.Modals.open, sidebar toggle,                  ║
 * ║      Settings._openSectionDirect, SAGIChat.open, PlusOnboarding  ║
 * ║      show) doğrudan pushSentinel() çağırıyor — bu dosya hiçbir   ║
 * ║      DOM'u gözlemlemiyor, sıfır ek maliyet.                      ║
 * ║   5) pushSentinel() HER ZAMAN senkron çağrılıyor (setTimeout      ║
 * ║      İÇİNDEN DEĞİL) — gecikmeli/jestsiz pushState çağrıları       ║
 * ║      tarayıcının history throttle korumasını tetikleyip TÜM      ║
 * ║      hash navigasyonunu bozabiliyordu, bu yüzden bu kural kesin.  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  // ─── Yardımcı fonksiyonlar — her biri TEK bir "küçük ekran/modal" katmanı ─

  function getOpenOverlay() {
    const modal = document.querySelector('.modal-overlay.active');
    if (modal) return { kind: 'modal', el: modal };

    // SAGI Chat paneli 'active' DEĞİL 'open' class'ıyla açılıyor.
    const chatPanel = document.getElementById('sagiChatPanel');
    if (chatPanel && chatPanel.classList.contains('open')) {
      return { kind: 'sagiChat', el: chatPanel };
    }

    // Plus onboarding overlay class toggle değil — açılışta DOM'a eklenip
    // kapanışta .remove() ile tamamen kaldırılıyor. Varlığının kendisi "açık" demek.
    const obOverlay = document.getElementById('sagiObOverlay');
    if (obOverlay) return { kind: 'sagiOb', el: obOverlay };

    return null;
  }

  function isQuickActionsOpen() {
    const qa = document.getElementById('quickActionsPanel');
    return !!(qa && qa.classList.contains('open'));
  }

  function closeQuickActions() {
    if (window.App && App.Controllers && App.Controllers.QuickActions && App.Controllers.QuickActions.close) {
      App.Controllers.QuickActions.close();
    } else {
      const qa = document.getElementById('quickActionsPanel');
      if (qa) qa.classList.remove('open');
    }
  }

  function isSidebarOpen() {
    const sb = document.getElementById('sidebar');
    return !!(sb && sb.classList.contains('active'));
  }

  function closeSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mobileOverlay');
    if (sb) sb.classList.remove('active');
    if (ov) ov.classList.remove('active');
  }

  function isSettingsDetailOpen() {
    return !!document.querySelector('.settings-detail-panel.active');
  }

  // ─── Geri tuşu / ESC ana mantığı ────────────────────────────────────

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
        // modalKeyNotFound ASLA geri/ESC ile kapanmaz — X yok, backdrop
        // click yok, ESC de yok. Tek çıkış yolu "Çıkış Yap" butonu
        // (handleKeyNotFoundSignOut). Aksi halde kullanıcı, key silinmiş
        // ama session localStorage'da duran "hayalet" bir oturumda kalır.
        if (id === 'modalKeyNotFound') return;
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
      pushSentinel();
      return;
    }

    // 2️⃣ Hızlı İşlem paneli açık mı?
    if (isQuickActionsOpen()) {
      closeQuickActions();
      pushSentinel();
      return;
    }

    // 3️⃣ Sidebar açık mı?
    if (isSidebarOpen()) {
      closeSidebar();
      pushSentinel();
      return;
    }

    // 4️⃣ Ayarlar alt sayfası açık mı?
    if (isSettingsDetailOpen()) {
      if (window.App && App.Controllers && App.Controllers.Settings) {
        App.Controllers.Settings.closeSection();
      }
      pushSentinel();
      return;
    }

    // Hiçbir küçük-ekran/modal katmanı açık değil — bu dosyanın işi burada
    // biter. Sayfa/route geçişlerine hiç karışmıyoruz; fiziksel geri tuşu
    // veya ESC normal tarayıcı/TWA davranışına bırakılır.
  }

  // ─── History API entegrasyonu ───────────────────────────────────────

  let _sentinelActive = false;

  function pushSentinel() {
    // Zaten bir sentinel'in üzerindeysek tekrar push etmiyoruz — bir açık
    // katman için tam olarak BİR sentinel yeterli ve doğrudur (birden fazla
    // yığılırsa "bir basış = bir kapanış" garantisi bozulur). HER ZAMAN
    // senkron çağrılır — setTimeout içinden ASLA (gecikmeli/jestsiz
    // pushState çağrıları tarayıcının history throttle korumasını tetikleyip
    // uygulamanın kendi route navigasyonunu bozabiliyordu).
    if (_sentinelActive) return;
    window.history.pushState({ sagiBackSentinel: true }, '', window.location.href);
    _sentinelActive = true;
  }

  function onPopState() {
    if (_sentinelActive) {
      _sentinelActive = false;
      handleBack();
    }
  }

  // ─── Route değişiminde sidebar'ı otomatik kapat (güvenlik ağı) ─────
  // Bu, "sayfa geçişi mantığı" değil — bir route değişse bile sidebar'ın
  // açık takılı kalmaması için basit bir temizlik. Navigasyonun kendisine
  // hiç karışmıyor, sadece reaksiyon veriyor.
  window.addEventListener('hashchange', () => {
    if (isSidebarOpen()) closeSidebar();
  });

  // ─── ESC tuşu (web) ──────────────────────────────────────────────────
  // ESC tarayıcı history'sini tetiklemez, bu yüzden history/sentinel
  // mekanizmasından tamamen bağımsız olarak DOĞRUDAN handleBack()'i çağırır.
  function onKeyDown(e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    handleBack();
  }

  function init() {
    window.addEventListener('popstate', onPopState);
    document.addEventListener('keydown', onKeyDown);
    pushSentinel();
    console.log('[SAGI BackHandler] Başlatıldı. v2.0 (sadece modal/panel kapsamı)');
  }

  // ─── Dışa aktar ──────────────────────────────────────────────────────
  window.SAGIBackHandler = {
    handleBack,
    pushSentinel,
  };

  init();

})();