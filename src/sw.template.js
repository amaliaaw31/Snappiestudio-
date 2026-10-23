/* Service worker Snappie Studio. Penanda versi dan daftar precache diisi saat build (vite.config.js).
   Hanya berkas statis situs ini yang disimpan. API, CMS, dan permintaan non-GET tidak pernah disentuh. */
const CACHE = 'snappie-__BUILD__';
const PRECACHE = __PRECACHE__;
const HOME = new URL('./', self.location).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(PRECACHE.map(path => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('snappie-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

const storable = response => response && response.ok && !/no-store/i.test(response.headers.get('Cache-Control') || '');

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(4000) });
    if (storable(response)) await cache.put(HOME, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(HOME);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async response => { if (storable(response)) await cache.put(request, response.clone()); return response; });
  if (cached) { refresh.catch(() => {}); return cached; }
  return refresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js' || /^\/(api(\/|$)|cms)/.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
