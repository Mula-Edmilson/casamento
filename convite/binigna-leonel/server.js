require('dotenv').config();

const crypto = require('crypto');
const zlib = require('zlib');
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
function guestStatusIsExplicitlyNotOpened(value) {
  const status = normalizeText(value);
  return status === 'nao aberto' ||
    status.includes('nao aberto') ||
    status.includes('nao foi aberto') ||
    status.includes('not opened') ||
    status.includes('unopened');
}
function guestStatusIndicatesOpened(value) {
  const status = normalizeText(value);
  if (!status || guestStatusIsExplicitlyNotOpened(status)) return false;
  return status === 'aberto' ||
    status.includes('convite aberto') ||
    status.includes('opened') ||
    status.includes('visualiz') ||
    status.includes('view') ||
    status.includes('access');
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
function buildGuestNotes({ notes }) {
  // Mantém apenas notas humanas/operacionais. Dados estruturais como número,
  // categoria e token antigo ficam nos próprios campos do convidado.
  return Array.from(new Set([String(notes || '').trim()].filter(Boolean))).join(' — ');
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

function exactRegex(value) {
  return new RegExp(`^${escapeRegex(String(value || '').trim())}$`, 'i');
}
async function repairGuestNormalizedName(guest) {
  if (!guest || !guest.name) return { changed: false, error: '' };
  const expected = normalizeText(guest.name);
  if (!expected || guest.normalizedName === expected) return { changed: false, error: '' };
  const before = guest.normalizedName || '';
  guest.normalizedName = expected;
  try {
    await guest.save();
    return { changed: true, before, after: expected };
  } catch (err) {
    guest.normalizedName = before;
    return { changed: false, error: err.message || 'Falha ao reparar normalizedName.' };
  }
}
async function findGuestByNormalizedOrName(inviteId, rawName, options = {}) {
  const name = String(rawName || '').trim();
  if (!name) return null;
  const normalizedName = normalizeText(name);

  let guest = await Guest.findOne({ inviteId, normalizedName });

  if (!guest) {
    guest = await Guest.findOne({ inviteId, name: { $regex: exactRegex(name) } });
  }

  if (!guest) {
    const candidates = await Guest.find({ inviteId }).select('_id name normalizedName');
    const match = candidates.find(item => normalizeText(item.name) === normalizedName);
    if (match) guest = await Guest.findById(match._id);
  }

  if (guest && options.repair !== false) await repairGuestNormalizedName(guest);
  return guest;
}
async function repairGuestsForInvite(invite) {
  const guests = await Guest.find({ inviteId: invite._id });
  const result = { checked: guests.length, repaired: 0, alreadyOk: 0, failed: [] };

  for (const guest of guests) {
    const expected = normalizeText(guest.name);
    if (!expected) {
      result.failed.push({ id: String(guest._id), name: guest.name || '', error: 'Nome vazio.' });
      continue;
    }
    if (guest.normalizedName === expected && guest.slug === invite.slug) {
      result.alreadyOk += 1;
      continue;
    }

    const before = guest.normalizedName || '';
    guest.normalizedName = expected;
    guest.slug = invite.slug;
    try {
      await guest.save();
      result.repaired += 1;
    } catch (err) {
      guest.normalizedName = before;
      result.failed.push({ id: String(guest._id), name: guest.name || '', before, expected, error: err.message });
    }
  }

  return result;
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
function normalizeManagerRole(payload) {
  if (!payload) return '';
  if (payload.scope === 'manager' && ['admin', 'editor'].includes(payload.role)) return payload.role;
  if (payload.role === 'manager') return 'admin'; // compatibilidade com tokens antigos
  return '';
}
function requireManager(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  const role = normalizeManagerRole(payload);
  if (!payload || !role) return res.status(401).json({ status: 'error', message: 'Sessão inválida ou expirada.' });
  req.manager = { ...payload, role, scope: 'manager' };
  return next();
}
function requireAdmin(req, res, next) {
  if (!req.manager) return requireManager(req, res, () => requireAdmin(req, res, next));
  if (req.manager.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Acesso negado. Esta acção exige perfil Admin.' });
  return next();
}
function ensureAdminAction(req, res) {
  if (!req.manager || req.manager.role !== 'admin') {
    res.status(403).json({ status: 'error', message: 'Acesso negado. Esta acção exige perfil Admin.' });
    return false;
  }
  return true;
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
  legacyToken: { type: String, default: '' },
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
  reserved: { type: Boolean, default: false, index: true },
  reservedBy: { type: String, default: '' },
  reservedByNormalized: { type: String, default: '', index: true },
  reservedByGuestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', index: true },
  reservedToken: { type: String, default: '', index: true },
  reservedSource: { type: String, default: '' },
  reservedContributionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contribution', index: true },
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
  // Compatibilidade: guarda metadados quando um comprovativo antigo/externo
  // representa escolha de presente. Sem estes campos, o admin não consegue
  // saber qual item foi realmente escolhido.
  selectedGift: { type: String, default: '' },
  giftChoice: { type: String, default: '' },
  selectedGifts: { type: [String], default: [] },
  gifts: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  token: { type: String, default: '' },
  legacyGiftMigrated: { type: Boolean, default: false, index: true },
  legacyGiftConflict: { type: Boolean, default: false, index: true },
  legacyGiftConflictReason: { type: String, default: '' },
  legacyGiftReservedInGiftItem: { type: Boolean, default: false },
  legacyGiftReservedBy: { type: String, default: '' },
  legacyGiftReservedAt: { type: Date },
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

const BackupSchema = new mongoose.Schema({
  label: { type: String, default: '', trim: true },
  scope: { type: String, enum: ['invite', 'all'], required: true, index: true },
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', index: true },
  slug: { type: String, default: '', index: true },
  coupleNames: { type: String, default: '' },
  status: { type: String, enum: ['available', 'restored', 'deleted'], default: 'available', index: true },
  counts: { type: mongoose.Schema.Types.Mixed, default: {} },
  payloadGzipBase64: { type: String, required: true },
  payloadBytes: { type: Number, default: 0 },
  compressedBytes: { type: Number, default: 0 },
  hash: { type: String, default: '', index: true },
  source: { type: String, default: 'adminmanager' },
  createdByRole: { type: String, default: '' },
  restoredAt: { type: Date },
  restoredByRole: { type: String, default: '' },
  restoredMode: { type: String, default: '' }
}, { timestamps: true });
BackupSchema.index({ createdAt: -1 });
BackupSchema.index({ scope: 1, slug: 1, createdAt: -1 });



const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, default: '', index: true },
  company: { type: String, default: '', trim: true },
  contactPerson: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true, index: true },
  normalizedEmail: { type: String, default: '', index: true },
  phone: { type: String, default: '', trim: true },
  whatsapp: { type: String, default: '', trim: true },
  type: { type: String, default: 'Casamento', trim: true, index: true },
  status: { type: String, enum: ['active', 'paused', 'unsubscribed', 'archived'], default: 'active', index: true },
  tags: { type: [String], default: [] },
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', index: true },
  slug: { type: String, default: '', index: true },
  source: { type: String, default: 'manual', trim: true },
  marketingConsent: { type: Boolean, default: true, index: true },
  notes: { type: String, default: '' },
  lastEmailAt: { type: Date },
  emailsSent: { type: Number, default: 0 },
  lastCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketingCampaign' }
}, { timestamps: true });
ClientSchema.index({ status: 1, marketingConsent: 1, email: 1 });
ClientSchema.index({ slug: 1, status: 1 });

const MarketingCampaignSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  previewText: { type: String, default: '', trim: true },
  bodyHtml: { type: String, default: '' },
  bodyText: { type: String, default: '' },
  audience: { type: String, default: 'active' },
  requestedByRole: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'sending', 'sent', 'partial', 'failed'], default: 'draft', index: true },
  totals: { type: mongoose.Schema.Types.Mixed, default: {} },
  recipients: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sentAt: { type: Date }
}, { timestamps: true });
MarketingCampaignSchema.index({ createdAt: -1 });

const Invite = mongoose.model('Invite', InviteSchema);
const Guest = mongoose.model('Guest', GuestSchema);
const Rsvp = mongoose.model('Rsvp', RsvpSchema);
const Message = mongoose.model('Message', MessageSchema);
const GiftItem = mongoose.model('GiftItem', GiftItemSchema);
const Contribution = mongoose.model('Contribution', ContributionSchema);

async function ensureGiftIndexes() {
  try {
    const collection = mongoose.connection.collection('giftitems');
    const indexes = await collection.indexes();

    for (const index of indexes) {
      const keys = index.key || {};
      const isSingleNameIndex = index.name !== '_id_' && Object.keys(keys).length === 1 && keys.name === 1;
      if (isSingleNameIndex) {
        await collection.dropIndex(index.name);
        console.log(`Índice antigo removido em giftitems: ${index.name}`);
      }
    }

    await collection.createIndex(
      { inviteId: 1, name: 1 },
      { unique: true, name: 'inviteId_1_name_1' }
    );
  } catch (err) {
    console.error('Falha ao validar índices de giftitems:', err.message);
  }
}
const CheckIn = mongoose.model('CheckIn', CheckInSchema);
const CapsulePhoto = mongoose.model('CapsulePhoto', CapsulePhotoSchema);
const Activity = mongoose.model('Activity', ActivitySchema);
const Backup = mongoose.model('Backup', BackupSchema);
const Client = mongoose.model('Client', ClientSchema);
const MarketingCampaign = mongoose.model('MarketingCampaign', MarketingCampaignSchema);

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

function plainDoc(doc) {
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc.toObject ? doc.toObject() : doc));
}
function cleanBackupDoc(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id), label: o.label || '', scope: o.scope, slug: o.slug || '', coupleNames: o.coupleNames || '',
    status: o.status || 'available', counts: o.counts || {}, payloadBytes: o.payloadBytes || 0,
    compressedBytes: o.compressedBytes || 0, hash: o.hash || '', source: o.source || 'adminmanager',
    createdByRole: o.createdByRole || '', restoredAt: o.restoredAt || null, restoredByRole: o.restoredByRole || '',
    restoredMode: o.restoredMode || '', createdAt: o.createdAt, updatedAt: o.updatedAt
  };
}

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
function parseTags(value) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(v => String(v || '').trim()).filter(Boolean)));
  return Array.from(new Set(String(value || '').split(/[,;|]/).map(v => v.trim()).filter(Boolean)));
}
function cleanClientDoc(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id), name: o.name || '', normalizedName: o.normalizedName || '', company: o.company || '',
    contactPerson: o.contactPerson || '', email: o.email || '', phone: o.phone || '', whatsapp: o.whatsapp || '',
    type: o.type || 'Casamento', status: o.status || 'active', tags: o.tags || [], inviteId: o.inviteId ? String(o.inviteId) : '',
    slug: o.slug || '', source: o.source || 'manual', marketingConsent: o.marketingConsent !== false,
    notes: o.notes || '', lastEmailAt: o.lastEmailAt || null, emailsSent: o.emailsSent || 0,
    createdAt: o.createdAt, updatedAt: o.updatedAt
  };
}
function cleanCampaignDoc(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id), subject: o.subject || '', previewText: o.previewText || '', audience: o.audience || '',
    requestedByRole: o.requestedByRole || '', status: o.status || 'draft', totals: o.totals || {},
    recipients: Array.isArray(o.recipients) ? o.recipients.slice(0, 80) : [], sentAt: o.sentAt || null,
    createdAt: o.createdAt, updatedAt: o.updatedAt
  };
}
function clientPayloadFromBody(body = {}) {
  const inviteId = String(body.inviteId || '').trim();
  const email = normalizeEmail(body.email);
  const name = String(body.name || body.clientName || body.company || email || '').trim();
  return {
    name,
    normalizedName: normalizeText(name),
    company: String(body.company || '').trim(),
    contactPerson: String(body.contactPerson || '').trim(),
    email,
    normalizedEmail: email,
    phone: String(body.phone || '').trim(),
    whatsapp: String(body.whatsapp || body.phone || '').trim(),
    type: String(body.type || 'Casamento').trim() || 'Casamento',
    status: ['active', 'paused', 'unsubscribed', 'archived'].includes(String(body.status || 'active')) ? String(body.status || 'active') : 'active',
    tags: parseTags(body.tags),
    inviteId: validObjectId(inviteId) ? new mongoose.Types.ObjectId(inviteId) : undefined,
    slug: String(body.slug || '').trim().toLowerCase(),
    source: String(body.source || 'manual').trim() || 'manual',
    marketingConsent: body.marketingConsent !== false && body.marketingConsent !== 'false',
    notes: String(body.notes || '').trim()
  };
}
function htmlToPlainText(html) {
  return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}
function marketingEmailHtml({ subject, previewText, bodyHtml, bodyText }) {
  const content = bodyHtml && /<[^>]+>/.test(bodyHtml) ? bodyHtml : String(bodyText || bodyHtml || '').split(/\n{2,}/).map(p => `<p>${String(p).split(/\n/).map(escHtml).join('<br>')}</p>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(subject)}</title></head><body style="margin:0;background:#f7f1eb;font-family:Inter,Arial,sans-serif;color:#2c231e"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(previewText || '')}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1eb;padding:28px 14px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fffaf5;border:1px solid #ead9ca"><tr><td style="padding:24px 26px;border-bottom:1px solid #ead9ca"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9a6b48;font-weight:800">Lirandzo</div><h1 style="font-size:24px;line-height:1.18;margin:8px 0 0;color:#2c231e">${escHtml(subject)}</h1></td></tr><tr><td style="padding:26px;font-size:15px;line-height:1.65;color:#56483f">${content}</td></tr><tr><td style="padding:18px 26px;border-top:1px solid #ead9ca;color:#847367;font-size:12px;line-height:1.5">Recebeu este email porque consta na base de clientes Lirandzo. Para sair da lista, responda a este email com “remover”.</td></tr></table></td></tr></table></body></html>`;
}
function escHtml(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
async function sendResendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || '';
  const fromName = process.env.RESEND_FROM_NAME || 'Lirandzo';
  if (!apiKey) { const e = new Error('RESEND_API_KEY não configurada no Render.'); e.statusCode = 500; throw e; }
  if (!fromEmail || !isValidEmail(fromEmail)) { const e = new Error('RESEND_FROM_EMAIL precisa de ser um email validado no Resend.'); e.statusCode = 500; throw e; }
  const payload = { from: `${fromName} <${fromEmail}>`, to: [to], subject, html, text };
  if (process.env.RESEND_REPLY_TO && isValidEmail(process.env.RESEND_REPLY_TO)) payload.reply_to = process.env.RESEND_REPLY_TO;
  const resp = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) { const e = new Error(data.message || data.error || `Resend devolveu erro ${resp.status}`); e.statusCode = resp.status; e.resend = data; throw e; }
  return data;
}

