LIRANDZO — VERSÃO CORRIGIDA PARA ADMIN MANAGER + GITHUB

Estrutura esperada no Render:
Root Directory: convite
Build Command: npm install
Start Command: node server.js

URLs principais:
Admin Manager: https://lirandzo.com/convite/adminmanager.html
Backend/API:   https://api-casamento-mj.onrender.com
Health check: https://api-casamento-mj.onrender.com/health

VARIÁVEIS OBRIGATÓRIAS NO RENDER
MONGODB_URI=mongodb+srv://...
MANAGER_PASSWORD=...
MANAGER_SECRET=uma_chave_com_mais_de_16_caracteres
PUBLIC_API_BASE_URL=https://api-casamento-mj.onrender.com
PUBLIC_SITE_URL=https://lirandzo.com
ALLOWED_ORIGINS=https://lirandzo.com,https://www.lirandzo.com

GITHUB — PARA CRIAR CONVITES AUTOMATICAMENTE
GITHUB_TOKEN=github_pat_...
GITHUB_OWNER=Mula-Edmilson
GITHUB_REPO=casamento
GITHUB_BRANCH=main
INVITES_BASE_PATH=convite
TEMPLATE_PEROLA_PATH=convite/templates/perola
TEMPLATE_ESMERALDA_PATH=convite/templates/esmeralda
TEMPLATE_RUBI_PATH=convite/templates/rubi

O token GitHub deve ter permissão de escrita em Contents no repositório.

O QUE FOI CORRIGIDO
1. Templates Pérola, Esmeralda e Rubi foram limpos.
2. A pasta demo edma-abel foi removida de /convite/templates/esmeralda.
3. Templates já não carregam nomes demo, contas demo, server.js, package.json ou scripts de importação.
4. O backend agora gera automaticamente:
   - client-config.js
   - event-data.js
   - invite-data.json
5. O Admin Manager passou a recolher dados completos do evento:
   - horários
   - locais
   - links de mapa
   - música
   - texto principal
   - nota do popup RSVP
   - pagamentos
   - modo RSVP público/lista fechada
   - secções activas
6. O MongoDB guarda config completa dentro do convite.
7. O backend regista estado de sincronização GitHub:
   - unsynced
   - pending
   - synced
   - failed
   - skipped
8. O endpoint /manager/github/status passou a fazer diagnóstico real do repo, branch e templates.
9. MANAGER_SECRET deixou de ser opcional.
10. Foi adicionada compatibilidade com get_guest_by_token.
11. RSVP público agora pode ser controlado por config.rsvp.mode = public, sem depender apenas de PUBLIC_RSVP_AUTO_CREATE_SLUGS.

COMO CRIAR UM CONVITE SEM EDITAR MANUALMENTE
1. Abrir /convite/adminmanager.html.
2. Entrar com MANAGER_PASSWORD.
3. Abrir “Novo cliente”.
4. Preencher todos os campos do evento.
5. Manter “Copiar template para GitHub” activo.
6. Clicar “Criar convite completo”.
7. Confirmar se o estado GitHub aparece como “GitHub OK”.
8. Abrir o link público gerado.

NOTA IMPORTANTE
Esta versão removeu ficheiros de deploy/demo/importação que não devem ficar públicos no GitHub. A lista completa está em /LIRANDZO-PRODUCTION-CLEANUP.txt.

ACTUALIZAÇÃO CMS SEM HTML
-------------------------
Esta versão inclui cinco modelos reais seleccionáveis no Admin Manager:
- rubi-rosalina
- esmeralda-edma
- perola-calate
- perola-flicia
- perola-publico

Para uploads de fotos pelo Admin Manager, o backend foi ajustado para 35mb por padrão.
Se necessário, configure no Render:
JSON_LIMIT=50mb

Variáveis opcionais de template:
TEMPLATE_RUBI_ROSALINA_PATH=convite/templates/rubi-rosalina
TEMPLATE_ESMERALDA_EDMA_PATH=convite/templates/esmeralda-edma
TEMPLATE_PEROLA_CALATE_PATH=convite/templates/perola-calate
TEMPLATE_PEROLA_FLICIA_PATH=convite/templates/perola-flicia
TEMPLATE_PEROLA_PUBLICO_PATH=convite/templates/perola-publico
