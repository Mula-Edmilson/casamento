'use strict';

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { createBuilderV2Models } = require('../builder-v2/mongo-models-v2');
const { validateInviteContentV2 } = require('../builder-v2/invite-content-v2');
const {
  applyRosalinaLocationMaps,
  auditRosalinaLocationMaps,
  mapsAreBlank
} = require('../builder-v2/rosalina-location-maps-v2');

const TARGET_SLUG = 'rosalina-monteiro';
const TARGET_PACKAGE = 'esmeralda';
const TARGET_TEMPLATE = 'esmeralda-rosalina';
const TARGET_INVITE_ID = '6a0ae58dc217acfcf34461f0';
const EXPECTED_BASE_DRAFT_REVISION = 3;
const EXPECTED_BASE_PUBLISHED_REVISION = 1;
const EXPECTED_BASE_HASH = '033ca7eeaa8fe186495de16b7a54c07daaa3ed9e9bea0bbf8239d8a13634b0e1';
const NEXT_DRAFT_REVISION = 4;
const NEXT_PUBLISHED_REVISION = 2;
const EXPECTED_CONFIRM = 'rosalina-monteiro-publish-location-maps';

const APPLY = process.argv.includes('--apply');
const CONFIRM_ARG = process.argv.find(arg => arg.startsWith('--confirm='));
const CONFIRM = CONFIRM_ARG ? CONFIRM_ARG.slice('--confirm='.length) : '';

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function contentModeForInvite(invite) {
  return norm(invite?.config?.contentMode) === 'mongo-v2' ? 'mongo-v2' : 'legacy';
}

