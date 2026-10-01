'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'adminmanager-builder-v2-details.js'), 'utf8');
const config = fs.readFileSync(path.join(ROOT, 'adminmanager.config.js'), 'utf8');

for (const label of ['Apoio & Contactos', 'Contas bancárias', 'Pagamentos móveis', 'Galeria', 'Dress Code', 'Menu']) {
  test(`Builder detalhes: expõe editor visual de ${label}`, () => {
    assert.ok(source.includes(label), label);
  });
}

test('Builder detalhes: usa a mesma API oficial de Draft e optimistic concurrency', () => {
  assert.match(source, /\/content\/draft/);
  assert.match(source, /expectedDraftRevision/);
  assert.doesNotMatch(source, /\/content\/publish/);
  assert.doesNotMatch(source, /mongo-v2.*=.*true|contentMode.*mongo-v2/);
});

test('Builder detalhes: bloqueia edição quando o Builder principal tem alterações locais', () => {
  assert.match(source, /mainBuilderHasUnsavedChanges/);
  assert.match(source, /Guarde ou recarregue antes de editar Detalhes/);
});

test('Builder detalhes: corrige visualização de dateISO completo sem reformatar o Draft automaticamente', () => {
  assert.match(source, /event\.dateISO/);
  assert.match(source, /eventDate\.type = 'text'/);
  assert.match(source, /YYYY-MM-DD ou ISO completo/);
  assert.match(source, /2026-08-08T09:00:00\+02:00/);
});

test('Builder detalhes: preserva chaves desconhecidas dos itens ao editar', () => {
  assert.match(source, /const item = list\[Number\(control\.dataset\.index\)\]/);
  assert.match(source, /item\[control\.dataset\[datasetKey\]\] = control\.value/);
});

test('config: carrega extensão de detalhes depois do Builder principal', () => {
  assert.match(config, /adminmanager-builder-v2-details\.js/);
  assert.match(config, /const loadBuilderExtras = \(\) => \{/);
  assert.match(config, /loadBuilderDetails\(\);/);
  assert.match(config, /script\.addEventListener\('load', loadBuilderExtras/);
  assert.match(config, /builder-v2-details/);
});

test('config: preserva loader histórico literal de Presentes', () => {
  assert.match(config, /const MODULE_VALUE = 'gifts'/);
  assert.match(config, /script\.src = 'adminmanager-gifts\.js'/);
  assert.match(config, /DOMContentLoaded', loadGiftManager/);
});
