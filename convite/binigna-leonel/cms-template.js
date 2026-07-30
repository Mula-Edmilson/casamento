(function(){
  'use strict';
  function rawData(){ return window.LIRANDZO_EVENT_DATA || window.LIRANDZO_EVENT || {}; }
  function escAttr(value){ return String(value || '').replace(/"/g, '&quot;'); }
  function firstName(value){ return String(value || '').trim().split(/\s+/)[0] || ''; }
  function fmtDate(value){
    if(!value) return '';
    try { return new Date(value).toLocaleDateString('pt-PT', { day:'2-digit', month:'long', year:'numeric' }); } catch(_) { return ''; }
  }
  function yearDateUpper(value, label){
    if(label) return String(label).replace(/de\s+/gi, '').toUpperCase();
    if(!value) return '';
    try { return new Date(value).toLocaleDateString('pt-PT', { day:'2-digit', month:'long', year:'numeric' }).replace(/de\s+/gi, '').toUpperCase(); } catch(_) { return ''; }
  }
  function pick(){ for(var i=0;i<arguments.length;i++){ var v=arguments[i]; if(v !== undefined && v !== null && String(v).trim() !== '') return v; } return ''; }
  function splitParents(value){
    var text = String(value || '').trim();
    if(!text) return ['',''];
    var parts = text.split(/\s+e\s+/i);
    if(parts.length >= 2) return [parts[0].trim(), parts.slice(1).join(' e ').trim()];
    return [text, ''];
  }
  function normalise(){
    var d = rawData();
    var e = d.event || {};
    var t = d.theme || {};
    var s = d.story || {};
    var g = d.gallery || {};
    var dc = d.dressCode || {};
    var p = d.parents || {};
    var payments = Array.isArray(d.payments) ? d.payments : [];
    var program = Array.isArray(e.scheduleItems) ? e.scheduleItems : (Array.isArray(d.program) ? d.program : []);
    var religiousItem = program.find(function(item){ return /relig|igreja/i.test(String(item && item.title || '')); }) || program[0] || {};
    var civilItem = program.find(function(item){ return /civil/i.test(String(item && item.title || '')); }) || {};
    var receptionItem = program.find(function(item){ return /copo|recep|salao|salão/i.test(String(item && item.title || '')); }) || program[program.length - 1] || {};
    var bankAccounts = Array.isArray(d.bankAccounts) ? d.bankAccounts : payments.filter(function(x){ return /bim|bci|banco|bank|standard|moza/i.test(String(x.type || x.bank || '')); }).map(function(x){ return { bank:x.type || x.bank || 'Banco', holder:x.holder || '', account:x.number || x.account || '' }; });
    var mobilePayments = Array.isArray(d.mobilePayments) ? d.mobilePayments : payments.filter(function(x){ return /m-pesa|mpesa|e-mola|emola|mkesh|mobile/i.test(String(x.type || x.bank || '')); }).map(function(x){ return { type:x.type || 'Pagamento móvel', holder:x.holder || '', number:x.number || x.account || '' }; });
    var couple = pick(d.coupleNames, e.title, 'Os Noivos');
    var bride = pick(d.bride, firstName(couple.split('&')[0]), 'Noiva');
    var groom = pick(d.groom, firstName(couple.split('&')[1]), 'Noivo');
    var brideParents = pick(p.brideParents, d.brideParents, '');
    var groomParents = pick(p.groomParents, d.groomParents, '');
    var galleryItems = Array.isArray(g.items) ? g.items : [];
    return {
      slug: d.slug || window.LIRANDZO_INVITE_SLUG || '',
      coupleNames: couple,
      bride: bride,
      groom: groom,
      brideFirst: firstName(bride),
      groomFirst: firstName(groom),
      dateISO: pick(d.eventDateISO, e.dateISO, d.dateISO),
      dateLabel: pick(e.dateLabel, d.eventDateLong, fmtDate(pick(d.eventDateISO, e.dateISO, d.dateISO))),
      verse: pick(e.verse, d.verse),
      verseReference: pick(e.verseReference, d.verseReference),
      brideParents: brideParents,
      groomParents: groomParents,
      religiousTitle: religiousItem.title || d.ceremonyTitle || 'Igreja',
      religiousTime: pick(e.religiousTime, d.ceremonyTime, religiousItem.time),
      religiousVenue: pick(e.religiousVenue, d.ceremonyPlace, religiousItem.venue, religiousItem.place),
      religiousMapUrl: pick(e.religiousMapUrl, d.ceremonyMap, religiousItem.mapUrl),
      civilTitle: pick(civilItem.title, d.additionalTitle),
      civilTime: pick(e.civilTime, d.additionalTime, civilItem.time),
      civilVenue: pick(e.civilVenue, d.additionalPlace, civilItem.venue, civilItem.place),
      civilMapUrl: pick(e.civilMapUrl, d.additionalMap, civilItem.mapUrl),
      receptionTitle: receptionItem.title || d.receptionTitle || 'Copo de Água',
      receptionTime: pick(e.receptionTime, d.receptionTime, receptionItem.time),
      receptionVenue: pick(e.receptionVenue, d.receptionPlace, receptionItem.venue, receptionItem.place),
      receptionMapUrl: pick(e.receptionMapUrl, d.receptionMap, receptionItem.mapUrl),
      contactPhone: pick(e.contactPhone, d.supportContacts),
      whatsapp: pick(e.whatsapp, d.supportWhatsapp),
      invitationNote: pick(e.invitationNote, 'Celebre connosco o nosso casamento'),
      popupNote: pick(e.popupNote, 'Ao confirmar, os noivos recebem a sua resposta conforme o seu convite nominal.'),
      coverImage: pick(t.coverImage, t.heroImage),
      heroImage: pick(t.heroImage, t.coverImage),
      storyImage: pick(s.image, t.heroImage, t.coverImage),
      musicUrl: pick(t.musicUrl),
      storyTitle: pick(s.title, 'A Nossa História'),
      storyText: pick(s.text),
      storyChapters: Array.isArray(s.chapters) ? s.chapters : [],
      galleryTitle: pick(g.title, 'Momentos'),
      galleryItems: galleryItems,
      dressTitle: pick(dc.title, 'Inspiração: Casual Elegante'),
      dressNote: pick(dc.note, e.dressCode, 'O objetivo é o conforto sofisticado. Tons neutros, prata, branco e preto são bem-vindos.'),
      dressImage: pick(dc.image),
      bankAccounts: bankAccounts,
      mobilePayments: mobilePayments,
      hasCivil: Boolean(pick(e.civilTime, d.additionalTime, civilItem.time, e.civilVenue, d.additionalPlace, civilItem.venue, civilItem.place)),
      sections: d.sections || {}
    };
  }
  function setText(selector, value){ if(value) document.querySelectorAll(selector).forEach(function(el){ el.textContent = value; }); }
  function setHtml(selector, value){ if(value) document.querySelectorAll(selector).forEach(function(el){ el.innerHTML = value; }); }
  function setImage(el, src){ if(el && src){ el.src = src; el.setAttribute('data-src', src); } }
  function hideSection(id, active){ var el = document.getElementById(id); if(el && active === false) el.style.display = 'none'; }
  function applyEventCards(cfg){
    var cards = document.querySelectorAll('#agenda-evento .agenda-event');
    var data = [
      { title:cfg.religiousTitle, time:cfg.religiousTime, venue:cfg.religiousVenue, map:cfg.religiousMapUrl }
    ];
    if(cfg.hasCivil && cards.length >= 3) data.push({ title:cfg.civilTitle, time:cfg.civilTime, venue:cfg.civilVenue, map:cfg.civilMapUrl });
    data.push({ title:cfg.receptionTitle, time:cfg.receptionTime, venue:cfg.receptionVenue, map:cfg.receptionMapUrl });
    cards.forEach(function(card, i){
      var item = data[i] || {};
      if(item.title) { var a = card.querySelector('.event-title'); if(a) a.textContent = item.title; }
      if(item.time) { var b = card.querySelector('.event-time'); if(b) b.textContent = item.time; }
      if(item.venue) { var c = card.querySelector('.event-location'); if(c) c.textContent = item.venue; }
      var link = card.querySelector('.map-link-button'); if(link && item.map) link.href = item.map;
    });
    var rel = document.getElementById('mapBtnReligiosa'); if(rel && cfg.religiousMapUrl) rel.href = cfg.religiousMapUrl;
    var civ = document.getElementById('mapBtnCivil'); if(civ && cfg.civilMapUrl) civ.href = cfg.civilMapUrl;
    var rec = document.getElementById('mapBtnRecepcao'); if(rec && cfg.receptionMapUrl) rec.href = cfg.receptionMapUrl;
  }
  function applyGallery(cfg){
    if(!Array.isArray(cfg.galleryItems) || !cfg.galleryItems.length) return;
    var grid = document.querySelector('.gallery-grid');
    if(!grid) return;
    grid.innerHTML = cfg.galleryItems.map(function(item, index){
      var src = item.src || item.url || '';
      if(!src) return '';
      return '<div class="gallery-image-container"><img src="' + escAttr(src) + '" alt="' + escAttr(item.alt || ('Foto ' + (index+1))) + '" data-src="' + escAttr(src) + '"></div>';
    }).join('');
    document.querySelectorAll('.gallery-grid img').forEach(function(img){
      img.addEventListener('click', function(){
        var lightboxImage = document.getElementById('lightboxImage');
        var lightboxModal = document.getElementById('lightboxModal');
        if(lightboxImage) lightboxImage.src = img.getAttribute('data-src') || img.src;
        if(lightboxModal) lightboxModal.classList.add('open');
      });
    });
  }
  function applyStory(cfg){
    setText('#nossa-historia .section-title', cfg.storyTitle);
    var img = document.querySelector('.story-background-image img'); setImage(img, cfg.storyImage);
    var chapters = cfg.storyChapters && cfg.storyChapters.length ? cfg.storyChapters : [];
    if(!chapters.length && cfg.storyText){
      var parts = String(cfg.storyText).split(/\n\s*\n/).map(function(x){ return x.trim(); }).filter(Boolean);
      chapters = parts.map(function(text, index){ return { title:['O Encontro','A Amizade','O Crescimento','A Promessa'][index] || ('Capítulo ' + (index+1)), text:text }; });
    }
    if(chapters.length){
      var timeline = document.getElementById('storyTimeline');
      var nums = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ'];
      if(timeline){
        timeline.innerHTML = chapters.slice(0,8).map(function(ch, i){ return '<div class="story-chapter"><div class="chapter-marker"><span class="chapter-number">' + nums[i] + '</span></div><div class="chapter-content"><h3 class="chapter-title">' + (ch.title || ('Capítulo ' + (i+1))) + '</h3><p class="chapter-text">' + (ch.text || ch.note || '') + '</p></div></div>'; }).join('');
      }
    }
  }
  function applyPayments(cfg){
    var box = document.getElementById('monetaryContent');
    if(!box) return;
    var html = '<h4>Um Mimo para o Futuro</h4>';
    cfg.bankAccounts.forEach(function(a){ html += '<div class="info-block"><p><strong>Conta Bancária (' + (a.bank || 'Banco') + ')</strong></p><p>Titular: ' + (a.holder || '-') + '<br>Conta: ' + (a.account || a.number || '-') + '</p></div>'; });
    cfg.mobilePayments.forEach(function(a){ html += '<div class="info-block"><p><strong>' + (a.type || 'Pagamento móvel') + '</strong></p><p>' + (a.number || a.account || '-') + (a.holder ? ' (' + a.holder + ')' : '') + '</p></div>'; });
    var oldForm = box.querySelector('#comprovativoForm');
    html += '<hr style="margin: 24px 0; border: 0; border-top: 1px solid var(--border-color);"><h4>Registar Comprovativo</h4><p style="font-size: 0.9rem; text-align: left; margin-bottom: 16px;">Se desejar, pode partilhar o seu comprovativo de pagamento aqui.</p>';
    if(oldForm) html += oldForm.outerHTML;
    box.innerHTML = html;
  }
  function applyDress(cfg){
    setText('#dressCodeTitle', cfg.dressTitle);
    setText('#dressCodeModal .modal-card > p', cfg.dressNote);
    if(cfg.dressImage){
      var grid = document.querySelector('.dresscode-grid');
      if(grid) grid.innerHTML = '<img src="' + escAttr(cfg.dressImage) + '" alt="Inspiração de dress code">';
    }
  }
  function applyCmsTemplate(){
    var cfg = normalise();
    document.title = 'Convite de Casamento — ' + cfg.coupleNames;
    var ogTitle = document.querySelector('meta[property="og:title"]'); if(ogTitle) ogTitle.content = document.title;
    var ogImage = document.querySelector('meta[property="og:image"]'); if(ogImage && (cfg.heroImage || cfg.coverImage)) ogImage.content = cfg.heroImage || cfg.coverImage;
    setText('.names', cfg.coupleNames);
    var leadStrong = document.querySelectorAll('.hero .lead strong');
    if(leadStrong[0]) leadStrong[0].textContent = cfg.invitationNote;
    if(leadStrong[1] && cfg.dateLabel) leadStrong[1].textContent = cfg.dateLabel;
    setText('.date-text', yearDateUpper(cfg.dateISO, cfg.dateLabel));
    setText('.verse', cfg.verse);
    setText('.verse-reference', cfg.verseReference);
    var details = document.querySelectorAll('.couple-details > div');
    var bp = splitParents(cfg.brideParents); var gp = splitParents(cfg.groomParents);
    if(details[0]) details[0].innerHTML = '<h3>' + cfg.brideFirst + '</h3><p>Filha de <strong>' + (bp[0] || '') + '</strong>' + (bp[1] ? '<br>e de <strong>' + bp[1] + '</strong>' : '') + '</p>';
    if(details[2]) details[2].innerHTML = '<h3>' + cfg.groomFirst + '</h3><p>Filho de <strong>' + (gp[0] || '') + '</strong>' + (gp[1] ? '<br>e de <strong>' + gp[1] + '</strong>' : '') + '</p>';
    if(cfg.heroImage){ var hero = document.querySelector('.hero'); if(hero) hero.style.backgroundImage = 'url("' + cfg.heroImage + '")'; }
    if(cfg.coverImage){ document.querySelectorAll('.bg-image').forEach(function(img){ img.src = cfg.coverImage; }); }
    var music = document.getElementById('backgroundMusic'); if(music && cfg.musicUrl) music.src = cfg.musicUrl;
    applyStory(cfg); applyEventCards(cfg); applyGallery(cfg); applyDress(cfg); applyPayments(cfg);
    setText('.footer-contact span:last-child', cfg.contactPhone);
    setText('.rsvp-note-clean', cfg.popupNote);
    hideSection('nossa-historia', cfg.sections.story);
    hideSection('galeria', cfg.sections.gallery);
    hideSection('guia-evento', (cfg.sections.rsvp || cfg.sections.dressCode || cfg.sections.gifts || cfg.sections.contributions));
    hideSection('mural-felicitacoes', cfg.sections.messages);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyCmsTemplate);
  else applyCmsTemplate();
})();
