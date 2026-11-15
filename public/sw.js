const CACHE_NAME = 'xpense-tracker-v26';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/css/style.css',
  '/js/app.js',
  '/js/storage.js',
  '/js/currency.js',
  '/js/sheets-api.js',
  '/js/report-export.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  '/manifest.json',
  '/assets/icons/favicon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Install: Pre-cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Immediately purge old caches and claim active clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch:
// 1. Navigation (HTML): Network-First with quick timeout & instant offline cache fallback.
//    Guarantees mobile loads latest version on 1st visit without stale cache delays.
// 2. Static Assets (JS, CSS, Fonts, Images): Cache-First for instant speed & zero hosting overhead.
// 3. APIs: Bypasses Google Apps Script & external services.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass Google Apps Script & external APIs
  if (url.origin.includes('google.com') || url.origin.includes('googleusercontent.com') || event.request.method !== 'GET') {
    return;
  }

  // 1. Navigation requests (HTML documents & root path): Network-First
  const isNavigation = event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';
  if (isNavigation) {
    event.respondWith(
      // Fetch with a 2.5s timeout: if connection is slow/offline, fall back instantly to cached shell
      Promise.race([
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 2500))
      ]).catch(() => {
        // Offline or slow network fallback
        return caches.match('/index.html').then((cached) => cached || caches.match('/'));
      })
    );
    return;
  }

  // 2. Static shell assets: Cache-First with background revalidation
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background if online
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});

        return cachedResponse;
      }

      return fetch(event.request);
    })
  );
});

// Support manual skipWaiting trigger from client
self.addEventListener('message', (event) => {
  if (event.data && (event.data.action === 'skipWaiting' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});
