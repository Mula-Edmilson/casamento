/* Lirandzo AI-like Assistant — humanized local expert + optional secure endpoint.
   No public API keys. If window.LIRANDZO_CHATBOT_ENDPOINT exists, the same rich context is sent to your backend. */
(function () {
  'use strict';

  const CHATBOT_CONFIG = {
    whatsappNumber: '258878061697',
    email: 'lirandzo.mz@gmail.com',
    endpoint: window.LIRANDZO_CHATBOT_ENDPOINT || null,
    storageKey: 'lirandzo-chat-history-v3',
    maxStoredMessages: 18
  };

  const KB = {
    pt: {
      brand: 'Lirandzo',
      assistantName: 'Ana',
      intro: 'Olá! Sou a Ana, assistente da Lirandzo. Posso ajudar com pacotes, preços, prazos, Corporate, briefing, convites digitais e próximos passos 😊',
      status: 'online · resposta assistida',
      placeholder: 'Pergunte sobre pacotes, preços, prazo...',
      quick: ['Comparar pacotes', 'Qual pacote escolher?', 'Corporate', 'Prazos', 'Como funciona'],
      packages: {
        perola: {
          name: 'Pérola', price: '6.000 MT', fit: 'casamentos intimistas, elegantes e directos',
          includes: ['capa com foto e nomes', 'agenda do evento com mapa', 'feed de felicitações', 'contagem regressiva', 'música de fundo', ],
          human: 'É a escolha mais essencial: bonito, elegante e suficiente para quem quer um convite digital bem apresentado sem funcionalidades avançadas.'
        },
        esmeralda: {
          name: 'Esmeralda', price: '10.000 MT', fit: 'casais que querem mais organização e uma experiência mais completa',
          includes: ['tudo do Pérola', 'lembrete automático', 'presentes de casamento', 'pré-wedding com fotos', 'dress code', 'cápsula de tempo por 15 dias', 'dashboard de convidados', 'convite exclusivo'],
          human: 'É o pacote mais equilibrado: junta estética, organização e funcionalidades que tornam o convite mais útil para os convidados e para os noivos.'
        },
        rubi: {
          name: 'Rubi', price: '15.000 MT', fit: 'eventos premium, maior controlo e experiência mais marcante',
          includes: ['tudo do Esmeralda', 'pré-wedding com fotos + 1 vídeo', 'check-in', 'cápsula de tempo por 30 dias', 'ajustes adicionais por análise'],
          human: 'É a opção mais completa para quem quer uma experiência digital premium e mais memorável, com recursos de gestão e apresentação mais fortes.'
        },
        corporate: {
          name: 'Corporate', price: 'sob consulta', fit: 'empresas, marcas, eventos institucionais e páginas promocionais',
          includes: ['briefing estratégico', 'estrutura alinhada à marca', 'experiência personalizada', 'proposta sob medida', 'suporte dedicado'],
          human: 'Não tem preço fixo porque depende do objectivo, escopo, urgência, conteúdos, quantidade de páginas/funcionalidades e nível de personalização.'
        }
      },
      process: ['Escolher o pacote ou enviar briefing Corporate', 'Enviar fotos, textos, nomes, data, local e detalhes do evento', 'A equipa estrutura o convite/experiência digital', 'Recebe o link para revisão', 'Depois da validação, o link fica pronto para partilha'],
      prazo: 'Normalmente 3 a 5 dias úteis após confirmação do pagamento e recepção do material. No Corporate, o prazo depende do briefing e do escopo aprovado.',
      payment: 'O site indica pacotes em Meticais. Para clientes fora de Moçambique, o conversor dá uma estimativa em USD e AOA; valores finais podem ser confirmados comercialmente.',
      contact: 'Pode falar com a Lirandzo pelo WhatsApp ou por email. WhatsApp: +258 87 806 1697. Email: lirandzo.mz@gmail.com.',
      corporate: 'Para Corporate, o primeiro passo é preencher o briefing compacto. Ele permite entender objectivo, marca, público, prazo, orçamento esperado e complexidade antes de preparar a proposta.',
      toneAsk: 'Para eu recomendar melhor, diga-me: é casamento, evento social ou projecto empresarial? E quer algo simples, completo ou premium?',
      unknown: 'Boa pergunta. Para não inventar, respondo com base no que está definido no site: posso explicar pacotes, preços, prazos, Corporate, briefing, moedas, contacto e funcionamento. Se for algo muito específico, encaminho para a equipa pelo WhatsApp.'
    },
    en: {
      brand: 'Lirandzo',
      assistantName: 'Ana',
      intro: 'Hi! I’m Ana, Lirandzo’s assistant. I can help with packages, pricing, timelines, Corporate projects, briefing, digital invitations and next steps 😊',
      status: 'online · assisted reply',
      placeholder: 'Ask about packages, prices, timeline...',
      quick: ['Compare packages', 'Which package fits?', 'Corporate', 'Timeline', 'How it works'],
      packages: {
        perola: {
          name: 'Pearl', price: '6,000 MZN', fit: 'intimate, elegant and straightforward weddings',
          includes: ['cover with photo and names', 'event schedule with map', 'wishes feed', 'countdown', 'background music'],
          human: 'It is the essential choice: elegant, refined and enough for couples who want a polished digital invitation without advanced features.'
        },
        esmeralda: {
          name: 'Emerald', price: '10,000 MZN', fit: 'couples who want more organization and a richer experience',
          includes: ['everything in Pearl', 'automatic event reminder', 'wedding gifts', 'pre-wedding photos', 'dress code', '15-day time capsule', 'guest dashboard', 'exclusive invitation'],
          human: 'It is the most balanced package: strong design, practical organization and features that help both guests and the couple.'
        },
        rubi: {
          name: 'Ruby', price: '15,000 MZN', fit: 'premium events, more control and a stronger digital experience',
          includes: ['everything in Emerald', 'pre-wedding photos + 1 video', 'check-in', '30-day time capsule', 'additional items under analysis'],
          human: 'It is the most complete choice for a premium, memorable digital experience with stronger presentation and event-management features.'
        },
        corporate: {
          name: 'Corporate', price: 'upon request', fit: 'companies, brands, institutional events and promotional pages',
          includes: ['strategic briefing', 'brand-aligned structure', 'custom experience', 'tailored proposal', 'dedicated support'],
          human: 'It has no fixed price because it depends on objectives, scope, urgency, content, number of pages/features and customization level.'
        }
      },
      process: ['Choose a package or submit a Corporate briefing', 'Send photos, texts, names, date, venue and event details', 'The team structures the digital invitation/experience', 'You receive a link for review', 'After approval, the link is ready to share'],
      prazo: 'Usually 3 to 5 business days after payment confirmation and receipt of all materials. Corporate timelines depend on the approved briefing and scope.',
      payment: 'The main prices are in Mozambican Meticais. The currency converter gives USD and AOA estimates for international clients; final values can be confirmed commercially.',
      contact: 'You can reach Lirandzo by WhatsApp or email. WhatsApp: +258 87 806 1697. Email: lirandzo.mz@gmail.com.',
      corporate: 'For Corporate, the first step is the compact briefing. It helps clarify objective, brand, audience, timeline, expected budget and complexity before a proposal is prepared.',
      toneAsk: 'To recommend better, tell me: is it a wedding, social event or business project? And do you want something simple, complete or premium?',
      unknown: 'Good question. To avoid making things up, I’ll answer based on what is defined on this website: packages, prices, timelines, Corporate, briefing, currency, contact and how the service works. For very specific cases, I can route you to WhatsApp.'
    }
  };

  const state = {
    leadType: null,
    lastIntent: null,
    history: []
  };

  const esc = (value) => String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  const normalize = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lang = () => (localStorage.getItem('lirandzo-language') === 'en' || document.documentElement.lang.startsWith('en')) ? 'en' : 'pt';
  const t = () => KB[lang()] || KB.pt;

  function detectIntent(message) {
    const m = normalize(message);
    const has = (...terms) => terms.some(term => m.includes(normalize(term)));
    if (has('ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'hey')) return 'greeting';
    if (has('perola', 'pearl')) return 'perola';
    if (has('esmeralda', 'emerald')) return 'esmeralda';
    if (has('rubi', 'ruby')) return 'rubi';
    if (has('corporate', 'empresa', 'empresarial', 'business', 'briefing', 'orcamento', 'quote', 'budget')) return 'corporate';
    if (has('preco', 'precos', 'valor', 'custa', 'quanto', 'price', 'pricing', 'cost')) return 'prices';
    if (has('comparar', 'comparacao', 'diferenca', 'melhor', 'qual pacote', 'compare', 'difference', 'which package')) return 'compare';
    if (has('prazo', 'tempo', 'demora', 'dias', 'urgente', 'timeline', 'deadline', 'how long')) return 'timeline';
    if (has('como funciona', 'processo', 'passos', 'contratar', 'funciona', 'how it works', 'steps')) return 'process';
    if (has('pagamento', 'pagar', 'moeda', 'cambio', 'dolar', 'usd', 'aoa', 'kwanza', 'payment', 'currency')) return 'payment';
    if (has('contacto', 'contato', 'whatsapp', 'telefone', 'email', 'falar', 'contact')) return 'contact';
    if (has('obrigado', 'obrigada', 'thanks', 'thank you')) return 'thanks';
    if (has('casamento', 'noivos', 'wedding', 'couple')) return 'wedding';
    return 'unknown';
  }

  function packageSummary(key) {
    const kb = t();
    const pkg = kb.packages[key];
    if (!pkg) return '';
    const includes = pkg.includes.slice(0, 7).map(item => `• ${item}`).join('\n');
    return `**${pkg.name} — ${pkg.price}**\n\n${pkg.human}\n\n**Indicado para:** ${pkg.fit}.\n\n**Inclui:**\n${includes}`;
  }

  function comparePackages() {
    const kb = t();
    if (lang() === 'en') {
      return `Here is the practical comparison:\n\n**Pearl — 6,000 MZN**\nBest for a clean, elegant and essential invitation.\n\n**Emerald — 10,000 MZN**\nBest balance: invitation + organization + gifts + dashboard + richer guest experience.\n\n**Ruby — 15,000 MZN**\nPremium level: adds video, check-in and a longer time capsule.\n\n**Corporate — upon request**\nFor business/institutional projects. It starts with a briefing because scope defines price.\n\nMy honest recommendation: if you want value and completeness, start with **Emerald**. If the event needs a premium feel and more control, choose **Ruby**.`;
    }
    return `Comparação prática:\n\n**Pérola — 6.000 MT**\nPara um convite elegante, essencial e directo.\n\n**Esmeralda — 10.000 MT**\nMelhor equilíbrio: convite + organização + presentes + dashboard + experiência mais completa.\n\n**Rubi — 15.000 MT**\nNível premium: acrescenta vídeo, check-in e cápsula de tempo por mais dias.\n\n**Corporate — sob consulta**\nPara projectos empresariais/institucionais. Começa por briefing porque o escopo define o preço.\n\nRecomendação honesta: se queres custo-benefício e experiência completa, começa pelo **Esmeralda**. Se queres máxima apresentação e controlo, vai para **Rubi**.`;
  }

  function recommendation(message) {
    const m = normalize(message);
    if (m.includes('empresa') || m.includes('corporate') || m.includes('business') || m.includes('marca')) return packageSummary('corporate') + actionLine('briefing');
    if (m.includes('premium') || m.includes('video') || m.includes('check') || m.includes('exclusiv')) return packageSummary('rubi') + actionLine('packages');
    if (m.includes('completo') || m.includes('dashboard') || m.includes('presentes') || m.includes('dress')) return packageSummary('esmeralda') + actionLine('packages');
    if (m.includes('simples') || m.includes('basico') || m.includes('barato') || m.includes('essencial')) return packageSummary('perola') + actionLine('packages');
    return t().toneAsk;
  }

  function actionLine(type) {
    if (lang() === 'en') {
      if (type === 'briefing') return '\n\nI can open the Corporate briefing for you.';
      if (type === 'contact') return '\n\nI can also direct you to WhatsApp for a more personal answer.';
      return '\n\nYou can also open the package cards on this page to see the full details.';
    }
    if (type === 'briefing') return '\n\nPosso abrir o briefing Corporate para avançar com o pedido.';
    if (type === 'contact') return '\n\nTambém posso encaminhar para o WhatsApp para uma resposta mais personalizada.';
    return '\n\nPodes abrir os cards dos pacotes nesta página para ver os detalhes completos.';
  }

  function localAnswer(message) {
    const kb = t();
    const intent = detectIntent(message);
    state.lastIntent = intent;
    const m = normalize(message);

    switch (intent) {
      case 'greeting': return kb.intro;
      case 'perola': return packageSummary('perola') + actionLine('packages');
      case 'esmeralda': return packageSummary('esmeralda') + actionLine('packages');
      case 'rubi': return packageSummary('rubi') + actionLine('packages');
      case 'corporate': return packageSummary('corporate') + '\n\n' + kb.corporate + actionLine('briefing');
      case 'prices': return comparePackages();
      case 'compare': return comparePackages();
      case 'timeline': return kb.prazo;
      case 'process': return kb.process.map((step, i) => `${i + 1}. ${step}`).join('\n');
      case 'payment': return kb.payment;
      case 'contact': return kb.contact + actionLine('contact');
      case 'thanks': return lang() === 'en' ? 'You’re welcome 😊 I’m here if you want help choosing a package.' : 'Disponha 😊 Estou aqui se quiser ajuda a escolher o pacote ideal.';
      case 'wedding': return recommendation(message);
      default:
        if (m.length < 8) return kb.toneAsk;
        return `${kb.unknown}\n\n${kb.toneAsk}`;
    }
  }

  async function askChatbot(message) {
    const currentLang = lang();
    const context = {
      language: currentLang,
      brand: 'Lirandzo',
      services: ['digital wedding invitations', 'corporate digital proposals/pages', 'guest experience'],
      packages: KB[currentLang].packages,
      contact: { whatsapp: CHATBOT_CONFIG.whatsappNumber, email: CHATBOT_CONFIG.email },
      instruction: 'Answer as a warm, concise, highly informed Lirandzo commercial assistant. Never invent prices or deadlines beyond the context.'
    };

    if (CHATBOT_CONFIG.endpoint) {
      try {
        const response = await fetch(CHATBOT_CONFIG.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, context, history: state.history.slice(-8) })
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.reply) return String(data.reply);
        }
      } catch (error) {
        console.warn('Chat endpoint unavailable. Using local Lirandzo knowledge base.', error);
      }
    }
    return localAnswer(message);
  }

  function processText(text) {
    return esc(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function addMessage(text, isUser = false, persist = true) {
    const messagesDiv = document.getElementById('chatbotMessages');
    if (!messagesDiv) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    messageDiv.innerHTML = `
      <div class="message-avatar" aria-hidden="true">${isUser ? '👤' : 'A'}</div>
      <div class="message-content">${processText(text)}</div>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    if (persist) {
      state.history.push({ role: isUser ? 'user' : 'assistant', content: text, ts: Date.now() });
      state.history = state.history.slice(-CHATBOT_CONFIG.maxStoredMessages);
      localStorage.setItem(CHATBOT_CONFIG.storageKey, JSON.stringify(state.history));
    }
  }

  function addActions() {
    const messagesDiv = document.getElementById('chatbotMessages');
    if (!messagesDiv) return;
    const wrap = document.createElement('div');
    wrap.className = 'chatbot-actions';
    const labels = t().quick;
    const payloads = lang() === 'en'
      ? ['Compare the packages', 'Which package should I choose?', 'Explain Corporate', 'What is the delivery timeline?', 'How does it work?']
      : ['Comparar pacotes', 'Qual pacote devo escolher?', 'Explica o Corporate', 'Qual é o prazo?', 'Como funciona?'];
    wrap.innerHTML = labels.map((label, i) => `<button type="button" data-chatbot-chip="${esc(payloads[i])}">${esc(label)}</button>`).join('');
    messagesDiv.appendChild(wrap);
  }

  function showTyping() {
    const typing = document.getElementById('chatbotTyping');
    if (typing) typing.style.display = 'flex';
  }
  function hideTyping() {
    const typing = document.getElementById('chatbotTyping');
    if (typing) typing.style.display = 'none';
  }

  function setSending(sending) {
    const send = document.getElementById('chatbotSend');
    const input = document.getElementById('chatbotInput');
    if (send) send.disabled = sending;
    if (input) input.disabled = sending;
  }

  async function sendMessage(forcedText) {
    const input = document.getElementById('chatbotInput');
    const message = String(forcedText || (input ? input.value : '')).trim();
    if (!message) return;
    addMessage(message, true);
    if (input) input.value = '';
    setSending(true);
    showTyping();
    const wait = Math.min(700 + message.length * 8, 1400);
    const reply = await new Promise(resolve => setTimeout(async () => resolve(await askChatbot(message)), wait));
    hideTyping();
    addMessage(reply, false);
    addContextualTools(reply);
    setSending(false);
    if (input) input.focus();
  }

  function addContextualTools(reply) {
    const messagesDiv = document.getElementById('chatbotMessages');
    if (!messagesDiv) return;
    const lower = normalize(reply);
    const tools = [];
    if (lower.includes('briefing') || lower.includes('corporate')) tools.push(['briefing', lang() === 'en' ? 'Open briefing' : 'Abrir briefing']);
    if (lower.includes('whatsapp') || lower.includes('contact')) tools.push(['whatsapp', 'WhatsApp']);
    if (lower.includes('pacote') || lower.includes('package')) tools.push(['packages', lang() === 'en' ? 'See packages' : 'Ver pacotes']);
    if (!tools.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'chatbot-tools';
    wrap.innerHTML = tools.slice(0, 3).map(([action, label]) => `<button type="button" data-chatbot-action="${action}">${esc(label)}</button>`).join('');
    messagesDiv.appendChild(wrap);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function openBriefing() {
    const btn = document.querySelector('[data-open-briefing]');
    if (btn) btn.click();
  }
  function openWhatsApp() {
    const text = lang() === 'en'
      ? 'Hello Lirandzo, I would like help choosing a package.'
      : 'Olá Lirandzo, gostaria de ajuda para escolher um pacote.';
    window.open(`https://wa.me/${CHATBOT_CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
  function goPackages() {
    document.querySelector('#pacotes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function createChatbotHTML() {
    const kb = t();
    const html = `
      <div class="chatbot-container" id="chatbotContainer" data-no-translate>
        <button class="chatbot-toggle" id="chatbotToggle" aria-label="Abrir chat" type="button">
          <span class="chatbot-toggle-dot" aria-hidden="true"></span>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h3v4l5-4h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        </button>
        <div class="chatbot-window" id="chatbotWindow" role="dialog" aria-label="Chat Lirandzo">
          <div class="chatbot-header">
            <div class="chatbot-header-info">
              <div class="chatbot-avatar" aria-hidden="true">A</div>
              <div><h4>${kb.assistantName} · Lirandzo</h4><span class="chatbot-status" id="chatbotStatus">${kb.status}</span></div>
            </div>
            <button class="chatbot-close" id="chatbotClose" type="button" aria-label="Fechar chat">×</button>
          </div>
          <div class="chatbot-intelligence-bar"><span></span>${lang() === 'en' ? 'Packages · Corporate · Support · Pricing' : 'Pacotes · Corporate · Apoio · Preços'}</div>
          <div class="chatbot-messages" id="chatbotMessages"></div>
          <div class="chatbot-typing" id="chatbotTyping" style="display:none;"><span></span><span></span><span></span></div>
          <form class="chatbot-input-area" id="chatbotForm" autocomplete="off">
            <input type="text" id="chatbotInput" placeholder="${kb.placeholder}" autocomplete="off">
            <button id="chatbotSend" type="submit" aria-label="Enviar mensagem">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M2 21L23 12 2 3v7l15 2-15 2v7z"/></svg>
            </button>
          </form>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function loadHistoryOrIntro() {
    try { state.history = JSON.parse(localStorage.getItem(CHATBOT_CONFIG.storageKey) || '[]').slice(-CHATBOT_CONFIG.maxStoredMessages); }
    catch { state.history = []; }
    const messages = document.getElementById('chatbotMessages');
    if (!messages) return;
    if (state.history.length) {
      state.history.slice(-8).forEach(item => addMessage(item.content, item.role === 'user', false));
    } else {
      addMessage(t().intro, false);
    }
    addActions();
  }

  function refreshLanguageTexts() {
    const kb = t();
    const status = document.getElementById('chatbotStatus');
    const input = document.getElementById('chatbotInput');
    const toggle = document.getElementById('chatbotToggle');
    const close = document.getElementById('chatbotClose');
    const bar = document.querySelector('.chatbot-intelligence-bar');
    if (status) status.textContent = kb.status;
    if (input) input.placeholder = kb.placeholder;
    if (toggle) toggle.setAttribute('aria-label', lang() === 'en' ? 'Open chat' : 'Abrir chat');
    if (close) close.setAttribute('aria-label', lang() === 'en' ? 'Close chat' : 'Fechar chat');
    if (bar) bar.innerHTML = `<span></span>${lang() === 'en' ? 'Packages · Corporate · Support · Pricing' : 'Pacotes · Corporate · Apoio · Preços'}`;
    document.querySelectorAll('.chatbot-actions').forEach(el => el.remove());
    addActions();
  }

  function setupChatbotPositioning() {
    const chatbotContainer = document.getElementById('chatbotContainer');
    const backToTopBtn = document.getElementById('backToTopBtn');
    const floatingNav = document.querySelector('.floating-nav');
    if (!chatbotContainer) return;
    const adjust = () => {
      const isMobile = window.innerWidth <= 768;
      chatbotContainer.style.left = isMobile ? '12px' : '18px';
      if (!isMobile) { chatbotContainer.style.bottom = '18px'; return; }
      const nav = floatingNav && window.getComputedStyle(floatingNav).display !== 'none';
      chatbotContainer.style.bottom = nav ? '76px' : '18px';
    };
    adjust();
    window.addEventListener('resize', adjust);
    window.addEventListener('scroll', adjust, { passive: true });
  }

  function initChatbot() {
    if (document.getElementById('chatbotContainer')) return;
    if (!document.querySelector('link[href^="chatbot-styles.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'chatbot-styles.css?v=lang-chatfix-v7';
      document.head.appendChild(link);
    }
    createChatbotHTML();
    loadHistoryOrIntro();
    setupChatbotPositioning();

    const toggle = document.getElementById('chatbotToggle');
    const win = document.getElementById('chatbotWindow');
    const close = document.getElementById('chatbotClose');
    const form = document.getElementById('chatbotForm');

    toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      win?.classList.toggle('active');
      document.body.classList.toggle('chatbot-open', !!win?.classList.contains('active'));
      refreshLanguageTexts();
    });
    close?.addEventListener('click', () => {
      win?.classList.remove('active');
      document.body.classList.remove('chatbot-open');
    });
    form?.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });

    document.addEventListener('click', (event) => {
      const container = document.getElementById('chatbotContainer');
      if (container && win && !container.contains(event.target) && win.classList.contains('active')) {
        win.classList.remove('active');
        document.body.classList.remove('chatbot-open');
      }
    });

    document.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-chatbot-chip]');
      if (chip) { sendMessage(chip.getAttribute('data-chatbot-chip')); return; }
      const action = event.target.closest('[data-chatbot-action]')?.getAttribute('data-chatbot-action');
      if (action === 'briefing') openBriefing();
      if (action === 'whatsapp') openWhatsApp();
      if (action === 'packages') goPackages();
    });

    window.addEventListener('storage', refreshLanguageTexts);
    window.addEventListener('lirandzo:language-change', refreshLanguageTexts);
    window.addEventListener('lirandzo:languagechange', refreshLanguageTexts);
    document.addEventListener('lirandzo:language-change', refreshLanguageTexts);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initChatbot);
  else initChatbot();
})();
