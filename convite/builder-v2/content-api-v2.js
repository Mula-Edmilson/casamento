'use strict';

const crypto = require('crypto');
const {
  normalizeInviteContentV2,
  validateInviteContentV2,
  mapLegacyInviteToV2,
  slugify
} = require('./invite-content-v2');

const BUILDER_V2_ACTIVE_MODE = 'mongo-v2';
const LEGACY_CONTENT_MODE = 'legacy';
const MAX_REVISIONS_PAGE = 100;

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

function builderContentModeForInvite(invite) {
  const raw = invite && invite.config && invite.config.contentMode;
  return String(raw || '').trim().toLowerCase() === BUILDER_V2_ACTIVE_MODE
    ? BUILDER_V2_ACTIVE_MODE
    : LEGACY_CONTENT_MODE;
}

function httpError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function positiveInteger(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function parseExpectedRevision(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw httpError(400, 'INVALID_REVISION', `${fieldName} deve ser um número inteiro maior ou igual a 0.`);
  }
  return n;
}

function plain(doc) {
  if (!doc) return null;
  return clone(doc.toObject ? doc.toObject() : doc);
}

function cleanInviteRef(invite) {
  if (!invite) return null;
  return {
    id: String(invite._id || invite.id || ''),
    slug: String(invite.slug || ''),
    packageKey: String(invite.packageKey || ''),
    coupleNames: String(invite.coupleNames || ''),
    status: String(invite.status || ''),
    contentMode: builderContentModeForInvite(invite)
  };
}

function cleanContentDoc(doc) {
  if (!doc) return null;
  const o = plain(doc);
  return {
    id: String(o._id || o.id || ''),
    inviteId: String(o.inviteId || ''),
    slug: o.slug || '',
    schemaVersion: o.schemaVersion || '2.0',
    draft: o.draft || {},
    published: o.published || {},
    draftRevision: positiveInteger(o.draftRevision, 1),
    publishedRevision: positiveInteger(o.publishedRevision, 0),
    publishedAt: o.publishedAt || null,
    publishedByRole: o.publishedByRole || '',
    lastEditedByRole: o.lastEditedByRole || '',
    publishHash: o.publishHash || '',
    createdAt: o.createdAt || null,
    updatedAt: o.updatedAt || null
  };
}

function cleanRevisionDoc(doc) {
  const o = plain(doc) || {};
  return {
    id: String(o._id || o.id || ''),
    inviteId: String(o.inviteId || ''),
    slug: o.slug || '',
    revision: positiveInteger(o.revision, 0),
    stage: o.stage || '',
    schemaVersion: o.schemaVersion || '2.0',
    content: o.content || {},
    contentHash: o.contentHash || '',
    note: o.note || '',
    createdByRole: o.createdByRole || '',
    createdAt: o.createdAt || null
  };
}

function legacyDraftFromInvite(invite) {
  if (!invite) throw new Error('Invite é obrigatório.');
  const config = invite.config && typeof invite.config === 'object' ? clone(invite.config) : {};
  const configEvent = config.event && typeof config.event === 'object' ? config.event : config;
  const event = {
    ...configEvent,
    slug: invite.slug,
    packageKey: invite.packageKey,
    coupleNames: invite.coupleNames || configEvent.coupleNames,
    bride: invite.bride || configEvent.bride,
    groom: invite.groom || configEvent.groom,
    eventDateISO: invite.eventDateISO || configEvent.eventDateISO,
    rsvpDeadline: invite.rsvpDeadline || configEvent.rsvpDeadline
  };
  return mapLegacyInviteToV2(
    { ...config, event, slug: invite.slug, packageKey: invite.packageKey, coupleNames: invite.coupleNames },
    { packageKey: invite.packageKey, contentMode: LEGACY_CONTENT_MODE }
  );
}

