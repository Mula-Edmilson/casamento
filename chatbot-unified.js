// ==================== CONFIGURAÇÃO ====================
const CHATBOT_CONFIG = {
    whatsappNumber: "258878061697",
    apiKey: "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"
};

// ==================== BASE DE CONHECIMENTO ====================
const FALLBACK_RESPONSES = {
    saudacao: [
        "Olá! 😊 Sou a Lira, da Lirandzo. Como posso ajudar com o convite de casamento?",
        "Oi! Tudo bem? Estou aqui para ajudar a escolher o convite perfeito para vocês!",
        "Olá! Preparados para criar um convite digital inesquecível? 😊"
    ],
    
    sobre: `A Lirandzo é uma empresa moçambicana especializada em convites digitais para casamentos. 

✨ **O que fazemos:** Criamos mini-sites personalizados que funcionam como convites interativos.

💚 **Nossa missão:** Ajudar casais a contar a sua história de amor através de design elegante, simplicidade e tecnologia.

🌍 **Onde estamos:** Moçambique, mas atendemos casais de todo o país!

Quer saber mais sobre algum aspecto específico? 😊`,

    modelos: `Temos **quatro modelos principais**, cada um com características únicas:

✨ **Elegância Clássica - 1.500 MT**
• Design intemporal com tipografia sofisticada
• Inclui: capa com foto, agenda com mapa, confirmação

🌸 **Jardim Secreto - 2.500 MT**
• Elegante e floral, perfeito para casamentos ao ar livre
• Inclui: contagem regressiva, música, galeria, sugestões de presentes e traje

💫 **Amor Moderno - 3.500 MT**
• Minimalista, focado na vossa fotografia
• Inclui: sessão pré-casamento com 6 fotos, tudo do modelo anterior

🌿 **Rústico Chic - 5.000 MT**
• Tons terra e sensação acolhedora
• Inclui: sessão pré-casamento (6 fotos + 1 vídeo), painel administrativo para gestão do evento

Todos 100% personalizáveis! Qual deles mais combina com vocês?`,

    comparacao: `Aqui está a comparação completa dos nossos pacotes:

✨ **Elegância Clássica (1.500 MT):** Funcionalidades básicas: capa, agenda, confirmação
🌸 **Jardim Secreto (2.500 MT):** Adiciona música, galeria, contagem regressiva, presentes, traje
💫 **Amor Moderno (3.500 MT):** Adiciona sessão pré-casamento (6 fotos)
🌿 **Rústico Chic (5.000 MT):** Adiciona vídeo teaser + painel administrativo

Qual modelo gostariam de conhecer melhor? 😊`,

    precos: `Nossos preços variam conforme o modelo escolhido:

💎 **Elegância Clássica:** 1.500 MT
🌸 **Jardim Secreto:** 2.500 MT
💫 **Amor Moderno:** 3.500 MT
🌿 **Rústico Chic:** 5.000 MT

**Pagamento:** 50% no início, 50% antes da entrega.
**Revisões:** Até 2 gratuitas.

Quer saber o que cada modelo inclui? 😊`,

    prazos: `⏰ **Prazo de entrega:** 3 a 5 dias úteis após recebermos todo o material:

📸 Fotos do casal (mínimo 6 para os modelos completos)
📝 Textos (nomes, data, local, programa)
🎵 Música (se quiserem)

O processo é simples:
1️⃣ Escolhem o modelo
2️⃣ Enviam os dados (fotos, textos, música)
3️⃣ Criamos o convite em 3-5 dias
4️⃣ Fazemos até 2 revisões
5️⃣ Recebem o link para partilhar com os convidados`,

    como_funciona: `O nosso processo é simples, rápido e totalmente focado em vocês:

**Passo 1:** Escolhem o modelo que mais fala ao vosso coração.
**Passo 2:** Enviam-nos as vossas fotos, textos, músicas e detalhes do evento.
**Passo 3:** Em 3-5 dias úteis, o vosso convite digital exclusivo estará pronto a partilhar!

Depois de pronto, recebem um link que podem enviar para todos os convidados via WhatsApp, email ou redes sociais. 😊`,

    vantagens: `**Porquê escolher um convite digital da Lirandzo?**

📱 **Interativo e Completo:** Integre mapas GPS, música, galeria de fotos e RSVP instantâneo
💚 **Ecológico e Moderno:** Solução elegante e sustentável
📲 **Partilha Fácil e Ilimitada:** Envie para todos sem custos adicionais
⚡ **Instantâneo:** Os convidados recebem e confirmam na hora
📊 **RSVP Automático:** Organize a lista de convidados sem esforço
🎨 **100% Personalizável:** Cores, fontes, músicas, fotos - tudo pode ser adaptado`,

    rsvp: `**Sobre a confirmação de presença (RSVP):**

O convite inclui um botão de "Confirmar Presença". O convidado pode:
✅ Preencher um formulário simples
✅ Ser redirecionado para o WhatsApp com uma mensagem pré-definida

É rápido, fácil e ajuda-vos a organizar a lista de convidados sem esforço! 😊`,

    musica_fotos: `**Música e Fotos nos convites:**

🎵 **Música:** Podemos incluir música de fundo no vosso convite. Enviem o ficheiro MP3 ou link.

📸 **Fotos:**
- Modelo Elegância Clássica: mínimo 1 foto para capa
- Modelos Jardim Secreto e Amor Moderno: recomendamos 6-10 fotos
- Modelo Rústico Chic: inclui sessão pré-casamento (6 fotos + 1 vídeo)

Todas as fotos devem ser de alta qualidade para um resultado perfeito!`,

    contato: `**Fale connosco!** 😊

📱 **WhatsApp:** https://wa.me/258878061697
📧 **Email:** lirandzo.mz@gmail.com
🌐 **Site:** https://lirandzo.com

🕒 **Horário:** Segunda a Sexta, 09:00 - 17:00

Estamos aqui para atendimento personalizado!`,

    faq: `**Perguntas Frequentes:**

❓ **O que é um convite digital?**
É um mini-site exclusivo para o seu casamento com contagem regressiva, mapas, galeria de fotos, confirmação de presença e muito mais.

❓ **Como funciona a confirmação de presença?**
O convite inclui um botão "Confirmar Presença". O convidado preenche um formulário simples ou é redirecionado para o WhatsApp.

❓ **Posso personalizar o design?**
Sim! Todos os modelos são 100% personalizáveis.

❓ **Quanto tempo fica online?**
Até 60 dias após a data do casamento.`,

    privacidade: `**Política de Privacidade - Resumo:**

🔒 **O que recolhemos:**
• Noivos: nome, email, telefone, detalhes do evento
• Conteúdo: fotos, vídeos, textos
• Convidados (RSVP): nome, acompanhantes

🔒 **Como usamos:**
• Apenas para criar o convite e gerir RSVP
• **NÃO vendemos dados a terceiros**

Para a política completa, visite: https://lirandzo.com/privacidade.html`,

    termos: `**Termos de Uso - Resumo:**

📜 **Responsabilidades do cliente:**
• Fornecer conteúdo atempadamente
• Garantir direitos autorais das fotos/músicas
• Rever e aprovar o convite final

📜 **Pagamento:**
• 50% para iniciar, 50% antes da entrega
• Sem reembolsos após início (produto personalizado)

Termos completos: https://lirandzo.com/termos.html`,

    blog: `**Blog Lirandzo - Dicas e Inspirações:**

📝 **5 razões para escolher um convite digital**
📝 **Como escolher o modelo ideal**
📝 **RSVP: gerir convidados sem stress**
📝 **Tons terra e elegância: rústico chic**
📝 **Dicas para sessão de pré-casamento**
📝 **Checklist completa para o casamento**

Visitem: https://lirandzo.com/blog.html para ler todos os artigos! 😊`,

    site: `O site da Lirandzo (https://lirandzo.com) tem todas as informações sobre os nossos serviços:

🏠 **Página inicial:** Visão geral dos modelos e vantagens
📋 **Modelos:** Detalhes de cada pacote
❓ **FAQ:** Perguntas frequentes
📞 **Contato:** WhatsApp e email
📜 **Termos e Privacidade:** Informações legais
📝 **Blog:** Dicas e inspirações para casamentos`,

    modelo_classico: `**Elegância Clássica - 1.500 MT**

Design intemporal com tipografia sofisticada.

**Inclui:**
✔ Capa com foto e nomes
✔ Agenda do evento com mapa GPS
✔ Confirmação de presença (Email/WhatsApp)

Perfeito para quem busca simplicidade com elegância! ✨`,

    modelo_jardim: `**Jardim Secreto - 2.500 MT**

Elegante e floral, ideal para casamentos ao ar livre.

**Inclui:**
✔ Capa com foto e nomes
✔ Agenda com mapa GPS
✔ Confirmação de presença
✔ Contagem regressiva
✔ Música de fundo
✔ Galeria de fotos
✔ Opções de presentes
✔ Sugestões de traje

Romântico e completo! 🌸`,

    modelo_moderno: `**Amor Moderno - 3.500 MT**

Minimalista, focado na vossa fotografia.

**Inclui:**
✔ Tudo do modelo Jardim Secreto
✔ Sessão pré-casamento com 6 fotos

Moderno e sofisticado! 💫`,

    modelo_rustico: `**Rústico Chic - 5.000 MT**

Tons terra e sensação acolhedora.

**Inclui:**
✔ Tudo do modelo Amor Moderno
✔ Sessão pré-casamento: 6 fotos + 1 vídeo teaser
✔ Painel administrativo para melhor gestão do evento

O pacote mais completo, ideal para casamentos em quintas! 🌿`,

    default: [
        "Desculpa, não entendi completamente. Pode me perguntar sobre modelos, preços, prazos, como funciona, ou dar uma olhada no nosso site? 😊",
        "Estou aqui para ajudar! Posso falar sobre os modelos, preços, processo de criação, ou dicas do blog. O que gostaria de saber?",
        "Pode perguntar sobre: modelos e preços, prazos de entrega, como funciona o RSVP, música e fotos, ou sobre a Lirandzo. Também temos dicas no blog! 😊"
    ]
};

