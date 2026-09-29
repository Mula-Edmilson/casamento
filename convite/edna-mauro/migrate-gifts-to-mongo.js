'use strict';

/*
  Migração segura do catálogo de presentes — Edna & Mauro

  Por defeito é DRY-RUN e não altera a base de dados:
    node migrate-gifts-to-mongo.js

  Para aplicar depois de validar o dry-run:
    node migrate-gifts-to-mongo.js --apply

  Requisitos:
    - MONGODB_URI definido no ambiente local
    - convite existente com slug exacto "edna-mauro"
    - catálogo oficial com exactamente 20 presentes
    - nenhum presente obsoleto pode estar reservado

  A aplicação usa uma transacção MongoDB. Se a transacção não for suportada,
  a migração falha sem fazer fallback para escritas parciais.
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

function canonicalGiftRows() {
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

function serializeDoc(value) {
  return JSON.parse(JSON.stringify(value, (_key, current) => {
    if (current && current._bsontype === 'ObjectId') return String(current);
    return current;
  }));
}

function fingerprintGifts(rows) {
  const stable = rows
    .map(row => ({
      id: String(row._id || ''),
      name: String(row.name || ''),
      category: String(row.category || ''),
      reserved: Boolean(row.reserved),
      reservedBy: String(row.reservedBy || ''),
      reservedToken: String(row.reservedToken || ''),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ''
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
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

  const officialKeys = new Set(officialRows.map(item => normalize(item.name)));
  const toInsert = [];
  const toUpdate = [];

  for (const item of officialRows) {
    const key = normalize(item.name);
    const existing = currentByKey.get(key);
    if (!existing) {
      toInsert.push(item);
      continue;
    }
    if (existing.name !== item.name || existing.category !== item.category || existing.slug !== SLUG) {
      toUpdate.push({ existing, item });
    }
  }

  const obsolete = currentRows.filter(row => !officialKeys.has(normalize(row.name)));
  const blockedReserved = obsolete.filter(row => Boolean(row.reserved));

  return { currentByKey, toInsert, toUpdate, obsolete, blockedReserved };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI não definido. Não coloques a URI no chat; define-a apenas no teu terminal local.');
  }

  const officialRows = canonicalGiftRows();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const db = mongoose.connection.db;
  const invites = db.collection('invites');
  const gifts = db.collection('giftitems');
  const activities = db.collection('activities');

  const invite = await invites.findOne({ slug: SLUG });
  if (!invite) throw new Error(`Convite não encontrado: ${SLUG}`);

  const selectionMode = normalize(invite.config && invite.config.giftSelectionMode);
  if (selectionMode === 'quantity_contributions') {
    throw new Error('Migração recusada: este convite está em quantity_contributions.');
  }

  const currentRows = await gifts.find({ inviteId: invite._id }).sort({ name: 1 }).toArray();
  const initialFingerprint = fingerprintGifts(currentRows);
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

  const alreadyMigrated = currentMode === 'mongo'
    && currentRows.length === EXPECTED_GIFT_COUNT
    && plan.toInsert.length === 0
    && plan.toUpdate.length === 0
    && plan.obsolete.length === 0;

  if (alreadyMigrated) {
    console.log('');
    console.log('MIGRAÇÃO EDNA & MAURO: PASS — já aplicada anteriormente.');
    console.log('giftCatalogMode: mongo');
    console.log(`GiftItems: ${currentRows.length}/${EXPECTED_GIFT_COUNT}`);
    console.log('Nenhuma nova escrita foi feita no MongoDB nesta execução.');
    return;
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY-RUN CONCLUÍDO. Nenhum dado foi alterado.');
    console.log('Se o plano estiver correcto, executa novamente com --apply.');
    return;
  }

  const backupDir = path.join(__dirname, '.migration-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `edna-mauro-gifts-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    slug: SLUG,
    invite: serializeDoc(invite),
    gifts: serializeDoc(currentRows),
    fingerprint: initialFingerprint
  }, null, 2), 'utf8');
  console.log('Backup local criado:', backupPath);

  const session = mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const freshInvite = await invites.findOne({ _id: invite._id }, { session });
      if (!freshInvite) throw new Error('O convite deixou de existir durante a migração.');

      const freshRows = await gifts.find({ inviteId: invite._id }, { session }).sort({ name: 1 }).toArray();
      if (fingerprintGifts(freshRows) !== initialFingerprint) {
        throw new Error('O estado dos presentes mudou depois do dry-run inicial. Migração cancelada para evitar sobrescrita concorrente.');
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
            { $set: { name: item.name, category: item.category, slug: SLUG } },
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
        await gifts.deleteMany(
          { _id: { $in: freshPlan.obsolete.map(row => row._id) }, inviteId: invite._id, reserved: { $ne: true } },
          { session }
        );
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

  const finalInvite = await invites.findOne({ _id: invite._id });
  const finalRows = await gifts.find({ inviteId: invite._id }).sort({ name: 1 }).toArray();
  const finalKeys = new Set(finalRows.map(row => normalize(row.name)));
  const officialKeys = new Set(officialRows.map(row => normalize(row.name)));

  if (normalize(finalInvite && finalInvite.config && finalInvite.config.giftCatalogMode) !== 'mongo') {
    throw new Error('Verificação final falhou: giftCatalogMode não ficou em mongo.');
  }
  if (finalRows.length !== EXPECTED_GIFT_COUNT) {
    throw new Error(`Verificação final falhou: esperados ${EXPECTED_GIFT_COUNT} presentes, encontrados ${finalRows.length}.`);
  }
  if ([...officialKeys].some(key => !finalKeys.has(key)) || [...finalKeys].some(key => !officialKeys.has(key))) {
    throw new Error('Verificação final falhou: o catálogo MongoDB não corresponde exactamente à lista oficial.');
  }

  console.log('');
  console.log('MIGRAÇÃO EDNA & MAURO: PASS');
  console.log('giftCatalogMode: mongo');
  console.log(`GiftItems: ${finalRows.length}/${EXPECTED_GIFT_COUNT}`);
  console.log('As reservas dos presentes oficiais existentes foram preservadas.');
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
