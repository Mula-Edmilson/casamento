(() => {
  'use strict';

  const TAB_ID = 'details';
  const state = {
    inviteId: '',
    draft: null,
    draftRevision: 0,
    loading: false,
    dirty: false
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

  function toast(message, type = '') {
    try { if (typeof appToast === 'function') appToast(message, type || undefined); } catch { /* noop */ }
  }

  function refreshIcons() {
    try { if (typeof iconRefresh === 'function') iconRefresh(); else if (window.feather) window.feather.replace(); } catch { /* noop */ }
  }

  function selectedInviteId() {
    return $('builderV2InviteSelect')?.value || '';
  }

  function mainBuilderHasUnsavedChanges() {
    const firstMetric = document.querySelector('#builderV2Metrics .metric-card small');
    return firstMetric?.textContent?.trim() === 'alterações locais';
  }

  function ensureShape(input) {
    const draft = clone(input || {});
    draft.support = { text: '', contacts: [], whatsapp: '', whatsappSecondary: '', ...(draft.support || {}) };
    draft.payments = { bankAccounts: [], mobilePayments: [], ...(draft.payments || {}) };
    draft.gallery = { title: 'Momentos', items: [], ...(draft.gallery || {}) };
    draft.dressCode = { title: '', note: '', image: '', ...(draft.dressCode || {}) };
    draft.menu = { title: '', note: '', items: [], ...(draft.menu || {}) };
    draft.support.contacts = Array.isArray(draft.support.contacts) ? draft.support.contacts : [];
    draft.payments.bankAccounts = Array.isArray(draft.payments.bankAccounts) ? draft.payments.bankAccounts : [];
    draft.payments.mobilePayments = Array.isArray(draft.payments.mobilePayments) ? draft.payments.mobilePayments : [];
    draft.gallery.items = Array.isArray(draft.gallery.items) ? draft.gallery.items : [];
    draft.menu.items = Array.isArray(draft.menu.items) ? draft.menu.items : [];
    return draft;
  }

  function setFeedback(message = '', error = false) {
    const el = $('builderV2Feedback');
    if (!el) return;
    if (!message) return;
    el.className = `feedback${error ? ' error' : ''}`;
    el.textContent = message;
  }

  function ensureTab() {
    const tabs = $('builderV2Tabs');
    if (!tabs || tabs.querySelector(`[data-builder-details-tab="${TAB_ID}"]`)) return;
    const button = document.createElement('button');
    button.className = 'builder-v2-tab';
    button.type = 'button';
    button.dataset.builderDetailsTab = TAB_ID;
    button.textContent = 'Detalhes';
    const advanced = tabs.querySelector('[data-builder-tab="advanced"]');
    if (advanced) tabs.insertBefore(button, advanced); else tabs.appendChild(button);
    button.addEventListener('click', openDetails);
  }

  function normalizeDateInputs() {
    const eventDate = document.querySelector('#builderV2Editor input[data-builder-path="event.dateISO"]');
    if (eventDate && eventDate.type === 'date') {
      const raw = eventDate.getAttribute('value') || eventDate.value || '';
      eventDate.type = 'text';
      eventDate.value = raw;
      eventDate.placeholder = 'YYYY-MM-DD ou ISO completo';
      const field = eventDate.closest('.field');
      if (field && !field.querySelector('[data-builder-date-hint]')) {
        const hint = document.createElement('small');
        hint.className = 'hint';
        hint.dataset.builderDateHint = '1';
        hint.textContent = 'Aceita ISO completo, por exemplo 2026-08-08T09:00:00+02:00.';
        field.appendChild(hint);
      }
    }
  }

  function markDirty() {
    state.dirty = true;
    const save = $('builderV2DetailsSave');
    if (save) save.disabled = false;
  }

  function textField(label, attr, value, options = {}) {
    const tag = options.textarea ? 'textarea' : 'input';
    const control = tag === 'textarea'
      ? `<textarea data-details-path="${escapeHtml(attr)}">${escapeHtml(value || '')}</textarea>`
      : `<input data-details-path="${escapeHtml(attr)}" value="${escapeHtml(value || '')}">`;
    return `<div class="field ${options.span ? 'builder-span-2' : ''}"><label>${escapeHtml(label)}</label>${control}</div>`;
  }

  function supportHtml() {
    const d = state.draft.support;
    return `<section class="panel-card"><div class="panel-head"><h2><i data-feather="phone"></i> Apoio & Contactos</h2></div><div class="panel-body builder-v2-form-grid">
      ${textField('Texto de apoio', 'support.text', d.text, { span: true, textarea: true })}
      ${textField('WhatsApp principal', 'support.whatsapp', d.whatsapp)}
      ${textField('WhatsApp secundário', 'support.whatsappSecondary', d.whatsappSecondary)}
      <div class="field builder-span-2"><label>Contactos estruturados</label><div class="builder-v2-repeaters">${d.contacts.map((contact, index) => `<article class="builder-v2-repeater"><div class="builder-v2-repeater-head"><strong>Contacto ${index + 1}</strong><button class="btn small danger" type="button" data-details-remove="support-contact" data-index="${index}"><i data-feather="trash-2"></i> Remover</button></div><input data-details-list="support-contact" data-index="${index}" value="${escapeHtml(contact)}"></article>`).join('') || '<div class="builder-v2-empty-mini">Sem contactos estruturados.</div>'}</div><div class="builder-v2-inline-actions"><button class="btn small" type="button" data-details-add="support-contact"><i data-feather="plus"></i> Adicionar contacto</button></div></div>
    </div></section>`;
  }

  function bankHtml() {
    const list = state.draft.payments.bankAccounts;
    return `<section class="panel-card"><div class="panel-head"><h2><i data-feather="credit-card"></i> Contas bancárias</h2></div><div class="panel-body"><div class="builder-v2-repeaters">${list.map((item, index) => `<article class="builder-v2-repeater"><div class="builder-v2-repeater-head"><strong>Conta ${index + 1}</strong><button class="btn small danger" type="button" data-details-remove="bank" data-index="${index}"><i data-feather="trash-2"></i> Remover</button></div><div class="builder-v2-form-grid"><div class="field"><label>Label</label><input data-details-bank="label" data-index="${index}" value="${escapeHtml(item.label || '')}"></div><div class="field"><label>Titular</label><input data-details-bank="holder" data-index="${index}" value="${escapeHtml(item.holder || '')}"></div><div class="field"><label>Conta</label><input data-details-bank="account" data-index="${index}" value="${escapeHtml(item.account || '')}"></div><div class="field"><label>NIB</label><input data-details-bank="nib" data-index="${index}" value="${escapeHtml(item.nib || '')}"></div><div class="field builder-span-2"><label>Logo</label><input data-details-bank="logo" data-index="${index}" value="${escapeHtml(item.logo || '')}"></div></div></article>`).join('') || '<div class="builder-v2-empty-mini">Sem contas bancárias.</div>'}</div><div class="builder-v2-inline-actions"><button class="btn small" type="button" data-details-add="bank"><i data-feather="plus"></i> Adicionar conta</button></div></div></section>`;
  }

  function mobilePaymentHtml() {
    const list = state.draft.payments.mobilePayments;
    return `<section class="panel-card"><div class="panel-head"><h2><i data-feather="smartphone"></i> Pagamentos móveis</h2></div><div class="panel-body"><div class="builder-v2-repeaters">${list.map((item, index) => `<article class="builder-v2-repeater"><div class="builder-v2-repeater-head"><strong>Canal ${index + 1}</strong><button class="btn small danger" type="button" data-details-remove="mobile" data-index="${index}"><i data-feather="trash-2"></i> Remover</button></div><div class="builder-v2-form-grid"><div class="field"><label>Label</label><input data-details-mobile="label" data-index="${index}" value="${escapeHtml(item.label || '')}"></div><div class="field"><label>Número</label><input data-details-mobile="number" data-index="${index}" value="${escapeHtml(item.number || '')}"></div><div class="field"><label>Titular</label><input data-details-mobile="holder" data-index="${index}" value="${escapeHtml(item.holder || '')}"></div><div class="field"><label>Logo</label><input data-details-mobile="logo" data-index="${index}" value="${escapeHtml(item.logo || '')}"></div></div></article>`).join('') || '<div class="builder-v2-empty-mini">Sem pagamentos móveis.</div>'}</div><div class="builder-v2-inline-actions"><button class="btn small" type="button" data-details-add="mobile"><i data-feather="plus"></i> Adicionar canal</button></div></div></section>`;
  }

  function galleryHtml() {
    const g = state.draft.gallery;
    return `<section class="panel-card"><div class="panel-head"><h2><i data-feather="image"></i> Galeria</h2></div><div class="panel-body builder-v2-form-grid">${textField('Título', 'gallery.title', g.title, { span: true })}<div class="field builder-span-2"><div class="builder-v2-repeaters">${g.items.map((item, index) => `<article class="builder-v2-repeater"><div class="builder-v2-repeater-head"><strong>Imagem ${index + 1}</strong><button class="btn small danger" type="button" data-details-remove="gallery" data-index="${index}"><i data-feather="trash-2"></i> Remover</button></div><div class="builder-v2-form-grid"><div class="field builder-span-2"><label>Imagem / src</label><input data-details-gallery="src" data-index="${index}" value="${escapeHtml(item.src || item.url || item.image || '')}"></div><div class="field"><label>Alt</label><input data-details-gallery="alt" data-index="${index}" value="${escapeHtml(item.alt || '')}"></div><div class="field"><label>Legenda</label><input data-details-gallery="caption" data-index="${index}" value="${escapeHtml(item.caption || '')}"></div></div></article>`).join('') || '<div class="builder-v2-empty-mini">Sem imagens.</div>'}</div><div class="builder-v2-inline-actions"><button class="btn small" type="button" data-details-add="gallery"><i data-feather="plus"></i> Adicionar imagem</button></div></div></div></section>`;
  }

  function dressMenuHtml() {
    const dress = state.draft.dressCode;
    const menu = state.draft.menu;
    return `<div class="builder-v2-two-col"><section class="panel-card"><div class="panel-head"><h2><i data-feather="user-check"></i> Dress Code</h2></div><div class="panel-body builder-v2-form-grid one-col">${textField('Título', 'dressCode.title', dress.title)}${textField('Nota', 'dressCode.note', dress.note, { textarea: true })}${textField('Imagem', 'dressCode.image', dress.image)}</div></section><section class="panel-card"><div class="panel-head"><h2><i data-feather="coffee"></i> Menu</h2></div><div class="panel-body builder-v2-form-grid one-col">${textField('Título', 'menu.title', menu.title)}${textField('Nota', 'menu.note', menu.note, { textarea: true })}<div class="builder-v2-repeaters">${menu.items.map((item, index) => `<article class="builder-v2-repeater"><div class="builder-v2-repeater-head"><strong>Item ${index + 1}</strong><button class="btn small danger" type="button" data-details-remove="menu" data-index="${index}"><i data-feather="trash-2"></i> Remover</button></div><div class="field"><label>Categoria</label><input data-details-menu="label" data-index="${index}" value="${escapeHtml(item.label || '')}"></div><div class="field"><label>Título</label><input data-details-menu="title" data-index="${index}" value="${escapeHtml(item.title || '')}"></div><div class="field"><label>Descrição</label><textarea data-details-menu="text" data-index="${index}">${escapeHtml(item.text || '')}</textarea></div></article>`).join('') || '<div class="builder-v2-empty-mini">Sem itens de menu.</div>'}</div><div class="builder-v2-inline-actions"><button class="btn small" type="button" data-details-add="menu"><i data-feather="plus"></i> Adicionar item</button></div></div></section></div>`;
  }

  function render() {
    const editor = $('builderV2Editor');
    if (!editor || !state.draft) return;
    document.querySelectorAll('#builderV2Tabs .builder-v2-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector('[data-builder-details-tab="details"]')?.classList.add('active');
    editor.innerHTML = `<div class="builder-v2-safe-note"><i data-feather="layers"></i><div><strong>Detalhes estruturados do mesmo Draft.</strong><span>Apoio, pagamentos, galeria, dress code e menu. O save usa a mesma API de Draft e nunca publica nem activa o renderer.</span></div></div><div class="builder-v2-inline-actions"><button class="btn small primary" id="builderV2DetailsSave" type="button" disabled><i data-feather="save"></i> Guardar detalhes no Draft</button></div>${supportHtml()}<div class="builder-v2-two-col">${bankHtml()}${mobilePaymentHtml()}</div>${galleryHtml()}${dressMenuHtml()}`;
    bindControls();
    refreshIcons();
  }

  async function openDetails() {
    if (mainBuilderHasUnsavedChanges()) {
      setFeedback('Existem alterações locais no Builder principal. Guarde ou recarregue antes de editar Detalhes.', true);
      return;
    }
    const inviteId = selectedInviteId();
    if (!inviteId) return setFeedback('Seleccione um convite primeiro.', true);
    state.loading = true;
    setFeedback('A carregar detalhes estruturados...');
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(inviteId)}/content`);
      const data = out.data || {};
      state.inviteId = inviteId;
      state.draft = ensureShape(data.content?.draft || data.suggestedDraft || {});
      state.draftRevision = Number(data.content?.draftRevision || 0);
      state.dirty = false;
      render();
      setFeedback('Detalhes carregados. Alterações só são persistidas ao Guardar detalhes no Draft.');
    } catch (error) {
      setFeedback(error.message || 'Falha ao carregar detalhes.', true);
    } finally { state.loading = false; }
  }

  function setPath(path, value) {
    const parts = path.split('.');
    let cursor = state.draft;
    parts.forEach((key, index) => {
      if (index === parts.length - 1) cursor[key] = value;
      else { cursor[key] = cursor[key] && typeof cursor[key] === 'object' ? cursor[key] : {}; cursor = cursor[key]; }
    });
  }

  function bindControls() {
    document.querySelectorAll('#builderV2Editor [data-details-path]').forEach(control => control.addEventListener('input', () => { setPath(control.dataset.detailsPath, control.value); markDirty(); }));
    const bindObjectList = (selector, list, datasetKey) => document.querySelectorAll(selector).forEach(control => control.addEventListener('input', () => {
      const item = list[Number(control.dataset.index)];
      if (item) item[control.dataset[datasetKey]] = control.value;
      markDirty();
    }));
    bindObjectList('[data-details-bank]', state.draft.payments.bankAccounts, 'detailsBank');
    bindObjectList('[data-details-mobile]', state.draft.payments.mobilePayments, 'detailsMobile');
    bindObjectList('[data-details-gallery]', state.draft.gallery.items, 'detailsGallery');
    bindObjectList('[data-details-menu]', state.draft.menu.items, 'detailsMenu');
    document.querySelectorAll('[data-details-list="support-contact"]').forEach(control => control.addEventListener('input', () => { state.draft.support.contacts[Number(control.dataset.index)] = control.value; markDirty(); }));

    document.querySelectorAll('[data-details-add]').forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.detailsAdd;
      if (type === 'support-contact') state.draft.support.contacts.push('');
      if (type === 'bank') state.draft.payments.bankAccounts.push({ label: '', holder: '', account: '', nib: '', logo: '' });
      if (type === 'mobile') state.draft.payments.mobilePayments.push({ label: '', number: '', holder: '', logo: '' });
      if (type === 'gallery') state.draft.gallery.items.push({ src: '', alt: '', caption: '' });
      if (type === 'menu') state.draft.menu.items.push({ label: '', title: '', text: '' });
      markDirty(); render();
    }));
    document.querySelectorAll('[data-details-remove]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const type = button.dataset.detailsRemove;
      if (type === 'support-contact') state.draft.support.contacts.splice(index, 1);
      if (type === 'bank') state.draft.payments.bankAccounts.splice(index, 1);
      if (type === 'mobile') state.draft.payments.mobilePayments.splice(index, 1);
      if (type === 'gallery') state.draft.gallery.items.splice(index, 1);
      if (type === 'menu') state.draft.menu.items.splice(index, 1);
      markDirty(); render();
    }));
    $('builderV2DetailsSave')?.addEventListener('click', save);
  }

  async function save() {
    if (!state.dirty || !state.inviteId || !state.draft) return;
    if (mainBuilderHasUnsavedChanges()) return setFeedback('O Builder principal tem alterações locais. Guarde/recarregue antes de guardar Detalhes.', true);
    const button = $('builderV2DetailsSave');
    if (button) button.disabled = true;
    setFeedback('A guardar detalhes no Draft...');
    try {
      const out = await adminApi(`/manager/invites/${encodeURIComponent(state.inviteId)}/content/draft`, {
        method: 'PUT',
        body: JSON.stringify({ expectedDraftRevision: state.draftRevision, content: state.draft, note: 'Detalhes estruturados pelo Admin Manager Builder V2' })
      });
      const data = out.data || {};
      state.draft = ensureShape(data.content?.draft || state.draft);
      state.draftRevision = Number(data.content?.draftRevision || state.draftRevision + 1);
      state.dirty = false;
      setFeedback(`Detalhes guardados. Draft revisão ${state.draftRevision}.`);
      toast('Detalhes do Builder V2 guardados.');
      setTimeout(() => $('builderV2ReloadBtn')?.click(), 50);
    } catch (error) {
      setFeedback(error.message || 'Falha ao guardar detalhes.', true);
      if (button) button.disabled = false;
    }
  }

  function observe() {
    const observer = new MutationObserver(() => {
      ensureTab();
      normalizeDateInputs();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ensureTab();
    normalizeDateInputs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, { once: true });
  else observe();
})();
