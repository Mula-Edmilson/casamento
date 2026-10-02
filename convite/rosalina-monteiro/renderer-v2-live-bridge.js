(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.LirandzoRosalinaV2Bridge = api;
    if (!root.__LIRANDZO_DISABLE_ROSALINA_V2_AUTOBOOT__) {
      Promise.resolve().then(function () { return api.boot(root); }).catch(function () {});
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TARGET_SLUG = 'rosalina-monteiro';
  const ACTIVE_MODE = 'mongo-v2';

  function arr(value) { return Array.isArray(value) ? value : []; }
  function str(value) { return value == null ? '' : String(value); }
  function trim(value) { return str(value).trim(); }
  function esc(value) {
    return str(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function firstName(value) { return trim(value).split(/\s+/)[0] || ''; }
  function splitParents(value) {
    const text = trim(value);
    if (!text) return ['', ''];
    const parts = text.split(/\s+e\s+/i);
    if (parts.length < 2) return [text, ''];
    return [parts[0].trim(), parts.slice(1).join(' e ').trim()];
  }
  function dateLabel(value, fallback) {
    if (trim(fallback)) return trim(fallback);
    if (!trim(value)) return '';
    try {
      return new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch (_) { return ''; }
  }
  function dateUpper(value, fallback) {
    return dateLabel(value, fallback).replace(/\bde\b/gi, '').replace(/\s+/g, ' ').trim().toUpperCase();
  }
  function pageKind(doc) {
    if (!doc) return 'unknown';
    if (doc.getElementById('rsvpModal') && doc.getElementById('storyTimeline')) return 'invite';
    if (doc.getElementById('loginForm') && doc.querySelector('.page')) return 'index';
    return 'unknown';
  }

  function buildViewModel(mapped) {
    const cfg = mapped && typeof mapped === 'object' ? mapped : {};
    const event = cfg.event || {};
    const story = cfg.story || {};
    const gallery = cfg.gallery || {};
    const dress = cfg.dressCode || {};
    const menu = cfg.menu || {};
    const support = cfg.support || {};
    const paymentData = cfg.paymentData || {};
    const sections = cfg.sections || {};
    const schedule = arr(event.scheduleItems);
    const couple = trim(cfg.coupleNames);
    return {
      slug: trim(cfg.slug) || TARGET_SLUG,
      coupleNames: couple,
      bride: trim(cfg.bride),
      groom: trim(cfg.groom),
      brideFirst: firstName(cfg.bride),
      groomFirst: firstName(cfg.groom),
      monogram: trim(cfg.monogram),
      eventDateISO: trim(cfg.eventDateISO || event.dateISO),
      dateLabel: dateLabel(cfg.eventDateISO || event.dateISO, event.dateLabel),
      invitationNote: trim(event.invitationNote),
      rsvpDeadline: trim(event.rsvpDeadline),
      verse: trim(event.verse),
      verseReference: trim(event.verseReference),
      schedule: schedule.map(function (item) {
        return {
          id: trim(item && item.id),
          type: trim(item && item.type),
          title: trim(item && item.title),
          time: trim(item && item.time),
          venue: trim(item && item.venue),
          mapUrl: trim(item && item.mapUrl),
          note: trim(item && item.note)
        };
      }),
      brideParents: trim(cfg.parents && cfg.parents.brideParents),
      groomParents: trim(cfg.parents && cfg.parents.groomParents),
      storyTitle: trim(story.title) || 'A Nossa História',
      storyText: trim(story.text),
      storyLetter: trim(story.letter),
      storyChapters: arr(story.chapters).map(function (chapter, index) {
        return {
          id: trim(chapter && chapter.id) || `chapter-${index + 1}`,
          title: trim(chapter && chapter.title) || `Capítulo ${index + 1}`,
          text: trim(chapter && (chapter.text || chapter.note))
        };
      }),
      storyImage: trim(story.image),
      galleryTitle: trim(gallery.title) || 'Momentos',
      galleryItems: arr(gallery.items).map(function (item, index) {
        return { src: trim(item && (item.src || item.url)), alt: trim(item && item.alt) || `Foto ${index + 1}`, caption: trim(item && item.caption) };
      }).filter(function (item) { return Boolean(item.src); }),
      dressTitle: trim(dress.title) || 'Dress code',
      dressNote: trim(dress.note),
      dressImage: trim(dress.image),
      menuTitle: trim(menu.title) || 'Menu da Celebração',
      menuNote: trim(menu.note),
      menuItems: arr(menu.items).map(function (item, index) {
        return {
          label: trim(item && item.label) || `Item ${index + 1}`,
          title: trim(item && item.title),
          text: trim(item && item.text)
        };
      }),
      bankAccounts: arr(paymentData.bankAccounts).map(function (item) {
        return {
          label: trim(item && (item.label || item.bank)) || 'Conta bancária',
          holder: trim(item && item.holder),
          account: trim(item && (item.account || item.number)),
          nib: trim(item && item.nib),
          logo: trim(item && item.logo)
        };
      }),
      mobilePayments: arr(paymentData.mobilePayments).map(function (item) {
        return {
          label: trim(item && (item.label || item.method)) || 'Pagamento móvel',
          holder: trim(item && item.holder),
          number: trim(item && item.number),
          logo: trim(item && item.logo)
        };
      }),
      supportText: trim(support.text) || arr(support.contacts).map(trim).filter(Boolean).join(' | '),
      supportContacts: arr(support.contacts).map(trim).filter(Boolean),
      supportWhatsapp: trim(support.whatsapp),
      heroImage: trim(cfg.theme && cfg.theme.heroImage),
      coverImage: trim(cfg.theme && cfg.theme.coverImage),
      musicUrl: trim(cfg.theme && cfg.theme.musicUrl),
      seo: cfg.seo || {},
      gifts: cfg.gifts || {},
      rsvp: cfg.rsvp || {},
      sections: {
        schedule: sections.schedule !== false,
        story: sections.story !== false,
        parents: sections.parents !== false,
        gallery: sections.gallery !== false,
        dressCode: sections.dressCode !== false,
        menu: sections.menu !== false,
        map: sections.map !== false,
        rsvp: sections.rsvp !== false,
        gifts: sections.gifts !== false,
        contributions: sections.contributions !== false,
        messages: sections.messages !== false,
        checkin: sections.checkin !== false,
        capsule: sections.capsule !== false,
        guestInfo: sections.guestInfo !== false
      }
    };
  }

  function q(doc, selector) { return doc && doc.querySelector ? doc.querySelector(selector) : null; }
  function qa(doc, selector) { return doc && doc.querySelectorAll ? Array.from(doc.querySelectorAll(selector)) : []; }
  function setText(doc, selector, value) {
    if (!trim(value)) return;
    qa(doc, selector).forEach(function (el) { el.textContent = value; });
  }
  function setVisible(el, visible) { if (el) el.style.display = visible ? '' : 'none'; }
  function setImage(el, src) { if (el && src) { el.src = src; el.setAttribute('data-src', src); } }
  function setBackground(el, src) { if (el && src) el.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`; }

  function ensureSeo(doc, seo) {
    if (!doc || !seo) return;
    if (trim(seo.title)) doc.title = trim(seo.title);
    function setMeta(kind, key, value) {
      if (!trim(value)) return;
      let el = q(doc, `meta[${kind}="${key}"]`);
      if (!el && doc.createElement && doc.head) {
        el = doc.createElement('meta');
        el.setAttribute(kind, key);
        doc.head.appendChild(el);
      }
      if (el) el.setAttribute('content', trim(value));
    }
    setMeta('name', 'description', seo.description);
    setMeta('property', 'og:title', seo.title);
    setMeta('property', 'og:description', seo.description);
    setMeta('property', 'og:image', seo.image);
  }

  function startCountdown(root, doc, dateISO) {
    if (!root || !doc || !trim(dateISO)) return;
    if (root.__LIRANDZO_ROSALINA_V2_COUNTDOWN__) root.clearInterval(root.__LIRANDZO_ROSALINA_V2_COUNTDOWN__);
    const target = new Date(dateISO).getTime();
    if (!Number.isFinite(target)) return;
    function tick() {
      const diff = Math.max(0, target - Date.now());
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor(diff / 3600000) % 24;
      const minutes = Math.floor(diff / 60000) % 60;
      const seconds = Math.floor(diff / 1000) % 60;
      const d = doc.getElementById('days'); if (d) d.textContent = String(days);
      const h = doc.getElementById('hours'); if (h) h.textContent = String(hours).padStart(2, '0');
      const m = doc.getElementById('minutes'); if (m) m.textContent = String(minutes).padStart(2, '0');
      const s = doc.getElementById('seconds'); if (s) s.textContent = String(seconds).padStart(2, '0');
    }
    tick();
    root.__LIRANDZO_ROSALINA_V2_COUNTDOWN__ = root.setInterval(tick, 250);
  }

  function applyIndex(root, doc, vm) {
    setText(doc, '.names', vm.coupleNames);
    setText(doc, '.date-text', dateUpper(vm.eventDateISO, vm.dateLabel));
    setImage(q(doc, '.bg-image'), vm.coverImage || vm.heroImage);
    setBackground(q(doc, '.login-hero'), vm.coverImage || vm.heroImage);
    ensureSeo(doc, vm.seo);
    startCountdown(root, doc, vm.eventDateISO);
  }

  function applyParents(doc, vm) {
    const details = qa(doc, '.couple-details > div');
    const brideParents = splitParents(vm.brideParents);
    const groomParents = splitParents(vm.groomParents);
    if (details[0]) {
      const h = q(details[0], 'h3'); if (h) h.textContent = vm.brideFirst || vm.bride;
      const p = q(details[0], 'p');
      if (p) p.innerHTML = `Filha de <strong>${esc(brideParents[0])}</strong>${brideParents[1] ? `<br>e de <strong>${esc(brideParents[1])}</strong>` : ''}`;
    }
    if (details[2]) {
      const h = q(details[2], 'h3'); if (h) h.textContent = vm.groomFirst || vm.groom;
      const p = q(details[2], 'p');
      if (p) p.innerHTML = `Filho de <strong>${esc(groomParents[0])}</strong>${groomParents[1] ? `<br>e de <strong>${esc(groomParents[1])}</strong>` : ''}`;
    }
  }

  function applyStory(doc, vm) {
    setText(doc, '#nossa-historia .section-title', vm.storyTitle);
    setText(doc, '.verse', vm.verse ? `“${vm.verse}”` : '');
    setText(doc, '.verse-reference', vm.verseReference);
    setImage(q(doc, '.story-background-image img'), vm.storyImage);
    setImage(q(doc, '#carta-dos-noivos .vintage-scene img'), vm.storyImage);
    const timeline = doc.getElementById('storyTimeline');
    const nums = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ'];
    let chapters = vm.storyChapters;
    if (!chapters.length && vm.storyText) {
      chapters = vm.storyText.split(/\n\s*\n/).map(function (text, index) {
        return { title: `Capítulo ${index + 1}`, text: trim(text) };
      }).filter(function (item) { return Boolean(item.text); });
    }
    if (timeline && chapters.length) {
      timeline.innerHTML = chapters.slice(0, 8).map(function (chapter, index) {
        return `<div class="story-chapter"><div class="chapter-marker"><span class="chapter-number">${nums[index] || index + 1}</span></div><div class="chapter-content"><h3 class="chapter-title">${esc(chapter.title)}</h3><p class="chapter-text">${esc(chapter.text)}</p></div></div>`;
      }).join('');
    }
    if (vm.storyLetter) {
      const paragraphs = vm.storyLetter.split(/\n\s*\n/).map(trim).filter(Boolean);
      const preview = q(doc, '.vintage-letter-preview p:not(.letter-intro)');
      if (preview && paragraphs[0]) preview.textContent = paragraphs[0];
      setText(doc, '.letter-signature', vm.coupleNames);
      setText(doc, '#cartaNoivosModal .modal-signature', vm.coupleNames);
      const modalCard = q(doc, '#cartaNoivosModal .modal-card');
      const signature = q(doc, '#cartaNoivosModal .modal-signature');
      if (modalCard && signature) {
        qa(modalCard, ':scope > p:not(.modal-signature)').forEach(function (node) { node.remove(); });
        paragraphs.forEach(function (text) {
          const p = doc.createElement('p');
          p.textContent = text;
          modalCard.insertBefore(p, signature);
        });
      }
    }
  }

  function applySchedule(doc, vm) {
    const cards = qa(doc, '#agenda-evento .agenda-event');
    cards.forEach(function (card, index) {
      const item = vm.schedule[index];
      setVisible(card, Boolean(item));
      if (!item) return;
      const title = q(card, '.event-title'); if (title) title.textContent = item.title;
      const time = q(card, '.event-time'); if (time) time.textContent = item.time;
      const venue = q(card, '.event-location'); if (venue) venue.textContent = item.venue;
      const note = q(card, '.event-description'); if (note && item.note) note.textContent = item.note;
      const link = q(card, '.map-link-button');
      if (link) { if (item.mapUrl) { link.href = item.mapUrl; setVisible(link, true); } else setVisible(link, false); }
    });

    const chooserCards = qa(doc, '#locationChooserModal .location-choice-card');
    chooserCards.forEach(function (card, index) {
      const item = vm.schedule[index];
      setVisible(card, Boolean(item));
      if (!item) return;
      const label = q(card, '.location-choice-caption span'); if (label) label.textContent = item.title;
      const venue = q(card, '.location-choice-caption strong'); if (venue) venue.textContent = item.venue;
      const body = q(card, '.location-choice-body p'); if (body) body.textContent = item.note || `${item.title}${item.time ? ` às ${item.time}` : ''}.`;
      const link = q(card, '.location-choice-body a');
      if (link) { if (item.mapUrl) { link.href = item.mapUrl; setVisible(link, true); } else setVisible(link, false); }
    });

    const travel = qa(doc, '#transporteApoioModal .modal-travel-grid > div');
    vm.schedule.slice(0, 3).forEach(function (item, index) {
      const block = travel[index]; if (!block) return;
      const strong = q(block, 'strong'); if (strong) strong.textContent = item.title;
      const p = q(block, 'p'); if (p) p.textContent = `${item.venue}${item.time ? ` · ${item.time}` : ''}${item.note ? ` · ${item.note}` : ''}`;
    });
    if (travel[3] && vm.supportText) { const p = q(travel[3], 'p'); if (p) p.textContent = vm.supportText; }
  }

  function applyMenu(doc, vm) {
    setText(doc, '#menu-celebracao .section-title', vm.menuTitle);
    setText(doc, '#menu-celebracao .section-subtitle', vm.menuNote);
    const preview = qa(doc, '#menu-celebracao .menu-preview-card');
    preview.forEach(function (card, index) {
      const item = vm.menuItems[index];
      setVisible(card, Boolean(item));
      if (!item) return;
      const label = q(card, 'span:not(.card-icon)'); if (label) label.textContent = item.label;
      const title = q(card, 'h3'); if (title) title.textContent = item.title;
      const text = q(card, 'p'); if (text) text.textContent = item.text;
    });
    const list = q(doc, '#menuCelebracaoModal .modal-menu-list');
    if (list && vm.menuItems.length) {
      list.innerHTML = vm.menuItems.map(function (item) {
        return `<div><strong>${esc(item.label)}</strong>${item.title ? `<h4>${esc(item.title)}</h4>` : ''}<p>${esc(item.text)}</p></div>`;
      }).join('');
    }
    setText(doc, '#menuCelebracaoTitle', vm.menuTitle);
  }

  function applyGallery(doc, vm) {
    setText(doc, '#galeria .section-title', vm.galleryTitle);
    const grid = q(doc, '#galeria .gallery-grid');
    if (!grid || !vm.galleryItems.length) return;
    grid.innerHTML = vm.galleryItems.map(function (item) {
      return `<div class="gallery-image-container"><img src="${esc(item.src)}" data-src="${esc(item.src)}" alt="${esc(item.alt)}"></div>`;
    }).join('');
    qa(doc, '#galeria .gallery-grid img').forEach(function (img) {
      img.addEventListener('click', function () {
        const lightboxImage = doc.getElementById('lightboxImage');
        const lightboxModal = doc.getElementById('lightboxModal');
        if (lightboxImage) lightboxImage.src = img.getAttribute('data-src') || img.src;
        if (lightboxModal) lightboxModal.classList.add('open');
      });
    });
  }

  function applyDress(doc, vm) {
    setText(doc, '#dressCodeTitle', vm.dressTitle);
    setText(doc, '#dressCodeModal .modal-card > p', vm.dressNote);
    if (vm.dressImage) {
      const grid = q(doc, '#dressCodeModal .dresscode-grid');
      if (grid) grid.innerHTML = `<img class="dresscode-palette-img" src="${esc(vm.dressImage)}" alt="${esc(vm.dressTitle)}">`;
    }
    const guide = q(doc, '#dressCodeBtn') && q(doc, '#dressCodeBtn').closest('.guide-item');
    if (guide && vm.dressNote) { const p = q(guide, 'p'); if (p) p.textContent = vm.dressNote; }
  }

  function paymentBlock(doc, item, kind) {
    const block = doc.createElement('div');
    block.className = 'info-block payment-method-block lirandzo-v2-payment';
    const header = doc.createElement('div'); header.className = 'payment-method-header';
    const strong = doc.createElement('strong'); strong.textContent = item.label; header.appendChild(strong);
    if (item.logo) {
      const stack = doc.createElement('div'); stack.className = 'payment-logo-stack';
      const slot = doc.createElement('div'); slot.className = 'payment-logo-slot payment-logo-real';
      const img = doc.createElement('img'); img.src = item.logo; img.alt = item.label; img.loading = 'lazy';
      slot.appendChild(img); stack.appendChild(slot); header.appendChild(stack);
    }
    block.appendChild(header);
    const p = doc.createElement('p');
    if (kind === 'bank') {
      p.textContent = [`Titular: ${item.holder || '-'}`, `Conta: ${item.account || '-'}`, item.nib ? `NIB: ${item.nib}` : ''].filter(Boolean).join('\n');
      p.style.whiteSpace = 'pre-line';
    } else {
      p.textContent = [`Número: ${item.number || '-'}`, item.holder ? `Titular: ${item.holder}` : ''].filter(Boolean).join('\n');
      p.style.whiteSpace = 'pre-line';
    }
    block.appendChild(p);
    return block;
  }

  function applyPayments(doc, vm) {
    const box = doc.getElementById('monetaryContent');
    if (!box) return;
    qa(box, '.payment-method-block').forEach(function (node) { node.remove(); });
    const anchor = q(box, 'hr') || q(box, '#comprovativoForm');
    vm.bankAccounts.forEach(function (item) { box.insertBefore(paymentBlock(doc, item, 'bank'), anchor); });
    vm.mobilePayments.forEach(function (item) { box.insertBefore(paymentBlock(doc, item, 'mobile'), anchor); });
  }

  function applySupport(doc, vm) {
    if (vm.supportText) setText(doc, '.footer-contact span:last-child', vm.supportText);
    const transport = q(doc, '#transporte-apoio .travel-card p');
    if (transport && vm.supportText) transport.textContent = `Guarde os contactos de apoio: ${vm.supportText}`;
  }

  function applyFeatureVisibility(doc, vm) {
    setVisible(doc.getElementById('nossa-historia'), vm.sections.story);
    setVisible(doc.getElementById('carta-dos-noivos'), vm.sections.story);
    setVisible(doc.getElementById('agenda-evento'), vm.sections.schedule);
    setVisible(doc.getElementById('galeria'), vm.sections.gallery);
    setVisible(doc.getElementById('menu-celebracao'), vm.sections.menu);
    setVisible(doc.getElementById('mural-felicitacoes'), vm.sections.messages);
    setVisible(doc.getElementById('capsula-tempo'), vm.sections.capsule);
    setVisible(doc.getElementById('fabRsvpBtn'), vm.sections.rsvp);
    setVisible(doc.getElementById('fabGuestInfoBtn'), vm.sections.guestInfo);
    setVisible(doc.getElementById('fabGiftsBtn'), vm.sections.gifts || vm.sections.contributions);
    setVisible(q(doc, '.qr-checkin-card'), vm.sections.checkin);
    const rsvpGuide = q(doc, '#rsvpBtn') && q(doc, '#rsvpBtn').closest('.guide-item');
    const dressGuide = q(doc, '#dressCodeBtn') && q(doc, '#dressCodeBtn').closest('.guide-item');
    const giftsGuide = q(doc, '#giftsCombinedBtn') && q(doc, '#giftsCombinedBtn').closest('.guide-item');
    setVisible(rsvpGuide, vm.sections.rsvp);
    setVisible(dressGuide, vm.sections.dressCode);
    setVisible(giftsGuide, vm.sections.gifts || vm.sections.contributions);
  }

  function applyInvite(root, doc, vm) {
    setText(doc, '.names', vm.coupleNames);
    const heroStrong = qa(doc, '.hero .lead strong');
    if (heroStrong[0] && vm.invitationNote) heroStrong[0].textContent = vm.invitationNote;
    if (heroStrong[1] && vm.dateLabel) heroStrong[1].textContent = vm.dateLabel;
    setBackground(q(doc, '.hero'), vm.heroImage || vm.coverImage);
    const music = doc.getElementById('backgroundMusic'); if (music && vm.musicUrl) music.src = vm.musicUrl;
    applyParents(doc, vm);
    applyStory(doc, vm);
    applySchedule(doc, vm);
    applyMenu(doc, vm);
    applyGallery(doc, vm);
    applyDress(doc, vm);
    applyPayments(doc, vm);
    applySupport(doc, vm);
    applyFeatureVisibility(doc, vm);
    const rsvpGuide = q(doc, '#rsvpBtn') && q(doc, '#rsvpBtn').closest('.guide-item');
    if (rsvpGuide && vm.rsvpDeadline) { const p = q(rsvpGuide, 'p'); if (p) p.textContent = `Por favor, confirme a sua presença até ${vm.rsvpDeadline}.`; }
    ensureSeo(doc, vm.seo);
    startCountdown(root, doc, vm.eventDateISO);
  }

  function applyActiveContent(root, mapped) {
    const doc = root && root.document;
    if (!doc) return { page: 'unknown', applied: false };
    const vm = buildViewModel(mapped);
    const kind = pageKind(doc);
    if (kind === 'index') applyIndex(root, doc, vm);
    if (kind === 'invite') applyInvite(root, doc, vm);
    return { page: kind, applied: kind !== 'unknown', viewModel: vm };
  }

  function renderUnavailable(doc) {
    if (!doc || !doc.body || doc.getElementById('lirandzoV2Unavailable')) return;
    const box = doc.createElement('div');
    box.id = 'lirandzoV2Unavailable';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#fff;color:#171717;font:16px/1.5 system-ui,sans-serif;text-align:center';
    box.innerHTML = '<div><strong>Convite temporariamente indisponível</strong><p>Não foi possível carregar a versão publicada. Tente novamente dentro de instantes.</p></div>';
    doc.body.appendChild(box);
  }

  async function boot(root) {
    const renderer = root && root.LirandzoPublicRendererV2;
    if (!root || !root.document || !renderer) return { active: false, mode: 'unavailable', reason: 'renderer-missing' };
    const slug = trim(root.LIRANDZO_INVITE_SLUG) || TARGET_SLUG;
    const apiBase = trim(root.LIRANDZO_API_BASE_URL || root.LIRANDZO_API_URL);
    if (slug !== TARGET_SLUG) return { active: false, mode: 'ignored', reason: 'slug-mismatch' };
    try {
      const envelope = await renderer.fetchPublicEnvelope({ apiBase: apiBase, slug: slug });
      const resolved = renderer.resolveEnvelope(envelope);
      root.LIRANDZO_V2_LIVE_STATE = { active: resolved.active, mode: resolved.mode, revision: resolved.revision, hash: resolved.hash, slug: slug };
      if (!resolved.active || resolved.mode !== ACTIVE_MODE || !resolved.content) return root.LIRANDZO_V2_LIVE_STATE;
      root.LIRANDZO_EVENT_DATA = resolved.content;
      const run = function () { return applyActiveContent(root, resolved.content); };
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', run, { once: true });
      } else run();
      return root.LIRANDZO_V2_LIVE_STATE;
    } catch (error) {
      root.LIRANDZO_V2_LIVE_STATE = { active: false, mode: 'error', slug: slug, error: trim(error && error.message) };
      const fail = function () { renderUnavailable(root.document); };
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', fail, { once: true });
      else fail();
      throw error;
    }
  }

  return {
    TARGET_SLUG,
    ACTIVE_MODE,
    buildViewModel,
    pageKind,
    dateUpper,
    splitParents,
    applyActiveContent,
    boot
  };
});
