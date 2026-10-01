// Configuração pública do AdminManager.
// Depois de publicar o backend no Render, substitui este URL pelo URL real.
// Exemplo: window.LIRANDZO_MANAGER_API_BASE = 'https://lirandzo-manager.onrender.com';
window.LIRANDZO_MANAGER_API_BASE = 'https://api-casamento-mj.onrender.com';

// Módulos incrementais do AdminManager.
// Preserva literalmente o loader histórico de Presentes e acrescenta o
// Builder V2 de forma separada e idempotente. Nenhum destes loaders activa
// automaticamente modos de produção.
(() => {
  const MODULE_ATTR = 'data-lirandzo-module';
  const MODULE_VALUE = 'gifts';

  const loadGiftManager = () => {
    if (document.querySelector(`script[${MODULE_ATTR}="${MODULE_VALUE}"]`)) return;
    const script = document.createElement('script');
    script.src = 'adminmanager-gifts.js';
    script.defer = true;
    script.setAttribute(MODULE_ATTR, MODULE_VALUE);
    document.body.appendChild(script);
  };

  const loadBuilderV2 = () => {
    if (!document.querySelector(`link[${MODULE_ATTR}="builder-v2-css"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'adminmanager-builder-v2.css';
      link.setAttribute(MODULE_ATTR, 'builder-v2-css');
      document.head.appendChild(link);
    }

    if (!document.querySelector(`script[${MODULE_ATTR}="builder-v2"]`)) {
      const script = document.createElement('script');
      script.src = 'adminmanager-builder-v2.js';
      script.defer = true;
      script.setAttribute(MODULE_ATTR, 'builder-v2');
      document.body.appendChild(script);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGiftManager, { once: true });
    document.addEventListener('DOMContentLoaded', loadBuilderV2, { once: true });
  } else {
    loadGiftManager();
    loadBuilderV2();
  }
})();
