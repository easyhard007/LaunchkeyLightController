const CACHE_NAME = 'launchkey-station-v3';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// 安装时缓存所有文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// 没网时直接从缓存读取，有网时去网络获取
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果缓存里有，直接返回缓存；没有则去网络请求
        return response || fetch(event.request);
      })
  );
});
