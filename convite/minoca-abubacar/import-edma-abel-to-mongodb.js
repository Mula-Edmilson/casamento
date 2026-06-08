/*
  Importador MongoDB — Minoca & Abubacar
  Executar apenas quando quiseres carregar os dados deste convite no MongoDB.

  Exemplo Windows CMD:
  set MONGODB_URI=mongodb+srv://UTILIZADOR:SENHA@cluster.mongodb.net/lirandzo?retryWrites=true&w=majority
  node import-minoca-abubacar-to-mongodb.js
*/

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const seed = require('./mongodb-seed-data.json');

const SLUG = process.env.INVITE_SLUG || 'minoca-abubacar';
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://lirandzo.com').replace(/\/+$/, '');

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function generateGuestPublicToken() {
  return 'g_' + crypto.randomBytes(18).toString('hex');
}

const InviteSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  clientName: String,
  coupleNames: String,
  bride: String,
  groom: String,
  packageKey: String,
  status: String,
  eventDateISO: String,
  rsvpDeadline: String,
  publicUrl: String,
  githubPath: String,
  config: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const GuestSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, index: true },
  status: { type: String, default: 'Não aberto', index: true },
  deviceToken: { type: String, default: '' },
  inviteToken: { type: String, default: '', index: true },
  number: { type: Number, default: 0, index: true },
  category: { type: String, default: '' },
  table: { type: String, default: '' },
  companions: { type: Number, default: 0, min: 0 },
  maxGuests: { type: Number, default: 1 },
  phone: { type: String, default: '' },
  notes: { type: String, default: '' },
  checkedIn: { type: Boolean, default: false },
  checkedInAt: { type: Date }
}, { timestamps: true });

const GiftItemSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
  slug: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, default: 'Lista de presentes' },
  reserved: { type: Boolean, default: false },
  reservedBy: { type: String, default: '' },
  reservedAt: { type: Date }
}, { timestamps: true });

const ActivitySchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', index: true },
  slug: { type: String, default: '', index: true },
  type: String,
  title: String,
  detail: String,
  meta: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const Invite = mongoose.model('Invite', InviteSchema);
const Guest = mongoose.model('Guest', GuestSchema);
const GiftItem = mongoose.model('GiftItem', GiftItemSchema);
const Activity = mongoose.model('Activity', ActivitySchema);

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não definido.');
  await mongoose.connect(process.env.MONGODB_URI);

  const event = seed.event || {};
  const invite = await Invite.findOneAndUpdate(
    { slug: SLUG },
    {
      $set: {
        slug: SLUG,
        clientName: event.bride || 'Minoca Nobre',
        coupleNames: event.coupleNames || 'Minoca & Abubacar',
        bride: event.bride || 'Minoca Nobre',
        groom: event.groom || 'Abubacar Narciso',
        packageKey: process.env.INVITE_PACKAGE || 'perola',
        status: 'published',
        eventDateISO: event.dateISO || '',
        rsvpDeadline: event.rsvpDeadline || '',
        publicUrl: `${PUBLIC_SITE_URL}/convite/${SLUG}/`,
        githubPath: `convite/${SLUG}`,
        config: event
      }
    },
    { upsert: true, new: true }
  );

  const latestGuestNames = new Set((seed.guests || []).map(g => normalizeText(g.name)));
  let inserted = 0;
  let updated = 0;
  let removedObsoleteGuests = 0;
  for (const g of seed.guests || []) {
    const normalizedName = normalizeText(g.name);
    const existing = await Guest.findOne({ inviteId: invite._id, normalizedName });
    const payload = {
      inviteId: invite._id,
      slug: SLUG,
      name: g.name,
      normalizedName,
      inviteToken: g.token || (existing && existing.inviteToken) || generateGuestPublicToken(),
      number: Number(g.number) || 0,
      category: g.category || '',
      table: g.mesa || g.table || 'A definir',
      companions: Number(g.companions) || Math.max((Number(g.maxGuests) || 1) - 1, 0),
      maxGuests: Number(g.maxGuests) || 1,
      checkedIn: Boolean(g.checkedIn),
      status: existing ? existing.status : 'Não aberto'
    };
    if (existing) { await Guest.updateOne({ _id: existing._id }, { $set: payload }); updated += 1; }
    else { await Guest.create(payload); inserted += 1; }
  }

  const obsoleteGuests = await Guest.find({ inviteId: invite._id }).select('_id normalizedName');
  const obsoleteGuestIds = obsoleteGuests.filter(g => !latestGuestNames.has(g.normalizedName)).map(g => g._id);
  if (obsoleteGuestIds.length) {
    const removal = await Guest.deleteMany({ _id: { $in: obsoleteGuestIds } });
    removedObsoleteGuests = removal.deletedCount || obsoleteGuestIds.length;
  }

  let giftCount = 0;
  const officialGiftNames = new Set();
  for (const item of seed.giftOptions || []) {
    const name = item.name || item.label;
    if (!name) continue;
    officialGiftNames.add(name);
    await GiftItem.findOneAndUpdate(
      { inviteId: invite._id, name },
      { $setOnInsert: { inviteId: invite._id, slug: SLUG, name, category: item.category || 'Lista de presentes', reserved: false } },
      { upsert: true }
    );
    giftCount += 1;
  }

  let removedObsoleteGifts = 0;
  if (officialGiftNames.size) {
    const removal = await GiftItem.deleteMany({ inviteId: invite._id, name: { $nin: Array.from(officialGiftNames) } });
    removedObsoleteGifts = removal.deletedCount || 0;
  }

  await Activity.create({ inviteId: invite._id, slug: SLUG, type: 'import', title: 'Dados importados para MongoDB', detail: `${inserted} convidados novos · ${updated} actualizados · ${removedObsoleteGuests} convidados removidos · ${giftCount} presentes oficiais · ${removedObsoleteGifts} presentes antigos removidos`, timestamp: new Date() });

  console.log('Importação concluída.');
  console.log({ inviteId: String(invite._id), slug: SLUG, inserted, updated, removedObsoleteGuests, giftCount });
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
