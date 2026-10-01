(() => {
  'use strict';

  const PANEL_ID = 'builderV2';
  const PANEL_EL_ID = 'builderV2Panel';
  const state = {
    inviteId: '',
    invite: null,
    contentDoc: null,
    draft: null,
    draftRevision: 0,
    publishedRevision: 0,
    revisions: [],
    validation: null,
    dirty: false,
    loading: false,
    activeTab: 'identity'
  };

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function adminApi(path, options = {}) {
    if (typeof api !== 'function') return Promise.reject(new Error('API do AdminManager indisponível.'));
    return api(path, options);
  }

  function adminIsAdmin() {
    try { return typeof isAdmin === 'function' ? Boolean(isAdmin()) : false; }
    catch { return false; }
  }

  function currentInvites() {
    try { return Array.isArray(invites) ? invites : []; }
    catch { return []; }
  }

  function refreshIcons() {
    try { if (typeof iconRefresh === 'function') iconRefresh(); else if (window.feather) window.feather.replace(); }
    catch { /* noop */ }
  }

  function toast(message, type = '') {
    try { if (typeof appToast === 'function') appToast(message, type || undefined); }
    catch { /* noop */ }
  }

  function setFeedback(message = '', error = false) {
    const el = $('builderV2Feedback');
    if (!el) return;
    if (!message) {
      el.className = 'feedback hidden';
      el.textContent = '';
      return;
    }
    el.className = `feedback${error ? ' error' : ''}`;
    el.textContent = message;
  }

  function getPath(obj, path) {
    return String(path).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
  }

  function setPath(obj, path, value) {
    const parts = String(path).split('.');
    let cursor = obj;
    parts.forEach((key, index) => {
      if (index === parts.length - 1) cursor[key] = value;
      else {
        const nextKey = parts[index + 1];
        if (cursor[key] == null || typeof cursor[key] !== 'object') cursor[key] = /^\d+$/.test(nextKey) ? [] : {};
        cursor = cursor[key];
      }
    });
  }

  function ensureDraftShape(input) {
    const draft = clone(input || {});
    draft.identity = { slug: '', packageKey: 'perola', templateKey: '', eventType: 'Casamento', language: 'Português', ...(draft.identity || {}) };
    draft.people = { coupleNames: '', displayNames: '', bride: '', groom: '', monogram: '', brideParents: '', groomParents: '', ...(draft.people || {}) };
    draft.event = { dateISO: '', dateLabel: '', timezone: 'Africa/Maputo', rsvpDeadline: '', verse: '', verseReference: '', invitationNote: '', ...(draft.event || {}) };
    draft.story = { title: 'A Nossa História', text: '', chapters: [], letter: '', ...(draft.story || {}) };
    draft.access = { mode: 'nominal', rsvpIdentity: 'guest_token', requireNameOnActions: false, maxGuestsPerRsvp: 1, allowCompanionName: false, autoCreateGuestOnRsvp: false, autoCreateGuestOnGift: false, ...(draft.access || {}) };
    draft.features = { story: true, gallery: true, rsvp: true, dressCode: true, gifts: true, contributions: true, messages: true, checkin: true, capsule: true, guestInfo: true, menu: true, ...(draft.features || {}) };
    draft.gifts = { mode: 'catalog', catalogMode: 'legacy', store: '', options: [], ...(draft.gifts || {}) };
    draft.media = { heroImage: '', coverImage: '', storyImage: '', musicUrl: '', ...(draft.media || {}) };
    draft.seo = { title: '', description: '', image: '', ...(draft.seo || {}) };
    draft.schedule = Array.isArray(draft.schedule) ? draft.schedule : [];
    draft.story.chapters = Array.isArray(draft.story.chapters) ? draft.story.chapters : [];
    return draft;
  }

  function markDirty() {
    state.dirty = true;
    renderStatus();
  }

  function ensurePanelDefinition() {
    try {
      if (!Array.isArray(panels) || panels.some(panel => panel.id === PANEL_ID)) return;
      const entry = { id: PANEL_ID, label: 'Construtor', icon: 'edit-3' };
      const githubIndex = panels.findIndex(panel => panel.id === 'github');
      if (githubIndex >= 0) panels.splice(githubIndex, 0, entry);
      else panels.push(entry);
    } catch { /* fallback navigation below */ }
  }

  function makeNavButton(target, mobile = false) {
    if (!target || target.querySelector(`[data-panel="${PANEL_ID}"]`)) return;
    const button = document.createElement('button');
    button.className = mobile ? 'mobile-tab' : 'nav-item';
    button.type = 'button';
    button.dataset.panel = PANEL_ID;
    button.innerHTML = '<i data-feather="edit-3"></i><span>Construtor</span>';
    const github = target.querySelector('[data-panel="github"]');
    if (github) target.insertBefore(button, github); else target.appendChild(button);
  }

  function ensureNavigation() {
    makeNavButton($('sideNav'), false);
    makeNavButton($('mobileTabs'), true);
    document.querySelectorAll(`[data-panel="${PANEL_ID}"]`).forEach(button => {
      if (button.dataset.builderV2Bound === '1') return;
      button.dataset.builderV2Bound = '1';
      button.addEventListener('click', () => {
        try { if (typeof showPanel === 'function') showPanel(PANEL_ID); } catch { /* noop */ }
        syncInviteOptions();
      });
    });
  }

  function panelHtml() {
    return `
      <section class="section" id="${PANEL_EL_ID}">
        <div class="section-title builder-v2-title">
          <div><h1>Construtor</h1><p>Conteúdo estruturado do convite com Draft, validação, publicação e histórico.</p></div>
          <span id="builderV2Mode" class="builder-v2-mode legacy">Legacy</span>
        </div>
        <div class="builder-v2-safe-note"><i data-feather="shield"></i><div><strong>Publicar conteúdo não activa o renderer V2.</strong><span>A activação de <code>mongo-v2</code> continua separada e explícita. Esta interface não migra convites automaticamente.</span></div></div>
        <section class="panel-card builder-v2-toolbar-card"><div class="panel-body"><div class="builder-v2-toolbar">
          <select id="builderV2InviteSelect" class="search-input"><option value="">Seleccione um convite...</option></select>
          <div class="builder-v2-toolbar-spacer"></div>
          <button class="btn small" id="builderV2ReloadBtn" type="button"><i data-feather="refresh-cw"></i> Recarregar</button>
          <button class="btn small" id="builderV2ValidateBtn" type="button"><i data-feather="check-circle"></i> Validar</button>
          <button class="btn small" id="builderV2PreviewBtn" type="button"><i data-feather="eye"></i> Preview</button>
          <button class="btn small primary" id="builderV2SaveBtn" type="button"><i data-feather="save"></i> Guardar Draft</button>
          <button class="btn small builder-v2-publish" id="builderV2PublishBtn" type="button"><i data-feather="upload-cloud"></i> Publicar</button>
        </div><div id="builderV2Feedback" class="feedback hidden"></div></div></section>
        <div id="builderV2Empty" class="builder-v2-empty"><div><i data-feather="edit-3"></i><strong>Seleccione um convite</strong><span>O Builder carrega o Draft existente ou prepara uma sugestão a partir da configuração legacy, sem gravar nada automaticamente.</span></div></div>
        <div id="builderV2Workspace" class="hidden">
          <div id="builderV2Metrics" class="metrics-grid builder-v2-metrics"></div>
          <div id="builderV2Tabs" class="builder-v2-tabs"></div>
          <div id="builderV2Editor"></div>
        </div>
      </section>`;
  }

  function ensurePanel() {
    if ($(PANEL_EL_ID)) return;
    const anchor = $('managePanel') || $('guestsPanel') || document.querySelector('.content');
    if (!anchor) return;
    if (anchor.classList.contains('section')) anchor.insertAdjacentHTML('afterend', panelHtml());
    else anchor.insertAdjacentHTML('beforeend', panelHtml());
  }

  function ensurePreviewModal() {
    if ($('builderV2PreviewModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="builder-v2-modal" id="builderV2PreviewModal" aria-hidden="true">
        <div class="builder-v2-dialog" role="dialog" aria-modal="true" aria-labelledby="builderV2PreviewTitle">
          <div class="builder-v2-dialog-head"><div><small>PREVIEW EDITORIAL</small><h3 id="builderV2PreviewTitle">Draft do convite</h3></div><button class="btn icon-only" type="button" data-builder-close="builderV2PreviewModal" aria-label="Fechar"><i data-feather="x"></i></button></div>
          <div id="builderV2PreviewBody"></div>
        </div>
      </div>`);
  }

  function syncInviteOptions() {
    const select = $('builderV2InviteSelect');
    if (!select) return;
    const list = currentInvites();
    const previous = state.inviteId || select.value;
    select.innerHTML = '<option value="">Seleccione um convite...</option>' + list.map(invite =>
      `<option value="${escapeHtml(invite.id)}">${escapeHtml(invite.coupleNames || invite.slug)} · ${escapeHtml(invite.slug)}</option>`
    ).join('');
    if (previous && list.some(invite => String(invite.id) === String(previous))) select.value = previous;
  }

  function renderStatus() {
    const mode = $('builderV2Mode');
    const inviteMode = String(state.invite?.contentMode || 'legacy');
    if (mode) {
      mode.className = `builder-v2-mode ${inviteMode === 'legacy' ? 'legacy' : 'mongo'}`;
      mode.textContent = inviteMode === 'legacy' ? 'Legacy' : 'V2 activo';
    }
    const metrics = $('builderV2Metrics');
    if (metrics && state.draft) {
      metrics.innerHTML = [
        ['Draft', state.draftRevision, state.dirty ? 'alterações locais' : 'sincronizado'],
        ['Publicado', state.publishedRevision, state.publishedRevision ? 'revisão actual' : 'ainda não publicado'],
        ['Renderer', inviteMode === 'legacy' ? 'Legacy' : 'V2', inviteMode === 'legacy' ? 'não activado' : 'activo']
      ].map(([label, value, note]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join('');
    }
    const publish = $('builderV2PublishBtn');
    if (publish) publish.disabled = !state.draft || !adminIsAdmin() || state.dirty || state.loading;
  }

  const field = (label, path, options = {}) => {
    const type = options.type || 'text';
    const value = getPath(state.draft, path);
    const common = `data-builder-path="${escapeHtml(path)}" ${options.readonly ? 'readonly' : ''}`;
    let control;
    if (type === 'textarea') {
      control = `<textarea ${common} placeholder="${escapeHtml(options.placeholder || '')}">${escapeHtml(value || '')}</textarea>`;
    } else if (type === 'select') {
      control = `<select ${common}>${(options.items || []).map(item => {
        const itemValue = typeof item === 'string' ? item : item.value;
        const itemLabel = typeof item === 'string' ? item : item.label;
        return `<option value="${escapeHtml(itemValue)}" ${String(value) === String(itemValue) ? 'selected' : ''}>${escapeHtml(itemLabel)}</option>`;
      }).join('')}</select>`;
    } else {
      control = `<input ${common} type="${escapeHtml(type)}" value="${escapeHtml(value ?? '')}" ${options.min != null ? `min="${escapeHtml(options.min)}"` : ''} placeholder="${escapeHtml(options.placeholder || '')}">`;
    }
    return `<div class="field ${options.span ? 'builder-span-2' : ''}"><label>${escapeHtml(label)}</label>${control}${options.hint ? `<small class="hint">${escapeHtml(options.hint)}</small>` : ''}</div>`;
  };

  function tabDefinitions() {
    return [
      ['identity', 'Identidade'], ['event', 'Evento'], ['story', 'História'], ['access', 'Acesso'],
      ['features', 'Features'], ['media', 'Media & SEO'], ['advanced', 'Avançado'], ['revisions', 'Revisões']
    ];
  }

  function renderTabs() {
    const tabs = $('builderV2Tabs');
    if (!tabs) return;
    tabs.innerHTML = tabDefinitions().map(([id, label]) => `<button class="builder-v2-tab ${state.activeTab === id ? 'active' : ''}" type="button" data-builder-tab="${id}">${label}</button>`).join('');
  }

  function renderSchedule() {
    const list = state.draft.schedule || [];
    return `<div id="builderV2Schedule" class="builder-v2-repeaters">${list.length ? list.map((item, index) => `
      <article class="builder-v2-repeater"><div class="builder-v2-repeater-head"><strong>Momento ${index + 1}</strong><button class="btn small danger" type="button" data-builder-schedule-remove="${index}"><i data-feather="trash-2"></i> Remover</button></div>
      <div class="builder-v2-form-grid">
        ${scheduleField(index, 'Título', 'title')}${scheduleField(index, 'Tipo', 'type')}${scheduleField(index, 'Hora', 'time')}${scheduleField(index, 'Local', 'venue')}${scheduleField(index, 'Mapa', 'mapUrl', true)}${scheduleField(index, 'Nota', 'note', true)}
      </div></article>`).join('') : '<div class="builder-v2-empty-mini">Sem momentos na agenda. Adicione pelo menos um antes de publicar.</div>'}</div>
      <div class="builder-v2-inline-actions"><button class="btn small" type="button" id="builderV2AddSchedule"><i data-feather="plus"></i> Adicionar momento</button></div>`;
  }

  function scheduleField(index, label, key, span = false) {
    const value = state.draft.schedule[index]?.[key] || '';
    return `<div class="field ${span ? 'builder-span-2' : ''}"><label>${escapeHtml(label)}</label><input data-builder-schedule-index="${index}" data-builder-schedule-key="${key}" value="${escapeHtml(value)}"></div>`;
  }

  function renderChapters() {
    const list = state.draft.story.chapters || [];
    return `<div class="builder-v2-repeaters">${list.length ? list.map((item, index) => `
      <article class="builder-v2-repeater"><div class="builder-v2-repeater-head"><strong>Capítulo ${index + 1}</strong><button class="btn small danger" type="button" data-builder-chapter-remove="${index}"><i data-feather="trash-2"></i> Remover</button></div>
      <div class="builder-v2-form-grid"><div class="field"><label>Título</label><input data-builder-chapter-index="${index}" data-builder-chapter-key="title" value="${escapeHtml(item.title || '')}"></div><div class="field builder-span-2"><label>Texto</label><textarea data-builder-chapter-index="${index}" data-builder-chapter-key="text">${escapeHtml(item.text || '')}</textarea></div></div>
      </article>`).join('') : '<div class="builder-v2-empty-mini">Sem capítulos estruturados.</div>'}</div>
      <div class="builder-v2-inline-actions"><button class="btn small" type="button" id="builderV2AddChapter"><i data-feather="plus"></i> Adicionar capítulo</button></div>`;
  }

  function renderFeatureToggles() {
    const labels = {
      story: 'História', gallery: 'Galeria', rsvp: 'RSVP', dressCode: 'Dress code', gifts: 'Presentes',
      contributions: 'Contribuições', messages: 'Mensagens', checkin: 'Check-in', capsule: 'Cápsula', guestInfo: 'Info do convidado', menu: 'Menu'
    };
    return `<div id="builderV2FeatureToggles" class="builder-v2-toggle-list">${Object.entries(labels).map(([key, label]) => `
      <label class="builder-v2-toggle"><input type="checkbox" data-builder-feature="${key}" ${state.draft.features[key] ? 'checked' : ''}><span><strong>${escapeHtml(label)}</strong><small>Controla a disponibilidade desta secção no conteúdo V2.</small></span></label>`).join('')}</div>`;
  }

  function renderRevisions() {
    if (!state.revisions.length) return '<div class="builder-v2-empty-mini">Ainda não existem revisões.</div>';
    return `<div class="builder-v2-revisions">${state.revisions.map(revision => `
      <article class="builder-v2-revision"><div><span class="builder-v2-stage ${escapeHtml(revision.stage)}">${escapeHtml(revision.stage)}</span><strong>Revisão ${escapeHtml(revision.revision)}</strong><small>${escapeHtml(revision.createdAt ? new Date(revision.createdAt).toLocaleString('pt-PT') : '')}</small><p>${escapeHtml(revision.note || '')}</p></div>
      ${revision.stage === 'published' && adminIsAdmin() ? `<button class="btn small" type="button" data-builder-rollback="${escapeHtml(revision.revision)}"><i data-feather="rotate-ccw"></i> Restaurar para Draft</button>` : ''}</article>`).join('')}</div>`;
  }

  function renderActiveTab() {
    const editor = $('builderV2Editor');
    if (!editor || !state.draft) return;
    let html = '';
    if (state.activeTab === 'identity') html = `<section class="panel-card"><div class="panel-head"><h2><i data-feather="heart"></i> Identidade</h2></div><div class="panel-body builder-v2-form-grid">
      ${field('Slug', 'identity.slug', { readonly: true })}${field('Pacote', 'identity.packageKey', { readonly: true })}${field('Template', 'identity.templateKey')}${field('Tipo de evento', 'identity.eventType')}${field('Idioma', 'identity.language')}${field('Nome do casal / evento', 'people.coupleNames')}${field('Nomes de exibição', 'people.displayNames')}${field('Noiva', 'people.bride')}${field('Noivo', 'people.groom')}${field('Monograma', 'people.monogram')}${field('Pais da noiva', 'people.brideParents', { span: true })}${field('Pais do noivo', 'people.groomParents', { span: true })}
      </div></section>`;
    if (state.activeTab === 'event') html = `<div class="builder-v2-two-col"><section class="panel-card"><div class="panel-head"><h2><i data-feather="calendar"></i> Evento</h2></div><div class="panel-body builder-v2-form-grid">
      ${field('Data ISO', 'event.dateISO', { type: 'date' })}${field('Data por extenso', 'event.dateLabel')}${field('Timezone', 'event.timezone')}${field('Prazo RSVP', 'event.rsvpDeadline', { type: 'date' })}${field('Versículo', 'event.verse', { type: 'textarea', span: true })}${field('Referência', 'event.verseReference')}${field('Nota do convite', 'event.invitationNote', { type: 'textarea', span: true })}
      </div></section><section class="panel-card"><div class="panel-head"><h2><i data-feather="clock"></i> Agenda</h2></div><div class="panel-body">${renderSchedule()}</div></section></div>`;
    if (state.activeTab === 'story') html = `<section class="panel-card"><div class="panel-head"><h2><i data-feather="book-open"></i> História</h2></div><div class="panel-body builder-v2-form-grid">${field('Título', 'story.title')}${field('Introdução', 'story.text', { type: 'textarea', span: true })}${field('Carta', 'story.letter', { type: 'textarea', span: true })}</div><div class="panel-body builder-v2-subsection">${renderChapters()}</div></section>`;
    if (state.activeTab === 'access') html = `<div class="builder-v2-two-col"><section class="panel-card"><div class="panel-head"><h2><i data-feather="lock"></i> Acesso & RSVP</h2></div><div class="panel-body builder-v2-form-grid">
      ${field('Modo de acesso', 'access.mode', { type: 'select', items: [{ value: 'nominal', label: 'Nominal' }, { value: 'open', label: 'Aberto' }] })}${field('Máx. pessoas por RSVP', 'access.maxGuestsPerRsvp', { type: 'number', min: 1 })}
      <label class="builder-v2-toggle builder-span-2"><input type="checkbox" data-builder-path="access.requireNameOnActions" ${state.draft.access.requireNameOnActions ? 'checked' : ''}><span><strong>Exigir nome nas acções</strong><small>Recomendado para convites abertos.</small></span></label>
      <label class="builder-v2-toggle builder-span-2"><input type="checkbox" data-builder-path="access.allowCompanionName" ${state.draft.access.allowCompanionName ? 'checked' : ''}><span><strong>Permitir nome do acompanhante</strong><small>Usado quando o RSVP admite acompanhante.</small></span></label>
      </div></section><section class="panel-card"><div class="panel-head"><h2><i data-feather="gift"></i> Presentes</h2></div><div class="panel-body builder-v2-form-grid">${field('Modo', 'gifts.mode', { type: 'select', items: ['none','catalog','quantity_contributions','monetary'] })}${field('Loja / referência', 'gifts.store', { span: true })}<div class="builder-v2-readonly-note builder-span-2"><strong>Catálogo operacional separado.</strong> A lista/reservas continua gerida no painel Presentes. O Builder define apenas o comportamento da secção.</div></div></section></div>`;
    if (state.activeTab === 'features') html = `<section class="panel-card"><div class="panel-head"><h2><i data-feather="sliders"></i> Features</h2></div><div class="panel-body">${renderFeatureToggles()}</div></section>`;
    if (state.activeTab === 'media') html = `<div class="builder-v2-two-col"><section class="panel-card"><div class="panel-head"><h2><i data-feather="image"></i> Media</h2></div><div class="panel-body builder-v2-form-grid one-col">${field('Hero image', 'media.heroImage')}${field('Cover image', 'media.coverImage')}${field('Story image', 'media.storyImage')}${field('Música', 'media.musicUrl')}</div></section><section class="panel-card"><div class="panel-head"><h2><i data-feather="search"></i> SEO</h2></div><div class="panel-body builder-v2-form-grid one-col">${field('Título SEO', 'seo.title')}${field('Descrição SEO', 'seo.description', { type: 'textarea' })}${field('Imagem SEO', 'seo.image')}</div></section></div>`;
    if (state.activeTab === 'advanced') html = `<section class="panel-card"><div class="panel-head"><h2><i data-feather="code"></i> JSON avançado</h2></div><div class="panel-body"><div class="builder-v2-danger-note"><strong>Área avançada.</strong> O JSON nunca é publicado directamente. Aplicar aqui altera apenas o Draft local; depois é obrigatório Guardar Draft e validar.</div><textarea id="builderV2Json" class="builder-v2-json">${escapeHtml(JSON.stringify(state.draft, null, 2))}</textarea><div class="builder-v2-inline-actions"><button class="btn" id="builderV2ApplyJson" type="button"><i data-feather="check"></i> Aplicar JSON ao Draft local</button></div></div></section>`;
    if (state.activeTab === 'revisions') html = `<section class="panel-card"><div class="panel-head"><h2><i data-feather="clock"></i> Histórico</h2><button class="btn small" id="builderV2RefreshRevisions" type="button"><i data-feather="refresh-cw"></i> Actualizar</button></div><div class="panel-body">${renderRevisions()}</div></section>`;
    editor.innerHTML = html;
    bindDynamicControls();
    refreshIcons();
  }

  function renderWorkspace() {
    const ready = Boolean(state.draft);
    $('builderV2Empty')?.classList.toggle('hidden', ready);
    $('builderV2Workspace')?.classList.toggle('hidden', !ready);
    renderStatus();
    if (!ready) return;
    renderTabs();
    renderActiveTab();
  }

  function valueFromControl(control) {
    if (control.type === 'checkbox') return control.checked;
    if (control.type === 'number') return Math.max(1, Number(control.value) || 1);
    return control.value;
  }

  function bindDynamicControls() {
    document.querySelectorAll('#builderV2Editor [data-builder-path]').forEach(control => {
      control.addEventListener('input', () => {
        setPath(state.draft, control.dataset.builderPath, valueFromControl(control));
        markDirty();
      });
      control.addEventListener('change', () => {
        setPath(state.draft, control.dataset.builderPath, valueFromControl(control));
        if (control.dataset.builderPath === 'access.mode') {
          state.draft.access.rsvpIdentity = control.value === 'open' ? 'name' : 'guest_token';
          if (control.value === 'nominal') {
            state.draft.access.autoCreateGuestOnRsvp = false;
            state.draft.access.autoCreateGuestOnGift = false;
          }
        }
        markDirty();
      });
    });
    document.querySelectorAll('#builderV2Editor [data-builder-feature]').forEach(control => control.addEventListener('change', () => {
      state.draft.features[control.dataset.builderFeature] = control.checked;
      markDirty();
    }));
    document.querySelectorAll('#builderV2Editor [data-builder-schedule-index]').forEach(control => control.addEventListener('input', () => {
      const item = state.draft.schedule[Number(control.dataset.builderScheduleIndex)];
      if (item) item[control.dataset.builderScheduleKey] = control.value;
      markDirty();
    }));
    document.querySelectorAll('#builderV2Editor [data-builder-chapter-index]').forEach(control => control.addEventListener('input', () => {
      const item = state.draft.story.chapters[Number(control.dataset.builderChapterIndex)];
      if (item) item[control.dataset.builderChapterKey] = control.value;
      markDirty();
    }));
    $('builderV2AddSchedule')?.addEventListener('click', () => {
      state.draft.schedule.push({ id: '', type: 'item', title: '', time: '', venue: '', mapUrl: '', note: '' });
      markDirty(); renderActiveTab();
    });
    document.querySelectorAll('[data-builder-schedule-remove]').forEach(button => button.addEventListener('click', () => {
      state.draft.schedule.splice(Number(button.dataset.builderScheduleRemove), 1);
      markDirty(); renderActiveTab();
    }));
    $('builderV2AddChapter')?.addEventListener('click', () => {
      state.draft.story.chapters.push({ id: '', title: '', text: '' });
      markDirty(); renderActiveTab();
    });
    document.querySelectorAll('[data-builder-chapter-remove]').forEach(button => button.addEventListener('click', () => {
      state.draft.story.chapters.splice(Number(button.dataset.builderChapterRemove), 1);
      markDirty(); renderActiveTab();
    }));
    $('builderV2ApplyJson')?.addEventListener('click', applyJsonDraft);
    $('builderV2RefreshRevisions')?.addEventListener('click', loadRevisions);
    document.querySelectorAll('[data-builder-rollback]').forEach(button => button.addEventListener('click', () => rollbackRevision(Number(button.dataset.builderRollback))));
  }

  async function loadContent(inviteId, options = {}) {
    if (!inviteId) {
      state.inviteId = ''; state.invite = null; state.draft = null; state.contentDoc = null; state.revisions = [];
      renderWorkspace(); return;
    }
    state.loading = true; renderStatus(); setFeedback('A carregar conteúdo...');
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(inviteId)}/content`);
      const data = out.data || {};
      state.inviteId = inviteId;
      state.invite = data.invite || null;
      state.contentDoc = data.content || null;
      state.draft = ensureDraftShape(data.content?.draft || data.suggestedDraft || {});
      state.draftRevision = Number(data.content?.draftRevision || 0);
      state.publishedRevision = Number(data.content?.publishedRevision || 0);
      state.validation = null;
      state.dirty = false;
      renderWorkspace();
      await loadRevisions({ silent: true });
      setFeedback(options.reload ? 'Conteúdo recarregado.' : 'Conteúdo carregado. Alterações só são persistidas ao Guardar Draft.');
    } catch (error) {
      state.draft = null;
      renderWorkspace();
      setFeedback(error.message || 'Falha ao carregar o conteúdo.', true);
    } finally {
      state.loading = false; renderStatus();
    }
  }

  async function loadRevisions(options = {}) {
    if (!state.inviteId) return;
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/content/revisions?limit=50`);
      state.revisions = Array.isArray(out.data) ? out.data : [];
      if (state.activeTab === 'revisions') renderActiveTab();
    } catch (error) {
      if (!options.silent) setFeedback(error.message || 'Falha ao carregar revisões.', true);
    }
  }

  async function saveDraft() {
    if (!state.inviteId || !state.draft) return setFeedback('Seleccione um convite primeiro.', true);
    state.loading = true; renderStatus(); setFeedback('A guardar Draft...');
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/content/draft`, {
        method: 'PUT',
        body: JSON.stringify({ expectedDraftRevision: state.draftRevision, content: state.draft, note: 'Guardado pelo Admin Manager Builder V2' })
      });
      const data = out.data || {};
      state.contentDoc = data.content || state.contentDoc;
      state.draft = ensureDraftShape(data.content?.draft || state.draft);
      state.draftRevision = Number(data.content?.draftRevision || state.draftRevision + 1);
      state.publishedRevision = Number(data.content?.publishedRevision || state.publishedRevision);
      state.validation = data.validation || null;
      state.dirty = false;
      await loadRevisions({ silent: true });
      renderWorkspace();
      setFeedback(`Draft guardado. Revisão ${state.draftRevision}.`);
      toast('Draft Builder V2 guardado.');
    } catch (error) {
      setFeedback(error.message || 'Falha ao guardar Draft.', true);
    } finally { state.loading = false; renderStatus(); }
  }

  async function validateDraft() {
    if (!state.inviteId || !state.draft) return setFeedback('Seleccione um convite primeiro.', true);
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/content/validate`, {
        method: 'POST', body: JSON.stringify({ stage: 'publish', content: state.draft })
      });
      const data = out.data || {};
      state.validation = data;
      const warnings = Array.isArray(data.warnings) && data.warnings.length ? ` Avisos: ${data.warnings.join(' · ')}` : '';
      setFeedback(data.valid ? `Validação para publicação: PASS.${warnings}` : `Validação falhou: ${(data.errors || []).join(' · ')}`, !data.valid);
    } catch (error) { setFeedback(error.message || 'Falha na validação.', true); }
  }

  async function publishDraft() {
    if (!adminIsAdmin()) return setFeedback('Publicar exige perfil Administrador.', true);
    if (!state.draft) return setFeedback('Seleccione um convite primeiro.', true);
    if (state.dirty) return setFeedback('Existem alterações locais por guardar. Guarde o Draft antes de publicar.', true);
    if (!window.confirm('Publicar o Draft guardado? Isto cria uma revisão publicada, mas não activa automaticamente o renderer V2.')) return;
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/content/publish`, {
        method: 'POST', body: JSON.stringify({ expectedDraftRevision: state.draftRevision, note: 'Publicado pelo Admin Manager Builder V2' })
      });
      const data = out.data || {};
      state.contentDoc = data.content || state.contentDoc;
      state.publishedRevision = Number(data.content?.publishedRevision || state.publishedRevision);
      await loadRevisions({ silent: true });
      renderWorkspace();
      setFeedback(data.activationNote || 'Conteúdo publicado.');
      toast('Conteúdo Builder V2 publicado.');
    } catch (error) { setFeedback(error.message || 'Falha ao publicar.', true); }
  }

  async function rollbackRevision(revision) {
    if (!adminIsAdmin()) return setFeedback('Rollback exige perfil Administrador.', true);
    if (state.dirty) return setFeedback('Existem alterações locais por guardar. Guarde ou recarregue antes do rollback.', true);
    if (!window.confirm(`Restaurar a revisão publicada ${revision} para o Draft? O conteúdo público não será alterado.`)) return;
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/content/rollback`, {
        method: 'POST', body: JSON.stringify({ revision, expectedDraftRevision: state.draftRevision })
      });
      const data = out.data || {};
      state.contentDoc = data.content || state.contentDoc;
      state.draft = ensureDraftShape(data.content?.draft || state.draft);
      state.draftRevision = Number(data.content?.draftRevision || state.draftRevision + 1);
      state.dirty = false;
      await loadRevisions({ silent: true });
      renderWorkspace();
      setFeedback(data.note || `Revisão ${revision} restaurada para Draft.`);
    } catch (error) { setFeedback(error.message || 'Falha no rollback.', true); }
  }

  function applyJsonDraft() {
    const input = $('builderV2Json');
    if (!input) return;
    try {
      const parsed = JSON.parse(input.value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('O JSON deve representar um objecto.');
      state.draft = ensureDraftShape(parsed);
      markDirty();
      setFeedback('JSON aplicado ao Draft local. Ainda precisa de Guardar Draft antes de validar/publicar.');
      renderActiveTab();
    } catch (error) { setFeedback(`JSON inválido: ${error.message}`, true); }
  }

  function openPreview() {
    if (!state.draft) return setFeedback('Seleccione um convite primeiro.', true);
    const d = state.draft;
    const body = $('builderV2PreviewBody');
    if (!body) return;
    const schedule = (d.schedule || []).map(item => `<article><small>${escapeHtml(item.time || item.type || '')}</small><strong>${escapeHtml(item.title || 'Momento')}</strong><span>${escapeHtml(item.venue || '')}</span></article>`).join('');
    body.innerHTML = `
      <div class="builder-v2-preview-hero">${d.media.heroImage ? `<img class="builder-v2-preview-image" src="${escapeHtml(d.media.heroImage)}" alt="">` : '<div class="builder-v2-preview-image"></div>'}<div><small>PREVIEW EDITORIAL</small><h2>${escapeHtml(d.people.displayNames || d.people.coupleNames || 'Convite')}</h2><p>${escapeHtml(d.event.dateLabel || d.event.dateISO || '')}</p></div></div>
      ${d.event.verse ? `<blockquote>${escapeHtml(d.event.verse)}${d.event.verseReference ? `<cite>${escapeHtml(d.event.verseReference)}</cite>` : ''}</blockquote>` : ''}
      <div class="builder-v2-preview-grid">${schedule || '<article><strong>Agenda ainda vazia</strong></article>'}</div>
      ${d.story.text ? `<div class="builder-v2-preview-copy"><h3>${escapeHtml(d.story.title || 'A Nossa História')}</h3><p>${escapeHtml(d.story.text)}</p></div>` : ''}
      <div class="builder-v2-preview-footer"><span>Preview editorial do Draft · não é o HTML público</span><span>Draft ${escapeHtml(state.draftRevision)}</span></div>`;
    const modal = $('builderV2PreviewModal');
    modal?.classList.add('open'); modal?.setAttribute('aria-hidden', 'false');
    refreshIcons();
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function bindEvents() {
    $('builderV2InviteSelect')?.addEventListener('change', async event => {
      const next = event.target.value;
      if (state.dirty && state.inviteId && next !== state.inviteId) {
        const ok = window.confirm('Existem alterações locais por guardar. Trocar de convite irá descartá-las. Continuar?');
        if (!ok) { event.target.value = state.inviteId; return; }
      }
      await loadContent(next);
    });
    $('builderV2ReloadBtn')?.addEventListener('click', () => {
      if (!state.inviteId) return;
      if (state.dirty && !window.confirm('Existem alterações locais por guardar. Recarregar irá descartá-las. Continuar?')) return;
      loadContent(state.inviteId, { reload: true });
    });
    $('builderV2ValidateBtn')?.addEventListener('click', validateDraft);
    $('builderV2PreviewBtn')?.addEventListener('click', openPreview);
    $('builderV2SaveBtn')?.addEventListener('click', saveDraft);
    $('builderV2PublishBtn')?.addEventListener('click', publishDraft);
    document.addEventListener('click', event => {
      const tab = event.target.closest('[data-builder-tab]');
      if (tab) { state.activeTab = tab.dataset.builderTab; renderTabs(); renderActiveTab(); }
      const close = event.target.closest('[data-builder-close]');
      if (close) closeModal(close.dataset.builderClose);
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal('builderV2PreviewModal'); });
  }

  function initBuilderV2() {
    ensurePanelDefinition();
    ensurePanel();
    ensurePreviewModal();
    ensureNavigation();
    syncInviteOptions();
    bindEvents();
    renderWorkspace();
    refreshIcons();
    setTimeout(syncInviteOptions, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBuilderV2, { once: true });
  else initBuilderV2();
})();
