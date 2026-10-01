'use strict';

const { PACKAGE_KEYS } = require('./invite-content-v2');

const TEMPLATE_REGISTRY = Object.freeze({
  'perola-amelia': {
    key: 'perola-amelia', packageKey: 'perola', path: 'convite/templates/perola-amelia', label: 'Pérola · Amélia',
    accessModes: ['nominal'],
    capabilities: ['story','gallery','rsvp','dressCode','gifts','contributions','messages','checkin','capsule','guestInfo','menu']
  },
  'perola-publico': {
    key: 'perola-publico', packageKey: 'perola', path: 'convite/templates/perola-publico', label: 'Pérola · Público',
    accessModes: ['open'],
    capabilities: ['story','gallery','rsvp','dressCode','gifts','contributions','messages','menu']
  },
  'perola-calate': {
    key: 'perola-calate', packageKey: 'perola', path: 'convite/templates/perola-calate', label: 'Pérola · Calate',
    accessModes: ['nominal','open'],
    capabilities: ['story','gallery','rsvp','dressCode','gifts','messages','checkin','capsule','guestInfo','menu']
  },
  'perola-flicia': {
    key: 'perola-flicia', packageKey: 'perola', path: 'convite/templates/perola-flicia', label: 'Pérola · Flícia',
    accessModes: ['nominal','open'],
    capabilities: ['story','gallery','rsvp','dressCode','gifts','messages','checkin','capsule','guestInfo','menu']
  },
  'esmeralda-edma': {
    key: 'esmeralda-edma', packageKey: 'esmeralda', path: 'convite/templates/esmeralda-edma', label: 'Esmeralda · Edma',
    accessModes: ['nominal','open'],
    capabilities: ['story','gallery','rsvp','dressCode','gifts','contributions','messages','checkin','capsule','guestInfo','menu']
  },
  'esmeralda-rosalina': {
    key: 'esmeralda-rosalina', packageKey: 'esmeralda', path: 'convite/templates/rubi-rosalina', label: 'Esmeralda · Rosalina',
    accessModes: ['nominal'],
    capabilities: ['story','gallery','rsvp','dressCode','gifts','contributions','messages','checkin','capsule','guestInfo','menu'],
    legacyPathAlias: true
  },
  'rubi-rosalina': {
    key: 'rubi-rosalina', packageKey: 'rubi', path: 'convite/templates/rubi-rosalina', label: 'Rubi · Rosalina · legado',
    accessModes: ['nominal'],
    capabilities: ['story','gallery','rsvp','dressCode','gifts','contributions','messages','checkin','capsule','guestInfo','menu']
  }
});

const DEFAULT_TEMPLATE_BY_PACKAGE = Object.freeze({
  perola: 'perola-amelia',
  esmeralda: 'esmeralda-edma',
  rubi: 'rubi-rosalina'
});

function getTemplate(key) {
  return TEMPLATE_REGISTRY[String(key || '').trim()] || null;
}
function listTemplates(packageKey) {
  const key = String(packageKey || '').trim().toLowerCase();
  return Object.values(TEMPLATE_REGISTRY).filter(item => !key || item.packageKey === key);
}
function resolveTemplate({ packageKey, templateKey, accessMode = 'nominal' } = {}) {
  const pkg = String(packageKey || '').trim().toLowerCase();
  if (!PACKAGE_KEYS.includes(pkg)) return null;
  if (templateKey) {
    const explicit = getTemplate(templateKey);
    if (!explicit || explicit.packageKey !== pkg || !explicit.accessModes.includes(accessMode)) return null;
    return explicit;
  }
  if (pkg === 'perola' && accessMode === 'open') return TEMPLATE_REGISTRY['perola-publico'];
  const fallback = TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_BY_PACKAGE[pkg]];
  if (fallback && fallback.accessModes.includes(accessMode)) return fallback;
  return listTemplates(pkg).find(item => item.accessModes.includes(accessMode)) || null;
}
function validateTemplateRegistry() {
  const errors = [];
  for (const [key, item] of Object.entries(TEMPLATE_REGISTRY)) {
    if (key !== item.key) errors.push(`Chave inconsistente: ${key}`);
    if (!PACKAGE_KEYS.includes(item.packageKey)) errors.push(`Pacote inválido em ${key}`);
    if (!String(item.path || '').startsWith('convite/templates/')) errors.push(`Path inseguro em ${key}`);
    if (!Array.isArray(item.accessModes) || !item.accessModes.length) errors.push(`Sem accessModes em ${key}`);
    if (!Array.isArray(item.capabilities)) errors.push(`Sem capabilities em ${key}`);
  }
  for (const pkg of PACKAGE_KEYS) {
    if (!TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_BY_PACKAGE[pkg]]) errors.push(`Sem template default para ${pkg}`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { TEMPLATE_REGISTRY, DEFAULT_TEMPLATE_BY_PACKAGE, getTemplate, listTemplates, resolveTemplate, validateTemplateRegistry };
