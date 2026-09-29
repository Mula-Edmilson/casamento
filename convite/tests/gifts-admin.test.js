'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_GIFT_CATEGORY,
  normalizeGiftAdminKey,
  sanitizeGiftAdminInput,
  parseGiftImportText
} = require('../gift-catalog-admin');

const ROOT = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(ROOT, 'adminmanager-gifts.js'), 'utf8');
const configSource = fs.readFileSync(path.join(ROOT, 'adminmanager.config.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function count(text, needle) { return text.split(needle).length - 1; }

// ---------------------------------------------------------------------------
// Pure parsing / normalisation
// ---------------------------------------------------------------------------

test('admin parser: normaliza acentos, caixa e espaços', () => {
  assert.equal(normalizeGiftAdminKey('  JÓGO   de Taças  '), 'jogo de tacas');
});

test('admin parser: sanitiza nome e usa categoria padrão', () => {
  assert.deepEqual(sanitizeGiftAdminInput({ name: '  Air   fryer  ' }), {
    name: 'Air fryer',
    category: DEFAULT_GIFT_CATEGORY
  });
});

test('admin parser: aceita aliases em português', () => {
  assert.deepEqual(sanitizeGiftAdminInput({ presente: 'Tapete', categoria: 'Sala' }), { name: 'Tapete', category: 'Sala' });
});

test('admin parser: aceita um presente por linha sem cabeçalho', () => {
  const out = parseGiftImportText('Air fryer\nJogo de taças\nTapete');
  assert.deepEqual(out.items.map(item => item.name), ['Air fryer', 'Jogo de taças', 'Tapete']);
  assert.ok(out.items.every(item => item.category === DEFAULT_GIFT_CATEGORY));
});

test('admin parser: aceita Nome;Categoria com cabeçalho', () => {
  const out = parseGiftImportText('Nome;Categoria\nAir fryer;Electrodomésticos\nTapete;Sala');
  assert.deepEqual(out.items, [
    { name: 'Air fryer', category: 'Electrodomésticos' },
    { name: 'Tapete', category: 'Sala' }
  ]);
});

test('admin parser: aceita CSV com aspas', () => {
  const out = parseGiftImportText('Name,Category\n"Jogo, premium","Sala, jantar"');
  assert.equal(out.items[0].name, 'Jogo, premium');
  assert.equal(out.items[0].category, 'Sala, jantar');
});

test('admin parser: ignora comentários e linhas vazias', () => {
  const out = parseGiftImportText('# lista\n\nAir fryer\n  \nTapete');
  assert.equal(out.items.length, 2);
});

test('admin parser: detecta duplicados por nome normalizado', () => {
  const out = parseGiftImportText('Air fryer\nAIR   FRYER\nÁir fryer');
  assert.equal(out.items.length, 1);
  assert.equal(out.duplicates.length, 2);
});

// ---------------------------------------------------------------------------
// Backend CRUD wiring and safety
// ---------------------------------------------------------------------------

test('backend: importa os módulos de catálogo sem substituir o motor histórico', () => {
  assert.equal(count(serverSource, "require('./gift-catalog-admin')"), 1);
  assert.equal(count(serverSource, "require('./gift-catalog-mode')"), 1);
});

test('backend: GET do catálogo exige sessão manager', () => {
  assert.ok(serverSource.includes("app.get('/manager/invites/:id/gifts/catalog', requireManager"));
});

test('backend: create/patch/delete/release/bulk exigem Admin', () => {
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/catalog', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.patch('/manager/invites/:id/gifts/catalog/:giftId', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.delete('/manager/invites/:id/gifts/catalog/:giftId', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/catalog/:giftId/release', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/catalog/bulk', requireManager, requireAdmin"));
});

test('backend: mutações legacy ficam bloqueadas por guard explícito', () => {
  assert.match(serverSource, /function requireMongoGiftCatalogWrite\(invite, res\)[\s\S]*?usesMongoGiftCatalog\(invite\)[\s\S]*?GIFT_CATALOG_LEGACY_LOCKED/);
  assert.ok(count(serverSource, 'if (!requireMongoGiftCatalogWrite(invite, res)) return;') >= 5);
});

test('backend: listagem continua isolada por inviteId', () => {
  assert.match(serverSource, /app\.get\('\/manager\/invites\/:id\/gifts\/catalog'[\s\S]*?const filter = \{ inviteId: invite\._id \};[\s\S]*?GiftItem\.find\(filter\)/);
});

test('backend: criação grava inviteId e slug do convite', () => {
  assert.match(serverSource, /GiftItem\.create\(\{\s*inviteId: invite\._id,\s*slug: invite\.slug,\s*name: input\.name/);
});

test('backend: duplicados são resolvidos dentro do convite', () => {
  assert.match(serverSource, /async function managerGiftDuplicate\(invite, name, excludeGiftId = ''\)[\s\S]*?findGiftItemByName\(invite, name\)/);
});

test('backend: presente reservado não pode ser renomeado nem eliminado', () => {
  assert.ok(serverSource.includes("code: 'GIFT_RESERVED_RENAME_BLOCKED'"));
  assert.ok(serverSource.includes("code: 'GIFT_RESERVED_DELETE_BLOCKED'"));
});

test('backend: IDs inválidos são rejeitados antes do MongoDB', () => {
  assert.ok(count(serverSource, "code: 'INVALID_GIFT_ID'") >= 3);
});

test('backend: libertação é limitada por _id + inviteId', () => {
  assert.match(serverSource, /GiftItem\.findOneAndUpdate\(\s*\{ _id: gift\._id, inviteId: invite\._id \}/);
  assert.match(serverSource, /reserved: false,[\s\S]*?reservedBy: '',[\s\S]*?reservedAt: null/);
});

test('backend: importação é merge e não contém deleteMany no seu bloco', () => {
  const start = serverSource.indexOf("app.post('/manager/invites/:id/gifts/catalog/bulk'");
  const end = serverSource.indexOf("app.post('/manager/invites/:id/gifts/reset-reservations'", start);
  const block = serverSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.equal(block.includes('deleteMany'), false);
  assert.ok(block.includes('findGiftItemByName(invite, item.name)'));
});

test('backend: importação limita 500 itens', () => {
  assert.ok(serverSource.includes('parsed.items.length > 500'));
  assert.ok(serverSource.includes("code: 'GIFT_IMPORT_TOO_LARGE'"));
});

test('backend: nenhum endpoint activa mongo automaticamente', () => {
  assert.equal(count(serverSource, "giftCatalogMode: 'mongo'"), 0);
  assert.equal(count(serverSource, "giftCatalogMode = 'mongo'"), 0);
});

test('regressão: endpoints legacy continuam presentes e protegidos', () => {
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/reset-reservations', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.delete('/manager/invites/:id/gifts', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/repair-legacy', requireManager, requireAdmin"));
  assert.ok(serverSource.includes("app.post('/manager/invites/:id/gifts/seed-defaults', requireManager, requireAdmin"));
});

// ---------------------------------------------------------------------------
// AdminManager extension safety
// ---------------------------------------------------------------------------

test('UI: cria painel Presentes sem reescrever o AdminManager inteiro', () => {
  assert.ok(uiSource.includes("const PANEL_EL_ID = 'giftsPanel'"));
  assert.ok(uiSource.includes('<h1>Presentes</h1>'));
  assert.ok(uiSource.includes("guestsPanel.insertAdjacentHTML('afterend', panelHtml())"));
});

test('UI: legacy e quantity_contributions são explicitamente somente leitura', () => {
  assert.ok(uiSource.includes('Catálogo legacy bloqueado'));
  assert.ok(uiSource.includes('Fluxo especializado preservado'));
  assert.ok(uiSource.includes('state.writable && state.canEdit && adminIsAdmin()'));
});

test('UI: usa apenas endpoints de catálogo para mutações', () => {
  assert.ok(uiSource.includes('/gifts/catalog'));
  assert.ok(uiSource.includes('/gifts/catalog/bulk'));
  assert.ok(uiSource.includes('/release'));
  assert.equal(uiSource.includes('seed-defaults'), false);
  assert.equal(/adminApi\(`\/manager\/invites\/\$\{encodeURIComponent\(state\.inviteId\)\}`\s*,\s*\{\s*method:\s*'PATCH'/.test(uiSource), false);
  assert.equal(/config\s*[:.]\s*.*giftCatalogMode/.test(uiSource), false);
});

test('UI: importação é descrita como merge e não apagamento', () => {
  assert.ok(uiSource.includes('A operação faz merge e não elimina presentes existentes'));
});

test('UI: inclui exportação CSV local sem endpoint destrutivo', () => {
  assert.ok(uiSource.includes('function exportCsv()'));
  assert.ok(uiSource.includes('text/csv'));
});

// ---------------------------------------------------------------------------
// Production loader: small config file loads the feature module idempotently.
// ---------------------------------------------------------------------------

test('config: mantém a API real do AdminManager', () => {
  assert.ok(configSource.includes("window.LIRANDZO_MANAGER_API_BASE = 'https://api-casamento-mj.onrender.com';"));
});

test('config: carrega adminmanager-gifts.js', () => {
  assert.ok(configSource.includes("script.src = 'adminmanager-gifts.js'"));
});

test('config: loader é idempotente e não duplica scripts', () => {
  assert.ok(configSource.includes("const MODULE_ATTR = 'data-lirandzo-module'"));
  assert.ok(configSource.includes("document.querySelector(`script[${MODULE_ATTR}=\"${MODULE_VALUE}\"]`)"));
  assert.ok(configSource.includes("script.setAttribute(MODULE_ATTR, MODULE_VALUE)"));
});

test('config: módulo só é anexado depois do DOM estar pronto', () => {
  assert.ok(configSource.includes("document.addEventListener('DOMContentLoaded', loadGiftManager, { once: true })"));
  assert.ok(configSource.includes('document.body.appendChild(script)'));
});

test('package: verify valida fonte real e as suites de gifts', () => {
  assert.ok(packageJson.scripts.check.includes('gift-catalog-mode.js'));
  assert.ok(packageJson.scripts.check.includes('gift-catalog-admin.js'));
  assert.ok(packageJson.scripts.check.includes('adminmanager-gifts.js'));
  assert.ok(packageJson.scripts.check.includes('tools/check-adminmanager-inline.js'));
  assert.ok(packageJson.scripts['test:gifts']);
  assert.ok(packageJson.scripts['test:gifts-admin']);
  assert.ok(packageJson.scripts.verify.includes('test:gifts'));
  assert.ok(packageJson.scripts.verify.includes('test:gifts-admin'));
});

test('package: check já não depende dos três snapshots antigos do AdminManager', () => {
  assert.equal(packageJson.scripts.check.includes('adminmanager-script.js'), false);
  assert.equal(packageJson.scripts.check.includes('adminmanager-inline-check.js'), false);
  assert.equal(packageJson.scripts.check.includes('adminmanager_script_check.js'), false);
});
