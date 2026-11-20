const CACHE_NAME = 'bullion-pulse-v10';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
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
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Always hit network for live price feeds and ntfy requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first for HTML and dynamic data/*.json feeds
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/data/outlook.json') ||
    url.pathname.endsWith('/data/shanghai.json') ||
    url.pathname.endsWith('/data/candles.json') ||
    url.pathname.endsWith('/data/candles_1d.json') ||
    url.pathname.endsWith('/data/candles_hist.json') ||
    url.pathname.endsWith('/data/comex.json') ||
    url.pathname.endsWith('/data/learned_weights.json')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
