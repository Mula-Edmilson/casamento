require('dotenv').config();
const mongoose = require('mongoose');

const TARGET_SLUG = 'celeste-arsenio';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI não configurado.');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const db = mongoose.connection;
  const invites = db.collection('invites');
  const guests = db.collection('guests');
  const rsvps = db.collection('rsvps');
  const checkins = db.collection('checkins');
  const activities = db.collection('activities');

  const invite = await invites.findOne({ slug: TARGET_SLUG });
  if (!invite) throw new Error(`Convite ${TARGET_SLUG} não encontrado.`);

  // Estes logs são produzidos exclusivamente pelo comportamento defeituoso de
  // getGuestDetails(), que marcava uma simples consulta como abertura real.
  const bugActivities = await activities.find({
    inviteId: invite._id,
    type: 'login',
    title: 'Convite aberto',
    'meta.source': 'get_guest_details'
  }).toArray();

  const bugNames = new Set(bugActivities.map(row => normalizeText(row.detail)).filter(Boolean));

  // Uma abertura legítima feita por handleLogin()/handleOpenInvite() gera o mesmo
  // tipo de actividade, mas não usa meta.source='get_guest_details'. Se existir,
  // o estado desse convidado não é tocado.
  const genuineActivities = await activities.find({
    inviteId: invite._id,
    type: 'login',
    title: 'Convite aberto',
    $or: [
      { 'meta.source': { $exists: false } },
      { 'meta.source': { $ne: 'get_guest_details' } }
    ]
  }).toArray();
  const genuineNames = new Set(genuineActivities.map(row => normalizeText(row.detail)).filter(Boolean));

  const openedGuests = await guests.find({
    inviteId: invite._id,
    status: /^Convite Aberto$/i
  }).toArray();

  const resetIds = [];
  const resetNames = [];
  const skipped = [];

  for (const guest of openedGuests) {
    const key = normalizeText(guest.name);
    if (!bugNames.has(key)) {
      skipped.push({ name: guest.name, reason: 'sem registo get_guest_details' });
      continue;
    }
    if (genuineNames.has(key)) {
      skipped.push({ name: guest.name, reason: 'há registo de abertura legítima' });
      continue;
    }

    const [hasRsvp, hasCheckin] = await Promise.all([
      rsvps.findOne({ inviteId: invite._id, guestId: guest._id }, { projection: { _id: 1 } }),
      checkins.findOne({ inviteId: invite._id, guestId: guest._id }, { projection: { _id: 1 } })
    ]);

    if (hasRsvp || hasCheckin || guest.checkedIn === true) {
      skipped.push({ name: guest.name, reason: 'tem RSVP/check-in real' });
      continue;
    }

    resetIds.push(guest._id);
    resetNames.push(key);
  }

  let modified = 0;
  if (resetIds.length) {
    const result = await guests.updateMany(
      {
        _id: { $in: resetIds },
        inviteId: invite._id,
        status: /^Convite Aberto$/i
      },
      { $set: { status: 'Não aberto' } }
    );
    modified = result.modifiedCount || 0;

    // Remove somente logs criados pelo bug para os convidados efectivamente repostos.
    const idsToDelete = bugActivities
      .filter(row => resetNames.includes(normalizeText(row.detail)))
      .map(row => row._id);
    if (idsToDelete.length) {
      await activities.deleteMany({ _id: { $in: idsToDelete }, inviteId: invite._id });
    }
  }

  console.log('=== CORRECÇÃO CELESTE & ARSENIO ===');
  console.log(`Convite: ${TARGET_SLUG}`);
  console.log(`Registos abertos verificados: ${openedGuests.length}`);
  console.log(`Estados repostos para "Não aberto": ${modified}`);
  console.log(`Mantidos por segurança: ${skipped.length}`);
  if (skipped.length) console.table(skipped);
  console.log('Concluído. Outros convites não foram consultados nem alterados.');
}

main()
  .catch(err => {
    console.error('FALHA:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
