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

  const loadBuilderDetails = () => {
    if (document.querySelector(`script[${MODULE_ATTR}="builder-v2-details"]`)) return;
    const script = document.createElement('script');
    script.src = 'adminmanager-builder-v2-details.js';
    script.defer = true;
    script.setAttribute(MODULE_ATTR, 'builder-v2-details');
    document.body.appendChild(script);
  };

  const loadBuilderPreviewAssets = () => {
    if (document.querySelector(`script[${MODULE_ATTR}="builder-v2-preview-assets"]`)) return;
    const script = document.createElement('script');
    script.src = 'adminmanager-builder-v2-preview-assets.js';
    script.defer = true;
    script.setAttribute(MODULE_ATTR, 'builder-v2-preview-assets');
    document.body.appendChild(script);
  };

  const loadTemplateFactoryV2 = () => {
    if (document.querySelector(`script[${MODULE_ATTR}="template-factory-v2"]`)) return;
    const script = document.createElement('script');
    script.src = 'adminmanager-template-factory-v2.js';
    script.defer = true;
    script.setAttribute(MODULE_ATTR, 'template-factory-v2');
    document.body.appendChild(script);
  };

  const loadUiV6 = () => {
    if (!document.querySelector(`link[${MODULE_ATTR}="ui-v6-css"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'adminmanager-ui-v6.css';
      link.setAttribute(MODULE_ATTR, 'ui-v6-css');
      document.head.appendChild(link);
    }

    if (!document.querySelector(`script[${MODULE_ATTR}="ui-v6"]`)) {
      const script = document.createElement('script');
      script.src = 'adminmanager-ui-v6.js';
      script.defer = true;
      script.setAttribute(MODULE_ATTR, 'ui-v6');
      document.body.appendChild(script);
    }
  };

  const loadBuilderExtras = () => {
    loadBuilderDetails();
    loadBuilderPreviewAssets();
    loadTemplateFactoryV2();
  };

  const loadBuilderV2 = () => {
    if (!document.querySelector(`link[${MODULE_ATTR}="builder-v2-css"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'adminmanager-builder-v2.css';
      link.setAttribute(MODULE_ATTR, 'builder-v2-css');
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[${MODULE_ATTR}="builder-v2"]`);
    if (existing) {
      loadBuilderExtras();
      loadUiV6();
      return;
    }

    const script = document.createElement('script');
    script.src = 'adminmanager-builder-v2.js';
    script.defer = true;
    script.setAttribute(MODULE_ATTR, 'builder-v2');
    script.addEventListener('load', () => {
      loadBuilderExtras();
      loadUiV6();
    }, { once: true });
    document.body.appendChild(script);
  };

  const boot = () => {
    loadGiftManager();
    loadBuilderV2();
    // O Builder CSS é anexado sincronamente dentro de loadBuilderV2; a V6
    // fica sempre depois dele na cascata, mesmo se o script Builder atrasar.
    loadUiV6();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
