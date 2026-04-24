(() => {
  const STORAGE_KEY = 'lirandzo-theme';
  const THEME_COLORS = { dark: '#2B2623', light: '#F7F0E8' };

  function resolvePreferredTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (error) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function getActiveTheme() {
    return document.documentElement.getAttribute('data-theme') || resolvePreferredTheme();
  }

  function updateTogglePresentation(theme) {
    document.querySelectorAll('#themeToggle, [data-theme-toggle]').forEach((toggle) => {
      const nextTheme = theme === 'light' ? 'dark' : 'light';
      const icon = toggle.querySelector('[data-theme-icon]');
      const label = toggle.querySelector('[data-theme-label]');
      toggle.setAttribute('aria-label', theme === 'light' ? 'Activar tema escuro' : 'Activar tema claro');
      toggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      toggle.setAttribute('data-next-theme', nextTheme);
      if (icon) icon.textContent = theme === 'light' ? '☾' : '☼';
      if (label) label.textContent = theme === 'light' ? 'Escuro' : 'Claro';
    });
  }

  function updateMetaTheme(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.dark);
  }

  function applyTheme(theme, persist = false) {
    const safeTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', safeTheme);
    if (document.body) document.body.setAttribute('data-theme', safeTheme);
    updateMetaTheme(safeTheme);
    updateTogglePresentation(safeTheme);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, safeTheme); } catch (error) {}
    }
  }

  function bindThemeToggles() {
    document.querySelectorAll('#themeToggle, [data-theme-toggle]').forEach((button) => {
      if (button.dataset.themeBound === 'true') return;
      button.dataset.themeBound = 'true';
      button.addEventListener('click', () => {
        const active = getActiveTheme();
        applyTheme(active === 'light' ? 'dark' : 'light', true);
      });
    });
  }

  applyTheme(resolvePreferredTheme(), false);

  document.addEventListener('DOMContentLoaded', () => {
    bindThemeToggles();
    applyTheme(getActiveTheme(), false);
  });

  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handleSystemChange = (event) => {
      try { if (localStorage.getItem(STORAGE_KEY)) return; } catch (error) {}
      applyTheme(event.matches ? 'light' : 'dark', false);
    };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', handleSystemChange);
    else if (typeof media.addListener === 'function') media.addListener(handleSystemChange);
  }
})();
