'use strict';

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { createBuilderV2Models } = require('../builder-v2/mongo-models-v2');
const {
  TARGET_SLUG,
  TARGET_PACKAGE,
  ROSALINA_KNOWN_LEGACY_CONFLICTS,
  buildRosalinaCompletenessDraft,
  auditRosalinaCompleteness
} = require('../builder-v2/rosalina-completeness-v2');

const APPLY = process.argv.includes('--apply');
const CONFIRM_ARG = process.argv.find(arg => arg.startsWith('--confirm='));
const CONFIRM = CONFIRM_ARG ? CONFIRM_ARG.slice('--confirm='.length) : '';
const EXPECTED_CONFIRM = 'rosalina-monteiro-completeness';
const EXPECTED_BASE_HASH = 'b2476052a94b4040d8f4627d1afa0f471309147adf8fdd3e4b2d6d76a8920e68';

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
  let revisionsQuery = InviteContentRevision.find({ inviteId: invite._id }).sort({ revision: 1 });
  if (session) {
    contentQuery = contentQuery.session(session);
    revisionsQuery = revisionsQuery.session(session);
  }
  const [content, revisions] = await Promise.all([contentQuery, revisionsQuery]);
  const blockers = [];

  if (norm(invite.slug) !== TARGET_SLUG) blockers.push('SLUG_MISMATCH');
  if (norm(invite.packageKey) !== TARGET_PACKAGE) blockers.push('PACKAGE_MISMATCH');
  if (contentModeForInvite(invite) !== 'legacy') blockers.push('CONTENT_MODE_NOT_LEGACY');
  if (!content) blockers.push('INVITE_CONTENT_MISSING');

  if (content) {
    if (Number(content.publishedRevision || 0) !== 0) blockers.push('PUBLISHED_REVISION_NOT_ZERO');
    if (!publishedIsEmpty(content)) blockers.push('PUBLISHED_NOT_EMPTY');
    if (content.draft?.runtime?.contentMode !== 'legacy') blockers.push('DRAFT_NOT_LEGACY');
  }

  return { invite, content, revisions, blockers };
}

