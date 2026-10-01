'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildLegacyBootstrapDraft,
  auditLegacyBootstrapDraft
} = require('../builder-v2/legacy-bootstrap-v2');

const ROOT = path.resolve(__dirname, '..');
const INVITE_DIR = path.join(ROOT, 'rosalina-monteiro');
const inviteMeta = JSON.parse(fs.readFileSync(path.join(INVITE_DIR, 'invite-data.json'), 'utf8'));
const seedData = JSON.parse(fs.readFileSync(path.join(INVITE_DIR, 'mongodb-seed-data.json'), 'utf8'));

const draft = buildLegacyBootstrapDraft({ inviteMeta, seedData });
const audit = auditLegacyBootstrapDraft({ inviteMeta, seedData, draft });

console.log('');
console.log('Lirandzo — Builder V2 Legacy Bootstrap / Rosalina & Monteiro');
console.log('MODO: DRY-RUN — somente leitura.');
console.log('');
console.log(`Slug: ${draft.identity.slug}`);
console.log(`Pacote: ${draft.identity.packageKey}`);
console.log(`Casal: ${draft.people.coupleNames}`);
console.log(`Data: ${draft.event.dateISO}`);
console.log(`Agenda: ${audit.summary.scheduleItems} item(ns)`);
console.log(`História: ${audit.summary.storyChapters} capítulo(s)`);
console.log(`Contas bancárias: ${audit.summary.bankAccounts}`);
console.log(`Pagamentos móveis: ${audit.summary.mobilePayments}`);
console.log(`Presentes: ${audit.summary.giftMode}`);
console.log(`Acesso: ${audit.summary.accessMode}`);
console.log(`Renderer: ${audit.summary.contentMode}`);
console.log('');

for (const item of audit.checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.key}`);
}

console.log('');
console.log(`Validação para publicação: ${audit.validation.valid ? 'PASS' : 'FAIL'}`);
if (audit.validation.errors.length) {
  audit.validation.errors.forEach(error => console.log(`ERRO: ${error}`));
}
if (audit.validation.warnings.length) {
  audit.validation.warnings.forEach(warning => console.log(`AVISO: ${warning}`));
}

console.log('');
console.log('GARANTIAS DESTE DRY-RUN:');
console.log('- não liga ao MongoDB;');
console.log('- não cria InviteContent;');
console.log('- não altera convidados, RSVP, presentes, mensagens ou check-in;');
console.log('- não activa mongo-v2;');
console.log('- não altera o convite público;');
console.log('- não faz push nem deploy.');
console.log('');

if (!audit.valid) {
  console.error('DRY-RUN REPROVADO. Nenhuma migração deve ser aplicada.');
  process.exitCode = 1;
} else {
  console.log('DRY-RUN APROVADO. Conteúdo elegível para a próxima etapa de bootstrap de Draft.');
}
