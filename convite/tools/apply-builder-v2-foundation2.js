'use strict';

const fs = require('fs');
const path = require('path');

const IMPORT_ANCHOR = "const { DEFAULT_GIFT_CATEGORY, normalizeGiftAdminKey, sanitizeGiftAdminInput, parseGiftImportText } = require('./gift-catalog-admin');";
const BUILDER_IMPORTS = [
  "const { createBuilderV2Models } = require('./builder-v2/mongo-models-v2');",
  "const { registerBuilderV2ContentRoutes } = require('./builder-v2/content-api-v2');"
].join('\n');
const MODEL_ANCHOR = "const MarketingCampaign = mongoose.model('MarketingCampaign', MarketingCampaignSchema);";
const BUILDER_MODELS = 'const { InviteContent, InviteContentRevision, FormSubmission } = createBuilderV2Models(mongoose);';
const ERROR_HANDLER_ANCHOR = 'app.use((err, req, res, next) => {';
const ROUTE_REGISTRATION = [
  'registerBuilderV2ContentRoutes(app, {',
  '  mongoose,',
  '  Invite,',
  '  InviteContent,',
  '  InviteContentRevision,',
  '  FormSubmission,',
  '  Activity,',
  '  requireManager,',
  '  requireAdmin,',
  '  asyncRoute',
  '});'
].join('\n');

function count(haystack, needle) {
  return String(haystack).split(needle).length - 1;
}

function normalizeForPatch(source) {
  return String(source || '').replace(/\r\n/g, '\n');
}

function restoreEol(source, usedCrLf) {
  return usedCrLf ? source.replace(/\n/g, '\r\n') : source;
}

function inspectServerIntegration(source) {
  const text = normalizeForPatch(source);
  return {
    imports: text.includes(BUILDER_IMPORTS),
    models: text.includes(BUILDER_MODELS),
    routes: text.includes(ROUTE_REGISTRATION)
  };
}

function assertSingleAnchor(text, anchor, label) {
  const occurrences = count(text, anchor);
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 marcador, encontrado ${occurrences}. Nenhum ficheiro foi alterado.`);
  }
}

function patchServerSource(source) {
  const usedCrLf = String(source || '').includes('\r\n');
  let text = normalizeForPatch(source);
  const state = inspectServerIntegration(text);
  const integratedCount = Object.values(state).filter(Boolean).length;

  if (integratedCount === 3) return { changed: false, content: source, state };
  if (integratedCount > 0) {
    throw new Error(`server.js contém integração parcial Builder V2 (${JSON.stringify(state)}). Corrija/reverta antes de continuar.`);
  }

  assertSingleAnchor(text, IMPORT_ANCHOR, 'Import anchor');
  assertSingleAnchor(text, MODEL_ANCHOR, 'Model anchor');
  assertSingleAnchor(text, ERROR_HANDLER_ANCHOR, 'Route anchor');

  text = text.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${BUILDER_IMPORTS}`);
  text = text.replace(MODEL_ANCHOR, `${MODEL_ANCHOR}\n${BUILDER_MODELS}`);
  text = text.replace(ERROR_HANDLER_ANCHOR, `${ROUTE_REGISTRATION}\n\n${ERROR_HANDLER_ANCHOR}`);

  const finalState = inspectServerIntegration(text);
  if (!Object.values(finalState).every(Boolean)) throw new Error('Falha interna ao validar integração Builder V2 no server.js.');
  return { changed: true, content: restoreEol(text, usedCrLf), state: finalState };
}

function appendCommand(command, addition) {
  const clean = String(command || '').trim();
  if (clean.includes(addition)) return clean;
  return clean ? `${clean} && ${addition}` : addition;
}