function bindContentToInvite(input, invite) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'INVALID_CONTENT', 'content deve ser um objecto JSON.');
  }
  if (!invite) throw new Error('Invite é obrigatório.');

  const suppliedSlug = input.identity && input.identity.slug ? slugify(input.identity.slug) : '';
  const inviteSlug = slugify(invite.slug);
  if (suppliedSlug && suppliedSlug !== inviteSlug) {
    throw httpError(409, 'CONTENT_INVITE_MISMATCH', 'O slug do conteúdo não corresponde ao convite seleccionado.', {
      expected: inviteSlug,
      received: suppliedSlug
    });
  }

  const suppliedPackage = input.identity && input.identity.packageKey
    ? String(input.identity.packageKey).trim().toLowerCase()
    : '';
  const invitePackage = String(invite.packageKey || '').trim().toLowerCase();
  if (suppliedPackage && invitePackage && suppliedPackage !== invitePackage) {
    throw httpError(409, 'CONTENT_PACKAGE_MISMATCH', 'O pacote do conteúdo não corresponde ao pacote do convite.', {
      expected: invitePackage,
      received: suppliedPackage
    });
  }

  const content = normalizeInviteContentV2(input);
  content.identity.slug = inviteSlug;
  if (invitePackage) content.identity.packageKey = invitePackage;
  return content;
}

function publicContentEnvelope(invite, doc) {
  const mode = builderContentModeForInvite(invite);
  if (mode !== BUILDER_V2_ACTIVE_MODE) {
    return {
      active: false,
      mode: LEGACY_CONTENT_MODE,
      slug: invite.slug,
      revision: 0,
      hash: '',
      publishedAt: null,
      content: null
    };
  }
  if (!doc || positiveInteger(doc.publishedRevision, 0) < 1 || !doc.published || !Object.keys(doc.published).length) {
    throw httpError(503, 'CONTENT_NOT_PUBLISHED', 'O renderer V2 está activo, mas ainda não existe conteúdo publicado para este convite.');
  }
  return {
    active: true,
    mode: BUILDER_V2_ACTIVE_MODE,
    slug: invite.slug,
    revision: positiveInteger(doc.publishedRevision, 0),
    hash: doc.publishHash || contentHash(doc.published),
    publishedAt: doc.publishedAt || null,
    content: clone(doc.published)
  };
}

async function resolveInviteById({ Invite, mongoose }, id, session = null) {
  const raw = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw httpError(400, 'INVALID_INVITE_ID', 'ID do convite inválido.');
  }
  let query = Invite.findById(raw);
  if (session && query && typeof query.session === 'function') query = query.session(session);
  const invite = await query;
  if (!invite) throw httpError(404, 'INVITE_NOT_FOUND', 'Convite não encontrado.');
  return invite;
}

