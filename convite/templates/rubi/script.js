'use strict';

const CONFIG = {
  packageName: 'Pacote Esmeralda',
  bride: 'Nélia',
  groom: 'Edmilson',
  dateISO: '2026-12-12T14:00:00+02:00',
  dateDisplay: '12 de Dezembro de 2026',
  ceremony: {
    time: '14:00',
    title: 'Cerimónia religiosa',
    place: 'Igreja Nossa Senhora da Paz',
    address: 'Igreja Nossa Senhora da Paz, Maputo'
  },
  reception: {
    time: '18:00',
    title: 'Copo de água',
    place: 'Quinta Terra Dourada',
    address: 'Quinta Terra Dourada, Maputo'
  },
  whatsappNumber: '+258846342251',
  dashboardPin: '2026',
  musicUrl: 'https://static.wixstatic.com/mp3/819ea0_e333d443f2f545e59d79429cdd3c1361.mp3',
  giftOptions: [
    'Jogo de jantar elegante',
    'Conjunto de copos',
    'Jogo de panelas',
    'Roupa de cama premium',
    'Conjunto de toalhas',
    'Voucher para lua-de-mel',
    'Decor para sala',
    'Apoio financeiro aos noivos'
  ]
};

const STORAGE = {
  rsvps: 'lirandzo_emerald_rsvps_v2',
  gifts: 'lirandzo_emerald_gifts_v2',
  messages: 'lirandzo_emerald_messages_v2',
  capsules: 'lirandzo_emerald_capsules_v2',
  checkins: 'lirandzo_emerald_checkins_v1'
};

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

function getStore(key, fallback = []) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function setStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeModal(modal) {
  modal.classList.remove('open');
  if (!$('.modal.open')) document.body.classList.remove('modal-open');
}

function createMapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function openWhatsApp(message) {
  const phone = CONFIG.whatsappNumber.replace(/\D/g, '');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function initIdentity() {
  const names = `${CONFIG.bride} & ${CONFIG.groom}`;
  document.title = `Convite de Casamento — ${names}`;
  $$('[data-couple-names]').forEach(el => { el.textContent = names; });
  $$('[data-wedding-date]').forEach(el => { el.textContent = CONFIG.dateDisplay; });
  const ceremonyPlace = $('[data-ceremony-place]');
  const receptionPlace = $('[data-reception-place]');
  if (ceremonyPlace) ceremonyPlace.textContent = CONFIG.ceremony.place;
  if (receptionPlace) receptionPlace.textContent = CONFIG.reception.place;
  const audio = $('#backgroundMusic');
  if (audio) audio.src = CONFIG.musicUrl;
}

function initPreloader() {
  const preloader = $('#preloader');
  window.addEventListener('load', () => {
    setTimeout(() => preloader?.classList.add('is-hidden'), 520);
  });
  setTimeout(() => preloader?.classList.add('is-hidden'), 2600);
}

function initCountdown() {
  const eventDate = new Date(CONFIG.dateISO).getTime();
  const refs = {
    days: $('#days'),
    hours: $('#hours'),
    minutes: $('#minutes'),
    seconds: $('#seconds')
  };

  const updateValue = (el, value) => {
    if (!el || el.textContent === value) return;
    el.textContent = value;
    el.classList.add('tick');
    setTimeout(() => el.classList.remove('tick'), 220);
  };

  const tick = () => {
    const distance = Math.max(0, eventDate - Date.now());
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((distance / (1000 * 60)) % 60);
    const seconds = Math.floor((distance / 1000) % 60);
    updateValue(refs.days, String(days).padStart(2, '0'));
    updateValue(refs.hours, String(hours).padStart(2, '0'));
    updateValue(refs.minutes, String(minutes).padStart(2, '0'));
    updateValue(refs.seconds, String(seconds).padStart(2, '0'));
  };

  tick();
  setInterval(tick, 1000);
}

function initModals() {
  $$('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.openModal));
  });

  $$('.modal').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-close-modal]')) closeModal(modal);
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') $$('.modal.open').forEach(closeModal);
  });
}

