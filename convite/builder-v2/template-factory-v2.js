'use strict';

const crypto = require('crypto');
const {
  emptyInviteContentV2,
  normalizeInviteContentV2,
  validateInviteContentV2,
  slugify
} = require('./invite-content-v2');
const { getTemplate } = require('./template-registry-v2');

const FACTORY_VERSION = 1;
const LEGACY_MODE = 'legacy';
const ACTIVE_MODE = 'mongo-v2';

const FACTORY_TEMPLATES = Object.freeze({
  'esmeralda-rosalina': Object.freeze({
    key: 'esmeralda-rosalina',
    packageKey: 'esmeralda',
    label: 'Esmeralda · Rosalina',
    templatePath: 'convite/templates/rubi-rosalina',
    accessMode: 'nominal',
    giftsMode: 'monetary'
  })
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function norm(value) {
  return clean(value).toLowerCase();
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

function httpError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function getFactoryTemplate(templateKey) {
  const key = clean(templateKey);
  const spec = FACTORY_TEMPLATES[key] || null;
  if (!spec) return null;
  const registry = getTemplate(key);
  if (!registry || registry.packageKey !== spec.packageKey) return null;
  return spec;
}

function listFactoryTemplates() {
  return Object.values(FACTORY_TEMPLATES).map(item => ({ ...item }));
}

function initialsFromCouple(bride, groom, coupleNames) {
  const names = [clean(bride), clean(groom)].filter(Boolean);
  if (names.length < 2) {
    const split = clean(coupleNames).split(/\s*&\s*|\s+e\s+/i).map(clean).filter(Boolean);
    if (split.length >= 2) names.splice(0, names.length, split[0], split[1]);
  }
  return names.slice(0, 2).map(name => name.charAt(0).toUpperCase()).join('');
}

function buildStarterDraft(input = {}) {
  const templateKey = clean(input.templateKey || 'esmeralda-rosalina');
  const spec = getFactoryTemplate(templateKey);
  if (!spec) throw httpError(400, 'FACTORY_TEMPLATE_UNSUPPORTED', `Template Factory V2 não suportado: ${templateKey || '(vazio)'}.`);

  const coupleNames = clean(input.coupleNames || input.clientName);
  const slug = slugify(input.slug || coupleNames);
  if (!coupleNames) throw httpError(400, 'COUPLE_NAMES_REQUIRED', 'Indique o nome do casal.');
  if (!slug || slug.length < 3) throw httpError(400, 'INVALID_SLUG', 'Slug inválido.');

  const draft = emptyInviteContentV2();
  draft.identity = {
    ...draft.identity,
    slug,
    packageKey: spec.packageKey,
    templateKey: spec.key,
    eventType: clean(input.eventType) || 'Casamento',
    language: clean(input.language) || 'Português'
  };
  draft.people = {
    ...draft.people,
    coupleNames,
    displayNames: clean(input.displayNames) || coupleNames,
    bride: clean(input.bride),
    groom: clean(input.groom),
    monogram: clean(input.monogram) || initialsFromCouple(input.bride, input.groom, coupleNames)
  };
  draft.event = {
    ...draft.event,
    dateISO: clean(input.eventDateISO || input.dateISO),
    dateLabel: clean(input.dateLabel),
    rsvpDeadline: clean(input.rsvpDeadline),
    timezone: clean(input.timezone) || 'Africa/Maputo'
  };
  draft.access = {
    ...draft.access,
    mode: spec.accessMode,
    rsvpIdentity: 'guest_token',
    requireNameOnActions: false,
    maxGuestsPerRsvp: 1,
    allowCompanionName: false,
    autoCreateGuestOnRsvp: false,
    autoCreateGuestOnGift: false
  };
  draft.gifts = {
    ...draft.gifts,
    mode: spec.giftsMode,
    catalogMode: 'legacy',
    options: []
  };
  draft.runtime = { contentMode: LEGACY_MODE, rendererVersion: 'v2' };
  draft.seo = {
    ...draft.seo,
    title: coupleNames ? `${coupleNames} · Lirandzo` : '',
    description: ''
  };

  return normalizeInviteContentV2(draft);
}

function factoryMarker(invite) {
  const config = invite && invite.config && typeof invite.config === 'object' ? invite.config : {};
  const marker = config.factoryV2 && typeof config.factoryV2 === 'object' ? config.factoryV2 : {};
  return {
    managed: Number(marker.version || 0) === FACTORY_VERSION && Boolean(getFactoryTemplate(marker.templateKey)),
    version: Number(marker.version || 0),
    templateKey: clean(marker.templateKey || config.templateKey),
    contentMode: norm(config.contentMode) === ACTIVE_MODE ? ACTIVE_MODE : LEGACY_MODE
  };
}

function publicSiteBase() {
  return clean(process.env.PUBLIC_SITE_URL || 'https://lirandzo.com').replace(/\/+$/, '');
}

function apiBase() {
  return clean(process.env.PUBLIC_API_BASE_URL || 'https://api-casamento-mj.onrender.com').replace(/\/+$/, '');
}

function invitesBasePath() {
  return clean(process.env.INVITES_BASE_PATH || 'convite').replace(/^\/+|\/+$/g, '') || 'convite';
}

function defaultPublicUrl(slug) {
  return `${publicSiteBase()}/${invitesBasePath()}/${slug}/`;
}

function githubReady() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_BRANCH);
}

async function gh(path, options = {}) {
  if (!githubReady()) throw httpError(503, 'GITHUB_NOT_CONFIGURED', 'GitHub não configurado para o Template Factory V2.');
  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw httpError(502, 'GITHUB_OPERATION_FAILED', data?.message || text || `Erro GitHub ${response.status}.`);
  return data;
}

function isTextFile(path) {
  return /\.(html|css|js|json|md|txt|svg|xml|webmanifest|yml|yaml)$/i.test(path);
}

function applyTemplateReplacements(content, ctx, filePath = '') {
  let out = String(content || '');
  const replacements = {
    __INVITE_SLUG__: ctx.slug,
    __API_BASE_URL__: ctx.apiBaseUrl,
    __API_URL__: `${ctx.apiBaseUrl}/api`,
    __COUPLE_NAMES__: ctx.coupleNames,
    __CLIENT_NAME__: ctx.clientName,
    __BRIDE_NAME__: ctx.bride || '',
    __GROOM_NAME__: ctx.groom || '',
    __PACKAGE_KEY__: ctx.packageKey,
    __PUBLIC_URL__: ctx.publicUrl
  };
  for (const [key, value] of Object.entries(replacements)) out = out.split(key).join(String(value || ''));

  if (/\.html$/i.test(filePath) && !out.includes('client-config.js')) {
    out = out.replace(/<\/head>/i, '  <script src="./client-config.js"></script>\n</head>');
  }
  return out;
}

function buildLegacyEventData(invite, templateKey) {
  const payload = {
    schemaVersion: '2.0',
    slug: invite.slug,
    apiUrl: `${apiBase()}/api`,
    identity: { slug: invite.slug, packageKey: invite.packageKey, templateKey },
    people: { coupleNames: invite.coupleNames || '', displayNames: invite.coupleNames || '', bride: invite.bride || '', groom: invite.groom || '' },
    event: { dateISO: invite.eventDateISO || '', rsvpDeadline: invite.rsvpDeadline || '' },
    schedule: [],
    story: { title: 'A Nossa História', text: '', chapters: [], letter: '' },
    access: { mode: 'nominal', rsvpIdentity: 'guest_token', maxGuestsPerRsvp: 1 },
    features: { story: true, gallery: true, rsvp: true, dressCode: true, gifts: true, contributions: true, messages: true, checkin: true, capsule: true, guestInfo: true, menu: true },
    gifts: { mode: 'monetary', catalogMode: 'legacy', options: [] },
    payments: { bankAccounts: [], mobilePayments: [] },
    support: { text: '', contacts: [], whatsapp: '', whatsappSecondary: '' },
    gallery: { title: 'Momentos', items: [] },
    dressCode: { title: '', note: '', image: '' },
    menu: { title: '', note: '', items: [] },
    media: { heroImage: '', coverImage: '', storyImage: '', musicUrl: '' },
    seo: { title: `${invite.coupleNames || 'Convite'} · Lirandzo`, description: '', image: '' },
    runtime: { contentMode: LEGACY_MODE, rendererVersion: 'v2' }
  };
  return `window.LIRANDZO_EVENT_DATA = ${JSON.stringify(payload, null, 2)};\n`;
}

async function copyFactoryTemplateToGitHub(invite, spec) {
  const templatePath = spec.templatePath;
  const targetPath = `${invitesBasePath()}/${invite.slug}`;
  const branch = process.env.GITHUB_BRANCH;
  const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await gh(`/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;
  const fullTree = await gh(`/git/trees/${baseTreeSha}?recursive=1`);
  const all = fullTree.tree || [];
  const files = all.filter(item => item.type === 'blob' && item.path.startsWith(`${templatePath}/`));
  if (!files.length) throw httpError(500, 'FACTORY_TEMPLATE_FILES_MISSING', `Nenhum ficheiro encontrado no template ${templatePath}.`);
  if (all.some(item => item.path.startsWith(`${targetPath}/`))) {
    throw httpError(409, 'FACTORY_TARGET_EXISTS', `A pasta ${targetPath} já existe no GitHub.`);
  }

  const ctx = {
    slug: invite.slug,
    apiBaseUrl: apiBase(),
    coupleNames: invite.coupleNames || '',
    clientName: invite.clientName || invite.coupleNames || '',
    bride: invite.bride || '',
    groom: invite.groom || '',
    packageKey: invite.packageKey,
    publicUrl: invite.publicUrl || defaultPublicUrl(invite.slug)
  };
  const tree = [];

  for (const file of files) {
    const relative = file.path.slice(templatePath.length + 1);
    if (!relative || relative === 'TEMPLATE-LIRANDZO.txt' || relative === 'client-config.js' || relative === 'event-data.js') continue;
    const path = `${targetPath}/${relative}`;
    if (isTextFile(file.path)) {
      const blob = await gh(`/git/blobs/${file.sha}`);
      const raw = Buffer.from(blob.content || '', 'base64').toString('utf8');
      tree.push({ path, mode: '100644', type: 'blob', content: applyTemplateReplacements(raw, ctx, file.path) });
    } else {
      tree.push({ path, mode: '100644', type: 'blob', sha: file.sha });
    }
  }

  tree.push({
    path: `${targetPath}/client-config.js`,
    mode: '100644',
    type: 'blob',
    content: `window.LIRANDZO_INVITE_SLUG = ${JSON.stringify(invite.slug)};\nwindow.LIRANDZO_API_BASE_URL = ${JSON.stringify(apiBase())};\nwindow.LIRANDZO_API_URL = window.LIRANDZO_API_BASE_URL.replace(/\\/+$/, '') + '/api';\n`
  });
  tree.push({
    path: `${targetPath}/event-data.js`,
    mode: '100644',
    type: 'blob',
    content: buildLegacyEventData(invite, spec.key)
  });
  tree.push({
    path: `${targetPath}/invite-data.json`,
    mode: '100644',
    type: 'blob',
    content: JSON.stringify({
      factoryVersion: FACTORY_VERSION,
      templateKey: spec.key,
      slug: invite.slug,
      coupleNames: invite.coupleNames,
      packageKey: invite.packageKey,
      publicUrl: invite.publicUrl,
      createdAt: new Date().toISOString()
    }, null, 2)
  });

  const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTreeSha, tree }) });
  const newCommit = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: `Criar convite ${invite.slug} via ${spec.key}`,
      tree: newTree.sha,
      parents: [baseCommitSha]
    })
  });
  await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
  return { path: targetPath, commitSha: newCommit.sha, copiedFiles: tree.length };
}

async function strictTransaction(mongoose, work) {
  if (!mongoose || typeof mongoose.startSession !== 'function') throw httpError(500, 'TRANSACTION_UNAVAILABLE', 'MongoDB transaction API indisponível.');
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

function roleOf(req) {
  return req && req.manager && req.manager.role ? String(req.manager.role) : '';
}

function asyncWrapper(fn) {
  return function templateFactoryAsyncRoute(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function resolveInviteById({ Invite, mongoose }, id, session = null) {
  const raw = clean(id);
  if (!mongoose.Types.ObjectId.isValid(raw)) throw httpError(400, 'INVALID_INVITE_ID', 'ID do convite inválido.');
  let query = Invite.findById(raw);
  if (session && query && typeof query.session === 'function') query = query.session(session);
  const invite = await query;
  if (!invite) throw httpError(404, 'INVITE_NOT_FOUND', 'Convite não encontrado.');
  return invite;
}

function activationBlockers(invite, content) {
  const blockers = [];
  const marker = factoryMarker(invite);
  const spec = getFactoryTemplate(marker.templateKey);
  if (!marker.managed) blockers.push('FACTORY_MARKER_MISSING');
  if (!spec) blockers.push('FACTORY_TEMPLATE_UNSUPPORTED');
  if (marker.contentMode !== LEGACY_MODE) blockers.push('CONTENT_MODE_NOT_LEGACY');
  if (!content) blockers.push('INVITE_CONTENT_MISSING');
  if (blockers.length) return blockers;

  const published = normalizeInviteContentV2(content.published || {});
  const validation = validateInviteContentV2(published, { stage: 'publish' });
  if (Number(content.publishedRevision || 0) < 1) blockers.push('PUBLISHED_REVISION_MISSING');
  if (!validation.valid) blockers.push('PUBLISHED_NOT_VALID');
  if (norm(published?.identity?.slug) !== norm(invite.slug)) blockers.push('PUBLISHED_SLUG_MISMATCH');
  if (norm(published?.identity?.packageKey) !== spec.packageKey) blockers.push('PUBLISHED_PACKAGE_MISMATCH');
  if (clean(published?.identity?.templateKey) !== spec.key) blockers.push('PUBLISHED_TEMPLATE_MISMATCH');
  if (norm(published?.runtime?.contentMode) !== LEGACY_MODE) blockers.push('PUBLISHED_RUNTIME_NOT_LEGACY');
  return blockers;
}

function cleanFactoryInvite(invite) {
  const marker = factoryMarker(invite);
  return {
    id: String(invite?._id || ''),
    slug: clean(invite?.slug),
    coupleNames: clean(invite?.coupleNames),
    packageKey: clean(invite?.packageKey),
    status: clean(invite?.status),
    publicUrl: clean(invite?.publicUrl),
    githubPath: clean(invite?.githubPath),
    contentMode: marker.contentMode,
    factoryManaged: marker.managed,
    templateKey: marker.templateKey,
    factoryVersion: marker.version
  };
}

function registerTemplateFactoryV2Routes(app, deps = {}) {
  const {
    mongoose,
    Invite,
    InviteContent,
    InviteContentRevision,
    Activity,
    requireManager,
    requireAdmin,
    asyncRoute
  } = deps;
  for (const [name, value] of Object.entries({ mongoose, Invite, InviteContent, InviteContentRevision, requireManager, requireAdmin })) {
    if (!value) throw new Error(`Dependência Template Factory V2 em falta: ${name}`);
  }
  const wrap = typeof asyncRoute === 'function' ? asyncRoute : asyncWrapper;

  app.get('/manager/template-factory/templates', requireManager, wrap(async (req, res) => {
    res.json({ status: 'success', data: listFactoryTemplates() });
  }));

  app.post('/manager/template-factory/invites', requireManager, requireAdmin, wrap(async (req, res) => {
    const body = req.body || {};
    const spec = getFactoryTemplate(body.templateKey || 'esmeralda-rosalina');
    if (!spec) throw httpError(400, 'FACTORY_TEMPLATE_UNSUPPORTED', 'Template Factory V2 não suportado.');

    const draft = buildStarterDraft({ ...body, templateKey: spec.key });
    const draftValidation = validateInviteContentV2(draft, { stage: 'draft' });
    if (!draftValidation.valid) throw httpError(422, 'FACTORY_DRAFT_INVALID', 'O Draft inicial do template não passou na validação.', draftValidation);

    const slug = draft.identity.slug;
    if (await Invite.exists({ slug })) throw httpError(409, 'INVITE_SLUG_EXISTS', `Já existe um convite com o slug ${slug}.`);

    const targetPath = `${invitesBasePath()}/${slug}`;
    const now = new Date();
    const result = await strictTransaction(mongoose, async session => {
      let existingQuery = Invite.findOne({ slug });
      if (existingQuery && typeof existingQuery.session === 'function') existingQuery = existingQuery.session(session);
      if (await existingQuery) throw httpError(409, 'INVITE_SLUG_EXISTS', `Já existe um convite com o slug ${slug}.`);

      const invite = new Invite({
        slug,
        clientName: clean(body.clientName || draft.people.coupleNames),
        coupleNames: draft.people.coupleNames,
        bride: draft.people.bride,
        groom: draft.people.groom,
        packageKey: spec.packageKey,
        status: 'draft',
        eventDateISO: draft.event.dateISO,
        rsvpDeadline: draft.event.rsvpDeadline,
        publicUrl: clean(body.publicUrl) || defaultPublicUrl(slug),
        githubPath: targetPath,
        config: {
          contentMode: LEGACY_MODE,
          templateKey: spec.key,
          factoryV2: { version: FACTORY_VERSION, templateKey: spec.key, createdAt: now.toISOString() }
        }
      });
      await invite.save({ session });

      const hash = contentHash(draftValidation.content);
      const docs = await InviteContent.create([{
        inviteId: invite._id,
        slug,
        schemaVersion: draftValidation.content.schemaVersion,
        draft: draftValidation.content,
        published: {},
        draftRevision: 1,
        publishedRevision: 0,
        lastEditedByRole: roleOf(req)
      }], { session });
      const content = docs[0];

      await InviteContentRevision.create([{
        inviteId: invite._id,
        slug,
        revision: 1,
        stage: 'draft',
        schemaVersion: draftValidation.content.schemaVersion,
        content: draftValidation.content,
        contentHash: hash,
        note: `Draft inicial criado pelo Template Factory V2 (${spec.key}).`,
        createdByRole: roleOf(req)
      }], { session });

      if (Activity) {
        await Activity.create([{
          inviteId: invite._id,
          slug,
          type: 'builder-v2-template-factory-created',
          title: 'Convite V2 criado a partir de template',
          detail: spec.label,
          meta: { templateKey: spec.key, draftRevision: 1, contentHash: hash },
          timestamp: now
        }], { session });
      }

      return { invite, content, hash };
    });

    let github;
    try {
      github = await copyFactoryTemplateToGitHub(result.invite, spec);
    } catch (error) {
      await strictTransaction(mongoose, async session => {
        await InviteContentRevision.deleteMany({ inviteId: result.invite._id }).session(session);
        await InviteContent.deleteMany({ inviteId: result.invite._id }).session(session);
        await Invite.deleteOne({ _id: result.invite._id, slug }).session(session);
      });
      throw error;
    }

    await Invite.updateOne({ _id: result.invite._id }, { $set: { githubPath: github.path, githubLastCommitSha: github.commitSha } });
    const freshInvite = await Invite.findById(result.invite._id);

    res.status(201).json({
      status: 'success',
      message: 'Convite criado pelo Template Factory V2. Edite o Draft no Construtor antes de publicar.',
      data: {
        invite: cleanFactoryInvite(freshInvite),
        draftRevision: 1,
        publishedRevision: 0,
        draftHash: result.hash,
        github
      }
    });
  }));

  app.post('/manager/template-factory/invites/:id/activate', requireManager, requireAdmin, wrap(async (req, res) => {
    const result = await strictTransaction(mongoose, async session => {
      const invite = await resolveInviteById({ Invite, mongoose }, req.params.id, session);
      let contentQuery = InviteContent.findOne({ inviteId: invite._id });
      if (contentQuery && typeof contentQuery.session === 'function') contentQuery = contentQuery.session(session);
      const content = await contentQuery;
      const blockers = activationBlockers(invite, content);
      if (blockers.length) throw httpError(409, 'FACTORY_ACTIVATION_BLOCKED', 'Activação V2 bloqueada.', { blockers });

      const update = await Invite.updateOne(
        { _id: invite._id, slug: invite.slug, 'config.contentMode': LEGACY_MODE },
        { $set: { 'config.contentMode': ACTIVE_MODE, status: 'published', publishedAt: invite.publishedAt || new Date() } },
        { session }
      );
      if (update.matchedCount !== 1 || update.modifiedCount !== 1) throw httpError(409, 'FACTORY_ACTIVATION_RACE', 'O estado do convite mudou antes da activação.');

      if (Activity) {
        await Activity.create([{
          inviteId: invite._id,
          slug: invite.slug,
          type: 'builder-v2-template-factory-activated',
          title: 'Renderer V2 activado',
          detail: factoryMarker(invite).templateKey,
          meta: { publishedRevision: Number(content.publishedRevision || 0), publishHash: clean(content.publishHash) },
          timestamp: new Date()
        }], { session });
      }
      return { inviteId: invite._id, publishedRevision: Number(content.publishedRevision || 0), publishHash: clean(content.publishHash) };
    });

    const freshInvite = await Invite.findById(result.inviteId);
    res.json({ status: 'success', message: 'Renderer V2 activado.', data: { invite: cleanFactoryInvite(freshInvite), publishedRevision: result.publishedRevision, publishHash: result.publishHash } });
  }));

  app.post('/manager/template-factory/invites/:id/rollback', requireManager, requireAdmin, wrap(async (req, res) => {
    const result = await strictTransaction(mongoose, async session => {
      const invite = await resolveInviteById({ Invite, mongoose }, req.params.id, session);
      const marker = factoryMarker(invite);
      if (!marker.managed) throw httpError(409, 'FACTORY_ROLLBACK_BLOCKED', 'Este convite não é gerido pelo Template Factory V2.');
      if (marker.contentMode === LEGACY_MODE) return { inviteId: invite._id, unchanged: true };

      const update = await Invite.updateOne(
        { _id: invite._id, slug: invite.slug, 'config.contentMode': ACTIVE_MODE },
        { $set: { 'config.contentMode': LEGACY_MODE } },
        { session }
      );
      if (update.matchedCount !== 1 || update.modifiedCount !== 1) throw httpError(409, 'FACTORY_ROLLBACK_RACE', 'O estado do convite mudou antes do rollback.');

      if (Activity) {
        await Activity.create([{
          inviteId: invite._id,
          slug: invite.slug,
          type: 'builder-v2-template-factory-rollback',
          title: 'Renderer V2 devolvido a legacy',
          detail: marker.templateKey,
          meta: {},
          timestamp: new Date()
        }], { session });
      }
      return { inviteId: invite._id, unchanged: false };
    });

    const freshInvite = await Invite.findById(result.inviteId);
    res.json({ status: 'success', message: result.unchanged ? 'Renderer já estava em legacy.' : 'Rollback para legacy concluído.', data: { invite: cleanFactoryInvite(freshInvite), unchanged: result.unchanged } });
  }));

  return {
    managerRoutes: [
      'GET /manager/template-factory/templates',
      'POST /manager/template-factory/invites',
      'POST /manager/template-factory/invites/:id/activate',
      'POST /manager/template-factory/invites/:id/rollback'
    ]
  };
}

module.exports = {
  FACTORY_VERSION,
  FACTORY_TEMPLATES,
  LEGACY_MODE,
  ACTIVE_MODE,
  contentHash,
  getFactoryTemplate,
  listFactoryTemplates,
  buildStarterDraft,
  factoryMarker,
  activationBlockers,
  buildLegacyEventData,
  applyTemplateReplacements,
  cleanFactoryInvite,
  registerTemplateFactoryV2Routes
};
