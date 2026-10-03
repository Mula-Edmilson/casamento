'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoosePackage = require('mongoose');
const {
  stableSerialize,
  contentHash,
  builderContentModeForInvite,
  legacyDraftFromInvite,
  bindContentToInvite,
  publicContentEnvelope,
  registerBuilderV2ContentRoutes
} = require('../builder-v2/content-api-v2');
const { createBuilderV2Models } = require('../builder-v2/mongo-models-v2');
const {
  patchServerSource,
  patchPackageObject,
  inspectServerIntegration
} = require('../tools/apply-builder-v2-foundation2');

function fakeInvite(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    slug: 'edna-mauro',
    packageKey: 'esmeralda',
    coupleNames: 'Edna & Mauro',
    bride: 'Edna',
    groom: 'Mauro',
    eventDateISO: '2026-11-07T13:00:00+02:00',
    rsvpDeadline: '',
    status: 'published',
    config: {},
    ...overrides
  };
}

function publishableContent() {
  return {
    schemaVersion: '2.0',
    identity: { slug: 'edna-mauro', packageKey: 'esmeralda', templateKey: 'esmeralda-edma', eventType: 'Casamento', language: 'Português' },
    people: { coupleNames: 'Edna & Mauro', displayNames: 'Edna e Mauro' },
    event: { dateISO: '2026-11-07T13:00:00+02:00', timezone: 'Africa/Maputo' },
    schedule: [{ id: 'cerimonia', title: 'Cerimónia', time: '09:30', venue: 'Igreja' }],
    runtime: { contentMode: 'mongo-v2', rendererVersion: 'v2' }
  };
}

test('hash é canónico: ordem de chaves não altera o digest', () => {
  const a = { z: 1, nested: { b: 2, a: 1 }, arr: [{ y: 2, x: 1 }] };
  const b = { arr: [{ x: 1, y: 2 }], nested: { a: 1, b: 2 }, z: 1 };
  assert.equal(stableSerialize(a), stableSerialize(b));
  assert.equal(contentHash(a), contentHash(b));
  assert.notEqual(contentHash(a), contentHash({ ...a, z: 2 }));
});

test('contentMode do convite é fail-safe: apenas mongo-v2 exacto activa renderer', () => {
  assert.equal(builderContentModeForInvite(fakeInvite()), 'legacy');
  assert.equal(builderContentModeForInvite(fakeInvite({ config: { contentMode: 'unknown' } })), 'legacy');
  assert.equal(builderContentModeForInvite(fakeInvite({ config: { contentMode: 'MONGO-V2' } })), 'mongo-v2');
});

test('legacyDraftFromInvite cria sugestão V2 sem activar o renderer', () => {
  const draft = legacyDraftFromInvite(fakeInvite({
    config: {
      guestAccessMode: 'open',
      requireNameOnActions: true,
      program: [{ title: 'Cerimónia', place: 'Igreja', time: '09:30' }]
    }
  }));
  assert.equal(draft.identity.slug, 'edna-mauro');
  assert.equal(draft.identity.packageKey, 'esmeralda');
  assert.equal(draft.runtime.contentMode, 'legacy');
  assert.equal(draft.access.mode, 'open');
});

test('bindContentToInvite fixa identidade no convite seleccionado', () => {
  const bound = bindContentToInvite(publishableContent(), fakeInvite());
  assert.equal(bound.identity.slug, 'edna-mauro');
  assert.equal(bound.identity.packageKey, 'esmeralda');
});

test('bindContentToInvite recusa slug de outro convite', () => {
  const content = publishableContent();
  content.identity.slug = 'outro-convite';
  assert.throws(() => bindContentToInvite(content, fakeInvite()), error => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'CONTENT_INVITE_MISMATCH');
    return true;
  });
});

test('bindContentToInvite recusa pacote diferente', () => {
  const content = publishableContent();
  content.identity.packageKey = 'rubi';
  assert.throws(() => bindContentToInvite(content, fakeInvite()), error => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'CONTENT_PACKAGE_MISMATCH');
    return true;
  });
});

