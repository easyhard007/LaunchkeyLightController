const CACHE_NAME = 'launchkey-station-v1.8';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  // 必须把 Tonal.js 加上，断网时才能从本地调用乐理引擎！
  'https://cdn.jsdelivr.net/npm/tonal/browser/tonal.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