function initScrollButtons() {
  $$('[data-scroll-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.scrollTo);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function initMaps() {
  const open = place => {
    const address = place === 'ceremony' ? CONFIG.ceremony.address : CONFIG.reception.address;
    window.open(createMapsUrl(address), '_blank', 'noopener,noreferrer');
  };

  $$('[data-map]').forEach(btn => {
    btn.addEventListener('click', () => open(btn.dataset.map));
  });

  $('#quickMapBtn')?.addEventListener('click', () => open('reception'));
}

function initMusic() {
  const audio = $('#backgroundMusic');
  const toggle = $('#musicToggle');
  if (!audio || !toggle) return;

  let isPlaying = false;
  const update = () => {
    toggle.classList.toggle('is-playing', isPlaying);
    toggle.querySelector('span').textContent = isPlaying ? 'Pausar' : 'Som';
  };

  toggle.addEventListener('click', async () => {
    try {
      if (isPlaying) {
        audio.pause();
        isPlaying = false;
      } else {
        await audio.play();
        isPlaying = true;
      }
      update();
    } catch (error) {
      toggle.querySelector('span').textContent = 'Tocar';
    }
  });
}

function initShare() {
  $('#shareInvite')?.addEventListener('click', async () => {
    const shareData = {
      title: `Convite de Casamento — ${CONFIG.bride} & ${CONFIG.groom}`,
      text: `Temos a honra de convidá-lo(a) para o casamento de ${CONFIG.bride} & ${CONFIG.groom}.`,
      url: window.location.href
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (error) { /* cancelado pelo utilizador */ }
    } else {
      await navigator.clipboard?.writeText(window.location.href);
      alert('Link do convite copiado.');
    }
  });
}

function initCalendar() {
  $('#addCalendarBtn')?.addEventListener('click', () => {
    const start = new Date(CONFIG.dateISO);
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
    const format = date => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `SUMMARY:Casamento ${CONFIG.bride} & ${CONFIG.groom}`,
      `DTSTART:${format(start)}`,
      `DTEND:${format(end)}`,
      `LOCATION:${CONFIG.reception.place}`,
      `DESCRIPTION:Convite digital Lirandzo — ${CONFIG.packageName}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n');
    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `casamento-${CONFIG.bride}-${CONFIG.groom}.ics`.toLowerCase().replace(/\s+/g, '-');
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

function initRsvp() {
  const form = $('#rsvpForm');
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = readRsvpForm();
    const rsvps = getStore(STORAGE.rsvps);
    const existingIndex = rsvps.findIndex(item => item.name.toLowerCase() === data.name.toLowerCase());
    if (existingIndex >= 0) rsvps[existingIndex] = data;
    else rsvps.unshift(data);
    setStore(STORAGE.rsvps, rsvps);
    $('#rsvpStatus').textContent = 'RSVP guardado com sucesso.';
    setTimeout(() => closeModal($('#rsvpModal')), 900);
    renderDashboard();
  });

  $('#sendRsvpWhatsapp')?.addEventListener('click', () => {
    const data = readRsvpForm(false);
    const message = `Olá Lirandzo, segue RSVP para o casamento de ${CONFIG.bride} & ${CONFIG.groom}.\n\nNome: ${data.name || '—'}\nPresença: ${data.presence}\nPessoas: ${data.guests}\nTelefone: ${data.phone || '—'}\nMensagem: ${data.message || '—'}`;
    openWhatsApp(message);
  });
}

function readRsvpForm(validate = true) {
  const data = {
    id: `rsvp-${Date.now()}`,
    name: $('#rsvpName')?.value.trim() || '',
    phone: $('#rsvpPhone')?.value.trim() || '',
    presence: $('#rsvpPresence')?.value || 'Confirmado',
    guests: $('#rsvpGuests')?.value || '1',
    message: $('#rsvpMessage')?.value.trim() || '',
    timestamp: new Date().toISOString()
  };
  if (validate && !data.name) throw new Error('Nome obrigatório');
  return data;
}

function renderGifts() {
  const saved = getStore(STORAGE.gifts, []);
  const giftList = $('#giftList');
  if (!giftList) return;

  giftList.innerHTML = CONFIG.giftOptions.map(gift => {
    const reserved = saved.find(item => item.gift === gift);
    return `
      <label class="gift-card ${reserved ? 'reserved' : ''}">
        <input type="checkbox" value="${escapeHTML(gift)}" ${reserved ? 'disabled' : ''}>
        <strong>${escapeHTML(gift)}</strong>
        <small>${reserved ? `Reservado por ${escapeHTML(reserved.by)}` : 'Disponível para reserva'}</small>
      </label>
    `;
  }).join('');
}

function initGifts() {
  renderGifts();
  $$('[data-open-modal="giftModal"]').forEach(button => {
    button.addEventListener('click', () => {
      renderGifts();
      const status = $('#giftStatus');
      if (status) status.textContent = '';
    });
  });

  const saveButton = $('#saveGiftSelection');
  if (!saveButton) return;

  saveButton.addEventListener('click', () => {
    const selected = $$('#giftList input:checked:not(:disabled)').map(input => input.value);
    const guest = $('#giftReservationName')?.value.trim() || $('#rsvpName')?.value.trim() || $('#messageName')?.value.trim();
    const status = $('#giftStatus');
    if (!guest) {
      status.textContent = 'Escreva o seu nome para reservar o presente.';
      $('#giftReservationName')?.focus();
      return;
    }
    if (!selected.length) {
      status.textContent = 'Seleccione pelo menos um presente disponível.';
      return;
    }
    const current = getStore(STORAGE.gifts, []);
    selected.forEach(gift => {
      if (!current.some(item => item.gift === gift)) current.push({ gift, by: guest, timestamp: new Date().toISOString() });
    });
    setStore(STORAGE.gifts, current);
    status.textContent = selected.length === 1 ? 'Presente reservado com sucesso.' : 'Presentes reservados com sucesso.';
    renderGifts();
    renderDashboard();
  });
}

function initMessages() {
  const form = $('#messageForm');
  renderMessages();
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#messageName').value.trim();
    const text = $('#messageText').value.trim();
    if (!name || !text) return;
    const messages = getStore(STORAGE.messages);
    messages.unshift({ name, text, timestamp: new Date().toISOString() });
    setStore(STORAGE.messages, messages.slice(0, 30));
    form.reset();
    renderMessages();
    renderDashboard();
  });
}

function renderMessages() {
  const feed = $('#guestbookFeed');
  if (!feed) return;
  const messages = getStore(STORAGE.messages);
  if (!messages.length) {
    feed.innerHTML = '<p class="section-lead">Ainda não há mensagens. Seja o primeiro a deixar uma felicitação.</p>';
    return;
  }
  feed.innerHTML = messages.map(message => `
    <article class="guestbook-entry">
      <strong>${escapeHTML(message.name)}</strong>
      <span>${formatDate(new Date(message.timestamp))}</span>
      <p>${escapeHTML(message.text)}</p>
    </article>
  `).join('');
}

function initCapsule() {
  const form = $('#capsuleForm');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#capsuleName').value.trim();
    const text = $('#capsuleText').value.trim();
    if (!name || !text) return;
    const capsules = getStore(STORAGE.capsules);
    capsules.unshift({ name, text, timestamp: new Date().toISOString(), sealed: true });
    setStore(STORAGE.capsules, capsules);
    $('#capsuleStatus').textContent = 'Mensagem guardada na cápsula do tempo.';
    form.reset();
    renderDashboard();
  });
}

function initDashboard() {
  $('#unlockDashboard')?.addEventListener('click', () => {
    const pin = $('#dashboardPin')?.value.trim();
    if (pin !== CONFIG.dashboardPin) {
      alert('PIN incorrecto.');
      return;
    }
    $('#dashboardLock').hidden = true;
    $('#dashboardPanel').hidden = false;
    renderDashboard(true);
  });

  $('#exportData')?.addEventListener('click', () => {
    const data = collectData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'dados-convite-esmeralda.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $('#clearDemoData')?.addEventListener('click', () => {
    if (!confirm('Limpar todos os dados locais desta demo?')) return;
    Object.values(STORAGE).forEach(key => localStorage.removeItem(key));
    renderGifts();
    renderMessages();
    renderDashboard(true);
  });
}

function collectData() {
  return {
    couple: `${CONFIG.bride} & ${CONFIG.groom}`,
    package: CONFIG.packageName,
    rsvps: getStore(STORAGE.rsvps),
    gifts: getStore(STORAGE.gifts),
    messages: getStore(STORAGE.messages),
    capsules: getStore(STORAGE.capsules)
  };
}

function renderDashboard(force = false) {
  if (!force && $('#dashboardPanel')?.hidden) return;
  const data = collectData();
  $('#dashRsvps').textContent = data.rsvps.length;
  $('#dashGifts').textContent = data.gifts.length;
  $('#dashMessages').textContent = data.messages.length;
  $('#dashCapsules').textContent = data.capsules.length;
  const confirmed = data.rsvps.filter(item => item.presence === 'Confirmado').reduce((total, item) => total + Number(item.guests || 1), 0);
  $('#dashboardOutput').innerHTML = `<pre>${escapeHTML([
    `Casal: ${data.couple}`,
    `Pacote: ${data.package}`,
    `Convidados confirmados: ${confirmed}`,
    '',
    'Últimos RSVPs:',
    ...(data.rsvps.slice(0, 5).map(item => `- ${item.name} · ${item.presence} · ${item.guests} pessoa(s)`) || ['—']),
    '',
    'Presentes reservados:',
    ...(data.gifts.slice(0, 8).map(item => `- ${item.gift} · ${item.by}`) || ['—'])
  ].join('\n'))}</pre>`;
}

function initLightbox() {
  const modal = $('#lightboxModal');
  const image = $('#lightboxImage');
  if (!modal || !image) return;
  $$('[data-lightbox]').forEach(btn => {
    btn.addEventListener('click', () => {
      image.src = btn.dataset.lightbox;
      openModal('lightboxModal');
    });
  });
}

function initReveal() {
  const elements = $$('.reveal');
  if (!('IntersectionObserver' in window)) {
    elements.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });
  elements.forEach(el => observer.observe(el));
}

function initKeyboardTimeline() {
  const timeline = $('#storyTimeline');
  if (!timeline) return;
  timeline.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') timeline.scrollBy({ left: 280, behavior: 'smooth' });
    if (event.key === 'ArrowLeft') timeline.scrollBy({ left: -280, behavior: 'smooth' });
  });
}

function init() {
  initIdentity();
  initPreloader();
  initCountdown();
  initModals();
  initScrollButtons();
  initMaps();
  initMusic();
  initShare();
  initCalendar();
  initRsvp();
  initGifts();
  initMessages();
  initCapsule();
  initDashboard();
  initLightbox();
  initReveal();
  initKeyboardTimeline();
}

document.addEventListener('DOMContentLoaded', () => init());

/* =========================================================
   LIRANDZO · MOVIMENTO EDITORIAL DO CONVITE
   Mantém todas as funções existentes e adiciona entrada lenta,
   revelação por camadas e parallax leve sem estilo SaaS.
   ========================================================= */
function initEditorialMotion() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revealRoots = $$('.reveal');
  const itemSelector = [
    '.small-caps', 'h2', '.script-line', '.section-lead', '.intro-actions',
    '.timeline article', '.gallery-item', '.agenda-item', '.guide-grid article',
    '.gift-card', '.note-form', '.guestbook-entry', '.section-actions',
    '.letter-card', '.family-grid article', '.moment-hero', '.moment-card',
    '.honour-list article', '.reception-flow article', '.faq-item',
    '#capsuleForm', '.footer-logo', '.invite-footer p', '.invite-footer .text-link'
  ].join(',');

  revealRoots.forEach(root => {
    const items = $$(itemSelector, root);
    items.forEach((item, index) => {
      item.classList.add('motion-item');
      item.style.setProperty('--motion-delay', Math.min(index, 9));
      if (item.classList.contains('agenda-item') && index % 2 === 0) item.classList.add('motion-slide-left');
      if (item.classList.contains('agenda-item') && index % 2 !== 0) item.classList.add('motion-slide-right');
    });
  });

  const footer = $('.invite-footer');
  if (footer) {
    footer.classList.add('reveal');
    $$('.footer-logo, p, .text-link', footer).forEach((item, index) => {
      item.classList.add('motion-item');
      item.style.setProperty('--motion-delay', index);
    });
    if ('IntersectionObserver' in window) {
      const footerObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            footer.classList.add('is-visible');
            footerObserver.unobserve(footer);
          }
        });
      }, { threshold: 0.16 });
      footerObserver.observe(footer);
    } else {
      footer.classList.add('is-visible');
    }
  }

  const ready = () => {
    document.body.classList.remove('motion-preparing');
    document.body.classList.add('motion-ready');
  };

  if (reduceMotion) {
    ready();
    return;
  }

  if (document.readyState === 'complete') {
    setTimeout(ready, 180);
  } else {
    window.addEventListener('load', () => setTimeout(ready, 180), { once: true });
    setTimeout(ready, 1900);
  }

  const coverPhoto = $('.cover-photo');
  let ticking = false;
  const updateParallax = () => {
    ticking = false;
    if (!coverPhoto) return;
    const y = Math.max(-26, Math.min(32, window.scrollY * 0.045));
    coverPhoto.style.setProperty('--cover-y', `${y}px`);
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateParallax);
  }, { passive: true });
  updateParallax();
}

function initLiveMotionRefresh() {
  const animatedContainers = ['#giftList', '#guestbookFeed', '#dashboardOutput'];
  animatedContainers.forEach(selector => {
    const target = $(selector);
    if (!target || !('MutationObserver' in window)) return;
    const observer = new MutationObserver(() => {
      Array.from(target.children).forEach((child, index) => {
        child.style.setProperty('--motion-delay', Math.min(index, 6));
      });
    });
    observer.observe(target, { childList: true });
  });
}

(function patchLirandzoInvitationMotion(){
  const previousInit = init;
  init = function enhancedInit() {
    previousInit();
    initEditorialMotion();
    initLiveMotionRefresh();
  };
})();


/* =========================================================
   LIRANDZO · SECÇÕES PREMIUM / FAQ DOS CONVIDADOS
   Pequena camada funcional sem alterar RSVP, presentes,
   mural, cápsula, música, mapa, partilha ou dashboard.
   ========================================================= */
function initGuestFaq() {
  const faq = $('#guestFaq');
  if (!faq) return;
  $$('.faq-item', faq).forEach(item => {
    const button = $('button', item);
    if (!button) return;
    button.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      $$('.faq-item', faq).forEach(other => {
        other.classList.remove('is-open');
        $('button', other)?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

function initPremiumSectionMotion() {
  const selectors = [
    '.letter-card',
    '.family-grid article',
    '.moment-hero',
    '.moment-card',
    '.honour-list article',
    '.reception-flow article',
    '.faq-item'
  ];

  selectors.forEach(selector => {
    $$(selector).forEach((item, index) => {
      item.classList.add('motion-item');
      item.style.setProperty('--motion-delay', Math.min(index, 8));
    });
  });
}

(function patchPremiumInvitationSections(){
  const previousInit = init;
  init = function premiumInvitationInit() {
    previousInit();
    initGuestFaq();
    initPremiumSectionMotion();
  };
})();

/* =========================================================
   LIRANDZO · V8 EXPERIÊNCIA PREMIUM REAL
   Entrada personalizada, capítulos, RSVP avançado,
   presentes completos, dashboard expandido e check-in demo.
   ========================================================= */
CONFIG.giftOptions = [
  { id: 'jantar-elegante', category: 'Casa', title: 'Jogo de jantar elegante', description: 'Peças neutras para a primeira mesa da nova casa.', kind: 'Presente físico' },
  { id: 'copos-cristal', category: 'Casa', title: 'Conjunto de copos de cristal', description: 'Para brindar os primeiros momentos depois do sim.', kind: 'Presente físico' },
  { id: 'panelas-premium', category: 'Casa', title: 'Jogo de panelas premium', description: 'Um clássico útil e duradouro para o lar.', kind: 'Presente físico' },
  { id: 'roupa-cama', category: 'Casa', title: 'Roupa de cama premium', description: 'Conforto, textura e elegância para a nova etapa.', kind: 'Presente físico' },
  { id: 'toalhas-spa', category: 'Casa', title: 'Conjunto de toalhas tipo spa', description: 'Tons neutros, toque suave e acabamento elegante.', kind: 'Presente físico' },
  { id: 'lua-de-mel', category: 'Lua-de-mel', title: 'Contribuição para lua-de-mel', description: 'Uma contribuição simbólica para memórias a dois.', kind: 'Contribuição', amount: 'Valor livre' },
  { id: 'jantar-noivos', category: 'Experiências', title: 'Jantar especial para os noivos', description: 'Um jantar tranquilo depois da celebração.', kind: 'Experiência' },
  { id: 'decor-sala', category: 'Casa', title: 'Peça decorativa para sala', description: 'Um detalhe com alma para compor a casa.', kind: 'Presente físico' },
  { id: 'apoio-noivos', category: 'Contribuições', title: 'Apoio financeiro aos noivos', description: 'Uma forma prática e delicada de presentear.', kind: 'Contribuição', amount: 'Valor livre' }
];
STORAGE.guest = 'lirandzo_emerald_guest_v8';
STORAGE.chapter = 'lirandzo_emerald_last_chapter_v8';

const V8_MOMENTS = [
  { image: 'assets/cover-photo.jpg', number: '01', label: 'Capítulo principal', title: 'O olhar que anuncia o sim', text: 'Uma imagem de abertura para sentir o ambiente, a calma e a elegância deste casamento.' },
  { image: 'assets/gallery-1.jpg', number: '02', label: 'Pré-casamento', title: 'A delicadeza antes do grande dia', text: 'Retratos naturais, românticos e pensados para contar a história sem excesso.' },
  { image: 'assets/gallery-2.jpg', number: '03', label: 'Detalhes', title: 'Texturas, flores e tons terra', text: 'O estilo Rustic Chic aparece nos materiais, nas flores, no papel e na luz.' },
  { image: 'assets/gallery-3.jpg', number: '04', label: 'Memórias vivas', title: 'O que fica depois da celebração', text: 'Pequenos fragmentos visuais para transformar o convite numa lembrança digital.' }
];

let activeMomentIndex = 0;
let activeGiftCategory = 'Todos';
let activeDashboardView = 'summary';

function normalizeGift(gift) {
  if (typeof gift === 'string') {
    return { id: gift.toLowerCase().replace(/[^a-z0-9]+/gi, '-'), category: 'Casa', title: gift, description: 'Presente disponível para reserva.', kind: 'Presente' };
  }
  return gift;
}

function getGuestName() {
  const stored = getStore(STORAGE.guest, null);
  if (stored && stored.name) return stored.name;
  return '';
}

function guestLabel() {
  return getGuestName() || 'Convidado especial';
}

function createCheckinCode(name = guestLabel()) {
  const source = `${name}|${CONFIG.bride}|${CONFIG.groom}|${CONFIG.dateISO}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = ((hash << 5) - hash + source.charCodeAt(i)) >>> 0;
  return `LZD-ESM-${String(hash % 10000).padStart(4, '0')}`;
}

function applyGuestPersonalization(name) {
  const safeName = name && name.trim() ? name.trim() : '';
  if (safeName) setStore(STORAGE.guest, { name: safeName, timestamp: new Date().toISOString() });
  const display = safeName || guestLabel();
  const welcome = $('#guestWelcome');
  const note = $('#personalNote');
  const closing = $('#closingPersonalText');
  const rsvpName = $('#rsvpName');
  const giftName = $('#giftReservationName');
  const messageName = $('#messageName');
  const capsuleName = $('#capsuleName');

  if (welcome) welcome.textContent = safeName ? `Convite reservado para ${safeName}` : 'Convite reservado para si';
  if (note) note.textContent = safeName ? `${safeName}, a sua presença tornará este dia ainda mais especial.` : 'A sua presença tornará este dia ainda mais especial.';
  if (closing) closing.textContent = safeName ? `${safeName}, será uma honra celebrar este momento consigo.` : 'Será uma honra celebrar este momento consigo.';
  if (safeName) {
    [rsvpName, giftName, messageName, capsuleName].forEach(input => {
      if (input && !input.value) input.value = safeName;
    });
  }
  updateCheckinCard();
}

function initGuestExperience() {
  const params = new URLSearchParams(window.location.search);
  const queryGuest = params.get('guest') || params.get('convidado') || '';
  const storedGuest = getGuestName();
  const gate = $('#guestGate');
  const input = $('#guestNameInput');
  const form = $('#guestGateForm');
  const skip = $('#skipGuestGate');

  if (queryGuest) applyGuestPersonalization(queryGuest);
  else if (storedGuest) applyGuestPersonalization(storedGuest);

  const shouldShowGate = gate && !queryGuest && !storedGuest;
  if (shouldShowGate) {
    setTimeout(() => gate.classList.add('is-visible'), 850);
    setTimeout(() => input?.focus(), 1250);
  } else {
    gate?.classList.add('is-dismissed');
  }

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const name = input?.value.trim();
    if (!name) return;
    applyGuestPersonalization(name);
    gate?.classList.remove('is-visible');
    gate?.classList.add('is-dismissed');
    document.getElementById('topo')?.scrollIntoView({ behavior: 'smooth' });
  });

  skip?.addEventListener('click', () => {
    gate?.classList.remove('is-visible');
    gate?.classList.add('is-dismissed');
  });
}

function initChapterExperience() {
  const progress = $('#experienceProgress span');
  const buttons = $$('[data-chapter-target]');
  const sections = buttons.map(btn => document.getElementById(btn.dataset.chapterTarget)).filter(Boolean);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.chapterTarget);
      if (!target) return;
      setStore(STORAGE.chapter, btn.dataset.chapterTarget);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const updateProgress = () => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const percent = Math.min(100, Math.max(0, (window.scrollY / max) * 100));
    if (progress) progress.style.width = `${percent}%`;

    let activeId = 'topo';
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= window.innerHeight * 0.36) activeId = section.id;
    });
    buttons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.chapterTarget === activeId));
  };

  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();
}

