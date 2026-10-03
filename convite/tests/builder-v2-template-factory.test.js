'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  FACTORY_VERSION,
  FACTORY_TEMPLATES,
  contentHash,
  getFactoryTemplate,
  listFactoryTemplates,
  buildStarterDraft,
  factoryMarker,
  activationConfirm,
  rollbackConfirm,
  activationBlockers,
  buildLegacyEventData,
  applyTemplateReplacements
} = require('../builder-v2/template-factory-v2');
const { validateInviteContentV2 } = require('../builder-v2/invite-content-v2');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function starter(overrides = {}) {
  return buildStarterDraft({
    templateKey: 'esmeralda-rosalina',
    coupleNames: 'Ana & João',
    bride: 'Ana',
    groom: 'João',
    slug: 'ana-joao',
    eventDateISO: '2026-12-12T10:00:00+02:00',
    rsvpDeadline: '2026-11-30',
    ...overrides
  });
}

function publishable() {
  const content = starter();
  content.schedule = [{ id: 'cerimonia', type: 'religious', title: 'Cerimónia', time: '10:00', venue: 'Local do evento', mapUrl: '', note: '' }];
  const validation = validateInviteContentV2(content, { stage: 'publish' });
  assert.equal(validation.valid, true, validation.errors.join(' · '));
  return validation.content;
}

function factoryInvite(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    slug: 'ana-joao',
    packageKey: 'esmeralda',
    coupleNames: 'Ana & João',
    status: 'draft',
    config: {
      contentMode: 'legacy',
      templateKey: 'esmeralda-rosalina',
      factoryV2: { version: FACTORY_VERSION, templateKey: 'esmeralda-rosalina' }
    },
    ...overrides
  };
}

function publishedDoc(overrides = {}) {
  const published = publishable();
  return {
    publishedRevision: 1,
    published,
    publishHash: contentHash(published),
    ...overrides
  };
}

function textFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...textFilesRecursive(full));
    else if (/\.(html|css|js|json|md|txt|svg|xml|webmanifest|yml|yaml)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

test('factory registry expõe apenas Rosalina como piloto e mantém package/path exactos', () => {
  assert.equal(Object.keys(FACTORY_TEMPLATES).length, 1);
  const spec = getFactoryTemplate('esmeralda-rosalina');
  assert.ok(spec);
  assert.equal(spec.packageKey, 'esmeralda');
  assert.equal(spec.templatePath, 'convite/templates/rubi-rosalina');
  assert.equal(spec.accessMode, 'nominal');
  assert.equal(spec.giftsMode, 'monetary');
  assert.deepEqual(listFactoryTemplates().map(item => item.key), ['esmeralda-rosalina']);
});

test('starter Rosalina é novo conteúdo limpo e não copia dados pessoais do piloto', () => {
  const draft = starter();
  assert.equal(draft.identity.slug, 'ana-joao');
  assert.equal(draft.identity.packageKey, 'esmeralda');
  assert.equal(draft.identity.templateKey, 'esmeralda-rosalina');
  assert.equal(draft.people.coupleNames, 'Ana & João');
  assert.equal(draft.people.bride, 'Ana');
  assert.equal(draft.people.groom, 'João');
  assert.equal(draft.runtime.contentMode, 'legacy');
  assert.equal(draft.runtime.rendererVersion, 'v2');
  assert.equal(draft.access.mode, 'nominal');
  assert.equal(draft.access.autoCreateGuestOnRsvp, false);
  assert.equal(draft.access.autoCreateGuestOnGift, false);
  assert.equal(draft.gifts.mode, 'monetary');
  assert.deepEqual(draft.schedule, []);
  assert.deepEqual(draft.story.chapters, []);
  assert.deepEqual(draft.gallery.items, []);
  assert.deepEqual(draft.payments.bankAccounts, []);
  assert.deepEqual(draft.payments.mobilePayments, []);
  assert.deepEqual(draft.support.contacts, []);

  const serialized = JSON.stringify(draft).toLowerCase();
  for (const forbidden of [
    'rosalina monteiro', 'rosalina & monteiro', 'clemente', 'nelson',
    'praça da igreja', 'polana serena', 'afecc glória', 'julius nyerere', 'avenida da marginal 4441'
  ]) assert.equal(serialized.includes(forbidden.toLowerCase()), false, forbidden);
});

test('template físico Rosalina reutilizável não contém dados pessoais do piloto', () => {
  const templateDir = path.join(root, 'templates', 'rubi-rosalina');
  const files = textFilesRecursive(templateDir).filter(file => path.basename(file) !== 'TEMPLATE-LIRANDZO.txt');
  assert.ok(files.length > 0);
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /rosalina-monteiro|Rosalina\s*&\s*Monteiro|Rosalina\s+Monteiro|Clemente|Nelson|Polana Serena|AFECC Glória|Praça da Igreja|Julius Nyerere|Marginal 4441/i);
});

