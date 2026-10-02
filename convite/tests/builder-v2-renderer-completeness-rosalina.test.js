'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bridge = require('../rosalina-monteiro/renderer-v2-live-bridge');
const renderer = require('../builder-v2/public-renderer-v2');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function publishedLikeContent() {
  return {
    schemaVersion: '2.0',
    identity: { slug: 'rosalina-monteiro', packageKey: 'esmeralda', templateKey: 'esmeralda-rosalina' },
    people: {
      coupleNames: 'Rosalina & Monteiro', displayNames: 'Rosalina e Monteiro', bride: 'Rosalina Ezequiel', groom: 'Monteiro Francisco', monogram: 'R&M',
      brideParents: 'Armindo Ezequiel e Esperança Nhassengo', groomParents: 'Vasco Monteiro e Laura Mahota'
    },
    event: {
      dateISO: '2026-08-08T09:00:00+02:00', dateLabel: '08 de agosto de 2026', rsvpDeadline: '2026-06-20',
      verse: 'É melhor serem dois do que um.', verseReference: 'Eclesiastes 4:9 e 12', invitationNote: 'Celebre connosco.'
    },
    schedule: [
      { id: 'religious', type: 'religious', title: 'Cerimónia Religiosa', time: '09:00', venue: 'Paróquia São Gabriel Arcanjo', mapUrl: '', note: '' },
      { id: 'civil', type: 'civil', title: 'Cerimónia Civil', time: '13:00', venue: 'Hotel Polana', mapUrl: '', note: '' },
      { id: 'party', type: 'additional', title: 'Copo de Água', time: '14:30', venue: 'Hotel Glória', mapUrl: '', note: '' }
    ],
    story: {
      title: 'A Tua História', text: '', letter: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
      chapters: [
        { id: 'chapter-1', title: 'O Encontro', text: 'Um.' },
        { id: 'chapter-2', title: 'A Amizade', text: 'Dois.' },
        { id: 'chapter-3', title: 'O Crescimento', text: 'Três.' },
        { id: 'chapter-4', title: 'A Promessa', text: 'Quatro.' }
      ]
    },
    gallery: { title: 'Momentos', items: [{ src: 'assets/media/a.jpg', alt: 'A' }, { src: 'assets/media/b.jpg', alt: 'B' }, { src: 'assets/media/c.jpg', alt: 'C' }] },
    dressCode: { title: 'Elegante', note: 'Tons claros.', image: 'assets/media/dress.jpg' },
    menu: {
      title: 'Menu da Celebração', note: 'Sabores do dia.',
      items: [
        { label: 'Entrada', title: 'Recepção leve', text: 'A' },
        { label: 'Prato principal', title: 'Serviço especial', text: 'B' },
        { label: 'Bebidas', title: 'Selecção', text: 'C' },
        { label: 'Sobremesa', title: 'Final doce', text: 'D' }
      ]
    },
    payments: {
      bankAccounts: [{ label: 'Millennium BIM', holder: 'Monteiro', account: '203709119', nib: '000100000020370911957', logo: 'assets/payment/bim.jpg' }],
      mobilePayments: [{ label: 'M-Pesa', holder: 'Rosalina', number: '853243064', logo: 'assets/payment/m-pesa.jpg' }]
    },
    support: { text: 'Clemente: +258 87 060 3070 | Nelson: +258 84 056 5714', contacts: ['Clemente: +258 87 060 3070', 'Nelson: +258 84 056 5714'], whatsapp: '+258870603070' },
    media: { heroImage: 'assets/media/CAPA HERO.jpg', coverImage: 'assets/media/CAPA FUNDO.jpg', storyImage: 'assets/media/TR-ET.jpg', musicUrl: 'https://example.com/music.mp3' },
    seo: { title: 'Convite de Casamento — Rosalina & Monteiro', description: 'Descrição', image: 'assets/media/PG2.jpg' },
    gifts: { mode: 'monetary', catalogMode: 'legacy', options: [] },
    access: { mode: 'nominal', rsvpIdentity: 'guest_token', maxGuestsPerRsvp: 1 },
    features: { story: true, gallery: true, dressCode: true, menu: true, rsvp: true, gifts: true, contributions: true, messages: true, checkin: true, capsule: true, guestInfo: true }
  };
}

