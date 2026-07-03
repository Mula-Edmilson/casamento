(function(){
  'use strict';
  const BOT_VERSION='OMNI-Deterministic-v1.0';
  const LS_KEY='lirandzo_operator_history_v1';
  const CACHE_TTL=45*1000;
  const state={open:false,invites:null,inviteCache:new Map(),lastContext:null,lastList:[],lastReport:'',lastMessage:'',history:[],booted:false,loading:false};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt=v=>String(v??'').trim();
  const fmtPct=(num,den)=>den?Math.round((num/den)*100):0;
  const fmtDate=v=>{ if(!v) return '-'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('pt-PT',{day:'2-digit',month:'short',year:'numeric'}); };
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s&+-]/g,' ').replace(/\s+/g,' ').trim();
  const statusNorm=g=>norm(g.status||g.guestStatus||'');
  const apiBase=()=>String(window.LIRANDZO_MANAGER_API_BASE||localStorage.getItem('lirandzo_manager_api')||'').replace(/\/+$/,'');
  const token=()=>sessionStorage.getItem('lirandzo_manager_token')||'';
  async function api(path,options={}){
    const base=apiBase(); if(!base) throw new Error('API do AdminManager não configurada.');
    const res=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{}) ,...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||`Erro ${res.status}`);
    return data;
  }
  function selectedInviteId(){
    const ids=['commandInviteSelect','manageInviteSelect','guestInviteSelect','guestCrudInviteSelect'];
    for(const id of ids){const el=$(id); if(el&&el.value) return el.value;}
    const rows=document.querySelector('[data-invite-id]'); if(rows) return rows.getAttribute('data-invite-id');
    return '';
  }
  async function getInvites(force=false){
    if(!force&&state.invites&&Date.now()-state.invites.time<CACHE_TTL) return state.invites.data;
    const out=await api('/manager/invites'); const data=out.data||[]; state.invites={time:Date.now(),data}; return data;
  }
  async function getContext(force=false){
    if(!token()) throw new Error('Entre primeiro no AdminManager. Depois o operador fica disponível.');
    const invites=await getInvites(force);
    let id=selectedInviteId() || (invites[0]?.id||'');
    if(!id) return {invite:null,details:{guests:[],rsvps:[],messages:[],gifts:[],contributions:[]},analysis:null};
    const cached=state.inviteCache.get(id);
    if(!force&&cached&&Date.now()-cached.time<CACHE_TTL) return cached.ctx;
    const out=await api(`/manager/invites/${encodeURIComponent(id)}`);
    const d=out.data||{};
    const ctx={invite:d.invite||invites.find(x=>String(x.id)===String(id))||null,details:{guests:d.guests||[],rsvps:d.rsvps||[],messages:d.messages||[],gifts:d.gifts||[],contributions:d.contributions||[]}};
    ctx.analysis=analyse(ctx);
    state.lastContext=ctx;
    state.inviteCache.set(id,{time:Date.now(),ctx});
    return ctx;
  }
  function isConfirmed(g,rsvpIds){return rsvpIds.has(String(g.id||g._id||g.guestId||''))||statusNorm(g).includes('confirm');}
  function isNotOpened(g){const s=statusNorm(g);return !s||s.includes('nao aberto')||s.includes('não aberto')||s==='novo';}
  function isOpened(g){const s=statusNorm(g);return !isNotOpened(g)&&(s.includes('aberto')||s.includes('open')||s.includes('visualizado')||s.includes('lido'));}
  function guestKey(g){return String(g.id||g._id||g.guestId||'');}
  function displayTable(g){return txt(g.table||g.mesa||'')||'A definir';}
  function hasToken(g){return Boolean(txt(g.inviteToken||g.token||''));}
  function isTableMissing(g){const t=norm(g.table||g.mesa||''); return !t||['a definir','definir','sem mesa','mesa'].includes(t);}
  function nameBase(name){return norm(name).replace(/\b(sr|sra|senhor|senhora|dr|dra|dona|dom|familia|família|esposa|esposo|mulher|marido|conjuge|cônjuge|e|and|de|da|do|dos|das)\b/g,' ').replace(/[&+]+/g,' ').replace(/\s+/g,' ').trim();}
  function levenshtein(a,b){a=String(a||'');b=String(b||'');if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;const v0=Array(b.length+1).fill(0),v1=Array(b.length+1).fill(0);for(let i=0;i<=b.length;i++)v0[i]=i;for(let i=0;i<a.length;i++){v1[0]=i+1;for(let j=0;j<b.length;j++){const cost=a[i]===b[j]?0:1;v1[j+1]=Math.min(v1[j]+1,v0[j+1]+1,v0[j]+cost);}for(let j=0;j<=b.length;j++)v0[j]=v1[j];}return v1[b.length];}
  function findDuplicateClusters(guests){
    const buckets=new Map();
    guests.forEach(g=>{const key=nameBase(g.name||g.nome); if(!key)return; if(!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(g);});
    const clusters=[...buckets.values()].filter(v=>v.length>1).map(items=>({type:'Igual/normalizado',items}));
    const used=new Set(clusters.flatMap(c=>c.items.map(guestKey)));
    const bases=guests.map(g=>({g,key:nameBase(g.name||g.nome)})).filter(x=>x.key.length>=4);
    for(let i=0;i<bases.length;i++){
      for(let j=i+1;j<bases.length;j++){
        const a=bases[i],b=bases[j]; if(used.has(guestKey(a.g))&&used.has(guestKey(b.g))) continue;
        const len=Math.max(a.key.length,b.key.length); if(len>28) continue;
        const dist=levenshtein(a.key,b.key); const contains=a.key.includes(b.key)||b.key.includes(a.key);
        if((dist<=2&&len>=5)||(contains&&Math.min(a.key.length,b.key.length)>=5)){
          clusters.push({type:'Parecido',items:[a.g,b.g]}); used.add(guestKey(a.g)); used.add(guestKey(b.g));
        }
      }
    }
    return clusters.slice(0,35);
  }
  function findBadNames(guests){
    return guests.map(g=>{const n=txt(g.name||g.nome); const issues=[]; if(n.length<3) issues.push('nome muito curto'); if(/\d/.test(n)) issues.push('contém números'); if(/[\/|_]{1,}/.test(n)) issues.push('separador estranho'); if(/\s{2,}/.test(n)) issues.push('espaços duplicados'); if(n&&n===n.toUpperCase()&&/[A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]/.test(n)&&n.length>8) issues.push('todo em maiúsculas'); if(/\b(test|teste|demo|exemplo)\b/i.test(n)) issues.push('parece registo de teste'); if(/^fam\.?\s/i.test(n)) issues.push('abreviação de família'); return {guest:g,issues};}).filter(x=>x.issues.length).slice(0,60);
  }
  function analyse(ctx){
    const invite=ctx.invite||{}; const d=ctx.details||{}; const guests=d.guests||[], rsvps=d.rsvps||[], messages=d.messages||[], gifts=d.gifts||[], contributions=d.contributions||[];
    const rsvpIds=new Set(rsvps.map(r=>String(r.guestId||r.guest?._id||r.id||'')).filter(Boolean));
    const confirmed=guests.filter(g=>isConfirmed(g,rsvpIds));
    const notOpened=guests.filter(g=>!isConfirmed(g,rsvpIds)&&isNotOpened(g));
    const openedNoConfirm=guests.filter(g=>!isConfirmed(g,rsvpIds)&&isOpened(g));
    const pending=guests.filter(g=>!isConfirmed(g,rsvpIds));
    const checkedIn=guests.filter(g=>g.checkedIn);
    const missingTokens=guests.filter(g=>!hasToken(g));
    const missingTables=confirmed.filter(g=>isTableMissing(g));
    const missingPhones=guests.filter(g=>!txt(g.phone));
    const duplicated=findDuplicateClusters(guests);
    const badNames=findBadNames(guests);
    const reservedGifts=gifts.filter(g=>g.reserved);
    const totalPeople=confirmed.reduce((sum,g)=>sum+(Number(g.maxGuests||g.maxGuestsTotal||g.guests||1)||1),0);
    const crit=[]; const warn=[]; const ok=[];
    if(!invite.publicUrl) crit.push('Convite sem URL pública.'); else ok.push('URL pública configurada.');
    if(invite.status!=='published') warn.push('Convite ainda não está publicado.'); else ok.push('Convite publicado.');
    if(missingTokens.length) crit.push(`${missingTokens.length} convidado(s) sem token individual.`);
    if(duplicated.length) warn.push(`${duplicated.length} grupo(s) de possíveis duplicados.`);
    if(missingTables.length) warn.push(`${missingTables.length} confirmado(s) sem mesa definida.`);
    if(notOpened.length) warn.push(`${notOpened.length} convidado(s) ainda não abriram.`);
    if(openedNoConfirm.length) warn.push(`${openedNoConfirm.length} abriram, mas ainda não confirmaram.`);
    if(!guests.length) crit.push('Ainda não existem convidados neste convite.');
    let score=100; score-=crit.length*13; score-=Math.min(30,duplicated.length*4); score-=Math.min(20,missingTables.length*2); score-=Math.min(16,missingTokens.length*5); if(guests.length){score-=Math.min(18,Math.round((pending.length/guests.length)*16));} if(invite.status!=='published') score-=7; score=Math.max(0,Math.min(100,score));
    return {guests,rsvps,messages,gifts,contributions,confirmed,notOpened,openedNoConfirm,pending,checkedIn,missingTokens,missingTables,missingPhones,duplicated,badNames,reservedGifts,totalPeople,score,crit,warn,ok,rsvpRate:fmtPct(confirmed.length,guests.length),openRate:fmtPct(guests.length-notOpened.length,guests.length),checkinRate:fmtPct(checkedIn.length,confirmed.length)};
  }
  function shortInvite(ctx){const i=ctx.invite||{}; return i.coupleNames||i.clientName||i.slug||'convite seleccionado';}
  function iconSvg(name){const icons={bot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="16" height="12" rx="3"></rect><path d="M12 3v4"></path><path d="M8 12h.01M16 12h.01"></path><path d="M9 16h6"></path></svg>',send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>'};return icons[name]||icons.bot;}
  function create(){
    if($('lzOperator')) return;
    const wrap=document.createElement('div'); wrap.className='lz-operator'; wrap.id='lzOperator'; wrap.innerHTML=`
      <button class="lz-operator-toggle" id="lzOperatorToggle" type="button" aria-label="Abrir operador Lirandzo"><span class="lz-operator-pulse"></span>${iconSvg('bot')}</button>
      <div class="lz-operator-window" id="lzOperatorWindow" role="dialog" aria-label="Lirandzo Operator">
        <div class="lz-operator-head"><div class="lz-operator-brand"><div class="lz-operator-avatar">L</div><div class="lz-operator-title"><strong>Lirandzo Operator</strong><span id="lzOperatorStatus">Bot determinístico · sem API paga</span></div></div><button class="lz-operator-close" id="lzOperatorClose" type="button" aria-label="Fechar">×</button></div>
        <div class="lz-operator-brainbar"><i></i><span>Brain: RSVP · Convidados · Estado · Duplicados · Mensagens · Relatórios · Acções</span></div>
        <div class="lz-operator-messages" id="lzOperatorMessages"></div>
        <div class="lz-operator-quick" id="lzOperatorQuick"></div>
        <form class="lz-operator-form" id="lzOperatorForm"><input id="lzOperatorInput" type="text" placeholder="Pergunte: diagnosticar, pendentes, duplicados, mensagem..." autocomplete="off"><button class="lz-operator-send" type="submit">${iconSvg('send')}</button></form>
      </div>`;
    document.body.appendChild(wrap);
    bind();
    state.booted=true;
    restore();
    renderQuick();
    updateVisibility();
  }
  function bind(){
    $('lzOperatorToggle').addEventListener('click',()=>toggle(true));
    $('lzOperatorClose').addEventListener('click',()=>toggle(false));
    $('lzOperatorForm').addEventListener('submit',e=>{e.preventDefault(); const input=$('lzOperatorInput'); const msg=txt(input.value); if(!msg)return; input.value=''; handle(msg);});
    $('lzOperatorQuick').addEventListener('click',e=>{const b=e.target.closest('[data-op-chip]'); if(b) handle(b.dataset.opChip);});
    $('lzOperatorMessages').addEventListener('click',e=>{const b=e.target.closest('[data-op-action]'); if(b) runAction(b.dataset.opAction,b.dataset.opPayload||'');});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)toggle(false);});
    ['commandInviteSelect','manageInviteSelect','guestInviteSelect','guestCrudInviteSelect'].forEach(id=>$(id)?.addEventListener('change',()=>{state.inviteCache.clear(); updateStatusLabel();}));
    const obs=new MutationObserver(updateVisibility); const app=$('app'); if(app) obs.observe(app,{attributes:true,attributeFilter:['class']});
  }
  function updateVisibility(){const el=$('lzOperator'); if(!el)return; el.classList.toggle('ready',Boolean($('app')?.classList.contains('active')&&token()));}
  async function updateStatusLabel(){try{const ctx=await getContext(false); $('lzOperatorStatus').textContent=ctx.invite?`${shortInvite(ctx)} · saúde ${ctx.analysis.score}%`:'Seleccione um convite';}catch{$('lzOperatorStatus').textContent='Bot determinístico · sem API paga';}}
  function toggle(open){state.open=Boolean(open); $('lzOperator')?.classList.toggle('open',state.open); if(state.open){updateStatusLabel(); if(!state.history.length){bot(`<strong>Estou pronto.</strong><br>Escolhe um convite e posso diagnosticar, listar pendentes, detectar duplicados, gerar mensagens e preparar relatórios — tudo com regras internas, sem modelos externos.`);}}}
  function renderQuick(){const chips=['Diagnosticar','Pendentes','Não abriram','Abriram sem confirmar','Duplicados','Mensagem WhatsApp','Relatório','Ajuda']; $('lzOperatorQuick').innerHTML=chips.map(c=>`<button type="button" data-op-chip="${esc(c)}">${esc(c)}</button>`).join('');}
  function restore(){try{state.history=JSON.parse(localStorage.getItem(LS_KEY)||'[]').slice(-12); state.history.forEach(m=>addMsg(m.html,m.user,false));}catch{state.history=[];}}
  function persist(html,user){state.history.push({html,user}); state.history=state.history.slice(-20); localStorage.setItem(LS_KEY,JSON.stringify(state.history));}
  function addMsg(html,user=false,save=true){const box=$('lzOperatorMessages'); if(!box)return; const div=document.createElement('div'); div.className=`lz-op-msg ${user?'user':'bot'}`; div.innerHTML=html; box.appendChild(div); box.scrollTop=box.scrollHeight; if(save)persist(html,user);}
  function user(html){addMsg(esc(html),true);} function bot(html){addMsg(html,false);} function typing(on=true){const box=$('lzOperatorMessages'); if(!box)return; let el=$('lzOpTyping'); if(on){if(el)return; el=document.createElement('div');el.id='lzOpTyping';el.className='lz-operator-typing';el.innerHTML='<span></span><span></span><span></span>';box.appendChild(el);box.scrollTop=box.scrollHeight;}else el?.remove();}
  async function handle(message){user(message); typing(true); try{await new Promise(r=>setTimeout(r,180+Math.random()*180)); const ctx=await getContext(false); const reply=await route(message,ctx); typing(false); bot(reply);}catch(err){typing(false); bot(`<strong>Não consegui executar.</strong><br>${esc(err.message||err)}<div class="lz-op-actions"><button class="lz-op-action" data-op-action="refresh">Tentar novamente</button></div>`);} }
  async function route(message,ctx){
    const m=norm(message); if(!ctx.invite) return `Ainda não há convite seleccionado. Carregue os convites primeiro ou seleccione um convite no painel.`;
    if(/^(ajuda|help|comandos|o que podes)/.test(m)) return help();
    if(/diagnost|saude|saúde|analisa|analisar|problemas|erro|estranho|auditoria|checklist/.test(m)) return viewDiagnose(ctx);
    if(/abriu.*nao|abriu.*não|sem confirmar|abriram/.test(m)) return viewList(ctx,'openedNoConfirm');
    if(/nao abrir|não abrir|nao aberto|não aberto|por abrir|nunca abriu/.test(m)) return viewList(ctx,'notOpened');
    if(/pendente|pendentes|por confirmar|falta confirmar|ainda nao confirm|ainda não confirm/.test(m)) return viewList(ctx,'pending');
    if(/confirmad|confirmaram|rsvp/.test(m)) return viewList(ctx,'confirmed');
    if(/check.?in|entrada|presentes no evento|ja entrou|já entrou/.test(m)) return viewList(ctx,'checkedIn');
    if(/duplicad|repetid|nomes iguais|mesma pessoa/.test(m)) return viewDuplicates(ctx);
    if(/nome.*err|limpar|corrigir nomes|nomes estranhos|bad names|reparar nomes/.test(m)) return viewBadNames(ctx);
    if(/token|acesso individual|link individual/.test(m)) return viewList(ctx,'missingTokens');
    if(/mesa|seating|lugares|sem mesa/.test(m)) return viewList(ctx,'missingTables');
    if(/telefone|contacto|contato|sem contacto|sem telefone/.test(m)) return viewList(ctx,'missingPhones');
    if(/whats|mensagem|lembrete|enviar|copy|copiar texto/.test(m)) return generateMessage(ctx,m);
    if(/relatorio|relatório|report|resumo executivo|cliente/.test(m)) return generateReport(ctx);
    if(/estat|numero|número|quantos|indicadores|kpi/.test(m)) return viewStats(ctx);
    const guestSearch=message.match(/(?:procura|procurar|buscar|pesquisar|encontra|encontrar)\s+(.+)/i); if(guestSearch) return searchGuest(ctx,guestSearch[1]);
    return smartFallback(ctx,message);
  }
  function help(){return `<strong>Comandos principais</strong><br>Posso operar por regras internas, sem API paga:<ul><li><b>Diagnosticar</b> — saúde do convite e problemas.</li><li><b>Pendentes</b>, <b>Não abriram</b>, <b>Abriram sem confirmar</b>.</li><li><b>Duplicados</b> e <b>nomes estranhos</b>.</li><li><b>Mensagem WhatsApp</b> para lembretes.</li><li><b>Relatório</b> executivo para cliente.</li><li><b>Procura Ana</b> — pesquisar convidado por nome.</li></ul><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="ask" data-op-payload="Diagnosticar">Diagnosticar agora</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Relatório">Gerar relatório</button></div>`;}
  function scoreClass(score){return score>=80?'ok':score>=58?'warn':'bad';}
  function viewDiagnose(ctx){const a=ctx.analysis,i=ctx.invite; const priorities=[...a.crit.map(x=>['Crítico',x]),...a.warn.slice(0,5).map(x=>['Atenção',x])]; const status=a.score>=80?'saudável':a.score>=58?'com pontos por alinhar':'precisa de intervenção'; return `<span class="lz-op-score ${scoreClass(a.score)}">${a.score}%</span><strong>Diagnóstico de ${esc(shortInvite(ctx))}</strong><br>Estado geral: <b>${status}</b>.<div class="metric-row"><span>Convidados</span><b>${a.guests.length}</b></div><div class="metric-row"><span>Confirmados</span><b>${a.confirmed.length} · ${a.rsvpRate}%</b></div><div class="metric-row"><span>Não abriram</span><b>${a.notOpened.length}</b></div><div class="metric-row"><span>Abriram sem confirmar</span><b>${a.openedNoConfirm.length}</b></div><div class="metric-row"><span>Pessoas previstas</span><b>${a.totalPeople}</b></div><div class="lz-op-cards">${priorities.length?priorities.map(([t,d])=>`<div class="lz-op-card"><strong>${esc(t)}</strong><span>${esc(d)}</span></div>`).join(''):'<div class="lz-op-card"><strong>Sem alertas graves</strong><span>Os principais indicadores parecem alinhados.</span></div>'}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="ask" data-op-payload="Mensagem WhatsApp">Gerar lembrete</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Duplicados">Ver duplicados</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Relatório">Relatório</button><button class="lz-op-action" data-op-action="refresh">Recarregar</button></div>`;}
  function listMap(ctx,type){const a=ctx.analysis; const map={pending:['Pendentes',a.pending,'Convidados que ainda não estão confirmados.'],notOpened:['Não abriram',a.notOpened,'Convidados sem abertura registada.'],openedNoConfirm:['Abriram sem confirmar',a.openedNoConfirm,'Prioridade alta para lembrete curto.'],confirmed:['Confirmados',a.confirmed,'Convidados com RSVP/estado confirmado.'],checkedIn:['Check-in feito',a.checkedIn,'Convidados que já entraram no evento.'],missingTokens:['Sem token',a.missingTokens,'Precisam de reset/reparação de acesso.'],missingTables:['Confirmados sem mesa',a.missingTables,'Devem ser distribuídos antes da recepção.'],missingPhones:['Sem contacto',a.missingPhones,'Sem telefone registado.']};return map[type]||map.pending;}
  function viewList(ctx,type){const [title,list,desc]=listMap(ctx,type); state.lastList=list; const rows=list.slice(0,14).map(g=>`<div class="lz-op-list-row"><div><strong>${esc(g.name||g.nome)}</strong><small>${esc(displayTable(g))} · ${esc(g.status||'sem estado')} · ${Number(g.maxGuests||g.maxGuestsTotal||1)||1} pessoa(s)</small></div><small>#${esc(g.number||'')}</small></div>`).join(''); return `<strong>${esc(title)}</strong><br>${esc(desc)}<div class="metric-row"><span>Total encontrado</span><b>${list.length}</b></div>${list.length?`<div class="lz-op-list">${rows}${list.length>14?`<div class="lz-op-card"><span>+ ${list.length-14} registo(s) não exibidos nesta prévia.</span></div>`:''}</div>`:'<div class="lz-op-card"><strong>Lista vazia</strong><span>Nenhum registo encontrado nesta categoria.</span></div>'}<div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar lista</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button>${type==='pending'||type==='notOpened'||type==='openedNoConfirm'?'<button class="lz-op-action" data-op-action="ask" data-op-payload="Mensagem WhatsApp">Gerar lembrete</button>':''}</div>`;}
  function viewDuplicates(ctx){const dup=ctx.analysis.duplicated; if(!dup.length) return `<strong>Duplicados</strong><br>Não encontrei duplicados fortes com as regras actuais.<div class="lz-op-actions"><button class="lz-op-action" data-op-action="ask" data-op-payload="Nomes estranhos">Ver nomes estranhos</button></div>`; const cards=dup.slice(0,10).map((c,i)=>`<div class="lz-op-card"><strong>${i+1}. ${esc(c.type)}</strong><span>${c.items.map(g=>esc(g.name||g.nome)).join(' · ')}</span></div>`).join(''); return `<strong>Possíveis duplicados</strong><br>Encontrei <b>${dup.length}</b> grupo(s). Não apliquei nada automaticamente.<div class="lz-op-cards">${cards}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-duplicates">Copiar duplicados</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button></div>`;}
  function viewBadNames(ctx){const bad=ctx.analysis.badNames; if(!bad.length) return `<strong>Limpeza de nomes</strong><br>Não encontrei nomes problemáticos com as regras actuais.`; const rows=bad.slice(0,12).map(x=>`<div class="lz-op-list-row"><div><strong>${esc(x.guest.name||x.guest.nome)}</strong><small>${esc(x.issues.join(', '))}</small></div></div>`).join(''); return `<strong>Nomes a rever</strong><br>Encontrei <b>${bad.length}</b> nome(s) com sinais de inconsistência.<div class="lz-op-list">${rows}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-badnames">Copiar revisão</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button></div>`;}
  function generateMessage(ctx,m){const a=ctx.analysis; let target='pendentes', list=a.pending; if(/nao abrir|não abrir|nao aberto|não aberto/.test(m)){target='não abertos';list=a.notOpened;} if(/abriu|abriram|sem confirmar/.test(m)){target='abriram sem confirmar';list=a.openedNoConfirm;} const deadline=ctx.invite?.rsvpDeadline?fmtDate(ctx.invite.rsvpDeadline):'a data indicada'; const link=ctx.invite?.publicUrl||'[link do convite]'; const couple=shortInvite(ctx); const text=`Olá, [Nome]. Esperamos que esteja bem.\n\nPassamos para lembrar com carinho sobre a confirmação de presença no casamento de ${couple}.\n\nPor favor, aceda ao convite e confirme a sua presença até ${deadline}:\n${link}\n\nCom carinho,\nEquipa Lirandzo`; state.lastMessage=text; return `<strong>Mensagem WhatsApp pronta</strong><br>Segmento sugerido: <b>${esc(target)}</b> · ${list.length} convidado(s).<div class="lz-op-card"><span>${esc(text).replace(/\n/g,'<br>')}</span></div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-message">Copiar mensagem</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Pendentes">Ver pendentes</button></div>`;}
  function generateReport(ctx){const a=ctx.analysis,i=ctx.invite||{}; const report=`RELATÓRIO EXECUTIVO — ${shortInvite(ctx)}\n\nEstado do convite: ${i.status||'-'}\nPacote: ${i.packageLabel||i.packageKey||'-'}\nData do evento: ${fmtDate(i.eventDateISO)}\nPrazo RSVP: ${fmtDate(i.rsvpDeadline)}\n\nINDICADORES\n- Total de convidados: ${a.guests.length}\n- Confirmados: ${a.confirmed.length} (${a.rsvpRate}%)\n- Pendentes: ${a.pending.length}\n- Não abriram: ${a.notOpened.length}\n- Abriram sem confirmar: ${a.openedNoConfirm.length}\n- Pessoas previstas pelos confirmados: ${a.totalPeople}\n- Check-in feito: ${a.checkedIn.length}\n- Mensagens recebidas: ${a.messages.length}\n- Contribuições: ${a.contributions.length}\n- Presentes reservados: ${a.reservedGifts.length}/${a.gifts.length}\n\nDIAGNÓSTICO\nSaúde operacional: ${a.score}%\n${[...a.crit,...a.warn].length?[...a.crit,...a.warn].map(x=>'- '+x).join('\n'):'- Sem alertas críticos detectados.'}\n\nRECOMENDAÇÕES\n1. Enviar lembrete aos convidados pendentes.\n2. Priorizar quem abriu e ainda não confirmou.\n3. Rever possíveis duplicados antes da lista final.\n4. Definir mesa para confirmados sem mesa.\n5. Exportar lista final antes do evento.`; state.lastReport=report; return `<strong>Relatório executivo gerado</strong><br>Preparei um resumo pronto para enviar ao cliente ou guardar internamente.<div class="lz-op-card"><span>${esc(report).replace(/\n/g,'<br>')}</span></div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-report">Copiar relatório</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Mensagem WhatsApp">Gerar lembrete</button></div>`;}
  function viewStats(ctx){const a=ctx.analysis;return `<strong>Indicadores do convite</strong><div class="metric-row"><span>Total convidados</span><b>${a.guests.length}</b></div><div class="metric-row"><span>Confirmados</span><b>${a.confirmed.length} (${a.rsvpRate}%)</b></div><div class="metric-row"><span>Pendentes</span><b>${a.pending.length}</b></div><div class="metric-row"><span>Abertura</span><b>${a.openRate}%</b></div><div class="metric-row"><span>Pessoas previstas</span><b>${a.totalPeople}</b></div><div class="metric-row"><span>Check-in</span><b>${a.checkedIn.length} (${a.checkinRate}%)</b></div><div class="metric-row"><span>Mensagens</span><b>${a.messages.length}</b></div><div class="metric-row"><span>Contribuições</span><b>${a.contributions.length}</b></div>`;}
  function searchGuest(ctx,q){const needle=norm(q); const found=ctx.analysis.guests.filter(g=>norm(g.name||g.nome).includes(needle)||norm(g.phone).includes(needle)||norm(g.table||g.mesa).includes(needle)).slice(0,15); if(!found.length)return `<strong>Pesquisa</strong><br>Não encontrei convidados para: <b>${esc(q)}</b>.`; state.lastList=found; return `<strong>Pesquisa de convidado</strong><br>Resultado para: <b>${esc(q)}</b><div class="lz-op-list">${found.map(g=>`<div class="lz-op-list-row"><div><strong>${esc(g.name||g.nome)}</strong><small>${esc(displayTable(g))} · ${esc(g.status||'sem estado')} · ${esc(g.phone||'sem contacto')}</small></div></div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar resultado</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button></div>`;}
  function smartFallback(ctx,message){const a=ctx.analysis; return `<strong>Entendi a intenção geral, mas preciso de um comando mais directo.</strong><br>Para este convite, vejo ${a.pending.length} pendentes, ${a.notOpened.length} não abertos e ${a.duplicated.length} possíveis duplicados.<br><br>Experimente: <b>diagnosticar</b>, <b>pendentes</b>, <b>duplicados</b>, <b>mensagem WhatsApp</b> ou <b>relatório</b>.<div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="ask" data-op-payload="Diagnosticar">Diagnosticar</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Ajuda">Ajuda</button></div>`;}
  async function copy(text){try{await navigator.clipboard.writeText(text); return true;}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return true;}}
  function listToText(list){return list.map((g,i)=>`${i+1}. ${g.name||g.nome} | Mesa: ${displayTable(g)} | Estado: ${g.status||'-'} | Pessoas: ${Number(g.maxGuests||g.maxGuestsTotal||1)||1} | Contacto: ${g.phone||'-'}`).join('\n');}
  async function runAction(action,payload){
    if(action==='ask') return handle(payload);
    if(action==='refresh'){state.inviteCache.clear();state.invites=null;return handle('Diagnosticar');}
    if(action==='go-guests'){if(window.showPanel) window.showPanel('guests'); else document.querySelector('[data-panel="guests"]')?.click(); return;}
    if(action==='copy-list'){await copy(listToText(state.lastList||[])); bot('Lista copiada para a área de transferência.'); return;}
    if(action==='copy-message'){await copy(state.lastMessage||''); bot('Mensagem copiada.'); return;}
    if(action==='copy-report'){await copy(state.lastReport||''); bot('Relatório copiado.'); return;}
    if(action==='copy-duplicates'){const ctx=state.lastContext||await getContext(false); const text=ctx.analysis.duplicated.map((c,i)=>`${i+1}. ${c.type}: ${c.items.map(g=>g.name||g.nome).join(' / ')}`).join('\n'); await copy(text); bot('Duplicados copiados.'); return;}
    if(action==='copy-badnames'){const ctx=state.lastContext||await getContext(false); const text=ctx.analysis.badNames.map((x,i)=>`${i+1}. ${x.guest.name||x.guest.nome}: ${x.issues.join(', ')}`).join('\n'); await copy(text); bot('Revisão de nomes copiada.'); return;}
  }
  function init(){create(); setInterval(updateVisibility,1200); setTimeout(updateStatusLabel,800);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
