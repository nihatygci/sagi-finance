// ════════════════════════════════════════════════════════════════
//  SAGI Finance — Service Worker v3
//
//  STRATEJİ:
//  • index.html        → Network-first, 10sn timeout → Cache fallback
//    (Güncelleme garantisi: yeni deploy her zaman alınır)
//  • Fontlar/3rd party → Cache-first (değişmez varlıklar)
//  • Kur API'si        → Network only, SW bypass (cache'lemiyoruz)
//  • Diğer GET         → Stale-while-revalidate
//
//  MOBİL BİLDİRİM:
//  • SW üzerinden showNotification() — Android Chrome dahil çalışır
//  • Ana sayfadan "sagi-notify" mesajı gelince bildirim göster
//  • Bildirime tıklanınca uygulamayı aç / odağa al
// ════════════════════════════════════════════════════════════════

const VERSION    = 'v5';
const CACHE_APP  = `sagi-app-${VERSION}`;   // HTML, font CSS
const CACHE_FONT = `sagi-fonts-${VERSION}`; // Font dosyaları

// Bu URL'ler kurulumda önceden cache'lenir
// GitHub Pages gibi alt-dizin deploy'larında SW scope /repo/ olabilir.
// self.registration.scope'tan base path otomatik türetilir.
const BASE_PATH = self.registration.scope.replace(self.location.origin, '').replace(/\/$/, '');

const PRECACHE = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
];

// Hiçbir zaman SW üzerinden cache'lenmesin
const BYPASS_PATTERNS = [
  /exchangerate-api\.com/,
  /open\.er-api\.com/,
  /frankfurter\.app/,
  /fonts\.googleapis\.com\/css/,        // CSS'i cache ama font dosyaları ayrı
  // ── Firebase Cloud Firestore ────────────────────────────────────
  /firestore\.googleapis\.com/,         // Firestore REST/gRPC endpoint
  /firebaseio\.com/,                    // (legacy RTDB için, bypass kalsın)
  /firebasedatabase\.app/,              // RTDB europe-west1
  /firebaseapp\.com/,                   // Auth/console domain
  /googleapis\.com\/identitytoolkit/,   // Auth (gelecekte kullanılırsa)
  /firebaseinstallations\.googleapis\.com/, // Firebase Installations API
];

// ── 1. KURULUM ────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_APP)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => {
        console.log('[SW] v3 kuruldu, cache hazır');
        // Beklemeden aktif ol — eski SW'yi bekletme
        return self.skipWaiting();
      })
      .catch(err => {
        // Precache başarısız olsa bile SW kurulsun (offline olmayabilir)
        console.warn('[SW] Precache kısmen başarısız:', err);
      })
  );
});

// ── 2. AKTİVASYON ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_APP && k !== CACHE_FONT)
          .map(k => {
            console.log('[SW] Eski cache siliniyor:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      console.log('[SW] v3 aktif, tüm sekmeleri kontrol alıyor');
      // Tüm açık sekmeleri hemen yeni SW'ye bağla (yenile gerekmez)
      return self.clients.claim();
    })
  );
});

// ── 3. FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // GET olmayan istekleri (POST vb.) geç
  if (req.method !== 'GET') return;

  // chrome-extension veya data URL → geç
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return;

  // Kur API'leri → her zaman network, asla cache
  if (BYPASS_PATTERNS.some(p => p.test(url.href))) return;

  // Google Fonts CSS → stale-while-revalidate (bant genişliği tasarrufu)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fontStrategy(req));
    return;
  }

  // index.html ve navigation istekleri → Network-first
  // (Her zaman güncel HTML alınır; offline'da cache fallback)
  const isNavigation = req.mode === 'navigate';
  const isIndexHtml  = url.pathname.endsWith('/') ||
                       url.pathname.endsWith('/index.html') ||
                       url.pathname === url.origin + '/';

  if (isNavigation || isIndexHtml) {
    event.respondWith(networkFirstStrategy(req));
    return;
  }

  // Diğer app varlıkları → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});

// ── Fetch Stratejileri ────────────────────────────────────────────

// Network-first: 8sn dene → başarısız olursa cache'den sun
async function networkFirstStrategy(req) {
  const cache = await caches.open(CACHE_APP);
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const netRes = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);

    if (netRes.ok) {
      // Başarılı → cache'e yaz (bir sonraki offline için)
      cache.put(req, netRes.clone());
    }
    return netRes;
  } catch (_) {
    // Network yok / timeout → cache'den dön
    const cached = await cache.match(req) || await cache.match(BASE_PATH + '/index.html') || await cache.match(BASE_PATH + '/');
    if (cached) {
      console.log('[SW] Offline: cache\'den sunuluyor');
      return cached;
    }
    // Cache de yok — tarayıcı varsayılan hatasını göster
    return new Response('SAGI Finance yüklenemiyor. İnternet bağlantısını kontrol edin.', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// Stale-while-revalidate: cache'den hemen sun, arka planda güncelle
async function staleWhileRevalidate(req) {
  const cache  = await caches.open(CACHE_APP);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req).then(res => {
    if (res.ok && res.type !== 'opaque') {
      cache.put(req, res.clone());
    }
    return res;
  }).catch(() => null);

  return cached || await fetchPromise;
}

// Font stratejisi: önce cache, yoksa network'ten al ve cache'le
async function fontStrategy(req) {
  const cache  = await caches.open(CACHE_FONT);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return new Response('', { status: 503 });
  }
}

// ── 4. MOBİL BİLDİRİM — SW showNotification ─────────────────────
// Ana sayfadan postMessage ile tetiklenir:
//   navigator.serviceWorker.controller.postMessage({type:'SHOW_NOTIF', title, body})

self.addEventListener('message', event => {
  // Yeni SW'yi hemen aktif et (güncelleme gelince yeniden yüklemeye gerek kalmasın)
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING alındı, hemen aktif oluyor');
    self.skipWaiting();
    return;
  }

  if (!event.data || event.data.type !== 'SHOW_NOTIF') return;

  const { title = 'SAGI Finance', body = '', tag = 'sagi-notif' } = event.data;

  // showNotification SW içinde çalışır → Android Chrome dahil tüm platformlar
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,                // Aynı tag → eski bildirimi günceller (spam olmaz)
      icon:  './icon-192.png',
      badge: './icon-96.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      data: { url: './' }
    })
  );
});

// ── 5. BİLDİRİME TIKLANMA ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || (self.registration.scope);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Zaten açık bir SAGI sekmesi var mı?
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope)) {
            return client.focus();
          }
        }
        // Yoksa yeni pencere aç
        return clients.openWindow(targetUrl);
      })
  );
});

// ── 6. ARKA PLAN SENKRONIZASYON (opsiyonel, desteklenirse) ────────
// Background Sync: uygulama kapalıyken bile belirli aralıklarla check
self.addEventListener('sync', event => {
  if (event.tag === 'sagi-daily-check') {
    // Gelecekte push notification sunucu entegrasyonu buraya
    console.log('[SW] Background sync: sagi-daily-check');
  }
});