function gzipJsonToBase64(payload) {
  const json = JSON.stringify(payload);
  const raw = Buffer.from(json, 'utf8');
  const compressed = zlib.gzipSync(raw, { level: 9 });
  return {
    payloadGzipBase64: compressed.toString('base64'),
    payloadBytes: raw.length,
    compressedBytes: compressed.length,
    hash: crypto.createHash('sha256').update(raw).digest('hex')
  };
}
function payloadFromBackupDoc(backup) {
  try {
    const buffer = Buffer.from(String(backup.payloadGzipBase64 || ''), 'base64');
    return JSON.parse(zlib.gunzipSync(buffer).toString('utf8'));
  } catch (err) {
    const e = new Error('Backup corrompido ou ilegível. Não foi possível descomprimir o payload.');
    e.statusCode = 500;
    throw e;
  }
}
function backupDownloadName(backup) {
  const stamp = new Date(backup.createdAt || Date.now()).toISOString().replace(/[:.]/g, '-');
  const scope = backup.scope === 'all' ? 'todos-convites' : (backup.slug || 'convite');
  return `lirandzo-backup-${scope}-${stamp}.json`;
}
function backupCounts(payload) {
  const c = payload.collections || {};
  return {
    invites: payload.scope === 'all' ? (payload.invites || []).length : (payload.invite ? 1 : 0),
    guests: (c.guests || []).length,
    rsvps: (c.rsvps || []).length,
    messages: (c.messages || []).length,
    gifts: (c.gifts || []).length,
    contributions: (c.contributions || []).length,
    checkins: (c.checkins || []).length,
    photos: (c.photos || []).length,
    activities: (c.activities || []).length,
    clients: (c.clients || []).length,
    campaigns: (c.campaigns || []).length
  };
}
async function collectInviteBackupPayload(invite) {
  const inviteId = invite._id;
  const [guests, rsvps, messages, gifts, contributions, checkins, photos, activities, clients] = await Promise.all([
    Guest.find({ inviteId }).sort({ number: 1, name: 1 }).lean(),
    Rsvp.find({ inviteId }).sort({ timestamp: 1 }).lean(),
    Message.find({ inviteId }).sort({ timestamp: 1 }).lean(),
    GiftItem.find({ inviteId }).sort({ name: 1 }).lean(),
    Contribution.find({ inviteId }).sort({ timestamp: 1 }).lean(),
    CheckIn.find({ inviteId }).sort({ timestamp: 1 }).lean(),
    CapsulePhoto.find({ inviteId }).sort({ timestamp: 1 }).lean(),
    Activity.find({ inviteId }).sort({ timestamp: 1 }).lean(),
    Client.find({ $or: [{ inviteId }, { slug: invite.slug }] }).sort({ name: 1 }).lean()
  ]);
  const payload = {
    schemaVersion: 1,
    generator: 'lirandzo-adminmanager',
    exportedAt: new Date().toISOString(),
    scope: 'invite',
    invite: plainDoc(invite),
    collections: { guests, rsvps, messages, gifts, contributions, checkins, photos, activities, clients }
  };
  payload.counts = backupCounts(payload);
  return payload;
}
async function collectAllBackupPayload({ includeArchived = true } = {}) {
  const inviteFilter = includeArchived ? {} : { status: { $ne: 'archived' } };
  const invites = await Invite.find(inviteFilter).sort({ updatedAt: -1 }).lean();
  const ids = invites.map(i => i._id);
  const scoped = ids.length ? { inviteId: { $in: ids } } : { inviteId: { $in: [] } };
  const [guests, rsvps, messages, gifts, contributions, checkins, photos, activities, clients, campaigns] = await Promise.all([
    Guest.find(scoped).sort({ slug: 1, number: 1, name: 1 }).lean(),
    Rsvp.find(scoped).sort({ slug: 1, timestamp: 1 }).lean(),
    Message.find(scoped).sort({ slug: 1, timestamp: 1 }).lean(),
    GiftItem.find(scoped).sort({ slug: 1, name: 1 }).lean(),
    Contribution.find(scoped).sort({ slug: 1, timestamp: 1 }).lean(),
    CheckIn.find(scoped).sort({ slug: 1, timestamp: 1 }).lean(),
    CapsulePhoto.find(scoped).sort({ slug: 1, timestamp: 1 }).lean(),
    Activity.find(scoped).sort({ slug: 1, timestamp: 1 }).lean(),
    Client.find({}).sort({ name: 1 }).lean(),
    MarketingCampaign.find({}).sort({ createdAt: 1 }).lean()
  ]);
  const payload = {
    schemaVersion: 1,
    generator: 'lirandzo-adminmanager',
    exportedAt: new Date().toISOString(),
    scope: 'all',
    includeArchived,
    invites,
    collections: { guests, rsvps, messages, gifts, contributions, checkins, photos, activities, clients, campaigns }
  };
  payload.counts = backupCounts(payload);
  return payload;
}
async function createBackupRecord({ payload, label = '', managerRole = '' }) {
  const packed = gzipJsonToBase64(payload);
  const backup = await Backup.create({
    label: String(label || '').trim() || (payload.scope === 'all' ? 'Backup geral' : `Backup · ${payload.invite?.slug || 'convite'}`),
    scope: payload.scope,
    inviteId: payload.scope === 'invite' && payload.invite?._id ? payload.invite._id : undefined,
    slug: payload.scope === 'invite' ? (payload.invite?.slug || '') : '',
    coupleNames: payload.scope === 'invite' ? (payload.invite?.coupleNames || '') : 'Todos os convites',
    counts: payload.counts || backupCounts(payload),
    createdByRole: managerRole,
    ...packed
  });
  return backup;
}
async function insertManyIfAny(Model, docs) {
  if (!Array.isArray(docs) || !docs.length) return { inserted: 0 };
  await Model.insertMany(docs, { ordered: true });
  return { inserted: docs.length };
}
async function deleteInviteRelatedByIdsAndSlug({ oldId, existingId, slug }) {
  const ids = Array.from(new Set([oldId, existingId].filter(Boolean).map(String))).filter(validObjectId).map(id => new mongoose.Types.ObjectId(id));
  const filter = { $or: [] };
  if (ids.length) filter.$or.push({ inviteId: { $in: ids } });
  if (slug) filter.$or.push({ slug });
  if (!filter.$or.length) return {};
  const [guests, rsvps, messages, gifts, contributions, checkins, photos, activities] = await Promise.all([
    Guest.deleteMany(filter), Rsvp.deleteMany(filter), Message.deleteMany(filter), GiftItem.deleteMany(filter),
    Contribution.deleteMany(filter), CheckIn.deleteMany(filter), CapsulePhoto.deleteMany(filter), Activity.deleteMany(filter), Client.deleteMany(filter)
  ]);
  return { guests: guests.deletedCount || 0, rsvps: rsvps.deletedCount || 0, messages: messages.deletedCount || 0, gifts: gifts.deletedCount || 0, contributions: contributions.deletedCount || 0, checkins: checkins.deletedCount || 0, photos: photos.deletedCount || 0, activities: activities.deletedCount || 0, clients: clients.deletedCount || 0 };
}
async function restoreInviteBackupPayload(payload) {
  if (!payload || payload.scope !== 'invite' || !payload.invite) {
    const err = new Error('Este backup não é de um convite individual.');
    err.statusCode = 400;
    throw err;
  }
  const inviteDoc = payload.invite;
  const oldId = inviteDoc._id;
  const slug = inviteDoc.slug;
  const existing = await Invite.findOne({ $or: [{ slug }, ...(validObjectId(oldId) ? [{ _id: oldId }] : [])] });
  const existingId = existing?._id;
  await deleteInviteRelatedByIdsAndSlug({ oldId, existingId, slug });
  await Invite.deleteMany({ $or: [{ slug }, ...(validObjectId(oldId) ? [{ _id: oldId }] : [])] });
  await Invite.create(inviteDoc);
  const c = payload.collections || {};
  const inserted = {};
  inserted.guests = (await insertManyIfAny(Guest, c.guests)).inserted;
  inserted.rsvps = (await insertManyIfAny(Rsvp, c.rsvps)).inserted;
  inserted.messages = (await insertManyIfAny(Message, c.messages)).inserted;
  inserted.gifts = (await insertManyIfAny(GiftItem, c.gifts)).inserted;
  inserted.contributions = (await insertManyIfAny(Contribution, c.contributions)).inserted;
  inserted.checkins = (await insertManyIfAny(CheckIn, c.checkins)).inserted;
  inserted.photos = (await insertManyIfAny(CapsulePhoto, c.photos)).inserted;
  inserted.activities = (await insertManyIfAny(Activity, c.activities)).inserted;
  inserted.clients = (await insertManyIfAny(Client, c.clients)).inserted;
  const restoredInvite = await Invite.findOne({ slug });
  await logActivity({ invite: restoredInvite, type: 'warning', title: 'Backup restaurado', detail: slug, meta: { scope: 'invite', inserted } });
  return { scope: 'invite', slug, inserted, invite: cleanInviteDoc(restoredInvite) };
}
async function restoreAllBackupPayload(payload) {
  if (!payload || payload.scope !== 'all' || !Array.isArray(payload.invites)) {
    const err = new Error('Este backup não é geral.');
    err.statusCode = 400;
    throw err;
  }
  await Promise.all([
    Invite.deleteMany({}), Guest.deleteMany({}), Rsvp.deleteMany({}), Message.deleteMany({}), GiftItem.deleteMany({}),
    Contribution.deleteMany({}), CheckIn.deleteMany({}), CapsulePhoto.deleteMany({}), Activity.deleteMany({}), Client.deleteMany({}), MarketingCampaign.deleteMany({})
  ]);
  const c = payload.collections || {};
  const inserted = {};
  inserted.invites = (await insertManyIfAny(Invite, payload.invites)).inserted;
  inserted.guests = (await insertManyIfAny(Guest, c.guests)).inserted;
  inserted.rsvps = (await insertManyIfAny(Rsvp, c.rsvps)).inserted;
  inserted.messages = (await insertManyIfAny(Message, c.messages)).inserted;
  inserted.gifts = (await insertManyIfAny(GiftItem, c.gifts)).inserted;
  inserted.contributions = (await insertManyIfAny(Contribution, c.contributions)).inserted;
  inserted.checkins = (await insertManyIfAny(CheckIn, c.checkins)).inserted;
  inserted.photos = (await insertManyIfAny(CapsulePhoto, c.photos)).inserted;
  inserted.activities = (await insertManyIfAny(Activity, c.activities)).inserted;
  inserted.clients = (await insertManyIfAny(Client, c.clients)).inserted;
  inserted.campaigns = (await insertManyIfAny(MarketingCampaign, c.campaigns)).inserted;
  await Activity.create({ type: 'warning', title: 'Backup geral restaurado', detail: `${inserted.invites || 0} convite(s) restaurados`, meta: { scope: 'all', inserted }, timestamp: new Date() });
  return { scope: 'all', inserted };
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

// Lista exacta do convite Binigna & Leonel. Mantém o backend alinhado com
// event-data.js para que todos os presentes visíveis no convite possam ser
// reservados no MongoDB e bloqueados correctamente.
const INVITE_SPECIFIC_GIFTS = {
  'binigna-leonel': [
    'Microondas',
    'Taças de cristal',
    'Jogo de banho Maria',
    'Máquina de café',
    'Máquina de sumo',
    'Jogo de chávenas',
    'Tigelas organizadoras de geleira',
    'Ferro de engomar',
    'Jogo de talheres',
    'Tábuas de madeira',
    'Edredon casal',
    'Organizador de gavetas',
    'Tapete para sala (cinza)',
    'Batedeira',
    'Airfryer',
    'Máquina de lavar',
    'Panelas anti aderentes',
    'Fogão a gás e forno elétrico'
  ]
};

function giftSeedListForInvite(invite) {
  const slug = String(invite?.slug || '').trim().toLowerCase();
  const custom = INVITE_SPECIFIC_GIFTS[slug] || [];
  return Array.from(new Set([...(custom.length ? custom : DEFAULT_GIFTS), ...DEFAULT_GIFTS]));
}

async function seedDefaultGifts(invite) {
  if (!invite || !invite._id) return;

  for (const name of giftSeedListForInvite(invite)) {
    try {
      await GiftItem.updateOne(
        { inviteId: invite._id, name },
        { $setOnInsert: { inviteId: invite._id, slug: invite.slug, name, category: 'Lista de presentes', reserved: false } },
        { upsert: true }
      );
    } catch (err) {
      if (err && err.code === 11000) {
        console.warn(`Presente duplicado ignorado em ${invite.slug}: ${name}`);
        continue;
      }
      throw err;
    }
  }
}

app.get('/health', async (req, res) => res.json({ status: 'ok', service: 'lirandzo-adminmanager', mongo: mongoose.connection.readyState === 1 ? 'connected' : 'not_connected', githubConfigured: githubReady() }));

app.post('/manager/login', (req, res) => {
  const { password, accessType, role } = req.body || {};
  const requestedRole = String(accessType || role || 'admin').toLowerCase() === 'editor' ? 'editor' : 'admin';
  const adminPassword = process.env.MANAGER_ADMIN_PASSWORD || process.env.MANAGER_PASSWORD;
  const editorPassword = process.env.MANAGER_EDITOR_PASSWORD;

  if (!adminPassword) return res.status(500).json({ status: 'error', message: 'MANAGER_ADMIN_PASSWORD ou MANAGER_PASSWORD não configurado no Render.' });
  if (requestedRole === 'editor' && !editorPassword) return res.status(500).json({ status: 'error', message: 'MANAGER_EDITOR_PASSWORD não configurado no Render.' });
  if (!process.env.MANAGER_SECRET || String(process.env.MANAGER_SECRET).length < 16) {
    return res.status(500).json({ status: 'error', message: 'MANAGER_SECRET precisa de pelo menos 16 caracteres no Render.' });
  }

  const expectedPassword = requestedRole === 'editor' ? editorPassword : adminPassword;
  if (String(password || '') !== String(expectedPassword)) return res.status(401).json({ status: 'error', message: 'Senha incorrecta para o tipo de acesso seleccionado.' });
  const token = signToken({ scope: 'manager', role: requestedRole, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 12 });
  res.json({ status: 'success', token, role: requestedRole, permissions: requestedRole === 'admin' ? ['view','create','edit','delete','erase'] : ['view','edit_limited'] });
});

app.get('/manager/summary', requireManager, async (req, res) => {
  const activeInviteIds = await Invite.find({ status: { $ne: 'archived' } }).distinct('_id');
  const scoped = { inviteId: { $in: activeInviteIds } };
  const [totalInvites, published, draft, guests, rsvps, messages, contributions, activities] = await Promise.all([
    Invite.countDocuments({ status: { $ne: 'archived' } }),
    Invite.countDocuments({ status: 'published' }),
    Invite.countDocuments({ status: 'draft' }),
    Guest.countDocuments(scoped),
    Rsvp.countDocuments(scoped),
    Message.countDocuments(scoped),
    Contribution.countDocuments(scoped),
    Activity.find(activeInviteIds.length ? { inviteId: { $in: activeInviteIds } } : {}).sort({ timestamp: -1 }).limit(25)
  ]);
  res.json({
    status: 'success',
    data: { totalInvites, published, draft, guests, rsvps, messages, contributions, activities }
  });
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

app.post('/manager/invites', requireManager, requireAdmin, async (req, res) => {
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
  const adminAllowed = ['clientName', 'coupleNames', 'bride', 'groom', 'status', 'eventDateISO', 'rsvpDeadline', 'publicUrl', 'config'];
  const editorAllowed = ['clientName', 'coupleNames', 'bride', 'groom', 'eventDateISO', 'rsvpDeadline', 'publicUrl', 'config'];
  const allowed = req.manager.role === 'admin' ? adminAllowed : editorAllowed;
  const update = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
  if (Object.keys(update).length === 0) return res.status(403).json({ status: 'error', message: 'Editor não pode alterar estado, apagar, criar ou executar acções administrativas.' });
  if (update.status === 'published') update.publishedAt = new Date();
  const invite = await Invite.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  await logActivity({ invite, type: 'invite', title: 'Convite actualizado', detail: invite.slug });
  res.json({ status: 'success', data: cleanInviteDoc(invite) });
});
app.delete('/manager/invites/:id', requireManager, requireAdmin, async (req, res) => {
  const invite = await Invite.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  await logActivity({ invite, type: 'invite', title: 'Convite arquivado', detail: invite.slug });
  res.json({ status: 'success', data: cleanInviteDoc(invite) });
});
app.post('/manager/invites/:id/github-sync', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);

  if (!invite) {
    return res.status(404).json({
      status: 'error',
      message: 'Convite não encontrado.'
    });
  }

  try {
    const allowOverwrite = parseBool(req.body?.allowOverwrite || req.query?.overwrite || false);
    const github = await copyPackageTemplateToClient({ invite, allowOverwrite });

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

    invalidateLegacyGiftRepairCache(invite);

    return res.json({
      status: 'success',
      message: allowOverwrite ? 'Pasta actualizada no GitHub com sucesso.' : 'Pasta criada no GitHub com sucesso.',
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

app.get('/manager/invites/:id/guests', requireManager, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  const q = String(req.query.q || '').trim();
  const filter = { inviteId: invite._id };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { normalizedName: rx }, { table: rx }, { category: rx }, { phone: rx }, { notes: rx }, { legacyToken: rx }, { inviteToken: rx }];
  }
  const guests = await Guest.find(filter).sort({ number: 1, name: 1 });
  res.json({ status: 'success', data: guests.map(cleanGuestForManager) });
}));

app.post('/manager/invites/:id/guests', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  const payload = buildGuestPayloadForManager(invite, req.body || {});
  await ensureNoGuestDuplicate(invite, payload.normalizedName);
  const guest = await Guest.create(payload);
  await logActivity({ invite, type: 'guests', title: 'Convidado criado no AdminManager', detail: guest.name, meta: { guestId: String(guest._id) } });
  res.status(201).json({ status: 'success', message: 'Convidado criado com sucesso.', data: cleanGuestForManager(guest) });
}));

app.patch('/manager/invites/:id/guests/:guestId', requireManager, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  const guest = await Guest.findOne({ _id: req.params.guestId, inviteId: invite._id });
  if (!guest) return res.status(404).json({ status: 'error', message: 'Convidado não encontrado.' });
  let body = req.body || {};
  if (req.manager.role === 'editor') {
    const editorGuestFields = ['name', 'table', 'mesa', 'companions', 'phone', 'number', 'category', 'notes', 'status'];
    body = Object.fromEntries(Object.entries(body).filter(([key]) => editorGuestFields.includes(key)));
  }
  const payload = buildGuestPayloadForManager(invite, body, guest);
  await ensureNoGuestDuplicate(invite, payload.normalizedName, guest._id);
  Object.assign(guest, payload);
  await guest.save();

  await Promise.all([
    Rsvp.updateMany({ inviteId: invite._id, guestId: guest._id }, { $set: { nome: guest.name, mesa: guest.table || '', guests: Number(guest.maxGuests) || 1, phone: guest.phone || '' } }),
    CheckIn.updateMany({ inviteId: invite._id, guestId: guest._id }, { $set: { nome: guest.name, mesa: guest.table || '', guests: Number(guest.maxGuests) || 1, token: guest.inviteToken || '' } })
  ]);

  await logActivity({ invite, type: 'guests', title: 'Convidado editado no AdminManager', detail: guest.name, meta: { guestId: String(guest._id) } });
  res.json({ status: 'success', message: 'Convidado actualizado com sucesso.', data: cleanGuestForManager(guest) });
}));

