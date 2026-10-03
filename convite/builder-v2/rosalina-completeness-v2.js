'use strict';

const { validateInviteContentV2 } = require('./invite-content-v2');
const {
  applyRosalinaLocationMaps,
  auditRosalinaLocationMaps,
  scheduleWithoutMapUrls
} = require('./rosalina-location-maps-v2');

const TARGET_SLUG = 'rosalina-monteiro';
const TARGET_PACKAGE = 'esmeralda';
const TEMPLATE_KEY = 'esmeralda-rosalina';

const ROSALINA_PRESENTATION_SOURCE = Object.freeze({
  rsvpDeadline: '2026-06-20',
  media: {
    heroImage: 'assets/media/CAPA HERO.jpg',
    coverImage: 'assets/media/CAPA FUNDO.jpg',
    storyImage: 'assets/media/TR-ET.jpg',
    musicUrl: 'https://static.wixstatic.com/mp3/819ea0_e333d443f2f545e59d79429cdd3c1361.mp3'
  },
  seo: {
    title: 'Convite de Casamento — Rosalina & Monteiro',
    description: 'Junte-se a nós para celebrar o nosso casamento e o início de uma nova etapa das nossas vidas.',
    image: 'assets/media/PG2.jpg'
  },
  gallery: {
    title: 'Momentos',
    items: [
      { src: 'assets/media/momentos-aliancas.jpg', alt: 'Alianças sobre tecido delicado' },
      { src: 'assets/media/momentos-maos.jpg', alt: 'Mãos dadas com alianças' },
      { src: 'assets/media/momentos-champagne.jpg', alt: 'Brinde discreto de casamento' }
    ]
  },
  dressCode: {
    title: 'Inspiração: Elegante e Romântico',
    note: 'O objetivo é o conforto sofisticado. Tons claros, branco, dourado e detalhes elegantes são bem-vindos.',
    image: 'assets/media/dress-code-paleta.jpeg'
  },
  menu: {
    title: 'Menu da Celebração',
    note: 'Uma pequena antevisão dos sabores que farão parte da nossa recepção.',
    items: [
      { label: 'Entrada', title: 'Recepção leve', text: 'Recepção leve com opções cuidadosamente servidas aos convidados.' },
      { label: 'Prato principal', title: 'Serviço especial', text: 'Serviço especial preparado para o momento de almoço e celebração.' },
      { label: 'Bebidas', title: 'Selecção de bebidas', text: 'Selecção de bebidas para acompanhar a recepção.' },
      { label: 'Sobremesa', title: 'Final doce', text: 'Final doce para brindar a união dos noivos.' }
    ]
  }
});