// ==================== FUNÇÃO DE FALLBACK ====================
function getFallbackResponse(message) {
    const lower = message.toLowerCase();
    
    // Saudações
    if (lower.match(/\b(ol[áa]|oi|hey|bom dia|boa tarde|boa noite|tudo bem)\b/)) {
        return FALLBACK_RESPONSES.saudacao[Math.floor(Math.random() * FALLBACK_RESPONSES.saudacao.length)];
    }
    
    // Sobre a Lirandzo / empresa
    if (lower.match(/\b(o que é lirandzo|quem é|sobre a lirandzo|quem são|história|empresa)\b/)) {
        return FALLBACK_RESPONSES.sobre;
    }
    
    // Modelos em geral
    if (lower.match(/\b(modelo|modelos|tipos|opções|quantos modelos|quais são os modelos)\b/)) {
        return FALLBACK_RESPONSES.modelos;
    }
    
    // Comparação entre modelos
    if (lower.match(/\b(comparação|comparar|diferença entre|qual a diferença|qual escolher)\b/)) {
        return FALLBACK_RESPONSES.comparacao;
    }
    
    // Preços
    if (lower.match(/\b(pre[çc]o|valor|custa|quanto|orçamento|preços|quanto custa)\b/)) {
        return FALLBACK_RESPONSES.precos;
    }
    
    // Prazos e entrega
    if (lower.match(/\b(prazo|tempo|demora|entrega|quanto tempo|quando fica pronto|prazo de entrega)\b/)) {
        return FALLBACK_RESPONSES.prazos;
    }
    
    // Como funciona / processo
    if (lower.match(/\b(como funciona|processo|passo a passo|como criar|como fazer|funciona)\b/)) {
        return FALLBACK_RESPONSES.como_funciona;
    }
    
    // Vantagens / benefícios
    if (lower.match(/\b(vantagem|benefício|diferença|porquê|porque escolher|melhor|vantagens)\b/)) {
        return FALLBACK_RESPONSES.vantagens;
    }
    
    // RSVP / confirmação de presença
    if (lower.match(/\b(rsvp|confirmação|confirmar presença|confirmar|presença)\b/)) {
        return FALLBACK_RESPONSES.rsvp;
    }
    
    // Música e fotos
    if (lower.match(/\b(música|musica|fotos|fotografias|imagens|foto|som|audio|canção)\b/)) {
        return FALLBACK_RESPONSES.musica_fotos;
    }
    
    // Contato / WhatsApp
    if (lower.match(/\b(whatsapp|wpp|zap|telefone|contato|contacto|falar|email|falar connosco)\b/)) {
        return FALLBACK_RESPONSES.contato;
    }
    
    // FAQ / perguntas frequentes
    if (lower.match(/\b(faq|perguntas frequentes|dúvidas|perguntas|dúvida)\b/)) {
        return FALLBACK_RESPONSES.faq;
    }
    
    // Privacidade
    if (lower.match(/\b(privacidade|dados|política de privacidade|informações pessoais|dados pessoais)\b/)) {
        return FALLBACK_RESPONSES.privacidade;
    }
    
    // Termos de uso
    if (lower.match(/\b(termos|condições|termos de uso|termos e condições)\b/)) {
        return FALLBACK_RESPONSES.termos;
    }
    
    // Blog / dicas
    if (lower.match(/\b(blog|dicas|artigos|inspiração|tendências|checklist)\b/)) {
        return FALLBACK_RESPONSES.blog;
    }
    
    // Site / página
    if (lower.match(/\b(site|website|página|online)\b/)) {
        return FALLBACK_RESPONSES.site;
    }
    
    // Modelos específicos
    if (lower.includes('clássica') || lower.includes('classica') || (lower.includes('elegância') && lower.includes('clássica'))) {
        return FALLBACK_RESPONSES.modelo_classico;
    }
    
    if (lower.includes('jardim') || lower.includes('secreto')) {
        return FALLBACK_RESPONSES.modelo_jardim;
    }
    
    if (lower.includes('amor moderno') || (lower.includes('amor') && lower.includes('moderno'))) {
        return FALLBACK_RESPONSES.modelo_moderno;
    }
    
    if (lower.includes('rústico') || lower.includes('rustico') || lower.includes('chic')) {
        return FALLBACK_RESPONSES.modelo_rustico;
    }
    
    // Agradecimentos
    if (lower.match(/\b(obrigad[oa]|valeu|agradeço|obg|thanks|brigado)\b/)) {
        return "Imagina! 😊 Estou aqui para ajudar. Precisa de mais alguma informação sobre os convites digitais?";
    }
    
    // Interesse / quero contratar
    if (lower.match(/\b(interessad[oa]|gostaria|queria|quero|procuro|preciso|tenho interesse|quero contratar)\b/)) {
        return "Que bom que gostaram! 😊 Para começar, precisamos que escolham um modelo e enviem as fotos, textos e música. Querem saber mais detalhes sobre algum modelo específico?";
    }
    
    // Resposta padrão
    return FALLBACK_RESPONSES.default[Math.floor(Math.random() * FALLBACK_RESPONSES.default.length)];
}

