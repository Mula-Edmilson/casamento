'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ui = read('adminmanager-builder-v2.js');
const previewAssets = read('adminmanager-builder-v2-preview-assets.js');
const css = read('adminmanager-builder-v2.css');
const config = read('adminmanager.config.js');
const admin = read('adminmanager.html');
const giftsUi = read('adminmanager-gifts.js');
const pkg = JSON.parse(read('package.json'));

test('UI: cria painel Construtor sem reescrever o AdminManager', () => {
  assert.match(ui, /const PANEL_ID = 'builderV2'/);
  assert.match(ui, /ensurePanelDefinition\(\)/);
  assert.match(ui, /ensurePanel\(\)/);
  assert.doesNotMatch(ui, /document\.documentElement\.innerHTML\s*=/);
});

test('UI: integra no shell actual sem remover navegação, topbar ou painéis existentes', () => {
  for (const id of ['dashboard','invites','clients','command','backups','archived','newInvite','manage','guests','github']) {
    assert.ok(admin.includes(`id:'${id}'`) || admin.includes(`id=\"${id}Panel\"`), id);
  }
  assert.match(giftsUi, /const PANEL_ID = 'gifts'/);
  assert.match(ui, /const entry = \{ id: PANEL_ID, label: 'Construtor', icon: 'edit-3' \}/);
  assert.match(ui, /panels\.splice\(githubIndex, 0, entry\)/);
  assert.match(ui, /<section class=\"section\" id=\"\$\{PANEL_EL_ID\}\">/);
  assert.doesNotMatch(ui, /<header class=\"topbar\"|<aside class=\"sidebar\"/);
});

test('UI: usa a navegação nativa do AdminManager e actualiza o topbar pelo showPanel existente', () => {
  assert.match(admin, /document\.querySelectorAll\('\.section'\)\.forEach/);
  assert.match(admin, /\$\('topbarTitle'\)\.textContent = p \? p\.label/);
  assert.match(ui, /showPanel\(PANEL_ID\)/);
});

test('UI: usa as rotas oficiais da Foundation 2', () => {
  for (const endpoint of [
    '/content`', '/content/draft`', '/content/validate`', '/content/publish`', '/content/revisions?limit=50`', '/content/rollback`'
  ]) assert.ok(ui.includes(endpoint), endpoint);
});

test('UI: não contém endpoint de activação de mongo-v2', () => {
  assert.doesNotMatch(ui, /activate[^\n]{0,60}mongo-v2/i);
  assert.doesNotMatch(ui, /contentMode\s*[:=]\s*['\"]mongo-v2['\"]/);
  assert.doesNotMatch(ui, /\/content\/activate|\/renderer\/activate|\/mode\/activate/);
});

test('UI: publicação exige Admin e Draft guardado', () => {
  assert.match(ui, /if \(!adminIsAdmin\(\)\) return setFeedback\('Publicar exige perfil Administrador\.'/);
  assert.match(ui, /if \(state\.dirty\) return setFeedback\('Existem alterações locais por guardar/);
  assert.match(ui, /expectedDraftRevision: state\.draftRevision/);
});

test('UI: rollback é seguro e restaura apenas para Draft', () => {
  assert.match(ui, /rollbackRevision/);
  assert.match(ui, /O conteúdo público não será alterado/);
  assert.match(ui, /expectedDraftRevision: state\.draftRevision/);
});

test('UI: troca de convite protege alterações locais', () => {
  assert.match(ui, /Existem alterações locais por guardar\. Trocar de convite irá descartá-las/);
});

test('UI: preview é explicitamente editorial e não público', () => {
  assert.match(ui, /PREVIEW EDITORIAL/);
  assert.match(ui, /Preview editorial do Draft · não é o HTML público/);
});

test('UI: preview resolve media relativa dentro da pasta do convite seleccionado', () => {
  assert.match(previewAssets, /function currentInviteSlug\(\)/);
  assert.match(previewAssets, /const relative = alreadyScoped \? clean : `\$\{slug\}\/\$\{clean\}`/);
  assert.match(previewAssets, /new URL\(relative, document\.baseURI\)\.href/);
  assert.match(previewAssets, /img\.builder-v2-preview-image\[src\]/);
});

test('UI: preview preserva URLs absolutas e caminhos root-relative', () => {
  assert.match(previewAssets, /https\?:\|data:\|blob:/);
  assert.match(previewAssets, /raw\.startsWith\('\/\/'\)/);
  assert.match(previewAssets, /raw\.startsWith\('\/'\)/);
});

test('UI: editor estruturado cobre identidade, evento, agenda, acesso, features, media e SEO', () => {
  for (const pathName of [
    'people.coupleNames','event.dateISO','access.mode','media.heroImage','seo.title','gifts.mode'
  ]) assert.ok(ui.includes(`data-builder-path=\\\"${pathName}\\\"`) || ui.includes(`'${pathName}'`), pathName);
  assert.match(ui, /builderV2Schedule/);
  assert.match(ui, /builderV2FeatureToggles/);
});

test('UI: catálogo operacional de presentes continua separado', () => {
  assert.match(ui, /A lista\/reservas continua gerida no painel Presentes/);
  assert.doesNotMatch(ui, /\/gifts\/catalog\/bulk/);
});

test('UI: JSON avançado não publica directamente', () => {
  assert.match(ui, /O JSON nunca é publicado directamente/);
  assert.match(ui, /JSON aplicado ao Draft local/);
});

test('CSS: possui tratamento desktop e mobile', () => {
  assert.match(css, /\.builder-v2-two-col/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /\.builder-v2-modal/);
});

test('config: carrega Builder V2 JS e CSS de forma idempotente', () => {
  assert.match(config, /adminmanager-builder-v2\.css/);
  assert.match(config, /adminmanager-builder-v2\.js/);
  assert.match(config, /document\.querySelector\(`script\[\$\{MODULE_ATTR\}=/);
  assert.match(config, /document\.querySelector\(`link\[\$\{MODULE_ATTR\}=/);
});

test('config: carrega o resolver de media do preview depois do Builder', () => {
  assert.match(config, /adminmanager-builder-v2-preview-assets\.js/);
  assert.match(config, /loadBuilderPreviewAssets/);
  assert.match(config, /script\.addEventListener\('load', loadBuilderExtras/);
});

test('config: continua a carregar o gestor de presentes', () => {
  assert.match(config, /adminmanager-gifts\.js/);
});

test('package: verify inclui a suite Builder V2 UI', () => {
  assert.equal(pkg.scripts['test:builder-v2-ui'], 'node --test tests/builder-v2-ui.test.js');
  assert.match(pkg.scripts.verify, /npm run test:builder-v2-ui/);
  assert.match(pkg.scripts.check, /node --check adminmanager-builder-v2\.js/);
  assert.match(pkg.scripts.check, /node --check adminmanager-builder-v2-preview-assets\.js/);
});