function printCheck(label, ok, actual, expected = '') {
  const suffix = expected === '' ? String(actual) : `${actual} (esperado: ${expected})`;
  console.log(`${ok ? 'PASS' : 'BLOCK'}  ${label}: ${suffix}`);
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

function classifyMapPublishState(state) {
  const blockers = [...(state.blockers || [])];
  const invite = state.invite;
  const content = state.content;
  if (!invite) return { mode: 'blocked', blockers };

  if (String(invite._id || '') !== TARGET_INVITE_ID) blockers.push('INVITE_ID_MISMATCH');
  if (norm(invite.slug) !== TARGET_SLUG) blockers.push('SLUG_MISMATCH');
  if (norm(invite.packageKey) !== TARGET_PACKAGE) blockers.push('PACKAGE_MISMATCH');
  if (contentModeForInvite(invite) !== 'legacy') blockers.push('CONTENT_MODE_NOT_LEGACY');
  if (!content) {
    blockers.push('INVITE_CONTENT_MISSING');
    return { mode: 'blocked', blockers };
  }

  const draftValidation = validateInviteContentV2(content.draft || {}, { stage: 'publish' });
  const publishedValidation = validateInviteContentV2(content.published || {}, { stage: 'publish' });
  const draft = draftValidation.content || content.draft || {};
  const published = publishedValidation.content || content.published || {};
  const draftRevision = Number(content.draftRevision || 0);
  const publishedRevision = Number(content.publishedRevision || 0);
  const publishHash = String(content.publishHash || '');
  const draftHash = contentHash(draft);
  const publishedHash = contentHash(published);
  const baseDraftRecord = (state.revisions || []).find(item => item.stage === 'draft' && Number(item.revision) === EXPECTED_BASE_DRAFT_REVISION);
  const basePublishedRecord = (state.revisions || []).find(item => item.stage === 'published' && Number(item.revision) === EXPECTED_BASE_PUBLISHED_REVISION);

  // Idempotência: reconhece a migração já aplicada sem escrever novamente.
  if (draftRevision === NEXT_DRAFT_REVISION && publishedRevision === NEXT_PUBLISHED_REVISION) {
    const draftMaps = auditRosalinaLocationMaps(draft);
    const publishedMaps = auditRosalinaLocationMaps(published);
    const draftRecord = (state.revisions || []).find(item => item.stage === 'draft' && Number(item.revision) === NEXT_DRAFT_REVISION);
    const publishedRecord = (state.revisions || []).find(item => item.stage === 'published' && Number(item.revision) === NEXT_PUBLISHED_REVISION);
    const alreadyValid =
      draftValidation.valid && publishedValidation.valid &&
      draftMaps.valid && publishedMaps.valid &&
      draftHash === publishedHash && publishHash === publishedHash &&
      draftRecord?.contentHash === publishHash &&
      publishedRecord?.contentHash === publishHash &&
      norm(draft?.identity?.slug) === TARGET_SLUG &&
      norm(published?.identity?.slug) === TARGET_SLUG &&
      String(published?.identity?.templateKey || '') === TARGET_TEMPLATE &&
      norm(published?.runtime?.contentMode) === 'legacy';

    if (alreadyValid) {
      return {
        mode: 'already-applied', blockers: [], draftValidation, publishedValidation,
        draft, published, draftRevision, publishedRevision, draftHash, publishedHash,
        candidateHash: publishHash, draftMaps, publishedMaps
      };
    }
  }

  if (draftRevision !== EXPECTED_BASE_DRAFT_REVISION) blockers.push('DRAFT_REVISION_UNEXPECTED');
  if (publishedRevision !== EXPECTED_BASE_PUBLISHED_REVISION) blockers.push('PUBLISHED_REVISION_UNEXPECTED');
  if (!draftValidation.valid) blockers.push('DRAFT_NOT_PUBLISHABLE');
  if (!publishedValidation.valid) blockers.push('PUBLISHED_NOT_PUBLISHABLE');
  if (draftHash !== EXPECTED_BASE_HASH) blockers.push('DRAFT_BASE_HASH_MISMATCH');
  if (publishedHash !== EXPECTED_BASE_HASH) blockers.push('PUBLISHED_BASE_HASH_MISMATCH');
  if (publishHash !== EXPECTED_BASE_HASH) blockers.push('PUBLISH_BASE_HASH_MISMATCH');
  if (!baseDraftRecord || String(baseDraftRecord.contentHash || '') !== EXPECTED_BASE_HASH) blockers.push('BASE_DRAFT_REVISION_RECORD_MISMATCH');
  if (!basePublishedRecord || String(basePublishedRecord.contentHash || '') !== EXPECTED_BASE_HASH) blockers.push('BASE_PUBLISHED_REVISION_RECORD_MISMATCH');
  if (norm(draft?.identity?.slug) !== TARGET_SLUG) blockers.push('DRAFT_SLUG_MISMATCH');
  if (norm(published?.identity?.slug) !== TARGET_SLUG) blockers.push('PUBLISHED_SLUG_MISMATCH');
  if (norm(published?.identity?.packageKey) !== TARGET_PACKAGE) blockers.push('PUBLISHED_PACKAGE_MISMATCH');
  if (String(published?.identity?.templateKey || '') !== TARGET_TEMPLATE) blockers.push('PUBLISHED_TEMPLATE_MISMATCH');
  if (norm(draft?.runtime?.contentMode) !== 'legacy' || norm(published?.runtime?.contentMode) !== 'legacy') blockers.push('RUNTIME_NOT_LEGACY');
  if (!mapsAreBlank(draft)) blockers.push('DRAFT_MAPS_NOT_BLANK');
  if (!mapsAreBlank(published)) blockers.push('PUBLISHED_MAPS_NOT_BLANK');

  let candidateDraft = null;
  let candidatePublished = null;
  let candidateDraftValidation = null;
  let candidatePublishedValidation = null;
  let candidateHash = '';
  let candidateMaps = null;

  if (!blockers.length) {
    try {
      candidateDraft = applyRosalinaLocationMaps(draft);
      candidatePublished = applyRosalinaLocationMaps(published);
      candidateDraftValidation = validateInviteContentV2(candidateDraft, { stage: 'publish' });
      candidatePublishedValidation = validateInviteContentV2(candidatePublished, { stage: 'publish' });
      if (!candidateDraftValidation.valid) blockers.push('CANDIDATE_DRAFT_INVALID');
      if (!candidatePublishedValidation.valid) blockers.push('CANDIDATE_PUBLISHED_INVALID');

      candidateDraft = candidateDraftValidation.content || candidateDraft;
      candidatePublished = candidatePublishedValidation.content || candidatePublished;
      const candidateDraftHash = contentHash(candidateDraft);
      const candidatePublishedHash = contentHash(candidatePublished);
      if (candidateDraftHash !== candidatePublishedHash) blockers.push('CANDIDATE_HASH_MISMATCH');
      candidateHash = candidatePublishedHash;
      candidateMaps = auditRosalinaLocationMaps(candidatePublished);
      if (!candidateMaps.valid) blockers.push('CANDIDATE_MAP_AUDIT_FAILED');
    } catch (error) {
      blockers.push(`CANDIDATE_BUILD_FAILED:${error.message}`);
    }
  }

  return {
    mode: blockers.length ? 'blocked' : 'ready',
    blockers,
    draftValidation,
    publishedValidation,
    draft,
    published,
    draftRevision,
    publishedRevision,
    draftHash,
    publishedHash,
    candidateDraft,
    candidatePublished,
    candidateDraftValidation,
    candidatePublishedValidation,
    candidateHash,
    candidateMaps
  };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não definido.');

  console.log('');
  console.log('Lirandzo — Builder V2 / Rosalina Location Maps Publish');
  console.log(`MODO: ${APPLY ? 'APPLY — Draft + Published V2; renderer permanece legacy' : 'CHECK — somente leitura'}.`);
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  const models = buildModels();

  try {
    const state = await inspectState(models);
    const classification = classifyMapPublishState(state);
    const { invite, content } = state;

    console.log('ESTADO ACTUAL');
    printCheck('Invite encontrado', Boolean(invite), invite ? String(invite._id) : 'não');
    if (invite) {
      printCheck('inviteId', String(invite._id) === TARGET_INVITE_ID, String(invite._id), TARGET_INVITE_ID);
      printCheck('slug', norm(invite.slug) === TARGET_SLUG, invite.slug, TARGET_SLUG);
      printCheck('packageKey', norm(invite.packageKey) === TARGET_PACKAGE, invite.packageKey || '(vazio)', TARGET_PACKAGE);
      printCheck('contentMode', contentModeForInvite(invite) === 'legacy', contentModeForInvite(invite), 'legacy');
    }
    if (content) {
      console.log(`INFO  draftRevision: ${Number(content.draftRevision || 0)}`);
      console.log(`INFO  publishedRevision: ${Number(content.publishedRevision || 0)}`);
      console.log(`INFO  publishHash: ${String(content.publishHash || '')}`);
    }

    if (classification.mode === 'already-applied') {
      console.log('');
      console.log('MAPAS V2 JÁ PUBLICADOS. Zero writes.');
      console.log(`draftRevision: ${classification.draftRevision}`);
      console.log(`publishedRevision: ${classification.publishedRevision}`);
      console.log(`publishHash: ${classification.candidateHash}`);
      console.log('contentMode: legacy');
      return;
    }

    if (classification.blockers.length) {
      console.log('');
      console.log('CHECK BLOQUEADO. Nenhuma escrita foi efectuada.');
      console.log(`Bloqueadores: ${classification.blockers.join(', ')}`);
      process.exitCode = 2;
      return;
    }

    console.log('');
    console.log('PUBLICAÇÃO DE MAPAS PREPARADA');
    console.log(`Draft: ${EXPECTED_BASE_DRAFT_REVISION} → ${NEXT_DRAFT_REVISION}`);
    console.log(`Published: ${EXPECTED_BASE_PUBLISHED_REVISION} → ${NEXT_PUBLISHED_REVISION}`);
    console.log(`Base hash: ${EXPECTED_BASE_HASH}`);
    console.log(`Novo hash: ${classification.candidateHash}`);
    console.log(`Mapas validados: ${classification.candidateMaps?.mapped || 0}/${classification.candidateMaps?.required || 0}`);
    console.log('Renderer: legacy');
    console.log('Activação mongo-v2: NÃO');

    if (!APPLY) {
      console.log('');
      console.log('CHECK APROVADO. Zero writes.');
      console.log(`Para aplicar: node tools/rosalina-builder-v2-location-maps-db.js --apply --confirm=${EXPECTED_CONFIRM}`);
      return;
    }

    if (CONFIRM !== EXPECTED_CONFIRM) {
      throw new Error(`Confirmação ausente/incorreta. Use --confirm=${EXPECTED_CONFIRM}.`);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const freshState = await inspectState(models, session);
        const fresh = classifyMapPublishState(freshState);
        if (fresh.mode !== 'ready') {
          throw new Error(`Estado mudou antes da publicação: ${fresh.blockers.join(', ') || fresh.mode}`);
        }

        const now = new Date();
        const write = await models.InviteContent.updateOne(
          {
            _id: freshState.content._id,
            draftRevision: EXPECTED_BASE_DRAFT_REVISION,
            publishedRevision: EXPECTED_BASE_PUBLISHED_REVISION,
            publishHash: EXPECTED_BASE_HASH
          },
          {
            $set: {
              draft: fresh.candidateDraft,
              published: fresh.candidatePublished,
              draftRevision: NEXT_DRAFT_REVISION,
              publishedRevision: NEXT_PUBLISHED_REVISION,
              lastEditedByRole: 'rosalina-location-maps',
              publishedByRole: 'rosalina-location-maps',
              publishedAt: now,
              publishHash: fresh.candidateHash
            }
          },
          { session }
        );
        if (write.matchedCount !== 1 || write.modifiedCount !== 1) {
          throw new Error('Guard de escrita falhou: InviteContent deixou de corresponder ao checkpoint base.');
        }

        await models.InviteContentRevision.create([
          {
            inviteId: freshState.content.inviteId,
            slug: TARGET_SLUG,
            revision: NEXT_DRAFT_REVISION,
            stage: 'draft',
            schemaVersion: fresh.candidateDraft.schemaVersion || '2.0',
            content: clone(fresh.candidateDraft),
            contentHash: fresh.candidateHash,
            note: 'Mapas autoritativos adicionados à agenda Rosalina; renderer permanece legacy.',
            createdByRole: 'rosalina-location-maps'
          },
          {
            inviteId: freshState.content.inviteId,
            slug: TARGET_SLUG,
            revision: NEXT_PUBLISHED_REVISION,
            stage: 'published',
            schemaVersion: fresh.candidatePublished.schemaVersion || '2.0',
            content: clone(fresh.candidatePublished),
            contentHash: fresh.candidateHash,
            note: 'Published V2 actualizado somente com mapUrl autoritativos; renderer permanece legacy.',
            createdByRole: 'rosalina-location-maps'
          }
        ], { session });
      });
    } finally {
      await session.endSession();
    }

    const after = await inspectState(models);
    const afterClass = classifyMapPublishState(after);
    if (afterClass.mode !== 'already-applied') {
      throw new Error(`Verificação pós-publicação falhou: ${afterClass.blockers.join(', ') || afterClass.mode}`);
    }
    if (contentModeForInvite(after.invite) !== 'legacy') throw new Error('Renderer deixou de estar legacy.');

    console.log('');
    console.log('MAPAS V2 PUBLICADOS COM SUCESSO.');
    console.log(`draftRevision: ${Number(after.content.draftRevision || 0)}`);
    console.log(`publishedRevision: ${Number(after.content.publishedRevision || 0)}`);
    console.log(`publishHash: ${after.content.publishHash}`);
    console.log('contentMode: legacy');
    console.log('Invite.config não foi alterado.');
    console.log('Guests, RSVP, GiftItems, Contributions, Messages, CheckIn e Capsule não foram alterados.');
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
  EXPECTED_BASE_DRAFT_REVISION,
  EXPECTED_BASE_PUBLISHED_REVISION,
  EXPECTED_BASE_HASH,
  NEXT_DRAFT_REVISION,
  NEXT_PUBLISHED_REVISION,
  EXPECTED_CONFIRM,
  stableSerialize,
  contentHash,
  contentModeForInvite,
  classifyMapPublishState
};
