'use strict';

const {
  mapLegacyInviteToV2,
  validateInviteContentV2
} = require('./invite-content-v2');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeFallbackScheduleOrder(draft, event = {}) {
  const hasExplicitProgram = Array.isArray(event.program) && event.program.length;
  const hasExplicitSchedule = Array.isArray(event.scheduleItems) && event.scheduleItems.length;
  if (hasExplicitProgram || hasExplicitSchedule || !draft || !Array.isArray(draft.schedule)) return draft;

  // Os campos legacy separados representam esta sequência editorial:
  // cerimónia -> recepção/civil -> momento adicional -> celebração.
  // Não alteramos program/scheduleItems explícitos, onde a ordem da fonte é autoritativa.
  const rank = { religious: 0, reception: 1, additional: 2, celebration: 3 };
  draft.schedule = draft.schedule
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ra = Object.prototype.hasOwnProperty.call(rank, a.item && a.item.type) ? rank[a.item.type] : 100;
      const rb = Object.prototype.hasOwnProperty.call(rank, b.item && b.item.type) ? rank[b.item.type] : 100;
      return ra - rb || a.index - b.index;
    })
    .map(entry => entry.item);
  return draft;
}

function buildLegacyBootstrapDraft({ inviteMeta, seedData, templateKey = '' } = {}) {
  if (!inviteMeta || typeof inviteMeta !== 'object') throw new Error('inviteMeta é obrigatório.');
  if (!seedData || typeof seedData !== 'object') throw new Error('seedData é obrigatório.');

  const slug = String(inviteMeta.slug || '').trim().toLowerCase();
  const packageKey = String(inviteMeta.packageKey || '').trim().toLowerCase();
  if (!slug) throw new Error('inviteMeta.slug é obrigatório.');
  if (!packageKey) throw new Error('inviteMeta.packageKey é obrigatório.');

  const source = clone(seedData);
  source.slug = slug;
  source.packageKey = packageKey;
  source.coupleNames = source.coupleNames || inviteMeta.coupleNames || (source.event && source.event.coupleNames) || '';
  source.event = {
    ...(source.event || {}),
    slug,
    packageKey,
    coupleNames: (source.event && source.event.coupleNames) || source.coupleNames || inviteMeta.coupleNames || ''
  };

  const draft = mapLegacyInviteToV2(source, {
    packageKey,
    templateKey: String(templateKey || '').trim(),
    contentMode: 'legacy',
    rendererVersion: 'v1'
  });

  normalizeFallbackScheduleOrder(draft, source.event);

  // Bootstrap nunca activa o renderer V2. A activação é uma fase separada.
  draft.runtime.contentMode = 'legacy';
  draft.runtime.rendererVersion = 'v1';
  return draft;
}

function auditLegacyBootstrapDraft({ inviteMeta, seedData, draft } = {}) {
  const event = (seedData && seedData.event) || {};
  const checks = [];
  const check = (key, ok, expected, actual) => checks.push({ key, ok: Boolean(ok), expected, actual });

  check('identity.slug', draft && draft.identity && draft.identity.slug === inviteMeta.slug, inviteMeta.slug, draft && draft.identity && draft.identity.slug);
  check('identity.packageKey', draft && draft.identity && draft.identity.packageKey === inviteMeta.packageKey, inviteMeta.packageKey, draft && draft.identity && draft.identity.packageKey);
  check('people.coupleNames', draft && draft.people && draft.people.coupleNames === event.coupleNames, event.coupleNames, draft && draft.people && draft.people.coupleNames);
  check('people.bride', draft && draft.people && draft.people.bride === event.bride, event.bride, draft && draft.people && draft.people.bride);
  check('people.groom', draft && draft.people && draft.people.groom === event.groom, event.groom, draft && draft.people && draft.people.groom);
  check('event.dateISO', draft && draft.event && draft.event.dateISO === event.dateISO, event.dateISO, draft && draft.event && draft.event.dateISO);
  check('event.verse', draft && draft.event && draft.event.verse === event.verse, event.verse, draft && draft.event && draft.event.verse);
  check('payments.bankAccounts', Array.isArray(draft && draft.payments && draft.payments.bankAccounts) && draft.payments.bankAccounts.length === (event.bankAccounts || []).length, (event.bankAccounts || []).length, draft && draft.payments && draft.payments.bankAccounts && draft.payments.bankAccounts.length);
  check('payments.mobilePayments', Array.isArray(draft && draft.payments && draft.payments.mobilePayments) && draft.payments.mobilePayments.length === (event.mobilePayments || []).length, (event.mobilePayments || []).length, draft && draft.payments && draft.payments.mobilePayments && draft.payments.mobilePayments.length);
  check('runtime.contentMode', draft && draft.runtime && draft.runtime.contentMode === 'legacy', 'legacy', draft && draft.runtime && draft.runtime.contentMode);

  const validation = validateInviteContentV2(draft || {}, { stage: 'publish' });
  const failed = checks.filter(item => !item.ok);
  return {
    valid: failed.length === 0 && validation.valid,
    checks,
    failed,
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings
    },
    summary: {
      scheduleItems: Array.isArray(draft && draft.schedule) ? draft.schedule.length : 0,
      storyChapters: Array.isArray(draft && draft.story && draft.story.chapters) ? draft.story.chapters.length : 0,
      bankAccounts: Array.isArray(draft && draft.payments && draft.payments.bankAccounts) ? draft.payments.bankAccounts.length : 0,
      mobilePayments: Array.isArray(draft && draft.payments && draft.payments.mobilePayments) ? draft.payments.mobilePayments.length : 0,
      giftMode: draft && draft.gifts ? draft.gifts.mode : '',
      accessMode: draft && draft.access ? draft.access.mode : '',
      contentMode: draft && draft.runtime ? draft.runtime.contentMode : ''
    }
  };
}

module.exports = {
  buildLegacyBootstrapDraft,
  auditLegacyBootstrapDraft,
  normalizeFallbackScheduleOrder
};
