'use strict';

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { createBuilderV2Models } = require('../builder-v2/mongo-models-v2');
const { validateInviteContentV2 } = require('../builder-v2/invite-content-v2');

const TARGET_SLUG = 'rosalina-monteiro';
const TARGET_PACKAGE = 'esmeralda';
const TARGET_TEMPLATE = 'esmeralda-rosalina';
const TARGET_INVITE_ID = '6a0ae58dc217acfcf34461f0';
const EXPECTED_DRAFT_REVISION = 3;
const EXPECTED_PUBLISHED_REVISION = 1;
const EXPECTED_HASH = '033ca7eeaa8fe186495de16b7a54c07daaa3ed9e9bea0bbf8239d8a13634b0e1';
const ACTIVATE_CONFIRM = 'rosalina-monteiro-activate-mongo-v2';
const ROLLBACK_CONFIRM = 'rosalina-monteiro-rollback-legacy';

const ACTIVATE = process.argv.includes('--activate');
const ROLLBACK = process.argv.includes('--rollback');
const CONFIRM_ARG = process.argv.find(arg => arg.startsWith('--confirm='));
const CONFIRM = CONFIRM_ARG ? CONFIRM_ARG.slice('--confirm='.length) : '';

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function contentHash(content) {
  return crypto.createHash('sha256').update(stableSerialize(content)).digest('hex');
}

function configStateForInvite(invite) {
  const config = invite ? invite.config : undefined;
  if (config === undefined) return { kind: 'config-missing', raw: undefined };
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return { kind: 'config-invalid', raw: undefined };
  if (!Object.prototype.hasOwnProperty.call(config, 'contentMode')) return { kind: 'field-missing', raw: undefined };
  return { kind: 'field-present', raw: config.contentMode };
}

function rawContentModeForInvite(invite) {
  return configStateForInvite(invite).raw;
}

function contentModeForInvite(invite) {
  return norm(rawContentModeForInvite(invite)) === 'mongo-v2' ? 'mongo-v2' : 'legacy';
}

function isAllowedLegacyStorage(invite) {
  const state = configStateForInvite(invite);
  if (state.kind === 'config-invalid') return false;
  const raw = state.raw;
  return raw === undefined || raw === null || String(raw).trim() === '' || norm(raw) === 'legacy';
}

function buildContentModeMatch(invite, expectedCurrent) {
  const state = configStateForInvite(invite);
  const raw = state.raw;

  if (expectedCurrent === 'legacy') {
    if (!isAllowedLegacyStorage(invite)) {
      throw new Error(`Representação legacy inesperada em config.contentMode: ${state.kind}/${String(raw)}.`);
    }
    if (state.kind === 'config-missing') return { config: { $exists: false } };
    if (state.kind === 'field-missing') return { 'config.contentMode': { $exists: false } };
    if (raw === null) return { 'config.contentMode': { $type: 10 } };
    return { 'config.contentMode': raw };
  }

  if (expectedCurrent === 'mongo-v2') {
    if (state.kind !== 'field-present' || norm(raw) !== 'mongo-v2') {
      throw new Error(`Representação mongo-v2 inesperada em config.contentMode: ${state.kind}/${String(raw)}.`);
    }
    return { 'config.contentMode': raw };
  }

  throw new Error(`Modo esperado inválido: ${expectedCurrent}.`);
}

function rawModeLabel(invite) {
  const state = configStateForInvite(invite);
  const raw = state.raw;
  if (state.kind === 'config-missing') return '(config ausente — legacy implícito)';
  if (state.kind === 'config-invalid') return '(config inválido)';
  if (state.kind === 'field-missing') return '(contentMode ausente — legacy implícito)';
  if (raw === null) return '(null — legacy implícito)';
  if (String(raw).trim() === '') return '(vazio — legacy implícito)';
  return String(raw);
}

function printCheck(label, ok, actual, expected = '') {
  const suffix = expected === '' ? String(actual) : `${actual} (esperado: ${expected})`;
  console.log(`${ok ? 'PASS' : 'BLOCK'}  ${label}: ${suffix}`);
}

function scheduleItemLabel(item, index) {
  return text(item?.id) || text(item?.type) || text(item?.title) || `schedule-${index + 1}`;
}

