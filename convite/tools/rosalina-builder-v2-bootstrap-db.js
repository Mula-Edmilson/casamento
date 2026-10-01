'use strict';

require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const { buildLegacyBootstrapDraft, auditLegacyBootstrapDraft } = require('../builder-v2/legacy-bootstrap-v2');
const { createBuilderV2Models } = require('../builder-v2/mongo-models-v2');

const ROOT = path.resolve(__dirname, '..');
const INVITE_DIR = path.join(ROOT, 'rosalina-monteiro');
const inviteMeta = require(path.join(INVITE_DIR, 'invite-data.json'));
const seedData = require(path.join(INVITE_DIR, 'mongodb-seed-data.json'));

const TARGET_SLUG = 'rosalina-monteiro';
const TARGET_PACKAGE = 'esmeralda';
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
  return norm(invite && invite.config && invite.config.contentMode) === 'mongo-v2' ? 'mongo-v2' : 'legacy';
}

function printCheck(label, ok, actual, expected = '') {
  const suffix = expected === '' ? String(actual) : `${actual} (esperado: ${expected})`;
  console.log(`${ok ? 'PASS' : 'BLOCK'}  ${label}: ${suffix}`);
}

function buildModels() {
  const InviteSchema = new mongoose.Schema({
    slug: String,
    clientName: String,
    coupleNames: String,
    bride: String,
    groom: String,
    packageKey: String,
    status: String,
    eventDateISO: String,
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

  if (!invite) return { invite: null, content: null, revisionCount: 0, blockers: ['INVITE_NOT_FOUND'] };

  let contentQuery = InviteContent.findOne({ inviteId: invite._id });
  let revisionQuery = InviteContentRevision.countDocuments({ inviteId: invite._id });
  if (session) {
    contentQuery = contentQuery.session(session);
    revisionQuery = revisionQuery.session(session);
  }
  const [content, revisionCount] = await Promise.all([contentQuery, revisionQuery]);

  const blockers = [];
  if (norm(invite.slug) !== TARGET_SLUG) blockers.push('SLUG_MISMATCH');
  if (norm(invite.packageKey) !== TARGET_PACKAGE) blockers.push('PACKAGE_MISMATCH');
  if (contentModeForInvite(invite) !== 'legacy') blockers.push('CONTENT_MODE_NOT_LEGACY');
  if (content) blockers.push('INVITE_CONTENT_ALREADY_EXISTS');
  if (revisionCount > 0) blockers.push('REVISION_HISTORY_ALREADY_EXISTS');

  return { invite, content, revisionCount, blockers };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não definido. O script não recebeu credenciais MongoDB.');
  if (norm(inviteMeta.slug) !== TARGET_SLUG) throw new Error('Fonte invite-data.json não corresponde a rosalina-monteiro.');
  if (norm(inviteMeta.packageKey) !== TARGET_PACKAGE) throw new Error('Fonte invite-data.json não identifica Rosalina como Esmeralda.');

  const draft = buildLegacyBootstrapDraft({ inviteMeta, seedData });
  const audit = auditLegacyBootstrapDraft({ inviteMeta, seedData, draft });
  if (!audit.valid) throw new Error(`Bootstrap local inválido: ${JSON.stringify(audit.failed)}`);
  if (draft.runtime.contentMode !== 'legacy') throw new Error('Guard falhou: draft não está em legacy.');

  console.log('');
  console.log('Lirandzo — Builder V2 / Rosalina Mongo Draft Bootstrap');
  console.log(`MODO: ${APPLY ? 'APPLY' : 'CHECK'}${APPLY ? ' — escrita limitada a InviteContent + InviteContentRevision' : ' — somente leitura'}.`);
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  const models = buildModels();

  try {
    const state = await inspectState(models);
    const invite = state.invite;

    console.log('ESTADO ACTUAL');
    printCheck('Invite encontrado', Boolean(invite), invite ? String(invite._id) : 'não');
    if (invite) {
      printCheck('slug', norm(invite.slug) === TARGET_SLUG, invite.slug, TARGET_SLUG);
      printCheck('packageKey', norm(invite.packageKey) === TARGET_PACKAGE, invite.packageKey || '(vazio)', TARGET_PACKAGE);
      printCheck('contentMode', contentModeForInvite(invite) === 'legacy', contentModeForInvite(invite), 'legacy');
      printCheck('InviteContent inexistente', !state.content, state.content ? `existe (${String(state.content._id)})` : 'não existe');
      printCheck('Revisões Builder inexistentes', state.revisionCount === 0, state.revisionCount, 0);
    }

    console.log('');
    console.log('DRAFT PREPARADO');
    console.log(`Casal: ${draft.people.coupleNames}`);
    console.log(`Pacote: ${draft.identity.packageKey}`);
    console.log(`Agenda: ${draft.schedule.length} item(ns)`);
    console.log(`História: ${draft.story.chapters.length} capítulo(s)`);
    console.log(`Pagamentos: ${draft.payments.bankAccounts.length} conta(s) + ${draft.payments.mobilePayments.length} móvel(eis)`);
    console.log(`Presentes: ${draft.gifts.mode}`);
    console.log(`Renderer: ${draft.runtime.contentMode}`);
    console.log(`Hash: ${contentHash(draft)}`);

    if (state.blockers.length) {
      console.log('');
      console.log('CHECK BLOQUEADO. Nenhuma escrita foi efectuada.');
      console.log(`Bloqueadores: ${state.blockers.join(', ')}`);
      process.exitCode = 2;
      return;
    }

    if (!APPLY) {
      console.log('');
      console.log('CHECK APROVADO. Zero writes.');
      console.log('Para aplicar futuramente é obrigatório usar --apply --confirm=rosalina-monteiro.');
      return;
    }

    if (CONFIRM !== TARGET_SLUG) {
      throw new Error('Confirmação ausente/incorreta. Use --confirm=rosalina-monteiro junto com --apply.');
    }

    const session = await mongoose.startSession();
    let createdContentId = '';
    try {
      await session.withTransaction(async () => {
        const fresh = await inspectState(models, session);
        if (fresh.blockers.length) {
          throw new Error(`Estado mudou antes da escrita: ${fresh.blockers.join(', ')}`);
        }

        const freshInvite = fresh.invite;
        const hash = contentHash(draft);
        const [contentDoc] = await models.InviteContent.create([{
          inviteId: freshInvite._id,
          slug: TARGET_SLUG,
          schemaVersion: '2.0',
          draft,
          published: {},
          draftRevision: 1,
          publishedRevision: 0,
          lastEditedByRole: 'bootstrap-rosalina'
        }], { session });
        createdContentId = String(contentDoc._id);

        await models.InviteContentRevision.create([{
          inviteId: freshInvite._id,
          slug: TARGET_SLUG,
          revision: 1,
          stage: 'draft',
          schemaVersion: '2.0',
          content: draft,
          contentHash: hash,
          note: 'Bootstrap inicial de conteúdo legacy Rosalina & Monteiro',
          createdByRole: 'bootstrap-rosalina'
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    const after = await models.InviteContent.findOne({ slug: TARGET_SLUG }).lean();
    if (!after || String(after._id) !== createdContentId) throw new Error('Verificação pós-escrita falhou: InviteContent não encontrado.');
    if (Number(after.draftRevision) !== 1 || Number(after.publishedRevision) !== 0) throw new Error('Verificação pós-escrita falhou: revisões inesperadas.');
    if (after.published && Object.keys(after.published).length) throw new Error('Verificação pós-escrita falhou: published não está vazio.');
    if (after.draft?.runtime?.contentMode !== 'legacy') throw new Error('Verificação pós-escrita falhou: draft deixou de estar legacy.');

    console.log('');
    console.log('APPLY CONCLUÍDO.');
    console.log(`InviteContent: ${createdContentId}`);
    console.log('draftRevision: 1');
    console.log('publishedRevision: 0');
    console.log('published: vazio');
    console.log('contentMode: legacy');
    console.log('Nenhum Invite, Guest, RSVP, GiftItem, Contribution, Message, CheckIn ou Capsule foi alterado por este script.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async error => {
  console.error('');
  console.error('FALHOU:', error && error.message ? error.message : error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
