'use strict';

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { createBuilderV2Models } = require('../builder-v2/mongo-models-v2');
const { validateInviteContentV2 } = require('../builder-v2/invite-content-v2');

const TARGET_SLUG = 'rosalina-monteiro';
const TARGET_PACKAGE = 'esmeralda';
const TARGET_TEMPLATE = 'esmeralda-rosalina';
const EXPECTED_DRAFT_REVISION = 3;
const EXPECTED_CONFIRM = 'rosalina-monteiro-publish-v2';
const APPLY = process.argv.includes('--apply');
const CONFIRM_ARG = process.argv.find(arg => arg.startsWith('--confirm='));
const CONFIRM = CONFIRM_ARG ? CONFIRM_ARG.slice('--confirm='.length) : '';

function norm(value) {
  return String(value || '').trim().toLowerCase();
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

function publishedIsEmpty(content) {
  return !content?.published || Object.keys(content.published).length === 0;
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

function classifyPublishState(state) {
  const blockers = [...(state.blockers || [])];
  const invite = state.invite;
  const content = state.content;
  if (!invite) return { mode: 'blocked', blockers };

  if (norm(invite.slug) !== TARGET_SLUG) blockers.push('SLUG_MISMATCH');
  if (norm(invite.packageKey) !== TARGET_PACKAGE) blockers.push('PACKAGE_MISMATCH');
  if (contentModeForInvite(invite) !== 'legacy') blockers.push('CONTENT_MODE_NOT_LEGACY');
  if (!content) {
    blockers.push('INVITE_CONTENT_MISSING');
    return { mode: 'blocked', blockers };
  }

  const rawDraft = content.draft || {};
  const validation = validateInviteContentV2(rawDraft, { stage: 'publish' });
  const validated = validation.content || rawDraft;
  const draftHash = contentHash(validated);
  const publishedHash = contentHash(content.published || {});
  const draftRevision = Number(content.draftRevision || 0);
  const publishedRevision = Number(content.publishedRevision || 0);
  const draftRevisionRecord = (state.revisions || []).find(item => item.stage === 'draft' && Number(item.revision) === draftRevision);
  const publishedRevisionRecord = (state.revisions || []).find(item => item.stage === 'published' && Number(item.revision) === publishedRevision);

  if (publishedRevision === 1 && !publishedIsEmpty(content) && content.publishHash === draftHash && publishedHash === draftHash && publishedRevisionRecord && publishedRevisionRecord.contentHash === draftHash) {
    return {
      mode: 'already-published', blockers: [], validation, validated, draftHash, publishedHash,
      draftRevision, publishedRevision, draftRevisionRecord, publishedRevisionRecord
    };
  }

  if (draftRevision !== EXPECTED_DRAFT_REVISION) blockers.push('DRAFT_REVISION_UNEXPECTED');
  if (publishedRevision !== 0) blockers.push('PUBLISHED_REVISION_NOT_ZERO');
  if (!publishedIsEmpty(content)) blockers.push('PUBLISHED_NOT_EMPTY');
  if ((state.revisions || []).some(item => item.stage === 'published')) blockers.push('PUBLISHED_HISTORY_ALREADY_EXISTS');
  if (!draftRevisionRecord) blockers.push('CURRENT_DRAFT_REVISION_RECORD_MISSING');
  if (draftRevisionRecord && draftRevisionRecord.contentHash !== draftHash) blockers.push('CURRENT_DRAFT_HASH_MISMATCH');
  if (!validation.valid) blockers.push('PUBLISH_VALIDATION_FAILED');
  if (norm(validated?.identity?.slug) !== TARGET_SLUG) blockers.push('DRAFT_SLUG_MISMATCH');
  if (norm(validated?.identity?.packageKey) !== TARGET_PACKAGE) blockers.push('DRAFT_PACKAGE_MISMATCH');
  if (String(validated?.identity?.templateKey || '') !== TARGET_TEMPLATE) blockers.push('DRAFT_TEMPLATE_MISMATCH');
  if (norm(validated?.runtime?.contentMode) !== 'legacy') blockers.push('DRAFT_RUNTIME_NOT_LEGACY');

  return {
    mode: blockers.length ? 'blocked' : 'ready', blockers, validation, validated, draftHash, publishedHash,
    draftRevision, publishedRevision, draftRevisionRecord, publishedRevisionRecord
  };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não definido.');

  console.log('');
  console.log('Lirandzo — Builder V2 / Rosalina Publish V2');
  console.log(`MODO: ${APPLY ? 'APPLY — publica somente InviteContent V2' : 'CHECK — somente leitura'}.`);
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  const models = buildModels();

  try {
    const state = await inspectState(models);
    const classification = classifyPublishState(state);
    const { invite, content } = state;

    console.log('ESTADO ACTUAL');
    printCheck('Invite encontrado', Boolean(invite), invite ? String(invite._id) : 'não');
    if (invite) {
      printCheck('slug', norm(invite.slug) === TARGET_SLUG, invite.slug, TARGET_SLUG);
      printCheck('packageKey', norm(invite.packageKey) === TARGET_PACKAGE, invite.packageKey || '(vazio)', TARGET_PACKAGE);
      printCheck('contentMode', contentModeForInvite(invite) === 'legacy', contentModeForInvite(invite), 'legacy');
    }
    if (content) {
      printCheck('InviteContent encontrado', true, String(content._id));
      printCheck('draftRevision', Number(content.draftRevision || 0) === EXPECTED_DRAFT_REVISION, Number(content.draftRevision || 0), EXPECTED_DRAFT_REVISION);
      console.log(`INFO  publishedRevision actual: ${Number(content.publishedRevision || 0)}`);
      console.log(`INFO  published vazio: ${publishedIsEmpty(content) ? 'sim' : 'não'}`);
      console.log(`INFO  hash Draft validado: ${classification.draftHash || '(indisponível)'}`);
      console.log(`INFO  validação publish: ${classification.validation?.valid ? 'válida' : 'inválida'}`);
      if (classification.validation?.errors?.length) console.log(`INFO  erros de validação: ${JSON.stringify(classification.validation.errors)}`);
      if (classification.validation?.warnings?.length) console.log(`INFO  warnings: ${JSON.stringify(classification.validation.warnings)}`);
    }

    if (classification.mode === 'already-published') {
      console.log('');
      console.log('PUBLICAÇÃO V2 JÁ APLICADA. Zero writes.');
      console.log(`draftRevision: ${classification.draftRevision}`);
      console.log(`publishedRevision: ${classification.publishedRevision}`);
      console.log(`publishHash: ${classification.draftHash}`);
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
    console.log('PUBLICAÇÃO PREPARADA');
    console.log(`Draft revision: ${classification.draftRevision}`);
    console.log('Published revision destino: 1');
    console.log(`Template: ${classification.validated.identity.templateKey}`);
    console.log(`Hash: ${classification.draftHash}`);
    console.log('Renderer: legacy');
    console.log('Activação mongo-v2: NÃO');

    if (!APPLY) {
      console.log('');
      console.log('CHECK APROVADO. Zero writes.');
      console.log(`Para aplicar: node tools/rosalina-builder-v2-publish-db.js --apply --confirm=${EXPECTED_CONFIRM}`);
      return;
    }

    if (CONFIRM !== EXPECTED_CONFIRM) {
      throw new Error(`Confirmação ausente/incorreta. Use --confirm=${EXPECTED_CONFIRM}.`);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const freshState = await inspectState(models, session);
        const fresh = classifyPublishState(freshState);
        if (fresh.mode !== 'ready') {
          throw new Error(`Estado mudou antes da publicação: ${fresh.blockers.join(', ') || fresh.mode}`);
        }

        const now = new Date();
        const write = await models.InviteContent.updateOne(
          { _id: freshState.content._id, draftRevision: EXPECTED_DRAFT_REVISION, publishedRevision: 0 },
          {
            $set: {
              published: fresh.validated,
              publishedRevision: 1,
              publishedAt: now,
              publishedByRole: 'publish-rosalina-pilot',
              publishHash: fresh.draftHash
            }
          },
          { session }
        );
        if (write.modifiedCount !== 1) throw new Error('Guard de escrita falhou: InviteContent não foi publicado exactamente uma vez.');

        await models.InviteContentRevision.create([{
          inviteId: freshState.content.inviteId,
          slug: TARGET_SLUG,
          revision: 1,
          stage: 'published',
          schemaVersion: fresh.validated.schemaVersion || '2.0',
          content: fresh.validated,
          contentHash: fresh.draftHash,
          note: 'Primeira publicação Builder V2 — piloto Rosalina; renderer permanece legacy',
          createdByRole: 'publish-rosalina-pilot'
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    const after = await inspectState(models);
    const afterClass = classifyPublishState(after);
    if (afterClass.mode !== 'already-published') {
      throw new Error(`Verificação pós-publicação falhou: ${afterClass.blockers.join(', ') || afterClass.mode}`);
    }
    if (contentModeForInvite(after.invite) !== 'legacy') throw new Error('Verificação pós-publicação falhou: renderer deixou de estar legacy.');
    if (Number(after.content.draftRevision || 0) !== EXPECTED_DRAFT_REVISION) throw new Error('Verificação pós-publicação falhou: draftRevision foi alterada.');

    console.log('');
    console.log('PUBLISH V2 CONCLUÍDO.');
    console.log(`InviteContent: ${String(after.content._id)}`);
    console.log(`draftRevision: ${Number(after.content.draftRevision || 0)}`);
    console.log(`publishedRevision: ${Number(after.content.publishedRevision || 0)}`);
    console.log(`publishHash: ${after.content.publishHash}`);
    console.log('contentMode: legacy');
    console.log('Renderer V2 público: NÃO activado');
    console.log('Invite.config não foi alterado por este script.');
    console.log('Guests, RSVP, GiftItems, Contributions, Messages, CheckIn e Capsule não foram alterados por este script.');
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
  EXPECTED_DRAFT_REVISION,
  EXPECTED_CONFIRM,
  stableSerialize,
  contentHash,
  contentModeForInvite,
  publishedIsEmpty,
  classifyPublishState
};