function patchPackageObject(pkg) {
  const out = JSON.parse(JSON.stringify(pkg || {}));
  out.scripts = out.scripts || {};
  out.scripts.check = appendCommand(out.scripts.check,
    'node --check builder-v2/content-api-v2.js && node --check tools/apply-builder-v2-foundation2.js');
  out.scripts['test:builder-v2-api'] = 'node --test tests/builder-v2-foundation2.test.js';
  out.scripts.verify = appendCommand(out.scripts.verify, 'npm run test:builder-v2-api');
  return out;
}

function patchPackageJsonText(source) {
  const parsed = JSON.parse(String(source || '{}'));
  const patched = patchPackageObject(parsed);
  const content = `${JSON.stringify(patched, null, 2)}\n`;
  return { changed: content !== String(source || '').replace(/\r\n/g, '\n'), content };
}

function inspectPackage(pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  return {
    check: String(scripts.check || '').includes('builder-v2/content-api-v2.js') && String(scripts.check || '').includes('tools/apply-builder-v2-foundation2.js'),
    test: scripts['test:builder-v2-api'] === 'node --test tests/builder-v2-foundation2.test.js',
    verify: String(scripts.verify || '').includes('npm run test:builder-v2-api')
  };
}

function runCli() {
  const mode = process.argv.includes('--apply') ? 'apply' : 'check';
  const root = path.resolve(__dirname, '..');
  const serverPath = path.join(root, 'server.js');
  const packagePath = path.join(root, 'package.json');
  const serverSource = fs.readFileSync(serverPath, 'utf8');
  const packageSource = fs.readFileSync(packagePath, 'utf8');

  const serverStateBefore = inspectServerIntegration(serverSource);
  const packageStateBefore = inspectPackage(JSON.parse(packageSource));

  if (mode === 'check') {
    const partialServer = Object.values(serverStateBefore).filter(Boolean).length;
    if (partialServer > 0 && partialServer < 3) {
      throw new Error(`Integração parcial detectada no server.js: ${JSON.stringify(serverStateBefore)}`);
    }
    patchServerSource(serverSource);
    patchPackageJsonText(packageSource);
    console.log('Builder V2 Foundation 2 — CHECK');
    console.log(`server.js: ${Object.values(serverStateBefore).every(Boolean) ? 'já integrado' : 'pronto para patch seguro'}`);
    console.log(`package.json: ${Object.values(packageStateBefore).every(Boolean) ? 'já integrado' : 'pronto para patch seguro'}`);
    console.log('Nenhum ficheiro foi alterado.');
    return;
  }

  const serverPatched = patchServerSource(serverSource);
  const packagePatched = patchPackageJsonText(packageSource);
  if (serverPatched.changed) fs.writeFileSync(serverPath, serverPatched.content, 'utf8');
  if (packagePatched.changed) fs.writeFileSync(packagePath, packagePatched.content, 'utf8');

  const serverAfter = inspectServerIntegration(fs.readFileSync(serverPath, 'utf8'));
  const packageAfter = inspectPackage(JSON.parse(fs.readFileSync(packagePath, 'utf8')));
  if (!Object.values(serverAfter).every(Boolean) || !Object.values(packageAfter).every(Boolean)) {
    throw new Error('Validação pós-patch falhou. Reverta a working tree antes de continuar.');
  }

  console.log('Builder V2 Foundation 2 — APPLY PASS');
  console.log(`server.js alterado: ${serverPatched.changed ? 'sim' : 'não (já integrado)'}`);
  console.log(`package.json alterado: ${packagePatched.changed ? 'sim' : 'não (já integrado)'}`);
  console.log('Nenhuma alteração foi feita no MongoDB, Render ou main por este script.');
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  IMPORT_ANCHOR,
  BUILDER_IMPORTS,
  MODEL_ANCHOR,
  BUILDER_MODELS,
  ERROR_HANDLER_ANCHOR,
  ROUTE_REGISTRATION,
  inspectServerIntegration,
  patchServerSource,
  patchPackageObject,
  patchPackageJsonText,
  inspectPackage
};
