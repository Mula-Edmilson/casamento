(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LirandzoRendererV2Bootstrap = api;
  if (root && root.document && !root.__LIRANDZO_DISABLE_AUTO_RENDERER_V2__) {
    api.boot({ root, document: root.document }).catch(function () { /* fail-closed UI já renderizada */ });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CMS_SCRIPT = './cms-template.js';

  function resolveSlug(root, legacy) {
    return String((root && root.LIRANDZO_INVITE_SLUG) || (legacy && legacy.slug) || '').trim();
  }

  function resolveApiBase(root, legacy) {
    return String(
      (root && root.LIRANDZO_API_BASE_URL) ||
      (root && root.LIRANDZO_API_URL) ||
      (legacy && legacy.apiUrl) ||
      ''
    ).trim();
  }

  function loadScript(doc, src) {
    return new Promise(function (resolve, reject) {
      if (!doc || !doc.createElement) return reject(new Error('Documento indisponível para carregar o template.'));
      const existing = doc.querySelector && doc.querySelector('script[data-lirandzo-renderer-cms="1"]');
      if (existing) return resolve(existing);
      const script = doc.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.lirandzoRendererCms = '1';
      script.addEventListener('load', function () { resolve(script); }, { once: true });
      script.addEventListener('error', function () { reject(new Error('Falha ao carregar o renderer visual do convite.')); }, { once: true });
      (doc.body || doc.head || doc.documentElement).appendChild(script);
    });
  }

  function renderFailure(doc, message) {
    if (!doc || !doc.body || !doc.createElement) return;
    let box = doc.getElementById && doc.getElementById('lirandzoRendererV2Error');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'lirandzoRendererV2Error';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:#111;color:#fff;font-family:system-ui,sans-serif;text-align:center;';
      const inner = doc.createElement('div');
      inner.style.cssText = 'max-width:560px;line-height:1.6;';
      const title = doc.createElement('strong');
      title.textContent = 'Convite temporariamente indisponível';
      title.style.cssText = 'display:block;font-size:1.2rem;margin-bottom:8px;';
      const text = doc.createElement('span');
      text.textContent = message || 'Não foi possível carregar o conteúdo publicado. Tente novamente dentro de instantes.';
      inner.appendChild(title);
      inner.appendChild(text);
      box.appendChild(inner);
      doc.body.appendChild(box);
    }
  }

  async function boot(options) {
    const opts = options || {};
    const root = opts.root || (typeof globalThis !== 'undefined' ? globalThis : null);
    const doc = opts.document || (root && root.document) || null;
    const renderer = opts.renderer || (root && root.LirandzoPublicRendererV2);
    const legacy = root && root.LIRANDZO_EVENT_DATA && typeof root.LIRANDZO_EVENT_DATA === 'object'
      ? root.LIRANDZO_EVENT_DATA
      : {};

    if (!renderer || typeof renderer.fetchPublicEnvelope !== 'function' || typeof renderer.resolveEnvelope !== 'function') {
      const error = new Error('Núcleo do Renderer V2 indisponível.');
      if (root) root.LIRANDZO_RENDERER_V2_STATE = { mode: 'error', active: false, code: 'RENDERER_CORE_MISSING' };
      renderFailure(doc, error.message);
      throw error;
    }

    const slug = resolveSlug(root, legacy);
    const apiBase = resolveApiBase(root, legacy);

    try {
      const envelope = await renderer.fetchPublicEnvelope({
        apiBase,
        slug,
        fetchImpl: opts.fetchImpl
      });
      const resolved = renderer.resolveEnvelope(envelope);

      if (resolved.active === true && resolved.mode === renderer.ACTIVE_MODE) {
        root.LIRANDZO_EVENT_DATA = resolved.content;
        root.LIRANDZO_RENDERER_V2_STATE = {
          mode: renderer.ACTIVE_MODE,
          active: true,
          revision: resolved.revision || 0,
          hash: resolved.hash || ''
        };
        if (doc && doc.documentElement && doc.documentElement.dataset) doc.documentElement.dataset.rendererMode = renderer.ACTIVE_MODE;
        if (typeof renderer.applySeo === 'function') renderer.applySeo(resolved.content, doc);
      } else {
        root.LIRANDZO_EVENT_DATA = legacy;
        root.LIRANDZO_RENDERER_V2_STATE = { mode: 'legacy', active: false, revision: 0, hash: '' };
        if (doc && doc.documentElement && doc.documentElement.dataset) doc.documentElement.dataset.rendererMode = 'legacy';
      }

      const cms = opts.loadScriptImpl
        ? await opts.loadScriptImpl(doc, CMS_SCRIPT)
        : await loadScript(doc, CMS_SCRIPT);
      return { resolved, cms };
    } catch (error) {
      if (root) root.LIRANDZO_RENDERER_V2_STATE = {
        mode: 'error',
        active: false,
        code: error && error.code ? error.code : 'PUBLIC_CONTENT_LOAD_FAILED',
        status: error && error.status ? error.status : 0
      };
      if (doc && doc.documentElement && doc.documentElement.dataset) doc.documentElement.dataset.rendererMode = 'error';
      renderFailure(doc, error && error.message);
      throw error;
    }
  }

  return {
    CMS_SCRIPT,
    resolveSlug,
    resolveApiBase,
    loadScript,
    renderFailure,
    boot
  };
});
