'use strict';

const TARGET_SLUG = 'rosalina-monteiro';

const ROSALINA_LOCATION_MAPS = Object.freeze({
  religious: Object.freeze({
    id: 'religious',
    label: 'Cerimónia Religiosa',
    address: 'Praça da Igreja, 1, Cidade da Matola, Moçambique',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Par%C3%B3quia%20S%C3%A3o%20Gabriel%20Arcanjo%2C%20Pra%C3%A7a%20da%20Igreja%201%2C%20Cidade%20da%20Matola%2C%20Mo%C3%A7ambique'
  }),
  civil: Object.freeze({
    id: 'civil',
    label: 'Cerimónia Civil',
    address: 'Avenida Julius Nyerere 1380, Maputo, Moçambique',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Polana%20Serena%20Hotel%2C%20Avenida%20Julius%20Nyerere%201380%2C%20Maputo%2C%20Mo%C3%A7ambique'
  }),
  party: Object.freeze({
    id: 'party',
    label: 'Copo de Água',
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

function scheduleWithoutMapUrls(schedule) {
  const list = Array.isArray(schedule) ? schedule : [];
  return list.map(item => {
    const out = clone(item || {});
    out.mapUrl = '';
    return out;
  });
}

function transformRosalinaLocationMaps(content, resolver) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Conteúdo Rosalina obrigatório para mapas.');
  }
  if (text(content.identity?.slug).toLowerCase() !== TARGET_SLUG) {
    throw new Error('Conteúdo não corresponde a rosalina-monteiro.');
  }

  const out = clone(content);
  const schedule = Array.isArray(out.schedule) ? out.schedule : [];
  const seen = new Set();

  out.schedule = schedule.map(item => {
    const id = text(item?.id).toLowerCase();
    const source = ROSALINA_LOCATION_MAPS[id];
    if (!source) return item;
    seen.add(id);
    return { ...item, mapUrl: resolver(source, item) };
  });

  const missing = REQUIRED_LOCATION_IDS.filter(id => !seen.has(id));
  if (missing.length) {
    throw new Error(`Agenda Rosalina incompleta para mapas: ${missing.join(', ')}.`);
  }

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
  const checks = REQUIRED_LOCATION_IDS.map(id => {
    const source = ROSALINA_LOCATION_MAPS[id];
    const item = schedule.find(entry => text(entry?.id).toLowerCase() === id);
    const actual = text(item?.mapUrl);
    return {
      id,
      ok: Boolean(item) && actual === source.mapUrl,
      expected: source.mapUrl,
      actual,
      address: source.address
    };
  });

  const failed = checks.filter(item => !item.ok);
  return {
    valid: failed.length === 0,
    checks,
    failed,
    mapped: checks.filter(item => item.ok).length,
    required: checks.length
  };
}

function mapsAreBlank(content) {
  const schedule = Array.isArray(content?.schedule) ? content.schedule : [];
  return REQUIRED_LOCATION_IDS.every(id => {
    const item = schedule.find(entry => text(entry?.id).toLowerCase() === id);
    return Boolean(item) && text(item.mapUrl) === '';
  });
}

module.exports = {
  TARGET_SLUG,
  ROSALINA_LOCATION_MAPS,
  REQUIRED_LOCATION_IDS,
  scheduleWithoutMapUrls,
  applyRosalinaLocationMaps,
  stripRosalinaLocationMaps,
  auditRosalinaLocationMaps,
  mapsAreBlank
};
