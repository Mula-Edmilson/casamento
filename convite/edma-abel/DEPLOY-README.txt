Deploy rápido — Edma & Abel

1. Enviar a pasta /edma-abel/ para o caminho público:
   /convite/edma-abel/

2. Confirmar no client-config.js:
   window.LIRANDZO_INVITE_SLUG = 'edma-abel';
   window.LIRANDZO_API_BASE_URL = 'https://api-casamento-mj.onrender.com';

3. Importar dados para MongoDB:
   npm install
   set MONGODB_URI=mongodb+srv://UTILIZADOR:SENHA@cluster.mongodb.net/lirandzo?retryWrites=true&w=majority
   node import-edma-abel-to-mongodb.js

4. No Render, confirmar variáveis mínimas:
   MONGODB_URI
   PUBLIC_SITE_URL=https://lirandzo.com
   PUBLIC_API_BASE_URL=https://api-casamento-mj.onrender.com
   ALLOWED_ORIGINS=https://lirandzo.com,https://www.lirandzo.com
   MANAGER_PASSWORD=<senha do painel principal>

5. Testar:
   /convite/edma-abel/index.html
   Login com um nome da lista, por exemplo: Helena e Mário Nobre

Lista actualizada: 102 entradas de convidados · 202 pessoas autorizadas.

ACTUALIZAÇÃO DE FOTOGRAFIAS — EDMA & ABEL
- assets/media/edma-abel-hero.jpg: fotografia aplicada no hero do convite.
- assets/media/edma-abel-save-the-date.jpg: fotografia aplicada na capa/index do convite.
- assets/media/edma-abel-brinde.jpg, edma-abel-pedido.jpg, edma-abel-comemoracao.jpg e edma-abel-pose-2.jpg: fotografias integradas nas secções internas e galeria.
Actualização menu/presentes:
- Menu real integrado a partir do PDF enviado.
- Lista de presentes actualizada com descrições exactas.
- MAP_FAROL2_URL actualizado para https://maps.app.goo.gl/rbzP3MeZPr2s3x4i6