test('starter é válido como Draft mas exige agenda antes da publicação', () => {
  const draft = starter();
  const draftValidation = validateInviteContentV2(draft, { stage: 'draft' });
  assert.equal(draftValidation.valid, true);
  const publishValidation = validateInviteContentV2(draft, { stage: 'publish' });
  assert.equal(publishValidation.valid, false);
  assert.ok(publishValidation.errors.some(item => /agenda/i.test(item)));
});

test('starter recusa template não autorizado e slug inválido', () => {
  assert.throws(() => starter({ templateKey: 'esmeralda-edma' }), error => error.code === 'FACTORY_TEMPLATE_UNSUPPORTED');
  assert.throws(() => buildStarterDraft({ templateKey: 'esmeralda-rosalina', coupleNames: 'A', slug: 'a' }), error => error.code === 'INVALID_SLUG');
});

test('factory marker só reconhece convite explicitamente criado pelo Factory V2', () => {
  const valid = factoryMarker(factoryInvite());
  assert.equal(valid.managed, true);
  assert.equal(valid.templateKey, 'esmeralda-rosalina');
  assert.equal(valid.contentMode, 'legacy');
  assert.equal(valid.rawContentMode, 'legacy');

  const noMarker = factoryMarker(factoryInvite({ config: { contentMode: 'legacy', templateKey: 'esmeralda-rosalina' } }));
  assert.equal(noMarker.managed, false);
  const unknownModeInvite = factoryInvite({ config: { contentMode: 'qualquer-coisa', factoryV2: { version: 1, templateKey: 'esmeralda-rosalina' } } });
  const unknownMode = factoryMarker(unknownModeInvite);
  assert.equal(unknownMode.contentMode, 'legacy');
  assert.equal(unknownMode.rawContentMode, 'qualquer-coisa');
  assert.ok(activationBlockers(unknownModeInvite, publishedDoc()).includes('CONTENT_MODE_STORAGE_UNEXPECTED'));
});

test('activation guard aprova somente Published válido, íntegro e do próprio template', () => {
  const invite = factoryInvite();
  const doc = publishedDoc();
  assert.deepEqual(activationBlockers(invite, doc), []);

  assert.ok(activationBlockers(invite, null).includes('INVITE_CONTENT_MISSING'));
  assert.ok(activationBlockers(invite, { ...doc, publishedRevision: 0 }).includes('PUBLISHED_REVISION_MISSING'));
  assert.ok(activationBlockers(invite, { ...doc, publishHash: 'hash-adulterado' }).includes('PUBLISH_HASH_MISMATCH'));

  const wrongTemplate = publishedDoc();
  wrongTemplate.published.identity.templateKey = 'esmeralda-edma';
  assert.ok(activationBlockers(invite, wrongTemplate).includes('PUBLISHED_TEMPLATE_MISMATCH'));

  const activeInvite = factoryInvite({
    config: { contentMode: 'mongo-v2', templateKey: 'esmeralda-rosalina', factoryV2: { version: 1, templateKey: 'esmeralda-rosalina' } }
  });
  assert.ok(activationBlockers(activeInvite, doc).includes('CONTENT_MODE_NOT_LEGACY'));
});

test('confirmações de activação e rollback ficam presas ao slug exacto', () => {
  assert.equal(activationConfirm('ana-joao'), 'activate:ana-joao');
  assert.equal(rollbackConfirm('ana-joao'), 'rollback:ana-joao');
  assert.notEqual(activationConfirm('outro-casal'), activationConfirm('ana-joao'));
});

