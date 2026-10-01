'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACTIVE_MODE,
  LEGACY_MODE,
  publicApiBase,
  buildPublicContentUrl,
  flattenPayments,
  mapInviteContentV2ToLegacy,
  fetchPublicEnvelope,
  resolveEnvelope
} = require('../builder-v2/public-renderer-v2');

function rosalinaDraft() {
  return {
    schemaVersion: '2.0',
    identity: { slug: 'rosalina-monteiro', packageKey: 'esmeralda', templateKey: 'esmeralda-rosalina' },
    people: {
      coupleNames: 'Rosalina & Monteiro', displayNames: 'Rosalina e Monteiro', bride: 'Rosalina Ezequiel', groom: 'Monteiro Francisco',
      monogram: 'R&M', brideParents: 'Armindo Ezequiel e Esperança Nhassengo', groomParents: 'Vasco Monteiro e Laura Mahota'
    },
    event: {
      dateISO: '2026-08-08T09:00:00+02:00', dateLabel: '08 de agosto de 2026', rsvpDeadline: '2026-06-20',
      verse: 'É melhor serem dois do que um.', verseReference: 'Eclesiastes 4:9 e 12', invitationNote: 'Celebre connosco.'
    },
    schedule: [
      { id: 'religious', type: 'religious', title: 'Cerimónia Religiosa', time: '09:00', venue: 'Paróquia São Gabriel Arcanjo, Cidade da Matola', mapUrl: 'https://maps.example/religious' },
      { id: 'civil', type: 'reception', title: 'Cerimónia Civil', time: '13:00', venue: 'Hotel Polana', mapUrl: 'https://maps.example/civil' },
      { id: 'party', type: 'additional', title: 'Copo de Água', time: '14:30', venue: 'Hotel Glória, Salão Ballroom', mapUrl: '' }
    ],
    story: { title: 'A Tua História', text: 'Introdução', letter: 'Carta', chapters: [{ id: '1', title: 'O Encontro', text: 'Texto' }] },
    access: { mode: 'nominal', rsvpIdentity: 'guest_token', requireNameOnActions: false, maxGuestsPerRsvp: 1, allowCompanionName: false },
    features: { story: true, gallery: true, rsvp: true, dressCode: true, gifts: true, contributions: true, messages: true, checkin: true, capsule: true, guestInfo: true, menu: true },
    gifts: { mode: 'monetary', catalogMode: 'legacy', store: '', options: [] },
    payments: {
      bankAccounts: [{ label: 'BCI', holder: 'Rosalina Ezequiel', account: '123', nib: '0001', logo: 'bci.svg' }],
      mobilePayments: [{ label: 'M-Pesa', holder: 'Monteiro Francisco', number: '841234567', logo: 'mpesa.svg' }]
    },
    support: { text: 'Apoio', contacts: ['Clemente — 84 000 0000', 'Nelson — 86 000 0000'], whatsapp: '840000000', whatsappSecondary: '860000000' },
    gallery: { title: 'Momentos', items: [{ src: 'assets/media/momentos-aliancas.jpg', alt: 'Alianças' }] },
    dressCode: { title: 'Elegante e Romântico', note: 'Tons claros.', image: 'assets/media/dress-code-paleta.jpeg' },
    menu: { title: 'Menu da Celebração', note: 'Sabores da recepção.', items: [{ label: 'Entrada', title: 'Recepção leve', text: 'Opções leves.' }] },
    media: { heroImage: 'assets/media/CAPA HERO.jpg', coverImage: 'assets/media/CAPA FUNDO.jpg', storyImage: 'assets/media/TR-ET.jpg', musicUrl: 'https://static.wixstatic.com/music.mp3' },
    seo: { title: 'Convite de Casamento — Rosalina & Monteiro', description: 'Celebração', image: 'assets/media/PG2.jpg' },
    runtime: { contentMode: 'legacy', rendererVersion: 'v1' }
  };
}

test('renderer: normaliza API base sem duplicar /api', () => {
  assert.equal(publicApiBase('https://api.example.com/api/'), 'https://api.example.com');
  assert.equal(publicApiBase('https://api.example.com/'), 'https://api.example.com');
});

test('renderer: constrói endpoint público oficial por slug', () => {
  assert.equal(
    buildPublicContentUrl('https://api.example.com/api', 'rosalina-monteiro'),
    'https://api.example.com/api/public/invites/rosalina-monteiro/content'
  );
});

