/* BioSerra SW v7 — caching reale per funzionamento offline.
   Strategia: network-first per tutto l'app shell (HTML/CSS/JS/icone).
   Online: comportamento invariato, sempre rete fresca, cache aggiornata in background.
   Offline: fallback alla copia in cache piu' recente (exact match, poi ignoreSearch
   per gestire i tag ?v=timestamp che cambiano ad ogni deploy).
   I file dati (data/*.json su raw.githubusercontent.com, altro origine) non vengono
   MAI intercettati: restano sempre live, gestiti dalla logica offline gia' presente
   in laboratorio.js (bioserra_pratiche_pending) per pratiche_stato.json. */

const CACHE_NAME = 'bioserra-shell-v7';

const APP_SHELL = [
  '/bioserra/',
  '/bioserra/index.html',
  '/bioserra/manifest.json',
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Precache tollerante: un singolo file che fallisce non deve bloccare gli altri
      return Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(err => console.warn('[BioSerra SW] precache fallito per', url, err))
      ));
    })
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

  // Solo GET, solo stesso-origine (GitHub Pages). Mai toccare raw.githubusercontent.com,
  // api.github.com, api.mistral.ai, openrouter.ai, api.open-meteo.com, cdnjs.cloudflare.com ecc.
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(res => {
      // Rete OK: aggiorna la cache in background con la risposta fresca
      if (res && res.status === 200) {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone)).catch(() => {});
      }
      return res;
    }).catch(() => {
      // Offline o rete fallita: fallback alla cache
      return caches.match(req).then(cached => {
        if (cached) return cached;
        return caches.match(req, { ignoreSearch: true }).then(cachedNoQuery => {
          if (cachedNoQuery) return cachedNoQuery;
          // Ultima risorsa per navigazioni: pagina principale se in cache
          if (req.mode === 'navigate') {
            return caches.match('/bioserra/index.html');
          }
          return new Response('', { status: 504, statusText: 'Offline e non in cache' });
        });
      });
    })
  );
});
