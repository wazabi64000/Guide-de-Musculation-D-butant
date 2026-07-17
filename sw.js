const CACHE_NAME = 'muscu-debutant-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './programme.html',
  './historique.html',
  './statistiques.html',
  './parametres.html',
  './manifest.json',
  './css/variables.css',
  './css/style.css',
  './css/animations.css',
  './css/responsive.css',
  './js/app.js',
  './js/router.js',
  './js/storage.js',
  './js/database.js',
  './js/timer.js',
  './js/beep.js',
  './js/music.js',
  './js/ui.js',
  './js/program.js',
  './js/stats.js',
  './js/settings.js',
  './data/program.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isOpaqueAsset =
    url.pathname.includes('/images/') ||
    url.pathname.includes('/music/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html');

  // Network-first for app code/data/images so updates show immediately
  if (isOpaqueAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
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
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
