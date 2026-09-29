'use strict';

/*
  Aplicador local e idempotente da alteração de frontend Edna & Mauro.
  Remove a lista hardcoded como fonte de verdade e obriga o convite publicado
  a carregar o catálogo de presentes pela API/MongoDB.

  Este ficheiro é uma ferramenta de migração. Depois de a alteração final ser
  revista e integrada, pode ser removido do repositório.
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const filePath = path.join(__dirname, 'convite.html');
const EXPECTED_SOURCE_BLOB = 'e9b9c5441f17a2b3c1d56065ed6bfe6ad09285a9';
const MIGRATION_MARKER = 'EDNA_MAURO_REMOTE_GIFT_CATALOG_V1';

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}

function normalizeEol(content) {
  return String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`Bloco esperado não encontrado: ${label}`);
  const result = source.replace(pattern, replacement);
  if (result === source) throw new Error(`Nenhuma alteração aplicada em: ${label}`);
  return result;
}

const rawSource = fs.readFileSync(filePath, 'utf8');
const originalEol = rawSource.includes('\r\n') ? '\r\n' : '\n';
let source = normalizeEol(rawSource);

if (source.includes(MIGRATION_MARKER)) {
  console.log('Frontend Edna & Mauro já está em modo catálogo remoto. Nenhuma alteração necessária.');
  console.log('Git blob canónico actual:', gitBlobSha(source));
  process.exit(0);
}

// O Git armazena o ficheiro com LF, enquanto o Windows pode fazer checkout em CRLF.
// A validação é feita sobre a forma canónica LF para evitar falsos negativos de encoding/EOL.
const currentBlob = gitBlobSha(source);
if (currentBlob !== EXPECTED_SOURCE_BLOB) {
  throw new Error(`convite.html não corresponde ao baseline auditado. Esperado ${EXPECTED_SOURCE_BLOB}; actual ${currentBlob}. Nenhum ficheiro foi alterado.`);
}

source = replaceOnce(
  source,
  /\n    const DEMO_GIFTS = \[[\s\S]*?\n    \];\n    window\.LIRANDZO_GIFT_OPTIONS = window\.LIRANDZO_GIFT_OPTIONS \|\| DEMO_GIFTS;\n/,
  `\n    // ${MIGRATION_MARKER}\n    // A lista de presentes deixou de existir no frontend como fonte de verdade.\n    // O catálogo publicado é carregado exclusivamente pela API/MongoDB.\n`,
  'DEMO_GIFTS + LIRANDZO_GIFT_OPTIONS'
);

source = replaceOnce(
  source,
  /\n      const OFFICIAL_GIFT_OPTIONS = \(window\.LIRANDZO_GIFT_OPTIONS \|\| \[\]\)\.map\(normalizeGiftItem\)\.filter\(g => g\.name\);\n/,
  '\n',
  'OFFICIAL_GIFT_OPTIONS'
);

source = replaceOnce(
  source,
  /\n      function mergeOfficialGiftsWithRemote\(remoteItems\) \{[\s\S]*?\n      \}\n/,
  '\n',
  'mergeOfficialGiftsWithRemote'
);

source = replaceOnce(
  source,
  /      async function loadGiftChecklist\(\) \{[\s\S]*?\n      \}\n\n      if \(saveGiftsBtn\) \{/,
  `      async function loadGiftChecklist() {\n        if (!giftChecklist) return;\n\n        if (saveGiftsBtn) saveGiftsBtn.disabled = true;\n        giftChecklist.innerHTML = '<p class="small-modal-text">A carregar lista de presentes...</p>';\n        if (giftReservationStatus) {\n          giftReservationStatus.style.color = '';\n          giftReservationStatus.textContent = '';\n        }\n\n        try {\n          const apiReady = window.LirandzoAPI && window.LirandzoAPI.isConfigured && window.LirandzoAPI.isConfigured();\n          if (!apiReady) throw new Error('API Lirandzo não configurada.');\n\n          const res = await window.LirandzoAPI.get('gifts');\n          const gifts = (res.data || []).map(normalizeGiftItem).filter(g => g.name);\n          renderGiftChecklist(gifts);\n\n          if (saveGiftsBtn) saveGiftsBtn.disabled = gifts.length === 0;\n          if (!gifts.length && giftReservationStatus) {\n            giftReservationStatus.style.color = '#9E7A13';\n            giftReservationStatus.textContent = 'A lista de presentes ainda não está disponível.';\n          }\n        } catch (err) {\n          console.warn('Não foi possível carregar a lista de presentes do MongoDB:', err);\n          giftChecklist.innerHTML = '<p class="small-modal-text">Não foi possível carregar a lista de presentes agora. Feche e tente novamente dentro de alguns instantes.</p>';\n          if (giftReservationStatus) {\n            giftReservationStatus.style.color = '#D93025';\n            giftReservationStatus.textContent = 'A lista não está disponível neste momento. Nenhuma reserva foi efectuada.';\n          }\n          if (saveGiftsBtn) saveGiftsBtn.disabled = true;\n        }\n      }\n\n      if (saveGiftsBtn) {`,
  'loadGiftChecklist'
);

const forbidden = ['const DEMO_GIFTS =', 'OFFICIAL_GIFT_OPTIONS', 'mergeOfficialGiftsWithRemote'];
for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`Validação falhou: ainda existe código local proibido (${token}).`);
}
if (!source.includes(MIGRATION_MARKER)) throw new Error('Validação falhou: marcador de migração ausente.');
if (!source.includes("window.LirandzoAPI.get('gifts')")) throw new Error('Validação falhou: carregamento remoto de gifts ausente.');
if (!source.includes('Nenhuma reserva foi efectuada.')) throw new Error('Validação falhou: tratamento seguro de erro remoto ausente.');

const output = originalEol === '\r\n' ? source.replace(/\n/g, '\r\n') : source;
fs.writeFileSync(filePath, output, 'utf8');
console.log('Frontend Edna & Mauro actualizado para catálogo remoto.');
console.log('Git blob anterior (canónico):', currentBlob);
console.log('Git blob novo (canónico):', gitBlobSha(source));
console.log('Fallback local de presentes: REMOVIDO');
console.log('Fonte de verdade em produção: API/MongoDB');
