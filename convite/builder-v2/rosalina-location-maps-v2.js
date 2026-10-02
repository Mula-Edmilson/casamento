'use strict';

const TARGET_SLUG = 'rosalina-monteiro';

const ROSALINA_LOCATION_MAPS = Object.freeze({
  religious: Object.freeze({
    key: 'religious',
    type: 'religious',
    title: 'Cerimónia Religiosa',
    time: '09:00',
    venue: 'Paróquia São Gabriel Arcanjo, Cidade da Matola',
    address: 'Praça da Igreja, 1, Cidade da Matola, Moçambique',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Par%C3%B3quia%20S%C3%A3o%20Gabriel%20Arcanjo%2C%20Pra%C3%A7a%20da%20Igreja%201%2C%20Cidade%20da%20Matola%2C%20Mo%C3%A7ambique'
  }),
  civil: Object.freeze({
    key: 'civil',
    type: 'reception',
    title: 'Cerimónia Civil',
    time: '13:00',
    venue: 'Hotel Polana',
    address: 'Avenida Julius Nyerere 1380, Maputo, Moçambique',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Polana%20Serena%20Hotel%2C%20Avenida%20Julius%20Nyerere%201380%2C%20Maputo%2C%20Mo%C3%A7ambique'
  }),
  party: Object.freeze({
    key: 'party',
    type: 'additional',
    title: 'Copo de Água',
    time: '14:30',
    venue: 'Hotel Glória, Salão Ballroom',
    address: 'Avenida da Marginal 4441, Maputo, Moçambique',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=AFECC%20Gl%C3%B3ria%20Hotel%2C%20Avenida%20da%20Marginal%204441%2C%20Maputo%2C%20Mo%C3%A7ambique'
  })
});

const REQUIRED_LOCATION_IDS = Object.freeze(Object.keys(ROSALINA_LOCATION_MAPS));

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function norm(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function scheduleWithoutMapUrls(schedule) {
  const list = Array.isArray(schedule) ? schedule : [];
  return list.map(item => {
    const out = clone(item || {});
    out.mapUrl = '';
    return out;
  });
}

function locationKeyForScheduleItem(item) {
  if (!item || typeof item !== 'object') return '';
  const type = norm(item.type);
  const title = norm(item.title);
  const time = text(item.time);
  const venue = norm(item.venue || item.place || item.location);

  for (const [key, source] of Object.entries(ROSALINA_LOCATION_MAPS)) {
    if (
      type === norm(source.type) &&
      title === norm(source.title) &&
      time === source.time &&
      venue === norm(source.venue)
    ) return key;
  }
  return '';
}

function indexRosalinaSchedule(schedule) {
  const list = Array.isArray(schedule) ? schedule : [];
  const indexed = new Map();
  const ambiguous = [];

  list.forEach((item, index) => {
    const key = locationKeyForScheduleItem(item);
    if (!key) return;
    if (indexed.has(key)) ambiguous.push(key);
    else indexed.set(key, { item, index });
  });

  return { indexed, ambiguous: [...new Set(ambiguous)] };
}

function transformRosalinaLocationMaps(content, resolver) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Conteúdo Rosalina obrigatório para mapas.');
  }
  if (norm(content.identity?.slug) !== TARGET_SLUG) {
    throw new Error('Conteúdo não corresponde a rosalina-monteiro.');
  }

  const out = clone(content);
  const schedule = Array.isArray(out.schedule) ? out.schedule : [];
  const { indexed, ambiguous } = indexRosalinaSchedule(schedule);
  if (ambiguous.length) {
    throw new Error(`Agenda Rosalina ambígua para mapas: ${ambiguous.join(', ')}.`);
  }

  const missing = REQUIRED_LOCATION_IDS.filter(key => !indexed.has(key));
  if (missing.length) {
    throw new Error(`Agenda Rosalina incompleta para mapas: ${missing.join(', ')}.`);
  }

  out.schedule = schedule.map((item, index) => {
    const key = locationKeyForScheduleItem(item);
    if (!key) return item;
    const source = ROSALINA_LOCATION_MAPS[key];
    return { ...item, mapUrl: resolver(source, item, index) };
  });

  return out;
}

function applyRosalinaLocationMaps(content) {
  return transformRosalinaLocationMaps(content, source => source.mapUrl);
}

function stripRosalinaLocationMaps(content) {
  return transformRosalinaLocationMaps(content, () => '');
}

function auditRosalinaLocationMaps(content) {
  const schedule = Array.isArray(content?.schedule) ? content.schedule : [];
  const { indexed, ambiguous } = indexRosalinaSchedule(schedule);
  const checks = REQUIRED_LOCATION_IDS.map(key => {
    const source = ROSALINA_LOCATION_MAPS[key];
    const match = indexed.get(key);
    const actual = text(match?.item?.mapUrl);
    return {
      id: key,
      ok: Boolean(match) && !ambiguous.includes(key) && actual === source.mapUrl,
      expected: source.mapUrl,
      actual,
      address: source.address
    };
  });

  const failed = checks.filter(item => !item.ok);
  return {
    valid: failed.length === 0 && ambiguous.length === 0,
    checks,
    failed,
    ambiguous,
    mapped: checks.filter(item => item.ok).length,
    required: checks.length
  };
}

function mapsAreBlank(content) {
  const schedule = Array.isArray(content?.schedule) ? content.schedule : [];
  const { indexed, ambiguous } = indexRosalinaSchedule(schedule);
  if (ambiguous.length) return false;
  return REQUIRED_LOCATION_IDS.every(key => {
    const match = indexed.get(key);
    return Boolean(match) && text(match.item.mapUrl) === '';
  });
}

module.exports = {
  TARGET_SLUG,
  ROSALINA_LOCATION_MAPS,
  REQUIRED_LOCATION_IDS,
  scheduleWithoutMapUrls,
  locationKeyForScheduleItem,
  indexRosalinaSchedule,
  applyRosalinaLocationMaps,
  stripRosalinaLocationMaps,
  auditRosalinaLocationMaps,
  mapsAreBlank
};