// ==================== FUNÇÃO PRINCIPAL ASKCHATGPT ====================
async function askChatGPT(message) {
    // Primeiro tenta a API da OpenAI
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout
        
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CHATBOT_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4.1-mini",
                messages: [
                    {
                        role: "system",
                        content: `Você é a Lira, assistente virtual da Lirandzo, uma empresa moçambicana de convites digitais para casamentos. 
                        
INFORMAÇÕES DA EMPRESA:
- Site: https://lirandzo.com
- Modelos: Elegância Clássica (1.500 MT), Jardim Secreto (2.500 MT), Amor Moderno (3.500 MT), Rústico Chic (5.000 MT)
- Prazo: 3-5 dias úteis
- Incluso: mapa, RSVP, música, galeria, contagem regressiva
- Contato: WhatsApp https://wa.me/258878061697, email lirandzo.mz@gmail.com

REGRAS DE COMPORTAMENTO:
- Fale apenas português de Moçambique
- Seja simpática, amigável e natural
- Responda de forma curta e direta (máximo 3 frases)
- Use emojis moderadamente
- Se não souber responder algo, direcione para o site ou WhatsApp
- Mantenha o foco nos convites digitais de casamento`
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                temperature: 0.7,
                max_tokens: 100
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error('OpenAI API error status:', response.status);
            
            if (response.status === 429) {
                console.log('Cota da API excedida, usando fallback local');
                return getFallbackResponse(message);
            }
            
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data?.choices?.[0]?.message?.content) {
            throw new Error("Resposta inválida da OpenAI");
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error("Erro na chamada da OpenAI:", error);
        
        // Se for erro de timeout ou abort, também usa fallback
        if (error.name === 'AbortError') {
            console.log('Timeout da API, usando fallback local');
        }
        
        // Retorna resposta baseada na mensagem do usuário
        return getFallbackResponse(message);
    }
}

// ==================== FUNÇÕES DO CHATBOT ====================
function showTyping() {
    const typing = document.getElementById('chatbotTyping');
    if (typing) typing.style.display = 'flex';
}

function hideTyping() {
    const typing = document.getElementById('chatbotTyping');
    if (typing) typing.style.display = 'none';
}

function addMessage(text, isUser = false) {
    const messagesDiv = document.getElementById('chatbotMessages');
    if (!messagesDiv) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    
    const avatar = isUser ? '👤' : '✨';
    
    let processedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${processedText}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chatbotInput');
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    addMessage(message, true);
    input.value = '';
    showTyping();
    
    try {
        const reply = await askChatGPT(message);
        hideTyping();
        addMessage(reply, false);
    } catch (error) {
        hideTyping();
        console.error('Erro:', error);
        addMessage('Desculpa, ocorreu um erro. Tenta novamente 😊', false);
    }
}

// ==================== CRIAÇÃO DO HTML ====================
function createChatbotHTML() {
    const chatbotHTML = `
        <div class="chatbot-container" id="chatbotContainer">
            <button class="chatbot-toggle" id="chatbotToggle" aria-label="Abrir chat">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
            </button>
            
            <div class="chatbot-window" id="chatbotWindow">
                <div class="chatbot-header">
                    <div class="chatbot-header-info">
                        <div class="chatbot-avatar">
                            <img src="https://i.postimg.cc/T3tNdXL6/lirandzo.png" alt="Lirandzo">
                        </div>
                        <div>
                            <h4>Lira · Lirandzo</h4>
                            <span class="chatbot-status">online</span>
                        </div>
                    </div>
                    <button class="chatbot-close" id="chatbotClose">×</button>
                </div>
                
                <div class="chatbot-messages" id="chatbotMessages">
                    <div class="message bot">
                        <div class="message-avatar">✨</div>
                        <div class="message-content">
                            Olá! Sou a Lira, da Lirandzo 😊 Como posso ajudar vocês hoje?
                        </div>
                    </div>
                </div>
                
                <div class="chatbot-typing" id="chatbotTyping" style="display: none;">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                
                <div class="chatbot-input-area">
                    <input type="text" id="chatbotInput" placeholder="Escreva sua mensagem..." autocomplete="off">
                    <button id="chatbotSend">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="currentColor" d="M2 21L23 12 2 3v7l15 2-15 2v7z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', chatbotHTML);
}

// ==================== INICIALIZAÇÃO ====================
function initChatbot() {
    // Carrega o CSS primeiro
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'chatbot-styles.css';
    document.head.appendChild(link);
    
    // Cria o HTML
    createChatbotHTML();
    
    // Event listeners
    setTimeout(() => {
        const toggle = document.getElementById('chatbotToggle');
        const window = document.getElementById('chatbotWindow');
        const close = document.getElementById('chatbotClose');
        const send = document.getElementById('chatbotSend');
        const input = document.getElementById('chatbotInput');
        
        if (toggle && window) {
            toggle.addEventListener('click', () => window.classList.add('active'));
        }
        
        if (close && window) {
            close.addEventListener('click', () => window.classList.remove('active'));
        }
        
        if (send) {
            send.addEventListener('click', sendMessage);
        }
        
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage();
            });
        }
        
        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            const container = document.getElementById('chatbotContainer');
            const window = document.getElementById('chatbotWindow');
            if (container && window && !container.contains(e.target) && window.classList.contains('active')) {
                window.classList.remove('active');
            }
        });
    }, 100);
}

// Auto-inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
} else {
    initChatbot();
}
// ==================== GERENCIAMENTO DE SOBREPOSIÇÃO ====================
function setupChatbotPositioning() {
    const chatbotContainer = document.getElementById('chatbotContainer');
    const backToTopBtn = document.getElementById('backToTopBtn');
    const floatingNav = document.querySelector('.floating-nav');
    
    if (!chatbotContainer) return;
    
    // Remove classes de posição anteriores
    function removePositionClasses() {
        chatbotContainer.classList.remove(
            'position-normal',
            'position-above-nav',
            'position-above-backtop',
            'position-above-both'
        );
    }
    
    function adjustChatbotPosition() {
        // Verifica se estamos em mobile
        const isMobile = window.innerWidth <= 768;
        
        if (!isMobile) {
            // Desktop: posição padrão (esquerda)
            chatbotContainer.style.bottom = '20px';
            chatbotContainer.style.left = '20px';
            removePositionClasses();
            return;
        }
        
        // Mobile: verificar visibilidade dos elementos
        const isBackToTopVisible = backToTopBtn && backToTopBtn.classList.contains('show');
        const isFloatingNavVisible = floatingNav && window.getComputedStyle(floatingNav).display !== 'none';
        
        removePositionClasses();
        
        // Decide a posição baseado nos elementos visíveis
        if (isBackToTopVisible && isFloatingNavVisible) {
            // Ambos visíveis - posiciona acima de ambos
            chatbotContainer.style.bottom = '120px';
            chatbotContainer.classList.add('position-above-both');
        } else if (isBackToTopVisible) {
            // Apenas botão voltar ao topo visível
            chatbotContainer.style.bottom = '90px';
            chatbotContainer.classList.add('position-above-backtop');
        } else if (isFloatingNavVisible) {
            // Apenas nav flutuante visível
            chatbotContainer.style.bottom = '100px';
            chatbotContainer.classList.add('position-above-nav');
        } else {
            // Nenhum elemento especial visível
            chatbotContainer.style.bottom = '20px';
            chatbotContainer.classList.add('position-normal');
        }
        
        chatbotContainer.style.left = '10px'; /* Consistente com o CSS */
    }
    
    // Ajustar inicialmente
    adjustChatbotPosition();
    
    // Observar mudanças na classe do botão voltar ao topo
    if (backToTopBtn) {
        const observer = new MutationObserver(adjustChatbotPosition);
        observer.observe(backToTopBtn, { attributes: true, attributeFilter: ['class'] });
    }
    
    // Observar mudanças no estilo da nav flutuante
    if (floatingNav) {
        const navObserver = new MutationObserver(adjustChatbotPosition);
        navObserver.observe(floatingNav, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    
    // Ajustar ao redimensionar a janela
    window.addEventListener('resize', adjustChatbotPosition);
    
    // Ajustar ao scroll (para o botão voltar ao topo)
    window.addEventListener('scroll', adjustChatbotPosition);
}

// Modificar a função initChatbot para incluir o novo posicionamento
function initChatbot() {
    // Carrega o CSS primeiro
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'chatbot-styles.css';
    document.head.appendChild(link);
    
    // Cria o HTML
    createChatbotHTML();
    
    // Configura o posicionamento inteligente
    setTimeout(() => {
        setupChatbotPositioning();
        
        // Event listeners existentes
        const toggle = document.getElementById('chatbotToggle');
        const window = document.getElementById('chatbotWindow');
        const close = document.getElementById('chatbotClose');
        const send = document.getElementById('chatbotSend');
        const input = document.getElementById('chatbotInput');
        
        if (toggle && window) {
            toggle.addEventListener('click', () => window.classList.add('active'));
        }
        
        if (close && window) {
            close.addEventListener('click', () => window.classList.remove('active'));
        }
        
        if (send) {
            send.addEventListener('click', sendMessage);
        }
        
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage();
            });
        }
        
        // Fechar ao clicar fora (adaptado para o lado esquerdo)
        document.addEventListener('click', (e) => {
            const container = document.getElementById('chatbotContainer');
            const window = document.getElementById('chatbotWindow');
            if (container && window && !container.contains(e.target) && window.classList.contains('active')) {
                window.classList.remove('active');
            }
        });
    }, 200);
}