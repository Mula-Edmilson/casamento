'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  GIFT_CATALOG_MODES,
  giftCatalogModeForInvite,
  usesMongoGiftCatalog,
  shouldSeedLegacyGiftCatalog,
  shouldRepairLegacyGiftReservations,
  shouldUseLegacyRepeatableGiftRules
} = require('../gift-catalog-mode');

const ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(ROOT, 'server.js');
const serverSource = fs.readFileSync(SERVER_PATH, 'utf8');

function count(text, needle) {
  return text.split(needle).length - 1;
}

// ---------------------------------------------------------------------------
// Routing policy: existing invitations must remain legacy unless explicitly
// opted into the Mongo-managed catalogue.
// ---------------------------------------------------------------------------

test('policy: convite sem configuração permanece legacy', () => {
  const invite = { slug: 'existente', config: {} };
  assert.equal(giftCatalogModeForInvite(invite), GIFT_CATALOG_MODES.LEGACY);
  assert.equal(usesMongoGiftCatalog(invite), false);
  assert.equal(shouldSeedLegacyGiftCatalog(invite), true);
  assert.equal(shouldRepairLegacyGiftReservations(invite), true);
  assert.equal(shouldUseLegacyRepeatableGiftRules(invite), true);
});

test('policy: legacy explícito mantém todo o motor histórico', () => {
  const invite = { config: { giftCatalogMode: 'legacy' } };
  assert.equal(giftCatalogModeForInvite(invite), 'legacy');
  assert.equal(shouldSeedLegacyGiftCatalog(invite), true);
  assert.equal(shouldRepairLegacyGiftReservations(invite), true);
  assert.equal(shouldUseLegacyRepeatableGiftRules(invite), true);
});

test('policy: mongo exige opt-in explícito', () => {
  const invite = { config: { giftCatalogMode: 'mongo' } };
  assert.equal(giftCatalogModeForInvite(invite), 'mongo');
  assert.equal(usesMongoGiftCatalog(invite), true);
});

test('policy: mongo desliga somente seed/repair/repeatable legacy', () => {
  const invite = { config: { giftCatalogMode: 'mongo' } };
  assert.equal(shouldSeedLegacyGiftCatalog(invite), false);
  assert.equal(shouldRepairLegacyGiftReservations(invite), false);
  assert.equal(shouldUseLegacyRepeatableGiftRules(invite), false);
});

test('policy: normaliza espaços e maiúsculas', () => {
  assert.equal(giftCatalogModeForInvite({ config: { giftCatalogMode: '  MONGO  ' } }), 'mongo');
});

test('policy: valor desconhecido nunca activa mongo', () => {
  const invite = { config: { giftCatalogMode: 'mongodb' } };
  assert.equal(giftCatalogModeForInvite(invite), 'legacy');
  assert.equal(usesMongoGiftCatalog(invite), false);
});

test('policy: quantity_contributions mantém precedência sobre mongo', () => {
  const invite = { config: { giftCatalogMode: 'mongo', giftSelectionMode: 'quantity_contributions' } };
  assert.equal(giftCatalogModeForInvite(invite), 'quantity_contributions');
  assert.equal(usesMongoGiftCatalog(invite), false);
  assert.equal(shouldSeedLegacyGiftCatalog(invite), true);
});

test('policy: resolução não modifica o documento Invite', () => {
  const invite = { slug: 'teste', config: { giftCatalogMode: 'mongo', nested: { keep: true } } };
  const before = JSON.stringify(invite);
  giftCatalogModeForInvite(invite);
  assert.equal(JSON.stringify(invite), before);
});

// ---------------------------------------------------------------------------
// Phase 2 wiring: Mongo mode becomes a real read/reserve path while remaining
// completely dormant for all existing legacy invitations.
// ---------------------------------------------------------------------------

test('phase2: server importa as três guardas de compatibilidade', () => {
  assert.equal(count(serverSource, 'shouldSeedLegacyGiftCatalog'), 2);
  assert.ok(count(serverSource, 'shouldRepairLegacyGiftReservations') >= 2);
  assert.ok(count(serverSource, 'shouldUseLegacyRepeatableGiftRules') >= 3);
});

