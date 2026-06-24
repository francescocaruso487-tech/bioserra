/* BioSerra Service Worker v5 */
const CACHE_NAME   = 'bioserra-v5';
const BASE_PATH    = '/bioserra/';
const OFFLINE_PAGE = '/bioserra/index.html';

const PRECACHE = [
  '/bioserra/',
  '/bioserra/index.html',
  '/bioserra/manifest.json',
  '/bioserra/sw.js',
  '/bioserra/assets/icon-192.png',
  '/bioserra/assets/icon-512.png'
];

const NETWORK_FIRST = [
  '/bioserra/js/',
  '/bioserra/css/'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.url.includes('raw.githubusercontent.com')) return;

  const isNetworkFirst = NETWORK_FIRST.some(p => url.pathname.startsWith(p));

  if (isNetworkFirst) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match(OFFLINE_PAGE);
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) { fetchPromise.catch(() => {}); return cached; }
      const res = await fetchPromise;
      if (res) return res;
      return cache.match(OFFLINE_PAGE);
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