function inspectPublishedMaps(content) {
  const schedule = Array.isArray(content?.schedule) ? content.schedule : [];
  const required = schedule.filter(item => item && (text(item.venue) || text(item.place) || text(item.title)));
  const missing = [];
  const invalid = [];

  required.forEach((item, index) => {
    const mapUrl = text(item.mapUrl);
    const label = scheduleItemLabel(item, index);
    if (!mapUrl) {
      missing.push(label);
      return;
    }
    if (!/^https?:\/\//i.test(mapUrl)) invalid.push(label);
  });

  return {
    ok: required.length > 0 && missing.length === 0 && invalid.length === 0,
    requiredCount: required.length,
    missing,
    invalid
  };
}

function buildModels() {
  const InviteSchema = new mongoose.Schema({
    slug: String,
    packageKey: String,
    config: mongoose.Schema.Types.Mixed
  }, { strict: false, collection: 'invites' });
  const Invite = mongoose.models.Invite || mongoose.model('Invite', InviteSchema);
  const { InviteContent, InviteContentRevision } = createBuilderV2Models(mongoose);
  return { Invite, InviteContent, InviteContentRevision };
}

async function inspectState(models, session = null) {
  const { Invite, InviteContent, InviteContentRevision } = models;
  let inviteQuery = Invite.findOne({ slug: TARGET_SLUG });
  if (session) inviteQuery = inviteQuery.session(session);
  const invite = await inviteQuery;
  if (!invite) return { invite: null, content: null, revisions: [], blockers: ['INVITE_NOT_FOUND'] };

  let contentQuery = InviteContent.findOne({ inviteId: invite._id });
  let revisionsQuery = InviteContentRevision.find({ inviteId: invite._id }).sort({ createdAt: 1 });
  if (session) {
    contentQuery = contentQuery.session(session);
    revisionsQuery = revisionsQuery.session(session);
  }
  const [content, revisions] = await Promise.all([contentQuery, revisionsQuery]);
  return { invite, content, revisions, blockers: [] };
}

function identityBlockersForState(state) {
  const blockers = [...(state.blockers || [])];
  const invite = state.invite;
  if (!invite) {
    if (!blockers.includes('INVITE_NOT_FOUND')) blockers.push('INVITE_NOT_FOUND');
    return blockers;
  }
  if (String(invite._id || '') !== TARGET_INVITE_ID) blockers.push('INVITE_ID_MISMATCH');
  if (norm(invite.slug) !== TARGET_SLUG) blockers.push('SLUG_MISMATCH');
  if (norm(invite.packageKey) !== TARGET_PACKAGE) blockers.push('PACKAGE_MISMATCH');
  return blockers;
}

function classifyActivationState(state) {
  const blockers = identityBlockersForState(state);
  const invite = state.invite;
  const content = state.content;
  if (!invite) return { mode: 'blocked', blockers };

  if (contentModeForInvite(invite) === 'legacy' && !isAllowedLegacyStorage(invite)) blockers.push('CONTENT_MODE_STORAGE_UNEXPECTED');
  if (!content) {
    blockers.push('INVITE_CONTENT_MISSING');
    return { mode: 'blocked', blockers };
  }

  const draftValidation = validateInviteContentV2(content.draft || {}, { stage: 'publish' });
  const publishedValidation = validateInviteContentV2(content.published || {}, { stage: 'publish' });
  const draftHash = contentHash(draftValidation.content || {});
  const publishedHash = contentHash(publishedValidation.content || {});
  const draftRevision = Number(content.draftRevision || 0);
  const publishedRevision = Number(content.publishedRevision || 0);
  const publishHash = String(content.publishHash || '');
  const draftRecord = (state.revisions || []).find(item => item.stage === 'draft' && Number(item.revision) === EXPECTED_DRAFT_REVISION);
  const publishedRecord = (state.revisions || []).find(item => item.stage === 'published' && Number(item.revision) === EXPECTED_PUBLISHED_REVISION);
  const mode = contentModeForInvite(invite);
  const publishedMaps = inspectPublishedMaps(publishedValidation.content || {});

  if (draftRevision !== EXPECTED_DRAFT_REVISION) blockers.push('DRAFT_REVISION_MISMATCH');
  if (publishedRevision !== EXPECTED_PUBLISHED_REVISION) blockers.push('PUBLISHED_REVISION_MISMATCH');
  if (!draftValidation.valid) blockers.push('DRAFT_NOT_PUBLISHABLE');
  if (!publishedValidation.valid) blockers.push('PUBLISHED_NOT_PUBLISHABLE');
  if (draftHash !== EXPECTED_HASH) blockers.push('DRAFT_HASH_MISMATCH');
  if (publishedHash !== EXPECTED_HASH) blockers.push('PUBLISHED_HASH_MISMATCH');
  if (publishHash !== EXPECTED_HASH) blockers.push('PUBLISH_HASH_MISMATCH');
  if (!draftRecord || draftRecord.contentHash !== EXPECTED_HASH) blockers.push('DRAFT_REVISION_RECORD_MISMATCH');
  if (!publishedRecord || publishedRecord.contentHash !== EXPECTED_HASH) blockers.push('PUBLISHED_REVISION_RECORD_MISMATCH');
  if (norm(publishedValidation.content?.identity?.slug) !== TARGET_SLUG) blockers.push('PUBLISHED_SLUG_MISMATCH');
  if (norm(publishedValidation.content?.identity?.packageKey) !== TARGET_PACKAGE) blockers.push('PUBLISHED_PACKAGE_MISMATCH');
  if (String(publishedValidation.content?.identity?.templateKey || '') !== TARGET_TEMPLATE) blockers.push('PUBLISHED_TEMPLATE_MISMATCH');
  if (norm(publishedValidation.content?.runtime?.contentMode) !== 'legacy') blockers.push('PUBLISHED_RUNTIME_NOT_LEGACY');
  if (publishedMaps.requiredCount < 1) blockers.push('PUBLISHED_SCHEDULE_MISSING');
  if (publishedMaps.missing.length) blockers.push('PUBLISHED_MAP_URL_MISSING');
  if (publishedMaps.invalid.length) blockers.push('PUBLISHED_MAP_URL_INVALID');

  return {
    mode: blockers.length ? 'blocked' : (mode === 'mongo-v2' ? 'active' : 'ready'),
    blockers,
    contentMode: mode,
    rawContentMode: rawContentModeForInvite(invite),
    configState: configStateForInvite(invite).kind,
    draftRevision,
    publishedRevision,
    draftHash,
    publishedHash,
    publishHash,
    draftValidation,
    publishedValidation,
    publishedMaps,
    draftRecord,
    publishedRecord
  };
}

function classifyRollbackState(state) {
  const blockers = identityBlockersForState(state);
  const invite = state.invite;
  if (!invite) return { mode: 'blocked', blockers };

  const configState = configStateForInvite(invite);
  const contentMode = contentModeForInvite(invite);
  if (configState.kind === 'config-invalid') blockers.push('CONTENT_MODE_STORAGE_UNEXPECTED');
  if (contentMode !== 'mongo-v2') blockers.push('CONTENT_MODE_NOT_ACTIVE');

  return {
    mode: blockers.length ? 'blocked' : 'ready',
    blockers,
    contentMode,
    rawContentMode: rawContentModeForInvite(invite),
    configState: configState.kind
  };
}

function contentCheckpoint(state) {
  const content = state && state.content;
  if (!content) return null;
  return {
    draftRevision: Number(content.draftRevision || 0),
    publishedRevision: Number(content.publishedRevision || 0),
    publishHash: String(content.publishHash || ''),
    draftHash: contentHash(content.draft || {}),
    publishedHash: contentHash(content.published || {})
  };
}

async function setContentMode(models, targetMode, session) {
  const freshState = await inspectState(models, session);
  const expectedCurrent = targetMode === 'mongo-v2' ? 'legacy' : 'mongo-v2';
  const fresh = targetMode === 'mongo-v2'
    ? classifyActivationState(freshState)
    : classifyRollbackState(freshState);

  if (fresh.mode === 'blocked') throw new Error(`Estado bloqueado: ${fresh.blockers.join(', ')}`);
  if (fresh.contentMode !== expectedCurrent) {
    throw new Error(`contentMode mudou antes da operação: ${fresh.contentMode}; esperado ${expectedCurrent}.`);
  }

  const modeMatch = buildContentModeMatch(freshState.invite, expectedCurrent);
  const result = await models.Invite.updateOne(
    {
      _id: freshState.invite._id,
      slug: TARGET_SLUG,
      packageKey: TARGET_PACKAGE,
      ...modeMatch
    },
    { $set: { 'config.contentMode': targetMode } },
    { session }
  );
  if (result.matchedCount !== 1) throw new Error(`Guard de escrita falhou: Invite alvo deixou de corresponder ao estado ${expectedCurrent}.`);
  if (result.modifiedCount !== 1) throw new Error(`Guard de escrita falhou: contentMode não mudou exactamente uma vez para ${targetMode}.`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não definido.');
  if (ACTIVATE && ROLLBACK) throw new Error('Escolha apenas --activate ou --rollback.');

  const operation = ACTIVATE ? 'ACTIVATE' : (ROLLBACK ? 'ROLLBACK' : 'CHECK');
  console.log('');
  console.log('Lirandzo — Builder V2 / Rosalina Activation Guard');
  console.log(`MODO: ${operation}${operation === 'CHECK' ? ' — somente leitura' : ' — escrita controlada apenas em Invite.config.contentMode'}.`);
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  const models = buildModels();

  try {
    const state = await inspectState(models);
    const currentMode = state.invite ? contentModeForInvite(state.invite) : 'legacy';
    const activation = classifyActivationState(state);
    const rollback = classifyRollbackState(state);
    const beforeCheckpoint = contentCheckpoint(state);
    const { invite, content } = state;

    console.log('ESTADO ACTUAL');
    printCheck('Invite encontrado', Boolean(invite), invite ? String(invite._id) : 'não');
    if (invite) {
      printCheck('inviteId', String(invite._id) === TARGET_INVITE_ID, String(invite._id), TARGET_INVITE_ID);
      printCheck('slug', norm(invite.slug) === TARGET_SLUG, invite.slug, TARGET_SLUG);
      printCheck('packageKey', norm(invite.packageKey) === TARGET_PACKAGE, invite.packageKey || '(vazio)', TARGET_PACKAGE);
      console.log(`INFO  contentMode raw: ${rawModeLabel(invite)}`);
      console.log(`INFO  contentMode efectivo: ${currentMode}`);
    }
    if (content) {
      printCheck('draftRevision', Number(content.draftRevision || 0) === EXPECTED_DRAFT_REVISION, Number(content.draftRevision || 0), EXPECTED_DRAFT_REVISION);
      printCheck('publishedRevision', Number(content.publishedRevision || 0) === EXPECTED_PUBLISHED_REVISION, Number(content.publishedRevision || 0), EXPECTED_PUBLISHED_REVISION);
      printCheck('publishHash', String(content.publishHash || '') === EXPECTED_HASH, String(content.publishHash || ''), EXPECTED_HASH);
      console.log(`INFO  hash Draft: ${activation.draftHash || '(indisponível)'}`);
      console.log(`INFO  hash Published: ${activation.publishedHash || '(indisponível)'}`);
      console.log(`INFO  template Published: ${activation.publishedValidation?.content?.identity?.templateKey || '(indisponível)'}`);
      if (activation.publishedMaps) {
        console.log(`INFO  mapas Published: ${activation.publishedMaps.requiredCount} localizações; em falta=${activation.publishedMaps.missing.length}; inválidos=${activation.publishedMaps.invalid.length}`);
      }
    }

    if (!ACTIVATE && !ROLLBACK) {
      console.log('');
      if (currentMode === 'legacy') {
        if (activation.mode === 'blocked') {
          console.log('CHECK BLOQUEADO PARA ACTIVAR. Zero writes.');
          console.log(`Bloqueadores: ${activation.blockers.join(', ')}`);
          process.exitCode = 2;
          return;
        }
        console.log('CHECK APROVADO PARA ACTIVAR. Zero writes.');
        console.log(`Para activar: node tools/rosalina-builder-v2-activation-db.js --activate --confirm=${ACTIVATE_CONFIRM}`);
      } else {
        if (rollback.mode === 'blocked') {
          console.log('CHECK BLOQUEADO PARA ROLLBACK. Zero writes.');
          console.log(`Bloqueadores: ${rollback.blockers.join(', ')}`);
          process.exitCode = 2;
          return;
        }
        console.log('CHECK APROVADO: Renderer V2 está activo e rollback explícito está disponível. Zero writes.');
        console.log(`Para rollback: node tools/rosalina-builder-v2-activation-db.js --rollback --confirm=${ROLLBACK_CONFIRM}`);
      }
      return;
    }

    if (ACTIVATE) {
      if (currentMode === 'mongo-v2') {
        console.log('');
        console.log('ACTIVAÇÃO JÁ APLICADA. Zero writes.');
        return;
      }
      if (activation.mode === 'blocked') {
        console.log('');
        console.log('ACTIVAÇÃO BLOQUEADA. Nenhuma escrita foi efectuada.');
        console.log(`Bloqueadores: ${activation.blockers.join(', ')}`);
        process.exitCode = 2;
        return;
      }
      if (CONFIRM !== ACTIVATE_CONFIRM) throw new Error(`Confirmação ausente/incorreta. Use --confirm=${ACTIVATE_CONFIRM}.`);
    }

    if (ROLLBACK) {
      if (currentMode === 'legacy') {
        console.log('');
        console.log('ROLLBACK JÁ APLICADO / renderer já está legacy. Zero writes.');
        return;
      }
      if (rollback.mode === 'blocked') {
        console.log('');
        console.log('ROLLBACK BLOQUEADO PELO ALVO/ESTADO. Nenhuma escrita foi efectuada.');
        console.log(`Bloqueadores: ${rollback.blockers.join(', ')}`);
        process.exitCode = 2;
        return;
      }
      if (CONFIRM !== ROLLBACK_CONFIRM) throw new Error(`Confirmação ausente/incorreta. Use --confirm=${ROLLBACK_CONFIRM}.`);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await setContentMode(models, ACTIVATE ? 'mongo-v2' : 'legacy', session);
      });
    } finally {
      await session.endSession();
    }

    const after = await inspectState(models);
    const expectedAfter = ACTIVATE ? 'mongo-v2' : 'legacy';
    const afterMode = after.invite ? contentModeForInvite(after.invite) : 'legacy';
    if (afterMode !== expectedAfter) throw new Error(`Verificação pós-operação falhou: contentMode=${afterMode}; esperado ${expectedAfter}.`);

    const afterCheckpoint = contentCheckpoint(after);
    if (stableSerialize(afterCheckpoint) !== stableSerialize(beforeCheckpoint)) {
      throw new Error('InviteContent foi alterado indevidamente durante o switch de renderer.');
    }

    if (ACTIVATE) {
      const afterActivation = classifyActivationState(after);
      if (afterActivation.mode !== 'active') {
        throw new Error(`Verificação pós-activação bloqueada: ${afterActivation.blockers.join(', ')}`);
      }
    }

    console.log('');
    console.log(ACTIVATE ? 'ACTIVAÇÃO V2 CONCLUÍDA.' : 'ROLLBACK PARA LEGACY CONCLUÍDO.');
    console.log(`Invite: ${String(after.invite._id)}`);
    console.log(`contentMode raw: ${rawModeLabel(after.invite)}`);
    console.log(`contentMode efectivo: ${afterMode}`);
    if (after.content) {
      console.log(`draftRevision: ${Number(after.content.draftRevision || 0)}`);
      console.log(`publishedRevision: ${Number(after.content.publishedRevision || 0)}`);
      console.log(`publishHash: ${after.content.publishHash}`);
    }
    console.log('InviteContent não foi reescrito por este guard.');
    console.log('Guests, RSVP, GiftItems, Contributions, Messages, CheckIn e Capsule não foram alterados por este guard.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(async error => {
    console.error('');
    console.error('FALHOU:', error?.message || error);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
}

module.exports = {
  TARGET_SLUG,
  TARGET_PACKAGE,
  TARGET_TEMPLATE,
  TARGET_INVITE_ID,
  EXPECTED_DRAFT_REVISION,
  EXPECTED_PUBLISHED_REVISION,
  EXPECTED_HASH,
  ACTIVATE_CONFIRM,
  ROLLBACK_CONFIRM,
  stableSerialize,
  contentHash,
  configStateForInvite,
  rawContentModeForInvite,
  contentModeForInvite,
  isAllowedLegacyStorage,
  buildContentModeMatch,
  inspectPublishedMaps,
  classifyActivationState,
  classifyRollbackState,
  contentCheckpoint
};
