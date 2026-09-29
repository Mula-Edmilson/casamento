(() => {
  'use strict';

  const PANEL_ID = 'gifts';
  const PANEL_EL_ID = 'giftsPanel';
  const state = {
    inviteId: '',
    mode: 'legacy',
    writable: false,
    canEdit: false,
    gifts: [],
    stats: { total: 0, reserved: 0, available: 0 },
    searchTimer: null
  };

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function adminApi(path, options = {}) {
    if (typeof api !== 'function') return Promise.reject(new Error('API do AdminManager indisponível.'));
    return api(path, options);
  }

  function adminIsAdmin() {
    try { return typeof isAdmin === 'function' ? Boolean(isAdmin()) : false; }
    catch { return false; }
  }

  function refreshIcons() {
    try { if (typeof iconRefresh === 'function') iconRefresh(); else if (window.feather) window.feather.replace(); }
    catch { /* noop */ }
  }

  function currentInvites() {
    try { return Array.isArray(invites) ? invites : []; }
    catch { return []; }
  }

  function setFeedback(message = '', error = false) {
    const el = byId('giftCatalogResult');
    if (!el) return;
    if (!message) {
      el.className = 'feedback hidden';
      el.textContent = '';
      return;
    }
    el.className = `feedback${error ? ' error' : ''}`;
    el.innerHTML = message;
  }

  function injectStyles() {
    if (byId('giftCatalogPhase3Styles')) return;
    const style = document.createElement('style');
    style.id = 'giftCatalogPhase3Styles';
    style.textContent = `
      .gift-catalog-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .gift-catalog-toolbar .toolbar-left,.gift-catalog-toolbar .toolbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .gift-catalog-toolbar .search-input{min-width:min(270px,78vw)}
      .gift-catalog-mode{display:inline-flex;align-items:center;gap:7px;min-height:30px;border:1px solid var(--line-strong);border-radius:999px;padding:0 10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
      .gift-catalog-mode.mongo{color:#7be3bd;border-color:rgba(24,183,131,.34);background:rgba(24,183,131,.10)}
      .gift-catalog-mode.legacy{color:var(--orange);border-color:rgba(242,168,74,.32);background:rgba(242,168,74,.10)}
      .gift-catalog-mode.quantity_contributions{color:var(--blue);border-color:rgba(106,165,255,.32);background:rgba(106,165,255,.10)}
      .gift-state{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:900}
      .gift-state.available{color:var(--green)} .gift-state.reserved{color:var(--orange)}
      .gift-owner{display:grid;gap:2px}.gift-owner small{color:var(--muted);font-size:10px}
      .gift-phase3-lock{margin:0 0 12px;border:1px solid rgba(242,168,74,.28);border-radius:14px;padding:11px 12px;background:rgba(242,168,74,.08);font-size:11px;line-height:1.5;color:var(--text-2)}
      .gift-phase3-lock strong{color:var(--orange)}
      .gift-mobile-card{border:1px solid var(--line);border-radius:16px;padding:13px;background:rgba(33,28,25,.24);display:grid;gap:8px}
      html[data-theme="light"] .gift-mobile-card{background:rgba(255,255,255,.54)}
      .gift-mobile-card .gift-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.gift-mobile-card .gift-card-meta{font-size:11px;color:var(--muted)}
      .gift-phase3-modal{position:fixed;inset:0;z-index:4200;background:rgba(0,0,0,.58);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:18px}
      .gift-phase3-modal.open{display:flex}.gift-phase3-dialog{width:min(560px,100%);max-height:90vh;overflow:auto;border:1px solid var(--line-strong);border-radius:22px;background:var(--surface);box-shadow:var(--shadow);padding:18px}
      .gift-phase3-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.gift-phase3-dialog-head h3{font-family:var(--font-heading);font-size:26px;color:var(--text)}
      .gift-phase3-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}
      .gift-import-preview{border:1px solid var(--line);border-radius:14px;padding:10px;background:rgba(33,28,25,.25);font-size:11px;line-height:1.5;color:var(--muted);margin-top:8px}
      html[data-theme="light"] .gift-import-preview{background:rgba(255,255,255,.58)}
      @media(max-width:720px){.gift-catalog-toolbar{align-items:stretch}.gift-catalog-toolbar .toolbar-left,.gift-catalog-toolbar .toolbar-right{width:100%}.gift-catalog-toolbar .search-input,.gift-catalog-toolbar select{flex:1;min-width:0}.gift-phase3-dialog{border-radius:18px;padding:15px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanelDefinition() {
    try {
      if (Array.isArray(panels) && !panels.some(panel => panel.id === PANEL_ID)) {
        const githubIndex = panels.findIndex(panel => panel.id === 'github');
        const entry = { id: PANEL_ID, label: 'Presentes', icon: 'gift' };
        if (githubIndex >= 0) panels.splice(githubIndex, 0, entry);
        else panels.push(entry);
      }
    } catch { /* fallback navigation below */ }
  }

  function makeNavButton(target, mobile = false) {
    if (!target || target.querySelector(`[data-panel="${PANEL_ID}"]`)) return;
    const button = document.createElement('button');
    button.className = mobile ? 'mobile-tab' : 'nav-item';
    button.type = 'button';
    button.dataset.panel = PANEL_ID;
    button.innerHTML = '<i data-feather="gift"></i><span>Presentes</span>';
    const github = target.querySelector('[data-panel="github"]');
    if (github) target.insertBefore(button, github);
    else target.appendChild(button);
  }

  function ensureNavigation() {
    makeNavButton(byId('sideNav'), false);
    makeNavButton(byId('mobileTabs'), true);
    document.querySelectorAll(`[data-panel="${PANEL_ID}"]`).forEach(button => {
      if (button.dataset.phase3GiftBound === '1') return;
      button.dataset.phase3GiftBound = '1';
      button.addEventListener('click', () => {
        try { if (typeof showPanel === 'function') showPanel(PANEL_ID); }
        catch { /* noop */ }
        syncInviteOptions();
        loadCatalog();
      });
    });
  }

  function panelHtml() {
    return `
      <section class="section" id="${PANEL_EL_ID}">
        <div class="section-title"><div><h1>Presentes</h1><p>Catálogo por convite no MongoDB. A Fase 3 mantém catálogos legacy bloqueados para edição.</p></div><span id="giftCatalogMode" class="gift-catalog-mode legacy">Legacy</span></div>
        <div id="giftCatalogLock" class="gift-phase3-lock"><strong>Modo seguro:</strong> seleccione um convite. Só convites explicitamente configurados com <code>giftCatalogMode: "mongo"</code> podem ser alterados aqui.</div>
        <div id="giftCatalogStats" class="metrics-grid"></div>
        <section class="panel-card">
          <div class="panel-head"><h2><i data-feather="gift"></i> Catálogo de presentes</h2><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn small" id="giftExportBtn" type="button" title="Exportar CSV"><i data-feather="download"></i> Exportar</button><button class="btn small primary" id="giftAddBtn" type="button" title="Adicionar presente"><i data-feather="plus"></i> Novo presente</button></div></div>
          <div class="panel-body">
            <div class="gift-catalog-toolbar">
              <div class="toolbar-left"><select id="giftInviteSelect" class="search-input" title="Convite"><option value="">Seleccione um convite...</option></select><input id="giftSearchInput" class="search-input" type="search" placeholder="Pesquisar presente, categoria ou convidado"></div>
              <div class="toolbar-right"><button class="btn" id="giftImportBtn" type="button" title="Importar lista"><i data-feather="upload-cloud"></i> Importar</button><button class="btn" id="giftRefreshBtn" type="button" title="Actualizar"><i data-feather="refresh-cw"></i> Actualizar</button></div>
            </div>
            <div class="desktop-table table-wrap"><table><thead><tr><th>Presente</th><th>Categoria</th><th>Estado</th><th>Reservado por</th><th>Acções</th></tr></thead><tbody id="giftCatalogTbody"><tr><td colspan="5">Seleccione um convite para carregar o catálogo.</td></tr></tbody></table></div>
            <div id="giftCatalogMobile" class="mobile-list"></div>
            <div id="giftCatalogResult" class="feedback hidden"></div>
          </div>
        </section>
      </section>`;
  }

  function ensurePanel() {
    if (byId(PANEL_EL_ID)) return;
    const guestsPanel = byId('guestsPanel');
    if (!guestsPanel) return;
    guestsPanel.insertAdjacentHTML('afterend', panelHtml());
  }

  function modalHtml() {
    return `
      <div class="gift-phase3-modal" id="giftEditorModal" aria-hidden="true"><div class="gift-phase3-dialog" role="dialog" aria-modal="true" aria-labelledby="giftEditorTitle"><div class="gift-phase3-dialog-head"><h3 id="giftEditorTitle">Novo presente</h3><button class="btn icon-only" type="button" data-gift-close="giftEditorModal" aria-label="Fechar"><i data-feather="x"></i></button></div><form id="giftEditorForm"><input id="giftEditorId" type="hidden"><div class="field"><label>Nome do presente</label><input id="giftEditorName" maxlength="160" required placeholder="Ex.: Air fryer"></div><div class="field"><label>Categoria</label><input id="giftEditorCategory" maxlength="100" placeholder="Lista de presentes"></div><div id="giftEditorNote" class="hint"></div><div class="gift-phase3-dialog-actions"><button class="btn" type="button" data-gift-close="giftEditorModal">Cancelar</button><button class="btn primary" type="submit"><i data-feather="save"></i> Guardar</button></div></form></div></div>
      <div class="gift-phase3-modal" id="giftImportModal" aria-hidden="true"><div class="gift-phase3-dialog" role="dialog" aria-modal="true" aria-labelledby="giftImportTitle"><div class="gift-phase3-dialog-head"><h3 id="giftImportTitle">Importar presentes</h3><button class="btn icon-only" type="button" data-gift-close="giftImportModal" aria-label="Fechar"><i data-feather="x"></i></button></div><div class="field"><label>Ficheiro CSV / TXT</label><input id="giftImportFile" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain"></div><div class="field"><label>Lista</label><textarea id="giftImportText" placeholder="Nome;Categoria&#10;Air fryer;Lista de presentes&#10;Jogo de taças;Loiça"></textarea></div><div class="gift-import-preview">Formato recomendado: <b>Nome;Categoria</b>. Também aceita apenas um nome por linha. A importação faz merge: não elimina itens existentes nem mexe em reservas.</div><div class="gift-phase3-dialog-actions"><button class="btn" type="button" id="giftImportSampleBtn"><i data-feather="file-text"></i> Exemplo</button><button class="btn" type="button" data-gift-close="giftImportModal">Cancelar</button><button class="btn primary" type="button" id="giftImportSubmitBtn"><i data-feather="upload-cloud"></i> Importar</button></div></div></div>`;
  }

  function ensureModals() {
    if (!byId('giftEditorModal')) document.body.insertAdjacentHTML('beforeend', modalHtml());
  }

  function openModal(id) {
    const modal = byId(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = byId(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function modeLabel(mode) {
    if (mode === 'mongo') return 'MongoDB';
    if (mode === 'quantity_contributions') return 'Por quantidades';
    return 'Legacy';
  }

  function syncInviteOptions() {
    const select = byId('giftInviteSelect');
    if (!select) return;
    const list = currentInvites();
    const previous = select.value || state.inviteId;
    select.innerHTML = '<option value="">Seleccione um convite...</option>' + list.map(invite => `<option value="${escapeHtml(invite.id)}">${escapeHtml(invite.coupleNames || invite.slug)} · ${escapeHtml(invite.slug)}</option>`).join('');
    if (previous && list.some(invite => String(invite.id) === String(previous))) select.value = previous;
    else if (list.length === 1) select.value = list[0].id;
    state.inviteId = select.value || '';
  }

  function renderStats() {
    const el = byId('giftCatalogStats');
    if (!el) return;
    const stats = state.stats || {};
    el.innerHTML = [
      ['Total', stats.total || 0, 'itens'],
      ['Disponíveis', stats.available || 0, 'livres'],
      ['Reservados', stats.reserved || 0, 'escolhidos']
    ].map(([label, value, small]) => `<article class="metric-card"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${small}</small></article>`).join('');
  }

  function updateModeUi() {
    const badge = byId('giftCatalogMode');
    const lock = byId('giftCatalogLock');
    const canWrite = state.writable && state.canEdit && adminIsAdmin();
    if (badge) {
      badge.className = `gift-catalog-mode ${escapeHtml(state.mode)}`;
      badge.textContent = modeLabel(state.mode);
    }
    if (lock) {
      if (state.mode === 'mongo') {
        lock.innerHTML = state.canEdit
          ? '<strong>Catálogo MongoDB activo.</strong> Os itens abaixo pertencem apenas a este convite e podem ser geridos no AdminManager.'
          : '<strong>Catálogo MongoDB activo.</strong> Este perfil está em modo de leitura; alterações exigem perfil Administrador.';
      } else if (state.mode === 'quantity_contributions') {
        lock.innerHTML = '<strong>Fluxo especializado preservado.</strong> Este convite usa presentes por quantidade e não é editado por este CRUD.';
      } else {
        lock.innerHTML = '<strong>Catálogo legacy bloqueado.</strong> Esta fase não activa nem modifica presentes de convites existentes. A gestão torna-se editável apenas após opt-in explícito para MongoDB num ambiente de teste.';
      }
    }
    ['giftAddBtn', 'giftImportBtn'].forEach(id => {
      const button = byId(id);
      if (button) {
        button.disabled = !canWrite;
        button.title = canWrite ? button.title : 'Edição disponível apenas para catálogo MongoDB e perfil Administrador.';
      }
    });
  }

  function actionButtons(gift) {
    if (!(state.writable && state.canEdit && adminIsAdmin())) return '<span class="hint">Somente leitura</span>';
    const id = escapeHtml(gift.id || gift._id || '');
    const edit = `<button class="btn small" type="button" data-gift-action="edit" data-gift-id="${id}" title="Editar"><i data-feather="edit-3"></i></button>`;
    const release = gift.reserved ? `<button class="btn small" type="button" data-gift-action="release" data-gift-id="${id}" title="Libertar reserva"><i data-feather="unlock"></i></button>` : '';
    const remove = `<button class="btn small danger" type="button" data-gift-action="delete" data-gift-id="${id}" title="Eliminar"><i data-feather="trash-2"></i></button>`;
    return `<div class="table-actions">${edit}${release}${remove}</div>`;
  }

  function renderGifts() {
    const tbody = byId('giftCatalogTbody');
    const mobile = byId('giftCatalogMobile');
    if (!tbody || !mobile) return;
    const gifts = state.gifts || [];
    if (!state.inviteId) {
      tbody.innerHTML = '<tr><td colspan="5">Seleccione um convite para carregar o catálogo.</td></tr>';
      mobile.innerHTML = '';
      return;
    }
    if (!gifts.length) {
      tbody.innerHTML = '<tr><td colspan="5">Nenhum presente encontrado neste convite.</td></tr>';
      mobile.innerHTML = '<div class="feedback">Nenhum presente encontrado.</div>';
      return;
    }

    tbody.innerHTML = gifts.map(gift => {
      const stateHtml = gift.reserved ? '<span class="gift-state reserved"><i data-feather="lock"></i> Reservado</span>' : '<span class="gift-state available"><i data-feather="check-circle"></i> Disponível</span>';
      const owner = gift.reserved ? `<div class="gift-owner"><strong>${escapeHtml(gift.reservedBy || 'Convidado')}</strong><small>${gift.reservedAt ? escapeHtml(new Date(gift.reservedAt).toLocaleString('pt-PT')) : ''}</small></div>` : '<span class="hint">—</span>';
      return `<tr><td><strong>${escapeHtml(gift.name)}</strong></td><td>${escapeHtml(gift.category || 'Lista de presentes')}</td><td>${stateHtml}</td><td>${owner}</td><td>${actionButtons(gift)}</td></tr>`;
    }).join('');

    mobile.innerHTML = gifts.map(gift => `<article class="gift-mobile-card"><div class="gift-card-top"><div><strong>${escapeHtml(gift.name)}</strong><div class="gift-card-meta">${escapeHtml(gift.category || 'Lista de presentes')}</div></div>${gift.reserved ? '<span class="gift-state reserved">Reservado</span>' : '<span class="gift-state available">Disponível</span>'}</div>${gift.reserved ? `<div class="gift-card-meta">Reservado por <b>${escapeHtml(gift.reservedBy || 'Convidado')}</b>${gift.reservedAt ? ` · ${escapeHtml(new Date(gift.reservedAt).toLocaleString('pt-PT'))}` : ''}</div>` : ''}<div class="table-actions">${actionButtons(gift)}</div></article>`).join('');
    refreshIcons();
  }

  async function loadCatalog() {
    const select = byId('giftInviteSelect');
    state.inviteId = select?.value || state.inviteId || '';
    if (!state.inviteId) {
      state.gifts = [];
      state.stats = { total: 0, reserved: 0, available: 0 };
      state.mode = 'legacy'; state.writable = false; state.canEdit = false;
      renderStats(); updateModeUi(); renderGifts();
      return;
    }
    const q = encodeURIComponent(byId('giftSearchInput')?.value || '');
    setFeedback('A carregar catálogo...');
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/gifts/catalog?q=${q}`);
      const data = out.data || {};
      state.mode = data.mode || 'legacy';
      state.writable = Boolean(data.writable);
      state.canEdit = Boolean(data.canEdit);
      state.gifts = Array.isArray(data.gifts) ? data.gifts : [];
      state.stats = data.stats || { total: state.gifts.length, reserved: state.gifts.filter(g => g.reserved).length, available: state.gifts.filter(g => !g.reserved).length };
      setFeedback('');
      renderStats(); updateModeUi(); renderGifts();
    } catch (error) {
      state.gifts = [];
      setFeedback(escapeHtml(error.message || 'Falha ao carregar presentes.'), true);
      renderGifts();
    }
  }

  function giftById(id) {
    return state.gifts.find(gift => String(gift.id || gift._id) === String(id));
  }

  function openEditor(gift = null) {
    if (!(state.writable && state.canEdit && adminIsAdmin())) return;
    byId('giftEditorId').value = gift?.id || gift?._id || '';
    byId('giftEditorName').value = gift?.name || '';
    byId('giftEditorCategory').value = gift?.category || 'Lista de presentes';
    byId('giftEditorTitle').textContent = gift ? 'Editar presente' : 'Novo presente';
    const nameInput = byId('giftEditorName');
    nameInput.disabled = Boolean(gift?.reserved);
    byId('giftEditorNote').textContent = gift?.reserved ? 'O nome fica bloqueado enquanto o presente estiver reservado. A categoria pode ser alterada.' : '';
    openModal('giftEditorModal');
    setTimeout(() => (gift?.reserved ? byId('giftEditorCategory') : nameInput)?.focus(), 40);
    refreshIcons();
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!(state.writable && state.canEdit && adminIsAdmin())) return;
    const id = byId('giftEditorId').value;
    const payload = { name: byId('giftEditorName').value.trim(), category: byId('giftEditorCategory').value.trim() || 'Lista de presentes' };
    if (!payload.name) return;
    try {
      const path = id
        ? `/manager/invites/${encodeURIComponent(state.inviteId)}/gifts/catalog/${encodeURIComponent(id)}`
        : `/manager/invites/${encodeURIComponent(state.inviteId)}/gifts/catalog`;
      await adminApi(path, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      closeModal('giftEditorModal');
      setFeedback(id ? 'Presente actualizado.' : 'Presente adicionado.');
      await loadCatalog();
    } catch (error) {
      setFeedback(escapeHtml(error.message || 'Não foi possível guardar o presente.'), true);
    }
  }

  async function releaseGift(gift) {
    if (!gift?.reserved || !(state.writable && state.canEdit && adminIsAdmin())) return;
    if (!window.confirm(`Libertar a reserva de "${gift.name}"${gift.reservedBy ? ` feita por ${gift.reservedBy}` : ''}?`)) return;
    try {
      await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/gifts/catalog/${encodeURIComponent(gift.id || gift._id)}/release`, { method: 'POST', body: JSON.stringify({}) });
      setFeedback('Reserva libertada com sucesso.');
      await loadCatalog();
    } catch (error) { setFeedback(escapeHtml(error.message || 'Falha ao libertar reserva.'), true); }
  }

  async function deleteGift(gift) {
    if (!gift || !(state.writable && state.canEdit && adminIsAdmin())) return;
    if (gift.reserved) return setFeedback('Liberte primeiro a reserva antes de eliminar este presente.', true);
    if (!window.confirm(`Eliminar definitivamente o presente "${gift.name}" deste convite?`)) return;
    try {
      await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/gifts/catalog/${encodeURIComponent(gift.id || gift._id)}`, { method: 'DELETE' });
      setFeedback('Presente eliminado.');
      await loadCatalog();
    } catch (error) { setFeedback(escapeHtml(error.message || 'Falha ao eliminar presente.'), true); }
  }

  function openImporter() {
    if (!(state.writable && state.canEdit && adminIsAdmin())) return;
    byId('giftImportText').value = '';
    byId('giftImportFile').value = '';
    openModal('giftImportModal');
    refreshIcons();
  }

  async function submitImport() {
    const text = byId('giftImportText').value.trim();
    if (!text) return setFeedback('Cole ou carregue uma lista de presentes antes de importar.', true);
    if (!window.confirm('Importar esta lista para o convite seleccionado? A operação faz merge e não elimina presentes existentes.')) return;
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/gifts/catalog/bulk`, { method: 'POST', body: JSON.stringify({ text }) });
      const data = out.data || {};
      closeModal('giftImportModal');
      setFeedback(`Importação concluída: <b>${escapeHtml(data.inserted || 0)}</b> novos · <b>${escapeHtml(data.updated || 0)}</b> actualizados · <b>${escapeHtml(data.unchanged || 0)}</b> existentes · <b>${escapeHtml((data.failed || []).length)}</b> falhas.`);
      await loadCatalog();
    } catch (error) { setFeedback(escapeHtml(error.message || 'Falha ao importar presentes.'), true); }
  }

  function exportCsv() {
    if (!state.gifts.length) return setFeedback('Não há presentes para exportar.', true);
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Nome', 'Categoria', 'Estado', 'Reservado por', 'Reservado em'], ...state.gifts.map(gift => [gift.name, gift.category || '', gift.reserved ? 'Reservado' : 'Disponível', gift.reservedBy || '', gift.reservedAt || ''])];
    const csv = '\ufeff' + lines.map(row => row.map(quote).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const invite = currentInvites().find(item => String(item.id) === String(state.inviteId));
    link.href = url;
    link.download = `presentes-${invite?.slug || 'convite'}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function bindEvents() {
    byId('giftInviteSelect')?.addEventListener('change', loadCatalog);
    byId('giftRefreshBtn')?.addEventListener('click', () => { syncInviteOptions(); loadCatalog(); });
    byId('giftAddBtn')?.addEventListener('click', () => openEditor(null));
    byId('giftImportBtn')?.addEventListener('click', openImporter);
    byId('giftExportBtn')?.addEventListener('click', exportCsv);
    byId('giftEditorForm')?.addEventListener('submit', saveEditor);
    byId('giftImportSubmitBtn')?.addEventListener('click', submitImport);
    byId('giftImportSampleBtn')?.addEventListener('click', () => { byId('giftImportText').value = 'Nome;Categoria\nAir fryer;Lista de presentes\nJogo de taças;Loiça'; });
    byId('giftImportFile')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { byId('giftImportText').value = String(reader.result || ''); };
      reader.onerror = () => setFeedback('Não foi possível ler o ficheiro.', true);
      reader.readAsText(file, 'utf-8');
    });
    byId('giftSearchInput')?.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(loadCatalog, 280);
    });

    document.addEventListener('click', event => {
      const close = event.target.closest('[data-gift-close]');
      if (close) closeModal(close.dataset.giftClose);
      const action = event.target.closest('[data-gift-action]');
      if (!action) return;
      const gift = giftById(action.dataset.giftId);
      if (!gift) return;
      if (action.dataset.giftAction === 'edit') openEditor(gift);
      if (action.dataset.giftAction === 'release') releaseGift(gift);
      if (action.dataset.giftAction === 'delete') deleteGift(gift);
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      closeModal('giftEditorModal'); closeModal('giftImportModal');
    });
  }

  function initGiftCatalogPhase3() {
    injectStyles();
    ensurePanelDefinition();
    ensurePanel();
    ensureModals();
    ensureNavigation();
    syncInviteOptions();
    bindEvents();
    renderStats();
    updateModeUi();
    refreshIcons();
    setTimeout(syncInviteOptions, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGiftCatalogPhase3, { once: true });
  else initGiftCatalogPhase3();
})();
