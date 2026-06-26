
(function(){
  const E = window.LIRANDZO_EVENT_DATA || {};
  const cfg = E || {};
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const API = (window.LIRANDZO_API_URL || (window.LIRANDZO_API_BASE_URL ? window.LIRANDZO_API_BASE_URL.replace(/\/+$/,'') + '/api' : cfg.apiUrl || '')).replace(/\/+$/,'');
  const slug = window.LIRANDZO_INVITE_SLUG || cfg.slug || '';
  let activeGuest = null;
  function esc(v){return String(v ?? '');}
  function text(id, value){ const el = $('#'+id); if(el) el.textContent = esc(value || ''); }
  function html(id, value){ const el = $('#'+id); if(el) el.innerHTML = value || ''; }
  function bg(el, src){ if(!el || !src) return; el.style.backgroundImage = `url("${src}")`; el.classList.add('has-image'); const ph=el.querySelector('.photo-placeholder'); if(ph) ph.remove(); }
  function visible(id, yes){ const el = $('#'+id); if(el) el.classList.toggle('hidden', !yes); }
  function sectionOn(key, fallback=true){ return cfg.sections && Object.prototype.hasOwnProperty.call(cfg.sections,key) ? !!cfg.sections[key] : fallback; }
  function firstMap(){ const ev=cfg.event||{}; return ev.generalMapUrl || ev.receptionMapUrl || ev.civilMapUrl || ev.religiousMapUrl || ''; }
  function firstVenue(){ const ev=cfg.event||{}; return ev.receptionVenue || ev.civilVenue || ev.religiousVenue || ''; }
  function apiGet(action){ if(!API) return Promise.resolve({status:'error'}); return fetch(`${API}?slug=${encodeURIComponent(slug)}&action=${encodeURIComponent(action)}`).then(r=>r.json()); }
  function apiPost(action,data){ return fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,action,...data})}).then(async r=>{const j=await r.json().catch(()=>({})); if(!r.ok || j.status==='error') throw new Error(j.message || 'Erro no servidor.'); return j;}); }
  function renderBase(){
    document.body.dataset.template = cfg.templateKey || cfg.theme?.style || 'perola-flicia';
    document.title = `${cfg.coupleNames || 'Convite'} · Lirandzo`;
    ['coverCouple','heroCouple','navCouple','footerCouple'].forEach(id=>text(id,cfg.coupleNames));
    text('coverDate', cfg.event?.dateLabel || cfg.eventDateISO || '');
    text('packageLabel', cfg.templateLabel || cfg.packageLabel || 'Convite digital');
    text('heroNote', cfg.event?.invitationNote || 'Temos a honra de convidá-lo para celebrar connosco este momento especial.');
    text('popupNote', cfg.event?.popupNote || 'Confirme a sua presença e adicione o evento ao seu lembrete.');
    text('rsvpNote', cfg.event?.rsvpDeadline ? `Confirme até ${cfg.event.rsvpDeadline}.` : 'A sua presença tornará este momento ainda mais especial.');
    bg($('#coverMedia'), cfg.theme?.coverImage || cfg.theme?.heroImage);
    bg($('#heroPhoto'), cfg.theme?.heroImage || cfg.theme?.coverImage);
    const audio=$('#inviteAudio'); if(audio && cfg.theme?.musicUrl) audio.src=cfg.theme.musicUrl;
  }
  function renderSchedule(){
    const list = cfg.event?.scheduleItems || [];
    html('scheduleList', list.map(i=>`<article class="schedule-card"><b>${esc(i.time)}</b><h3>${esc(i.title)}</h3><p>${esc(i.venue)}</p>${i.mapUrl?`<a class="btn ghost" href="${esc(i.mapUrl)}" target="_blank" rel="noopener">Ver mapa</a>`:''}</article>`).join(''));
    visible('scheduleSection', sectionOn('schedule', true) && list.length>0);
  }
  function renderStory(){ text('storyTitle', cfg.story?.title || 'A nossa história'); text('storyText', cfg.story?.text || ''); bg($('#storyImage'), cfg.story?.image); visible('storySection', sectionOn('story', false) && !!(cfg.story?.text || cfg.story?.image)); }
  function renderParents(){ text('brideParents', cfg.parents?.brideParents || ''); text('groomParents', cfg.parents?.groomParents || ''); visible('parentsSection', sectionOn('parents', false) && !!(cfg.parents?.brideParents || cfg.parents?.groomParents)); }
  function renderGallery(){ const items=cfg.gallery?.items || []; text('galleryTitle', cfg.gallery?.title || 'Galeria'); html('galleryGrid', items.map(i=>`<figure class="gallery-item" style="background-image:url('${esc(i.src||i.url)}')">${i.caption?`<span>${esc(i.caption)}</span>`:''}</figure>`).join('')); visible('gallerySection', sectionOn('gallery', false) && items.length>0); }
  function renderDress(){ text('dressTitle', cfg.dressCode?.title || 'Dress code'); text('dressNote', cfg.dressCode?.note || cfg.event?.dressCode || ''); bg($('#dressImage'), cfg.dressCode?.image); html('paletteList',(cfg.dressCode?.palette||[]).map(c=>`<span class="palette-dot" title="${esc(c)}" style="background:${esc(c)}"></span>`).join('')); visible('dressCodeSection', sectionOn('dressCode', false) && !!(cfg.dressCode?.note || cfg.dressCode?.image || (cfg.dressCode?.palette||[]).length)); }
  function renderMenu(){ text('menuTitle', cfg.menu?.title || 'Menu'); text('menuNote', cfg.menu?.note || ''); bg($('#menuImage'), cfg.menu?.image); visible('menuSection', sectionOn('menu', false) && !!(cfg.menu?.note || cfg.menu?.image)); }
  function renderParty(){ const people=cfg.bridalParty?.people||[]; text('bridalPartyTitle', cfg.bridalParty?.title || 'Padrinhos e madrinhas'); html('bridalPartyGrid', people.map(p=>`<article class="party-card">${p.image?`<div class="gallery-item" style="min-height:190px;background-image:url('${esc(p.image)}')"></div>`:''}<h3>${esc(p.name)}</h3><p>${esc(p.role)}</p></article>`).join('')); visible('bridalPartySection', sectionOn('bridalParty', false) && people.length>0); }
  function renderMap(){ text('mapVenue', firstVenue()); const a=$('#mapLink'); if(a) a.href=firstMap() || '#'; visible('mapSection', sectionOn('map', true) && !!firstMap()); }
  function renderPayments(){ const rows=cfg.payments||[]; html('paymentList', rows.map(p=>`<article class="payment-card"><strong>${esc(p.method)}</strong><p>${esc(p.holder)}</p><b>${esc(p.number)}</b></article>`).join('')); visible('contributionsSection', sectionOn('contributions', true) && rows.length>0); }
  async function renderGifts(){ visible('giftsSection', sectionOn('gifts', true)); text('giftsTitle', cfg.gifts?.title || 'Lista de presentes'); text('giftsNote', cfg.gifts?.note || ''); if(!sectionOn('gifts',true)) return; try{ const out=await apiGet('list_gifts'); const gifts=out.data||[]; html('giftList', gifts.slice(0,18).map(g=>`<article class="gift-card"><strong>${esc(g.name)}</strong><p>${g.reserved?'Reservado':'Disponível'}</p></article>`).join('')); }catch(e){} }
  async function renderMessages(){ visible('messagesSection', sectionOn('messages', true)); text('messagesTitle', cfg.messages?.title || 'Mural de mensagens'); if(!sectionOn('messages',true)) return; try{ const out=await apiGet('list_messages'); const msgs=out.data||[]; html('messageList', msgs.slice(0,12).map(m=>`<article class="message-card"><strong>${esc(m.nome)}</strong><p>${esc(m.message)}</p></article>`).join('')); }catch(e){} }
  function ics(){ const start = cfg.eventDateISO || cfg.event?.dateISO; if(!start) return; const d=new Date(start); const pad=n=>String(n).padStart(2,'0'); const stamp=`${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; const body=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',`SUMMARY:Casamento ${cfg.coupleNames||''}`,`DTSTART:${stamp}`,`LOCATION:${firstVenue()}`,'END:VEVENT','END:VCALENDAR'].join('\n'); const blob=new Blob([body],{type:'text/calendar'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${slug||'convite'}.ics`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function countdown(){ const target= new Date(cfg.eventDateISO || cfg.event?.dateISO || '').getTime(); const box=$('#countdown'); if(!box || !target) return; const tick=()=>{ const diff=Math.max(0,target-Date.now()); const d=Math.floor(diff/86400000), h=Math.floor(diff/3600000)%24, m=Math.floor(diff/60000)%60, s=Math.floor(diff/1000)%60; const vals=[d,h,m,s]; box.querySelectorAll('b').forEach((b,i)=>b.textContent=String(vals[i]).padStart(2,'0')); }; tick(); setInterval(tick,1000); }
  function openInvite(){ $('#coverPage')?.classList.add('hidden'); $('#invitePage')?.classList.remove('hidden'); const audio=$('#inviteAudio'); if(audio && audio.src) audio.play().catch(()=>{}); apiPost('open_invite',{}).catch(()=>{}); }
  function modal(open){ $('#rsvpModal')?.classList.toggle('open',open); }
  function feedback(msg,err=false){ const el=$('#rsvpFeedback'); if(!el) return; el.textContent=msg; el.classList.toggle('error',err); el.classList.remove('hidden'); }
  function bind(){ $('#openInviteBtn')?.addEventListener('click',openInvite); $$('[data-open-rsvp]').forEach(b=>b.addEventListener('click',()=>modal(true))); $('#closeRsvp')?.addEventListener('click',()=>modal(false)); $('#calendarBtn')?.addEventListener('click',ics); $('#calendarBtnModal')?.addEventListener('click',ics); $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.scroll)?.scrollIntoView({behavior:'smooth'}))); $('#rsvpForm')?.addEventListener('submit',async e=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget).entries()); try{ if((cfg.rsvp?.mode||'guest-list')!=='public' && !activeGuest){ const login=await apiPost('login',{name:data.nome}); activeGuest=login.data || {}; data.token=login.token || activeGuest.token || ''; } else if(activeGuest?.token) data.token=activeGuest.token; await apiPost('rsvp',data); feedback('Confirmação recebida com sucesso. Obrigado!'); setTimeout(()=>modal(false),1300); }catch(err){ feedback(err.message,true); }}); $('#messageForm')?.addEventListener('submit',async e=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget).entries()); try{ await apiPost('post_message',data); e.currentTarget.reset(); renderMessages(); }catch(err){ alert(err.message); }}); }
  function init(){ renderBase(); renderSchedule(); renderStory(); renderParents(); renderGallery(); renderDress(); renderMenu(); renderParty(); renderMap(); renderPayments(); renderGifts(); renderMessages(); countdown(); bind(); }
  document.addEventListener('DOMContentLoaded',init);
})();
