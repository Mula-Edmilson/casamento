'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TARGET_SLUG,
  TARGET_PACKAGE,
  TARGET_TEMPLATE,
  TARGET_INVITE_ID,
  EXPECTED_DRAFT_REVISION,
  EXPECTED_PUBLISHED_REVISION,
  EXPECTED_HASH,
  ACTIVATE_CONFIRM,
  ROLLBACK_CONFIRM,
  contentHash,
  configStateForInvite,
  rawContentModeForInvite,
  contentModeForInvite,
  isAllowedLegacyStorage,
  buildContentModeMatch,
  inspectPublishedMaps,
  classifyActivationState,
  classifyRollbackState
} = require('../tools/rosalina-builder-v2-activation-db');
const { validateInviteContentV2 } = require('../builder-v2/invite-content-v2');

function baseContent() {
  return {
    schemaVersion: '2.0',
    identity: { slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, templateKey: TARGET_TEMPLATE },
    people: { coupleNames: 'Rosalina & Monteiro', displayNames: 'Rosalina & Monteiro', bride: 'Rosalina', groom: 'Monteiro' },
    event: { dateISO: '2026-08-08T09:00:00+02:00', rsvpDeadline: '2026-06-20' },
    schedule: [
      {
        id: 'ceremony',
        type: 'ceremony',
        title: 'Cerimónia',
        time: '09:00',
        venue: 'Paróquia São Gabriel Arcanjo',
        mapUrl: 'https://www.google.com/maps/search/?api=1&query=Paroquia+Sao+Gabriel+Arcanjo+Matola'
      }
    ],
    story: { title: 'A nossa história', text: '', chapters: [] },
    access: { mode: 'nominal', rsvpIdentity: 'guest_token', requireNameOnActions: false, maxGuestsPerRsvp: 1, allowCompanionName: false, autoCreateGuestOnRsvp: false, autoCreateGuestOnGift: false },
    features: { story: true, gallery: true, dressCode: true, menu: true, rsvp: true, gifts: true, contributions: true, messages: true, checkin: true, capsule: true, guestInfo: true },
    gifts: { mode: 'monetary', catalogMode: 'legacy', store: '', options: [] },
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

function normalizedContent() {
  const validation = validateInviteContentV2(baseContent(), { stage: 'publish' });
  assert.equal(validation.valid, true);
  return validation.content;
}

function makeState(mode = 'legacy') {
  const draft = normalizedContent();
  return {
    invite: { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, config: { contentMode: mode } },
    content: {
      draft,
      published: JSON.parse(JSON.stringify(draft)),
      draftRevision: EXPECTED_DRAFT_REVISION,
      publishedRevision: EXPECTED_PUBLISHED_REVISION,
      publishHash: EXPECTED_HASH
    },
    revisions: [
      { stage: 'draft', revision: 1, contentHash: 'legacy-1' },
      { stage: 'draft', revision: 2, contentHash: 'legacy-2' },
      { stage: 'draft', revision: EXPECTED_DRAFT_REVISION, contentHash: EXPECTED_HASH },
      { stage: 'published', revision: EXPECTED_PUBLISHED_REVISION, contentHash: EXPECTED_HASH }
    ],
    blockers: []
  };
}

test('activation guard: alvo, revisões, hash e confirmações são literais', () => {
  assert.equal(TARGET_SLUG, 'rosalina-monteiro');
  assert.equal(TARGET_PACKAGE, 'esmeralda');
  assert.equal(TARGET_TEMPLATE, 'esmeralda-rosalina');
  assert.equal(TARGET_INVITE_ID, '6a0ae58dc217acfcf34461f0');
  assert.equal(EXPECTED_DRAFT_REVISION, 3);
  assert.equal(EXPECTED_PUBLISHED_REVISION, 1);
  assert.equal(EXPECTED_HASH, '033ca7eeaa8fe186495de16b7a54c07daaa3ed9e9bea0bbf8239d8a13634b0e1');
  assert.equal(ACTIVATE_CONFIRM, 'rosalina-monteiro-activate-mongo-v2');
  assert.equal(ROLLBACK_CONFIRM, 'rosalina-monteiro-rollback-legacy');
});

test('activation guard: hash é determinístico', () => {
  const a = { b: 2, a: 1 };
  const b = { a: 1, b: 2 };
  assert.equal(contentHash(a), contentHash(b));
});

test('activation guard: config ausente é legacy implícito e usa filtro exacto de ausência', () => {
  const invite = { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE };
  assert.deepEqual(configStateForInvite(invite), { kind: 'config-missing', raw: undefined });
  assert.equal(contentModeForInvite(invite), 'legacy');
  assert.equal(isAllowedLegacyStorage(invite), true);
  assert.deepEqual(buildContentModeMatch(invite, 'legacy'), { config: { $exists: false } });
});

test('activation guard: contentMode ausente dentro de config continua seguro e gera filtro $exists:false', () => {
  const invite = { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, config: {} };
  assert.deepEqual(configStateForInvite(invite), { kind: 'field-missing', raw: undefined });
  assert.equal(rawContentModeForInvite(invite), undefined);
  assert.equal(contentModeForInvite(invite), 'legacy');
  assert.equal(isAllowedLegacyStorage(invite), true);
  assert.deepEqual(buildContentModeMatch(invite, 'legacy'), { 'config.contentMode': { $exists: false } });
});

test('activation guard: estado legacy implícito continua classificável após tentativa sem match', () => {
  const state = makeState();
  delete state.invite.config.contentMode;
  assert.equal(contentModeForInvite(state.invite), 'legacy');
  assert.equal(isAllowedLegacyStorage(state.invite), true);
  const out = classifyActivationState(state);
  assert.equal(out.contentMode, 'legacy');
  assert.ok(!out.blockers.includes('CONTENT_MODE_STORAGE_UNEXPECTED'));
});

test('activation guard: legacy explícito gera filtro exacto', () => {
  const invite = { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, config: { contentMode: 'legacy' } };
  assert.equal(rawContentModeForInvite(invite), 'legacy');
  assert.deepEqual(buildContentModeMatch(invite, 'legacy'), { 'config.contentMode': 'legacy' });
});

test('activation guard: rollback usa comparação exacta com a representação mongo-v2 armazenada', () => {
  const invite = { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, config: { contentMode: ' MONGO-V2 ' } };
  assert.equal(contentModeForInvite(invite), 'mongo-v2');
  assert.deepEqual(buildContentModeMatch(invite, 'mongo-v2'), { 'config.contentMode': ' MONGO-V2 ' });
});

test('activation guard: representação desconhecida não é promovida automaticamente', () => {
  const state = makeState('valor-desconhecido');
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('CONTENT_MODE_STORAGE_UNEXPECTED'));
  assert.throws(() => buildContentModeMatch(state.invite, 'legacy'), /Representação legacy inesperada/);
});

test('activation guard: config inválido é bloqueado em vez de ser promovido', () => {
  const state = makeState();
  state.invite.config = null;
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('CONTENT_MODE_STORAGE_UNEXPECTED'));
});

