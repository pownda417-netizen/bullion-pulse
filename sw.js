const CACHE_NAME = 'bullion-pulse-v38';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=38',
  './app.js?v=38',
  './intel.js?v=38',
  './mc_worker.js',
  './tts_worker.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/world-map-night.jpg'
];

function isCacheableSameOriginResponse(response) {
  return Boolean(response && response.ok && response.type === 'basic');
}

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

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only handle http(s) same-origin requests; cross-origin live price feeds & ntfy hit network directly
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.origin !== self.location.origin
  ) {
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
    p.endsWith('/intel.js') ||
    p.endsWith('/styles.css') ||
    p.endsWith('/mc_worker.js') ||
    p.endsWith('/tts_worker.js') ||
    p.endsWith('/manifest.json') ||
    p.includes('/data/');

  if (isCoreOrData) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then((response) => {
          if (isCacheableSameOriginResponse(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((c) => c.match(request)))
    );
    return;
  }

  const isStaticAsset = /\.(?:png|jpe?g|svg|ico|webp|woff2?)$/i.test(p);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (isCacheableSameOriginResponse(response)) {
            cache.put(request, response.clone());
          }
          return response;
        });
      })
    )
  );
});