test('phase2: seedDefaultGifts retorna antes de qualquer seed quando catálogo é mongo', () => {
  assert.match(
    serverSource,
    /async function seedDefaultGifts\(invite\) \{\s*if \(!invite \|\| !invite\._id\) return;\s*if \(!shouldSeedLegacyGiftCatalog\(invite\)\) return;/
  );
});

test('phase2: criação de convite continua a chamar seedDefaultGifts, preservando legacy', () => {
  assert.match(serverSource, /app\.post\('\/manager\/invites',[\s\S]*?await seedDefaultGifts\(invite\);/);
});

test('phase2: mongo não mistura DEFAULT_GIFTS no fast catalogue', () => {
  assert.match(
    serverSource,
    /async function giftOptionNamesFastForInvite\(invite\)[\s\S]*?const mongoNames = rows\.map[\s\S]*?if \(usesMongoGiftCatalog\(invite\)\) return Array\.from\(new Set\(mongoNames\)\);[\s\S]*?giftSeedListForInvite\(invite\)/
  );
});

test('phase2: reparação legacy é bloqueada em modo mongo', () => {
  assert.match(
    serverSource,
    /async function ensureLegacyGiftReservations\(invite, optionsArg = \{\}\)[\s\S]*?if \(!shouldRepairLegacyGiftReservations\(invite\)\) return \{ scanned: 0, migrated: 0, reserved: 0, conflicts: 0, unresolved: 0 \};/
  );
});

test('phase2: listagem pública mongo lê GiftItem apenas pelo inviteId', () => {
  assert.match(
    serverSource,
    /async function listGiftRowsForPublic\(invite\)[\s\S]*?const filter = \{ inviteId: invite\._id \};[\s\S]*?GiftItem\.find\(filter\)\.sort\(\{ name: 1 \}\)/
  );
});

test('phase2: filtro especial de Celeste só é aplicado no motor legacy', () => {
  assert.match(
    serverSource,
    /if \(shouldUseLegacyRepeatableGiftRules\(invite\) && slug === 'celeste-arsenio'\) \{\s*filter\.name = \{ \$in: giftSeedListForInvite\(invite\) \};/
  );
});

test('phase2: reserva mongo valida primeiro a existência no GiftItem do próprio convite', () => {
  assert.match(
    serverSource,
    /if \(mongoCatalog\) \{\s*const catalogItem = await findGiftItemByName\(invite, requestedGift\);\s*if \(!catalogItem\) \{\s*return res\.status\(404\)\.json\(\{ status: 'error', message: 'Presente inexistente\.' \}\);/
  );
});

test('phase2: findGiftItemByName permanece isolado por inviteId', () => {
  assert.match(
    serverSource,
    /async function findGiftItemByName\(invite, giftName\) \{\s*let item = await GiftItem\.findOne\(\{ inviteId: invite\._id, name: exactRegex\(giftName\) \}\);[\s\S]*?GiftItem\.find\(\{ inviteId: invite\._id \}\)/
  );
});

test('phase2: mongo usa o nome canónico existente no MongoDB', () => {
  assert.match(serverSource, /canonicalGift = catalogItem\.name;/);
  assert.match(serverSource, /const reservableGiftNames = mongoCatalog \? \[canonicalGift\] : giftNames;/);
});

test('phase2: regras repeatable legacy não são consultadas em mongo', () => {
  assert.match(
    serverSource,
    /const alreadyRepeatableByGuest = shouldUseLegacyRepeatableGiftRules\(invite\)[\s\S]*?\? await findRepeatableGiftSelectionByGuest\(invite, \{ reservedBy, reservedToken \}\)[\s\S]*?: null;/
  );
  assert.match(
    serverSource,
    /const repeatableGift = shouldUseLegacyRepeatableGiftRules\(invite\) && isRepeatableGiftForInvite\(invite, canonicalGift\);/
  );
});

test('phase2: reserva continua atómica e isolada por inviteId', () => {
  assert.match(
    serverSource,
    /GiftItem\.findOneAndUpdate\(\s*\{\s*inviteId: invite\._id,\s*name: exactRegex\(giftName\),\s*reserved: \{ \$ne: true \}\s*\}/
  );
});

test('phase2: um convidado continua limitado a um presente', () => {
  assert.ok(serverSource.includes("code: 'ONLY_ONE_GIFT_ALLOWED'"));
  assert.ok(serverSource.includes("code: 'GUEST_ALREADY_SELECTED_GIFT'"));
});

test('phase2: seed-defaults é recusado para catálogo mongo', () => {
  assert.match(
    serverSource,
    /app\.post\('\/manager\/invites\/:id\/gifts\/seed-defaults'[\s\S]*?if \(usesMongoGiftCatalog\(invite\)\)[\s\S]*?code: 'MONGO_GIFT_CATALOG_MANAGED'/
  );
});

// ---------------------------------------------------------------------------
// Regression locks for specialised production flows.
// ---------------------------------------------------------------------------

test('regressão: GiftItem continua único por inviteId + name', () => {
  assert.match(serverSource, /GiftItemSchema\.index\(\{ inviteId: 1, name: 1 \}, \{ unique: true \}\);/);
});

test('regressão: fluxo legacy ainda chama seedDefaultGifts antes de reservar', () => {
  assert.match(serverSource, /async function handleSaveGifts\(req, res, invite\) \{\s*await seedDefaultGifts\(invite\);/);
});

test('regressão: Juliana/quantity_contributions mantém guard especializado', () => {
  assert.match(
    serverSource,
    /async function handleSaveGiftContributions\(req, res, invite\)[\s\S]*?!canAutoCreateGuestForRsvp\(invite\)[\s\S]*?giftSelectionMode \|\| ''\) !== 'quantity_contributions'/
  );
});

test('regressão: Celeste mantém catálogo exclusivo no legacy e presente repetível', () => {
  assert.match(serverSource, /if \(slug === 'celeste-arsenio' && custom\.length\) return Array\.from\(new Set\(custom\)\);/);
  assert.match(serverSource, /'celeste-arsenio': \['Material de construção'\]/);
});

test('regressão: endpoints destrutivos/administrativos existentes continuam protegidos por requireAdmin', () => {
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/reset-reservations', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.delete('/manager/invites/:id/gifts', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/repair-legacy', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/seed-defaults', requireManager, requireAdmin"));
});

test('regressão: Phase 2 não activa mongo automaticamente em nenhum convite', () => {
  assert.equal(count(serverSource, "giftCatalogMode: 'mongo'"), 0);
  assert.equal(count(serverSource, "giftCatalogMode = 'mongo'"), 0);
});
