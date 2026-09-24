// Lirandzo API.js — TEMPLATE DEMO
// Este ficheiro foi sanitizado para uso em demonstração.
// Não contém IDs reais de Google Sheets, pastas Drive, tokens Telegram ou senhas reais.

const DB_ID = 'DEMO_SPREADSHEET_ID';
const COMPROVATIVOS_FOLDER_ID = 'DEMO_DRIVE_FOLDER_ID';
const QRCODES_FOLDER_ID = 'DEMO_QRCODES_FOLDER_ID';

function doGet(e) {
  return jsonOutput({ status: 'success', demo: true, message: 'API demo. Substitua por uma API real apenas no projecto final do cliente.' });
}

function doPost(e) {
  return jsonOutput({ status: 'success', demo: true, message: 'Pedido recebido em modo demo.' });
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupDemo() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD_HASH', 'DEMO_HASH');
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_TOKEN', 'DEMO_TELEGRAM_TOKEN');
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT', 'DEMO_TELEGRAM_CHAT');
}
