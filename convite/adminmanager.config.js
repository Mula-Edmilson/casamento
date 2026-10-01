// Configuração pública do AdminManager.
// Depois de publicar o backend no Render, substitui este URL pelo URL real.
// Exemplo: window.LIRANDZO_MANAGER_API_BASE = 'https://lirandzo-manager.onrender.com';
window.LIRANDZO_MANAGER_API_BASE = 'https://api-casamento-mj.onrender.com';

// Módulos incrementais do AdminManager.
// Cada módulo é carregado de forma idempotente e não altera modos de produção
// automaticamente. O Builder V2 gere apenas Draft/Published; activar mongo-v2
// continua a ser uma migração explícita e separada.
(() => {
  const MODULE_ATTR = 'data-lirandzo-module';

  function loadCss(href, value) {
    if (document.querySelector(`link[${MODULE_ATTR}="${value}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(MODULE_ATTR, value);
    document.head.appendChild(link);
  }

  function loadScript(src, value) {
    if (document.querySelector(`script[${MODULE_ATTR}="${value}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(MODULE_ATTR, value);
    document.body.appendChild(script);
  }

  const loadModules = () => {
    loadScript('adminmanager-gifts.js', 'gifts');
    loadCss('adminmanager-builder-v2.css', 'builder-v2-css');
    loadScript('adminmanager-builder-v2.js', 'builder-v2');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadModules, { once: true });
  } else {
    loadModules();
  }
})();
