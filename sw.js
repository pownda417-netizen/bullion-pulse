const CACHE_PREFIX = 'bullion-pulse-';
const CACHE_NAME = 'bullion-pulse-v60';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=60',
  './app.js?v=60',
  './intel.js?v=60',
  './i18n_packs.js?v=60',
  './display_i18n.js?v=60',
  './mc_worker.js?v=60',
  './tts_worker.js?v=60',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/world-map-night.jpg',
];

function isCacheableSameOriginResponse(response, expectedMimePrefix = '') {
  if (!response || response.status !== 200 || response.type !== 'basic') return false;
  if (expectedMimePrefix) {
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes(expectedMimePrefix)) return false;
  }
  return true;
}

function getScopePath() {
  try {
    return new URL(self.registration.scope).pathname;
  } catch {
    return '/';
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Prefix-scoped cleanup so sibling repos on shared *.github.io origins are never wiped
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
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

  const scopePath = getScopePath();
  const p = url.pathname;
  const isScopedDataJson = p.startsWith(`${scopePath}data/`) && p.endsWith('.json');
  const isNav = request.mode === 'navigate' || p === scopePath || p.endsWith('/index.html');
  const isCoreAsset =
    p.endsWith('/app.js') ||
    p.endsWith('/intel.js') ||
    p.endsWith('/i18n_packs.js') ||
    p.endsWith('/display_i18n.js') ||
    p.endsWith('/styles.css') ||
    p.endsWith('/mc_worker.js') ||
    p.endsWith('/tts_worker.js') ||
    p.endsWith('/manifest.json');

  if (isNav || isCoreAsset || isScopedDataJson) {
    const expectedMime = isScopedDataJson
      ? 'application/json'
      : isNav
        ? 'text/html'
        : p.endsWith('.css')
          ? 'text/css'
          : p.endsWith('.js')
            ? 'javascript'
            : 'json';
    // Strip arbitrary cache-busting query params for normalized data/navigation keys to prevent cache bloat
    const normalizedKey = isNav
      ? './index.html'
      : isScopedDataJson
        ? `${url.origin}${p}`
        : request;

    event.respondWith(
      (isNav
        ? fetch(request)
        : fetch(new Request(request, { cache: 'no-store' }))
      )
        .then((response) => {
          if (isCacheableSameOriginResponse(response, expectedMime)) {
            const clone = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(normalizedKey, clone))
                .catch(() => {})
            );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const hit = (await cache.match(normalizedKey)) || (await cache.match(request));
          if (hit) return hit;
          if (isNav) {
            const shellHit = await cache.match('./index.html');
            if (shellHit) return shellHit;
          }
          if (isScopedDataJson) {
            return new Response('{"error":"offline"}', {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  const isStaticAsset = /\.(?:png|jpe?g|svg|ico|webp|woff2?)$/i.test(p);
  if (!isStaticAsset) return;

  const staticKey = `${url.origin}${p}`;
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(staticKey).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (isCacheableSameOriginResponse(response)) {
              const clone = response.clone();
              event.waitUntil(cache.put(staticKey, clone).catch(() => {}));
            }
            return response;
          })
          .catch(() => new Response('', { status: 503 }));
      })
    )
  );
});