test('activation guard: bloqueia inviteId diferente', () => {
  const state = makeState();
  state.invite._id = '000000000000000000000000';
  const out = classifyActivationState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('INVITE_ID_MISMATCH'));
});

test('activation guard: bloqueia pacote diferente', () => {
  const state = makeState();
  state.invite.packageKey = 'rubi';
  const out = classifyActivationState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('PACKAGE_MISMATCH'));
});

test('activation guard: bloqueia draftRevision diferente', () => {
  const state = makeState();
  state.content.draftRevision = 4;
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('DRAFT_REVISION_MISMATCH'));
});

test('activation guard: bloqueia publishedRevision diferente', () => {
  const state = makeState();
  state.content.publishedRevision = 2;
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISHED_REVISION_MISMATCH'));
});

test('activation guard: bloqueia publishHash diferente', () => {
  const state = makeState();
  state.content.publishHash = 'errado';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISH_HASH_MISMATCH'));
});

test('activation guard: bloqueia revisão published sem hash aprovado', () => {
  const state = makeState();
  state.revisions[state.revisions.length - 1].contentHash = 'errado';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISHED_REVISION_RECORD_MISMATCH'));
});

test('activation guard: bloqueia template published diferente', () => {
  const state = makeState();
  state.content.published.identity.templateKey = 'esmeralda-outro';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISHED_TEMPLATE_MISMATCH'));
});

test('activation guard: bloqueia runtime published já marcado mongo-v2', () => {
  const state = makeState();
  state.content.published.runtime.contentMode = 'mongo-v2';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISHED_RUNTIME_NOT_LEGACY'));
});

test('activation guard: reconhece ausência de InviteContent para activação', () => {
  const state = makeState();
  state.content = null;
  const out = classifyActivationState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('INVITE_CONTENT_MISSING'));
});

test('activation guard: mapas publicados são requisito explícito', () => {
  const content = normalizedContent();
  assert.equal(inspectPublishedMaps(content).ok, true);
  content.schedule[0].mapUrl = '';
  const maps = inspectPublishedMaps(content);
  assert.equal(maps.ok, false);
  assert.deepEqual(maps.missing, ['ceremony']);
});

test('activation guard: URL de mapa publicada tem de ser http/https', () => {
  const content = normalizedContent();
  content.schedule[0].mapUrl = 'javascript:alert(1)';
  const maps = inspectPublishedMaps(content);
  assert.equal(maps.ok, false);
  assert.deepEqual(maps.invalid, ['ceremony']);
});

test('activation guard: classificação bloqueia activação quando falta mapUrl', () => {
  const state = makeState();
  state.content.published.schedule[0].mapUrl = '';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISHED_MAP_URL_MISSING'));
});

test('activation guard: rollback de emergência não depende de InviteContent', () => {
  const state = makeState('mongo-v2');
  state.content = null;
  state.revisions = [];
  const out = classifyRollbackState(state);
  assert.equal(out.mode, 'ready');
  assert.equal(out.contentMode, 'mongo-v2');
  assert.deepEqual(out.blockers, []);
});

test('activation guard: rollback continua preso ao alvo exacto', () => {
  const state = makeState('mongo-v2');
  state.invite._id = '000000000000000000000000';
  const out = classifyRollbackState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('INVITE_ID_MISMATCH'));
});

test('activation guard source: escrita é confinada a config.contentMode e suporta rollback explícito', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'rosalina-builder-v2-activation-db.js'), 'utf8');
  assert.match(source, /\$set:\s*\{\s*'config\.contentMode':\s*targetMode\s*\}/);
  assert.match(source, /--activate/);
  assert.match(source, /--rollback/);
  assert.match(source, /rosalina-monteiro-activate-mongo-v2/);
  assert.match(source, /rosalina-monteiro-rollback-legacy/);
  assert.match(source, /PUBLISHED_MAP_URL_MISSING/);
  assert.match(source, /classifyRollbackState/);
  assert.match(source, /matchedCount !== 1/);
  assert.doesNotMatch(source, /InviteContent\.updateOne\(/);
  assert.doesNotMatch(source, /deleteMany\(/);
});
