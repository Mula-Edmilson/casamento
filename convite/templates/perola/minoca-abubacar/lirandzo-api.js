// lirandzo-api.js — Cliente oficial Render/MongoDB para convites Lirandzo
// Convite: Minoca & Abubacar | slug: minoca-abubacar
(function () {
  'use strict';

  function stripSlash(value) { return String(value || '').replace(/\/+$/, ''); }
  function apiBase() { return stripSlash(window.LIRANDZO_API_BASE_URL || ''); }
  function slug() { return String(window.LIRANDZO_INVITE_SLUG || '').trim(); }
  function isConfigured() { return Boolean(apiBase() && slug()); }
  function cleanName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
  function getClientLoginToken() {
    try {
      const key = 'lirandzoClientLoginToken';
      let token = localStorage.getItem(key);
      if (!token) {
        const randomPart = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        token = 'web-' + randomPart;
        localStorage.setItem(key, token);
      }
      return token;
    } catch (e) {
      return 'web-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    }
  }
  function safeJson(res) {
    return res.text().then(function (text) {
      try { return text ? JSON.parse(text) : {}; }
      catch (e) { return { status: 'error', message: text || 'Resposta inválida do servidor.' }; }
    });
  }
  async function request(path, options) {
    if (!isConfigured()) throw new Error('API Lirandzo não configurada.');
    const res = await fetch(apiBase() + path, Object.assign({ mode: 'cors' }, options || {}));
    const data = await safeJson(res);
    if (!res.ok || data.status === 'error') throw new Error(data.message || ('Erro HTTP ' + res.status));
    return data;
  }
  async function getApi(action, params) {
    const qs = new URLSearchParams(Object.assign({}, params || {}, { action: action, slug: slug() }));
    return request('/api?' + qs.toString(), {
      method: 'GET',
      headers: { 'X-Invite-Slug': slug() }
    });
  }
  async function postApi(payload) {
    const body = Object.assign({}, payload || {}, { slug: slug() });
    return request('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Invite-Slug': slug() },
      body: JSON.stringify(body)
    });
  }
  function normalizeGuestResponse(data, fallbackName) {
    const d = data && (data.data || data) || {};
    const total = Number(d.maxGuests || d.maxGuestsTotal || d.guests || 1) || 1;
    const token = d.token || d.inviteToken || d.publicToken || d.id || d._id || localStorage.getItem('guestToken') || '';
    return Object.assign({}, d, {
      name: d.name || d.nome || d.guestName || fallbackName || '',
      nome: d.nome || d.name || d.guestName || fallbackName || '',
      token: token,
      mesa: d.mesa || d.Mesa || d.table || 'A definir',
      maxGuests: total,
      maxGuestsTotal: total,
      companions: Number.isFinite(Number(d.companions)) ? Number(d.companions) : Math.max(total - 1, 0),
      status: d.status || d.guestStatus || '',
      category: d.category || '',
      number: d.number || ''
    });
  }
  function findLocalGuestByToken(token) {
    return (window.LIRANDZO_GUESTS || []).find(function (g) { return String(g.token) === String(token); });
  }
  function findLocalGuestByName(name) {
    const n = cleanName(name);
    if (!n) return null;
    const guests = window.LIRANDZO_GUESTS || [];
    return guests.find(function (g) { return cleanName(g.name) === n; }) || guests.find(function (g) { return cleanName(g.name).includes(n); });
  }
  function base64ToBlob(base64, mime) {
    const raw = String(base64 || '').replace(/^data:[^,]+,/, '');
    const bin = atob(raw);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
  }
  function qrUrl(token) {
    const url = new URL('checkin.html', window.location.href).href + '?t=' + encodeURIComponent(token || '');
    return 'https://quickchart.io/qr?size=260&margin=1&text=' + encodeURIComponent(url);
  }

  const Local = {
    get: function (action, params) {
      const p = params || {};
      if (action === 'find_guest') {
        const g = findLocalGuestByName(p.name);
        return Promise.resolve(g ? { status: 'success', data: g, nome: g.name, token: g.token, mesa: g.mesa, maxGuests: g.maxGuests, companions: g.companions } : { status: 'error', message: 'Convidado não encontrado' });
      }
      if (action === 'get_guest') {
        const g = findLocalGuestByToken(p.token);
        return Promise.resolve(g ? { status: 'success', data: g, nome: g.name, token: g.token, mesa: g.mesa, maxGuests: g.maxGuests, companions: g.companions, number: g.number, checkedIn: g.checkedIn } : { status: 'error', message: 'Convite inválido' });
      }
      if (action === 'list_guests') return Promise.resolve({ status: 'success', data: window.LIRANDZO_GUESTS || [] });
      if (action === 'gifts' || action === 'list_gifts') return Promise.resolve({ status: 'success', data: window.LIRANDZO_GIFT_OPTIONS || [] });
      return Promise.resolve({ status: 'success', data: [] });
    },
    post: function () { return Promise.resolve({ status: 'success', local: true }); }
  };

  const API = {
    isConfigured: isConfigured,
    local: Local,
    findLocalGuestByToken: findLocalGuestByToken,
    findLocalGuestByName: findLocalGuestByName,
    qrUrl: qrUrl,
    async get(action, params) {
      const p = params || {};
      if (!isConfigured()) return Local.get(action, p);

      if (action === 'find_guest') {
        const localGuest = findLocalGuestByName(p.name);
        try {
          const result = await postApi({ action: 'login', name: p.name, loginToken: getClientLoginToken() });
          let guest = normalizeGuestResponse(result, p.name);
          if (localGuest) {
            const localData = normalizeGuestResponse(localGuest, p.name);
            guest = Object.assign({}, localData, guest, {
              name: guest.name || localData.name,
              nome: guest.nome || localData.nome,
              token: guest.token || localData.token,
              mesa: guest.mesa || localData.mesa,
              maxGuests: guest.maxGuests || localData.maxGuests,
              maxGuestsTotal: guest.maxGuestsTotal || localData.maxGuestsTotal,
              companions: Number.isFinite(Number(guest.companions)) ? guest.companions : localData.companions,
              number: guest.number || localData.number,
              category: guest.category || localData.category
            });
          }
          return { status: 'success', data: guest, nome: guest.name, token: guest.token, mesa: guest.mesa, maxGuests: guest.maxGuests, companions: guest.companions };
        } catch (err) {
          if (localGuest) {
            const guest = normalizeGuestResponse(localGuest, p.name);
            return { status: 'success', data: guest, nome: guest.name, token: guest.token, mesa: guest.mesa, maxGuests: guest.maxGuests, companions: guest.companions };
          }
          throw err;
        }
      }

      if (action === 'get_guest') {
        try {
          const result = await getApi('get_guest', { token: p.token || '', nome: p.nome || p.name || '' });
          const guest = normalizeGuestResponse(result, 'Convidado');
          return { status: 'success', data: guest, nome: guest.name, token: guest.token || p.token, mesa: guest.mesa, maxGuests: guest.maxGuests, companions: guest.companions };
        } catch (err) {
          const localGuest = findLocalGuestByToken(p.token);
          if (localGuest) {
            const guest = normalizeGuestResponse(localGuest, 'Convidado');
            return { status: 'success', data: guest, nome: guest.name, token: guest.token || p.token, mesa: guest.mesa, maxGuests: guest.maxGuests, companions: guest.companions };
          }
          throw err;
        }
      }

      if (action === 'get_rsvp_status') return getApi('get_rsvp_status', { token: p.token || '', nome: p.nome || p.name || '' });
      if (action === 'messages' || action === 'list_messages') return getApi('list_messages', p);
      if (action === 'gifts' || action === 'list_gifts') return getApi('list_gifts', p);

      return getApi(action, p);
    },
    async post(payload) {
      const data = Object.assign({}, payload || {});
      if (!isConfigured()) return Local.post(data);

      if (data.action === 'submit_rsvp') data.action = 'rsvp';
      if (data.action === 'submit_contribution') data.action = 'upload_comprovativo';

      if (data.action === 'upload_comprovativo' && data.comprovativoFile) {
        const fd = new FormData();
        fd.append('slug', slug());
        fd.append('nome', data.nome || data.name || 'Convidado');
        fd.append('token', data.token || '');
        fd.append('canal', data.canal || '');
        const mime = data.comprovativoFile_type || data.mimeType || 'image/jpeg';
        const filename = data.comprovativoFile_filename || data.filename || 'comprovativo.jpg';
        fd.append('comprovativoFile', base64ToBlob(data.comprovativoFile, mime), filename);
        const res = await fetch(apiBase() + '/api/upload_comprovativo', {
          method: 'POST',
          mode: 'cors',
          body: fd,
          headers: { 'X-Invite-Slug': slug() }
        });
        const result = await safeJson(res);
        if (!res.ok || result.status === 'error') throw new Error(result.message || 'Erro ao enviar comprovativo.');
        return result;
      }

      return postApi(data);
    }
  };

  window.LirandzoAPI = API;
})();
