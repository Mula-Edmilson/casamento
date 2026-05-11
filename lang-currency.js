(function () {
  'use strict';

  const LANG_KEY = 'lirandzo-language';
  const CURRENCY_KEY = 'lirandzo-currency';
  const defaultLang = 'pt';
  let currentLang = localStorage.getItem(LANG_KEY) === 'en' ? 'en' : defaultLang;
  let translating = false;
  let observerTimer = null;
  let updatingCurrency = false;

  const originalPageTitle = document.title;
  const originalDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const translations = {
    // Header / navigation
    'Saltar para o conteúdo principal': 'Skip to main content',
    'Navegação principal Lirandzo': 'Lirandzo main navigation',
    'Lirandzo — início': 'Lirandzo — home',
    'CONVITES DIGITAIS': 'DIGITAL INVITATIONS',
    'Secções do site': 'Site sections',
    'Início': 'Home',
    'Pacotes': 'Packages',
    'Quiz': 'Quiz',
    'Como Funciona': 'How it works',
    'Testemunhos': 'Testimonials',
    'FAQ': 'FAQ',
    'Sobre': 'About',
    'Contacto': 'Contact',
    '♡ Quero o meu convite': '♡ I want my invitation',
    'Quero o meu convite': 'I want my invitation',
    'Escolher idioma': 'Choose language',
    'Idiomas disponíveis': 'Available languages',
    'Português': 'Portuguese',
    'Alternar tema': 'Toggle theme',
    'Tema claro': 'Light theme',
    'Tema escuro': 'Dark theme',

    // Hero / value
    'Convites Digitais e Soluções Corporate': 'Digital Invitations and Corporate Solutions',
    'Pacotes digitais elegantes para casamentos e propostas corporate com design cuidado, organização clara e activação orientada ao objectivo.': 'Elegant digital packages for weddings and corporate proposals, with refined design, clear organisation and goal-oriented activation.',
    'Ver Pacotes': 'View packages',
    'Ver pacotes': 'View packages',
    'Veja a Experiência em Ação': 'See the Experience in Action',
    'Do primeiro impacto visual à consulta dos detalhes do evento, este é o tipo de experiência que os vossos convidados recebem.': 'From the first visual impact to checking the event details, this is the kind of experience your guests receive.',
    'Mais que um Convite': 'More than an Invitation',
    'Cada pacote foi pensado para unir design, organização e emoção numa experiência digital mais completa para o vosso evento.': 'Each package was designed to combine design, organisation and emotion into a more complete digital experience for your event.',
    'Experiência do evento num só link': 'Your event experience in one link',
    'Agenda com mapa, contagem regressiva, música, feed de felicitações reunidos numa apresentação elegante e fácil de partilhar.': 'Schedule with map, countdown, music, congratulations feed brought together in an elegant, easy-to-share presentation.',
    'Partilha simples, imagem premium': 'Simple sharing, premium image',
    'O convite continua leve para enviar por WhatsApp, email ou redes sociais, mas com presença visual muito mais forte e profissional.': 'The invitation remains lightweight to send via WhatsApp, email or social media, while carrying a much stronger and more professional visual presence.',
    'Mais controlo e mais memória': 'More control and more memories',
    'Nos pacotes superiores, a Lirandzo acrescenta dashboard de convidados, presentes, dress code, check-in e cápsula de tempo virtual.': 'In the higher packages, Lirandzo adds guest dashboard, gifts, dress code, check-in and a virtual time capsule.',

    // Packages
    'PACOTES': 'PACKAGES',
    'Escolha o pacote ideal': 'Choose the right package',
    'Soluções completas para momentos inesquecíveis': 'Complete solutions for unforgettable moments',
    'Abrir detalhes do pacote Pérola': 'Open Pearl package details',
    'Abrir detalhes do pacote Esmeralda': 'Open Emerald package details',
    'Abrir detalhes do pacote Rubi': 'Open Ruby package details',
    'Abrir detalhes do pacote Corporate': 'Open Corporate package details',
    'Pacote Pérola': 'Pearl Package',
    'Pacote Esmeralda': 'Emerald Package',
    'Pacote Rubi': 'Ruby Package',
    'Pacote Corporate': 'Corporate Package',
    'PÉROLA': 'PEARL',
    'ESMERALDA': 'EMERALD',
    'RUBI': 'RUBY',
    'CORPORATE': 'CORPORATE',
    'Todos os recursos essenciais': 'All essential features',
    'Convite elegante e personalizado': 'Elegant and personalised invitation',
    'Ideal para casamentos intimistas': 'Ideal for intimate weddings',
    'Tudo do Pacote Pérola': 'Everything in the Pearl Package',
    'Recursos exclusivos': 'Exclusive features',
    'Experiência ainda mais completa': 'An even more complete experience',
    'Tudo do Pacote Esmeralda': 'Everything in the Emerald Package',
    'Recursos premium': 'Premium features',
    'Máxima exclusividade': 'Maximum exclusivity',
    'Soluções para empresas': 'Solutions for companies',
    'Projectos personalizados': 'Custom projects',
    'Atendimento dedicado': 'Dedicated service',
    'Ver detalhes': 'View details',
    'Pedir orçamento': 'Request quote',
    'Pedir Orçamento': 'Request quote',
    'Sob consulta': 'Upon request',
    'Pagamento seguro e suporte dedicado em todos os pacotes.': 'Secure payment and dedicated support across all packages.',
    'Conversor de moedas': 'Currency converter',
    'Valores indicativos para clientes fora de Moçambique. O câmbio pode variar no momento do pagamento.': 'Indicative values for clients outside Mozambique. Exchange rates may vary at the time of payment.',
    'Moeda': 'Currency',
    'Metical moçambicano': 'Mozambican metical',
    'Dólar americano': 'US dollar',
    'Kwanza angolano': 'Angolan kwanza',
    'Câmbio indicativo': 'Indicative exchange rate',
    'Moeda base: MZN': 'Base currency: MZN',
    'Proposta personalizada após briefing.': 'Custom proposal after briefing.',
    'Base': 'Base',

    // Features for dynamic package modal
    'Capa com Foto e Nomes': 'Cover with Photo and Names',
    'Agenda do Evento (com mapa)': 'Event Schedule (with map)',
    'Feed de Felicitações': 'Congratulations Feed',
    'Contagem Regressiva': 'Countdown',
    'Música de Fundo': 'Background Music',
    'Lembrete automático da data do evento': 'Automatic event date reminder',
    'Presentes de Casamento': 'Wedding Gifts',
    'Sessão Pré-Wedding (Fotos 5)': 'Pre-Wedding Session (Photos 5)',
    'Sessão Pré-Wedding (Fotos 7 + 1 Vídeo)': 'Pre-Wedding Session (Photos 7 + 1 Video)',
    'Sugestões de Dress Code': 'Dress Code Suggestions',
    'Cápsula de tempo virtual até 1GB por 15 dias': 'Virtual time capsule up to 1GB for 15 days',
    'Cápsula de tempo virtual até 1GB por 30 dias': 'Virtual time capsule up to 1GB for 30 days',
    'Dashboard de Convidados': 'Guest Dashboard',
    'Convite Exclusivo': 'Exclusive Invitation',
    'Check-In': 'Check-In',
    'Por analisar e acrescentar': 'To be reviewed and added',
    'Briefing estratégico compacto': 'Compact strategic briefing',
    'Design alinhado à marca': 'Brand-aligned design',
    'Proposta e preço definidos sob consulta': 'Proposal and price defined upon request',

    // Quiz
    'Descubra o Pacote Certo': 'Find the Right Package',
    'Responda a 3 perguntas rápidas para perceber qual dos pacotes de casamento Lirandzo se ajusta melhor ao nível de experiência que pretendem.': 'Answer 3 quick questions to understand which Lirandzo wedding package best matches the level of experience you want.',
    '1. O que é mais importante para vocês?': '1. What is most important to you?',
    'Ter um convite elegante e essencial': 'Having an elegant and essential invitation',
    'Ter mais organização e funcionalidades': 'Having more organisation and features',
    'Ter uma experiência premium e diferenciada': 'Having a premium and distinctive experience',
    'Combinar imagem bonita com recursos úteis': 'Combining beautiful visuals with useful features',
    '2. Que nível de extras pretendem no convite?': '2. What level of extras do you want in the invitation?',
    'Só os elementos principais do evento': 'Only the main event elements',
    'Presentes, dress code e lembretes': 'Gifts, dress code and reminders',
    'Vídeo, check-in e cápsula de tempo estendida': 'Video, check-in and extended time capsule',
    'Dashboard e mais apoio à organização': 'Dashboard and more organisational support',
    '3. Como imaginam a experiência final?': '3. How do you imagine the final experience?',
    'Simples, bonita e directa': 'Simple, beautiful and direct',
    'Completa, organizada e memorável': 'Complete, organised and memorable',
    'Exclusiva, premium e com mais camadas': 'Exclusive, premium and more layered',
    'Com forte impacto visual e mais cobertura': 'With strong visual impact and more coverage',
    'O pacote mais indicado é...': 'The most suitable package is...',
    'Ver todos os pacotes': 'View all packages',

    // Process
    'O nosso processo é simples, rápido e organizado, tanto para casamentos como para pedidos Corporate.': 'Our process is simple, fast and organised, both for weddings and Corporate requests.',
    'Escolha o Pacote': 'Choose the Package',
    'Compare os pacotes e escolha o nível de experiência que melhor responde ao vosso evento.': 'Compare the packages and choose the level of experience that best suits your event.',
    'Envie os Seus Dados': 'Send Your Details',
    'Partilhe connosco as vossas fotos, textos, músicas e detalhes do evento.': 'Share your photos, texts, music and event details with us.',
    'Receba o Seu Link': 'Receive Your Link',
    'Em 3 a 5 dias úteis, o vosso convite digital estará pronto para revisão, aprovação e partilha.': 'Within 3 to 5 business days, your digital invitation will be ready for review, approval and sharing.',

    // Testimonials
    'TESTEMUNHOS': 'TESTIMONIALS',
    'O que nossos clientes dizem': 'What our clients say',
    'Histórias reais de quem confiou na Lirandzo': 'Real stories from people who trusted Lirandzo',
    'Testemunhos de clientes em movimento contínuo': 'Client testimonials in continuous motion',
    'O convite superou todas as nossas expectativas. Simples, elegante e muito fácil de partilhar com os convidados.': 'The invitation exceeded all our expectations. Simple, elegant and very easy to share with guests.',
    'Atendimento impecável e um convite digital que encantou todos os nossos convidados. Recomendamos de olhos fechados.': 'Impeccable service and a digital invitation that delighted all our guests. We fully recommend it.',
    'Profissionalismo e criatividade em cada detalhe. O resultado ficou bonito, organizado e com uma sensação premium.': 'Professionalism and creativity in every detail. The result was beautiful, organised and premium-feeling.',
    'Casamento em Maputo': 'Wedding in Maputo',
    'Casamento em Beira': 'Wedding in Beira',
    'Casamento em Nampula': 'Wedding in Nampula',
    '5 de 5 estrelas': '5 out of 5 stars',
    'Cliente Lirandzo': 'Lirandzo client',

    // FAQ
    'Perguntas Frequentes': 'Frequently Asked Questions',
    'Tudo o que precisa de saber antes de escolher o pacote ideal para o vosso convite digital.': 'Everything you need to know before choosing the right package for your digital invitation.',
    'Precisa de ajuda rápida?': 'Need quick help?',
    'Fale connosco antes de escolher o pacote.': 'Talk to us before choosing your package.',
    'Abrir WhatsApp': 'Open WhatsApp',
    'O que é um convite de casamento digital?': 'What is a digital wedding invitation?',
    'É um mini-site exclusivo para o vosso casamento. Em vez de um cartão físico, os convidados recebem um link com a informação do evento e os recursos incluídos no pacote escolhido.': 'It is an exclusive mini-site for your wedding. Instead of a physical card, guests receive a link with event information and the features included in the chosen package.',
    'Qual pacote devo escolher?': 'Which package should I choose?',
    'O pacote Pérola é ideal para uma entrega elegante e essencial. O Esmeralda acrescenta mais organização, funcionalidades e memória visual. O Rubi é a opção premium, com vídeo, check-in e maior profundidade de experiência.': 'The Pearl package is ideal for an elegant and essential delivery. Emerald adds more organisation, features and visual memory. Ruby is the premium option, with video, check-in and a deeper experience.',
    'Posso personalizar o pacote que escolher?': 'Can I personalise the package I choose?',
    'Sim. A base funcional segue o pacote contratado, mas a identidade visual, os conteúdos e vários detalhes do convite são adaptados à história e ao estilo do casal.': 'Yes. The functional base follows the selected package, but the visual identity, content and several invitation details are adapted to the couple\'s story and style.',
    'Quanto tempo demora a ter o meu convite pronto?': 'How long does it take to get my invitation ready?',
    'Após a confirmação do pagamento e o envio dos materiais necessários, a entrega acontece normalmente entre 3 e 5 dias úteis.': 'After payment confirmation and submission of the required materials, delivery usually takes 3 to 5 business days.',
    'Posso pagar noutras moedas?': 'Can I pay in other currencies?',
    'Sim. A estrutura comercial pode trabalhar com valores fixados em moeda estrangeira sob consulta prévia, mantendo clareza antes da adjudicação.': 'Yes. The commercial structure can work with values set in foreign currency after prior consultation, keeping clarity before approval.',
    'Têm também solução Corporate?': 'Do you also offer a Corporate solution?',
    'Sim. O pacote Corporate é direccionado a projectos empresariais, convites institucionais, activações e páginas promocionais. O valor é definido sob consulta, depois do envio de um briefing compacto.': 'Yes. The Corporate package is designed for business projects, institutional invitations, activations and promotional pages. The price is defined upon request after a compact briefing is submitted.',

    // About / corporate / support
    'Sobre a Lirandzo': 'About Lirandzo',
    'Imagem de logotipo da lirandzo': 'Lirandzo logo image',
    'A Lirandzo nasceu da vontade de transformar convites em experiências digitais mais bem pensadas. Hoje a marca trabalha com uma estrutura comercial mais clara, sem perder a sensibilidade estética e o cuidado com cada história.': 'Lirandzo was born from the desire to turn invitations into better-designed digital experiences. Today, the brand works with a clearer commercial structure without losing aesthetic sensitivity and care for each story.',
    'Com base em Moçambique, combinamos design elegante, organização do evento e tecnologia para criar convites mais úteis, mais memoráveis e mais alinhados com o nível de cada celebração.': 'Based in Mozambique, we combine elegant design, event organisation and technology to create invitations that are more useful, more memorable and better aligned with the level of each celebration.',
    'Fale Connosco': 'Talk to us',
    'Estrutura empresarial': 'Business structure',
    'Soluções Digitais com Precisão': 'Digital Solutions with Precision',
    'Desenvolvemos experiências digitais pensadas ao detalhe, com foco na clareza, eficiência e apresentação profissional. Cada projecto é estruturado para comunicar com impacto e consistência.': 'We develop digital experiences designed in detail, focused on clarity, efficiency and professional presentation. Each project is structured to communicate with impact and consistency.',
    'Critérios de trabalho corporate': 'Corporate work criteria',
    'Estratégia': 'Strategy',
    'Leitura clara do objectivo, público e posicionamento da marca.': 'A clear reading of the goal, audience and brand positioning.',
    'Arquitectura': 'Architecture',
    'Informação organizada com hierarquia, semântica e consistência visual.': 'Information organised with hierarchy, semantics and visual consistency.',
    'Execução': 'Execution',
    'Entrega visual cuidada, funcional e preparada para contexto profissional.': 'A refined, functional visual delivery prepared for a professional context.',
    'Operação e Suporte': 'Operations and Support',
    'Infraestrutura estável e acompanhamento contínuo para garantir fiabilidade, desempenho e consistência em cada detalhe.': 'Stable infrastructure and continuous support to ensure reliability, performance and consistency in every detail.',
    'Áreas de operação e suporte': 'Operations and support areas',
    'Fiabilidade': 'Reliability',
    'Estrutura pensada para manter a experiência clara, acessível e funcional.': 'A structure designed to keep the experience clear, accessible and functional.',
    'Desempenho': 'Performance',
    'Componentes compactos, navegação fluida e atenção à consistência visual.': 'Compact components, fluid navigation and attention to visual consistency.',
    'Continuidade': 'Continuity',
    'Acompanhamento técnico para preservar qualidade antes, durante e depois da entrega.': 'Technical follow-up to preserve quality before, during and after delivery.',

    // Footer
    'Rodapé corporativo': 'Corporate footer',
    'Lirandzo - página inicial': 'Lirandzo - homepage',
    'Lirandzo Convites Digitais': 'Lirandzo Digital Invitations',
    'Experiências digitais para casamentos e projectos corporate.': 'Digital experiences for weddings and corporate projects.',
    'Enviar email para Lirandzo': 'Send email to Lirandzo',
    'Falar no WhatsApp': 'Chat on WhatsApp',
    'Navegação': 'Navigation',
    'Navegação do rodapé': 'Footer navigation',
    'Serviços': 'Services',
    'Convites digitais': 'Digital invitations',
    'Páginas corporate': 'Corporate pages',
    'Apoio comercial': 'Commercial support',
    'Blog': 'Blog',
    'Termos': 'Terms',
    'Privacidade': 'Privacy',
    'Todos os direitos reservados.': 'All rights reserved.',

    // Modals / forms / floating
    'Pacote anterior': 'Previous package',
    'Pacote seguinte': 'Next package',
    'Nome do Pacote': 'Package Name',
    'O que este pacote inclui:': 'What this package includes:',
    'Ver Demo': 'View Demo',
    'Escolher Pacote': 'Choose Package',
    'Fechar': 'Close',
    'Fechar contacto': 'Close contact',
    'Entre em Contacto': 'Contact Us',
    'A nossa equipa está aqui para um atendimento personalizado.': 'Our team is here for personalised support.',
    'Email': 'Email',
    'WhatsApp': 'WhatsApp',
    'Horário': 'Business hours',
    'Segunda a Sexta, 09:00 - 17:00': 'Monday to Friday, 09:00 - 17:00',
    'Fechar briefing': 'Close briefing',
    'Orçamento Corporate': 'Corporate Quote',
    'Briefing compacto': 'Compact briefing',
    'Preencha os pontos essenciais do projecto. O formulário será enviado para análise comercial inicial.': 'Fill in the key project points. The form will be sent for an initial commercial review.',
    'Nome': 'Name',
    'Empresa / Marca': 'Company / Brand',
    'Telefone / WhatsApp': 'Phone / WhatsApp',
    'Tipo de projecto': 'Project type',
    'Seleccione': 'Select',
    'Convite institucional': 'Institutional invitation',
    'Página promocional': 'Promotional page',
    'Evento corporativo': 'Corporate event',
    'Landing page comercial': 'Commercial landing page',
    'Outro': 'Other',
    'Prazo pretendido': 'Desired deadline',
    'Objectivo principal': 'Main objective',
    'Público-alvo': 'Target audience',
    'Referências, links ou observações': 'References, links or notes',
    'Resumo do projecto': 'Project summary',
    'Enviar briefing': 'Send briefing',
    'Cancelar': 'Cancel',
    'A enviar briefing...': 'Sending briefing...',
    'Briefing enviado com sucesso. A equipa da Lirandzo irá analisar o pedido e responder pelo email indicado.': 'Briefing sent successfully. The Lirandzo team will review the request and reply to the email provided.',
    'Não foi possível enviar agora. Tente novamente ou contacte-nos por WhatsApp.': 'Unable to send right now. Please try again or contact us via WhatsApp.',
    'Abrir Contactos': 'Open Contacts',
    'Abrir briefing corporate': 'Open corporate briefing',
    'Contactos': 'Contacts',
    'Ver Testemunhos': 'View Testimonials',
    'Voltar ao topo': 'Back to top',

    // Blog / legal pages common
    'Voltar ao site': 'Back to website',
    'Lirandzo Blog': 'Lirandzo Blog',
    'Inspiração, tendências e ideias para convites digitais e experiências de casamento.': 'Inspiration, trends and ideas for digital invitations and wedding experiences.',
    'Termos e Condições': 'Terms and Conditions',
    'Política de Privacidade': 'Privacy Policy'
  };
  // LIRANDZO_GLOBAL_PAGE_TRANSLATIONS — blog/article/legal pages
  Object.assign(translations, {
    'Blog — Lirandzo | Casamentos, Convites e Inspiração': 'Blog — Lirandzo | Weddings, Invitations and Inspiration',
    'Blog Lirandzo': 'Lirandzo Blog',
    'Ideias, organização e referências para casais que procuram uma experiência digital mais elegante e funcional.': 'Ideas, planning and references for couples looking for a more elegant and functional digital experience.',
    'TENDÊNCIAS': 'TRENDS',
    'INSPIRAÇÃO': 'INSPIRATION',
    'DICAS': 'TIPS',
    'FOTOGRAFIA': 'PHOTOGRAPHY',
    'ORGANIZAÇÃO': 'PLANNING',
    'ESTILO': 'STYLE',
    '5 razões para escolher um convite digital': '5 reasons to choose a digital invitation',
    'Descubra por que cada vez mais casais estão a trocar o convite físico por uma experiência digital elegante, prática e fácil de partilhar.': 'Discover why more and more couples are replacing the printed invitation with an elegant, practical and easy-to-share digital experience.',
    'Como escolher o modelo ideal para o seu casamento': 'How to choose the ideal template for your wedding',
    'Um guia simples para escolher um modelo alinhado com a personalidade do casal, o local, a paleta de cores e o nível de formalidade do evento.': 'A simple guide to choosing a template aligned with the couple’s personality, venue, colour palette and level of formality.',
    'RSVP: como gerir a lista de convidados sem stress': 'RSVP: how to manage the guest list without stress',
    'Veja como o RSVP digital ajuda a organizar confirmações, acompanhantes, ausências e decisões importantes sem perder informação pelo caminho.': 'See how digital RSVP helps organise confirmations, plus-ones, absences and important decisions without losing information along the way.',
    'Dicas para uma sessão de pré-casamento inesquecível': 'Tips for an unforgettable pre-wedding session',
    'Da escolha do cenário ao vestuário, veja como preparar uma sessão pré-wedding com naturalidade, elegância e imagens com valor emocional.': 'From the location to the outfits, see how to prepare a pre-wedding session with naturalness, elegance and emotionally valuable images.',
    'Checklist completa para o casamento dos sonhos': 'Complete checklist for the wedding of your dreams',
    'Uma checklist prática para manter o casamento organizado, desde a definição do orçamento até ao convite digital, fornecedores e confirmação dos convidados.': 'A practical checklist to keep the wedding organised, from the budget to the digital invitation, suppliers and guest confirmations.',
    'Tons terra e elegância': 'Earth tones and elegance',
    'Entenda por que os tons terra continuam fortes nos casamentos e como aplicar essa estética de forma sofisticada no convite digital.': 'Understand why earth tones remain strong in weddings and how to apply this aesthetic to the digital invitation in a sophisticated way.',
    'Ler mais': 'Read more',
    'Fique por dentro': 'Stay updated',
    'Receba dicas exclusivas, tendências e inspirações diretamente no seu email.': 'Receive exclusive tips, trends and inspiration directly in your email.',
    'Subscrever': 'Subscribe',
    'Seu melhor email': 'Your best email',
    'Convites digitais e soluções corporate com design estratégico.': 'Digital invitations and corporate solutions with strategic design.',
    'Experiências digitais elegantes para casamentos, eventos e projectos empresariais.': 'Elegant digital experiences for weddings, events and business projects.',
    'Empresa': 'Company',
    'Termos de Uso': 'Terms of Use',
    '© 2026 Lirandzo. Todos os direitos reservados.': '© 2026 Lirandzo. All rights reserved.',
    'Redes sociais': 'Social media',
    'Ler artigo: 5 razões para escolher um convite digital': 'Read article: 5 reasons to choose a digital invitation',
    'Convite digital elegante em destaque': 'Elegant digital invitation featured image',
    'Ler artigo: Como escolher o modelo ideal para o seu casamento': 'Read article: How to choose the ideal template for your wedding',
    'Modelo elegante de convite de casamento': 'Elegant wedding invitation template',
    'Ler artigo: RSVP: como gerir a lista de convidados sem stress': 'Read article: RSVP: how to manage the guest list without stress',
    'Noivos e gestão de convidados com RSVP': 'Couple and guest management with RSVP',
    'Ler artigo: Dicas para uma sessão de pré-casamento inesquecível': 'Read article: Tips for an unforgettable pre-wedding session',
    'Sessão fotográfica de pré-casamento': 'Pre-wedding photo session',
    'Ler artigo: Checklist completa para o casamento dos sonhos': 'Read article: Complete checklist for the wedding of your dreams',
    'Detalhes organizados de casamento': 'Organised wedding details',
    'Ler artigo: Tons terra e elegância': 'Read article: Earth tones and elegance',
    'Convite em tons terra e estética elegante': 'Invitation with earth tones and elegant aesthetic',
    '← Voltar ao blog': '← Back to the blog',
    '4 min de leitura': '4 min read',
    '5 min de leitura': '5 min read',
    '6 min de leitura': '6 min read',
    'Por Lirandzo': 'By Lirandzo',
    'Conclusão': 'Conclusion',
    'Quer transformar este cuidado numa experiência real para o seu casamento?': 'Want to turn this level of care into a real experience for your wedding?',
    'Podemos criar um convite digital elegante, organizado e alinhado com a identidade do vosso evento.': 'We can create an elegant, organised digital invitation aligned with the identity of your event.',
    'Também pode gostar': 'You may also like',
    'Artigos relacionados': 'Related articles',
    '5 razões para escolher um convite digital — Blog Lirandzo': '5 reasons to choose a digital invitation — Lirandzo Blog',
    'O convite digital deixou de ser apenas uma alternativa económica. Hoje, quando é bem desenhado, torna-se uma extensão da identidade do casamento: bonito, funcional, partilhável e muito mais fácil de gerir.': 'The digital invitation is no longer just a budget-friendly alternative. Today, when well designed, it becomes an extension of the wedding identity: beautiful, functional, shareable and much easier to manage.',
    '1. Partilha imediata e sem complicações': '1. Immediate and effortless sharing',
    'Um único link pode ser enviado por WhatsApp, redes sociais ou email. Isto reduz atrasos, evita perdas de cartões físicos e facilita a chegada da informação a convidados em diferentes cidades ou países.': 'A single link can be sent via WhatsApp, social media or email. This reduces delays, prevents physical cards from being lost and makes it easier for guests in different cities or countries to receive the information.',
    '2. Experiência mais completa para o convidado': '2. A more complete guest experience',
    'Além da estética, o convite digital pode reunir mapa, agenda, contagem regressiva, música, galeria, dress code, mensagens e outros detalhes importantes num só lugar.': 'Beyond aesthetics, the digital invitation can bring together the map, schedule, countdown, music, gallery, dress code, messages and other important details in one place.',
    '3. Melhor controlo da confirmação de presença': '3. Better control of attendance confirmation',
    'Com RSVP integrado, os noivos deixam de depender apenas de chamadas ou mensagens soltas. A confirmação fica organizada e pode ajudar na planificação de mesas, catering e logística.': 'With integrated RSVP, couples no longer need to rely only on calls or scattered messages. Confirmation becomes organised and can support table planning, catering and logistics.',
    '4. Imagem moderna e memorável': '4. A modern and memorable image',
    'Um convite digital bem feito transmite cuidado, organização e sofisticação. A primeira impressão do evento passa a ter movimento, narrativa e uma apresentação mais premium.': 'A well-made digital invitation communicates care, organisation and sophistication. The first impression of the event gains movement, narrative and a more premium presentation.',
    '5. Mais flexibilidade para actualizar detalhes': '5. More flexibility to update details',
    'Se houver alteração de horário, localização ou informação complementar, o link pode ser actualizado com mais facilidade do que um convite físico já impresso.': 'If there is a change in time, location or additional information, the link can be updated much more easily than a printed invitation that has already been produced.',
    'Escolher um convite digital é escolher praticidade sem abdicar da elegância. O segredo está em tratar o convite como uma experiência, e não apenas como uma imagem enviada por mensagem.': 'Choosing a digital invitation means choosing practicality without giving up elegance. The key is to treat the invitation as an experience, not just as an image sent by message.',
    'Criar o meu convite digital': 'Create my digital invitation',
    'Como escolher o modelo ideal para o seu casamento — Blog Lirandzo': 'How to choose the ideal template for your wedding — Lirandzo Blog',
    'O modelo do convite deve preparar emocionalmente o convidado para o tipo de casamento que vai viver. Antes de escolher apenas pela beleza, vale a pena cruzar estética, contexto e funcionalidade.': 'The invitation template should emotionally prepare guests for the type of wedding they are about to experience. Before choosing only by beauty, it is worth balancing aesthetics, context and functionality.',
    'Comece pelo estilo do casamento': 'Start with the wedding style',
    'Um casamento clássico pede uma linguagem mais elegante, com tipografia refinada e composição limpa. Um casamento ao ar livre pode aceitar tons naturais, texturas orgânicas e movimento mais leve.': 'A classic wedding calls for a more elegant language, refined typography and a clean composition. An outdoor wedding can embrace natural tones, organic textures and lighter movement.',
    'Observe a paleta de cores': 'Look at the colour palette',
    'O convite deve dialogar com as cores do evento. Isto cria consistência visual desde o primeiro contacto até à decoração, fotografia e comunicação geral do casamento.': 'The invitation should connect with the event colours. This creates visual consistency from the first contact through to the decoration, photography and overall wedding communication.',
    'Pense no perfil dos convidados': 'Think about the guest profile',
    'Se muitos convidados não têm facilidade com tecnologia, o modelo deve ser mais directo, com botões claros, leitura simples e informação essencial bem visível.': 'If many guests are not comfortable with technology, the template should be more direct, with clear buttons, simple reading and essential information clearly visible.',
    'Escolha o nível certo de funcionalidades': 'Choose the right level of features',
    'Nem todos os casamentos precisam das mesmas funcionalidades. RSVP, mapa, dress code, lista de presentes, galeria ou mensagens devem ser escolhidos conforme a necessidade real do evento.': 'Not every wedding needs the same features. RSVP, map, dress code, gift list, gallery or messages should be chosen according to the real needs of the event.',
    'Valorize a história do casal': 'Value the couple’s story',
    'O melhor modelo não é necessariamente o mais complexo. É aquele que traduz a personalidade dos noivos com elegância e torna a experiência dos convidados mais clara.': 'The best template is not necessarily the most complex one. It is the one that translates the couple’s personality with elegance and makes the guest experience clearer.',
    'O modelo ideal nasce do equilíbrio entre beleza, clareza e propósito. Quando esses três pontos estão alinhados, o convite deixa de parecer genérico e passa a ter identidade.': 'The ideal template is born from the balance between beauty, clarity and purpose. When these three points align, the invitation stops feeling generic and gains identity.',
    'Ver pacotes da Lirandzo': 'View Lirandzo packages',
    'RSVP: como gerir a lista de convidados sem stress — Blog Lirandzo': 'RSVP: how to manage the guest list without stress — Lirandzo Blog',
    'A lista de convidados é uma das partes mais sensíveis da organização de um casamento. O RSVP digital ajuda a transformar respostas dispersas em informação organizada e útil.': 'The guest list is one of the most sensitive parts of wedding planning. Digital RSVP helps turn scattered responses into organised and useful information.',
    'Centralize as confirmações': 'Centralise confirmations',
    'Em vez de receber respostas por chamadas, mensagens privadas e recados de familiares, o RSVP cria um ponto único para confirmar presença, ausência ou número de acompanhantes.': 'Instead of receiving replies through calls, private messages and family relays, RSVP creates a single point to confirm attendance, absence or number of plus-ones.',
    'Defina prazos claros': 'Set clear deadlines',
    'Inclua uma data limite para confirmação. Isto permite fechar números para buffet, mesas, lembranças e logística com mais segurança.': 'Include a deadline for confirmation. This makes it safer to finalise numbers for catering, tables, souvenirs and logistics.',
    'Organize acompanhantes desde o início': 'Organise plus-ones from the start',
    'Quando o convite permite indicar acompanhantes, os noivos conseguem prever melhor a lotação real e evitar surpresas perto da data.': 'When the invitation allows guests to indicate plus-ones, couples can better predict the real capacity and avoid surprises close to the date.',
    'Use a informação para tomar decisões': 'Use the information to make decisions',
    'A lista confirmada ajuda a ajustar orçamento, disposição das mesas, lugares especiais e prioridade de comunicação com convidados importantes.': 'The confirmed list helps adjust the budget, table layout, special seating and communication priorities with important guests.',
    'Mantenha a linguagem simples': 'Keep the language simple',
    'O formulário deve ser directo: nome, presença, número de acompanhantes e observações essenciais. Quanto mais simples for, maior tende a ser a taxa de resposta.': 'The form should be direct: name, attendance, number of plus-ones and essential notes. The simpler it is, the higher the response rate tends to be.',
    'RSVP não é apenas uma funcionalidade bonita. É uma ferramenta de organização que dá tranquilidade aos noivos e melhora a experiência dos convidados.': 'RSVP is not just a nice-looking feature. It is an organisation tool that gives couples peace of mind and improves the guest experience.',
    'Quero RSVP no meu convite': 'I want RSVP in my invitation',
    'Dicas para uma sessão de pré-casamento inesquecível — Blog Lirandzo': 'Tips for an unforgettable pre-wedding session — Lirandzo Blog',
    'A sessão de pré-casamento pode ser muito mais do que um conjunto de fotografias bonitas. Quando bem planeada, ela cria memória, fortalece a narrativa do casal e valoriza o convite digital.': 'A pre-wedding session can be much more than a set of beautiful photographs. When well planned, it creates memories, strengthens the couple’s narrative and elevates the digital invitation.',
    'Escolha um cenário com significado': 'Choose a meaningful location',
    'O local pode ser elegante, natural, urbano ou intimista. O mais importante é que tenha relação com a história do casal ou com a atmosfera desejada para o casamento.': 'The location can be elegant, natural, urban or intimate. What matters most is that it relates to the couple’s story or the desired atmosphere for the wedding.',
    'Planeie a roupa com intenção': 'Plan the outfits with intention',
    'As roupas devem conversar entre si sem parecerem demasiado combinadas. Cores neutras, tons terra, branco, bege ou peças clássicas costumam funcionar muito bem.': 'The outfits should work together without looking overly matched. Neutral colours, earth tones, white, beige or classic pieces usually work very well.',
    'Aproveite a melhor luz do dia': 'Use the best light of the day',
    'Fim de tarde e início da manhã normalmente oferecem uma luz mais suave, com sombras elegantes e tons mais cinematográficos.': 'Late afternoon and early morning usually offer softer light, elegant shadows and more cinematic tones.',
    'Leve referências, mas mantenha naturalidade': 'Bring references, but keep it natural',
    'Referências ajudam a orientar poses e estilo, mas a sessão deve preservar gestos reais: olhares, movimento, conversa e cumplicidade.': 'References help guide poses and style, but the session should preserve real gestures: looks, movement, conversation and connection.',
    'Use as fotos estrategicamente no convite': 'Use the photos strategically in the invitation',
    'As melhores imagens podem entrar na capa, galeria, secções de história do casal e partilhas nas redes sociais, criando coerência visual antes do evento.': 'The best images can be used in the cover, gallery, couple story sections and social media sharing, creating visual coherence before the event.',
    'Uma boa sessão pré-wedding não depende apenas da câmera. Depende de preparação, direcção estética e uma narrativa visual alinhada com o casal.': 'A good pre-wedding session does not depend only on the camera. It depends on preparation, aesthetic direction and a visual narrative aligned with the couple.',
    'Criar convite com galeria': 'Create invitation with gallery',
    'Checklist completa para o casamento dos sonhos — Blog Lirandzo': 'Complete checklist for the wedding of your dreams — Lirandzo Blog',
    'Organizar um casamento exige método. Uma checklist clara evita esquecimentos, reduz stress e ajuda os noivos a tomar decisões no momento certo.': 'Planning a wedding requires method. A clear checklist prevents forgotten details, reduces stress and helps couples make decisions at the right moment.',
    '12 a 9 meses antes': '12 to 9 months before',
    'Definir orçamento, data provável, número aproximado de convidados, estilo do casamento, local da cerimónia e recepção, além dos fornecedores mais importantes.': 'Define the budget, likely date, approximate number of guests, wedding style, ceremony and reception venues, as well as the most important suppliers.',
    '8 a 6 meses antes': '8 to 6 months before',
    'Escolher fotografia, vídeo, decoração, música, vestido, fato, padrinhos, damas e começar a construir a identidade visual do evento.': 'Choose photography, video, decoration, music, dress, suit, groomsmen, bridesmaids and start building the event’s visual identity.',
    '5 a 3 meses antes': '5 to 3 months before',
    'Preparar convite digital, reunir informações do evento, definir lista de convidados, activar RSVP e organizar detalhes como dress code, mapa e lista de presentes.': 'Prepare the digital invitation, gather event information, define the guest list, activate RSVP and organise details such as dress code, map and gift list.',
    '2 meses antes': '2 months before',
    'Confirmar fornecedores, rever cronograma, acompanhar respostas dos convidados, organizar mesas e fechar detalhes de transporte, alojamento ou recepção.': 'Confirm suppliers, review the schedule, monitor guest responses, organise tables and finalise transport, accommodation or reception details.',
    'Últimas semanas': 'Final weeks',
    'Validar horários, contactos de emergência, pagamentos pendentes, ensaio, kit dos noivos, comunicação com convidados e revisão final do convite ou página do evento.': 'Validate schedules, emergency contacts, pending payments, rehearsal, couple’s kit, guest communication and the final review of the invitation or event page.',
    'O casamento dos sonhos não nasce da pressa. Nasce de escolhas bem organizadas, comunicação clara e ferramentas que ajudam os noivos a manter tudo sob controlo.': 'The wedding of your dreams is not born from rushing. It comes from well-organised choices, clear communication and tools that help couples keep everything under control.',
    'Organizar o meu convite': 'Organise my invitation',
    'Tons terra e elegância — Blog Lirandzo': 'Earth tones and elegance — Lirandzo Blog',
    'Os tons terra ganharam força porque comunicam aconchego, maturidade e sofisticação. Quando bem usados, criam uma estética natural sem perder o carácter premium.': 'Earth tones have gained strength because they communicate warmth, maturity and sophistication. When used well, they create a natural aesthetic without losing a premium feel.',
    'Por que os tons terra funcionam tão bem': 'Why earth tones work so well',
    'Castanho, terracota, areia, nude, caramelo e verde seco criam uma atmosfera quente e equilibrada, ideal para casamentos intimistas, rústicos chic e celebrações ao ar livre.': 'Brown, terracotta, sand, nude, caramel and muted green create a warm and balanced atmosphere, ideal for intimate weddings, rustic-chic celebrations and outdoor events.',
    'Combine com tipografia elegante': 'Pair them with elegant typography',
    'Fontes serifadas, caligrafias discretas e textos bem espaçados ajudam a elevar a paleta. O segredo é evitar excesso de elementos decorativos.': 'Serif fonts, discreet calligraphy and well-spaced text help elevate the palette. The secret is to avoid too many decorative elements.',
    'Use textura com moderação': 'Use texture with moderation',
    'Papel, linho, madeira, folhagem seca e luz suave podem inspirar o visual do convite digital sem deixar a composição pesada.': 'Paper, linen, wood, dried foliage and soft light can inspire the visual language of the digital invitation without making the composition feel heavy.',
    'Mantenha contraste e leitura': 'Maintain contrast and readability',
    'Mesmo com tons suaves, os textos principais precisam de contraste suficiente. Elegância não deve sacrificar legibilidade.': 'Even with soft tones, the main text needs enough contrast. Elegance should never sacrifice readability.',
    'Leve a paleta para toda a experiência': 'Carry the palette through the whole experience',
    'Quando o convite, decoração, fotografia e materiais de apoio seguem a mesma direcção visual, o casamento ganha uma identidade mais forte e memorável.': 'When the invitation, decoration, photography and support materials follow the same visual direction, the wedding gains a stronger and more memorable identity.',
    'Tons terra são uma escolha segura para casais que procuram beleza natural, sensação acolhedora e uma presença visual sofisticada.': 'Earth tones are a safe choice for couples looking for natural beauty, a warm feeling and a sophisticated visual presence.',
    'Criar convite em tons terra': 'Create an earth-tone invitation',
    '15 Mar 2026': 'Mar 15, 2026',
    '22 Mar 2026': 'Mar 22, 2026',
    '29 Mar 2026': 'Mar 29, 2026',
    '05 Abr 2026': 'Apr 05, 2026',
    '12 Abr 2026': 'Apr 12, 2026',
    '19 Abr 2026': 'Apr 19, 2026',
    'Termos de Uso — Lirandzo': 'Terms of Use — Lirandzo',
    'Última atualização: 23 de Abril de 2026': 'Last updated: April 23, 2026',
    'Bem-vindo(a) à Lirandzo! Ao adquirir os nossos serviços de convites de casamento digitais, você concorda em cumprir os seguintes termos e condições. Por favor, leia-os atentamente.': 'Welcome to Lirandzo! By purchasing our digital wedding invitation services, you agree to comply with the following terms and conditions. Please read them carefully.',
    '1. Definição dos Serviços': '1. Definition of Services',
    'A Lirandzo fornece um serviço de design e activação de convites digitais para casamentos. O serviço inclui a personalização do pacote contratado, a inserção de conteúdo fornecido pelo cliente e a disponibilização de um link de acesso público.': 'Lirandzo provides a design and activation service for digital wedding invitations. The service includes personalising the chosen package, inserting content supplied by the client and providing a public access link.',
    '2. Responsabilidades do Cliente': '2. Client Responsibilities',
    'Fornecer todo o conteúdo (textos, fotos, vídeos, músicas) de forma atempada.': 'Provide all content (texts, photos, videos and music) in a timely manner.',
    'Garantir que possui os direitos de autor ou permissão de uso para todo o conteúdo fornecido (especialmente músicas e fotografias profissionais).': 'Ensure that they own the copyright or have permission to use all supplied content, especially music and professional photographs.',
    'Rever e aprovar o convite final. Quaisquer alterações solicitadas após a aprovação final podem estar sujeitas a taxas adicionais.': 'Review and approve the final invitation. Any changes requested after final approval may be subject to additional fees.',
    '3. Pagamento e Prazos': '3. Payment and Deadlines',
    'O pagamento inicial de 50% é necessário para dar início ao projecto. Os prazos de entrega, normalmente entre 3 e 5 dias úteis, começam a contar após a recepção de todo o material necessário e da confirmação do pagamento inicial.': 'An initial payment of 50% is required to start the project. Delivery deadlines, usually between 3 and 5 business days, begin after receiving all necessary materials and confirmation of the initial payment.',
    '4. Política de Reembolso': '4. Refund Policy',
    'Devido à natureza digital e personalizada do produto, não são efetuados reembolsos após o início do trabalho de design.': 'Due to the digital and personalised nature of the product, refunds are not issued after the design work has begun.',
    '5. Propriedade Intelectual': '5. Intellectual Property',
    'O design, código e estrutura dos modelos de convite são propriedade intelectual da Lirandzo. Ao cliente é concedida uma licença de uso para o seu evento específico. É proibida a revenda, redistribuição ou duplicação do design do convite para outros fins.': 'The design, code and structure of the invitation templates are the intellectual property of Lirandzo. The client is granted a usage licence for their specific event. Resale, redistribution or duplication of the invitation design for other purposes is prohibited.',
    '6. Limitação de Responsabilidade': '6. Limitation of Liability',
    'A Lirandzo não se responsabiliza por erros de digitação ou informação incorreta fornecida pelo cliente e aprovada na revisão final. Também não nos responsabilizamos pela falha de serviços de terceiros (ex: falhas no servidor de hospedagem, falhas no WhatsApp, etc.), embora façamos todos os esforços para garantir a estabilidade do serviço.': 'Lirandzo is not responsible for typing errors or incorrect information supplied by the client and approved in the final review. We are also not responsible for failures of third-party services, such as hosting server failures or WhatsApp outages, although we make every effort to ensure service stability.',
    'Política de Privacidade — Lirandzo': 'Privacy Policy — Lirandzo',
    'A sua privacidade é de extrema importância para nós. Esta política descreve como a Lirandzo recolhe, usa e protege as informações pessoais que você nos fornece.': 'Your privacy is extremely important to us. This policy describes how Lirandzo collects, uses and protects the personal information you provide to us.',
    '1. Informações que Recolhemos': '1. Information We Collect',
    'Recolhemos informações para fornecer e melhorar os nossos serviços. Isto inclui:': 'We collect information to provide and improve our services. This includes:',
    'Informações do Cliente (Noivos):': 'Client Information (Couple):',
    'Nome, email, número de telefone e detalhes do evento necessários para a criação do convite.': 'Name, email, phone number and event details required to create the invitation.',
    'Conteúdo do Convite:': 'Invitation Content:',
    'Fotografias, vídeos, textos e outros dados pessoais que os clientes nos fornecem para incluir no convite digital.': 'Photographs, videos, texts and other personal data that clients provide for inclusion in the digital invitation.',
    'Informações dos Convidados (RSVP):': 'Guest Information (RSVP):',
    'Se o convite incluir um formulário de RSVP, podemos recolher o nome dos convidados, número de acompanhantes e informações de contacto, unicamente para o propósito de gestão da lista de presenças em nome do cliente.': 'If the invitation includes an RSVP form, we may collect guest names, number of plus-ones and contact information solely for the purpose of managing the attendance list on behalf of the client.',
    '2. Como Usamos as Informações': '2. How We Use the Information',
    'As informações recolhidas são usadas exclusivamente para:': 'The collected information is used exclusively to:',
    'Criar e personalizar o convite digital.': 'Create and personalise the digital invitation.',
    'Comunicar com o cliente sobre o projeto.': 'Communicate with the client about the project.',
    'Operar a funcionalidade de RSVP.': 'Operate the RSVP feature.',
    'Fornecer apoio ao cliente.': 'Provide customer support.',
    'A Lirandzo não vende, aluga ou partilha as suas informações pessoais ou as dos seus convidados com terceiros para fins de marketing.': 'Lirandzo does not sell, rent or share your personal information or your guests’ information with third parties for marketing purposes.',
    '3. Segurança e Proteção de Dados': '3. Security and Data Protection',
    'Levamos a segurança dos seus dados a sério. As fotografias e informações pessoais fornecidas são armazenadas de forma segura e tratadas com confidencialidade. Os convites digitais são alojados em servidores seguros.': 'We take the security of your data seriously. Photographs and personal information provided are stored securely and handled confidentially. Digital invitations are hosted on secure servers.',
    '4. Retenção de Dados': '4. Data Retention',
    'O convite digital permanecerá online pelo período acordado com o cliente (ex: até 60 dias após a data do evento). Após este período, o mini-site e todos os dados associados (incluindo listas de RSVP e fotos) serão permanentemente eliminados dos nossos servidores, a menos que o cliente solicite o contrário.': 'The digital invitation will remain online for the period agreed with the client, for example up to 60 days after the event date. After this period, the mini-site and all associated data, including RSVP lists and photos, will be permanently deleted from our servers unless the client requests otherwise.',
    '5. Os Seus Direitos': '5. Your Rights',
    'O cliente (os noivos) tem o direito de aceder, corrigir ou solicitar a exclusão de todas as informações pessoais fornecidas a qualquer momento. Os convidados que submeterem dados via RSVP devem contactar os noivos para gerir os seus dados.': 'The client (the couple) has the right to access, correct or request the deletion of all personal information provided at any time. Guests who submit data through RSVP should contact the couple to manage their data.',
  });

  // LIRANDZO_IMMERSIVE_UI_TRANSLATIONS — dynamic mobile/PWA/chat panels
  Object.assign(translations, {
    'Instalar': 'Install',
    'Adicionar Lirandzo ao telemóvel': 'Add Lirandzo to your phone',
    'Link copiado para partilhar.': 'Link copied to share.',
    'Ainda não há pacotes guardados. Vá à secção de pacotes e toque em “Guardar”.': 'There are no saved packages yet. Go to the packages section and tap “Save”.',
    'Preço sob consulta': 'Price upon request',
    'guardado para comparação': 'saved for comparison',
    'Guardados': 'Saved',
    'Gerir convites guardados': 'Manage saved invitations',
    'Compare, remova ou envie a lista guardada directamente para a Lirandzo.': 'Compare, remove or send the saved list directly to Lirandzo.',
    'Enviar lista no WhatsApp': 'Send list on WhatsApp',
    'Limpar lista': 'Clear list',
    'Remover': 'Remove',
    'Gerir': 'Manage',
    'Tem': 'You have',
    'convite guardado': 'saved invitation',
    'convites guardados': 'saved invitations',
    'para comparar.': 'to compare.',
    'Guardar': 'Save',
    'Partilhar': 'Share',
    'Partilhar este artigo': 'Share this article',
    'Fechar': 'Close',
    'Comparador': 'Comparison',
    'Compare os pacotes sem sair da página': 'Compare packages without leaving the page',
    'Uma leitura compacta para escolher entre essencial, completo, premium ou corporate.': 'A compact view to choose between essential, complete, premium or corporate.',
    'Pedir recomendação': 'Ask for a recommendation',
    'Solução Lirandzo': 'Lirandzo solution',
    'Comparar pacotes': 'Compare packages',
    'Ver experiência em 30 segundos': 'See the 30-second experience',
    'Gerir guardados': 'Manage saved',
    'Escolha do pacote': 'Package choice',
    'O visitante percebe rapidamente qual nível de experiência combina com o evento.': 'The visitor quickly understands which experience level fits the event.',
    'Design do convite': 'Invitation design',
    'A identidade visual do casal é transformada numa página digital elegante.': 'The couple’s visual identity is turned into an elegant digital page.',
    'RSVP e organização': 'RSVP and organisation',
    'Confirmações, detalhes e mensagens ficam mais fáceis de gerir.': 'Confirmations, details and messages become easier to manage.',
    'Partilha final': 'Final sharing',
    'O link fica pronto para enviar por WhatsApp, redes sociais ou email.': 'The link is ready to send through WhatsApp, social media or email.',
    'Experiência': 'Experience',
    'Uma explicação rápida, pensada para mobile, que mostra o valor do convite digital antes da decisão.': 'A quick mobile-first explanation that shows the value of the digital invitation before the decision.',
    'Começar convite digital': 'Start digital invitation',
    'Acções rápidas Lirandzo': 'Lirandzo quick actions',
    'Começar': 'Start',
    'Início': 'Home',
    'Veja a experiência Lirandzo': 'See the Lirandzo experience',
    'Experiência digital em acção': 'Digital experience in action',
    'Vantagens': 'Benefits',
    'Entenda o valor do convite': 'Understand the value of the invitation',
    'Compare e guarde favoritos': 'Compare and save favourites',
    'Descubra o pacote ideal': 'Find the ideal package',
    'Fazer quiz': 'Take quiz',
    'Processo': 'Process',
    'Veja os próximos passos': 'See the next steps',
    'Prova social': 'Social proof',
    'Clientes que confiaram': 'Clients who trusted us',
    'Tire dúvidas rapidamente': 'Clear doubts quickly',
    'Falar': 'Talk',
    'Conheça a Lirandzo': 'Get to know Lirandzo',
    'Estamos prontos para ajudar': 'We are ready to help',
    'Artigo': 'Article',
    'Partilhe esta inspiração': 'Share this inspiration',
    'Inspiração para casamento': 'Wedding inspiration',
    'Precisa de ajuda rápida?': 'Need quick help?',
    'Continuar': 'Continue',
    'de onde parou': 'where you stopped',
    'Escolha uma acção rápida ou abra a conversa completa.': 'Choose a quick action or open the full conversation.',
    'Comparar': 'Compare',
    'Recomendar': 'Recommend',
    'Abrir conversa completa': 'Open full conversation',
    'Pacotes · Corporate · Apoio · Preços': 'Packages · Corporate · Support · Pricing',
    'Removido dos guardados.': 'Removed from saved items.',
    'Lista de guardados limpa.': 'Saved list cleared.',
    'guardado para consulta.': 'saved for later.',
    'Pérola guardado para consulta.': 'Pearl saved for later.',
    'Esmeralda guardado para consulta.': 'Emerald saved for later.',
    'Rubi guardado para consulta.': 'Ruby saved for later.',
    'Corporate guardado para consulta.': 'Corporate saved for later.',
    'Essencial elegante': 'Elegant essential',
    'Equilíbrio completo': 'Complete balance',
    'Experiência premium': 'Premium experience',
    'Projectos empresariais': 'Business projects',
    'Convite personalizado': 'Personalised invitation',
    'Tudo do Pérola': 'Everything in Pearl',
    'Tudo do Esmeralda': 'Everything in Emerald',
    'Cápsula de tempo': 'Time capsule',
    'Vídeo pré-wedding': 'Pre-wedding video',
    'Cápsula por mais dias': 'Longer time capsule',
    'Experiência mais exclusiva': 'More exclusive experience',
    'Escopo sob medida': 'Tailored scope'
  });



  const placeholders = {
    'Digite o seu nome': 'Enter your name',
    'Digite o nome da empresa': 'Enter the company name',
    'seu@email.com': 'your@email.com',
    '+258 000 000 000': '+258 000 000 000',
    'Ex.: 10 dias': 'E.g.: 10 days',
    'Ex.: captar leads, apresentar evento, lançar campanha': 'E.g.: capture leads, present an event, launch a campaign',
    'Quem deve receber ou visitar esta página?': 'Who should receive or visit this page?',
    'Partilhe referências visuais, links e notas importantes': 'Share visual references, links and important notes',
    'Descreva de forma directa o que precisa': 'Describe directly what you need',
    'Nome completo': 'Full name',
    'Email profissional': 'Business email',
    'Telefone ou WhatsApp': 'Phone or WhatsApp',
    'Nome da empresa ou marca': 'Company or brand name',
    'Descreva o objectivo do projecto': 'Describe the project objective',
    'Prazo desejado': 'Desired deadline',
    'Mensagem': 'Message',
    'Seu melhor email': 'Your best email'
  };

  const originalText = new WeakMap();
  const originalAttr = new WeakMap();
  const originalPlaceholder = new WeakMap();
  const originalOptionValue = new WeakMap();

  function t(value) {
    const key = normalize(value);
    return translations[key] || value;
  }

  function translatePreservingWhitespace(original, lang) {
    if (lang === 'pt') return original;
    const trimmed = normalize(original);
    const translated = translations[trimmed];
    if (!translated) return original;
    return original.replace(original.match(/\S(?:.|\n|\r)*\S|\S/)?.[0] || trimmed, translated);
  }

  function translateTextNode(node, lang) {
    const raw = node.nodeValue;
    if (!normalize(raw)) return;
    if (!originalText.has(node)) originalText.set(node, raw);
    const base = originalText.get(node);
    node.nodeValue = lang === 'en' ? translatePreservingWhitespace(base, lang) : base;
  }

  function translateAttributes(el, lang) {
    if (el.closest && el.closest('[data-no-translate]')) return;
    const attrs = ['aria-label', 'title', 'alt', 'data-template-name', 'data-template-price'];
    attrs.forEach(attr => {
      if (!el.hasAttribute(attr)) return;
      const key = `${attr}:${el.getAttribute(attr)}`;
      if (!originalAttr.has(el)) originalAttr.set(el, {});
      const store = originalAttr.get(el);
      if (!store[attr]) store[attr] = el.getAttribute(attr);
      const base = store[attr];
      el.setAttribute(attr, lang === 'en' ? t(base) : base);
    });

    if (el.hasAttribute('data-features')) {
      if (!originalAttr.has(el)) originalAttr.set(el, {});
      const store = originalAttr.get(el);
      if (!store['data-features']) store['data-features'] = el.getAttribute('data-features');
      const base = store['data-features'];
      el.setAttribute('data-features', lang === 'en' ? base.split('|').map(item => t(item)).join('|') : base);
    }

    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.hasAttribute('placeholder')) {
      if (!originalPlaceholder.has(el)) originalPlaceholder.set(el, el.getAttribute('placeholder') || '');
      const base = originalPlaceholder.get(el);
      el.setAttribute('placeholder', lang === 'en' ? (placeholders[base] || base) : base);
    }

    if (el.tagName === 'OPTION') {
      if (!originalOptionValue.has(el)) originalOptionValue.set(el, el.textContent);
      const base = originalOptionValue.get(el);
      el.textContent = lang === 'en' ? t(base) : base;
    }
  }

  function updateDocumentMeta(lang) {
    const titlePt = document.documentElement.getAttribute('data-title-pt') || originalPageTitle || 'Lirandzo — Pacotes Digitais e Soluções Corporate';
    const titleEn = document.documentElement.getAttribute('data-title-en') || titlePt;
    document.title = lang === 'en' ? titleEn : titlePt;
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-MZ';

    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      const descPt = document.documentElement.getAttribute('data-description-pt') || originalDescription || desc.getAttribute('content') || '';
      const descEn = document.documentElement.getAttribute('data-description-en') || descPt;
      desc.setAttribute('content', lang === 'en' ? descEn : descPt);
    }
  }

  function applyLanguage(lang) {
    currentLang = lang === 'en' ? 'en' : 'pt';
    translating = true;
    updateDocumentMeta(currentLang);

    document.querySelectorAll('[data-language-current]').forEach(el => { el.textContent = currentLang === 'en' ? 'EN' : 'PT'; });
    document.querySelectorAll('[data-language-flag]').forEach(el => { el.textContent = currentLang === 'en' ? '🇬🇧' : '🇲🇿'; });
    document.querySelectorAll('[data-lang-option]').forEach(btn => {
      const active = btn.getAttribute('data-lang-option') === currentLang;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('is-active', active);
    });

    document.querySelectorAll('body *').forEach(el => translateAttributes(el, currentLang));

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script, style, textarea, input, svg, [data-no-translate]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => translateTextNode(node, currentLang));

    localStorage.setItem(LANG_KEY, currentLang);
    updateCurrencyConverter(localStorage.getItem(CURRENCY_KEY) || 'MZN');
    window.dispatchEvent(new CustomEvent('lirandzo:language-change', { detail: { lang: currentLang } }));
    window.dispatchEvent(new CustomEvent('lirandzo:languagechange', { detail: { lang: currentLang } }));
    translating = false;
  }

  function setupLanguageSwitcher() {
    const switcher = document.querySelector('[data-language-switcher]');
    if (!switcher) {
      applyLanguage(currentLang);
      return;
    }
    const toggle = switcher.querySelector('[data-language-toggle]');
    const menu = switcher.querySelector('[data-language-menu]');
    const options = switcher.querySelectorAll('[data-lang-option]');

    if (toggle && menu) {
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = switcher.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      document.addEventListener('click', () => {
        switcher.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
      menu.addEventListener('click', event => event.stopPropagation());
    }

    options.forEach(option => {
      option.addEventListener('click', () => {
        applyLanguage(option.getAttribute('data-lang-option'));
        switcher.classList.remove('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    });

    applyLanguage(currentLang);
  }

  const rates = {
    MZN: { label: 'Metical moçambicano', symbol: 'MT', flag: '🇲🇿', rate: 1, locale: 'pt-MZ', notePt: 'Moeda base: MZN', noteEn: 'Base currency: MZN' },
    USD: { label: 'Dólar americano', symbol: '$', flag: '🇺🇸', rate: 1 / 63.8, locale: 'en-US', notePt: '1 USD ≈ 63,8 MZN', noteEn: '1 USD ≈ 63.8 MZN' },
    AOA: { label: 'Kwanza angolano', symbol: 'Kz', flag: '🇦🇴', rate: 918.5 / 63.8, locale: 'pt-AO', notePt: '1 USD ≈ 918,5 AOA', noteEn: '1 USD ≈ 918.5 AOA' }
  };

  const packagePrices = [
    { key: 'pearl', namePt: 'Pérola', nameEn: 'Pearl', amount: 6000 },
    { key: 'emerald', namePt: 'Esmeralda', nameEn: 'Emerald', amount: 10000 },
    { key: 'ruby', namePt: 'Rubi', nameEn: 'Ruby', amount: 15000 },
    { key: 'corporate', namePt: 'Corporate', nameEn: 'Corporate', custom: true }
  ];

  function formatCurrency(value, currency) {
    if (currency === 'MZN') return `${Math.round(value).toLocaleString('pt-MZ')} MT`;
    if (currency === 'AOA') return `${Math.round(value).toLocaleString('pt-AO')} Kz`;
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  function updateCurrencyConverter(currency) {
    const box = document.querySelector('[data-currency-converter]');
    if (!box) return;
    const current = rates[currency] ? currency : 'MZN';
    const values = box.querySelector('[data-currency-values]');
    const note = box.querySelector('[data-currency-rate-note]');
    const lang = currentLang === 'en' ? 'en' : 'pt';
    updatingCurrency = true;

    if (values) {
      values.innerHTML = packagePrices.map(pkg => {
        const name = lang === 'en' ? pkg.nameEn : pkg.namePt;
        if (pkg.custom) {
          return `<div class="currency-row currency-row-custom"><span class="currency-package-name">${name}</span><strong class="currency-package-value">${lang === 'en' ? 'Upon request' : 'Sob consulta'}</strong></div>`;
        }
        const converted = pkg.amount * rates[current].rate;
        return `<div class="currency-row"><span class="currency-package-name">${name}</span><strong class="currency-package-value">${formatCurrency(converted, current)}</strong></div>`;
      }).join('');
    }

    if (note) note.textContent = lang === 'en' ? rates[current].noteEn : rates[current].notePt;
    document.querySelectorAll('[data-currency-flag]').forEach(el => { el.textContent = rates[current].flag || '🌍'; });
    localStorage.setItem(CURRENCY_KEY, current);

    window.requestAnimationFrame(() => { updatingCurrency = false; });
  }

  function setupCurrencyConverter() {
    const select = document.querySelector('[data-currency-select]');
    if (!select) return;
    const saved = localStorage.getItem(CURRENCY_KEY) || 'MZN';
    select.value = rates[saved] ? saved : 'MZN';
    select.addEventListener('change', () => updateCurrencyConverter(select.value));
    updateCurrencyConverter(select.value);
  }

  function setupMutationTranslator() {
    const observer = new MutationObserver((mutations) => {
      if (translating || updatingCurrency || currentLang !== 'en') return;

      const onlyCurrencyChanged = mutations.every((mutation) => {
        const target = mutation.target && mutation.target.nodeType === Node.TEXT_NODE
          ? mutation.target.parentElement
          : mutation.target;
        return target && target.closest && target.closest('[data-currency-converter]');
      });

      if (onlyCurrencyChanged) return;

      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => applyLanguage(currentLang), 120);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupLanguageSwitcher();
    setupCurrencyConverter();
    setupMutationTranslator();
  });

  window.LirandzoI18n = { applyLanguage, translate: t, get currentLang() { return currentLang; } };
})();
