'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  mapLegacyInviteToV2,
  normalizeInviteContentV2,
  validateInviteContentV2
} = require('../builder-v2/invite-content-v2');
const {
  resolveTemplate,
  validateTemplateRegistry,
  TEMPLATE_REGISTRY
} = require('../builder-v2/template-registry-v2');

test('schema V2 usa versão explícita e contentMode legacy por defeito', () => {
  const mapped = mapLegacyInviteToV2({ event: { coupleNames: 'Teste & Teste', dateISO: '2026-12-01T10:00:00+02:00' } });
  assert.equal(mapped.schemaVersion, SCHEMA_VERSION);
  assert.equal(mapped.runtime.contentMode, 'legacy');
});

test('Edna-like: convite aberto exige nome nas acções e preserva catálogo mongo', () => {
  const mapped = mapLegacyInviteToV2({
    event: {
      slug: 'edna-mauro', coupleNames: 'Edna & Mauro', guestAccessMode: 'open',
      requireNameOnActions: true, maxGuestsPerRsvp: 2, allowCompanionName: true,
      giftCatalogMode: 'mongo', giftSectionType: 'Apenas lista de presentes',
      features: { gifts: true, rsvp: true, checkin: true, timeCapsule: false }
    },
    giftOptions: [{ name: 'Air fryer', category: 'Loiça Amiga' }]
  });
  assert.equal(mapped.access.mode, 'open');
  assert.equal(mapped.access.rsvpIdentity, 'name');
  assert.equal(mapped.access.requireNameOnActions, true);
  assert.equal(mapped.access.maxGuestsPerRsvp, 2);
  assert.equal(mapped.gifts.catalogMode, 'mongo');
  assert.equal(mapped.gifts.mode, 'catalog');
  assert.equal(mapped.features.capsule, false);
});

test('Juliana-like: quantity_contributions tem precedência', () => {
  const mapped = mapLegacyInviteToV2({
    event: {
      slug: 'juliana-baptista', coupleNames: 'Juliana & Baptista', accessMode: 'public',
      publicAccess: true, publicRsvpAutoCreate: true, giftSelectionMode: 'quantity_contributions'
    },
    giftOptions: [{ name: 'Blocos', quantityStep: 10, minQuantity: 10, unit: 'bloco' }]
  });
  assert.equal(mapped.access.mode, 'open');
  assert.equal(mapped.access.autoCreateGuestOnRsvp, true);
  assert.equal(mapped.gifts.mode, 'quantity_contributions');
  assert.equal(mapped.gifts.options[0].quantityStep, 10);
  assert.equal(validateInviteContentV2(mapped).valid, true);
});

test('Celeste-like: agenda aceita mais de três momentos e repeatable é preservado', () => {
  const mapped = mapLegacyInviteToV2({
    event: {
      coupleNames: 'Aplónia & Vânder',
      program: [
        { title: 'Cerimónia Religiosa', place: 'Igreja', time: '09:00' },
        { title: 'Recepção dos Convidados', place: 'Quinta', time: '13:30' },
        { title: 'Cerimónia Civil', place: 'Quinta', time: '14:00' },
        { title: 'Copo de Água', place: 'Quinta', time: '15:00' }
      ]
    },
    giftOptions: [{ name: 'Material de construção', repeatable: true }]
  });
  assert.equal(mapped.schedule.length, 4);
  assert.equal(mapped.gifts.options[0].repeatable, true);
});

test('Rosalina-like: história legacy vira capítulos sem perder o texto', () => {
  const mapped = mapLegacyInviteToV2({
    event: { coupleNames: 'Rosalina & Monteiro' },
    story: {
      encontro: 'Primeiro capítulo', amizade: 'Segundo capítulo',
      crescimento: 'Terceiro capítulo', promessa: 'Quarto capítulo'
    }
  });
  assert.equal(mapped.story.chapters.length, 4);
  assert.equal(mapped.story.chapters[0].text, 'Primeiro capítulo');
  assert.equal(mapped.story.chapters[3].text, 'Quarto capítulo');
});

test('nominal nunca auto-cria convidados por normalização', () => {
  const normalized = normalizeInviteContentV2({
    people: { coupleNames: 'A & B' },
    access: { mode: 'nominal', autoCreateGuestOnRsvp: true, autoCreateGuestOnGift: true }
  });
  assert.equal(normalized.access.autoCreateGuestOnRsvp, false);
  assert.equal(normalized.access.autoCreateGuestOnGift, false);
  assert.equal(normalized.access.rsvpIdentity, 'guest_token');
});

test('publish exige identidade, data e agenda; draft permite incompleto', () => {
  const draft = validateInviteContentV2({ identity: { packageKey: 'perola' } }, { stage: 'draft' });
  assert.equal(draft.valid, true);
  const publish = validateInviteContentV2({ identity: { packageKey: 'perola' } }, { stage: 'publish' });
  assert.equal(publish.valid, false);
  assert.ok(publish.errors.some(x => x.includes('Nome do casal')));
  assert.ok(publish.errors.some(x => x.includes('Data do evento')));
  assert.ok(publish.errors.some(x => x.includes('agenda')));
});

test('contentMode desconhecido nunca activa mongo-v2', () => {
  const normalized = normalizeInviteContentV2({ runtime: { contentMode: 'mongo-qualquer-coisa' } });
  assert.equal(normalized.runtime.contentMode, 'legacy');
});

test('convite aberto com RSVP sem nome obrigatório gera warning', () => {
  const result = validateInviteContentV2({
    people: { coupleNames: 'A & B' },
    access: { mode: 'open', requireNameOnActions: false },
    features: { rsvp: true }
  });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.length >= 1);
});

test('registry cobre Pérola, Esmeralda e Rubi com paths confinados aos templates', () => {
  const check = validateTemplateRegistry();
  assert.equal(check.valid, true);
  for (const item of Object.values(TEMPLATE_REGISTRY)) assert.ok(item.path.startsWith('convite/templates/'));
});

test('resolver escolhe Pérola pública para acesso open', () => {
  const tpl = resolveTemplate({ packageKey: 'perola', accessMode: 'open' });
  assert.equal(tpl.key, 'perola-publico');
});

test('resolver recusa template de pacote diferente', () => {
  const tpl = resolveTemplate({ packageKey: 'rubi', templateKey: 'perola-amelia', accessMode: 'nominal' });
  assert.equal(tpl, null);
});
