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
  EXPECTED_BASE_DRAFT_REVISION,
  EXPECTED_BASE_PUBLISHED_REVISION,
  EXPECTED_BASE_HASH,
  ACTIVATE_CONFIRM,
  ROLLBACK_CONFIRM,
  contentHash,
  configStateForInvite,
  rawContentModeForInvite,
  contentModeForInvite,
  isAllowedLegacyStorage,
  buildContentModeMatch,
  classifyActivationState,
  classifyRollbackState
} = require('../tools/rosalina-builder-v2-activation-db');
const { validateInviteContentV2 } = require('../builder-v2/invite-content-v2');
const {
  applyRosalinaLocationMaps,
  ROSALINA_LOCATION_MAPS
} = require('../builder-v2/rosalina-location-maps-v2');

function baseContent() {
  return {
    schemaVersion: '2.0',
    identity: { slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, templateKey: TARGET_TEMPLATE },
    people: { coupleNames: 'Rosalina & Monteiro', displayNames: 'Rosalina & Monteiro', bride: 'Rosalina', groom: 'Monteiro' },
    event: { dateISO: '2026-08-08T09:00:00+02:00', rsvpDeadline: '2026-06-20' },
    schedule: [
      { id: 'religious', type: 'religious', title: 'Cerimónia Religiosa', time: '09:00', venue: 'Paróquia São Gabriel Arcanjo', mapUrl: '', note: '' },
      { id: 'civil', type: 'civil', title: 'Cerimónia Civil', time: '13:00', venue: 'Hotel Polana', mapUrl: '', note: '' },
      { id: 'party', type: 'additional', title: 'Copo de Água', time: '14:30', venue: 'Hotel Glória', mapUrl: '', note: '' }
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

function normalizedMappedContent() {
  const mapped = applyRosalinaLocationMaps(baseContent());
  const validation = validateInviteContentV2(mapped, { stage: 'publish' });
  assert.equal(validation.valid, true);
  return validation.content;
}

function makeState(mode = 'legacy') {
  const draft = normalizedMappedContent();
  const hash = contentHash(draft);
  return {
    invite: { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, config: { contentMode: mode } },
    content: {
      draft,
      published: JSON.parse(JSON.stringify(draft)),
      draftRevision: EXPECTED_DRAFT_REVISION,
      publishedRevision: EXPECTED_PUBLISHED_REVISION,
      publishHash: hash
    },
    revisions: [
      { stage: 'draft', revision: EXPECTED_BASE_DRAFT_REVISION, contentHash: EXPECTED_BASE_HASH },
      { stage: 'published', revision: EXPECTED_BASE_PUBLISHED_REVISION, contentHash: EXPECTED_BASE_HASH },
      { stage: 'draft', revision: EXPECTED_DRAFT_REVISION, contentHash: hash },
      { stage: 'published', revision: EXPECTED_PUBLISHED_REVISION, contentHash: hash }
    ],
    blockers: []
  };
}

test('activation guard: alvo e checkpoints são literais', () => {
  assert.equal(TARGET_SLUG, 'rosalina-monteiro');
  assert.equal(TARGET_PACKAGE, 'esmeralda');
  assert.equal(TARGET_TEMPLATE, 'esmeralda-rosalina');
  assert.equal(TARGET_INVITE_ID, '6a0ae58dc217acfcf34461f0');
  assert.equal(EXPECTED_DRAFT_REVISION, 4);
  assert.equal(EXPECTED_PUBLISHED_REVISION, 2);
  assert.equal(EXPECTED_BASE_DRAFT_REVISION, 3);
  assert.equal(EXPECTED_BASE_PUBLISHED_REVISION, 1);
  assert.equal(EXPECTED_BASE_HASH, '033ca7eeaa8fe186495de16b7a54c07daaa3ed9e9bea0bbf8239d8a13634b0e1');
  assert.equal(ACTIVATE_CONFIRM, 'rosalina-monteiro-activate-mongo-v2');
  assert.equal(ROLLBACK_CONFIRM, 'rosalina-monteiro-rollback-legacy');
});

test('activation guard: hash é determinístico', () => {
  const a = { b: 2, a: 1 };
  const b = { a: 1, b: 2 };
  assert.equal(contentHash(a), contentHash(b));
});

test('activation guard: config ausente é legacy implícito e usa filtro exacto', () => {
  const invite = { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE };
  assert.deepEqual(configStateForInvite(invite), { kind: 'config-missing', raw: undefined });
  assert.equal(contentModeForInvite(invite), 'legacy');
  assert.equal(isAllowedLegacyStorage(invite), true);
  assert.deepEqual(buildContentModeMatch(invite, 'legacy'), { config: { $exists: false } });
});

test('activation guard: contentMode ausente dentro de config continua legacy seguro', () => {
  const invite = { _id: TARGET_INVITE_ID, slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, config: {} };
  assert.deepEqual(configStateForInvite(invite), { kind: 'field-missing', raw: undefined });
  assert.equal(rawContentModeForInvite(invite), undefined);
  assert.equal(contentModeForInvite(invite), 'legacy');
  assert.deepEqual(buildContentModeMatch(invite, 'legacy'), { 'config.contentMode': { $exists: false } });
});

test('activation guard: rollback usa compare-and-set da representação mongo-v2 armazenada', () => {
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

test('activation guard: bloqueia inviteId diferente', () => {
  const state = makeState();
  state.invite._id = '000000000000000000000000';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('INVITE_ID_MISMATCH'));
});

test('activation guard: bloqueia pacote diferente', () => {
  const state = makeState();
  state.invite.packageKey = 'rubi';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PACKAGE_MISMATCH'));
});

test('activation guard: exige Draft 4 e Published 2', () => {
  const state = makeState();
  state.content.draftRevision = 5;
  state.content.publishedRevision = 3;
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('DRAFT_REVISION_MISMATCH'));
  assert.ok(out.blockers.includes('PUBLISHED_REVISION_MISMATCH'));
});

test('activation guard: exige publishHash igual ao conteúdo actual', () => {
  const state = makeState();
  state.content.publishHash = 'errado';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISH_HASH_MISMATCH'));
});

test('activation guard: exige mapas exactos, não apenas URLs não vazias', () => {
  const state = makeState();
  state.content.published.schedule[0].mapUrl = 'https://example.com/igreja';
  const out = classifyActivationState(state);
  assert.ok(out.blockers.includes('PUBLISHED_MAP_URL_MISMATCH'));
});

test('activation guard: exige prova criptográfica de base + somente mapas', () => {
  const state = makeState();
  const out = classifyActivationState(state);
  // O fixture é válido estruturalmente, mas não é o conteúdo real que gerou EXPECTED_BASE_HASH.
  assert.ok(out.blockers.includes('DRAFT_NOT_BASE_PLUS_MAPS'));
  assert.ok(out.blockers.includes('PUBLISHED_NOT_BASE_PLUS_MAPS'));
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

test('activation guard source: escrita é confinada a config.contentMode', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'rosalina-builder-v2-activation-db.js'), 'utf8');
  assert.match(source, /\$set:\s*\{\s*'config\.contentMode':\s*targetMode\s*\}/);
  assert.match(source, /stripRosalinaLocationMaps/);
  assert.match(source, /DRAFT_NOT_BASE_PLUS_MAPS/);
  assert.match(source, /PUBLISHED_NOT_BASE_PLUS_MAPS/);
  assert.match(source, /classifyRollbackState/);
  assert.match(source, /matchedCount !== 1/);
  assert.doesNotMatch(source, /InviteContent\.updateOne\(/);
  assert.doesNotMatch(source, /deleteMany\(/);
});

test('activation guard: mapas de referência são os três IDs operacionais esperados', () => {
  assert.deepEqual(Object.keys(ROSALINA_LOCATION_MAPS), ['religious', 'civil', 'party']);
});
