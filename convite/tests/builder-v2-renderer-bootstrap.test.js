'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const bootstrap = require('../templates/rubi-rosalina/renderer-v2-bootstrap');
const bootstrapSource = read('templates/rubi-rosalina/renderer-v2-bootstrap.js');
const cmsSource = read('templates/rubi-rosalina/cms-template.js');
const indexHtml = read('templates/rubi-rosalina/index.html');
const inviteHtml = read('templates/rubi-rosalina/convite.html');
const registry = require('../builder-v2/template-registry-v2');

test('renderer bootstrap: resolve slug e API base a partir da configuração do convite', () => {
  const root = { LIRANDZO_INVITE_SLUG: 'rosalina-monteiro', LIRANDZO_API_BASE_URL: 'https://api.example.com' };
  assert.equal(bootstrap.resolveSlug(root, {}), 'rosalina-monteiro');
  assert.equal(bootstrap.resolveApiBase(root, {}), 'https://api.example.com');
});

test('renderer bootstrap: modo legacy preserva event-data e só depois carrega cms-template', async () => {
  const legacy = { slug: 'rosalina-monteiro', coupleNames: 'Rosalina & Monteiro' };
  const root = { LIRANDZO_EVENT_DATA: legacy, LIRANDZO_INVITE_SLUG: 'rosalina-monteiro', LIRANDZO_API_BASE_URL: 'https://api.example.com' };
  const order = [];
  const renderer = {
    ACTIVE_MODE: 'mongo-v2',
    fetchPublicEnvelope: async () => { order.push('fetch'); return { active: false, mode: 'legacy' }; },
    resolveEnvelope: () => ({ active: false, mode: 'legacy', content: null, revision: 0, hash: '' })
  };
  await bootstrap.boot({ root, renderer, document: null, loadScriptImpl: async (_doc, src) => { order.push(src); return { src }; } });
  assert.equal(root.LIRANDZO_EVENT_DATA, legacy);
  assert.deepEqual(order, ['fetch', './cms-template.js']);
  assert.equal(root.LIRANDZO_RENDERER_V2_STATE.mode, 'legacy');
});

test('renderer bootstrap: modo mongo-v2 substitui somente a fonte de dados antes do template visual', async () => {
  const legacy = { slug: 'rosalina-monteiro', coupleNames: 'LEGACY' };
  const mapped = { slug: 'rosalina-monteiro', coupleNames: 'Rosalina & Monteiro', seo: { title: 'V2' } };
  const root = { LIRANDZO_EVENT_DATA: legacy, LIRANDZO_INVITE_SLUG: 'rosalina-monteiro', LIRANDZO_API_BASE_URL: 'https://api.example.com' };
  let seoApplied = false;
  const renderer = {
    ACTIVE_MODE: 'mongo-v2',
    fetchPublicEnvelope: async () => ({ active: true, mode: 'mongo-v2', revision: 4, hash: 'abc', content: {} }),
    resolveEnvelope: () => ({ active: true, mode: 'mongo-v2', content: mapped, revision: 4, hash: 'abc' }),
    applySeo: content => { seoApplied = content === mapped; }
  };
  await bootstrap.boot({ root, renderer, document: null, loadScriptImpl: async () => ({}) });
  assert.equal(root.LIRANDZO_EVENT_DATA, mapped);
  assert.equal(root.LIRANDZO_RENDERER_V2_STATE.mode, 'mongo-v2');
  assert.equal(root.LIRANDZO_RENDERER_V2_STATE.revision, 4);
  assert.equal(root.LIRANDZO_RENDERER_V2_STATE.hash, 'abc');
  assert.equal(seoApplied, true);
});

test('renderer bootstrap: falha pública é fail-closed e não executa cms-template', async () => {
  const root = { LIRANDZO_EVENT_DATA: { slug: 'rosalina-monteiro' }, LIRANDZO_INVITE_SLUG: 'rosalina-monteiro', LIRANDZO_API_BASE_URL: 'https://api.example.com' };
  let cmsLoads = 0;
  const error = Object.assign(new Error('Conteúdo publicado indisponível.'), { code: 'CONTENT_NOT_PUBLISHED', status: 503 });
  const renderer = {
    ACTIVE_MODE: 'mongo-v2',
    fetchPublicEnvelope: async () => { throw error; },
    resolveEnvelope: value => value
  };
  await assert.rejects(() => bootstrap.boot({ root, renderer, document: null, loadScriptImpl: async () => { cmsLoads += 1; } }), /indisponível/);
  assert.equal(cmsLoads, 0);
  assert.equal(root.LIRANDZO_RENDERER_V2_STATE.mode, 'error');
  assert.equal(root.LIRANDZO_RENDERER_V2_STATE.code, 'CONTENT_NOT_PUBLISHED');
  assert.equal(root.LIRANDZO_RENDERER_V2_STATE.status, 503);
});

test('renderer bootstrap: index e convite usam core V2 + bootstrap sem carregar cms directamente', () => {
  for (const html of [indexHtml, inviteHtml]) {
    assert.match(html, /\/convite\/builder-v2\/public-renderer-v2\.js/);
    assert.match(html, /\.\/renderer-v2-bootstrap\.js/);
    assert.match(html, /\.\/event-data\.js/);
    assert.doesNotMatch(html, /<script src="\.\/cms-template\.js"><\/script>/);
  }
});

test('renderer bootstrap: cms-template suporta carregamento tardio após fetch assíncrono', () => {
  assert.match(cmsSource, /document\.readyState === 'loading'/);
  assert.match(cmsSource, /DOMContentLoaded',init,\{once:true\}/);
  assert.match(cmsSource, /else init\(\)/);
});

test('renderer bootstrap: integração não contém activação nem mutação de contentMode', () => {
  assert.doesNotMatch(bootstrapSource, /\/activate|renderer\/activate|mode\/activate/i);
  assert.doesNotMatch(bootstrapSource, /contentMode\s*=/);
  assert.doesNotMatch(indexHtml + inviteHtml, /mongo-v2/);
});

test('renderer bootstrap: Rosalina continua registada como Esmeralda sobre alias físico legado', () => {
  const template = registry.getTemplate('esmeralda-rosalina');
  assert.ok(template);
  assert.equal(template.packageKey, 'esmeralda');
  assert.equal(template.path, 'convite/templates/rubi-rosalina');
  assert.equal(template.legacyPathAlias, true);
});