test('renderer completeness: view model preserva os 4 capítulos da história', () => {
  const mapped = renderer.mapInviteContentV2ToLegacy(publishedLikeContent());
  const vm = bridge.buildViewModel(mapped);
  assert.equal(vm.storyChapters.length, 4);
  assert.deepEqual(vm.storyChapters.map(x => x.title), ['O Encontro', 'A Amizade', 'O Crescimento', 'A Promessa']);
  assert.equal(vm.storyLetter, 'Primeiro parágrafo.\n\nSegundo parágrafo.');
});

test('renderer completeness: menu mantém os quatro itens estruturados', () => {
  const vm = bridge.buildViewModel(renderer.mapInviteContentV2ToLegacy(publishedLikeContent()));
  assert.equal(vm.menuItems.length, 4);
  assert.equal(vm.menuItems[2].label, 'Bebidas');
  assert.equal(vm.menuItems[3].title, 'Final doce');
});

test('renderer completeness: versículo, pais e agenda chegam ao bridge', () => {
  const vm = bridge.buildViewModel(renderer.mapInviteContentV2ToLegacy(publishedLikeContent()));
  assert.equal(vm.verse, 'É melhor serem dois do que um.');
  assert.equal(vm.verseReference, 'Eclesiastes 4:9 e 12');
  assert.equal(vm.brideParents, 'Armindo Ezequiel e Esperança Nhassengo');
  assert.equal(vm.groomParents, 'Vasco Monteiro e Laura Mahota');
  assert.equal(vm.schedule.length, 3);
  assert.equal(vm.schedule[0].time, '09:00');
});

test('renderer completeness: pagamentos mantêm conta, NIB e pagamento móvel', () => {
  const vm = bridge.buildViewModel(renderer.mapInviteContentV2ToLegacy(publishedLikeContent()));
  assert.equal(vm.bankAccounts.length, 1);
  assert.equal(vm.bankAccounts[0].account, '203709119');
  assert.equal(vm.bankAccounts[0].nib, '000100000020370911957');
  assert.equal(vm.mobilePayments[0].number, '853243064');
});

test('renderer completeness: apoio, media, SEO e features permanecem estruturados', () => {
  const vm = bridge.buildViewModel(renderer.mapInviteContentV2ToLegacy(publishedLikeContent()));
  assert.match(vm.supportText, /Clemente/);
  assert.match(vm.supportText, /Nelson/);
  assert.equal(vm.heroImage, 'assets/media/CAPA HERO.jpg');
  assert.equal(vm.coverImage, 'assets/media/CAPA FUNDO.jpg');
  assert.equal(vm.storyImage, 'assets/media/TR-ET.jpg');
  assert.equal(vm.seo.title, 'Convite de Casamento — Rosalina & Monteiro');
  assert.equal(vm.sections.capsule, true);
  assert.equal(vm.sections.checkin, true);
});

test('renderer completeness: data da capa é derivada do conteúdo V2', () => {
  assert.equal(bridge.dateUpper('2026-08-08T09:00:00+02:00', '08 de agosto de 2026'), '08 AGOSTO 2026');
});

test('renderer live bridge: envelope legacy não substitui a fonte de dados', async () => {
  const root = {
    document: {},
    LIRANDZO_INVITE_SLUG: 'rosalina-monteiro',
    LIRANDZO_API_BASE_URL: 'https://api.example.com',
    LIRANDZO_EVENT_DATA: { legacy: true },
    LirandzoPublicRendererV2: {
      fetchPublicEnvelope: async () => ({ active: false, mode: 'legacy', content: null }),
      resolveEnvelope: () => ({ active: false, mode: 'legacy', content: null, revision: 0, hash: '' })
    }
  };
  const original = root.LIRANDZO_EVENT_DATA;
  const out = await bridge.boot(root);
  assert.equal(out.active, false);
  assert.equal(out.mode, 'legacy');
  assert.equal(root.LIRANDZO_EVENT_DATA, original);
});