test('renderer: mapeia identidade, template e media da Rosalina', () => {
  const out = mapInviteContentV2ToLegacy(rosalinaDraft());
  assert.equal(out.slug, 'rosalina-monteiro');
  assert.equal(out.packageKey, 'esmeralda');
  assert.equal(out.templateKey, 'esmeralda-rosalina');
  assert.equal(out.coupleNames, 'Rosalina e Monteiro');
  assert.equal(out.theme.heroImage, 'assets/media/CAPA HERO.jpg');
  assert.equal(out.theme.coverImage, 'assets/media/CAPA FUNDO.jpg');
  assert.equal(out.theme.musicUrl, 'https://static.wixstatic.com/music.mp3');
});

test('renderer: mapeia agenda completa e mapa sem reordenar', () => {
  const out = mapInviteContentV2ToLegacy(rosalinaDraft());
  assert.deepEqual(out.event.scheduleItems.map(item => item.time), ['09:00', '13:00', '14:30']);
  assert.equal(out.event.religiousVenue, 'Paróquia São Gabriel Arcanjo, Cidade da Matola');
  assert.equal(out.event.generalMapUrl, 'https://maps.example/religious');
});

test('renderer: preserva história, pais, galeria, dress code e menu', () => {
  const out = mapInviteContentV2ToLegacy(rosalinaDraft());
  assert.equal(out.story.title, 'A Tua História');
  assert.equal(out.story.image, 'assets/media/TR-ET.jpg');
  assert.equal(out.parents.brideParents, 'Armindo Ezequiel e Esperança Nhassengo');
  assert.equal(out.gallery.items.length, 1);
  assert.equal(out.dressCode.image, 'assets/media/dress-code-paleta.jpeg');
  assert.equal(out.menu.items[0].label, 'Entrada');
});

test('renderer: converte pagamentos estruturados sem apagar metadados', () => {
  const draft = rosalinaDraft();
  const rows = flattenPayments(draft.payments);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].method, 'BCI');
  assert.equal(rows[0].number, '123');
  assert.equal(rows[1].method, 'M-Pesa');
  assert.equal(rows[1].number, '841234567');
  const out = mapInviteContentV2ToLegacy(draft);
  assert.equal(out.paymentData.bankAccounts[0].nib, '0001');
});

test('renderer: modo nominal continua guest-list e não auto-cria convidados', () => {
  const out = mapInviteContentV2ToLegacy(rosalinaDraft());
  assert.equal(out.rsvp.mode, 'guest-list');
  assert.equal(out.rsvp.identity, 'guest_token');
  assert.equal(out.rsvp.maxGuestsPerRsvp, 1);
});

test('renderer: modo aberto converte para RSVP público', () => {
  const draft = rosalinaDraft();
  draft.access.mode = 'open';
  draft.access.rsvpIdentity = 'name';
  const out = mapInviteContentV2ToLegacy(draft);
  assert.equal(out.rsvp.mode, 'public');
  assert.equal(out.rsvp.identity, 'name');
});

test('renderer: envelope legacy nunca expõe conteúdo V2 ao template', () => {
  const out = resolveEnvelope({ active: false, mode: LEGACY_MODE, content: null });
  assert.equal(out.active, false);
  assert.equal(out.mode, LEGACY_MODE);
  assert.equal(out.content, null);
});

test('renderer: envelope mongo-v2 activo usa somente published recebido', () => {
  const out = resolveEnvelope({ active: true, mode: ACTIVE_MODE, revision: 1, hash: 'abc', content: rosalinaDraft() });
  assert.equal(out.active, true);
  assert.equal(out.mode, ACTIVE_MODE);
  assert.equal(out.revision, 1);
  assert.equal(out.hash, 'abc');
  assert.equal(out.content.templateKey, 'esmeralda-rosalina');
});

test('renderer: fetch usa endpoint público e no-store', async () => {
  let capturedUrl = '';
  let capturedOptions = null;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { active: false, mode: 'legacy', content: null } }) };
  };
  const envelope = await fetchPublicEnvelope({ apiBase: 'https://api.example.com', slug: 'rosalina-monteiro', fetchImpl });
  assert.equal(capturedUrl, 'https://api.example.com/api/public/invites/rosalina-monteiro/content');
  assert.equal(capturedOptions.cache, 'no-store');
  assert.equal(envelope.active, false);
});

test('renderer: erro público preserva status/code para fail-closed posterior', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ code: 'CONTENT_NOT_PUBLISHED', message: 'Conteúdo ainda não publicado.' })
  });
  await assert.rejects(
    () => fetchPublicEnvelope({ apiBase: 'https://api.example.com', slug: 'rosalina-monteiro', fetchImpl }),
    error => error.status === 503 && error.code === 'CONTENT_NOT_PUBLISHED'
  );
});
