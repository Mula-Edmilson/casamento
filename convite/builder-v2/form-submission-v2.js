'use strict';

const crypto = require('crypto');
const {
  PACKAGE_KEYS,
  mapLegacyInviteToV2,
  normalizeInviteContentV2,
  validateInviteContentV2
} = require('./invite-content-v2');

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}
function packageFrom(raw = {}) {
  const candidate = clean(
    raw.packageKey || raw.package || raw.pacote ||
    raw.event?.packageKey || raw.event?.package || raw.event?.pacote
  ).toLowerCase();
  return PACKAGE_KEYS.includes(candidate) ? candidate : '';
}
function submissionKeyFrom(raw = {}) {
  const existing = clean(raw.submissionKey || raw.submissionId || raw.id || raw._id);
  if (existing) return existing;
  const stable = JSON.stringify({
    packageKey: packageFrom(raw),
    email: clean(raw.clientEmail || raw.email || raw.event?.clientEmail).toLowerCase(),
    couple: clean(raw.coupleNames || raw.event?.coupleNames),
    date: clean(raw.dateISO || raw.event?.dateISO),
    createdAt: clean(raw.createdAt || raw.timestamp)
  });
  return 'form_' + crypto.createHash('sha256').update(stable).digest('hex').slice(0, 24);
}

function normalizeFormSubmissionV2(raw = {}, options = {}) {
  const pkg = packageFrom(raw) || clean(options.packageKey).toLowerCase();
  const contentSource = raw.content && raw.content.schemaVersion === '2.0'
    ? normalizeInviteContentV2(raw.content)
    : mapLegacyInviteToV2(raw, { packageKey: pkg || 'perola', contentMode: 'legacy' });

  if (pkg && contentSource.identity.packageKey !== pkg) contentSource.identity.packageKey = pkg;

  const validation = validateInviteContentV2(contentSource, { stage: 'draft' });
  return {
    submissionKey: submissionKeyFrom(raw),
    packageKey: contentSource.identity.packageKey,
    status: 'new',
    source: clean(options.source || raw.source) || 'lirandzo-form',
    sourceReference: clean(raw.sourceReference || raw.reference || raw.emailMessageId),
    clientName: clean(raw.clientName || raw.name || raw.event?.clientName),
    clientEmail: clean(raw.clientEmail || raw.email || raw.event?.clientEmail).toLowerCase(),
    clientPhone: clean(raw.clientPhone || raw.phone || raw.telefone || raw.event?.clientPhone),
    coupleNames: clean(raw.coupleNames || raw.event?.coupleNames || contentSource.people.coupleNames),
    rawData: JSON.parse(JSON.stringify(raw)),
    normalizedDraft: validation.content,
    validation: { valid: validation.valid, errors: validation.errors, warnings: validation.warnings }
  };
}

module.exports = { normalizeFormSubmissionV2, packageFrom, submissionKeyFrom };
