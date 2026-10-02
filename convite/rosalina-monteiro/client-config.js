window.LIRANDZO_INVITE_SLUG = 'rosalina-monteiro';
window.LIRANDZO_API_BASE_URL = 'https://api-casamento-mj.onrender.com';
window.LIRANDZO_API_URL = window.LIRANDZO_API_BASE_URL.replace(/\/+$/, '') + '/api';
window.LIRANDZO_CHECKIN_PASSWORD = window.LIRANDZO_CHECKIN_PASSWORD || 'checkin2026';

(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  var pathname = String(window.location && window.location.pathname || '').replace(/\/+$/, '');
  var isPublicRosalinaPage = /\/rosalina-monteiro(?:\/(?:index\.html|convite\.html)?)?$/.test(pathname);
  if (!isPublicRosalinaPage) return;

  var current = document.currentScript && document.currentScript.src;
  var base = current ? new URL('.', current) : new URL('./', window.location.href);
  var coreUrl = new URL('../builder-v2/public-renderer-v2.js', base).href;
  var bridgeUrl = new URL('./renderer-v2-live-bridge.js', base).href;

  function loadOnce(id, src) {
    var existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset && existing.dataset.loaded === 'true') return Promise.resolve(existing);
      return new Promise(function (resolve, reject) {
        existing.addEventListener('load', function () { resolve(existing); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Falha ao carregar ' + src)); }, { once: true });
      });
    }
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = false;
      script.addEventListener('load', function () {
        script.dataset.loaded = 'true';
        resolve(script);
      }, { once: true });
      script.addEventListener('error', function () { reject(new Error('Falha ao carregar ' + src)); }, { once: true });
      (document.head || document.documentElement).appendChild(script);
    });
  }

  window.LIRANDZO_ROSALINA_V2_LINK_PROMISE = loadOnce('lirandzoPublicRendererV2', coreUrl)
    .then(function () { return loadOnce('lirandzoRosalinaV2Bridge', bridgeUrl); })
    .catch(function (error) {
      window.LIRANDZO_V2_LIVE_STATE = { active: false, mode: 'loader-error', slug: window.LIRANDZO_INVITE_SLUG, error: String(error && error.message || error) };
      throw error;
    });
})();