async function forceResetGuestState(invite, guestId, { resetStatus = true } = {}) {
  const targetStatus = 'Não aberto';
  const update = resetStatus
    ? {
        $set: { status: targetStatus, deviceToken: '' },
        $unset: { openedAt: '', lastOpenedAt: '', lastOpenAt: '', accessDevice: '', deviceId: '', lastDeviceToken: '' }
      }
    : {
        $set: { deviceToken: '' },
        $unset: { accessDevice: '', deviceId: '', lastDeviceToken: '' }
      };

  const guest = await Guest.findOneAndUpdate(
    { _id: guestId, inviteId: invite._id },
    update,
    { new: true, runValidators: false }
  );

  if (!guest) {
    const err = new Error('Convidado não encontrado.');
    err.statusCode = 404;
    throw err;
  }

  const verified = await Guest.findOne({ _id: guest._id, inviteId: invite._id });
  if (!verified) {
    const err = new Error('Não foi possível verificar o convidado depois da actualização.');
    err.statusCode = 500;
    throw err;
  }

  if (resetStatus && String(verified.status || '').trim() !== targetStatus) {
    const err = new Error(`MongoDB não gravou o estado "${targetStatus}". Estado actual: ${verified.status || 'vazio'}.`);
    err.statusCode = 500;
    throw err;
  }

  return verified;
}

app.post('/manager/invites/:id/guests/:guestId/reset-state', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const guest = await forceResetGuestState(invite, req.params.guestId, { resetStatus: true });
  await logActivity({
    invite,
    type: 'guests',
    title: 'Estado de convidado reposto',
    detail: guest.name,
    meta: { guestId: String(guest._id), status: guest.status, endpoint: 'reset-state' }
  });

  res.json({ status: 'success', message: 'Convidado reposto para Não aberto.', data: cleanGuestForManager(guest) });
}));

app.post('/manager/invites/:id/guests/:guestId/reset-access', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const resetState = req.body?.resetState === true || req.body?.resetStatus === true;
  const guest = await forceResetGuestState(invite, req.params.guestId, { resetStatus: resetState });

  await logActivity({
    invite,
    type: 'guests',
    title: resetState ? 'Estado de convidado reposto' : 'Acesso de convidado reiniciado',
    detail: guest.name,
    meta: { guestId: String(guest._id), resetState, endpoint: 'reset-access' }
  });

  res.json({ status: 'success', message: resetState ? 'Acesso e estado do convidado repostos.' : 'Acesso do convidado reiniciado.', data: cleanGuestForManager(guest) });
}));

app.delete('/manager/invites/:id/guests/:guestId', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  const guest = await Guest.findOne({ _id: req.params.guestId, inviteId: invite._id });
  if (!guest) return res.status(404).json({ status: 'error', message: 'Convidado não encontrado.' });
  const guestName = guest.name;
  const [rsvps, checkins] = await Promise.all([
    Rsvp.deleteMany({ inviteId: invite._id, guestId: guest._id }),
    CheckIn.deleteMany({ inviteId: invite._id, guestId: guest._id })
  ]);
  await Guest.deleteOne({ _id: guest._id, inviteId: invite._id });
  await logActivity({ invite, type: 'guests', title: 'Convidado eliminado no AdminManager', detail: `${guestName} · RSVP removidos: ${rsvps.deletedCount || 0} · Check-ins removidos: ${checkins.deletedCount || 0}` });
  res.json({ status: 'success', message: 'Convidado eliminado com sucesso.', data: { deleted: 1, rsvps: rsvps.deletedCount || 0, checkins: checkins.deletedCount || 0 } });
}));

app.post('/manager/invites/:id/guests/bulk', requireManager, requireAdmin, async (req, res) => {
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
    const notes = buildGuestNotes({ notes: entry.notes });

    try {
      const existing = await findGuestByNormalizedOrName(invite._id, nameRaw, { repair: true });
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
        existing.legacyToken = oldToken || existing.legacyToken || '';
        existing.normalizedName = normalizedName;
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
          legacyToken: oldToken,
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

app.post('/manager/invites/:id/guests/repair-normalized', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const result = await repairGuestsForInvite(invite);

  await logActivity({
    invite,
    type: 'guests',
    title: 'Normalização de convidados reparada',
    detail: `${result.repaired} reparados · ${result.failed.length} falhas`
  });

  res.json({
    status: 'success',
    message: `Normalização verificada: ${result.repaired} reparado(s), ${result.alreadyOk} já correcto(s), ${result.failed.length} falha(s).`,
    data: result
  });
}));

app.post('/manager/guests/repair-normalized', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invites = await Invite.find({});
  const total = { checked: 0, repaired: 0, alreadyOk: 0, failed: [] };

  for (const invite of invites) {
    const result = await repairGuestsForInvite(invite);
    total.checked += result.checked;
    total.repaired += result.repaired;
    total.alreadyOk += result.alreadyOk;
    result.failed.forEach(item => total.failed.push({ slug: invite.slug, ...item }));
  }

  await logActivity({
    type: 'guests',
    title: 'Normalização global de convidados reparada',
    detail: `${total.repaired} reparados · ${total.failed.length} falhas`
  });

  res.json({
    status: 'success',
    message: `Normalização global verificada: ${total.repaired} reparado(s), ${total.alreadyOk} já correcto(s), ${total.failed.length} falha(s).`,
    data: total
  });
}));


app.post('/manager/invites/:id/guests/reset-access', requireManager, requireAdmin, async (req, res) => {
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

app.post('/manager/invites/:id/gifts/reset-reservations', requireManager, requireAdmin, async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const result = await GiftItem.updateMany(
    { inviteId: invite._id },
    {
      $set: { reserved: false, reservedBy: '', reservedByNormalized: '', reservedToken: '', reservedSource: '', reservedContributionId: null, reservedAt: null },
      $unset: { reservedByGuestId: '' }
    }
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

app.delete('/manager/invites/:id/gifts', requireManager, requireAdmin, async (req, res) => {
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


app.post('/manager/invites/:id/gifts/repair-legacy', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  const result = await ensureLegacyGiftReservations(invite, { force: true });
  await logActivity({
    invite,
    type: 'gift',
    title: 'Registos antigos de presentes reparados',
    detail: `${result.reserved} reservado(s) · ${result.conflicts} conflito(s) · ${result.unresolved} sem identificação`,
    meta: result
  });
  res.json({ status: 'success', message: 'Registos antigos de presentes verificados e sincronizados.', data: result });
}));

app.post('/manager/invites/:id/gifts/seed-defaults', requireManager, requireAdmin, async (req, res) => {
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


app.delete('/manager/invites/:id/data', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const invite = await Invite.findById(req.params.id);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });

  const allowed = new Set(['guests', 'rsvps', 'messages', 'gifts', 'contributions', 'checkins', 'photos', 'activities']);
  let collections = req.body?.collections || req.query?.collections || 'all';
  if (typeof collections === 'string') collections = collections.split(',').map(x => x.trim()).filter(Boolean);
  if (!Array.isArray(collections) || !collections.length || collections.includes('all')) collections = Array.from(allowed);
  collections = collections.filter(x => allowed.has(x));
  if (!collections.length) return res.status(400).json({ status: 'error', message: 'Nenhuma colecção válida foi indicada para apagar.' });

  const inviteId = invite._id;
  const deleted = {};
  async function del(key, fn) {
    if (!collections.includes(key)) return;
    const result = await fn();
    deleted[key] = result.deletedCount || 0;
  }

  await del('guests', () => Guest.deleteMany({ inviteId }));
  await del('rsvps', () => Rsvp.deleteMany({ inviteId }));
  await del('messages', () => Message.deleteMany({ inviteId }));
  await del('gifts', () => GiftItem.deleteMany({ inviteId }));
  await del('contributions', () => Contribution.deleteMany({ inviteId }));
  await del('checkins', () => CheckIn.deleteMany({ inviteId }));
  await del('photos', () => CapsulePhoto.deleteMany({ inviteId }));
  await del('activities', () => Activity.deleteMany({ inviteId }));

  if (parseBool(req.body?.archive || req.query?.archive)) {
    invite.status = 'archived';
    await invite.save();
  }

  await logActivity({ invite, type: 'warning', title: 'Erase de dados executado', detail: `${invite.slug} · ${Object.entries(deleted).map(([k,v]) => `${k}: ${v}`).join(' · ')}`, meta: { deleted, keptInvite: true } });

  res.json({
    status: 'success',
    message: 'Dados do convite apagados com sucesso. O registo do convite foi mantido.',
    data: { slug: invite.slug, deleted, inviteKept: true, archived: invite.status === 'archived' }
  });
}));

app.delete('/manager/invites/:id/purge', requireManager, requireAdmin, async (req, res) => {
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



app.get('/manager/clients/stats', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const [total, active, paused, unsubscribed, archived, consent, withEmail, campaigns] = await Promise.all([
    Client.countDocuments({}), Client.countDocuments({ status: 'active' }), Client.countDocuments({ status: 'paused' }),
    Client.countDocuments({ status: 'unsubscribed' }), Client.countDocuments({ status: 'archived' }),
    Client.countDocuments({ marketingConsent: true, status: 'active', email: { $ne: '' } }),
    Client.countDocuments({ email: { $ne: '' } }), MarketingCampaign.countDocuments({})
  ]);
  res.json({ status: 'success', data: { total, active, paused, unsubscribed, archived, consent, withEmail, campaigns, resendConfigured: Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM)) } });
}));

app.get('/manager/clients', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const { q = '', status = 'active', inviteId = '', tag = '', limit = '200' } = req.query;
  const filter = {};
  if (status !== 'all') filter.status = status;
  if (validObjectId(inviteId)) filter.inviteId = new mongoose.Types.ObjectId(inviteId);
  if (tag) filter.tags = String(tag);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { company: rx }, { contactPerson: rx }, { email: rx }, { phone: rx }, { whatsapp: rx }, { slug: rx }, { notes: rx }, { tags: rx }];
  }
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 200, 1), 1000);
  const clients = await Client.find(filter).sort({ updatedAt: -1, name: 1 }).limit(safeLimit);
  res.json({ status: 'success', data: clients.map(cleanClientDoc) });
}));

app.post('/manager/clients', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const payload = clientPayloadFromBody(req.body || {});
  if (!payload.name) return res.status(400).json({ status: 'error', message: 'Informe o nome do cliente.' });
  if (payload.email && !isValidEmail(payload.email)) return res.status(400).json({ status: 'error', message: 'Email inválido.' });
  if (payload.inviteId && !payload.slug) {
    const invite = await Invite.findById(payload.inviteId);
    if (invite) payload.slug = invite.slug;
  }
  const client = await Client.create(payload);
  await Activity.create({ type: 'clients', title: 'Cliente adicionado', detail: client.name, meta: { clientId: String(client._id), email: client.email }, timestamp: new Date() });
  res.status(201).json({ status: 'success', message: 'Cliente adicionado com sucesso.', data: cleanClientDoc(client) });
}));

app.put('/manager/clients/:id', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Cliente inválido.' });
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ status: 'error', message: 'Cliente não encontrado.' });
  const payload = clientPayloadFromBody(req.body || {});
  if (!payload.name) return res.status(400).json({ status: 'error', message: 'Informe o nome do cliente.' });
  if (payload.email && !isValidEmail(payload.email)) return res.status(400).json({ status: 'error', message: 'Email inválido.' });
  Object.assign(client, payload);
  await client.save();
  await Activity.create({ type: 'clients', title: 'Cliente actualizado', detail: client.name, meta: { clientId: String(client._id) }, timestamp: new Date() });
  res.json({ status: 'success', message: 'Cliente actualizado com sucesso.', data: cleanClientDoc(client) });
}));

app.delete('/manager/clients/:id', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Cliente inválido.' });
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ status: 'error', message: 'Cliente não encontrado.' });
  const confirmation = String(req.body?.confirmation || req.query?.confirmation || '').trim();
  if (confirmation !== 'ARQUIVAR CLIENTE') return res.status(400).json({ status: 'error', message: 'Para arquivar, escreva exactamente: ARQUIVAR CLIENTE' });
  client.status = 'archived';
  await client.save();
  await Activity.create({ type: 'clients', title: 'Cliente arquivado', detail: client.name, meta: { clientId: String(client._id) }, timestamp: new Date() });
  res.json({ status: 'success', message: 'Cliente arquivado com sucesso.', data: cleanClientDoc(client) });
}));

app.post('/manager/clients/import', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ status: 'error', message: 'Cole uma lista CSV/TXT para importar.' });
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delimiter = detectDelimiter(lines[0] || ';');
  let rows = lines.map(line => parseDelimitedLine(line, delimiter));
  if (looksLikeGuestHeader(rows[0] || [])) rows = rows.slice(1);
  const created = [];
  const skipped = [];
  for (const row of rows) {
    const name = row[0] || row[2] || '';
    const email = normalizeEmail(row[1] || '');
    const phone = row[2] || '';
    const company = row[3] || '';
    const tags = parseTags(row[4] || '');
    const notes = row[5] || '';
    if (!name && !email) { skipped.push({ raw: row.join(delimiter), reason: 'Sem nome/email' }); continue; }
    if (email && !isValidEmail(email)) { skipped.push({ raw: row.join(delimiter), reason: 'Email inválido' }); continue; }
    const existing = email ? await Client.findOne({ normalizedEmail: email, status: { $ne: 'archived' } }) : null;
    if (existing) { skipped.push({ raw: row.join(delimiter), reason: 'Email já existe' }); continue; }
    const doc = await Client.create({ name: String(name || email).trim(), normalizedName: normalizeText(name || email), email, normalizedEmail: email, phone, whatsapp: phone, company, tags, notes, source: 'import', status: 'active', marketingConsent: true });
    created.push(cleanClientDoc(doc));
  }
  await Activity.create({ type: 'clients', title: 'Clientes importados', detail: `${created.length} criado(s) · ${skipped.length} ignorado(s)`, meta: { skipped: skipped.slice(0, 30) }, timestamp: new Date() });
  res.status(201).json({ status: 'success', message: `${created.length} cliente(s) importado(s). ${skipped.length} linha(s) ignorada(s).`, data: { created, skipped } });
}));

app.get('/manager/marketing/campaigns', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const campaigns = await MarketingCampaign.find({}).sort({ createdAt: -1 }).limit(limit);
  res.json({ status: 'success', data: campaigns.map(cleanCampaignDoc) });
}));

app.post('/manager/marketing/send', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const confirmation = String(req.body?.confirmation || '').trim();
  if (confirmation !== 'ENVIAR EMAILS') return res.status(400).json({ status: 'error', message: 'Para enviar, escreva exactamente: ENVIAR EMAILS' });
  const subject = String(req.body?.subject || '').trim();
  const previewText = String(req.body?.previewText || '').trim();
  const bodyHtml = String(req.body?.bodyHtml || '').trim();
  const bodyText = String(req.body?.bodyText || '').trim();
  if (!subject) return res.status(400).json({ status: 'error', message: 'Informe o assunto do email.' });
  if (!bodyHtml && !bodyText) return res.status(400).json({ status: 'error', message: 'Escreva o conteúdo do email.' });
  const scope = String(req.body?.scope || 'active');
  const filter = { status: 'active', marketingConsent: true, email: { $ne: '' } };
  if (scope === 'selected') {
    const ids = Array.isArray(req.body?.clientIds) ? req.body.clientIds.filter(validObjectId).map(id => new mongoose.Types.ObjectId(id)) : [];
    if (!ids.length) return res.status(400).json({ status: 'error', message: 'Seleccione pelo menos um cliente.' });
    filter._id = { $in: ids };
  }
  const recipients = await Client.find(filter).sort({ name: 1 }).limit(1000);
  const validRecipients = recipients.filter(c => isValidEmail(c.email));
  if (!validRecipients.length) return res.status(400).json({ status: 'error', message: 'Nenhum cliente activo com email válido e consentimento de marketing.' });
  const html = marketingEmailHtml({ subject, previewText, bodyHtml, bodyText });
  const text = bodyText || htmlToPlainText(bodyHtml);
  const campaign = await MarketingCampaign.create({ subject, previewText, bodyHtml: html, bodyText: text, audience: scope, requestedByRole: req.manager.role, status: 'sending', totals: { requested: validRecipients.length, sent: 0, failed: 0 }, recipients: [] });
  const results = [];
  let sent = 0, failed = 0;
  for (const client of validRecipients) {
    try {
      const data = await sendResendEmail({ to: client.email, subject, html, text });
      sent += 1;
      client.lastEmailAt = new Date();
      client.emailsSent = (client.emailsSent || 0) + 1;
      client.lastCampaignId = campaign._id;
      await client.save();
      results.push({ clientId: String(client._id), name: client.name, email: client.email, status: 'sent', resendId: data.id || data.data?.id || '' });
    } catch (err) {
      failed += 1;
      results.push({ clientId: String(client._id), name: client.name, email: client.email, status: 'failed', error: err.message || 'Falha no envio' });
    }
  }
  campaign.status = failed && sent ? 'partial' : failed ? 'failed' : 'sent';
  campaign.sentAt = new Date();
  campaign.totals = { requested: validRecipients.length, sent, failed };
  campaign.recipients = results;
  await campaign.save();
  await Activity.create({ type: 'clients', title: 'Campanha de email enviada', detail: `${sent} enviado(s) · ${failed} falha(s)`, meta: { campaignId: String(campaign._id), subject }, timestamp: new Date() });
  res.json({ status: failed ? 'partial_success' : 'success', message: `Campanha concluída: ${sent} enviado(s), ${failed} falha(s).`, data: cleanCampaignDoc(campaign) });
}));

