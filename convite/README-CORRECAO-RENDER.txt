CORREÇÃO APLICADA

Este ZIP foi ajustado para a configuração que aparece nas capturas do Render:

Root Directory: convite
Build Command: npm install
Start Command: node server.js

O problema anterior era que a pasta /convite não tinha server.js nem package.json na raiz.
Assim o Render não conseguia correr a API correta do AdminManager.

O adminmanager.html chama:
POST /manager/login
GET /health
GET /manager/summary
GET /manager/invites

Essas rotas só existem no novo server.js incluído agora em /convite/server.js.
O server.js antigo usava apenas /api e /admin-api, por isso dava 404 no login do AdminManager.

Depois de enviar este ZIP ao GitHub:
1. Confirma no Render:
   Root Directory: convite
   Build Command: npm install
   Start Command: node server.js

2. Confirma as variáveis:
   MONGODB_URI
   MANAGER_PASSWORD
   MANAGER_SECRET
   GITHUB_TOKEN
   GITHUB_OWNER=Mula-Edmilson
   GITHUB_REPO=casamento
   GITHUB_BRANCH=main
   PUBLIC_API_BASE_URL=https://api-casamento-mj.onrender.com
   PUBLIC_SITE_URL=https://lirandzo.com
   ALLOWED_ORIGINS=https://lirandzo.com,https://www.lirandzo.com

3. Faz Manual Deploy no Render.

4. Testa primeiro:
   https://api-casamento-mj.onrender.com/health

Se /health responder status ok, testa depois:
   https://lirandzo.com/convite/adminmanager.html
