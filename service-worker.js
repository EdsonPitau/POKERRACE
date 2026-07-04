const CACHE_NAME = 'poker-race-v14';
const ASSETS = [
  './',
  './index.html',
  './engine.js',
  './board.js',
  './app.js',
  './manifest.json',
  './logo.png',
  './board_bg.jpg',
  './board_start.jpg',
  './start_bg.jpg',
  './kart_yellow_token.png',
  './kart_blue_token.png',
  './kart_green_token.png',
  './kart_red_token.png',
  './icons/icon-32.png', './icons/icon-180.png',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp && resp.status === 200 && event.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
