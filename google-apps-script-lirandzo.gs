/**
 * Lirandzo — Google Apps Script Web App
 * Recebe formulários do site alojado no GitHub Pages, envia email e guarda cópia numa Google Sheet.
 *
 * Como publicar:
 * 1. Aceda a https://script.google.com/ e crie um novo projecto.
 * 2. Cole este código no ficheiro Code.gs.
 * 3. Clique em Deploy > New deployment > Web app.
 * 4. Execute as: Me.
 * 5. Who has access: Anyone.
 * 6. Autorize as permissões.
 * 7. Copie o URL terminado em /exec e cole no ficheiro form-config.js do site.
 */

const LIRANDZO_CONFIG = {
  recipient: 'lirandzo.mz@gmail.com',
  spreadsheetName: 'Lirandzo — Briefings e Formulários',
  sheetName: 'Submissões',
  timezone: 'Africa/Maputo'
};

function doGet() {
  return jsonOutput_({
    success: true,
    service: 'Lirandzo Forms',
    message: 'Endpoint activo. Use POST para enviar formulários.'
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    locked = lock.tryLock(10000);
    const data = normalizeParameters_(e);

    // Honeypot: se bots preencherem este campo invisível, fingimos sucesso e não enviamos nada.
    if (data._honey || data.website || data.url_do_site) {
      return jsonOutput_({ success: true, ignored: true });
    }

    const meta = buildMeta_(data);
    const spreadsheet = getOrCreateSpreadsheet_();
    const sheet = getOrCreateSheet_(spreadsheet, LIRANDZO_CONFIG.sheetName);
    appendSubmission_(sheet, meta, data);
    sendNotificationEmail_(meta, data, spreadsheet.getUrl());

    return jsonOutput_({
      success: true,
      message: 'Formulário recebido com sucesso.'
    });
  } catch (error) {
    try {
      MailApp.sendEmail({
        to: LIRANDZO_CONFIG.recipient,
        subject: 'Erro no formulário Lirandzo',
        htmlBody: '<p>Ocorreu um erro no Google Apps Script da Lirandzo.</p><pre>' + escapeHtml_(String(error && error.stack || error)) + '</pre>'
      });
    } catch (mailError) {}

    return jsonOutput_({
      success: false,
      message: 'Erro ao processar formulário.',
      error: String(error && error.message || error)
    });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function normalizeParameters_(e) {
  const params = e && e.parameters ? e.parameters : {};
  const data = {};

  Object.keys(params).forEach(function (key) {
    const values = Array.isArray(params[key]) ? params[key] : [params[key]];
    const cleanValues = values
      .map(function (value) { return String(value == null ? '' : value).trim(); })
      .filter(function (value) { return value.length > 0; });

    if (cleanValues.length === 1) data[key] = cleanValues[0];
    else if (cleanValues.length > 1) data[key] = cleanValues.join(' | ');
  });

  return data;
}

function buildMeta_(data) {
  const now = new Date();
  const formType = data['Tipo de formulário'] || data['Identificador do formulário'] || 'Formulário Lirandzo';
  const packageName = data['Pacote escolhido'] || data.pacote || data.Pacote || 'Não indicado';
  const clientName = data['Nome do cliente'] || data.nome || data.Nome || data['Nome'] || 'Cliente sem nome';
  const clientEmail = data['Email do cliente'] || data.email || data.Email || '';
  const clientPhone = data['Contacto WhatsApp do cliente'] || data.telefone || data.Telefone || data['Telefone / WhatsApp'] || '';

  return {
    timestamp: Utilities.formatDate(now, LIRANDZO_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss'),
    formType: formType,
    packageName: packageName,
    clientName: clientName,
    clientEmail: clientEmail,
    clientPhone: clientPhone,
    pageUrl: data['Página de origem'] || '',
    subject: data['Assunto do email'] || ('Novo formulário recebido — Lirandzo')
  };
}

function getOrCreateSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('LIRANDZO_SPREADSHEET_ID');

  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (error) {
      props.deleteProperty('LIRANDZO_SPREADSHEET_ID');
    }
  }

  const spreadsheet = SpreadsheetApp.create(LIRANDZO_CONFIG.spreadsheetName);
  props.setProperty('LIRANDZO_SPREADSHEET_ID', spreadsheet.getId());
  return spreadsheet;
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Data',
      'Tipo de formulário',
      'Pacote',
      'Nome',
      'Email',
      'Telefone / WhatsApp',
      'Página de origem',
      'Resumo organizado',
      'Dados completos JSON'
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 9);
  }

  return sheet;
}

function appendSubmission_(sheet, meta, data) {
  sheet.appendRow([
    meta.timestamp,
    meta.formType,
    meta.packageName,
    meta.clientName,
    meta.clientEmail,
    meta.clientPhone,
    meta.pageUrl,
    data['Resumo organizado do briefing'] || '',
    JSON.stringify(data, null, 2)
  ]);
}

function sendNotificationEmail_(meta, data, spreadsheetUrl) {
  const replyTo = meta.clientEmail && meta.clientEmail.indexOf('@') > -1 ? meta.clientEmail : undefined;
  const cleanSubject = meta.subject + ' · ' + meta.clientName;

  const htmlBody = '' +
    '<div style="font-family:Arial,sans-serif;color:#2f261f;line-height:1.5">' +
      '<h2 style="margin:0 0 8px;color:#2f261f">Novo formulário recebido — Lirandzo</h2>' +
      '<p style="margin:0 0 18px;color:#6e6258">Submissão recebida em ' + escapeHtml_(meta.timestamp) + '</p>' +
      '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px">' +
        row_('Tipo de formulário', meta.formType) +
        row_('Pacote', meta.packageName) +
        row_('Nome', meta.clientName) +
        row_('Email', meta.clientEmail) +
        row_('Telefone / WhatsApp', meta.clientPhone) +
        row_('Página de origem', meta.pageUrl) +
      '</table>' +
      '<h3 style="margin:24px 0 10px;color:#2f261f">Resumo organizado</h3>' +
      '<pre style="white-space:pre-wrap;background:#f7f1eb;border:1px solid #eadbcf;border-radius:12px;padding:16px;font-family:Arial,sans-serif">' + escapeHtml_(data['Resumo organizado do briefing'] || buildFallbackSummary_(data)) + '</pre>' +
      '<p style="margin-top:18px"><a href="' + escapeHtml_(spreadsheetUrl) + '" style="color:#9b6a45">Abrir Google Sheet com as submissões</a></p>' +
    '</div>';

  const options = {
    to: LIRANDZO_CONFIG.recipient,
    subject: cleanSubject,
    htmlBody: htmlBody
  };
  if (replyTo) options.replyTo = replyTo;

  MailApp.sendEmail(options);
}

function buildFallbackSummary_(data) {
  return Object.keys(data)
    .filter(function (key) { return key && key.charAt(0) !== '_'; })
    .map(function (key) { return key + ': ' + data[key]; })
    .join('\n');
}

function row_(label, value) {
  return '<tr>' +
    '<td style="border:1px solid #eadbcf;background:#f7f1eb;font-weight:bold;width:210px">' + escapeHtml_(label) + '</td>' +
    '<td style="border:1px solid #eadbcf">' + escapeHtml_(value || '—') + '</td>' +
  '</tr>';
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
