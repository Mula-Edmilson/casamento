(() => {
  'use strict';

  const PANEL_ID = 'builderV2';
  const PANEL_EL_ID = 'builderV2Panel';
  const ACTIVE_MODE = 'mongo-v2';
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

  const byId = id => document.getElementById(id);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const bool = value => Boolean(value);

  function adminApi(path, options = {}) {
    if (typeof api !== 'function') return Promise.reject(new Error('API do AdminManager indisponÃ­vel.'));
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

  function setFeedback(message = '', error = false) {
    const el = byId('builderV2Feedback');
    if (!el) return;
    if (!message) {
      el.className = 'feedback hidden';
      el.textContent = '';
      return;
    }
    el.className = `feedback${error ? ' error' : ''}`;
    el.innerHTML = message;
  }

  function setLoading(loading) {
    state.loading = Boolean(loading);
    document.querySelectorAll('[data-builder-v2-action]').forEach(button => {
      if (button.dataset.builderV2Action === 'preview') return;
      button.disabled = state.loading;
    });
    const panel = byId(PANEL_EL_ID);
    if (panel) panel.classList.toggle('builder-v2-loading', state.loading);
  }

  function getPath(object, path) {
    return String(path || '').split('.').filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], object);
  }

  function setPath(object, path, value) {
    const keys = String(path || '').split('.').filter(Boolean);
    if (!keys.length) return;
    let cursor = object;
    keys.slice(0, -1).forEach(key => {
      if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
      cursor = cursor[key];
    });
    cursor[keys[keys.length - 1]] = value;
  }

  function defaultDraft() {
    return {
      schemaVersion: '2.0',
      identity: { slug: '', packageKey: 'perola', templateKey: '', eventType: 'Casamento', language: 'PortuguÃªs' },
      people: { coupleNames: '', displayNames: '', bride: '', groom: '', monogram: '', brideParents: '', groomParents: '' },
      event: { dateISO: '', dateLabel: '', timezone: 'Africa/Maputo', rsvpDeadline: '', verse: '', verseReference: '', invitationNote: '' },
      schedule: [],
      story: { title: 'A Nossa HistÃ³ria', text: '', chapters: [], letter: '' },
      access: { mode: 'nominal', rsvpIdentity: 'guest_token', requireNameOnActions: false, maxGuestsPerRsvp: 1, allowCompanionName: false, autoCreateGuestOnRsvp: false, autoCreateGuestOnGift: false },
      features: { story: true, gallery: true, rsvp: true, dressCode: true, gifts: true, contributions: true, messages: true, checkin: true, capsule: true, guestInfo: true, menu: true },
      gifts: { mode: 'catalog', catalogMode: 'legacy', store: '', options: [] },
      payments: { bankAccounts: [], mobilePayments: [] },
      support: { text: '', contacts: [], whatsapp: '', whatsappSecondary: '' },
      gallery: { title: 'Momentos', items: [] },
      dressCode: { title: '', note: '', image: '' },
      menu: { title: '', note: '', items: [] },
      media: { heroImage: '', coverImage: '', storyImage: '', musicUrl: '' },
      seo: { title: '', description: '', image: '' },
      runtime: { contentMode: 'legacy', rendererVersion: 'v1' }
    };
  }

  function normalizeDraftShape(value) {
    const base = defaultDraft();
    const source = value && typeof value === 'object' ? clone(value) : {};
    return {
      ...base,
      identity: { ...base.identity, ...(source.identity || {}) },
      people: { ...base.people, ...(source.people || {}) },
      event: { ...base.event, ...(source.event || {}) },
      story: { ...base.story, ...(source.story || {}) },
      access: { ...base.access, ...(source.access || {}) },
      features: { ...base.features, ...(source.features || {}) },
      gifts: { ...base.gifts, ...(source.gifts || {}) },
      payments: { ...base.payments, ...(source.payments || {}) },
      support: { ...base.support, ...(source.support || {}) },
      gallery: { ...base.gallery, ...(source.gallery || {}) },
      dressCode: { ...base.dressCode, ...(source.dressCode || {}) },
      menu: { ...base.menu, ...(source.menu || {}) },
      media: { ...base.media, ...(source.media || {}) },
      seo: { ...base.seo, ...(source.seo || {}) },
      runtime: { ...base.runtime, ...(source.runtime || {}) },
      schedule: Array.isArray(source.schedule) ? source.schedule : [],
    };
  }

  function ensurePanelDefinition() {
    try {
      if (Array.isArray(panels) && !panels.some(panel => panel.id === PANEL_ID)) {
        const manageIndex = panels.findIndex(panel => panel.id === 'manage');
        const entry = { id: PANEL_ID, label: 'Construtor', icon: 'edit-3' };
        if (manageIndex >= 0) panels.splice(manageIndex + 1, 0, entry);
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
    button.innerHTML = '<i data-feather="edit-3"></i><span>Construtor</span>';
    const manage = target.querySelector('[data-panel="manage"]');
    if (manage?.nextSibling) target.insertBefore(button, manage.nextSibling);
    else if (manage) target.appendChild(button);
    else target.appendChild(button);
  }

  function ensureNavigation() {
    makeNavButton(byId('sideNav'), false);
    makeNavButton(byId('mobileTabs'), true);
    document.querySelectorAll(`[data-panel="${PANEL_ID}"]`).forEach(button => {
      if (button.dataset.builderV2Bound === '1') return;
      button.dataset.builderV2Bound = '1';
      button.addEventListener('click', () => {
        try { if (typeof showPanel === 'function') showPanel(PANEL_ID); }
        catch { /* noop */ }
        syncInviteOptions();
        if (state.inviteId) loadContent();
      });
    });
  }

  const field = (label, path, options = {}) => {
    const type = options.type || 'text';
    const attrs = [
      `data-builder-path="${escapeHtml(path)}"`,
      options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : '',
      options.readonly ? 'readonly' : '',
      options.min ? `min="${escapeHtml(options.min)}"` : ''
    ].filter(Boolean).join(' ');
    if (type === 'textarea') return `<div class="field ${options.span ? 'builder-span-2' : ''}"><label>${escapeHtml(label)}</label><textarea ${attrs}></textarea>${options.hint ? `<small class="hint">${escapeHtml(options.hint)}²È="25½±±‰…¬¸œ°ÑÉÕ”¤ì(€€€¥˜€ …İ¥¹‘½Ü¹½¹™¥É´¡I•ÍÑ…ÕÉ…È„É•Ù¥Ï¼ÁÕ‰±¥…‘„€‘íÉ•Ù¥Í¥½¹ôÁ…É„Õ´¹½Ù¼É…™Ğü<½¹Ñ—é‘¼Ãé‰±¥¼»¼Í•Ë„…±Ñ•É…‘¼¹€¤¤É•ÑÕÉ¸ì(€€€Í•Ñ1½…‘¥¹œ¡ÑÉÕ”¤ìÍ•Ñ••‘‰…¬ œœ¤ì(€€€ÑÉäì(€€€€€½¹ÍĞ½ÕĞ€ô…İ…¥Ğ…‘µ¥¹Á¤¡€½µ…¹…•È½¥¹Ù¥Ñ•Ì¼‘í•¹½‘•UI%½µÁ½¹•¹Ğ¡ÍÑ…Ñ”¹¥¹Ù¥Ñ•%¥ô½½¹Ñ•¹Ğ½É½±±‰…­€°ì(€€€€€€€µ•Ñ¡½è€A=MPœ°‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ìÉ•Ù¥Í¥½¸è9Õµ‰•È¡É•Ù¥Í¥½¸¤°•áÁ•Ñ•‘É…™ÑI•Ù¥Í¥½¸èÍÑ…Ñ”¹‘É…™ÑI•Ù¥Í¥½¸ô¤(€€€€€ô¤ì(€€€€€½¹ÍĞ‘…Ñ„€ô½ÕĞ¹‘…Ñ„ñğíôì(€€€€€ÍÑ…Ñ”¹‘É…™Ğ€ô¹½Éµ…±¥é•É…™ÑM¡…Á”¡‘…Ñ„¹½¹Ñ•¹Ğü¹‘É…™ĞñğÍÑ…Ñ”¹‘É…™Ğ¤ì(€€€€€ÍÑ…Ñ”¹‘É…™ÑI•Ù¥Í¥½¸€ô9Õµ‰•È¡‘…Ñ„¹½¹Ñ•¹Ğü¹‘É…™ÑI•Ù¥Í¥½¸ñğÍÑ…Ñ”¹‘É…™ÑI•Ù¥Í¥½¸€¬€Ä¤ì(€€€€€ÍÑ…Ñ”¹ÁÕ‰±¥Í¡•‘I•Ù¥Í¥½¸€ô9Õµ‰•È¡‘…Ñ„¹½¹Ñ•¹Ğü¹ÁÕ‰±¥Í¡•‘I•Ù¥Í¥½¸ñğÍÑ…Ñ”¹ÁÕ‰±¥Í¡•‘I•Ù¥Í¥½¸¤ì(€€€€€ÍÑ…Ñ”¹‘¥ÉÑä€ô™…±Í”ì(€€€€€É•¹‘•É¥•±‘Ì ¤ì(€€€€€Í•Ñ••‘‰…¬¡I•Ù¥Ï¼ÁÕ‰±¥…‘„€‘í•Í…Á•!Ñµ°¡É•Ù¥Í¥½¸¥ôÉ•ÍÑ…ÕÉ…‘„Á…É„¼É…™Ğ€‘í•Í…Á•!Ñµ°¡ÍÑ…Ñ”¹‘É…™ÑI•Ù¥Í¥½¸¥ô¸<½¹Ñ—é‘¼Ãé‰±¥¼»¼µÕ‘½Ô¹€¤ì(€€€€€…İ…¥Ğ±½…‘I•Ù¥Í¥½¹Ì ¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€Í•Ñ••‘‰…¬¡•Í…Á•!Ñµ°¡•ÉÉ½È¹µ•ÍÍ…”ñğ€…±¡„…¼É•ÍÑ…ÕÉ…ÈÉ•Ù¥Ï¼¸œ¤°ÑÉÕ”¤ì(€€€ô™¥¹…±±äìÍ•Ñ1½…‘¥¹œ¡™…±Í”¤ìô(€ô((€™Õ¹Ñ¥½¸…ÁÁ±å‘Ù…¹•‘)Í½¸ ¤ì(€€€½¹ÍĞ©Í½¸€ô‰å% ‰Õ¥±‘•ÉXÉ)Í½¸œ¤ì(€€€¥˜€ …©Í½¸¤É•ÑÕÉ¸ì(€€€ÑÉäì(€€€€€½¹ÍĞÁ…ÉÍ•€ô)M=8¹Á…ÉÍ”¡©Í½¸¹Ù…±Õ”¤ì(€€€€€¥˜€ …Á…ÉÍ•ñğÑåÁ•½˜Á…ÉÍ•€„ôô€½‰©•ĞœñğÉÉ…ä¹¥ÍÉÉ…ä¡Á…ÉÍ•¤¤Ñ¡É½Ü¹•ÜÉÉ½È <)M=8ÁÉ•¥Í„É•ÁÉ•Í•¹Ñ…ÈÕ´½‰©•Ñ¼¸œ¤ì(€€€€€½¹ÍĞ•á¥ÍÑ¥¹M±Õœ€ôÍÑ…Ñ”¹‘É…™Ğü¹¥‘•¹Ñ¥Ñäü¹Í±Õœñğ€œœì(€€€€€ÍÑ…Ñ”¹‘É…™Ğ€ô¹½Éµ…±¥é•É…™ÑM¡…Á”¡Á…ÉÍ•¤ì(€€€€€¥˜€¡•á¥ÍÑ¥¹M±Õœ¤ÍÑ…Ñ”¹‘É…™Ğ¹¥‘•¹Ñ¥Ñä¹Í±Õœ€ô•á¥ÍÑ¥¹M±Õœì(€€€€€µ…É­¥ÉÑä ¤ì(€€€€€É•¹‘•É¥•±‘Ì ¤ì(€€€€€Í•Ñ••‘‰…¬ )M=8…Á±¥…‘¼…¼É…™Ğ±½…°¸Y…±¥‘””Õ…É‘”…¹Ñ•Ì‘”ÁÕ‰±¥…È¸œ¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€Í•Ñ••‘‰…¬¡)M=8¥¹Û…±¥‘¼è€‘í•Í…Á•!Ñµ°¡•ÉÉ½È¹µ•ÍÍ…”¥õ€°ÑÉÕ”¤ì(€€€ô(€ô((€™Õ¹Ñ¥½¸É•¹‘•ÉAÉ•Ù¥•Ü ¤ì(€€€¥˜€ …ÍÑ…Ñ”¹‘É…™Ğ¤É•ÑÕÉ¸ì(€€€½¹ÍĞ€ôÍÑ…Ñ”¹‘É…™Ğì(€€€½¹ÍĞ‰½‘ä€ô‰å% ‰Õ¥±‘•ÉXÉAÉ•Ù¥•İ	½‘äœ¤ì(€€€¥˜€ …‰½‘ä¤É•ÑÕÉ¸ì(€€€‰½‘ä¹¥¹¹•É!Q50€ô€(€€€€€€ñ‘¥Ø±…ÍÌô‰‰Õ¥±‘•ÈµØÈµÁÉ•Ù¥•Üµ¡•É¼ˆø‘í¹µ•‘¥„ü¹¡•É½%µ…”€ü€ñ¥µœ±…ÍÌô‰‰Õ¥±‘•ÈµØÈµÁÉ•Ù¥•Üµ¥µ…”ˆÍÉŒôˆ‘í•Í…Á•!Ñµ°¡¹µ•‘¥„¹¡•É½%µ…”¥ôˆ…±Ğôˆˆù€€è€œôñ‘¥ØøñÍµ…±°ø‘í•Í…Á•!Ñµ°¡¹¥‘•¹Ñ¥Ñäü¹•Ù•¹ÑQåÁ”ñğ€…Í…µ•¹Ñ¼œ¥ôğ½Íµ…±°øñ Èø‘í•Í…Á•!Ñµ°¡¹Á•½Á±”ü¹‘¥ÍÁ±…å9…µ•Ìñğ¹Á•½Á±”ü¹½ÕÁ±•9…µ•Ìñğ€9½µ”‘¼…Í…°œ¥ôğ½ ÈøñÀø‘í•Í…Á•!Ñµ°¡¹•Ù•¹Ğü¹‘…Ñ•1…‰•°ñğ¹•Ù•¹Ğü¹‘…Ñ•%M<ñğ€…Ñ„Á½È‘•™¥¹¥Èœ¥ôğ½Àøğ½‘¥Øøğ½‘¥Øø(€€€€€€‘í¹•Ù•¹Ğü¹Ù•ÉÍ”€ü€ñ‰±½­ÅÕ½Ñ”ø‘í•Í…Á•!Ñµ°¡¹•Ù•¹Ğ¹Ù•ÉÍ”¥ô‘í¹•Ù•¹Ğü¹Ù•ÉÍ•I•™•É•¹”€ü€ñ¥Ñ”ø‘í•Í…Á•!Ñµ°¡¹•Ù•¹Ğ¹Ù•ÉÍ•I•™•É•¹”¥ôğ½¥Ñ”ù€€è€œôğ½‰±½­ÅÕ½Ñ”ù€€è€œô(€€€€€€ñ‘¥Ø±…ÍÌô‰‰Õ¥±‘•ÈµØÈµÁÉ•Ù¥•ÜµÉ¥ˆø‘ì¡¹Í¡•‘Õ±”ñğmt¤¹µ…À¡¥Ñ•´€ôø€ñ…ÉÑ¥±”øñÍµ…±°ø‘í•Í…Á•!Ñµ°¡¥Ñ•´¹Ñ¥µ”ñğ€œœ¥ôğ½Íµ…±°øñÍÑÉ½¹œø‘í•Í…Á•!Ñµ°¡¥Ñ•´¹Ñ¥Ñ±”ñğ€œœ¥ôğ½ÍÑÉ½¹œøñÍÁ…¸ø‘í•Í…Á•!Ñµ°¡¥Ñ•´¹Ù•¹Õ”ñğ€œœ¥ôğ½ÍÁ…¸øğ½…ÉÑ¥±”ù€¤¹©½¥¸ œœ¥ôğ½‘¥Øø(€€€€€€‘í¹ÍÑ½Éäü¹Ñ•áĞ€ü€ñÍ•Ñ¥½¸±…ÍÌô‰‰Õ¥±‘•ÈµØÈµÁÉ•Ù¥•Üµ½Áäˆøñ Ìø‘í•Í…Á•!Ñµ°¡¹ÍÑ½Éä¹Ñ¥Ñ±”ñğ€9½ÍÍ„!¥ÍÓÍÉ¥„œ¥ôğ½ ÌøñÀø‘í•Í…Á•!Ñµ°¡¹ÍÑ½Éä¹Ñ•áĞ¥ôğ½Àøğ½Í•Ñ¥½¸ù€€è€œô(€€€€€€ñ‘¥Ø±…ÍÌô‰‰Õ¥±‘•ÈµØÈµÁÉ•Ù¥•Üµ™½½Ñ•ÈˆøñÍÁ…¸ùAÉ•Ù¥•Ü•‘¥Ñ½É¥…°‘¼É…™Ğƒ
Ü»¼ƒ¤¼!Q50Ãé‰±¥¼ğ½ÍÁ…¸øñÍÁ…¸ø‘íÍÑ…Ñ”¹‘¥ÉÑä€ü€±Ñ•É‡ŸÕ•Ì±½…¥ÌÁ½ÈÕ…É‘…Èœ€èÉ…™Ğ€‘í•Í…Á•!Ñµ°¡ÍÑ…Ñ”¹‘É…™ÑI•Ù¥Í¥½¸¥õôğ½ÍÁ…¸øğ½‘¥Øù€ì(€€€½Á•¹5½‘…° ‰Õ¥±‘•ÉXÉAÉ•Ù¥•İ5½‘…°œ¤ì(€€€É•™É•Í¡%½¹Ì ¤ì(€ô((€™Õ¹Ñ¥½¸…‘‘M¡•‘Õ±” ¤ì(€€€ÍÑ…Ñ”¹‘É…™Ğ¹Í¡•‘Õ±”€ôÉÉ…ä¹¥ÍÉÉ…ä¡ÍÑ…Ñ”¹‘É…™Ğ¹Í¡•‘Õ±”¤€üÍÑ…Ñ”¹‘É…™Ğ¹Í¡•‘Õ±”€èmtì(€€€ÍÑ…Ñ”¹‘É…™Ğ¹Í¡•‘Õ±”¹ÁÕÍ ¡ì¥éÍ¡•‘Õ±”´‘í…Ñ”¹¹½Ü ¥õ€°ÑåÁ”è…‘‘¥Ñ¥½¹…°œ°Ñ¥Ñ±”èœœ°Ñ¥µ”èœœ°Ù•¹Õ”èœœ°µ…ÁUÉ°èœœ°¹½Ñ”èœœô¤ì(€€€µ…É­¥ÉÑä ¤ìÉ•¹‘•ÉM¡•‘Õ±” ¤ì(€ô((€™Õ¹Ñ¥½¸…‘‘¡…ÁÑ•È ¤ì(€€€ÍÑ…Ñ”¹‘É…™Ğ¹ÍÑ½Éä¹¡…ÁÑ•ÉÌ€ôÉÉ…ä¹¥ÍÉÉ…ä¡ÍÑ…Ñ”¹‘É…™Ğ¹ÍÑ½Éä¹¡…ÁÑ•ÉÌ¤€üÍÑ…Ñ”¹‘É…™Ğ¹ÍÑ½Éä¹¡…ÁÑ•ÉÌ€èmtì(€€€ÍÑ…Ñ”¹‘É…™Ğ¹ÍÑ½Éä¹¡…ÁÑ•ÉÌ¹ÁÕÍ ¡ì¥é¡…ÁÑ•È´‘í…Ñ”¹¹½Ü ¥õ€°Ñ¥Ñ±”èœœ°Ñ•áĞèœœô¤ì(€€€µ…É­¥ÉÑä ¤ìÉ•¹‘•É¡…ÁÑ•ÉÌ ¤ì(€ô((€™Õ¹Ñ¥½¸‰¥¹‘Ù•¹ÑÌ ¤ì(€€€‰å% ‰Õ¥±‘•ÉXÉ%¹Ù¥Ñ•M•±•Ğœ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¡…¹”œ°€ ¤€ôø±½…‘½¹Ñ•¹Ğ ¤¤ì((€€€‰å%¡A91}1}%¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¥¹ÁÕĞœ°•Ù•¹Ğ€ôøì(€€€€€½¹ÍĞ¥¹ÁÕĞ€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµÁ…Ñ¡tœ¤ì(€€€€€¥˜€¡¥¹ÁÕĞ¤É•ÑÕÉ¸É•…‘M…±…É%¹ÁÕĞ¡¥¹ÁÕĞ¤ì(€€€€€½¹ÍĞÑ½±”€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµÑ½±”µÁ…Ñ¡tœ¤ì(€€€€€¥˜€¡Ñ½±”¤ìÍ•ÑA…Ñ ¡ÍÑ…Ñ”¹‘É…™Ğ°Ñ½±”¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉQ½±•A…Ñ °‰½½°¡Ñ½±”¹¡•­•¤¤ìµ…É­¥ÉÑä ¤ìÉ•ÑÕÉ¸ìô(€€€€€½¹ÍĞÍ¡•‘Õ±•¥•±€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµÍ¡•‘Õ±”µÁ…Ñ¡tœ¤ì(€€€€€¥˜€¡Í¡•‘Õ±•¥•±¤ì(€€€€€€€½¹ÍĞÉ½Ü€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµÍ¡•‘Õ±•tœ¤ì(€€€€€€€½¹ÍĞ¥¹‘•à€ô9Õµ‰•È¡É½Üü¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉM¡•‘Õ±”¤ì(€€€€€€€¥˜€¡9Õµ‰•È¹¥Í%¹Ñ••È¡¥¹‘•à¤€˜˜ÍÑ…Ñ”¹‘É…™Ğ¹Í¡•‘Õ±•m¥¹‘•át¤ìÍÑ…Ñ”¹‘É…™Ğ¹Í¡•‘Õ±•m¥¹‘•áumÍ¡•‘Õ±•¥•±¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉM¡•‘Õ±•A…Ñ¡t€ôÍ¡•‘Õ±•¥•±¹Ù…±Õ”ìµ…É­¥ÉÑä ¤ìô(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€½¹ÍĞ¡…ÁÑ•É¥•±€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•Èµ¡…ÁÑ•ÈµÁ…Ñ¡tœ¤ì(€€€€€¥˜€¡¡…ÁÑ•É¥•±¤ì(€€€€€€€½¹ÍĞÉ½Ü€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•Èµ¡…ÁÑ•Étœ¤ì(€€€€€€€½¹ÍĞ¥¹‘•à€ô9Õµ‰•È¡É½Üü¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•É¡…ÁÑ•È¤ì(€€€€€€€¥˜€¡9Õµ‰•È¹¥Í%¹Ñ••È¡¥¹‘•à¤€˜˜ÍÑ…Ñ”¹‘É…™Ğ¹ÍÑ½Éä¹¡…ÁÑ•ÉÍm¥¹‘•át¤ìÍÑ…Ñ”¹‘É…™Ğ¹ÍÑ½Éä¹¡…ÁÑ•ÉÍm¥¹‘•áum¡…ÁÑ•É¥•±¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•É¡…ÁÑ•ÉA…Ñ¡t€ô¡…ÁÑ•É¥•±¹Ù…±Õ”ìµ…É­¥ÉÑä ¤ìô(€€€€€ô(€€€ô¤ì((€€€‘½Õµ•¹Ğ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ°•Ù•¹Ğ€ôøì(€€€€€½¹ÍĞÑ…ˆ€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµØÈµÑ…‰tœ¤ì(€€€€€¥˜€¡Ñ…ˆ¤É•ÑÕÉ¸…Ñ¥Ù…Ñ•Q…ˆ¡Ñ…ˆ¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉXÉQ…ˆ¤ì(€€€€€½¹ÍĞ±½Í”€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµØÈµ±½Í•tœ¤ì(€€€€€¥˜€¡±½Í”¤É•ÑÕÉ¸±½Í•5½‘…°¡±½Í”¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉXÉ±½Í”¤ì(€€€€€½¹ÍĞÉ•µ½Ù•M¡•‘Õ±”€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµØÈµÉ•µ½Ù”µÍ¡•‘Õ±•tœ¤ì(€€€€€¥˜€¡É•µ½Ù•M¡•‘Õ±”€˜˜ÍÑ…Ñ”¹‘É…™Ğ¤ì(€€€€€€€ÍÑ…Ñ”¹‘É…™Ğ¹Í¡•‘Õ±”¹ÍÁ±¥”¡9Õµ‰•È¡É•µ½Ù•M¡•‘Õ±”¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉXÉI•µ½Ù•M¡•‘Õ±”¤°€Ä¤ìµ…É­¥ÉÑä ¤ìÉ•¹‘•ÉM¡•‘Õ±” ¤ìÉ•ÑÕÉ¸ì(€€€€€ô(€€€€€½¹ÍĞÉ•µ½Ù•¡…ÁÑ•È€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµØÈµÉ•µ½Ù”µ¡…ÁÑ•Étœ¤ì(€€€€€¥˜€¡É•µ½Ù•¡…ÁÑ•È€˜˜ÍÑ…Ñ”¹‘É…™Ğ¤ì(€€€€€€€ÍÑ…Ñ”¹‘É…™Ğ¹ÍÑ½Éä¹¡…ÁÑ•ÉÌ¹ÍÁ±¥”¡9Õµ‰•È¡É•µ½Ù•¡…ÁÑ•È¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉXÉI•µ½Ù•¡…ÁÑ•È¤°€Ä¤ìµ…É­¥ÉÑä ¤ìÉ•¹‘•É¡…ÁÑ•ÉÌ ¤ìÉ•ÑÕÉ¸ì(€€€€€ô(€€€€€½¹ÍĞÉ½±±‰…¬€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµØÈµÉ½±±‰…­tœ¤ì(€€€€€¥˜€¡É½±±‰…¬¤É•ÑÕÉ¸É½±±‰…­I•Ù¥Í¥½¸¡É½±±‰…¬¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉXÉI½±±‰…¬¤ì(€€€€€½¹ÍĞ…Ñ¥½¸€ô•Ù•¹Ğ¹Ñ…É•Ğ¹±½Í•ÍĞ m‘…Ñ„µ‰Õ¥±‘•ÈµØÈµ…Ñ¥½¹tœ¤ü¹‘…Ñ…Í•Ğ¹‰Õ¥±‘•ÉXÉÑ¥½¸ì(€€€€€¥˜€ ……Ñ¥½¸¤É•ÑÕÉ¸ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€É•±½…œ¤É•ÑÕÉ¸±½…‘½¹Ñ•¹Ğ ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€Í…Ù”œ¤É•ÑÕÉ¸Í…Ù•É…™Ğ ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€Ù…±¥‘…Ñ”œ¤É•ÑÕÉ¸Ù…±¥‘…Ñ•É…™Ğ ÁÕ‰±¥Í œ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€ÁÉ•Ù¥•Üœ¤É•ÑÕÉ¸É•¹‘•ÉAÉ•Ù¥•Ü ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€ÁÕ‰±¥Í œ¤É•ÑÕÉ¸ÁÕ‰±¥Í¡É…™Ğ ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€Í¡•‘Õ±”µ…‘œ¤É•ÑÕÉ¸…‘‘M¡•‘Õ±” ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€¡…ÁÑ•Èµ…‘œ¤É•ÑÕÉ¸…‘‘¡…ÁÑ•È ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€©Í½¸µÉ•™É•Í œ¤É•ÑÕÉ¸Íå¹‘Ù…¹•‘)Í½¸ ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€©Í½¸µ…ÁÁ±äœ¤É•ÑÕÉ¸…ÁÁ±å‘Ù…¹•‘)Í½¸ ¤ì(€€€€€¥˜€¡…Ñ¥½¸€ôôô€É•Ù¥Í¥½¹Ìœ¤É•ÑÕÉ¸±½…‘I•Ù¥Í¥½¹Ì ¤ì(€€€ô¤ì((€€€‘½Õµ•¹Ğ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ­•å‘½İ¸œ°•Ù•¹Ğ€ôøì(€€€€€¥˜€¡•Ù•¹Ğ¹­•ä€ôôô€Í…Á”œ¤±½Í•5½‘…° ‰Õ¥±‘•ÉXÉAÉ•Ù¥•İ5½‘…°œ¤ì(€€€ô¤ì(€ô((€™Õ¹Ñ¥½¸¥¹¥Ñ	Õ¥±‘•ÉXÉU¤ ¤ì(€€€•¹ÍÕÉ•A…¹•±•™¥¹¥Ñ¥½¸ ¤ì(€€€•¹ÍÕÉ•A…¹•° ¤ì(€€€•¹ÍÕÉ•5½‘…° ¤ì(€€€•¹ÍÕÉ•9…Ù¥…Ñ¥½¸ ¤ì(€€€Íå¹%¹Ù¥Ñ•=ÁÑ¥½¹Ì ¤ì(€€€‰¥¹‘Ù•¹ÑÌ ¤ì(€€€É•¹‘•É5½‘” ¤ì(€€€É•™É•Í¡%½¹Ì ¤ì(€€€Í•ÑQ¥µ•½ÕĞ¡Íå¹%¹Ù¥Ñ•=ÁÑ¥½¹Ì°€äÀÀ¤ì(€ô((€¥˜€¡‘½Õµ•¹Ğ¹É•…‘åMÑ…Ñ”€ôôô€±½…‘¥¹œœ¤‘½Õµ•¹Ğ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È =5½¹Ñ•¹Ñ1½…‘•œ°¥¹¥Ñ	Õ¥±‘•ÉXÉU¤°ì½¹”éÑÉÕ”ô¤ì(€•±Í”¥¹¥Ñ	Õ¥±‘•ÉXÉU¤ ¤ì)ô¤ ¤ì(