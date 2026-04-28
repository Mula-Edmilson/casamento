const CACHE_NAME = 'lirandzo-lang-clean-v8';
const CORE_ASSETS = [
  './',
  './index.html',
  './blog.html',
  './style.css?v=logo-loading-v4',
  './mobile-immersive.css?v=lang-clean-v8',
  './theme.js?v=logo-loading-v4',
  './chatbot-unified.js?v=lang-clean-v8',
  './chatbot-styles.css?v=lang-clean-v8',
  './lang-currency.js?v=lang-clean-v8',
  './loading-logo.js?v=logo-loading-v4',
  './mobile-immersive.js?v=lang-clean-v8',
  './assets/lirandzo-logo.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => null);
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
