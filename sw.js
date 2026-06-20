/* ══ BioSerra Service Worker v4 ══ */
const CACHE_NAME   = 'bioserra-v4';
const BASE_PATH    = '/bioserra/';
const OFFLINE_PAGE = '/bioserra/index.html';

const PRECACHE = [
  '/bioserra/',
  '/bioserra/index.html',
  '/bioserra/manifest.json',
  '/bioserra/sw.js',
  '/bioserra/css/style.css',
  '/bioserra/js/app.js',
  '/bioserra/js/piante.js',
  '/bioserra/js/ambiente.js',
  '/bioserra/js/laboratorio.js',
  '/bioserra/js/config.js',
  '/bioserra/assets/icon-192.png',
  '/bioserra/assets/icon-512.png'
];

self.addEventListener('install', event => {
  console.log('[SW v4] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW v4] Activate');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW v4] Elimino cache obsoleta:', k);
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

  // I file JSON di dati su raw.githubusercontent NON vengono cachati
  // per garantire sempre dati freschi
  if (req.url.includes('raw.githubusercontent.com')) return;

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
