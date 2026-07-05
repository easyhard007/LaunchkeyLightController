const CACHE_NAME = 'launchkey-station-v0.74';
const urlsToCache = [
  './',
  './index.html',
  './style.css',          
  './keyboard.js',        
  './chord_detection.js',
  './light_control.js',
  './scale_chord_engine.js',
  './color_mapping.js', 
  './modulation_engine.js',
  './manifest.json',
  './icon.png',
  'https://cdn.jsdelivr.net/npm/tonal/browser/tonal.min.js',
  'https://cdn.jsdelivr.net/npm/@jaames/iro@5'
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