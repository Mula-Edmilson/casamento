
    const panels = [
      { id:'dashboard', label:'Dashboard', icon:'layout' }, { id:'invites', label:'Convites', icon:'folder' }, { id:'archived', label:'Arquivados', icon:'archive' }, { id:'newInvite', label:'Novo cliente', icon:'plus-circle' }, { id:'manage', label:'Gestão', icon:'settings' }, { id:'guests', label:'Convidados', icon:'users' }, { id:'github', label:'GitHub', icon:'git-branch' }
    ];
    const DEFAULT_API = window.LIRANDZO_MANAGER_API_BASE || localStorage.getItem('lirandzo_manager_api') || 'https://SEU-BACKEND-RENDER.onrender.com';
    let API_BASE = DEFAULT_API.replace(/\/+$/, '');
    let token = sessionStorage.getItem('lirandzo_manager_token') || '';
    let managerRole = sessionStorage.getItem('lirandzo_manager_role') || '';
    const isAdmin = () => managerRole === 'admin' || !managerRole;
    const isEditor = () => managerRole === 'editor';
    let invites = [];
    let archivedInvites = [];
    let selectedInviteDetails = null;
    let currentGuests = [];
    let editingGuestId = null;
    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    const fmtDate = value => { if(!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-PT',{dateStyle:'short',timeStyle:'short'}); };
    const iconRefresh = () => { if (window.feather) feather.replace(); enhanceButtonTooltips(); };
    const showMsg = (el, msg, error=false) => { el.className = 'feedback' + (error ? ' error' : ''); el.innerHTML = msg; el.classList.remove('hidden'); };
    const hideMsg = el => el.classList.add('hidden');

    async function api(path, options = {}) {
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers:{ 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(options.headers || {}) } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
      return data;
    }
    function setLoading(on) { document.body.classList.toggle('is-loading', !!on); }
    function renderSkeletons() {
      $('metricsGrid').innerHTML = Array.from({length:4}).map(()=>'<article class="metric-card"><span class="skeleton-line" style="width:70%"></span><strong class="skeleton-line" style="width:38%;height:28px;margin-top:9px"></strong><small class="skeleton-line" style="width:56%;height:12px;margin-top:8px"></small></article>').join('');
      $('activityList').innerHTML = Array.from({length:5}).map(()=>'<article class="activity-item"><div class="skeleton-card" style="width:34px;min-height:34px"></div><div style="display:grid;gap:7px"><span class="skeleton-line" style="width:72%"></span><span class="skeleton-line" style="width:92%;height:12px"></span></div></article>').join('');
      $('invitesTbody').innerHTML = Array.from({length:5}).map(()=>'<tr>'+Array.from({length:7}).map(()=>'<td><span class="skeleton-cell"></span></td>').join('')+'</tr>').join('');
    }
    function buildNav() {
      $('sideNav').innerHTML = panels.map(p=>`<button class="nav-item ${p.id==='dashboard'?'active':''}" data-panel="${p.id}" type="button"><i data-feather="${p.icon}"></i><span>${p.label}</span></button>`).join('');
      $('mobileTabs').innerHTML = panels.map(p=>`<button class="mobile-tab ${p.id==='dashboard'?'active':''}" data-panel="${p.id}" type="button"><i data-feather="${p.icon}"></i><span>${p.label}</span></button>`).join('');
      document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.panel)));
      iconRefresh();
    }
    function showPanel(id) {
      document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active', s.id === `${id}Panel`));
      document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('active', b.dataset.panel === id));
      const p = panels.find(x=>x.id===id); $('topbarTitle').textContent = p ? p.label : 'AdminManager'; $('sidebar').classList.remove('open'); $('overlay').classList.remove('active'); iconRefresh();
      if (id === 'manage') renderManageSelect();
      if (id === 'guests') { renderGuestSelect(); loadGuestCrudList(); }
      if (id === 'archived') loadArchivedInvites();
    }
    function loginView(){ document.body.classList.remove('role-admin','role-editor'); $('loginScreen').classList.remove('hidden'); $('app').classList.remove('active'); iconRefresh(); }
    function applyRoleUi(){ document.body.classList.toggle('role-editor', isEditor()); document.body.classList.toggle('role-admin', isAdmin()); $('connectionLabel').textContent = isEditor() ? 'Perfil Editor · operador seguro' : 'Perfil Admin · acesso total'; }
    function appView(){ $('loginScreen').classList.add('hidden'); $('app').classList.add('active'); applyRoleUi(); loadAll(); iconRefresh(); }
    async function loadAll(){
      renderSkeletons();
      setLoading(true);
      try {
        const results = await Promise.allSettled([loadSummary(), loadInvites(), loadArchivedInvites(), loadGithubStatus()]);
        const failures = results.filter(r => r.status === 'rejected');
        $('syncDot').classList.toggle('ok', failures.length === 0);
        $('syncText').textContent = failures.length ? 'Parcial' : 'Online';
        $('connectionLabel').textContent = failures.length ? `${failures.length} módulo(s) com falha` : 'Sistema protegido';
        if (failures.length) console.warn('[AdminManager] Falhas ao carregar módulos:', failures.map(f => f.reason?.message || f.reason));
      } finally {
        setLoading(false);
        iconRefresh();
      }
    }
    async function loadSummary(){ const out = await api('/manager/summary'); const d = out.data || {}; renderMetrics(d); renderActivity((d.activities || []).slice(0,5)); renderSystemInfo(d); }
    function renderMetrics(d){ const items=[['Total de convites',d.totalInvites||0,'activos','folder'],['Publicados',d.published||0,'online','check-circle'],['Convidados',d.guests||0,'geral','users'],['RSVP',d.rsvps||0,'confirmados','heart']]; $('metricsGrid').innerHTML = items.map(([label,value,small,icon])=>`<article class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small><i data-feather="${icon}"></i> ${esc(small)}</small></article>`).join(''); }
    function renderActivity(list){ $('activityBadge').textContent = `${list.length} registos`; $('activityList').innerHTML = list.length ? list.map(a=>`<article class="activity-item"><div class="activity-icon"><i data-feather="${a.type==='warning'?'alert-triangle':a.type==='github'?'git-commit':a.type==='gift'?'gift':a.type==='guests'?'users':'activity'}"></i></div><div><strong>${esc(a.title)}</strong><p>${esc(a.detail||'')} · ${fmtDate(a.timestamp)}</p></div></article>`).join('') : '<div class="feedback">Ainda não há actividade registada.</div>'; }
    function renderSystemInfo(d){ $('systemInfo').innerHTML = `<div class="info-row"><span>Sistema</span><strong>${$('syncText')?.textContent === 'Parcial' ? 'Online com avisos' : 'Online e protegido'}</strong></div><div class="info-row"><span>Convites</span><strong>${esc(d.totalInvites||0)} activos · ${esc(d.draft||0)} rascunho(s)</strong></div><div class="info-row"><span>Dados activos</span><strong>${esc(d.messages||0)} mensagens · ${esc(d.contributions||0)} contribuições</strong></div>`; }
    async function loadInvites(){ const q=encodeURIComponent($('searchInput')?.value||''); const status=encodeURIComponent($('statusFilter')?.value||'all'); const packageKey=encodeURIComponent($('packageFilter')?.value||'all'); const out=await api(`/manager/invites?q=${q}&status=${status}&packageKey=${packageKey}`); invites=out.data||[]; renderInvites(); renderGuestSelect(); renderManageSelect(); if (document.getElementById('guestsPanel')?.classList.contains('active')) loadGuestCrudList(); }
    async function loadArchivedInvites(){ const el=$('archivedTbody'); if(!el) return; const q=encodeURIComponent($('archivedSearchInput')?.value||''); const out=await api(`/manager/invites?q=${q}&status=archived&packageKey=all`); archivedInvites=out.data||[]; renderArchivedInvites(); }
    function renderArchivedInvites(){
      const desktopActions = inv => `<button class="btn small" onclick="openInvite('${inv.id}')" title="Ver detalhes"><i data-feather="eye"></i> Ver</button>` + adminOnlyHtml(`<button class="btn small primary" onclick="updateInviteStatus('${inv.id}','draft')" title="Restaurar para rascunho"><i data-feather="rotate-ccw"></i> Restaurar</button><button class="btn small danger" onclick="purgeInviteStrict('${inv.id}')" title="Eliminar definitivamente"><i data-feather="trash-2"></i> Eliminar</button>`);
      const mobileActions = inv => `<button class="btn small" onclick="openInvite('${inv.id}')" title="Ver detalhes">Ver</button>` + adminOnlyHtml(`<button class="btn small primary" onclick="updateInviteStatus('${inv.id}','draft')" title="Restaurar para rascunho">Restaurar</button><button class="btn small danger" onclick="purgeInviteStrict('${inv.id}')" title="Eliminar definitivamente">Eliminar</button>`);
      const rows = archivedInvites.map(inv=>`<tr><td><strong>${esc(inv.coupleNames)}</strong><br><small>${esc(inv.clientName)}</small></td><td><span class="badge blue">${pkgLabel(inv.packageKey)}</span></td><td><strong>${esc(inv.slug)}</strong><br><small>${esc(inv.publicUrl||'')}</small></td><td>${inv.stats?.guests||0}</td><td>${inv.stats?.rsvps||0}</td><td><div class="table-actions">${desktopActions(inv)}</div></td></tr>`).join('');
      $('archivedTbody').innerHTML = rows || '<tr><td colspan="6">Nenhum convite arquivado.</td></tr>';
      $('archivedMobile').innerHTML = archivedInvites.length ? archivedInvites.map(inv=>`<article class="mobile-card"><strong>${esc(inv.coupleNames)}</strong><span>${esc(inv.slug)} · ${pkgLabel(inv.packageKey)} · ${inv.stats?.guests||0} convidados</span><div class="table-actions">${mobileActions(inv)}</div></article>`).join('') : '<div class="feedback">Nenhum convite arquivado.</div>';
      iconRefresh();
    }

    function adminOnlyHtml(html){ return isAdmin() ? html : ''; }
    function editorSafeButton(label, onclick, title='Ver detalhes'){ return `<button class="btn small" onclick="${onclick}" title="${title}">${label}</button>`; }
    function badgeStatus(s){ if(s==='published') return '<span class="badge ok">Publicado</span>'; if(s==='draft') return '<span class="badge warn">Rascunho</span>'; if(s==='archived') return '<span class="badge red">Arquivado</span>'; return `<span class="badge">${esc(s)}</span>`; }
    function pkgLabel(p){ return p==='perola'?'Pérola':p==='esmeralda'?'Esmeralda':'Rubi'; }
    function inviteStatusActions(inv){
      if (!isAdmin()) return '';
      if (inv.status === 'draft') return `<button class="btn small primary" onclick="updateInviteStatus('${inv.id}','published')" title="Publicar convite"><i data-feather="check-circle"></i> Publicar</button>`;
      if (inv.status === 'published') return `<button class="btn small" onclick="updateInviteStatus('${inv.id}','draft')" title="Voltar para rascunho"><i data-feather="edit-3"></i> Rascunho</button>`;
      return '';
    }
    function renderInvites(){
      const rows = invites.map(inv=>`<tr><td><strong>${esc(inv.coupleNames)}</strong><br><small>${esc(inv.clientName)}</small></td><td><span class="badge blue">${pkgLabel(inv.packageKey)}</span></td><td>${badgeStatus(inv.status)}</td><td><strong>${esc(inv.slug)}</strong><br><small>${esc(inv.publicUrl || inv.githubPath || '')}</small></td><td>${inv.stats?.guests||0}</td><td>${inv.stats?.rsvps||0}</td><td><div class="table-actions"><button class="btn small" onclick="openInvite('${inv.id}')" title="Ver detalhes"><i data-feather="eye"></i> Ver</button>${inviteStatusActions(inv)}${adminOnlyHtml(`<button class="btn small" onclick="syncGithub('${inv.id}')" title="Sincronizar pasta no GitHub"><i data-feather="git-branch"></i></button>`)}<button class="btn small" onclick="copyUrl('${esc(inv.publicUrl||'')}')" title="Copiar URL pública"><i data-feather="copy"></i></button><button class="btn small" onclick="selectManageInvite('${inv.id}')" title="Gerir este convite"><i data-feather="settings"></i></button></div></td></tr>`).join('');
      $('invitesTbody').innerHTML = rows || '<tr><td colspan="7">Nenhum convite encontrado.</td></tr>';
      $('invitesMobile').innerHTML = invites.length ? invites.map(inv=>`<article class="mobile-card"><strong>${esc(inv.coupleNames)}</strong><span>${esc(inv.slug)} · ${pkgLabel(inv.packageKey)} · ${inv.stats?.guests||0} convidados</span><div style="margin-top:7px">${badgeStatus(inv.status)}</div><div class="table-actions"><button class="btn small" onclick="openInvite('${inv.id}')" title="Ver detalhes">Ver</button>${inviteStatusActions(inv)}${adminOnlyHtml(`<button class="btn small" onclick="syncGithub('${inv.id}')" title="Sincronizar pasta no GitHub">GitHub</button>`)}<button class="btn small" onclick="selectManageInvite('${inv.id}')" title="Gerir este convite">Gerir</button></div></article>`).join('') : '<div class="feedback">Nenhum convite encontrado.</div>';
      iconRefresh();
    }
    function renderGuestSelect(){
      const selects = [$('guestInviteSelect'), $('guestCrudInviteSelect')].filter(Boolean);
      if(!selects.length) return;
      const previous = selectedGuestInviteId() || selects.find(s=>s.value)?.value || '';
      const html = invites.length ? invites.map(inv=>`<option value="${inv.id}">${esc(inv.coupleNames)} · ${esc(inv.slug)}</option>`).join('') : '<option value="">Crie primeiro um convite</option>';
      selects.forEach(select => { select.innerHTML = html; });
      const valid = previous && invites.some(inv=>inv.id===previous);
      const next = valid ? previous : (invites[0]?.id || '');
      selects.forEach(select => { if(next) select.value = next; });
    }
    function renderManageSelect(){ const html = invites.length ? invites.map(inv=>`<option value="${inv.id}">${esc(inv.coupleNames)} · ${esc(inv.slug)}</option>`).join('') : '<option value="">Crie primeiro um convite</option>'; $('manageInviteSelect').innerHTML = html; if(invites.length && !selectedInviteDetails) loadManageDetails(); }
    async function loadGithubStatus(){ try { const out = await api('/manager/github/status'); const d=out.data||{}; $('githubStatus').innerHTML = d.configured ? `<b>GitHub configurado correctamente.</b><br><br>Repositório: <b>${esc(d.owner)}/${esc(d.repo)}</b><br>Branch: <b>${esc(d.branch)}</b><br>Base dos convites: <b>${esc(d.invitesBasePath)}</b><br><br>Templates:<br>Pérola: <b>${esc(d.templates?.perola||'-')}</b><br>Esmeralda: <b>${esc(d.templates?.esmeralda||'-')}</b><br>Rubi: <b>${esc(d.templates?.rubi||'-')}</b>` : `<b>GitHub ainda não está configurado.</b><br><br>Configure no Render: <b>GITHUB_TOKEN</b>, <b>GITHUB_OWNER</b>, <b>GITHUB_REPO</b>, <b>GITHUB_BRANCH</b> e os caminhos dos templates.`; } catch(e){ $('githubStatus').textContent = e.message; } }
    async function loadManageDetails(){ const id=$('manageInviteSelect').value; if(!id) return; const out=await api(`/manager/invites/${id}`); selectedInviteDetails=out.data; const d=out.data; $('manageStats').innerHTML = `<article class="metric-card"><span>Convidados</span><strong>${d.guests.length}</strong><small>${esc(d.invite.slug)}</small></article><article class="metric-card"><span>RSVP</span><strong>${d.rsvps.length}</strong><small>confirmações</small></article><article class="metric-card"><span>Presentes</span><strong>${d.gifts.length}</strong><small>${d.gifts.filter(g=>g.reserved).length} reservados</small></article><article class="metric-card"><span>Contribuições</span><strong>${d.contributions.length}</strong><small>registos</small></article>`; iconRefresh(); }
    async function managerAction(path, method, confirmText, successMsg){ if(confirmText && !confirm(confirmText)) return; hideMsg($('manageResult')); try { const out=await api(path,{method,body:JSON.stringify({})}); showMsg($('manageResult'), out.message || successMsg || 'Operação concluída.'); await Promise.allSettled([loadManageDetails(),loadSummary(),loadInvites()]); } catch(e){ showMsg($('manageResult'), e.message, true); } }
    function selectedManageId(){ return $('manageInviteSelect').value; }
    function setLoginLoading(active){
      const btn = $('loginSubmitBtn');
      const label = btn?.querySelector('.login-btn-text');
      if (!btn) return;
      btn.disabled = !!active;
      btn.classList.toggle('is-loading', !!active);
      if (label) label.textContent = active ? 'A entrar...' : 'Entrar no centro de gestão';
      iconRefresh();
    }

    function enhanceButtonTooltips(){
      document.querySelectorAll('.btn').forEach(btn => {
        if (btn.dataset.tooltip) return;
        const label = btn.getAttribute('title') || btn.getAttribute('aria-label') || btn.textContent.trim().replace(/\s+/g,' ');
        if (label) btn.dataset.tooltip = label;
      });
    }
    function setGuestImportLoading(active, stage = 'A preparar importação...', percent = 0, done = false) {
      const progress = $('guestImportProgress');
      const bar = $('guestImportBar');
      const pct = $('guestImportPercent');
      const label = $('guestImportStage');
      const note = $('guestImportNote');
      const btn = $('importGuestsBtn');
      const btnLabel = btn?.querySelector('.guest-import-label');
      const controls = [$('guestInviteSelect'), $('guestFile'), $('guestBulkText'), $('sampleGuestsBtn'), $('repairGuestsBtn')].filter(Boolean);
      const cleanPercent = Math.max(0, Math.min(100, Number(percent) || 0));

      if (progress) {
        progress.classList.toggle('active', !!active || !!done);
        progress.classList.toggle('done', !!done);
      }
      if (bar) bar.style.width = `${cleanPercent}%`;
      if (pct) pct.textContent = `${Math.round(cleanPercent)}%`;
      if (label) label.textContent = stage;
      if (note) note.textContent = done ? 'Importação concluída. O campo foi limpo e a lista foi actualizada.' : 'Não feche esta página enquanto os convidados estão a ser enviados.';

      if (btn) {
        btn.disabled = !!active;
        btn.classList.toggle('is-loading', !!active);
      }
      if (btnLabel) btnLabel.textContent = active ? 'A importar convidados...' : 'Importar / actualizar convidados';
      controls.forEach(el => { el.disabled = !!active; });
      iconRefresh();
    }
    document.addEventListener('click', event => {
      const btn = event.target.closest('.btn');
      if (!btn) return;
      btn.classList.remove('pulse-click');
      void btn.offsetWidth;
      btn.classList.add('pulse-click');
      setTimeout(() => btn.classList.remove('pulse-click'), 260);
    });
    function requireEliminatePhrase(message){
      const phrase = prompt(`${message}\n\nPara confirmar, escreva exactamente: ELIMINAR`);
      return phrase === 'ELIMINAR';
    }
    async function setInviteStatus(id, status){
      if(!id) return;
      const label = status === 'published' ? 'publicado' : status === 'draft' ? 'rascunho' : status;
      if (!confirm(`Alterar o estado deste convite para ${label}?`)) return;
      try {
        const out = await api(`/manager/invites/${id}`, { method:'PATCH', body:JSON.stringify({ status }) });
        alert(out.message || `Estado alterado para ${label}.`);
        await Promise.allSettled([loadSummary(), loadInvites(), loadArchivedInvites(), selectedManageId() ? loadManageDetails() : Promise.resolve()]);
      } catch(e) { alert('Erro ao alterar estado: ' + e.message); }
    }
    window.updateInviteStatus = setInviteStatus;
    window.purgeInviteStrict = function(id){
      const inv = [...invites, ...archivedInvites].find(i=>i.id===id);
      if(!requireEliminatePhrase(`Esta acção vai eliminar definitivamente ${inv?.slug || 'este convite'} e dados relacionados do MongoDB. Não apaga a pasta no GitHub.`)) return;
      managerAction(`/manager/invites/${id}/purge`,'DELETE',null,'Convite eliminado definitivamente.');
    };

    window.openInvite = async function(id){ const out=await api(`/manager/invites/${id}`); const d=out.data; $('modalTitle').textContent=d.invite.coupleNames; $('modalBody').innerHTML=`<div class="info-list"><div class="info-row"><span>Slug</span><strong>${esc(d.invite.slug)}</strong></div><div class="info-row"><span>URL</span><strong>${esc(d.invite.publicUrl)}</strong></div><div class="info-row"><span>GitHub</span><strong>${esc(d.invite.githubPath || '-')}</strong></div></div><div class="metrics-grid" style="margin-top:12px"><article class="metric-card"><span>Convidados</span><strong>${d.guests.length}</strong><small>MongoDB</small></article><article class="metric-card"><span>RSVP</span><strong>${d.rsvps.length}</strong><small>confirmados</small></article><article class="metric-card"><span>Mensagens</span><strong>${d.messages.length}</strong><small>mural</small></article><article class="metric-card"><span>Presentes</span><strong>${d.gifts.length}</strong><small>${d.gifts.filter(g=>g.reserved).length} reservados</small></article></div>`; $('detailsModal').classList.add('open'); iconRefresh(); };
    window.copyUrl = async function(url){ if(!url) return; await navigator.clipboard.writeText(url); alert('URL copiada.'); };
    window.syncGithub = async function(id){
      if(!confirm('Criar/sincronizar a pasta deste convite no GitHub?')) return;
      const allowOverwrite = confirm('Se a pasta já existir no GitHub, quer actualizar/sobrescrever os ficheiros do template?\n\nOK = actualizar/sobrescrever.\nCancelar = apenas criar se ainda não existir.');
      try {
        const out=await api(`/manager/invites/${id}/github-sync`,{method:'POST',body:JSON.stringify({ allowOverwrite })});
        alert(out.message || 'GitHub sincronizado com sucesso.');
        await loadAll();
      } catch(e){ alert('Erro GitHub: '+e.message); } };
    window.selectManageInvite = function(id){ showPanel('manage'); setTimeout(()=>{ $('manageInviteSelect').value=id; loadManageDetails(); }, 0); };


    function selectedGuestInviteId(){ return $('guestCrudInviteSelect')?.value || $('guestInviteSelect')?.value || ''; }
    function syncGuestInviteSelects(id){
      ['guestInviteSelect','guestCrudInviteSelect'].forEach(key => { const el=$(key); if(el && id && el.value !== id) el.value = id; });
    }
    function selectedGuestInvite(){ const id=selectedGuestInviteId(); return invites.find(inv=>inv.id===id) || null; }
    function guestPayloadFromForm(){
      return {
        name: $('guestEditName').value.trim(),
        table: $('guestEditTable').value.trim(),
        companions: Number($('guestEditCompanions').value || 0),
        phone: $('guestEditPhone').value.trim(),
        number: Number($('guestEditNumber').value || 0),
        category: $('guestEditCategory').value.trim(),
        status: $('guestEditStatus').value.trim(),
        legacyToken: $('guestEditLegacyToken').value.trim(),
        notes: $('guestEditNotes').value.trim(),
        inviteToken: $('guestEditInviteToken').value.trim()
      };
    }
    async function loadGuestCrudList(){
      const id=selectedGuestInviteId();
      syncGuestInviteSelects(id);
      const tbody=$('guestCrudTbody');
      if(!tbody) return;
      if(!id){ tbody.innerHTML='<tr><td colspan="7">Seleccione um convite.</td></tr>'; $('guestCrudMobile').innerHTML=''; return; }
      const q=encodeURIComponent($('guestSearchInput')?.value || '');
      try{
        tbody.innerHTML='<tr><td colspan="7">A carregar convidados...</td></tr>';
        const out=await api(`/manager/invites/${id}/guests?q=${q}`);
        currentGuests=out.data||[];
        renderGuestCrudList();
      }catch(e){
        tbody.innerHTML=`<tr><td colspan="7">${esc(e.message)}</td></tr>`;
        $('guestCrudMobile').innerHTML=`<div class="feedback error">${esc(e.message)}</div>`;
      }
    }
    function renderGuestCrudList(){
      const rows=currentGuests.map(g=>`<tr><td>${esc(g.number||'-')}</td><td><div class="guest-name-main"><strong>${esc(g.name)}</strong><small>${esc(g.normalizedName||'')}</small><small>${esc(g.inviteToken||g.token||'')}</small></div></td><td>${esc(g.mesa||g.table||'A definir')}</td><td>${esc(g.companions||0)}</td><td>${badgeStatusFromGuest(g.status)}</td><td>${esc(g.category||'-')}</td><td><div class="table-actions"><button class="btn small" onclick="openGuestEditor('${g.id}')" title="Editar convidado"><i data-feather="edit-3"></i> Editar</button><button class="btn small" onclick="resetSingleGuestAccess('${g.id}')" title="Resetar acesso"><i data-feather="unlock"></i></button>${adminOnlyHtml(`<button class="btn small danger" onclick="deleteGuestFromManager('${g.id}')" title="Eliminar convidado"><i data-feather="trash-2"></i></button>`)}</div></td></tr>`).join('');
      $('guestCrudTbody').innerHTML = rows || '<tr><td colspan="7">Nenhum convidado encontrado.</td></tr>';
      $('guestCrudMobile').innerHTML = currentGuests.length ? currentGuests.map(g=>`<article class="mobile-card"><strong>${esc(g.name)}</strong><span>${esc(g.mesa||g.table||'A definir')} · ${esc(g.companions||0)} acompanhante(s) · ${esc(g.category||'-')}</span><div style="margin-top:7px">${badgeStatusFromGuest(g.status)}</div><div class="table-actions"><button class="btn small" onclick="openGuestEditor('${g.id}')">Editar</button><button class="btn small" onclick="resetSingleGuestAccess('${g.id}')">Reset</button>${adminOnlyHtml(`<button class="btn small danger" onclick="deleteGuestFromManager('${g.id}')">Eliminar</button>`)}</div></article>`).join('') : '<div class="feedback">Nenhum convidado encontrado.</div>';
      iconRefresh();
    }
    function badgeStatusFromGuest(status){ const s=String(status||'').toLowerCase(); if(s.includes('confirmado')) return '<span class="badge ok">Confirmado</span>'; if(s.includes('aberto')) return '<span class="badge blue">Aberto</span>'; if(s.includes('pendente') || s.includes('confirmar')) return '<span class="badge warn">Pendente</span>'; return '<span class="badge">Não aberto</span>'; }
    function openGuestModal(){ $('guestEditModal').classList.add('open'); iconRefresh(); }
    function closeGuestModal(){ $('guestEditModal').classList.remove('open'); hideMsg($('guestEditResult')); }
    function fillGuestForm(g={}){
      editingGuestId = g.id || '';
      $('guestEditId').value = editingGuestId;
      $('guestEditTitle').textContent = editingGuestId ? 'Editar convidado' : 'Novo convidado';
      $('guestEditName').value = g.name || '';
      $('guestEditTable').value = g.table || g.mesa || 'A indicar na entrada';
      $('guestEditCompanions').value = Number(g.companions||0);
      $('guestEditPhone').value = g.phone || '';
      $('guestEditNumber').value = Number(g.number||0);
      $('guestEditCategory').value = g.category || '';
      $('guestEditStatus').value = g.status || 'Não aberto';
      $('guestEditLegacyToken').value = g.legacyToken || '';
      $('guestEditNotes').value = g.notes || '';
      $('guestEditInviteToken').value = g.inviteToken || g.token || '';
      $('guestDeleteBtn').style.display = (editingGuestId && isAdmin()) ? '' : 'none';
      $('guestResetAccessSingleBtn').style.display = editingGuestId ? '' : 'none';
      hideMsg($('guestEditResult'));
    }
    window.openGuestEditor = function(id){ const g=currentGuests.find(item=>String(item.id)===String(id)); if(!g) return alert('Convidado não encontrado na lista carregada.'); fillGuestForm(g); openGuestModal(); };
    function openNewGuest(){ const inv=selectedGuestInvite(); if(!inv) return showMsg($('guestCrudResult'), 'Seleccione primeiro um convite.', true); fillGuestForm({ table:'A indicar na entrada', status:'Não aberto' }); openGuestModal(); }
    async function saveGuestFromModal(e){
      e.preventDefault();
      const inviteId=selectedGuestInviteId();
      if(!inviteId) return showMsg($('guestEditResult'), 'Seleccione primeiro um convite.', true);
      const payload=guestPayloadFromForm();
      if(!payload.name) return showMsg($('guestEditResult'), 'Nome obrigatório.', true);
      try{
        const method=editingGuestId ? 'PATCH' : 'POST';
        const path=editingGuestId ? `/manager/invites/${inviteId}/guests/${editingGuestId}` : `/manager/invites/${inviteId}/guests`;
        const out=await api(path,{method,body:JSON.stringify(payload)});
        showMsg($('guestEditResult'), out.message || 'Guardado com sucesso.');
        await Promise.allSettled([loadGuestCrudList(), loadSummary(), loadInvites(), loadManageDetails()]);
        setTimeout(()=>closeGuestModal(), 750);
      }catch(err){ showMsg($('guestEditResult'), err.message, true); }
    }
    window.resetSingleGuestAccess = async function(id){
      const inviteId=selectedGuestInviteId();
      if(!inviteId || !id) return;
      if(!confirm('Resetar acesso deste convidado?')) return;
      try{ const out=await api(`/manager/invites/${inviteId}/guests/${id}/reset-access`,{method:'POST',body:JSON.stringify({})}); showMsg($('guestCrudResult'), out.message || 'Acesso reiniciado.'); await loadGuestCrudList(); }catch(e){ showMsg($('guestCrudResult'), e.message, true); }
    };
    window.deleteGuestFromManager = async function(id){
      const inviteId=selectedGuestInviteId();
      const g=currentGuests.find(item=>String(item.id)===String(id));
      if(!inviteId || !id || !g) return;
      const typed=prompt(`Eliminar definitivamente o convidado "${g.name}"?\n\nIsto remove o convidado e os seus RSVP/check-ins associados. Escreva ELIMINAR para confirmar.`);
      if(String(typed||'').trim().toUpperCase() !== 'ELIMINAR') return;
      try{ const out=await api(`/manager/invites/${inviteId}/guests/${id}`,{method:'DELETE'}); showMsg($('guestCrudResult'), out.message || 'Convidado eliminado.'); await Promise.allSettled([loadGuestCrudList(), loadSummary(), loadInvites(), loadManageDetails()]); }catch(e){ showMsg($('guestCrudResult'), e.message, true); }
    };
    async function eraseInviteData(){
      const id=selectedManageId();
      if(!id) return showMsg($('manageResult'), 'Seleccione primeiro um convite.', true);
      const inv=[...invites,...archivedInvites].find(x=>x.id===id);
      const typed=prompt(`ERASE DE DADOS DO CONVITE\n\nConvite: ${inv?.coupleNames || id}\nSlug: ${inv?.slug || ''}\n\nEsta acção apaga convidados, RSVP, mensagens, presentes, contribuições, check-ins, cápsula e actividades deste convite, mas mantém o registo do convite.\n\nEscreva APAGAR DADOS para confirmar.`);
      if(String(typed||'').trim().toUpperCase() !== 'APAGAR DADOS') return;
      hideMsg($('manageResult'));
      try{
        const out=await api(`/manager/invites/${id}/data`,{method:'DELETE',body:JSON.stringify({collections:['all']})});
        const d=out.data?.deleted || {};
        showMsg($('manageResult'), `${esc(out.message || 'Dados apagados.')}<br>${Object.entries(d).map(([k,v])=>`${esc(k)}: <b>${esc(v)}</b>`).join(' · ')}`);
        await Promise.allSettled([loadAll(), loadManageDetails(), loadGuestCrudList()]);
      }catch(e){ showMsg($('manageResult'), e.message, true); }
    }

    function bindEvents(){
      $('loginForm').addEventListener('submit', async e=>{ e.preventDefault(); hideMsg($('loginError')); API_BASE=(window.LIRANDZO_MANAGER_API_BASE || API_BASE || '').trim().replace(/\/+$/,''); const accessType = document.querySelector('input[name="accessType"]:checked')?.value || 'admin'; setLoginLoading(true); try{ const out=await api('/manager/login',{method:'POST',body:JSON.stringify({password:$('passwordInput').value, accessType})}); token=out.token; managerRole=out.role || accessType; sessionStorage.setItem('lirandzo_manager_token',token); sessionStorage.setItem('lirandzo_manager_role',managerRole); appView(); }catch(err){ showMsg($('loginError'),err.message,true); } finally { setLoginLoading(false); } });
      $('menuBtn').addEventListener('click',()=>{ $('sidebar').classList.add('open'); $('overlay').classList.add('active'); }); $('overlay').addEventListener('click',()=>{ $('sidebar').classList.remove('open'); $('overlay').classList.remove('active'); });
      $('logoutBtn').addEventListener('click',()=>{ sessionStorage.removeItem('lirandzo_manager_token'); sessionStorage.removeItem('lirandzo_manager_role'); token=''; managerRole=''; loginView(); }); $('refreshBtn').addEventListener('click',loadAll); $('filterBtn').addEventListener('click',loadInvites); $('archivedFilterBtn')?.addEventListener('click',loadArchivedInvites); $('reloadArchivedBtn')?.addEventListener('click',loadArchivedInvites); $('searchInput').addEventListener('keydown', e=>{ if(e.key==='Enter') loadInvites(); }); $('archivedSearchInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') loadArchivedInvites(); }); $('reloadGithubBtn').addEventListener('click',loadGithubStatus); document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.goto)));
      $('themeBtn').addEventListener('click',()=>{ const current=document.documentElement.getAttribute('data-theme')||'dark'; applyTheme(current==='light'?'dark':'light'); });
      $('closeModal').addEventListener('click',()=>$('detailsModal').classList.remove('open')); $('detailsModal').addEventListener('click',e=>{ if(e.target===$('detailsModal')) $('detailsModal').classList.remove('open'); }); document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ $('detailsModal').classList.remove('open'); $('guestEditModal')?.classList.remove('open'); $('sidebar').classList.remove('open'); $('overlay').classList.remove('active'); } });
      $('newInviteForm').addEventListener('submit', async e=>{ e.preventDefault(); if(!isAdmin()) return showMsg($('createResult'), 'Perfil Editor não pode criar convites.', true); const fd=new FormData(e.currentTarget); const payload=Object.fromEntries(fd.entries()); payload.copyToGithub=fd.get('copyToGithub')==='on'; payload.createAsPublished=fd.get('createAsPublished')==='on'; hideMsg($('createResult')); try{ const out=await api('/manager/invites',{method:'POST',body:JSON.stringify(payload)}); showMsg($('createResult'), out.message || `Convite criado: ${out.data.publicUrl}`); e.currentTarget.reset(); await loadAll(); }catch(err){ showMsg($('createResult'),err.message,true); } });
      $('manageInviteSelect').addEventListener('change',loadManageDetails); $('loadManageBtn').addEventListener('click',loadManageDetails);
      $('resetAccessBtn').addEventListener('click',()=>managerAction(`/manager/invites/${selectedManageId()}/guests/reset-access`,'POST','Resetar o acesso de todos os convidados deste convite?','Acessos reiniciados.'));
      $('resetGiftsBtn').addEventListener('click',()=>managerAction(`/manager/invites/${selectedManageId()}/gifts/reset-reservations`,'POST','Remover todas as reservas de presentes deste convite?','Reservas reiniciadas.'));
      $('clearGiftsBtn').addEventListener('click',()=>{ if(!requireEliminatePhrase('Esta acção vai eliminar todos os presentes registados deste convite no MongoDB.')) return; managerAction(`/manager/invites/${selectedManageId()}/gifts`,'DELETE',null,'Presentes eliminados.'); });
      $('seedGiftsBtn').addEventListener('click',()=>managerAction(`/manager/invites/${selectedManageId()}/gifts/seed-defaults`,'POST','Restaurar presentes padrão deste convite?','Presentes padrão restaurados.'));
      $('archiveBtn').addEventListener('click',()=>managerAction(`/manager/invites/${selectedManageId()}`,'DELETE','Arquivar este convite? Ele ficará disponível na página Arquivados.','Convite arquivado.'));
      $('publishInviteBtn').addEventListener('click',()=>setInviteStatus(selectedManageId(),'published')); $('draftInviteBtn').addEventListener('click',()=>setInviteStatus(selectedManageId(),'draft')); $('purgeInviteBtn').addEventListener('click',()=>purgeInviteStrict(selectedManageId()));
      
      $('guestInviteSelect')?.addEventListener('change', e=>{ syncGuestInviteSelects(e.currentTarget.value); hideMsg($('guestCrudResult')); loadGuestCrudList(); });
      $('guestCrudInviteSelect')?.addEventListener('change', e=>{ syncGuestInviteSelects(e.currentTarget.value); hideMsg($('guestCrudResult')); loadGuestCrudList(); });
      $('guestSearchInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') loadGuestCrudList(); });
      $('refreshGuestCrudBtn')?.addEventListener('click', loadGuestCrudList);
      $('addGuestBtn')?.addEventListener('click', openNewGuest);
      $('closeGuestEditModal')?.addEventListener('click', closeGuestModal);
      $('guestEditModal')?.addEventListener('click', e=>{ if(e.target===$('guestEditModal')) closeGuestModal(); });
      $('guestEditForm')?.addEventListener('submit', saveGuestFromModal);
      $('guestDeleteBtn')?.addEventListener('click',()=> editingGuestId && deleteGuestFromManager(editingGuestId));
      $('guestResetAccessSingleBtn')?.addEventListener('click',()=> editingGuestId && resetSingleGuestAccess(editingGuestId));
      $('eraseInviteDataBtn')?.addEventListener('click', eraseInviteData);
      $('guestFile').addEventListener('change', async e=>{ const file=e.target.files?.[0]; if(!file) return; const text=await file.text(); $('guestBulkText').value=text; $('guestPreview').innerHTML=`Ficheiro carregado: <b>${esc(file.name)}</b><br>${text.split(/\r?\n/).filter(Boolean).length} linha(s) detectada(s). Confere o campo abaixo antes de importar.`; });
      $('sampleGuestsBtn').addEventListener('click',()=>{ $('guestBulkText').value='Nome;Mesa;Acompanhantes;Telefone;Notas;Categoria;Número;Token antigo\nPrísca Daniel;A definir;0;;Observação interna;Single;152;rm-2026-152-prisca-daniel\nAna Manuel;Mesa 3;1;+258840000000;Família da noiva;Família;153;'; });
      $('repairGuestsBtn').addEventListener('click', async ()=>{
        const id = selectedGuestInviteId();
        syncGuestInviteSelects(id);
        if (!id) return showMsg($('guestResult'), 'Seleccione primeiro o convite que pretende reparar.', true);
        if (!confirm('Reparar normalizedName dos convidados deste convite?\n\nIsto corrige nomes antigos mal normalizados e ajuda a resolver erro 401 no login.')) return;
        hideMsg($('guestResult'));
        setGuestImportLoading(true, 'A reparar nomes normalizados...', 35);
        try {
          const out = await api(`/manager/invites/${id}/guests/repair-normalized`, { method:'POST', body:JSON.stringify({}) });
          setGuestImportLoading(true, 'A actualizar listas...', 82);
          await loadAll();
          const d = out.data || {};
          setGuestImportLoading(false, 'Reparação concluída', 100, true);
          showMsg($('guestResult'), `${esc(out.message || 'Reparação concluída.')}<br>Verificados: <b>${esc(d.checked || 0)}</b> · Reparados: <b>${esc(d.repaired || 0)}</b> · Falhas: <b>${esc((d.failed || []).length)}</b>`);
          setTimeout(() => {
            const progress = $('guestImportProgress');
            if (progress && progress.classList.contains('done')) progress.classList.remove('active', 'done');
          }, 4200);
        } catch(err) {
          setGuestImportLoading(false, 'Reparação interrompida', 100, false);
          showMsg($('guestResult'), err.message, true);
        }
      });
      $('guestForm').addEventListener('submit', async e=>{ if(!isAdmin()) { e.preventDefault(); return showMsg($('guestResult'), 'Perfil Editor não pode importar listas em massa. Use o botão Novo convidado para adicionar manualmente.', true); }
        e.preventDefault();
        const id = selectedGuestInviteId();
        syncGuestInviteSelects(id);
        const text = $('guestBulkText').value.trim();
        if (!id) return showMsg($('guestResult'), 'Seleccione primeiro o convite onde pretende importar os convidados.', true);
        if (!text) return showMsg($('guestResult'), 'Adicione um ficheiro ou escreva a lista de convidados antes de importar.', true);
        hideMsg($('guestResult'));
        setGuestImportLoading(true, 'A validar lista de convidados...', 18);
        try {
          await new Promise(resolve => setTimeout(resolve, 120));
          setGuestImportLoading(true, 'A enviar convidados para o MongoDB...', 46);
          const out = await api(`/manager/invites/${id}/guests/bulk`, {
            method: 'POST',
            body: JSON.stringify({ text })
          });
          setGuestImportLoading(true, 'A actualizar resumo e tabelas...', 78);
          await loadAll();
          const d = out.data || {};
          const fail = d.failed?.length || 0;
          $('guestBulkText').value = '';
          $('guestFile').value = '';
          $('guestPreview').innerHTML = 'Importação concluída com sucesso.<br>O campo foi limpo e já pode importar uma nova lista.';
          setGuestImportLoading(false, 'Importação concluída', 100, true);
          showMsg($('guestResult'), `Importação concluída: <b>${d.inserted || 0}</b> novos, <b>${d.updated || 0}</b> actualizados, <b>${fail}</b> falha(s).`);
          setTimeout(() => {
            const progress = $('guestImportProgress');
            if (progress && progress.classList.contains('done')) progress.classList.remove('active', 'done');
          }, 4200);
        } catch(err) {
          setGuestImportLoading(false, 'Importação interrompida', 100, false);
          showMsg($('guestResult'), err.message, true);
        }
      });
    }
    function applyTheme(theme){ const selected=theme==='light'?'light':'dark'; document.documentElement.setAttribute('data-theme',selected); localStorage.setItem('lirandzo_manager_theme',selected); $('themeBtn').innerHTML=`<i data-feather="${selected==='light'?'moon':'sun'}"></i> ${selected==='light'?'Tema escuro':'Tema claro'}`; iconRefresh(); }
    function init(){ applyTheme(localStorage.getItem('lirandzo_manager_theme')||'dark'); buildNav(); bindEvents(); token ? appView() : loginView(); iconRefresh(); }
    init();
  