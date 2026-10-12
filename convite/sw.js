/* Lirandzo Admin Manager · service worker
   Estratégia:
   - API (/manager, /api, /admin-api, /health) → NUNCA em cache (dados sensíveis)
   - Navegação (HTML) → network-first com fallback ao shell em cache
   - Assets (css/js/ícones/fontes) → stale-while-revalidate
   O shell em cache permite arranque instantâneo e instalação no ecrã inicial;
   os dados são sempre buscados na rede, que exige sessão válida. */
const CACHE = 'lirandzo-adminmanager-shell-v1';
const SHELL = [
  '/convite/adminmanager.html',
  '/convite/adminmanager.css',
  '/convite/adminmanager-operator.css',
  '/convite/adminmanager-operator.js',
  '/convite/adminmanager.config.js',
  '/convite/adminmanager-gifts.js',
  '/convite/manifest.webmanifest',
  '/convite/icon-192.png',
  '/convite/icon-512.png',
  '/convite/icon-maskable-192.png',
  '/convite/icon-maskable-512.png'
];
const API_PREFIXES = ['/manager/', '/api/', '/admin-api/', '/health'];
const isApi = url => API_PREFIXES.some(p => url.pathname.startsWith(p));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {}) /* um recurso indisponível não deve impedir a instalação */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; /* CDN: comportamento normal do browser */
  if (isApi(url)) return; /* API: sempre rede, nunca cache */

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('/convite/adminmanager.html', copy));
          return res;
        })
        .catch(() => caches.match('/convite/adminmanager.html').then(r => r || caches.match('/convite/adminmanager.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
