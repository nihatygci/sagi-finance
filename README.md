# SAGI Finance

**v1.4.0** — Privacy-first personal finance PWA.

> Version is maintained manually here — GitHub renders markdown statically and can't read `version.js`. Sync this line with `SAGI_VERSION.app` on release.

🇹🇷 [Türkçe](#türkçe) · 🇬🇧 [English](#english)

---

## Türkçe

Verileri cihazda tutan, reklam/profilleme yapmayan, ücretsiz kişisel finans PWA'sı. Framework yok, tek sayfa, offline çalışır, tarayıcıdan doğrudan yüklenir.

**Ücretsiz özellikler:** çoklu hesap/cüzdan (TRY/USD/EUR/GBP), gelir-gider takibi, esnek sıklıklı abonelik/düzenli ödeme yönetimi (aylık, 2-3-4-6 ayda bir, yıllık), hedefler, borç/alacak takibi, bütçe limitleri, bildirim merkezi, çoklu dil (TR/EN), offline çalışma, 4 günlük SAGI Asistan denemesi (sohbet + gelişmiş analiz dahil).

**Bulut Senkronizasyonu (ücretsiz, opsiyonel):** 16 haneli anonim anahtarla çalışır, hesap/e-posta gerekmez. Firestore üzerinden gerçek zamanlı senkron, çakışma çözümü `lastModified` ile.

**SAGI Plus (`PLUS-XXXX-XXXX-XXXX-XXXX` anahtarıyla açılır):**
- SAGI Asistan sınırsız (Gemini 2.5 Flash-Lite, Cloudflare Workers üzerinden)
- Tasarruf Skoru, Ay Sonu Tahmini, Aylık Karşılaştırma
- CSV & PDF dışa aktarma
- Tema (11 renk) ve font (11 seçenek) kişiselleştirme
- Reklamsız

| Plan | Fiyat |
|---|---|
| Aylık | $4.99 |
| Yıllık | $39.99 |
| Ömür Boyu | $149.99 (tek seferlik) |

Fiyatlar Google Play üzerinden işlenir, bölgeye göre değişebilir; uygulama içinde canlı fiyat gösterilir.

**Teknoloji:** Vanilla HTML/CSS/JS, Service Worker (PWA), localStorage, Firebase Firestore (sync), Cloudflare Workers + Gemini 2.5 Flash-Lite (AI), GitHub Pages (hosting).

**Gizlilik:** Kişisel veri toplanmaz. AI asistana yalnızca anonim toplu finansal özetler gönderilir — işlem açıklamaları ve kimlik bilgisi asla iletilmez. Detaylar: [privacy.html](./privacy.html)

---

## English

A free, privacy-first personal finance PWA. Data stays on-device, no ads, no profiling, no framework — single-page, offline-capable, installable straight from the browser.

**Free features:** multi-wallet accounts (TRY/USD/EUR/GBP), income/expense tracking, flexible-interval recurring payments & subscriptions (monthly, every 2-3-4-6 months, or yearly), savings goals, debt tracking, budget limits, notification center, TR/EN bilingual, offline-first, 4-day SAGI Asistan trial (chat + advanced analytics included).

**Cloud Sync (free, optional):** anonymous 16-digit key, no account or email. Real-time sync via Firestore, `lastModified`-based conflict resolution.

**SAGI Plus** (unlocked with a `PLUS-XXXX-XXXX-XXXX-XXXX` key):
- Unlimited SAGI Asistan (Gemini 2.5 Flash-Lite via Cloudflare Workers)
- Savings Score, Next-Month Forecast, Monthly Comparison
- CSV & PDF export
- Theme (11 colors) and font (11 options) customization
- Ad-free

| Plan | Price |
|---|---|
| Monthly | $4.99 |
| Yearly | $39.99 |
| Lifetime | $149.99 (one-time) |

Processed via Google Play; prices may vary by region, live price shown in-app.

**Tech stack:** Vanilla HTML/CSS/JS, Service Worker (PWA), localStorage, Firebase Firestore (sync), Cloudflare Workers + Gemini 2.5 Flash-Lite (AI), GitHub Pages (hosting).

**Privacy:** No personal data is collected. Only anonymous aggregated financial summaries are sent to the AI assistant — transaction descriptions and identifiers are never transmitted. Details: [privacy.html](./privacy.html)

---

## File Structure

```
index.html            Main app shell + inline state management (Core)
version.js             Single source of truth for the app version
cloud-sync.js          Firebase Firestore sync (Core.Cloud)
firebase-config.js     Firebase init + offline persistence
languages.js            TR/EN i18n strings
privacy.html · terms.html · about.html · contact.html · faq.html
```

> `plus.js` (SAGI Plus module) is kept in a private repository, not included here.

---

© 2026 SAGI Finance. All rights reserved.