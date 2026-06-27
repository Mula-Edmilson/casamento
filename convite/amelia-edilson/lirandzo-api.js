// lirandzo-api.js — Cliente oficial Render/MongoDB para convites Lirandzo
// Convite: Amélia & Edilson | slug: amelia-edilson-convite
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
        ['selectedGift','giftChoice','selectedGifts','gifts','details'].forEach(function(key){ if (data[key]) fd.append(key, Array.isArray(data[key]) ? data[key].join(', ') : data[key]); });
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


// Compatibilidade com o admin do convite Pérola/Amélia.
// IMPORTANTE: este painel NÃO deve depender de /manager/login.
// Ele valida directamente no /admin-api usando o slug do convite e a senha configurada no Render.
(function () {
  function apiBase() {
    return String(window.LIRANDZO_API_BASE_URL || window.LIRANDZO_EVENT_DATA?.apiBaseUrl || '').replace(/\/+$/, '');
  }
  function slug() {
    return String(window.LIRANDZO_INVITE_SLUG || window.LIRANDZO_EVENT_DATA?.slug || '').trim();
  }
  function storedPassword() {
    return sessionStorage.getItem('perola_admin_password') || '';
  }
  async function safeJson(res) {
    const raw = await res.text();
    try { return raw ? JSON.parse(raw) : {}; }
    catch { return { status: 'error', message: raw || 'Resposta inválida do servidor.' }; }
  }
  function normaliseKey(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function idOf(item) {
    return String(item?._id || item?.id || item?.rsvpId || item?.messageId || item?.contributionId || '');
  }
  function contributionFileUrl(item) {
    const existing = item?.file || item?.fileUrl || item?.viewUrl || item?.downloadUrl || item?.previewUrl || item?.thumbnailUrl || '';
    if (existing) return existing;
    const id = idOf(item);
    return id ? apiBase() + '/api/contributions/' + encodeURIComponent(id) + '/file' : '';
  }
  function normaliseRsvp(item) {
    const guests = Number(item?.guests || item?.pessoas || item?.total || item?.maxGuests || 1) || 1;
    return Object.assign({}, item, {
      nome: item?.nome || item?.name || item?.guestName || 'Convidado',
      guests,
      phone: item?.phone || item?.telefone || '',
      mesa: item?.mesa || item?.table || '',
      message: item?.message || item?.mensagem || '',
      timestamp: item?.timestamp || item?.createdAt || item?.updatedAt || new Date().toISOString()
    });
  }
  function normaliseContribution(item) {
    return Object.assign({}, item, {
      nome: item?.nome || item?.name || item?.guestName || 'Convidado',
      canal: item?.canal || item?.method || item?.paymentMethod || item?.bank || '',
      file: contributionFileUrl(item),
      timestamp: item?.timestamp || item?.createdAt || item?.updatedAt || new Date().toISOString()
    });
  }
  function normaliseMessage(item) {
    return Object.assign({}, item, {
      nome: item?.nome || item?.name || item?.guestName || 'Convidado',
      message: item?.message || item?.mensagem || item?.text || '',
      timestamp: item?.timestamp || item?.createdAt || item?.updatedAt || new Date().toISOString()
    });
  }
  function normaliseGuest(item) {
    return Object.assign({}, item, {
      nome: item?.nome || item?.name || item?.guestName || '',
      name: item?.name || item?.nome || item?.guestName || '',
      mesa: item?.mesa || item?.table || '',
      table: item?.table || item?.mesa || '',
      token: item?.token || item?.inviteToken || item?.id || item?._id || '',
      maxGuests: Number(item?.maxGuests || item?.guests || 1) || 1
    });
  }
  function giftNameFromContribution(record) {
    const details = (() => {
      try { return typeof record?.details === 'string' ? JSON.parse(record.details) : (record?.details || {}); }
      catch { return {}; }
    })();
    const values = [
      record?.selectedGift,
      record?.giftChoice,
      record?.gift,
      record?.selectedGifts,
      record?.gifts,
      details.selectedGift,
      details.giftChoice,
      details.gift,
      details.selectedGifts,
      details.gifts
    ].flat().filter(Boolean);
    return String(values[0] || '').split(',')[0].trim();
  }
  function normaliseGiftItem(item) {
    const name = item?.name || item?.nome || giftNameFromContribution(item) || '';
    const reservedBy = item?.reserved_by || item?.reservedBy || item?.nome || item?.guestName || '';
    return Object.assign({}, item, {
      name,
      reserved: Boolean(item?.reserved || reservedBy),
      reserved_by: reservedBy,
      reservedBy,
      timestamp: item?.timestamp || item?.reservedAt || item?.createdAt || item?.updatedAt || ''
    });
  }

  async function adminPost(action, payload) {
    const base = apiBase();
    const inviteSlug = slug();
    if (!base) throw new Error('API do convite não configurada. Verifique client-config.js.');
    if (!inviteSlug) throw new Error('Slug do convite não configurado. Verifique client-config.js.');

    const password = storedPassword();
    const body = Object.assign({}, payload || {}, {
      action,
      slug: inviteSlug,
      password,
      admin_password: password
    });
    const headers = {
      'Content-Type': 'application/json',
      'X-Invite-Slug': inviteSlug
    };
    const token = sessionStorage.getItem('perola_admin_token') || '';
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(base + '/admin-api', {
      method: 'POST',
      mode: 'cors',
      headers,
      body: JSON.stringify(body)
    });
    const data = await safeJson(res);
    if (!res.ok || data.status === 'error') {
      const msg = data.message || ('Erro HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.action = action;
      throw err;
    }
    return data;
  }
  async function adminPostAny(actions, payload) {
    let lastErr = null;
    for (const action of actions) {
      try { return await adminPost(action, payload); }
      catch (err) {
        lastErr = err;
        // 400 costuma indicar "acção não reconhecida" em versões antigas/novas do backend.
        // 404 também pode indicar endpoint/alias ausente. Nesses casos tentamos o próximo alias.
        if (![400, 404].includes(Number(err.status))) throw err;
      }
    }
    throw lastErr || new Error('Ação de admin não reconhecida.');
  }

  window.LIRANDZO_API = {
    ADMIN_TOKEN: null,
    async authenticateAdmin(password) {
      const cleanPassword = String(password || '').trim();
      sessionStorage.setItem('perola_admin_password', cleanPassword);
      sessionStorage.removeItem('perola_admin_token');
      this.ADMIN_TOKEN = null;

      // Validação correcta para admin de convite: /admin-api + slug + senha.
      // Evita o 401 em /manager/login, que é apenas para o Admin Manager global.
      await adminPostAny(['get_guests', 'list_guests'], {});
      return { status: 'success', token: '' };
    },
    async getRSVPs() {
      const result = await adminPostAny(['get_rsvps', 'list_rsvps'], {});
      return Object.assign({}, result, { data: (result.data || []).map(normaliseRsvp) });
    },
    async getComprovativos() {
      const result = await adminPostAny(['get_comprovativos', 'list_gift_records'], {});
      return Object.assign({}, result, { data: (result.data || []).map(normaliseContribution) });
    },
    async getMessages() {
      const result = await adminPostAny(['get_messages', 'list_messages', 'messages'], {});
      return Object.assign({}, result, { data: (result.data || []).map(normaliseMessage) });
    },
    async getGuests() {
      const result = await adminPostAny(['get_guests', 'list_guests'], {});
      return Object.assign({}, result, { data: (result.data || []).map(normaliseGuest) });
    },
    async getGifts() {
      // Primeiro tenta o inventário real de presentes. Se o backend não tiver inventário,
      // cai para contribuições e normaliza presentes reservados a partir dos detalhes.
      try {
        const result = await adminPostAny(['get_gifts', 'list_gifts', 'get_gift_items'], {});
        return Object.assign({}, result, { data: (result.data || []).map(normaliseGiftItem).filter(item => item.name) });
      } catch (err) {
        const contributions = await this.getComprovativos().catch(() => ({ data: [] }));
        return { status: 'success', data: (contributions.data || []).map(normaliseGiftItem).filter(item => item.name) };
      }
    },
    async getGiftInventory() {
      const configured = (window.LIRANDZO_GIFT_OPTIONS || []).map(item => ({
        name: item.name || item.label || String(item),
        reserved: false,
        reserved_by: '',
        reservedBy: ''
      })).filter(item => item.name);

      const records = await this.getGifts().catch(() => ({ data: [] }));
      const taken = new Map((records.data || []).filter(item => item.name).map(item => [normaliseKey(item.name), item]));

      if (configured.length) {
        return { status: 'success', data: configured.map(item => {
          const found = taken.get(normaliseKey(item.name));
          return found ? Object.assign({}, item, { reserved: true, reserved_by: found.reserved_by || found.reservedBy || '', reservedBy: found.reservedBy || found.reserved_by || '' }) : item;
        }) };
      }
      return { status: 'success', data: (records.data || []).map(normaliseGiftItem).filter(item => item.name) };
    },
    async updateGuestTable(token, mesa) {
      return adminPostAny(['update_guest_table', 'update_guest', 'edit_guest'], { token, mesa, table: mesa });
    },
    async getStats() {
      return adminPostAny(['stats', 'get_stats'], {});
    }
  };
})();
