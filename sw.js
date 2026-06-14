/* ══════════════════════════════════════════
   BioSerra — Service Worker completo
   Cache-first + aggiornamento in background
══════════════════════════════════════════ */

const CACHE_NAME   = 'bioserra-v2';
const OFFLINE_PAGE = '/index.html';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js'
];

/* ── INSTALL: precache delle risorse essenziali ── */
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: elimina cache obsolete ── */
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH: Cache-first con revalidazione in background ── */
self.addEventListener('fetch', event => {
  const req = event.request;

  /* Ignora non-GET e richieste ad API esterne */
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req);

      /* Fetch in background per aggiornare la cache */
      const fetchPromise = fetch(req)
        .then(networkRes => {
          if (networkRes && networkRes.ok) {
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        })
        .catch(() => null);

      if (cached) {
        /* Risposta immediata dalla cache + aggiornamento silenzioso */
        fetchPromise.catch(() => {});
        return cached;
      }

      /* Non in cache → aspetta network */
      const networkRes = await fetchPromise;
      if (networkRes) return networkRes;

      /* Offline + non in cache → pagina principale */
      const offlinePage = await cache.match(OFFLINE_PAGE);
      return offlinePage || new Response(
        '<h1>BioSerra offline</h1><p>Ricarica quando sei connesso.</p>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    })
  );
});

/* ── MESSAGE: forza aggiornamento manuale ── */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
