(() => {
  const $ = (id) => document.getElementById(id);
  const eventData = window.LIRANDZO_EVENT_DATA || {};
  const slug = window.LIRANDZO_INVITE_SLUG || eventData.slug || '__INVITE_SLUG__';
  const apiBase = (window.LIRANDZO_API_BASE_URL || eventData.apiBaseUrl || '__API_BASE_URL__').replace(/\/+$/, '');
  const apiUrl = window.LIRANDZO_API_URL || `${apiBase}/api`;
  let currentGuest = null;
  let adminPassword = sessionStorage.getItem(`lirandzo_admin_${slug}`) || '';

  function esc(v){ return String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function show(el, msg, error=false){ if(!el) return; el.classList.remove('hidden'); el.classList.toggle('error', !!error); el.innerHTML = msg; }
  function hide(el){ if(el) el.classList.add('hidden'); }
  async function get(action, params={}){
    const qs = new URLSearchParams({ slug, action, ...params });
    const r = await fetch(`${apiUrl}?${qs.toString()}`);
    const j = await r.json(); if(!r.ok || j.status === 'error') throw new Error(j.message || 'Erro na API.'); return j;
  }
  async function post(data){
    const r = await fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ slug, ...data }) });
    const j = await r.json(); if(!r.ok || j.status === 'error') throw new Error(j.message || 'Erro na API.'); return j;
  }
  async function adminPost(action, data={}){
    const r = await fetch(`${apiBase}/admin-api`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ slug, action, password: adminPassword, ...data }) });
    const j = await r.json(); if(!r.ok || j.status === 'error') throw new Error(j.message || 'Erro no admin.'); return j;
  }
  function field(path, fallback=''){
    return path.split('.').reduce((o,k)=>o && o[k] !== undefined ? o[k] : undefined, eventData) ?? fallback;
  }
  function formatDate(){
    const label = field('event.dateLabel') || eventData.eventDateISO || field('event.dateISO');
    if(field('event.dateLabel')) return label;
    try { return label ? new Date(label).toLocaleString('pt-PT', { dateStyle:'full', timeStyle:'short' }) : 'Data a confirmar'; } catch { return 'Data a confirmar'; }
  }
  function renderBase(){
    document.querySelectorAll('[data-field="coupleNames"]').forEach(el => el.textContent = eventData.coupleNames || '__COUPLE_NAMES__');
    document.querySelectorAll('[data-field="dateLabel"]').forEach(el => el.textContent = formatDate());
    document.querySelectorAll('[data-field="invitationNote"]').forEach(el => el.textContent = field('event.invitationNote', 'Temos a honra de convidá-lo para celebrar connosco este momento especial.'));
    document.body.dataset.package = eventData.packageKey || '__PACKAGE_KEY__';
    const sections = eventData.sections || {};
    document.querySelectorAll('[data-section]').forEach(el => {
      const key = el.dataset.section;
      if (sections[key] === false) el.classList.add('hidden');
    });
  }
  function renderCountdown(){
    const el = $('countdown'); if(!el) return;
    const iso = eventData.eventDateISO || field('event.dateISO'); if(!iso){ el.innerHTML = '<span>Data a confirmar</span>'; return; }
    const target = new Date(iso).getTime();
    const tick = () => {
      const d = Math.max(0, target - Date.now());
      const days = Math.floor(d/86400000), hours = Math.floor(d%86400000/3600000), mins = Math.floor(d%3600000/60000);
      el.innerHTML = `<strong>${days}</strong><span>dias</span><strong>${hours}</strong><span>h</span><strong>${mins}</strong><span>min</span>`;
    }; tick(); setInterval(tick, 60000);
  }
  function renderSchedule(){
    const el = $('scheduleList'); if(!el) return;
    const items = [
      ['Cerimónia religiosa', field('event.religiousTime'), field('event.religiousVenue'), field('event.religiousMapUrl')],
      ['Cerimónia civil', field('event.civilTime'), field('event.civilVenue'), field('event.civilMapUrl')],
      ['Copo de água', field('event.receptionTime'), field('event.receptionVenue'), field('event.receptionMapUrl')]
    ].filter(i => i[1] || i[2]);
    el.innerHTML = items.length ? items.map(([title,time,venue,map]) => `<article><strong>${esc(time || '--')}</strong><div><b>${esc(title)}</b><span>${esc(venue || 'Local a confirmar')}</span>${map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Abrir mapa</a>`:''}</div></article>`).join('') : '<p class="muted">Agenda por configurar.</p>';
  }
  function renderLocations(){
    const el = $('locationsList'); if(!el) return;
    const items = [
      ['Igreja', field('event.religiousVenue'), field('event.religiousMapUrl')],
      ['Civil', field('event.civilVenue'), field('event.civilMapUrl')],
      ['Copo de água', field('event.receptionVenue'), field('event.receptionMapUrl')]
    ].filter(i => i[1] || i[2]);
    el.innerHTML = items.length ? items.map(([title,venue,map]) => `<article><b>${esc(title)}</b><span>${esc(venue || 'Local a confirmar')}</span>${map ? `<a class="btn small" href="${esc(map)}" target="_blank" rel="noopener">Abrir no mapa</a>`:''}</article>`).join('') : '<p class="muted">Localização por configurar.</p>';
  }
  function renderPayments(){
    const el = $('paymentsList'); if(!el) return;
    const payments = eventData.payments || [];
    el.innerHTML = payments.length ? payments.map(p => `<article><b>${esc(p.method || 'Conta')}</b><span>${esc(p.holder || '')}</span><strong>${esc(p.number || '')}</strong></article>`).join('') : '<p class="muted">Dados de contribuição por configurar.</p>';
  }
  function calendarText(){
    const start = new Date(eventData.eventDateISO || field('event.dateISO') || Date.now());
    const end = new Date(start.getTime() + 4*3600000);
    const fmt = d => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
    return ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',`SUMMARY:Casamento ${eventData.coupleNames || ''}`,`DTSTART:${fmt(start)}`,`DTEND:${fmt(end)}`,`LOCATION:${field('event.receptionVenue') || field('event.civilVenue') || field('event.religiousVenue') || ''}`,'END:VEVENT','END:VCALENDAR'].join('\n');
  }

  function initMusic(){
    const url = field('theme.musicUrl','');
    if(!url) return;
    const audio = new Audio(url); audio.loop = true; audio.volume = 0.42;
    const start = () => audio.play().catch(()=>{});
    document.addEventListener('click', start, { once:true });
  }

  function bindCalendar(){ document.querySelectorAll('[data-calendar]').forEach(btn => btn.addEventListener('click', () => { const blob = new Blob([calendarText()], {type:'text/calendar'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug}-lembrete.ics`; a.click(); URL.revokeObjectURL(a.href); })); }

  async function loadMessages(){ const el=$('messagesList'); if(!el) return; try{ const out=await get('list_messages'); const rows=out.data||[]; el.innerHTML = rows.length ? rows.slice(0,8).map(m=>`<article><b>${esc(m.nome)}</b><span>${esc(m.message)}</span></article>`).join('') : '<p class="muted">Ainda não há mensagens.</p>'; }catch(e){ el.innerHTML=`<p class="muted">${esc(e.message)}</p>`; } }
  async function loadGifts(){ const el=$('giftsList'); if(!el) return; try{ const out=await get('list_gifts'); const rows=(out.data||[]).filter(g=>!g.reserved); el.innerHTML = rows.length ? rows.map(g=>`<label class="check-item"><input type="checkbox" name="gift" value="${esc(g.name)}"><span>${esc(g.name)}</span></label>`).join('') : '<p class="muted">Todos os presentes já foram reservados ou a lista está vazia.</p>'; }catch(e){ el.innerHTML=`<p class="muted">${esc(e.message)}</p>`; } }
  function initInvite(){
    renderSchedule(); renderLocations(); renderPayments(); loadMessages(); loadGifts();
    const mode = field('rsvp.mode','guest-list'); const note=$('rsvpModeNote'); const login=$('loginForm'); const form=$('rsvpForm');
    if(mode === 'public' || mode === 'open'){ note.textContent='Confirmação pública: escreva o nome e confirme directamente.'; login.classList.add('hidden'); form.classList.remove('hidden'); }
    else { note.textContent='Confirmação por lista: valide primeiro o nome do convidado.'; }
    login?.addEventListener('submit', async e => { e.preventDefault(); hide($('rsvpFeedback')); try{ const name=new FormData(login).get('name'); const out=await post({action:'login', name}); currentGuest=out.data; form.nome.value=currentGuest.name; form.guests.value=currentGuest.maxGuestsTotal || 1; form.classList.remove('hidden'); show($('rsvpFeedback'), `Nome validado: <b>${esc(currentGuest.name)}</b>. Mesa: <b>${esc(currentGuest.mesa || 'A definir')}</b>.`); }catch(err){ show($('rsvpFeedback'), err.message, true); } });
    form?.addEventListener('submit', async e => { e.preventDefault(); hide($('rsvpFeedback')); const fd=new FormData(form); try{ const out=await post({action:'rsvp', nome:fd.get('nome'), phone:fd.get('phone'), message:fd.get('message'), guests:fd.get('guests'), token: currentGuest?.token || ''}); show($('rsvpFeedback'), out.message || 'Presença confirmada com sucesso.'); form.reset(); }catch(err){ show($('rsvpFeedback'), err.message, true); } });
    $('messageForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd=new FormData(e.currentTarget); try{ await post({action:'post_message', nome:fd.get('nome'), message:fd.get('message')}); e.currentTarget.reset(); loadMessages(); }catch(err){ alert(err.message); } });
    $('giftForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd=new FormData(e.currentTarget); const selected=[...document.querySelectorAll('input[name="gift"]:checked')].map(i=>i.value); try{ await post({action:'save_gifts', nome:fd.get('nome'), selectedGifts:selected}); alert('Presentes reservados.'); loadGifts(); }catch(err){ alert(err.message); } });
    $('contributionForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd=new FormData(e.currentTarget); fd.append('slug', slug); fd.append('action','upload_comprovativo'); try{ const r=await fetch(apiUrl,{method:'POST',body:fd}); const j=await r.json(); if(!r.ok || j.status==='error') throw new Error(j.message); show($('contributionFeedback'), j.message || 'Comprovativo enviado.'); e.currentTarget.reset(); }catch(err){ show($('contributionFeedback'), err.message, true); } });
  }
  async function loadAdmin(){
    const [guests,rsvps,msgs,contribs] = await Promise.all([adminPost('get_guests'),adminPost('get_rsvps'),adminPost('get_messages'),adminPost('get_comprovativos')]);
    $('adminStats').innerHTML = `<article><strong>${guests.data.length}</strong><span>Convidados</span></article><article><strong>${rsvps.data.length}</strong><span>RSVP</span></article><article><strong>${msgs.data.length}</strong><span>Mensagens</span></article><article><strong>${contribs.data.length}</strong><span>Contribuições</span></article>`;
    $('adminGuestsRows').innerHTML = guests.data.map(g=>`<tr><td>${esc(g.name)}</td><td>${esc(g.mesa)}</td><td>${esc(g.maxGuestsTotal)}</td><td>${esc(g.status)}</td><td><small>${esc(g.token)}</small></td></tr>`).join('') || '<tr><td colspan="5">Sem convidados.</td></tr>';
    $('adminRsvpRows').innerHTML = rsvps.data.map(r=>`<tr><td>${esc(r.nome)}</td><td>${esc(r.guests)}</td><td>${esc(r.phone||'')}</td><td>${new Date(r.timestamp).toLocaleString('pt-PT')}</td></tr>`).join('') || '<tr><td colspan="4">Sem confirmações.</td></tr>';
    $('adminMessagesList').innerHTML = msgs.data.map(m=>`<article><b>${esc(m.nome)}</b><span>${esc(m.message)}</span></article>`).join('') || '<p class="muted">Sem mensagens.</p>';
    $('adminContribList').innerHTML = contribs.data.map(c=>`<article><b>${esc(c.nome)}</b><span>${esc(c.canal||'')}</span>${c.viewUrl?`<a href="${esc(c.viewUrl)}" target="_blank">Abrir comprovativo</a>`:''}</article>`).join('') || '<p class="muted">Sem contribuições.</p>';
  }
  function initAdmin(){
    const loginCard=$('adminLoginCard'), panel=$('adminPanel');
    async function enter(){ loginCard.classList.add('hidden'); panel.classList.remove('hidden'); await loadAdmin(); }
    if(adminPassword) enter().catch(()=>{ adminPassword=''; sessionStorage.removeItem(`lirandzo_admin_${slug}`); loginCard.classList.remove('hidden'); panel.classList.add('hidden'); });
    $('adminLoginForm')?.addEventListener('submit', async e => { e.preventDefault(); adminPassword=new FormData(e.currentTarget).get('password'); try{ await adminPost('get_guests'); sessionStorage.setItem(`lirandzo_admin_${slug}`, adminPassword); enter(); }catch(err){ show($('adminLoginFeedback'), err.message, true); } });
    $('adminRefreshBtn')?.addEventListener('click', loadAdmin);
    $('adminAddGuestForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd=new FormData(e.currentTarget); try{ await adminPost('add_guest', {name:fd.get('name'), table:fd.get('table'), companions:fd.get('companions')}); e.currentTarget.reset(); loadAdmin(); }catch(err){ alert(err.message); } });
  }
  function initCheckin(){
    const auth=$('checkinAuthForm'), form=$('checkinForm');
    auth?.addEventListener('submit', async e => { e.preventDefault(); adminPassword=new FormData(auth).get('password'); try{ const guests=await adminPost('get_guests'); sessionStorage.setItem(`lirandzo_admin_${slug}`,adminPassword); auth.classList.add('hidden'); form.classList.remove('hidden'); $('checkinGuestList').innerHTML=(guests.data||[]).slice(0,60).map(g=>`<article><b>${esc(g.name)}</b><span>${esc(g.mesa)} · ${esc(g.status)}</span></article>`).join(''); }catch(err){ show($('checkinFeedback'),err.message,true); } });
    form?.addEventListener('submit', async e => { e.preventDefault(); const nome=new FormData(form).get('nome'); try{ const out=await post({action:'checkin_guest', nome, operator:'Recepção'}); show($('checkinFeedback'), out.message || 'Entrada confirmada.'); form.reset(); }catch(err){ show($('checkinFeedback'),err.message,true); } });
  }
  function initCapsule(){ $('capsuleForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd=new FormData(e.currentTarget); const file=fd.get('photo'); if(!file) return; const reader=new FileReader(); reader.onload=async()=>{ try{ const out=await post({action:'save_capsule_photo', nome:fd.get('nome'), caption:fd.get('caption'), photoBase64:reader.result, mimeType:file.type, originalName:file.name}); show($('capsuleFeedback'), out.message || 'Fotografia enviada.'); e.currentTarget.reset(); }catch(err){ show($('capsuleFeedback'),err.message,true); } }; reader.readAsDataURL(file); }); }
  renderBase(); renderCountdown(); bindCalendar(); initMusic();
  const page=document.body.dataset.page; if(page==='invite') initInvite(); if(page==='admin') initAdmin(); if(page==='checkin') initCheckin(); if(page==='capsule') initCapsule();
})();
