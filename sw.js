/*
// SAGI Finance Service Worker - v2
const CACHE_NAME = "sagi-cache-v2";
const RUNTIME_CACHE = "sagi-runtime-v1";

// Önbelleğe alınacak kritik varlıklar (Assets)
const urlsToCache = [
  "/",
  "/index.html",
  // Google Fonts (Çevrimdışı kullanım için stil dosyası)
  "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
  // Manifest ve Icon için base URL (Opsiyonel)
  "/manifest.webmanifest"
];

// 1. KURULUM: Kritik dosyaları hemen indir
self.addEventListener("install", event => {
  console.log("[SW] Install");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("[SW] Önbelleğe alınıyor:", urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Yeni SW hemen devreye girsin
  );
});

// 2. AKTİVASYON: Eski önbellekleri temizle
self.addEventListener("activate", event => {
  console.log("[SW] Activate");
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== RUNTIME_CACHE) {
            console.log("[SW] Eski önbellek siliniyor:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Kontrolü hemen ele al
  );
});

// 3. FETCH: Stale-While-Revalidate Stratejisi (Önbellek -> Güncelle)
// Bu strateji: Kullanıcıya anında önbellekteki eski içeriği gösterir, arkadan yenisi indirir.
self.addEventListener("fetch", event => {
  // Sadece GET isteklerini işle (POST isteklerini engelleme)
  if (event.request.method !== 'GET') return;

  // API istekleri veya Chrome eklentileri (chrome-extension) için işlem yapma
  const url = new URL(event.request.url);
  if (url.protocol === 'chrome-extension:' || url.pathname.includes('/api/')) {
      return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Arkada fetch promise'i başlat (önbelleği güncellemek için)
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Geçerli bir yanıt varsa runtime önbelleğe kaydet
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(error => {
        console.log("[SW] Fetch hatası (çevrimdışı olabilir):", error);
        // Hata durumunda (çevrimdışı) cachedResponse zaten aşağıda döndürülecek
      });

      // Önbellekte varsa hemen göster, yoksa ağdan bekle
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. NAVIGATION FALLBACK: SPA yönlendirmeleri için index.html'e dön
// Kullanıcı "/dashboard" yazdığında index.html'i göster (Uygulama Router'ı halleder)
self.addEventListener("fetch", event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Ağ yoksa, önbellekteki index.html'i gönder
        return caches.match('/index.html');
      })
    );
  }
});

// sw.js dosyasının EN ALTINA ekleyin
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Bildirime tıklanınca uygulamayı aç veya odağa al
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Eğer uygulama zaten açıksa ona odaklan
        for (let client of clientList) {
          if (client.url.includes('/') && 'focus' in client) {
            return client.focus();
          }
        }
        // Açık değilse yeni pencere aç
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
*/
