(() => {
  'use strict';

  const STORAGE_KEY = 'lirandzo_admin_density';
  const ROOT_CLASS = 'lz-ui-v6';
  const INCREMENTAL_INVITE_SELECT_IDS = ['builderV2InviteSelect', 'giftInviteSelect'];
  let refreshQueued = false;

  const getDensity = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'comfortable' ? 'comfortable' : 'compact';
    } catch {
      return 'compact';
    }
  };

  const setDensity = (value) => {
    const density = value === 'comfortable' ? 'comfortable' : 'compact';
    document.documentElement.dataset.density = density;
    try { localStorage.setItem(STORAGE_KEY, density); } catch { /* noop */ }
    syncDensityButton();
  };

  const syncDensityButton = () => {
    const button = document.getElementById('lzDensityToggle');
    if (!button) return;
    const compact = document.documentElement.dataset.density !== 'comfortable';
    button.setAttribute('aria-pressed', compact ? 'true' : 'false');
    button.setAttribute('aria-label', compact ? 'Mudar para densidade confortável' : 'Mudar para densidade compacta');
    button.setAttribute('data-tooltip', compact ? 'Densidade: compacta' : 'Densidade: confortável');
    button.title = compact ? 'Densidade compacta' : 'Densidade confortável';
  };

  const ensureDensityToggle = () => {
    if (document.getElementById('lzDensityToggle')) return;
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'lzDensityToggle';
    button.className = 'btn icon-only lz-density-toggle';
    button.innerHTML = '<i data-feather="sliders"></i>';
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.density === 'comfortable' ? 'compact' : 'comfortable';
      setDensity(next);
    });
    actions.appendChild(button);
    syncDensityButton();
    try { window.feather?.replace(); } catch { /* noop */ }
  };

  const setViewportUnit = () => {
    document.documentElement.style.setProperty('--lz-vh', `${window.innerHeight * 0.01}px`);
  };

  const currentInviteCatalogue = () => {
    try { return Array.isArray(invites) ? invites : []; }
    catch { return []; }
  };

  const inviteCatalogueSignature = list => list.map(invite => [
    String(invite?.id || ''),
    String(invite?.coupleNames || ''),
    String(invite?.slug || '')
  ].join('\u001f')).join('\u001e');

  const selectOptions = select => Array.from(select?.options || select?.children || []);

  const syncInviteSelect = (select, list, signature) => {
    if (!select) return;

    const previous = String(select.value || '');
    const previousOption = selectOptions(select).find(option => String(option?.value || '') === previous) || null;
    const hasPreviousInCatalogue = previous && list.some(invite => String(invite?.id || '') === previous);
    const preserveDetachedSelection = Boolean(previous && !hasPreviousInCatalogue && previousOption);
    const preservedLabel = preserveDetachedSelection ? String(previousOption.textContent || previous) : '';
    const effectiveSignature = `${signature}\u001d${preserveDetachedSelection ? `${previous}\u001f${preservedLabel}` : ''}`;
    const expectedValues = ['', ...list.map(invite => String(invite?.id || ''))];
    if (preserveDetachedSelection) expectedValues.push(previous);
    const actualValues = selectOptions(select).map(option => String(option?.value || ''));

    if (
      select.dataset.lzInviteSignature === effectiveSignature &&
      actualValues.length === expectedValues.length &&
      actualValues.every((value, index) => value === expectedValues[index])
    ) return;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Seleccione um convite...';
    select.replaceChildren(placeholder);

    list.forEach(invite => {
      const option = document.createElement('option');
      option.value = String(invite?.id || '');
      const label = String(invite?.coupleNames || invite?.slug || 'Convite');
      const slug = String(invite?.slug || '');
      option.textContent = slug ? `${label} · ${slug}` : label;
      select.appendChild(option);
    });

    if (preserveDetachedSelection) {
      const option = document.createElement('option');
      option.value = previous;
      option.textContent = preservedLabel;
      option.dataset.lzPreservedSelection = '1';
      select.appendChild(option);
      select.value = previous;
    } else if (hasPreviousInCatalogue) {
      select.value = previous;
    }

    select.dataset.lzInviteSignature = effectiveSignature;
  };

  const syncIncrementalInviteSelects = () => {
    const list = currentInviteCatalogue();
    const signature = inviteCatalogueSignature(list);
    INCREMENTAL_INVITE_SELECT_IDS.forEach(id => syncInviteSelect(document.getElementById(id), list, signature));
  };

  const enhanceButtons = (root = document) => {
    root.querySelectorAll?.('button,.btn').forEach(button => {
      if (button.dataset.lzUiV6Bound === '1') return;
      button.dataset.lzUiV6Bound = '1';
      button.addEventListener('pointerdown', () => button.classList.add('lz-pressed'));
      const release = () => button.classList.remove('lz-pressed');
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });
  };

  const markBusyStates = (root = document) => {
    root.querySelectorAll?.('.btn,[data-loading]').forEach(el => {
      const busy = Boolean(el.classList?.contains?.('is-loading') || el.dataset?.loading === 'true' || el.getAttribute?.('data-loading') === 'true');
      if (busy) el.setAttribute('aria-busy', 'true');
      else if (el.getAttribute?.('aria-busy') === 'true') el.removeAttribute('aria-busy');
    });
  };

  const closeMobileSidebarAfterNavigation = (event) => {
    const item = event.target.closest('.nav-item');
    if (!item || window.innerWidth >= 1024) return;
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.overlay');
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
  };

  const refresh = () => {
    ensureDensityToggle();
    syncIncrementalInviteSelects();
    enhanceButtons();
    markBusyStates();
  };

  const queueRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  };

  const observeDynamicUi = () => {
    const observer = new MutationObserver((records) => {
      let needsRefresh = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          needsRefresh = true;
          continue;
        }
        if ([...record.addedNodes].some(node => node.nodeType === 1)) {
          needsRefresh = true;
        }
      }
      if (needsRefresh) queueRefresh();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-loading', 'hidden']
    });
  };

  const init = () => {
    document.documentElement.classList.add(ROOT_CLASS);
    setDensity(getDensity());
    setViewportUnit();
    refresh();
    observeDynamicUi();

    document.addEventListener('click', closeMobileSidebarAfterNavigation, true);
    window.addEventListener('resize', setViewportUnit, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(setViewportUnit, 160));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();