test('endpoint público em legacy nunca expõe conteúdo V2 armazenado', () => {
  const envelope = publicContentEnvelope(fakeInvite(), {
    publishedRevision: 9,
    published: { secret: 'não deve sair' },
    publishHash: 'abc'
  });
  assert.equal(envelope.active, false);
  assert.equal(envelope.mode, 'legacy');
  assert.equal(envelope.content, null);
  assert.equal(envelope.revision, 0);
});

test('endpoint público activo falha fechado quando ainda não há publicação', () => {
  const invite = fakeInvite({ config: { contentMode: 'mongo-v2' } });
  assert.throws(() => publicContentEnvelope(invite, null), error => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, 'CONTENT_NOT_PUBLISHED');
    return true;
  });
});

test('endpoint público activo devolve apenas published + metadados', () => {
  const invite = fakeInvite({ config: { contentMode: 'mongo-v2' } });
  const published = publishableContent();
  const envelope = publicContentEnvelope(invite, {
    draft: { shouldNotLeak: true },
    publishedRevision: 2,
    published,
    publishHash: contentHash(published),
    publishedAt: new Date('2026-10-01T10:00:00Z')
  });
  assert.equal(envelope.active, true);
  assert.equal(envelope.revision, 2);
  assert.deepEqual(envelope.content, published);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, 'draft'), false);
});

test('registo de rotas cobre Builder V2 + Template Factory e mantém protecções Admin', () => {
  const routes = [];
  const app = {
    get(path, ...handlers) { routes.push({ method: 'GET', path, handlers }); },
    put(path, ...handlers) { routes.push({ method: 'PUT', path, handlers }); },
    post(path, ...handlers) { routes.push({ method: 'POST', path, handlers }); }
  };
  const requireManager = function requireManager() {};
  const requireAdmin = function requireAdmin() {};
  const deps = {
    mongoose: { Types: { ObjectId: { isValid: () => true } }, startSession: async () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) },
    Invite: {},
    InviteContent: {},
    InviteContentRevision: {},
    FormSubmission: {},
    Activity: {},
    requireManager,
    requireAdmin,
    asyncRoute: fn => fn
  };
  const manifest = registerBuilderV2ContentRoutes(app, deps);
  assert.equal(routes.length, 11);
  assert.deepEqual(manifest.managerRoutes, [
    'GET /manager/invites/:id/content',
    'PUT /manager/invites/:id/content/draft',
    'POST /manager/invites/:id/content/validate',
    'POST /manager/invites/:id/content/publish',
    'GET /manager/invites/:id/content/revisions',
    'POST /manager/invites/:id/content/rollback',
    'GET /manager/template-factory/templates',
    'POST /manager/template-factory/invites',
    'POST /manager/template-factory/invites/:id/activate',
    'POST /manager/template-factory/invites/:id/rollback'
  ]);
  assert.deepEqual(manifest.publicRoutes, ['GET /api/public/invites/:slug/content']);
  const publish = routes.find(r => r.path.endsWith('/content/publish'));
  const rollback = routes.find(r => r.path.endsWith('/content/rollback'));
  const draft = routes.find(r => r.path.endsWith('/content/draft'));
  const factoryCreate = routes.find(r => r.path === '/manager/template-factory/invites');
  const factoryActivate = routes.find(r => r.path.endsWith('/template-factory/invites/:id/activate'));
  const factoryRollback = routes.find(r => r.path.endsWith('/template-factory/invites/:id/rollback'));
  const publicRoute = routes.find(r => r.path.startsWith('/api/public/'));
  assert.equal(publish.handlers[0], requireManager);
  assert.equal(publish.handlers[1], requireAdmin);
  assert.equal(rollback.handlers[0], requireManager);
  assert.equal(rollback.handlers[1], requireAdmin);
  assert.equal(draft.handlers[0], requireManager);
  assert.notEqual(draft.handlers[1], requireAdmin);
  assert.equal(factoryCreate.handlers[0], requireManager);
  assert.equal(factoryCreate.handlers[1], requireAdmin);
  assert.equal(factoryActivate.handlers[1], requireAdmin);
  assert.equal(factoryRollback.handlers[1], requireAdmin);
  assert.equal(publicRoute.handlers.length, 1);
});