test('event-data legacy gerado contém identidade do novo convite sem dados pessoais do piloto', () => {
  const source = buildLegacyEventData({
    slug: 'ana-joao', packageKey: 'esmeralda', coupleNames: 'Ana & João', bride: 'Ana', groom: 'João',
    eventDateISO: '2026-12-12T10:00:00+02:00', rsvpDeadline: '2026-11-30'
  }, 'esmeralda-rosalina');
  assert.match(source, /window\.LIRANDZO_EVENT_DATA/);
  assert.match(source, /ana-joao/);
  assert.match(source, /Ana & João/);
  assert.match(source, /esmeralda-rosalina/); // nome técnico do template é permitido
  assert.match(source, /"contentMode": "legacy"/);
  assert.doesNotMatch(source, /rosalina-monteiro|Rosalina\s*&\s*Monteiro|Rosalina\s+Monteiro|Clemente|Nelson|Polana Serena|AFECC Glória|Praça da Igreja|Julius Nyerere|Marginal 4441/i);
});

test('replacements do template alteram placeholders sem injectar dados do piloto', () => {
  const input = '<title>__COUPLE_NAMES__</title><p>__INVITE_SLUG__</p>';
  const output = applyTemplateReplacements(input, {
    slug: 'ana-joao', apiBaseUrl: 'https://api.example.com', coupleNames: 'Ana & João', clientName: 'Ana & João',
    bride: 'Ana', groom: 'João', packageKey: 'esmeralda', publicUrl: 'https://example.com/convite/ana-joao/'
  }, 'index.html');
  assert.match(output, /Ana & João/);
  assert.match(output, /ana-joao/);
  assert.doesNotMatch(output, /__COUPLE_NAMES__|__INVITE_SLUG__/);
});

test('backend factory: criação é Admin-only, compensação é completa e activação fica separada', () => {
  const source = read('builder-v2/template-factory-v2.js');
  assert.match(source, /app\.post\('\/manager\/template-factory\/invites', requireManager, requireAdmin/);
  assert.match(source, /contentMode:\s*LEGACY_MODE/);
  assert.match(source, /draftRevision:\s*1/);
  assert.match(source, /publishedRevision:\s*0/);
  assert.match(source, /copyFactoryTemplateToGitHub/);
  assert.match(source, /Activity\.deleteMany/);
  assert.match(source, /InviteContentRevision\.deleteMany/);
  assert.match(source, /InviteContent\.deleteMany/);
  assert.match(source, /Invite\.deleteOne/);
  assert.match(source, /FACTORY_ACTIVATION_CONFIRM_REQUIRED/);
  assert.match(source, /FACTORY_ROLLBACK_CONFIRM_REQUIRED/);
  assert.match(source, /PUBLISH_HASH_MISMATCH/);
  assert.match(source, /\/manager\/template-factory\/invites\/:id\/activate/);
  assert.match(source, /'config\.contentMode': ACTIVE_MODE/);
  assert.doesNotMatch(source, /rosalina-monteiro|6a0ae58dc217acfcf34461f0|033ca7ee|4ba24eb9/i);
});

test('Admin Manager Factory usa fluxo criar → Construtor → publicar → activar, só para convites factory-managed', () => {
  const ui = read('adminmanager-template-factory-v2.js');
  const config = read('adminmanager.config.js');
  assert.match(ui, /Template Factory V2/);
  assert.match(ui, /\/manager\/template-factory\/invites'/);
  assert.match(ui, /showPanel\('builderV2'\)/);
  assert.match(ui, /publishedRevision < 1/);
  assert.match(ui, /function isFactoryManagedInvite/);
  assert.match(ui, /config\?\.factoryV2/);
  assert.match(ui, /factoryManaged/);
  assert.match(ui, /confirm:`activate:\$\{state\.slug\}`/);
  assert.match(ui, /confirm:`rollback:\$\{state\.slug\}`/);
  const createFn = ui.slice(ui.indexOf('async function createFactoryInvite'), ui.indexOf('function ensureBuilderControls'));
  assert.doesNotMatch(createFn, /\/activate|mongo-v2/);
  assert.match(config, /adminmanager-template-factory-v2\.js/);
  assert.match(config, /script\.addEventListener\('load', loadBuilderExtras/);
});

test('content API regista Factory sem mover a mutação de contentMode para a API base', () => {
  const apiSource = read('builder-v2/content-api-v2.js');
  assert.match(apiSource, /registerTemplateFactoryV2Routes/);
  assert.match(apiSource, /\.\.\.\(factoryManifest\.managerRoutes \|\| \[\]\)/);
  assert.doesNotMatch(apiSource, /Invite\.(updateOne|findByIdAndUpdate|findOneAndUpdate)/);
});