function renderMoment(index) {
  activeMomentIndex = (index + V8_MOMENTS.length) % V8_MOMENTS.length;
  const moment = V8_MOMENTS[activeMomentIndex];
  const stage = $('#momentStage');
  const image = $('#momentStageImage');
  if (stage) stage.dataset.lightbox = moment.image;
  if (image) {
    image.classList.remove('is-swapping');
    void image.offsetWidth;
    image.src = moment.image;
    image.classList.add('is-swapping');
  }
  const number = $('#momentStageNumber');
  const label = $('#momentStageLabel');
  const title = $('#momentStageTitle');
  const text = $('#momentStageText');
  if (number) number.textContent = moment.number;
  if (label) label.textContent = moment.label;
  if (title) title.textContent = moment.title;
  if (text) text.textContent = moment.text;
  $$('.moment-thumb').forEach((btn, i) => btn.classList.toggle('is-active', i === activeMomentIndex));
}

function initMomentsCinema() {
  $$('.moment-thumb').forEach(btn => {
    btn.addEventListener('click', () => renderMoment(Number(btn.dataset.momentIndex || 0)));
  });
  $('#prevMoment')?.addEventListener('click', () => renderMoment(activeMomentIndex - 1));
  $('#nextMoment')?.addEventListener('click', () => renderMoment(activeMomentIndex + 1));
  renderMoment(0);
  setInterval(() => {
    const section = $('#momentos');
    if (!section) return;
    const rect = section.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0 && !document.body.classList.contains('modal-open')) renderMoment(activeMomentIndex + 1);
  }, 9000);
}

