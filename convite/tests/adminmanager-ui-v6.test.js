'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const css = read('adminmanager-ui-v6.css');
const polish = read('adminmanager-ui-v6-polish.css');
const js = read('adminmanager-ui-v6.js');
const config = read('adminmanager.config.js');
const adminHtml = read('adminmanager.html');
const builderJs = read('adminmanager-builder-v2.js');
const giftsJs = read('adminmanager-gifts.js');
const factoryJs = read('adminmanager-template-factory-v2.js');

test('loader mantém contratos históricos e invoca Builder antes da UI V6', () => {
  assert.match(config, /adminmanager-builder-v2\.css/);
  assert.match(config, /adminmanager-ui-v6\.css/);
  assert.match(config, /adminmanager-ui-v6-polish\.css/);
  assert.match(config, /adminmanager-ui-v6\.js/);
  assert.ok(config.indexOf('adminmanager-ui-v6.css') < config.indexOf('adminmanager-ui-v6-polish.css'));

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
  assert.match(config, /document\.addEventListener\('DOMContentLoaded', loadGiftManager/);
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
      createElement: tag => ({
        tagName: String(tag).toUpperCase(),
        value: '',
        textContent: '',
        dataset: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        addEventListener: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        removeAttribute: () => {}
      }),
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

  builderSelect.children = [builderSelect.children[0]];
  mutationCallback([{ type: 'childList', addedNodes: [{ nodeType: 1 }] }]);
  assert.equal(builderSelect.value, 'b2');
  assert.deepEqual(builderSelect.children.map(option => option.value), ['', 'a1', 'b2', 'c3']);

  context.invites = [{ id: 'a1', coupleNames: 'Ana & João', slug: 'ana-joao' }];
  mutationCallback([{ type: 'childList', addedNodes: [{ nodeType: 1 }] }]);
  assert.equal(builderSelect.value, 'b2');
  assert.deepEqual(builderSelect.children.map(option => option.value), ['', 'a1', 'b2']);
  assert.equal(builderSelect.children[2].dataset.lzPreservedSelection, '1');
});

test('UI V6 agrupa mutações dinâmicas e evita refresh síncrono em cascata', () => {
  assert.match(js, /let refreshQueued = false/);
  assert.match(js, /const queueRefresh = \(\) =>/);
  assert.match(js, /if \(refreshQueued\) return/);
  assert.match(js, /if \(needsRefresh\) queueRefresh\(\)/);
});

test('toolbars dependem apenas de flex-wrap e não guardam estado visual após resize', () => {
  assert.match(css, /flex-wrap:wrap!important/);
  assert.doesNotMatch(js, /isWrapped|updateToolbars|is-wrapped/);
});

test('feedback busy respeita tanto is-loading como data-loading', () => {
  assert.match(js, /classList\?\.contains\?\.\('is-loading'\)/);
  assert.match(js, /dataset\?\.loading === 'true'/);
  assert.match(js, /getAttribute\?\.\('data-loading'\) === 'true'/);
  assert.match(js, /removeAttribute\('aria-busy'\)/);
});

test('UI V6 oferece densidade persistente compacta/confortável no desktop sem contaminar mobile', () => {
  assert.match(js, /lirandzo_admin_density/);
  assert.match(js, /comfortable/);
  assert.match(js, /compact/);
  assert.match(css, /html\[data-density="comfortable"\]/);
  assert.match(css, /--lz-control/);
  assert.match(polish, /data-density="comfortable"/);
  assert.match(polish, /--lz-control:36px/);
  assert.match(polish, /--lz-card-pad:11px/);
  assert.match(polish, /\.lz-density-toggle\{\s*display:none!important/);
});

test('UI V6 cobre desktop, tablet, mobile e acessibilidade de motion', () => {
  assert.match(css, /@media \(min-width:1024px\)/);
  assert.match(css, /@media \(max-width:1180px\)/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /pointer:coarse/);
  assert.match(polish, /\.command-tabs\{\s*top:calc\(var\(--lz-topbar\) \+ var\(--safe-top\)\)!important/);
});

test('consolidação mobile protege touch targets, Safari e modais especializados', () => {
  assert.match(polish, /\.btn\.icon-only\{\s*width:40px!important/);
  assert.match(polish, /\.nav-item\{\s*min-height:42px!important/);
  assert.match(polish, /@media \(pointer:coarse\)/);
  assert.match(polish, /@supports \(-webkit-touch-callout:none\)/);
  assert.match(polish, /font-size:16px!important/);
  assert.match(polish, /\.gift-phase3-modal\{\s*align-items:flex-end!important/);
});

test('tema claro mantém tokens secundários legíveis para texto pequeno', () => {
  assert.match(polish, /--muted:#71675f/);
  assert.match(polish, /--green:#0f7152/);
  assert.match(polish, /--orange:#925715/);
  assert.match(polish, /--red:#a23e3e/);
  assert.match(polish, /\.field label\{font-size:10px!important\}/);
  assert.match(polish, /th\{font-size:9\.5px!important\}/);
});

test('UI V6 mantém hierarquia de camadas segura e sem overlap mobile', () => {
  assert.match(polish, /\.bottom-nav\{z-index:900!important\}/);
  assert.match(polish, /\.overlay\{z-index:1200!important\}/);
  assert.match(polish, /\.sidebar\{z-index:1300!important\}/);
  assert.match(polish, /\.lz-operator\.open\{z-index:3200!important\}/);
  assert.match(polish, /\.modal\{z-index:5000!important\}/);
  assert.match(polish, /\.builder-v2-modal\{z-index:5100!important\}/);
  assert.match(polish, /\.confirm-modal\{z-index:5200!important\}/);
  assert.match(polish, /\.toast-stack\{z-index:5400!important\}/);
  assert.match(polish, /\.app-loader\{z-index:5500!important\}/);
});

test('UI V6 preserva proporções históricas dos modais em vez de os alargar genericamente', () => {
  assert.match(adminHtml, /class=\"modal-card narrow\"/);
  assert.match(polish, /\.modal-card\{\s*width:min\(760px,100%\)!important/);
  assert.match(polish, /\.modal-card\.narrow\{\s*width:min\(620px,100%\)!important/);
  assert.match(polish, /\.builder-v2-dialog\{\s*width:min\(900px,100%\)!important/);
  assert.match(polish, /\.gift-phase3-dialog\{/);
  assert.match(polish, /max-height:calc\(100dvh - 28px\)!important/);
});

test('UI V6 mantém identidade sharp sem radius excessivo', () => {
  assert.match(css, /--lz-radius-sm:6px/);
  assert.match(css, /--lz-radius-md:8px/);
  assert.doesNotMatch(css, /border-radius:\s*999px!important/);
});
