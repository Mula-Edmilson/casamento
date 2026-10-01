'use strict';

const SCHEMA_VERSION = '2.0';
const PACKAGE_KEYS = Object.freeze(['perola', 'esmeralda', 'rubi']);
const CONTENT_MODES = Object.freeze(['legacy', 'mongo-v2']);
const ACCESS_MODES = Object.freeze(['nominal', 'open']);
const GIFT_MODES = Object.freeze(['none', 'catalog', 'quantity_contributions', 'monetary']);

const DEFAULT_FEATURES = Object.freeze({
  story: true, gallery: true, rsvp: true, dressCode: true, gifts: true,
  contributions: true, messages: true, checkin: true, capsule: true,
  guestInfo: true, menu: true
});

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}
function norm(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function slugify(value) {
  return norm(value).replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80);
}
function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'sim', 'on'].includes(norm(value));
}
function int(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function packageKey(value) {
  const key = norm(value);
  return PACKAGE_KEYS.includes(key) ? key : '';
}
function contentMode(value) {
  const mode = norm(value);
  return CONTENT_MODES.includes(mode) ? mode : 'legacy';
}
function accessMode(event = {}) {
  const mode = norm(event.guestAccessMode || event.accessMode || event.access?.mode);
  if (mode === 'open' || mode === 'public') return 'open';
  if (mode === 'nominal' || mode === 'private' || mode === 'login') return 'nominal';
  return bool(event.publicAccess, false) ? 'open' : 'nominal';
}

function featuresFrom(event = {}, source = {}) {
  const f = event.features && typeof event.features === 'object' ? event.features : {};
  const s = { ...(source.sections || {}), ...(event.sections || {}) };
  const aliases = {
    story: ['story'], gallery: ['gallery'], rsvp: ['rsvp'],
    dressCode: ['dressCode', 'dresscode'], gifts: ['gifts'],
    contributions: ['contributions'], messages: ['messages', 'guestMessages'],
    checkin: ['checkin'], capsule: ['capsule', 'timeCapsule'],
    guestInfo: ['guestInfo'], menu: ['menu']
  };
  const out = {};
  for (const [key, names] of Object.entries(aliases)) {
    let value;
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(f, name)) value = f[name];
      if (Object.prototype.hasOwnProperty.call(s, name)) value = s[name];
    }
    out[key] = value === undefined ? DEFAULT_FEATURES[key] : bool(value, DEFAULT_FEATURES[key]);
  }
  return out;
}