async function strictTransaction(mongoose, work) {
  if (!mongoose || typeof mongoose.startSession !== 'function') {
    throw httpError(500, 'TRANSACTION_UNAVAILABLE', 'MongoDB transaction API indisponível.');
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!error.statusCode && /transaction|replica set|mongos/i.test(String(error.message || ''))) {
      throw httpError(503, 'TRANSACTION_REQUIRED', 'A operação exige transacções MongoDB e foi cancelada sem alterações parciais.');
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function createRevision(InviteContentRevision, payload, session) {
  const docs = await InviteContentRevision.create([payload], { session });
  return docs[0];
}

async function createActivity(Activity, payload, session) {
  if (!Activity) return null;
  const docs = await Activity.create([payload], { session });
  return docs[0];
}

function roleOf(req) {
  return req && req.manager && req.manager.role ? String(req.manager.role) : '';
}

function asyncWrapper(fn) {
  return function builderV2AsyncRoute(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function registerBuilderV2ContentRoutes(app, deps = {}) {
  const {
    mongoose,
    Invite,
    InviteContent,
    InviteContentRevision,
    FormSubmission,
    Activity,
    requireManager,
    requireAdmin,
    asyncRoute
  } = deps;

  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function' || typeof app.put !== 'function') {
    throw new Error('Express app inválida para Builder V2.');
  }
  for (const [name, value] of Object.entries({ mongoose, Invite, InviteContent, InviteContentRevision, FormSubmission, requireManager, requireAdmin })) {
    if (!value) throw new Error(`Dependência Builder V2 em falta: ${name}`);
  }
  const wrap = typeof asyncRoute === 'function' ? asyncRoute : asyncWrapper;

  app.get('/manager/invites/:id/content', requireManager, wrap(async (req, res) => {
    const invite = await resolveInviteById({ Invite, mongoose }, req.params.id);
    const doc = await InviteContent.findOne({ inviteId: invite._id });
    res.json({
      status: 'success',
      data: {
        invite: cleanInviteRef(invite),
        content: cleanContentDoc(doc),
        suggestedDraft: doc ? null : legacyDraftFromInvite(invite)
      }
    });
  }));

  app.put('/manager/invites/:id/content/draft', requireManager, wrap(async (req, res) => {
    const expectedDraftRevision = parseExpectedRevision(req.body && req.body.expectedDraftRevision, 'expectedDraftRevision');
    const rawContent = req.body && req.body.content;

    const result = await strictTransaction(mongoose, async session => {
      const invite = await resolveInviteById({ Invite, mongoose }, req.params.id, session);
      let query = InviteContent.findOne({ inviteId: invite._id });
      if (query && typeof query.session === 'function') query = query.session(session);
      let doc = await query;
      const currentRevision = doc ? positiveInteger(doc.draftRevision, 1) : 0;
      if (expectedDraftRevision !== currentRevision) {
        throw httpError(409, 'DRAFT_REVISION_CONFLICT', 'O draft foi alterado noutra sessão. Recarregue antes de guardar.', {
          expected: expectedDraftRevision,
          current: currentRevision
        });
      }

      const content = bindContentToInvite(rawContent, invite);
      const validation = validateInviteContentV2(content, { stage: 'draft' });
      if (!validation.valid) {
        throw httpError(422, 'CONTENT_VALIDATION_FAILED', 'O draft contém erros de validação.', validation);
      }

      const nextRevision = currentRevision + 1;
      if (!doc) {
        doc = new InviteContent({
          inviteId: invite._id,
          slug: invite.slug,
          schemaVersion: validation.content.schemaVersion,
          draft: validation.content,
          published: {},
          draftRevision: nextRevision,
          publishedRevision: 0,
          lastEditedByRole: roleOf(req)
        });
      } else {
        doc.slug = invite.slug;
        doc.schemaVersion = validation.content.schemaVersion;
        doc.draft = validation.content;
        doc.draftRevision = nextRevision;
        doc.lastEditedByRole = roleOf(req);
      }
      await doc.save({ session });

      const revision = await createRevision(InviteContentRevision, {
        inviteId: invite._id,
        slug: invite.slug,
        revision: nextRevision,
        stage: 'draft',
        schemaVersion: validation.content.schemaVersion,
        content: validation.content,
        contentHash: contentHash(validation.content),
        note: String((req.body && req.body.note) || '').trim(),
        createdByRole: roleOf(req)
      }, session);

      await createActivity(Activity, {
        inviteId: invite._id,
        slug: invite.slug,
        type: 'builder-v2-draft-saved',
        title: 'Draft Builder V2 guardado',
        detail: `Revisão ${nextRevision}`,
        meta: { draftRevision: nextRevision, contentHash: revision.contentHash },
        timestamp: new Date()
      }, session);

      return { invite, doc, validation };
    });

    res.json({
      status: 'success',
      data: {
        invite: cleanInviteRef(result.invite),
        content: cleanContentDoc(result.doc),
        validation: { valid: result.validation.valid, errors: result.validation.errors, warnings: result.validation.warnings }
      }
    });
  }));

  app.post('/manager/invites/:id/content/validate', requireManager, wrap(async (req, res) => {
    const invite = await resolveInviteById({ Invite, mongoose }, req.params.id);
    const stage = req.body && req.body.stage === 'publish' ? 'publish' : 'draft';
    let rawContent = req.body && req.body.content;
    let draftRevision = 0;

    if (!rawContent) {
      const doc = await InviteContent.findOne({ inviteId: invite._id });
      if (!doc || !doc.draft || !Object.keys(doc.draft).length) {
        throw httpError(404, 'DRAFT_NOT_FOUND', 'Ainda não existe draft Builder V2 para validar.');
      }
      rawContent = doc.draft;
      draftRevision = positiveInteger(doc.draftRevision, 0);
    }

    const content = bindContentToInvite(rawContent, invite);
    const validation = validateInviteContentV2(content, { stage });
    res.status(validation.valid ? 200 : 422).json({
      status: validation.valid ? 'success' : 'error',
      data: {
        stage,
        draftRevision,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        content: validation.content
      }
    });
  }));

  app.post('/manager/invites/:id/content/publish', requireManager, requireAdmin, wrap(async (req, res) => {
    const expectedDraftRevision = parseExpectedRevision(req.body && req.body.expectedDraftRevision, 'expectedDraftRevision');

    const result = await strictTransaction(mongoose, async session => {
      const invite = await resolveInviteById({ Invite, mongoose }, req.params.id, session);
      let query = InviteContent.findOne({ inviteId: invite._id });
      if (query && typeof query.session === 'function') query = query.session(session);
      const doc = await query;
      if (!doc) throw httpError(404, 'DRAFT_NOT_FOUND', 'Ainda não existe conteúdo Builder V2 para publicar.');

      const currentDraftRevision = positiveInteger(doc.draftRevision, 0);
      if (expectedDraftRevision !== currentDraftRevision) {
        throw httpError(409, 'DRAFT_REVISION_CONFLICT', 'O draft mudou desde a última revisão. Recarregue e valide novamente.', {
          expected: expectedDraftRevision,
          current: currentDraftRevision
        });
      }

      const content = bindContentToInvite(doc.draft, invite);
      const validation = validateInviteContentV2(content, { stage: 'publish' });
      if (!validation.valid) {
        throw httpError(422, 'CONTENT_VALIDATION_FAILED', 'O draft ainda não pode ser publicado.', validation);
      }

      const hash = contentHash(validation.content);
      if (doc.publishHash === hash && positiveInteger(doc.publishedRevision, 0) > 0) {
        return { invite, doc, validation, unchanged: true };
      }

      const nextPublishedRevision = positiveInteger(doc.publishedRevision, 0) + 1;
      doc.published = validation.content;
      doc.publishedRevision = nextPublishedRevision;
      doc.publishedAt = new Date();
      doc.publishedByRole = roleOf(req);
      doc.publishHash = hash;
      await doc.save({ session });

      await createRevision(InviteContentRevision, {
        inviteId: invite._id,
        slug: invite.slug,
        revision: nextPublishedRevision,
        stage: 'published',
        schemaVersion: validation.content.schemaVersion,
        content: validation.content,
        contentHash: hash,
        note: String((req.body && req.body.note) || '').trim(),
        createdByRole: roleOf(req)
      }, session);

      await createActivity(Activity, {
        inviteId: invite._id,
        slug: invite.slug,
        type: 'builder-v2-content-published',
        title: 'Conteúdo Builder V2 publicado',
        detail: `Revisão publicada ${nextPublishedRevision}`,
        meta: {
          draftRevision: currentDraftRevision,
          publishedRevision: nextPublishedRevision,
          contentHash: hash,
          rendererActivated: builderContentModeForInvite(invite) === BUILDER_V2_ACTIVE_MODE
        },
        timestamp: new Date()
      }, session);

      return { invite, doc, validation, unchanged: false };
    });

    res.json({
      status: 'success',
      data: {
        invite: cleanInviteRef(result.invite),
        content: cleanContentDoc(result.doc),
        unchanged: result.unchanged,
        rendererActivated: builderContentModeForInvite(result.invite) === BUILDER_V2_ACTIVE_MODE,
        activationNote: builderContentModeForInvite(result.invite) === BUILDER_V2_ACTIVE_MODE
          ? 'Renderer V2 activo para este convite.'
          : 'Conteúdo publicado, mas o convite continua em modo legacy. Publicar conteúdo não activa o renderer V2.'
      }
    });
  }));

  app.get('/manager/invites/:id/content/revisions', requireManager, wrap(async (req, res) => {
    const invite = await resolveInviteById({ Invite, mongoose }, req.params.id);
    const requestedStage = String(req.query.stage || '').trim();
    const filter = { inviteId: invite._id };
    if (requestedStage === 'draft' || requestedStage === 'published') filter.stage = requestedStage;
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), MAX_REVISIONS_PAGE);
    const revisions = await InviteContentRevision.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ status: 'success', data: revisions.map(cleanRevisionDoc) });
  }));

  app.post('/manager/invites/:id/content/rollback', requireManager, requireAdmin, wrap(async (req, res) => {
    const targetRevision = positiveInteger(req.body && req.body.revision, 0);
    if (targetRevision < 1) throw httpError(400, 'INVALID_REVISION', 'revision deve indicar uma revisão publicada válida.');
    const expectedDraftRevision = parseExpectedRevision(req.body && req.body.expectedDraftRevision, 'expectedDraftRevision');

    const result = await strictTransaction(mongoose, async session => {
      const invite = await resolveInviteById({ Invite, mongoose }, req.params.id, session);
      let contentQuery = InviteContent.findOne({ inviteId: invite._id });
      if (contentQuery && typeof contentQuery.session === 'function') contentQuery = contentQuery.session(session);
      const doc = await contentQuery;
      if (!doc) throw httpError(404, 'CONTENT_NOT_FOUND', 'Conteúdo Builder V2 não encontrado.');

      const currentDraftRevision = positiveInteger(doc.draftRevision, 0);
      if (expectedDraftRevision !== currentDraftRevision) {
        throw httpError(409, 'DRAFT_REVISION_CONFLICT', 'O draft mudou antes do rollback. Recarregue antes de continuar.', {
          expected: expectedDraftRevision,
          current: currentDraftRevision
        });
      }

      let revisionQuery = InviteContentRevision.findOne({
        inviteId: invite._id,
        stage: 'published',
        revision: targetRevision
      });
      if (revisionQuery && typeof revisionQuery.session === 'function') revisionQuery = revisionQuery.session(session);
      const target = await revisionQuery;
      if (!target) throw httpError(404, 'REVISION_NOT_FOUND', 'Revisão publicada não encontrada.');

      const restoredContent = bindContentToInvite(target.content, invite);
      const validation = validateInviteContentV2(restoredContent, { stage: 'draft' });
      if (!validation.valid) {
        throw httpError(422, 'ROLLBACK_CONTENT_INVALID', 'A revisão seleccionada não é compatível com o schema actual.', validation);
      }

      const nextDraftRevision = currentDraftRevision + 1;
      doc.draft = validation.content;
      doc.draftRevision = nextDraftRevision;
      doc.lastEditedByRole = roleOf(req);
      await doc.save({ session });

      const draftHash = contentHash(validation.content);
      await createRevision(InviteContentRevision, {
        inviteId: invite._id,
        slug: invite.slug,
        revision: nextDraftRevision,
        stage: 'draft',
        schemaVersion: validation.content.schemaVersion,
        content: validation.content,
        contentHash: draftHash,
        note: `Rollback preparado a partir da revisão publicada ${targetRevision}.`,
        createdByRole: roleOf(req)
      }, session);

      await createActivity(Activity, {
        inviteId: invite._id,
        slug: invite.slug,
        type: 'builder-v2-rollback-to-draft',
        title: 'Revisão restaurada para draft',
        detail: `Publicada ${targetRevision} → draft ${nextDraftRevision}`,
        meta: { sourcePublishedRevision: targetRevision, draftRevision: nextDraftRevision, contentHash: draftHash },
        timestamp: new Date()
      }, session);

      return { invite, doc, sourceRevision: targetRevision };
    });

    res.json({
      status: 'success',
      data: {
        invite: cleanInviteRef(result.invite),
        content: cleanContentDoc(result.doc),
        sourcePublishedRevision: result.sourceRevision,
        publishedChanged: false,
        note: 'O rollback foi restaurado apenas no draft. É necessária uma publicação explícita para alterar o conteúdo público.'
      }
    });
  }));

  app.get('/api/public/invites/:slug/content', wrap(async (req, res) => {
    const slug = slugify(req.params.slug || '');
    if (!slug) throw httpError(400, 'INVALID_SLUG', 'Slug inválido.');
    const invite = await Invite.findOne({ slug, status: { $ne: 'archived' } });
    if (!invite) throw httpError(404, 'INVITE_NOT_FOUND', 'Convite não encontrado.');

    const mode = builderContentModeForInvite(invite);
    if (mode !== BUILDER_V2_ACTIVE_MODE) {
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', data: publicContentEnvelope(invite, null) });
    }

    const doc = await InviteContent.findOne({ inviteId: invite._id });
    res.set('Cache-Control', 'no-store');
    return res.json({ status: 'success', data: publicContentEnvelope(invite, doc) });
  }));

  return {
    managerRoutes: [
      'GET /manager/invites/:id/content',
      'PUT /manager/invites/:id/content/draft',
      'POST /manager/invites/:id/content/validate',
      'POST /manager/invites/:id/content/publish',
      'GET /manager/invites/:id/content/revisions',
      'POST /manager/invites/:id/content/rollback'
    ],
    publicRoutes: ['GET /api/public/invites/:slug/content']
  };
}

module.exports = {
  BUILDER_V2_ACTIVE_MODE,
  LEGACY_CONTENT_MODE,
  stableSerialize,
  contentHash,
  builderContentModeForInvite,
  legacyDraftFromInvite,
  bindContentToInvite,
  cleanContentDoc,
  cleanRevisionDoc,
  publicContentEnvelope,
  parseExpectedRevision,
  registerBuilderV2ContentRoutes
};
