/* ══ BioSerra Service Worker ══ */
const CACHE_NAME = 'bioserra-v1';
const OFFLINE_URL = './index.html';

const RESOURCES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

/* ── INSTALL: metti in cache le risorse essenziali ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(RESOURCES_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE: elimina cache vecchie ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

/* ── FETCH: Cache First, fallback network, fallback offline ── */
self.addEventListener('fetch', event => {
  /* Ignora richieste non GET e richieste verso API esterne */
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        /* Aggiorna cache in background (stale-while-revalidate) */
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      /* Non in cache → prova network */
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || !networkResponse.ok) return networkResponse;
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        /* Offline e non in cache → pagina offline */
        return caches.match(OFFLINE_URL);
      });
    })
  );
});