function readRsvpForm(validate = true) {
  const data = {
    id: `rsvp-${Date.now()}`,
    code: createCheckinCode($('#rsvpName')?.value.trim() || guestLabel()),
    name: $('#rsvpName')?.value.trim() || '',
    phone: $('#rsvpPhone')?.value.trim() || '',
    presence: $('#rsvpPresence')?.value || 'Confirmado',
    guests: $('#rsvpGuests')?.value || '1',
    companions: $('#rsvpCompanions')?.value.trim() || '',
    eventPart: $('#rsvpEventPart')?.value || 'Cerimónia e recepção',
    diet: $('#rsvpDiet')?.value.trim() || '',
    message: $('#rsvpMessage')?.value.trim() || '',
    timestamp: new Date().toISOString()
  };
  if (validate && !data.name) throw new Error('Nome obrigatório');
  return data;
}

function initRsvp() {
  const form = $('#rsvpForm');
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = readRsvpForm();
      if (data.name) applyGuestPersonalization(data.name);
      const rsvps = getStore(STORAGE.rsvps);
      const existingIndex = rsvps.findIndex(item => item.name.toLowerCase() === data.name.toLowerCase());
      if (existingIndex >= 0) rsvps[existingIndex] = data;
      else rsvps.unshift(data);
      setStore(STORAGE.rsvps, rsvps);
      $('#rsvpStatus').textContent = `RSVP guardado. Código de entrada: ${data.code}`;
      updateCheckinCard(data);
      setTimeout(() => closeModal($('#rsvpModal')), 1250);
      renderDashboard();
    } catch (error) {
      $('#rsvpStatus').textContent = 'Escreva o nome para guardar o RSVP.';
    }
  });

  $('#sendRsvpWhatsapp')?.addEventListener('click', () => {
    const data = readRsvpForm(false);
    const message = `Olá Lirandzo, segue RSVP para o casamento de ${CONFIG.bride} & ${CONFIG.groom}.\n\nNome: ${data.name || guestLabel()}\nPresença: ${data.presence}\nMomento: ${data.eventPart}\nPessoas: ${data.guests}\nAcompanhantes: ${data.companions || '—'}\nPreferência alimentar: ${data.diet || '—'}\nTelefone: ${data.phone || '—'}\nCódigo: ${data.code}\nMensagem: ${data.message || '—'}`;
    openWhatsApp(message);
  });
}

function giftCategories() {
  return ['Todos', ...Array.from(new Set(CONFIG.giftOptions.map(normalizeGift).map(gift => gift.category)))]
}

function renderGiftTabs() {
  const tabs = $('#giftTabs');
  if (!tabs) return;
  tabs.innerHTML = giftCategories().map(category => `
    <button type="button" class="${category === activeGiftCategory ? 'is-active' : ''}" data-gift-category="${escapeHTML(category)}">${escapeHTML(category)}</button>
  `).join('');
  $$('[data-gift-category]', tabs).forEach(btn => {
    btn.addEventListener('click', () => {
      activeGiftCategory = btn.dataset.giftCategory || 'Todos';
      renderGifts();
    });
  });
}

