const CACHE_NAME = 'bullion-pulse-v26';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=26',
  './app.js?v=26',
  './mc_worker.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Always hit network directly for cross-origin live price feeds and ntfy requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first (bypassing HTTP disk cache) for HTML, CSS, JS, and data/*.json feeds
  // so installed phone PWAs never pair new HTML with stale cached app.js/styles.css
  const p = url.pathname;
  const isCoreOrData =
    request.mode === 'navigate' ||
    p.endsWith('/') ||
    p.endsWith('/index.html') ||
    p.endsWith('/app.js') ||
    p.endsWith('/styles.css') ||
    p.endsWith('/mc_worker.js') ||
    p.endsWith('/manifest.json') ||
    p.includes('/data/');

  if (isCoreOrData) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((c) => c.match(request)))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        });
      })
    )
  );
});
