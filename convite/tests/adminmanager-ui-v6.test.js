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

test('UI V6 é uma camada incremental carregada depois do Builder no runtime', () => {
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

  // Mesmo que outro módulo reescreva as opções sem alterar o catálogo,
  // a V6 deve reparar o select e manter a selecção válida.
  builderSelect.children = [builderSelect.children[0]];
  mutationCallback([{ type: 'childList', addedNodes: [{ nodeType: 1 }] }]);
  assert.equal(builderSelect.value, 'b2');
  assert.deepEqual(builderSelect.children.map(option => option.value), ['', 'a1', 'b2', 'c3']);

  // Se um filtro transitório omitir o convite actualmente seleccionado,
  // a opção seleccionada é preservada para não desalinhar UI e state interno.
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

test('feedback busy respeita tanto is-loading como data-loading', () => {
  assert.match(js, /classList\?\.contains\?\.\('is-loading'\)/);
  assert.match(js, /dataset\?\.loading === 'true'/);
  assert.match(js, /getAttribute\?\.\('data-loading'\) === 'true'/);
  assert.match(js, /removeAttribute\('aria-busy'\)/);
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
  assert.match(polish, /\.command-tabs\{\s*top:calc\(var\(--lz-topbar\) \+ var\(--safe-top\)\)!important/);
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

test('UI V6 preserva modais especializados em vez de os alargar genericamente', () => {
  assert.match(adminHtml, /class=\"modal-card narrow\"/);
  assert.match(polish, /\.modal-card\.narrow\{\s*width:min\(620px,100%\)!important/);
  assert.match(polish, /\.gift-phase3-dialog\{/);
  assert.match(polish, /max-height:calc\(100dvh - 28px\)!important/);
});

test('UI V6 mantém identidade sharp sem radius excessivo', () => {
  assert.match(css, /--lz-radius-sm:6px/);
  assert.match(css, /--lz-radius-md:8px/);
  assert.doesNotMatch(css, /border-radius:\s*999px!important/);
});
