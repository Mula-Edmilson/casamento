LIRANDZO · Amélia & Edilson · Fix v7

Esta versão corrige o erro do admin:
ReferenceError: d is not defined em giftPreviewMarkup.

Também remove a chamada POST /admin-api list_gift_records que gerava 400 no console do admin, e adiciona compatibilidade no server.js para list_gift_records/list_gifts via /admin-api.

Subir:
1) Render: server.js desta versão.
2) GitHub: conteúdo da pasta amelia-edilson deste ZIP em convite/amelia-edilson/.

Não resetar presentes no MongoDB.
