/* Lirandzo — envio compatível com GitHub Pages + Google Apps Script */
(function () {
  'use strict';

  const PLACEHOLDER = 'COLE_AQUI_O_URL_DO_GOOGLE_APPS_SCRIPT_EXEC';

  function getEndpointUrl() {
    return String(window.LIRANDZO_APPS_SCRIPT_URL || '').trim();
  }

  function isConfigured() {
    const url = getEndpointUrl();
    return Boolean(url && url !== PLACEHOLDER && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(url));
  }

  function getLanguage() {
    try {
      return ((window.LirandzoI18n && window.LirandzoI18n.currentLang) || localStorage.getItem('lirandzo-language')) === 'en' ? 'en' : 'pt';
    } catch (error) {
      return 'pt';
    }
  }

  function enrichFormData(formData, form, extra) {
    const now = new Date();
    const lang = getLanguage();
    const extraData = extra || {};

    formData.set('Idioma activo no site', lang === 'en' ? 'Inglês' : 'Português');
    formData.set('Página de origem', window.location.href);
    formData.set('Domínio de origem', window.location.origin);
    formData.set('Data local do envio', now.toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT'));
    formData.set('User agent', navigator.userAgent || '');

    Object.keys(extraData).forEach((key) => {
      if (!key) return;
      formData.set(key, extraData[key]);
    });

    const formName = form && (form.getAttribute('aria-label') || form.id || form.name);
    if (formName) formData.set('Identificador do formulário', formName);

    return formData;
  }

  async function send(form, formData, extra) {
    if (!isConfigured()) {
      throw new Error('apps-script-not-configured');
    }

    const payload = enrichFormData(formData, form, extra);

    // Importante: sem headers personalizados e com no-cors.
    // Isto evita o bloqueio CORS em websites estáticos alojados no GitHub Pages.
    await fetch(getEndpointUrl(), {
      method: 'POST',
      mode: 'no-cors',
      body: payload
    });

    // A resposta do Google Apps Script fica opaca por design em no-cors.
    // Se a promessa resolver, o navegador conseguiu despachar o pedido.
    return { success: true, opaque: true };
  }

  window.LirandzoAppsScript = {
    send,
    isConfigured,
    getEndpointUrl
  };
})();
