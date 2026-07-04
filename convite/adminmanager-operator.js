(function(){
  'use strict';
  const BOT_VERSION='OMNI-Deterministic-v6.0-SafeActionsBrain';
  const LS_KEY='lirandzo_operator_history_v6';
  const SCOPE_KEY='lirandzo_operator_scope_v6';
  const CACHE_TTL=45*1000;
  const MAX_PREVIEW=18;
  const state={open:false,invites:null,inviteCache:new Map(),lastContext:null,lastList:[],lastReport:'',lastMessage:'',lastCsv:'',lastSegments:null,history:[],booted:false,loading:false,pendingAction:null,scopeId:localStorage.getItem(SCOPE_KEY)||'__all__',dialog:{inviteId:'',inviteTitle:'',intent:null,criteria:null,action:null,lastQuestion:'',lastListLabel:''}};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt=v=>String(v??'').trim();
  const fmtPct=(num,den)=>den?Math.round((Number(num||0)/Number(den||1))*100):0;
  const fmtMoney=v=>{const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('pt-PT'):'0';};
  const fmtDate=v=>{ if(!v) return '-'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('pt-PT',{day:'2-digit',month:'short',year:'numeric'}); };
  const fmtDateTime=v=>{ if(!v) return '-'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-PT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s&+\-@.]/g,' ').replace(/\s+/g,' ').trim();
  const cap=v=>txt(v).replace(/\w\S*/g,w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase());
  const apiBase=()=>String(window.LIRANDZO_MANAGER_API_BASE||localStorage.getItem('lirandzo_manager_api')||'').replace(/\/+$/,'');
  const token=()=>sessionStorage.getItem('lirandzo_manager_token')||'';
  const currentRole=()=>sessionStorage.getItem('lirandzo_manager_role')||'admin';
  const isEditorRole=()=>currentRole()==='editor';
  const roleLabel=()=>isEditorRole()?'Editor':'Administrador';
  const roleBadgeClass=()=>isEditorRole()?'editor':'admin';
  async function api(path,options={}){
    const base=apiBase(); if(!base) throw new Error('API do AdminManager não configurada.');
    const res=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{}) ,...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||`Erro ${res.status}`);
    return data;
  }
  function getScopeValue(){
    const el=$('lzOperatorScopeSelect');
    return el ? (el.value||'__all__') : (state.scopeId||localStorage.getItem(SCOPE_KEY)||'__all__');
  }
  function setScopeValue(value){
    state.scopeId=value||'__all__';
    localStorage.setItem(SCOPE_KEY,state.scopeId);
    const el=$('lzOperatorScopeSelect'); if(el&&el.value!==state.scopeId) el.value=state.scopeId;
  }
  function selectedInviteId(){
    const scope=getScopeValue();
    if(scope&&scope!=='__all__'&&scope!=='__current__') return scope;
    if(scope==='__all__') return '';
    const ids=['commandInviteSelect','manageInviteSelect','guestInviteSelect','guestCrudInviteSelect'];
    for(const id of ids){const el=$(id); if(el&&el.value) return el.value;}
    const rows=document.querySelector('[data-invite-id]'); if(rows) return rows.getAttribute('data-invite-id');
    return '';
  }
  function inviteTitle(inv){return inv?.coupleNames||inv?.clientName||inv?.name||inv?.slug||'Convite';}
  function inviteIdOf(ctx){return String(ctx?.invite?.id||ctx?.invite?._id||ctx?.invite?.slug||'');}
  function isMultiScope(message=''){
    const m=norm(message);
    return getScopeValue()==='__all__'||/\b(todos|todas|geral|global|multi|por convite|separado|separar por convite|cada convite)\b/.test(m);
  }
  async function getInvites(force=false){
    if(!force&&state.invites&&Date.now()-state.invites.time<CACHE_TTL) return state.invites.data;
    const out=await api('/manager/invites'); const data=out.data||[]; state.invites={time:Date.now(),data}; return data;
  }
  async function getContext(force=false,explicitId=''){
    if(!token()) throw new Error('Entre primeiro no AdminManager. Depois o operador fica disponível.');
    const invites=await getInvites(force);
    let id=explicitId || selectedInviteId() || (invites[0]?.id||'');
    if(!id) return {invite:null,details:{guests:[],rsvps:[],messages:[],gifts:[],contributions:[]},analysis:null};
    const cached=state.inviteCache.get(String(id));
    if(!force&&cached&&Date.now()-cached.time<CACHE_TTL) return cached.ctx;
    const out=await api(`/manager/invites/${encodeURIComponent(id)}`);
    const d=out.data||{};
    const ctx={invite:d.invite||invites.find(x=>String(x.id)===String(id))||null,details:{guests:d.guests||[],rsvps:d.rsvps||[],messages:d.messages||[],gifts:d.gifts||[],contributions:d.contributions||[]}};
    ctx.analysis=analyse(ctx);
    state.lastContext=ctx;
    state.inviteCache.set(String(id),{time:Date.now(),ctx});
    return ctx;
  }
  async function getAllContexts(max=18){
    const invites=await getInvites(false);
    const list=[];
    for(const inv of invites.slice(0,max)){
      try{ list.push(await getContext(false,inv.id)); }catch(err){ list.push({invite:inv,error:err.message,details:{guests:[]},analysis:null}); }
    }
    return list;
  }
  function statusNorm(g){return norm(g.status||g.guestStatus||g.rsvpStatus||'');}
  function guestKey(g){return String(g.id||g._id||g.guestId||g.inviteToken||g.token||g.name||g.nome||'');}
  function getName(g){return txt(g.name||g.nome||g.fullName||'');}
  function getPhone(g){return txt(g.phone||g.telefone||g.contact||g.contacto||g.whatsapp||'');}
  function getNumber(g){return txt(g.number||g.numero||g.n||g.order||'');}
  function getCategory(g){return txt(g.category||g.categoria||g.group||g.grupo||g.type||g.tipo||'Sem categoria');}
  function getNotes(g){return txt(g.notes||g.notas||g.observations||g.observacoes||'');}
  function displayTable(g){return txt(g.table||g.mesa||'')||'A definir';}
  function peopleCount(g){
    const candidates=[g.people,g.pessoas,g.totalGuests,g.totalPessoas,g.maxGuestsTotal,g.maxGuests,g.guests,g.acompanhantes,g.companions];
    for(const v of candidates){const n=Number(v); if(Number.isFinite(n)&&n>0) return n;}
    return 1;
  }
  function dateOf(g,...keys){for(const k of keys){if(g&&g[k])return g[k];}return '';} 
  function hasToken(g){return Boolean(txt(g.inviteToken||g.token||g.publicToken||''));}
  function isTableMissing(g){const t=norm(g.table||g.mesa||''); return !t||['a definir','definir','sem mesa','mesa','n a','na'].includes(t);}
  function isDeclined(g){const s=statusNorm(g); return /recus|declin|nao vai|não vai|ausente|cancel/.test(s);}
  function isConfirmed(g,rsvpIds){return !isDeclined(g)&&(rsvpIds.has(String(g.id||g._id||g.guestId||''))||/confirm|presenca confirmada|presença confirmada/.test(statusNorm(g)));}
  function isNotOpened(g){const s=statusNorm(g);return !s||s.includes('nao aberto')||s.includes('não aberto')||s==='novo'||s==='pendente';}
  function isOpened(g){const s=statusNorm(g);return !isNotOpened(g)&&!/confirm|recus/.test(s)&&(s.includes('aberto')||s.includes('open')||s.includes('visualizado')||s.includes('lido')) ;}
  function isVip(g){return /\b(vip|padrinho|madrinha|pais|familia directa|família directa|mesa principal|honra)\b/.test(norm(`${getCategory(g)} ${getNotes(g)} ${displayTable(g)}`));}
  function nameBase(name){return norm(name).replace(/\b(sr|sra|senhor|senhora|dr|dra|dona|dom|familia|família|esposa|esposo|mulher|marido|conjuge|cônjuge|e|and|de|da|do|dos|das|com|mais)\b/g,' ').replace(/[&+\-]+/g,' ').replace(/\s+/g,' ').trim();}
  function familyKey(name){const n=nameBase(name); const parts=n.split(' ').filter(Boolean); if(parts.length>=2) return parts[parts.length-1]; return parts[0]||'';}
  function levenshtein(a,b){a=String(a||'');b=String(b||'');if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;const v0=Array(b.length+1).fill(0),v1=Array(b.length+1).fill(0);for(let i=0;i<=b.length;i++)v0[i]=i;for(let i=0;i<a.length;i++){v1[0]=i+1;for(let j=0;j<b.length;j++){const cost=a[i]===b[j]?0:1;v1[j+1]=Math.min(v1[j]+1,v0[j+1]+1,v0[j]+cost);}for(let j=0;j<=b.length;j++)v0[j]=v1[j];}return v1[b.length];}
  function groupBy(list,fn){const m=new Map();list.forEach(item=>{const k=txt(fn(item))||'Sem definição';if(!m.has(k))m.set(k,[]);m.get(k).push(item);});return m;}
  function sortedEntries(map,by='count'){return [...map.entries()].sort((a,b)=>by==='name'?String(a[0]).localeCompare(String(b[0]),'pt'):(b[1].length-a[1].length)||String(a[0]).localeCompare(String(b[0]),'pt'));}
  function findDuplicateClusters(guests){
    const buckets=new Map();
    guests.forEach(g=>{const key=nameBase(getName(g)); if(!key)return; if(!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(g);});
    const clusters=[...buckets.values()].filter(v=>v.length>1).map(items=>({type:'Igual/normalizado',items}));
    const used=new Set(clusters.flatMap(c=>c.items.map(guestKey)));
    const bases=guests.map(g=>({g,key:nameBase(getName(g))})).filter(x=>x.key.length>=4);
    for(let i=0;i<bases.length;i++){
      for(let j=i+1;j<bases.length;j++){
        const a=bases[i],b=bases[j]; if(used.has(guestKey(a.g))&&used.has(guestKey(b.g))) continue;
        const len=Math.max(a.key.length,b.key.length); if(len>30) continue;
        const dist=levenshtein(a.key,b.key); const contains=a.key.includes(b.key)||b.key.includes(a.key);
        if((dist<=2&&len>=5)||(contains&&Math.min(a.key.length,b.key.length)>=5)){
          clusters.push({type:'Parecido',items:[a.g,b.g]}); used.add(guestKey(a.g)); used.add(guestKey(b.g));
        }
      }
    }
    return clusters.slice(0,50);
  }
  function findBadNames(guests){
    return guests.map(g=>{const n=getName(g); const issues=[]; if(!n) issues.push('nome vazio'); if(n.length>0&&n.length<3) issues.push('nome muito curto'); if(/\d/.test(n)) issues.push('contém números'); if(/[\/|_]{1,}/.test(n)) issues.push('separador estranho'); if(/\s{2,}/.test(n)) issues.push('espaços duplicados'); if(n&&n===n.toUpperCase()&&/[A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]/.test(n)&&n.length>8) issues.push('todo em maiúsculas'); if(/\b(test|teste|demo|exemplo)\b/i.test(n)) issues.push('parece registo de teste'); if(/^fam\.?\s/i.test(n)) issues.push('abreviação de família'); if(/[.,;:]$/.test(n)) issues.push('pontuação no fim do nome'); return {guest:g,issues};}).filter(x=>x.issues.length).slice(0,80);
  }
  function findDuplicateByField(guests,fieldFn){
    const buckets=new Map(); guests.forEach(g=>{const k=norm(fieldFn(g)); if(!k)return; if(!buckets.has(k))buckets.set(k,[]); buckets.get(k).push(g);});
    return [...buckets.entries()].filter(([,items])=>items.length>1).map(([key,items])=>({key,items}));
  }
  function analyse(ctx){
    const invite=ctx.invite||{}; const d=ctx.details||{}; const guests=d.guests||[], rsvps=d.rsvps||[], messages=d.messages||[], gifts=d.gifts||[], contributions=d.contributions||[];
    const rsvpIds=new Set(rsvps.map(r=>String(r.guestId||r.guest?._id||r.guest?.id||r.id||'')).filter(Boolean));
    const confirmed=guests.filter(g=>isConfirmed(g,rsvpIds));
    const declined=guests.filter(g=>isDeclined(g));
    const notOpened=guests.filter(g=>!isConfirmed(g,rsvpIds)&&!isDeclined(g)&&isNotOpened(g));
    const openedNoConfirm=guests.filter(g=>!isConfirmed(g,rsvpIds)&&!isDeclined(g)&&isOpened(g));
    const pending=guests.filter(g=>!isConfirmed(g,rsvpIds)&&!isDeclined(g));
    const opened=guests.filter(g=>!isNotOpened(g));
    const checkedIn=guests.filter(g=>g.checkedIn||/check.?in|entrou|presente/.test(statusNorm(g)));
    const missingTokens=guests.filter(g=>!hasToken(g));
    const missingTables=confirmed.filter(g=>isTableMissing(g));
    const missingPhones=guests.filter(g=>!getPhone(g));
    const vipGuests=guests.filter(isVip);
    const vipPending=vipGuests.filter(g=>pending.includes(g));
    const duplicated=findDuplicateClusters(guests);
    const badNames=findBadNames(guests);
    const duplicatePhones=findDuplicateByField(guests,getPhone);
    const duplicateTokens=findDuplicateByField(guests,g=>g.inviteToken||g.token||'');
    const reservedGifts=gifts.filter(g=>g.reserved||g.status==='reserved');
    const totalPeople=confirmed.reduce((sum,g)=>sum+peopleCount(g),0);
    const totalCapacity=guests.reduce((sum,g)=>sum+peopleCount(g),0);
    const byTable=groupBy(guests,displayTable);
    const byConfirmedTable=groupBy(confirmed,displayTable);
    const byCategory=groupBy(guests,getCategory);
    const byStatus=groupBy(guests,g=>g.status||g.guestStatus||'Sem estado');
    const familyGroups=[...groupBy(guests,g=>familyKey(getName(g))).entries()].filter(([k,v])=>k&&v.length>=2).sort((a,b)=>b[1].length-a[1].length).slice(0,30);
    const orphanRsvps=rsvps.filter(r=>{const gid=String(r.guestId||r.guest?._id||r.guest?.id||'');return gid&&!guests.some(g=>String(g.id||g._id||g.guestId||'')===gid);});
    const recentGuests=guests.map(g=>({g,date:dateOf(g,'confirmedAt','rsvpAt','openedAt','lastOpenedAt','checkedInAt','updatedAt','createdAt')})).filter(x=>x.date).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,14);
    const crit=[]; const warn=[]; const ok=[];
    if(!invite.publicUrl) crit.push('Convite sem URL pública.'); else ok.push('URL pública configurada.');
    if(invite.status!=='published') warn.push('Convite ainda não está publicado.'); else ok.push('Convite publicado.');
    if(missingTokens.length) crit.push(`${missingTokens.length} convidado(s) sem token individual.`);
    if(duplicateTokens.length) crit.push(`${duplicateTokens.length} token(s) repetido(s).`);
    if(duplicated.length) warn.push(`${duplicated.length} grupo(s) de possíveis duplicados.`);
    if(duplicatePhones.length) warn.push(`${duplicatePhones.length} contacto(s) repetido(s).`);
    if(missingTables.length) warn.push(`${missingTables.length} confirmado(s) sem mesa definida.`);
    if(notOpened.length) warn.push(`${notOpened.length} convidado(s) ainda não abriram.`);
    if(openedNoConfirm.length) warn.push(`${openedNoConfirm.length} abriram, mas ainda não confirmaram.`);
    if(vipPending.length) warn.push(`${vipPending.length} convidado(s) VIP ainda pendente(s).`);
    if(orphanRsvps.length) warn.push(`${orphanRsvps.length} RSVP(s) sem convidado correspondente.`);
    if(!guests.length) crit.push('Ainda não existem convidados neste convite.');
    let score=100; score-=crit.length*14; score-=Math.min(28,duplicated.length*4); score-=Math.min(18,missingTables.length*2); score-=Math.min(18,missingTokens.length*5); score-=Math.min(12,duplicatePhones.length*2); if(guests.length){score-=Math.min(18,Math.round((pending.length/guests.length)*16));} if(invite.status!=='published') score-=7; score=Math.max(0,Math.min(100,score));
    return {guests,rsvps,messages,gifts,contributions,confirmed,declined,opened,notOpened,openedNoConfirm,pending,checkedIn,missingTokens,missingTables,missingPhones,vipGuests,vipPending,duplicated,badNames,duplicatePhones,duplicateTokens,reservedGifts,totalPeople,totalCapacity,byTable,byConfirmedTable,byCategory,byStatus,familyGroups,orphanRsvps,recentGuests,score,crit,warn,ok,rsvpRate:fmtPct(confirmed.length,guests.length),openRate:fmtPct(opened.length,guests.length),checkinRate:fmtPct(checkedIn.length,confirmed.length)};
  }
  function shortInvite(ctx){const i=ctx.invite||{}; return i.coupleNames||i.clientName||i.name||i.slug||'convite seleccionado';}
  function iconSvg(name){const icons={bot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="16" height="12" rx="3"></rect><path d="M12 3v4"></path><path d="M8 12h.01M16 12h.01"></path><path d="M9 16h6"></path></svg>',send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>'};return icons[name]||icons.bot;}
  function create(){
    if($('lzOperator')) return;
    const wrap=document.createElement('div'); wrap.className='lz-operator'; wrap.id='lzOperator'; wrap.innerHTML=`
      <button class="lz-operator-toggle" id="lzOperatorToggle" type="button" aria-label="Abrir operador Lirandzo"><span class="lz-operator-pulse"></span>${iconSvg('bot')}</button>
      <div class="lz-operator-window" id="lzOperatorWindow" role="dialog" aria-label="Lirandzo Operator">
        <div class="lz-operator-head"><div class="lz-operator-brand"><div class="lz-operator-avatar">L</div><div class="lz-operator-title"><strong>Lirandzo Operator Ultra</strong><span id="lzOperatorStatus">Brain v6 · acções seguras · sem IA paga</span></div></div><div class="lz-operator-head-actions"><span id="lzOperatorRole" class="lz-operator-role">Perfil</span><button class="lz-operator-close" id="lzOperatorClose" type="button" aria-label="Fechar">×</button></div></div>
        <div class="lz-operator-brainbar"><i></i><span>Brain v6: contexto · linguagem natural · acções seguras com confirmação · permissões Admin/Editor</span></div>
        <div class="lz-operator-scope"><label for="lzOperatorScopeSelect">Escopo</label><select id="lzOperatorScopeSelect"><option value="__all__">Todos convites · resultados separados</option><option value="__current__">Convite actual do painel</option></select><button id="lzOperatorReload" type="button" title="Recarregar dados">↻</button></div>
        <div class="lz-operator-messages" id="lzOperatorMessages"></div>
        <div class="lz-operator-quick" id="lzOperatorQuick"></div>
        <form class="lz-operator-form" id="lzOperatorForm"><input id="lzOperatorInput" type="text" placeholder="Ex: quantos convidados abriram o convite rosalina-monteiro?" autocomplete="off"><button class="lz-operator-send" type="submit">${iconSvg('send')}</button></form>
      </div>`;
    document.body.appendChild(wrap);
    bind(); state.booted=true; restore(); renderQuick(); updateVisibility();
  }
  function bind(){
    $('lzOperatorToggle').addEventListener('click',()=>toggle(true));
    $('lzOperatorClose').addEventListener('click',()=>toggle(false));
    $('lzOperatorForm').addEventListener('submit',e=>{e.preventDefault(); const input=$('lzOperatorInput'); const msg=txt(input.value); if(!msg)return; input.value=''; handle(msg);});
    $('lzOperatorQuick').addEventListener('click',e=>{const b=e.target.closest('[data-op-chip]'); if(b) handle(b.dataset.opChip);});
    $('lzOperatorScopeSelect')?.addEventListener('change',e=>{setScopeValue(e.target.value); state.inviteCache.clear(); updateStatusLabel(); handle('Mapa');});
    $('lzOperatorReload')?.addEventListener('click',()=>{state.inviteCache.clear(); state.invites=null; renderInviteScopeSelect(true); handle('Mapa');});
    $('lzOperatorMessages').addEventListener('click',e=>{const b=e.target.closest('[data-op-action]'); if(b) runAction(b.dataset.opAction,b.dataset.opPayload||'');});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)toggle(false);});
    ['commandInviteSelect','manageInviteSelect','guestInviteSelect','guestCrudInviteSelect'].forEach(id=>$(id)?.addEventListener('change',()=>{state.inviteCache.clear(); updateStatusLabel();}));
    const obs=new MutationObserver(updateVisibility); const app=$('app'); if(app) obs.observe(app,{attributes:true,attributeFilter:['class']});
  }
  function updateVisibility(){const el=$('lzOperator'); if(!el)return; el.classList.toggle('ready',Boolean($('app')?.classList.contains('active')&&token()));}
  async function updateStatusLabel(){
    const roleEl=$('lzOperatorRole');
    if(roleEl){roleEl.textContent=roleLabel(); roleEl.className='lz-operator-role '+roleBadgeClass(); roleEl.title=isEditorRole()?'Perfil Editor: edições limitadas; acções críticas bloqueadas.':'Perfil Administrador: acesso total às acções do bot.';}
    try{await renderInviteScopeSelect(false); if(getScopeValue()==='__all__'){const contexts=await getAllContexts(12); const valid=contexts.filter(c=>c.analysis); const totals=valid.reduce((a,c)=>{a.g+=c.analysis.guests.length;a.p+=c.analysis.pending.length;return a;},{g:0,p:0}); $('lzOperatorStatus').textContent=`${roleLabel()} · ${valid.length} convites · ${totals.g} convidados · ${totals.p} pendentes`; return;} const ctx=await getContext(false); $('lzOperatorStatus').textContent=ctx.invite?`${roleLabel()} · ${shortInvite(ctx)} · saúde ${ctx.analysis.score}% · ${ctx.analysis.pending.length} pendentes`:`${roleLabel()} · seleccione um convite`;}catch{$('lzOperatorStatus').textContent=`${roleLabel()} · Brain v6 · acções seguras`;}}
  function toggle(open){state.open=Boolean(open); $('lzOperator')?.classList.toggle('open',state.open); if(state.open){renderInviteScopeSelect(false); updateStatusLabel(); if(!state.history.length){bot(`<strong>Estou pronto.</strong><br>Agora também preparo acções reais com confirmação obrigatória e respeito ao perfil logado. Está em <b>${esc(roleLabel())}</b>. Exemplos: <b>repor acesso de João no convite rosalina-monteiro</b>, <b>alterar mesa de Ana para 8</b>, <b>adicionar convidado Carlos ao convite minoca-abubacar</b>.`);}}}
  function renderQuick(){const chips=['Focar convite','Quantos abriram?','Mostra a lista','Plano de acção','Repor acesso','Editar mesa','Adicionar convidado','Eliminar convidado','Perfil convidado','Qual convite precisa de atenção?','Confirmados sem mesa','Relatório','Ajuda']; $('lzOperatorQuick').innerHTML=chips.map(c=>`<button type="button" data-op-chip="${esc(c)}">${esc(c)}</button>`).join('');}
  async function renderInviteScopeSelect(force=false){
    const el=$('lzOperatorScopeSelect'); if(!el||!token()) return;
    const current=getScopeValue();
    try{
      const invites=await getInvites(force);
      const opts=['<option value="__all__">Todos convites · resultados separados</option>','<option value="__current__">Convite actual do painel</option>'].concat(invites.map(inv=>`<option value="${esc(inv.id||inv._id||inv.slug)}">${esc(inviteTitle(inv))}</option>`));
      el.innerHTML=opts.join('');
      el.value=[...el.options].some(o=>o.value===current)?current:'__all__';
      setScopeValue(el.value);
    }catch(err){/* mantém opções básicas */}
  }
  function restore(){try{state.history=JSON.parse(localStorage.getItem(LS_KEY)||'[]').slice(-10); state.history.forEach(m=>addMsg(m.html,m.user,false));}catch{state.history=[];}}
  function persist(html,user){state.history.push({html,user}); state.history=state.history.slice(-24); localStorage.setItem(LS_KEY,JSON.stringify(state.history));}
  function addMsg(html,user=false,save=true){const box=$('lzOperatorMessages'); if(!box)return; const div=document.createElement('div'); div.className=`lz-op-msg ${user?'user':'bot'}`; div.innerHTML=html; box.appendChild(div); box.scrollTop=box.scrollHeight; if(save)persist(html,user);}
  function user(html){addMsg(esc(html),true);} function bot(html){addMsg(html,false);} function typing(on=true){const box=$('lzOperatorMessages'); if(!box)return; let el=$('lzOpTyping'); if(on){if(el)return; el=document.createElement('div');el.id='lzOpTyping';el.className='lz-operator-typing';el.innerHTML='<span></span><span></span><span></span>';box.appendChild(el);box.scrollTop=box.scrollHeight;}else el?.remove();}
  async function handle(message){user(message); typing(true); try{await new Promise(r=>setTimeout(r,120+Math.random()*180)); const reply=await route(message); typing(false); bot(reply); updateStatusLabel();}catch(err){typing(false); bot(`<strong>Não consegui executar.</strong><br>${esc(err.message||err)}<div class="lz-op-actions"><button class="lz-op-action" data-op-action="refresh">Tentar novamente</button></div>`);} }

  function normLoose(v){return norm(v).replace(/[&+\-_.]+/g,' ').replace(/\b(convite|casamento|cliente|slug|admin)\b/g,' ').replace(/\s+/g,' ').trim();}
  function inviteSearchText(inv){return [inv?.slug,inv?.coupleNames,inv?.clientName,inv?.name,inv?.title].map(normLoose).filter(Boolean).join(' | ');}
  function scoreInviteMatch(message,inv){
    const m=normLoose(message); const slug=normLoose(inv?.slug||''); const title=normLoose(inviteTitle(inv)); const hay=inviteSearchText(inv);
    if(!m||!hay) return 0;
    let score=0;
    if(slug&&m.includes(slug)) score+=120;
    if(title&&m.includes(title)) score+=110;
    const rawSlug=norm(inv?.slug||''); if(rawSlug&&norm(message).includes(rawSlug)) score+=130;
    const tokens=[...new Set(hay.split(/\s+/).filter(t=>t.length>=3&&!['convite','casamento','cliente','com','dos','das','para'].includes(t)))];
    let hits=0; tokens.forEach(t=>{ if(m.includes(t)) hits+=1; });
    if(tokens.length) score+=Math.round((hits/tokens.length)*70)+hits*8;
    const after=(normLoose((String(message).match(/(?:convite|casamento|cliente)\s+([a-z0-9&+\-_.\s]+)/i)||[])[1]||''));
    if(after){const afterTokens=after.split(/\s+/).filter(t=>t.length>=3); const afterHits=afterTokens.filter(t=>hay.includes(t)).length; score+=afterHits*18;}
    return score;
  }
  async function resolveInviteFromMessage(message){
    const invites=await getInvites(false);
    const ranked=invites.map(inv=>({inv,score:scoreInviteMatch(message,inv)})).filter(x=>x.score>25).sort((a,b)=>b.score-a.score);
    if(!ranked.length) return {match:null,ambiguous:[],invites};
    if(ranked.length>1 && ranked[0].score-ranked[1].score<18) return {match:null,ambiguous:ranked.slice(0,5),invites};
    return {match:ranked[0].inv,ambiguous:[],invites};
  }
  function detectMetricIntent(m){
    const has=(r)=>r.test(m);
    if(has(/abriu.*nao|abriu.*não|abriram.*nao|abriram.*não|sem confirmar|abriram mas|abertos sem/)) return {type:'openedNoConfirm',label:'abriram sem confirmar',subject:'convidados que abriram mas ainda não confirmaram'};
    if(has(/nao abrir|não abrir|nao aberto|não aberto|por abrir|nunca abriu|ainda nao abriu|ainda não abriu/)) return {type:'notOpened',label:'não abriram',subject:'convidados que ainda não abriram'};
    if(has(/abriram|abriu|abertos|aberto|visualizaram|visualizou|viram|viu|acessaram|acessou|leram|lido/) && !has(/nao|não|sem confirmar/)) return {type:'opened',label:'abriram o convite',subject:'convidados que já abriram o convite'};
    if(has(/confirmaram|confirmad|rsvp positivo|presenca confirmada|presença confirmada/)) return {type:'confirmed',label:'confirmaram',subject:'convidados confirmados'};
    if(has(/pendente|pendentes|por confirmar|falta confirmar|ainda nao confirm|ainda não confirm/)) return {type:'pending',label:'pendentes',subject:'convidados pendentes'};
    if(has(/recusaram|recusad|declinaram|declinad|nao vao|não vão|nao vai|não vai/)) return {type:'declined',label:'recusaram',subject:'convidados que recusaram'};
    if(has(/check.?in|entraram|entrou|ja entrou|já entrou|presentes no evento|entrada feita/)) return {type:'checkedIn',label:'check-in feito',subject:'convidados com check-in feito'};
    if(has(/sem mesa|mesa em falta|nao tem mesa|não tem mesa|confirmados sem mesa/)) return {type:'missingTables',label:'sem mesa',subject:'confirmados sem mesa definida'};
    if(has(/sem contacto|sem contato|sem telefone|telefone em falta|contacto em falta|contato em falta/)) return {type:'missingPhones',label:'sem contacto',subject:'convidados sem contacto'};
    if(has(/sem token|sem link|token em falta|link individual em falta|sem acesso individual/)) return {type:'missingTokens',label:'sem token',subject:'convidados sem token individual'};
    if(has(/vip.*pendente|pendente.*vip/)) return {type:'vipPending',label:'VIP pendentes',subject:'convidados VIP pendentes'};
    if(has(/\bvip\b|padrinhos|madrinhas|honra/)) return {type:'vip',label:'VIP',subject:'convidados VIP'};
    if(has(/duplicad|repetid|mesma pessoa|nomes iguais/)) return {type:'duplicated',label:'possíveis duplicados',subject:'grupos de possíveis duplicados'};
    if(has(/nomes problem|nomes estranhos|nome errado|erros nos nomes|corrigir nomes/)) return {type:'badNames',label:'nomes problemáticos',subject:'convidados com nomes problemáticos'};
    if(has(/mensagens|mural|recados/)) return {type:'messages',label:'mensagens recebidas',subject:'mensagens recebidas'};
    if(has(/contribuic|contribuiç|pagamentos|valor recebido|dinheiro/)) return {type:'contributions',label:'contribuições',subject:'contribuições registadas'};
    if(has(/presentes reservados|presentes|gift/)) return {type:'reservedGifts',label:'presentes reservados',subject:'presentes reservados'};
    if(has(/pessoas previstas|presencas previstas|presenças previstas|pessoas confirmadas|quantas pessoas/)) return {type:'totalPeople',label:'pessoas previstas',subject:'pessoas previstas pelos confirmados'};
    if(has(/convidados|base total|lista total|total da lista/)) return {type:'guests',label:'convidados registados',subject:'convidados registados'};
    return null;
  }
  function getMetricList(ctx,type){
    const a=ctx.analysis; const map={guests:a.guests,opened:a.opened,openedNoConfirm:a.openedNoConfirm,notOpened:a.notOpened,confirmed:a.confirmed,pending:a.pending,declined:a.declined,checkedIn:a.checkedIn,missingTables:a.missingTables,missingPhones:a.missingPhones,missingTokens:a.missingTokens,vip:a.vipGuests,vipPending:a.vipPending};
    return map[type]||[];
  }
  function getMetricValue(ctx,type){
    const a=ctx.analysis;
    if(type==='duplicated') return a.duplicated.length;
    if(type==='badNames') return a.badNames.length;
    if(type==='messages') return a.messages.length;
    if(type==='contributions') return a.contributions.length;
    if(type==='reservedGifts') return a.reservedGifts.length;
    if(type==='totalPeople') return a.totalPeople;
    const list=getMetricList(ctx,type); return list.length;
  }
  function naturalAction(m){
    if(/^(quem|quais|lista|listar|mostra|mostrar|ver|diz me quem|diz-me quem|quero ver|mostra me|mostra-me)\b/.test(m)) return 'list';
    if(/percent|percentagem|taxa|porcent/.test(m)) return 'rate';
    if(/quantos|quantas|quanto|qtd|quantidade|numero|número|total|conta|contar/.test(m)) return 'count';
    if(/^(e\s+)?(a lista|lista|mostra|mostrar|separa|separar|exporta|gerar lista)/.test(m)) return 'list';
    if(/tem\s+\d+|há\s+\d+/.test(m)) return 'count';
    return '';
  }
  function inferCategoryFromWords(m){
    const pairs=[['família','familia|família|familiares'],['amigos','amigo|amigos'],['colegas','colega|colegas|trabalho'],['padrinhos','padrinho|padrinhos|madrinha|madrinhas'],['VIP','vip|honra|mesa principal'],['noiva','noiva'],['noivo','noivo']];
    for(const [label,rx] of pairs){ if(new RegExp(`\\b(${rx})\\b`).test(m)) return label; }
    return '';
  }
  function parseNaturalCriteria(message,m){
    const criteria={raw:message};
    const table=message.match(/mesa\s+([a-z0-9\-\/]+)/i); if(table&&!/sem\s+mesa/i.test(message)) criteria.table=table[1];
    const cat=message.match(/categoria\s+([^,.;?]+)/i)||message.match(/grupo\s+([^,.;?]+)/i); if(cat) criteria.category=cat[1];
    if(!criteria.category){ const inferred=inferCategoryFromWords(m); if(inferred && !/por convite|todos|todas|geral/.test(m)) criteria.category=inferred; }
    if(/\bvip\b|padrinho|madrinha|honra/.test(m)) criteria.vip=true;
    if(/sem mesa|mesa em falta|nao tem mesa|não tem mesa/.test(m)) criteria.missingTable=true;
    if(/com mesa|mesa definida|tem mesa/.test(m) && !criteria.missingTable) criteria.hasTable=true;
    if(/sem contacto|sem contato|sem telefone|contacto em falta|contato em falta|telefone em falta/.test(m)) criteria.missingPhone=true;
    if(/com contacto|com contato|com telefone|tem telefone/.test(m) && !criteria.missingPhone) criteria.hasPhone=true;
    if(/sem token|sem link|sem acesso|token em falta|link individual em falta/.test(m)) criteria.missingToken=true;
    if(/com token|tem token|com link individual/.test(m) && !criteria.missingToken) criteria.hasToken=true;
    if(/com acompanhante|com acompanhantes|mais de uma pessoa|levam acompanhante|leva acompanhante/.test(m)) criteria.withCompanions=true;
    if(/sem acompanhante|sem acompanhantes|sozinho|sozinha/.test(m)) criteria.noCompanions=true;
    if(/contacto repetido|contato repetido|telefone repetido/.test(m)) criteria.duplicatePhone=true;
    return criteria;
  }
  function criteriaHasFilters(criteria){return Boolean(criteria&&(criteria.table||criteria.category||criteria.vip||criteria.missingTable||criteria.hasTable||criteria.missingPhone||criteria.hasPhone||criteria.missingToken||criteria.hasToken||criteria.withCompanions||criteria.noCompanions||criteria.duplicatePhone));}
  function criteriaLabel(criteria){return [criteria?.table?`mesa ${criteria.table}`:'',criteria?.category?`categoria ${criteria.category}`:'',criteria?.vip?'VIP':'',criteria?.missingTable?'sem mesa':'',criteria?.hasTable?'com mesa':'',criteria?.missingPhone?'sem contacto':'',criteria?.hasPhone?'com contacto':'',criteria?.missingToken?'sem token':'',criteria?.hasToken?'com token':'',criteria?.withCompanions?'com acompanhantes':'',criteria?.noCompanions?'sem acompanhantes':'',criteria?.duplicatePhone?'contacto repetido':''].filter(Boolean).join(' · ');}
  function applyNaturalFilters(ctx,list,criteria){
    if(!criteria) return list;
    let out=list.slice(); const a=ctx.analysis;
    if(criteria.table){const t=norm(criteria.table); out=out.filter(g=>norm(displayTable(g)).includes(t));}
    if(criteria.category){const c=norm(criteria.category); out=out.filter(g=>norm(getCategory(g)).includes(c)||norm(getNotes(g)).includes(c));}
    if(criteria.vip) out=out.filter(isVip);
    if(criteria.missingTable) out=out.filter(isTableMissing);
    if(criteria.hasTable) out=out.filter(g=>!isTableMissing(g));
    if(criteria.missingPhone) out=out.filter(g=>!getPhone(g));
    if(criteria.hasPhone) out=out.filter(g=>Boolean(getPhone(g)));
    if(criteria.missingToken) out=out.filter(g=>!hasToken(g));
    if(criteria.hasToken) out=out.filter(g=>hasToken(g));
    if(criteria.withCompanions) out=out.filter(g=>peopleCount(g)>1);
    if(criteria.noCompanions) out=out.filter(g=>peopleCount(g)<=1);
    if(criteria.duplicatePhone){ const repeated=new Set(a.duplicatePhones.flatMap(x=>x.items.map(guestKey))); out=out.filter(g=>repeated.has(guestKey(g))); }
    return out;
  }
  function metricRate(ctx,type,value){
    const a=ctx.analysis; const total=a.guests.length||1;
    if(type==='confirmed') return fmtPct(value,total)+'% da lista';
    if(type==='opened'||type==='notOpened'||type==='openedNoConfirm'||type==='pending'||type==='declined') return fmtPct(value,total)+'% da lista';
    if(type==='checkedIn') return fmtPct(value,a.confirmed.length||1)+'% dos confirmados';
    return '';
  }
  function rememberContext(ctx,intent=null,criteria=null,action=null,listLabel=''){
    if(!ctx||!ctx.invite) return;
    state.lastContext=ctx;
    state.dialog={inviteId:inviteIdOf(ctx),inviteTitle:shortInvite(ctx),intent,criteria,action,lastQuestion:state.dialog.lastQuestion||'',lastListLabel:listLabel||state.dialog.lastListLabel||''};
  }
  function isExplicitMulti(m){return /\b(todos|todas|geral|global|multi|por convite|separado|separar por convite|cada convite|todos os convites|todos convites)\b/.test(m);}
  function looksLikeFollowup(m){return Boolean(state.dialog.inviteId)&&!/\b(convite|casamento|cliente)\s+/.test(m)&&!isExplicitMulti(m)&&/^(e\s+|agora\s+|entao\s+|então\s+|depois\s+|tambem\s+|também\s+|lista\b|mostra\b|separa\b|gera\b|gerar\b|exporta\b|copia\b|copiar\b|quantos\b|quantas\b|quem\b|quais\b|qual\b|o que\b|plano\b|perfil\b)/.test(m);}
  function maybeInheritIntent(m,intent){
    if(intent) return intent;
    if(/^(lista|mostra|mostrar|ver|separa|separar|exporta|copia|copiar)\b/.test(m) && state.dialog.intent) return state.dialog.intent;
    return null;
  }
  function mergeCriteria(base,extra){return Object.assign({},base||{},extra||{});}
  function naturalCountAnswer(ctx,intent,criteria){
    let value=getMetricValue(ctx,intent.type); let list=getMetricList(ctx,intent.type);
    if(list.length && criteriaHasFilters(criteria)){list=applyNaturalFilters(ctx,list,criteria); value=list.length;}
    state.lastList=attachInvite(list,ctx); rememberContext(ctx,intent,criteria,'count',intent.label);
    const rate=metricRate(ctx,intent.type,value); const filterText=criteriaLabel(criteria);
    return `<strong>Resposta directa — ${esc(shortInvite(ctx))}</strong><br>${filterText?`Filtro aplicado: <b>${esc(filterText)}</b>.<br>`:''}No convite <b>${esc(shortInvite(ctx))}</b>, <b>${esc(value)}</b> ${esc(intent.subject)}.${rate?`<br>Isso representa <b>${esc(rate)}</b>.`:''}${intent.type==='opened'?`<br><small>Critério: “abriram” inclui todos que já saíram de “Não aberto”, incluindo confirmados.</small>`:''}<div class="lz-op-context">Contexto guardado: ${esc(shortInvite(ctx))}</div><div class="lz-op-actions">${list.length?'<button class="lz-op-action primary" data-op-action="copy-list">Copiar lista</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button>':''}${actionAsk('Mostrar lista','lista '+intent.label)}${actionAsk('Ver funil','funil')}</div>`;
  }
  function naturalListAnswer(ctx,intent,criteria){
    let list=getMetricList(ctx,intent.type); if(criteria) list=applyNaturalFilters(ctx,list,criteria);
    state.lastList=attachInvite(list,ctx); rememberContext(ctx,intent,criteria,'list',intent.label);
    const filterText=criteriaLabel(criteria);
    if(!list.length) return `<strong>${esc(cap(intent.label))} — ${esc(shortInvite(ctx))}</strong><br>Não encontrei registos para este pedido${filterText?` com filtro <b>${esc(filterText)}</b>`:''}.<div class="lz-op-context">Contexto guardado: ${esc(shortInvite(ctx))}</div>`;
    return `<strong>${esc(cap(intent.label))} — ${esc(shortInvite(ctx))}</strong><br>Encontrei <b>${list.length}</b> ${esc(intent.subject)}${filterText?` com filtro <b>${esc(filterText)}</b>`:''}.<div class="lz-op-list">${list.slice(0,MAX_PREVIEW).map(g=>guestRow(g,getPhone(g)||'')).join('')}${list.length>MAX_PREVIEW?`<div class="lz-op-card"><span>+ ${list.length-MAX_PREVIEW} registo(s) fora da prévia.</span></div>`:''}</div><div class="lz-op-context">Contexto guardado: ${esc(shortInvite(ctx))}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar lista</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button>${actionAsk('Gerar mensagem','mensagem para '+intent.label)}</div>`;
  }
  async function naturalMultiAnswer(message,m,intent,criteria,action){
    const contexts=await getValidContexts(); let flat=[];
    const blocks=contexts.map(ctx=>{let list=getMetricList(ctx,intent.type); if(criteria) list=applyNaturalFilters(ctx,list,criteria); const value=(['duplicated','badNames','messages','contributions','reservedGifts','totalPeople'].includes(intent.type) && !criteriaHasFilters(criteria)) ? getMetricValue(ctx,intent.type) : list.length; flat=flat.concat(attachInvite(list,ctx)); return {ctx,list,value};});
    state.lastList=flat; state.dialog.intent=intent; state.dialog.criteria=criteria; state.dialog.action=action; state.dialog.inviteId=''; state.dialog.inviteTitle='Todos convites';
    const filterText=criteriaLabel(criteria);
    if(action==='count'||action==='rate'){
      const total=blocks.reduce((s,b)=>s+Number(b.value||0),0);
      return `<strong>${esc(cap(intent.label))} — separado por convite</strong><br>${filterText?`Filtro aplicado em cada convite: <b>${esc(filterText)}</b>.<br>`:''}Total global apenas para referência: <b>${esc(total)}</b>. Abaixo está separado por convite.<div class="lz-op-list multi">${blocks.map(b=>`<div class="lz-op-invite-block">${inviteHeaderRow(b.ctx,b.value,`${intent.subject} · ${b.ctx.analysis.guests.length} convidados`,message)}</div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-csv">Copiar CSV</button>${actionAsk('Comparar convites','Comparar convites')}</div>`;
    }
    return `<strong>${esc(cap(intent.label))} — separado por convite</strong><br>${filterText?`Filtro aplicado em cada convite: <b>${esc(filterText)}</b>.<br>`:''}Listei os resultados por convite, sem misturar clientes.<div class="lz-op-list multi">${blocks.map(b=>`<div class="lz-op-invite-block">${inviteHeaderRow(b.ctx,b.list.length,intent.subject,message)}${b.list.length?b.list.slice(0,6).map(x=>guestRow(x)).join(''):`<div class="lz-op-card"><span>Sem registos neste convite.</span></div>`}${b.list.length>6?`<div class="lz-op-card"><span>+ ${b.list.length-6} registo(s) deste convite fora da prévia.</span></div>`:''}</div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar tudo separado</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button></div>`;
  }
  async function routeNatural(message,m){
    let action=naturalAction(m); let intent=maybeInheritIntent(m,detectMetricIntent(m));
    if(!action&&intent) action='count';
    if(!action||!intent) return '';
    let criteria=parseNaturalCriteria(message,m);
    if(looksLikeFollowup(m)) criteria=mergeCriteria(state.dialog.criteria,criteria);
    const resolved=await resolveInviteFromMessage(message);
    if(resolved.ambiguous.length){return `<strong>Encontrei mais de um convite possível.</strong><br>Escolha qual quer analisar:<div class="lz-op-actions">${resolved.ambiguous.map(x=>`<button class="lz-op-action" data-op-action="select-invite" data-op-payload="${esc(x.inv.id||x.inv._id||x.inv.slug)}">${esc(inviteTitle(x.inv))}</button>`).join('')}</div>`;}
    if(resolved.match){const ctx=await getContext(false,resolved.match.id||resolved.match._id||resolved.match.slug); return action==='list'?naturalListAnswer(ctx,intent,criteria):naturalCountAnswer(ctx,intent,criteria);}
    if(looksLikeFollowup(m)&&state.dialog.inviteId){const ctx=await getContext(false,state.dialog.inviteId); if(ctx?.invite) return action==='list'?naturalListAnswer(ctx,intent,criteria):naturalCountAnswer(ctx,intent,criteria);}
    if(getScopeValue()==='__all__'||isExplicitMulti(m)) return naturalMultiAnswer(message,m,intent,criteria,action);
    const ctx=await getContext(false); if(!ctx.invite) return '';
    return action==='list'?naturalListAnswer(ctx,intent,criteria):naturalCountAnswer(ctx,intent,criteria);
  }
  function groupLastList(kind='table'){
    const list=state.lastList||[]; if(!list.length) return `<strong>Sem lista anterior.</strong><br>Peça primeiro uma lista, por exemplo: <b>quem ainda não abriu?</b>`;
    const label=kind==='category'?'categoria':kind==='invite'?'convite':'mesa';
    const fn=kind==='category'?getCategory:kind==='invite'?(g=>g.__inviteTitle||'Convite actual'):displayTable;
    const groups=sortedEntries(groupBy(list,fn));
    return `<strong>Lista anterior separada por ${esc(label)}</strong><br>Separei <b>${list.length}</b> registo(s) do último resultado.<div class="lz-op-list">${groups.map(([k,items])=>`<div class="lz-op-card"><strong>${esc(k)} · ${items.length}</strong><span>${esc(items.slice(0,12).map(g=>getName(g)||'Sem nome').join(' / '))}${items.length>12?' ...':''}</span></div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar lista original</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button></div>`;
  }
  function generateMessageFromLastList(m){
    const list=state.lastList||[]; if(!list.length) return '';
    const couple=state.dialog.inviteTitle&&state.dialog.inviteTitle!=='Todos convites'?state.dialog.inviteTitle:'o convite';
    const target=state.dialog.lastListLabel||'segmento filtrado';
    const text=/curt/.test(m)?`Olá, [Nome]. Lembramos com carinho que a sua confirmação para ${couple} ainda está pendente. Por favor, confirme pelo link do convite.`:`Olá, [Nome]. Esperamos que esteja bem.\n\nPassamos para lembrar com carinho sobre a confirmação de presença em ${couple}.\n\nPor favor, aceda ao convite e conclua a sua confirmação assim que possível.\n\nCom carinho,\nEquipa Lirandzo`;
    state.lastMessage=text;
    return `<strong>Mensagem gerada para a lista actual</strong><br>Segmento em memória: <b>${esc(target)}</b> · ${list.length} convidado(s).<div class="lz-op-card"><span>${esc(text).replace(/\n/g,'<br>')}</span></div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-message">Copiar mensagem</button><button class="lz-op-action" data-op-action="copy-list">Copiar segmento</button></div>`;
  }

  async function focusInviteFromMessage(message,m){
    const resolved=await resolveInviteFromMessage(message);
    if(resolved.ambiguous.length){return `<strong>Encontrei mais de um convite possível para focar.</strong><br>Escolha abaixo:<div class="lz-op-actions">${resolved.ambiguous.map(x=>`<button class="lz-op-action" data-op-action="select-invite" data-op-payload="${esc(x.inv.id||x.inv._id||x.inv.slug)}">${esc(inviteTitle(x.inv))}</button>`).join('')}</div>`;}
    if(!resolved.match) return `<strong>Não encontrei esse convite.</strong><br>Escreva o slug ou parte do nome do casal. Exemplo: <b>focar convite rosalina-monteiro</b>.`;
    const id=resolved.match.id||resolved.match._id||resolved.match.slug;
    setScopeValue(id); const ctx=await getContext(false,id); rememberContext(ctx,null,null,'focus');
    return `<strong>Convite focado</strong><br>Agora estou focado em <b>${esc(shortInvite(ctx))}</b>. Pode continuar com perguntas curtas como <b>quantos pendentes?</b>, <b>mostra a lista</b>, <b>separa por mesa</b> ou <b>gera mensagem</b>.<div class="lz-op-actions">${actionAsk('Mapa','Mapa',true)}${actionAsk('Plano de acção','O que devo fazer agora?')}${actionAsk('Funil','Funil')}</div>`;
  }
  function isYes(m){return /^(sim|s|yes|confirmo|confirmar|pode executar|executar|aplicar|ok|certo)$/i.test(txt(m));}
  function isNo(m){return /^(nao|não|n|no|cancelar|cancela|errado|parar)$/i.test(txt(m));}
  function looksLikeBotWriteAction(m){
    return /\b(repor|resetar|reiniciar|restaurar|adicionar|add|criar|inserir|novo|editar|alterar|mudar|corrigir|actualizar|atualizar|definir|trocar|eliminar|apagar|remover|deletar|delete)\b/.test(m)
      && /\b(convidado|convidada|pessoa|acesso|link|token|rsvp|confirmacao|confirmação|checkin|check-in|check in|entrada|mesa|telefone|contacto|contato|categoria|acompanhantes|convite|dados)\b/.test(m);
  }
  function actionPayload(obj){return esc(JSON.stringify(obj));}
  function formatGuestMini(g){
    if(!g) return '';
    return `<div class="lz-op-card compact"><strong>${esc(g.name||'Sem nome')}</strong><span>Mesa: ${esc(g.table||'A definir')} · Categoria: ${esc(g.category||'Sem categoria')} · Estado: ${esc(g.status||'-')} · Contacto: ${esc(g.phone||'-')} · Pessoas: ${esc(g.maxGuests||g.companions||1)} · Token: ${g.hasToken?'sim':'não'}</span></div>`;
  }
  function diffCard(before,after){
    if(!before&&!after) return '';
    const fields=[['name','Nome'],['table','Mesa'],['phone','Contacto'],['category','Categoria'],['status','Estado'],['companions','Acompanhantes'],['maxGuests','Pessoas máx.'],['number','Número'],['checkedIn','Check-in'],['inviteToken','Token']];
    const rows=fields.map(([k,label])=>{const b=before?before[k]:''; const a=after?after[k]:''; if(String(b??'')===String(a??'')) return ''; return `<div class="metric-row"><span>${esc(label)}</span><b>${esc(b??'-')} → ${esc(a??'-')}</b></div>`;}).filter(Boolean).join('');
    return rows?`<div class="lz-op-card"><strong>Antes / Depois previsto</strong>${rows}</div>`:'';
  }
  function renderSelectionRequired(data, originalMessage){
    if(data.selectionType==='guest'){
      const buttons=(data.candidates||[]).map(g=>`<button class="lz-op-action" data-op-action="prepare-action" data-op-payload="${actionPayload({message:originalMessage,guestId:g.id,actionType:data.actionType})}">${esc(g.name)} · ${esc(g.table||'sem mesa')}</button>`).join('');
      return `<strong>Preciso confirmar o convidado exacto.</strong><br>${esc(data.message||'Escolha um registo.')}<div class="lz-op-list">${(data.candidates||[]).map(formatGuestMini).join('')}</div><div class="lz-op-actions">${buttons}<button class="lz-op-action" data-op-action="cancel-pending">Cancelar</button></div>`;
    }
    if(data.selectionType==='invite'){
      const buttons=(data.candidates||[]).map(inv=>`<button class="lz-op-action" data-op-action="prepare-action" data-op-payload="${actionPayload({message:originalMessage,inviteId:inv.id,actionType:data.actionType})}">${esc(inv.coupleNames||inv.clientName||inv.slug)}</button>`).join('');
      return `<strong>Preciso confirmar o convite exacto.</strong><br>${esc(data.message||'Escolha um convite.')}<div class="lz-op-actions">${buttons}<button class="lz-op-action" data-op-action="cancel-pending">Cancelar</button></div>`;
    }
    return `<strong>Selecção necessária.</strong>`;
  }
  function renderPreparedAction(data){
    const d=data.data||data;
    state.pendingAction=d;
    const roleClass=d.role==='editor'?'warn':'ok';
    const warnings=(d.warnings||[]).map(w=>`<div class="lz-op-warning">${esc(w)}</div>`).join('');
    const strong=d.confirmationPhrase?`<div class="lz-op-danger"><strong>Confirmação forte obrigatória</strong><span>Para executar, escreva exactamente: <b>${esc(d.confirmationPhrase)}</b></span></div>`:'';
    const confirmButtons=d.confirmationPhrase?`<button class="lz-op-action" data-op-action="cancel-pending">Cancelar</button>`:`<button class="lz-op-action primary" data-op-action="confirm-pending">Sim, executar</button><button class="lz-op-action" data-op-action="cancel-pending">Cancelar</button>`;
    return `<strong>Acção preparada: ${esc(d.actionLabel||d.actionType)}</strong><br><span class="lz-op-roleline ${roleClass}">Sessão actual: ${esc(d.roleLabel||roleLabel())}</span>${metric('Convite',d.invite?.coupleNames||d.invite?.clientName||d.invite?.slug||'-')}${d.guest?formatGuestMini(d.guest):''}${diffCard(d.before,d.after)}${warnings}${strong}<div class="lz-op-actions">${confirmButtons}</div>`;
  }
  async function prepareBotAction(message, extra={}){
    const inviteId=(extra&&extra.inviteId) || (getScopeValue()!=='__all__'&&getScopeValue()!=='__current__'?getScopeValue():selectedInviteId());
    const out=await api('/manager/bot/prepare-action',{method:'POST',body:JSON.stringify({message,inviteId,...extra})});
    if(out.status==='selection_required') return renderSelectionRequired(out,message);
    return renderPreparedAction(out);
  }
  async function applyPendingAction(confirmText=''){
    const pending=state.pendingAction;
    if(!pending) return `<strong>Não há acção pendente.</strong><br>Peça primeiro uma operação, por exemplo: <b>repor acesso de João no convite rosalina-monteiro</b>.`;
    const out=await api('/manager/bot/apply-action',{method:'POST',body:JSON.stringify({actionId:pending.actionId,confirmText})});
    state.pendingAction=null; state.inviteCache.clear(); state.invites=null;
    const d=out.data||{}; const guest=d.result?.guest; const link=d.result?.publicLink; if(link) state.lastMessage=link;
    return `<strong>${esc(out.message||'Acção executada.')}</strong>${metric('Perfil usado',d.roleLabel||roleLabel())}${metric('Convite',d.invite?.coupleNames||d.invite?.clientName||d.invite?.slug||'-')}${d.before?formatGuestMini(d.before):''}${guest?`<div class="lz-op-card"><strong>Resultado actualizado</strong><span>${esc(guest.name||'')} · Estado: ${esc(guest.status||'-')} · Mesa: ${esc(guest.table||guest.mesa||'-')} · Token: ${guest.inviteToken?'actualizado/existente':'em falta'}</span></div>`:''}${link?`<div class="lz-op-card"><strong>Novo link individual</strong><span>${esc(link)}</span></div>`:''}${d.result?.deletedGuest?metric('Convidado eliminado',d.result.deletedGuest):''}${d.result?.rsvpsDeleted!==undefined?metric('RSVP removidos',d.result.rsvpsDeleted):''}${d.result?.checkinsDeleted!==undefined?metric('Check-ins removidos',d.result.checkinsDeleted):''}${d.result?.guestsReset!==undefined?metric('Convidados reiniciados',d.result.guestsReset):''}<div class="lz-op-actions">${link?'<button class="lz-op-action primary" data-op-action="copy-last-link">Copiar link</button>':''}<button class="lz-op-action" data-op-action="refresh">Actualizar mapa</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button></div>`;
  }

  async function route(message){
    const m=norm(message); state.dialog.lastQuestion=message;
    if(state.pendingAction){
      if(isNo(message)){state.pendingAction=null; return `<strong>Acção cancelada.</strong><br>Nada foi alterado.`;}
      if(isYes(message)) return applyPendingAction('');
      if(state.pendingAction.confirmationPhrase && txt(message)===state.pendingAction.confirmationPhrase) return applyPendingAction(txt(message));
      if(state.pendingAction.confirmationPhrase) return `<strong>Confirmação forte necessária.</strong><br>Para executar, escreva exactamente: <b>${esc(state.pendingAction.confirmationPhrase)}</b>. Para cancelar, escreva <b>não</b>.`;
    }
    if(looksLikeBotWriteAction(m)) return prepareBotAction(message);
    if((/separa|separar|agrupa|agrupar/.test(m))&&/mesa/.test(m)&&state.lastList?.length) return groupLastList('table');
    if((/separa|separar|agrupa|agrupar/.test(m))&&/categoria|grupo/.test(m)&&state.lastList?.length) return groupLastList('category');
    if((/separa|separar|agrupa|agrupar/.test(m))&&/convite/.test(m)&&state.lastList?.length) return groupLastList('invite');
    if(/mensagem|lembrete|whats/.test(m)&&/(esses|estas|essa lista|este segmento|segmento|lista actual|lista atual)/.test(m)&&state.lastList?.length){const out=generateMessageFromLastList(m); if(out) return out;}
    if(/^(foca|focar|seleciona|seleccionar|selecionar|usar|trabalhar no|trabalha no)\b/.test(m)&&/convite|casamento|cliente/.test(m)) return focusInviteFromMessage(message,m);
    if(/qual convite|mais pendente|mais pendentes|pior taxa|melhor taxa|precisa de atencao|precisa de atenção|mais critico|mais crítico|menos confirm/.test(m)) return compareInvitesSmart(message,m);
    const natural=await routeNatural(message,m); if(natural) return natural;
    if(isMultiScope(message)) return routeMulti(message,m);
    if(/todos.*convite|comparar|ranking|geral multi|todos os clientes/.test(m)) return compareInvitesSmart(message,m);
    const ctx=await getContext(false); if(!ctx.invite) return `Ainda não há convite seleccionado. Carregue os convites primeiro ou seleccione um convite no painel.`;
    rememberContext(ctx,state.dialog.intent,state.dialog.criteria,state.dialog.action);
    if(/^(ajuda|help|comandos|o que podes|manual)/.test(m)) return help(ctx);
    if(/plano de acao|plano de ação|o que devo fazer|o que fazer agora|proxima accao|próxima acção|proxima ação|prioridades agora|tarefas agora/.test(m)) return actionPlan(ctx);
    if(/mapa|indice|índice|visao geral|visão geral|central|comando/.test(m)) return viewMap(ctx);
    if(/funil|funnel|jornada|conversao|conversão/.test(m)) return viewFunnel(ctx);
    if(/risco|prioridade|urgente|critico|crítico|alerta/.test(m)) return viewRisks(ctx);
    if(/qualidade|higiene|auditoria de dados|dados ruins|inconsisten/.test(m)) return viewQuality(ctx);
    if(/recepcao|recepção|entrada|briefing recepção|briefing recepcao|dia do evento/.test(m)) return viewReception(ctx);
    if(/checklist|pre evento|pré evento|antes do casamento|preparar entrega/.test(m)) return viewRunbook(ctx);
    if(/mesa|mesas|seating|lugares|lotacao|lotação/.test(m) && !/sem mesa|mesa\s+\w+/.test(m)) return viewTables(ctx);
    if(/categoria|categorias|grupo|grupos|familia da noiva|familia do noivo/.test(m) && !/categoria\s+/.test(m)) return viewCategories(ctx);
    if(/familias|famílias|apelido|agrupa por familia|agrupar familias/.test(m)) return viewFamilies(ctx);
    if(/whats|mensagem|lembrete|texto|enviar|copy|copiar texto/.test(m)) return generateMessage(ctx,m);
    if(/relatorio|relatório|report|resumo executivo|cliente/.test(m)) return generateReport(ctx);
    if(/estat|numero|número|quantos|indicadores|kpi/.test(m)) return viewStats(ctx);
    if(/duplicad|repetid|nomes iguais|mesma pessoa/.test(m)) return viewDuplicates(ctx);
    if(/nome.*err|limpar|corrigir nomes|nomes estranhos|bad names|reparar nomes/.test(m)) return viewBadNames(ctx);
    if(/token|acesso individual|link individual/.test(m)) return viewList(ctx,'missingTokens');
    if(/sem mesa|confirmados sem mesa/.test(m)) return viewList(ctx,'missingTables');
    if(/telefone|contacto|contato|sem contacto|sem telefone/.test(m)) return viewList(ctx,'missingPhones');
    if(/abriu.*nao|abriu.*não|sem confirmar|abriram/.test(m)) return viewList(ctx,'openedNoConfirm');
    if(/nao abrir|não abrir|nao aberto|não aberto|por abrir|nunca abriu/.test(m)) return viewList(ctx,'notOpened');
    if(/pendente|pendentes|por confirmar|falta confirmar|ainda nao confirm|ainda não confirm/.test(m)) return viewList(ctx,'pending');
    if(/confirmad|confirmaram|rsvp/.test(m)) return viewList(ctx,'confirmed');
    if(/recus|declin|nao vai|não vai/.test(m)) return viewList(ctx,'declined');
    if(/check.?in|ja entrou|já entrou/.test(m)) return viewList(ctx,'checkedIn');
    const profile=message.match(/(?:perfil|detalhes|ver convidado|convidado)\s+(.+)/i); if(profile) return viewGuestProfile(ctx,profile[1]);
    const table=message.match(/mesa\s+([\w\-\/]+)/i); if(table) return viewFiltered(ctx,{table:table[1]},`Mesa ${table[1]}`);
    const cat=message.match(/categoria\s+(.+)/i); if(cat) return viewFiltered(ctx,{category:cat[1]},`Categoria ${cat[1]}`);
    const search=message.match(/(?:procura|procurar|buscar|pesquisar|encontra|encontrar)\s+(.+)/i); if(search) return searchGuest(ctx,search[1]);
    if(/filtra|filtrar|separa|separar|segmenta|segmentar|lista|listar|mostra|mostrar|ver /.test(m)) return viewCustomFilter(ctx,message);
    return smartFallback(ctx,message);
  }

  function classifyListType(m){
    if(/vip.*pendente|pendente.*vip/.test(m)) return 'vipPending';
    if(/vip/.test(m)) return 'vip';
    if(/token|acesso individual|link individual/.test(m)) return 'missingTokens';
    if(/sem mesa|confirmados sem mesa/.test(m)) return 'missingTables';
    if(/telefone|contacto|contato|sem contacto|sem telefone/.test(m)) return 'missingPhones';
    if(/abriu.*nao|abriu.*não|sem confirmar/.test(m)) return 'openedNoConfirm';
    if(/abriram|abriu|abertos|aberto|visualizaram|acessaram/.test(m)) return 'opened';
    if(/nao abrir|não abrir|nao aberto|não aberto|por abrir|nunca abriu/.test(m)) return 'notOpened';
    if(/confirmad|confirmaram|rsvp/.test(m)) return 'confirmed';
    if(/recus|declin|nao vai|não vai/.test(m)) return 'declined';
    if(/check.?in|ja entrou|já entrou/.test(m)) return 'checkedIn';
    return 'pending';
  }
  async function getValidContexts(limit=30){
    const contexts=await getAllContexts(limit);
    return contexts.filter(c=>c&&c.analysis);
  }
  function attachInvite(list,ctx){return (list||[]).map(g=>Object.assign({},g,{__inviteTitle:shortInvite(ctx),__inviteId:inviteIdOf(ctx)}));}
  function guestRowWithInvite(g,extra=''){const inv=g.__inviteTitle?`${g.__inviteTitle} · `:''; return `<div class="lz-op-list-row"><div><strong>${esc(getName(g)||'Sem nome')}</strong><small>${esc(inv)}${esc(displayTable(g))} · ${esc(getCategory(g))} · ${esc(g.status||g.guestStatus||'sem estado')} · ${peopleCount(g)} pessoa(s)${extra?` · ${esc(extra)}`:''}</small></div><small>#${esc(getNumber(g))}</small></div>`;}
  function inviteHeaderRow(ctx,count,extra='',cmd='Mapa'){return `<div class="lz-op-invite-head"><div><strong>${esc(shortInvite(ctx))}</strong><small>${esc(extra)}</small></div><b>${esc(count)}</b><button class="lz-op-mini" data-op-action="select-invite" data-op-payload="${esc(inviteIdOf(ctx))}">Focar</button><button class="lz-op-mini" data-op-action="ask" data-op-payload="${esc(cmd)}">Ver</button></div>`;}
  async function routeMulti(message,m){
    if(/^(ajuda|help|comandos|o que podes|manual)/.test(m)) return multiHelp();
    if(/plano de acao|plano de ação|o que devo fazer|o que fazer agora|prioridades agora/.test(m)) return multiActionPlan();
    if(/comparar|ranking|qual convite|pior taxa|melhor taxa|mais pendentes|precisa de atencao|precisa de atenção/.test(m)) return compareInvitesSmart(message,m);
    if(/funil|funnel|jornada|conversao|conversão/.test(m)) return viewMultiFunnel();
    if(/risco|prioridade|urgente|critico|crítico|alerta/.test(m)) return viewMultiRisks();
    if(/qualidade|higiene|auditoria|dados ruins|inconsisten/.test(m)) return viewMultiQuality();
    if(/recepcao|recepção|entrada|dia do evento/.test(m)) return viewMultiReception();
    if(/mesa|mesas|seating|lugares|lotacao|lotação/.test(m)&&!/sem mesa|mesa\s+\w+/.test(m)) return viewMultiGroups('table');
    if(/categoria|categorias|grupo|grupos/.test(m)&&!/categoria\s+/.test(m)) return viewMultiGroups('category');
    if(/whats|mensagem|lembrete|texto|enviar|copy|copiar texto/.test(m)) return generateMultiMessage(message,m);
    if(/relatorio|relatório|report|resumo executivo|cliente/.test(m)) return generateMultiReport();
    if(/duplicad|repetid|nomes iguais|mesma pessoa/.test(m)) return viewMultiDuplicates();
    if(/nome.*err|limpar|corrigir nomes|nomes estranhos|bad names|reparar nomes/.test(m)) return viewMultiBadNames();
    const profile=message.match(/(?:perfil|detalhes|ver convidado|convidado)\s+(.+)/i); if(profile) return searchAllGuests(profile[1]);
    const search=message.match(/(?:procura|procurar|buscar|pesquisar|encontra|encontrar)\s+(.+)/i); if(search) return searchAllGuests(search[1]);
    const table=message.match(/mesa\s+([\w\-\/]+)/i); if(table) return viewMultiFiltered({table:table[1],raw:message},`Mesa ${table[1]}`);
    const cat=message.match(/categoria\s+(.+)/i); if(cat) return viewMultiFiltered({category:cat[1],raw:message},`Categoria ${cat[1]}`);
    if(/sem contacto.*sem token|sem token.*sem contacto|sem telefone.*sem token|sem token.*sem telefone|com acompanhantes|sem acompanhantes/.test(m)) return viewMultiFiltered({raw:message},'Filtro combinado');
    if(/filtra|filtrar|separa|separar|segmenta|segmentar|lista|listar|mostra|mostrar|ver /.test(m)) return viewMultiFiltered({raw:message},'Filtro avançado');
    if(/pendente|nao abrir|não abrir|abriu|confirmad|recus|check|token|contacto|telefone|sem mesa|vip|rsvp/.test(m)) return viewMultiList(classifyListType(m));
    return viewMultiMap();
  }
  function multiHelp(){return `<strong>Modo multi-convite activo</strong><br>Agora os resultados são separados por convite, sem misturar listas de clientes.<ul><li><b>Quantos convidados abriram o convite rosalina-monteiro?</b></li><li><b>Quem confirmou no convite minoca-abubacar?</b></li><li><b>Lista pendentes mesa 5 do convite calate-helder</b></li><li><b>Quantos convidados sem contacto por convite?</b></li><li><b>Riscos por convite</b></li><li><b>Funil por convite</b></li><li><b>Relatório geral</b></li></ul><div class="lz-op-actions">${actionAsk('Mapa geral','Mapa geral',true)}${actionAsk('Pendentes por convite','Pendentes por convite')}${actionAsk('Riscos por convite','Riscos por convite')}</div>`;}
  async function viewMultiMap(){const contexts=await getValidContexts(); const totals=contexts.reduce((acc,c)=>{acc.g+=c.analysis.guests.length;acc.c+=c.analysis.confirmed.length;acc.p+=c.analysis.pending.length;acc.n+=c.analysis.notOpened.length;acc.o+=c.analysis.openedNoConfirm.length;return acc;},{g:0,c:0,p:0,n:0,o:0}); return `<strong>Mapa geral separado por convite</strong><br>Não estou a unir os dados: cada bloco abaixo pertence a um convite específico.${metric('Convites analisados',contexts.length)}${metric('Convidados totais',totals.g)}${metric('Confirmados totais',`${totals.c} (${fmtPct(totals.c,totals.g)}%)`)}${metric('Pendentes totais',totals.p)}<div class="lz-op-list">${contexts.map(c=>inviteHeaderRow(c,c.analysis.score+'%',`${c.analysis.guests.length} convidados · ${c.analysis.confirmed.length} confirmados · ${c.analysis.pending.length} pendentes · ${c.analysis.notOpened.length} não abriram`,'Mapa')).join('')}</div><div class="lz-op-actions">${actionAsk('Pendentes por convite','Pendentes por convite',true)}${actionAsk('Funil por convite','Funil por convite')}${actionAsk('Riscos por convite','Riscos por convite')}</div>`;}
  async function viewMultiList(type){const contexts=await getValidContexts(); let flat=[]; const groups=contexts.map(c=>{const [title,list,desc]=listMap(c,type); flat=flat.concat(attachInvite(list,c)); return {ctx:c,title,list,desc};}); state.lastList=flat; const total=flat.length; const title=groups[0]?.title||'Lista'; return `<strong>${esc(title)} por convite</strong><br>Resultado separado por convite. Total global apenas para referência: <b>${total}</b>.<div class="lz-op-list multi">${groups.map(g=>`<div class="lz-op-invite-block">${inviteHeaderRow(g.ctx,g.list.length,g.desc,type)}${g.list.length?g.list.slice(0,6).map(x=>guestRow(x)).join(''):`<div class="lz-op-card"><span>Sem registos neste convite.</span></div>`}${g.list.length>6?`<div class="lz-op-card"><span>+ ${g.list.length-6} registo(s) deste convite fora da prévia.</span></div>`:''}</div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar tudo separado</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV com coluna Convite</button>${['pending','notOpened','openedNoConfirm'].includes(type)?'<button class="lz-op-action" data-op-action="ask" data-op-payload="Mensagem por convite">Gerar mensagens</button>':''}</div>`;}
  async function viewMultiFiltered(criteria,title='Filtro'){const contexts=await getValidContexts(); let flat=[]; const groups=contexts.map(c=>{const list=filterGuests(c,criteria); flat=flat.concat(attachInvite(list,c)); return {ctx:c,list};}); state.lastList=flat; return `<strong>${esc(title)} — separado por convite</strong><br>Filtro aplicado individualmente em cada convite. Total encontrado: <b>${flat.length}</b>.<div class="lz-op-list multi">${groups.map(g=>`<div class="lz-op-invite-block">${inviteHeaderRow(g.ctx,g.list.length,'resultado(s) neste convite',title)}${g.list.length?g.list.slice(0,7).map(x=>guestRow(x)).join(''):`<div class="lz-op-card"><span>Sem resultados neste convite.</span></div>`}${g.list.length>7?`<div class="lz-op-card"><span>+ ${g.list.length-7} deste convite.</span></div>`:''}</div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar resultado</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button></div>`;}
  async function viewMultiFunnel(){const contexts=await getValidContexts(); return `<strong>Funil RSVP por convite</strong><br>Cada convite tem o seu próprio funil, sem mistura de convidados.<div class="lz-op-cards">${contexts.map(c=>{const a=c.analysis; return `<div class="lz-op-card"><strong>${esc(shortInvite(c))}</strong><span>Base: ${a.guests.length} · Não abriram: ${a.notOpened.length} · Abriram sem confirmar: ${a.openedNoConfirm.length} · Confirmados: ${a.confirmed.length} (${a.rsvpRate}%) · Check-in: ${a.checkedIn.length}</span><div class="lz-op-funnel"><div><span>Confirmados</span><b>${a.confirmed.length}</b><i style="width:${Math.max(2,a.rsvpRate)}%"></i><small>${a.rsvpRate}%</small></div></div></div>`;}).join('')}</div><div class="lz-op-actions">${actionAsk('Não abriram por convite','Não abriram por convite',true)}${actionAsk('Abriram sem confirmar','Abriram sem confirmar')}</div>`;}
  async function viewMultiRisks(){const contexts=await getValidContexts(); const html=contexts.map(c=>{const a=c.analysis; const risks=[]; if(a.missingTokens.length) risks.push(`${a.missingTokens.length} sem token`); if(a.duplicateTokens.length) risks.push(`${a.duplicateTokens.length} tokens repetidos`); if(a.vipPending.length) risks.push(`${a.vipPending.length} VIP pendente(s)`); if(a.missingTables.length) risks.push(`${a.missingTables.length} confirmados sem mesa`); if(a.duplicated.length) risks.push(`${a.duplicated.length} duplicados prováveis`); if(!risks.length) risks.push('sem riscos fortes'); return `<div class="lz-op-list-row"><div><strong>${esc(shortInvite(c))}</strong><small>${esc(risks.join(' · '))}</small></div><b>${a.score}%</b></div>`;}).join(''); return `<strong>Riscos por convite</strong><br>Separação de prioridades por cada cliente/convite.<div class="lz-op-list">${html}</div><div class="lz-op-actions">${actionAsk('Qualidade por convite','Qualidade por convite',true)}${actionAsk('Sem token por convite','Sem token por convite')}</div>`;}
  async function viewMultiQuality(){const contexts=await getValidContexts(); return `<strong>Auditoria de dados por convite</strong><br>Separação de problemas por convite.<div class="lz-op-list">${contexts.map(c=>{const a=c.analysis; return `<div class="lz-op-list-row"><div><strong>${esc(shortInvite(c))}</strong><small>Nomes: ${a.badNames.length} · Sem contacto: ${a.missingPhones.length} · Sem token: ${a.missingTokens.length} · Contactos repetidos: ${a.duplicatePhones.length}</small></div><b>${a.score}%</b></div>`;}).join('')}</div><div class="lz-op-actions">${actionAsk('Nomes estranhos por convite','Nomes estranhos por convite',true)}${actionAsk('Sem contacto por convite','Sem contacto por convite')}</div>`;}
  async function viewMultiReception(){const contexts=await getValidContexts(); let flat=[]; return `<strong>Recepção por convite</strong><br>Briefing separado para cada evento/convite.<div class="lz-op-list">${contexts.map(c=>{const a=c.analysis; const pendingEntry=a.confirmed.filter(g=>!a.checkedIn.includes(g)); flat=flat.concat(attachInvite(pendingEntry,c)); return `<div class="lz-op-list-row"><div><strong>${esc(shortInvite(c))}</strong><small>Esperados: ${a.confirmed.length} · Pessoas previstas: ${a.totalPeople} · Por entrar: ${pendingEntry.length} · Sem mesa: ${a.missingTables.length}</small></div><b>${a.checkinRate}%</b></div>`;}).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar por entrar</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button></div>`;}
  async function viewMultiGroups(kind='table'){const contexts=await getValidContexts(); const label=kind==='category'?'Categorias':'Mesas'; return `<strong>${label} por convite</strong><br>Distribuição separada por convite.<div class="lz-op-cards">${contexts.map(c=>{const map=kind==='category'?c.analysis.byCategory:c.analysis.byTable; const top=sortedEntries(map).slice(0,8).map(([k,l])=>`${k}: ${l.length}`).join(' · ')||'sem dados'; return `<div class="lz-op-card"><strong>${esc(shortInvite(c))}</strong><span>${esc(top)}</span></div>`;}).join('')}</div>`;}
  async function viewMultiDuplicates(){const contexts=await getValidContexts(); let flat=[]; const html=contexts.map(c=>{const d=c.analysis.duplicated; d.forEach(cl=>flat=flat.concat(attachInvite(cl.items,c))); return `<div class="lz-op-invite-block">${inviteHeaderRow(c,d.length,'cluster(s) provável(eis)','Duplicados')}${d.length?d.slice(0,5).map((cl,i)=>`<div class="lz-op-card"><strong>${i+1}. ${esc(cl.type)}</strong><span>${esc(cl.items.map(g=>getName(g)).join(' / '))}</span></div>`).join(''):`<div class="lz-op-card"><span>Sem duplicados fortes.</span></div>`}</div>`;}).join(''); state.lastList=flat; return `<strong>Duplicados prováveis por convite</strong><br>Não mistura nomes de convites diferentes.<div class="lz-op-list multi">${html}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar lista</button></div>`;}
  async function viewMultiBadNames(){const contexts=await getValidContexts(); let flat=[]; const html=contexts.map(c=>{const list=c.analysis.badNames; flat=flat.concat(attachInvite(list.map(x=>x.guest),c)); return `<div class="lz-op-invite-block">${inviteHeaderRow(c,list.length,'nome(s) a rever','Nomes estranhos')}${list.length?list.slice(0,6).map(x=>`<div class="lz-op-card"><strong>${esc(getName(x.guest)||'Sem nome')}</strong><span>${esc(x.issues.join(', '))}</span></div>`).join(''):`<div class="lz-op-card"><span>Sem problemas fortes nos nomes.</span></div>`}</div>`;}).join(''); state.lastList=flat; return `<strong>Nomes problemáticos por convite</strong><br>Revisão separada por convite.<div class="lz-op-list multi">${html}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar nomes</button></div>`;}
  async function searchAllGuests(q){const contexts=await getValidContexts(); const needle=norm(q); let flat=[]; const groups=contexts.map(c=>{const list=c.analysis.guests.filter(g=>norm(getName(g)).includes(needle)||norm(getPhone(g)).includes(needle)||norm(displayTable(g)).includes(needle)||norm(getCategory(g)).includes(needle)||norm(getNumber(g)).includes(needle)); flat=flat.concat(attachInvite(list,c)); return {ctx:c,list};}); state.lastList=flat; return `<strong>Pesquisa em todos os convites</strong><br>Resultado separado para: <b>${esc(q)}</b>. Total: <b>${flat.length}</b>.<div class="lz-op-list multi">${groups.map(g=>`<div class="lz-op-invite-block">${inviteHeaderRow(g.ctx,g.list.length,'resultado(s)','Pesquisar')}${g.list.length?g.list.slice(0,6).map(x=>guestRow(x,getPhone(x)||'sem contacto')).join(''):`<div class="lz-op-card"><span>Sem resultado neste convite.</span></div>`}</div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar pesquisa</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button></div>`;}
  async function generateMultiMessage(message,m){const type=classifyListType(m); const contexts=await getValidContexts(); const blocks=[]; let flat=[]; contexts.forEach(c=>{const [target,list]=listMap(c,type); flat=flat.concat(attachInvite(list,c)); const deadline=c.invite?.rsvpDeadline?fmtDate(c.invite.rsvpDeadline):'a data indicada'; const link=c.invite?.publicUrl||'[link do convite]'; const text=`Olá, [Nome]. Esperamos que esteja bem. Lembramos com carinho sobre a confirmação de presença no casamento de ${shortInvite(c)}. Por favor, confirme até ${deadline}: ${link}`; blocks.push(`### ${shortInvite(c)}\nSegmento: ${target} · ${list.length} convidado(s)\n${text}`);}); const out=blocks.join('\n\n'); state.lastMessage=out; state.lastList=flat; return `<strong>Mensagens por convite</strong><br>Gerei mensagens separadas por convite, com nome/link/prazo de cada evento quando disponível.<div class="lz-op-card"><span>${esc(out).replace(/\n/g,'<br>')}</span></div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-message">Copiar mensagens</button><button class="lz-op-action" data-op-action="copy-list">Copiar segmentos</button></div>`;}
  async function generateMultiReport(){const contexts=await getValidContexts(); const report=contexts.map(c=>{const a=c.analysis; return `RELATÓRIO — ${shortInvite(c)}\n- Saúde: ${a.score}%\n- Convidados: ${a.guests.length}\n- Confirmados: ${a.confirmed.length} (${a.rsvpRate}%)\n- Pendentes: ${a.pending.length}\n- Não abriram: ${a.notOpened.length}\n- Abriram sem confirmar: ${a.openedNoConfirm.length}\n- Duplicados prováveis: ${a.duplicated.length}\n- Confirmados sem mesa: ${a.missingTables.length}`;}).join('\n\n'); state.lastReport=report; return `<strong>Relatório geral separado por convite</strong><br>Preparei um bloco para cada convite, sem consolidar indevidamente os dados.<div class="lz-op-card"><span>${esc(report).replace(/\n/g,'<br>')}</span></div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-report">Copiar relatório</button></div>`;}

  function help(ctx){return `<strong>Comandos Ultra disponíveis</strong><br>Estou focado no convite <b>${esc(shortInvite(ctx))}</b>.<ul><li><b>Mapa</b> — central operacional do convite.</li><li><b>Funil RSVP</b> — não abriu → abriu → confirmou → check-in.</li><li><b>Pendentes mesa 5</b>, <b>não abriram categoria família</b>, <b>confirmados sem mesa</b>.</li><li><b>Mesas</b>, <b>Categorias</b>, <b>Famílias</b>, <b>Riscos</b>, <b>Qualidade</b>.</li><li><b>Recepção</b> — briefing para equipa de entrada.</li><li><b>Perfil Ana</b> — visão 360º de um convidado.</li><li><b>Comparar convites</b> — ranking multi-cliente.</li></ul><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="ask" data-op-payload="Mapa">Mapa</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Funil RSVP">Funil</button><button class="lz-op-action" data-op-action="ask" data-op-payload="Riscos">Riscos</button></div>`;}
  function scoreClass(score){return score>=80?'ok':score>=58?'warn':'bad';}
  function metric(label,value){return `<div class="metric-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;}
  function badges(items){return `<div class="lz-op-badges">${items.map(x=>`<span class="lz-op-badge ${x[2]||''}">${esc(x[0])}: <b>${esc(x[1])}</b></span>`).join('')}</div>`;}
  function actionAsk(label,payload,primary=false){return `<button class="lz-op-action ${primary?'primary':''}" data-op-action="ask" data-op-payload="${esc(payload||label)}">${esc(label)}</button>`;}
  function viewMap(ctx){const a=ctx.analysis; return `<span class="lz-op-score ${scoreClass(a.score)}">${a.score}%</span><strong>Mapa operacional — ${esc(shortInvite(ctx))}</strong><br>Esta é a leitura central do convite seleccionado.${badges([['Convidados',a.guests.length],['RSVP',a.rsvpRate+'%'],['Abertura',a.openRate+'%'],['Check-in',a.checkinRate+'%'],['Pessoas previstas',a.totalPeople]])}${metric('Pendentes',a.pending.length)}${metric('Não abriram',a.notOpened.length)}${metric('Abriram sem confirmar',a.openedNoConfirm.length)}${metric('Possíveis duplicados',a.duplicated.length)}${metric('Confirmados sem mesa',a.missingTables.length)}<div class="lz-op-actions">${actionAsk('Funil','Funil RSVP',true)}${actionAsk('Riscos','Riscos')}${actionAsk('Mesas','Mesas')}${actionAsk('Relatório','Relatório')}</div>`;}
  function viewFunnel(ctx){const a=ctx.analysis; const total=a.guests.length; const steps=[['Base total',total,100],['Não abriram',a.notOpened.length,fmtPct(a.notOpened.length,total)],['Abriram sem confirmar',a.openedNoConfirm.length,fmtPct(a.openedNoConfirm.length,total)],['Confirmados',a.confirmed.length,a.rsvpRate],['Check-in feito',a.checkedIn.length,fmtPct(a.checkedIn.length,total)]]; return `<strong>Funil RSVP — ${esc(shortInvite(ctx))}</strong><br>Mostra onde cada convidado está na jornada do convite.<div class="lz-op-funnel">${steps.map(s=>`<div><span>${esc(s[0])}</span><b>${esc(s[1])}</b><i style="width:${Math.max(2,Math.min(100,s[2]))}%"></i><small>${esc(s[2])}%</small></div>`).join('')}</div><div class="lz-op-actions">${actionAsk('Não abriram','Não abriram',true)}${actionAsk('Abriram sem confirmar','Abriram sem confirmar')}${actionAsk('Mensagem','Mensagem WhatsApp')}</div>`;}
  function viewRisks(ctx){const a=ctx.analysis; const items=[]; if(a.missingTokens.length) items.push(['Crítico',`${a.missingTokens.length} sem token`, 'Corrigir antes de enviar links.']); if(a.duplicateTokens.length) items.push(['Crítico',`${a.duplicateTokens.length} tokens repetidos`, 'Risco de acesso trocado.']); if(a.vipPending.length) items.push(['Alta',`${a.vipPending.length} VIP pendente(s)`, 'Priorizar contacto manual.']); if(a.openedNoConfirm.length) items.push(['Média',`${a.openedNoConfirm.length} abriram sem confirmar`, 'Melhor alvo para lembrete.']); if(a.notOpened.length) items.push(['Média',`${a.notOpened.length} não abriram`, 'Pode indicar link não enviado ou falta de contacto.']); if(a.missingTables.length) items.push(['Operação',`${a.missingTables.length} confirmados sem mesa`, 'Impacta recepção e seating.']); if(a.duplicated.length) items.push(['Dados',`${a.duplicated.length} possíveis duplicados`, 'Rever antes da lista final.']); if(!items.length) items.push(['OK','Sem riscos fortes','O convite está estável.']); return `<strong>Riscos e prioridades</strong><br>Lista ordenada do que pode afectar a entrega do convite.<div class="lz-op-cards">${items.map(x=>`<div class="lz-op-card"><strong>${esc(x[0])} · ${esc(x[1])}</strong><span>${esc(x[2])}</span></div>`).join('')}</div><div class="lz-op-actions">${actionAsk('Qualidade','Qualidade',true)}${actionAsk('Pendentes','Pendentes')}${actionAsk('Duplicados','Duplicados')}</div>`;}
  function viewQuality(ctx){const a=ctx.analysis; return `<strong>Auditoria de dados</strong><br>Verificação de consistência da base de convidados.${metric('Nomes problemáticos',a.badNames.length)}${metric('Contactos em falta',a.missingPhones.length)}${metric('Contactos repetidos',a.duplicatePhones.length)}${metric('Tokens em falta',a.missingTokens.length)}${metric('Tokens repetidos',a.duplicateTokens.length)}${metric('RSVP órfãos',a.orphanRsvps.length)}<div class="lz-op-actions">${actionAsk('Nomes estranhos','Nomes estranhos',true)}${actionAsk('Sem contacto','Sem contacto')}${actionAsk('Sem token','Sem token')}</div>`;}
  function viewRunbook(ctx){const a=ctx.analysis,i=ctx.invite||{}; const eventDate=i.eventDateISO||i.eventDate||''; const days=eventDate?Math.ceil((new Date(eventDate)-new Date())/86400000):null; const tasks=[['Enviar lembrete aos que abriram sem confirmar',a.openedNoConfirm.length?'Pendente':'OK'],['Contactar convidados que não abriram',a.notOpened.length?'Pendente':'OK'],['Rever duplicados antes da lista final',a.duplicated.length?'Pendente':'OK'],['Definir mesas dos confirmados',a.missingTables.length?'Pendente':'OK'],['Exportar lista de recepção',a.confirmed.length?'Pronto':'Aguardar'],['Validar tokens individuais',a.missingTokens.length?'Pendente':'OK']]; return `<strong>Checklist pré-evento</strong><br>${days===null?'Data do evento não detectada.':days>=0?`Faltam <b>${days}</b> dia(s) para o evento.`:`Evento já passou há <b>${Math.abs(days)}</b> dia(s).`}<div class="lz-op-cards">${tasks.map(t=>`<div class="lz-op-card"><strong>${esc(t[1])}</strong><span>${esc(t[0])}</span></div>`).join('')}</div><div class="lz-op-actions">${actionAsk('Recepção','Recepção',true)}${actionAsk('Relatório','Relatório')}</div>`;}
  function viewReception(ctx){const a=ctx.analysis; const confirmedNoCheck=a.confirmed.filter(g=>!a.checkedIn.includes(g)); state.lastList=confirmedNoCheck; return `<strong>Briefing da recepção — ${esc(shortInvite(ctx))}</strong><br>Resumo para equipa de entrada/check-in.${metric('Confirmados esperados',a.confirmed.length)}${metric('Pessoas previstas',a.totalPeople)}${metric('Check-in já feito',a.checkedIn.length)}${metric('Por entrar',confirmedNoCheck.length)}${metric('Confirmados sem mesa',a.missingTables.length)}${metric('Sem contacto',a.confirmed.filter(g=>!getPhone(g)).length)}<div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar por entrar</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button>${actionAsk('Confirmados sem mesa','Confirmados sem mesa')}</div>`;}
  function viewTables(ctx){const a=ctx.analysis; const entries=sortedEntries(a.byTable).slice(0,22); return `<strong>Mapa de mesas</strong><br>Distribuição actual por mesa. Inclui pendentes e confirmados, porque a base pode ainda estar em preparação.<div class="lz-op-list">${entries.map(([table,list])=>{const conf=list.filter(g=>a.confirmed.includes(g)).length; const people=list.reduce((s,g)=>s+peopleCount(g),0); return `<div class="lz-op-list-row"><div><strong>${esc(table)}</strong><small>${list.length} convidado(s) · ${conf} confirmado(s) · ${people} pessoa(s)</small></div><button class="lz-op-mini" data-op-action="ask" data-op-payload="mesa ${esc(table)}">Ver</button></div>`;}).join('')}</div><div class="lz-op-actions">${actionAsk('Sem mesa','Confirmados sem mesa',true)}${actionAsk('Recepção','Recepção')}</div>`;}
  function viewCategories(ctx){const a=ctx.analysis; const entries=sortedEntries(a.byCategory).slice(0,24); return `<strong>Categorias / grupos</strong><br>Separação operacional dos convidados por categoria.<div class="lz-op-list">${entries.map(([cat,list])=>{const conf=list.filter(g=>a.confirmed.includes(g)).length; const pend=list.filter(g=>a.pending.includes(g)).length; return `<div class="lz-op-list-row"><div><strong>${esc(cat)}</strong><small>${list.length} total · ${conf} confirmado(s) · ${pend} pendente(s)</small></div><button class="lz-op-mini" data-op-action="ask" data-op-payload="categoria ${esc(cat)}">Ver</button></div>`;}).join('')}</div><div class="lz-op-actions">${actionAsk('VIP pendentes','vip pendentes',true)}${actionAsk('Famílias','Famílias')}</div>`;}
  function viewFamilies(ctx){const groups=ctx.analysis.familyGroups; if(!groups.length) return `<strong>Famílias prováveis</strong><br>Não encontrei agrupamentos fortes por apelido/nome familiar.`; return `<strong>Famílias prováveis</strong><br>Agrupamento automático por apelido/base de nome. Não altera dados, só ajuda na revisão.<div class="lz-op-list">${groups.slice(0,18).map(([family,list])=>`<div class="lz-op-list-row"><div><strong>${esc(cap(family))}</strong><small>${list.map(g=>getName(g)).slice(0,4).join(' · ')}${list.length>4?'...':''}</small></div><b>${list.length}</b></div>`).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-families">Copiar famílias</button></div>`;}
  function listMap(ctx,type){const a=ctx.analysis; const map={pending:['Pendentes',a.pending,'Ainda não confirmaram nem recusaram.'],opened:['Abriram o convite',a.opened,'Já abriram/acederam ao convite.'],notOpened:['Não abriram',a.notOpened,'Ainda não abriram o convite.'],openedNoConfirm:['Abriram sem confirmar',a.openedNoConfirm,'Abriram, mas não concluíram o RSVP.'],confirmed:['Confirmados',a.confirmed,'Presença confirmada.'],declined:['Recusados',a.declined,'Indicaram ausência/recusa.'],checkedIn:['Check-in feito',a.checkedIn,'Já entraram no evento.'],missingTokens:['Sem token',a.missingTokens,'Sem token/link individual.'],missingTables:['Confirmados sem mesa',a.missingTables,'Confirmaram, mas não têm mesa definida.'],missingPhones:['Sem contacto',a.missingPhones,'Sem telefone registado.'],vip:['VIP',a.vipGuests,'Convidados detectados como VIP/honra.'],vipPending:['VIP pendentes',a.vipPending,'VIPs ainda sem confirmação.']};return map[type]||map.pending;}
  function guestRow(g,extra=''){return `<div class="lz-op-list-row"><div><strong>${esc(getName(g)||'Sem nome')}</strong><small>${esc(displayTable(g))} · ${esc(getCategory(g))} · ${esc(g.status||g.guestStatus||'sem estado')} · ${peopleCount(g)} pessoa(s)${extra?` · ${esc(extra)}`:''}</small></div><small>#${esc(getNumber(g))}</small></div>`;}
  function viewList(ctx,type){const [title,list,desc]=listMap(ctx,type); state.lastList=list; const rows=list.slice(0,MAX_PREVIEW).map(g=>guestRow(g)).join(''); return `<strong>${esc(title)} — ${esc(shortInvite(ctx))}</strong><br>${esc(desc)}<div class="metric-row"><span>Total encontrado</span><b>${list.length}</b></div>${list.length?`<div class="lz-op-list">${rows}${list.length>MAX_PREVIEW?`<div class="lz-op-card"><span>+ ${list.length-MAX_PREVIEW} registo(s) não exibidos nesta prévia.</span></div>`:''}</div>`:'<div class="lz-op-card"><strong>Lista vazia</strong><span>Nenhum registo encontrado nesta categoria.</span></div>'}<div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar lista</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button>${['pending','notOpened','openedNoConfirm'].includes(type)?'<button class="lz-op-action" data-op-action="ask" data-op-payload="Mensagem WhatsApp">Gerar lembrete</button>':''}</div>`;}
  function filterGuests(ctx,criteria={}){const a=ctx.analysis; let list=a.guests.slice(); const m=norm(criteria.raw||'');
    if(criteria.base==='pending'||/pendente/.test(m)) list=list.filter(g=>a.pending.includes(g));
    if(criteria.base==='confirmed'||/confirmad/.test(m)) list=list.filter(g=>a.confirmed.includes(g));
    if(criteria.base==='notOpened'||/nao abrir|não abrir|nao aberto|não aberto/.test(m)) list=list.filter(g=>a.notOpened.includes(g));
    if(criteria.base==='openedNoConfirm'||/abriu|abriram|sem confirmar/.test(m)) list=list.filter(g=>a.openedNoConfirm.includes(g));
    if(/vip/.test(m)) list=list.filter(isVip);
    if(/sem mesa/.test(m)) list=list.filter(isTableMissing);
    if(/sem contacto|sem telefone|telefone vazio/.test(m)) list=list.filter(g=>!getPhone(g));
    if(/sem token/.test(m)) list=list.filter(g=>!hasToken(g));
    if(/com acompanhantes|acompanhantes/.test(m)&&!/sem acompanhantes/.test(m)) list=list.filter(g=>peopleCount(g)>1);
    if(/sem acompanhantes/.test(m)) list=list.filter(g=>peopleCount(g)<=1);
    const table=criteria.table||((criteria.raw||'').match(/mesa\s+([\w\-\/]+)/i)||[])[1]; if(table) list=list.filter(g=>norm(displayTable(g))===norm(table)||norm(displayTable(g)).includes(norm(table)));
    const cat=criteria.category||((criteria.raw||'').match(/categoria\s+(.+)/i)||[])[1]; if(cat) list=list.filter(g=>norm(getCategory(g)).includes(norm(cat)));
    const phone=(criteria.raw||'').match(/(?:telefone|contacto|contato)\s+([\d+ ]{3,})/i); if(phone) list=list.filter(g=>norm(getPhone(g)).includes(norm(phone[1])));
    const name=(criteria.raw||'').match(/(?:nome|pessoa|convidado)\s+(.+)/i); if(name) list=list.filter(g=>norm(getName(g)).includes(norm(name[1])));
    return list;
  }
  function viewFiltered(ctx,criteria,title='Filtro'){const list=filterGuests(ctx,criteria); state.lastList=list; return `<strong>${esc(title)} — ${esc(shortInvite(ctx))}</strong><br>Filtro aplicado dentro do convite seleccionado.<div class="metric-row"><span>Resultados</span><b>${list.length}</b></div>${list.length?`<div class="lz-op-list">${list.slice(0,MAX_PREVIEW).map(g=>guestRow(g)).join('')}${list.length>MAX_PREVIEW?`<div class="lz-op-card"><span>+ ${list.length-MAX_PREVIEW} registo(s) fora da prévia.</span></div>`:''}</div>`:'<div class="lz-op-card"><strong>Sem resultados</strong><span>Não encontrei convidados para este filtro.</span></div>'}<div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar lista</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button>${actionAsk('Ajuda filtros','Ajuda')}</div>`;}
  function viewCustomFilter(ctx,message){return viewFiltered(ctx,{raw:message},'Filtro avançado');}
  function viewDuplicates(ctx){const dup=ctx.analysis.duplicated; if(!dup.length) return `<strong>Duplicados</strong><br>Não encontrei duplicados fortes com as regras actuais.<div class="lz-op-actions">${actionAsk('Nomes estranhos','Nomes estranhos')}</div>`; const cards=dup.slice(0,12).map((c,i)=>`<div class="lz-op-card"><strong>${i+1}. ${esc(c.type)}</strong><span>${c.items.map(g=>esc(getName(g))).join(' · ')}</span></div>`).join(''); return `<strong>Possíveis duplicados</strong><br>Encontrei <b>${dup.length}</b> grupo(s). Não apliquei nada automaticamente.<div class="lz-op-cards">${cards}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-duplicates">Copiar duplicados</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button></div>`;}
  function viewBadNames(ctx){const bad=ctx.analysis.badNames; if(!bad.length) return `<strong>Limpeza de nomes</strong><br>Não encontrei nomes problemáticos com as regras actuais.`; const rows=bad.slice(0,16).map(x=>`<div class="lz-op-list-row"><div><strong>${esc(getName(x.guest)||'Sem nome')}</strong><small>${esc(x.issues.join(', '))}</small></div></div>`).join(''); return `<strong>Nomes a rever</strong><br>Encontrei <b>${bad.length}</b> nome(s) com sinais de inconsistência.<div class="lz-op-list">${rows}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-badnames">Copiar revisão</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button></div>`;}
  function targetFromMessage(ctx,m){const a=ctx.analysis; if(/nao abrir|não abrir|nao aberto|não aberto/.test(m)) return ['não abertos',a.notOpened]; if(/abriu|abriram|sem confirmar/.test(m)) return ['abriram sem confirmar',a.openedNoConfirm]; if(/vip/.test(m)) return ['VIP pendentes',a.vipPending]; if(/mesa/.test(m)||/categoria/.test(m)||/sem contacto|sem telefone|sem mesa/.test(m)) return ['filtro aplicado',filterGuests(ctx,{raw:m})]; return ['pendentes',a.pending];}
  function generateMessage(ctx,m){const [target,list]=targetFromMessage(ctx,m); const deadline=ctx.invite?.rsvpDeadline?fmtDate(ctx.invite.rsvpDeadline):'a data indicada'; const link=ctx.invite?.publicUrl||'[link do convite]'; const couple=shortInvite(ctx); let tone='elegante'; if(/curt/.test(m)) tone='curta'; if(/formal/.test(m)) tone='formal'; if(/relig/.test(m)) tone='religiosa'; const text=tone==='curta'?`Olá, [Nome]. Lembramos com carinho que a confirmação para o casamento de ${couple} está pendente. Confirme até ${deadline}: ${link}`:`Olá, [Nome]. Esperamos que esteja bem.\n\nPassamos para lembrar com carinho sobre a confirmação de presença no casamento de ${couple}.\n\nPor favor, aceda ao convite e confirme a sua presença até ${deadline}:\n${link}\n\nCom carinho,\nEquipa Lirandzo`; state.lastMessage=text; state.lastList=list; return `<strong>Mensagem WhatsApp pronta</strong><br>Segmento: <b>${esc(target)}</b> · ${list.length} convidado(s) · tom ${esc(tone)}.<div class="lz-op-card"><span>${esc(text).replace(/\n/g,'<br>')}</span></div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-message">Copiar mensagem</button><button class="lz-op-action" data-op-action="copy-list">Copiar segmento</button>${actionAsk('Ver segmento',target)}</div>`;}
  function generateReport(ctx){const a=ctx.analysis,i=ctx.invite||{}; const tableTop=sortedEntries(a.byTable).slice(0,6).map(([t,l])=>`${t}: ${l.length}`).join(', ')||'-'; const catTop=sortedEntries(a.byCategory).slice(0,6).map(([c,l])=>`${c}: ${l.length}`).join(', ')||'-'; const report=`RELATÓRIO EXECUTIVO — ${shortInvite(ctx)}\n\nEstado do convite: ${i.status||'-'}\nPacote: ${i.packageLabel||i.packageKey||'-'}\nData do evento: ${fmtDate(i.eventDateISO||i.eventDate)}\nPrazo RSVP: ${fmtDate(i.rsvpDeadline)}\n\nINDICADORES\n- Total de convidados: ${a.guests.length}\n- Capacidade/lista potencial: ${a.totalCapacity} pessoa(s)\n- Confirmados: ${a.confirmed.length} (${a.rsvpRate}%)\n- Pessoas previstas pelos confirmados: ${a.totalPeople}\n- Pendentes: ${a.pending.length}\n- Não abriram: ${a.notOpened.length}\n- Abriram sem confirmar: ${a.openedNoConfirm.length}\n- Recusados: ${a.declined.length}\n- Check-in feito: ${a.checkedIn.length}\n- Mensagens recebidas: ${a.messages.length}\n- Contribuições: ${a.contributions.length}\n- Presentes reservados: ${a.reservedGifts.length}/${a.gifts.length}\n\nSEGMENTOS\n- Mesas com mais registos: ${tableTop}\n- Categorias principais: ${catTop}\n\nDIAGNÓSTICO\nSaúde operacional: ${a.score}%\n${[...a.crit,...a.warn].length?[...a.crit,...a.warn].map(x=>'- '+x).join('\n'):'- Sem alertas críticos detectados.'}\n\nRECOMENDAÇÕES\n1. Enviar lembrete aos convidados que abriram e ainda não confirmaram.\n2. Contactar manualmente VIPs pendentes.\n3. Rever duplicados, contactos repetidos e tokens em falta.\n4. Fechar mesas dos confirmados antes de exportar lista final.\n5. Preparar briefing de recepção no dia do evento.`; state.lastReport=report; return `<strong>Relatório executivo gerado</strong><br>Preparei um resumo mais completo por convite, com segmentos e recomendações.<div class="lz-op-card"><span>${esc(report).replace(/\n/g,'<br>')}</span></div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-report">Copiar relatório</button>${actionAsk('Recepção','Recepção')}${actionAsk('Mensagem','Mensagem WhatsApp')}</div>`;}
  function viewStats(ctx){const a=ctx.analysis;return `<strong>Indicadores detalhados</strong>${metric('Total convidados',a.guests.length)}${metric('Capacidade/lista potencial',a.totalCapacity)}${metric('Confirmados',`${a.confirmed.length} (${a.rsvpRate}%)`)}${metric('Pendentes',a.pending.length)}${metric('Abertura',`${a.openRate}%`)}${metric('Pessoas previstas',a.totalPeople)}${metric('Check-in',`${a.checkedIn.length} (${a.checkinRate}%)`)}${metric('Mensagens',a.messages.length)}${metric('Contribuições',a.contributions.length)}${metric('Presentes reservados',`${a.reservedGifts.length}/${a.gifts.length}`)}<div class="lz-op-actions">${actionAsk('Funil','Funil RSVP',true)}${actionAsk('Mesas','Mesas')}${actionAsk('Categorias','Categorias')}</div>`;}
  function searchGuest(ctx,q){const needle=norm(q); const found=ctx.analysis.guests.filter(g=>norm(getName(g)).includes(needle)||norm(getPhone(g)).includes(needle)||norm(displayTable(g)).includes(needle)||norm(getCategory(g)).includes(needle)||norm(getNumber(g)).includes(needle)).slice(0,20); if(!found.length)return `<strong>Pesquisa</strong><br>Não encontrei convidados para: <b>${esc(q)}</b>.`; state.lastList=found; return `<strong>Pesquisa de convidado</strong><br>Resultado para: <b>${esc(q)}</b><div class="lz-op-list">${found.map(g=>guestRow(g,getPhone(g)||'sem contacto')).join('')}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-list">Copiar resultado</button><button class="lz-op-action" data-op-action="copy-csv">Copiar CSV</button><button class="lz-op-action" data-op-action="go-guests">Abrir convidados</button></div>`;}
  function viewGuestProfile(ctx,q){const needle=norm(q); const g=ctx.analysis.guests.find(x=>norm(getName(x)).includes(needle)||norm(getPhone(x)).includes(needle)||norm(getNumber(x))===needle); if(!g) return searchGuest(ctx,q); const a=ctx.analysis; const flags=[]; if(a.confirmed.includes(g)) flags.push('Confirmado'); if(a.pending.includes(g)) flags.push('Pendente'); if(a.notOpened.includes(g)) flags.push('Não aberto'); if(a.openedNoConfirm.includes(g)) flags.push('Abriu sem confirmar'); if(a.checkedIn.includes(g)) flags.push('Check-in feito'); if(!hasToken(g)) flags.push('Sem token'); if(!getPhone(g)) flags.push('Sem contacto'); if(isTableMissing(g)) flags.push('Sem mesa'); return `<strong>Perfil 360º do convidado</strong><br><b>${esc(getName(g)||'Sem nome')}</b>${badges(flags.map(f=>[f,'',f.includes('Sem')?'bad':'']))}${metric('Mesa',displayTable(g))}${metric('Categoria',getCategory(g))}${metric('Estado',g.status||g.guestStatus||'-')}${metric('Pessoas/acompanhantes',peopleCount(g))}${metric('Contacto',getPhone(g)||'-')}${metric('Número',getNumber(g)||'-')}${metric('Token',hasToken(g)?'Existe':'Em falta')}${metric('Última data detectada',fmtDateTime(dateOf(g,'confirmedAt','rsvpAt','openedAt','lastOpenedAt','checkedInAt','updatedAt','createdAt')))}${getNotes(g)?`<div class="lz-op-card"><strong>Notas</strong><span>${esc(getNotes(g))}</span></div>`:''}<div class="lz-op-actions">${actionAsk('Pesquisar similares',`pesquisar ${getName(g).split(' ')[0]}`,true)}${actionAsk('Mesa','mesa '+displayTable(g))}</div>`;}
  function riskScore(ctx){const a=ctx.analysis; return Math.max(0,Math.min(100,(100-a.score)+(a.missingTokens.length*9)+(a.duplicateTokens.length*11)+(a.missingTables.length*3)+(a.vipPending.length*5)+(a.openedNoConfirm.length*2)+Math.round((a.notOpened.length/(a.guests.length||1))*18)));}
  function topRiskLabel(ctx){const a=ctx.analysis; const items=[]; if(a.missingTokens.length) items.push(`${a.missingTokens.length} sem token`); if(a.missingTables.length) items.push(`${a.missingTables.length} confirmados sem mesa`); if(a.vipPending.length) items.push(`${a.vipPending.length} VIP pendente(s)`); if(a.openedNoConfirm.length) items.push(`${a.openedNoConfirm.length} abriram sem confirmar`); if(a.notOpened.length) items.push(`${a.notOpened.length} não abriram`); if(a.duplicated.length) items.push(`${a.duplicated.length} duplicado(s)`); return items.slice(0,4).join(' · ')||'sem riscos fortes';}
  function rankedContexts(contexts,mode='attention'){
    const rows=contexts.filter(c=>c.analysis).map(c=>{const a=c.analysis; return {ctx:c,score:riskScore(c),pending:a.pending.length,notOpened:a.notOpened.length,openedNoConfirm:a.openedNoConfirm.length,confirmedRate:Number(a.rsvpRate||0),openRate:Number(a.openRate||0),health:a.score};});
    if(mode==='pending') rows.sort((a,b)=>b.pending-a.pending||b.score-a.score);
    else if(mode==='notOpened') rows.sort((a,b)=>b.notOpened-a.notOpened||b.score-a.score);
    else if(mode==='worstRate') rows.sort((a,b)=>a.confirmedRate-b.confirmedRate||b.score-a.score);
    else if(mode==='bestRate') rows.sort((a,b)=>b.confirmedRate-a.confirmedRate||a.score-b.score);
    else rows.sort((a,b)=>b.score-a.score||a.health-b.health);
    return rows;
  }
  async function compareInvitesSmart(message='',m=''){
    const contexts=await getValidContexts(30); if(!contexts.length) return `<strong>Comparação geral</strong><br>Não consegui carregar convites para comparação.`;
    let mode='attention', headline='Ranking de atenção operacional';
    if(/mais pendente|mais pendentes|maior pendencia|maior pendência/.test(m)){mode='pending'; headline='Convite com mais pendentes';}
    else if(/mais nao abrir|mais não abrir|nao abriram mais|não abriram mais/.test(m)){mode='notOpened'; headline='Convite com mais não abertos';}
    else if(/pior taxa|menos confirm|menor taxa/.test(m)){mode='worstRate'; headline='Convite com pior taxa de confirmação';}
    else if(/melhor taxa|mais confirm|maior taxa/.test(m)){mode='bestRate'; headline='Convite com melhor taxa de confirmação';}
    const rows=rankedContexts(contexts,mode); const first=rows[0];
    const totals=contexts.reduce((acc,c)=>{const a=c.analysis; acc.guests+=a.guests.length; acc.confirmed+=a.confirmed.length; acc.pending+=a.pending.length; acc.notOpened+=a.notOpened.length; acc.openedNoConfirm+=a.openedNoConfirm.length; return acc;},{guests:0,confirmed:0,pending:0,notOpened:0,openedNoConfirm:0});
    const direct=/qual convite|mais pendente|pior taxa|melhor taxa|precisa de atencao|precisa de atenção|mais critico|mais crítico/.test(m);
    const rowsHtml=rows.map((r,i)=>`<div class="lz-op-list-row"><div><strong>${i+1}. ${esc(shortInvite(r.ctx))}</strong><small>Saúde ${r.health}% · RSVP ${r.confirmedRate}% · Pendentes ${r.pending} · Não abriram ${r.notOpened} · ${esc(topRiskLabel(r.ctx))}</small></div><b>${r.score}</b></div>`).join('');
    const directHtml=direct&&first?`<div class="lz-op-card"><strong>Resposta directa</strong><span>${esc(shortInvite(first.ctx))} é o destaque deste critério. Motivo: ${esc(topRiskLabel(first.ctx))}.</span></div>`:'';
    return `<strong>${esc(headline)}</strong>${directHtml}${metric('Convites analisados',contexts.length)}${metric('Convidados totais',totals.guests)}${metric('Confirmados totais',`${totals.confirmed} (${fmtPct(totals.confirmed,totals.guests)}%)`)}${metric('Pendentes totais',totals.pending)}<div class="lz-op-list">${rowsHtml}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-comparison">Copiar ranking</button>${first?`<button class="lz-op-action" data-op-action="select-invite" data-op-payload="${esc(inviteIdOf(first.ctx))}">Focar ${esc(shortInvite(first.ctx))}</button>`:''}${actionAsk('Plano por convite','Plano de acção por convite')}</div>`;
  }
  function buildActionItems(ctx){
    const a=ctx.analysis; const items=[];
    if(a.missingTokens.length) items.push(['Crítico',`Corrigir ${a.missingTokens.length} convidado(s) sem token individual.`,'Sem token']);
    if(a.duplicateTokens.length) items.push(['Crítico',`Resolver ${a.duplicateTokens.length} token(s) repetido(s).`,'Tokens repetidos']);
    if(a.missingTables.length) items.push(['Operação',`Definir mesa para ${a.missingTables.length} confirmado(s).`,'Confirmados sem mesa']);
    if(a.vipPending.length) items.push(['Prioridade',`Contactar manualmente ${a.vipPending.length} VIP pendente(s).`,'VIP pendentes']);
    if(a.openedNoConfirm.length) items.push(['RSVP',`Enviar lembrete para ${a.openedNoConfirm.length} convidado(s) que abriram mas não confirmaram.`,'Abriram sem confirmar']);
    if(a.notOpened.length) items.push(['Distribuição',`Verificar envio/link dos ${a.notOpened.length} convidado(s) que ainda não abriram.`,'Não abriram']);
    if(a.missingPhones.length) items.push(['Dados',`Completar contacto de ${a.missingPhones.length} convidado(s).`,'Sem contacto']);
    if(a.duplicated.length) items.push(['Dados',`Rever ${a.duplicated.length} grupo(s) de possíveis duplicados.`,'Duplicados']);
    if(!items.length) items.push(['OK','Convite sem bloqueios fortes. Preparar relatório e briefing de recepção.','Relatório']);
    return items;
  }
  function actionPlan(ctx){const items=buildActionItems(ctx); rememberContext(ctx,null,null,'actionPlan'); return `<strong>Plano de acção — ${esc(shortInvite(ctx))}</strong><br>Ordem sugerida para resolver o que mais impacta este convite.<div class="lz-op-cards">${items.map((it,i)=>`<div class="lz-op-card"><strong>${i+1}. ${esc(it[0])}</strong><span>${esc(it[1])}</span></div>`).join('')}</div><div class="lz-op-actions">${items.slice(0,4).map((it,i)=>actionAsk(i===0?'Ver prioridade 1':it[2],it[2],i===0)).join('')}${actionAsk('Gerar relatório','Relatório')}</div>`;}
  async function multiActionPlan(){const contexts=await getValidContexts(30); const ranked=rankedContexts(contexts,'attention'); return `<strong>Plano de acção por convite</strong><br>Priorizei os convites com maior risco operacional primeiro.<div class="lz-op-list multi">${ranked.map((r,i)=>{const first=buildActionItems(r.ctx)[0]; return `<div class="lz-op-invite-block">${inviteHeaderRow(r.ctx,r.score,`${first[0]} · ${first[1]}`,'Plano de acção')}</div>`;}).join('')}</div><div class="lz-op-actions">${actionAsk('Ranking de atenção','Qual convite precisa de atenção?',true)}${actionAsk('Riscos por convite','Riscos por convite')}</div>`;}

  async function compareInvites(){const contexts=await getAllContexts(20); const valid=contexts.filter(c=>c.analysis); if(!valid.length) return `<strong>Comparação geral</strong><br>Não consegui carregar convites para comparação.`; const rows=valid.sort((a,b)=>b.analysis.score-a.analysis.score).map(c=>`<div class="lz-op-list-row"><div><strong>${esc(shortInvite(c))}</strong><small>${c.analysis.guests.length} convidados · ${c.analysis.confirmed.length} confirmados · ${c.analysis.pending.length} pendentes · ${c.analysis.notOpened.length} não abriram</small></div><b>${c.analysis.score}%</b></div>`).join(''); const totals=valid.reduce((acc,c)=>{acc.guests+=c.analysis.guests.length;acc.confirmed+=c.analysis.confirmed.length;acc.pending+=c.analysis.pending.length;acc.notOpened+=c.analysis.notOpened.length;return acc;},{guests:0,confirmed:0,pending:0,notOpened:0}); return `<strong>Ranking geral dos convites</strong><br>Comparação operacional dos convites carregados.${metric('Convites analisados',valid.length)}${metric('Convidados totais',totals.guests)}${metric('Confirmados totais',`${totals.confirmed} (${fmtPct(totals.confirmed,totals.guests)}%)`)}${metric('Pendentes totais',totals.pending)}<div class="lz-op-list">${rows}</div><div class="lz-op-actions"><button class="lz-op-action primary" data-op-action="copy-comparison">Copiar ranking</button></div>`;}
  function smartFallback(ctx,message){const a=ctx.analysis; return `<strong>Posso fazer isso, mas preciso de um comando mais objectivo.</strong><br>O meu cérebro funciona por operações determinísticas. Para este convite vejo ${a.pending.length} pendentes, ${a.notOpened.length} não abertos, ${a.openedNoConfirm.length} abriram sem confirmar e ${a.duplicated.length} possíveis duplicados.<br><br>Use exemplos como: <b>pendentes mesa 5</b>, <b>não abriram categoria família</b>, <b>perfil Ana</b>, <b>funil</b>, <b>recepção</b> ou <b>comparar convites</b>.<div class="lz-op-actions">${actionAsk('Mapa','Mapa',true)}${actionAsk('Ajuda','Ajuda')}</div>`;}
  async function copy(text){try{await navigator.clipboard.writeText(text); return true;}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return true;}}
  function listToText(list){return list.map((g,i)=>`${i+1}. ${g.__inviteTitle?`[${g.__inviteTitle}] `:''}${getName(g)} | Mesa: ${displayTable(g)} | Categoria: ${getCategory(g)} | Estado: ${g.status||g.guestStatus||'-'} | Pessoas: ${peopleCount(g)} | Contacto: ${getPhone(g)||'-'} | Nº: ${getNumber(g)||'-'}`).join('\n');}
  function listToCsv(list){const header=['Convite','Nome','Mesa','Categoria','Estado','Pessoas','Contacto','Numero','Token','Notas']; const rows=list.map(g=>[g.__inviteTitle||'',getName(g),displayTable(g),getCategory(g),g.status||g.guestStatus||'',peopleCount(g),getPhone(g),getNumber(g),hasToken(g)?'sim':'não',getNotes(g)].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')); return [header.join(';'),...rows].join('\n');}
  async function runAction(action,payload){
    if(action==='ask') return handle(payload);
    if(action==='prepare-action'){try{const p=JSON.parse(payload||'{}'); const html=await prepareBotAction(p.message||state.dialog.lastQuestion||'',p); bot(html);}catch(err){bot(`<strong>Não consegui preparar a acção.</strong><br>${esc(err.message||err)}`);} return;}
    if(action==='confirm-pending'){try{const html=await applyPendingAction(''); bot(html); updateStatusLabel();}catch(err){bot(`<strong>Não consegui executar.</strong><br>${esc(err.message||err)}`);} return;}
    if(action==='cancel-pending'){state.pendingAction=null; bot('<strong>Acção cancelada.</strong><br>Nada foi alterado.'); return;}
    if(action==='copy-last-link'){const link=state.lastMessage||''; if(link){await copy(link); bot('Link copiado.');} return;}
    if(action==='refresh'){state.inviteCache.clear();state.invites=null;await renderInviteScopeSelect(true);return handle('Mapa');}
    if(action==='select-invite'){setScopeValue(payload); await renderInviteScopeSelect(false); return handle('Mapa');}
    if(action==='go-guests'){if(window.showPanel) window.showPanel('guests'); else document.querySelector('[data-panel="guests"]')?.click(); return;}
    if(action==='copy-list'){await copy(listToText(state.lastList||[])); bot('Lista copiada para a área de transferência.'); return;}
    if(action==='copy-csv'){await copy(listToCsv(state.lastList||[])); bot('CSV copiado. Pode colar no Excel/Sheets.'); return;}
    if(action==='copy-message'){await copy(state.lastMessage||''); bot('Mensagem copiada.'); return;}
    if(action==='copy-report'){await copy(state.lastReport||''); bot('Relatório copiado.'); return;}
    if(action==='copy-duplicates'){const ctx=state.lastContext||await getContext(false); const text=ctx.analysis.duplicated.map((c,i)=>`${i+1}. ${c.type}: ${c.items.map(g=>getName(g)).join(' / ')}`).join('\n'); await copy(text); bot('Duplicados copiados.'); return;}
    if(action==='copy-badnames'){const ctx=state.lastContext||await getContext(false); const text=ctx.analysis.badNames.map((x,i)=>`${i+1}. ${getName(x.guest)}: ${x.issues.join(', ')}`).join('\n'); await copy(text); bot('Revisão de nomes copiada.'); return;}
    if(action==='copy-families'){const ctx=state.lastContext||await getContext(false); const text=ctx.analysis.familyGroups.map(([f,list],i)=>`${i+1}. ${cap(f)}: ${list.map(g=>getName(g)).join(' / ')}`).join('\n'); await copy(text); bot('Famílias prováveis copiadas.'); return;}
    if(action==='copy-comparison'){const contexts=await getAllContexts(20); const text=contexts.filter(c=>c.analysis).map((c,i)=>`${i+1}. ${shortInvite(c)} | Saúde ${c.analysis.score}% | Convidados ${c.analysis.guests.length} | Confirmados ${c.analysis.confirmed.length} | Pendentes ${c.analysis.pending.length}`).join('\n'); await copy(text); bot('Ranking geral copiado.'); return;}
  }
  function init(){create(); setInterval(updateVisibility,1200); setTimeout(()=>{renderInviteScopeSelect(false);updateStatusLabel();},800);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
