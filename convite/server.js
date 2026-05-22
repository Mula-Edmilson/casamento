require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_API_BASE_URL = stripTrailingSlash(process.env.PUBLIC_API_BASE_URL || `http://localhost:${PORT}`);

app.set('trust proxy', 1);
app.use(express.json({ limit: process.env.JSON_LIMIT || '12mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '12mb' }));

const allowedOrigins = Array.from(new Set([
  ...(process.env.ALLOWED_ORIGINS || '').split(','),
  process.env.PUBLIC_SITE_URL || '',
  'https://lirandzo.com',
  'https://www.lirandzo.com'
]
  .map(v => String(v || '').trim().replace(/\/+$/, ''))
  .filter(Boolean)));

const corsOptions = {
  origin(origin, cb) {
    const cleanOrigin = origin ? String(origin).replace(/\/+$/, '') : '';

    // Permite chamadas server-to-server, health checks e ferramentas internas sem Origin.
    if (!origin) return cb(null, true);

    if (allowedOrigins.includes(cleanOrigin)) {
      return cb(null, true);
    }

    // Não deixa a app rebentar por CORS; devolve erro controlado.
    return cb(new Error(`Origem não autorizada: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Invite-Slug']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

function asyncRoute(fn) {
  return function wrappedAsyncRoute(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024) }
});

function stripTrailingSlash(value) { return String(value || '').replace(/\/+$/, ''); }
function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function slugify(value) {
  return normalizeText(value)
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cleanHeaderKey(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}
function detectDelimiter(line) {
  const options = [';', '\t', ','];
  let best = ';';
  let bestCount = -1;
  for (const delimiter of options) {
    const count = String(line || '').split(delimiter).length - 1;
    if (count > bestCount) { best = delimiter; bestCount = count; }
  }
  return best;
}
function parseDelimitedLine(line, delimiter = ';') {
  const out = [];
  let current = '';
  let inQuotes = false;
  const d = delimiter === '\t' ? '\t' : delimiter;
  for (let i = 0; i < String(line || '').length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (char === d && !inQuotes) { out.push(current.trim()); current = ''; continue; }
    current += char;
  }
  out.push(current.trim());
  return out;
}
function looksLikeGuestHeader(fields) {
  const keys = fields.map(cleanHeaderKey);
  return keys.some(k => ['nome', 'name', 'convidado', 'guest', 'guestname'].includes(k)) ||
    keys.some(k => ['mesa', 'table'].includes(k)) ||
    keys.some(k => ['acompanhantes', 'companions', 'pessoas'].includes(k));
}
function getHeaderValue(row, headers, aliases, fallbackIndex = -1) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return row[idx] || '';
  }
  return fallbackIndex >= 0 ? (row[fallbackIndex] || '') : '';
}
function parseGuestImportText(text) {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  if (!rawLines.length) return [];
  const delimiter = detectDelimiter(rawLines[0]);
  let rows = rawLines.map(line => parseDelimitedLine(line, delimiter));
  let headers = [];
  if (looksLikeGuestHeader(rows[0])) {
    headers = rows.shift().map(cleanHeaderKey);
  }
  return rows.map((row, index) => {
    if (headers.length) {
      const name = getHeaderValue(row, headers, ['nome', 'name', 'convidado', 'guest', 'guestname'], 0);
      const table = getHeaderValue(row, headers, ['mesa', 'table'], 1);
      const companionsRaw = getHeaderValue(row, headers, ['acompanhantes', 'companions', 'pessoas', 'acompanhante'], 2);
      const phone = getHeaderValue(row, headers, ['telefone', 'phone', 'contacto', 'contato', 'celular'], 3);
      const notes = getHeaderValue(row, headers, ['notas', 'notes', 'observacoes', 'observacao'], 4);
      const category = getHeaderValue(row, headers, ['categoria', 'category', 'tipo'], 5);
      const numberRaw = getHeaderValue(row, headers, ['numero', 'n', 'nº', 'no', 'ordem', 'id'], 6);
      const oldToken = getHeaderValue(row, headers, ['tokenantigo', 'token', 'oldtoken'], 7);
      return { lineNumber: index + 1, raw: row.join(delimiter), name, table, companionsRaw, phone, notes, category, numberRaw, oldToken };
    }
    // Formato sem cabeçalho: Nome;Mesa;Acompanhantes;Telefone;Notas;Categoria;Número;Token antigo
    return {
      lineNumber: index + 1,
      raw: row.join(delimiter),
      name: row[0] || '',
      table: row[1] || '',
      companionsRaw: row[2] || '0',
      phone: row[3] || '',
      notes: row[4] || '',
      category: row[5] || '',
      numberRaw: row[6] || '',
      oldToken: row[7] || ''
    };
  });
}
function buildGuestNotes({ notes, number, category, oldToken }) {
  const parts = [];
  if (notes) parts.push(String(notes).trim());
  const meta = [];
  if (number) meta.push(`Nº ${number}`);
  if (category) meta.push(`Categoria: ${category}`);
  if (oldToken) meta.push(`Token antigo: ${oldToken}`);
  if (meta.length) parts.push(meta.join(' · '));
  return Array.from(new Set(parts.filter(Boolean))).join(' — ');
}

function base64url(input) { return Buffer.from(input).toString('base64url'); }
function generateGuestPublicToken() {
  return 'g_' + crypto.randomBytes(18).toString('hex');
}
async function ensureGuestInviteToken(invite, guest) {
  if (!guest) return '';
  if (!guest.inviteToken) {
    let token = generateGuestPublicToken();
    // Evita colisões raríssimas dentro do mesmo convite.
    // eslint-disable-next-line no-await-in-loop
    while (await Guest.exists({ inviteId: invite._id, inviteToken: token })) {
      token = generateGuestPublicToken();
    }
    guest.inviteToken = token;
    await guest.save();
  }
  return guest.inviteToken;
}
function nowIso() { return new Date().toISOString(); }
function parseBool(v) { return v === true || v === 'true' || v === '1' || v === 'on'; }
function packageLabel(key) { return key === 'perola' ? 'Pérola' : key === 'esmeralda' ? 'Esmeralda' : key === 'rubi' ? 'Rubi' : key; }

function signToken(payload) {
  const secret = process.env.MANAGER_SECRET;
  if (!secret || secret.length < 16) throw new Error('MANAGER_SECRET precisa de pelo menos 16 caracteres.');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT-LIRANDZO' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
function verifyToken(token) {
  try {
    const secret = process.env.MANAGER_SECRET;
    if (!token || !secret) return null;
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function requireManager(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'manager') return res.status(401).json({ status: 'error', message: 'Sessão inválida ou expirada.' });
  req.manager = payload;
  return next();
}
function sendJson(req, res, payload, status = 200) {
  const cb = req.query && req.query.callback;
  if (cb) {
    res.status(status).type('application/javascript').send(`${String(cb).replace(/[^\w.$]/g, '')}(${JSON.stringify(payload)});`);
  } else {
    res.status(status).json(payload);
  }
}

mongoose.set('strictQuery', true);

const InviteSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  clientName: { type: String, required: true, trim: true },
  coupleNames: { type: String, required: true, trim: true },
  bride: { type: String, default: '' },
  groom: { type: String, default: '' },
  packageKey: { type: String, enum: ['perola', 'esmeralda', 'rubi'], required: true, index: true },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  eventDateISO: { type: String, default: '' },
  rsvpDeadline: { type: String, default: '' },
  publicUrl: { type: String, default: '' },
  githubPath: { type: String, default: '' },
  githubLastCommitSha: { type: String, default: '' },
  publishedAt: { type: Date },
  config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

const GuestSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, index: true },
  status: { type: String, default: 'Não aberto', index: true },
  deviceToken: { type: String, default: '' },
  table: { type: String, default: '' },
  companions: { type: Number, default: 0, min: 0 },
  phone: { type: String, default: '' },
  notes: { type: String, default: '' },
  inviteToken: { type: String, default: '', index: true },
  number: { type: Number, default: 0, index: true },
  category: { type: String, default: '' },
  maxGuests: { type: Number, default: 1 },
  checkedIn: { type: Boolean, default: false },
  checkedInAt: { type: Date }
}, { timestamps: true });
GuestSchema.index({ inviteId: 1, normalizedName: 1 }, { unique: true });

const RsvpSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true, index: true },
  nome: { type: String, required: true },
  guests: { type: Number, default: 1 },
  phone: { type: String, default: '' },
  message: { type: String, default: '' },
  mesa: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });
RsvpSchema.index({ inviteId: 1, guestId: 1 }, { unique: true });

const MessageSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  nome: { type: String, required: true },
  message: { type: String, required: true },
  hidden: { type: Boolean, default: false, index: true },
  hiddenAt: { type: Date },
  hiddenBy: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const GiftItemSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, default: 'Geral' },
  reserved: { type: Boolean, default: false },
  reservedBy: { type: String, default: '' },
  reservedAt: { type: Date }
}, { timestamps: true });
GiftItemSchema.index({ inviteId: 1, name: 1 }, { unique: true });

const ContributionSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  nome: { type: String, required: true },
  canal: { type: String, default: '' },
  fileName: { type: String, default: '' },
  originalName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
  fileBase64: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });


const CheckInSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', index: true },
  token: { type: String, default: '', index: true },
  nome: { type: String, required: true },
  guests: { type: Number, default: 1 },
  mesa: { type: String, default: '' },
  operator: { type: String, default: '' },
  status: { type: String, default: 'checked-in' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });
CheckInSchema.index({ inviteId: 1, guestId: 1 }, { unique: true, sparse: true });

const CapsulePhotoSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  nome: { type: String, default: 'Convidado' },
  caption: { type: String, default: '' },
  fileName: { type: String, default: '' },
  originalName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
  fileBase64: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const ActivitySchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', index: true },
  slug: { type: String, default: '', index: true },
  type: { type: String, required: true, index: true },
  title: { type: String, required: true },
  detail: { type: String, default: '' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const Invite = mongoose.model('Invite', InviteSchema);
const Guest = mongoose.model('Guest', GuestSchema);
const Rsvp = mongoose.model('Rsvp', RsvpSchema);
const Message = mongoose.model('Message', MessageSchema);
const GiftItem = mongoose.model('GiftItem', GiftItemSchema);
const Contribution = mongoose.model('Contribution', ContributionSchema);
const CheckIn = mongoose.model('CheckIn', CheckInSchema);
const CapsulePhoto = mongoose.model('CapsulePhoto', CapsulePhotoSchema);
const Activity = mongoose.model('Activity', ActivitySchema);

function cleanInviteDoc(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id), slug: o.slug, clientName: o.clientName, coupleNames: o.coupleNames,
    bride: o.bride, groom: o.groom, packageKey: o.packageKey, packageLabel: packageLabel(o.packageKey),
    status: o.status, eventDateISO: o.eventDateISO, rsvpDeadline: o.rsvpDeadline,
    publicUrl: o.publicUrl, githubPath: o.githubPath, githubLastCommitSha: o.githubLastCommitSha,
    createdAt: o.createdAt, updatedAt: o.updatedAt, publishedAt: o.publishedAt, config: o.config || {}
  };
}
async function findInviteBySlug(slug) {
  const clean = slugify(slug);
  if (!clean) return null;
  return Invite.findOne({ slug: clean, status: { $ne: 'archived' } });
}
async function logActivity({ invite, type, title, detail = '', meta = {} }) {
  try { await Activity.create({ inviteId: invite?._id, slug: invite?.slug || '', type, title, detail, meta, timestamp: new Date() }); }
  catch (err) { console.error('Falha ao gravar actividade:', err.message); }
}
function getInvitesBasePath() { return (process.env.INVITES_BASE_PATH || 'convite').replace(/^\/+|\/+$/g, ''); }
function getTemplatePath(packageKey) {
  const key = String(packageKey || '').toLowerCase();
  const map = {
    perola: process.env.TEMPLATE_PEROLA_PATH || 'convite/templates/perola',
    'pérola': process.env.TEMPLATE_PEROLA_PATH || 'convite/templates/perola',
    esmeralda: process.env.TEMPLATE_ESMERALDA_PATH || 'convite/templates/esmeralda',
    rubi: process.env.TEMPLATE_RUBI_PATH || 'convite/templates/rubi'
  };
  return (map[key] || '').replace(/^\/+|\/+$/g, '');
}
function defaultPublicUrl(slug) {
  const base = stripTrailingSlash(process.env.PUBLIC_SITE_URL || 'https://lirandzo.com');
  return `${base}/${getInvitesBasePath()}/${slug}/`;
}

function githubReady() { return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_BRANCH); }
async function gh(path, options = {}) {
  if (!githubReady()) throw new Error('GitHub não configurado. Verifique GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO e GITHUB_BRANCH.');
  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...(options.headers || {})
    }
  });
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) throw new Error(data?.message || text || `Erro GitHub ${resp.status}`);
  return data;
}
function isTextFile(p) { return /\.(html|css|js|json|md|txt|svg|xml|webmanifest|yml|yaml)$/i.test(p); }
function applyTemplateReplacements(content, ctx, filePath = '') {
  let out = String(content || '');
  const replacements = {
    __INVITE_SLUG__: ctx.slug, __API_BASE_URL__: ctx.apiBaseUrl, __API_URL__: `${ctx.apiBaseUrl}/api`,
    __COUPLE_NAMES__: ctx.coupleNames, __CLIENT_NAME__: ctx.clientName, __BRIDE_NAME__: ctx.bride || '',
    __GROOM_NAME__: ctx.groom || '', __PACKAGE_KEY__: ctx.packageKey, __PUBLIC_URL__: ctx.publicUrl
  };
  for (const [k, v] of Object.entries(replacements)) out = out.split(k).join(String(v || ''));

  if (/\.html$/i.test(filePath) && !out.includes('client-config.js')) {
    out = out.replace(/<\/head>/i, '  <script src="./client-config.js"></script>\n</head>');
  }
  out = out.replace(/const\s+API_URL\s*=\s*[`'\"][^`'\"]*[`'\"]\s*;/g, `const API_URL = "${ctx.apiBaseUrl}/api";`);
  out = out.replace(/const\s+DEMO_MODE\s*=\s*true\s*;/g, 'const DEMO_MODE = false;');
  out = out.replace(/BASE_URL\s*:\s*[`'\"][^`'\"]*[`'\"]/g, `BASE_URL: "${ctx.apiBaseUrl}/api"`);
  out = out.replace(/mode\s*:\s*['"]no-cors['"]\s*,?/g, "mode: 'cors',");
  out = out.replace(/body\s*:\s*JSON\.stringify\(data\)/g, `body: JSON.stringify({ ...data, slug: window.LIRANDZO_INVITE_SLUG || "${ctx.slug}" })`);
  out = out.replace(/jsonpRequest\(`\$\{API_URL\}\?action=/g, 'jsonpRequest(`${API_URL}?slug=${window.LIRANDZO_INVITE_SLUG}&action=');
  out = out.replace(/fetch\(API_URL,\s*\{\s*method:\s*['"]POST['"]/g, `fetch(API_URL, { method: 'POST'`);
  if (out.includes('new FormData') && out.includes('fetch(API_URL')) {
    out = out.replace(/const response = await fetch\(API_URL,\s*\{/g, `if (!formData.has('slug')) formData.append('slug', window.LIRANDZO_INVITE_SLUG || "${ctx.slug}");\n        const response = await fetch(API_URL, {`);
  }
  return out;
}
async function copyPackageTemplateToClient({ invite, allowOverwrite = false }) {
  const templatePath = getTemplatePath(invite.packageKey);
  const targetPath = `${getInvitesBasePath()}/${invite.slug}`;
  const branch = process.env.GITHUB_BRANCH;
  const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await gh(`/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;
  const fullTree = await gh(`/git/trees/${baseTreeSha}?recursive=1`);
  const all = fullTree.tree || [];
  const files = all.filter(item => item.type === 'blob' && item.path.startsWith(`${templatePath}/`));
  if (!files.length) throw new Error(`Nenhum ficheiro encontrado no template: ${templatePath}`);
  const targetAlreadyExists = all.some(item => item.path.startsWith(`${targetPath}/`));
  if (targetAlreadyExists && !allowOverwrite) throw new Error(`A pasta ${targetPath} já existe no GitHub. Para evitar sobrescrever, use outro slug.`);

  const ctx = { slug: invite.slug, apiBaseUrl: PUBLIC_API_BASE_URL, coupleNames: invite.coupleNames, clientName: invite.clientName, bride: invite.bride, groom: invite.groom, packageKey: invite.packageKey, publicUrl: invite.publicUrl };
  const treeItems = [];
  for (const file of files) {
    const relative = file.path.slice(templatePath.length + 1);
    if (!relative || relative === 'TEMPLATE-LIRANDZO.txt') continue;
    const newPath = `${targetPath}/${relative}`;
    if (isTextFile(file.path)) {
      const blob = await gh(`/git/blobs/${file.sha}`);
      const raw = Buffer.from(blob.content || '', 'base64').toString('utf8');
      treeItems.push({ path: newPath, mode: '100644', type: 'blob', content: applyTemplateReplacements(raw, ctx, file.path) });
    } else {
      treeItems.push({ path: newPath, mode: '100644', type: 'blob', sha: file.sha });
    }
  }
  treeItems.push({ path: `${targetPath}/client-config.js`, mode: '100644', type: 'blob', content: `window.LIRANDZO_INVITE_SLUG = ${JSON.stringify(invite.slug)};\nwindow.LIRANDZO_API_BASE_URL = ${JSON.stringify(PUBLIC_API_BASE_URL)};\nwindow.LIRANDZO_API_URL = window.LIRANDZO_API_BASE_URL.replace(/\\/+$/, '') + '/api';\n` });
  treeItems.push({ path: `${targetPath}/invite-data.json`, mode: '100644', type: 'blob', content: JSON.stringify({ slug: invite.slug, coupleNames: invite.coupleNames, clientName: invite.clientName, packageKey: invite.packageKey, publicUrl: invite.publicUrl, createdAt: nowIso() }, null, 2) });
  const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }) });
  const newCommit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: `Criar convite ${invite.slug} (${packageLabel(invite.packageKey)})`, tree: newTree.sha, parents: [baseCommitSha] }) });
  await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
  return { path: targetPath, commitSha: newCommit.sha, copiedFiles: treeItems.length };
}

const DEFAULT_GIFTS = ['Geleira', 'Fogão', 'Congelador', 'TV', 'Batedeira', 'Mesa', 'Cadeira', 'Panela', 'Ar Condicionado', 'Micro-ondas', 'Ferro a vapor', 'Mesa de centro', 'Vaso', 'Pratos', 'Colcha', 'Cobertor', 'Colchão', 'Forno eléctrico', 'Jogo de facas', 'Máquina de lavar', 'Tapete', 'Saladeira', 'Panela de pressão', 'Porta-temperos', 'Copos', 'Fritadeira eléctrica', 'Bandeja', 'Torradeira', 'Frigideira eléctrica'];
async function seedDefaultGifts(invite) {
  for (const name of DEFAULT_GIFTS) {
    await GiftItem.findOneAndUpdate({ inviteId: invite._id, name }, { $setOnInsert: { inviteId: invite._id, slug: invite.slug, name, category: 'Geral', reserved: false } }, { upsert: true });
  }
}

app.get('/health', async (req, res) => res.json({ status: 'ok', service: 'lirandzo-adminmanager', mongo: mongoose.connection.readyState === 1 ? 'connected' : 'not_connected', githubConfigured: githubReady() }));

app.post('/manager/login', (req, res) => {
  const { password } = req.body || {};
  if (!process.env.MANAGER_PASSWORD) return res.status(500).json({ status: 'error', message: 'MANAGER_PASSWORD não configurado no Render.' });
  if (String(password || '') !== String(process.env.MANAGER_PASSWORD)) return res.status(401).json({ status: 'error', message: 'Senha incorrecta.' });
  if (!process.env.MANAGER_SECRET) {
    // Compatibilidade: permite o admin.html validar a senha mesmo em deployments antigos sem MANAGER_SECRET.
    // As acções sensíveis continuam protegidas pela própria senha em /admin-api.
    return res.json({ status: 'success', token: '', message: 'Sessão validada por senha.' });
  }
  const token = signToken({ role: 'manager', iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 12 });
  res.json({ status: 'success', token });
});

app.get('/manager/summary', requireManager, async (req, res) => {
  const [totalInvites, published, draft, guests, rsvps, messages, contributions, activities] = await Promise.all([
    Invite.countDocuments({ status: { $ne: 'archived' } }), Invite.countDocuments({ status: 'published' }), Invite.countDocuments({ status: 'draft' }), Guest.countDocuments({}), Rsvp.countDocuments({}), Message.countDocuments({}), Contribution.countDocuments({}), Activity.find({}).sort({ timestamp: -1 }).limit(25)
  ]);
  res.json({ status: 'success', data: { totalInvites, published, draft, guests, rsvps, messages, contributions, activities } });
});
app.get('/manager/github/status', requireManager, (req, res) => res.json({ status: 'success', data: { configured: githubReady(), owner: process.env.GITHUB_OWNER || '', repo: process.env.GITHUB_REPO || '', branch: process.env.GITHUB_BRANCH || '', invitesBasePath: getInvitesBasePath(), templates: { perola: getTemplatePath('perola'), esmeralda: getTemplatePath('esmeralda'), rubi: getTemplatePath('rubi') } } }));

app.get('/manager/invites', requireManager, async (req, res) => {
  const { q = '', status = 'all', packageKey = 'all' } = req.query;
  const filter = { status: { $ne: 'archived' } };
  if (status !== 'all') filter.status = status;
  if (packageKey !== 'all') filter.packageKey = packageKey;
  if (q) { const rx = new RegExp(escapeRegex(q), 'i'); filter.$or = [{ slug: rx }, { clientName: rx }, { coupleNames: rx }]; }
  const invites = await Invite.find(filter).sort({ updatedAt: -1 });
  const ids = invites.map(i => i._id);
  const [guestStats, rsvpStats] = await Promise.all([
    Guest.aggregate([{ $match: { inviteId: { $in: ids } } }, { $group: { _id: '$inviteId', count: { $sum: 1 } } }]),
    Rsvp.aggregate([{ $match: { inviteId: { $in: ids } } }, { $group: { _id: '$inviteId', count: { $sum: 1 } } }])
  ]);
  const guestMap = new Map(guestStats.map(s => [String(s._id), s.count]));
  const rsvpMap = new Map(rsvpStats.map(s => [String(s._id), s.count]));
  res.json({ status: 'success', data: invites.map(invite => ({ ...cleanInviteDoc(invite), stats: { guests: guestMap.get(String(invite._id)) || 0, rsvps: rsvpMap.get(String(invite._id)) || 0 } })) });
});

app.post('/manager/invites', requireManager, async (req, res) => {
  const body = req.body || {};
  const packageKey = String(body.packageKey || '').toLowerCase();
  if (!['perola', 'esmeralda', 'rubi'].includes(packageKey)) return res.status(400).json({ status: 'error', message: 'Pacote inválido. Use perola, esmeralda ou rubi.' });
  const slug = slugify(body.slug || body.coupleNames || body.clientName);
  if (!slug || slug.length < 3) return res.status(400).json({ status: 'error', message: 'Slug inválido.' });
  const exists = await Invite.findOne({ slug });
  if (exists) return res.status(409).json({ status: 'error', message: `Já existe um convite com o slug ${slug}.` });
  const githubPath = `${getInvitesBasePath()}/${slug}`;
  const publicUrl = body.publicUrl || defaultPublicUrl(slug);
  let invite = await Invite.create({
    slug, clientName: String(body.clientName || body.coupleNames || slug).trim(), coupleNames: String(body.coupleNames || body.clientName || slug).trim(), bride: String(body.bride || '').trim(), groom: String(body.groom || '').trim(), packageKey,
    status: parseBool(body.createAsPublished) ? 'published' : 'draft', eventDateISO: String(body.eventDateISO || '').trim(), rsvpDeadline: String(body.rsvpDeadline || '').trim(), publicUrl, githubPath, publishedAt: parseBool(body.createAsPublished) ? new Date() : undefined, config: body.config && typeof body.config === 'object' ? body.config : {}
  });
  await seedDefaultGifts(invite);
  let github = null;
  if (parseBool(body.copyToGithub)) {
    try { github = await copyPackageTemplateToClient({ invite }); invite.githubPath = github.path; invite.githubLastCommitSha = github.commitSha; await invite.save(); await logActivity({ invite, type: 'github', title: 'Pasta criada no GitHub', detail: github.path, meta: github }); }
    catch (err) { await logActivity({ invite, type: 'warning', title: 'Convite criado sem cópia GitHub', detail: err.message }); return res.status(201).json({ status: 'warning', message: `Convite criado na base de dados, mas a cópia GitHub falhou: ${err.message}`, data: cleanInviteDoc(invite), github: null }); }
  }
  await logActivity({ invite, type: 'invite', title: 'Convite criado', detail: `${invite.coupleNames} · ${packageLabel(packageKey)}` });
  res.status(201).json({ status: 'success', message: `Convite criado com sucesso: ${publicUrl}`, data: cleanInviteDoc(invite), github });
});

app.get('/manager/invites/:id', requireManager, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  const [guests, rsvps, messages, gifts, contributions] = await Promise.all([
    Guest.find({ inviteId: invite._id }).sort({ name: 1 }).limit(1000), Rsvp.find({ inviteId: invite._id }).sort({ timestamp: -1 }).limit(500), Message.find({ inviteId: invite._id }).sort({ timestamp: -1 }).limit(500), GiftItem.find({ inviteId: invite._id }).sort({ name: 1 }).limit(500), Contribution.find({ inviteId: invite._id }).sort({ timestamp: -1 }).limit(200).select('-fileBase64')
  ]);
  res.json({ status: 'success', data: { invite: cleanInviteDoc(invite), guests, rsvps, messages, gifts, contributions } });
});
app.patch('/manager/invites/:id', requireManager, async (req, res) => {
  const allowed = ['clientName', 'coupleNames', 'bride', 'groom', 'status', 'eventDateISO', 'rsvpDeadline', 'publicUrl', 'config'];
  const update = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
  if (update.status === 'published') update.publishedAt = new Date();
  const invite = await Invite.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  await logActivity({ invite, type: 'invite', title: 'Convite actualizado', detail: invite.slug });
  res.json({ status: 'success', data: cleanInviteDoc(invite) });
});
app.delete('/manager/invites/:id', requireManager, async (req, res) => {
  const invite = await Invite.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  await logActivity({ invite, type: 'invite', title: 'Convite arquivado', detail: invite.slug });
  res.json({ status: 'success', data: cleanInviteDoc(invite) });
});
app.post('/manager/invites/:id/github-sync', requireManager, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);

  if (!invite) {
    return res.status(404).json({
      status: 'error',
      message: 'Convite não encontrado.'
    });
  }

  try {
    const github = await copyPackageTemplateToClient({ invite, allowOverwrite: false });

    invite.githubPath = github.path;
    invite.githubLastCommitSha = github.commitSha;
    await invite.save();

    await logActivity({
      invite,
      type: 'github',
      title: 'Pasta sincronizada no GitHub',
      detail: github.path,
      meta: github
    });

    return res.json({
      status: 'success',
      message: 'Pasta criada no GitHub com sucesso.',
      data: cleanInviteDoc(invite),
      github
    });
  } catch (err) {
    console.error('[github-sync] Falhou:', err);

    await logActivity({
      invite,
      type: 'warning',
      title: 'Falha ao sincronizar com GitHub',
      detail: err.message,
      meta: {
        slug: invite.slug,
        packageKey: invite.packageKey,
        githubPath: invite.githubPath,
        message: err.message
      }
    });

    return res.status(500).json({
      status: 'error',
      code: 'GITHUB_SYNC_FAILED',
      message: err.message || 'Erro ao criar a pasta no GitHub.',
      debug: {
        owner: process.env.GITHUB_OWNER || '',
        repo: process.env.GITHUB_REPO || '',
        branch: process.env.GITHUB_BRANCH || '',
        invitesBasePath: getInvitesBasePath(),
        templatePath: getTemplatePath(invite.packageKey),
        targetPath: `${getInvitesBasePath()}/${invite.slug}`,
        githubConfigured: githubReady()
      }
    });
  }
}));
app.post('/manager/invites/:id/guests/bulk', requireManager, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const parsedGuests = parseGuestImportText(req.body.text || '');
  if (!parsedGuests.length) {
    return res.status(400).json({ status: 'error', message: 'Nenhum convidado válido foi enviado.' });
  }

  const results = { inserted: 0, updated: 0, failed: [], total: parsedGuests.length };

  for (const entry of parsedGuests) {
    const nameRaw = String(entry.name || '').trim();
    if (!nameRaw) {
      results.failed.push({ line: entry.raw || '', error: `Linha ${entry.lineNumber}: nome vazio.` });
      continue;
    }

    const normalizedName = normalizeText(nameRaw);
    const companions = Math.max(0, Number.parseInt(entry.companionsRaw, 10) || 0);
    const number = Math.max(0, Number.parseInt(entry.numberRaw, 10) || 0);
    const category = String(entry.category || '').trim();
    const oldToken = String(entry.oldToken || '').trim();
    const notes = buildGuestNotes({ notes: entry.notes, number, category, oldToken });

    try {
      const existing = await Guest.findOne({ inviteId: invite._id, normalizedName });
      if (existing) {
        existing.name = nameRaw;
        existing.slug = invite.slug;
        existing.table = String(entry.table || '').trim();
        existing.companions = companions;
        existing.maxGuests = Math.max(1, 1 + companions);
        existing.phone = String(entry.phone || '').trim();
        existing.notes = notes;
        existing.category = category || existing.category || '';
        existing.number = number || existing.number || 0;
        if (!existing.status) existing.status = 'Não aberto';
        if (!existing.inviteToken) existing.inviteToken = generateGuestPublicToken();
        await existing.save();
        results.updated += 1;
      } else {
        await Guest.create({
          inviteId: invite._id,
          slug: invite.slug,
          name: nameRaw,
          normalizedName,
          status: 'Não aberto',
          deviceToken: '',
          table: String(entry.table || '').trim(),
          companions,
          maxGuests: Math.max(1, 1 + companions),
          phone: String(entry.phone || '').trim(),
          notes,
          category,
          number,
          inviteToken: generateGuestPublicToken()
        });
        results.inserted += 1;
      }
    } catch (err) {
      results.failed.push({ line: entry.raw || nameRaw, error: err.message });
    }
  }

  await logActivity({
    invite,
    type: 'guests',
    title: 'Lista de convidados importada',
    detail: `${results.inserted} novos · ${results.updated} actualizados · ${results.failed.length} falhas`
  });

  return res.json({ status: 'success', data: results });
});

app.post('/manager/invites/:id/guests/reset-access', requireManager, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const openedReset = await Guest.updateMany(
    { inviteId: invite._id, status: /^Convite Aberto$/i },
    { $set: { deviceToken: '', status: 'Não aberto' } }
  );
  const othersReset = await Guest.updateMany(
    { inviteId: invite._id, status: { $not: /^Convite Aberto$/i } },
    { $set: { deviceToken: '' } }
  );
  const total = Number(openedReset.modifiedCount || 0) + Number(othersReset.modifiedCount || 0);

  await logActivity({
    invite,
    type: 'guests',
    title: 'Acesso dos convidados reiniciado',
    detail: `${total} registo(s) actualizados`
  });

  return res.json({
    status: 'success',
    message: 'Acesso reiniciado. Os convidados poderão abrir novamente a partir de outro dispositivo.',
    data: { modified: total }
  });
});

app.post('/manager/invites/:id/gifts/reset-reservations', requireManager, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const result = await GiftItem.updateMany(
    { inviteId: invite._id },
    { $set: { reserved: false, reservedBy: '', reservedAt: null } }
  );

  await logActivity({
    invite,
    type: 'gift',
    title: 'Reservas de presentes reiniciadas',
    detail: `${result.modifiedCount || 0} presente(s) livres novamente`
  });

  return res.json({
    status: 'success',
    message: 'Reservas de presentes reiniciadas com sucesso.',
    data: { matched: result.matchedCount || 0, modified: result.modifiedCount || 0 }
  });
});

app.delete('/manager/invites/:id/gifts', requireManager, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const result = await GiftItem.deleteMany({ inviteId: invite._id });

  await logActivity({
    invite,
    type: 'gift',
    title: 'Lista de presentes limpa',
    detail: `${result.deletedCount || 0} presente(s) removido(s)`
  });

  return res.json({
    status: 'success',
    message: 'Lista de presentes eliminada deste convite.',
    data: { deleted: result.deletedCount || 0 }
  });
});

app.post('/manager/invites/:id/gifts/seed-defaults', requireManager, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  await seedDefaultGifts(invite);
  const total = await GiftItem.countDocuments({ inviteId: invite._id });

  await logActivity({
    invite,
    type: 'gift',
    title: 'Presentes padrão restaurados',
    detail: `${total} presente(s) disponíveis`
  });

  return res.json({
    status: 'success',
    message: 'Presentes padrão restaurados com sucesso.',
    data: { total }
  });
});

app.delete('/manager/invites/:id/purge', requireManager, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const inviteId = invite._id;
  const slug = invite.slug;
  const [guests, rsvps, messages, gifts, contributions, checkins, photos, activities] = await Promise.all([
    Guest.deleteMany({ inviteId }),
    Rsvp.deleteMany({ inviteId }),
    Message.deleteMany({ inviteId }),
    GiftItem.deleteMany({ inviteId }),
    Contribution.deleteMany({ inviteId }),
    CheckIn.deleteMany({ inviteId }),
    CapsulePhoto.deleteMany({ inviteId }),
    Activity.deleteMany({ inviteId })
  ]);
  await Invite.deleteOne({ _id: inviteId });

  return res.json({
    status: 'success',
    message: `Convite ${slug} eliminado do MongoDB. A pasta no GitHub não foi apagada.`,
    data: {
      slug,
      deleted: {
        guests: guests.deletedCount || 0,
        rsvps: rsvps.deletedCount || 0,
        messages: messages.deletedCount || 0,
        gifts: gifts.deletedCount || 0,
        contributions: contributions.deletedCount || 0,
        checkins: checkins.deletedCount || 0,
        photos: photos.deletedCount || 0,
        activities: activities.deletedCount || 0,
        invites: 1
      }
    }
  });
});

async function getInviteFromRequest(req) {
  const slug = req.body?.slug || req.query?.slug || req.headers['x-invite-slug'];
  return findInviteBySlug(slug);
}
app.get('/api/public/invites/:slug', async (req, res) => {
  const invite = await findInviteBySlug(req.params.slug);
  if (!invite) return sendJson(req, res, { status: 'error', message: 'Convite não encontrado.' }, 404);
  sendJson(req, res, { status: 'success', data: cleanInviteDoc(invite) });
});

app.get('/api', async (req, res) => {
  try {
    const invite = await getInviteFromRequest(req);
    if (!invite) return sendJson(req, res, { status: 'error', message: 'Slug do convite não enviado ou convite inexistente.' }, 400);
    const action = req.query.action;
    if (action === 'stats') return getPublicStats(req, res, invite);
    if (action === 'list_guests') return listGuests(req, res, invite);
    if (action === 'list_rsvps') return listRsvps(req, res, invite);
    if (action === 'list_gift_records') return listContributions(req, res, invite);
    if (action === 'list_messages' || action === 'messages' || action === 'get_messages') return listMessages(req, res, invite);
    if (action === 'list_checkins') return listCheckins(req, res, invite);
    if (action === 'list_capsule_photos') return listCapsulePhotos(req, res, invite);
    if (action === 'list_gifts' || action === 'gifts' || action === 'get_gift_items') return listGifts(req, res, invite);
    if (action === 'get_guest' || action === 'get_guest_details') return getGuestDetails(req, res, invite);
    if (action === 'get_rsvp_status') return getRsvpStatus(req, res, invite);
    return sendJson(req, res, { status: 'error', message: 'Ação GET não reconhecida.' }, 400);
  } catch (err) { sendJson(req, res, { status: 'error', message: err.message }, 500); }
});
app.post('/api', upload.any(), async (req, res) => {
  try {
    const invite = await getInviteFromRequest(req);
    if (!invite) return res.status(400).json({ status: 'error', message: 'Slug do convite não enviado ou convite inexistente.' });
    const action = req.body?.action;
    if (action === 'login') return handleLogin(req, res, invite);
    if (action === 'open_invite') return handleOpenInvite(req, res, invite);
    if (action === 'rsvp' || action === 'submit_rsvp') return handleRsvp(req, res, invite);
    if (action === 'rsvp_choice') return handleRsvpChoice(req, res, invite);
    if (action === 'post_message') return handlePostMessage(req, res, invite);
    if (action === 'save_gifts') return handleSaveGifts(req, res, invite);
    if (action === 'upload_comprovativo' || action === 'submit_contribution') return handleUploadComprovativo(req, res, invite);
    if (action === 'checkin_guest') return handleCheckinGuest(req, res, invite);
    if (action === 'save_capsule_photo' || action === 'upload_capsule_photo') return handleSaveCapsulePhoto(req, res, invite);
    return res.status(400).json({ status: 'error', message: 'Ação não reconhecida.' });
  } catch (err) { console.error('Erro /api:', err); return res.status(500).json({ status: 'error', message: 'Erro no servidor: ' + err.message }); }
});
app.post('/api/upload_comprovativo', upload.single('comprovativoFile'), async (req, res) => {
  try {
    const invite = await getInviteFromRequest(req);
    if (!invite) return res.status(400).json({ status: 'error', message: 'Slug do convite não enviado ou convite inexistente.' });
    return handleUploadComprovativo(req, res, invite);
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
app.get('/api/contributions/:id/file', async (req, res) => {
  const doc = await Contribution.findById(req.params.id);
  if (!doc || !doc.fileBase64) return res.status(404).send('Ficheiro não encontrado.');
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.send(Buffer.from(doc.fileBase64, 'base64'));
});
app.get('/api/messages', async (req, res) => { const invite = await getInviteFromRequest(req); if (!invite) return sendJson(req, res, { status: 'error', message: 'Slug do convite não enviado.' }, 400); return listMessages(req, res, invite); });
app.get('/api/gifts', async (req, res) => { const invite = await getInviteFromRequest(req); if (!invite) return sendJson(req, res, { status: 'error', message: 'Slug do convite não enviado.' }, 400); return listGifts(req, res, invite); });
app.all('/api/get-guest-details', async (req, res) => { const invite = await getInviteFromRequest(req); if (!invite) return sendJson(req, res, { status: 'error', message: 'Slug do convite não enviado.' }, 400); return getGuestDetails(req, res, invite); });

function validObjectId(value) { return mongoose.Types.ObjectId.isValid(String(value || '')); }
function adminIdFromPayload(data) { return String(data.id || data._id || data.messageId || data.rsvpId || data.checkinId || '').trim(); }
function requireAdminObjectId(value, label = 'ID') {
  const id = String(value || '').trim();
  if (!validObjectId(id)) {
    const err = new Error(`${label} inválido.`);
    err.statusCode = 400;
    throw err;
  }
  return id;
}
async function adminAddGuest(invite, data) {
  const name = String(data.name || data.nome || '').trim();
  if (!name) {
    const err = new Error('Nome do convidado é obrigatório.');
    err.statusCode = 400;
    throw err;
  }
  const normalizedName = normalizeText(name);
  const existing = await Guest.findOne({ inviteId: invite._id, normalizedName });
  if (existing) {
    const err = new Error('Este convidado já existe na lista.');
    err.statusCode = 409;
    throw err;
  }
  const companions = Math.max(0, Number.parseInt(data.companions ?? data.acompanhantes ?? 0, 10) || 0);
  const maxGuests = Math.max(1, Number.parseInt(data.maxGuests ?? data.pessoas ?? 0, 10) || (1 + companions));
  const number = Math.max(0, Number.parseInt(data.number ?? data.numero ?? 0, 10) || 0);
  let token = generateGuestPublicToken();
  while (await Guest.exists({ inviteId: invite._id, inviteToken: token })) token = generateGuestPublicToken();
  const guest = await Guest.create({
    inviteId: invite._id,
    slug: invite.slug,
    name,
    normalizedName,
    status: 'Não aberto',
    deviceToken: '',
    table: String(data.table || data.mesa || '').trim(),
    companions,
    maxGuests,
    phone: String(data.phone || data.telefone || '').trim(),
    notes: String(data.notes || data.notas || '').trim(),
    inviteToken: token,
    number,
    category: String(data.category || data.categoria || '').trim()
  });
  await logActivity({ invite, type: 'guests', title: 'Convidado adicionado manualmente', detail: guest.name });
  return guest;
}
async function adminHideMessage(invite, data) {
  const id = requireAdminObjectId(adminIdFromPayload(data), 'Mensagem');
  const message = await Message.findOneAndUpdate(
    { _id: id, inviteId: invite._id },
    { $set: { hidden: true, hiddenAt: new Date(), hiddenBy: 'admin' } },
    { new: true }
  );
  if (!message) {
    const err = new Error('Mensagem não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  await logActivity({ invite, type: 'message', title: 'Mensagem ocultada', detail: message.nome });
  return message;
}
async function adminRestoreMessage(invite, data) {
  const id = requireAdminObjectId(adminIdFromPayload(data), 'Mensagem');
  const message = await Message.findOneAndUpdate(
    { _id: id, inviteId: invite._id },
    { $set: { hidden: false }, $unset: { hiddenAt: '', hiddenBy: '' } },
    { new: true }
  );
  if (!message) {
    const err = new Error('Mensagem não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  await logActivity({ invite, type: 'message', title: 'Mensagem restaurada', detail: message.nome });
  return message;
}
async function adminDeleteMessage(invite, data) {
  const id = requireAdminObjectId(adminIdFromPayload(data), 'Mensagem');
  const message = await Message.findOne({ _id: id, inviteId: invite._id });
  if (!message) {
    const err = new Error('Mensagem não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  await Message.deleteOne({ _id: message._id, inviteId: invite._id });
  await logActivity({ invite, type: 'message', title: 'Mensagem eliminada', detail: message.nome });
  return { deleted: 1, id };
}
async function adminRestoreRsvp(invite, data) {
  const id = requireAdminObjectId(adminIdFromPayload(data), 'Confirmação');
  const rsvp = await Rsvp.findOne({ _id: id, inviteId: invite._id });
  if (!rsvp) {
    const err = new Error('Confirmação não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  const guest = rsvp.guestId ? await Guest.findOne({ _id: rsvp.guestId, inviteId: invite._id }) : await Guest.findOne({ inviteId: invite._id, normalizedName: normalizeText(rsvp.nome) });
  await Rsvp.deleteOne({ _id: rsvp._id, inviteId: invite._id });
  if (guest) {
    guest.status = 'Convite Aberto';
    await guest.save();
  }
  await logActivity({ invite, type: 'rsvp', title: 'Confirmação restaurada', detail: rsvp.nome });
  return { deleted: 1, guest: guest ? cleanGuestForPublic(guest) : null };
}
async function adminRestoreCheckin(invite, data) {
  const id = requireAdminObjectId(adminIdFromPayload(data), 'Check-in');
  const checkin = await CheckIn.findOne({ _id: id, inviteId: invite._id });
  if (!checkin) {
    const err = new Error('Check-in não encontrado.');
    err.statusCode = 404;
    throw err;
  }
  const guest = checkin.guestId ? await Guest.findOne({ _id: checkin.guestId, inviteId: invite._id }) : await Guest.findOne({ inviteId: invite._id, normalizedName: normalizeText(checkin.nome) });
  await CheckIn.deleteOne({ _id: checkin._id, inviteId: invite._id });
  if (guest) {
    guest.checkedIn = false;
    guest.checkedInAt = undefined;
    await guest.save();
  }
  await logActivity({ invite, type: 'checkin', title: 'Check-in restaurado', detail: checkin.nome });
  return { deleted: 1, guest: guest ? cleanGuestForPublic(guest) : null };
}

function envSlugKey(value) {
  return slugify(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}
function adminApiPasswordsFor(invite) {
  const slugKey = envSlugKey(invite?.slug || '');
  const values = [
    process.env.MANAGER_PASSWORD || '',
    slugKey ? process.env[`CLIENT_ADMIN_PASSWORD_${slugKey}`] || '' : '',
    slugKey ? process.env[`INVITE_ADMIN_PASSWORD_${slugKey}`] || '' : '',
    process.env.CLIENT_ADMIN_PASSWORD || '',
    process.env.INVITE_ADMIN_PASSWORD || ''
  ];
  return Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean)));
}
function adminApiAuthorized(req, data = {}, invite = null) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (payload && payload.role === 'manager') return true;

  const suppliedPassword = String(data.password || data.admin_password || '').trim();
  if (!suppliedPassword) return false;
  return adminApiPasswordsFor(invite).includes(suppliedPassword);
}

app.post('/admin-api', async (req, res) => {
  try {
    const data = req.body || {};
    const invite = await getInviteFromRequest(req);
    if (!invite) return res.status(400).json({ status: 'error', message: 'Slug do convite não enviado.' });
    if (!adminApiAuthorized(req, data, invite)) return res.status(401).json({ status: 'error', message: 'Sessão inválida, expirada ou senha de admin incorrecta.' });

    if (data.action === 'get_rsvps') return res.json({ status: 'success', data: await Rsvp.find({ inviteId: invite._id }).sort({ timestamp: -1 }) });
    if (data.action === 'get_gifts') return res.json({ status: 'success', data: await GiftItem.find({ inviteId: invite._id }).sort({ name: 1 }) });
    if (data.action === 'get_comprovativos') return res.json({ status: 'success', data: await Contribution.find({ inviteId: invite._id }).sort({ timestamp: -1 }).select('-fileBase64') });
    if (data.action === 'get_messages') return res.json({ status: 'success', data: await Message.find({ inviteId: invite._id }).sort({ timestamp: -1 }) });
    if (data.action === 'get_guests') return res.json({ status: 'success', data: (await Guest.find({ inviteId: invite._id }).sort({ number: 1, name: 1 })).map(cleanGuestForPublic) });
    if (data.action === 'get_checkins') return res.json({ status: 'success', data: await CheckIn.find({ inviteId: invite._id }).sort({ timestamp: -1 }) });
    if (data.action === 'get_capsule_photos') return res.json({ status: 'success', data: await CapsulePhoto.find({ inviteId: invite._id }).sort({ timestamp: -1 }).select('-fileBase64') });

    if (data.action === 'add_guest') {
      const guest = await adminAddGuest(invite, data);
      return res.status(201).json({ status: 'success', message: 'Convidado adicionado com sucesso.', data: cleanGuestForPublic(guest) });
    }
    if (data.action === 'hide_message') {
      const message = await adminHideMessage(invite, data);
      return res.json({ status: 'success', message: 'Mensagem ocultada com sucesso.', data: message });
    }
    if (data.action === 'restore_message') {
      const message = await adminRestoreMessage(invite, data);
      return res.json({ status: 'success', message: 'Mensagem restaurada com sucesso.', data: message });
    }
    if (data.action === 'delete_message') {
      const result = await adminDeleteMessage(invite, data);
      return res.json({ status: 'success', message: 'Mensagem eliminada com sucesso.', data: result });
    }
    if (data.action === 'restore_rsvp') {
      const result = await adminRestoreRsvp(invite, data);
      return res.json({ status: 'success', message: 'Confirmação restaurada. O convidado poderá confirmar novamente.', data: result });
    }
    if (data.action === 'restore_checkin') {
      const result = await adminRestoreCheckin(invite, data);
      return res.json({ status: 'success', message: 'Check-in restaurado. O convidado volta a ficar pendente na entrada.', data: result });
    }

    return res.status(400).json({ status: 'error', message: 'Ação de admin não reconhecida.' });
  } catch (err) {
    console.error('[admin-api]', err);
    return res.status(err.statusCode || 500).json({ status: 'error', message: err.message || 'Erro no admin.' });
  }
});


function cleanGuestForPublic(guest) {
  const total = Number(guest.maxGuests) || (1 + (Number(guest.companions) || 0));
  return {
    id: String(guest._id),
    number: guest.number || 0,
    category: guest.category || '',
    name: guest.name,
    nome: guest.name,
    token: guest.inviteToken || String(guest._id || ''),
    mesa: guest.table || 'A definir',
    table: guest.table || '',
    maxGuests: total,
    maxGuestsTotal: total,
    companions: Math.max(total - 1, Number(guest.companions) || 0),
    phone: guest.phone || '',
    notes: guest.notes || '',
    status: guest.status || '',
    guestStatus: guest.status || '',
    checkedIn: Boolean(guest.checkedIn),
    checkedInAt: guest.checkedInAt || null
  };
}
async function findGuestByIdentity(invite, { nome, name, token } = {}) {
  const rawName = nome || name;
  let guest = null;
  const cleanToken = String(token || '').trim();

  if (cleanToken) {
    const tokenFilters = [
      { inviteToken: cleanToken },
      { deviceToken: cleanToken }
    ];

    if (mongoose.Types.ObjectId.isValid(cleanToken)) {
      tokenFilters.push({ _id: cleanToken });
    }

    guest = await Guest.findOne({ inviteId: invite._id, $or: tokenFilters });
  }

  if (!guest && rawName) guest = await Guest.findOne({ inviteId: invite._id, normalizedName: normalizeText(rawName) });
  return guest;
}
async function getPublicStats(req, res, invite) {
  const [guests, rsvps, contributions, messages, checkins, photos] = await Promise.all([
    Guest.find({ inviteId: invite._id }).select('maxGuests companions checkedIn'),
    Rsvp.find({ inviteId: invite._id }).select('guests'),
    Contribution.countDocuments({ inviteId: invite._id }),
    Message.countDocuments({ inviteId: invite._id, hidden: { $ne: true } }),
    CheckIn.find({ inviteId: invite._id }).select('guests'),
    CapsulePhoto.countDocuments({ inviteId: invite._id })
  ]);
  const totalPeople = guests.reduce((sum, g) => sum + (Number(g.maxGuests) || (1 + (Number(g.companions) || 0))), 0);
  const confirmed = rsvps.reduce((sum, r) => sum + (Number(r.guests) || 1), 0);
  const checkedPeople = checkins.reduce((sum, c) => sum + (Number(c.guests) || 1), 0);
  sendJson(req, res, { status: 'success', data: { guestsCount: guests.length, totalPeople, confirmed, confirmedRows: rsvps.length, checkedPeople, checkedIn: checkins.length, contributions, messages, photos } });
}
async function listGuests(req, res, invite) {
  const guests = await Guest.find({ inviteId: invite._id }).sort({ number: 1, name: 1 });
  sendJson(req, res, { status: 'success', data: guests.map(cleanGuestForPublic) });
}
async function listRsvps(req, res, invite) {
  const rows = await Rsvp.find({ inviteId: invite._id }).sort({ timestamp: -1 });
  sendJson(req, res, { status: 'success', data: rows });
}
async function listContributions(req, res, invite) {
  const rows = await Contribution.find({ inviteId: invite._id }).sort({ timestamp: -1 }).select('-fileBase64');
  const data = rows.map(doc => {
    const o = doc.toObject ? doc.toObject() : doc;
    const fileUrl = o.fileUrl || (o._id ? `${PUBLIC_API_BASE_URL}/api/contributions/${o._id}/file` : '');
    return { ...o, filename: o.originalName || o.fileName || '', viewUrl: fileUrl, previewUrl: fileUrl, downloadUrl: fileUrl, thumbnailUrl: fileUrl };
  });
  sendJson(req, res, { status: 'success', data });
}
async function listCheckins(req, res, invite) {
  const rows = await CheckIn.find({ inviteId: invite._id }).sort({ timestamp: -1 });
  sendJson(req, res, { status: 'success', data: rows });
}
async function listCapsulePhotos(req, res, invite) {
  const rows = await CapsulePhoto.find({ inviteId: invite._id }).sort({ timestamp: -1 }).select('-fileBase64');
  const data = rows.map(doc => {
    const o = doc.toObject ? doc.toObject() : doc;
    const fileUrl = o.fileUrl || (o._id ? `${PUBLIC_API_BASE_URL}/api/capsule/${o._id}/file` : '');
    return { ...o, filename: o.originalName || o.fileName || '', src: fileUrl, viewUrl: fileUrl, downloadUrl: fileUrl, thumbnailUrl: fileUrl };
  });
  sendJson(req, res, { status: 'success', data });
}
async function listMessages(req, res, invite) { const messages = await Message.find({ inviteId: invite._id, hidden: { $ne: true } }).sort({ timestamp: -1 }).limit(200); sendJson(req, res, { status: 'success', data: messages }); }
async function listGifts(req, res, invite) { await seedDefaultGifts(invite); const gifts = await GiftItem.find({ inviteId: invite._id }).sort({ name: 1 }); sendJson(req, res, { status: 'success', data: gifts }); }
async function getGuestDetails(req, res, invite) {
  const guest = await findGuestByIdentity(invite, { nome: req.body?.nome || req.query?.nome || req.query?.name, name: req.query?.name, token: req.body?.token || req.query?.token });
  if (!guest) return sendJson(req, res, { status: 'error', message: 'Convidado não encontrado.' }, 404);
  await ensureGuestInviteToken(invite, guest);
  const data = cleanGuestForPublic(guest);
  sendJson(req, res, { status: 'success', data, guestName: data.name, guestStatus: data.status, Mesa: data.mesa, maxGuestsTotal: data.maxGuestsTotal, token: data.token });
}
async function getRsvpStatus(req, res, invite) {
  const guest = await findGuestByIdentity(invite, { nome: req.body?.nome || req.query?.nome || req.query?.name, token: req.body?.token || req.query?.token });
  if (!guest) return sendJson(req, res, { status: 'success', data: { confirmed: false } });
  const rsvp = await Rsvp.findOne({ inviteId: invite._id, guestId: guest._id });
  sendJson(req, res, { status: 'success', data: { confirmed: Boolean(rsvp), rsvp } });
}
async function handleOpenInvite(req, res, invite) {
  const { token, nome = '' } = req.body || {};
  const guest = await findGuestByIdentity(invite, { nome, token });
  if (guest && !String(guest.status || '').toLowerCase().includes('confirmado')) {
    if (!guest.inviteToken) guest.inviteToken = generateGuestPublicToken();
    guest.status = 'Convite Aberto';
    await guest.save();
    await logActivity({ invite, type: 'login', title: 'Convite aberto', detail: guest.name });
  }
  res.json({ status: 'success' });
}
async function handleLogin(req, res, invite) {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ status: 'error', message: 'Dados incompletos.' });

  const guest = await Guest.findOne({ inviteId: invite._id, normalizedName: normalizeText(name) });
  if (!guest) return res.status(401).json({ status: 'error', message: 'Nome não encontrado na lista.' });

  let shouldSave = false;

  if (!guest.inviteToken) {
    guest.inviteToken = generateGuestPublicToken();
    shouldSave = true;
  }

  if (!String(guest.status || '').toLowerCase().includes('confirmado')) {
    guest.status = 'Convite Aberto';
    shouldSave = true;
  }

  if (shouldSave) {
    await guest.save();
    await logActivity({ invite, type: 'login', title: 'Convite aberto', detail: guest.name });
  }

  const data = cleanGuestForPublic(guest);
  res.json({ status: 'success', data, guestName: data.name, guestStatus: data.status, Mesa: data.mesa, maxGuestsTotal: data.maxGuestsTotal, token: data.token });
}
async function handleRsvpChoice(req, res, invite) {
  const choice = String(req.body?.choice || '').toLowerCase();
  if (choice === 'confirmed' || choice === 'sim' || choice.includes('confirm')) return handleRsvp(req, res, invite);
  const guest = await findGuestByIdentity(invite, { nome: req.body?.nome, token: req.body?.token });
  if (guest) { guest.status = 'Ainda por confirmar'; await guest.save(); await logActivity({ invite, type: 'rsvp', title: 'Ainda por confirmar', detail: guest.name }); }
  res.json({ status: 'success', message: 'Estado registado.' });
}
async function handleRsvp(req, res, invite) {
  const { nome, phone = '', message = '', token = '' } = req.body || {};
  const guest = await findGuestByIdentity(invite, { nome, token });
  if (!guest) return res.status(404).json({ status: 'error', message: 'Convidado não encontrado.' });
  const already = await Rsvp.findOne({ inviteId: invite._id, guestId: guest._id });
  if (already) return res.status(409).json({ status: 'error', code: 'RSVP_ALREADY_CONFIRMED', message: 'Esta presença já foi confirmada anteriormente.' });
  const totalGuests = Number(guest.maxGuests) || (1 + (Number(guest.companions) || 0));
  await Rsvp.create({ inviteId: invite._id, slug: invite.slug, guestId: guest._id, nome: guest.name, guests: totalGuests, phone, message, mesa: guest.table || '' });
  guest.status = `Confirmado (${totalGuests})`; guest.phone = phone || guest.phone; await guest.save();
  await logActivity({ invite, type: 'rsvp', title: 'Presença confirmada', detail: `${guest.name} · ${totalGuests} pessoa(s)` });
  res.json({ status: 'success', message: 'Confirmação recebida!', guests: totalGuests });
}
async function handlePostMessage(req, res, invite) {
  const { nome, message } = req.body || {};
  if (!nome || !message) return res.status(400).json({ status: 'error', message: 'Dados incompletos.' });
  const msg = await Message.create({ inviteId: invite._id, slug: invite.slug, nome, message, timestamp: new Date() });
  await logActivity({ invite, type: 'message', title: 'Nova mensagem', detail: nome });
  res.json({ status: 'success', data: msg });
}
async function handleSaveGifts(req, res, invite) {
  const { nome, selectedGifts } = req.body || {};
  if (!nome || !Array.isArray(selectedGifts)) return res.status(400).json({ status: 'error', message: 'Dados incompletos.' });
  const results = { success: [], failed: [] };
  for (const giftName of selectedGifts) {
    const updated = await GiftItem.findOneAndUpdate({ inviteId: invite._id, name: giftName, reserved: false }, { reserved: true, reservedBy: nome, reservedAt: new Date() }, { new: true });
    if (updated) results.success.push(giftName); else results.failed.push({ gift: giftName, reason: 'Já reservado ou inexistente.' });
  }
  await logActivity({ invite, type: 'gift', title: 'Reserva de presente', detail: `${nome} · ${results.success.join(', ')}` });
  if (results.success.length) return res.json({ status: 'success', data: results, message: 'Presentes reservados com sucesso.' });
  res.status(409).json({ status: 'error', data: results, message: 'Nenhum presente pôde ser reservado.' });
}
async function handleCheckinGuest(req, res, invite) {
  const { token = '', nome = '', guests = 1, mesa = '', operator = '' } = req.body || {};
  const guest = await findGuestByIdentity(invite, { nome, token });
  if (!guest) return res.status(404).json({ status: 'error', message: 'Convidado não encontrado.' });
  const total = Number(guests) || Number(guest.maxGuests) || (1 + (Number(guest.companions) || 0));
  const row = await CheckIn.findOneAndUpdate(
    { inviteId: invite._id, guestId: guest._id },
    { $set: { inviteId: invite._id, slug: invite.slug, guestId: guest._id, token: token || guest.inviteToken || '', nome: guest.name, guests: total, mesa: mesa || guest.table || '', operator, status: 'checked-in', timestamp: new Date() } },
    { upsert: true, new: true }
  );
  guest.checkedIn = true; guest.checkedInAt = new Date(); await guest.save();
  await logActivity({ invite, type: 'checkin', title: 'Check-in confirmado', detail: `${guest.name} · ${total} pessoa(s)` });
  res.json({ status: 'success', data: row, message: 'Entrada confirmada.' });
}
async function handleSaveCapsulePhoto(req, res, invite) {
  const body = req.body || {};
  const nome = body.nome || body.name || 'Convidado';
  const caption = body.caption || body.message || '';
  const base64 = body.photoBase64 || body.fileBase64 || body.imageBase64 || body.dataUrl || body.photo || '';
  const mimeType = body.mimeType || body.photoType || 'image/jpeg';
  const originalName = body.originalName || body.filename || `capsula-${Date.now()}.jpg`;
  if (!base64) return res.status(400).json({ status: 'error', message: 'Fotografia não recebida.' });
  const cleanBase64 = String(base64).replace(/^data:[^,]+,/, '');
  const doc = await CapsulePhoto.create({ inviteId: invite._id, slug: invite.slug, nome, caption, fileName: `${Date.now()}-${originalName}`, originalName, mimeType, size: Math.ceil(cleanBase64.length * 0.75), fileBase64: cleanBase64, timestamp: new Date() });
  doc.fileUrl = `${PUBLIC_API_BASE_URL}/api/capsule/${doc._id}/file`;
  await doc.save();
  await logActivity({ invite, type: 'capsule', title: 'Nova foto na cápsula', detail: nome });
  res.json({ status: 'success', data: { id: doc._id, fileUrl: doc.fileUrl }, message: 'Fotografia guardada.' });
}
async function handleUploadComprovativo(req, res, invite) {
  const { nome = '', canal = '' } = req.body || {};
  if (!nome) return res.status(400).json({ status: 'error', message: 'Nome não enviado.' });
  const file = req.file || (Array.isArray(req.files) ? req.files.find(f => f.fieldname === 'comprovativoFile') || req.files[0] : null);
  if (!file) return res.status(400).json({ status: 'error', message: 'Ficheiro não recebido.' });
  const doc = await Contribution.create({
    inviteId: invite._id,
    slug: invite.slug,
    nome,
    canal,
    fileName: `${Date.now()}-${file.originalname}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    fileBase64: file.buffer.toString('base64'),
    timestamp: new Date()
  });
  doc.fileUrl = `${PUBLIC_API_BASE_URL}/api/contributions/${doc._id}/file`;
  await doc.save();
  await logActivity({ invite, type: 'contribution', title: 'Comprovativo recebido', detail: `${nome} · ${canal}` });
  return res.json({ status: 'success', message: 'Comprovativo enviado.', data: { id: doc._id, fileUrl: doc.fileUrl } });
}

app.get('/api/capsule/:id/file', async (req, res) => {
  const doc = await CapsulePhoto.findById(req.params.id);
  if (!doc || !doc.fileBase64) return res.status(404).send('Ficheiro não encontrado.');
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.send(Buffer.from(doc.fileBase64, 'base64'));
});

app.use((err, req, res, next) => {
  console.error('[server-error]', err);

  if (res.headersSent) {
    return next(err);
  }

  const isCorsError = String(err.message || '').includes('Origem não autorizada');

  return res.status(isCorsError ? 403 : 500).json({
    status: 'error',
    code: isCorsError ? 'CORS_BLOCKED' : 'SERVER_ERROR',
    message: err.message || 'Erro interno no servidor.'
  });
});

async function start() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não configurado.');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB conectado.');
  app.listen(PORT, () => console.log(`Lirandzo AdminManager API a correr na porta ${PORT}`));
}
start().catch(err => { console.error('Falha ao iniciar servidor:', err); process.exit(1); });
