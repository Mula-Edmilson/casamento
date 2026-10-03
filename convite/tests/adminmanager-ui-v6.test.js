'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const css = read('adminmanager-ui-v6.css');
const js = read('adminmanager-ui-v6.js');
const config = read('adminmanager.config.js');
const adminHtml = read('adminmanager.html');
const builderJs = read('adminmanager-builder-v2.js');
const giftsJs = read('adminmanager-gifts.js');
const factoryJs = read('adminmanager-template-factory-v2.js');

test('UI V6 é uma camada incremental carregada depois do Builder no runtime', () => {
  assert.match(config, /adminmanager-builder-v2\.css/);
  assert.match(config, /adminmanager-ui-v6\.css/);
  assert.match(config, /adminmanager-ui-v6\.js/);

  const loadingBlock = config.slice(
    config.indexOf("if (document.readyState === 'loading')"),
    config.indexOf('} else {', config.indexOf("if (document.readyState === 'loading')"))
  );
  assert.ok(loadingBlock.indexOf('loadBuilderV2') < loadingBlock.indexOf('loadUiV6'));

  const readyBlock = config.slice(
    config.indexOf('} else {', config.indexOf("if (document.readyState === 'loading')")),
    config.lastIndexOf('})();')
  );
  assert.ok(readyBlock.indexOf('loadBuilderV2()') < readyBlock.indexOf('loadUiV6()'));
  assert.match(config, /script\.addEventListener\('load', loadBuilderExtras/);
});

test('UI V6 mantém isolamento funcional e não executa rede/API', () => {
  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /XMLHttpRequest/);
  assert.doesNotMatch(js, /\/manager\//);
  assert.doesNotMatch(js, /mongo-v2|InviteContent|MONGODB_URI/);
  assert.match(js, /localStorage/);
  assert.match(js, /MutationObserver/);
});

test('catálogo central continua responsável pelos selects históricos do AdminManager', () => {
  assert.match(adminHtml, /invites=out\.data\|\|\[\];/);
  assert.match(adminHtml, /renderInvites\(\); renderGuestSelect\(\); renderManageSelect\(\); renderCommandSelect\(\); renderBackupInviteSelect\(\);/);
  assert.match(builderJs, /const list = currentInvites\(\);/);
  assert.match(giftsJs, /const list = currentInvites\(\);/);
  assert.match(factoryJs, /currentInvites\(\)\.find/);
});

test('UI V6 sincroniza Builder e Presentes quando o catálogo chega depois da montagem dos módulos', () => {
  const makeSelect = () => ({
    value: '',
    dataset: {},
    children: [],
    replaceChildren(...nodes) { this.children = [...nodes]; },
    appendChild(node) { this.children.push(node); return node; }
  });
  const builderSelect = makeSelect();
  const giftSelect = makeSelect();
  let mutationCallback = null;

  const elements = {
    builderV2InviteSelect: builderSelect,
    giftInviteSelect: giftSelect
  };

  const sandbox = {
    invites: [],
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete',
      body: {},
      documentElement: {
        dataset: {},
        classList: { add: () => {} },
        style: { setProperty: () => {} }
      },
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: tag => ({ tagName: String(tag).toUpperCase(), value: '', textContent: '', dataset: {}, classList: { add: () => {}, remove: () => {} }, addEventListener: () => {}, setAttribute: () => {} }),
      addEventListener: () => {}
    },
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
    },
    requestAnimationFrame: callback => { callback(); return 1; },
    getComputedStyle: () => ({ display: 'block', position: 'static' }),
    innerHeight: 900,
    innerWidth: 1440,
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
    console
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  vm.runInContext(js, context);
  assert.equal(builderSelect.children.length, 1);
  assert.equal(giftSelect.children.length, 1);

  context.invites = [
    { id: 'a1', coupleNames: 'Ana & João', slug: 'ana-joao' },
    { id: 'b2', coupleNames: 'Marta & Luís', slug: 'marta-luis' }
  ];
  mutationCallback([{ type: 'childList', addedNodes: [{ nodeType: 1 }] }]);

  assert.deepEqual(builderSelect.children.map(option => option.value), ['', 'a1', 'b2']);
  assert.deepEqual(giftSelect.children.map(option => option.value), ['', 'a1', 'b2']);
  assert.equal(builderSelect.children[1].textContent, 'Ana & João · ana-joao');
  assert.equal(giftSelect.children[2].textContent, 'Marta & Luís · marta-luis');

  builderSelect.value = 'b2';
  context.invites = [
    { id: 'a1', coupleNames: 'Ana & João', slug: 'ana-joao' },
    { id: 'b2', coupleNames: 'Marta & Luís', slug: 'marta-luis' },
    { id: 'c3', coupleNames: 'Rita & Paulo', slug: 'rita-paulo' }
  ];
  mutationCallback([{ type: 'childList', addedNodes: [{ nodeType: 1 }] }]);
  assert.equal(builderSelect.value, 'b2');
  assert.deepEqual(builderSelect.children.map(option => option.value), ['', 'a1', 'b2', 'c3']);
});

test('UI V6 agrupa mutações dinâmicas e evita refresh síncrono em cascata', () => {
  assert.match(js, /let refreshQueued = false/);
  assert.match(js, /const queueRefresh = \(\) =>/);
  assert.match(js, /if \(refreshQueued\) return/);
  assert.match(js, /if \(needsRefresh\) queueRefresh\(\)/);
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
