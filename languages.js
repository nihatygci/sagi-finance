/* ════════════════════════════════════════════════════════════════════
   SAGI Finance — LANGUAGES MODULE (i18n)
   ────────────────────────────────────────────────────────────────────
   Bu dosya uygulamanın TÜM çevirilerini, dil tespit/uygulama mantığını
   ve t() yardımcı fonksiyonunu barındırır.

   Yeni bir dil eklemek için:
     1. LANGS objesine yeni bir dil kodu (örn: 'de', 'fr') ekleyin
     2. LANGS_META içine bayrak ve etiket bilgisi ekleyin
     3. ui ve cats kısımlarını çevirin
     4. index.html'e tek satır script eklemenize gerek yok — otomatik yüklenir

   Window'a şunlar export edilir:
     window.LANGS, window.LANGS_META
     window.LANG (aktif dil kodu)
     window.L() (aktif dilin sözlüğüne erişim)
     window.t(key, vars) (anahtardan çeviri çekme)
     window.applyLang() (DOM'a dil uygulama)
     window.CATEGORIES(), window.CAT_GROUPS()
   ════════════════════════════════════════════════════════════════════ */

(function(){
'use strict';

// ─────────────────────────────────────────────────────────────────────
// META: dil seçim arayüzünde kullanılan etiketler
// ─────────────────────────────────────────────────────────────────────
const LANGS_META = {
  tr: { label: 'Türkçe',  short: 'TR' },
  en: { label: 'English', short: 'EN' },
};

// ─────────────────────────────────────────────────────────────────────
// SÖZLÜK: tüm UI metinleri ve kategori grupları
// ─────────────────────────────────────────────────────────────────────
const LANGS = {

  /* ═══════════════════════════════ TÜRKÇE ═══════════════════════════════ */
  tr: {
    appName: 'SAGI Finance',
    cats: {
      groups: [
        { g: 'Günlük Harcamalar', items: ['Market','Yemek Siparişi','Restoran & Kafe','Kişisel Bakım','Giyim & Aksesuar','Ev Gereçleri','Elektronik'] },
        { g: 'Fatura & Kira',     items: ['Kira','Elektrik','Su','Doğalgaz','İnternet','Telefon Faturası','Aidat'] },
        { g: 'Ulaşım',            items: ['Toplu Taşıma','Yakıt','Otopark','Araç Bakım','Taksi & Servis'] },
        { g: 'Sağlık',            items: ['Hastane & Klinik','Eczane','Sigorta','Spor & Fitness'] },
        { g: 'Eğitim & Kültür',   items: ['Kitap & Kırtasiye','Kurs & Eğitim','Sinema & Tiyatro','Müzik & Yayın','Oyun'] },
        { g: 'Planlama',          items: ['Tatil & Seyahat','Hediye','Birikim','Yatırım'] },
        { g: 'Gelir',             items: ['Maaş','Serbest Meslek','Kira Geliri','Faiz & Temettü','İkramiye','Diğer Gelir'] },
        { g: 'Diğer',             items: ['Transfer','Borç Alındı','Borç Verildi','Diğer'] },
      ]
    },
    ui: {
      // Navigasyon
      dashboard:'Ana Sayfa', netWorth:'Net Varlık', monthExpense:'Bu Ay Gider', monthIncome:'Bu Ay Gelir',
      cashFlow:'Aylık Nakit Akışı', goals:'Hedeflerim', debts:'Borç & Alacak', debtSummary:'Borç & Alacak',
      recentTx:'Son İşlemler', upcoming:'Yaklaşan Ödemeler', wallets:'Hesaplarım', transactions:'İşlemler',
      recurring:'Abonelikler', analytics:'Analiz', settings:'Ayarlar', privacyPolicy:'Gizlilik Politikası',
      mainMenu:'Ana Menü',

      // Ortak aksiyonlar
      addWallet:'Hesap Ekle', addTx:'İşlem Ekle', addRecurring:'Abonelik Ekle', addGoal:'Hedef Ekle',
      addDebt:'Borç Ekle', addReceivable:'Alacak Ekle', addLimit:'Limit Ekle', addFirstTx:'İlk İşlemi Ekle',
      save:'Kaydet', cancel:'İptal', delete:'Sil', edit:'Düzenle',
      confirm:'Evet, Devam Et', confirmTitle:'Onay Gerekiyor',
      all:'Tümü', reset:'Sıfırla', select:'Seç',
      showAll:'Tümünü Göster', showLess:'Daha Az Göster', showMore:'Daha Fazla Göster',
      transferBtn:'Para Aktar', payBtn:'Öde', payNow:'Ödemeyi Yap',

      // Form etiketleri
      expense:'Gider', income:'Gelir', category:'Kategori', account:'Hesap', amount:'Tutar',
      date:'Tarih', description:'Açıklama', type:'Tür',
      selectCategory:'Kategori Seçin', selectAccount:'Hesap seçin',
      langSelect:'Dil / Language', langTr:'Türkçe', langEn:'English',
      theme:'Ekran Teması', themeLight:'Açık', themeDark:'Koyu',
      animations:'Animasyonlar', animOn:'Açık', animOff:'Kapalı',
      yourName:'İsminiz', yourNameHint:'Karşılama mesajı için.',
      currency:'Para Birimi', currencyHint:'Tüm ekranlarda geçerli.',
      themeHint:'Açık veya koyu mod.', animHint:'Geçiş efektleri.', langHint:'Uygulama dili.',

      // Dashboard
      dashSubtitle:'Finansal durumunuzun özeti',
      goodMorning:'Günaydın', goodDay:'İyi Günler', goodEvening:'İyi Akşamlar',
      noTx:'Henüz işlem yok.', noGoal:'Henüz hedef eklenmedi.', noRecNote:'Abonelik kaydı yok.',
      noDebt:'Kayıt bulunmuyor.', noUpcomingPayments:'Yaklaşan ödeme yok.',
      viewAll:'Tümü',

      // Hesaplar (Wallets)
      walletsSubtitle:'Tüm hesaplarınız ve bakiyeleri',
      emptyWalletTitle:'İlk Hesabınızı Oluşturun',
      emptyWalletDesc:'Nakit, banka hesabı veya kredi kartı ekleyerek başlayın.',
      addTxOnCard:'İşlem Ekle', viewHistory:'Geçmişi Gör',
      walletNameLabel:'Hesap Adı', walletNamePh:'Örn: Akbank Vadesiz',
      balance:'Bakiye', accountType:'Hesap Türü',
      typeCash:'Nakit', typeBank:'Banka Hesabı', typeCredit:'Kredi Kartı', typeInvest:'Yatırım',
      colorLabel1:'Renk 1', colorLabel2:'Renk 2',
      bnavItemAdded:'Öğe eklendi.', bnavItemRemoved:'Öğe kaldırıldı.',
      walletCurLabel:'Hesap Para Birimi', walletCurHint:'(Opsiyonel — TL dışı hesaplar için)',
      cardColor:'Kart Rengi', custom:'Özel:',
      newWallet:'Yeni Hesap Ekle', editWallet:'Hesabı Düzenle',
      // Kredi kartı alanları
      ccMinPayLabel:'Asgari Ödeme',
      ccMinModeFixed:'Sabit Tutar',
      ccMinModeRate:'Oran (%)',
      ccMinRatePreview:({rate,amt})=>`Mevcut borç üzerinden %${rate} = ${amt}`,
      payMinBtn:'Asgari',
      payFullBtn:'Tamamı',
      payCardMinInfo:({amt,rate})=>`Tanımlı asgari ödeme: ${amt}${rate}`,
      ccDebt:'Mevcut Borç', ccDebtHint:'Şu an kart borcunuz',
      ccCutoffDay:'Hesap Kesim Günü', ccCutoffHint:'Ayın kaçında kesim yapılır?',
      ccDueDay:'Son Ödeme Günü', ccDueHint:'Ayın kaçında son ödeme tarihi?',
      ccAvailable:'Kullanılabilir', ccUsed:'Kullanılan',
      ccCurrentDebt:'Güncel Borç',
      ccUsageLabel:'Kullanım',
      ccUsagePct:'Kullanım %',
      ccType:'Kredi Kartı',
      ccCutoffLabel:'Hesap Kesim',
      ccDueLabel:'Son Ödeme',
      ccDaysLeft:'Kalan Süre',
      ccAllTx:'Tüm İşlemler',
      ccPayNow:'Ödeme Yap',
      ccCardDetail:'Kart Detayı',
      ccDueToday:'Bugün son ödeme!',
      ccDaysRemaining:(n)=>`${n} gün kaldı`,
      ccDayOfMonth:(n)=>`Ayın ${n}. günü`,
      ccDueUrgentDay:'Bugün!',
      ccDaysRemainingShort:(n)=>`${n} gün`,
      noData:'Veri yok',
      autoPayDesc:'Ödeme günü geldiğinde hesaptan otomatik çekilsin',
      autoPayActive:'Otomatik ödeme etkin',
      autoPaySchedule:(day)=>`Ödeme günü (<strong>${day}</strong>), seçilen hesaptan otomatik işlem kaydedilecek.`,
      autoPayWarn:'Uygulama arka planda çalışmadan veya açılmadan otomatik ödeme gerçekleşmez. Her gün uygulamayı açtığınızda bekleyen ödemeler işlenir.',
      autoPayProcessed:(n)=>`${n} otomatik ödeme talimatı işlendi.`,
      csvIncome:'Gelir', csvExpense:'Gider',
      notifRecurring3d:(name,amt)=>`${name} ödemesine 3 gün kaldı: ${amt}`,
      notifRecurring1d:(name,amt)=>`Yarın: ${name} ödemesi — ${amt}`,
      notifRecurring0d:(name,amt)=>`Bugün ${name} ödemesi yapılmalı: ${amt}`,
      notifRecurringLate:(name,n)=>`${name} ödemesi ${n} gün gecikti!`,
      notifDebtMsg0:(name,amt)=>`Bugün: ${name} için ${amt} vadesi doldu.`,
      notifDebtMsgN:(n,name,amt)=>`${n} gün içinde: ${name} — ${amt}`,
      notifCCMsg0:(name,amt)=>`Bugün ${name} ödeme günü! Borç: ${amt}`,
      notifCCMsgN:(name,n,amt)=>`${name} ödeme gününe ${n} gün kaldı. Borç: ${amt}`,
      chartIncomeLabel:'Gelir',
      chartExpenseLabel:'Gider',
      payCard:'Karta Ödeme Yap', payCardTitle:'Kredi Kartı Ödemesi',
      payAmount:'Ödenecek Tutar', payFromWhich:'Hangi hesaptan ödenecek?',

      // İşlemler (Transactions)
      txSubtitle:'Tüm gelir ve giderleriniz',
      emptyTxTitle:'Henüz İşlem Yok', emptyTxDesc:'Gelir ve giderlerinizi ekleyerek bütçenizi takip edin.',
      filterToggle:'Filtrele',filterDate:'Tarih', filterAllTimes:'Tüm Zamanlar', filterThisMonth:'Bu Ay', filterLastMonth:'Geçen Ay',
      filterLast3:'Son 3 Ay', filterLast6:'Son 6 Ay', filterLastYear:'Son 1 Yıl', filterCustom:'Özel Tarih',
      filterSearch:'Arama', filterSearchPh:'Açıklama...', filterType:'Tür',
      filterIncome:'Gelir (+)', filterExpense:'Gider (-)',
      filterAllWallets:'Tüm Hesaplar', deleteFiltered:'Filtrelenenleri Sil',
      totalTx:'Toplam 0 işlem', noMatch:'Filtreye uyan kayıt bulunamadı.',
      th_date:'Tarih', th_desc:'Açıklama', th_cat:'Kategori', th_wallet:'Hesap',
      th_amount:'Tutar', th_action:'İşlem',
      txAmountHint:'cinsinden', txAmountConv:'≈ {amount} (ana para biriminde)',
      amountPh:'0,00', descPh:'Kısa bir not ekleyin...',
      newTx:'İşlem Ekle', editTx:'İşlemi Düzenle',
      keepOpen:'Kaydet ve bir tane daha ekle',
      deleted:'Silinmiş', records:'kayıt',
      selectMode:'Seç', cancelSelect:'İptal',
      deleteSelected:'Seçilenleri Sil', confDelSelected:'{n} işlem silinecek. Devam?',
      msgSelectedDeleted:'Seçili işlemler silindi.',

      // Abonelikler (Recurring)
      recSubtitle:'Düzenli sabit ödemeleriniz',
      emptyRecTitle:'Abonelik Kaydı Yok',
      emptyRecDesc:'Kira, fatura, Netflix gibi düzenli ödemelerinizi ekleyin.',
      recNameLabel:'Abonelik Adı', recNamePh:'Örn: Netflix, Kira, Elektrik',
      monthlyAmount:'Aylık Tutar', dayOfMonth:'Ayın Kaçında?',
      payFromAccount:'Ödenecek Hesap', onDayOfMonth:'Ayın {day}. günü',
      editRecurring:'Aboneliği Düzenle',
      paidThisMonth:'Bu ay ödendi', notPaidYet:'Bu ay ödenmedi',
      paymentDay:'Ödeme günü', payNowConfirm:'Aboneliği Öde',
      msgPayConfirmDone:'Ödeme yapıldı ve kaydedildi.',
      payConfirmTitle:'Ödeme Onayla', payConfirmFrom:'Hangi hesaptan ödensin?',

      // Hedefler (Goals)
      goalsSubtitle:'Birikim planlarınız ve ilerlemeniz',
      emptyGoalTitle:'Henüz Hedef Yok',
      emptyGoalDesc:'Araba, tatil veya acil fon için birikim hedefi oluşturun.',
      goalNameLabel:'Hedef Adı', goalNamePh:'Örn: Araba Peşinatı, Tatil',
      targetAmount:'Hedef Tutar', currentAmount:'Mevcut Birikim',
      targetDateOpt:'Hedef Tarih (İsteğe Bağlı)',
      deposit:'Para Yatır', withdraw:'Para Çek',
      newGoal:'Yeni Hedef Ekle', editGoal:'Hedefi Düzenle',
      goalDepositTitle:'Hedefe Para Yatır', goalWithdrawTitle:'Hedeften Para Çek',
      fromWhichAccount:'Hangi Hesaptan?',
      monthsLeft:'Ay Kaldı', timeUp:'Süre Doldu', endDateLabel:'Son Tarih:',
      daysLeft:'gün kaldı', weeksLeft:'hafta kaldı',

      // Borç & Alacak (Debts)
      debtsSubtitle:'Finansal yükümlülükleriniz',
      myDebts:'Borçlarım', myReceivables:'Alacaklarım',
      personOrInst:'Kişi veya Kurum Adı', personPh:'Kime / Kimden?',
      endDateOpt:'Son Tarih (İsteğe Bağlı)',
      reflectToBalance:'Hesap bakiyeme yansıt', accountOptional:'Hesap (İsteğe Bağlı)',
      payDebtTitle:'Ödeme Yap', collectTitle:'Tahsilat Al',
      partialPay:'Kısmi Ödeme', onlyRecord:'Sadece kaydı düş',
      noDebtRec:'Borç kaydı yok.', noReceivableRec:'Alacak kaydı yok.',
      dueDate:'Son Tarih:', noDueDate:'Vadesiz',
      addRecord:'Kayıt Ekle', editRecord:'Kaydı Düzenle',

      // Analiz
      analyticsSubtitle:'Harcama istatistikleri ve limitler',
      thisMonthIncome:'Bu Ay Gelir', thisMonthExpense:'Bu Ay Gider', netSavings:'Net Tasarruf',
      last6Months:'Son 6 Aylık Trend', thisMonthCat:'Bu Ay Gider Dağılımı',
      categories:'Kategoriler', catBudgets:'Kategori Bütçeleri',
      noExpData:'Bu ay gider kaydı yok.', noLimitSet:'Henüz limit belirlenmedi.',
      budgetTitle:'Bütçe Limiti Belirle', monthlyLimit:'Aylık Limit',
      dataNone:'Veri Yok', total:'Toplam',
      spent:'Harcandı', limit:'Limit:',
      catChartHint:'Kategoriye veya grafik dilimine tıklayın → işlemleri görün',
      thisMonthTotal:'Bu Ay Toplam', noTxThisMonth:'Bu ayda işlem yok',
      moreCategories:'kategori daha',

      // Transfer
      transfer:'Para Aktar', transferFrom:'Nereden?', transferTo:'Nereye?',
      completeTransfer:'Aktarımı Tamamla', accounts:'Hesaplar', goalsLabel:'Hedefler',

      // Ayarlar
      settingsSubtitle:'Uygulama tercihlerinizi yönetin',
      personalization:'Kişiselleştirme',
      notifTitle:'Bildirimler', notifDesc:'Yaklaşan ödemeler ve vadeli işlemler için hatırlatma alın.',
      notifAskPermMsg:'Bildirimlere izin vermek için butona tıklayın.',
      notifAskPermBtn:'Bildirimlere İzin Ver', notifActive:'✓ Bildirimler aktif',
      notifMaster:'Bildirimleri Etkinleştir', notifMasterOn:'Bildirimler açık',
      notifMasterOff:'Bildirimleri kapatmak için kaydırın',
      notifSub:'Abonelik Hatırlatmaları', notifSubDesc:'3 gün önce, 1 gün önce ve ödeme günü bildir',
      notifDebt:'Borç & Vade Uyarıları', notifDebtDesc:'3 gün öncesinden bildir',
      notifBudget:'Bütçe Limit Uyarısı', notifBudgetDesc:'%80 dolduğunda bildir',
      notifWeekly:'Haftalık Özet', notifWeeklyDesc:'Her Pazartesi haftalık rapor',
      ratesTitle:'Döviz Kurları', ratesDesc:'Ana para biriminize göre güncel kur değerleri.',
      ratesLoading:'Yükleniyor...', ratesLastUpdate:'Son güncelleme:',
      ratesNotUpdated:'Güncellenmedi', ratesRefresh:'Kurları Güncelle',
      dataManagement:'Veri Yönetimi',
      dataDesc:'Verileriniz yalnızca bu cihazda saklanır. Düzenli yedek almanızı öneririz.',
      backup:'Yedek Al', restore:'Yedek Yükle', chooseFile:'Dosya Seç (.json)', deleteAll:'Tüm Verileri Sil',
      backupHint:'JSON — tüm veriler, geri yükleme için. CSV — işlem geçmişi, Excel\'de açılır.',
      backupHintHtml:'JSON — tüm veriler, geri yükleme için.<br>CSV — işlem geçmişi, Excel\'de açılır.',
      restoreHint:'Sadece JSON yedek dosyaları desteklenir.',
      legalTitle: 'Yasal Anlaşmalar',
      legalHint: 'Gizlilik, şartlar, hakkında',
      termsTitle: 'Kullanım Şartları',
      termsHint: 'Kurallar & sorumluluk',
      aboutTitle: 'Hakkımızda',
      aboutHint: 'Proje & teknoloji',
      faqHint: 'Sık sorulan sorular',
      contactTitle: 'İletişim',
      contactHint: 'Geri bildirim & destek',
      privacyHint: 'Veri & güvenlik',

      // Onboarding
      obWelcome:'Tüm varlık ve harcamalarınızı tek ekrandan kolayca yönetin.',
      obStart:'Hadi Başlayalım',
      obMeet:'Sizi Tanıyalım', obMeetDesc:'Size nasıl hitap edelim?',
      obNamePh:'Adınız veya Takma Adınız', obBack:'Geri', obNext:'Devam',
      obPrefs:'Tercihleriniz', obPrefsDesc:'Uygulamayı size göre ayarlayalım.',
      obFinish:'SAGI\'yı Aç',

      // Toasts / mesajlar
      msgSaved:'İşlem kaydedildi.', msgAccSaved:'Hesap kaydedildi.', msgAccDeleted:'Hesap silindi.',
      msgTxDeleted:'İşlem silindi, bakiye güncellendi.',
      msgTxDuped:'İşlem kopyalandı, bakiye güncellendi.',
      msgKeepGoing:'Kaydedildi, devam edebilirsiniz.',
      msgAmountReq:'Tutar girmelisiniz.', msgAccReq:'Hesap seçmelisiniz.',
      msgCatReq:'Lütfen kategori seçin.',
      msgAccFirst:'Önce hesap eklemelisiniz.',
      msgAccFirst2:'Lütfen önce bir hesap ekleyin.',
      msgAccFirstTransfer:'İşlem için önce hesap eklemelisiniz.',
      msgRecAdded:'Abonelik eklendi.', msgRecUpdated:'Abonelik güncellendi.',
      msgRecNameReq:'Abonelik adı girmelisiniz.', msgRecDeleted:'Abonelik silindi.',
      msgRecFullDelete:'Abonelik ve ilgili işlemler silindi, bakiyeler düzeltildi.',
      msgGoalSaved:'Hedef kaydedildi.', msgGoalDeleted:'Hedef silindi.',
      msgActionDone:'İşlem tamamlandı.',
      msgRecordAdded:'Kayıt eklendi.', msgRecordDeleted:'Kayıt silindi.',
      msgTransferDone:'Transfer tamamlandı.',
      msgLimitSaved:'Bütçe limiti kaydedildi.', msgLimitRemoved:'Limit kaldırıldı.',
      msgLimitExists:'Bu kategoride limitiniz bulunmaktadır!',
      msgPayRecorded:'Ödeme kaydedildi.', msgFullyClosed:'Hesap tamamen kapatıldı.',
      msgOverpayCreated:'Fazla ödeme nedeniyle karşı kayıt oluşturuldu.',
      msgRatesUpdated:'Kurlar güncellendi.', msgBackupDone:'Yedek indirildi.',
      msgCsvDone:'CSV indirildi.', msgImportInvalidExt:'Lütfen .json uzantılı yedek dosyası seçin.',
      msgImportDone:'Veriler yüklendi, yenileniyor...',
      msgImportInvalid:'Geçersiz dosya formatı.', msgImportFail:'Dosya okunamadı.',
      msgPrivacyOn:'Gizlilik modu açık', msgPrivacyOff:'Gizlilik modu kapalı',
      msgDark:'Koyu mod aktif', msgLight:'Açık mod aktif',
      msgPrefsSaved:'Tercihleriniz kaydedildi.',
      msgTrSelected:'Türkçe seçildi', msgEnSelected:'English selected',
      msgNotifActive:'Bildirimler aktif!', msgNotifDenied:'Bildirim izni verilmedi.',
      msgNotifFail:'Bildirim izni alınamadı.',
      msgNotifUnsup:'Bu tarayıcı bildirimleri desteklemiyor.',
      msgNotifOn:'Bildirim açıldı.', msgNotifOff:'Bildirim kapatıldı.',
      msgNotifAllOn:'Bildirimler açıldı.', msgNotifAllOff:'Bildirimler kapatıldı.',
      msgRecProcessed:'{n} abonelik işlendi.',
      msgPayDone:'Ödeme yapıldı.', msgCcPaid:'Kart borcuna {amount} ödeme yapıldı.',
      msgSameWallet:'Aynı hesaba transfer yapılamaz.',
      msgInsuffBalance:'Yetersiz bakiye.',

      // Onaylar
      confDelTx:'Bu işlemi silmek istediğinize emin misiniz? Hesap bakiyesi geri düzeltilecek.',
      confDelTxBulk:'{n} kayıt silinecek ve hesap bakiyeleri geri düzeltilecek. Devam edilsin mi?',
      confDelWallet:'"{name}" hesabına bağlı {n} işlem var. Hesap silinince bu işlemler de silinecek. Devam edilsin mi?',
      confDelWalletSimple:'Bu hesabı silmek istediğinize emin misiniz?',
      confDelGoal:'Bu hedefi silmek istediğinize emin misiniz? Bu işlem hedefle ilişkili geçmiş işlemleri silmez — sadece hedefi kaldırır.',
      confDelRec:'"{name}" aboneliğine bağlı {n} işlem kaydı var. Bu işlemler geri alınıp silinsin mi? (İptal seçerseniz sadece abonelik silinir, geçmiş işlemler kalır.)',
      confDelRecSimple:'Bu aboneliği silmek istediğinize emin misiniz?',
      confDelDebt:'Bu kaydı silmek istediğinize emin misiniz?',
      confDelLimit:'Bu bütçe limiti kaldırılsın mı?',
      confFactory:'TÜM VERİLER SİLİNECEK! Bu işlem geri alınamaz. Devam etmek istiyor musunuz?',
      confNotifPerm:'SAGI Finance size abonelik, borç vadeleri ve bütçe uyarıları için bildirim gönderebilir. İzin vermek ister misiniz?',
      confCloudCreate:'Mevcut yerel verileriniz anonim bir anahtarla Firebase\'e yüklenecek ve senkronizasyon başlayacak.\n\n⚠️ Anahtarınızı kaydedin — kaybederseniz bulut verilerinize bir daha erişemezsiniz.\n\nGizlilik Politikamızda belirttiğimiz üzere kimlik bilgisi toplanmaz. Devam etmek istiyor musunuz?',
      confCloudSignOut:'Bu cihazdan bulut bağlantısı kesilecek. Verileriniz bu cihazda kalmaya devam eder. Devam?',

      // Ayarlar menü ipuçları
      personalizationHint:'İsim, para birimi, tema, dil',
      notifMenuHint:'Hatırlatmalar ve uyarılar',
      ratesMenuHint:'Güncel kur değerleri',
      cloudMenuHint:'Cihazlar arası eşleşme',
      cloudSyncTitle:'Bulut Senkronizasyonu',
      cloudSyncDesc:'Verilerinizi başka cihazlarda da görüntülemek için anahtarınızı kullanın.',
      dataMenuHint:'Yedek al, yükle, sıfırla',
      cloudConnectTitle:'Anahtarınızla Bağlan',
      cloudConnectDesc:'Başka cihazda oluşturduğunuz 16 haneli anahtarı girin. Mevcut yerel verileriniz silinir; bulutta kayıtlı veriler yüklenir.',
      cloudInactive: 'Bulut bağlı değil',

      // Onboarding — anahtar adımı
      obKeyTitle:'Bulut Senkronizasyonu',
      obKeyDesc:'Verilerinizi cihazlar arasında senkronize etmek için 16 haneli benzersiz bir anahtar kullanılır. Bu adımı şimdi atlayabilir, daha sonra Ayarlar\'dan bağlanabilirsiniz. Uygulama bulut olmadan da tam çalışır.',
      obKeyNew:'Yeni Hesap',
      obKeyHave:'Anahtarım Var',
      obKeySkip:'Şimdi Atla',
      obKeyInfoTitle:'Cihazlar arası eşleşme',
      obKeyInfoBody:'Üretilen anahtarı saklayın. Bu anahtar, başka bir cihaza giriş yaparken size lazım olacak. Anahtar olmadan verilere ulaşılamaz.',
      obKeyLabel:'16 Haneli Anahtar',
      obKeyCreated:'Anahtarınız hazır!',
      obKeyCopy:'Kopyala',
      obKeyWarn:'Bu anahtarı güvenli bir yere kaydedin. Kaybederseniz başka cihazdan verilerinize ulaşamazsınız.',
      obKeySkipTitle:'Sadece bu cihazda kullan',
      obKeySkipDesc:'Verileriniz yalnızca bu cihazda saklanacak. İstediğiniz zaman Ayarlar → Bulut Senkronizasyonu bölümünden anahtar oluşturup bağlanabilirsiniz.',
      obKeySkipBtn:'Devam Et (Çevrim Dışı)',

      // Hızlı işlem
      quickActionsLabel:'Hızlı',
      quickActionsHeader:'Hızlı İşlem',
      quickActionsReset:'Hızlı işlemler sıfırlandı.',

      // Kur sayfası
      ratesLastUpdate:'Son güncelleme',
      ratesSource:'Kaynak',
      ratesSourceNote:'Referans kurlar günlük güncellenir',
      ratesIndicator:'≈ Gösterge kur',

      // Veri yönetimi
      restoreHintJson:'Sadece JSON yedek dosyaları desteklenir.',
      backupHintPlus:'JSON — tüm veriler, geri yükleme için. CSV & PDF rapor — <span style="color:var(--brand-accent);font-weight:600">Plus</span>.',
      restoreHintPlus:'JSON yedek dosyası veya <span style="color:var(--brand-accent);font-weight:600">SAGI Plus</span> ile dışa aktarılan CSV.',
      selectJsonFile:'JSON Dosyası Seç',
      selectCsvFile:'CSV Dosyası Seç',
      confDeleteAccount:'Hesabınızı ve tüm verilerinizi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz. Firebase üzerindeki tüm hesap verileriniz ve cihazda kayıtlı yerel verileriniz tamamen silinecektir.',
      accountDeleted:'Hesabınız silindi.',

      // Analiz sayfası — hardcoded
      forecastLabel:'Tahmini',
      forecastExpIncome:'Beklenen Gelir',
      forecastExpExpense:'Beklenen Gider',
      forecastFixedCosts:'Sabit Giderler',
      forecastFixedNote:'Abonelik & tekrarlayan',
      forecastNet:'Tahmini Net',
      forecastNetWarn:'Giderlerinizi gözden geçirin',
      forecastMinData:'Tahmin için en az 2 aylık veri gerekli.',
      forecastConfidence:'güven',
      scoreSavingsLabel2:'TASARRUF',
      scoreGradeExcellent:'Mükemmel',
      scoreGradeGood:'İyi',
      scoreGradeMid:'Orta',
      scoreGradeWarn:'Dikkat',
      scoreGradeCrit:'Kritik',
      scoreDescExcellent:'Gelirinizin büyük kısmını biriktiriyorsunuz.',
      scoreDescGood:'Tasarruf oranınız makul düzeyde.',
      scoreDescMid:'Tasarruf potansiyeliniz artırılabilir.',
      scoreDescCrit:'Giderleriniz gelirinizi aşıyor.',
      catModalMonthTotal:'Bu Ay Toplam',
      catModalNoTx:'Bu ay işlem yok',
      periodDayAvg:'günlük ortalama',

      // Abonelik
      autoPayLabel:'Oto. Ödeme',

      // Alt menü düzeni (bottombar)
      bottombarTitle:'Alt Menü Düzeni',
      bottombarDesc:'Maksimum 5 öğe. Sürükleyerek sıralayın, + ile ekleyin, × ile kaldırın.',
      bottombarDesc2:'Sıralama ve özelleştirme',
      bottombarActive:'Aktif Öğeler',
      bottombarAvailable:'Eklenebilecek Öğeler',
      quickActionsTitle:'Hızlı İşlemler',
      quickActionsDesc:'Sağdaki + butonundan erişilen hızlı aksiyonlar',

      // Analiz sayfası
      analyticsTitle:'Analiz',
      analyticsSubTitle:'Finansal tablonuzu keşfedin',
      periodThisMonth:'Bu Ay',
      period3Month:'3 Ay',
      period6Month:'6 Ay',
      period1Year:'1 Yıl',
      trendTitle:'Gelir / Gider Trendi',
      trendIncome:'Gelir',
      trendExpense:'Gider',
      savingsScoreTitle:'Tasarruf Skoru',
      forecastTitle:'Önümüzdeki Ay Tahmini',
      forecastBadge:'Geçmişe Dayalı',
      donutTitle:'Harcama Dağılımı',
      donutHint:'Kategoriye tıklayın, işlemleri görün',
      donutExpense:'Gider',
      donutIncome:'Gelir',
      categoriesTitle:'Kategoriler',
      habitTitle:'Alışkanlık Analizi',
      budgetSectionTitle:'Aylık Kategori Bütçeleri',
      addLimit:'Limit Ekle',
      sagiAssistantName:'SAGI Asistan',
      sagiAssistantLoading:'Verileriniz analiz ediliyor...',

      // Bildirimler — eksik olanlar
      notifMasterTitle:'Bildirimleri Etkinleştir',
      notifMasterSubtitle:'Tüm bildirimleri açın veya kapatın',
      notifCreditCard:'Kredi Kartı Ödeme Günü',
      notifCreditCardDesc:'Ödeme tarihinden 3 gün önce ve gün gelince uyar',
      notifBudgetDesc2:'%80 dolduğunda ve limit aşıldığında bildir',
      notifGoal:'Birikim Hedefi',
      notifGoalDesc:'%75 ve %90\'a ulaşınca & hedef tarihi yaklaşınca bildir',
      notifBigSpend:'Büyük Harcama Uyarısı',
      notifBigSpendDesc:'Ortalamanın 5 katını aşan harcamalarda bildir',
      notifFx:'Döviz Kuru Değişimi',
      notifFxDesc:'USD/TRY %3+ hareket ettiğinde uyar',
      notifInboxTitle:'Bildirimler',
      notifInboxSubtitle:'Tüm bildirimleriniz burada',
      notifInboxEmpty:'Bildirim yok',
      notifInboxEmptyDesc:'Ayarlardan bildirimleri etkinleştirdiğinizde burada görünecek.',
      notifMarkAllRead:'Tümünü Okundu İşaretle',
      notifClearAll:'Temizle',
      notifAllRead:'Tüm bildirimler okundu işaretlendi.',
      notifClearConfirm:'Tüm bildirimler silinecek. Devam?',
      notifFilterAll:'Tümü',
      notifFilterUnread:'Okunmamış',
      notifFilterRecurring:'Abonelik',
      notifFilterDebts:'Borç',
      notifFilterGoals:'Hedef',
      
      // Veri yönetimi — eksik olanlar
      backupHintJson:'JSON — tüm veriler, geri yükleme için.',
      backupHintCsv:'CSV — işlem geçmişi, Excel\'de açılır.',
      deleteAccount:'Hesabı Sil',

      // Import modal
      importModalTitle:'Yedek Yükle',
      importMergeTitle:'Üstüne Yaz',
      importMergeDesc:'Mevcut verileriniz korunur. Aynı kayıtlar güncellenir, yeni kayıtlar eklenir. Güvenli seçenek.',
      importReplaceTitle:'Tüm Verileri Değiştir',
      importReplaceDesc:'Mevcut tüm veriler silinir ve yalnızca bu dosyadaki veriler yüklenir. Geri alınamaz.',
      importReplaceWarn:'Mevcut hesaplarınız, işlemleriniz ve tüm verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      importActionBtn:'Yükle',

      // Bulut senkronizasyonu
      cloudUnavailTitle:'Bulut Servisi Kullanılamıyor',
      cloudUnavailDesc:'Firebase SDK yüklenemedi veya bağlantı kurulamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin. Uygulama çevrim dışı modda çalışmaya devam ediyor.',
      cloudUnavailNote:'Bulut servisine ulaşılamıyor. Şu an çevrim dışı moda geçirildi; istediğiniz zaman Ayarlar bölümünden tekrar deneyebilirsiniz.',
      cloudInactiveDesc:'Verilerinizi birden fazla cihazda kullanmak için bulut senkronizasyonunu etkinleştirin.',
      cloudCreateBtn:'Yeni Hesap Oluştur',
      cloudConnectBtn:'Mevcut Hesaba Bağlan',
      cloudKeyTitle:'Senkronizasyon Anahtarı',
      cloudKeyHint:'Bu anahtarı güvende saklayın. Başka bir cihazda giriş yapmak için kullanacaksınız.',
      cloudCopyKey:'Anahtarı Kopyala',
      cloudForceSync:'Senkronize Et',
      cloudSignOut:'Bağlantıyı Kes',
      cloudSignedOut:'Bulut bağlantısı kesildi.',
      cloudStatusIdle:'Bağlı değil',
      cloudStatusSyncing:'Senkronize ediliyor...',
      cloudStatusOk:'Senkronize',
      cloudStatusError:'Bağlantı hatası',
      cloudStatusOffline:'Çevrim dışı',
      cloudSyncing:'Senkronizasyon başlatıldı.',
      cloudCreated:'Hesap oluşturuldu! Anahtarınız: {key} — Lütfen kaydedin, bir daha gösterilmeyecek.',
      cloudCreateFail:'Hesap oluşturulamadı. Lütfen tekrar deneyin.',
      cloudInitFail:'Bulut servisi kullanılamıyor.',
      cloudLoginOk:'Giriş başarılı, veriler senkronize edildi.',
      cloudLoginFail:'Giriş başarısız. Anahtarı kontrol edip tekrar deneyin.',

      // Onboarding — bulut adımı
      obKeyChecking:'Kontrol ediliyor...',
      obKeyCreating:'Hesap oluşturuluyor...',
      obKeyCreateBtn:'Anahtar Oluştur',
      obKeyLoginBtn:'Giriş Yap',
      obKeyInvalid:'Geçersiz anahtar. XXXX-XXXX-XXXX-XXXX formatında girin.',
      obKeyNotFound:'Bu anahtar bulunamadı. Lütfen kontrol edip tekrar deneyin.',
      obKeySuggestSkip:"Bu adımı atlayıp daha sonra Ayarlar'dan bağlanabilirsiniz.",

      // Genel eksikler
      reload:'Yenile',
      ratesUpdated:'Kurlar güncellendi.',
      msgCopied:'Kopyalandı!',


      // Diğer
      diffDays0:'Bugün', diffDaysAgo:'{n} gün önce', diffDaysAhead:'{n} gün sonra',
      kurToastMsg:'Güncel kur verilerine ulaşmak için internet bağlantınızı açın.',
      debtDir_borc:'Borç', debtDir_alacak:'Alacak',
      insightHigh:'Bu ay en yüksek harcamanız <b>{cat}</b> kategorisinde ({amount}).',
      insightDefault:'İşlemlerinizi ekledikten sonra buraya harcama analiziniz görünecek.',
      insightOver:' Bütçe limitini aştınız!',
      insightClose:' Bütçe limitinize yaklaşıyorsunuz.',
      insightOk:' Bütçenizi iyi yönetiyorsunuz.',
      insightTitle:'SAGI Finance Analiz',
      categoryPickerTitle:'Kategori Seçin',

      savingsDeposit:'Hedefe Yatırım: {name}', savingsWithdraw:'Hedeften Çekim: {name}',
      transferSent:'Transfer Gönderildi: {name}', transferReceived:'Transfer Alındı: {name}',
      transferToGoal:'Hedefe Transfer: {name}',
      debtTaken:'Borç Alındı: {name}', debtGiven:'Borç Verildi: {name}',
      debtPayment:'Borç Ödemesi: {name}', debtCollection:'Tahsilat: {name}',
      subscriptionLabel:'{name} (Abonelik)', ccPaymentLabel:'Kart Ödemesi: {name}',

      yes:'Evet', no:'Hayır', ok:'Tamam', approve:'Onayla',

      // Yaklaşan ödemeler etiketleri
      upcomingToday:'Bugün!', upcomingLate:'Geciken ödeme ({n} gün)',
      upcomingInDays:'{n} gün sonra — Ayın {day}\'i',

      // Bildirim mesajları (push)
      notifTodayPay:'Bugün {name} ödemesi: {amount}',
      notif3Days:'{name} ödemesi 3 gün sonra: {amount}',
      notif1Day:'{name} yarın ödeniyor: {amount}',
      notifLate:'{name} ödemesi {n} gün gecikti!',
      notifBudgetMsg:'{cat} kategorisinde bütçenizin %{perc}\'ini kullandınız.',
      notifDebtDue:'{name} — {date} tarihinde {amount} {dir} vadesi geliyor.',

      // ── Döviz Kurları — para birimi adları ve zaman ───────────────────
      curNameUSD:'Amerikan Doları',
      curNameEUR:'Euro',
      curNameGBP:'İngiliz Sterlini',
      curNameTRY:'Türk Lirası',
      curMainSuffix:'(Ana Para Birimi)',
      ratesAgeJustNow:'Az önce',
      ratesAgeMinutes:(m)=>`${m} dk önce`,
      ratesAgeHours:(h)=>`${h} sa önce`,
      ratesAgeDays:(d)=>`${d} gün önce`,

      // ── Hesap Türü ─────────────────────────────────────────────────────
      walletTypeCash:'Nakit',
      walletTypeBank:'Banka Hesabı',
      walletTypeCredit:'Kredi Kartı',
      walletTypeInvest:'Yatırım',

      // ── FX önizleme etiketleri ────────────────────────────────────────
      fxDeductedFromWallet:'Hesaptan düşülecek',
      fxAddedToWallet:'Hesaba eklenecek',
      fxAddedToGoal:'Hedefe yansıyacak',
      fxDeductedFromGoal:'Hedeften düşülecek',
      fxRecipientWallet:'Karşı hesaba yatacak',
      fxRecordDeducted:'Kayıt tutarından düşülecek',
      fxSameCurrency:'Aynı para birimi · Kur uygulanmadı',
      fxRateApplied:'Kur otomatik uygulandı',
      fxTxCurrencyAmount:'İşlem dövizinde tutar',

      // ── Kredi kartı ────────────────────────────────────────────────────
      ccDebtBadge:'Borç',
      ccRemainingLimit:'Kalan Limit',
      ccCardDetailBtn:'Kart Detayı',
      ccPaidThisMonthBadge:'Bu Ay Ödendi',
      ccCreditDebtFallback:'Kredi Kartı Borcu',

      // ── İşlem detay modal ─────────────────────────────────────────────
      txDetailDate:'Tarih',
      txDetailCategory:'Kategori',
      txDetailAccount:'Hesap',
      txDetailDescription:'Açıklama',
      txDetailEdit:'Düzenle',

      // ── Filtre göster/gizle ────────────────────────────────────────────
      filterShow:'Göster',
      filterHide:'Gizle',

      // ── Borç & Alacak modal ───────────────────────────────────────────
      debtTypeLabel:'Tür',
      debtDirDebt:'Borç',
      debtDirReceivable:'Alacak',

      // ── Abonelik oto ödeme ────────────────────────────────────────────
      autoPaySectionTitle:'Otomatik Ödeme Talimatı',
      autoPayBtnDisabledTitle:'Otomatik ödeme aktif',

      // ── Alt menü ──────────────────────────────────────────────────────
      bottombarReset:'Sıfırla',
      quickActionsResetBtn:'Sıfırla',
      msgBottombarReset:'Alt menü sıfırlandı.',
      msgMaxItemsReached:(n)=>`Maksimum ${n} öğe eklenebilir.`,
      bnavMaxWarn:(n)=>`Maksimum ${n} öğeye ulaşıldı. Eklemek için önce bir öğeyi kaldırın.`,

      // ── Ayarlar SAGI Plus satırı ──────────────────────────────────────
      sagiPlusTitle:'SAGI Plus',
      sagiPlusSubtitle:'Premium özellikler',
      sagiPlusSubtitleFull:'Premium özellikler ve avantajlar',

      // ── Bildirimler — inbox grup başlıkları ──────────────────────────
      notifGroupToday:'Bugün',
      notifGroupWeek:'Bu Hafta',
      notifGroupOlder:'Daha Önce',

      // ── Bildirimler — title'lar ───────────────────────────────────────
      notifTitleSub:'SAGI — Abonelik',
      notifTitleDebt:'SAGI — Borç/Vade',
      notifTitleCC:'SAGI — Kredi Kartı',
      notifTitleGoal:'SAGI — Birikim Hedefi',
      notifTitleBigSpend:'SAGI — Büyük Harcama',
      notifTitleFx:'SAGI — Döviz Kurları',
      notifTitleWeekly:'SAGI — Haftalık Özet',
      notifTitleBudgetWarn:'SAGI — Bütçe Uyarısı',
      notifTitleBudgetOver:'SAGI — Bütçe Aşıldı!',
      notifGoalMilestone:(name,pct)=>`${name} hedefine %${pct} ulaştın! Azıcık kaldı!`,
      notifGoalDate:(name,diffD,pct)=>`${name} hedef tarihine ${diffD===0?'bugün':diffD+' gün'} kaldı. %${pct} tamamlandı.`,
      notifBigSpendMsg:(desc,amt)=>`Normalin 5 katı harcama! ${desc}: ${amt}`,
      notifFxRose:'yükseldi',
      notifFxFell:'düştü',
      notifFxMsg:(change,dir)=>`USD/TRY bugün %${change} ${dir}. Portföyünüzü kontrol edin.`,
      notifWeeklyMsg:(inc,exp,sign,net)=>`Geçen hafta: ${inc} gelir, ${exp} gider. Net: ${sign}${net}`,
      notifBudgetWarnMsg:(cat,perc)=>`${cat} bütçesinin %${perc}'ini kullandınız!`,
      notifBudgetOverMsg:(cat,perc)=>`${cat} bütçesi aşıldı! (%${perc})`,

      // ── Analiz ekranı ─────────────────────────────────────────────────
      analyticsPeriodIncome:(p)=>p===1?'Bu Ay':p===3?'3 Aylık':p===6?'6 Aylık':'Yıllık',
      analyticsKpiIncome:'Gelir',
      analyticsKpiExpense:'Gider',
      analyticsKpiNet:'Net Birikim',
      analyticsKpiDailyAvg:'Günlük Ort. Gider',
      analyticsDeltaVsPrev:'geçen aya göre',
      analyticsKpiSavingsOf:'Gelirin',
      analyticsShowAllCats:(n)=>`Tümünü Gör (${n} daha)`,
      analyticsMonthLocale:'tr-TR',

      // ── Bulut sync ────────────────────────────────────────────────────
      cloudUpdatedFromCloud:'Buluttan güncellendi ✓',
      cloudAlreadyUpToDate:'Zaten güncel ✓',
      cloudPushedToCloud:'Buluta gönderildi ✓',

      // ── Hesap dropdown fallback ───────────────────────────────────────
      noWalletOption:'Hesap yok',

      // ── Yasal onay (onboarding) ───────────────────────────────────────
      obConsentTerms:'Kullanım Şartları',
      obConsentPrivacy:'Gizlilik Politikası',
      obConsentCheckbox:'\'nı ve \'nı okudum ve kabul ediyorum. 18 yaşını doldurduğumu beyan ederim.',
    }
  },

  /* ═══════════════════════════════ ENGLISH ═══════════════════════════════ */
  en: {
    appName: 'SAGI Finance',
    cats: {
      groups: [
        { g: 'Daily Spending',     items: ['Groceries','Food Delivery','Restaurant & Cafe','Personal Care','Clothing','Home Goods','Electronics'] },
        { g: 'Bills & Rent',       items: ['Rent','Electricity','Water','Gas','Internet','Phone Bill','HOA Fees'] },
        { g: 'Transportation',     items: ['Public Transit','Fuel','Parking','Vehicle Maintenance','Taxi & Ride Share'] },
        { g: 'Health',             items: ['Hospital & Clinic','Pharmacy','Insurance','Sports & Fitness'] },
        { g: 'Education & Culture',items: ['Books & Stationery','Courses','Cinema & Theater','Music & Streaming','Gaming'] },
        { g: 'Planning',           items: ['Travel & Vacation','Gift','Savings','Investment'] },
        { g: 'Income',             items: ['Salary','Freelance','Rental Income','Interest & Dividends','Bonus','Other Income'] },
        { g: 'Other',              items: ['Transfer','Debt Received','Debt Given','Other'] },
      ]
    },
    ui: {
      // Navigation
      dashboard:'Dashboard', netWorth:'Net Worth', monthExpense:'This Month Expenses', monthIncome:'This Month Income',
      cashFlow:'Monthly Cash Flow', goals:'Goals', debts:'Debts & Receivables', debtSummary:'Debts & Receivables',
      recentTx:'Recent Transactions', upcoming:'Upcoming Payments', wallets:'Accounts', transactions:'Transactions',
      recurring:'Subscriptions', analytics:'Analytics', settings:'Settings', privacyPolicy:'Privacy Policy',
      mainMenu:'Main Menu',

      // Common actions
      addWallet:'Add Account', addTx:'Add Transaction', addRecurring:'Add Subscription', addGoal:'Add Goal',
      addDebt:'Add Debt', addReceivable:'Add Receivable', addLimit:'Add Limit', addFirstTx:'Add First Transaction',
      save:'Save', cancel:'Cancel', delete:'Delete', edit:'Edit',
      confirm:'Yes, Proceed', confirmTitle:'Confirmation Needed',
      all:'All', reset:'Reset', select:'Select',
      showAll:'Show All', showLess:'Show Less', showMore:'Show More',
      transferBtn:'Transfer', payBtn:'Pay', payNow:'Pay Now',

      // Form labels
      expense:'Expense', income:'Income', category:'Category', account:'Account', amount:'Amount',
      date:'Date', description:'Description', type:'Type',
      selectCategory:'Select Category', selectAccount:'Select account',
      langSelect:'Language', langTr:'Türkçe', langEn:'English',
      theme:'Theme', themeLight:'Light', themeDark:'Dark',
      animations:'Animations', animOn:'On', animOff:'Off',
      yourName:'Your Name', yourNameHint:'For the greeting message.',
      currency:'Currency', currencyHint:'Applied to all screens.',
      themeHint:'Light or dark mode.', animHint:'Transition effects.', langHint:'Application language.',

      // Dashboard
      dashSubtitle:'Your financial summary',
      goodMorning:'Good Morning', goodDay:'Good Day', goodEvening:'Good Evening',
      noTx:'No transactions yet.', noGoal:'No goals yet.', noRecNote:'No subscriptions.',
      noDebt:'No records.', noUpcomingPayments:'No upcoming payments.',
      viewAll:'View All',

      // Wallets
      walletsSubtitle:'All your accounts and balances',
      emptyWalletTitle:'Create Your First Account',
      emptyWalletDesc:'Start by adding cash, a bank account, or a credit card.',
      addTxOnCard:'Add Tx', viewHistory:'View History',
      walletNameLabel:'Account Name', walletNamePh:'e.g. Chase Checking',
      balance:'Balance', accountType:'Account Type',
      typeCash:'Cash', typeBank:'Bank Account', typeCredit:'Credit Card', typeInvest:'Investment',
      colorLabel1:'Color 1', colorLabel2:'Color 2',
      bnavItemAdded:'Item added.', bnavItemRemoved:'Item removed.',
      walletCurLabel:'Account Currency', walletCurHint:'(Optional — for non-default currencies)',
      cardColor:'Card Color', custom:'Custom:',
      newWallet:'New Account', editWallet:'Edit Account',
      // Credit card fields
      ccMinPayLabel:'Minimum Payment',
      ccMinModeFixed:'Fixed Amount',
      ccMinModeRate:'Rate (%)',
      ccMinRatePreview:({rate,amt})=>`${rate}% of current debt = ${amt}`,
      payMinBtn:'Minimum',
      payFullBtn:'Full Amount',
      payCardMinInfo:({amt,rate})=>`Defined minimum payment: ${amt}${rate}`,
      ccDebt:'Current Debt', ccDebtHint:'Your current card debt',
      ccCutoffDay:'Statement Day', ccCutoffHint:'Day of month statement is generated',
      ccDueDay:'Due Day', ccDueHint:'Day of month payment is due',
      ccAvailable:'Available', ccUsed:'Used',
      ccCurrentDebt:'Current Debt',
      ccUsageLabel:'Usage',
      ccUsagePct:'Usage %',
      ccType:'Credit Card',
      ccCutoffLabel:'Statement',
      ccDueLabel:'Due Date',
      ccDaysLeft:'Time Left',
      ccAllTx:'All Transactions',
      ccPayNow:'Pay Now',
      ccCardDetail:'Card Detail',
      ccDueToday:'Due today!',
      ccDaysRemaining:(n)=>`${n} days left`,
      ccDayOfMonth:(n)=>`Day ${n}`,
      ccDueUrgentDay:'Today!',
      ccDaysRemainingShort:(n)=>`${n} days`,
      noData:'No data',
      autoPayDesc:'Automatically deducted from account on payment day',
      autoPayActive:'Auto payment active',
      autoPaySchedule:(day)=>`On payment day (<strong>${day}</strong>), a transaction will be automatically recorded from the selected account.`,
      autoPayWarn:'Auto payment only works when the app is open. Pending payments are processed each time you open the app.',
      autoPayProcessed:(n)=>`${n} automatic payment(s) processed.`,
      csvIncome:'Income', csvExpense:'Expense',
      notifRecurring3d:(name,amt)=>`${name} payment due in 3 days: ${amt}`,
      notifRecurring1d:(name,amt)=>`Tomorrow: ${name} payment — ${amt}`,
      notifRecurring0d:(name,amt)=>`${name} payment due today: ${amt}`,
      notifRecurringLate:(name,n)=>`${name} payment is ${n} days overdue!`,
      notifDebtMsg0:(name,amt)=>`Today: ${amt} due for ${name}.`,
      notifDebtMsgN:(n,name,amt)=>`In ${n} days: ${name} — ${amt}`,
      notifCCMsg0:(name,amt)=>`Today is ${name} payment day! Balance: ${amt}`,
      notifCCMsgN:(name,n,amt)=>`${name} payment due in ${n} days. Balance: ${amt}`,
      chartIncomeLabel:'Income',
      chartExpenseLabel:'Expense',
      payCard:'Pay Card', payCardTitle:'Credit Card Payment',
      payAmount:'Payment Amount', payFromWhich:'Pay from which account?',

      // Transactions
      txSubtitle:'All your income and expenses',
      emptyTxTitle:'No Transactions Yet', emptyTxDesc:'Track your budget by adding income and expenses.',
      filterToggle:'Filters',filterDate:'Date', filterAllTimes:'All Time', filterThisMonth:'This Month', filterLastMonth:'Last Month',
      filterLast3:'Last 3 Months', filterLast6:'Last 6 Months', filterLastYear:'Last Year', filterCustom:'Custom Range',
      filterSearch:'Search', filterSearchPh:'Description...', filterType:'Type',
      filterIncome:'Income (+)', filterExpense:'Expense (-)',
      filterAllWallets:'All Accounts', deleteFiltered:'Delete Filtered',
      totalTx:'0 transactions total', noMatch:'No records match the filter.',
      th_date:'Date', th_desc:'Description', th_cat:'Category', th_wallet:'Account',
      th_amount:'Amount', th_action:'Action',
      txAmountHint:'in', txAmountConv:'≈ {amount} (in main currency)',
      amountPh:'0.00', descPh:'Add a short note...',
      newTx:'New Transaction', editTx:'Edit Transaction',
      keepOpen:'Save and add another',
      deleted:'Deleted', records:'records',
      selectMode:'Select', cancelSelect:'Cancel',
      deleteSelected:'Delete Selected', confDelSelected:'{n} transactions will be deleted. Continue?',
      msgSelectedDeleted:'Selected transactions deleted.',

      // Recurring
      recSubtitle:'Your regular fixed payments',
      emptyRecTitle:'No Subscriptions',
      emptyRecDesc:'Add regular payments like rent, bills or Netflix.',
      recNameLabel:'Subscription Name', recNamePh:'e.g. Netflix, Rent, Electricity',
      monthlyAmount:'Monthly Amount', dayOfMonth:'Day of Month?',
      payFromAccount:'Paying Account', onDayOfMonth:'On day {day}',
      editRecurring:'Edit Subscription',
      paidThisMonth:'Paid this month', notPaidYet:'Not paid yet',
      paymentDay:'Payment day', payNowConfirm:'Pay Subscription',
      msgPayConfirmDone:'Payment processed and recorded.',
      payConfirmTitle:'Confirm Payment', payConfirmFrom:'Pay from which account?',

      // Goals
      goalsSubtitle:'Your savings plans and progress',
      emptyGoalTitle:'No Goals Yet',
      emptyGoalDesc:'Create a savings goal for a car, vacation, or emergency fund.',
      goalNameLabel:'Goal Name', goalNamePh:'e.g. Car Down Payment, Vacation',
      targetAmount:'Target Amount', currentAmount:'Current Savings',
      targetDateOpt:'Target Date (Optional)',
      deposit:'Deposit', withdraw:'Withdraw',
      newGoal:'New Goal', editGoal:'Edit Goal',
      goalDepositTitle:'Deposit to Goal', goalWithdrawTitle:'Withdraw from Goal',
      fromWhichAccount:'From which account?',
      monthsLeft:'months left', timeUp:'Time up', endDateLabel:'End date:',
      daysLeft:'days left', weeksLeft:'weeks left',

      // Debts
      debtsSubtitle:'Your financial obligations',
      myDebts:'My Debts', myReceivables:'My Receivables',
      personOrInst:'Person or Institution', personPh:'To / From whom?',
      endDateOpt:'End Date (Optional)',
      reflectToBalance:'Reflect on account balance', accountOptional:'Account (Optional)',
      payDebtTitle:'Make Payment', collectTitle:'Collect',
      partialPay:'Partial Payment', onlyRecord:'Record only',
      noDebtRec:'No debt records.', noReceivableRec:'No receivable records.',
      dueDate:'Due:', noDueDate:'No due date',
      addRecord:'Add Record', editRecord:'Edit Record',

      // Analytics
      analyticsSubtitle:'Spending stats and limits',
      thisMonthIncome:'Income This Month', thisMonthExpense:'Expense This Month', netSavings:'Net Savings',
      last6Months:'Last 6 Months Trend', thisMonthCat:'This Month by Category',
      categories:'Categories', catBudgets:'Category Budgets',
      noExpData:'No expenses this month.', noLimitSet:'No limits set yet.',
      budgetTitle:'Set Budget Limit', monthlyLimit:'Monthly Limit',
      dataNone:'No Data', total:'Total',
      spent:'Spent', limit:'Limit:',
      catChartHint:'Tap a category or chart slice → see transactions',
      thisMonthTotal:'Total This Month', noTxThisMonth:'No transactions this month',
      moreCategories:'more categories',

      // Transfer
      transfer:'Transfer', transferFrom:'From?', transferTo:'To?',
      completeTransfer:'Complete Transfer', accounts:'Accounts', goalsLabel:'Goals',

      // Settings
      settingsSubtitle:'Manage your preferences',
      personalization:'Personalization',
      notifTitle:'Notifications', notifDesc:'Get reminders for upcoming payments and due dates.',
      notifAskPermMsg:'Click to allow notifications.',
      notifAskPermBtn:'Enable Notifications', notifActive:'✓ Notifications active',
      notifMaster:'Enable Notifications', notifMasterOn:'Notifications enabled',
      notifMasterOff:'Slide to disable all notifications',
      notifSub:'Subscription Reminders', notifSubDesc:'Notify 3 days, 1 day before & on payment day',
      notifDebt:'Debt & Due Date Alerts', notifDebtDesc:'Notify 3 days ahead',
      notifBudget:'Budget Limit Alert', notifBudgetDesc:'Notify at 80%',
      notifWeekly:'Weekly Summary', notifWeeklyDesc:'Every Monday',
      ratesTitle:'Exchange Rates', ratesDesc:'Current rates against your main currency.',
      ratesLoading:'Loading...', ratesLastUpdate:'Last update:',
      ratesNotUpdated:'Not updated', ratesRefresh:'Refresh Rates',
      dataManagement:'Data Management',
      dataDesc:'Your data is stored only on this device. Regular backups are recommended.',
      backup:'Backup', restore:'Restore', chooseFile:'Choose File (.json)', deleteAll:'Delete All Data',
      backupHint:'JSON — full data, for restore. CSV — transaction history, opens in Excel.',
      backupHintHtml:'JSON — full data, for restore.<br>CSV — transaction history, opens in Excel.',
      restoreHint:'Only JSON backup files are supported.',
      legalTitle: 'Legal Agreements',
      legalHint: 'Privacy, terms, about',
      termsTitle: 'Terms of Service',
      termsHint: 'Rules & liability',
      aboutTitle: 'About',
      aboutHint: 'Project & technology',
      faqHint: 'Frequently asked questions',
      contactTitle: 'Contact',
      contactHint: 'Feedback & support',
      privacyHint: 'Data & security',
      
      // Onboarding
      obWelcome:'Easily manage all your assets and spending from one screen.',
      obStart:"Let's Get Started",
      obMeet:'Nice to meet you', obMeetDesc:'What should we call you?',
      obNamePh:'Your name or nickname', obBack:'Back', obNext:'Continue',
      obPrefs:'Your Preferences', obPrefsDesc:'Let us tailor the app to you.',
      obFinish:'Open SAGI',

      // Toasts / messages
      msgSaved:'Transaction saved.', msgAccSaved:'Account saved.', msgAccDeleted:'Account deleted.',
      msgTxDeleted:'Transaction deleted, balance updated.',
      msgTxDuped:'Transaction duplicated, balance updated.',
      msgKeepGoing:'Saved, ready for the next one.',
      msgAmountReq:'Please enter an amount.', msgAccReq:'Please select an account.',
      msgCatReq:'Please select a category.',
      msgAccFirst:'You need to add an account first.',
      msgAccFirst2:'Please add an account first.',
      msgAccFirstTransfer:'You need at least one account to transfer.',
      msgRecAdded:'Subscription added.', msgRecUpdated:'Subscription updated.',
      msgRecNameReq:'Please enter a subscription name.', msgRecDeleted:'Subscription deleted.',
      msgRecFullDelete:'Subscription and related transactions deleted, balances corrected.',
      msgGoalSaved:'Goal saved.', msgGoalDeleted:'Goal deleted.',
      msgActionDone:'Done.',
      msgRecordAdded:'Record added.', msgRecordDeleted:'Record deleted.',
      msgTransferDone:'Transfer completed.',
      msgLimitSaved:'Budget limit saved.', msgLimitRemoved:'Limit removed.',
      msgLimitExists:'A limit for this category already exists!',
      msgPayRecorded:'Payment recorded.', msgFullyClosed:'Record fully closed.',
      msgOverpayCreated:'Overpayment created a counter-record.',
      msgRatesUpdated:'Rates updated.', msgBackupDone:'Backup downloaded.',
      msgCsvDone:'CSV downloaded.', msgImportInvalidExt:'Please choose a .json backup file.',
      msgImportDone:'Data imported, reloading...',
      msgImportInvalid:'Invalid file format.', msgImportFail:'Could not read file.',
      msgPrivacyOn:'Privacy mode on', msgPrivacyOff:'Privacy mode off',
      msgDark:'Dark mode active', msgLight:'Light mode active',
      msgPrefsSaved:'Preferences saved.',
      msgTrSelected:'Türkçe seçildi', msgEnSelected:'English selected',
      msgNotifActive:'Notifications enabled!', msgNotifDenied:'Notification permission denied.',
      msgNotifFail:'Could not request notification permission.',
      msgNotifUnsup:'This browser does not support notifications.',
      msgNotifOn:'Notification enabled.', msgNotifOff:'Notification disabled.',
      msgNotifAllOn:'Notifications enabled.', msgNotifAllOff:'Notifications disabled.',
      msgRecProcessed:'{n} subscription(s) processed.',
      msgPayDone:'Payment made.', msgCcPaid:'{amount} paid towards card debt.',
      msgSameWallet:'Cannot transfer to the same account.',
      msgInsuffBalance:'Insufficient balance.',

      // Confirms
      confDelTx:'Delete this transaction? The account balance will be reverted.',
      confDelTxBulk:'{n} records will be deleted and account balances reverted. Continue?',
      confDelWallet:'Account "{name}" has {n} linked transactions. Deleting the account will also delete them. Continue?',
      confDelWalletSimple:'Delete this account?',
      confDelGoal:'Delete this goal? Past transactions tied to the goal will remain — only the goal is removed.',
      confDelRec:'Subscription "{name}" has {n} linked transactions. Revert and delete them too? (Cancel keeps history and only removes the subscription.)',
      confDelRecSimple:'Delete this subscription?',
      confDelDebt:'Delete this record?',
      confDelLimit:'Remove this budget limit?',
      confFactory:'ALL DATA WILL BE DELETED! This cannot be undone. Continue?',
      confNotifPerm:'SAGI Finance can send reminders for subscriptions, debt deadlines, and budget alerts. Allow notifications?',
      confCloudCreate:'Your local data will be uploaded to Firebase under an anonymous key and sync will begin.\n\n⚠️ Save your key — if you lose it, you will not be able to access your cloud data again.\n\nAs stated in our Privacy Policy, no identity information is collected. Continue?',
      confCloudSignOut:'Cloud connection will be disconnected on this device. Your data will remain here. Continue?',

      // Cloud sync
      cloudUnavailTitle:'Cloud Service Unavailable',
      cloudUnavailDesc:'Firebase SDK could not be loaded or connection failed. Check your internet connection and reload the page. The app continues working in offline mode.',
      cloudUnavailNote:'Cloud service unavailable. Running in offline mode — you can reconnect anytime from Settings.',
      cloudInactiveDesc:'Enable cloud sync to access your data across multiple devices.',
      cloudCreateBtn:'Create New Account',
      cloudConnectBtn:'Connect Existing Account',
      cloudKeyTitle:'Sync Key',
      cloudKeyHint:'Keep this key safe. You will need it to sign in on another device.',
      cloudCopyKey:'Copy Key',
      cloudForceSync:'Sync Now',
      cloudSignOut:'Disconnect',
      cloudSignedOut:'Cloud connection disconnected.',
      cloudStatusIdle:'Not connected',
      cloudStatusSyncing:'Syncing...',
      cloudStatusOk:'Synced',
      cloudStatusError:'Connection error',
      cloudStatusOffline:'Offline',
      cloudSyncing:'Sync started.',
      cloudCreated:'Account created! Your key: {key} — Save it now, it won\'t be shown again.',
      cloudCreateFail:'Could not create account. Please try again.',
      cloudInitFail:'Cloud service unavailable.',
      cloudLoginOk:'Login successful, data synced.',
      cloudLoginFail:'Login failed. Please check your key and try again.',

      // Onboarding — cloud step
      obKeyChecking:'Checking...',
      obKeyCreating:'Creating account...',
      obKeyCreateBtn:'Create Key',
      obKeyLoginBtn:'Sign In',
      obKeyInvalid:'Invalid key. Please enter in XXXX-XXXX-XXXX-XXXX format.',
      obKeyNotFound:'Key not found. Please check and try again.',
      obKeySuggestSkip:'You can skip this step and connect later from Settings.',

      // General missing
      reload:'Reload',
      ratesUpdated:'Rates updated.',
      msgCopied:'Copied!',


      // Other
      diffDays0:'Today', diffDaysAgo:'{n} days ago', diffDaysAhead:'in {n} days',
      kurToastMsg:'Go online to fetch the latest exchange rates.',
      debtDir_borc:'Debt', debtDir_alacak:'Receivable',
      insightHigh:'Your biggest spending this month is in <b>{cat}</b> ({amount}).',
      insightDefault:'Your spending analysis will appear here once you add transactions.',
      insightOver:' You exceeded the budget limit!',
      insightClose:' You are close to your budget limit.',
      insightOk:' You are managing your budget well.',
      insightTitle:'SAGI Finance Insights',
      categoryPickerTitle:'Select Category',

      savingsDeposit:'Deposit to Goal: {name}', savingsWithdraw:'Withdraw from Goal: {name}',
      transferSent:'Transfer Sent: {name}', transferReceived:'Transfer Received: {name}',
      transferToGoal:'Transfer to Goal: {name}',
      debtTaken:'Debt Received: {name}', debtGiven:'Debt Given: {name}',
      debtPayment:'Debt Payment: {name}', debtCollection:'Collection: {name}',
      subscriptionLabel:'{name} (Subscription)', ccPaymentLabel:'Card Payment: {name}',

      yes:'Yes', no:'No', ok:'OK', approve:'Confirm',

      // Upcoming labels
      upcomingToday:'Today!', upcomingLate:'Late payment ({n} days)',
      upcomingInDays:'in {n} days — Day {day} of month',

      // Push notification messages
      notifTodayPay:'Today is {name} payment: {amount}',
      notif3Days:'{name} payment in 3 days: {amount}',
      notif1Day:'{name} due tomorrow: {amount}',
      notifLate:'{name} payment is {n} days late!',
      notifBudgetMsg:'You used {perc}% of your budget in {cat}.',
      notifDebtDue:'{name} — {amount} {dir} due on {date}.',

      // ── Exchange Rates — currency names and time-ago ──────────────────
      curNameUSD:'US Dollar',
      curNameEUR:'Euro',
      curNameGBP:'British Pound',
      curNameTRY:'Turkish Lira',
      curMainSuffix:'(Main Currency)',
      ratesAgeJustNow:'Just now',
      ratesAgeMinutes:(m)=>`${m}m ago`,
      ratesAgeHours:(h)=>`${h}h ago`,
      ratesAgeDays:(d)=>`${d}d ago`,

      // ── Wallet type ───────────────────────────────────────────────────
      walletTypeCash:'Cash',
      walletTypeBank:'Bank Account',
      walletTypeCredit:'Credit Card',
      walletTypeInvest:'Investment',

      // ── FX preview labels ─────────────────────────────────────────────
      fxDeductedFromWallet:'Deducted from account',
      fxAddedToWallet:'Added to account',
      fxAddedToGoal:'Reflected to goal',
      fxDeductedFromGoal:'Deducted from goal',
      fxRecipientWallet:'Deposited to recipient account',
      fxRecordDeducted:'Deducted from record amount',
      fxSameCurrency:'Same currency · No rate applied',
      fxRateApplied:'Rate applied automatically',
      fxTxCurrencyAmount:'Amount in transaction currency',

      // ── Credit card ───────────────────────────────────────────────────
      ccDebtBadge:'Debt',
      ccRemainingLimit:'Remaining Limit',
      ccCardDetailBtn:'Card Detail',
      ccPaidThisMonthBadge:'Paid This Month',
      ccCreditDebtFallback:'Credit Card Debt',

      // ── Transaction detail modal ──────────────────────────────────────
      txDetailDate:'Date',
      txDetailCategory:'Category',
      txDetailAccount:'Account',
      txDetailDescription:'Description',
      txDetailEdit:'Edit',

      // ── Transaction filter show/hide ──────────────────────────────────
      filterShow:'Show',
      filterHide:'Hide',

      // ── Debt & Receivable modal ───────────────────────────────────────
      debtTypeLabel:'Type',
      debtDirDebt:'Debt',
      debtDirReceivable:'Receivable',

      // ── Subscription auto payment ─────────────────────────────────────
      autoPaySectionTitle:'Auto Payment Instruction',
      autoPayBtnDisabledTitle:'Auto payment active',

      // ── Bottom menu ───────────────────────────────────────────────────
      bottombarReset:'Reset',
      quickActionsResetBtn:'Reset',
      msgBottombarReset:'Bottom menu reset.',
      msgMaxItemsReached:(n)=>`Maximum ${n} items can be added.`,
      bnavMaxWarn:(n)=>`Maximum ${n} items reached. Remove one to add more.`,

      // ── Settings SAGI Plus row ────────────────────────────────────────
      sagiPlusTitle:'SAGI Plus',
      sagiPlusSubtitle:'Premium features',
      sagiPlusSubtitleFull:'Premium features and benefits',

      // ── Notifications — inbox group labels ────────────────────────────
      notifGroupToday:'Today',
      notifGroupWeek:'This Week',
      notifGroupOlder:'Earlier',

      // ── Notifications — titles ────────────────────────────────────────
      notifTitleSub:'SAGI — Subscription',
      notifTitleDebt:'SAGI — Debt/Due',
      notifTitleCC:'SAGI — Credit Card',
      notifTitleGoal:'SAGI — Savings Goal',
      notifTitleBigSpend:'SAGI — Large Expense',
      notifTitleFx:'SAGI — Exchange Rates',
      notifTitleWeekly:'SAGI — Weekly Summary',
      notifTitleBudgetWarn:'SAGI — Budget Alert',
      notifTitleBudgetOver:'SAGI — Budget Exceeded!',
      notifGoalMilestone:(name,pct)=>`You reached ${pct}% of the ${name} goal! Almost there!`,
      notifGoalDate:(name,diffD,pct)=>`${diffD===0?'Today':'In '+diffD+' days'} until the ${name} deadline. ${pct}% complete.`,
      notifBigSpendMsg:(desc,amt)=>`5x above average! ${desc}: ${amt}`,
      notifFxRose:'rose',
      notifFxFell:'fell',
      notifFxMsg:(change,dir)=>`USD/TRY ${dir} ${change}% today. Check your portfolio.`,
      notifWeeklyMsg:(inc,exp,sign,net)=>`Last week: ${inc} income, ${exp} expenses. Net: ${sign}${net}`,
      notifBudgetWarnMsg:(cat,perc)=>`You used ${perc}% of your ${cat} budget!`,
      notifBudgetOverMsg:(cat,perc)=>`${cat} budget exceeded! (${perc}%)`,

      // ── Analytics ────────────────────────────────────────────────────
      analyticsPeriodIncome:(p)=>p===1?'This Month':p===3?'3-Month':p===6?'6-Month':'Yearly',
      analyticsKpiIncome:'Income',
      analyticsKpiExpense:'Expenses',
      analyticsKpiNet:'Net Savings',
      analyticsKpiDailyAvg:'Daily Avg. Expense',
      analyticsDeltaVsPrev:'vs last month',
      analyticsKpiSavingsOf:'Of income',
      analyticsShowAllCats:(n)=>`Show All (${n} more)`,
      analyticsMonthLocale:'en-US',

      // ── Cloud sync ────────────────────────────────────────────────────
      cloudUpdatedFromCloud:'Updated from cloud ✓',
      cloudAlreadyUpToDate:'Already up to date ✓',
      cloudPushedToCloud:'Pushed to cloud ✓',
      cloudInactive: 'Cloud not connected',
      

      // ── Wallet dropdown fallback ──────────────────────────────────────
      noWalletOption:'No accounts',

      // Settings menu hints
      personalizationHint:'Name, currency, theme, language',
      notifMenuHint:'Reminders and alerts',
      ratesMenuHint:'Current exchange rates',
      cloudMenuHint:'Cross-device pairing',
      cloudSyncTitle:'Cloud Sync',
      cloudSyncDesc:'Use your key to access your data on other devices.',
      dataMenuHint:'Backup, restore, reset',
      cloudConnectTitle:'Connect with Your Key',
      cloudConnectDesc:'Enter the 16-digit key created on another device. Your local data will be replaced with cloud data.',
      cloudInactive:'Cloud not connected',

      // Onboarding — key step
      obKeyTitle:'Cloud Sync',
      obKeyDesc:'A unique 16-digit key is used to sync your data across devices. You can skip this step and connect later from Settings. The app works fully offline.',
      obKeyNew:'New Account',
      obKeyHave:'I Have a Key',
      obKeySkip:'Skip for Now',
      obKeyInfoTitle:'Cross-device pairing',
      obKeyInfoBody:'Save the generated key. You will need it to sign in on another device. Without the key, your data cannot be accessed.',
      obKeyLabel:'16-Digit Key',
      obKeyCreated:'Your key is ready!',
      obKeyCopy:'Copy',
      obKeyWarn:'Save this key somewhere safe. Without it, you cannot access your data from another device.',
      obKeySkipTitle:'Use on this device only',
      obKeySkipDesc:'Your data will only be stored on this device. You can create a key anytime from Settings → Cloud Sync.',
      obKeySkipBtn:'Continue (Offline)',

      // Bottom nav layout
      bottombarTitle:'Bottom Menu Layout',
      bottombarDesc:'Up to 5 items. Drag to reorder, + to add, × to remove.',
      bottombarDesc2:'Order and customise',
      bottombarActive:'Active Items',
      bottombarAvailable:'Available Items',
      quickActionsTitle:'Quick Actions',
      quickActionsDesc:'Quick actions accessed via the + button on the right',

      // Analytics page
      analyticsTitle:'Analytics',
      analyticsSubTitle:'Explore your financial picture',
      periodThisMonth:'This Month',
      period3Month:'3 Months',
      period6Month:'6 Months',
      period1Year:'1 Year',
      trendTitle:'Income / Expense Trend',
      trendIncome:'Income',
      trendExpense:'Expense',
      savingsScoreTitle:'Savings Score',
      forecastTitle:'Next Month Forecast',
      forecastBadge:'History-Based',
      donutTitle:'Spending Breakdown',
      donutHint:'Click a category to see transactions',
      donutExpense:'Expense',
      donutIncome:'Income',
      categoriesTitle:'Categories',
      habitTitle:'Habit Analysis',
      budgetSectionTitle:'Monthly Category Budgets',
      addLimit:'Add Limit',
      sagiAssistantName:'SAGI Assistant',
      sagiAssistantLoading:'Analysing your data...',

      // Notifications — missing
      notifMasterTitle:'Enable Notifications',
      notifMasterSubtitle:'Turn all notifications on or off',
      notifCreditCard:'Credit Card Payment Day',
      notifCreditCardDesc:'Alert 3 days before and on payment due date',
      notifBudgetDesc2:'Alert at 80% usage and when limit is exceeded',
      notifGoal:'Savings Goal',
      notifGoalDesc:'Alert at 75% and 90% milestones & when target date approaches',
      notifBigSpend:'Large Expense Alert',
      notifBigSpendDesc:'Alert when spending is 5x above average',
      notifFx:'Exchange Rate Change',
      notifFxDesc:'Alert when USD/TRY moves 3%+',
      notifInboxTitle:'Notifications',
      notifInboxSubtitle:'All your notifications in one place',
      notifInboxEmpty:'No notifications',
      notifInboxEmptyDesc:'Enable notifications in Settings and they will appear here.',
      notifMarkAllRead:'Mark All as Read',
      notifClearAll:'Clear All',
      notifAllRead:'All notifications marked as read.',
      notifClearConfirm:'All notifications will be deleted. Continue?',
      notifFilterAll:'All',
      notifFilterUnread:'Unread',
      notifFilterRecurring:'Subscriptions',
      notifFilterDebts:'Debts',
      notifFilterGoals:'Goals',

      // Data management — missing
      backupHintJson:'JSON — full data, for restore.',
      backupHintCsv:'CSV — transaction history, opens in Excel.',
      deleteAccount:'Delete Account',

      // Quick actions
      quickActionsLabel:'Quick',
      quickActionsHeader:'Quick Action',
      quickActionsReset:'Quick actions reset.',

      // Rates page
      ratesLastUpdate:'Last updated',
      ratesSource:'Source',
      ratesSourceNote:'Reference rates updated daily',
      ratesIndicator:'≈ Indicative rate',

      // Data management
      restoreHintJson:'Only JSON backup files are supported.',
      backupHintPlus:'JSON — full data, for restore. CSV & PDF report — <span style="color:var(--brand-accent);font-weight:600">Plus</span>.',
      restoreHintPlus:'JSON backup file or CSV exported with <span style="color:var(--brand-accent);font-weight:600">SAGI Plus</span>.',
      selectJsonFile:'Select JSON File',
      selectCsvFile:'Select CSV File',
      confDeleteAccount:'Are you sure you want to permanently delete your account and all your data? This action cannot be undone. All your Firebase account data and locally stored data on this device will be completely removed.',
      accountDeleted:'Your account has been deleted.',

      // Analytics page — hardcoded
      forecastLabel:'Forecast',
      forecastExpIncome:'Expected Income',
      forecastExpExpense:'Expected Expense',
      forecastFixedCosts:'Fixed Costs',
      forecastFixedNote:'Subscriptions & recurring',
      forecastNet:'Estimated Net',
      forecastNetWarn:'Review your expenses',
      forecastMinData:'At least 2 months of data needed for forecast.',
      forecastConfidence:'confidence',
      scoreSavingsLabel2:'SAVINGS',
      scoreGradeExcellent:'Excellent',
      scoreGradeGood:'Good',
      scoreGradeMid:'Average',
      scoreGradeWarn:'Caution',
      scoreGradeCrit:'Critical',
      scoreDescExcellent:'You\'re saving a large portion of your income.',
      scoreDescGood:'Your savings rate is reasonable.',
      scoreDescMid:'You have potential to save more.',
      scoreDescCrit:'Your expenses exceed your income.',
      catModalMonthTotal:'This Month Total',
      catModalNoTx:'No transactions this month',
      periodDayAvg:'day average',

      // Recurring
      autoPayLabel:'Auto Pay',

      // Import modal
      importModalTitle:'Restore Backup',
      importMergeTitle:'Merge',
      importMergeDesc:'Your existing data is kept. Duplicate records are updated, new ones added. Safe option.',
      importReplaceTitle:'Replace All Data',
      importReplaceDesc:'All current data is deleted and only data from this file is loaded. Cannot be undone.',
      importReplaceWarn:'Your accounts, transactions and all data will be permanently deleted. This cannot be undone.',
      importActionBtn:'Load',

      // ── Legal consent (onboarding) ────────────────────────────────────
      obConsentTerms:'Terms of Service',
      obConsentPrivacy:'Privacy Policy',
      obConsentCheckbox:'I have read and accept the Terms of Service and Privacy Policy. I confirm I am at least 18 years old.',
    }
  }
};

// ─────────────────────────────────────────────────────────────────────
// AKTİF DİL TESPİTİ
// Öncelik: localStorage > navigator > 'tr'
// ─────────────────────────────────────────────────────────────────────
let LANG = (function(){
  try {
    const saved = JSON.parse(localStorage.getItem('sagi_v1_data') || '{}');
    if (saved && saved.settings && saved.settings.lang && LANGS[saved.settings.lang]) {
      return saved.settings.lang;
    }
  } catch(e) {}
  const nav = (navigator.language || navigator.userLanguage || 'tr').toLowerCase();
  if (nav.startsWith('tr')) return 'tr';
  return 'en';
})();

// L() → aktif dilin sözlüğü
const L = () => LANGS[LANG] || LANGS.tr;

// CATEGORIES & CAT_GROUPS yardımcıları (eski API uyumluluğu)
const CATEGORIES = () => L().cats.groups.flatMap(g => g.items);
const CAT_GROUPS = () => L().cats.groups;

// ─────────────────────────────────────────────────────────────────────
// t(key, vars) — anahtardan çeviri çekme + {placeholder} ikamesi
// ─────────────────────────────────────────────────────────────────────
function t(key, ...args) {
  const ui = L().ui;
  let s = ui[key];
  if (s === undefined) {
    // Fallback: diğer dillerde ara
    for (const code in LANGS) {
      if (code === LANG) continue;
      if (LANGS[code].ui[key] !== undefined) { s = LANGS[code].ui[key]; break; }
    }
    if (s === undefined) return key;  // hâlâ yoksa anahtarı geri ver
  }
  // Değer bir fonksiyon ise argümanlarla çağır
  if (typeof s === 'function') {
    return args.length ? s(...args) : s;
  }
  // Değer string ise {var} placeholder'larını değiştir (eski uyumluluk)
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    const vars = args[0];
    Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────
// applyLang() — DOM üzerindeki tüm i18n attribute'larını günceller
// data-i18n         → element.textContent
// data-i18n-html    → element.innerHTML  (içinde HTML olabilir)
// data-i18n-ph      → input/textarea placeholder attribute
// data-i18n-title   → element title attribute
// data-i18n-aria    → element aria-label attribute
// ─────────────────────────────────────────────────────────────────────
function applyLang() {
  document.documentElement.lang = LANG;
  document.title = L().appName;
  const u = L().ui;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (u[key] !== undefined) el.textContent = u[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (u[key] !== undefined) el.innerHTML = u[key];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    if (u[key] !== undefined) el.setAttribute('placeholder', u[key]);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (u[key] !== undefined) el.setAttribute('title', u[key]);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.dataset.i18nAria;
    if (u[key] !== undefined) el.setAttribute('aria-label', u[key]);
  });
  // <option data-i18n-option="key"> → option text (symbol korunur)
  document.querySelectorAll('[data-i18n-option]').forEach(el => {
    const key = el.dataset.i18nOption;
    if (u[key] !== undefined) {
      const sym = el.textContent.match(/[(（][^)）]+[)）]$/);
      el.textContent = u[key] + (sym ? ' ' + sym[0] : '');
    }
  });

  // Bottom-nav ve sidebar nav etiketleri
  const navMap = {
    '/dashboard':u.dashboard, '/wallets':u.wallets, '/transactions':u.transactions,
    '/recurring':u.recurring, '/analytics':u.analytics, '/goals':u.goals,
    '/debts':u.debts, '/settings':u.settings,
  };
  document.querySelectorAll('[data-route]').forEach(el => {
    const r = el.dataset.route, txt = navMap[r];
    if (!txt) return;
    const sp = el.querySelector('.bnav-text');
    if (sp) sp.textContent = txt;
    else {
      const nodes = [...el.childNodes].filter(n => n.nodeType === 3);
      nodes.forEach(n => { if (n.textContent.trim()) n.textContent = ' ' + txt; });
    }
  });

  // Aktif sayfayı yeniden render et — dinamik render edilen kategoriler/empty state
  if (typeof App !== 'undefined' && App.Controllers) {
    const hash = window.location.hash.replace('#','') || '/dashboard';
    const ctrl = {
      '/dashboard':App.Controllers.Dashboard, '/wallets':App.Controllers.Wallets,
      '/transactions':App.Controllers.Transactions, '/analytics':App.Controllers.Analytics,
      '/recurring':App.Controllers.Recurring, '/goals':App.Controllers.Goals,
      '/debts':App.Controllers.Debts, '/settings':App.Controllers.Settings,
    }[hash];
    if (ctrl?.render) ctrl.render();
    else if (ctrl?.renderForm) ctrl.renderForm();
    else if (ctrl?.renderSetup) ctrl.renderSetup();
    if (hash !== '/dashboard' && App.Controllers.Dashboard.render) App.Controllers.Dashboard.render();
  }
}

// ─────────────────────────────────────────────────────────────────────
// setLang(lang) — dili değiştir + persist + DOM'u güncelle
// ─────────────────────────────────────────────────────────────────────
function setLang(lang) {
  if (!LANGS[lang]) return false;
  LANG = lang;
  // Sadece settings içine yaz; Core hazırsa Core.DB.save kullan
  try {
    if (typeof Core !== 'undefined' && Core.state && Core.state.settings) {
      Core.state.settings.lang = lang;
      Core.DB && Core.DB.save && Core.DB.save();
    } else {
      const saved = JSON.parse(localStorage.getItem('sagi_v1_data') || '{}');
      saved.settings = saved.settings || {};
      saved.settings.lang = lang;
      localStorage.setItem('sagi_v1_data', JSON.stringify(saved));
    }
  } catch(e) {}
  applyLang();
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Globals — index.html'in eski API'si bozulmasın
// ─────────────────────────────────────────────────────────────────────
window.LANGS = LANGS;
window.LANGS_META = LANGS_META;
Object.defineProperty(window, 'LANG', {
  get(){ return LANG; },
  set(v){ if (LANGS[v]) LANG = v; }
});
window.L = L;
window.t = t;
window.applyLang = applyLang;
window.setLang = setLang;
window.CATEGORIES = CATEGORIES;
window.CAT_GROUPS = CAT_GROUPS;

})();