test('renderer live bridge: envelope mongo-v2 troca apenas a fonte publicada', async () => {
  const mapped = renderer.mapInviteContentV2ToLegacy(publishedLikeContent());
  const root = {
    document: { getElementById(){ return null; }, querySelector(){ return null; } },
    LIRANDZO_INVITE_SLUG: 'rosalina-monteiro',
    LIRANDZO_API_BASE_URL: 'https://api.example.com',
    LirandzoPublicRendererV2: {
      fetchPublicEnvelope: async () => ({ active: true, mode: 'mongo-v2', revision: 1, hash: 'abc', content: publishedLikeContent() }),
      resolveEnvelope: () => ({ active: true, mode: 'mongo-v2', content: mapped, revision: 1, hash: 'abc' })
    }
  };
  const out = await bridge.boot(root);
  assert.equal(out.active, true);
  assert.equal(out.mode, 'mongo-v2');
  assert.equal(root.LIRANDZO_EVENT_DATA.coupleNames, 'Rosalina e Monteiro');
  assert.equal(root.LIRANDZO_EVENT_DATA.story.chapters.length, 4);
});

test('ligação real: client-config carrega core + bridge só nas páginas públicas da Rosalina', () => {
  const source = read('rosalina-monteiro/client-config.js');
  assert.match(source, /public-renderer-v2\.js/);
  assert.match(source, /renderer-v2-live-bridge\.js/);
  assert.match(source, /index\\\.html\|convite\\\.html/);
  assert.doesNotMatch(source, /admin\.html\|checkin\.html\|capsula\.html/);
});

test('ligação real: bridge preserva formulário de comprovativo ao actualizar pagamentos', () => {
  const source = read('rosalina-monteiro/renderer-v2-live-bridge.js');
  assert.match(source, /qa\(box, '\.payment-method-block'\)/);
  assert.match(source, /#comprovativoForm/);
  assert.doesNotMatch(source, /box\.innerHTML\s*=/);
});

test('ligação real: bridge cobre capítulos, menu, galeria, dress code, apoio e agenda', () => {
  const source = read('rosalina-monteiro/renderer-v2-live-bridge.js');
  ['applyStory','applyMenu','applyGallery','applyDress','applySupport','applySchedule','applyPayments','applyFeatureVisibility'].forEach(name => assert.match(source, new RegExp(`function ${name}\\(`)));
  assert.match(source, /storyChapters/);
  assert.match(source, /menuItems/);
  assert.match(source, /locationChooserModal/);
  assert.match(source, /footer-contact/);
});

test('template físico: cms-template agora renderiza capítulos, carta, menu.items e apoio', () => {
  const source = read('templates/rubi-rosalina/cms-template.js');
  assert.match(source, /storyChapters/);
  assert.match(source, /storyLetter/);
  assert.match(source, /menuItems/);
  assert.match(source, /renderSupport/);
  assert.match(source, /story-verse/);
});

test('template físico: modo monetary não consulta catálogo de presentes como lista visual', () => {
  const source = read('templates/rubi-rosalina/cms-template.js');
  assert.match(source, /giftsMode !== 'monetary'/);
  assert.match(source, /giftsMode !== 'none'/);
});

test('template físico: RSVP respeita maxGuestsPerRsvp e limite do convidado nominal', () => {
  const source = read('templates/rubi-rosalina/cms-template.js');
  assert.match(source, /maxGuestsPerRsvp/);
  assert.match(source, /activeGuest\.maxGuests/);
  assert.match(source, /Math\.min\(Math\.max\(1, Number\(data\.guests/);
});
