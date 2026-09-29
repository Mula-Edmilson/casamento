// Configuração pública do AdminManager.
// Depois de publicar o backend no Render, substitui este URL pelo URL real.
// Exemplo: window.LIRANDZO_MANAGER_API_BASE = 'https://lirandzo-manager.onrender.com';
window.LIRANDZO_MANAGER_API_BASE = 'https://api-casamento-mj.onrender.com';

// Módulo de gestão de presentes.
// É carregado de forma idempotente e só acrescenta a interface do catálogo;
// não activa automaticamente o modo MongoDB em nenhum convite existente.
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGiftManager, { once: true });
  } else {
    loadGiftManager();
  }
})();
