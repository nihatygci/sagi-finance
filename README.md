# SAGI Finance

**v0.9.996** — Privacy-first personal finance PWA. All data stays on your device.

---

## Overview

SAGI Finance is a progressive web app built to prove that personal finance tracking can be genuinely private. Most fintech apps monetise your data through ads and profiling. SAGI does the opposite: zero data collection, zero profiling, zero selling.

The app is architected as a single-page PWA with no framework dependency. It loads in milliseconds, works fully offline, and installs directly from the browser with no app store required.

---

## Features

### Core (Free)

- **Wallets** — Create multiple accounts (cash, bank, savings, credit card, etc.) in TRY, USD, EUR, or GBP. Live FX preview on cross-currency transfers.
- **Transactions** — Income and expense tracking with custom categories, notes, and recurring entries.
- **Recurring** — Scheduled income/expense entries that auto-generate on their due dates.
- **Goals** — Savings goals with progress tracking and target dates.
- **Debts** — Borrow/lend tracking with due dates and paid-month logging.
- **Subscriptions** — Monthly/annual subscription management with per-item currency support.
- **Transfers** — Move funds between wallets with currency conversion.
- **Budgets** — Per-category monthly budget limits with real-time usage indicators.
- **Notification Center** — Persistent in-app inbox with filter tabs (budget alerts, subscription reminders, debt due dates, weekly summaries). Badge indicator on sidebar and bottom nav.
- **Multi-currency** — TRY, USD, EUR, GBP throughout the app. User-selected currency persists across account switches.
- **Offline-first** — Full functionality with no internet connection. Service worker uses a network-first strategy; a refresh prompt appears when a new version is ready.
- **PWA Install** — Installable on Android, iOS, and desktop directly from the browser.
- **Bilingual** — Turkish and English, auto-detected from browser language with manual override.
- **AI Trial** — 4-day SAGI Asistan trial included in the free tier (no Plus key required).

### Cloud Sync (Free, optional)

Sync is opt-in and anonymous. No account, email, or personal information is required.

- A 16-digit hex key (`XXXX-XXXX-XXXX-XXXX`) acts as the device identifier. The key is stored as a Firestore document ID under `users/{key}`.
- All data writes are debounced (700 ms) and pushed to Firestore after each local save.
- `onSnapshot` provides real-time pull — changes made on another device appear instantly.
- Conflict resolution uses `lastModified` timestamps (last-write-wins).
- Offline persistence is enabled via `enablePersistence({ synchronizeTabs: true })`, with graceful fallback for unsupported browsers.

### SAGI Plus

SAGI Plus is a premium tier unlocked with a key prefixed `PLUS-XXXX-XXXX-XXXX-XXXX`. The key works across all devices without creating an account.

**Plus features:**

| Feature | Description |
|---|---|
| SAGI Asistan | AI-powered personal finance advisor, unlimited. Powered by Gemini 2.0 Flash Lite via Cloudflare Workers. Slash commands (`/gelir`, `/gider`, `/ozet`, `/hedefler`, `/yardim`, etc.) generate instant responses from local data without a round-trip to the model. |
| Advanced Analytics | Savings Score (savings rate 60% + income/expense balance 40%, out of 100), Next-Month Forecast, Monthly Comparison chart. |
| Theme & Font | 8 accent color themes with dynamic CSS variable propagation. Custom color palette with Firebase persistence. Multiple font options (Manrope, Lexend, Exo 2, etc.). Changes sync across devices via cloud. |
| CSV Export | Full transaction history exportable in CSV format. |
| Ad-free | No advertisements. |

**Pricing:**

| Plan | Price |
|---|---|
| Monthly | $4.99 / month |
| Yearly | $39.99 / year |
| Lifetime | $99.99 (one-time) |

Purchases processed via Google Play. No account required. Prices may vary by region.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (no framework) |
| PWA | Service Worker, Web App Manifest |
| Local storage | `localStorage` |
| Cloud sync | Firebase Firestore |
| AI backend | Cloudflare Workers + Gemini 2.0 Flash Lite |
| Hosting | GitHub Pages |

---

## File Structure

```
index.html          Main application shell and UI
core.js             State management, event system, localStorage persistence
cloud-sync.js       Firebase Firestore sync module (Core.Cloud namespace)
firebase-config.js  Firebase initialisation and offline persistence setup
languages.js        Turkish / English i18n strings
about.html          About page
faq.html            FAQ (TR/EN)
privacy.html        Privacy Policy
terms.html          Terms of Service
contact.html        Contact page
```

> `plus.js` — the SAGI Plus module — is kept in a private repository and is not part of this public codebase.

---

## Architecture Notes

**State management** — `Core.state` is the single data store, loaded from `localStorage` on boot and written back via `Core.DB.save()`. Every save automatically queues a Firestore push if a sync key is present.

**Cloud sync flow** — On app start with a sync key: initial pull from Firestore → compare `lastModified` timestamps → merge if remote is newer → attach `onSnapshot` listener for real-time updates. `forwardKey` in a Firestore document triggers a seamless key migration (e.g. free key → PLUS key) with an automatic reload.

**Plus key migration** — When a user upgrades, their existing sync key document is rewritten with a `PLUS-` prefixed key. `initialPull` detects `forwardKey` or a remote PLUS key and migrates automatically across all open devices.

**AI privacy** — Only anonymous aggregated financial summaries are sent to the assistant: total monthly income/expense, account balances, subscription totals, goal progress, and category-level spending. Transaction descriptions, payee names, and personal identifiers are never transmitted. All requests are proxied through Cloudflare Workers.

**Consent tracking** — On first launch, the user's acceptance of the Terms and Privacy Policy is recorded locally (`consentDate`, `consentVersion`, `consentLang`, `consentMethod`). If cloud sync is active, this record is also written to Firestore.

---

## Privacy

SAGI Finance collects no personal data. The free tier never contacts any server. Optional cloud sync uses an anonymous key — no name, email, or account is ever created. The AI assistant sends only aggregated, non-identifiable financial summaries.

See [privacy.html](./privacy.html) for the full Privacy Policy.

---

## Contributing

The main application is open source. To contribute or report an issue, open a pull request or file an issue on GitHub.

Note: `plus.js` (the SAGI Plus module) is not included in this repository.

---

## License

© 2026 SAGI Finance. All rights reserved.
