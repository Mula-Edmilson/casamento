'use strict';

const PIN = '2026';
const STORAGE = {
  guests: 'lirandzo_emerald_guest_registry_v10',
  rsvps: 'lirandzo_emerald_rsvps_v2',
  messages: 'lirandzo_emerald_messages_v2',
  checkins: 'lirandzo_emerald_checkins_v1'
};
const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
let selectedGuestId = '';

function getStore(key, fallback = []) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function setStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHTML(value) { return String(value || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
function slugify(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'convidado'; }
function shortHash(value, length = 6) { let hash = 2166136261; const text = String(value || 'lirandzo'); for (let i=0;i<text.length;i+=1){ hash ^= text.charCodeAt(i); hash = Math.imul(hash,16777619) >>> 0; } return hash.toString(36).toUpperCase().padStart(length,'0').slice(0,length); }
function createGuestCode(name, token = '') { return `LZD-ESM-${shortHash(`${name}|${token}|2026-12-12`, 5)}`; }
function invitationBase() { return new URL('../index.html', window.location.href).href; }
function inviteUrl(guest) { return `${invitationBase()}?token=${encodeURIComponent(guest.token)}`; }
function checkinPayload(guest) { return JSON.stringify({ type:'lirandzo-checkin', event:'LZD-ESM-2026', package:'Pacote Esmeralda', couple:'Nélia & Edmilson', guest:guest.name, guests:String(guest.maxGuests || '1'), table:guest.table || 'Mesa por definir', token:guest.token, code:guest.code }); }
function qrUrl(payload) { return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=14&data=${encodeURIComponent(payload)}`; }

function defaultGuests() {
  return [
    ['Ana Matavele', 'Mesa 03 · Família da noiva', 2, 'Família da noiva'],
    ['Rogério Pinhal', 'Mesa 05 · Amigos dos noivos', 1, 'Amigos'],
    ['Célia Mucavele', 'Mesa 02 · Família do noivo', 2, 'Família do noivo'],
    ['Daniel Langa', 'Mesa 06 · Equipa de honra', 1, 'Honra']
  ].map(([name, table, maxGuests, group], index) => {
    const token = `${slugify(name)}-${shortHash(name + index, 4)}`;
    return { id:`guest-${Date.now()}-${index}`, name, phone:'', token, code:createGuestCode(name, token), table, maxGuests:String(maxGuests), group, status:'Convidado', notes:'Registo de demonstração V10.', createdAt:new Date().toISOString() };
  });
}

function getGuests() {
  const list = getStore(STORAGE.guests, null);
  if (Array.isArray(list)) return list;
  const seed = defaultGuests();
  setStore(STORAGE.guests, seed);
  return seed;
}
function setGuests(list) { setStore(STORAGE.guests, list); }
function selectedGuest() { return getGuests().find(g => g.id === selectedGuestId) || getGuests()[0] || null; }

function renderStats() {
  const guests = getGuests();
  const rsvps = getStore(STORAGE.rsvps, []);
  const checkins = getStore(STORAGE.checkins, []);
  const messages = getStore(STORAGE.messages, []);
  $('#statGuests').textContent = guests.length;
  $('#statConfirmed').textContent = rsvps.filter(r => r.presence === 'Confirmado').length;
  $('#statChecked').textContent = checkins.length;
  $('#statPendingMessages').textContent = messages.filter(m => (m.status || 'approved') === 'pending').length;
}

function renderPreview(guest = selectedGuest()) {
  const img = $('#previewQr');
  if (!guest) {
    $('#previewName').textContent = 'Seleccione ou crie um convidado';
    $('#previewMeta').textContent = 'Mesa e entrada aparecem aqui.';
    $('#previewCode').textContent = 'LZD-ESM-00000';
    img.removeAttribute('src');
    return;
  }
  $('#previewName').textContent = guest.name;
  $('#previewMeta').textContent = `${guest.table || 'Mesa por definir'} · ${guest.maxGuests || '1'} pessoa(s)`;
  $('#previewCode').textContent = guest.code;
  img.src = qrUrl(checkinPayload(guest));
}

function renderGuests() {
  const query = ($('#guestSearch').value || '').toLowerCase().trim();
  const rsvps = getStore(STORAGE.rsvps, []);
  const checkins = getStore(STORAGE.checkins, []);
  const list = getGuests().filter(g => !query || [g.name,g.table,g.code,g.group].some(v => String(v || '').toLowerCase().includes(query)));
  $('#guestList').innerHTML = list.map(guest => {
    const rsvp = rsvps.find(r => r.code === guest.code || String(r.name).toLowerCase() === String(guest.name).toLowerCase());
    const checked = checkins.find(c => c.code === guest.code);
    return `<article class="guest-item">
      <div>
        <strong>${escapeHTML(guest.name)}</strong>
        <p>${escapeHTML(guest.table || 'Mesa por definir')} · ${escapeHTML(guest.maxGuests || '1')} pessoa(s) · ${escapeHTML(guest.group || 'Convidados')}</p>
        <p>${rsvp ? `RSVP: ${escapeHTML(rsvp.presence)}` : 'Sem RSVP'} · ${checked ? 'Check-in validado' : 'Por validar'}</p>
        <code>${escapeHTML(guest.code)}</code>
      </div>
      <div class="guest-actions">
        <button class="mini-btn" data-select="${escapeHTML(guest.id)}">Editar</button>
        <button class="mini-btn" data-copy="${escapeHTML(guest.id)}">Copiar link</button>
        <button class="mini-btn" data-open="${escapeHTML(guest.id)}">Abrir</button>
        <button class="mini-btn danger" data-delete="${escapeHTML(guest.id)}">Apagar</button>
      </div>
    </article>`;
  }).join('') || '<p>Nenhum convidado encontrado.</p>';
  $$('[data-select]').forEach(btn => btn.addEventListener('click', () => loadGuest(btn.dataset.select)));
  $$('[data-copy]').forEach(btn => btn.addEventListener('click', () => copyLink(btn.dataset.copy, btn)));
  $$('[data-open]').forEach(btn => btn.addEventListener('click', () => openInvite(btn.dataset.open)));
  $$('[data-delete]').forEach(btn => btn.addEventListener('click', () => deleteGuest(btn.dataset.delete)));
  renderStats();
  renderPreview();
}

function readForm() {
  const id = $('#guestId').value || `guest-${Date.now()}`;
  const name = $('#guestName').value.trim();
  const existing = getGuests().find(g => g.id === id);
  const token = existing?.token || `${slugify(name)}-${shortHash(`${name}|${Date.now()}`,4)}`;
  return { id, name, phone:$('#guestPhone').value.trim(), token, code:createGuestCode(name, token), table:$('#guestTable').value.trim() || 'Mesa por definir', maxGuests:$('#guestMax').value || '1', group:$('#guestGroup').value.trim() || 'Convidados', status:$('#guestStatus').value || 'Convidado', notes:$('#guestNotes').value.trim(), createdAt:existing?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() };
}

function fillForm(guest) {
  $('#formTitle').textContent = guest ? 'Editar convidado' : 'Adicionar convidado';
  $('#guestId').value = guest?.id || '';
  $('#guestName').value = guest?.name || '';
  $('#guestPhone').value = guest?.phone || '';
  $('#guestTable').value = guest?.table || '';
  $('#guestMax').value = guest?.maxGuests || '1';
  $('#guestGroup').value = guest?.group || '';
  $('#guestStatus').value = guest?.status || 'Convidado';
  $('#guestNotes').value = guest?.notes || '';
}
function loadGuest(id) { selectedGuestId = id; fillForm(getGuests().find(g => g.id === id)); renderPreview(); window.scrollTo({ top: 0, behavior:'smooth' }); }
function resetForm() { selectedGuestId = ''; fillForm(null); renderPreview(); }
function saveGuest(event) { event.preventDefault(); const guest = readForm(); if (!guest.name) return; const list = getGuests(); const idx = list.findIndex(g => g.id === guest.id); if (idx >= 0) list[idx] = guest; else list.unshift(guest); setGuests(list); selectedGuestId = guest.id; renderGuests(); fillForm(guest); }
function deleteGuest(id) { if (!confirm('Apagar este convidado?')) return; setGuests(getGuests().filter(g => g.id !== id)); if (selectedGuestId === id) resetForm(); renderGuests(); }
function copyLink(id, btn = null) { const guest = getGuests().find(g => g.id === id); if (!guest) return; const link = inviteUrl(guest); navigator.clipboard?.writeText(link).then(() => { if (btn) { const old = btn.textContent; btn.textContent = 'Copiado'; setTimeout(() => btn.textContent = old, 1200); } }).catch(() => alert(link)); }
function openInvite(id) { const guest = getGuests().find(g => g.id === id); if (guest) window.open(inviteUrl(guest), '_blank', 'noopener,noreferrer'); }
function exportFile(name, content, type) { const blob = new Blob([content], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function exportJson() { exportFile('convidados-lirandzo-v10.json', JSON.stringify(getGuests(), null, 2), 'application/json;charset=utf-8'); }
function exportCsv() { const rows = [['Nome','Telefone','Mesa','Pessoas','Grupo','Estado','Codigo','Token','Link']].concat(getGuests().map(g => [g.name,g.phone,g.table,g.maxGuests,g.group,g.status,g.code,g.token,inviteUrl(g)])); const csv = rows.map(row => row.map(v => `"${String(v || '').replace(/"/g,'""')}"`).join(',')).join('\n'); exportFile('convidados-lirandzo-v10.csv', csv, 'text/csv;charset=utf-8'); }

function init() {
  $('#pinForm').addEventListener('submit', event => { event.preventDefault(); if ($('#pinInput').value.trim() !== PIN) { alert('PIN incorrecto.'); return; } $('#pinCard').hidden = true; $('#adminPanel').hidden = false; renderGuests(); });
  $('#guestForm').addEventListener('submit', saveGuest);
  $('#resetForm').addEventListener('click', resetForm);
  $('#guestSearch').addEventListener('input', renderGuests);
  $('#seedGuests').addEventListener('click', () => { if (confirm('Repor convidados de demonstração?')) { setGuests(defaultGuests()); resetForm(); renderGuests(); } });
  $('#exportGuestsJson').addEventListener('click', exportJson);
  $('#exportGuestsCsv').addEventListener('click', exportCsv);
  $('#clearGuests').addEventListener('click', () => { if (confirm('Limpar todos os convidados?')) { setGuests([]); resetForm(); renderGuests(); } });
  $('#copyInviteLink').addEventListener('click', () => { const guest = selectedGuest(); if (guest) copyLink(guest.id, $('#copyInviteLink')); });
  $('#openInviteLink').addEventListener('click', () => { const guest = selectedGuest(); if (guest) openInvite(guest.id); });
  $('#importGuests').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (!Array.isArray(imported)) throw new Error('Formato inválido'); setGuests(imported); resetForm(); renderGuests(); } catch { alert('Não foi possível importar este ficheiro JSON.'); } });
  renderPreview();
}

document.addEventListener('DOMContentLoaded', init);
