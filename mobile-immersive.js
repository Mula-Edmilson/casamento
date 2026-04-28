/* Lirandzo — immersive mobile functions / audited conflict fix. */
(() => {
  'use strict';

  const WHATSAPP = '258878061697';
  const STORAGE = {
    savedPackageLegacy: 'lirandzo:saved-package',
    savedPackages: 'lirandzo:saved-packages',
    resume: 'lirandzo:resume-state',
    resumeDismiss: 'lirandzo:resume-dismissed',
    chatFull: 'lirandzo:chat-full-mode'
  };
  const PACKAGES = {
    'Pacote Pérola': { name: 'Pacote Pérola', price: '6.000 MT', profile: 'Essencial elegante', features: ['Convite personalizado', 'Agenda com mapa', 'Feed de felicitações', 'Contagem regressiva', 'Música de fundo'] },
    'Pacote Esmeralda': { name: 'Pacote Esmeralda', price: '10.000 MT', profile: 'Equilíbrio completo', features: ['Tudo do Pérola', 'Presentes de casamento', 'Dress code', 'Dashboard de convidados', 'Cápsula de tempo'] },
    'Pacote Rubi': { name: 'Pacote Rubi', price: '15.000 MT', profile: 'Experiência premium', features: ['Tudo do Esmeralda', 'Vídeo pré-wedding', 'Check-in', 'Cápsula por mais dias', 'Experiência mais exclusiva'] },
    'Pacote Corporate': { name: 'Pacote Corporate', price: 'Sob consulta', profile: 'Projectos empresariais', features: ['Briefing estratégico', 'Design alinhado à marca', 'Atendimento dedicado', 'Escopo sob medida', 'Proposta personalizada'] }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const isHome = () => /(^|\/)index\.html?$/.test(location.pathname) || location.pathname.endsWith('/') || location.pathname === '';
  const isBlog = () => location.pathname.endsWith('blog.html');
  const isArticle = () => document.body.classList.contains('blog-article-page') || (/blog-/.test(location.pathname) && !/blog\.html$/.test(location.pathname));
  const safeText = value => String(value || '').trim();
  const cssId = value => (window.CSS && CSS.escape) ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, match => '\\' + match);
  const haptic = (ms = 10) => { try { if ('vibrate' in navigator) navigator.vibrate(ms); } catch (_) {} };
  const storageGet = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const storageSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const storageRemove = key => { try { localStorage.removeItem(key); } catch (_) {} };
  const sessionGet = key => { try { return sessionStorage.getItem(key); } catch (_) { return null; } };
  const sessionSet = (key, value) => { try { sessionStorage.setItem(key, value); } catch (_) {} };

  const getLang = () => ((localStorage.getItem('lirandzo-language') === 'en') || String(document.documentElement.lang || '').startsWith('en')) ? 'en' : 'pt';
  const i18n = {
    pt: {
      chatMiniText: 'Escolha uma acção rápida ou abra a conversa completa.',
      compare: 'Comparar', recommend: 'Recomendar', packages: 'Pacotes', whatsapp: 'WhatsApp', fullChat: 'Abrir conversa completa',
      chipCompare: 'Comparar pacotes', chipRecommend: 'Qual pacote devo escolher?',
      whatsappChoose: 'Olá Lirandzo, gostaria de ajuda para escolher um pacote.',
      whatsappSteps: 'Olá Lirandzo, quero entender os próximos passos para criar o meu convite digital.',
      whatsappFaq: 'Olá Lirandzo, tenho uma dúvida sobre os convites digitais.',
      whatsappHelp: 'Olá Lirandzo, gostaria de atendimento personalizado.',
      shareDefault: 'Conheça a Lirandzo — convites digitais e soluções corporate.',
      copied: 'Link copiado para partilhar.'
    },
    en: {
      chatMiniText: 'Choose a quick action or open the full conversation.',
      compare: 'Compare', recommend: 'Recommend', packages: 'Packages', whatsapp: 'WhatsApp', fullChat: 'Open full conversation',
      chipCompare: 'Compare the packages', chipRecommend: 'Which package should I choose?',
      whatsappChoose: 'Hello Lirandzo, I would like help choosing a package.',
      whatsappSteps: 'Hello Lirandzo, I would like to understand the next steps to create my digital invitation.',
      whatsappFaq: 'Hello Lirandzo, I have a question about digital invitations.',
      whatsappHelp: 'Hello Lirandzo, I would like personalised support.',
      shareDefault: 'Discover Lirandzo — digital invitations and corporate solutions.',
      copied: 'Link copied to share.'
    }
  };
  const L = key => (i18n[getLang()] && i18n[getLang()][key]) || i18n.pt[key] || key;

  function toast(message) {
    let el = $('.lz-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'lz-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('is-visible'), 2400);
  }

  async function shareContent(payload = {}) {
    const title = safeText(payload.title) || document.title || 'Lirandzo';
    const text = safeText(payload.text) || L('shareDefault');
    const url = safeText(payload.url) || location.href;
    haptic(12);
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(L('copied'));
    } catch (_) {
      prompt('Copie este link:', url);
    }
  }

  function openWhatsApp(message) {
    haptic(14);
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  }

  function closeChatbot() {
    const win = $('#chatbotWindow');
    win?.classList.remove('active');
    document.body.classList.remove('chatbot-open');
  }

  function setupInstallPrompt() {
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      if ($('.lz-install-pill')) return;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'lz-resume-pill lz-install-pill is-visible';
      pill.innerHTML = '<span>Instalar</span><small>Adicionar Lirandzo ao telemóvel</small><span class="lz-resume-x" aria-hidden="true">×</span>';
      document.body.appendChild(pill);
      pill.addEventListener('click', async click => {
        if (click.target.closest('.lz-resume-x')) { pill.remove(); return; }
        if (!deferredPrompt) return;
        haptic(14);
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
        pill.remove();
      });
    });
  }

  function setupPWA() {
    if (!('serviceWorker' in navigator)) return;
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  function setupReadingProgress() {
    if (!isArticle() || $('.lz-reading-progress')) return;
    const progress = document.createElement('div');
    progress.className = 'lz-reading-progress';
    progress.innerHTML = '<span class="lz-reading-progress__bar"></span>';
    document.body.appendChild(progress);
    const bar = progress.firstElementChild;
    const update = () => {
      const article = $('.blog-article') || document.body;
      const rect = article.getBoundingClientRect();
      const total = Math.max(1, article.scrollHeight - window.innerHeight + 120);
      const passed = Math.min(Math.max(-rect.top, 0), total);
      bar.style.width = `${Math.round((passed / total) * 100)}%`;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  function getSavedPackages() {
    let list = [];
    try {
      const parsed = JSON.parse(storageGet(STORAGE.savedPackages) || '[]');
      if (Array.isArray(parsed)) list = parsed;
    } catch (_) {}
    if (!list.length) {
      try {
        const legacy = JSON.parse(storageGet(STORAGE.savedPackageLegacy) || 'null');
        if (legacy && legacy.name) list = [legacy];
      } catch (_) {}
    }
    const seen = new Set();
    const clean = list
      .filter(item => item && item.name)
      .map(item => ({ name: safeText(item.name), price: safeText(item.price || PACKAGES[item.name]?.price || ''), ts: Number(item.ts || Date.now()) }))
      .filter(item => {
        const key = item.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (clean.length) storageSet(STORAGE.savedPackages, JSON.stringify(clean));
    return clean;
  }

  function setSavedPackages(list) {
    storageSet(STORAGE.savedPackages, JSON.stringify(list));
    storageRemove(STORAGE.savedPackageLegacy);
  }

  function isSaved(name) {
    const target = safeText(name).toLowerCase();
    return getSavedPackages().some(item => item.name.toLowerCase() === target);
  }

  function updateSavedButtons() {
    const saved = new Set(getSavedPackages().map(item => item.name.toLowerCase()));
    $$('.lz-save-package').forEach(btn => {
      const name = safeText(btn.dataset.packageName);
      const active = saved.has(name.toLowerCase());
      btn.classList.toggle('is-saved', active);
      btn.textContent = active ? 'Guardado' : 'Guardar';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function savePackage(name, price) {
    const current = getSavedPackages().filter(item => item.name.toLowerCase() !== name.toLowerCase());
    const item = { name, price, ts: Date.now() };
    current.unshift(item);
    setSavedPackages(current.slice(0, 6));
    renderSavedPackageBanner();
    renderSavedPanel();
    updateSavedButtons();
    toast(`${name.replace('Pacote ', '')} guardado para consulta.`);
    haptic(16);
  }

  function removeSavedPackage(name) {
    const current = getSavedPackages().filter(item => item.name.toLowerCase() !== safeText(name).toLowerCase());
    setSavedPackages(current);
    renderSavedPackageBanner();
    renderSavedPanel();
    updateSavedButtons();
    toast('Removido dos guardados.');
    haptic(10);
  }

  function clearSavedPackages() {
    setSavedPackages([]);
    renderSavedPackageBanner();
    renderSavedPanel();
    updateSavedButtons();
    toast('Lista de guardados limpa.');
  }

  function savedMessage() {
    const list = getSavedPackages();
    if (!list.length) return L('whatsappChoose');
    const names = list.map(item => `${item.name}${item.price ? ` (${item.price})` : ''}`).join(', ');
    return `Olá Lirandzo, guardei estes pacotes no site: ${names}. Gostaria de ajuda para decidir qual é o mais indicado.`;
  }

  function renderSavedPackageBanner() {
    const list = getSavedPackages();
    const existing = $('.lz-package-memory');
    if (!isHome() || !$('#pacotes') || !list.length) {
      existing?.remove();
      return;
    }
    let banner = existing;
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'lz-package-memory';
      const anchor = $('#pacotes .packages-note') || $('#pacotes .premium-cards-row') || $('#pacotes');
      anchor.insertAdjacentElement(anchor === $('#pacotes') ? 'beforeend' : 'afterend', banner);
    }
    const count = list.length;
    banner.innerHTML = `
      <span>Tem <strong>${count}</strong> ${count === 1 ? 'convite guardado' : 'convites guardados'} para comparar.</span>
      <div class="lz-package-memory__actions">
        <button type="button" data-lz-action="open-saved">Gerir</button>
        <button type="button" data-lz-action="whatsapp-saved">WhatsApp</button>
      </div>
    `;
  }

  function savedPanelBody() {
    const list = getSavedPackages();
    if (!list.length) return '<div class="lz-saved-empty">Ainda não há pacotes guardados. Vá à secção de pacotes e toque em “Guardar”.</div>';
    return `<div class="lz-saved-list">${list.map(item => `
      <article class="lz-saved-item">
        <div><h4>${item.name.replace('Pacote ', '')}</h4><p>${item.price || 'Preço sob consulta'} · guardado para comparação</p></div>
        <div class="lz-saved-item__actions">
          <button type="button" data-lz-action="whatsapp-saved-one" data-package-name="${escapeAttr(item.name)}">WhatsApp</button>
          <button type="button" data-lz-action="remove-saved" data-package-name="${escapeAttr(item.name)}">Remover</button>
        </div>
      </article>`).join('')}</div>`;
  }

  function escapeAttr(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function ensureSavedPanel() {
    createPanel(
      'lzSavedPanel',
      'Guardados',
      'Gerir convites guardados',
      'Compare, remova ou envie a lista guardada directamente para a Lirandzo.',
      savedPanelBody(),
      '<button type="button" class="lz-panel-action primary" data-lz-action="whatsapp-saved">Enviar lista no WhatsApp</button><button type="button" class="lz-panel-action" data-lz-action="clear-saved">Limpar lista</button>'
    );
  }

  function renderSavedPanel() {
    const panel = $('#lzSavedPanel');
    if (!panel) return;
    const body = $('.lz-panel-body', panel);
    if (!body) return;
    const actions = '<div class="lz-panel-actions"><button type="button" class="lz-panel-action primary" data-lz-action="whatsapp-saved">Enviar lista no WhatsApp</button><button type="button" class="lz-panel-action" data-lz-action="clear-saved">Limpar lista</button></div>';
    body.innerHTML = `${savedPanelBody()}${actions}`;
  }

  function setupNativeShareButtons() {
    $$('.package-card-premium').forEach(card => {
      const name = safeText(card.dataset.templateName || $('h3', card)?.textContent || 'Pacote Lirandzo');
      const price = safeText(card.dataset.templatePrice || $('.package-price', card)?.textContent || PACKAGES[name]?.price || '');
      if (!$('.lz-package-actions', card)) {
        const actions = document.createElement('div');
        actions.className = 'lz-package-actions';
        actions.innerHTML = `
          <button type="button" class="lz-save-package" data-package-name="${escapeAttr(name)}" aria-label="Guardar ${escapeAttr(name)}">Guardar</button>
          <button type="button" class="lz-share-button" data-package-name="${escapeAttr(name)}" aria-label="Partilhar ${escapeAttr(name)}">Partilhar</button>
        `;
        card.appendChild(actions);
        $('.lz-share-button', actions).addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          shareContent({ title: `${name} — Lirandzo`, text: `${name} ${price ? '(' + price + ')' : ''} na Lirandzo.`, url: `${location.origin}${location.pathname}#pacotes` });
        });
        $('.lz-save-package', actions).addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          if (isSaved(name)) openSavedManager();
          else savePackage(name, price);
        });
      }
    });

    $$('.blog-card').forEach(card => {
      if ($('.lz-share-button', card)) return;
      const link = $('.blog-card-link', card) || $('a[href]', card);
      const title = safeText($('.blog-card-title', card)?.textContent || link?.textContent || 'Artigo Lirandzo');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lz-share-button';
      btn.textContent = 'Partilhar';
      btn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const url = link ? new URL(link.getAttribute('href'), location.href).href : location.href;
        shareContent({ title, text: 'Artigo do blog Lirandzo.', url });
      });
      const target = $('.blog-card-content', card) || card;
      target.appendChild(btn);
    });

    if (isArticle() && !$('.lz-article-share-block')) {
      const hero = $('.blog-article-hero');
      const title = safeText($('h1')?.textContent || document.title);
      const wrap = document.createElement('div');
      wrap.className = 'lz-article-share-block';
      wrap.innerHTML = '<button type="button" class="lz-share-button">Partilhar este artigo</button>';
      (hero || $('.article-body') || document.body).appendChild(wrap);
      $('button', wrap).addEventListener('click', () => shareContent({ title, text: 'Artigo Lirandzo para casamentos e convites digitais.', url: location.href }));
    }
    updateSavedButtons();
  }

  function createPanel(id, label, title, subtitle, body, actions = '') {
    if ($(`#${id}`)) return;
    const overlay = document.createElement('div');
    overlay.className = 'lz-panel-overlay';
    overlay.id = id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="lz-panel" role="document">
        <div class="lz-panel-handle" aria-hidden="true"></div>
        <div class="lz-panel-head">
          <div><span>${label}</span><h3>${title}</h3><p>${subtitle}</p></div>
          <button type="button" class="lz-panel-close" aria-label="Fechar">×</button>
        </div>
        <div class="lz-panel-body">${body}${actions ? `<div class="lz-panel-actions">${actions}</div>` : ''}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.lz-panel-close')) closePanels();
    });
  }

  function openPanel(id) {
    const panel = $(`#${id}`);
    if (!panel) return;
    haptic(12);
    closeChatbot();
    closePanels();
    panel.classList.add('is-open');
    document.documentElement.classList.add('lz-panel-open');
    document.body.classList.add('lz-panel-open');
    $('.lz-panel-close', panel)?.focus({ preventScroll: true });
  }

  function closePanels() {
    $$('.lz-panel-overlay.is-open').forEach(panel => panel.classList.remove('is-open'));
    document.documentElement.classList.remove('lz-panel-open');
    document.body.classList.remove('lz-panel-open');
  }

  function openSavedManager() {
    ensureSavedPanel();
    renderSavedPanel();
    openPanel('lzSavedPanel');
  }

  function setupComparePanel() {
    if (!isHome()) return;
    const cards = $$('.package-card-premium');
    if (!cards.length) return;
    const compareHTML = cards.map(card => {
      const name = safeText(card.dataset.templateName || $('h3', card)?.textContent);
      const price = safeText(card.dataset.templatePrice || $('.package-price', card)?.textContent);
      const pack = PACKAGES[name] || { profile: 'Solução Lirandzo', features: (card.dataset.features || '').split('|').slice(0, 5) };
      return `<article class="lz-compare-card"><h4>${name.replace('Pacote ', '')}</h4><span class="lz-compare-price">${price}</span><ul><li>${pack.profile}</li>${pack.features.slice(0, 5).map(item => `<li>${item}</li>`).join('')}</ul></article>`;
    }).join('');
    createPanel(
      'lzComparePanel',
      'Comparador',
      'Compare os pacotes sem sair da página',
      'Uma leitura compacta para escolher entre essencial, completo, premium ou corporate.',
      `<div class="lz-compare-grid">${compareHTML}</div>`,
      `<button type="button" class="lz-panel-action primary" data-lz-action="whatsapp-compare">Pedir recomendação</button><button type="button" class="lz-panel-action" data-lz-action="share-page">Partilhar</button>`
    );
    if (!$('.lz-section-tools')) {
      const tools = document.createElement('div');
      tools.className = 'lz-section-tools';
      tools.innerHTML = '<button type="button" class="lz-compare-trigger">Comparar pacotes</button><button type="button" class="lz-experience-trigger">Ver experiência em 30 segundos</button><button type="button" class="lz-saved-trigger" data-lz-action="open-saved">Gerir guardados</button>';
      const anchor = $('#pacotes .packages-note') || $('#pacotes .premium-cards-row') || $('#pacotes');
      anchor.insertAdjacentElement(anchor === $('#pacotes') ? 'beforeend' : 'afterend', tools);
      $('.lz-compare-trigger', tools)?.addEventListener('click', () => openPanel('lzComparePanel'));
      $('.lz-experience-trigger', tools)?.addEventListener('click', () => openPanel('lzExperiencePanel'));
    }
  }

  function setupExperiencePanel() {
    if (!isHome()) return;
    const steps = [
      ['Escolha do pacote', 'O visitante percebe rapidamente qual nível de experiência combina com o evento.'],
      ['Design do convite', 'A identidade visual do casal é transformada numa página digital elegante.'],
      ['RSVP e organização', 'Confirmações, detalhes e mensagens ficam mais fáceis de gerir.'],
      ['Lista de presentes', 'Nos pacotes superiores, os presentes podem ser apresentados de forma organizada.'],
      ['Partilha por link', 'O convite final fica pronto para enviar por WhatsApp, redes sociais ou email.']
    ];
    createPanel(
      'lzExperiencePanel',
      'Experiência',
      'Veja o fluxo Lirandzo em 30 segundos',
      'Uma explicação rápida, pensada para mobile, que mostra o valor do convite digital antes da decisão.',
      `<div class="lz-experience-steps">${steps.map(([title, text]) => `<div class="lz-experience-step"><div><strong>${title}</strong><p>${text}</p></div></div>`).join('')}</div>`,
      `<a class="lz-panel-action primary" href="#pacotes" data-lz-action="close-panel">Ver pacotes</a><button type="button" class="lz-panel-action" data-lz-action="whatsapp-experience">Falar no WhatsApp</button>`
    );
  }

  function setupQuizWhatsApp() {
    const result = $('#quizResult');
    if (!result) return;
    const ensureButton = () => {
      if ($('.lz-quiz-whatsapp', result) || getComputedStyle(result).display === 'none') return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lz-quiz-whatsapp';
      btn.textContent = 'Enviar resultado para a Lirandzo';
      btn.addEventListener('click', () => {
        const recommended = safeText($('#recommendation h4')?.textContent || 'pacote recomendado');
        openWhatsApp(`Olá Lirandzo, fiz o quiz no site e o pacote recomendado foi ${recommended}. Gostaria de saber como avançar.`);
      });
      result.appendChild(btn);
    };
    const observer = new MutationObserver(ensureButton);
    observer.observe(result, { attributes: true, childList: true, subtree: true, attributeFilter: ['style', 'class'] });
    $$('.quiz-option').forEach(option => option.addEventListener('click', () => setTimeout(ensureButton, 80)));
  }

  function currentSectionId() {
    const sections = $$('main section[id], main header[id], #main-content');
    let current = '';
    let best = -Infinity;
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      const score = rect.top <= 120 ? rect.top : -Math.abs(rect.top);
      if (rect.top < window.innerHeight * .65 && score > best) {
        best = score;
        current = section.id || 'main-content';
      }
    });
    return current || 'main-content';
  }

  function setupResume() {
    const path = location.pathname.split('/').pop() || 'index.html';
    let saved = null;
    try { saved = JSON.parse(storageGet(STORAGE.resume) || 'null'); } catch (_) {}
    const dismissed = sessionGet(STORAGE.resumeDismiss) === '1';
    if (saved && saved.path === path && saved.y > 420 && !dismissed && Math.abs(window.scrollY - saved.y) > 280) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'lz-resume-pill is-visible';
      pill.innerHTML = `<span>Continuar</span><small>${saved.sectionLabel || saved.title || 'de onde parou'}</small><span class="lz-resume-x" aria-hidden="true">×</span>`;
      document.body.appendChild(pill);
      pill.addEventListener('click', event => {
        if (event.target.closest('.lz-resume-x')) {
          event.stopPropagation();
          sessionSet(STORAGE.resumeDismiss, '1');
          pill.remove();
          return;
        }
        haptic(12);
        window.scrollTo({ top: saved.y, behavior: 'smooth' });
        pill.remove();
      });
    }
    let timer;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const id = currentSectionId();
        const label = safeText($(`#${cssId(id)} .section-title`)?.textContent || $(`#${cssId(id)} h1`)?.textContent || document.title);
        try {
          localStorage.setItem(STORAGE.resume, JSON.stringify({ path, y: Math.max(0, Math.round(window.scrollY)), section: id, sectionLabel: label, title: document.title, ts: Date.now() }));
        } catch (_) {}
      }, 240);
    };
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('beforeunload', save);
  }

  function setupSmartDock() {
    if ($('.lz-smart-dock')) return;
    const dock = document.createElement('div');
    dock.className = 'lz-smart-dock';
    dock.setAttribute('role', 'navigation');
    dock.setAttribute('aria-label', 'Acções rápidas Lirandzo');
    dock.innerHTML = `
      <div class="lz-dock-main"><span class="lz-dock-context">Lirandzo</span><strong class="lz-dock-title">Começar convite digital</strong></div>
      <div class="lz-dock-actions"><button type="button" class="lz-dock-btn secondary">Partilhar</button><button type="button" class="lz-dock-btn primary">Começar</button></div>
    `;
    document.body.appendChild(dock);
    document.body.classList.add('lz-has-smart-dock');
    const ctx = $('.lz-dock-context', dock);
    const title = $('.lz-dock-title', dock);
    const primary = $('.lz-dock-btn.primary', dock);
    const secondary = $('.lz-dock-btn.secondary', dock);

    const contexts = {
      'main-content': ['Início', 'Veja a experiência Lirandzo', 'Experiência', () => openPanel('lzExperiencePanel')],
      'demo-video': ['Demo', 'Experiência digital em acção', 'Pacotes', () => $('#pacotes')?.scrollIntoView({ behavior: 'smooth' })],
      'vantagens': ['Vantagens', 'Entenda o valor do convite', 'Pacotes', () => $('#pacotes')?.scrollIntoView({ behavior: 'smooth' })],
      'pacotes': ['Pacotes', 'Compare e guarde favoritos', 'Guardados', () => openSavedManager()],
      'quiz-section': ['Quiz', 'Descubra o pacote ideal', 'Fazer quiz', () => $('#quiz-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })],
      'como-funciona': ['Processo', 'Veja os próximos passos', 'WhatsApp', () => openWhatsApp(L('whatsappSteps'))],
      'testemunhos': ['Prova social', 'Clientes que confiaram', 'Pacotes', () => $('#pacotes')?.scrollIntoView({ behavior: 'smooth' })],
      'faq': ['FAQ', 'Tire dúvidas rapidamente', 'Falar', () => openWhatsApp(L('whatsappFaq'))],
      'sobre-nos': ['Sobre', 'Conheça a Lirandzo', 'Contacto', () => $('#apoio')?.scrollIntoView({ behavior: 'smooth' })],
      'apoio': ['Contacto', 'Estamos prontos para ajudar', 'WhatsApp', () => openWhatsApp(L('whatsappHelp'))]
    };

    const update = () => {
      let data;
      if (isArticle()) data = ['Artigo', 'Partilhe esta inspiração', 'Partilhar', () => shareContent({ title: document.title, text: 'Artigo Lirandzo.', url: location.href })];
      else if (isBlog()) data = ['Blog', 'Inspiração para casamento', 'Partilhar', () => shareContent({ title: document.title, text: 'Blog Lirandzo.', url: location.href })];
      else if (!isHome()) data = ['Lirandzo', 'Precisa de ajuda rápida?', 'WhatsApp', () => openWhatsApp(L('whatsappHelp'))];
      else data = contexts[currentSectionId()] || contexts['main-content'];
      ctx.textContent = data[0];
      title.textContent = data[1];
      primary.textContent = data[2];
      primary.onclick = data[3];
    };
    secondary.addEventListener('click', () => shareContent({ title: document.title, text: 'Conheça a Lirandzo.', url: location.href }));
    update();
    window.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  }

  function setupChatbotMiniMode() {
    const apply = () => {
      const win = $('#chatbotWindow');
      if (!win || $('.lz-chat-mini-panel', win)) return false;
      const mini = document.createElement('div');
      mini.className = 'lz-chat-mini-panel';
      const renderMini = () => {
        mini.innerHTML = `
          <p>${L('chatMiniText')}</p>
          <div class="lz-chat-mini-grid">
            <button type="button" data-chatbot-chip="${escapeAttr(L('chipCompare'))}">${L('compare')}</button>
            <button type="button" data-chatbot-chip="${escapeAttr(L('chipRecommend'))}">${L('recommend')}</button>
            <button type="button" data-lz-chat-action="packages">${L('packages')}</button>
            <button type="button" data-lz-chat-action="whatsapp">${L('whatsapp')}</button>
            <button type="button" class="primary" data-lz-chat-action="full">${L('fullChat')}</button>
          </div>
        `;
      };
      renderMini();
      $('.chatbot-header', win)?.insertAdjacentElement('afterend', mini);
      const setFull = () => {
        sessionSet(STORAGE.chatFull, '1');
        win.classList.remove('lz-chat-mini');
        document.body.classList.add('chatbot-open');
        setTimeout(() => $('#chatbotInput')?.focus({ preventScroll: true }), 40);
      };
      mini.addEventListener('click', event => {
        const action = event.target.closest('[data-lz-chat-action]')?.getAttribute('data-lz-chat-action');
        if (!action) {
          if (event.target.closest('[data-chatbot-chip]')) setFull();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (action === 'full') setFull();
        if (action === 'packages') { closeChatbot(); $('#pacotes')?.scrollIntoView({ behavior: 'smooth' }); }
        if (action === 'whatsapp') openWhatsApp(L('whatsappChoose'));
      });
      const toggle = $('#chatbotToggle');
      toggle?.addEventListener('click', () => {
        closePanels();
        setTimeout(() => {
          const mobile = matchMedia('(max-width: 768px)').matches;
          const full = sessionGet(STORAGE.chatFull) === '1';
          if (mobile && win.classList.contains('active') && !full) win.classList.add('lz-chat-mini');
          if (!win.classList.contains('active')) win.classList.remove('lz-chat-mini');
        }, 40);
      });
      $('#chatbotClose')?.addEventListener('click', () => win.classList.remove('lz-chat-mini'));
      window.addEventListener('lirandzo:language-change', () => { renderMini(); });
      window.addEventListener('lirandzo:languagechange', () => { renderMini(); });
      return true;
    };
    if (apply()) return;
    const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupInputFocusGuard() {
    const isField = el => el && el.matches && el.matches('input, textarea, select, [contenteditable="true"]');
    document.addEventListener('focusin', event => {
      if (matchMedia('(max-width: 900px)').matches && isField(event.target)) document.body.classList.add('lz-field-focus');
    });
    document.addEventListener('focusout', () => setTimeout(() => document.body.classList.remove('lz-field-focus'), 120));
  }

  function setupActionDelegates() {
    document.addEventListener('click', event => {
      const actionEl = event.target.closest('[data-lz-action]');
      const action = actionEl?.getAttribute('data-lz-action');
      if (!action) return;
      if (action === 'whatsapp-compare') openWhatsApp('Olá Lirandzo, quero ajuda para escolher entre os pacotes Pérola, Esmeralda e Rubi.');
      if (action === 'whatsapp-experience') openWhatsApp('Olá Lirandzo, vi a experiência em 30 segundos e quero criar o meu convite digital.');
      if (action === 'share-page') shareContent({ title: document.title, text: 'Conheça os pacotes Lirandzo.', url: location.href });
      if (action === 'open-saved') openSavedManager();
      if (action === 'clear-saved') clearSavedPackages();
      if (action === 'remove-saved') removeSavedPackage(actionEl.getAttribute('data-package-name'));
      if (action === 'whatsapp-saved') openWhatsApp(savedMessage());
      if (action === 'whatsapp-saved-one') {
        const name = safeText(actionEl.getAttribute('data-package-name'));
        openWhatsApp(`Olá Lirandzo, guardei o ${name} no site e gostaria de saber como avançar.`);
      }
      if (action === 'close-panel') closePanels();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { closePanels(); closeChatbot(); } });
    document.addEventListener('click', event => {
      if (event.target.closest('button, a, .template-card, .quiz-option, .faq-question, select')) haptic(6);
    }, { passive: true });
  }

  function init() {
    setupInstallPrompt();
    setupPWA();
    setupReadingProgress();
    setupExperiencePanel();
    setupComparePanel();
    ensureSavedPanel();
    setupNativeShareButtons();
    renderSavedPackageBanner();
    setupQuizWhatsApp();
    setupResume();
    setupSmartDock();
    setupChatbotMiniMode();
    setupInputFocusGuard();
    setupActionDelegates();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* Lirandzo — dynamic language consistency hardening.
   Keeps the immersive mobile layer in a single language and prevents
   panels from mixing Portuguese and English after language toggles. */
(() => {
  'use strict';

  const LANG_KEY = 'lirandzo-language';
  const STORAGE_SAVED = 'lirandzo:saved-packages';
  const WHATSAPP = '258878061697';
  let syncing = false;
  let observerTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const safe = value => String(value || '').replace(/\s+/g, ' ').trim();
  const esc = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function currentLang() {
    if (window.LirandzoI18n && window.LirandzoI18n.currentLang) {
      return window.LirandzoI18n.currentLang === 'en' ? 'en' : 'pt';
    }
    return localStorage.getItem(LANG_KEY) === 'en' || String(document.documentElement.lang || '').startsWith('en') ? 'en' : 'pt';
  }

  const UI = {
    pt: {
      close: 'Fechar',
      savedLabel: 'Guardados',
      savedTitle: 'Gerir convites guardados',
      savedSubtitle: 'Compare, remova ou envie a lista guardada directamente para a Lirandzo.',
      savedEmpty: 'Ainda não há pacotes guardados. Vá à secção de pacotes e toque em “Guardar”.',
      savedSuffix: 'guardado para comparação',
      sendList: 'Enviar lista no WhatsApp',
      clearList: 'Limpar lista',
      remove: 'Remover',
      manage: 'Gerir',
      savedSingular: 'convite guardado',
      savedPlural: 'convites guardados',
      savedBanner: count => `Tem <strong>${count}</strong> ${count === 1 ? 'convite guardado' : 'convites guardados'} para comparar.`,
      compareLabel: 'Comparador',
      compareTitle: 'Compare os pacotes sem sair da página',
      compareSubtitle: 'Uma leitura compacta para escolher entre essencial, completo, premium ou corporate.',
      recommend: 'Pedir recomendação',
      share: 'Partilhar',
      save: 'Guardar',
      saved: 'Guardado',
      toolsCompare: 'Comparar pacotes',
      toolsExperience: 'Ver experiência em 30 segundos',
      toolsSaved: 'Gerir guardados',
      experienceLabel: 'Experiência',
      experienceTitle: 'Veja o fluxo Lirandzo em 30 segundos',
      experienceSubtitle: 'Uma explicação rápida, pensada para mobile, que mostra o valor do convite digital antes da decisão.',
      viewPackages: 'Ver pacotes',
      chatWhatsapp: 'Falar no WhatsApp',
      quizWhatsapp: 'Enviar resultado para a Lirandzo',
      articleShare: 'Partilhar este artigo',
      priceOnRequest: 'Sob consulta',
      chatMiniText: 'Escolha uma acção rápida ou abra a conversa completa.',
      compareShort: 'Comparar',
      recommendShort: 'Recomendar',
      packages: 'Pacotes',
      whatsapp: 'WhatsApp',
      fullChat: 'Abrir conversa completa',
      chipCompare: 'Comparar pacotes',
      chipRecommend: 'Qual pacote devo escolher?',
      whatsappChoose: 'Olá Lirandzo, gostaria de ajuda para escolher um pacote.',
      whatsappCompare: 'Olá Lirandzo, quero ajuda para escolher entre os pacotes Pérola, Esmeralda e Rubi.',
      whatsappExperience: 'Olá Lirandzo, vi a experiência em 30 segundos e quero criar o meu convite digital.',
      whatsappSaved: names => `Olá Lirandzo, guardei estes pacotes no site: ${names}. Gostaria de ajuda para decidir qual é o mais indicado.`,
      whatsappSavedOne: name => `Olá Lirandzo, guardei o ${name} no site e gostaria de saber como avançar.`,
      dockDefault: ['Lirandzo', 'Começar convite digital', 'Começar'],
      continueText: 'Continuar'
    },
    en: {
      close: 'Close',
      savedLabel: 'Saved',
      savedTitle: 'Manage saved invitations',
      savedSubtitle: 'Compare, remove or send the saved list directly to Lirandzo.',
      savedEmpty: 'There are no saved packages yet. Go to the packages section and tap “Save”.',
      savedSuffix: 'saved for comparison',
      sendList: 'Send list on WhatsApp',
      clearList: 'Clear list',
      remove: 'Remove',
      manage: 'Manage',
      savedSingular: 'saved invitation',
      savedPlural: 'saved invitations',
      savedBanner: count => `You have <strong>${count}</strong> ${count === 1 ? 'saved invitation' : 'saved invitations'} to compare.`,
      compareLabel: 'Comparator',
      compareTitle: 'Compare packages without leaving the page',
      compareSubtitle: 'A compact way to choose between essential, complete, premium or corporate.',
      recommend: 'Ask for a recommendation',
      share: 'Share',
      save: 'Save',
      saved: 'Saved',
      toolsCompare: 'Compare packages',
      toolsExperience: 'View the 30-second experience',
      toolsSaved: 'Manage saved',
      experienceLabel: 'Experience',
      experienceTitle: 'See the Lirandzo flow in 30 seconds',
      experienceSubtitle: 'A quick mobile-first explanation that shows the value of the digital invitation before the decision.',
      viewPackages: 'View packages',
      chatWhatsapp: 'Chat on WhatsApp',
      quizWhatsapp: 'Send result to Lirandzo',
      articleShare: 'Share this article',
      priceOnRequest: 'Upon request',
      chatMiniText: 'Choose a quick action or open the full conversation.',
      compareShort: 'Compare',
      recommendShort: 'Recommend',
      packages: 'Packages',
      whatsapp: 'WhatsApp',
      fullChat: 'Open full conversation',
      chipCompare: 'Compare packages',
      chipRecommend: 'Which package should I choose?',
      whatsappChoose: 'Hello Lirandzo, I would like help choosing a package.',
      whatsappCompare: 'Hello Lirandzo, I would like help choosing between the Pearl, Emerald and Ruby packages.',
      whatsappExperience: 'Hello Lirandzo, I saw the 30-second experience and would like to create my digital invitation.',
      whatsappSaved: names => `Hello Lirandzo, I saved these packages on the site: ${names}. I would like help choosing the best option.`,
      whatsappSavedOne: name => `Hello Lirandzo, I saved the ${name} on the site and would like to know how to proceed.`,
      dockDefault: ['Lirandzo', 'Start your digital invitation', 'Start'],
      continueText: 'Continue'
    }
  };

  const PACKAGE_ORDER = ['pearl', 'emerald', 'ruby', 'corporate'];
  const PACKAGES = {
    pearl: {
      aliases: ['pacote pérola', 'pérola', 'pearl package', 'pearl'],
      pt: { name: 'Pacote Pérola', short: 'Pérola', price: '6.000 MT', profile: 'Essencial elegante', features: ['Convite personalizado', 'Agenda com mapa', 'Feed de felicitações', 'Contagem regressiva', 'Música de fundo'] },
      en: { name: 'Pearl Package', short: 'Pearl', price: '6,000 MT', profile: 'Elegant essential', features: ['Personalised invitation', 'Schedule with map', 'Congratulations feed', 'Countdown', 'Background music'] }
    },
    emerald: {
      aliases: ['pacote esmeralda', 'esmeralda', 'emerald package', 'emerald'],
      pt: { name: 'Pacote Esmeralda', short: 'Esmeralda', price: '10.000 MT', profile: 'Equilíbrio completo', features: ['Tudo do Pérola', 'Presentes de casamento', 'Dress code', 'Dashboard de convidados', 'Cápsula de tempo'] },
      en: { name: 'Emerald Package', short: 'Emerald', price: '10,000 MT', profile: 'Complete balance', features: ['Everything in Pearl', 'Wedding gifts', 'Dress code', 'Guest dashboard', 'Time capsule'] }
    },
    ruby: {
      aliases: ['pacote rubi', 'rubi', 'ruby package', 'ruby'],
      pt: { name: 'Pacote Rubi', short: 'Rubi', price: '15.000 MT', profile: 'Experiência premium', features: ['Tudo do Esmeralda', 'Vídeo pré-wedding', 'Check-in', 'Cápsula por mais dias', 'Experiência mais exclusiva'] },
      en: { name: 'Ruby Package', short: 'Ruby', price: '15,000 MT', profile: 'Premium experience', features: ['Everything in Emerald', 'Pre-wedding video', 'Check-in', 'Longer time capsule', 'More exclusive experience'] }
    },
    corporate: {
      aliases: ['pacote corporate', 'corporate package', 'corporate'],
      pt: { name: 'Pacote Corporate', short: 'Corporate', price: 'Sob consulta', profile: 'Projectos empresariais', features: ['Briefing estratégico', 'Design alinhado à marca', 'Atendimento dedicado', 'Escopo sob medida', 'Proposta personalizada'] },
      en: { name: 'Corporate Package', short: 'Corporate', price: 'Upon request', profile: 'Corporate projects', features: ['Strategic briefing', 'Brand-aligned design', 'Dedicated service', 'Tailored scope', 'Personalised proposal'] }
    }
  };

  const EXPERIENCE = {
    pt: [
      ['Escolha do pacote', 'O visitante percebe rapidamente qual nível de experiência combina com o evento.'],
      ['Design do convite', 'A identidade visual do casal é transformada numa página digital elegante.'],
      ['RSVP e organização', 'Confirmações, detalhes e mensagens ficam mais fáceis de gerir.'],
      ['Lista de presentes', 'Nos pacotes superiores, os presentes podem ser apresentados de forma organizada.'],
      ['Partilha por link', 'O convite final fica pronto para enviar por WhatsApp, redes sociais ou email.']
    ],
    en: [
      ['Package choice', 'The visitor quickly understands which experience level fits the event.'],
      ['Invitation design', 'The couple’s visual identity is turned into an elegant digital page.'],
      ['RSVP and organisation', 'Confirmations, details and messages become easier to manage.'],
      ['Gift list', 'In the higher packages, gifts can be presented in an organised way.'],
      ['Share by link', 'The final invitation is ready to send through WhatsApp, social media or email.']
    ]
  };

  function dict() { return UI[currentLang()] || UI.pt; }
  function packById(id) { return PACKAGES[id]?.[currentLang()] || PACKAGES[id]?.pt; }

  function packageIdFromName(name) {
    const target = safe(name).toLowerCase();
    if (!target) return 'pearl';
    return PACKAGE_ORDER.find(id => PACKAGES[id].aliases.some(alias => target === alias || target.includes(alias))) || 'pearl';
  }

  function packageLabel(name, options = {}) {
    const id = packageIdFromName(name);
    const pack = packById(id);
    return options.full ? pack.name : pack.short;
  }

  function packagePrice(name, fallback = '') {
    const id = packageIdFromName(name);
    const pack = packById(id);
    if (id === 'corporate') return pack.price;
    return safe(fallback) || pack.price;
  }

  function getSavedPackages() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_SAVED) || '[]');
      return Array.isArray(list) ? list.filter(item => item && item.name) : [];
    } catch (_) {
      return [];
    }
  }

  function openWhatsApp(message) {
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  }

  function setHead(panel, label, title, subtitle) {
    if (!panel) return;
    panel.setAttribute('data-no-translate', '');
    const head = $('.lz-panel-head > div', panel);
    if (!head) return;
    const span = $('span', head);
    const h3 = $('h3', head);
    const p = $('p', head);
    if (span) span.textContent = label;
    if (h3) h3.textContent = title;
    if (p) p.textContent = subtitle;
    const close = $('.lz-panel-close', panel);
    if (close) close.setAttribute('aria-label', dict().close);
  }

  function renderComparePanel() {
    const panel = $('#lzComparePanel');
    if (!panel) return;
    const t = dict();
    setHead(panel, t.compareLabel, t.compareTitle, t.compareSubtitle);
    const body = $('.lz-panel-body', panel);
    if (!body) return;
    const cards = PACKAGE_ORDER.map(id => {
      const pack = packById(id);
      return `<article class="lz-compare-card"><h4>${esc(pack.short)}</h4><span class="lz-compare-price">${esc(pack.price)}</span><ul><li>${esc(pack.profile)}</li>${pack.features.map(feature => `<li>${esc(feature)}</li>`).join('')}</ul></article>`;
    }).join('');
    body.innerHTML = `<div class="lz-compare-grid">${cards}</div><div class="lz-panel-actions"><button type="button" class="lz-panel-action primary" data-lz-action="whatsapp-compare">${esc(t.recommend)}</button><button type="button" class="lz-panel-action" data-lz-action="share-page">${esc(t.share)}</button></div>`;
  }

  function renderExperiencePanel() {
    const panel = $('#lzExperiencePanel');
    if (!panel) return;
    const t = dict();
    setHead(panel, t.experienceLabel, t.experienceTitle, t.experienceSubtitle);
    const body = $('.lz-panel-body', panel);
    if (!body) return;
    const steps = EXPERIENCE[currentLang()] || EXPERIENCE.pt;
    body.innerHTML = `<div class="lz-experience-steps">${steps.map(([title, text]) => `<div class="lz-experience-step"><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div></div>`).join('')}</div><div class="lz-panel-actions"><a class="lz-panel-action primary" href="#pacotes" data-lz-action="close-panel">${esc(t.viewPackages)}</a><button type="button" class="lz-panel-action" data-lz-action="whatsapp-experience">${esc(t.chatWhatsapp)}</button></div>`;
  }

  function savedPanelBody() {
    const t = dict();
    const list = getSavedPackages();
    if (!list.length) return `<div class="lz-saved-empty">${esc(t.savedEmpty)}</div>`;
    return `<div class="lz-saved-list">${list.map(item => {
      const shortName = packageLabel(item.name);
      const fullName = packageLabel(item.name, { full: true });
      const price = packagePrice(item.name, item.price);
      return `<article class="lz-saved-item"><div><h4>${esc(shortName)}</h4><p>${esc(price)} · ${esc(t.savedSuffix)}</p></div><div class="lz-saved-item__actions"><button type="button" data-lz-action="whatsapp-saved-one" data-package-name="${esc(fullName)}">WhatsApp</button><button type="button" data-lz-action="remove-saved" data-package-name="${esc(item.name)}">${esc(t.remove)}</button></div></article>`;
    }).join('')}</div>`;
  }

  function renderSavedPanel() {
    const panel = $('#lzSavedPanel');
    if (!panel) return;
    const t = dict();
    setHead(panel, t.savedLabel, t.savedTitle, t.savedSubtitle);
    const body = $('.lz-panel-body', panel);
    if (!body) return;
    body.innerHTML = `${savedPanelBody()}<div class="lz-panel-actions"><button type="button" class="lz-panel-action primary" data-lz-action="whatsapp-saved">${esc(t.sendList)}</button><button type="button" class="lz-panel-action" data-lz-action="clear-saved">${esc(t.clearList)}</button></div>`;
  }

  function renderToolsAndButtons() {
    const t = dict();
    const tools = $('.lz-section-tools');
    if (tools) {
      tools.setAttribute('data-no-translate', '');
      const compare = $('.lz-compare-trigger', tools);
      const experience = $('.lz-experience-trigger', tools);
      const saved = $('.lz-saved-trigger', tools);
      if (compare) compare.textContent = t.toolsCompare;
      if (experience) experience.textContent = t.toolsExperience;
      if (saved) saved.textContent = t.toolsSaved;
    }

    const savedNames = new Set(getSavedPackages().map(item => packageIdFromName(item.name)));
    $$('.lz-save-package').forEach(btn => {
      const id = packageIdFromName(btn.getAttribute('data-package-name') || btn.dataset.packageName || '');
      const active = savedNames.has(id);
      btn.setAttribute('data-no-translate', '');
      btn.textContent = active ? t.saved : t.save;
    });
    $$('.lz-share-button').forEach(btn => {
      btn.setAttribute('data-no-translate', '');
      if (/artigo|article/i.test(btn.textContent)) btn.textContent = t.articleShare;
      else btn.textContent = t.share;
    });

    const quizBtn = $('.lz-quiz-whatsapp');
    if (quizBtn) {
      quizBtn.setAttribute('data-no-translate', '');
      quizBtn.textContent = t.quizWhatsapp;
    }

    const memory = $('.lz-package-memory');
    const list = getSavedPackages();
    if (memory && list.length) {
      memory.setAttribute('data-no-translate', '');
      const span = $('span', memory);
      const buttons = $$('button', memory);
      if (span) span.innerHTML = t.savedBanner(list.length);
      if (buttons[0]) buttons[0].textContent = t.manage;
      if (buttons[1]) buttons[1].textContent = 'WhatsApp';
    }
  }

  function renderChatMini() {
    const mini = $('.lz-chat-mini-panel');
    if (!mini) return;
    const t = dict();
    mini.setAttribute('data-no-translate', '');
    mini.innerHTML = `<p>${esc(t.chatMiniText)}</p><div class="lz-chat-mini-grid"><button type="button" data-chatbot-chip="${esc(t.chipCompare)}">${esc(t.compareShort)}</button><button type="button" data-chatbot-chip="${esc(t.chipRecommend)}">${esc(t.recommendShort)}</button><button type="button" data-lz-chat-action="packages">${esc(t.packages)}</button><button type="button" data-lz-chat-action="whatsapp">${esc(t.whatsapp)}</button><button type="button" class="primary" data-lz-chat-action="full">${esc(t.fullChat)}</button></div>`;
  }

  function renderResumeAndDock() {
    const t = dict();
    $$('.lz-resume-pill').forEach(pill => {
      pill.setAttribute('data-no-translate', '');
      const first = $('span:first-child', pill);
      if (first && /continu/i.test(first.textContent)) first.textContent = t.continueText;
    });
    const dock = $('.lz-smart-dock');
    if (dock) dock.setAttribute('data-no-translate', '');
  }

  function currentSavedMessage() {
    const t = dict();
    const list = getSavedPackages();
    if (!list.length) return t.whatsappChoose;
    const names = list.map(item => {
      const name = packageLabel(item.name, { full: true });
      const price = packagePrice(item.name, item.price);
      return `${name}${price ? ` (${price})` : ''}`;
    }).join(', ');
    return t.whatsappSaved(names);
  }

  function syncLanguage() {
    if (syncing) return;
    syncing = true;
    try {
      renderComparePanel();
      renderExperiencePanel();
      renderSavedPanel();
      renderToolsAndButtons();
      renderChatMini();
      renderResumeAndDock();
    } finally {
      window.requestAnimationFrame(() => { syncing = false; });
    }
  }

  function interceptWhatsappActions() {
    document.addEventListener('click', event => {
      const actionEl = event.target.closest('[data-lz-action]');
      if (!actionEl) return;
      const action = actionEl.getAttribute('data-lz-action');
      const t = dict();
      if (action === 'whatsapp-compare') {
        event.preventDefault(); event.stopImmediatePropagation();
        openWhatsApp(t.whatsappCompare);
      }
      if (action === 'whatsapp-experience') {
        event.preventDefault(); event.stopImmediatePropagation();
        openWhatsApp(t.whatsappExperience);
      }
      if (action === 'whatsapp-saved') {
        event.preventDefault(); event.stopImmediatePropagation();
        openWhatsApp(currentSavedMessage());
      }
      if (action === 'whatsapp-saved-one') {
        event.preventDefault(); event.stopImmediatePropagation();
        const name = packageLabel(actionEl.getAttribute('data-package-name'), { full: true });
        openWhatsApp(t.whatsappSavedOne(name));
      }
    }, true);
  }

  function boot() {
    syncLanguage();
    setTimeout(syncLanguage, 180);
    setTimeout(syncLanguage, 600);
    interceptWhatsappActions();
    window.addEventListener('lirandzo:language-change', () => setTimeout(syncLanguage, 0));
    window.addEventListener('lirandzo:languagechange', () => setTimeout(syncLanguage, 0));
    window.addEventListener('storage', event => { if (event.key === LANG_KEY || event.key === STORAGE_SAVED) syncLanguage(); });

    const observer = new MutationObserver(mutations => {
      if (syncing) return;
      const relevant = mutations.some(mutation => {
        const target = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
        return target && target.closest && target.closest('.lz-panel-overlay, .lz-section-tools, .lz-package-memory, .lz-chat-mini-panel, .lz-package-actions, .lz-smart-dock, #quizResult');
      });
      if (!relevant) return;
      clearTimeout(observerTimer);
      observerTimer = setTimeout(syncLanguage, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
