(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LirandzoPublicRendererV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTIVE_MODE = 'mongo-v2';
  const LEGACY_MODE = 'legacy';

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function trimSlash(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function publicApiBase(input) {
    const raw = trimSlash(input);
    return raw.endsWith('/api') ? raw.slice(0, -4) : raw;
  }

  function buildPublicContentUrl(apiBase, slug) {
    const base = publicApiBase(apiBase);
    const safeSlug = encodeURIComponent(String(slug || '').trim());
    if (!base) throw new Error('API base do renderer V2 em falta.');
    if (!safeSlug) throw new Error('Slug do renderer V2 em falta.');
    return `${base}/api/public/invites/${safeSlug}/content`;
  }

  function firstSchedule(content, predicate) {
    const list = Array.isArray(content && content.schedule) ? content.schedule : [];
    return list.find(predicate) || null;
  }

  function firstMapUrl(content) {
    const list = Array.isArray(content && content.schedule) ? content.schedule : [];
    const item = list.find(entry => entry && entry.mapUrl);
    return item ? String(item.mapUrl || '') : '';
  }

  function flattenPayments(payments) {
    const p = payments && typeof payments === 'object' ? payments : {};
    const banks = Array.isArray(p.bankAccounts) ? p.bankAccounts : [];
    const mobile = Array.isArray(p.mobilePayments) ? p.mobilePayments : [];
    return [
      ...banks.map(item => ({
        method: item.label || item.bank || 'Conta bancária',
        holder: item.holder || '',
        number: item.account || item.nib || item.number || '',
        account: item.account || '',
        nib: item.nib || '',
        logo: item.logo || ''
      })),
      ...mobile.map(item => ({
        method: item.label || item.method || 'Pagamento móvel',
        holder: item.holder || '',
        number: item.number || '',
        logo: item.logo || ''
      }))
    ];
  }

  function mapInviteContentV2ToLegacy(input) {
    const content = clone(input || {});
    const identity = content.identity || {};
    const people = content.people || {};
    const event = content.event || {};
    const media = content.media || {};
    const story = content.story || {};
    const features = content.features || {};
    const access = content.access || {};
    const gifts = content.gifts || {};
    const schedule = Array.isArray(content.schedule) ? content.schedule : [];

    const religious = firstSchedule(content, item => /relig|church|cerem/i.test(String(item && (item.type || item.title) || '')));
    const civil = firstSchedule(content, item => /civil/i.test(String(item && (item.type || item.title) || '')));
    const reception = firstSchedule(content, item => /reception|recep|copo|festa|celebr/i.test(String(item && (item.type || item.title) || '')));
    const mapUrl = firstMapUrl(content);
    const parentsOn = Boolean(people.brideParents || people.groomParents);

    return {
      schemaVersion: content.schemaVersion || '2.0',
      contentMode: ACTIVE_MODE,
      slug: identity.slug || '',
      packageKey: identity.packageKey || '',
      templateKey: identity.templateKey || '',
      templateLabel: identity.packageKey ? `Pacote ${identity.packageKey}` : 'Convite digital',
      coupleNames: people.displayNames || people.coupleNames || '',
      bride: people.bride || '',
      groom: people.groom || '',
      monogram: people.monogram || '',
      eventDateISO: event.dateISO || '',
      theme: {
        heroImage: media.heroImage || '',
        coverImage: media.coverImage || media.heroImage || '',
        musicUrl: media.musicUrl || '',
        style: identity.templateKey || identity.packageKey || ''
      },
      event: {
        dateISO: event.dateISO || '',
        dateLabel: event.dateLabel || '',
        rsvpDeadline: event.rsvpDeadline || '',
        invitationNote: event.invitationNote || '',
        popupNote: event.invitationNote || '',
        verse: event.verse || '',
        verseReference: event.verseReference || '',
        scheduleItems: schedule.map(item => ({
          id: item.id || '',
          type: item.type || '',
          title: item.title || '',
          time: item.time || '',
          venue: item.venue || '',
          mapUrl: item.mapUrl || '',
          note: item.note || ''
        })),
        religiousVenue: religious && religious.venue || '',
        religiousMapUrl: religious && religious.mapUrl || '',
        civilVenue: civil && civil.venue || '',
        civilMapUrl: civil && civil.mapUrl || '',
        receptionVenue: reception && reception.venue || '',
        receptionMapUrl: reception && reception.mapUrl || '',
        generalMapUrl: mapUrl
      },
      story: {
        title: story.title || 'A nossa história',
        text: story.text || story.letter || '',
        chapters: Array.isArray(story.chapters) ? story.chapters : [],
        letter: story.letter || '',
        image: media.storyImage || ''
      },
      parents: {
        brideParents: people.brideParents || '',
        groomParents: people.groomParents || ''
      },
      gallery: clone(content.gallery || { title: 'Momentos', items: [] }),
      dressCode: clone(content.dressCode || { title: '', note: '', image: '' }),
      menu: clone(content.menu || { title: '', note: '', items: [] }),
      support: clone(content.support || { text: '', contacts: [], whatsapp: '', whatsappSecondary: '' }),
      seo: clone(content.seo || { title: '', description: '', image: '' }),
      payments: flattenPayments(content.payments),
      paymentData: clone(content.payments || { bankAccounts: [], mobilePayments: [] }),
      gifts: {
        mode: gifts.mode || 'none',
        catalogMode: gifts.catalogMode || 'legacy',
        store: gifts.store || '',
        options: Array.isArray(gifts.options) ? gifts.options : []
      },
      rsvp: {
        mode: access.mode === 'open' ? 'public' : 'guest-list',
        identity: access.rsvpIdentity || (access.mode === 'open' ? 'name' : 'guest_token'),
        requireNameOnActions: Boolean(access.requireNameOnActions),
        maxGuestsPerRsvp: Number(access.maxGuestsPerRsvp || 1),
        allowCompanionName: Boolean(access.allowCompanionName)
      },
      sections: {
        schedule: schedule.length > 0,
        story: features.story !== false,
        parents: parentsOn,
        gallery: features.gallery !== false,
        dressCode: features.dressCode !== false,
        menu: features.menu !== false,
        map: Boolean(mapUrl),
        rsvp: features.rsvp !== false,
        gifts: features.gifts !== false,
        contributions: features.contributions !== false,
        messages: features.messages !== false,
        checkin: features.checkin !== false,
        capsule: features.capsule !== false,
        guestInfo: features.guestInfo !== false
      }
    };
  }

  async function fetchPublicEnvelope(options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('Fetch indisponível para renderer V2.');
    const url = buildPublicContentUrl(opts.apiBase, opts.slug);
    const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(payload.message || payload.error || `Falha ao carregar conteúdo público (${response.status}).`);
      error.status = response.status;
      error.code = payload.code || payload.errorCode || '';
      error.payload = payload;
      throw error;
    }
    const envelope = payload && payload.data ? payload.data : payload;
    return envelope && typeof envelope === 'object' ? envelope : {};
  }

  function resolveEnvelope(envelope) {
    const e = envelope || {};
    if (e.active === true && e.mode === ACTIVE_MODE && e.content && typeof e.content === 'object') {
      return { mode: ACTIVE_MODE, active: true, content: mapInviteContentV2ToLegacy(e.content), revision: Number(e.revision || 0), hash: e.hash || '' };
    }
    return { mode: LEGACY_MODE, active: false, content: null, revision: 0, hash: '' };
  }

  function applySeo(content, doc) {
    if (!doc || !content || !content.seo) return;
    const seo = content.seo;
    if (seo.title) doc.title = seo.title;
    const setMeta = (selector, attr, value) => {
      if (!value) return;
      const el = doc.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', 'content', seo.description || '');
    setMeta('meta[property="og:title"]', 'content', seo.title || '');
    setMeta('meta[property="og:description"]', 'content', seo.description || '');
    setMeta('meta[property="og:image"]', 'content', seo.image || '');
  }

  return {
    ACTIVE_MODE,
    LEGACY_MODE,
    publicApiBase,
    buildPublicContentUrl,
    flattenPayments,
    mapInviteContentV2ToLegacy,
    fetchPublicEnvelope,
    resolveEnvelope,
    applySeo
  };
});
