'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'adminmanager.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

if (!blocks.length) {
  throw new Error('Nenhum script inline encontrado em adminmanager.html.');
}

blocks.forEach((source, index) => {
  new vm.Script(source, { filename: `adminmanager.html:inline-${index + 1}.js` });
});

console.log(`AdminManager inline JS: ${blocks.length} bloco(s) válido(s).`);
