/* operator-bot.js — Assistente de gestão do evento (admin do convite)
   ------------------------------------------------------------------
   UI de chat auto-contida (IIFE, sem dependências) para o painel do cliente.
   Todas as acções passam pelo MESMO motor do Operator Bot do AdminManager,
   através das acções bot_prepare/bot_apply da rota /admin-api:
   pré-visualização antes/depois, avisos e confirmação forte (frase exacta)
   para acções sensíveis. As consultas (estado, mesa, contactos, contagens)
   são respondidas localmente a partir de get_guests.
   Não altera nenhuma função existente do painel. */
(function () {
  'use strict';

  if (window.__opbotBooted) return;
  window.__opbotBooted = true;

  var HISTORY_KEY = 'opbot_history_v1';
  var SESSION_KEY = 'opbot_session_v1';

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    mounted: false,
    open: false,
    busy: false,
    guests: null,          // caches locais (get_guests / get_messages / …)
    messages: null,
    checkins: null,
    rsvps: null,
    loading: {},           // promessas de carregamento em curso, por conjunto
    lastMessage: '',       // última mensagem do utilizador (para selecções)
    chosenIds: [],         // ids escolhidos em selecção em massa
    typingEl: null,
    pendingCard: null      // cartão de acção activo (para revalidar frase)
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function normQ(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function apiBase() {
    return String(window.LIRANDZO_API_BASE_URL || '').replace(/\/+$/, '');
  }
  function slug() { return String(window.LIRANDZO_INVITE_SLUG || '').trim(); }
  function botSession() {
    try {
      var s = sessionStorage.getItem(SESSION_KEY);
      if (!s) {
        s = 'bs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(SESSION_KEY, s);
      }
      return s;
    } catch (e) { return 'bs-ephemeral'; }
  }
  function featherRefresh() {
    try { if (window.feather && window.feather.replace) window.feather.replace(); } catch (e) {}
  }

  /* ---------- acesso à API do convite (mesmo contrato do painel) ---------- */
  /* O backend continua a ser a autoridade: /admin-api responde 401 antes de
     qualquer acção do bot. Esta guarda é só uma segunda camada local — evita
     sequer enviar pedidos sem sessão e dá uma mensagem clara ao utilizador. */
  function sessionActive() {
    try { return sessionStorage.getItem('rm_admin_logged') === '1'; } catch (e) { return false; }
  }
  function botApi(action, payload) {
    var base = apiBase();
    if (!base) return Promise.reject(new Error('API do convite não configurada.'));
    if (!sessionActive()) {
      return Promise.reject(new Error('Sessão não iniciada. Entre no painel com a senha de acesso antes de usar a assistente.'));
    }
    var token = '';
    var password = '';
    try {
      token = sessionStorage.getItem('rm_admin_token') || '';
      password = sessionStorage.getItem('rm_admin_password') || '';
    } catch (e) {}
    var headers = { 'Content-Type': 'application/json', 'X-Invite-Slug': slug() };
    if (token) headers.Authorization = 'Bearer ' + token;
    var body = Object.assign({}, payload || {}, {
      action: action,
      slug: slug(),
      password: password,
      admin_password: password,
      botSession: botSession()
    });
    return fetch(base + '/admin-api', {
      method: 'POST',
      mode: 'cors',
      headers: headers,
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = {};
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (e) { data = { status: 'error', message: raw || 'Resposta inválida do servidor.' }; }
        if (!res.ok || data.status === 'error') {
          var err = new Error(data.message || ('Erro HTTP ' + res.status));
          err.code = data.code || '';
          throw err;
        }
        return data;
      });
    });
  }

  /* ---------- cache genérico de dados do convite ----------
     além de convidados, a Lira consulta mensagens, check-ins e RSVPs.
     Cada conjunto só é carregado quando uma pergunta realmente precisa
     dele (lazy) — o arranque continua a fazer um único pedido. */
  var DATA_SETS = {
    guests: 'get_guests',
    messages: 'get_messages',
    checkins: 'get_checkins',
    rsvps: 'get_rsvps'
  };

  function loadData(key, force) {
    var action = DATA_SETS[key];
    if (!action) return Promise.reject(new Error('Conjunto de dados desconhecido: ' + key));
    if (!force && state[key]) return Promise.resolve(state[key]);
    if (!force && state.loading[key]) return state.loading[key];
    var p = botApi(action).then(function (res) {
      state[key] = (res && res.data) || [];
      return state[key];
    }).catch(function (err) {
      state[key] = null;   // não guarda falha: permite tentar de novo
      throw err;
    }).then(function (v) {
      state.loading[key] = null;
      return v;
    });
    state.loading[key] = p;
    return p;
  }

  function loadGuests(force) { return loadData('guests', force); }
  function invalidate(key) { state[key] = null; state.loading[key] = null; }

  /* ---------- histórico ---------- */
  function loadHistory() {
    try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function pushHistory(role, text) {
    try {
      var h = loadHistory();
      h.push({ role: role, text: String(text).slice(0, 500) });
      while (h.length > 40) h.shift();
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    } catch (e) {}
  }

  /* ---------- construção do DOM ---------- */
  var PANEL_HTML =
    '<button class="opbot-fab" id="opbotFab" type="button" title="Falar com a assistente de gestão" aria-label="Abrir assistente de gestão">' +
      '<i data-feather="message-circle"></i><span class="opbot-fab-dot"></span>' +
    '</button>' +
    '<section class="opbot-panel" id="opbotPanel" role="dialog" aria-label="Assistente de gestão do evento">' +
      '<header class="opbot-head">' +
        '<span class="opbot-avatar"><i data-feather="mic"></i></span>' +
        '<div class="opbot-head-txt"><strong>Lira · gestão do evento</strong><span>assistente operacional · online</span></div>' +
        '<button class="opbot-head-btn" id="opbotClear" type="button" title="Limpar conversa" aria-label="Limpar conversa"><i data-feather="trash-2"></i></button>' +
        '<button class="opbot-head-btn" id="opbotClose" type="button" title="Fechar" aria-label="Fechar"><i data-feather="x"></i></button>' +
      '</header>' +
      '<div class="opbot-body" id="opbotBody"></div>' +
      '<footer class="opbot-foot">' +
        '<div class="opbot-chips" id="opbotChips">' +
          '<button type="button" data-chip="Precisa de atenção">Precisa de atenção</button>' +
          '<button type="button" data-chip="Baixar relatório completo">Baixar relatório completo</button>' +
          '<button type="button" data-chip="Quem falta entrar">Quem falta entrar</button>' +
          '<button type="button" data-chip="Mensagens novas">Mensagens novas</button>' +
          '<button type="button" data-chip="Lista de convidados">Lista de convidados</button>' +
          '<button type="button" data-chip="Ajuda">Ajuda</button>' +
        '</div>' +
        '<form class="opbot-inputrow" id="opbotForm">' +
          '<input id="opbotInput" type="text" autocomplete="off" placeholder="Escreva um pedido…" aria-label="Mensagem para a assistente">' +
          '<button class="opbot-send" type="submit" aria-label="Enviar"><i data-feather="send"></i></button>' +
        '</form>' +
      '</footer>' +
    '</section>';

  function mount() {
    if (state.mounted) return;
    var host = document.createElement('div');
    host.id = 'opbotRoot';
    host.innerHTML = PANEL_HTML;
    document.body.appendChild(host);
    state.mounted = true;

    var fab = $('opbotFab');
    var panel = $('opbotPanel');
    var closeBtn = $('opbotClose');
    var clearBtn = $('opbotClear');
    var form = $('opbotForm');
    var input = $('opbotInput');

    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
    });
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closePanel();
    });
    clearBtn.addEventListener('click', function () {
      try { sessionStorage.removeItem(HISTORY_KEY); } catch (err) {}
      $('opbotBody').innerHTML = '';
      botSay('Conversa limpa. Em que posso ajudar?');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = String(input.value || '').trim();
      if (!text) return;
      input.value = '';
      handleUserMessage(text);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) closePanel();
    });
    document.addEventListener('click', function (e) {
      if (!state.open) return;
      var root = $('opbotRoot');
      var t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      // elemento removido pelo próprio handler (ex.: cartão de selecção) não deve fechar
      if (!document.contains(t)) return;
      // âncora de download criada pelo botão de relatório: não é "clique fora"
      if (t.hasAttribute && t.hasAttribute('data-opbot-download')) return;
      if (root && !root.contains(t)) closePanel();
    });
    Array.prototype.forEach.call($('opbotChips').querySelectorAll('[data-chip]'), function (chip) {
      chip.addEventListener('click', function () {
        var text = chip.getAttribute('data-chip');
        var inputEl = $('opbotInput');
        if (text === 'Qual o estado do convidado') {
          inputEl.value = 'Qual o estado do convidado ';
          inputEl.focus();
          return;
        }
        handleUserMessage(text);
      });
    });

    restoreHistory();
    featherRefresh();
  }

  function togglePanel() {
    if (state.open) { closePanel(); return; }
    // Rede de segurança: se por algum motivo o bot ficou montado sem sessão
    // activa, não abre e explica o que fazer. A mensagem é marcada para ser
    // removida mal a sessão exista (o login não recarrega a página).
    if (!sessionActive()) {
      state.open = true;
      $('opbotPanel').classList.add('is-open');
      $('opbotFab').classList.add('is-hidden');
      var guardBody = $('opbotBody');
      if (guardBody) guardBody.innerHTML = '';
      var guardMsg = botHtml('Preciso que entre no painel primeiro. Introduza a senha de acesso e clique em <strong>Entrar no painel</strong> — depois é só falar comigo aqui.');
      if (guardMsg) guardMsg.setAttribute('data-opbot-guard', '1');
      return;
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-opbot-guard]'), function (el) { el.remove(); });
    state.open = true;
    $('opbotPanel').classList.add('is-open');
    $('opbotFab').classList.add('is-hidden');
    var body = $('opbotBody');
    if (body && !body.children.length) botSay(welcomeText());
    var input = $('opbotInput');
    if (input) input.focus();
    scrollBottom();
  }
  function closePanel() {
    state.open = false;
    var panel = $('opbotPanel');
    var fab = $('opbotFab');
    if (panel) panel.classList.remove('is-open');
    if (fab) fab.classList.remove('is-hidden');
  }

  /* ---------- renderização ---------- */
  function scrollBottom() {
    var body = $('opbotBody');
    if (body) body.scrollTop = body.scrollHeight;
  }
  function addMsg(role, html, persistText) {
    var body = $('opbotBody');
    if (!body) return null;
    hideTyping();
    var wrap = document.createElement('div');
    wrap.className = 'opbot-msg ' + (role === 'user' ? 'opbot-user' : 'opbot-bot');
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = html;
    wrap.appendChild(bubble);
    var when = document.createElement('span');
    when.className = 'when';
    when.textContent = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    wrap.appendChild(when);
    body.appendChild(wrap);
    scrollBottom();
    featherRefresh();
    if (persistText) pushHistory(role, persistText);
    return wrap;
  }
  function userSay(text) { addMsg('user', esc(text), text); }
  function botSay(text) { return addMsg('bot', esc(text), text); }
  function botHtml(html) { return addMsg('bot', html, ''); }
  /* ---------- erros: backend desactualizado ----------
     Acções de escrita (adicionar/editar/eliminar/repor) passam pelo motor
     bot_prepare/bot_apply do servidor. Quando o servidor em uso é anterior a
     esse motor, ele responde 400 "Ação de admin não reconhecida." — a rota
     existe, a acção é que não. Detectamos esse caso específico e explicamos
     em linguagem de cliente em vez de mostrar o erro cru do backend. */
  var RX_BACKEND_OLD = /a[çc][ãa]o de admin n[ãa]o reconhecida|a[çc][ãa]o n[ãa]o reconhecida|unrecognized action|unknown action/i;
  function isBackendOutdatedError(err) {
    if (!err) return false;
    if (err.code === 'BOT_PERMISSION_DENIED') return false;   // permissões: mensagem própria do servidor
    return RX_BACKEND_OLD.test(String(err.message || ''));
  }
  function backendOutdatedHtml() {
    return '<b>Alteração não executada — servidor da API desactualizado</b>' +
      '<div><small>O backend que este painel está a usar ainda não reconhece as acções do Operator Bot ' +
      '(é uma versão anterior à deste painel). Nada foi alterado.</small></div>' +
      '<div><small><b>Continua a funcionar:</b> consultas, contagens, lista de convidados, mensagens, check-in e relatórios.</small></div>' +
      '<div><small><b>Exige o servidor actualizado:</b> adicionar, editar, mover e eliminar convidados.</small></div>' +
      '<div><small>Enquanto isso, pode eliminar/editar convidados pelo <b>Admin Manager</b> ' +
      '(Operador do Bot, ex.: "eliminar convidado Filipa no convite louren-acacio") — esse caminho já está activo.</small></div>' +
      '<div><small>Para activar aqui: publique a versão mais recente do <code>server.js</code> no backend ' +
      '(ou aponte o painel para um servidor local com essa versão).</small></div>';
  }
  function botError(err) {
    var html = isBackendOutdatedError(err)
      ? backendOutdatedHtml()
      : esc((err && err.message) ? err.message : 'Ocorreu um erro inesperado.');
    addMsg('bot', html, '');
    var last = $('opbotBody').lastElementChild;
    if (last) { var b = last.querySelector('.bubble'); if (b) b.classList.add('is-error'); }
  }
  function showTyping() {
    hideTyping();
    var body = $('opbotBody');
    if (!body) return;
    var wrap = document.createElement('div');
    wrap.className = 'opbot-msg opbot-bot';
    wrap.id = 'opbotTyping';
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<span class="opbot-typing"><i></i><i></i><i></i></span>';
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    state.typingEl = wrap;
    scrollBottom();
  }
  function hideTyping() {
    if (state.typingEl && state.typingEl.parentNode) state.typingEl.parentNode.removeChild(state.typingEl);
    state.typingEl = null;
  }

  function restoreHistory() {
    var h = loadHistory();
    h.forEach(function (m) {
      addMsg(m.role === 'user' ? 'user' : 'bot', esc(m.text), '');
    });
    if (!h.length) botSay(welcomeText());
  }

  function welcomeText() {
    return 'Olá! Sou a Lira, a assistente de gestão deste evento. Posso ajudar com:\n' +
      '· Consultar o estado de convidados ("qual o estado do João", "mesa da Ana")\n' +
      '· Contagens ("quantos confirmados", "quantas pessoas vêm ao casamento")\n' +
      '· Adicionar, inclusive vários de uma vez ("adicionar Maria, João e Ana na mesa 5")\n' +
      '· Editar ("alterar mesa do João para 8", "mudar telefone da Ana para 84…")\n' +
      '· Mover em massa ("mover todos da mesa 5 para a mesa 8")\n' +
      '· Eliminar ("eliminar convidado João" — com confirmação rigorosa)\n' +
      '· Repor acessos, RSVP ou check-in ("repor acesso do João", "repor check-in da Ana")\n' +
      '· Mensagens do mural ("mensagens novas", "ocultar mensagem do João")\n' +
      '· Check-in do evento ("quem falta entrar", "quantos já entraram")\n' +
      '· Resumo de pendências ("precisa de atenção")\n' +
      '· Relatório completo em PDF ("baixar relatório completo")\n\n' +
      'Todas as alterações mostram um resumo antes/depois e exigem confirmação.';
  }

  /* ================= motor de consultas (local) ================= */
  var ACTION_RX = /\b(adicionar|add|criar|inserir|novo|ocultar|esconder|eliminar|apagar|remover|deletar|editar|alterar|mudar|mover|corrigir|actualizar|atualizar|definir|trocar|repor|resetar|reiniciar|restaurar)\b/i;

  function guestLabel(g) {
    return g.name || g.nome || 'Convidado';
  }
  function guestTable(g) { return g.table || g.mesa || 'A definir'; }
  function guestStatus(g) { return g.status || g.guestStatus || '—'; }
  function guestMax(g) { return Number(g.maxGuests || g.maxGuestsTotal || 1) || 1; }
  function guestChecked(g) {
    if (!g.checkedIn) return 'Não';
    return g.checkedInAt ? 'Sim · ' + new Date(g.checkedInAt).toLocaleString('pt-PT') : 'Sim';
  }
  function isConfirmed(g) { return /confirm/i.test(guestStatus(g)); }
  function isDeclined(g) { return /recus|^nao$/i.test(normQ(guestStatus(g))); }

  function extractName(text) {
    var s = normQ(text);
    s = s.replace(/^(quals?|qual e o|qual o|mostrar|mostra|ver|dizer|diz|diga)\s+(o\s+|a\s+)?/, '');
    s = s.replace(/^(o\s+|a\s+)?(estado|status|situacao|dados|informacao|info|mesa|mesas|telefone|contacto|contato|token|link|qr|lugar|numero)\s+(do|da|de|dos|das)\s+/, '');
    s = s.replace(/^(do|da|de)\s+/, '');
    s = s.replace(/\b(no|na|ao|para o|para a|do|da)\s*convite\b/, ' ');
    s = s.replace(/^(convidado|convidada|pessoa)\s+/, '');
    s = s.replace(/[?.!]+$/, '').replace(/\s+/g, ' ').trim();
    return s;
  }

  function findGuest(query) {
    var q = normQ(query);
    if (!q) return { none: true };
    var guests = state.guests || [];
    var exact = guests.filter(function (g) { return normQ(guestLabel(g)) === q; });
    if (exact.length === 1) return { guest: exact[0] };
    if (exact.length > 1) return { ambiguous: exact };
    var partial = guests.filter(function (g) {
      var n = normQ(guestLabel(g));
      return n.indexOf(q) !== -1 || q.indexOf(n) !== -1;
    });
    if (partial.length === 1) return { guest: partial[0] };
    if (partial.length > 1) return { ambiguous: partial };
    return { none: true, query: query };
  }

  function guestCardHtml(g) {
    return '<div class="opbot-card"><div class="opbot-card-head"><i data-feather="user"></i>' + esc(guestLabel(g)) + '</div>' +
      '<div class="opbot-card-body">' +
      '<div class="opbot-row"><span class="k">Estado</span><span class="v">' + esc(guestStatus(g)) + '</span></div>' +
      '<div class="opbot-row"><span class="k">Mesa</span><span class="v">' + esc(guestTable(g)) + '</span></div>' +
      '<div class="opbot-row"><span class="k">Categoria</span><span class="v">' + esc(g.category || '—') + '</span></div>' +
      '<div class="opbot-row"><span class="k">Acompanhantes</span><span class="v">' + esc(guestMax(g)) + ' lugar(es) no total</span></div>' +
      '<div class="opbot-row"><span class="k">Telefone</span><span class="v">' + esc(g.phone || '—') + '</span></div>' +
      '<div class="opbot-row"><span class="k">Check-in</span><span class="v">' + esc(guestChecked(g)) + '</span></div>' +
      (g.token ? '<div class="opbot-row"><span class="k">Token</span><span class="v"><small>' + esc(g.token) + '</small></span></div>' : '') +
      (g.notes ? '<div class="opbot-row"><span class="k">Notas</span><span class="v"><small>' + esc(g.notes) + '</small></span></div>' : '') +
      '</div></div>';
  }

  function countsHtml() {
    var guests = state.guests || [];
    var confirmed = guests.filter(isConfirmed).length;
    var declined = guests.filter(isDeclined).length;
    var checked = guests.filter(function (g) { return g.checkedIn; }).length;
    var pending = guests.length - confirmed - declined;
    if (pending < 0) pending = 0;
    return '<div class="opbot-card"><div class="opbot-card-head"><i data-feather="pie-chart"></i>Resumo do evento</div>' +
      '<div class="opbot-card-body">' +
      '<div class="opbot-row"><span class="k">Total</span><span class="v">' + guests.length + ' convidado(s)</span></div>' +
      '<div class="opbot-row"><span class="k">Confirmados</span><span class="v">' + confirmed + '</span></div>' +
      '<div class="opbot-row"><span class="k">Pendentes</span><span class="v">' + pending + '</span></div>' +
      '<div class="opbot-row"><span class="k">Recusados</span><span class="v">' + declined + '</span></div>' +
      '<div class="opbot-row"><span class="k">Check-in</span><span class="v">' + checked + ' presentes</span></div>' +
      '</div></div>';
  }

  function listHtml() {
    var guests = state.guests || [];
    var shown = guests.slice(0, 12);
    var rows = shown.map(function (g) {
      return '<div class="opbot-row"><span class="k">' + esc(g.number || '·') + '</span><span class="v">' + esc(guestLabel(g)) +
        ' <small>· mesa ' + esc(guestTable(g)) + ' · ' + esc(guestStatus(g)) + (g.checkedIn ? ' · check-in' : '') + '</small></span></div>';
    }).join('');
    var more = guests.length > shown.length ? '<div class="opbot-row"><span class="k"></span><span class="v"><small>… e mais ' + (guests.length - shown.length) + ' convidado(s).</small></span></div>' : '';
    return '<div class="opbot-card"><div class="opbot-card-head"><i data-feather="users"></i>Convidados (' + guests.length + ')</div>' +
      '<div class="opbot-card-body">' + rows + more + '</div></div>';
  }

  function candidateButtons(cands, actionLabel, onPick) {
    var box = document.createElement('div');
    box.className = 'opbot-cands';
    cands.forEach(function (g) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opbot-cand';
      btn.innerHTML = '<i data-feather="user"></i><span>' + esc(guestLabel(g)) + '<small>mesa ' + esc(guestTable(g)) + ' · nº ' + esc(g.number || '·') + ' · ' + esc(guestStatus(g)) + '</small></span>';
      btn.addEventListener('click', function () { onPick(g); });
      box.appendChild(btn);
    });
    return box;
  }

  /* ---------- detectores de intenção (consultas novas) ---------- */
  var RX_ATTENTION = /\b(atencao|pendencia|resumo|revisao|problema|cuidado|urgente|relatorio)\b/;
  var RX_MESSAGE = /\b(mensagem|mensagens|recado|recados|mural)\b/;
  var RX_CHECKIN = /\b(check ?-?in|checkin|entrada|entrar|entraram|entrou)\b/;
  var RX_LISTISH = /\b(quem|lista|listar|mostrar|ver|falta|faltam|pendente|ainda nao)\b/;
  var RX_RSVP = /\b(rsvp|previsao|quantas pessoas|quanto publico|recus|nao abriu|sem resposta|vao vir|vem ao)\b/;

  function isNewMessage(m) { return !m.hidden; }
  function msgAuthor(m) { return m.nome || m.name || 'Convidado'; }
  function fmtDate(v) {
    if (!v) return '';
    try { return new Date(v).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  /* Autor de uma mensagem: "ocultar mensagem do João" -> "joao".
     Diferente do extractName (feito para convidados), que devolveria a frase
     inteira nestes comandos. Mantém "de/do/da" dentro do nome (ex.: João de
     Almeida) removendo apenas as partículas iniciais. */
  function extractMessageAuthor(text) {
    var s = normQ(text);
    s = s.replace(/\b(ocultar|esconder|eliminar|apagar|remover|deletar|restaurar|repor|resetar|reiniciar|mensagem|mensagens|recado|recados|mural|nova|novas|novo|novos)\b/g, ' ');
    s = s.replace(/^\s*(o|a|do|da|de|dos|das)\s+/, ' ');
    s = s.replace(/[?.!,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  var RX_REPORT = /\b(relatorio|relatório|exportar|exporta|baixar|descarregar|download|csv|excel|planilha|pdf)\b/;

  function answerQuery(text) {
    var q = normQ(text);

    if (/^(ajuda|ola|oi|bom dia|boa tarde|boa noite)\b/.test(q) || q.indexOf('ajuda') !== -1 || q.indexOf('o que podes') !== -1 || q.indexOf('como funciona') !== -1) {
      botSay(welcomeText());
      return;
    }

    /* ---- relatório completo (download directo) ---- */
    if (RX_REPORT.test(q) && !RX_MESSAGE.test(q)) {
      withGuests(function () {
        var kind = 'guests';
        var el = botHtml('<div class="bubble"><b>Relatório completo</b>' +
          '<div><small>Convite: ' + esc(coupleNames()) + ' · ' + (state.guests || []).length + ' convidados.</small></div>' +
          '<div><small>O PDF traz o resumo do evento, todas as categorias de pendência com os nomes completos e o detalhe de cada convidado.</small></div>' +
          '<div class="opbot-report"></div></div>');
        attachReport(el, kind);
      });
      return;
    }
    if (RX_REPORT.test(q) && RX_MESSAGE.test(q)) {
      withData('messages', function () {
        var el = botHtml('<div class="bubble"><b>Relatório de mensagens</b>' +
          '<div><small>Todas as mensagens do mural, com autor, data, estado e texto.</small></div>' +
          '<div class="opbot-report"></div></div>');
        attachReport(el, 'messages', 'Baixar relatório de mensagens (.pdf)');
      });
      return;
    }

    /* ---- resumo "precisa de atenção" (análise local sobre convidados) ---- */
    if (RX_ATTENTION.test(q)) {
      withGuests(function () {
        var el = botHtml(attentionHtml(state.guests || []));
        attachReport(el, 'guests');
      });
      return;
    }

    /* ---- mensagens do mural ---- */
    if (RX_MESSAGE.test(q)) {
      withData('messages', function () {
        var all = state.messages || [];
        var visible = all.filter(isNewMessage);
        var hidden = all.length - visible.length;
        var onlyHidden = /\b(ocult|escondid|apagad|removid)/.test(q);
        var list = onlyHidden ? all.filter(function (m) { return !isNewMessage(m); }) : visible;
        var limit = 5;
        var head = onlyHidden
          ? 'Mensagens ocultadas: <b>' + hidden + '</b>'
          : 'Mensagens no mural: <b>' + visible.length + '</b>' + (hidden ? ' <small>· ' + hidden + ' ocultada(s)</small>' : '');
        if (!list.length) {
          botHtml('<div class="bubble">' + head + '<div><small>' + (onlyHidden ? 'Nenhuma mensagem ocultada.' : 'Nenhuma mensagem recebida ainda.') + '</small></div></div>');
          return;
        }
        var recent = list.slice(-limit).reverse();
        var extraMsgs = list.length - recent.length;
        var rows = recent.map(function (m) {
          return '<div class="opbot-msgrow"><b>' + esc(msgAuthor(m)) + '</b> <small>' + esc(fmtDate(m.timestamp)) + '</small>' +
            '<div>' + esc(String(m.message || '').slice(0, 160)) + (String(m.message || '').length > 160 ? '…' : '') + '</div></div>';
        }).join('');
        var el = botHtml('<div class="bubble">' + head + rows +
          (extraMsgs > 0 ? '<div><small>… e mais <b>' + extraMsgs + '</b> mensagem(ns).</small></div>' : '') +
          '<div><small>Para gerir uma mensagem: "ocultar mensagem do ' + esc(msgAuthor(recent[0])) + '".</small></div>' +
          '<div class="opbot-report"></div></div>');
        attachReport(el, 'messages', 'Baixar relatório de mensagens (.pdf)');
      });
      return;
    }

    /* ---- check-in: quem entrou / quem falta ---- */
    if (RX_CHECKIN.test(q) && RX_LISTISH.test(q)) {
      withAll(['checkins', 'guests'], function () {
        var list = state.guests || [];
        var checkins = state.checkins || [];
        var doneIds = {};
        var enteredCount = 0;
        var enteredPeople = 0;
        checkins.forEach(function (c) {
          if (c.guestId) doneIds[String(c.guestId)] = c;
          if (!c.status || c.status === 'checked-in' || c.status === 'checkedin') {
            enteredCount += 1;
            enteredPeople += Number(c.guests) || 1;
          }
        });
        var pending = list.filter(function (g) { return !doneIds[String(g.id)]; });
        var wantsPending = /\b(falta|faltam|pendente|ainda nao|sem)\b/.test(q);
        var sample = 6;
        var shown = pending.slice(0, sample);
        var extraCi = pending.length - shown.length;
        var html = '<div class="bubble">Já entraram: <b>' + enteredCount + '</b> convidado(s) · <b>' + enteredPeople + '</b> pessoa(s) no total' +
          '<div><small>Faltam entrar: <b>' + pending.length + '</b> de ' + list.length + ' convidados.</small></div>';
        if (pending.length) {
          html += '<div><small>' + (wantsPending ? 'Ainda sem check-in:' : 'Sem check-in (para a entrada):') + '</small></div>' +
            shown.map(function (g) {
              return '<div class="opbot-msgrow"><b>' + esc(guestLabel(g)) + '</b> · mesa ' + esc(guestTable(g)) + ' <small>· ' + esc(guestMax(g)) + ' lugar(es)</small></div>';
            }).join('') + (extraCi > 0 ? '<div><small>… e mais <b>' + extraCi + '</b> convidado(s).</small></div>' : '');
        } else {
          html += '<div><small>Todos os convidados já fizeram check-in.</small></div>';
        }
        var el = botHtml(html + '<div class="opbot-report"></div></div>');
        attachReport(el, 'guests');
      });
      return;
    }

    /* ---- RSVP e previsão de público ---- */
    if (RX_RSVP.test(q)) {
      withGuests(function () {
        var guests = state.guests || [];
        var confirmed = guests.filter(isConfirmed);
        var declined = guests.filter(isDeclined);
        var pending = Math.max(0, guests.length - confirmed.length - declined.length);
        var totalPeople = confirmed.reduce(function (s, g) { return s + guestMax(g); }, 0);
        var sample = 6;
        var html = '<div class="bubble">Previsão de público: <b>' + totalPeople + '</b> pessoa(s) confirmadas' +
          '<div><small>Confirmados: <b>' + confirmed.length + '</b> · Pendentes: <b>' + pending + '</b> · Recusados: <b>' + declined.length + '</b></small></div>';
        if (/\b(recus|nao vem|quem recusou)/.test(q)) {
          var decShown = declined.slice(0, sample);
          html += '<div><small>Recusaram:</small></div>' + (declined.length
            ? decShown.map(function (g) { return '<div class="opbot-msgrow"><b>' + esc(guestLabel(g)) + '</b> <small>· mesa ' + esc(guestTable(g)) + '</small></div>'; }).join('') +
              (declined.length > decShown.length ? '<div><small>… e mais <b>' + (declined.length - decShown.length) + '</b>.</small></div>' : '')
            : '<div><small>Nenhum convidado recusou.</small></div>');
        }
        if (/\b(nao abriu|sem resposta|pendente)/.test(q)) {
          var pend = guests.filter(function (g) { return !isConfirmed(g) && !isDeclined(g); });
          var penShown = pend.slice(0, sample);
          html += '<div><small>Ainda sem resposta:</small></div>' + (pend.length
            ? penShown.map(function (g) { return '<div class="opbot-msgrow"><b>' + esc(guestLabel(g)) + '</b> <small>· mesa ' + esc(guestTable(g)) + '</small></div>'; }).join('') +
              (pend.length > penShown.length ? '<div><small>… e mais <b>' + (pend.length - penShown.length) + '</b>.</small></div>' : '')
            : '<div><small>Todos já responderam.</small></div>');
        }
        var el = botHtml(html + '<div class="opbot-report"></div></div>');
        attachReport(el, 'guests');
      });
      return;
    }

    var wantsList = /\b(lista|listar|mostrar|ver|quem)\b/.test(q) && /\bconvidado/.test(q);
    if (wantsList) { withGuests(function () { botHtml(listHtml()); }); return; }

    if (/\b(quantos|quantas|numero de|total)\b/.test(q)) {
      withGuests(function () {
        var guests = state.guests || [];
        var confirmed = guests.filter(isConfirmed).length;
        var declined = guests.filter(isDeclined).length;
        var checked = guests.filter(function (g) { return g.checkedIn; }).length;
        var pending = Math.max(0, guests.length - confirmed - declined);
        var parts = [];
        if (/\bconfirm/.test(q)) parts.push('Confirmados: <b>' + confirmed + '</b>');
        if (/\b(check ?-?in|presentes|entraram)\b/.test(q)) parts.push('Fizeram check-in: <b>' + checked + '</b>');
        if (/\b(pendente|aberto|falta)/.test(q)) parts.push('Pendentes: <b>' + pending + '</b>');
        if (/\brecus/.test(q)) parts.push('Recusados: <b>' + declined + '</b>');
        if (!parts.length) { botHtml(countsHtml()); return; }
        botHtml('<div class="bubble">' + parts.join(' · ') + ' <small>(de ' + guests.length + ' convidados)</small></div>');
      });
      return;
    }

    var name = extractName(text);
    if (!name) { botSay('Não percebi o pedido. Tente "qual o estado do João", "quantos confirmados", "lista de convidados" ou "ajuda".'); return; }

    withGuests(function () {
      var found = findGuest(name);
      if (found.none) {
        botSay('Não encontrei nenhum convidado como "' + name + '" neste convite. Verifique o nome ou peça a "lista de convidados".');
        return;
      }
      if (found.ambiguous) {
        botSay('Encontrei vários convidados parecidos. Qual deles?');
        addMsg('bot', '<span style="display:block"></span>', '');
        var body = $('opbotBody');
        var holder = document.createElement('div');
        holder.className = 'opbot-msg opbot-bot';
        holder.appendChild(candidateButtons(found.ambiguous, '', function (g) {
          holder.remove();
          botHtml(guestCardHtml(g));
        }));
        body.appendChild(holder);
        featherRefresh();
        scrollBottom();
        return;
      }
      var g = found.guest;
      var q2 = normQ(text);
      if (/\b(mesa)\b/.test(q2) && /\b(mesa)\b/.test(q2) && !/\b(estado|status|dados|informacao)\b/.test(q2)) {
        botSay('A mesa de ' + guestLabel(g) + ' é <b>' + esc(guestTable(g)) + '</b>.');
        return;
      }
      if (/\b(telefone|contacto|contato|whatsapp)\b/.test(q2)) {
        botSay('O telefone de ' + guestLabel(g) + ' é <b>' + esc(g.phone || 'não registado') + '</b>.');
        return;
      }
      if (/\b(token|link|qr)\b/.test(q2)) {
        botSay(g.token ? ('O token de acesso de ' + guestLabel(g) + ' é <b>' + esc(g.token) + '</b>.') : (guestLabel(g) + ' ainda não tem token de acesso.'));
        return;
      }
      if (/\b(check ?-?in|entrada|presente)\b/.test(q2)) {
        botSay(guestLabel(g) + ' · check-in: <b>' + esc(guestChecked(g)) + '</b>.');
        return;
      }
      botHtml(guestCardHtml(g));
    });
  }

  function withData(key, fn) {
    var run = function () { try { fn(); } catch (e) { botError(e); } };
    if (state[key]) { run(); return; }
    showTyping();
    loadData(key).then(run).catch(function (err) {
      hideTyping();
      botError(err);
    });
  }

  function withGuests(fn) { withData('guests', fn); }

  /* Garante vários conjuntos antes de responder (ex.: check-ins + convidados). */
  function withAll(keys, fn) {
    var run = function () { try { fn(); } catch (e) { botError(e); } };
    var missing = keys.filter(function (k) { return !state[k]; });
    if (!missing.length) { run(); return; }
    showTyping();
    Promise.all(missing.map(function (k) { return loadData(k); })).then(function () {
      hideTyping();
      run();
    }).catch(function (err) {
      hideTyping();
      botError(err);
    });
  }

  /* ================= relatórios completos (download) =================
     As listas no chat mostram só uma amostra, para não alongar a conversa.
     Por baixo fica um botão que gera um PDF pronto a imprimir/arquivar, com
     todas as categorias de pendência e o detalhe de cada convidado. Se o
     jsPDF não estiver disponível (offline, bloqueio de rede), o botão cai
     automaticamente para CSV — o relatório nunca deixa de sair. */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function csvRow(cells) { return cells.map(csvCell).join(';'); }

  /* Descarga genérica: aceita Blob (PDF) ou texto (CSV).
     A âncora é montada DENTRO do painel e marcada com data-opbot-download,
     que o detector de "clique fora" ignora — senão o chat fechava sempre
     que o utilizador pedia um relatório. */
  function triggerDownload(name, data, mime) {
    try {
      var blob = data instanceof Blob
        ? data
        : // BOM (\uFEFF) para o Excel reconhecer os acentos em português.
          new Blob(['\uFEFF' + String(data)], { type: mime || 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.setAttribute('data-opbot-download', '1');
      a.style.position = 'fixed';
      a.style.left = '-9999px';
      var host = $('opbotRoot') || document.body;
      host.appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        try { URL.revokeObjectURL(url); } catch (e) {}
      }, 800);
      return true;
    } catch (e) { return false; }
  }
  function downloadTextFile(name, text, mime) { return triggerDownload(name, text, mime); }

  /* Pendências de um convidado (usado no chat e no relatório). */
  function guestIssues(g) {
    var issues = [];
    if (!guestTable(g) || guestTable(g) === 'A definir') issues.push('sem mesa');
    if (!g.phone) issues.push('sem telefone');
    if (!g.token && !g.inviteToken) issues.push('sem token de acesso');
    if (!isConfirmed(g) && !isDeclined(g)) issues.push('sem resposta ao convite');
    if (isDeclined(g)) issues.push('recusou o convite');
    if (!g.checkedIn) issues.push('sem check-in');
    return issues;
  }

  function guestIssueGroups(guests) {
    return [
      { label: 'Sem mesa atribuída', items: guests.filter(function (g) { return !guestTable(g) || guestTable(g) === 'A definir'; }) },
      { label: 'Sem telefone', items: guests.filter(function (g) { return !g.phone; }) },
      { label: 'Sem token de acesso', items: guests.filter(function (g) { return !g.token && !g.inviteToken; }) },
      { label: 'Sem resposta ao convite', items: guests.filter(function (g) { return !isConfirmed(g) && !isDeclined(g); }) },
      { label: 'Recusaram o convite', items: guests.filter(isDeclined) },
      { label: 'Sem check-in', items: guests.filter(function (g) { return !g.checkedIn; }) }
    ];
  }

  function reportStamp() {
    try { return new Date().toLocaleString('pt-PT'); } catch (e) { return ''; }
  }

  /* ---------- motor do PDF (jsPDF carregado a pedido) ----------
     O PDF é o formato principal do relatório: fica formatado, imprime bem e
     abre em qualquer telemóvel. A biblioteca (365 KB) só é carregada na
     primeira vez que o utilizador pede um relatório, para o painel continuar
     leve. Se o carregamento falhar (offline, bloqueio de rede), o botão cai
     automaticamente para CSV. */
  var PDF_INK = [35, 38, 46];         // #23262e
  var PDF_MUTED = [122, 127, 138];
  var PDF_ACCENT = [176, 141, 87];    // dourado discreto
  var PDF_LINE = [226, 222, 215];
  var PDF_ZEBRA = [247, 245, 242];
  var PDF_WHITE = [255, 255, 255];
  var PDF_LIGHT = [186, 191, 201];
  var PDF_GOLD = [214, 190, 148];

  var jspdfPromise = null;

  function jspdfCtor() {
    var j = window.jspdf || {};
    return j.jsPDF || window.jsPDF || null;
  }
  /* Candidatos de caminho: resolvido a partir do próprio operator-bot.js,
     para funcionar quer o admin.html esteja em /convite/<slug>/ quer noutro
     nível de profundidade. */
  function jspdfPaths() {
    var out = [];
    try {
      var s = document.querySelector('script[src*="operator-bot.js"]');
      if (s && s.src) out.push(new URL('../assets/js/jspdf.umd.min.js', s.src).href);
    } catch (e) {}
    out.push('../assets/js/jspdf.umd.min.js');
    out.push('/convite/assets/js/jspdf.umd.min.js');
    return out;
  }
  function loadJsPdf() {
    var ready = jspdfCtor();
    if (ready) return Promise.resolve(ready);
    if (jspdfPromise) return jspdfPromise;
    jspdfPromise = new Promise(function (resolve) {
      var paths = jspdfPaths();
      var i = 0;
      function next() {
        if (i >= paths.length) { jspdfPromise = null; resolve(null); return; }
        var s = document.createElement('script');
        s.src = paths[i++];
        s.async = true;
        s.onload = function () { var c = jspdfCtor(); if (c) resolve(c); else next(); };
        s.onerror = function () { if (s.parentNode) s.parentNode.removeChild(s); next(); };
        (document.head || document.documentElement).appendChild(s);
      }
      next();
    });
    return jspdfPromise;
  }

  function pdfFill(doc, c) { doc.setFillColor(c[0], c[1], c[2]); }
  function pdfText(doc, c) { doc.setTextColor(c[0], c[1], c[2]); }
  function pdfStroke(doc, c) { doc.setDrawColor(c[0], c[1], c[2]); }
  function pdfSize(doc) {
    var ps = doc.internal && doc.internal.pageSize;
    var w = ps ? (typeof ps.getWidth === 'function' ? ps.getWidth() : ps.width) : 210;
    var h = ps ? (typeof ps.getHeight === 'function' ? ps.getHeight() : ps.height) : 297;
    return { w: w || 210, h: h || 297 };
  }

  /* A fonte padrão do jsPDF (Helvetica/WinAnsi) cobre os acentos portugueses,
     mas não setas nem símbolos matemáticos — trocamos por equivalentes para
     não sair lixo no PDF. */
  function pdfSafe(v) {
    return String(v == null ? '' : v)
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2192\u27a1]/g, '->')
      .replace(/\u21d2/g, '=>')
      .replace(/\u2265/g, '>=')
      .replace(/\u2264/g, '<=')
      .replace(/\u2260/g, '!=')
      .replace(/[\u2018\u2019\u201b]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[\u2022\u25cf\u00b7]/g, '-')
      .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Parte um texto em linhas que cabem na largura dada (já com a fonte posta). */
  function pdfLines(doc, text, width, size, style) {
    doc.setFont('helvetica', style || 'normal');
    doc.setFontSize(size || 7.5);
    var t = pdfSafe(text);
    if (!t) return [''];
    try {
      var lines = doc.splitTextToSize(t, width);
      return (lines && lines.length) ? lines : [t];
    } catch (e) { return [t]; }
  }
  function pdfDrawLines(doc, lines, x, y, lh, color, size, style) {
    doc.setFont('helvetica', style || 'normal');
    if (size) doc.setFontSize(size);
    pdfText(doc, color || PDF_INK);
    for (var i = 0; i < lines.length; i++) doc.text(lines[i], x, y + i * lh);
  }

  /* Faixa de topo com o nome do casal e a origem do relatório. */
  function pdfBand(doc, title, stamp) {
    var s = pdfSize(doc);
    var h = 36;
    pdfFill(doc, PDF_INK);
    doc.rect(0, 0, s.w, h, 'F');
    pdfFill(doc, PDF_ACCENT);
    doc.rect(0, h, s.w, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    pdfText(doc, PDF_GOLD);
    doc.text('R E L A T \u00d3 R I O   D O   E V E N T O', 14, 11);
    doc.setFontSize(19);
    pdfText(doc, PDF_WHITE);
    doc.text(pdfSafe(title), 14, 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    pdfText(doc, PDF_LIGHT);
    doc.text('Assistente Lira - painel administrativo do convite', 14, 29.5);
    doc.setFontSize(7.5);
    pdfText(doc, PDF_MUTED);
    doc.text('Gerado em ' + pdfSafe(stamp), 14, 33.5);
  }

  function pdfFooter(doc, page) {
    var s = pdfSize(doc);
    doc.setLineWidth(0.2);
    pdfStroke(doc, PDF_LINE);
    doc.line(14, s.h - 12, s.w - 14, s.h - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    pdfText(doc, PDF_MUTED);
    doc.text('Lira - gest\u00e3o do evento - ' + pdfSafe(slug()), 14, s.h - 7);
    var label = 'P\u00e1gina ' + page;
    doc.text(label, s.w - 14 - doc.getTextWidth(label), s.h - 7);
  }

  /* Título de secção com filete; devolve o Y logo abaixo do filete. */
  function pdfSection(doc, x, y, w, title, note) {
    var t = pdfSafe(title).toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    pdfText(doc, PDF_INK);
    doc.text(t, x, y);
    // A largura tem de ser medida ANTES de trocar de fonte (senão a nota
    // encosta ao título, porque mediria o texto já a 8pt).
    var tw = doc.getTextWidth(t);
    if (note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      pdfText(doc, PDF_MUTED);
      doc.text(pdfSafe(note), x + tw + 4, y);
    }
    doc.setLineWidth(0.2);
    pdfStroke(doc, PDF_LINE);
    doc.line(x, y + 2.4, x + w, y + 2.4);
    doc.setLineWidth(0.7);
    pdfStroke(doc, PDF_ACCENT);
    doc.line(x, y + 2.4, x + 20, y + 2.4);
    return y + 2.4;
  }

  /* Grelha de indicadores (2 colunas), devolve o Y abaixo da grelha. */
  function pdfStatCards(doc, x, y, w, stats) {
    var cols = 2, gap = 4;
    var cw = (w - gap) / cols, ch = 16.5;
    stats.forEach(function (st, i) {
      var cx = x + (i % cols) * (cw + gap);
      var cy = y + Math.floor(i / cols) * (ch + gap);
      pdfFill(doc, PDF_ZEBRA);
      pdfStroke(doc, PDF_LINE);
      doc.setLineWidth(0.2);
      doc.rect(cx, cy, cw, ch, 'FD');
      pdfFill(doc, PDF_ACCENT);
      doc.rect(cx, cy, 1.2, ch, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      pdfText(doc, PDF_MUTED);
      doc.text(pdfSafe(st.label).toUpperCase(), cx + 4, cy + 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      pdfText(doc, PDF_INK);
      doc.text(pdfSafe(String(st.value)), cx + 4, cy + 12.6);
    });
    var rows = Math.ceil(stats.length / cols);
    return y + rows * ch + (rows - 1) * gap;
  }

  /* Relatório completo de convidados: resumo + pendências por categoria +
     detalhe de todos os registos (coluna "Pendências" permite filtrar). */
  function buildGuestReportCsv() {
    var guests = state.guests || [];
    var confirmed = guests.filter(isConfirmed);
    var declined = guests.filter(isDeclined);
    var pending = guests.filter(function (g) { return !isConfirmed(g) && !isDeclined(g); });
    var checked = guests.filter(function (g) { return g.checkedIn; });
    var people = confirmed.reduce(function (s, g) { return s + guestMax(g); }, 0);

    var lines = [];
    lines.push(csvRow(['Relatório do convite', coupleNames()]));
    lines.push(csvRow(['Gerado em', reportStamp()]));
    lines.push(csvRow(['Origem', 'Assistente Lira · painel administrativo']));
    lines.push('');
    lines.push(csvRow(['RESUMO']));
    lines.push(csvRow(['Convidados', guests.length]));
    lines.push(csvRow(['Confirmados', confirmed.length]));
    lines.push(csvRow(['Sem resposta', pending.length]));
    lines.push(csvRow(['Recusaram', declined.length]));
    lines.push(csvRow(['Pessoas previstas (confirmados + acompanhantes)', people]));
    lines.push(csvRow(['Check-in efectuados', checked.length]));
    lines.push(csvRow(['Check-ins em falta', guests.length - checked.length]));
    lines.push('');
    lines.push(csvRow(['PENDÊNCIAS POR CATEGORIA']));
    lines.push(csvRow(['Categoria', 'Total', 'Convidados']));
    guestIssueGroups(guests).forEach(function (gr) {
      lines.push(csvRow([gr.label, gr.items.length, gr.items.map(guestLabel).join(', ')]));
    });
    lines.push('');
    lines.push(csvRow(['DETALHE DE TODOS OS CONVIDADOS']));
    lines.push(csvRow(['Número', 'Nome', 'Mesa', 'Telefone', 'Categoria', 'Estado RSVP', 'Check-in', 'Lugares', 'Token', 'Pendências']));
    guests.forEach(function (g) {
      lines.push(csvRow([
        g.number || '', guestLabel(g), guestTable(g), g.phone || '', g.category || '',
        guestStatus(g), g.checkedIn ? 'sim' : 'não', guestMax(g),
        g.token || g.inviteToken || '', guestIssues(g).join(', ')
      ]));
    });
    return lines.join('\r\n');
  }

  /* Relatório de mensagens do mural. */
  function buildMessagesReportCsv() {
    var all = state.messages || [];
    var lines = [];
    lines.push(csvRow(['Relatório de mensagens', coupleNames()]));
    lines.push(csvRow(['Gerado em', reportStamp()]));
    lines.push(csvRow(['Total', all.length, 'Visíveis', all.filter(isNewMessage).length, 'Ocultadas', all.length - all.filter(isNewMessage).length]));
    lines.push('');
    lines.push(csvRow(['Autor', 'Data', 'Estado', 'Mensagem']));
    all.slice().reverse().forEach(function (m) {
      lines.push(csvRow([msgAuthor(m), fmtDate(m.timestamp), m.hidden ? 'ocultada' : 'visível', m.message || '']));
    });
    return lines.join('\r\n');
  }

  /* Tabela com cabeçalho repetido, zebra e quebra de página automática.
     Devolve o Y final e a página actual (para o rodapé seguinte). */
  function pdfTable(doc, opts) {
    var s = pdfSize(doc);
    var lh = 3.3, pad = 1.5;
    var x0 = opts.x, w = opts.w, cols = opts.cols;
    var page = opts.page;
    var y = opts.y;

    function head() {
      var h = 7.5;
      pdfFill(doc, PDF_INK);
      doc.rect(x0, y, w, h, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      pdfText(doc, PDF_WHITE);
      var cx = x0;
      cols.forEach(function (c) {
        var tw = doc.getTextWidth(c.label);
        var tx = c.align === 'center' ? cx + (c.w - tw) / 2 : cx + pad;
        doc.text(c.label, tx, y + h / 2 + 1.3);
        cx += c.w;
      });
      y += h;
    }
    head();

    opts.rows.forEach(function (cells, idx) {
      var lines = cells.map(function (t, i) { return pdfLines(doc, t, cols[i].w - pad * 2, 7.5); });
      var n = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
      var rh = n * lh + 2.4;
      if (y + rh > s.h - 16) {
        pdfFooter(doc, page);
        doc.addPage('a4', opts.orientation || 'landscape');
        page += 1;
        y = 20;
        head();
      }
      if (idx % 2 === 1) { pdfFill(doc, PDF_ZEBRA); doc.rect(x0, y, w, rh, 'F'); }
      doc.setLineWidth(0.15);
      pdfStroke(doc, PDF_LINE);
      doc.line(x0, y + rh, x0 + w, y + rh);
      var cx = x0;
      lines.forEach(function (ls, i) {
        var col = cols[i];
        doc.setFont('helvetica', col.style || 'normal');
        doc.setFontSize(7.5);
        pdfText(doc, col.color || PDF_INK);
        ls.forEach(function (ln, k) {
          var tw = doc.getTextWidth(ln);
          var tx = col.align === 'center' ? cx + (col.w - tw) / 2 : cx + pad;
          doc.text(ln, tx, y + 4 + k * lh);
        });
        cx += col.w;
      });
      y += rh;
    });
    return { y: y, page: page };
  }

  /* Colunas da tabela de detalhe: a última absorve a largura restante. */
  function pdfFitLast(cols, total) {
    var fixed = cols.reduce(function (n, c) { return n + c.w; }, 0);
    cols[cols.length - 1].w = Math.max(total - fixed, 40);
    return cols;
  }

  /* Relatório de convidados em PDF: capa com resumo, pendências por categoria
     (todos os nomes, sem amostra) e o detalhe completo em paisagem. */
  function buildGuestReportPdf(JsPDF) {
    var guests = state.guests || [];
    var confirmed = guests.filter(isConfirmed);
    var declined = guests.filter(isDeclined);
    var pending = guests.filter(function (g) { return !isConfirmed(g) && !isDeclined(g); });
    var checked = guests.filter(function (g) { return g.checkedIn; });
    var people = confirmed.reduce(function (n, g) { return n + guestMax(g); }, 0);

    var doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    var page = 1;
    pdfBand(doc, coupleNames(), reportStamp());

    var s = pdfSize(doc);
    var x = 14, w = s.w - 28;
    var y = pdfSection(doc, x, 50, w, 'Resumo', guests.length + ' convidados registados') + 7;

    y = pdfStatCards(doc, x, y, w, [
      { label: 'Convidados', value: guests.length },
      { label: 'Confirmados', value: confirmed.length },
      { label: 'Sem resposta', value: pending.length },
      { label: 'Recusaram', value: declined.length },
      { label: 'Pessoas previstas', value: people },
      { label: 'Check-in efectuado', value: checked.length },
      { label: 'Check-in em falta', value: guests.length - checked.length },
      { label: 'Acompanhantes', value: Math.max(people - confirmed.length, 0) }
    ]) + 13;

    y = pdfSection(doc, x, y, w, 'Pend\u00eancias por categoria', 'todos os nomes, sem amostra') + 7;
    guestIssueGroups(guests).forEach(function (gr) {
      var leftW = 50;
      var rightW = w - leftW - 4;
      var names = gr.items.length ? gr.items.map(guestLabel).join(', ') : 'Nenhum registo nesta categoria.';
      var lines = pdfLines(doc, names, rightW, 7.5);
      var h = Math.max(7, lines.length * 3.3 + 2.8);
      if (y + h > s.h - 18) { pdfFooter(doc, page); doc.addPage('a4', 'portrait'); page += 1; y = 24; }
      if (gr.items.length) { pdfFill(doc, PDF_ZEBRA); doc.rect(x, y, w, h, 'F'); }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      pdfText(doc, PDF_INK);
      doc.text(pdfSafe(gr.label), x + 2.5, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      pdfText(doc, PDF_ACCENT);
      var cnt = String(gr.items.length);
      doc.text(cnt, x + leftW - 3 - doc.getTextWidth(cnt), y + 5);
      pdfDrawLines(doc, lines, x + leftW, y + 5, 3.3, PDF_MUTED, 7.5, 'normal');
      y += h + 1.6;
    });

    // Detalhe de todos os convidados — em paisagem, com todas as colunas.
    pdfFooter(doc, page);
    doc.addPage('a4', 'landscape');
    page += 1;
    var ls = pdfSize(doc);
    var lx = 14, lw = ls.w - 28;
    var ty = pdfSection(doc, lx, 20, lw, 'Detalhe de todos os convidados', guests.length + ' registos') + 7;

    var cols = pdfFitLast([
      { label: 'N\u00ba', w: 11, align: 'center' },
      { label: 'Convidado', w: 50, style: 'bold' },
      { label: 'Estado RSVP', w: 24 },
      { label: 'Mesa', w: 13, align: 'center' },
      { label: 'Categoria', w: 27 },
      { label: 'Lugares', w: 14, align: 'center' },
      { label: 'Telefone', w: 26 },
      { label: 'Check-in', w: 20, align: 'center' },
      { label: 'Pend\u00eancias', w: 0 }
    ], lw);
    cols[cols.length - 1].color = PDF_MUTED;

    var rows = guests.map(function (g) {
      return [
        g.number ? String(g.number) : '-',
        guestLabel(g),
        guestStatus(g),
        guestTable(g),
        g.category || '-',
        String(guestMax(g)),
        g.phone || '-',
        g.checkedIn ? 'sim' : 'n\u00e3o',
        guestIssues(g).join(', ') || '-'
      ];
    });

    var res = pdfTable(doc, { x: lx, y: ty, w: lw, cols: cols, rows: rows, page: page, orientation: 'landscape' });
    pdfFooter(doc, res.page);
    return doc;
  }

  /* Relatório de mensagens do mural em PDF. */
  function buildMessagesReportPdf(JsPDF) {
    var all = (state.messages || []).slice().reverse();
    var visible = all.filter(isNewMessage);
    var authors = {};
    all.forEach(function (m) { authors[normQ(msgAuthor(m))] = 1; });

    var doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    var page = 1;
    pdfBand(doc, coupleNames(), reportStamp());

    var s = pdfSize(doc);
    var x = 14, w = s.w - 28;
    var y = pdfSection(doc, x, 50, w, 'Mensagens do mural', all.length + ' mensagens') + 7;
    y = pdfStatCards(doc, x, y, w, [
      { label: 'Total', value: all.length },
      { label: 'Vis\u00edveis no mural', value: visible.length },
      { label: 'Ocultadas', value: all.length - visible.length },
      { label: 'Autores distintos', value: Object.keys(authors).length }
    ]) + 13;

    y = pdfSection(doc, x, y, w, 'Todas as mensagens', 'mais recentes primeiro') + 7;
    var cols = pdfFitLast([
      { label: 'Autor', w: 36, style: 'bold' },
      { label: 'Data', w: 24 },
      { label: 'Estado', w: 18, align: 'center' },
      { label: 'Mensagem', w: 0 }
    ], w);

    var rows = all.map(function (m) {
      return [msgAuthor(m), fmtDate(m.timestamp) || '-', m.hidden ? 'ocultada' : 'vis\u00edvel', m.message || '-'];
    });

    var res = pdfTable(doc, { x: x, y: y, w: w, cols: cols, rows: rows, page: page, orientation: 'portrait' });
    pdfFooter(doc, res.page);
    return doc;
  }

  var REPORT_BUILDERS = {
    guests: {
      file: function () { return 'relatorio-convidados'; },
      build: buildGuestReportCsv,
      pdf: buildGuestReportPdf
    },
    messages: {
      file: function () { return 'relatorio-mensagens'; },
      build: buildMessagesReportCsv,
      pdf: buildMessagesReportPdf
    }
  };

  function reportFileBase(kind) {
    var spec = REPORT_BUILDERS[kind] || REPORT_BUILDERS.guests;
    return spec.file() + '-' + slug();
  }

  /* PDF em primeiro lugar; CSV só se o jsPDF não puder ser carregado.
     Resolve com 'pdf', 'csv' ou false. */
  function downloadReport(kind) {
    var spec = REPORT_BUILDERS[kind] || REPORT_BUILDERS.guests;
    return loadJsPdf().then(function (JsPDF) {
      if (!JsPDF || typeof spec.pdf !== 'function') return 'csv';
      try {
        var doc = spec.pdf(JsPDF);
        var buf = doc.output('arraybuffer');
        var blob = new Blob([buf], { type: 'application/pdf' });
        return triggerDownload(reportFileBase(kind) + '.pdf', blob) ? 'pdf' : false;
      } catch (e) { return 'csv'; }
    }).catch(function () { return 'csv'; });
  }
  function downloadReportCsv(kind) {
    var spec = REPORT_BUILDERS[kind] || REPORT_BUILDERS.guests;
    return downloadTextFile(reportFileBase(kind) + '.csv', spec.build());
  }

  /* Botão "baixar relatório completo" — encaixa no fim de uma resposta.
     Gera PDF; se a biblioteca não carregar, sai CSV com o mesmo conteúdo. */
  function reportButton(label) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opbot-btn opbot-btn-report';
    var text = label || 'Baixar relatório completo (.pdf)';
    btn.innerHTML = '<i data-feather="download"></i>' + esc(text);
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      var kind = btn.getAttribute('data-report') || 'guests';
      btn.disabled = true;
      btn.innerHTML = '<i data-feather="loader"></i>A preparar o relatório…';
      featherRefresh();
      downloadReport(kind).then(function (res) {
        if (res === 'pdf') {
          btn.innerHTML = '<i data-feather="check"></i>Relatório PDF descarregado';
          btn.classList.add('is-done');
          featherRefresh();
          return;
        }
        if (res === 'csv') {
          var ok = downloadReportCsv(kind);
          if (ok) {
            btn.innerHTML = '<i data-feather="check"></i>Relatório CSV descarregado';
            btn.classList.add('is-done');
            featherRefresh();
            botSay('O PDF não pôde ser gerado neste dispositivo (a biblioteca não carregou), por isso o relatório saiu em CSV — o conteúdo é o mesmo.');
            return;
          }
        }
        btn.disabled = false;
        btn.innerHTML = '<i data-feather="download"></i>' + esc(text);
        featherRefresh();
        botSay('Não foi possível gerar o relatório neste navegador. Tente novamente ou use a exportação do painel.');
      });
    });
    return btn;
  }

  /* Coloca o botão dentro do contentor `.opbot-report` de uma resposta. */
  function attachReport(msgEl, kind, label) {
    if (!msgEl) return;
    var holder = msgEl.querySelector('.opbot-report');
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'opbot-report';
      msgEl.appendChild(holder);
    }
    var btn = reportButton(label);
    btn.setAttribute('data-report', kind || 'guests');
    holder.appendChild(btn);
    featherRefresh();
    scrollBottom();
  }

  /* Resumo "precisa de atenção": análise local sobre os convidados em cache.
     Mostra só uma amostra de nomes por categoria (para o chat não alongar) e
     deixa o botão de relatório completo no fim. */
  var ATTENTION_SAMPLE = 4;
  function attentionHtml(guests) {
    var noTable = guests.filter(function (g) { return !guestTable(g) || guestTable(g) === 'A definir'; });
    var noPhone = guests.filter(function (g) { return !g.phone; });
    var noToken = guests.filter(function (g) { return !g.token && !g.inviteToken; });
    var declined = guests.filter(isDeclined);
    var pending = guests.filter(function (g) { return !isConfirmed(g) && !isDeclined(g); });
    var unchecked = guests.filter(function (g) { return !g.checkedIn; });
    var groups = [
      { label: 'Sem mesa atribuída', items: noTable, hint: 'defina a mesa para organizar a entrada' },
      { label: 'Sem telefone', items: noPhone, hint: 'sem contacto para confirmações de última hora' },
      { label: 'Sem token de acesso', items: noToken, hint: 'não receberam o link do convite' },
      { label: 'Sem resposta ao convite', items: pending, hint: 'ainda não confirmaram nem recusaram' },
      { label: 'Recusaram o convite', items: declined, hint: 'podem libertar lugar na contagem' },
      { label: 'Sem check-in', items: unchecked, hint: 'ainda não entraram no evento' }
    ];
    var problems = groups.filter(function (gr) { return gr.items.length; });
    var confirmed = guests.filter(isConfirmed);
    var head = '<div class="bubble"><b>Resumo do que precisa de atenção</b>' +
      '<div><small>' + guests.length + ' convidados · <b>' + confirmed.length + '</b> confirmados · ' +
      '<b>' + problems.length + '</b> tipo(s) de pendência</small></div>';
    if (!problems.length) {
      return head + '<div><small>Nenhuma pendência encontrada. Está tudo em ordem.</small></div>' +
        '<div class="opbot-report"></div></div>';
    }
    var truncated = false;
    var body = problems.map(function (gr) {
      var shown = gr.items.slice(0, ATTENTION_SAMPLE).map(function (g) { return esc(guestLabel(g)); });
      var extra = gr.items.length - shown.length;
      if (extra > 0) truncated = true;
      return '<div class="opbot-attn"><b>' + gr.items.length + ' · ' + esc(gr.label) + '</b> <small>(' + gr.hint + ')</small>' +
        '<div><small>' + shown.join(', ') + (extra > 0 ? ' <b>… +' + extra + '</b>' : '') + '</small></div></div>';
    }).join('');
    return head + body +
      '<div><small>Aqui aparecem só alguns nomes de cada categoria' + (truncated ? ' — a lista está truncada' : '') +
      '. O relatório completo traz todas as categorias e o detalhe de cada convidado.</small></div>' +
      '<div class="opbot-report"></div></div>';
  }

  /* ================= fluxo de acções (motor do Operator Bot) ================= */
  function handleUserMessage(text) {
    userSay(text);
    if (state.busy) {
      botSay('Um momento — ainda estou a processar o pedido anterior.');
      return;
    }
    state.lastMessage = text;
    state.chosenIds = [];
    // 1) acção em massa explícita ("mover todos da mesa 5 para a mesa 8")
    if (tryMassAction(text)) return;
    // 2) acções de mensagens são resolvidas localmente (o motor do servidor é
    //    exclusivo para convidados). Se não for uma, segue o caminho normal.
    if (tryMessageAction(text)) return;
    if (ACTION_RX.test(text)) { prepareAction(text, {}); return; }
    answerQuery(text);
  }

  /* ================= acções em massa por linguagem natural =================
     "mover todos da mesa 5 para a mesa 8" — a Lira resolve localmente quais
     os convidados afectados e envia os ids explícitos para o motor do
     servidor, que já trata caminhos em massa (pré-visualização antes/depois
     de cada registo, aviso de massa e confirmação).
     Exige a palavra "todos" de propósito: evita que uma edição normal de um
     convidado que mencione duas mesas se transforme em alteração em massa. */
  var RX_MASS_VERB = /\b(mover|trocar|alterar|passar|colocar|definir)\b/;
  var RX_MASS_ALL = /\b(todos|todas|todo o publico|toda a gente|todos os convidados)\b/;

  function tryMassAction(text) {
    var q = normQ(text);
    if (!RX_MASS_VERB.test(q) || !RX_MASS_ALL.test(q)) return false;
    var mesas = [];
    var rx = /\bmesa\s+([0-9]+[a-z]?)\b/g;
    var m;
    while ((m = rx.exec(q)) !== null) mesas.push(m[1]);
    if (!mesas.length) return false;

    var toTable = mesas[mesas.length - 1];
    var fromTable = mesas.length > 1 ? mesas[0] : null;

    withGuests(function () {
      var guests = state.guests || [];
      var selected = fromTable
        ? guests.filter(function (g) { return String(guestTable(g)) === String(fromTable); })
        : guests;
      if (!selected.length) {
        botSay(fromTable
          ? 'Não encontrei convidados na mesa <b>' + esc(fromTable) + '</b>. Confirme a mesa ou peça a "lista de convidados".'
          : 'Não encontrei convidados neste convite.');
        return;
      }
      var ids = selected.map(function (g) { return g.id; }).filter(Boolean);
      if (!ids.length) {
        botSay('Não consegui identificar os registos dos convidados seleccionados.');
        return;
      }
      botSay('Vou mover <b>' + ids.length + '</b> convidado(s)' +
        (fromTable ? ' da mesa <b>' + esc(fromTable) + '</b>' : '') +
        ' para a mesa <b>' + esc(toTable) + '</b>. Preparei a pré-visualização abaixo.');
      if (ids.length === 1) {
        // um único registo: segue o caminho simples, com o convidado explícito
        prepareAction('mesa ' + toTable, { actionType: 'edit_guest', guestId: ids[0] });
      } else {
        prepareAction('mesa ' + toTable, { actionType: 'edit_guest', guestIds: ids });
      }
    });
    return true;
  }

  /* ================= acções do painel: mensagens do mural =================
     Estas acções não passam pelo bot_prepare/bot_apply (que é exclusivo para
     convidados). A Lira resolve a mensagem localmente, mostra o MESMO cartão
     de pré-visualização com confirmação e chama directamente a acção do
     painel. O backend continua a validar a sessão em cada pedido. */
  var MSG_ACTIONS = {
    hide_message: { label: 'Ocultar mensagem', destructive: false, done: 'Mensagem ocultada. Já não aparece no mural público.', effect: 'Deixa de aparecer no mural público.', undo: false },
    restore_message: { label: 'Restaurar mensagem', destructive: false, done: 'Mensagem restaurada. Volta a aparecer no mural público.', effect: 'Volta a aparecer no mural público.', undo: false },
    delete_message: { label: 'Eliminar mensagem', destructive: true, done: 'Mensagem eliminada definitivamente.', effect: 'A mensagem será removida em definitivo. Não é possível recuperá-la.', undo: false }
  };

  /* Só é ACÇÃO quando o verbo vem ANTES de "mensagem"/"recado" — assim
     "mensagens ocultadas" ou "mensagens novas" continuam a ser consultas. */
  var RX_MSG_ACTION = /\b(ocultar|oculta|esconder|esconde|eliminar|elimine|apagar|apague|remover|remova|deletar|delete|restaurar|restaure|repor|reponha|repoe)\b[\s\S]{0,18}?\b(mensagem|mensagens|recado|recados|mural)\b/;

  function tryMessageAction(text) {
    var q = normQ(text);
    if (!RX_MESSAGE.test(q)) return false;
    var act = q.match(RX_MSG_ACTION);
    if (!act) return false;   // é consulta ("mensagens novas", "mensagens ocultadas"…)
    var verb = act[1];
    var del = /^(eliminar|elimine|apagar|apague|remover|remova|deletar|delete)$/.test(verb);
    var restore = !del && /^(restaurar|restaure|repor|reponha|repoe)$/.test(verb);
    var hide = !del && !restore && /^(ocultar|oculta|esconder|esconde)$/.test(verb);
    if (!del && !restore && !hide) return false;
    var key = del ? 'delete_message' : (restore ? 'restore_message' : 'hide_message');
    var spec = MSG_ACTIONS[key];
    if (!spec) return false;

    withData('messages', function () {
      var all = state.messages || [];
      // "restaurar" só se aplica a mensagens ocultas; "ocultar" só a visíveis.
      var pool = restore ? all.filter(function (m) { return !isNewMessage(m); }) : all.filter(isNewMessage);
      var author = extractMessageAuthor(text);
      var found = null;
      if (author) {
        var nauthor = normQ(author);
        found = pool.filter(function (m) { return normQ(msgAuthor(m)) === nauthor; })[0] ||
                pool.filter(function (m) { return normQ(msgAuthor(m)).indexOf(nauthor) !== -1; })[0] || null;
      }
      if (!found) {
        var poolDesc = restore ? 'ocultadas' : 'no mural';
        botSay(author
          ? 'Não encontrei nenhuma mensagem ' + poolDesc + ' de "' + esc(author) + '". Tente "mensagens" para ver a lista.'
          : 'Não percebi de quem é a mensagem. Exemplos: "ocultar mensagem do João", "eliminar mensagem da Ana".');
        return;
      }
      renderMessageAction(found, key, spec);
    });
    return true;
  }

  function coupleNames() {
    try {
      var ev = window.LIRANDZO_EVENT || {};
      return ev.coupleNames || ev.displayNames || slug();
    } catch (e) { return slug(); }
  }

  function renderMessageAction(msg, key, spec) {
    var id = msg._id || msg.id;
    if (!id) { botSay('Não consegui identificar o registo desta mensagem.'); return; }
    var phrase = key === 'delete_message'
      ? 'ELIMINAR MENSAGEM ' + String(msgAuthor(msg)).toUpperCase()
      : '';
    var d = {
      actionId: 'panel-' + key + '-' + String(id),
      actionType: key,
      actionLabel: spec.label,
      destructive: spec.destructive,
      confirmationPhrase: phrase,
      warnings: spec.destructive ? ['Acção sensível. Confirme apenas se tiver certeza absoluta.'] : [],
      invite: { slug: slug(), coupleNames: coupleNames() },
      before: { name: msgAuthor(msg), message: msg.message, state: msg.hidden ? 'Ocultada' : 'Visível no mural' },
      after: { name: msgAuthor(msg), message: msg.message, state: key === 'hide_message' ? 'Ocultada' : (key === 'restore_message' ? 'Visível no mural' : 'Removida') },
      payload: {}
    };
    renderPreview(d, function (card) {
      state.busy = true;
      showTyping();
      botApi(key, { id: String(id) }).then(function (res) {
        hideTyping();
        state.busy = false;
        if (card && card.parentNode) card.parentNode.removeChild(card);
        botSay(res.message || spec.done);
        invalidate('messages');
      }).catch(function (err) {
        hideTyping();
        state.busy = false;
        botError(err);
        if (card && card.parentNode) {
          card.querySelectorAll('.opbot-btn').forEach(function (b) { b.disabled = false; });
        }
      });
    });
  }

  function prepareAction(text, extra) {
    state.busy = true;
    showTyping();
    botApi('bot_prepare', Object.assign({ message: text }, extra || {})).then(function (res) {
      hideTyping();
      state.busy = false;
      if (res && res.status === 'selection_required') { renderSelection(res); return; }
      if (res && res.status === 'success' && res.data) { renderPreview(res.data); return; }
      botSay((res && res.message) || 'Não foi possível preparar a acção.');
    }).catch(function (err) {
      hideTyping();
      state.busy = false;
      botError(err);
    });
  }

  function previewKv(obj) {
    if (!obj) return '<small>—</small>';
    var rows = [];
    if (obj.name != null) rows.push('Nome: ' + esc(obj.name));
    if (obj.table != null) rows.push('Mesa: ' + esc(obj.table || 'a definir'));
    if (obj.phone != null) rows.push('Telefone: ' + esc(obj.phone || '—'));
    if (obj.category != null) rows.push('Categoria: ' + esc(obj.category || '—'));
    if (obj.companions != null) rows.push('Acompanhantes: ' + esc(obj.companions));
    if (obj.status != null) rows.push('Estado: ' + esc(obj.status || '—'));
    if (obj.checkedIn != null) rows.push('Check-in: ' + (obj.checkedIn ? 'sim' : 'não'));
    if (obj.message != null) rows.push('Mensagem: ' + esc(String(obj.message).slice(0, 140)) + (String(obj.message).length > 140 ? '…' : ''));
    if (obj.state != null) rows.push('Estado: ' + esc(obj.state));
    if (!rows.length) return '<small>—</small>';
    return rows.map(function (r) { return '<div>' + r + '</div>'; }).join('');
  }

  function renderPreview(d, customApply) {
    var html = '<div class="opbot-card"><div class="opbot-card-head"><i data-feather="' + (d.destructive ? 'alert-triangle' : 'check-circle') + '"></i>' + esc(d.actionLabel || 'Acção') + '</div><div class="opbot-card-body">';
    html += '<div class="opbot-row"><span class="k">Convite</span><span class="v">' + esc((d.invite && (d.invite.coupleNames || d.invite.slug)) || slug()) + '</span></div>';
    if (d.bulk) html += '<div class="opbot-row"><span class="k">Registos</span><span class="v">' + esc(d.bulkCount || 0) + ' convidado(s)</span></div>';
    (d.warnings || []).forEach(function (w) {
      html += '<div class="opbot-warn"><i data-feather="alert-triangle"></i><span>' + esc(w) + '</span></div>';
    });
    if (d.bulk) {
      (d.bulkItems || []).slice(0, 10).forEach(function (it) {
        html += '<div class="opbot-ba"><div><span class="lbl">Antes</span>' + previewKv(it.before) + '</div><div class="after"><span class="lbl">Depois</span>' + previewKv(it.after) + '</div></div>';
      });
      if ((d.bulkItems || []).length > 10) html += '<div class="opbot-row"><span class="k"></span><span class="v"><small>… e mais ' + (d.bulkItems.length - 10) + ' registo(s).</small></span></div>';
    } else if (d.actionType === 'add_guest') {
      html += '<div class="opbot-ba"><div><span class="lbl">Novo convidado</span>' + previewKv(d.after) + '</div><div class="after"><span class="lbl">Efeito</span><small>Será criado um novo registo neste convite.</small></div></div>';
    } else if (d.after) {
      html += '<div class="opbot-ba"><div><span class="lbl">Antes</span>' + previewKv(d.before) + '</div><div class="after"><span class="lbl">Depois</span>' + previewKv(d.after) + '</div></div>';
    }
    var payloadKeys = Object.keys(d.payload || {}).filter(function (k) {
      return k !== 'name' && d.payload[k] !== '' && d.payload[k] != null;
    });
    if (payloadKeys.length) {
      html += '<div>' + payloadKeys.map(function (k) {
        return '<span class="opbot-chip">' + esc(k) + ': ' + esc(d.payload[k]) + '</span>';
      }).join(' ') + '</div>';
    }
    if (d.confirmationPhrase) {
      html += '<div class="opbot-phrase"><label>Confirmação rigorosa — escreva exactamente:</label><code>' + esc(d.confirmationPhrase) + '</code>' +
        '<input id="opbotPhraseInput" type="text" autocomplete="off" placeholder="' + esc(d.confirmationPhrase) + '"></div>';
    }
    html += '</div><div class="opbot-actions" id="opbotActions"></div>'; // fecha .opbot-card e abre acções

    var card = document.createElement('div');
    card.className = 'opbot-msg opbot-bot';
    card.innerHTML = html;

    var actions = card.querySelector('#opbotActions');
    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'opbot-btn ' + (d.destructive ? 'danger' : 'primary');
    confirmBtn.innerHTML = '<i data-feather="check"></i>Confirmar';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'opbot-btn';
    cancelBtn.textContent = 'Cancelar';

    var phraseInput = card.querySelector('#opbotPhraseInput');
    if (phraseInput) {
      confirmBtn.disabled = true;
      phraseInput.addEventListener('input', function () {
        confirmBtn.disabled = phraseInput.value.trim() !== d.confirmationPhrase;
      });
    }

    confirmBtn.addEventListener('click', function () {
      var confirmText = phraseInput ? phraseInput.value.trim() : '';
      if (d.confirmationPhrase && confirmText !== d.confirmationPhrase) return;
      // Acções do painel (mensagens) trazem o seu próprio "apply".
      if (typeof customApply === 'function') { customApply(card); return; }
      applyAction(d.actionId, confirmText, card);
    });
    cancelBtn.addEventListener('click', function () {
      if (card.parentNode) card.parentNode.removeChild(card);
      botSay('Acção cancelada. Nada foi alterado.');
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    var body = $('opbotBody');
    body.appendChild(card);
    scrollBottom();
    featherRefresh();
    if (phraseInput) phraseInput.focus();
  }

  function applyAction(actionId, confirmText, card) {
    state.busy = true;
    showTyping();
    botApi('bot_apply', { actionId: actionId, confirmText: confirmText || '' }).then(function (res) {
      hideTyping();
      state.busy = false;
      if (card && card.parentNode) card.parentNode.removeChild(card);
      botSay(res.message || 'Acção executada com sucesso.');
      renderResultSummary(res.data);
      loadGuests(true).catch(function () {});
    }).catch(function (err) {
      hideTyping();
      state.busy = false;
      botError(err);
      if (card && card.parentNode) {
        card.querySelectorAll('.opbot-btn').forEach(function (b) { b.disabled = false; });
      }
    });
  }

  function renderResultSummary(d) {
    if (!d) return;
    var r = d.result || {};
    var lines = [];
    if (r.bulk) {
      lines.push('Sucesso: <b>' + esc(r.success || 0) + '</b> · Falhas: <b>' + esc(r.failed || 0) + '</b>');
      (r.items || []).slice(0, 10).forEach(function (it) {
        lines.push((it.status === 'success' ? '· ' : '· (falha) ') + esc(it.requestedName || '') + (it.error ? ' — ' + esc(it.error) : ''));
      });
    } else if (r.deletedGuest) {
      lines.push('Convidado eliminado: <b>' + esc(r.deletedGuest) + '</b>');
      if (r.rsvpsDeleted || r.checkinsDeleted) lines.push('RSVP removidos: ' + esc(r.rsvpsDeleted || 0) + ' · check-ins removidos: ' + esc(r.checkinsDeleted || 0));
    } else if (r.guest) {
      lines.push('Convidado: <b>' + esc(r.guest.name) + '</b>');
      if (r.publicLink) lines.push('Novo link de acesso: <small>' + esc(r.publicLink) + '</small>');
    } else if (r.guestsReset != null) {
      lines.push('Convidados repostos: <b>' + esc(r.guestsReset) + '</b>');
      if (r.rsvpsDeleted || r.checkinsDeleted) lines.push('RSVP removidos: ' + esc(r.rsvpsDeleted || 0) + ' · check-ins removidos: ' + esc(r.checkinsDeleted || 0));
    }
    if (!lines.length) return;
    botHtml('<div class="opbot-card"><div class="opbot-card-head"><i data-feather="check"></i>Resultado</div><div class="opbot-card-body">' +
      lines.map(function (l) { return '<div class="opbot-row"><span class="k"></span><span class="v">' + l + '</span></div>'; }).join('') +
      '</div></div>');
  }

  function renderSelection(res) {
    var d = res.data || res;
    var sel = d.selectionType || 'guest';
    if (sel === 'guest') {
      botSay(d.message || 'Encontrei mais de um convidado possível. Qual deles?');
      var holder = document.createElement('div');
      holder.className = 'opbot-msg opbot-bot';
      holder.appendChild(candidateButtons(d.candidates || [], '', function (g) {
        holder.remove();
        prepareAction(state.lastMessage, { guestId: g.id });
      }));
      $('opbotBody').appendChild(holder);
      featherRefresh();
      scrollBottom();
      return;
    }
    if (sel === 'bulk_guests') {
      botSay(d.message || 'Preciso de nomes exactos para continuar.');
      var resolved = (d.resolved || []).map(function (x) { return x.guest && x.guest.id; }).filter(Boolean);
      var ambiguous = d.ambiguous || [];
      if (!ambiguous.length && resolved.length) {
        prepareAction(state.lastMessage, { guestIds: resolved });
        return;
      }
      var holder2 = document.createElement('div');
      holder2.className = 'opbot-msg opbot-bot';
      var html2 = '<div class="opbot-card"><div class="opbot-card-head"><i data-feather="users"></i>Escolha os convidados</div><div class="opbot-card-body">';
      if (resolved.length) html2 += '<div class="opbot-row"><span class="k">Já identificados</span><span class="v">' + resolved.length + ' convidado(s)</span></div>';
      html2 += '</div></div>';
      holder2.innerHTML = html2;
      ambiguous.forEach(function (amb) {
        var lbl = document.createElement('div');
        lbl.className = 'opbot-cands';
        lbl.style.padding = '0 11px 8px';
        lbl.innerHTML = '<small style="color:var(--accent-2);font-size:10.5px">Para “' + esc(amb.requestedName) + '”:</small>';
        (amb.candidates || []).forEach(function (g) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'opbot-cand';
          btn.innerHTML = '<i data-feather="user"></i><span>' + esc(guestLabel(g)) + '<small>mesa ' + esc(guestTable(g)) + ' · nº ' + esc(g.number || '·') + '</small></span>';
          btn.addEventListener('click', function () {
            btn.classList.add('primary');
            state.chosenIds.push(g.id);
          });
          lbl.appendChild(btn);
        });
        holder2.appendChild(lbl);
      });
      var goBtn = document.createElement('div');
      goBtn.className = 'opbot-actions';
      goBtn.style.padding = '0 11px 11px';
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'opbot-btn primary';
      go.innerHTML = '<i data-feather="check"></i>Continuar com ' + (resolved.length + state.chosenIds.length) + ' seleccionado(s)';
      go.addEventListener('click', function () {
        var ids = resolved.concat(state.chosenIds.filter(function (id) { return resolved.indexOf(id) === -1; }));
        holder2.remove();
        prepareAction(state.lastMessage, { guestIds: ids });
      });
      goBtn.appendChild(go);
      holder2.appendChild(goBtn);
      $('opbotBody').appendChild(holder2);
      featherRefresh();
      scrollBottom();
      return;
    }
    if (sel === 'bulk_conflict') {
      var conflicts = d.conflicts || [];
      var txt = (d.message || 'Alguns nomes já existem neste convite.') + '\n' +
        conflicts.map(function (c) { return '· ' + c.requestedName + ' (já existe: ' + (c.existing && c.existing.name) + ')'; }).join('\n');
      botSay(txt);
      return;
    }
    botSay(d.message || 'Selecção necessária não reconhecida.');
  }

  /* ---------- arranque (só depois do login) ----------
     ATENÇÃO: `#app` começa escondido pela regra CSS `.app { display: none; }`
     (admin.html, linha 233) e NÃO por estilo inline. Por isso
     `app.style.display` é '' antes do login — comparar com 'none' nunca
     detectava o ecrã de entrada e montava o botão na página de login.
     Agora usamos o estilo COMPUTADO e confirmamos que o login foi feito. */
  function isGateOpen() {
    try {
      if (sessionStorage.getItem('rm_admin_logged') !== '1') return false;
    } catch (e) { return false; }
    var app = $('app');
    var login = $('loginScreen');
    if (!app) return false;
    var appHidden = false;
    var loginVisible = false;
    try { appHidden = getComputedStyle(app).display === 'none'; } catch (e) { appHidden = app.style.display === 'none'; }
    try { loginVisible = login ? getComputedStyle(login).display !== 'none' : false; } catch (e) {}
    return !appHidden && !loginVisible;
  }
  function boot() {
    if (state.mounted) return;
    if (!isGateOpen()) {
      setTimeout(boot, 600);
      return;
    }
    mount();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 50); });
  } else {
    setTimeout(boot, 50);
  }
})();