app.get('/manager/backups', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const { scope = 'all', q = '', limit = '80' } = req.query;
  const filter = { status: { $ne: 'deleted' } };
  if (['invite', 'all'].includes(String(scope))) filter.scope = scope;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ label: rx }, { slug: rx }, { coupleNames: rx }, { hash: rx }];
  }
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 80, 1), 200);
  const backups = await Backup.find(filter).sort({ createdAt: -1 }).limit(safeLimit);
  res.json({ status: 'success', data: backups.map(cleanBackupDoc) });
}));

app.post('/manager/backups', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  const scope = String(req.body?.scope || 'invite').toLowerCase() === 'all' ? 'all' : 'invite';
  let payload;
  let invite = null;
  if (scope === 'all') {
    payload = await collectAllBackupPayload({ includeArchived: req.body?.includeArchived !== false });
  } else {
    const inviteId = String(req.body?.inviteId || '').trim();
    if (!validObjectId(inviteId)) return res.status(400).json({ status: 'error', message: 'Seleccione um convite válido para criar backup.' });
    invite = await Invite.findById(inviteId);
    if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
    payload = await collectInviteBackupPayload(invite);
  }
  const backup = await createBackupRecord({ payload, label: req.body?.label || '', managerRole: req.manager.role });
  await logActivity({ invite, type: 'backup', title: scope === 'all' ? 'Backup geral criado' : 'Backup de convite criado', detail: scope === 'all' ? `${payload.counts.invites} convite(s)` : (invite?.slug || backup.slug), meta: { backupId: String(backup._id), counts: backup.counts } });
  res.status(201).json({ status: 'success', message: scope === 'all' ? 'Backup geral criado com sucesso.' : 'Backup do convite criado com sucesso.', data: cleanBackupDoc(backup) });
}));

app.get('/manager/backups/:id/download', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Backup inválido.' });
  const backup = await Backup.findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!backup) return res.status(404).json({ status: 'error', message: 'Backup não encontrado.' });
  const payload = payloadFromBackupDoc(backup);
  const body = JSON.stringify({ lirandzoBackup: true, backup: cleanBackupDoc(backup), payload }, null, 2);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${backupDownloadName(backup)}"`);
  res.send(body);
}));

app.post('/manager/backups/import', requireManager, requireAdmin, upload.single('backup'), asyncRoute(async (req, res) => {
  let parsed;
  if (req.file?.buffer) {
    parsed = JSON.parse(req.file.buffer.toString('utf8'));
  } else if (req.body?.payload) {
    parsed = typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body.payload;
  } else {
    return res.status(400).json({ status: 'error', message: 'Envie um ficheiro JSON de backup.' });
  }
  const payload = parsed.payload || parsed;
  if (!payload || !['invite', 'all'].includes(payload.scope)) return res.status(400).json({ status: 'error', message: 'Ficheiro de backup inválido.' });
  payload.counts = payload.counts || backupCounts(payload);
  const backup = await createBackupRecord({ payload, label: req.body?.label || parsed.backup?.label || 'Backup importado', managerRole: req.manager.role });
  await Activity.create({ type: 'backup', title: 'Backup importado', detail: backup.scope === 'all' ? 'Backup geral' : backup.slug, meta: { backupId: String(backup._id), counts: backup.counts }, timestamp: new Date() });
  res.status(201).json({ status: 'success', message: 'Backup importado com sucesso. Agora já pode restaurar a partir da lista.', data: cleanBackupDoc(backup) });
}));

app.post('/manager/backups/:id/restore', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Backup inválido.' });
  const backup = await Backup.findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!backup) return res.status(404).json({ status: 'error', message: 'Backup não encontrado.' });
  const confirmation = String(req.body?.confirmation || '').trim();
  const required = backup.scope === 'all' ? 'RESTAURAR TODOS OS CONVITES' : `RESTAURAR ${String(backup.slug || '').toUpperCase()}`;
  if (confirmation !== required) {
    return res.status(400).json({ status: 'error', message: `Confirmação inválida. Para restaurar, escreva exactamente: ${required}` });
  }
  const payload = payloadFromBackupDoc(backup);
  const result = backup.scope === 'all' ? await restoreAllBackupPayload(payload) : await restoreInviteBackupPayload(payload);
  backup.status = 'restored';
  backup.restoredAt = new Date();
  backup.restoredByRole = req.manager.role;
  backup.restoredMode = backup.scope === 'all' ? 'replace_all' : 'replace_invite';
  await backup.save();
  res.json({ status: 'success', message: backup.scope === 'all' ? 'Backup geral restaurado com sucesso.' : `Backup do convite ${backup.slug} restaurado com sucesso.`, data: { backup: cleanBackupDoc(backup), result } });
}));

app.delete('/manager/backups/:id', requireManager, requireAdmin, asyncRoute(async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Backup inválido.' });
  const backup = await Backup.findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!backup) return res.status(404).json({ status: 'error', message: 'Backup não encontrado.' });
  const confirmation = String(req.body?.confirmation || req.query?.confirmation || '').trim();
  if (confirmation !== 'ELIMINAR BACKUP') {
    return res.status(400).json({ status: 'error', message: 'Para eliminar este backup, escreva exactamente: ELIMINAR BACKUP' });
  }
  backup.status = 'deleted';
  await backup.save();
  await Activity.create({ type: 'backup', title: 'Backup eliminado', detail: backup.scope === 'all' ? 'Backup geral' : backup.slug, meta: { backupId: String(backup._id) }, timestamp: new Date() });
  res.json({ status: 'success', message: 'Backup eliminado da lista com sucesso.', data: cleanBackupDoc(backup) });
}));

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
    if (action === 'list_gift_selections_fast') return listGiftSelectionsFast(req, res, invite);
    if (action === 'list_gift_selections') return listGiftSelections(req, res, invite);
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
    if (action === 'save_gifts' || action === 'reserve_gift' || action === 'reserve_gifts' || action === 'choose_gift') return handleSaveGifts(req, res, invite);
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
  const existing = await findGuestByNormalizedOrName(invite._id, name, { repair: true });
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
  const guest = rsvp.guestId ? await Guest.findOne({ _id: rsvp.guestId, inviteId: invite._id }) : await findGuestByNormalizedOrName(invite._id, rsvp.nome, { repair: true });
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
  const guest = checkin.guestId ? await Guest.findOne({ _id: checkin.guestId, inviteId: invite._id }) : await findGuestByNormalizedOrName(invite._id, checkin.nome, { repair: true });
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
    process.env.MANAGER_ADMIN_PASSWORD || '',
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
  if (payload && normalizeManagerRole(payload)) return true;

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

    if (data.action === 'stats') return getPublicStats(req, res, invite);
    if (data.action === 'get_rsvps') return res.json({ status: 'success', data: await Rsvp.find({ inviteId: invite._id }).sort({ timestamp: -1 }) });
    if (data.action === 'get_gift_selections_fast' || data.action === 'list_gift_selections_fast') {
      return res.json({ status: 'success', data: await listGiftSelectionsFastForAdmin(invite) });
    }
    if (data.action === 'get_gift_selections' || data.action === 'list_gift_selections') {
      return res.json({ status: 'success', data: await listGiftSelectionsForAdmin(invite) });
    }
    if (data.action === 'get_gifts' || data.action === 'list_gifts') return res.json({ status: 'success', data: await listGiftRowsForPublic(invite) });
    if (data.action === 'get_comprovativos' || data.action === 'list_gift_records') {
      await ensureLegacyGiftReservations(invite);
      const rows = await Contribution.find({ inviteId: invite._id }).sort({ timestamp: -1 }).select('-fileBase64');
      return res.json({ status: 'success', data: await cleanContributionRowsForPublic(rows, invite) });
    }
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

function cleanGuestForManager(guest) {
  const data = cleanGuestForPublic(guest);
  return {
    ...data,
    id: String(guest._id),
    _id: String(guest._id),
    inviteId: String(guest.inviteId || ''),
    slug: guest.slug || '',
    normalizedName: guest.normalizedName || '',
    deviceToken: guest.deviceToken || '',
    legacyToken: guest.legacyToken || '',
    inviteToken: guest.inviteToken || '',
    createdAt: guest.createdAt || null,
    updatedAt: guest.updatedAt || null
  };
}

function buildGuestPayloadForManager(invite, body = {}, existing = null) {
  const name = String(body.name ?? body.nome ?? '').trim();
  if (!name) {
    const err = new Error('Nome do convidado é obrigatório.');
    err.statusCode = 400;
    throw err;
  }
  const companions = Math.max(0, Number.parseInt(body.companions ?? body.acompanhantes ?? 0, 10) || 0);
  const explicitMaxGuests = Number.parseInt(body.maxGuests ?? body.maxGuestsTotal ?? '', 10);
  const maxGuests = Number.isFinite(explicitMaxGuests) && explicitMaxGuests > 0 ? Math.max(1, explicitMaxGuests) : Math.max(1, companions + 1);
  return {
    inviteId: invite._id,
    slug: invite.slug,
    name,
    normalizedName: normalizeText(name),
    status: existing ? (String(body.status ?? existing.status ?? 'Não aberto').trim() || 'Não aberto') : 'Não aberto',
    deviceToken: String(body.deviceToken ?? existing?.deviceToken ?? '').trim(),
    table: String(body.table ?? body.mesa ?? existing?.table ?? '').trim(),
    companions,
    maxGuests,
    phone: String(body.phone ?? existing?.phone ?? '').trim(),
    notes: buildGuestNotes({ notes: body.notes ?? existing?.notes ?? '' }),
    legacyToken: String(body.legacyToken ?? existing?.legacyToken ?? '').trim(),
    inviteToken: String(body.inviteToken ?? existing?.inviteToken ?? '').trim() || generateGuestPublicToken(),
    number: Math.max(0, Number.parseInt(body.number ?? existing?.number ?? 0, 10) || 0),
    category: String(body.category ?? existing?.category ?? '').trim(),
    checkedIn: Boolean(body.checkedIn ?? existing?.checkedIn ?? false),
    checkedInAt: body.checkedIn ? (existing?.checkedInAt || new Date()) : (existing?.checkedInAt || undefined)
  };
}

async function ensureNoGuestDuplicate(invite, normalizedName, excludeGuestId = '') {
  const duplicate = await Guest.findOne({ inviteId: invite._id, normalizedName });
  if (duplicate && String(duplicate._id) !== String(excludeGuestId || '')) {
    const err = new Error(`Já existe um convidado com este nome: ${duplicate.name}`);
    err.statusCode = 409;
    throw err;
  }
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

  if (!guest && rawName) guest = await findGuestByNormalizedOrName(invite._id, rawName, { repair: true });
  return guest;
}
async function getPublicStats(req, res, invite) {
  const [guests, rsvps, contributions, messages, checkins, photos, gifts] = await Promise.all([
    Guest.find({ inviteId: invite._id }).select('maxGuests companions checkedIn status'),
    Rsvp.find({ inviteId: invite._id }).select('guests'),
    Contribution.countDocuments({ inviteId: invite._id }),
    Message.countDocuments({ inviteId: invite._id, hidden: { $ne: true } }),
    CheckIn.find({ inviteId: invite._id }).select('guests'),
    CapsulePhoto.countDocuments({ inviteId: invite._id }),
    GiftItem.countDocuments({ inviteId: invite._id, reserved: true })
  ]);
  const totalPeople = guests.reduce((sum, g) => sum + (Number(g.maxGuests) || (1 + (Number(g.companions) || 0))), 0);
  const confirmed = rsvps.reduce((sum, r) => sum + (Number(r.guests) || 1), 0);
  const checkedPeople = checkins.reduce((sum, c) => sum + (Number(c.guests) || 1), 0);
  const openedRows = guests.filter(g => {
    const status = normalizeText(g.status || '');
    return guestStatusIndicatesOpened(status) || status.includes('confirm') || status.includes('check') || Boolean(g.checkedIn);
  }).length;
  const confirmedRows = rsvps.length;
  sendJson(req, res, {
    status: 'success',
    data: {
      guestsCount: guests.length,
      totalPeople,
      openedRows,
      notOpenedRows: Math.max(guests.length - openedRows, 0),
      confirmed,
      confirmedRows,
      checkedPeople,
      checkedIn: checkins.length,
      gifts,
      contributions,
      messages,
      photos
    }
  });
}
async function listGuests(req, res, invite) {
  const guests = await Guest.find({ inviteId: invite._id }).sort({ number: 1, name: 1 });
  sendJson(req, res, { status: 'success', data: guests.map(cleanGuestForPublic) });
}
async function listRsvps(req, res, invite) {
  const rows = await Rsvp.find({ inviteId: invite._id }).sort({ timestamp: -1 });
  sendJson(req, res, { status: 'success', data: rows });
}


function safeParseObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}
function normalizeGiftKeyServer(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}
function compactGiftKeyServer(value) {
  return normalizeGiftKeyServer(value).replace(/\s+/g, '');
}
function isGenericGiftSelectionText(value) {
  const v = normalizeGiftKeyServer(value);
  return !v || ['presente escolhido', 'presentes escolhidos', 'presente', 'contribuicao registada', 'contribuicao registrada', 'registo antigo sem item identificado'].includes(v);
}
function valuesFromMaybeList(value) {
  if (Array.isArray(value)) return value.flatMap(valuesFromMaybeList);
  if (typeof value === 'string' && value.includes(',')) return value.split(',').map(v => v.trim());
  return value === undefined || value === null ? [] : [value];
}
function giftContributionTime(row) {
  return row?.timestamp || row?.createdAt || row?.updatedAt || new Date();
}

const LEGACY_GIFT_REPAIR_CACHE = new Map();
const LEGACY_GIFT_REPAIR_CACHE_MS = Number(process.env.LEGACY_GIFT_REPAIR_CACHE_MS || 5 * 60 * 1000);
function invalidateLegacyGiftRepairCache(invite) {
  const key = String(invite?._id || invite || '');
  if (key) LEGACY_GIFT_REPAIR_CACHE.delete(key);
}
async function legacyGiftRowsNeedRepair(invite) {
  const needs = await Contribution.exists({
    inviteId: invite._id,
    canal: /presente escolhido/i,
    $or: [
      { legacyGiftMigrated: { $ne: true } },
      { selectedGift: { $in: [null, ''] } },
      { giftChoice: { $in: [null, ''] } }
    ]
  });
  return Boolean(needs);
}