// Divergências já existentes entre o seed/event-data e o HTML legacy.
// A Completeness Pass NÃO tenta reconciliá-las silenciosamente: identidade,
// agenda, pagamentos e apoio continuam a vir da fonte estruturada auditada.
const ROSALINA_KNOWN_LEGACY_CONFLICTS = Object.freeze([
  {
    key: 'schedule.ceremony',
    structured: '09:00 · Paróquia São Gabriel Arcanjo, Cidade da Matola',
    legacyHtml: '09:30 · Paróquia de Santo António da Polana',
    precedence: 'structured'
  },
  {
    key: 'support.contacts',
    structured: 'Clemente + Nelson',
    legacyHtml: 'Edilson + Clemente',
    precedence: 'structured'
  }
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertBaseDraft(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('Draft base é obrigatório.');
  if (draft.identity?.slug !== TARGET_SLUG) throw new Error('Draft base não corresponde a rosalina-monteiro.');
  if (draft.identity?.packageKey !== TARGET_PACKAGE) throw new Error('Draft base não corresponde ao pacote Esmeralda.');
  if (draft.runtime?.contentMode !== 'legacy') throw new Error('Completeness Pass só pode partir de renderer legacy.');
}

function buildRosalinaCompletenessDraft(baseDraft) {
  assertBaseDraft(baseDraft);
  let out = clone(baseDraft);

  out.identity = { ...(out.identity || {}), templateKey: TEMPLATE_KEY };
  out.event = { ...(out.event || {}), rsvpDeadline: ROSALINA_PRESENTATION_SOURCE.rsvpDeadline };
  out.media = clone(ROSALINA_PRESENTATION_SOURCE.media);
  out.seo = clone(ROSALINA_PRESENTATION_SOURCE.seo);
  out.gallery = clone(ROSALINA_PRESENTATION_SOURCE.gallery);
  out.dressCode = clone(ROSALINA_PRESENTATION_SOURCE.dressCode);
  out.menu = clone(ROSALINA_PRESENTATION_SOURCE.menu);

  // Localizações são a única evolução operacional autorizada nesta pass.
  out = applyRosalinaLocationMaps(out);

  // Guard final: a Completeness Pass nunca activa V2.
  out.runtime = { ...(out.runtime || {}), contentMode: 'legacy', rendererVersion: 'v1' };
  return out;
}

function auditRosalinaCompleteness({ baseDraft, draft } = {}) {
  assertBaseDraft(baseDraft);
  assertBaseDraft(draft);
  const checks = [];
  const check = (key, ok, expected, actual) => checks.push({ key, ok: Boolean(ok), expected, actual });

  check('identity.templateKey', draft.identity.templateKey === TEMPLATE_KEY, TEMPLATE_KEY, draft.identity.templateKey);
  check('event.rsvpDeadline', draft.event.rsvpDeadline === '2026-06-20', '2026-06-20', draft.event.rsvpDeadline);
  check('media.heroImage', draft.media?.heroImage === ROSALINA_PRESENTATION_SOURCE.media.heroImage, ROSALINA_PRESENTATION_SOURCE.media.heroImage, draft.media?.heroImage);
  check('media.musicUrl', draft.media?.musicUrl === ROSALINA_PRESENTATION_SOURCE.media.musicUrl, ROSALINA_PRESENTATION_SOURCE.media.musicUrl, draft.media?.musicUrl);
  check('seo.title', draft.seo?.title === ROSALINA_PRESENTATION_SOURCE.seo.title, ROSALINA_PRESENTATION_SOURCE.seo.title, draft.seo?.title);
  check('gallery.items', Array.isArray(draft.gallery?.items) && draft.gallery.items.length === 3, 3, draft.gallery?.items?.length);
  check('dressCode.image', draft.dressCode?.image === ROSALINA_PRESENTATION_SOURCE.dressCode.image, ROSALINA_PRESENTATION_SOURCE.dressCode.image, draft.dressCode?.image);
  check('menu.items', Array.isArray(draft.menu?.items) && draft.menu.items.length === 4, 4, draft.menu?.items?.length);

  const mapAudit = auditRosalinaLocationMaps(draft);
  mapAudit.checks.forEach(item => {
    check(`schedule.mapUrl.${item.id}`, item.ok, item.expected, item.actual);
  });

  // A estrutura/semântica da agenda permanece idêntica; somente mapUrl pode evoluir.
  check(
    'preserve.schedule-structure',
    JSON.stringify(scheduleWithoutMapUrls(draft.schedule)) === JSON.stringify(scheduleWithoutMapUrls(baseDraft.schedule)),
    'preservado excepto mapUrl',
    JSON.stringify(scheduleWithoutMapUrls(draft.schedule)) === JSON.stringify(scheduleWithoutMapUrls(baseDraft.schedule)) ? 'preservado' : 'alterado'
  );

  // Restante conteúdo operacional/estruturado deve permanecer byte-equivalent ao Draft base.
  ['people', 'story', 'access', 'gifts', 'payments', 'support', 'features'].forEach(key => {
    check(`preserve.${key}`, JSON.stringify(draft[key]) === JSON.stringify(baseDraft[key]), 'preservado', JSON.stringify(draft[key]) === JSON.stringify(baseDraft[key]) ? 'preservado' : 'alterado');
  });
  check('runtime.contentMode', draft.runtime?.contentMode === 'legacy', 'legacy', draft.runtime?.contentMode);

  const validation = validateInviteContentV2(draft, { stage: 'publish' });
  const failed = checks.filter(item => !item.ok);
  return {
    valid: failed.length === 0 && validation.valid,
    checks,
    failed,
    conflicts: clone(ROSALINA_KNOWN_LEGACY_CONFLICTS),
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings
    },
    summary: {
      templateKey: draft.identity.templateKey,
      galleryItems: draft.gallery.items.length,
      menuItems: draft.menu.items.length,
      bankAccounts: draft.payments.bankAccounts.length,
      mobilePayments: draft.payments.mobilePayments.length,
      supportContacts: draft.support.contacts.length,
      mappedLocations: mapAudit.mapped,
      contentMode: draft.runtime.contentMode
    }
  };
}

module.exports = {
  TARGET_SLUG,
  TARGET_PACKAGE,
  TEMPLATE_KEY,
  ROSALINA_PRESENTATION_SOURCE,
  ROSALINA_KNOWN_LEGACY_CONFLICTS,
  buildRosalinaCompletenessDraft,
  auditRosalinaCompleteness
};