function scheduleFrom(event = {}) {
  const program = Array.isArray(event.program) ? event.program
    : (Array.isArray(event.scheduleItems) ? event.scheduleItems : []);
  const raw = program.length ? program : [
    { type: 'religious', title: event.ceremonyTitle, place: event.ceremonyPlace, time: event.ceremonyTime, mapUrl: event.ceremonyMap },
    { type: 'additional', title: event.additionalTitle, place: event.additionalPlace, time: event.additionalTime, mapUrl: event.additionalMap },
    { type: 'reception', title: event.receptionTitle, place: event.receptionPlace, time: event.receptionTime, mapUrl: event.receptionMap },
    { type: 'celebration', title: event.celebrationTitle, place: event.celebrationPlace, time: event.celebrationTime, mapUrl: event.celebrationMap }
  ];
  const seen = new Set();
  return raw.map((item, index) => ({
    id: clean(item.id) || slugify(`${item.type || 'item'}-${item.title || item.name || ''}-${item.time || ''}`) || `schedule-${index + 1}`,
    type: clean(item.type) || `item-${index + 1}`,
    title: clean(item.title || item.name),
    time: clean(item.time),
    venue: clean(item.venue || item.place || item.location),
    mapUrl: clean(item.mapUrl || item.map || item.url),
    note: clean(item.note || item.description)
  })).filter(item => item.title || item.time || item.venue).filter(item => {
    const key = norm(`${item.title}|${item.time}|${item.venue}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function storyFrom(source = {}, event = {}) {
  const story = (source.story && typeof source.story === 'object') ? source.story
    : ((event.story && typeof event.story === 'object') ? event.story : {});
  let chapters = Array.isArray(story.chapters) ? story.chapters : [];
  if (!chapters.length) {
    chapters = [['encontro', 'O Encontro'], ['amizade', 'A Amizade'],
      ['crescimento', 'O Crescimento'], ['promessa', 'A Promessa']]
      .filter(([key]) => clean(story[key]))
      .map(([key, title]) => ({ title, text: clean(story[key]) }));
  }
  return {
    title: clean(story.title) || 'A Nossa História',
    text: clean(story.text),
    chapters: chapters.map((item, index) => ({
      id: clean(item.id) || `chapter-${index + 1}`,
      title: clean(item.title) || `Capítulo ${index + 1}`,
      text: clean(item.text || item.note)
    })),
    letter: clean(source.letter || event.letter)
  };
}

function giftsFrom(source = {}, event = {}) {
  const options = Array.isArray(source.giftOptions) ? source.giftOptions
    : (Array.isArray(event.giftOptions) ? event.giftOptions : []);
  const selection = norm(event.giftSelectionMode);
  const section = norm(event.giftSectionType);
  let mode = 'catalog';
  if (selection === 'quantity_contributions') mode = 'quantity_contributions';
  else if (/monet|contribui.*monet/.test(section)) mode = 'monetary';
  else if (/sem presente|sem lista|none/.test(section)) mode = 'none';
  return {
    mode,
    catalogMode: norm(event.giftCatalogMode) === 'mongo' ? 'mongo' : 'legacy',
    store: clean(event.giftStore),
    options: options.map(item => ({
      name: clean(item.name || item.label),
      category: clean(item.category) || 'Lista de presentes',
      repeatable: bool(item.repeatable, false),
      quantityStep: item.quantityStep === undefined ? null : Number(item.quantityStep),
      minQuantity: item.minQuantity === undefined ? null : Number(item.minQuantity),
      unit: clean(item.unit)
    })).filter(item => item.name)
  };
}

function emptyInviteContentV2() {
  return {
    schemaVersion: SCHEMA_VERSION,
    identity: { slug: '', packageKey: 'perola', templateKey: '', eventType: 'Casamento', language: 'Português' },
    people: { coupleNames: '', displayNames: '', bride: '', groom: '', monogram: '', brideParents: '', groomParents: '' },
    event: { dateISO: '', dateLabel: '', timezone: 'Africa/Maputo', rsvpDeadline: '', verse: '', verseReference: '', invitationNote: '' },
    schedule: [],
    story: { title: 'A Nossa História', text: '', chapters: [], letter: '' },
    access: { mode: 'nominal', rsvpIdentity: 'guest_token', requireNameOnActions: false, maxGuestsPerRsvp: 1, allowCompanionName: false, autoCreateGuestOnRsvp: false, autoCreateGuestOnGift: false },
    features: clone(DEFAULT_FEATURES),
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

function mapLegacyInviteToV2(source = {}, options = {}) {
  const event = source.event && typeof source.event === 'object' ? source.event : source;
  const out = emptyInviteContentV2();
  const mode = accessMode(event);
  out.identity = {
    slug: clean(event.slug || source.slug) || slugify(event.coupleNames || source.coupleNames),
    packageKey: packageKey(options.packageKey || event.packageKey || source.packageKey) || 'perola',
    templateKey: clean(options.templateKey || event.templateKey || source.templateKey),
    eventType: clean(event.eventType) || 'Casamento',
    language: clean(event.language) || 'Português'
  };
  out.people = {
    coupleNames: clean(event.coupleNames || source.coupleNames),
    displayNames: clean(event.displayNames || source.displayNames),
    bride: clean(event.bride || source.bride),
    groom: clean(event.groom || source.groom),
    monogram: clean(event.monogram || source.monogram),
    brideParents: clean(event.brideParents || source.brideParents),
    groomParents: clean(event.groomParents || source.groomParents)
  };
  out.event = {
    dateISO: clean(event.dateISO || event.eventDateISO || source.eventDateISO),
    dateLabel: clean(event.eventDateLong || event.dateLabel || source.eventDateLong),
    timezone: clean(event.timezone) || 'Africa/Maputo',
    rsvpDeadline: clean(event.rsvpDeadlineISO || event.rsvpDeadline || source.rsvpDeadline),
    verse: clean(event.verse || source.verse),
    verseReference: clean(event.verseReference || source.verseReference),
    invitationNote: clean(event.invitationNote || source.invitationNote)
  };
  out.schedule = scheduleFrom(event);
  out.story = storyFrom(source, event);
  out.features = featuresFrom(event, source);
  out.gifts = giftsFrom(source, event);
  out.access = {
    mode,
    rsvpIdentity: mode === 'open' ? 'name' : 'guest_token',
    requireNameOnActions: mode === 'open' ? bool(event.requireNameOnActions, true) : bool(event.requireNameOnActions, false),
    maxGuestsPerRsvp: int(event.maxGuestsPerRsvp, 1),
    allowCompanionName: bool(event.allowCompanionName, false),
    autoCreateGuestOnRsvp: mode === 'open' && bool(event.publicRsvpAutoCreate, true),
    autoCreateGuestOnGift: mode === 'open' && bool(event.publicGiftAutoCreate, true)
  };
  out.payments = {
    bankAccounts: clone(Array.isArray(event.bankAccounts) ? event.bankAccounts : (source.bankAccounts || [])),
    mobilePayments: clone(Array.isArray(event.mobilePayments) ? event.mobilePayments : (source.mobilePayments || []))
  };
  const supportText = clean(event.supportContacts || event.contactPhone);
  out.support = {
    text: supportText,
    contacts: supportText ? supportText.split(/\s*(?:\||·|\/)\s*/).map(clean).filter(Boolean) : [],
    whatsapp: clean(event.supportWhatsapp || event.whatsapp),
    whatsappSecondary: clean(event.supportWhatsappSecondary)
  };
  const gallery = source.gallery && typeof source.gallery === 'object' ? source.gallery : {};
  out.gallery = { title: clean(gallery.title) || 'Momentos', items: clone(Array.isArray(gallery.items) ? gallery.items : []) };
  const dress = source.dressCode && typeof source.dressCode === 'object' ? source.dressCode : {};
  out.dressCode = { title: clean(dress.title || event.dressCodeTitle), note: clean(dress.note || event.dressCode), image: clean(dress.image) };
  const menu = source.menu && typeof source.menu === 'object' ? source.menu : {};
  out.menu = { title: clean(menu.title), note: clean(menu.note), items: clone(Array.isArray(menu.items) ? menu.items : []) };
  const theme = source.theme && typeof source.theme === 'object' ? source.theme : {};
  out.media = {
    heroImage: clean(theme.heroImage || event.heroImage),
    coverImage: clean(theme.coverImage || event.coverImage),
    storyImage: clean((source.story && source.story.image) || theme.storyImage),
    musicUrl: clean(theme.musicUrl || event.audioMp3 || event.musicUrl)
  };
  const seo = source.seo && typeof source.seo === 'object' ? source.seo : {};
  out.seo = { title: clean(seo.title), description: clean(seo.description), image: clean(seo.image || out.media.heroImage || out.media.coverImage) };
  out.runtime = {
    contentMode: contentMode(event.contentMode || source.contentMode || options.contentMode),
    rendererVersion: clean(options.rendererVersion || event.rendererVersion || source.rendererVersion) || 'v1'
  };
  return out;
}

function normalizeInviteContentV2(input = {}) {
  const base = emptyInviteContentV2();
  const out = {
    ...base, ...clone(input), schemaVersion: SCHEMA_VERSION,
    identity: { ...base.identity, ...(input.identity || {}) },
    people: { ...base.people, ...(input.people || {}) },
    event: { ...base.event, ...(input.event || {}) },
    story: { ...base.story, ...(input.story || {}) },
    access: { ...base.access, ...(input.access || {}) },
    features: { ...base.features, ...(input.features || {}) },
    gifts: { ...base.gifts, ...(input.gifts || {}) },
    payments: { ...base.payments, ...(input.payments || {}) },
    support: { ...base.support, ...(input.support || {}) },
    gallery: { ...base.gallery, ...(input.gallery || {}) },
    dressCode: { ...base.dressCode, ...(input.dressCode || {}) },
    menu: { ...base.menu, ...(input.menu || {}) },
    media: { ...base.media, ...(input.media || {}) },
    seo: { ...base.seo, ...(input.seo || {}) },
    runtime: { ...base.runtime, ...(input.runtime || {}) },
    schedule: Array.isArray(input.schedule) ? clone(input.schedule) : []
  };
  out.identity.slug = slugify(out.identity.slug || out.people.coupleNames);
  out.identity.packageKey = packageKey(out.identity.packageKey) || 'perola';
  out.runtime.contentMode = contentMode(out.runtime.contentMode);
  out.access.mode = ACCESS_MODES.includes(norm(out.access.mode)) ? norm(out.access.mode) : 'nominal';
  out.access.rsvpIdentity = out.access.mode === 'open' ? 'name' : 'guest_token';
  out.access.maxGuestsPerRsvp = int(out.access.maxGuestsPerRsvp, 1);
  if (out.access.mode === 'nominal') {
    out.access.autoCreateGuestOnRsvp = false;
    out.access.autoCreateGuestOnGift = false;
  }
  out.gifts.mode = GIFT_MODES.includes(norm(out.gifts.mode)) ? norm(out.gifts.mode) : 'catalog';
  out.gifts.catalogMode = norm(out.gifts.catalogMode) === 'mongo' ? 'mongo' : 'legacy';
  return out;
}

function validateInviteContentV2(input = {}, options = {}) {
  const content = normalizeInviteContentV2(input);
  const stage = options.stage === 'publish' ? 'publish' : 'draft';
  const errors = [];
  const warnings = [];
  if (!PACKAGE_KEYS.includes(content.identity.packageKey)) errors.push('identity.packageKey inválido.');
  if (!ACCESS_MODES.includes(content.access.mode)) errors.push('access.mode inválido.');
  if (!CONTENT_MODES.includes(content.runtime.contentMode)) errors.push('runtime.contentMode inválido.');
  if (!GIFT_MODES.includes(content.gifts.mode)) errors.push('gifts.mode inválido.');
  if (content.gifts.mode === 'quantity_contributions') {
    if (!content.gifts.options.length) errors.push('quantity_contributions exige pelo menos uma opção.');
    for (const item of content.gifts.options) {
      if (!(Number(item.quantityStep) > 0)) errors.push(`quantityStep inválido para ${item.name || 'opção sem nome'}.`);
    }
  }
  if (content.access.mode === 'open' && content.features.rsvp && !content.access.requireNameOnActions) {
    warnings.push('Convite aberto com RSVP activo sem nome obrigatório nas acções.');
  }
  if (stage === 'publish') {
    if (!content.identity.slug) errors.push('Slug é obrigatório para publicar.');
    if (!content.people.coupleNames) errors.push('Nome do casal/evento é obrigatório para publicar.');
    if (!content.event.dateISO) errors.push('Data do evento é obrigatória para publicar.');
    if (!content.schedule.length) errors.push('Pelo menos um item de agenda é obrigatório para publicar.');
  }
  return { valid: errors.length === 0, stage, errors, warnings, content };
}

module.exports = {
  SCHEMA_VERSION, PACKAGE_KEYS, CONTENT_MODES, ACCESS_MODES, GIFT_MODES,
  DEFAULT_FEATURES, clean, norm, slugify, emptyInviteContentV2,
  mapLegacyInviteToV2, normalizeInviteContentV2, validateInviteContentV2
};
