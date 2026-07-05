
    (function () {
      'use strict';

      const RAW_EVENT = window.LIRANDZO_EVENT || window.LIRANDZO_EVENT_DATA || {};
      const EVENT = RAW_EVENT.event ? Object.assign({}, RAW_EVENT, RAW_EVENT.event, {
        coupleNames: RAW_EVENT.coupleNames || RAW_EVENT.event.title,
        displayNames: RAW_EVENT.displayNames || RAW_EVENT.event.title || RAW_EVENT.coupleNames,
        dateISO: RAW_EVENT.dateISO || RAW_EVENT.eventDateISO || RAW_EVENT.event.dateISO,
        eventDateLong: RAW_EVENT.eventDateLong || RAW_EVENT.event.dateLabel,
        ceremonyPlace: RAW_EVENT.ceremonyPlace || RAW_EVENT.event.religiousVenue || RAW_EVENT.event.civilVenue,
        ceremonyTime: RAW_EVENT.ceremonyTime || RAW_EVENT.event.religiousTime || RAW_EVENT.event.civilTime,
        receptionPlace: RAW_EVENT.receptionPlace || RAW_EVENT.event.receptionVenue || RAW_EVENT.event.civilVenue,
        receptionTime: RAW_EVENT.receptionTime || RAW_EVENT.event.receptionTime || RAW_EVENT.event.civilTime,
        supportContacts: RAW_EVENT.supportContacts || RAW_EVENT.event.contactPhone || RAW_EVENT.event.whatsapp
      }) : RAW_EVENT;
      const configured = !!(window.LirandzoAPI && window.LirandzoAPI.isConfigured && window.LirandzoAPI.isConfigured());
      const panels = [
        { id: 'dashboard', label: 'Dashboard', icon: 'layout' },
        { id: 'guests', label: 'Convidados', icon: 'users' },
        { id: 'rsvps', label: 'RSVP', icon: 'check-circle' },
        { id: 'gifts', label: 'Contribuições', icon: 'gift' },
        { id: 'messages', label: 'Mensagens', icon: 'message-circle' },
        { id: 'checkins', label: 'Check-in', icon: 'log-in' },
        { id: 'capsule', label: 'Cápsula', icon: 'image' }
      ];
      const DATA = { stats: {}, guests: [], rsvps: [], gifts: [], messages: [], checkins: [], photos: [] };
      const charts = {};

      const $ = (id) => document.getElementById(id);
      const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
      const num = (value) => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
      const text = (value) => String(value ?? '').trim();
      const nameOf = (o) => text(o.nome || o.name || o.guestName || o.convidado || 'Convidado');
      const dateFmt = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return text(value);
        return date.toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
      };
      const onlyDate = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return text(value || '-');
        return date.toLocaleDateString('pt-PT', { day:'2-digit', month:'long', year:'numeric' });
      };
      const driveIdFromUrl = (value) => {
        const str = String(value || '');
        const byPath = str.match(/\/d\/([^/]+)/);
        const byQuery = str.match(/[?&]id=([^&]+)/);
        return byPath ? decodeURIComponent(byPath[1]) : (byQuery ? decodeURIComponent(byQuery[1]) : '');
      };
      const driveThumbUrl = (id) => id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600` : '';
      const driveOpenUrl = (id) => id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view?usp=sharing` : '';
      const peopleFromRsvp = (r) => {
        const direct = num(r.guests || r.pessoas || r.total || r.maxGuests);
        if (direct) return direct;
        return String(r.choice || '').toLowerCase().includes('sim') ? 1 : 0;
      };
      const contains = (obj, query) => JSON.stringify(obj || {}).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const idOf = (o) => text(o && (o._id || o.id || o.messageId || o.rsvpId || o.checkinId || ''));
      const apiBase = () => String(window.LIRANDZO_API_BASE_URL || '').replace(/\/+$/, '');
      const inviteSlug = () => String(window.LIRANDZO_INVITE_SLUG || '').trim();
      const adminStorageKey = (suffix) => `lz_${inviteSlug() || 'convite'}_admin_${suffix}`;
      const adminPass = () => sessionStorage.getItem(adminStorageKey('password')) || adminPassword?.value || window.LIRANDZO_ADMIN_PASSWORD || '';
      const adminToken = () => sessionStorage.getItem(adminStorageKey('token')) || '';
      async function readJsonResponse(res) {
        const raw = await res.text();
        try { return raw ? JSON.parse(raw) : {}; }
        catch (err) { return { status: 'error', message: raw || 'Resposta inválida do servidor.' }; }
      }
      async function managerLogin(password) {
        const base = apiBase();
        if (!base) return null;
        const res = await fetch(`${base}/manager/login`, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await readJsonResponse(res);
        if (!res.ok || data.status === 'error') throw new Error(data.message || `Erro HTTP ${res.status}`);
        return data.token || '';
      }
      async function validateAdminPasswordFallback(password) {
        sessionStorage.setItem(adminStorageKey('password'), password);
        sessionStorage.removeItem(adminStorageKey('token'));
        await adminPost('get_guests', {});
        return '';
      }
      async function adminPost(action, payload = {}) {
        const base = apiBase();
        if (!base) throw new Error('API do convite não configurada.');
        const token = adminToken();
        const password = adminPass();
        const body = { ...payload, action, slug: inviteSlug(), password, admin_password: password };
        const headers = { 'Content-Type': 'application/json', 'X-Invite-Slug': inviteSlug() };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${base}/admin-api`, {
          method: 'POST',
          mode: 'cors',
          headers,
          body: JSON.stringify(body)
        });
        const data = await readJsonResponse(res);
        if (!res.ok || data.status === 'error') {
          if (res.status === 401) {
            sessionStorage.removeItem(adminStorageKey('logged'));
            sessionStorage.removeItem(adminStorageKey('token'));
            throw new Error('Sessão expirada ou senha inválida. Saia e entre novamente com a senha configurada no Render.');
          }
          throw new Error(data.message || `Erro HTTP ${res.status}`);
        }
        return data;
      }
      function responseArray(response) {
        if (Array.isArray(response)) return response;
        const data = response && response.data;
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.guests)) return data.guests;
        if (data && Array.isArray(data.rsvps)) return data.rsvps;
        if (data && Array.isArray(data.gifts)) return data.gifts;
        if (data && Array.isArray(data.records)) return data.records;
        if (data && Array.isArray(data.messages)) return data.messages;
        if (data && Array.isArray(data.checkins)) return data.checkins;
        if (data && Array.isArray(data.photos)) return data.photos;
        if (response && Array.isArray(response.guests)) return response.guests;
        if (response && Array.isArray(response.rsvps)) return response.rsvps;
        if (response && Array.isArray(response.gifts)) return response.gifts;
        if (response && Array.isArray(response.records)) return response.records;
        if (response && Array.isArray(response.messages)) return response.messages;
        if (response && Array.isArray(response.checkins)) return response.checkins;
        if (response && Array.isArray(response.photos)) return response.photos;
        if (response && Array.isArray(response.items)) return response.items;
        return [];
      }

      function responseObject(response) {
        if (!response) return {};
        if (response.data && !Array.isArray(response.data)) return response.data;
        return Array.isArray(response) ? {} : response;
      }

      async function trySources(sources, fallback) {
        let lastError = null;
        for (const source of sources) {
          try {
            const value = await source();
            return value;
          } catch (err) {
            lastError = err;
          }
        }
        if (fallback !== undefined) return fallback;
        if (lastError) throw lastError;
        return null;
      }

      async function collectSources(sources) {
        const settled = await Promise.allSettled(sources.map(source => source()));
        return settled.flatMap(result => result.status === 'fulfilled' ? responseArray(result.value) : []);
      }

      function stableRecordKey(row) {
        const id = idOf(row);
        if (id) return `id:${id}`;
        const tokenValue = text(row && (row.token || row.guestToken || row.inviteToken));
        const nameValue = nameOf(row);
        const giftValue = giftChosenName(row) || giftDetail(row);
        const timeValue = text(row && (row.timestamp || row.createdAt || row.updatedAt || row.reservedAt));
        return [tokenValue, nameValue, giftValue, timeValue].map(value => text(value).toLowerCase()).join('|') || JSON.stringify(row || {});
      }

      function uniqueRecords(rows) {
        const seen = new Set();
        const list = [];
        rows.forEach(row => {
          const key = stableRecordKey(row);
          if (seen.has(key)) return;
          seen.add(key);
          list.push(row);
        });
        return list;
      }


      function isInventoryGiftRow(row) {
        if (!row) return false;
        const hasInventoryFields = row.reserved !== undefined || row.isReserved !== undefined || row.reservedBy !== undefined || row.reservedAt !== undefined;
        const hasContributionFields = Boolean(row.canal || row.fileName || row.originalName || row.filename || row.viewUrl || row.previewUrl || row.downloadUrl);
        return hasInventoryFields && Boolean(row.name || row.label) && !hasContributionFields;
      }

      function giftSelectionDedupKey(row) {
        const gift = normalizeKey(giftChosenName(row));
        const guest = normalizeKey(giftGuestName(row));
        return `${guest}|${gift}`;
      }

      function prepareGiftRecords(rows) {
        const list = uniqueRecords(rows).filter(isGiftSelectionRecord);
        const contributionKeys = new Set(
          list
            .filter(row => !isInventoryGiftRow(row))
            .map(giftSelectionDedupKey)
            .filter(key => key !== '|')
        );
        return list.filter(row => {
          if (!isInventoryGiftRow(row)) return true;
          const key = giftSelectionDedupKey(row);
          return !contributionKeys.has(key);
        });
      }

      function isGenericGiftText(value) {
        const v = normalizeKey(value).replace(/[^a-z0-9]+/g, ' ').trim();
        return !v || ['presente escolhido', 'presentes escolhidos', 'presente', 'contribuicao registada', 'contribuicao registrada'].includes(v);
      }

      function giftOptionNames() {
        return (window.LIRANDZO_GIFT_OPTIONS || [])
          .map(item => item?.name || item?.label || String(item || '').trim())
          .filter(Boolean);
      }

      function resolveGiftOptionName(value) {
        const raw = text(value);
        if (!raw || isGenericGiftText(raw)) return '';
        const options = giftOptionNames();
        const normalized = normalizeKey(raw).replace(/[^a-z0-9]+/g, ' ').trim();
        const compact = normalized.replace(/\s+/g, '');
        const exact = options.find(name => normalizeKey(name).replace(/[^a-z0-9]+/g, ' ').trim() === normalized);
        if (exact) return exact;
        const compactMatch = options.find(name => normalizeKey(name).replace(/[^a-z0-9]+/g, '').trim() === compact);
        return compactMatch || raw;
      }

      function valuesFromMixedGift(value) {
        if (Array.isArray(value)) return value.flatMap(valuesFromMixedGift);
        if (typeof value === 'string' && value.includes(',')) return value.split(',').map(v => v.trim());
        return value === undefined || value === null ? [] : [value];
      }

      function giftFromFilename(g) {
        const filename = text(g?.originalName || g?.fileName || g?.filename || '');
        const match = filename.match(/presente[-_\s]*escolhido[-_\s]*(.+?)(?:\.[a-z0-9]+)?$/i);
        if (!match || !match[1]) return '';
        return resolveGiftOptionName(match[1].replace(/^\d+[-_\s]*/, '').replace(/[-_]+/g, ' ').trim());
      }

      function isGiftChannel(g) {
        return normalizeKey(g?.canal || '').includes('presente escolhido');
      }

      function giftChosenName(g) {
        if (!g) return '';
        const d = parseGiftDetails(g || {});
        const reserved = g?.reserved === true || g?.isReserved === true || Boolean(g?.reservedBy || g?.reserved_by || g?.reservedAt);
        const contributionLike = Boolean(
          g?.canal || g?.filename || g?.fileName || g?.originalName ||
          g?.viewUrl || g?.previewUrl || g?.downloadUrl || g?.comprovativoFile ||
          d.comprovativoFile || d.comprovativoFile_filename
        );
        const inventoryOnly = (g?.reserved !== undefined || g?.isReserved !== undefined || g?.category !== undefined) && Boolean(g?.name || g?.label) && !contributionLike;

        // Segurança: inventário de presentes com reserved=false NÃO é contribuição nem escolha.
        if (inventoryOnly && !reserved) return '';

        const values = [
          g?.selectedGift, g?.giftChoice, g?.gift, g?.giftName, g?.selectedGifts, g?.gifts,
          d.selectedGift, d.giftChoice, d.gift, d.giftName, d.selectedGifts, d.gifts
        ].flatMap(valuesFromMixedGift);

        for (const value of values) {
          const resolved = resolveGiftOptionName(value);
          if (resolved) return resolved;
        }

        const filenameGift = giftFromFilename(g);
        if (filenameGift) return filenameGift;

        return reserved ? resolveGiftOptionName(g?.name || g?.label || '') : '';
      }

      function isGiftSelectionRecord(g) {
        if (!g) return false;
        const d = parseGiftDetails(g);
        const status = text(g.status || g.state || d.status).toLowerCase();
        const reserved = g?.reserved === true || g?.isReserved === true || Boolean(g?.reservedBy || g?.reserved_by || g?.reservedAt);
        const giftName = giftChosenName(g);

        // Registos antigos com canal “Presente escolhido” mas sem nome do item
        // não são prova de escolha. Não entram na lista nem bloqueiam o convite.
        if (isGiftChannel(g) && !giftName) return false;

        const contributionLike = Boolean(
          g.canal || g.filename || g.fileName || g.originalName ||
          g.viewUrl || g.previewUrl || g.downloadUrl || g.comprovativoFile ||
          d.comprovativoFile || d.comprovativoFile_filename
        );
        return Boolean(
          reserved ||
          giftName ||
          (!isGiftChannel(g) && contributionLike) ||
          status.includes('reserv') ||
          (status.includes('escolh') && giftName)
        );
      }

      function setButtonBusy(button, busy, label) {
        if (!button) return;
        if (busy) {
          button.dataset.originalHtml = button.innerHTML;
          button.disabled = true;
          button.innerHTML = `<i data-feather="loader"></i> ${label || 'Aguarde'}`;
        } else {
          button.disabled = false;
          if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
        }
        feather.replace();
      }

      const loginScreen = $('loginScreen');
      const app = $('app');
      const loginForm = $('loginForm');
      const loginError = $('loginError');
      const adminPassword = $('adminPassword');
      const sidebar = $('sidebar');
      const overlay = $('overlay');
      const menuBtn = $('menuBtn');
      const logoutBtn = $('logoutBtn');
      const refreshBtn = $('refreshBtn');
      const themeToggle = $('themeToggle');
      const sideNav = $('sideNav');
      const mobileTabs = $('mobileTabs');
      const topbarTitle = $('topbarTitle');
      const syncDot = $('syncDot');
      const syncText = $('syncText');
      const dataSourceBadge = $('dataSourceBadge');
      const backendNote = $('backendNote');
      const addGuestForm = $('addGuestForm');
      const addGuestBtn = $('addGuestBtn');

      function init() {
        initTheme();
        feather.replace();
        buildNavigation();
        fillEventDetails();
        bindEvents();
        bindMediaPreview();
        setDataSourceState();
      }


      function initTheme() {
        const saved = localStorage.getItem(adminStorageKey('theme')) || 'dark';
        applyTheme(saved);
        themeToggle?.addEventListener('click', () => {
          const current = document.documentElement.getAttribute('data-theme') || 'dark';
          applyTheme(current === 'light' ? 'dark' : 'light');
        });
      }

      function applyTheme(theme) {
        const selected = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', selected);
        localStorage.setItem(adminStorageKey('theme'), selected);
        if (themeToggle) {
          const isLight = selected === 'light';
          themeToggle.setAttribute('aria-label', isLight ? 'Mudar para tema escuro' : 'Mudar para tema claro');
          themeToggle.setAttribute('title', isLight ? 'Mudar para tema escuro' : 'Mudar para tema claro');
          themeToggle.innerHTML = `<i data-feather="${isLight ? 'moon' : 'sun'}"></i>`;
        }
        if (window.feather) feather.replace();
        if (Object.keys(charts).length) renderCharts();
      }

      function bindMediaPreview() {
        const modal = $('mediaModal');
        const img = $('mediaModalImg');
        const title = $('mediaModalTitle');
        const openLink = $('mediaModalOpen');
        const closeButtons = [$('mediaModalClose'), $('mediaModalCloseBottom')].filter(Boolean);
        const close = () => {
          if (!modal) return;
          modal.classList.remove('open');
          modal.setAttribute('aria-hidden', 'true');
          if (img) img.removeAttribute('src');
        };
        document.addEventListener('click', (event) => {
          const trigger = event.target.closest('[data-preview-src]');
          if (!trigger) return;
          event.preventDefault();
          const src = trigger.dataset.previewSrc || '';
          const open = trigger.dataset.previewOpen || src;
          if (title) title.textContent = trigger.dataset.previewTitle || 'Comprovativo';
          if (img) img.src = src;
          if (openLink) openLink.href = open || '#';
          if (modal) {
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
          }
        });
        closeButtons.forEach(button => button.addEventListener('click', close));
        modal?.addEventListener('click', (event) => { if (event.target === modal) close(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
      }

      function bindEvents() {
        loginForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          loginError.textContent = '';
          const password = adminPassword.value;
          const submitBtn = loginForm.querySelector('button[type="submit"]');
          setButtonBusy(submitBtn, true, 'A validar');
          try {
            let token = '';
            if (apiBase()) {
              try {
                token = await managerLogin(password);
              } catch (loginErr) {
                // Compatibilidade com servidor antigo/sem MANAGER_SECRET: valida directamente no /admin-api.
                token = await validateAdminPasswordFallback(password);
              }
            } else {
              const expected = window.LIRANDZO_ADMIN_PASSWORD || 'fw2026';
              if (password !== expected) throw new Error('Senha incorrecta. Verifique a senha e tente novamente.');
            }
            sessionStorage.setItem(adminStorageKey('logged'), '1');
            sessionStorage.setItem(adminStorageKey('password'), password);
            if (token) sessionStorage.setItem(adminStorageKey('token'), token);
            loginScreen.style.display = 'none';
            app.style.display = 'block';
            await loadAll();
          } catch (err) {
            loginError.textContent = err.message || 'Senha incorrecta. Verifique a senha e tente novamente.';
          } finally {
            setButtonBusy(submitBtn, false);
          }
        });
        if (sessionStorage.getItem(adminStorageKey('logged')) === '1') {
          loginScreen.style.display = 'none';
          app.style.display = 'block';
          loadAll();
        }
        menuBtn.addEventListener('click', () => toggleSidebar(true));
        overlay.addEventListener('click', () => toggleSidebar(false));
        logoutBtn.addEventListener('click', () => {
          sessionStorage.removeItem(adminStorageKey('logged'));
          sessionStorage.removeItem(adminStorageKey('password'));
          sessionStorage.removeItem(adminStorageKey('token'));
          location.reload();
        });
        refreshBtn.addEventListener('click', loadAll);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleSidebar(false); });
        document.querySelectorAll('.search-input').forEach(input => input.addEventListener('input', renderLists));
        $('messageVisibilityFilter')?.addEventListener('change', renderLists);
        document.querySelectorAll('[data-export]').forEach(button => {
          button.addEventListener('click', () => exportCSV(button.dataset.export));
        });
        addGuestForm?.addEventListener('submit', handleAddGuestSubmit);
        document.addEventListener('click', handleAdminActionClick);
      }

      async function handleAddGuestSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        setButtonBusy(addGuestBtn, true, 'A adicionar');
        try {
          await adminPost('add_guest', payload);
          form.reset();
          const maxInput = $('newGuestMax');
          if (maxInput) maxInput.value = '1';
          alert('Convidado adicionado com sucesso.');
          await loadAll();
          showPanel('guests');
        } catch (err) {
          alert(err.message || 'Não foi possível adicionar o convidado.');
        } finally {
          setButtonBusy(addGuestBtn, false);
        }
      }

      async function handleAdminActionClick(event) {
        const button = event.target.closest('[data-admin-action]');
        if (!button) return;
        event.preventDefault();
        const action = button.dataset.adminAction;
        const id = button.dataset.id;
        const name = button.dataset.name || 'este registo';
        if (!id) { alert('ID do registo não encontrado.'); return; }

        let confirmText = '';
        let busyText = 'A processar';
        let successText = 'Operação concluída.';
        let payload = { id };

        if (action === 'hide_message') {
          confirmText = `Ocultar a mensagem de ${name}? Ela deixa de aparecer no mural público.`;
          busyText = 'A ocultar';
          successText = 'Mensagem ocultada com sucesso.';
        } else if (action === 'restore_message') {
          confirmText = `Restaurar a mensagem de ${name}? Ela volta a aparecer no mural público.`;
          busyText = 'A restaurar';
          successText = 'Mensagem restaurada com sucesso.';
        } else if (action === 'restore_rsvp') {
          confirmText = `Restaurar a confirmação de presença de ${name}? O convidado poderá confirmar novamente.`;
          busyText = 'A restaurar';
          successText = 'Confirmação restaurada com sucesso.';
        } else if (action === 'restore_checkin') {
          confirmText = `Restaurar o check-in de ${name}? A entrada volta a ficar pendente.`;
          busyText = 'A restaurar';
          successText = 'Check-in restaurado com sucesso.';
        } else if (action === 'delete_message') {
          const typed = prompt(`Para eliminar definitivamente a mensagem de ${name}, escreva ELIMINAR.`);
          if (typed !== 'ELIMINAR') return;
          busyText = 'A eliminar';
          successText = 'Mensagem eliminada definitivamente.';
        } else {
          return;
        }

        if (confirmText && !confirm(confirmText)) return;
        setButtonBusy(button, true, busyText);
        try {
          await adminPost(action, payload);
          alert(successText);
          await loadAll();
        } catch (err) {
          alert(err.message || 'A operação falhou.');
        } finally {
          setButtonBusy(button, false);
        }
      }

      function buildNavigation() {
        const navMarkup = panels.map(p => `<button type="button" class="nav-item ${p.id === 'dashboard' ? 'active' : ''}" data-panel="${p.id}"><i data-feather="${p.icon}"></i><span>${p.label}</span></button>`).join('');
        const mobileMarkup = panels.map(p => `<button type="button" class="mobile-tab ${p.id === 'dashboard' ? 'active' : ''}" data-panel="${p.id}"><i data-feather="${p.icon}"></i><span>${p.label}</span></button>`).join('');
        sideNav.innerHTML = navMarkup;
        mobileTabs.innerHTML = mobileMarkup;
        document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));
        feather.replace();
      }

      function fillEventDetails() {
        $('topbarSubtitle').textContent = `${EVENT.displayNames || EVENT.coupleNames || 'Amélia & Edilson'} · ${EVENT.eventDateLong || 'Data do evento'}`;
        $('eventChip').textContent = EVENT.eventDateLong || onlyDate(EVENT.dateISO);
        $('eventName').textContent = `${EVENT.eventType || 'Casamento'} · ${EVENT.displayNames || EVENT.coupleNames || 'Amélia e Edilson'}`;
        $('eventDate').textContent = EVENT.eventDateLong || onlyDate(EVENT.dateISO);
        $('rsvpDate').textContent = EVENT.rsvpDeadline || 'Prazo RSVP';
        $('ceremonyInfo').textContent = `${EVENT.ceremonyTime || '09:00'} · ${EVENT.ceremonyPlace || 'Local da cerimónia'}`;
        $('receptionInfo').textContent = `${EVENT.receptionTime || '13:00'} · ${EVENT.receptionPlace || 'Local da recepção'}`;
        $('supportInfo').textContent = EVENT.supportContacts || 'Apoio no dia do evento';
      }

      function setDataSourceState() {
        syncDot.classList.toggle('ok', configured);
        syncText.textContent = configured ? 'Online' : 'Modo teste';
        dataSourceBadge.className = 'status-badge ' + (configured ? 'ok' : 'warn');
        dataSourceBadge.textContent = configured ? 'Sistema activo' : 'Modo teste';
        backendNote.innerHTML = configured
          ? 'Painel sincronizado. Os dados são actualizados sempre que houver novas confirmações, contribuições, mensagens ou entradas.'
          : 'Modo de teste activo. Alguns dados podem estar guardados apenas neste navegador.';
      }

      function toggleSidebar(open) {
        sidebar.classList.toggle('open', !!open);
        overlay.classList.toggle('active', !!open);
      }

      function showPanel(id) {
        document.querySelectorAll('.page-panel').forEach(p => p.classList.toggle('active', p.id === `${id}Panel`));
        document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === id));
        const panel = panels.find(p => p.id === id);
        topbarTitle.textContent = panel ? panel.label : 'Dashboard';
        toggleSidebar(false);
        feather.replace();
      }

      function renderSkeletons() {
        const metricSkeleton = Array.from({ length: 6 }).map(() => '<article class="metric-card"><span class="skeleton-line" style="width:72%"></span><strong class="skeleton-line" style="width:42%;height:28px;margin-top:9px"></strong><small class="skeleton-line" style="width:58%;height:12px;margin-top:8px"></small></article>').join('');
        $('metricsGrid').innerHTML = metricSkeleton;
        $('activityList').innerHTML = Array.from({ length: 5 }).map(() => '<article class="activity-item"><div class="skeleton-card" style="width:34px;min-height:34px"></div><div style="display:grid;gap:7px"><span class="skeleton-line" style="width:72%"></span><span class="skeleton-line" style="width:92%;height:12px"></span></div><span class="skeleton-line" style="width:86px;height:24px;border-radius:999px"></span></article>').join('');
        const tableSkeleton = (cols) => Array.from({ length: 5 }).map(() => '<tr>' + Array.from({ length: cols }).map(() => '<td><span class="skeleton-cell"></span></td>').join('') + '</tr>').join('');
        const mobileSkeleton = Array.from({ length: 4 }).map(() => '<article class="mobile-card"><span class="skeleton-line" style="width:62%"></span><span class="skeleton-line" style="width:88%;height:12px;margin-top:8px"></span></article>').join('');
        ['guestRows','rsvpRows','giftRows','messageRows','checkinRows'].forEach((id, index) => { const el = $(id); if (el) el.innerHTML = tableSkeleton([7,7,4,5,7][index]); });
        ['guestMobile','rsvpMobile','giftMobile','messageMobile','checkinMobile'].forEach(id => { const el = $(id); if (el) el.innerHTML = mobileSkeleton; });
        if ($('capsuleGrid')) $('capsuleGrid').innerHTML = Array.from({ length: 6 }).map(() => '<article class="photo-card"><div class="skeleton-card" style="aspect-ratio:1/1;border-radius:0;min-height:auto"></div><div class="photo-meta"><span class="skeleton-line" style="width:70%"></span><span class="skeleton-line" style="width:48%;height:12px;margin-top:8px"></span></div></article>').join('');
      }

      async function loadAll() {
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '.7';
        app.classList.add('is-loading');
        renderSkeletons();
        try {
          const statsPromise = trySources([
            () => adminPost('stats'),
            () => LirandzoAPI.get('stats')
          ], { data: {} });
          const guestsPromise = trySources([
            () => adminPost('get_guests'),
            () => adminPost('list_guests'),
            () => LirandzoAPI.get('list_guests')
          ], { data: [] });
          const rsvpsPromise = trySources([
            () => adminPost('get_rsvps'),
            () => adminPost('list_rsvps'),
            () => LirandzoAPI.get('list_rsvps')
          ], { data: [] });
          const messagesPromise = trySources([
            () => adminPost('get_messages'),
            () => adminPost('list_messages'),
            () => LirandzoAPI.get('list_messages')
          ], { data: [] });
          const checkinsPromise = trySources([
            () => adminPost('get_checkins'),
            () => adminPost('list_checkins'),
            () => LirandzoAPI.get('list_checkins')
          ], { data: [] });
          const photosPromise = trySources([
            () => adminPost('get_capsule_photos'),
            () => adminPost('list_capsule_photos'),
            () => LirandzoAPI.get('list_capsule_photos')
          ], { data: [] });
          // Carregamento leve: o admin não abre PDFs nem imagens de presentes.
          // A API devolve somente convidado, presente escolhido, hora e estado.
          const giftsPromise = trySources([
            () => adminPost('get_gift_selections'),
            () => LirandzoAPI.get('list_gift_selections')
          ], { status: 'success', data: [] });

          const [stats, guests, rsvps, gifts, messages, checkins, photos] = await Promise.all([
            statsPromise,
            guestsPromise,
            rsvpsPromise,
            giftsPromise,
            messagesPromise,
            checkinsPromise,
            photosPromise
          ]);

          DATA.stats = responseObject(stats);
          DATA.guests = responseArray(guests);
          DATA.rsvps = responseArray(rsvps);
          DATA.gifts = prepareGiftRecords(responseArray(gifts));
          DATA.messages = responseArray(messages);
          DATA.checkins = responseArray(checkins);
          DATA.photos = responseArray(photos);
          renderAll();
        } catch (error) {
          console.error(error);
          backendNote.innerHTML = 'Não foi possível carregar os dados neste momento. Verifique a ligação e tente actualizar novamente.';
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.style.opacity = '1';
          app.classList.remove('is-loading');
          feather.replace();
        }
      }

      function summary() {
        const guestsCount = num(DATA.stats.guestsCount) || DATA.guests.length || num(EVENT.guestRows) || 0;
        const totalPeople = num(DATA.stats.totalPeople) || DATA.guests.reduce((sum, g) => sum + (num(g.maxGuests || g.maxGuestsTotal || g.guests) || 1), 0) || num(EVENT.estimatedGuests) || 0;
        const confirmedRows = DATA.guests.length ? DATA.guests.filter(guestConfirmed).length : (num(DATA.stats.confirmedRows) || DATA.rsvps.length);
        const confirmedPeople = DATA.rsvps.length ? DATA.rsvps.reduce((sum, r) => sum + peopleFromRsvp(r), 0) : (num(DATA.stats.confirmed) || confirmedRows);
        const openedRows = DATA.guests.filter(guestOpened).length || num(DATA.stats.openedRows || DATA.stats.opened || DATA.stats.views) || 0;
        const notOpenedRows = Math.max(guestsCount - openedRows, 0);
        const checkedPeople = num(DATA.stats.checkedPeople) || DATA.checkins.reduce((sum, c) => sum + (num(c.guests || c.maxGuests) || 1), 0);
        const checkedRows = DATA.guests.length ? DATA.guests.filter(guestCheckedIn).length : (num(DATA.stats.checkedIn) || DATA.checkins.length);
        return {
          guestsCount,
          totalPeople,
          openedRows,
          notOpenedRows,
          confirmedPeople,
          pendingPeople: Math.max(totalPeople - confirmedPeople, 0),
          confirmedRows,
          pendingRows: Math.max(guestsCount - confirmedRows, 0),
          checkedPeople,
          pendingCheckin: Math.max(totalPeople - checkedPeople, 0),
          checkedRows,
          gifts: DATA.gifts.length,
          messages: DATA.messages.length,
          photos: DATA.photos.length
        };
      }

      function renderAll() {
        renderMetrics();
        renderCharts();
        renderActivity();
        renderLists();
      }

      function renderMetrics() {
        const s = summary();
        const metrics = [
          ['Convidados', s.guestsCount, 'registos'],
          ['Abertos', s.openedRows, `${percent(s.openedRows, s.guestsCount)}% abriram`],
          ['Não abertos', s.notOpenedRows, 'ainda pendentes'],
          ['Confirmados', s.confirmedRows, `${percent(s.confirmedRows, s.guestsCount)}% RSVP`],
          ['Check-in', s.checkedRows, `${percent(s.checkedPeople, s.totalPeople)}% no salão`],
          ['Presentes', s.gifts, 'escolhidos/contribuições']
        ];
        $('metricsGrid').innerHTML = metrics.map(item => `<article class="metric-card"><span>${esc(item[0])}</span><strong>${esc(item[1])}</strong><small>${esc(item[2])}</small></article>`).join('');
      }

      function percent(value, total) {
        return Math.max(0, Math.min(100, Math.round((num(value) / Math.max(num(total), 1)) * 100)));
      }

      function makeChart(id, labels, values, colors) {
        const canvas = $(id);
        if (!canvas || !window.Chart) return;
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart(canvas, {
          type: 'doughnut',
          data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: cssVar('--chart-border') || '#241f1c', borderWidth: 3, hoverOffset: 3 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            layout: { padding: 0 },
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 9, boxHeight: 9, color: cssVar('--chart-text') || '#d8cec6', font: { size: 10, family: 'Inter' }, padding: 8 } },
              tooltip: { backgroundColor: cssVar('--tooltip-bg') || '#211c19', borderColor: cssVar('--tooltip-border') || 'rgba(224,203,184,.24)', borderWidth: 1, titleColor: cssVar('--text') || '#f6efe9', bodyColor: cssVar('--text-2') || '#d8cec6', padding: 10 }
            }
          }
        });
      }

      function renderCharts() {
        const s = summary();
        const empty = cssVar('--chart-empty') || '#4c4540';
        makeChart('rsvpChart', ['Confirmados', 'Pendentes'], [s.confirmedRows, s.pendingRows], [cssVar('--accent') || '#b08968', empty]);
        makeChart('checkinChart', ['Entraram', 'Por entrar'], [s.checkedPeople, s.pendingCheckin], [cssVar('--green') || '#18b783', empty]);
        makeChart('interactionChart', ['Abertos', 'Não abertos', 'Presentes', 'Msgs'], [s.openedRows, s.notOpenedRows, s.gifts, s.messages], [cssVar('--accent-2') || '#d0ad8f', empty, cssVar('--orange') || '#f2a84a', cssVar('--blue') || '#6aa5ff']);
      }

      function renderActivity() {
        const items = [
          ...DATA.rsvps.map(x => ({ ...x, type: 'RSVP', icon: 'check-circle', detail: `${peopleFromRsvp(x) || '-'} pessoa(s) confirmada(s)` })),
          ...DATA.gifts.map(x => ({ ...x, type: 'Contribuição', icon: 'gift', detail: giftDetail(x) })),
          ...DATA.messages.map(x => ({ ...x, type: 'Mensagem', icon: 'message-circle', detail: text(x.message).slice(0, 90) })),
          ...DATA.checkins.map(x => ({ ...x, type: 'Check-in', icon: 'log-in', detail: `${num(x.guests || x.maxGuests) || 1} pessoa(s) · ${x.mesa || 'Mesa a definir'}` })),
          ...DATA.photos.map(x => ({ ...x, type: 'Cápsula', icon: 'image', detail: x.filename || 'Foto enviada' }))
        ].sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));
        const maxItems = window.matchMedia('(max-width: 760px)').matches ? 5 : 9;
        const visibleItems = items.slice(0, maxItems);
        $('activityBadge').textContent = `${visibleItems.length} registos`;
        $('activityList').innerHTML = visibleItems.length ? visibleItems.map(item => `
          <article class="activity-item">
            <div class="activity-icon"><i data-feather="${item.icon}"></i></div>
            <div><strong>${esc(item.type)} · ${esc(nameOf(item))}</strong><p>${esc(item.detail || '-')}</p></div>
            <span class="status-badge blue">${esc(dateFmt(item.timestamp || item.createdAt))}</span>
          </article>`).join('') : '<div class="empty">Ainda não há actividade registada.</div>';
      }

      function renderLists() {
        renderGuests();
        renderRsvps();
        renderGifts();
        renderMessages();
        renderCheckins();
        renderCapsule();
        feather.replace();
      }

      function normalizeKey(value) {
        return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      }

      function guestToken(g) {
        return text(g && (g.token || g.inviteToken || g.publicToken || g.guestToken));
      }

      function recordMatchesGuest(record, guest) {
        const tokenA = guestToken(guest);
        const tokenB = text(record && (record.token || record.inviteToken || record.publicToken || record.guestToken));
        if (tokenA && tokenB && tokenA === tokenB) return true;
        const nameA = normalizeKey(nameOf(guest));
        const nameB = normalizeKey(nameOf(record));
        return Boolean(nameA && nameB && nameA === nameB);
      }

      function guestCheckedIn(g) {
        const status = normalizeKey(g && (g.status || g.guestStatus || g.checkinStatus));
        return Boolean(
          DATA.checkins.some(c => recordMatchesGuest(c, g)) ||
          g?.checkedIn === true ||
          g?.checked_in === true ||
          g?.checkin === true ||
          status.includes('entrou') ||
          status.includes('checkin') ||
          status.includes('checked')
        );
      }

      function guestConfirmed(g) {
        const status = normalizeKey(g && (g.status || g.guestStatus || g.rsvpStatus || g.confirmationStatus));
        return Boolean(
          DATA.rsvps.some(r => recordMatchesGuest(r, g)) ||
          g?.confirmed === true ||
          g?.isConfirmed === true ||
          g?.rsvp === true ||
          status.includes('confirm') ||
          status.includes('sim')
        );
      }

      function guestOpened(g) {
        const status = normalizeKey(g && (g.status || g.guestStatus || g.accessStatus || g.openStatus));
        const accessCount = num(g?.openCount || g?.openedCount || g?.views || g?.viewCount || g?.accessCount || g?.loginCount || g?.opens);
        return Boolean(
          guestConfirmed(g) ||
          guestCheckedIn(g) ||
          g?.opened === true ||
          g?.isOpened === true ||
          g?.hasOpened === true ||
          g?.viewed === true ||
          g?.accessed === true ||
          accessCount > 0 ||
          g?.openedAt ||
          g?.firstOpenedAt ||
          g?.lastOpenedAt ||
          g?.viewedAt ||
          g?.lastViewAt ||
          g?.lastAccessAt ||
          g?.lastLoginAt ||
          g?.loginAt ||
          status.includes('abert') ||
          status.includes('opened') ||
          status.includes('visualiz') ||
          status.includes('view') ||
          status.includes('access')
        );
      }

      function guestState(g) {
        if (guestCheckedIn(g)) return { label: 'Entrou', cls: 'ok' };
        if (guestConfirmed(g)) return { label: 'Confirmado', cls: 'ok' };
        if (guestOpened(g)) return { label: 'Aberto', cls: 'blue' };
        return { label: 'Não aberto', cls: 'warn' };
      }

      function guestStatusBadge(g) {
        const state = guestState(g);
        return `<span class="status-badge ${state.cls}">${esc(state.label)}</span>`;
      }

      function filtered(list, inputId) {
        const q = text($(inputId)?.value).toLowerCase();
        return !q ? list : list.filter(item => contains(item, q));
      }

      function renderGuests() {
        const list = filtered(DATA.guests, 'guestSearch');
        $('guestBadge').textContent = `${list.length} registos`;
        $('guestRows').innerHTML = list.length ? list.map(g => `
          <tr>
            <td>${esc(g.number || '')}</td>
            <td><strong>${esc(nameOf(g))}</strong></td>
            <td>${esc(String(g.category).toLowerCase() === 'couple' ? 'Casal' : 'Individual')}</td>
            <td>${esc(g.mesa || g.table || 'A definir')}</td>
            <td>${esc(g.maxGuests || g.maxGuestsTotal || g.guests || 1)}</td>
            <td><small>${esc(g.token || '')}</small></td>
            <td>${guestStatusBadge(g)}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty">Sem convidados para mostrar.</td></tr>';
        $('guestMobile').innerHTML = mobileCards(list, g => `${esc(String(g.category).toLowerCase() === 'couple' ? 'Casal' : 'Individual')} · ${esc(g.maxGuests || g.maxGuestsTotal || g.guests || 1)} pessoa(s) · Mesa: ${esc(g.mesa || g.table || 'A definir')}`, g => guestStatusBadge(g));
      }

      function renderRsvps() {
        const list = filtered(DATA.rsvps, 'rsvpSearch');
        $('rsvpBadge').textContent = `${list.length} confirmações`;
        $('rsvpRows').innerHTML = list.length ? list.map(r => {
          const id = idOf(r);
          const action = id ? `<button class="btn warning small" type="button" data-admin-action="restore_rsvp" data-id="${esc(id)}" data-name="${esc(nameOf(r))}"><i data-feather="rotate-ccw"></i> Restaurar</button>` : '<span class="status-badge warn">Sem ID</span>';
          return `<tr><td>${esc(dateFmt(r.timestamp))}</td><td><strong>${esc(nameOf(r))}</strong></td><td>${esc(peopleFromRsvp(r) || r.guests || '-')}</td><td>${esc(r.phone || '-')}</td><td>${esc(r.choice || 'Confirmado')}</td><td>${esc(r.message || '')}</td><td><div class="row-actions">${action}</div></td></tr>`;
        }).join('') : '<tr><td colspan="7" class="empty">Ainda não há confirmações.</td></tr>';
        $('rsvpMobile').innerHTML = list.length ? list.map(r => {
          const id = idOf(r);
          const action = id ? `<button class="btn warning small" type="button" data-admin-action="restore_rsvp" data-id="${esc(id)}" data-name="${esc(nameOf(r))}"><i data-feather="rotate-ccw"></i> Restaurar confirmação</button>` : '';
          return `<article class="mobile-card"><strong>${esc(nameOf(r))}</strong><span>${esc(peopleFromRsvp(r) || '-')} pessoa(s) · ${esc(dateFmt(r.timestamp))}</span><span class="status-badge ok">${esc(r.choice || 'Confirmado')}</span><div class="row-actions">${action}</div></article>`;
        }).join('') : '<div class="empty">Sem dados para mostrar.</div>';
      }

      function parseGiftDetails(g) {
        const raw = g && g.details;
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch (err) { return {}; }
      }

      function giftMedia(g) {
        const d = parseGiftDetails(g);
        const fileName = g.filename || g.comprovativoFile_filename || d.comprovativoFile_filename || d.filename || '';
        const mimeType = g.mimeType || d.comprovativoFile_type || d.mimeType || 'image/jpeg';
        const base64 = d.comprovativoFile || g.comprovativoFile || '';
        const dataUrl = d.dataUrl || g.dataUrl || (base64 ? `data:${mimeType};base64,${base64}` : '');
        const rawView = g.viewUrl || d.viewUrl || '';
        const rawPreview = g.previewUrl || d.previewUrl || '';
        const rawDownload = g.downloadUrl || d.downloadUrl || '';
        const fileId = g.fileId || d.fileId || driveIdFromUrl(rawView) || driveIdFromUrl(rawPreview) || driveIdFromUrl(rawDownload);
        const thumb = g.thumbnailUrl || d.thumbnailUrl || driveThumbUrl(fileId) || dataUrl || rawView || rawPreview;
        const openUrl = rawPreview || driveOpenUrl(fileId) || rawView || dataUrl || rawDownload;
        const download = rawDownload || dataUrl || rawView || openUrl;
        return { fileName, imgUrl: thumb, openUrl, download, fileId };
      }

      function giftGuestName(g) {
        const d = parseGiftDetails(g);
        const giftName = giftChosenName(g);
        const inventoryName = normalizeKey(g?.name || g?.label) === normalizeKey(giftName);
        return text(
          g?.reservedBy ||
          g?.reserved_by ||
          g?.guestName ||
          g?.convidado ||
          g?.nome ||
          (!inventoryName ? g?.name : '') ||
          d.reservedBy ||
          d.reserved_by ||
          d.guestName ||
          d.convidado ||
          d.nome ||
          'Convidado'
        );
      }

      function giftDetail(g) {
        const d = parseGiftDetails(g);
        let value = giftChosenName(g) || g.selectedGifts || g.gifts || d.selectedGifts || d.gifts || g.filename || d.comprovativoFile_filename || '';
        if (Array.isArray(value)) value = value.join(', ');
        if (typeof value === 'object' && value !== null) value = JSON.stringify(value);
        value = text(value);
        if (!value && isGiftChannel(g)) return 'Registo antigo sem item identificado';
        return value || text(g.canal) || 'Contribuição registada';
      }

      function giftPreviewMarkup(g) {
        const media = giftMedia(g);
        const detail = giftDetail(g);
        const d = parseGiftDetails(g);
        const fileLabel = media.fileName || detail;
        const imgUrl = media.imgUrl;
        const openUrl = media.openUrl || media.download || imgUrl;
        const preview = imgUrl
          ? `<button type="button" class="contribution-preview" data-preview-src="${esc(imgUrl)}" data-preview-open="${esc(openUrl)}" data-preview-title="${esc(fileLabel)}"><img class="contribution-thumb" src="${esc(imgUrl)}" alt="Comprovativo de ${esc(nameOf(g))}" loading="lazy" onerror="this.closest('.contribution-preview').classList.add('image-error')"></button>`
          : `<div class="contribution-placeholder"><i data-feather="image"></i></div>`;
        const link = openUrl
          ? `<a class="contribution-link" href="${esc(openUrl)}" target="_blank" rel="noopener"><i data-feather="external-link"></i> Abrir ficheiro</a>`
          : '';
        const conflict = Boolean(g.legacyGiftConflict || d.duplicateGift || d.duplicateGuestGift);
        const conflictText = g.legacyGiftConflictReason || d.legacyGiftConflictReason || d.alreadyReservedBy ? `Conflito: ${g.legacyGiftConflictReason || 'presente duplicado'}` : 'Conflito: presente duplicado';
        const conflictMarkup = conflict ? `<small style="color:#ffb3a7;font-weight:800">${esc(conflictText)}</small>` : '';
        return `<div class="contribution-cell">${preview}<div class="contribution-info"><strong>${esc(fileLabel)}</strong><small>${esc(detail)}</small>${conflictMarkup}${link}</div></div>`;
      }

      function giftStatusMarkup(g) {
        const d = parseGiftDetails(g);
        const conflict = Boolean(g.legacyGiftConflict || g.conflict || d.duplicateGift || d.duplicateGuestGift);
        const reason = g.legacyGiftConflictReason || g.conflictReason || d.legacyGiftConflictReason || d.alreadyReservedBy || '';
        if (conflict) return `<span class="status-badge warn">Duplicado</span>${reason ? `<small style="display:block;color:#ffb3a7;font-weight:800;margin-top:6px">${esc(reason)}</small>` : ''}`;
        return '<span class="status-badge ok">Registado</span>';
      }

      function renderGifts() {
        const list = filtered(DATA.gifts, 'giftSearch');
        $('giftBadge').textContent = `${list.length} registos`;
        $('giftRows').innerHTML = list.length ? list.map(g => {
          const giftName = giftChosenName(g) || g.giftName || g.selectedGift || g.name || '-';
          const when = g.timestamp || g.reservedAt || g.createdAt;
          return `<tr><td>${esc(dateFmt(when))}</td><td><strong>${esc(giftGuestName(g))}</strong></td><td><strong>${esc(giftName)}</strong></td><td>${giftStatusMarkup(g)}</td></tr>`;
        }).join('') : '<tr><td colspan="4" class="empty">Ainda não há presentes escolhidos.</td></tr>';
        $('giftMobile').innerHTML = list.length ? list.map(g => {
          const giftName = giftChosenName(g) || g.giftName || g.selectedGift || g.name || '-';
          const when = g.timestamp || g.reservedAt || g.createdAt;
          return `<article class="mobile-card"><strong>${esc(giftGuestName(g))}</strong><span>${esc(dateFmt(when))}</span><p style="margin:8px 0 0;font-weight:900">${esc(giftName)}</p>${giftStatusMarkup(g)}</article>`;
        }).join('') : '<div class="empty">Sem presentes escolhidos.</div>';
      }

      function renderMessages() {
        const all = filtered(DATA.messages, 'messageSearch');
        const hiddenCount = all.filter(m => m.hidden === true || String(m.status || '').toLowerCase() === 'hidden').length;
        const visibleCount = Math.max(all.length - hiddenCount, 0);
        const mode = $('messageVisibilityFilter')?.value || 'all';
        const list = all.filter(m => {
          const isHidden = m.hidden === true || String(m.status || '').toLowerCase() === 'hidden';
          if (mode === 'hidden') return isHidden;
          if (mode === 'visible') return !isHidden;
          return true;
        });
        $('messageBadge').textContent = `${visibleCount} visíveis · ${hiddenCount} ocultas`;
        $('messageRows').innerHTML = list.length ? list.map(m => {
          const id = idOf(m);
          const isHidden = m.hidden === true || String(m.status || '').toLowerCase() === 'hidden';
          const hideButton = id && !isHidden ? `<button class="btn warning small" type="button" data-admin-action="hide_message" data-id="${esc(id)}" data-name="${esc(nameOf(m))}"><i data-feather="eye-off"></i> Ocultar</button>` : '';
          const restoreButton = id && isHidden ? `<button class="btn warning small" type="button" data-admin-action="restore_message" data-id="${esc(id)}" data-name="${esc(nameOf(m))}"><i data-feather="eye"></i> Restaurar</button>` : '';
          const deleteButton = id ? `<button class="btn danger small" type="button" data-admin-action="delete_message" data-id="${esc(id)}" data-name="${esc(nameOf(m))}"><i data-feather="trash-2"></i> Eliminar</button>` : '<span class="status-badge warn">Sem ID</span>';
          return `<tr><td>${esc(dateFmt(m.timestamp))}</td><td><strong>${esc(nameOf(m))}</strong></td><td>${esc(m.message || '')}</td><td>${isHidden ? '<span class="status-badge hidden">Oculta</span>' : '<span class="status-badge blue">Visível</span>'}</td><td><div class="row-actions">${hideButton}${restoreButton}${deleteButton}</div></td></tr>`;
        }).join('') : '<tr><td colspan="5" class="empty">Ainda não há mensagens neste filtro.</td></tr>';
        $('messageMobile').innerHTML = list.length ? list.map(m => {
          const id = idOf(m);
          const isHidden = m.hidden === true || String(m.status || '').toLowerCase() === 'hidden';
          const hideButton = id && !isHidden ? `<button class="btn warning small" type="button" data-admin-action="hide_message" data-id="${esc(id)}" data-name="${esc(nameOf(m))}"><i data-feather="eye-off"></i> Ocultar</button>` : '';
          const restoreButton = id && isHidden ? `<button class="btn warning small" type="button" data-admin-action="restore_message" data-id="${esc(id)}" data-name="${esc(nameOf(m))}"><i data-feather="eye"></i> Restaurar mensagem</button>` : '';
          const deleteButton = id ? `<button class="btn danger small" type="button" data-admin-action="delete_message" data-id="${esc(id)}" data-name="${esc(nameOf(m))}"><i data-feather="trash-2"></i> Eliminar</button>` : '';
          return `<article class="mobile-card"><strong>${esc(nameOf(m))}</strong><span>${esc(dateFmt(m.timestamp))}<br>${esc(m.message || '')}</span><span class="status-badge ${isHidden ? 'hidden' : 'blue'}">${isHidden ? 'Oculta' : 'Visível'}</span><div class="row-actions">${hideButton}${restoreButton}${deleteButton}</div></article>`;
        }).join('') : '<div class="empty">Sem mensagens neste filtro.</div>';
      }

      function renderCheckins() {
        const list = filtered(DATA.checkins, 'checkinSearch');
        $('checkinBadge').textContent = `${list.length} entradas`;
        $('checkinRows').innerHTML = list.length ? list.map(c => {
          const id = idOf(c);
          const action = id ? `<button class="btn warning small" type="button" data-admin-action="restore_checkin" data-id="${esc(id)}" data-name="${esc(nameOf(c))}"><i data-feather="rotate-ccw"></i> Restaurar</button>` : '<span class="status-badge warn">Sem ID</span>';
          return `<tr><td>${esc(dateFmt(c.timestamp))}</td><td><strong>${esc(nameOf(c))}</strong></td><td>${esc(c.guests || c.maxGuests || 1)}</td><td>${esc(c.mesa || 'A definir')}</td><td>${esc(c.operator || 'Recepção')}</td><td><span class="status-badge ok">${esc(c.status || 'Confirmado')}</span></td><td><div class="row-actions">${action}</div></td></tr>`;
        }).join('') : '<tr><td colspan="7" class="empty">Ainda não há check-ins.</td></tr>';
        $('checkinMobile').innerHTML = list.length ? list.map(c => {
          const id = idOf(c);
          const action = id ? `<button class="btn warning small" type="button" data-admin-action="restore_checkin" data-id="${esc(id)}" data-name="${esc(nameOf(c))}"><i data-feather="rotate-ccw"></i> Restaurar check-in</button>` : '';
          return `<article class="mobile-card"><strong>${esc(nameOf(c))}</strong><span>${esc(c.guests || 1)} pessoa(s) · Mesa: ${esc(c.mesa || 'A definir')} · ${esc(dateFmt(c.timestamp))}</span><span class="status-badge ok">Confirmado</span><div class="row-actions">${action}</div></article>`;
        }).join('') : '<div class="empty">Sem dados para mostrar.</div>';
      }

      function renderCapsule() {
        $('capsuleBadge').textContent = `${DATA.photos.length} fotos`;
        $('capsuleGrid').innerHTML = DATA.photos.length ? DATA.photos.map(photo => {
          const src = photo.thumbnailUrl || photo.viewUrl || photo.src || '';
          const download = photo.downloadUrl || photo.viewUrl || photo.src || '#';
          return `<article class="photo-card"><img src="${esc(src)}" alt="${esc(photo.filename || 'Foto da cápsula')}"><div class="photo-meta"><strong>${esc(nameOf(photo))}</strong><span>${esc(dateFmt(photo.timestamp || photo.createdAt))}</span><a class="btn secondary small" href="${esc(download)}" target="_blank" download><i data-feather="download"></i> Baixar</a></div></article>`;
        }).join('') : '<div class="empty">Ainda não há fotografias partilhadas na cápsula.</div>';
      }

      function mobileCards(list, lineFn, badgeFn) {
        return list.length ? list.map(item => `<article class="mobile-card"><strong>${esc(nameOf(item))}</strong><span>${lineFn(item)}</span>${badgeFn ? badgeFn(item) : ''}</article>`).join('') : '<div class="empty">Sem dados para mostrar.</div>';
      }

      function exportCSV(type) {
        const map = { guests: DATA.guests, rsvps: DATA.rsvps, gifts: DATA.gifts, messages: DATA.messages, checkins: DATA.checkins, photos: DATA.photos };
        const rows = map[type] || [];
        if (!rows.length) { alert('Sem dados para exportar.'); return; }
        const keys = [...new Set(rows.flatMap(row => Object.keys(row || {})))];
        const csv = [keys.join(','), ...rows.map(row => keys.map(key => '"' + String(row[key] ?? '').replace(/"/g, '""') + '"').join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${inviteSlug() || 'convite'}-${type}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }

      init();
    })();
  