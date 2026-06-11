Deploy rápido — Calate & Helder

1. Enviar a pasta /calate-helder/ para o caminho público:
   /convite/calate-helder/

2. Confirmar no client-config.js:
   window.LIRANDZO_INVITE_SLUG = 'calate-helder';
   window.LIRANDZO_API_BASE_URL = 'https://api-casamento-mj.onrender.com';

3. Importar dados para MongoDB:
   npm install
   set MONGODB_URI=mongodb+srv://UTILIZADOR:SENHA@cluster.mongodb.net/lirandzo?retryWrites=true&w=majority
   node import-calate-helder-to-mongodb.js

4. No Render, confirmar variáveis mínimas:
   MONGODB_URI
   PUBLIC_SITE_URL=https://lirandzo.com
   PUBLIC_API_BASE_URL=https://api-casamento-mj.onrender.com
   ALLOWED_ORIGINS=https://lirandzo.com,https://www.lirandzo.com
   MANAGER_PASSWORD=<senha do painel principal>

5. Testar:
   /convite/calate-helder/index.html
   Login com um nome da lista, por exemplo: Adelaide Muianga

Lista actualizada: 102 entradas de convidados · 202 pessoas autorizadas.

ACTUALIZAÇÃO DE FOTOGRAFIAS — EDMA & ABEL
- assets/media/calate-helder-hero.jpg: fotografia aplicada no hero do convite.
- assets/media/calate-helder-save-the-date.jpg: fotografia aplicada na capa/index do convite.
- assets/media/calate-helder-brinde.jpg, calate-helder-pedido.jpg, calate-helder-comemoracao.jpg e calate-helder-pose-2.jpg: fotografias integradas nas secções internas e galeria.
Actualização menu/presentes:
- Menu real integrado a partir do PDF enviado.
- Lista de presentes actualizada com descrições exactas.
- MAP_FAROL2_URL actualizado para https://maps.app.goo.gl/rbzP3MeZPr2s3x4i6


Actualização V4 — presentes e história:
- Lista de presentes forçada para a lista oficial de 24 itens, preservando nomes e descrições exactas.
- Front-end filtra a resposta do Render/MongoDB para mostrar apenas os presentes oficiais, na ordem correcta.
- server.js agora semeia apenas os presentes oficiais e remove itens antigos/obsoletos do convite.
- import-calate-helder-to-mongodb.js também remove presentes antigos que não constam na lista oficial.
- Secção "A Nossa História" actualizada com os quatro capítulos enviados e novo carrossel elegante com setas, dots e scroll horizontal.

## ADMIN / PASSWORD NO RENDER

Este convite já não usa senha pública no `client-config.js` para o painel `admin.html`.

O login do admin agora segue o mesmo padrão dos outros convites:

- `admin.html` chama `POST /manager/login`;
- o `server.js` valida a senha pela variável de ambiente `MANAGER_PASSWORD` definida no Render;
- se existir `MANAGER_SECRET`, o servidor devolve token de sessão;
- as acções administrativas continuam a passar por `/admin-api` com `slug: calate-helder`.

Variáveis obrigatórias/recomendadas no Render:

```env
MANAGER_PASSWORD=coloque_a_senha_real_no_render
MANAGER_SECRET=coloque_um_seguro_com_mais_de_16_caracteres
PUBLIC_API_BASE_URL=https://api-casamento-mj.onrender.com
PUBLIC_SITE_URL=https://lirandzo.com
INVITES_BASE_PATH=convite
```

Não volte a colocar `window.LIRANDZO_ADMIN_PASSWORD` no `client-config.js`, porque isso deixa a senha exposta no front-end.

