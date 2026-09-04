// ════════════════════════════════════════════════════════════════
//  SAGI Finance — Sürüm Modülü (TEK KAYNAK)
//
//  Bu dosya uygulamanın "kullanıcıya görünen" sürüm numarasının
//  TEK doğru kaynağıdır. index.html, legal sayfalar (privacy.html
//  vb.) ve ileride başka bir yer versiyon göstermek istediğinde
//  buradan okur — hiçbir yerde elle "v0.9.86" gibi string yazılmaz.
//
//  GÜNCELLEME KURALI:
//  • app        → her release'de burada artır. Play Console'daki
//                 build.gradle `versionName` ile AYNI numara olmalı
//                 (versionCode ayrı, o Google'ın kendi sayacı, hep +1).
//  • legal      → SADECE gizlilik/şartlar metni değiştiğinde artır.
//                 app sürümünden bağımsızdır, karıştırma.
//  • released   → bu sürümün yayın tarihi (opsiyonel, referans için)
// ════════════════════════════════════════════════════════════════

window.SAGI_VERSION = {
  app:      '1.4.0',
  legal:    '1.0',
  released: '2026-09-04',
};