test('model factory regista InviteContent, Revision e FormSubmission de forma idempotente', () => {
  const isolated = new mongoosePackage.Mongoose();
  const first = createBuilderV2Models(isolated);
  const second = createBuilderV2Models(isolated);
  assert.equal(first.InviteContent.modelName, 'InviteContent');
  assert.equal(first.InviteContentRevision.modelName, 'InviteContentRevision');
  assert.equal(first.FormSubmission.modelName, 'FormSubmission');
  assert.equal(first.InviteContent, second.InviteContent);
  assert.equal(first.InviteContentRevision, second.InviteContentRevision);
  assert.equal(first.FormSubmission, second.FormSubmission);
});

test('patcher integra server em três pontos e é idempotente', () => {
  const source = [
    "const { DEFAULT_GIFT_CATEGORY, normalizeGiftAdminKey, sanitizeGiftAdminInput, parseGiftImportText } = require('./gift-catalog-admin');",
    "const MarketingCampaign = mongoose.model('MarketingCampaign', MarketingCampaignSchema);",
    "app.use((err, req, res, next) => {",
    "  next(err);",
    "});"
  ].join('\n');
  const first = patchServerSource(source);
  assert.equal(first.changed, true);
  assert.deepEqual(inspectServerIntegration(first.content), { imports: true, models: true, routes: true });
  const second = patchServerSource(first.content);
  assert.equal(second.changed, false);
  assert.equal(second.content, first.content);
});

test('patcher recusa server parcialmente integrado', () => {
  const source = [
    "const { DEFAULT_GIFT_CATEGORY, normalizeGiftAdminKey, sanitizeGiftAdminInput, parseGiftImportText } = require('./gift-catalog-admin');",
    "const { createBuilderV2Models } = require('./builder-v2/mongo-models-v2');",
    "const { registerBuilderV2ContentRoutes } = require('./builder-v2/content-api-v2');",
    "const MarketingCampaign = mongoose.model('MarketingCampaign', MarketingCampaignSchema);",
    "app.use((err, req, res, next) => {});"
  ].join('\n');
  assert.throws(() => patchServerSource(source), /integração parcial/i);
});

test('patchPackageObject adiciona check + teste Foundation 2 ao verify sem duplicar', () => {
  const base = {
    scripts: {
      check: 'node --check server.js',
      verify: 'npm run check && npm run test:builder-v2'
    }
  };
  const first = patchPackageObject(base);
  const second = patchPackageObject(first);
  assert.match(first.scripts.check, /builder-v2\/content-api-v2\.js/);
  assert.match(first.scripts.check, /tools\/apply-builder-v2-foundation2\.js/);
  assert.equal(first.scripts['test:builder-v2-api'], 'node --test tests/builder-v2-foundation2.test.js');
  assert.match(first.scripts.verify, /npm run test:builder-v2-api/);
  assert.equal(second.scripts.check, first.scripts.check);
  assert.equal(second.scripts.verify, first.scripts.verify);
});

test('fonte da API base delega activação ao Factory e não muta Invite.config directamente', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'builder-v2', 'content-api-v2.js'), 'utf8');
  assert.equal(/config\.contentMode\s*=/i.test(source), false);
  assert.equal(/Invite\.(updateOne|findByIdAndUpdate|findOneAndUpdate)/.test(source), false);
  assert.match(source, /registerTemplateFactoryV2Routes/);
  assert.match(source, /publishedChanged:\s*false/);
  assert.match(source, /withTransaction/);
});