function renderGifts() {
  const saved = getStore(STORAGE.gifts, []);
  const giftList = $('#giftList');
  if (!giftList) return;
  renderGiftTabs();

  const gifts = CONFIG.giftOptions.map(normalizeGift).filter(gift => activeGiftCategory === 'Todos' || gift.category === activeGiftCategory);
  giftList.innerHTML = gifts.map(gift => {
    const reserved = saved.find(item => item.id === gift.id || item.gift === gift.title);
    return `
      <label class="gift-card ${reserved ? 'reserved' : ''}">
        <input type="checkbox" value="${escapeHTML(gift.id)}" ${reserved ? 'disabled' : ''}>
        <span class="gift-category">${escapeHTML(gift.category)}</span>
        <strong>${escapeHTML(gift.title)}</strong>
        <small>${escapeHTML(gift.description)}</small>
        <em>${reserved ? `Reservado por ${escapeHTML(reserved.by)}` : `${escapeHTML(gift.kind)} · Disponível`}</em>
      </label>
    `;
  }).join('');
}

function renderGiftReceipt(items, guest) {
  const receipt = $('#giftReceipt');
  if (!receipt) return;
  if (!items || !items.length) {
    receipt.hidden = true;
    receipt.innerHTML = '';
    return;
  }
  receipt.hidden = false;
  receipt.innerHTML = `
    <strong>Reserva registada</strong>
    <p>${escapeHTML(guest)}, a sua escolha ficou guardada nesta demo.</p>
    <ul>${items.map(item => `<li>${escapeHTML(item.title)}</li>`).join('')}</ul>
    <small>Na versão real, este recibo pode ser enviado aos noivos e registado numa base de dados.</small>
  `;
}

function initGifts() {
  renderGifts();
  $$('[data-open-modal="giftModal"]').forEach(button => {
    button.addEventListener('click', () => {
      renderGifts();
      renderGiftReceipt([], '');
      const status = $('#giftStatus');
      if (status) status.textContent = '';
    });
  });

  $('#saveGiftSelection')?.addEventListener('click', () => {
    const selectedIds = $$('#giftList input:checked:not(:disabled)').map(input => input.value);
    const guest = $('#giftReservationName')?.value.trim() || $('#rsvpName')?.value.trim() || $('#messageName')?.value.trim() || getGuestName();
    const status = $('#giftStatus');
    if (!guest) {
      status.textContent = 'Escreva o seu nome para reservar o presente.';
      $('#giftReservationName')?.focus();
      return;
    }
    if (!selectedIds.length) {
      status.textContent = 'Seleccione pelo menos um presente disponível.';
      return;
    }
    applyGuestPersonalization(guest);
    const current = getStore(STORAGE.gifts, []);
    const selectedGifts = CONFIG.giftOptions.map(normalizeGift).filter(gift => selectedIds.includes(gift.id));
    selectedGifts.forEach(gift => {
      if (!current.some(item => item.id === gift.id)) {
        current.push({ id: gift.id, gift: gift.title, category: gift.category, by: guest, proof: $('#giftProof')?.files?.[0]?.name || '', timestamp: new Date().toISOString() });
      }
    });
    setStore(STORAGE.gifts, current);
    status.textContent = selectedGifts.length === 1 ? 'Presente reservado com sucesso.' : 'Presentes reservados com sucesso.';
    renderGiftReceipt(selectedGifts, guest);
    renderGifts();
    renderDashboard();
  });
}

function collectData() {
  return {
    couple: `${CONFIG.bride} & ${CONFIG.groom}`,
    guest: getStore(STORAGE.guest, null),
    package: CONFIG.packageName,
    rsvps: getStore(STORAGE.rsvps),
    gifts: getStore(STORAGE.gifts),
    messages: getStore(STORAGE.messages),
    capsules: getStore(STORAGE.capsules)
  };
}

function renderDashboard(force = false) {
  if (!force && $('#dashboardPanel')?.hidden) return;
  const data = collectData();
  $('#dashRsvps').textContent = data.rsvps.length;
  $('#dashGifts').textContent = data.gifts.length;
  $('#dashMessages').textContent = data.messages.length;
  $('#dashCapsules').textContent = data.capsules.length;
  const confirmed = data.rsvps.filter(item => item.presence === 'Confirmado').reduce((total, item) => total + Number(item.guests || 1), 0);
  const maybe = data.rsvps.filter(item => item.presence === 'Talvez').length;
  const output = $('#dashboardOutput');
  if (!output) return;

  const view = activeDashboardView;
  if (view === 'rsvps') {
    output.innerHTML = data.rsvps.length ? `<div class="dash-list">${data.rsvps.map(item => `
      <article><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.presence)} · ${escapeHTML(item.guests)} pessoa(s)</span><small>${escapeHTML(item.eventPart || '—')} · ${escapeHTML(item.diet || 'Sem observações')}</small><em>${escapeHTML(item.code || createCheckinCode(item.name))}</em></article>
    `).join('')}</div>` : '<p class="section-lead">Ainda não existem RSVPs guardados.</p>';
    return;
  }

  if (view === 'gifts') {
    output.innerHTML = data.gifts.length ? `<div class="dash-list">${data.gifts.map(item => `
      <article><strong>${escapeHTML(item.gift)}</strong><span>${escapeHTML(item.category || 'Presente')} · ${escapeHTML(item.by)}</span><small>${escapeHTML(item.proof ? `Comprovativo: ${item.proof}` : 'Sem comprovativo anexado')}</small></article>
    `).join('')}</div>` : '<p class="section-lead">Ainda não existem presentes reservados.</p>';
    return;
  }

  if (view === 'messages') {
    output.innerHTML = `<div class="dash-list">${[...data.messages.slice(0,8), ...data.capsules.slice(0,8).map(item => ({...item, text:`[Cápsula privada] ${item.text}`}))].map(item => `
      <article><strong>${escapeHTML(item.name)}</strong><span>${formatDate(new Date(item.timestamp))}</span><small>${escapeHTML(item.text)}</small></article>
    `).join('') || '<p class="section-lead">Ainda não existem mensagens.</p>'}</div>`;
    return;
  }

  if (view === 'checkin') {
    const checkins = getStore(STORAGE.checkins, []);
    output.innerHTML = `
      <div class="dash-summary-card">
        <strong>Check-in por QR Code</strong>
        <p>Entradas validadas neste dispositivo: ${checkins.length}</p>
        <p>Abra a aplicação extra para ler os QR Codes pela câmara.</p>
        <a class="btn primary" href="checkin/index.html" target="_blank" rel="noopener noreferrer">Abrir app de check-in</a>
      </div>
      ${data.rsvps.length ? `<div class="dash-list">${data.rsvps.map(item => `
        <article><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.code || createCheckinCode(item.name))}</span><small>Entrada para ${escapeHTML(item.guests || '1')} pessoa(s)</small></article>
      `).join('')}</div>` : '<p class="section-lead">Os códigos aparecem aqui depois dos RSVPs.</p>'}`;
    return;
  }

  output.innerHTML = `
    <div class="dash-summary-card">
      <strong>Resumo do casamento</strong>
      <p>Convidados confirmados: ${confirmed}</p>
      <p>RSVPs em dúvida: ${maybe}</p>
      <p>Presentes reservados: ${data.gifts.length}</p>
      <p>Mensagens recebidas: ${data.messages.length + data.capsules.length}</p>
    </div>
    <pre>${escapeHTML([
      `Casal: ${data.couple}`,
      `Pacote: ${data.package}`,
      `Convidado activo: ${data.guest?.name || '—'}`,
      `Convidados confirmados: ${confirmed}`,
      '',
      'Últimos RSVPs:',
      ...(data.rsvps.slice(0, 5).map(item => `- ${item.name} · ${item.presence} · ${item.guests} pessoa(s) · ${item.eventPart || '—'}`) || ['—']),
      '',
      'Presentes reservados:',
      ...(data.gifts.slice(0, 8).map(item => `- ${item.gift} · ${item.by}`) || ['—'])
    ].join('\n'))}</pre>`;
}

