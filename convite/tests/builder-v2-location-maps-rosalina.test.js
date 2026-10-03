'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROSALINA_LOCATION_MAPS,
  REQUIRED_LOCATION_IDS,
  locationKeyForScheduleItem,
  applyRosalinaLocationMaps,
  stripRosalinaLocationMaps,
  auditRosalinaLocationMaps,
  mapsAreBlank
} = require('../builder-v2/rosalina-location-maps-v2');

function fixture() {
  return {
    identity: { slug: 'rosalina-monteiro' },
    schedule: [
      { id: 'religious-cerimonia-religiosa-09-00', type: 'religious', title: 'Cerimónia Religiosa', time: '09:00', venue: 'Paróquia São Gabriel Arcanjo, Cidade da Matola', mapUrl: '', note: 'A' },
      { id: 'reception-cerimonia-civil-13-00', type: 'reception', title: 'Cerimónia Civil', time: '13:00', venue: 'Hotel Polana', mapUrl: '', note: 'B' },
      { id: 'additional-copo-de-agua-14-30', type: 'additional', title: 'Copo de Água', time: '14:30', venue: 'Hotel Glória, Salão Ballroom', mapUrl: '', note: 'C' }
    ],
    untouched: { value: 42 }
  };
}

test('location maps: fonte autoritativa contém três destinos exactos', () => {
  assert.deepEqual(REQUIRED_LOCATION_IDS, ['religious', 'civil', 'party']);
  assert.equal(ROSALINA_LOCATION_MAPS.religious.address, 'Praça da Igreja, 1, Cidade da Matola, Moçambique');
  assert.equal(ROSALINA_LOCATION_MAPS.civil.address, 'Avenida Julius Nyerere 1380, Maputo, Moçambique');
  assert.equal(ROSALINA_LOCATION_MAPS.party.address, 'Avenida da Marginal 4441, Maputo, Moçambique');
  for (const entry of Object.values(ROSALINA_LOCATION_MAPS)) {
    assert.match(entry.mapUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  }
});

test('location maps: resolve os três momentos pelos campos semânticos reais do bootstrap', () => {
  const source = fixture();
  assert.deepEqual(source.schedule.map(locationKeyForScheduleItem), ['religious', 'civil', 'party']);
});

test('location maps: aplica somente mapUrl aos três itens esperados', () => {
  const source = fixture();
  const mapped = applyRosalinaLocationMaps(source);

  assert.equal(source.schedule[0].mapUrl, '');
  assert.equal(mapped.schedule[0].mapUrl, ROSALINA_LOCATION_MAPS.religious.mapUrl);
  assert.equal(mapped.schedule[1].mapUrl, ROSALINA_LOCATION_MAPS.civil.mapUrl);
  assert.equal(mapped.schedule[2].mapUrl, ROSALINA_LOCATION_MAPS.party.mapUrl);

  for (let i = 0; i < source.schedule.length; i += 1) {
    const before = { ...source.schedule[i], mapUrl: mapped.schedule[i].mapUrl };
    assert.deepEqual(mapped.schedule[i], before);
  }
  assert.deepEqual(mapped.untouched, source.untouched);
});

test('location maps: strip recupera exactamente o estado com mapas vazios', () => {
  const source = fixture();
  const mapped = applyRosalinaLocationMaps(source);
  const stripped = stripRosalinaLocationMaps(mapped);
  assert.deepEqual(stripped, source);
});

test('location maps: auditoria exige correspondência exacta', () => {
  const mapped = applyRosalinaLocationMaps(fixture());
  assert.equal(auditRosalinaLocationMaps(mapped).valid, true);

  mapped.schedule[1].mapUrl = 'https://example.com/outro';
  const audit = auditRosalinaLocationMaps(mapped);
  assert.equal(audit.valid, false);
  assert.deepEqual(audit.failed.map(item => item.id), ['civil']);
});

test('location maps: alteração de tipo/título/hora/local bloqueia resolução em vez de fazer fuzzy match', () => {
  const source = fixture();
  source.schedule[1].type = 'civil';
  assert.equal(locationKeyForScheduleItem(source.schedule[1]), '');
  assert.throws(() => applyRosalinaLocationMaps(source), /Agenda Rosalina incompleta/);
});

test('location maps: mapsAreBlank só aceita os três momentos exactos presentes e vazios', () => {
  const source = fixture();
  assert.equal(mapsAreBlank(source), true);
  assert.equal(mapsAreBlank(applyRosalinaLocationMaps(source)), false);

  source.schedule = source.schedule.filter(item => item.type !== 'additional');
  assert.equal(mapsAreBlank(source), false);
});

test('location maps: aplicação bloqueia agenda incompleta', () => {
  const source = fixture();
  source.schedule = source.schedule.filter(item => item.type !== 'reception');
  assert.throws(() => applyRosalinaLocationMaps(source), /Agenda Rosalina incompleta/);
});

test('location maps DB source: escrita é confinada a InviteContent e mantém renderer legacy', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'rosalina-builder-v2-location-maps-db.js'), 'utf8');

  assert.match(source, /EXPECTED_BASE_DRAFT_REVISION = 3/);
  assert.match(source, /EXPECTED_BASE_PUBLISHED_REVISION = 1/);
  assert.match(source, /NEXT_DRAFT_REVISION = 4/);
  assert.match(source, /NEXT_PUBLISHED_REVISION = 2/);
  assert.match(source, /publishHash: EXPECTED_BASE_HASH/);
  assert.match(source, /contentModeForInvite\(invite\) !== 'legacy'/);
  assert.match(source, /InviteContent\.updateOne\(/);
  assert.doesNotMatch(source, /Invite\.updateOne\(/);
  assert.doesNotMatch(source, /config\.contentMode[^\n]*mongo-v2/);
  assert.doesNotMatch(source, /deleteMany\(/);
});