async function giftOptionNamesForInvite(invite) {
  await seedDefaultGifts(invite);
  const rows = await GiftItem.find({ inviteId: invite._id }).select('name').lean();
  return rows.map(row => row.name).filter(Boolean);
}
async function giftOptionNamesFastForInvite(invite) {
  const rows = await GiftItem.find({ inviteId: invite._id }).select('name').lean();
  return Array.from(new Set([
    ...giftSeedListForInvite(invite),
    ...rows.map(row => row.name).filter(Boolean)
  ]));
}
function matchGiftNameFromSlugOrText(rawValue, options = []) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const normalizedRaw = normalizeGiftKeyServer(raw);
  if (!normalizedRaw || isGenericGiftSelectionText(normalizedRaw)) return '';

  const exact = options.find(name => normalizeGiftKeyServer(name) === normalizedRaw);
  if (exact) return exact;

  const compactRaw = normalizedRaw.replace(/\s+/g, '');
  const compactMatch = options.find(name => normalizeGiftKeyServer(name).replace(/\s+/g, '') === compactRaw);
  if (compactMatch) return compactMatch;

  return raw;
}
function inferGiftNameFromFilenameLike(value, options = []) {
  const filename = String(value || '').trim();
  if (!filename) return '';
  const match = filename.match(/presente[-_\s]*escolhido[-_\s]*(.+?)(?:\.[a-z0-9]+)?$/i);
  if (!match || !match[1]) return '';
  const candidate = match[1]
    .replace(/^\d+[-_\s]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return matchGiftNameFromSlugOrText(candidate, options);
}
function inferGiftNameFromContribution(row, options = []) {
  const d = safeParseObject(row.details);
  const directValues = [
    row.selectedGift,
    row.giftChoice,
    row.giftName,
    row.gift,
    row.selectedGifts,
    row.gifts,
    d.selectedGift,
    d.giftChoice,
    d.giftName,
    d.gift,
    d.selectedGifts,
    d.gifts
  ].flatMap(valuesFromMaybeList).map(v => String(v || '').trim()).filter(Boolean);

  for (const value of directValues) {
    const matched = matchGiftNameFromSlugOrText(value, options);
    if (matched) return matched;
  }

  const fromFileName = inferGiftNameFromFilenameLike(row.originalName || row.fileName || row.filename || '', options);
  if (fromFileName) return fromFileName;

  return '';
}
function isGiftContributionChannel(row) {
  return normalizeGiftKeyServer(row?.canal || '').includes('presente escolhido');
}
function isSameGiftName(a, b) {
  return compactGiftKeyServer(a) === compactGiftKeyServer(b);
}
async function findGiftItemByName(invite, giftName) {
  let item = await GiftItem.findOne({ inviteId: invite._id, name: exactRegex(giftName) });
  if (item) return item;
  const all = await GiftItem.find({ inviteId: invite._id });
  return all.find(row => isSameGiftName(row.name, giftName)) || null;
}
async function markContributionGiftMeta(row, patch = {}) {
  const currentDetails = safeParseObject(row.details);
  const nextDetails = { ...currentDetails, ...(patch.details || {}) };
  const update = { ...patch, details: nextDetails };
  delete update._id;
  await Contribution.updateOne({ _id: row._id }, { $set: update });
}
async function createOrUpdateGiftAuditContribution({ invite, guest, reservedBy, reservedToken, gift, reservedAt }) {
  const selectedGift = gift?.name || '';
  if (!selectedGift) return;
  const nome = String(reservedBy || guest?.name || 'Convidado').trim();
  const tokenValue = String(reservedToken || guest?.inviteToken || '').trim();
  const baseFilter = {
    inviteId: invite._id,
    canal: 'Presente escolhido',
    selectedGift,
    nome
  };
  await Contribution.findOneAndUpdate(
    baseFilter,
    {
      $setOnInsert: {
        inviteId: invite._id,
        slug: invite.slug,
        nome,
        canal: 'Presente escolhido',
        fileName: '',
        originalName: '',
        mimeType: '',
        size: 0,
        fileBase64: '',
        fileUrl: '',
        timestamp: reservedAt || new Date()
      },
      $set: {
        selectedGift,
        giftChoice: selectedGift,
        selectedGifts: [selectedGift],
        gifts: selectedGift,
        token: tokenValue,
        legacyGiftMigrated: true,
        legacyGiftConflict: false,
        legacyGiftConflictReason: '',
        legacyGiftReservedInGiftItem: true,
        legacyGiftReservedBy: nome,
        legacyGiftReservedAt: reservedAt || new Date(),
        details: { selectedGift, selectedGifts: [selectedGift], giftChoice: selectedGift, nome, token: tokenValue, source: 'save_gifts' }
      }
    },
    { upsert: true, new: true }
  );
}
async function ensureLegacyGiftReservations(invite, optionsArg = {}) {
  if (!invite || !invite._id) return { scanned: 0, migrated: 0, reserved: 0, conflicts: 0, unresolved: 0 };

  const cacheKey = String(invite._id);
  const cached = LEGACY_GIFT_REPAIR_CACHE.get(cacheKey);
  if (!optionsArg.force && cached && (Date.now() - cached.at) < LEGACY_GIFT_REPAIR_CACHE_MS) {
    const needsRepair = await legacyGiftRowsNeedRepair(invite);
    if (!needsRepair) return cached.result;
  }

  await seedDefaultGifts(invite);
  const options = await giftOptionNamesForInvite(invite);
  const rows = await Contribution.find({ inviteId: invite._id, canal: /presente escolhido/i })
    .sort({ timestamp: 1, createdAt: 1, _id: 1 });

  const result = { scanned: rows.length, migrated: 0, reserved: 0, conflicts: 0, unresolved: 0 };

  for (const row of rows) {
    const giftName = inferGiftNameFromContribution(row, options);
    const guestName = String(row.nome || 'Convidado').trim();
    const guestKey = normalizeText(guestName);
    const tokenValue = String(row.token || '').trim();
    const pickedAt = giftContributionTime(row);

    if (!giftName) {
      result.unresolved += 1;
      await markContributionGiftMeta(row, {
        legacyGiftMigrated: true,
        legacyGiftConflict: true,
        legacyGiftConflictReason: 'Não foi possível identificar o nome real do presente neste registo antigo.',
        details: { legacyGiftUnresolved: true, migratedAt: new Date().toISOString() }
      });
      continue;
    }

    let gift = await findGiftItemByName(invite, giftName);
    if (!gift) {
      gift = await GiftItem.create({ inviteId: invite._id, slug: invite.slug, name: giftName, category: 'Lista de presentes', reserved: false });
    }

    const previousGiftForSameGuest = guestKey
      ? await GiftItem.findOne({ inviteId: invite._id, reserved: true, reservedByNormalized: guestKey })
      : null;

    const baseMeta = {
      selectedGift: gift.name,
      giftChoice: gift.name,
      selectedGifts: [gift.name],
      gifts: gift.name,
      token: tokenValue,
      legacyGiftMigrated: true,
      legacyGiftReservedBy: gift.reservedBy || guestName,
      legacyGiftReservedAt: gift.reservedAt || pickedAt,
      details: {
        selectedGift: gift.name,
        selectedGifts: [gift.name],
        giftChoice: gift.name,
        nome: guestName,
        token: tokenValue,
        migratedAt: new Date().toISOString(),
        source: 'legacy_contribution_filename'
      }
    };

    if (previousGiftForSameGuest && !isSameGiftName(previousGiftForSameGuest.name, gift.name)) {
      result.conflicts += 1;
      await markContributionGiftMeta(row, {
        ...baseMeta,
        legacyGiftConflict: true,
        legacyGiftReservedInGiftItem: false,
        legacyGiftConflictReason: `Este convidado já tinha outro presente reservado: ${previousGiftForSameGuest.name}.`,
        details: { ...baseMeta.details, duplicateGuestGift: true, existingGift: previousGiftForSameGuest.name }
      });
      continue;
    }

    if (!gift.reserved) {
      gift.reserved = true;
      gift.reservedBy = guestName;
      gift.reservedByNormalized = guestKey;
      gift.reservedToken = tokenValue;
      gift.reservedAt = pickedAt;
      gift.reservedSource = 'legacy_contribution';
      gift.reservedContributionId = row._id;
      await gift.save();
      result.reserved += 1;
      await markContributionGiftMeta(row, {
        ...baseMeta,
        legacyGiftConflict: false,
        legacyGiftConflictReason: '',
        legacyGiftReservedInGiftItem: true,
        legacyGiftReservedBy: guestName,
        legacyGiftReservedAt: pickedAt,
        details: { ...baseMeta.details, giftItemReserved: true }
      });
      result.migrated += 1;
      continue;
    }

    const sameOwner = guestKey && normalizeText(gift.reservedBy || '') === guestKey;
    if (sameOwner) {
      await markContributionGiftMeta(row, {
        ...baseMeta,
        legacyGiftConflict: false,
        legacyGiftConflictReason: '',
        legacyGiftReservedInGiftItem: true,
        legacyGiftReservedBy: gift.reservedBy || guestName,
        legacyGiftReservedAt: gift.reservedAt || pickedAt,
        details: { ...baseMeta.details, giftItemAlreadyReservedBySameGuest: true }
      });
      result.migrated += 1;
      continue;
    }

    result.conflicts += 1;
    await markContributionGiftMeta(row, {
      ...baseMeta,
      legacyGiftConflict: true,
      legacyGiftReservedInGiftItem: false,
      legacyGiftReservedBy: gift.reservedBy || '',
      legacyGiftReservedAt: gift.reservedAt || null,
      legacyGiftConflictReason: `Presente duplicado: ${gift.name} já estava reservado por ${gift.reservedBy || 'outro convidado'}.`,
      details: {
        ...baseMeta.details,
        duplicateGift: true,
        alreadyReservedBy: gift.reservedBy || '',
        alreadyReservedAt: gift.reservedAt || null
      }
    });
    result.migrated += 1;
  }

  LEGACY_GIFT_REPAIR_CACHE.set(cacheKey, { at: Date.now(), result });
  return result;
}
async function cleanContributionRowsForPublic(rows, invite) {
  const options = await giftOptionNamesForInvite(invite);
  return rows.map(doc => {
    const o = doc.toObject ? doc.toObject() : doc;
    const fileUrl = o.fileUrl || (o._id ? `${PUBLIC_API_BASE_URL}/api/contributions/${o._id}/file` : '');
    const selectedGift = inferGiftNameFromContribution(o, options);
    const giftChannel = isGiftContributionChannel(o);
    const details = safeParseObject(o.details);
    const conflict = Boolean(o.legacyGiftConflict || details.duplicateGift || details.duplicateGuestGift);
    return {
      ...o,
      filename: o.originalName || o.fileName || '',
      viewUrl: fileUrl,
      previewUrl: fileUrl,
      downloadUrl: fileUrl,
      thumbnailUrl: fileUrl,
      selectedGift,
      giftName: selectedGift,
      giftChoice: selectedGift,
      selectedGifts: selectedGift ? [selectedGift] : [],
      gifts: selectedGift,
      isGiftSelection: giftChannel && Boolean(selectedGift),
      unverifiedGiftSelection: giftChannel && !selectedGift,
      legacyGiftConflict: conflict,
      legacyGiftConflictReason: o.legacyGiftConflictReason || details.legacyGiftConflictReason || '',
      legacyGiftReservedInGiftItem: Boolean(o.legacyGiftReservedInGiftItem || details.giftItemReserved || details.giftItemAlreadyReservedBySameGuest),
      reserved: Boolean(o.legacyGiftReservedInGiftItem),
      reservedBy: o.legacyGiftReservedBy || o.nome || '',
      reservedAt: o.legacyGiftReservedAt || o.timestamp || o.createdAt || null
    };
  });
}
async function cleanGiftSelectionRecordsFastForAdmin(invite) {
  const options = await giftOptionNamesFastForInvite(invite);

  const [reservedGifts, legacyRows] = await Promise.all([
    GiftItem.find({ inviteId: invite._id, reserved: true })
      .select('name reservedBy reservedAt updatedAt createdAt reservedToken legacyGiftConflict legacyGiftConflictReason')
      .sort({ reservedAt: -1, updatedAt: -1 })
      .lean(),
    Contribution.find({ inviteId: invite._id, canal: /presente escolhido/i })
      .sort({ timestamp: -1, createdAt: -1 })
      .select('-fileBase64')
      .lean()
  ]);

  const records = [];
  const primaryKeys = new Set();
  const giftOwners = new Map();
  const keyFor = (guestName, giftName) => `${normalizeText(guestName || '')}|${compactGiftKeyServer(giftName || '')}`;
  const timeValue = row => row.timestamp || row.reservedAt || row.createdAt || row.updatedAt || null;

  for (const gift of reservedGifts) {
    const guestName = String(gift.reservedBy || 'Convidado').trim();
    const giftName = String(gift.name || '').trim();
    if (!giftName) continue;
    const key = keyFor(guestName, giftName);
    const giftKey = compactGiftKeyServer(giftName);
    primaryKeys.add(key);
    if (!giftOwners.has(giftKey)) giftOwners.set(giftKey, { guestName, giftName, at: gift.reservedAt || gift.createdAt || null });
    records.push({
      id: String(gift._id || ''),
      _id: String(gift._id || ''),
      source: 'giftitems_fast',
      canal: 'Presente escolhido',
      nome: guestName,
      guestName,
      reservedBy: guestName,
      selectedGift: giftName,
      giftName,
      giftChoice: giftName,
      selectedGifts: [giftName],
      gifts: giftName,
      timestamp: gift.reservedAt || gift.updatedAt || gift.createdAt || null,
      reservedAt: gift.reservedAt || null,
      status: 'Registado',
      reserved: true
    });
  }

  const chronologicalLegacy = legacyRows.slice().sort((a, b) => new Date(timeValue(a) || 0) - new Date(timeValue(b) || 0));
  const duplicateMetaById = new Map();
  for (const row of chronologicalLegacy) {
    const giftName = inferGiftNameFromContribution(row, options);
    if (!giftName) continue;
    const guestName = String(row.nome || row.reservedBy || 'Convidado').trim();
    const giftKey = compactGiftKeyServer(giftName);
    const owner = giftOwners.get(giftKey);
    const sameOwner = owner && normalizeText(owner.guestName || '') === normalizeText(guestName || '');
    const details = safeParseObject(row.details);
    let conflict = Boolean(row.legacyGiftConflict || details.duplicateGift || details.duplicateGuestGift);
    let reason = row.legacyGiftConflictReason || details.legacyGiftConflictReason || '';
    if (owner && !sameOwner) {
      conflict = true;
      reason = reason || `Presente duplicado: ${giftName} já estava reservado por ${owner.guestName || 'outro convidado'}.`;
    } else if (!owner) {
      giftOwners.set(giftKey, { guestName, giftName, at: timeValue(row) });
    }
    duplicateMetaById.set(String(row._id || ''), { conflict, reason, giftName, guestName });
  }

  for (const row of legacyRows) {
    const meta = duplicateMetaById.get(String(row._id || ''));
    const giftName = meta?.giftName || inferGiftNameFromContribution(row, options);
    if (!giftName) continue;

    const guestName = meta?.guestName || String(row.nome || row.reservedBy || 'Convidado').trim();
    const details = safeParseObject(row.details);
    const conflict = Boolean(meta?.conflict || row.legacyGiftConflict || details.duplicateGift || details.duplicateGuestGift);
    const key = keyFor(guestName, giftName);

    if (!conflict && primaryKeys.has(key)) continue;

    const reason = meta?.reason || row.legacyGiftConflictReason || details.legacyGiftConflictReason || (details.alreadyReservedBy ? `Presente duplicado: ${giftName} já estava reservado por ${details.alreadyReservedBy}.` : '');
    records.push({
      id: String(row._id || ''),
      _id: String(row._id || ''),
      source: 'legacy_contributions_fast',
      canal: 'Presente escolhido',
      nome: guestName,
      guestName,
      reservedBy: guestName,
      selectedGift: giftName,
      giftName,
      giftChoice: giftName,
      selectedGifts: [giftName],
      gifts: giftName,
      timestamp: row.timestamp || row.createdAt || row.updatedAt || null,
      reservedAt: row.legacyGiftReservedAt || row.timestamp || row.createdAt || null,
      status: conflict ? 'Duplicado' : 'Registado',
      reserved: !conflict,
      legacyGiftConflict: conflict,
      conflict,
      legacyGiftConflictReason: reason,
      conflictReason: reason
    });
  }

  records.sort((a, b) => new Date(b.timestamp || b.reservedAt || 0) - new Date(a.timestamp || a.reservedAt || 0));
  return records;
}

async function cleanGiftSelectionRecordsForAdmin(invite) {
  await ensureLegacyGiftReservations(invite);
  const options = await giftOptionNamesForInvite(invite);

  const [reservedGifts, legacyRows] = await Promise.all([
    GiftItem.find({ inviteId: invite._id, reserved: true }).sort({ reservedAt: -1, updatedAt: -1 }).lean(),
    Contribution.find({ inviteId: invite._id, canal: /presente escolhido/i }).sort({ timestamp: -1, createdAt: -1 }).select('-fileBase64').lean()
  ]);

  const records = [];
  const primaryKeys = new Set();
  const keyFor = (guestName, giftName) => `${normalizeText(guestName || '')}|${compactGiftKeyServer(giftName || '')}`;

  for (const gift of reservedGifts) {
    const guestName = String(gift.reservedBy || 'Convidado').trim();
    const giftName = String(gift.name || '').trim();
    if (!giftName) continue;
    primaryKeys.add(keyFor(guestName, giftName));
    records.push({
      id: String(gift._id || ''),
      _id: String(gift._id || ''),
      source: 'giftitems',
      canal: 'Presente escolhido',
      nome: guestName,
      guestName,
      reservedBy: guestName,
      selectedGift: giftName,
      giftName,
      giftChoice: giftName,
      selectedGifts: [giftName],
      gifts: giftName,
      timestamp: gift.reservedAt || gift.updatedAt || gift.createdAt || null,
      reservedAt: gift.reservedAt || null,
      status: 'Registado',
      reserved: true
    });
  }

  for (const row of legacyRows) {
    const giftName = inferGiftNameFromContribution(row, options);
    if (!giftName) continue;

    const guestName = String(row.nome || row.reservedBy || 'Convidado').trim();
    const d = safeParseObject(row.details);
    const conflict = Boolean(row.legacyGiftConflict || d.duplicateGift || d.duplicateGuestGift);
    const key = keyFor(guestName, giftName);

    // Se já existe o registo oficial em GiftItem e não é conflito, não duplicar no admin.
    if (!conflict && primaryKeys.has(key)) continue;

    const reason = row.legacyGiftConflictReason || d.legacyGiftConflictReason || (d.alreadyReservedBy ? `Presente duplicado: ${giftName} já estava reservado por ${d.alreadyReservedBy}.` : '');
    records.push({
      id: String(row._id || ''),
      _id: String(row._id || ''),
      source: 'legacy_contributions',
      canal: 'Presente escolhido',
      nome: guestName,
      guestName,
      reservedBy: guestName,
      selectedGift: giftName,
      giftName,
      giftChoice: giftName,
      selectedGifts: [giftName],
      gifts: giftName,
      timestamp: row.timestamp || row.createdAt || row.updatedAt || null,
      reservedAt: row.legacyGiftReservedAt || row.timestamp || row.createdAt || null,
      status: conflict ? 'Duplicado' : 'Registado',
      reserved: !conflict,
      legacyGiftConflict: conflict,
      conflict,
      legacyGiftConflictReason: reason,
      conflictReason: reason
    });
  }

  records.sort((a, b) => new Date(b.timestamp || b.reservedAt || 0) - new Date(a.timestamp || a.reservedAt || 0));
  return records;
}

async function listGiftSelectionsFastForAdmin(invite) {
  return cleanGiftSelectionRecordsFastForAdmin(invite);
}

async function listGiftSelectionsForAdmin(invite) {
  return cleanGiftSelectionRecordsForAdmin(invite);
}

async function listGiftSelectionsFast(req, res, invite) {
  sendJson(req, res, { status: 'success', data: await listGiftSelectionsFastForAdmin(invite) });
}

async function listGiftSelections(req, res, invite) {
  sendJson(req, res, { status: 'success', data: await listGiftSelectionsForAdmin(invite) });
}

async function listGiftRowsForPublic(invite) {
  await ensureLegacyGiftReservations(invite);
  const gifts = await GiftItem.find({ inviteId: invite._id }).sort({ name: 1 });
  return gifts.map(cleanGiftForPublic);
}
async function listContributions(req, res, invite) {
  await ensureLegacyGiftReservations(invite);
  const rows = await Contribution.find({ inviteId: invite._id }).sort({ timestamp: -1 }).select('-fileBase64');
  const data = await cleanContributionRowsForPublic(rows, invite);
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
async function listGifts(req, res, invite) {
  const data = await listGiftRowsForPublic(invite);
  sendJson(req, res, { status: 'success', data });
}
async function getGuestDetails(req, res, invite) {
  const guest = await findGuestByIdentity(invite, { nome: req.body?.nome || req.query?.nome || req.query?.name, name: req.query?.name, token: req.body?.token || req.query?.token });
  if (!guest) return sendJson(req, res, { status: 'error', message: 'Convidado não encontrado.' }, 404);
  await ensureGuestInviteToken(invite, guest);

  const currentStatus = normalizeText(guest.status || '');
  const alreadyConfirmedOrChecked = currentStatus.includes('confirm') || currentStatus.includes('check') || currentStatus.includes('entrou') || Boolean(guest.checkedIn);
  if (!alreadyConfirmedOrChecked && !guestStatusIndicatesOpened(currentStatus)) {
    guest.status = 'Convite Aberto';
    await guest.save();
    await logActivity({ invite, type: 'login', title: 'Convite aberto', detail: guest.name, meta: { source: 'get_guest_details' } });
  }

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

  const guest = await findGuestByNormalizedOrName(invite._id, name, { repair: true });
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
function getPublicRsvpAutoCreateSlugs() {
  return new Set(
    String(process.env.PUBLIC_RSVP_AUTO_CREATE_SLUGS || '')
      .split(',')
      .map(value => slugify(value))
      .filter(Boolean)
  );
}
function canAutoCreateGuestForRsvp(invite) {
  const slug = slugify(invite?.slug || '');
  return Boolean(slug && getPublicRsvpAutoCreateSlugs().has(slug));
}
function parseRsvpPeopleCount(data = {}) {
  const explicitTotal = Number.parseInt(
    data.guests ?? data.totalGuests ?? data.maxGuests ?? data.pessoas ?? data.people ?? data.qtd ?? '',
    10
  );

  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return Math.max(1, explicitTotal);
  }

  const companions = Number.parseInt(
    data.companions ?? data.acompanhantes ?? data.acompanhante ?? '',
    10
  );

  if (Number.isFinite(companions) && companions >= 0) {
    return 1 + companions;
  }

  return 1;
}
async function createPublicRsvpGuest(invite, data = {}) {
  const name = String(data.nome || data.name || '').trim();
  if (!name) {
    const err = new Error('Nome do convidado é obrigatório.');
    err.statusCode = 400;
    throw err;
  }

  const normalizedName = normalizeText(name);
  const totalGuests = parseRsvpPeopleCount(data);
  const companions = Math.max(0, totalGuests - 1);

  let token = generateGuestPublicToken();
  while (await Guest.exists({ inviteId: invite._id, inviteToken: token })) token = generateGuestPublicToken();

  try {
    return await Guest.create({
      inviteId: invite._id,
      slug: invite.slug,
      name,
      normalizedName,
      status: 'Convite Aberto',
      deviceToken: '',
      table: String(data.table || data.mesa || '').trim(),
      companions,
      maxGuests: totalGuests,
      phone: String(data.phone || data.telefone || '').trim(),
      notes: 'Criado automaticamente por RSVP público',
      inviteToken: token,
      number: 0,
      category: 'RSVP público'
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await findGuestByNormalizedOrName(invite._id, name, { repair: true });
      if (existing) return existing;
    }
    throw err;
  }
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
  let guest = await findGuestByIdentity(invite, { nome, token });

  if (!guest) {
    if (!canAutoCreateGuestForRsvp(invite)) {
      return res.status(404).json({ status: 'error', message: 'Convidado não encontrado.' });
    }

    try {
      guest = await createPublicRsvpGuest(invite, req.body || {});
    } catch (err) {
      return res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
    }
  }

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
function giftNamesFromPayload(body = {}) {
  const candidates = [
    body.selectedGifts,
    body.selectedGift,
    body.giftName,
    body.giftChoice,
    body.gift,
    body.gifts,
    body.name
  ];

  let values = [];
  for (const value of candidates) {
    if (!value) continue;
    if (Array.isArray(value)) values.push(...value);
    else if (typeof value === 'string' && value.includes(',')) values.push(...value.split(','));
    else values.push(value);
    if (values.length) break;
  }

  return Array.from(new Set(
    values
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));
}

function cleanGiftForPublic(gift) {
  if (!gift) return null;
  const o = gift.toObject ? gift.toObject() : gift;
  const isReserved = Boolean(o.reserved);
  return {
    id: String(o._id || ''),
    _id: String(o._id || ''),
    inviteId: String(o.inviteId || ''),
    slug: o.slug || '',

    // Nome/label servem apenas para desenhar a lista de presentes.
    // Nunca devem ser interpretados como “presente escolhido” quando reserved=false.
    name: o.name || '',
    label: o.name || '',
    category: o.category || 'Geral',

    reserved: isReserved,
    isReserved,
    reservedBy: isReserved ? (o.reservedBy || '') : '',
    reserved_by: isReserved ? (o.reservedBy || '') : '',
    reservedByNormalized: isReserved ? (o.reservedByNormalized || '') : '',
    reservedByGuestId: isReserved && o.reservedByGuestId ? String(o.reservedByGuestId) : '',
    reservedToken: isReserved ? (o.reservedToken || '') : '',
    token: isReserved ? (o.reservedToken || '') : '',
    reservedAt: isReserved ? (o.reservedAt || null) : null,

    // Campos de escolha só existem quando o item está realmente reservado.
    giftName: isReserved ? (o.name || '') : '',
    selectedGift: isReserved ? (o.name || '') : '',
    giftChoice: isReserved ? (o.name || '') : '',
    timestamp: isReserved ? (o.reservedAt || null) : null,

    createdAt: o.createdAt || null,
    updatedAt: o.updatedAt || null
  };
}

async function handleSaveGifts(req, res, invite) {
  await seedDefaultGifts(invite);

  const body = req.body || {};
  const giftNames = giftNamesFromPayload(body);
  const rawName = String(body.nome || body.guestName || body.convidado || body.reservedBy || body.reserved_by || '').trim();
  const rawToken = String(body.token || body.guestToken || body.inviteToken || '').trim();

  if (!rawName && !rawToken) {
    return res.status(400).json({ status: 'error', message: 'Nome ou token do convidado é obrigatório.' });
  }

  if (!giftNames.length) {
    return res.status(400).json({ status: 'error', message: 'Escolha 1 presente disponível.' });
  }

  if (giftNames.length > 1) {
    return res.status(400).json({ status: 'error', code: 'ONLY_ONE_GIFT_ALLOWED', message: 'Cada convidado só pode escolher 1 presente.' });
  }

  const guest = await findGuestByIdentity(invite, { nome: rawName, token: rawToken });
  const reservedBy = String(guest?.name || rawName || 'Convidado').trim();
  const reservedByNormalized = normalizeText(reservedBy);
  const reservedToken = String(rawToken || guest?.inviteToken || '').trim();

  const alreadyReservedByGuest = await GiftItem.findOne({
    inviteId: invite._id,
    reserved: true,
    $or: [
      ...(guest?._id ? [{ reservedByGuestId: guest._id }] : []),
      ...(reservedToken ? [{ reservedToken }] : []),
      ...(reservedByNormalized ? [{ reservedByNormalized }] : [])
    ]
  });

  if (alreadyReservedByGuest) {
    const sameGift = normalizeText(alreadyReservedByGuest.name) === normalizeText(giftNames[0]);
    if (sameGift) {
      return res.json({
        status: 'success',
        code: 'GIFT_ALREADY_RESERVED_BY_THIS_GUEST',
        data: { success: [cleanGiftForPublic(alreadyReservedByGuest)], failed: [] },
        reserved: [cleanGiftForPublic(alreadyReservedByGuest)],
        message: 'Este presente já estava registado em seu nome.'
      });
    }

    return res.status(409).json({
      status: 'error',
      code: 'GUEST_ALREADY_SELECTED_GIFT',
      message: `Já existe um presente registado em seu nome: ${alreadyReservedByGuest.name}. Cada convidado só pode escolher 1 presente.`,
      data: { reserved: cleanGiftForPublic(alreadyReservedByGuest) }
    });
  }

  const now = new Date();
  const results = { success: [], failed: [] };

  for (const giftName of giftNames) {
    const updated = await GiftItem.findOneAndUpdate(
      {
        inviteId: invite._id,
        name: exactRegex(giftName),
        reserved: { $ne: true }
      },
      {
        $set: {
          reserved: true,
          reservedBy,
          reservedByNormalized,
          reservedByGuestId: guest?._id,
          reservedToken,
          reservedAt: now
        }
      },
      { new: true, runValidators: true }
    );

    if (updated) {
      results.success.push(cleanGiftForPublic(updated));
      continue;
    }

    const existing = await GiftItem.findOne({ inviteId: invite._id, name: exactRegex(giftName) });
    results.failed.push({
      gift: giftName,
      reason: existing?.reserved ? 'Este presente já foi escolhido por outro convidado.' : 'Presente inexistente.',
      reserved: Boolean(existing?.reserved),
      reservedBy: existing?.reservedBy || '',
      reservedAt: existing?.reservedAt || null
    });
  }

  if (results.success.length) {
    await logActivity({
      invite,
      type: 'gift',
      title: 'Reserva de presente',
      detail: `${reservedBy} · ${results.success.map(g => g.name).join(', ')}`,
      meta: { reservedBy, reservedToken, gifts: results.success.map(g => g.name), failed: results.failed }
    });

    for (const reservedGift of results.success) {
      await createOrUpdateGiftAuditContribution({
        invite,
        guest,
        reservedBy,
        reservedToken,
        gift: reservedGift,
        reservedAt: now
      });
    }

    return res.json({
      status: 'success',
      data: results,
      reserved: results.success,
      message: results.failed.length ? 'Alguns presentes foram reservados. Outros já estavam indisponíveis.' : 'Presente reservado com sucesso.'
    });
  }

  return res.status(409).json({
    status: 'error',
    code: 'GIFT_ALREADY_RESERVED',
    data: results,
    message: results.failed[0]?.reason || 'Este presente já foi escolhido por outro convidado.'
  });
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

  const selectedGifts = valuesFromMaybeList(req.body?.selectedGifts || req.body?.selectedGift || req.body?.giftChoice || req.body?.gift || req.body?.gifts)
    .map(v => String(v || '').trim())
    .filter(v => v && !isGenericGiftSelectionText(v));
  const selectedGift = selectedGifts[0] || '';
  const details = safeParseObject(req.body?.details);

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
    selectedGift,
    giftChoice: selectedGift,
    selectedGifts: selectedGift ? [selectedGift] : [],
    gifts: selectedGift,
    details,
    token: String(req.body?.token || req.body?.guestToken || req.body?.inviteToken || '').trim(),
    timestamp: new Date()
  });
  doc.fileUrl = `${PUBLIC_API_BASE_URL}/api/contributions/${doc._id}/file`;
  await doc.save();
  invalidateLegacyGiftRepairCache(invite);
  await logActivity({ invite, type: 'contribution', title: 'Comprovativo recebido', detail: `${nome} · ${canal}${selectedGift ? ' · ' + selectedGift : ''}` });
  return res.json({ status: 'success', message: 'Comprovativo enviado.', data: { id: doc._id, fileUrl: doc.fileUrl, selectedGift } });
}


// -----------------------------------------------------------------------------
// Lirandzo Operator Bot v7 · Acções em Massa Seguras
// Operações via bot com confirmação obrigatória, lote controlado e as mesmas
// permissões Admin/Editor do AdminManager.
// -----------------------------------------------------------------------------
const BOT_PENDING_ACTIONS = new Map();
const BOT_ACTION_TTL_MS = 5 * 60 * 1000;
const BOT_ADMIN_ONLY_ACTIONS = new Set([
  'add_guest', 'delete_guest', 'reset_access', 'reset_rsvp', 'reset_checkin',
  'reset_guest_full', 'reset_invite_operational_data'
]);
const BOT_EDITOR_ALLOWED_ACTIONS = new Set(['edit_guest']);
const BOT_EDITOR_ALLOWED_FIELDS = ['name', 'table', 'mesa', 'companions', 'phone', 'number', 'category', 'notes', 'status'];
const BOT_BULK_SAFE_LIMIT = Number(process.env.BOT_BULK_SAFE_LIMIT || 60);

function botRoleLabel(role) { return role === 'editor' ? 'Editor' : 'Administrador'; }
function botCleanGuestSummary(guest) {
  if (!guest) return null;
  return {
    id: String(guest._id),
    name: guest.name || '',
    status: guest.status || '',
    table: guest.table || '',
    category: guest.category || '',
    phone: guest.phone || '',
    number: guest.number || 0,
    companions: guest.companions || 0,
    maxGuests: guest.maxGuests || 1,
    checkedIn: Boolean(guest.checkedIn),
    checkedInAt: guest.checkedInAt || null,
    inviteToken: guest.inviteToken || '',
    hasToken: Boolean(guest.inviteToken)
  };
}
function botActionLabel(actionType) {
  const map = {
    add_guest: 'Adicionar convidado',
    edit_guest: 'Editar convidado',
    delete_guest: 'Eliminar convidado',
    reset_access: 'Repor acesso',
    reset_rsvp: 'Repor confirmação/RSVP',
    reset_checkin: 'Repor check-in',
    reset_guest_full: 'Repor dados do convidado',
    reset_invite_operational_data: 'Repor dados operacionais do convite'
  };
  return map[actionType] || actionType;
}
function botNormalize(value) { return normalizeText(value).replace(/[^a-z0-9\s-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function botStripInvitePart(message, invite) {
  let out = String(message || '');
  const patterns = [invite?.slug, invite?.coupleNames, invite?.clientName].filter(Boolean);
  for (const p of patterns) out = out.replace(new RegExp(escapeRegex(p), 'ig'), ' ');
  out = out.replace(/\b(no|na|ao|a|do|da)?\s*convite\b/ig, ' ');
  return out.replace(/\s+/g, ' ').trim();
}
async function botFindInvite(raw, explicitId = '') {
  if (explicitId) {
    const byId = mongoose.Types.ObjectId.isValid(String(explicitId)) ? await Invite.findById(explicitId) : null;
    if (byId) return { invite: byId, ambiguous: [] };
    const bySlug = await Invite.findOne({ slug: slugify(explicitId), status: { $ne: 'archived' } });
    if (bySlug) return { invite: bySlug, ambiguous: [] };
  }
  const invites = await Invite.find({ status: { $ne: 'archived' } }).sort({ updatedAt: -1, createdAt: -1 }).limit(80);
  const m = botNormalize(raw);
  const scores = invites.map(inv => {
    const slug = botNormalize(inv.slug);
    const couple = botNormalize(inv.coupleNames);
    const client = botNormalize(inv.clientName);
    let score = 0;
    if (slug && m.includes(slug)) score += 120;
    if (couple && m.includes(couple)) score += 100;
    if (client && m.includes(client)) score += 70;
    for (const part of [slug, couple, client]) {
      if (!part) continue;
      const words = part.split(' ').filter(w => w.length > 2);
      score += words.filter(w => m.includes(w)).length * 16;
    }
    return { invite: inv, score };
  }).filter(x => x.score > 22).sort((a, b) => b.score - a.score);
  if (!scores.length) return { invite: null, ambiguous: [] };
  if (scores.length > 1 && scores[0].score - scores[1].score < 18) return { invite: null, ambiguous: scores.slice(0, 6).map(x => cleanInviteDoc(x.invite)) };
  return { invite: scores[0].invite, ambiguous: [] };
}
function botDetectActionType(raw) {
  const m = botNormalize(raw);
  if (/\b(adicionar|add|criar|inserir|novo)\b.*\b(convidado|convidada|pessoa|convidados|convidadas|pessoas)\b/.test(m)) return 'add_guest';
  if (/\b(eliminar|apagar|remover|deletar|delete)\b/.test(m)) return 'delete_guest';
  if (/\b(repor|resetar|reiniciar|restaurar)\b.*\b(todos os dados|dados completos|completo|total)\b.*\b(convite)\b/.test(m)) return 'reset_invite_operational_data';
  if (/\b(repor|resetar|reiniciar|restaurar)\b.*\b(todos os dados|dados completos|completo|total)\b/.test(m)) return 'reset_guest_full';
  if (/\b(repor|resetar|reiniciar|restaurar)\b.*\b(checkin|check in|check-in|entrada)\b/.test(m)) return 'reset_checkin';
  if (/\b(repor|resetar|reiniciar|restaurar)\b.*\b(rsvp|confirmacao|confirmação|presenca|presença)\b/.test(m)) return 'reset_rsvp';
  if (/\b(repor|resetar|reiniciar|restaurar)\b.*\b(acesso|link|token)\b/.test(m)) return 'reset_access';
  if (/\b(editar|alterar|mudar|mover|corrigir|actualizar|atualizar|definir|trocar)\b/.test(m)) return 'edit_guest';
  return '';
}
function botExtractGuestName(raw, invite, actionType) {
  let s = botStripInvitePart(raw, invite);
  const cleanStop = /(\s+para\s+|\s+por\s+|\s+com\s+|\s+na\s+mesa\s+|\s+mesa\s+|\s+telefone\s+|\s+contacto\s+|\s+contato\s+|\s+categoria\s+|\s+acompanhantes?\s+|\s+n[oºu]mero\s+)/i;
  const patterns = [
    /(?:de|do|da)\s+(.+?)(?=$|\s+no\s+convite|\s+na\s+convite|\s+ao\s+convite|\s+convite|\s+para\s+|\s+por\s+)/i,
    /(?:convidado|convidada|pessoa)\s+(.+?)(?=$|\s+no\s+convite|\s+convite|\s+para\s+|\s+por\s+)/i
  ];
  if (actionType === 'add_guest') {
    const m = s.match(/(?:adicionar|add|criar|inserir|novo)\s+(?:convidado|convidada|pessoa)?\s*(.+?)(?=$|\s+no\s+convite|\s+ao\s+convite|\s+convite|\s+com\s+\d|\s+na\s+mesa|\s+mesa\s+|\s+telefone\s+|\s+contacto\s+|\s+categoria\s+)/i);
    if (m) return m[1].replace(cleanStop, ' ').trim();
  }
  if (actionType === 'edit_guest') {
    const m1 = s.match(/(?:mesa|telefone|contacto|contato|categoria|acompanhantes?|estado|nome|notas|numero|número)\s+(?:de|do|da)\s+(.+?)(?=\s+para\s+|\s+por\s+|$)/i);
    if (m1) return m1[1].trim();
    const m2 = s.match(/(?:editar|alterar|mudar|mover|corrigir|actualizar|atualizar|definir|trocar)\s+(.+?)(?=\s+para\s+|\s+por\s+|\s+no\s+convite|\s+convite|$)/i);
    if (m2) return m2[1].replace(/^(a\s+)?(mesa|telefone|contacto|contato|categoria|acompanhantes?|estado|nome|notas|numero|número)\s+(de|do|da)\s+/i, '').trim();
  }
  for (const rx of patterns) {
    const m = s.match(rx);
    if (m) return m[1].replace(cleanStop, ' ').trim();
  }
  s = s.replace(/\b(repor|resetar|reiniciar|restaurar|eliminar|apagar|remover|deletar|delete|acesso|link|token|rsvp|confirmacao|confirmação|checkin|check|entrada|todos os dados|dados completos|completo|total|convidado|convidada|pessoa)\b/ig, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
function botParseGuestPayload(raw) {
  const out = {};
  const mesa = raw.match(/(?:mesa|na mesa)\s+([a-z0-9\-\/]+)/i);
  if (mesa) out.table = mesa[1].trim();
  const phone = raw.match(/(?:telefone|contacto|contato|whatsapp)\s+([+\d][\d\s+\-().]{5,})/i);
  if (phone) out.phone = phone[1].replace(/\s+/g, ' ').trim();
  const comp = raw.match(/(\d+)\s+acompanhantes?/i) || raw.match(/com\s+(\d+)\s+pessoas?/i);
  if (comp) out.companions = Number(comp[1]);
  const cat = raw.match(/categoria\s+([^,.;]+)/i) || raw.match(/grupo\s+([^,.;]+)/i);
  if (cat) out.category = cat[1].replace(/\s+(?:para|por|aos|às|as|ao|a)\s+.*$/i, '').trim();
  const num = raw.match(/(?:numero|número|nº|no\.?|ordem)\s+(\d+)/i);
  if (num) out.number = Number(num[1]);
  const status = raw.match(/estado\s+([^,.;]+)/i);
  if (status) out.status = status[1].replace(/\s+(?:para|por|aos|às|as|ao|a)\s+.*$/i, '').trim();
  const notes = raw.match(/(?:nota|notas|observacao|observação)\s+([^;]+)/i);
  if (notes) out.notes = notes[1].trim();
  const newName = raw.match(/nome\s+(?:para|por)\s+([^,.;]+)/i);
  if (newName) out.name = newName[1].trim();
  return out;
}
function botCleanNameSegment(segment, actionType) {
  let s = String(segment || '').trim();
  s = s.replace(/[“”"'`]+/g, '').trim();
  if (actionType === 'add_guest') {
    s = s.replace(/\b(adicionar|add|criar|inserir|novo|convidado|convidada|convidados|convidadas|pessoa|pessoas)\b/ig, ' ');
  } else if (actionType === 'edit_guest') {
    s = s.replace(/\b(editar|alterar|mudar|mover|corrigir|actualizar|atualizar|definir|trocar)\b/ig, ' ');
    s = s.replace(/^(a\s+)?(mesa|telefone|contacto|contato|categoria|acompanhantes?|estado|nome|notas|numero|número)\s+(de|do|da)\s+/i, ' ');
  } else {
    s = s.replace(/\b(repor|resetar|reiniciar|restaurar|eliminar|apagar|remover|deletar|delete|acesso|link|token|rsvp|confirmacao|confirmação|checkin|check-in|check|entrada|todos os dados|dados completos|completo|total|convidado|convidada|convidados|convidadas|pessoa|pessoas)\b/ig, ' ');
  }
  s = s.replace(/\s+(?:para|por)\s+.*$/ig, ' ');
  s = s.replace(/\b(?:na\s+)?mesa\s+[a-z0-9\-\/]+\b/ig, ' ');
  s = s.replace(/\b(?:telefone|contacto|contato|whatsapp)\s+[+\d][\d\s+\-().]{5,}\b/ig, ' ');
  s = s.replace(/\b\d+\s+acompanhantes?\b/ig, ' ');
  s = s.replace(/\bcom\s+\d+\s+pessoas?\b/ig, ' ');
  s = s.replace(/\b(?:categoria|grupo|estado|nota|notas|observacao|observação|numero|número|nº|ordem)\s+[^,.;]+/ig, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
function botSplitNameList(segment) {
  const raw = String(segment || '').trim();
  if (!raw) return [];
  const primary = raw.split(/[;,\n]+/).map(v => v.trim()).filter(Boolean);
  const hasHardSeparator = primary.length > 1;
  const out = [];
  const protectedCouple = /\b(esposa|esposo|casal|familia|família|sr\.?|sra\.?)\b/i;
  for (const part of primary) {
    if ((hasHardSeparator || (part.match(/\s+e\s+/ig) || []).length > 1) && !protectedCouple.test(part)) {
      part.split(/\s+e\s+/i).map(v => v.trim()).filter(Boolean).forEach(v => out.push(v));
    } else {
      out.push(part);
    }
  }
  return Array.from(new Set(out.map(v => v.replace(/^[-–•\d.)\s]+/, '').trim()).filter(Boolean)));
}
function botBaseBulkSegment(raw, invite, actionType) {
  let s = botStripInvitePart(raw, invite);
  if (actionType === 'add_guest') {
    s = s.replace(/^(?:adicionar|add|criar|inserir|novo)\s+(?:convidados|convidadas|convidado|convidada|pessoas|pessoa)?\s*/i, '');
  } else if (actionType === 'edit_guest') {
    const fieldFirst = s.match(/^(?:editar|alterar|mudar|corrigir|actualizar|atualizar|definir|trocar)\s+(?:a\s+)?(?:mesa|telefone|contacto|contato|categoria|grupo|acompanhantes?|estado|nome|notas|numero|número)\s+.+?\s+(?:para|aos|às|as|ao|a)\s+(.+)$/i);
    if (fieldFirst) return fieldFirst[1].replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:editar|alterar|mudar|mover|corrigir|actualizar|atualizar|definir|trocar)\s+/i, '');
    s = s.replace(/^(?:a\s+)?(?:mesa|telefone|contacto|contato|categoria|acompanhantes?|estado|nome|notas|numero|número)\s+(?:de|do|da)\s+/i, '');
    s = s.replace(/\s+(?:para|por)\s+.*$/i, '');
  } else {
    s = s.replace(/^(?:repor|resetar|reiniciar|restaurar|eliminar|apagar|remover|deletar|delete)\s+/i, '');
    s = s.replace(/^(?:o\s+|a\s+)?(?:acesso|link|token|rsvp|confirmacao|confirmação|checkin|check-in|check in|entrada|todos os dados|dados completos|completo|total)\s+(?:de|do|da)?\s*/i, '');
    s = s.replace(/^(?:convidados|convidadas|convidado|convidada|pessoas|pessoa)\s+/i, '');
  }
  return s.replace(/\s+/g, ' ').trim();
}
function botExtractGuestNames(raw, invite, actionType) {
  const base = botBaseBulkSegment(raw, invite, actionType);
  return botSplitNameList(base).map(x => botCleanNameSegment(x, actionType)).filter(Boolean);
}
function botBuildAddItems(raw, invite) {
  const base = botBaseBulkSegment(raw, invite, 'add_guest');
  const segments = botSplitNameList(base);
  const globalPayload = botParseGuestPayload(raw);
  return segments.map(segment => {
    const payload = { ...globalPayload, ...botParseGuestPayload(segment) };
    const name = botCleanNameSegment(segment, 'add_guest');
    return { requestedName: name, payload: { ...payload, name } };
  }).filter(x => x.requestedName);
}
async function botFindGuests(invite, query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const normalized = normalizeText(q);
  const rx = new RegExp(escapeRegex(q), 'i');
  let guests = await Guest.find({ inviteId: invite._id, $or: [{ name: rx }, { normalizedName: new RegExp(escapeRegex(normalized), 'i') }, { phone: rx }, { table: rx }] }).sort({ number: 1, name: 1 }).limit(12);
  if (!guests.length) {
    const all = await Guest.find({ inviteId: invite._id }).sort({ number: 1, name: 1 }).limit(500);
    guests = all.filter(g => botNormalize(g.name).includes(botNormalize(q)) || botNormalize(q).includes(botNormalize(g.name))).slice(0, 12);
  }
  return guests;
}
async function botResolveGuestNames(invite, names) {
  const resolved = [];
  const missing = [];
  const ambiguous = [];
  const seen = new Set();
  for (const requestedName of names) {
    const matches = await botFindGuests(invite, requestedName);
    if (!matches.length) { missing.push({ requestedName }); continue; }
    if (matches.length > 1) { ambiguous.push({ requestedName, candidates: matches.map(botCleanGuestSummary) }); continue; }
    const guest = matches[0];
    const id = String(guest._id);
    if (seen.has(id)) continue;
    seen.add(id);
    resolved.push({ requestedName, guest, before: botCleanGuestSummary(guest) });
  }
  return { resolved, missing, ambiguous };
}
function botPermissionCheck(role, actionType) {
  if (role === 'admin') return { ok: true };
  if (role === 'editor' && BOT_EDITOR_ALLOWED_ACTIONS.has(actionType)) return { ok: true };
  return { ok: false, message: `Está logado como Editor. Esta acção (${botActionLabel(actionType)}) exige perfil Administrador.` };
}
function botPrepareSummary({ actionType, role, invite, guest, payload, before, after, rsvpsCount = 0, checkinsCount = 0, bulk = false, bulkCount = 0 }) {
  const destructive = ['delete_guest', 'reset_guest_full', 'reset_invite_operational_data'].includes(actionType);
  const warnings = [];
  if (destructive) warnings.push('Acção sensível. Confirme apenas se tiver certeza absoluta.');
  if (bulk) warnings.push(`Acção em massa: ${bulkCount} registo(s) serão afectados no convite seleccionado.`);
  if (role === 'editor') warnings.push('Perfil Editor: só são permitidas edições limitadas de convidado. As mesmas restrições foram aplicadas ao bot.');
  if (actionType === 'reset_access') warnings.push('O RSVP/check-in não será eliminado por esta acção; apenas o acesso/token será renovado.');
  if (actionType === 'reset_rsvp' && rsvpsCount) warnings.push(`${rsvpsCount} RSVP(s) associado(s) serão removidos.`);
  if (actionType === 'reset_checkin' && checkinsCount) warnings.push(`${checkinsCount} check-in(s) associado(s) serão removidos.`);
  const confirmationPhrase = bulk && actionType === 'delete_guest'
    ? `ELIMINAR ${bulkCount} CONVIDADOS ${String(invite.slug || '').toUpperCase()}`.trim()
    : bulk && actionType === 'reset_guest_full'
      ? `REPOR ${bulkCount} CONVIDADOS ${String(invite.slug || '').toUpperCase()}`.trim()
      : actionType === 'delete_guest'
        ? `ELIMINAR ${guest?.name || ''}`.trim()
        : actionType === 'reset_invite_operational_data'
          ? `REPOR ${invite.slug}`.trim()
          : '';
  return { destructive, warnings, confirmationPhrase };
}
function botAfterPreview(actionType, before, payload = {}) {
  if (!before && actionType !== 'add_guest') return null;
  if (actionType === 'add_guest') return { name: payload.name, status: 'Não aberto', table: payload.table || '', category: payload.category || '', phone: payload.phone || '', companions: payload.companions || 0, maxGuests: Math.max(1, Number(payload.companions || 0) + 1), hasToken: true };
  const after = { ...before };
  if (actionType === 'edit_guest') Object.assign(after, { table: payload.table ?? payload.mesa ?? after.table, phone: payload.phone ?? after.phone, category: payload.category ?? after.category, companions: payload.companions ?? after.companions, number: payload.number ?? after.number, status: payload.status ?? after.status, name: payload.name ?? after.name, notes: payload.notes ?? after.notes });
  if (actionType === 'reset_access') Object.assign(after, { inviteToken: 'novo token será gerado', hasToken: true });
  if (actionType === 'reset_rsvp') Object.assign(after, { status: 'Aberto', checkedIn: false });
  if (actionType === 'reset_checkin') Object.assign(after, { checkedIn: false, checkedInAt: null });
  if (actionType === 'reset_guest_full') Object.assign(after, { status: 'Não aberto', inviteToken: 'novo token será gerado', checkedIn: false, checkedInAt: null });
  return after;
}
async function botCountGuestRelations(invite, guestIds = []) {
  if (!guestIds.length) return { rsvpsCount: 0, checkinsCount: 0 };
  const ids = guestIds.map(id => new mongoose.Types.ObjectId(id));
  const [rsvpsCount, checkinsCount] = await Promise.all([
    Rsvp.countDocuments({ inviteId: invite._id, guestId: { $in: ids } }),
    CheckIn.countDocuments({ inviteId: invite._id, guestId: { $in: ids } })
  ]);
  return { rsvpsCount, checkinsCount };
}

app.post('/manager/bot/prepare-action', requireManager, asyncRoute(async (req, res) => {
  const raw = String(req.body?.message || '').trim();
  const explicitInviteId = String(req.body?.inviteId || '').trim();
  const explicitGuestId = String(req.body?.guestId || '').trim();
  const explicitActionType = String(req.body?.actionType || '').trim();
  if (!raw && !explicitActionType) return res.status(400).json({ status: 'error', message: 'Comando vazio.' });

  const actionType = explicitActionType || botDetectActionType(raw);
  if (!actionType) return res.status(400).json({ status: 'error', message: 'Não reconheci uma acção operacional. Exemplos: repor acesso de João no convite X; alterar mesa de Ana para 8; adicionar convidados João, Maria ao convite X.' });

  const permission = botPermissionCheck(req.manager.role, actionType);
  if (!permission.ok) return res.status(403).json({ status: 'error', code: 'BOT_PERMISSION_DENIED', role: req.manager.role, message: permission.message });

  const foundInvite = await botFindInvite(raw, explicitInviteId);
  if (foundInvite.ambiguous.length) return res.json({ status: 'selection_required', selectionType: 'invite', actionType, message: 'Encontrei mais de um convite possível.', candidates: foundInvite.ambiguous });
  const invite = foundInvite.invite;
  if (!invite) return res.status(404).json({ status: 'error', message: 'Não encontrei o convite. Informe o slug ou nome do casal.' });

  let payload = botParseGuestPayload(raw);
  const explicitGuestIds = Array.isArray(req.body?.guestIds) ? req.body.guestIds.map(String).filter(Boolean) : [];
  const forceSingle = Boolean(explicitGuestId);
  const addItems = actionType === 'add_guest' ? botBuildAddItems(raw, invite) : [];
  const names = actionType === 'add_guest' ? addItems.map(x => x.requestedName) : botExtractGuestNames(raw, invite, actionType);
  const shouldBulk = !forceSingle && actionType !== 'reset_invite_operational_data' && (explicitGuestIds.length > 1 || names.length > 1 || addItems.length > 1);

  if (shouldBulk) {
    if (actionType !== 'add_guest' && !names.length && !explicitGuestIds.length) return res.status(400).json({ status: 'error', message: 'Não consegui identificar os nomes para a acção em massa.' });
    if (Math.max(names.length, explicitGuestIds.length, addItems.length) > BOT_BULK_SAFE_LIMIT) return res.status(400).json({ status: 'error', message: `Acção em massa bloqueada: limite seguro de ${BOT_BULK_SAFE_LIMIT} registos por comando.` });

    let bulkItems = [];
    if (actionType === 'add_guest') {
      if (!addItems.length) return res.status(400).json({ status: 'error', message: 'Não consegui identificar os nomes dos novos convidados.' });
      const duplicates = [];
      for (const item of addItems) {
        const normalizedName = normalizeText(item.payload.name);
        const existing = await Guest.findOne({ inviteId: invite._id, normalizedName });
        if (existing) duplicates.push({ requestedName: item.payload.name, existing: botCleanGuestSummary(existing) });
        bulkItems.push({ requestedName: item.payload.name, before: null, after: botAfterPreview(actionType, null, item.payload), payload: item.payload });
      }
      if (duplicates.length) return res.json({ status: 'selection_required', selectionType: 'bulk_conflict', actionType, invite: cleanInviteDoc(invite), message: 'Alguns nomes já existem neste convite. A acção em massa foi bloqueada para evitar duplicados.', conflicts: duplicates });
    } else if (explicitGuestIds.length > 1) {
      const guests = await Guest.find({ _id: { $in: explicitGuestIds }, inviteId: invite._id }).sort({ number: 1, name: 1 });
      if (guests.length !== explicitGuestIds.length) return res.status(404).json({ status: 'error', message: 'Nem todos os convidados seleccionados foram encontrados neste convite.' });
      bulkItems = guests.map(g => ({ requestedName: g.name, before: botCleanGuestSummary(g), after: botAfterPreview(actionType, botCleanGuestSummary(g), payload), guestId: String(g._id) }));
    } else {
      const resolved = await botResolveGuestNames(invite, names);
      if (resolved.missing.length || resolved.ambiguous.length) return res.json({
        status: 'selection_required', selectionType: 'bulk_guests', actionType, invite: cleanInviteDoc(invite),
        message: 'A acção em massa precisa de nomes exactos. Resolva os nomes em falta/ambíguos antes de continuar.',
        resolved: resolved.resolved.map(x => ({ requestedName: x.requestedName, guest: x.before })),
        missing: resolved.missing,
        ambiguous: resolved.ambiguous
      });
      bulkItems = resolved.resolved.map(x => ({ requestedName: x.requestedName, before: x.before, after: botAfterPreview(actionType, x.before, payload), guestId: String(x.guest._id) }));
    }

    if (actionType === 'edit_guest') {
      if (!Object.keys(payload).length) return res.status(400).json({ status: 'error', message: 'Não identifiquei o campo a editar. Exemplo: mover João, Maria para mesa 8.' });
      if (req.manager.role === 'editor') payload = Object.fromEntries(Object.entries(payload).filter(([key]) => BOT_EDITOR_ALLOWED_FIELDS.includes(key)));
      if (!Object.keys(payload).length) return res.status(403).json({ status: 'error', code: 'BOT_PERMISSION_DENIED', role: req.manager.role, message: 'Está logado como Editor. O campo pedido não está permitido para Editor.' });
      bulkItems = bulkItems.map(x => ({ ...x, after: botAfterPreview(actionType, x.before, payload) }));
    }

    const guestIds = bulkItems.map(x => x.guestId).filter(Boolean);
    const relationCounts = await botCountGuestRelations(invite, guestIds);
    const meta = botPrepareSummary({ actionType, role: req.manager.role, invite, payload, bulk: true, bulkCount: bulkItems.length, ...relationCounts });
    const actionId = crypto.randomBytes(16).toString('hex');
    BOT_PENDING_ACTIONS.set(actionId, { actionId, actionType, role: req.manager.role, inviteId: String(invite._id), guestIds, payload, bulk: true, bulkItems: bulkItems.map(x => ({ requestedName: x.requestedName, guestId: x.guestId || '', payload: x.payload || payload })), createdAt: Date.now(), expiresAt: Date.now() + BOT_ACTION_TTL_MS, confirmationPhrase: meta.confirmationPhrase });

    return res.json({
      status: 'success',
      message: 'Acção em massa preparada. Confirme antes de executar.',
      data: { actionId, actionType, actionLabel: `${botActionLabel(actionType)} em massa`, bulk: true, bulkCount: bulkItems.length, role: req.manager.role, roleLabel: botRoleLabel(req.manager.role), invite: cleanInviteDoc(invite), before: null, after: null, payload, bulkItems, expiresInSeconds: Math.round(BOT_ACTION_TTL_MS / 1000), ...meta }
    });
  }

  let guest = null;
  if (actionType === 'add_guest') {
    const name = String(req.body?.name || (addItems[0]?.payload?.name) || botExtractGuestName(raw, invite, actionType)).trim();
    if (!name) return res.status(400).json({ status: 'error', message: 'Não consegui identificar o nome do novo convidado.' });
    payload.name = name;
  } else if (actionType !== 'reset_invite_operational_data') {
    if (explicitGuestId) guest = await Guest.findOne({ _id: explicitGuestId, inviteId: invite._id });
    if (!guest) {
      const guestQuery = botExtractGuestName(raw, invite, actionType);
      const matches = await botFindGuests(invite, guestQuery);
      if (!matches.length) return res.status(404).json({ status: 'error', message: `Não encontrei convidado correspondente a “${guestQuery || raw}” neste convite.` });
      if (matches.length > 1) return res.json({
        status: 'selection_required', selectionType: 'guest', actionType, invite: cleanInviteDoc(invite), message: 'Encontrei mais de um convidado possível. Escolha o registo correcto antes de avançar.',
        candidates: matches.map(botCleanGuestSummary)
      });
      guest = matches[0];
    }
    if (actionType === 'edit_guest') {
      if (!Object.keys(payload).length) return res.status(400).json({ status: 'error', message: 'Não identifiquei o campo a editar. Exemplos: alterar mesa de João para 8; mudar telefone de Ana para 84xxxxxxx.' });
      if (req.manager.role === 'editor') payload = Object.fromEntries(Object.entries(payload).filter(([key]) => BOT_EDITOR_ALLOWED_FIELDS.includes(key)));
      if (!Object.keys(payload).length) return res.status(403).json({ status: 'error', code: 'BOT_PERMISSION_DENIED', role: req.manager.role, message: 'Está logado como Editor. O campo pedido não está permitido para Editor.' });
    }
  }

  const before = guest ? botCleanGuestSummary(guest) : null;
  const after = botAfterPreview(actionType, before, payload);

  const [rsvpsCount, checkinsCount] = guest ? await Promise.all([
    Rsvp.countDocuments({ inviteId: invite._id, guestId: guest._id }),
    CheckIn.countDocuments({ inviteId: invite._id, guestId: guest._id })
  ]) : [0, 0];
  const meta = botPrepareSummary({ actionType, role: req.manager.role, invite, guest, payload, before, after, rsvpsCount, checkinsCount });
  const actionId = crypto.randomBytes(16).toString('hex');
  BOT_PENDING_ACTIONS.set(actionId, { actionId, actionType, role: req.manager.role, inviteId: String(invite._id), guestId: guest ? String(guest._id) : '', payload, createdAt: Date.now(), expiresAt: Date.now() + BOT_ACTION_TTL_MS, confirmationPhrase: meta.confirmationPhrase });

  return res.json({
    status: 'success',
    message: 'Acção preparada. Confirme antes de executar.',
    data: { actionId, actionType, actionLabel: botActionLabel(actionType), role: req.manager.role, roleLabel: botRoleLabel(req.manager.role), invite: cleanInviteDoc(invite), guest: before, before, after, payload, expiresInSeconds: Math.round(BOT_ACTION_TTL_MS / 1000), ...meta }
  });
}));

async function botApplySingleAction({ actionType, invite, guest, payload, role, actionId }) {
  let result = {};
  if (actionType === 'add_guest') {
    const createPayload = buildGuestPayloadForManager(invite, payload);
    await ensureNoGuestDuplicate(invite, createPayload.normalizedName);
    guest = await Guest.create(createPayload);
    await logActivity({ invite, type: 'guests', title: 'Convidado criado pelo Operator Bot', detail: guest.name, meta: { role, actionId } });
    result = { guest: cleanGuestForManager(guest) };
  } else if (!guest && actionType !== 'reset_invite_operational_data') {
    throw new Error('Convidado não encontrado.');
  } else if (actionType === 'edit_guest') {
    let body = payload;
    if (role === 'editor') body = Object.fromEntries(Object.entries(body).filter(([key]) => BOT_EDITOR_ALLOWED_FIELDS.includes(key)));
    const updatePayload = buildGuestPayloadForManager(invite, { ...guest.toObject(), ...body, name: body.name || guest.name }, guest);
    await ensureNoGuestDuplicate(invite, updatePayload.normalizedName, guest._id);
    Object.assign(guest, updatePayload);
    await guest.save();
    await Promise.all([
      Rsvp.updateMany({ inviteId: invite._id, guestId: guest._id }, { $set: { nome: guest.name, mesa: guest.table || '', guests: Number(guest.maxGuests) || 1, phone: guest.phone || '' } }),
      CheckIn.updateMany({ inviteId: invite._id, guestId: guest._id }, { $set: { nome: guest.name, mesa: guest.table || '', guests: Number(guest.maxGuests) || 1, token: guest.inviteToken || '' } })
    ]);
    await logActivity({ invite, type: 'guests', title: 'Convidado editado pelo Operator Bot', detail: guest.name, meta: { role, actionId, fields: Object.keys(body) } });
    result = { guest: cleanGuestForManager(guest) };
  } else if (actionType === 'reset_access') {
    guest.inviteToken = generateGuestPublicToken();
    guest.deviceToken = '';
    await guest.save();
    await logActivity({ invite, type: 'guests', title: 'Acesso de convidado reposto pelo Operator Bot', detail: guest.name, meta: { role, actionId } });
    result = { guest: cleanGuestForManager(guest), publicLink: `${defaultPublicUrl(invite.slug)}?token=${encodeURIComponent(guest.inviteToken)}` };
  } else if (actionType === 'reset_rsvp') {
    const rsvps = await Rsvp.deleteMany({ inviteId: invite._id, guestId: guest._id });
    await CheckIn.deleteMany({ inviteId: invite._id, guestId: guest._id });
    guest.status = 'Aberto'; guest.checkedIn = false; guest.checkedInAt = undefined;
    await guest.save();
    await logActivity({ invite, type: 'guests', title: 'RSVP de convidado reposto pelo Operator Bot', detail: `${guest.name} · RSVP removidos: ${rsvps.deletedCount || 0}`, meta: { role, actionId } });
    result = { guest: cleanGuestForManager(guest), rsvpsDeleted: rsvps.deletedCount || 0 };
  } else if (actionType === 'reset_checkin') {
    const checkins = await CheckIn.deleteMany({ inviteId: invite._id, guestId: guest._id });
    guest.checkedIn = false; guest.checkedInAt = undefined;
    if (/check/i.test(String(guest.status || ''))) guest.status = 'Confirmado';
    await guest.save();
    await logActivity({ invite, type: 'checkin', title: 'Check-in de convidado reposto pelo Operator Bot', detail: `${guest.name} · Check-ins removidos: ${checkins.deletedCount || 0}`, meta: { role, actionId } });
    result = { guest: cleanGuestForManager(guest), checkinsDeleted: checkins.deletedCount || 0 };
  } else if (actionType === 'reset_guest_full') {
    const [rsvps, checkins] = await Promise.all([
      Rsvp.deleteMany({ inviteId: invite._id, guestId: guest._id }),
      CheckIn.deleteMany({ inviteId: invite._id, guestId: guest._id })
    ]);
    guest.status = 'Não aberto'; guest.deviceToken = ''; guest.inviteToken = generateGuestPublicToken(); guest.checkedIn = false; guest.checkedInAt = undefined;
    await guest.save();
    await logActivity({ invite, type: 'guests', title: 'Dados do convidado repostos pelo Operator Bot', detail: `${guest.name} · RSVP ${rsvps.deletedCount || 0} · Check-in ${checkins.deletedCount || 0}`, meta: { role, actionId } });
    result = { guest: cleanGuestForManager(guest), rsvpsDeleted: rsvps.deletedCount || 0, checkinsDeleted: checkins.deletedCount || 0, publicLink: `${defaultPublicUrl(invite.slug)}?token=${encodeURIComponent(guest.inviteToken)}` };
  } else if (actionType === 'delete_guest') {
    const guestName = guest.name;
    const [rsvps, checkins] = await Promise.all([
      Rsvp.deleteMany({ inviteId: invite._id, guestId: guest._id }),
      CheckIn.deleteMany({ inviteId: invite._id, guestId: guest._id })
    ]);
    await Guest.deleteOne({ _id: guest._id, inviteId: invite._id });
    await logActivity({ invite, type: 'guests', title: 'Convidado eliminado pelo Operator Bot', detail: `${guestName} · RSVP removidos: ${rsvps.deletedCount || 0} · Check-ins removidos: ${checkins.deletedCount || 0}`, meta: { role, actionId } });
    result = { deletedGuest: guestName, rsvpsDeleted: rsvps.deletedCount || 0, checkinsDeleted: checkins.deletedCount || 0 };
  }
  return result;
}

app.post('/manager/bot/apply-action', requireManager, asyncRoute(async (req, res) => {
  const actionId = String(req.body?.actionId || '').trim();
  const confirmText = String(req.body?.confirmText || '').trim();
  const pending = BOT_PENDING_ACTIONS.get(actionId);
  if (!pending) return res.status(404).json({ status: 'error', message: 'Acção pendente não encontrada ou já executada.' });
  if (Date.now() > pending.expiresAt) { BOT_PENDING_ACTIONS.delete(actionId); return res.status(410).json({ status: 'error', message: 'A confirmação expirou. Prepare a acção novamente.' }); }
  const permission = botPermissionCheck(req.manager.role, pending.actionType);
  if (!permission.ok) return res.status(403).json({ status: 'error', code: 'BOT_PERMISSION_DENIED', role: req.manager.role, message: permission.message });
  if (pending.confirmationPhrase && confirmText !== pending.confirmationPhrase) return res.status(400).json({ status: 'error', message: `Confirmação forte inválida. Escreva exactamente: ${pending.confirmationPhrase}` });

  const invite = await Invite.findById(pending.inviteId);
  if (!invite) return res.status(404).json({ status: 'error', message: 'Convite não encontrado.' });
  const actionType = pending.actionType;
  const payload = pending.payload || {};

  if (pending.bulk) {
    const items = [];
    let success = 0;
    let failed = 0;
    for (const item of pending.bulkItems || []) {
      try {
        const guest = item.guestId ? await Guest.findOne({ _id: item.guestId, inviteId: invite._id }) : null;
        const before = guest ? botCleanGuestSummary(guest) : null;
        const itemPayload = item.payload || payload;
        const result = await botApplySingleAction({ actionType, invite, guest, payload: itemPayload, role: req.manager.role, actionId });
        success += 1;
        items.push({ requestedName: item.requestedName, status: 'success', before, result });
      } catch (err) {
        failed += 1;
        items.push({ requestedName: item.requestedName, status: 'error', error: err.message || 'Falha ao executar este item.' });
      }
    }
    await logActivity({ invite, type: actionType === 'delete_guest' ? 'warning' : 'guests', title: `${botActionLabel(actionType)} em massa pelo Operator Bot`, detail: `${success} sucesso · ${failed} falha(s)`, meta: { role: req.manager.role, actionId, actionType } });
    BOT_PENDING_ACTIONS.delete(actionId);
    return res.json({ status: failed ? 'partial_success' : 'success', message: `${botActionLabel(actionType)} em massa concluído: ${success} sucesso · ${failed} falha(s).`, data: { actionId, actionType, actionLabel: `${botActionLabel(actionType)} em massa`, role: req.manager.role, roleLabel: botRoleLabel(req.manager.role), invite: cleanInviteDoc(invite), result: { bulk: true, success, failed, items } } });
  }

  let guest = pending.guestId ? await Guest.findOne({ _id: pending.guestId, inviteId: invite._id }) : null;
  const before = guest ? botCleanGuestSummary(guest) : null;
  let result = {};

  if (actionType === 'reset_invite_operational_data') {
    const guests = await Guest.find({ inviteId: invite._id });
    for (const g of guests) { g.status = 'Não aberto'; g.deviceToken = ''; g.inviteToken = generateGuestPublicToken(); g.checkedIn = false; g.checkedInAt = undefined; await g.save(); }
    const [rsvps, checkins] = await Promise.all([Rsvp.deleteMany({ inviteId: invite._id }), CheckIn.deleteMany({ inviteId: invite._id })]);
    await logActivity({ invite, type: 'warning', title: 'Dados operacionais do convite repostos pelo Operator Bot', detail: `${guests.length} convidados reiniciados · RSVP ${rsvps.deletedCount || 0} · Check-in ${checkins.deletedCount || 0}`, meta: { role: req.manager.role, actionId } });
    result = { guestsReset: guests.length, rsvpsDeleted: rsvps.deletedCount || 0, checkinsDeleted: checkins.deletedCount || 0 };
  } else {
    result = await botApplySingleAction({ actionType, invite, guest, payload, role: req.manager.role, actionId });
  }

  BOT_PENDING_ACTIONS.delete(actionId);
  res.json({ status: 'success', message: `${botActionLabel(actionType)} executado com sucesso.`, data: { actionId, actionType, actionLabel: botActionLabel(actionType), role: req.manager.role, roleLabel: botRoleLabel(req.manager.role), invite: cleanInviteDoc(invite), before, result } });
}));

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
  await ensureGiftIndexes();
  app.listen(PORT, () => console.log(`Lirandzo AdminManager API a correr na porta ${PORT}`));
}
start().catch(err => { console.error('Falha ao iniciar servidor:', err); process.exit(1); });



