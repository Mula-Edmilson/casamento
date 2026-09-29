'use strict';

/*
  Migração segura do catálogo de presentes — Edna & Mauro

  DRY-RUN (não escreve):
    node migrate-gifts-to-mongo.js

  APPLY (transacção MongoDB):
    node migrate-gifts-to-mongo.js --apply
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const seed = require('./mongodb-seed-data.json');

const SLUG = 'edna-mauro';
const EXPECTED_GIFT_COUNT = 20;
const APPLY = process.argv.includes('--apply');

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function officialGiftRows() {
  const rows = (seed.giftOptions || [])
    .map(item => ({
      name: String(item.name || item.label || '').trim(),
      category: String(item.category || 'Loiça Amiga').trim() || 'Loiça Amiga'
    }))
    .filter(item => item.name);

  if (rows.length !== EXPECTED_GIFT_COUNT) {
    throw new Error(`A lista oficial deve conter exactamente ${EXPECTED_GIFT_COUNT} presentes; encontrados ${rows.length}.`);
  }

  const seen = new Set();
  for (const item of rows) {
    const key = normalize(item.name);
    if (!key) throw new Error('Foi encontrado um presente oficial sem nome válido.');
    if (seen.has(key)) throw new Error(`Presente duplicado na lista oficial: ${item.name}`);
    seen.add(key);
  }
  return rows;
}

function fingerprint(rows) {
  const stable = rows.map(row => ({
    id: String(row._id || ''),
    name: String(row.name || ''),
    category: String(row.category || ''),
    reserved: Boolean(row.reserved),
    reservedBy: String(row.reservedBy || ''),
    reservedToken: String(row.reservedToken || ''),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ''
  })).sort((a, b) => a.id.localeCompare(b.id));

  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function reservationSnapshot(rows, officialRows) {
  const officialKeys = new Set(officialRows.map(row => normalize(row.name)));
  return rows
    .filter(row => officialKeys.has(normalize(row.name)))
    .map(row => ({
      key: normalize(row.name),
      reserved: Boolean(row.reserved),
      reservedBy: String(row.reservedBy || ''),
      reservedToken: String(row.reservedToken || ''),
      reservedAt: row.reservedAt ? new Date(row.reservedAt).toISOString() : ''
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function buildPlan(currentRows, officialRows) {
  const currentByKey = new Map();
  for (const row of currentRows) {
    const key = normalize(row.name);
    if (!key) continue;
    if (currentByKey.has(key)) {
      throw new Error(`A base contém presentes duplicados por nome normalizado: ${row.name}`);
    }
    currentByKey.set(key, row);
  }

  const officialKeys = new Set(officialRows.map(row => normalize(row.name)));
  const toInsert = [];
  const toUpdate = [];

  for (const item of officialRows) {
    const existing = currentByKey.get(normalize(item.name));
    if (!existing) {
      toInsert.push(item);
    } else if (existing.name !== item.name || existing.category !== item.category || existing.slug !== SLUG) {
      toUpdate.push({ existing, item });
    }
  }

  const obsolete = currentRows.filter(row => !officialKeys.has(normalize(row.name)));
  const blockedReserved = obsolete.filter(row => Boolean(row.reserved));
  return { currentByKey, toInsert, toUpdate, obsolete, blockedReserved };
}

function safeBackup(value) {
  return JSON.parse(JSON.stringify(value));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI não definido. Define-o apenas no teu terminal local e nunca o envies no chat.');
  }

  const officialRows = officialGiftRows();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const db = mongoose.connection.db;
  const invites = db.collection('invites');
  const gifts = db.collection('giftitems');
  const activities = db.collection('activities');

  const invite = await invites.findOne({ slug: SLUG });
  if (!invite) throw new Error(`Convite não encontrado: ${SLUG}`);

  if (normalize(invite.config && invite.config.giftSelectionMode) === 'quantity_contributions') {
    throw new Error('Migração recusada: este convite está em quantity_contributions.');
  }

  const currentRows = await gifts.find({ inviteId: invite._id }).sort({ name: 1 }).toArray();
  const initialFingerprint = fingerprint(currentRows);
  const initialReservations = reservationSnapshot(currentRows, officialRows);
  const plan = buildPlan(currentRows, officialRows);
  const currentMode = normalize(invite.config && invite.config.giftCatalogMode) || 'legacy';

  console.log('');
  console.log('LIRANDZO — PILOTO EDNA & MAURO');
  console.log('Modo:', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('Invite ID:', String(invite._id));
  console.log('Modo actual do catálogo:', currentMode);
  console.log('Presentes actuais no MongoDB:', currentRows.length);
  console.log('Presentes oficiais:', officialRows.length);
  console.log('A inserir:', plan.toInsert.length);
  console.log('A normalizar/actualizar:', plan.toUpdate.length);
  console.log('Obsoletos não reservados a remover:', plan.obsolete.length - plan.blockedReserved.length);
  console.log('Obsoletos reservados:', plan.blockedReserved.length);

  if (plan.toInsert.length) console.log('Novos:', plan.toInsert.map(x => x.name).join(' | '));
  if (plan.obsolete.length) console.log('Obsoletos:', plan.obsolete.map(x => `${x.name}${x.reserved ? ' [RESERVADO]' : ''}`).join(' | '));

  if (plan.blockedReserved.length) {
    throw new Error('Migração bloqueada: existe pelo menos um presente obsoleto reservado. Nenhum dado foi alterado.');
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY-RUN CONCLUÍDO. Nenhum dado foi alterado.');
    console.log('Se o plano estiver correcto, executa novamente com --apply.');
    return;
  }

  const backupDir = path.join(__dirname, '.migration-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `edna-mauro-gifts-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    slug: SLUG,
    invite: safeBackup(invite),
    gifts: safeBackup(currentRows),
    fingerprint: initialFingerprint
  }, null, 2), 'utf8');
  console.log('Backup local criado:', backupPath);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const freshInvite = await invites.findOne({ _id: invite._id, slug: SLUG }, { session });
      if (!freshInvite) throw new Error('O convite deixou de existir durante a migração.');

      const freshRows = await gifts.find({ inviteId: invite._id }, { session }).sort({ name: 1 }).toArray();
      if (fingerprint(freshRows) !== initialFingerprint) {
        throw new Error('O estado dos presentes mudou depois do preflight. Migração cancelada para evitar sobrescrita concorrente.');
      }

      const freshPlan = buildPlan(freshRows, officialRows);
      if (freshPlan.blockedReserved.length) {
        throw new Error('Foi detectado um presente obsoleto reservado dentro da transacção. Migração cancelada.');
      }

      for (const item of officialRows) {
        const existing = freshPlan.currentByKey.get(normalize(item.name));
        if (existing) {
          await gifts.updateOne(
            { _id: existing._id, inviteId: invite._id },
            { $set: { name: item.name, category: item.category, slug: SLUG, updatedAt: new Date() } },
            { session }
          );
        } else {
          await gifts.insertOne({
            inviteId: invite._id,
            slug: SLUG,
            name: item.name,
            category: item.category,
            reserved: false,
            reservedBy: '',
            reservedByNormalized: '',
            reservedToken: '',
            reservedSource: '',
            reservedAt: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }, { session });
        }
      }

      if (freshPlan.obsolete.length) {
        await gifts.deleteMany({
          _id: { $in: freshPlan.obsolete.map(row => row._id) },
          inviteId: invite._id,
          reserved: { $ne: true }
        }, { session });
      }

      const nextConfig = { ...(freshInvite.config || {}), giftCatalogMode: 'mongo' };
      await invites.updateOne(
        { _id: invite._id, slug: SLUG },
        { $set: { config: nextConfig, updatedAt: new Date() } },
        { session }
      );

      await activities.insertOne({
        inviteId: invite._id,
        slug: SLUG,
        type: 'gift',
        title: 'Catálogo de presentes migrado para MongoDB',
        detail: `${officialRows.length} presentes oficiais · ${freshPlan.obsolete.length} obsoletos removidos · modo mongo activado`,
        meta: {
          migration: 'edna-mauro-mongo-pilot-v1',
          officialGiftCount: officialRows.length,
          previousMode: normalize(freshInvite.config && freshInvite.config.giftCatalogMode) || 'legacy',
          backupFile: path.basename(backupPath)
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }, { session });
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });
  } finally {
    await session.endSession();
  }

  const finalInvite = await invites.findOne({ _id: invite._id, slug: SLUG });
  const finalRows = await gifts.find({ inviteId: invite._id }).sort({ name: 1 }).toArray();
  const finalKeys = new Set(finalRows.map(row => normalize(row.name)));
  const expectedKeys = new Set(officialRows.map(row => normalize(row.name)));
  const finalReservations = reservationSnapshot(finalRows, officialRows);

  if (normalize(finalInvite && finalInvite.config && finalInvite.config.giftCatalogMode) !== 'mongo') {
    throw new Error('Verificação final falhou: giftCatalogMode não ficou em mongo.');
  }
  if (finalRows.length !== EXPECTED_GIFT_COUNT) {
    throw new Error(`Verificação final falhou: esperados ${EXPECTED_GIFT_COUNT} presentes, encontrados ${finalRows.length}.`);
  }
  if ([...expectedKeys].some(key => !finalKeys.has(key)) || [...finalKeys].some(key => !expectedKeys.has(key))) {
    throw new Error('Verificação final falhou: o catálogo MongoDB não corresponde exactamente à lista oficial.');
  }
  if (JSON.stringify(initialReservations) !== JSON.stringify(finalReservations.filter(item => initialReservations.some(before => before.key === item.key)))) {
    throw new Error('Verificação final falhou: o estado de uma reserva oficial existente mudou durante a migração.');
  }

  console.log('');
  console.log('MIGRAÇÃO EDNA & MAURO: PASS');
  console.log('giftCatalogMode: mongo');
  console.log(`GiftItems: ${finalRows.length}/${EXPECTED_GIFT_COUNT}`);
  console.log('Reservas oficiais existentes: preservadas.');
}

main()
  .catch(err => {
    console.error('');
    console.error('MIGRAÇÃO EDNA & MAURO: FAIL');
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch {}
  });
