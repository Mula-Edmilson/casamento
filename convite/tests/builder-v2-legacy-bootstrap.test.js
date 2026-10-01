'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  buildLegacyBootstrapDraft,
  auditLegacyBootstrapDraft
} = require('../builder-v2/legacy-bootstrap-v2');

const ROOT = path.resolve(__dirname, '..');
const INVITE_DIR = path.join(ROOT, 'rosalina-monteiro');
const inviteMeta = JSON.parse(fs.readFileSync(path.join(INVITE_DIR, 'invite-data.json'), 'utf8'));
const seedData = JSON.parse(fs.readFileSync(path.join(INVITE_DIR, 'mongodb-seed-data.json'), 'utf8'));
const dbBootstrapSource = fs.readFileSync(path.join(ROOT, 'tools', 'rosalina-builder-v2-bootstrap-db.js'), 'utf8');

function draft() {
  return buildLegacyBootstrapDraft({ inviteMeta, seedData });
}

test('Rosalina: fonte oficial identifica pacote Esmeralda', () => {
  assert.equal(inviteMeta.slug, 'rosalina-monteiro');
  assert.equal(inviteMeta.packageKey, 'esmeralda');
});

test('Rosalina: bootstrap preserva identidade principal', () => {
  const out = draft();
  assert.equal(out.identity.slug, 'rosalina-monteiro');
  assert.equal(out.identity.packageKey, 'esmeralda');
  assert.equal(out.people.coupleNames, 'Rosalina & Monteiro');
  assert.equal(out.people.bride, 'Rosalina Ezequiel');
  assert.equal(out.people.groom, 'Monteiro Francisco');
});

test('Rosalina: bootstrap preserva pais, data e versículo', () => {
  const out = draft();
  assert.equal(out.people.brideParents, 'Armindo Ezequiel e Esperança Nhassengo');
  assert.equal(out.people.groomParents, 'Vasco Monteiro e Laura Mahota');
  assert.equal(out.event.dateISO, '2026-08-08T09:00:00+02:00');
  assert.equal(out.event.verseReference, 'Eclesiastes 4:9 e 12');
});

test('Rosalina: agenda completa mantém três momentos', () => {
  const out = draft();
  assert.equal(out.schedule.length, 3);
  assert.deepEqual(out.schedule.map(item => item.time), ['09:00', '13:00', '14:30']);
  assert.equal(out.schedule[0].venue, 'Paróquia São Gabriel Arcanjo, Cidade da Matola');
  assert.equal(out.schedule[2].venue, 'Hotel Glória, Salão Ballroom');
});

test('Rosalina: história completa converte para quatro capítulos', () => {
  const out = draft();
  assert.equal(out.story.chapters.length, 4);
  assert.ok(out.story.chapters.every(item => item.text && item.text.length > 20));
  assert.match(out.story.letter, /Rosalina e Monteiro/);
});

test('Rosalina: contribuição monetária e pagamentos são preservados', () => {
  const out = draft();
  assert.equal(out.gifts.mode, 'monetary');
  assert.equal(out.payments.bankAccounts.length, 2);
  assert.equal(out.payments.mobilePayments.length, 2);
  assert.equal(out.payments.bankAccounts[0].holder, 'Monteiro Francisco');
});

test('Rosalina: convite nominal nunca ganha auto-criação de convidados', () => {
  const out = draft();
  assert.equal(out.access.mode, 'nominal');
  assert.equal(out.access.rsvpIdentity, 'guest_token');
  assert.equal(out.access.autoCreateGuestOnRsvp, false);
  assert.equal(out.access.autoCreateGuestOnGift, false);
});

test('Rosalina: bootstrap nunca activa mongo-v2', () => {
  const out = draft();
  assert.equal(out.runtime.contentMode, 'legacy');
  assert.equal(out.runtime.rendererVersion, 'v1');
});

test('Rosalina: convidados do seed não são copiados para InviteContent', () => {
  const out = draft();
  assert.ok(Array.isArray(seedData.guests));
  assert.ok(seedData.guests.length > 0);
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'guests'), false);
});

test('Rosalina: fonte legacy não é modificada pelo mapper', () => {
  const before = JSON.stringify(seedData);
  draft();
  assert.equal(JSON.stringify(seedData), before);
});

test('Rosalina: auditoria de bootstrap aprova correspondência estrutural', () => {
  const out = draft();
  const audit = auditLegacyBootstrapDraft({ inviteMeta, seedData, draft: out });
  assert.equal(audit.valid, true, JSON.stringify(audit, null, 2));
  assert.equal(audit.failed.length, 0);
  assert.equal(audit.validation.valid, true);
});

test('Rosalina: bootstrap não força template incompatível durante a migração de conteúdo', () => {
  const out = draft();
  assert.equal(out.identity.templateKey, '');
  assert.equal(out.identity.packageKey, 'esmeralda');
});

test('Rosalina DB bootstrap: modo padrão é CHECK e apply exige confirmação literal', () => {
  assert.match(dbBootstrapSource, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(dbBootstrapSource, /--confirm=rosalina-monteiro/);
  assert.match(dbBootstrapSource, /CONFIRM !== TARGET_SLUG/);
});

test('Rosalina DB bootstrap: recusa package mismatch e renderer mongo-v2 antes de escrever', () => {
  assert.match(dbBootstrapSource, /PACKAGE_MISMATCH/);
  assert.match(dbBootstrapSource, /CONTENT_MODE_NOT_LEGACY/);
  assert.match(dbBootstrapSource, /INVITE_CONTENT_ALREADY_EXISTS/);
  assert.match(dbBootstrapSource, /REVISION_HISTORY_ALREADY_EXISTS/);
});

test('Rosalina DB bootstrap: escrita é limitada a InviteContent e InviteContentRevision', () => {
  assert.match(dbBootstrapSource, /models\.InviteContent\.create/);
  assert.match(dbBootstrapSource, /models\.InviteContentRevision\.create/);
  assert.doesNotMatch(dbBootstrapSource, /Invite\.update/);
  assert.doesNotMatch(dbBootstrapSource, /findOneAndUpdate/);
  assert.doesNotMatch(dbBootstrapSource, /deleteMany|deleteOne|findOneAndDelete/);
});

test('Rosalina DB bootstrap: cria somente draft revision 1 e mantém published vazio', () => {
  assert.match(dbBootstrapSource, /draftRevision:\s*1/);
  assert.match(dbBootstrapSource, /publishedRevision:\s*0/);
  assert.match(dbBootstrapSource, /published:\s*\{\}/);
  assert.match(dbBootstrapSource, /contentMode.*legacy|draft\.runtime\.contentMode !== 'legacy'/s);
});
