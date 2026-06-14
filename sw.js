/* ══ BioSerra Service Worker v3 ══ */
const CACHE_NAME   = 'bioserra-v3';
const BASE_PATH    = '/bioserra/';
const OFFLINE_PAGE = '/bioserra/index.html';

const PRECACHE = [
  '/bioserra/',
  '/bioserra/index.html',
  '/bioserra/manifest.json',
  '/bioserra/icon-192.png',
  '/bioserra/icon-512.png',
  '/bioserra/sw.js'
];

self.addEventListener('install', event => {
  console.log('[SW v3] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW v3] Activate');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW v3] Elimino cache obsoleta:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req);

      const fetchPromise = fetch(req)
        .then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        fetchPromise.catch(() => {});
        return cached;
      }

      const res = await fetchPromise;
      if (res) return res;

      return cache.match(OFFLINE_PAGE);
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
