(() => {
  'use strict';

  const STORAGE_KEY = 'lirandzo_admin_density';
  const ROOT_CLASS = 'lz-ui-v6';
  const TOOLBAR_SELECTOR = '.toolbar,.guest-crud-toolbar,.builder-v2-toolbar';

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

  const isWrapped = (node) => {
    const children = [...node.children].filter((child) => {
      const style = getComputedStyle(child);
      return style.display !== 'none' && style.position !== 'absolute';
    });
    if (children.length < 2) return false;
    const firstTop = children[0].getBoundingClientRect().top;
    return children.some(child => Math.abs(child.getBoundingClientRect().top - firstTop) > 4);
  };

  const updateToolbars = () => {
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(toolbar => {
      toolbar.classList.toggle('is-wrapped', isWrapped(toolbar));
    });
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
    root.querySelectorAll?.('.btn.is-loading,[data-loading="true"]').forEach(el => el.setAttribute('aria-busy', 'true'));
    root.querySelectorAll?.('.btn:not(.is-loading)[aria-busy="true"]').forEach(el => el.removeAttribute('aria-busy'));
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
    enhanceButtons();
    markBusyStates();
    requestAnimationFrame(updateToolbars);
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
      if (needsRefresh) refresh();
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
    window.addEventListener('resize', () => {
      setViewportUnit();
      window.clearTimeout(window.__lzUiV6ResizeTimer);
      window.__lzUiV6ResizeTimer = window.setTimeout(updateToolbars, 90);
    }, { passive: true });

    window.addEventListener('orientationchange', () => window.setTimeout(() => {
      setViewportUnit();
      updateToolbars();
    }, 160));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