function exportCsvFile() {
  const data = collectData();
  const rows = [['tipo','nome','estado','quantidade','detalhe','data']];
  data.rsvps.forEach(item => rows.push(['RSVP', item.name, item.presence, item.guests, `${item.eventPart || ''} ${item.diet || ''}`.trim(), item.timestamp]));
  data.gifts.forEach(item => rows.push(['PRESENTE', item.by, 'Reservado', '1', item.gift, item.timestamp]));
  data.messages.forEach(item => rows.push(['MENSAGEM', item.name, 'Publicada', '1', item.text, item.timestamp]));
  data.capsules.forEach(item => rows.push(['CAPSULA', item.name, 'Privada', '1', item.text, item.timestamp]));
  const csv = rows.map(row => row.map(value => `"${String(value || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'dados-convite-esmeralda.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function initDashboard() {
  $('#unlockDashboard')?.addEventListener('click', () => {
    const pin = $('#dashboardPin')?.value.trim();
    if (pin !== CONFIG.dashboardPin) {
      alert('PIN incorrecto.');
      return;
    }
    $('#dashboardLock').hidden = true;
    $('#dashboardPanel').hidden = false;
    renderDashboard(true);
  });

  $$('#dashboardTabs [data-dashboard-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDashboardView = btn.dataset.dashboardView || 'summary';
      $$('#dashboardTabs [data-dashboard-view]').forEach(other => other.classList.toggle('is-active', other === btn));
      renderDashboard(true);
    });
  });

  $('#exportData')?.addEventListener('click', () => {
    const data = collectData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'dados-convite-esmeralda.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $('#exportCsv')?.addEventListener('click', exportCsvFile);

  $('#sendSummaryWhatsapp')?.addEventListener('click', () => {
    const data = collectData();
    const confirmed = data.rsvps.filter(item => item.presence === 'Confirmado').reduce((total, item) => total + Number(item.guests || 1), 0);
    const message = `Resumo do convite ${CONFIG.bride} & ${CONFIG.groom}\n\nRSVPs: ${data.rsvps.length}\nConvidados confirmados: ${confirmed}\nPresentes reservados: ${data.gifts.length}\nMensagens: ${data.messages.length}\nCápsulas: ${data.capsules.length}`;
    openWhatsApp(message);
  });

  $('#clearDemoData')?.addEventListener('click', () => {
    if (!confirm('Limpar todos os dados locais desta demo?')) return;
    Object.values(STORAGE).forEach(key => localStorage.removeItem(key));
    renderGifts();
    renderMessages();
    renderDashboard(true);
    applyGuestPersonalization('');
  });
}

function createCheckinPayload({ name, guests, code }) {
  return JSON.stringify({
    type: 'lirandzo-checkin',
    event: 'LZD-ESM-2026',
    package: CONFIG.packageName,
    couple: `${CONFIG.bride} & ${CONFIG.groom}`,
    guest: name,
    guests: String(guests || '1'),
    code
  });
}

function updateCheckinCard(rsvpData = null) {
  const data = rsvpData || getStore(STORAGE.rsvps, [])[0] || null;
  const name = data?.name || guestLabel();
  const guests = data?.guests || '1';
  const code = data?.code || createCheckinCode(name);
  const nameEl = $('#checkinGuestName');
  const metaEl = $('#checkinMeta');
  const codeEl = $('#checkinCode');
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = `Entrada válida para ${guests} pessoa(s)`;
  if (codeEl) codeEl.textContent = code;
  renderRealQr({ name, guests, code });
  renderQrDemo(code);
}

function renderRealQr(data) {
  const img = $('#qrImage');
  if (!img) return;
  const payload = createCheckinPayload(data);
  img.dataset.payload = payload;
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=14&data=${encodeURIComponent(payload)}`;
  img.alt = `QR Code de entrada de ${data.name}`;
}

function renderQrDemo(seed) {
  const qr = $('#qrDemo');
  if (!qr) return;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0;
  let cells = '';
  for (let i = 0; i < 121; i += 1) {
    const finder = (i < 25 && (i % 11 < 5)) || (i > 85 && i % 11 > 5) || (i % 11 > 5 && i < 55 && i > 30);
    const on = finder || (((hash >> (i % 24)) + i * 7) % 3 === 0);
    cells += `<span class="${on ? 'is-on' : ''}"></span>`;
  }
  qr.innerHTML = cells;
}

function initCheckin() {
  updateCheckinCard();
  $$('[data-open-modal="checkinModal"]').forEach(button => {
    button.addEventListener('click', () => updateCheckinCard());
  });
  $('#copyCheckinCode')?.addEventListener('click', async () => {
    const code = $('#checkinCode')?.textContent || '';
    try {
      await navigator.clipboard?.writeText(code);
      $('#copyCheckinCode').textContent = 'Código copiado';
      setTimeout(() => { $('#copyCheckinCode').textContent = 'Copiar código'; }, 1200);
    } catch (error) {
      alert(code);
    }
  });
}

(function patchV8PremiumReal(){
  const previousInit = init;
  init = function premiumRealInit() {
    previousInit();
    initGuestExperience();
    initChapterExperience();
    initMomentsCinema();
    initCheckin();
  };
})();

/* =========================================================
   LIRANDZO · V10 CONVITE PREMIUM COMERCIAL
   Links únicos, convidados, mesas, moderação e check-in comercial
   ========================================================= */
STORAGE.guests = 'lirandzo_emerald_guest_registry_v10';
STORAGE.notifications = 'lirandzo_emerald_notifications_v10';
STORAGE.messageFilter = 'lirandzo_emerald_message_filter_v10';

let activeMessageFilter = 'approved';
let activeGuestFilter = 'all';

function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'convidado';
}

function shortHash(value, length = 6) {
  let hash = 2166136261;
  const text = String(value || 'lirandzo');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(length, '0').slice(0, length);
}

function createGuestCode(name, token = '') {
  return `LZD-ESM-${shortHash(`${name}|${token}|${CONFIG.dateISO}`, 5)}`;
}

function defaultGuests() {
  const seed = [
    ['Ana Matavele', 'Mesa 03 · Família da noiva', 2, 'Família da noiva'],
    ['Rogério Pinhal', 'Mesa 05 · Amigos dos noivos', 1, 'Amigos'],
    ['Célia Mucavele', 'Mesa 02 · Família do noivo', 2, 'Família do noivo'],
    ['Daniel Langa', 'Mesa 06 · Equipa de honra', 1, 'Honra']
  ];
  return seed.map(([name, table, maxGuests, group], index) => {
    const token = `${slugify(name)}-${shortHash(name + index, 4)}`;
    return {
      id: `guest-${index + 1}`,
      name,
      phone: '',
      token,
      code: createGuestCode(name, token),
      table,
      maxGuests: String(maxGuests),
      group,
      status: 'Convidado',
      notes: 'Registo de demonstração V10.',
      createdAt: new Date().toISOString()
    };
  });
}

function ensureGuestRegistry() {
  const guests = getStore(STORAGE.guests, null);
  if (Array.isArray(guests)) return guests;
  const initial = defaultGuests();
  setStore(STORAGE.guests, initial);
  return initial;
}

function getGuestRegistry() {
  return ensureGuestRegistry();
}

function setGuestRegistry(list) {
  setStore(STORAGE.guests, Array.isArray(list) ? list : []);
}

function findGuestByToken(token) {
  if (!token) return null;
  const normalized = String(token).trim().toLowerCase();
  return getGuestRegistry().find(guest => String(guest.token || '').toLowerCase() === normalized || String(guest.code || '').toLowerCase() === normalized) || null;
}

function findGuestByName(name) {
  if (!name) return null;
  const normalized = String(name).trim().toLowerCase();
  return getGuestRegistry().find(guest => String(guest.name || '').trim().toLowerCase() === normalized) || null;
}

function getActiveGuestRecord() {
  const stored = getStore(STORAGE.guest, null);
  if (!stored) return null;
  return findGuestByToken(stored.token || stored.code) || findGuestByName(stored.name) || stored;
}

function guestInviteUrl(guest) {
  const base = `${window.location.origin}${window.location.pathname}`.replace(/admin-convidados\/index\.html$/, 'index.html');
  return `${base}?token=${encodeURIComponent(guest.token || guest.code || slugify(guest.name))}`;
}

function queueNotification(type, message, payload = {}) {
  const list = getStore(STORAGE.notifications, []);
  list.unshift({ type, message, payload, timestamp: new Date().toISOString(), read: false });
  setStore(STORAGE.notifications, list.slice(0, 80));
}

const oldCreateCheckinCodeV10 = createCheckinCode;
createCheckinCode = function createCheckinCodeV10(name = guestLabel()) {
  const guest = findGuestByName(name) || getActiveGuestRecord();
  return guest?.code || createGuestCode(name, guest?.token || '') || oldCreateCheckinCodeV10(name);
};

const oldCreateCheckinPayloadV10 = createCheckinPayload;
createCheckinPayload = function createCheckinPayloadV10({ name, guests, code, table, token }) {
  const guest = findGuestByName(name) || getActiveGuestRecord();
  return JSON.stringify({
    type: 'lirandzo-checkin',
    event: 'LZD-ESM-2026',
    package: CONFIG.packageName,
    couple: `${CONFIG.bride} & ${CONFIG.groom}`,
    guest: name || guest?.name || guestLabel(),
    guests: String(guests || guest?.maxGuests || '1'),
    table: table || guest?.table || 'Mesa por definir',
    token: token || guest?.token || '',
    code: code || guest?.code || createCheckinCode(name || guest?.name || guestLabel())
  });
};

const oldApplyGuestPersonalizationV10 = applyGuestPersonalization;
applyGuestPersonalization = function applyGuestPersonalizationV10(name, guestRecord = null) {
  const record = guestRecord || findGuestByName(name) || getActiveGuestRecord();
  if (record?.name) {
    setStore(STORAGE.guest, {
      name: record.name,
      token: record.token,
      code: record.code,
      table: record.table,
      maxGuests: record.maxGuests,
      group: record.group,
      timestamp: new Date().toISOString()
    });
  }
  oldApplyGuestPersonalizationV10(record?.name || name || '');
  const guestCard = $('.guest-info-card');
  if (guestCard) {
    const active = record || getActiveGuestRecord();
    guestCard.innerHTML = active ? `
      <strong>${escapeHTML(active.table || 'Mesa por definir')}</strong>
      <span>Entrada autorizada para ${escapeHTML(active.maxGuests || '1')} pessoa(s)</span>
      <small>${escapeHTML(active.name)} · Código ${escapeHTML(active.code || createCheckinCode(active.name))}</small>
      <small>Grupo: ${escapeHTML(active.group || 'Convidados')} · Link único preparado para este convidado.</small>
    ` : `
      <strong>Mesa por definir</strong>
      <span>Entrada configurável no painel de convidados</span>
      <small>Abra a gestão de convidados para criar links únicos, mesas e QR Codes individuais.</small>
    `;
  }
};

const oldInitGuestExperienceV10 = initGuestExperience;
initGuestExperience = function initGuestExperienceV10() {
  ensureGuestRegistry();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || params.get('code') || params.get('codigo') || '';
  const linkedGuest = findGuestByToken(token);
  if (linkedGuest) {
    applyGuestPersonalization(linkedGuest.name, linkedGuest);
    $('#guestGate')?.classList.add('is-dismissed');
    return;
  }
  oldInitGuestExperienceV10();
  const active = getActiveGuestRecord();
  if (active) applyGuestPersonalization(active.name, active);
};

const oldReadRsvpFormV10 = readRsvpForm;
readRsvpForm = function readRsvpFormV10(validate = true) {
  const data = oldReadRsvpFormV10(validate);
  const guest = findGuestByName(data.name) || getActiveGuestRecord();
  data.token = guest?.token || '';
  data.table = guest?.table || 'Mesa por definir';
  data.group = guest?.group || 'Convidados';
  data.maxGuests = guest?.maxGuests || data.guests || '1';
  data.code = guest?.code || data.code || createCheckinCode(data.name);
  return data;
};

const oldInitRsvpV10 = initRsvp;
initRsvp = function initRsvpV10() {
  oldInitRsvpV10();
  const select = $('#rsvpGuests');
  const active = getActiveGuestRecord();
  if (select && active?.maxGuests) {
    const max = Math.max(1, Number(active.maxGuests || 1));
    select.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1} pessoa${i ? 's' : ''}</option>`).join('');
  }
};

const oldUpdateCheckinCardV10 = updateCheckinCard;
updateCheckinCard = function updateCheckinCardV10(rsvpData = null) {
  const active = getActiveGuestRecord();
  const data = rsvpData || active || getStore(STORAGE.rsvps, [])[0] || null;
  const name = data?.name || guestLabel();
  const guests = data?.guests || data?.maxGuests || '1';
  const code = data?.code || createCheckinCode(name);
  const table = data?.table || active?.table || 'Mesa por definir';
  const nameEl = $('#checkinGuestName');
  const metaEl = $('#checkinMeta');
  const codeEl = $('#checkinCode');
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = `Entrada para ${guests} pessoa(s) · ${table}`;
  if (codeEl) codeEl.textContent = code;
  renderRealQr({ name, guests, code, table, token: data?.token || active?.token || '' });
  renderQrDemo(code);
};

collectData = function collectDataV10() {
  return {
    couple: `${CONFIG.bride} & ${CONFIG.groom}`,
    guest: getStore(STORAGE.guest, null),
    guests: getGuestRegistry(),
    package: CONFIG.packageName,
    rsvps: getStore(STORAGE.rsvps),
    gifts: getStore(STORAGE.gifts),
    messages: getStore(STORAGE.messages),
    capsules: getStore(STORAGE.capsules),
    checkins: getStore(STORAGE.checkins, []),
    notifications: getStore(STORAGE.notifications, [])
  };
};

function approveMessage(index) {
  const messages = getStore(STORAGE.messages, []);
  if (!messages[index]) return;
  messages[index].status = 'approved';
  messages[index].approvedAt = new Date().toISOString();
  setStore(STORAGE.messages, messages);
  renderMessages();
  renderDashboard(true);
}

function rejectMessage(index) {
  const messages = getStore(STORAGE.messages, []);
  if (!messages[index]) return;
  messages[index].status = 'hidden';
  messages[index].hiddenAt = new Date().toISOString();
  setStore(STORAGE.messages, messages);
  renderMessages();
  renderDashboard(true);
}

initMessages = function initMessagesV10() {
  const form = $('#messageForm');
  renderMessages();
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#messageName').value.trim() || guestLabel();
    const text = $('#messageText').value.trim();
    if (!name || !text) return;
    const messages = getStore(STORAGE.messages, []);
    messages.unshift({ name, text, status: 'pending', timestamp: new Date().toISOString(), token: getActiveGuestRecord()?.token || '' });
    setStore(STORAGE.messages, messages.slice(0, 80));
    queueNotification('mensagem', `Nova mensagem pendente de ${name}`, { name, text });
    form.reset();
    $('#messageName').value = name;
    const feed = $('#guestbookFeed');
    if (feed) feed.innerHTML = '<p class="section-lead">Mensagem enviada. Ela ficará visível depois da aprovação dos noivos.</p>';
    renderDashboard();
  });
};

renderMessages = function renderMessagesV10() {
  const feed = $('#guestbookFeed');
  if (!feed) return;
  const messages = getStore(STORAGE.messages, []).filter(message => (message.status || 'approved') === 'approved');
  if (!messages.length) {
    feed.innerHTML = '<p class="section-lead">Ainda não há mensagens aprovadas. Seja o primeiro a deixar uma felicitação.</p>';
    return;
  }
  feed.innerHTML = messages.map(message => `
    <article class="guestbook-entry">
      <strong>${escapeHTML(message.name)}</strong>
      <span>${formatDate(new Date(message.timestamp))}</span>
      <p>${escapeHTML(message.text)}</p>
    </article>
  `).join('');
};

function renderGuestDashboard(data) {
  const checkins = data.checkins;
  const rsvps = data.rsvps;
  const filtered = data.guests.filter(guest => {
    if (activeGuestFilter === 'checked') return checkins.some(item => item.code === guest.code);
    if (activeGuestFilter === 'confirmed') return rsvps.some(item => item.code === guest.code && item.presence === 'Confirmado');
    if (activeGuestFilter === 'pending') return !rsvps.some(item => item.code === guest.code);
    return true;
  });
  return `
    <div class="dash-guest-toolbar">
      ${['all','confirmed','checked','pending'].map(key => `<button type="button" class="dash-chip ${activeGuestFilter === key ? 'is-active' : ''}" data-guest-filter="${key}">${({all:'Todos',confirmed:'Confirmados',checked:'Check-in feito',pending:'Sem RSVP'})[key]}</button>`).join('')}
      <a class="dash-chip" href="admin-convidados/index.html" target="_blank" rel="noopener noreferrer">Abrir gestão</a>
    </div>
    <div class="dash-list">${filtered.map(guest => {
      const rsvp = rsvps.find(item => item.code === guest.code);
      const checked = checkins.find(item => item.code === guest.code);
      return `<article>
        <strong>${escapeHTML(guest.name)}</strong>
        <span>${escapeHTML(guest.table || 'Mesa por definir')} · ${escapeHTML(guest.maxGuests || '1')} pessoa(s)</span>
        <small>${escapeHTML(guest.code)} · ${escapeHTML(guest.group || 'Convidados')}</small>
        <em class="guest-status-pill ${checked ? 'checked' : rsvp ? '' : 'pending'}">${checked ? 'Check-in feito' : rsvp ? rsvp.presence : 'Sem RSVP'}</em>
        <div class="dash-actions-inline">
          <button type="button" class="dash-mini-btn" data-copy-link="${escapeHTML(guest.token)}">Copiar link</button>
          <button type="button" class="dash-mini-btn" data-open-guest="${escapeHTML(guest.token)}">Abrir convite</button>
        </div>
      </article>`;
    }).join('') || '<p class="section-lead">Nenhum convidado neste filtro.</p>'}</div>
  `;
}

const oldRenderDashboardV10 = renderDashboard;
renderDashboard = function renderDashboardV10(force = false) {
  if (!force && $('#dashboardPanel')?.hidden) return;
  const data = collectData();
  const dashGuests = $('#dashGuests');
  if ($('#dashRsvps')) $('#dashRsvps').textContent = data.rsvps.length;
  if (dashGuests) dashGuests.textContent = data.guests.length;
  if ($('#dashGifts')) $('#dashGifts').textContent = data.gifts.length;
  if ($('#dashMessages')) $('#dashMessages').textContent = data.messages.length;
  if ($('#dashCapsules')) $('#dashCapsules').textContent = data.capsules.length;
  const output = $('#dashboardOutput');
  if (!output) return;

  if (activeDashboardView === 'guests') {
    output.innerHTML = renderGuestDashboard(data);
    $$('[data-guest-filter]', output).forEach(btn => btn.addEventListener('click', () => { activeGuestFilter = btn.dataset.guestFilter || 'all'; renderDashboard(true); }));
    $$('[data-copy-link]', output).forEach(btn => btn.addEventListener('click', async () => {
      const guest = findGuestByToken(btn.dataset.copyLink);
      if (!guest) return;
      const link = guestInviteUrl(guest);
      try { await navigator.clipboard.writeText(link); btn.textContent = 'Link copiado'; } catch (error) { alert(link); }
    }));
    $$('[data-open-guest]', output).forEach(btn => btn.addEventListener('click', () => {
      const guest = findGuestByToken(btn.dataset.openGuest);
      if (guest) window.open(guestInviteUrl(guest), '_blank', 'noopener,noreferrer');
    }));
    return;
  }

  if (activeDashboardView === 'messages') {
    const messages = data.messages;
    const filtered = messages.filter(item => activeMessageFilter === 'all' || (item.status || 'approved') === activeMessageFilter);
    output.innerHTML = `
      <div class="dash-message-toolbar">
        ${['approved','pending','hidden','all'].map(key => `<button type="button" class="dash-chip ${activeMessageFilter === key ? 'is-active' : ''}" data-message-filter="${key}">${({approved:'Aprovadas',pending:'Pendentes',hidden:'Ocultas',all:'Todas'})[key]}</button>`).join('')}
      </div>
      <div class="dash-list">${filtered.map((item) => {
        const realIndex = messages.indexOf(item);
        return `<article>
          <strong>${escapeHTML(item.name)}</strong>
          <span>${formatDate(new Date(item.timestamp))} · ${escapeHTML(item.status || 'approved')}</span>
          <small>${escapeHTML(item.text)}</small>
          <div class="dash-actions-inline">
            <button type="button" class="dash-mini-btn" data-approve-message="${realIndex}">Aprovar</button>
            <button type="button" class="dash-mini-btn danger" data-hide-message="${realIndex}">Ocultar</button>
          </div>
        </article>`;
      }).join('') || '<p class="section-lead">Nenhuma mensagem neste filtro.</p>'}</div>`;
    $$('[data-message-filter]', output).forEach(btn => btn.addEventListener('click', () => { activeMessageFilter = btn.dataset.messageFilter || 'approved'; renderDashboard(true); }));
    $$('[data-approve-message]', output).forEach(btn => btn.addEventListener('click', () => approveMessage(Number(btn.dataset.approveMessage))));
    $$('[data-hide-message]', output).forEach(btn => btn.addEventListener('click', () => rejectMessage(Number(btn.dataset.hideMessage))));
    return;
  }

  if (activeDashboardView === 'checkin') {
    const checkedCodes = new Set(data.checkins.map(item => item.code));
    output.innerHTML = `
      <div class="dash-summary-card">
        <strong>Check-in comercial</strong>
        <p>Entradas validadas: ${data.checkins.length}</p>
        <p>Convidados registados: ${data.guests.length}</p>
        <p>Por validar: ${Math.max(0, data.guests.filter(g => !checkedCodes.has(g.code)).length)}</p>
        <a class="btn primary" href="checkin/index.html" target="_blank" rel="noopener noreferrer">Abrir app de check-in</a>
      </div>
      <div class="dash-list">${data.guests.map(guest => {
        const checked = data.checkins.find(item => item.code === guest.code);
        return `<article><strong>${escapeHTML(guest.name)}</strong><span>${escapeHTML(guest.table || 'Mesa por definir')}</span><small>${escapeHTML(guest.code)}</small><em class="guest-status-pill ${checked ? 'checked' : 'pending'}">${checked ? 'Validado' : 'Por validar'}</em></article>`;
      }).join('')}</div>`;
    return;
  }

  oldRenderDashboardV10(force);
};

function initV10Commercial() {
  ensureGuestRegistry();
  const active = getActiveGuestRecord();
  if (active) applyGuestPersonalization(active.name, active);
  $('#sendSummaryWhatsapp')?.addEventListener('click', () => queueNotification('whatsapp', 'Resumo preparado para WhatsApp', {}));
}

(function patchV10Commercial(){
  const previousInit = init;
  init = function commercialInvitationInit() {
    previousInit();
    initV10Commercial();
  };
})();
