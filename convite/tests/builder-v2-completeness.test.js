'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildLegacyBootstrapDraft } = require('../builder-v2/legacy-bootstrap-v2');
const {
  TEMPLATE_KEY,
  ROSALINA_PRESENTATION_SOURCE,
  ROSALINA_KNOWN_LEGACY_CONFLICTS,
  buildRosalinaCompletenessDraft,
  auditRosalinaCompleteness
} = require('../builder-v2/rosalina-completeness-v2');
const {
  scheduleWithoutMapUrls,
  auditRosalinaLocationMaps
} = require('../builder-v2/rosalina-location-maps-v2');

const ROOT = path.resolve(__dirname, '..');
const INVITE_DIR = path.join(ROOT, 'rosalina-monteiro');
const inviteMeta = JSON.parse(fs.readFileSync(path.join(INVITE_DIR, 'invite-data.json'), 'utf8'));
const seedData = JSON.parse(fs.readFileSync(path.join(INVITE_DIR, 'mongodb-seed-data.json'), 'utf8'));
const inviteHtml = fs.readFileSync(path.join(INVITE_DIR, 'convite.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(INVITE_DIR, 'style.css'), 'utf8');
const dbSource = fs.readFileSync(path.join(ROOT, 'tools', 'rosalina-builder-v2-completeness-db.js'), 'utf8');

function baseDraft() {
  return buildLegacyBootstrapDraft({ inviteMeta, seedData });
}

function completeDraft() {
  return buildRosalinaCompletenessDraft(baseDraft());
}

test('completeness: associa Rosalina ao template Esmeralda sem mudar packageKey', () => {
  const out = completeDraft();
  assert.equal(out.identity.templateKey, TEMPLATE_KEY);
  assert.equal(out.identity.packageKey, 'esmeralda');
});

test('completeness: normaliza prazo RSVP e preserva dateISO completo', () => {
  const base = baseDraft();
  const out = buildRosalinaCompletenessDraft(base);
  assert.equal(out.event.rsvpDeadline, '2026-06-20');
  assert.equal(out.event.dateISO, base.event.dateISO);
});

test('completeness: media e SEO correspondem aos artefactos reais', () => {
  const out = completeDraft();
  assert.deepEqual(out.media, ROSALINA_PRESENTATION_SOURCE.media);
  assert.deepEqual(out.seo, ROSALINA_PRESENTATION_SOURCE.seo);
  assert.match(styleCss, /CAPA HERO\.jpg/);
  assert.match(inviteHtml, /static\.wixstatic\.com\/mp3\/819ea0_e333d443f2f545e59d79429cdd3c1361\.mp3/);
  assert.match(inviteHtml, /PG2\.jpg/);
});

test('completeness: galeria preserva os três itens reais', () => {
  const out = completeDraft();
  assert.equal(out.gallery.items.length, 3);
  for (const item of out.gallery.items) assert.ok(inviteHtml.includes(item.src), item.src);
});

test('completeness: dress code real é estruturado', () => {
  const out = completeDraft();
  assert.equal(out.dressCode.title, 'Inspiração: Elegante e Romântico');
  assert.equal(out.dressCode.image, 'assets/media/dress-code-paleta.jpeg');
  assert.match(inviteHtml, /Inspiração: Elegante e Romântico/);
});

test('completeness: menu real é estruturado em quatro itens', () => {
  const out = completeDraft();
  assert.equal(out.menu.title, 'Menu da Celebração');
  assert.deepEqual(out.menu.items.map(item => item.label), ['Entrada', 'Prato principal', 'Bebidas', 'Sobremesa']);
  assert.match(inviteHtml, /Menu da Celebração/);
});

test('completeness: preserva agenda excepto mapUrl e não altera restantes blocos operacionais', () => {
  const base = baseDraft();
  const out = buildRosalinaCompletenessDraft(base);

  assert.deepEqual(scheduleWithoutMapUrls(out.schedule), scheduleWithoutMapUrls(base.schedule));
  assert.equal(auditRosalinaLocationMaps(out).valid, true);

  for (const key of ['people', 'story', 'access', 'gifts', 'payments', 'support', 'features']) {
    assert.deepEqual(out[key], base[key], key);
  }
  assert.equal(out.runtime.contentMode, 'legacy');
});

test('completeness: divergências legacy ficam explícitas e structured mantém precedência', () => {
  assert.equal(ROSALINA_KNOWN_LEGACY_CONFLICTS.length, 2);
  assert.equal(ROSALINA_KNOWN_LEGACY_CONFLICTS[0].key, 'schedule.ceremony');
  assert.equal(ROSALINA_KNOWN_LEGACY_CONFLICTS[0].precedence, 'structured');
  assert.match(inviteHtml, /09:30/);
  assert.equal(baseDraft().schedule[0].time, '09:00');
});

test('completeness: auditoria final passa, mapas ficam completos e renderer permanece legacy', () => {
  const base = baseDraft();
  const out = buildRosalinaCompletenessDraft(base);
  const audit = auditRosalinaCompleteness({ baseDraft: base, draft: out });
  assert.equal(audit.valid, true, JSON.stringify(audit, null, 2));
  assert.equal(audit.failed.length, 0);
  assert.equal(audit.summary.mappedLocations, 3);
  assert.equal(audit.summary.contentMode, 'legacy');
});

test('completeness DB: exige hash exacto do bootstrap e revisão 1', () => {
  assert.match(dbSource, /EXPECTED_BASE_HASH = 'b2476052a94b4040d8f4627d1afa0f471309147adf8fdd3e4b2d6d76a8920e68'/);
  assert.match(dbSource, /DRAFT_REVISION_NOT_ONE/);
  assert.match(dbSource, /BASE_DRAFT_HASH_MISMATCH/);
});

test('completeness DB: Apply é explícito, transaccional e cria só Draft revision 2', () => {
  assert.match(dbSource, /rosalina-monteiro-completeness/);
  assert.match(dbSource, /withTransaction/);
  assert.match(dbSource, /draftRevision:\s*2/);
  assert.match(dbSource, /revision:\s*2/);
  assert.doesNotMatch(dbSource, /Guest\.create|Guest\.update|GiftItem\.create|Contribution\.create|Message\.create|CheckIn\.create|Capsule\.create/);
});