function classifyCompletenessState(state) {
  if (!state.content) return { mode: 'blocked', blockers: state.blockers };
  const currentHash = contentHash(state.content.draft || {});
  const enriched = buildRosalinaCompletenessDraft(state.content.draft || {});
  const enrichedHash = contentHash(enriched);
  const revisionNumbers = state.revisions.map(item => Number(item.revision));

  if (Number(state.content.draftRevision) === 2 && currentHash === enrichedHash && revisionNumbers.includes(2)) {
    return { mode: 'already-applied', blockers: [], currentHash, enrichedHash, enriched };
  }

  const blockers = [...state.blockers];
  if (Number(state.content.draftRevision) !== 1) blockers.push('DRAFT_REVISION_NOT_ONE');
  if (currentHash !== EXPECTED_BASE_HASH) blockers.push('BASE_DRAFT_HASH_MISMATCH');
  if (state.revisions.length !== 1 || !revisionNumbers.includes(1)) blockers.push('REVISION_HISTORY_NOT_BOOTSTRAP_ONLY');

  return { mode: blockers.length ? 'blocked' : 'ready', blockers, currentHash, enrichedHash, enriched };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não definido.');

  console.log('');
  console.log('Lirandzo — Builder V2 / Rosalina Completeness Pass');
  console.log(`MODO: ${APPLY ? 'APPLY' : 'CHECK'}${APPLY ? ' — escrita limitada ao Draft V2' : ' — somente leitura'}.`);
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  const models = buildModels();

  try {
    const state = await inspectState(models);
    const classification = classifyCompletenessState(state);
    const invite = state.invite;
    const content = state.content;

    console.log('ESTADO ACTUAL');
    printCheck('Invite encontrado', Boolean(invite), invite ? String(invite._id) : 'não');
    if (invite) {
      printCheck('slug', norm(invite.slug) === TARGET_SLUG, invite.slug, TARGET_SLUG);
      printCheck('packageKey', norm(invite.packageKey) === TARGET_PACKAGE, invite.packageKey || '(vazio)', TARGET_PACKAGE);
      printCheck('contentMode', contentModeForInvite(invite) === 'legacy', contentModeForInvite(invite), 'legacy');
    }
    if (content) {
      printCheck('InviteContent encontrado', true, String(content._id));
      printCheck('publishedRevision', Number(content.publishedRevision || 0) === 0, Number(content.publishedRevision || 0), 0);
      printCheck('published vazio', publishedIsEmpty(content), publishedIsEmpty(content) ? 'sim' : 'não', 'sim');
      console.log(`INFO  draftRevision actual: ${Number(content.draftRevision || 0)}`);
      console.log(`INFO  hash actual: ${classification.currentHash || contentHash(content.draft || {})}`);
    }

    console.log('');
    console.log('CONFLITOS LEGACY CONHECIDOS — NÃO RECONCILIADOS AUTOMATICAMENTE');
    ROSALINA_KNOWN_LEGACY_CONFLICTS.forEach(item => {
      console.log(`WARN  ${item.key}: estruturado="${item.structured}" | HTML="${item.legacyHtml}" | precedência=${item.precedence}`);
    });

    if (classification.mode === 'already-applied') {
      console.log('');
      console.log('COMPLETENESS PASS JÁ APLICADO. Zero writes.');
      console.log(`Hash actual: ${classification.currentHash}`);
      return;
    }

    if (classification.blockers.length) {
      console.log('');
      console.log('CHECK BLOQUEADO. Nenhuma escrita foi efectuada.');
      console.log(`Bloqueadores: ${classification.blockers.join(', ')}`);
      process.exitCode = 2;
      return;
    }

    const enriched = classification.enriched;
    const audit = auditRosalinaCompleteness({ baseDraft: content.draft, draft: enriched });
    if (!audit.valid) throw new Error(`Completeness local inválido: ${JSON.stringify(audit.failed)}`);

    console.log('');
    console.log('DRAFT COMPLETO PREPARADO');
    console.log(`Template: ${enriched.identity.templateKey}`);
    console.log(`Prazo RSVP: ${enriched.event.rsvpDeadline}`);
    console.log(`Galeria: ${enriched.gallery.items.length} item(ns)`);
    console.log(`Menu: ${enriched.menu.items.length} item(ns)`);
    console.log(`Apoio preservado: ${enriched.support.contacts.length} contacto(s)`);
    console.log(`Pagamentos preservados: ${enriched.payments.bankAccounts.length} conta(s) + ${enriched.payments.mobilePayments.length} móvel(eis)`);
    console.log(`Renderer: ${enriched.runtime.contentMode}`);
    console.log(`Novo hash: ${classification.enrichedHash}`);

    if (!APPLY) {
      console.log('');
      console.log('CHECK APROVADO. Zero writes.');
      console.log(`Para aplicar: node tools/rosalina-builder-v2-completeness-db.js --apply --confirm=${EXPECTED_CONFIRM}`);
      return;
    }

    if (CONFIRM !== EXPECTED_CONFIRM) {
      throw new Error(`Confirmação ausente/incorreta. Use --confirm=${EXPECTED_CONFIRM}.`);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const freshState = await inspectState(models, session);
        const freshClass = classifyCompletenessState(freshState);
        if (freshClass.mode !== 'ready') {
          throw new Error(`Estado mudou antes da escrita: ${freshClass.blockers.join(', ') || freshClass.mode}`);
        }

        const freshContent = freshState.content;
        const nextDraft = freshClass.enriched;
        const nextHash = freshClass.enrichedHash;

        const write = await models.InviteContent.updateOne(
          { _id: freshContent._id, draftRevision: 1, publishedRevision: 0 },
          {
            $set: {
              draft: nextDraft,
              draftRevision: 2,
              lastEditedByRole: 'completeness-rosalina'
            }
          },
          { session }
        );
        if (write.modifiedCount !== 1) throw new Error('Guard de escrita falhou: InviteContent não foi actualizado exactamente uma vez.');

        await models.InviteContentRevision.create([{
          inviteId: freshContent.inviteId,
          slug: TARGET_SLUG,
          revision: 2,
          stage: 'draft',
          schemaVersion: '2.0',
          content: nextDraft,
          contentHash: nextHash,
          note: 'Completeness Pass Rosalina: template, media, SEO, galeria, dress code, menu e prazo RSVP',
          createdByRole: 'completeness-rosalina'
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    const after = await models.InviteContent.findOne({ slug: TARGET_SLUG }).lean();
    if (!after) throw new Error('Verificação pós-escrita falhou: InviteContent não encontrado.');
    const afterRevisions = await models.InviteContentRevision.find({ inviteId: after.inviteId }).sort({ revision: 1 }).lean();
    if (Number(after.draftRevision) !== 2 || Number(after.publishedRevision) !== 0) throw new Error('Verificação pós-escrita falhou: revisões inesperadas.');
    if (!publishedIsEmpty(after)) throw new Error('Verificação pós-escrita falhou: published não está vazio.');
    if (after.draft?.runtime?.contentMode !== 'legacy') throw new Error('Verificação pós-escrita falhou: renderer deixou de estar legacy.');
    if (!afterRevisions.some(item => Number(item.revision) === 2 && item.stage === 'draft')) throw new Error('Verificação pós-escrita falhou: revisão 2 não encontrada.');

    console.log('');
    console.log('COMPLETENESS APPLY CONCLUÍDO.');
    console.log(`InviteContent: ${String(after._id)}`);
    console.log('draftRevision: 2');
    console.log('publishedRevision: 0');
    console.log('published: vazio');
    console.log('contentMode: legacy');
    console.log(`hash: ${contentHash(after.draft)}`);
    console.log('Nenhum Invite, Guest, RSVP, GiftItem, Contribution, Message, CheckIn ou Capsule foi alterado por este script.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async error => {
  console.error('');
  console.error('FALHOU:', error?.message || error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
