const CACHE_NAME = 'launchkey-station-v1.13'; // 版本号升为 v13
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './chord_detection.js', // 新增！把我们的算法文件加进缓存
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