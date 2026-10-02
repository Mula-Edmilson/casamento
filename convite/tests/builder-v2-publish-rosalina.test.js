'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TARGET_SLUG,
  TARGET_PACKAGE,
  TARGET_TEMPLATE,
  EXPECTED_DRAFT_REVISION,
  EXPECTED_CONFIRM,
  contentHash,
  classifyPublishState
} = require('../tools/rosalina-builder-v2-publish-db');
const { validateInviteContentV2 } = require('../builder-v2/invite-content-v2');

function baseDraft() {
  return {
    schemaVersion: '2.0',
    identity: { slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, templateKey: TARGET_TEMPLATE },
    people: { coupleNames: 'Rosalina & Monteiro', bride: 'Rosalina', groom: 'Monteiro', displayNames: 'Rosalina & Monteiro' },
    event: { dateISO: '2026-08-08T09:00:00+02:00', rsvpDeadline: '2026-06-20' },
    schedule: [{ id: 'ceremony', type: 'ceremony', title: 'Cerimónia', time: '09:00', venue: 'Paróquia São Gabriel Arcanjo' }],
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
    runtime: { contentMode: 'legacy' }
  };
}

function normalizedDraft() {
  const validation = validateInviteContentV2(baseDraft(), { stage: 'publish' });
  assert.equal(validation.valid, true);
  return validation.content;
}

function makeReadyState() {
  const draft = normalizedDraft();
  const hash = contentHash(draft);
  return {
    invite: { slug: TARGET_SLUG, packageKey: TARGET_PACKAGE, config: { contentMode: 'legacy' } },
    content: {
      draft,
      published: {},
      draftRevision: EXPECTED_DRAFT_REVISION,
      publishedRevision: 0,
      publishHash: ''
    },
    revisions: [
      { stage: 'draft', revision: 1, contentHash: 'legacy-1' },
      { stage: 'draft', revision: 2, contentHash: 'legacy-2' },
      { stage: 'draft', revision: EXPECTED_DRAFT_REVISION, contentHash: hash }
    ],
    blockers: []
  };
}

test('publish Rosalina: alvo e confirmação são literais e restritos', () => {
  assert.equal(TARGET_SLUG, 'rosalina-monteiro');
  assert.equal(TARGET_PACKAGE, 'esmeralda');
  assert.equal(TARGET_TEMPLATE, 'esmeralda-rosalina');
  assert.equal(EXPECTED_DRAFT_REVISION, 3);
  assert.equal(EXPECTED_CONFIRM, 'rosalina-monteiro-publish-v2');
});

test('publish Rosalina: estado exacto da revisão 3 fica ready', () => {
  const out = classifyPublishState(makeReadyState());
  assert.equal(out.mode, 'ready');
  assert.deepEqual(out.blockers, []);
  assert.equal(out.validation.valid, true);
});

test('publish Rosalina: bloqueia contentMode mongo-v2 antes da publicação piloto', () => {
  const state = makeReadyState();
  state.invite.config.contentMode = 'mongo-v2';
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('CONTENT_MODE_NOT_LEGACY'));
});

test('publish Rosalina: bloqueia revisão de Draft diferente da aprovada', () => {
  const state = makeReadyState();
  state.content.draftRevision = 4;
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('DRAFT_REVISION_UNEXPECTED'));
});

test('publish Rosalina: bloqueia hash do Draft diferente da revisão guardada', () => {
  const state = makeReadyState();
  state.revisions[state.revisions.length - 1].contentHash = 'hash-errado';
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('CURRENT_DRAFT_HASH_MISMATCH'));
});

test('publish Rosalina: bloqueia histórico published pré-existente no primeiro publish', () => {
  const state = makeReadyState();
  state.revisions.push({ stage: 'published', revision: 1, contentHash: 'qualquer' });
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('PUBLISHED_HISTORY_ALREADY_EXISTS'));
});

test('publish Rosalina: bloqueia template diferente de Esmeralda Rosalina', () => {
  const state = makeReadyState();
  state.content.draft.identity.templateKey = 'esmeralda-edma';
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('DRAFT_TEMPLATE_MISMATCH'));
});

test('publish Rosalina: bloqueia runtime V2 antes da activação separada', () => {
  const state = makeReadyState();
  state.content.draft.runtime.contentMode = 'mongo-v2';
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('DRAFT_RUNTIME_NOT_LEGACY'));
});

test('publish Rosalina: publicação idempotente é reconhecida sem nova escrita', () => {
  const state = makeReadyState();
  const hash = contentHash(state.content.draft);
  state.content.published = JSON.parse(JSON.stringify(state.content.draft));
  state.content.publishedRevision = 1;
  state.content.publishHash = hash;
  state.revisions.push({ stage: 'published', revision: 1, contentHash: hash });
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'already-published');
  assert.deepEqual(out.blockers, []);
});

test('publish Rosalina: alteração do Draft após publicação não é tratada como idempotente', () => {
  const state = makeReadyState();
  const published = JSON.parse(JSON.stringify(state.content.draft));
  const oldHash = contentHash(published);
  state.content.published = published;
  state.content.publishedRevision = 1;
  state.content.publishHash = oldHash;
  state.revisions.push({ stage: 'published', revision: 1, contentHash: oldHash });
  state.content.draft.people.displayNames = 'Rosalina & Monteiro — alterado';
  state.content.draftRevision = 4;
  state.revisions.push({ stage: 'draft', revision: 4, contentHash: contentHash(validateInviteContentV2(state.content.draft, { stage: 'publish' }).content) });
  const out = classifyPublishState(state);
  assert.equal(out.mode, 'blocked');
  assert.ok(out.blockers.includes('DRAFT_REVISION_UNEXPECTED'));
});
