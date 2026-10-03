'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const css = read('adminmanager-ui-v6.css');
const js = read('adminmanager-ui-v6.js');
const config = read('adminmanager.config.js');

test('UI V6 é uma camada incremental carregada depois do Builder CSS', () => {
  assert.match(config, /adminmanager-builder-v2\.css/);
  assert.match(config, /adminmanager-ui-v6\.css/);
  assert.match(config, /adminmanager-ui-v6\.js/);
  assert.ok(config.indexOf('adminmanager-builder-v2.css') < config.indexOf('adminmanager-ui-v6.css'));
  assert.match(config, /loadUiV6\(\)/);
});

test('UI V6 mantém isolamento funcional e não executa rede/API', () => {
  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /XMLHttpRequest/);
  assert.doesNotMatch(js, /\/manager\//);
  assert.doesNotMatch(js, /mongo-v2|InviteContent|MONGODB_URI/);
  assert.match(js, /localStorage/);
  assert.match(js, /MutationObserver/);
});

test('UI V6 oferece densidade persistente compacta/confortável', () => {
  assert.match(js, /lirandzo_admin_density/);
  assert.match(js, /comfortable/);
  assert.match(js, /compact/);
  assert.match(css, /html\[data-density="comfortable"\]/);
  assert.match(css, /--lz-control/);
});

test('UI V6 cobre desktop, tablet, mobile e acessibilidade de motion', () => {
  assert.match(css, /@media \(min-width:1024px\)/);
  assert.match(css, /@media \(max-width:1180px\)/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /pointer:coarse/);
});

test('UI V6 contém protecções explícitas contra overlap', () => {
  assert.match(css, /flex-wrap:wrap/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /max-height:calc\(100dvh - 28px\)/);
  assert.match(css, /\.lz-operator\.open\{z-index:4400/);
  assert.match(css, /\.builder-v2-modal\{z-index:4300/);
  assert.match(css, /\.bottom-nav\{z-index:1200/);
});

test('UI V6 mantém identidade sharp sem radius excessivo', () => {
  assert.match(css, /--lz-radius-sm:6px/);
  assert.match(css, /--lz-radius-md:8px/);
  assert.doesNotMatch(css, /border-radius:\s*999px!important/);
});
