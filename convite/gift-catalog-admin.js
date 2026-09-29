'use strict';

const DEFAULT_GIFT_CATEGORY = 'Lista de presentes';
const MAX_GIFT_NAME_LENGTH = 160;
const MAX_GIFT_CATEGORY_LENGTH = 100;

function cleanGiftText(value, maxLength) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  return typeof maxLength === 'number' ? cleaned.slice(0, maxLength) : cleaned;
}

function normalizeGiftAdminKey(value) {
  return cleanGiftText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeGiftAdminInput(body = {}) {
  const name = cleanGiftText(body.name ?? body.nome ?? body.gift ?? body.presente, MAX_GIFT_NAME_LENGTH);
  const category = cleanGiftText(body.category ?? body.categoria ?? DEFAULT_GIFT_CATEGORY, MAX_GIFT_CATEGORY_LENGTH) || DEFAULT_GIFT_CATEGORY;
  return { name, category };
}

function detectGiftDelimiter(line) {
  const source = String(line || '');
  const choices = [';', '\t', ','];
  let best = '';
  let count = 0;
  for (const delimiter of choices) {
    const current = source.split(delimiter).length - 1;
    if (current > count) {
      best = delimiter;
      count = current;
    }
  }
  return best;
}

function parseGiftDelimitedLine(line, delimiter) {
  if (!delimiter) return [String(line || '').trim()];
  const out = [];
  let current = '';
  let inQuotes = false;
  const source = String(line || '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (inQuotes && source[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function giftHeaderKey(value) {
  return normalizeGiftAdminKey(value).replace(/\s+/g, '');
}

function looksLikeGiftHeader(fields) {
  const keys = fields.map(giftHeaderKey);
  return keys.some(key => ['nome', 'name', 'presente', 'gift', 'item', 'giftname'].includes(key)) ||
    keys.some(key => ['categoria', 'category', 'tipo', 'grupo'].includes(key));
}

function headerValue(row, headers, aliases, fallbackIndex = -1) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return row[index] || '';
  }
  return fallbackIndex >= 0 ? (row[fallbackIndex] || '') : '';
}

function parseGiftImportText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  if (!lines.length) return { items: [], duplicates: [], invalid: [] };

  const delimiter = detectGiftDelimiter(lines[0]);
  const rows = lines.map(line => parseGiftDelimitedLine(line, delimiter));
  let headers = [];
  if (looksLikeGiftHeader(rows[0])) {
    headers = rows.shift().map(giftHeaderKey);
  }

  const items = [];
  const duplicates = [];
  const invalid = [];
  const seen = new Map();

  rows.forEach((row, index) => {
    const sourceLine = index + (headers.length ? 2 : 1);
    const rawName = headers.length
      ? headerValue(row, headers, ['nome', 'name', 'presente', 'gift', 'item', 'giftname'], 0)
      : (row[0] || '');
    const rawCategory = headers.length
      ? headerValue(row, headers, ['categoria', 'category', 'tipo', 'grupo'], 1)
      : (row[1] || '');

    const item = sanitizeGiftAdminInput({ name: rawName, category: rawCategory || DEFAULT_GIFT_CATEGORY });
    if (!item.name) {
      invalid.push({ line: sourceLine, reason: 'Nome vazio.' });
      return;
    }

    const key = normalizeGiftAdminKey(item.name);
    if (!key) {
      invalid.push({ line: sourceLine, reason: 'Nome inválido.' });
      return;
    }

    if (seen.has(key)) {
      duplicates.push({ line: sourceLine, name: item.name, firstLine: seen.get(key) });
      return;
    }

    seen.set(key, sourceLine);
    items.push(item);
  });

  return { items, duplicates, invalid };
}

module.exports = {
  DEFAULT_GIFT_CATEGORY,
  MAX_GIFT_NAME_LENGTH,
  MAX_GIFT_CATEGORY_LENGTH,
  cleanGiftText,
  normalizeGiftAdminKey,
  sanitizeGiftAdminInput,
  detectGiftDelimiter,
  parseGiftDelimitedLine,
  parseGiftImportText
};
