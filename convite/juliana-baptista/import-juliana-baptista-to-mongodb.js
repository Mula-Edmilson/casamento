/* Importador MongoDB — Juliana & Baptista */
'use strict';
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const SLUG = process.env.INVITE_SLUG || 'juliana-baptista';
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || 'https://lirandzo.com').replace(/\/+$/, '');
if (!MONGODB_URI) throw new Error('Defina MONGODB_URI antes de executar o importador.');

const Invite = mongoose.model('Invite', new mongoose.Schema({}, { strict: false, collection: 'invites' }));
const Guest = mongoose.model('Guest', new mongoose.Schema({}, { strict: false, collection: 'guests' }));
const GiftItem = mongoose.model('GiftItem', new mongoose.Schema({}, { strict: false, collection: 'giftitems' }));

(async () => {
  await mongoose.connect(MONGODB_URI);
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'mongodb-seed-data.json'), 'utf8'));
  const event = seed.event || {};
  const invite = await Invite.findOneAndUpdate(
    { slug: SLUG },
    { $set: {
      slug: SLUG,
      clientName: 'Juliana e Baptista',
      coupleNames: event.coupleNames || 'Juliana & Baptista',
      bride: event.bride || 'Juliana Menora Lobo',
      groom: event.groom || 'Baptista Tomás Nhambeu',
      packageKey: process.env.INVITE_PACKAGE || 'perola',
      status: 'published',
      eventDateISO: event.dateISO || '',
      rsvpDeadline: event.rsvpDeadlineISO || event.rsvpDeadline || '',
      publicUrl: `${PUBLIC_SITE_URL}/convite/${SLUG}/`,
      githubPath: `convite/${SLUG}`,
      config: event
    } },
    { upsert: true, new: true }
  );

  for (const raw of seed.guests || []) {
    const name = String(raw.name || raw.nome || '').trim();
    if (!name) continue;
    const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    await Guest.findOneAndUpdate(
      { inviteId: invite._id, normalizedName },
      { $setOnInsert: { inviteId: invite._id, slug: SLUG, name, normalizedName, status: 'Não aberto', deviceToken: '' }, $set: { ...raw, inviteId: invite._id, slug: SLUG, name, normalizedName } },
      { upsert: true, new: true }
    );
  }

  const allowedNames = (seed.giftOptions || []).map(item => String(item.name || '').trim()).filter(Boolean);
  await GiftItem.deleteMany({ inviteId: invite._id, name: { $nin: allowedNames } });
  for (const item of seed.giftOptions || []) {
    await GiftItem.findOneAndUpdate(
      { inviteId: invite._id, name: item.name },
      { $set: { inviteId: invite._id, slug: SLUG, name: item.name, category: item.category || 'Contribuições para construção', reserved: false } },
      { upsert: true, new: true }
    );
  }

  console.log(`Convite ${SLUG} importado com ${allowedNames.length} opções de contribuição.`);
  await mongoose.disconnect();
})().catch(async err => { console.error(err); try { await mongoose.disconnect(); } catch (_) {} process.exit(1); });
