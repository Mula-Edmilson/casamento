(() => {
  'use strict';

  const TEMPLATE_KEY = 'esmeralda-rosalina';
  const RESUME_KEY = 'lirandzo_template_factory_open_invite';
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));

  function adminApi(path, options = {}) {
    if (typeof api !== 'function') return Promise.reject(new Error('API do AdminManager indisponível.'));
    return api(path, options);
  }

  function adminIsAdmin() {
    try { return typeof isAdmin === 'function' ? Boolean(isAdmin()) : false; }
    catch { return false; }
  }

  function toast(message, type = '') {
    try { if (typeof appToast === 'function') appToast(message, type || undefined); }
    catch { /* noop */ }
  }

  function slugify(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }

  function ensureStyles() {
    if ($('templateFactoryV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'templateFactoryV2Styles';
    style.textContent = `
      .factory-v2-card{border-color:rgba(184,132,94,.28)!important;background:linear-gradient(180deg,rgba(184,132,94,.08),rgba(255,255,255,.015))!important}
      .factory-v2-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:rgba(22,199,132,.10);color:var(--green);font-size:10px;font-weight:900}
      .factory-v2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .factory-v2-span{grid-column:1/-1}.factory-v2-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .factory-v2-feedback{margin-top:10px;font-size:11px;color:var(--muted)}.factory-v2-feedback.error{color:var(--red)}
      .factory-v2-builder-controls{display:none;gap:7px;align-items:center;flex-wrap:wrap}.factory-v2-builder-controls.visible{display:flex}
      @media(max-width:760px){.factory-v2-grid{grid-template-columns:1fr}.factory-v2-span{grid-column:auto}.factory-v2-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function factoryCardHtml() {
    return `
      <section class="panel-card factory-v2-card" id="templateFactoryV2Card">
        <div class="panel-head"><h2><i data-feather="copy"></i> Template Factory V2 <span class="factory-v2-badge">NOVO</span></h2></div>
        <div class="panel-body">
          <p class="hint" style="margin-bottom:12px">Cria um convite novo e independente usando a estrutura visual Rosalina. Dados pessoais do convite original não são copiados.</p>
          <form id="templateFactoryV2Form">
            <div class="factory-v2-grid">
              <div class="field"><label>Template</label><select id="factoryTemplate" disabled><option value="${TEMPLATE_KEY}">Esmeralda · Rosalina</option></select></div>
              <div class="field"><label>Nome do casal</label><input id="factoryCoupleNames" required placeholder="Ex.: Ana & João"></div>
              <div class="field"><label>Noiva</label><input id="factoryBride" placeholder="Ana"></div>
              <div class="field"><label>Noivo</label><input id="factoryGroom" placeholder="João"></div>
              <div class="field"><label>Slug</label><input id="factorySlug" required placeholder="ana-joao"></div>
              <div class="field"><label>Data do evento</label><input id="factoryEventDate" type="datetime-local"></div>
              <div class="field"><label>Prazo RSVP</label><input id="factoryRsvpDeadline" type="date"></div>
              <div class="field"><label>Estado inicial</label><input value="Draft · renderer Legacy seguro" readonly></div>
              <div class="factory-v2-span factory-v2-actions">
                <button class="btn primary" id="factoryCreateBtn" type="submit"><i data-feather="plus-circle"></i> Criar convite Rosalina</button>
                <span class="hint">Depois da criação, o convite abre directamente no Construtor.</span>
              </div>
            </div>
            <div id="factoryFeedback" class="factory-v2-feedback"></div>
          </form>
        </div>
      </section>`;
  }

  function ensureFactoryCard() {
    if ($('templateFactoryV2Card')) return;
    const panel = $('newInvitePanel');
    const legacyForm = $('newInviteForm');
    if (!panel || !legacyForm) return;
    legacyForm.insertAdjacentHTML('beforebegin', factoryCardHtml());
    try { if (window.feather) window.feather.replace(); } catch { /* noop */ }
  }

  function setFactoryFeedback(message = '', error = false) {
    const el = $('factoryFeedback');
    if (!el) return;
    el.textContent = message;
    el.className = `factory-v2-feedback${error ? ' error' : ''}`;
  }

  function syncSlugFromNames() {
    const names = $('factoryCoupleNames');
    const slug = $('factorySlug');
    if (!names || !slug || slug.dataset.manual === '1') return;
    slug.value = slugify(names.value);
  }

  async function createFactoryInvite(event) {
    event.preventDefault();
    if (!adminIsAdmin()) return setFactoryFeedback('Criar convite exige perfil Administrador.', true);
    const button = $('factoryCreateBtn');
    const coupleNames = String($('factoryCoupleNames')?.value || '').trim();
    const slug = slugify($('factorySlug')?.value || coupleNames);
    if (!coupleNames || !slug) return setFactoryFeedback('Nome do casal e slug são obrigatórios.', true);

    const payload = {
      templateKey: TEMPLATE_KEY,
      coupleNames,
      clientName: coupleNames,
      bride: String($('factoryBride')?.value || '').trim(),
      groom: String($('factoryGroom')?.value || '').trim(),
      slug,
      eventDateISO: String($('factoryEventDate')?.value || '').trim(),
      rsvpDeadline: String($('factoryRsvpDeadline')?.value || '').trim()
    };

    if (button) button.disabled = true;
    setFactoryFeedback('A criar Invite + Draft V2 + pasta GitHub...');
    try {
      const out = await adminApi('/manager/template-factory/invites', { method:'POST', body:JSON.stringify(payload) });
      const invite = out?.data?.invite || {};
      if (!invite.id) throw new Error('O backend não devolveu o ID do convite criado.');
      sessionStorage.setItem(RESUME_KEY, String(invite.id));
      setFactoryFeedback(`Criado com sucesso: ${invite.slug}. A abrir o Construtor...`);
      toast('Convite Rosalina criado no Template Factory V2.');
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setFactoryFeedback(error.message || 'Falha ao criar convite.', true);
      if (button) button.disabled = false;
    }
  }

  function ensureBuilderControls() {
    if ($('templateFactoryBuilderControls')) return;
    const toolbar = document.querySelector('.builder-v2-toolbar');
    if (!toolbar) return;
    const controls = document.createElement('div');
    controls.id = 'templateFactoryBuilderControls';
    controls.className = 'factory-v2-builder-controls';
    controls.innerHTML = `
      <span id="factoryBuilderStatus" class="factory-v2-badge">Factory V2</span>
      <button class="btn small primary" id="factoryActivateBtn" type="button"><i data-feather="zap"></i> Activar V2</button>
      <button class="btn small" id="factoryRollbackBtn" type="button"><i data-feather="rotate-ccw"></i> Voltar Legacy</button>`;
    toolbar.appendChild(controls);
    $('factoryActivateBtn')?.addEventListener('click', activateSelectedFactoryInvite);
    $('factoryRollbackBtn')?.addEventListener('click', rollbackSelectedFactoryInvite);
    try { if (window.feather) window.feather.replace(); } catch { /* noop */ }
  }

  async function getSelectedFactoryState() {
    const select = $('builderV2InviteSelect');
    const inviteId = String(select?.value || '').trim();
    if (!inviteId) return null;
    const out = await adminApi(`/manager/invites/${encodeURIComponent(inviteId)}/content`);
    const data = out?.data || {};
    const templateKey = String(data.content?.draft?.identity?.templateKey || data.content?.published?.identity?.templateKey || '').trim();
    return {
      inviteId,
      templateKey,
      contentMode: String(data.invite?.contentMode || 'legacy'),
      draftRevision: Number(data.content?.draftRevision || 0),
      publishedRevision: Number(data.content?.publishedRevision || 0)
    };
  }

  async function refreshBuilderFactoryState() {
    ensureBuilderControls();
    const controls = $('templateFactoryBuilderControls');
    if (!controls) return;
    try {
      const state = await getSelectedFactoryState();
      const managed = state && state.templateKey === TEMPLATE_KEY;
      controls.classList.toggle('visible', Boolean(managed));
      if (!managed) return;
      const active = state.contentMode === 'mongo-v2';
      const status = $('factoryBuilderStatus');
      if (status) status.textContent = active ? `Factory V2 · activo · Published ${state.publishedRevision}` : `Factory V2 · legacy · Published ${state.publishedRevision}`;
      const activate = $('factoryActivateBtn');
      const rollback = $('factoryRollbackBtn');
      if (activate) activate.disabled = active || state.publishedRevision < 1 || !adminIsAdmin();
      if (rollback) rollback.disabled = !active || !adminIsAdmin();
    } catch {
      controls.classList.remove('visible');
    }
  }

  async function activateSelectedFactoryInvite() {
    const state = await getSelectedFactoryState();
    if (!state || state.templateKey !== TEMPLATE_KEY) return;
    if (state.publishedRevision < 1) return toast('Publique primeiro o Draft no Construtor.', 'warning');
    if (!window.confirm('Activar o renderer V2 deste convite? O conteúdo Published passará a alimentar o convite público.')) return;
    try {
      await adminApi(`/manager/template-factory/invites/${encodeURIComponent(state.inviteId)}/activate`, { method:'POST', body:'{}' });
      toast('Renderer V2 activado.');
      const select = $('builderV2InviteSelect');
      if (select) select.dispatchEvent(new Event('change', { bubbles:true }));
      window.setTimeout(refreshBuilderFactoryState, 350);
    } catch (error) { toast(error.message || 'Falha ao activar V2.', 'error'); }
  }

  async function rollbackSelectedFactoryInvite() {
    const state = await getSelectedFactoryState();
    if (!state || state.templateKey !== TEMPLATE_KEY) return;
    if (!window.confirm('Voltar este convite para renderer Legacy? O Published V2 continuará guardado no MongoDB.')) return;
    try {
      await adminApi(`/manager/template-factory/invites/${encodeURIComponent(state.inviteId)}/rollback`, { method:'POST', body:'{}' });
      toast('Renderer devolvido a Legacy.');
      const select = $('builderV2InviteSelect');
      if (select) select.dispatchEvent(new Event('change', { bubbles:true }));
      window.setTimeout(refreshBuilderFactoryState, 350);
    } catch (error) { toast(error.message || 'Falha no rollback.', 'error'); }
  }

  function bind() {
    $('factoryCoupleNames')?.addEventListener('input', syncSlugFromNames);
    $('factorySlug')?.addEventListener('input', event => { event.currentTarget.dataset.manual = event.currentTarget.value ? '1' : '0'; });
    $('templateFactoryV2Form')?.addEventListener('submit', createFactoryInvite);
    $('builderV2InviteSelect')?.addEventListener('change', () => window.setTimeout(refreshBuilderFactoryState, 120));
  }

  function resumeCreatedInvite() {
    const inviteId = sessionStorage.getItem(RESUME_KEY);
    if (!inviteId) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const select = $('builderV2InviteSelect');
      if (select && Array.from(select.options).some(option => String(option.value) === String(inviteId))) {
        window.clearInterval(timer);
        sessionStorage.removeItem(RESUME_KEY);
        try { if (typeof showPanel === 'function') showPanel('builderV2'); } catch { /* noop */ }
        select.value = inviteId;
        select.dispatchEvent(new Event('change', { bubbles:true }));
        window.setTimeout(refreshBuilderFactoryState, 250);
      } else if (attempts > 20) {
        window.clearInterval(timer);
        sessionStorage.removeItem(RESUME_KEY);
      }
    }, 250);
  }

  function init() {
    ensureStyles();
    ensureFactoryCard();
    ensureBuilderControls();
    bind();
    resumeCreatedInvite();
    window.setTimeout(refreshBuilderFactoryState, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
