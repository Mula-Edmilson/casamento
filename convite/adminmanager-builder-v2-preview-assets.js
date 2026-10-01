(() => {
  'use strict';

  const MODULE_MARK = 'data-builder-preview-assets-bound';

  function currentInviteSlug() {
    const select = document.getElementById('builderV2InviteSelect');
    const inviteId = select?.value || '';
    if (!inviteId) return '';

    try {
      if (Array.isArray(invites)) {
        const invite = invites.find(item => String(item?.id) === String(inviteId));
        if (invite?.slug) return String(invite.slug).trim();
      }
    } catch { /* fallback below */ }

    const label = select?.selectedOptions?.[0]?.textContent || '';
    const separator = label.lastIndexOf('·');
    return separator >= 0 ? label.slice(separator + 1).trim() : '';
  }

  function resolveInviteAssetUrl(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';

    // URLs absolutos, data/blob e caminhos a partir da raiz já são autoritativos.
    if (/^(?:https?:|data:|blob:)/i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) return raw;

    const slug = currentInviteSlug();
    if (!slug) return raw;

    const clean = raw.replace(/^\.\//, '');
    const alreadyScoped = clean === slug || clean.startsWith(`${slug}/`);
    const relative = alreadyScoped ? clean : `${slug}/${clean}`;

    try {
      return new URL(relative, document.baseURI).href;
    } catch {
      return raw;
    }
  }

  function fixPreviewAssets() {
    const body = document.getElementById('builderV2PreviewBody');
    if (!body) return;

    body.querySelectorAll('img.builder-v2-preview-image[src]').forEach(image => {
      const raw = image.getAttribute('src') || '';
      const resolved = resolveInviteAssetUrl(raw);
      if (resolved && resolved !== raw) image.setAttribute('src', resolved);
    });
  }

  function bind() {
    const button = document.getElementById('builderV2PreviewBtn');
    if (!button || button.getAttribute(MODULE_MARK) === '1') return;
    button.setAttribute(MODULE_MARK, '1');
    button.addEventListener('click', () => queueMicrotask(fixPreviewAssets));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
