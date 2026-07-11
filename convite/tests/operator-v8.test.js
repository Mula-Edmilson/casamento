const fs = require('fs');
const vm = require('vm');

let capturedRequest = null;
let source = fs.readFileSync('adminmanager-operator.js', 'utf8');
source = source.replace(
  /\}\)\(\);\s*$/,
  `window.__opDebug={canonicalMessage,detectMetricIntent,naturalAction,parseNaturalCriteria,filterLastListDirect,refersToLastList,routeLastListContext,prepareBotActionFromLastList,looksLikeBotWriteAction,state,getName,getPhone,displayTable,getCategory,hasToken,isTableMissing,peopleCount};\n})();`
);

const store = new Map();
const storage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};
storage.setItem('lirandzo_manager_token', 'test-token');

const sandbox = {
  window: { LIRANDZO_MANAGER_API_BASE: 'https://api.example.test' },
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
  localStorage: storage,
  sessionStorage: storage,
  navigator: { clipboard: { writeText: async () => {} } },
  console,
  setTimeout,
  clearTimeout,
  setInterval() { return 0; },
  clearInterval,
  MutationObserver: function MutationObserver() { this.observe = () => {}; },
  fetch: async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body || '{}') };
    return {
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          actionId: 'abc123',
          actionType: 'reset_access',
          actionLabel: 'Repor acesso em massa',
          role: 'admin',
          roleLabel: 'Administrador',
          invite: { slug: 'teste', coupleNames: 'Teste & Casal' },
          bulk: true,
          bulkCount: 3,
          bulkItems: [],
          expiresInSeconds: 300,
          warnings: []
        }
      })
    };
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'adminmanager-operator.js' });
const d = sandbox.window.__opDebug;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(d.canonicalMessage('quantos confimados?').includes('confirmados'), 'typo correction failed');
  assert(d.detectMetricIntent(d.canonicalMessage('quantos confimados?')).type === 'confirmed', 'intent confirmed failed');
  assert(d.naturalAction('mostra os pendentes') === 'list', 'list action failed');
  assert(d.refersToLastList('repor acesso destes') === true, 'last-list reference failed');
  assert(d.looksLikeBotWriteAction('eliminar estes') === true, 'contextual write detection failed');

  const guests = [
    { _id: '111111111111111111111111', name: 'Ana Maria', phone: '', table: '5', category: 'Família', status: 'Confirmado', inviteToken: 'abc', maxGuests: 2, __inviteId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    { _id: '222222222222222222222222', name: 'João Paulo', phone: '841234567', table: '', category: 'Amigos', status: 'Não aberto', inviteToken: '', maxGuests: 1, __inviteId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    { _id: '333333333333333333333333', name: 'Carlos', phone: '', table: '8', category: 'VIP', status: 'Aberto', inviteToken: 'xyz', maxGuests: 1, __inviteId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }
  ];

  let out = d.filterLastListDirect(guests, 'destes sem contacto', 'destes sem contacto');
  assert(out.length === 2, 'missing contact filter failed');

  out = d.filterLastListDirect(guests, 'destes mesa 5', 'destes mesa 5');
  assert(out.length === 1 && out[0].name === 'Ana Maria', 'table filter failed');

  out = d.filterLastListDirect(guests, 'destes excepto VIP', 'destes excepto vip');
  assert(out.length === 2, 'exclude VIP failed');

  out = d.filterLastListDirect(guests, 'ordena estes por nome', 'ordena estes por nome');
  assert(out.map(item => item.name).join('|') === 'Ana Maria|Carlos|João Paulo', 'sort failed');

  d.state.lastList = guests;
  d.state.dialog.lastListLabel = 'Teste';
  d.state.dialog.inviteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

  const html = d.routeLastListContext('quantos destes sem contacto', 'quantos destes sem contacto');
  assert(/2/.test(html) && /3/.test(html), 'context count response failed');

  await d.prepareBotActionFromLastList('repor acesso destes');
  assert(capturedRequest.url.endsWith('/manager/bot/prepare-action'), 'prepare endpoint failed');
  assert(capturedRequest.body.inviteId === 'aaaaaaaaaaaaaaaaaaaaaaaa', 'invite context was not sent');
  assert(Array.isArray(capturedRequest.body.guestIds) && capturedRequest.body.guestIds.length === 3, 'bulk guest IDs were not sent');

  capturedRequest = null;
  const blockedAdd = await d.prepareBotActionFromLastList('adicionar estes');
  assert(/bloqueada/i.test(blockedAdd), 'add-existing-list safety block failed');
  assert(capturedRequest === null, 'blocked add should not call API');

  d.state.lastList = [
    guests[0],
    { ...guests[1], __inviteId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }
  ];
  const blockedMulti = await d.prepareBotActionFromLastList('repor acesso destes');
  assert(/vários convites/i.test(blockedMulti), 'multi-invite safety block failed');

  console.log('Operator v8 tests: OK');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
