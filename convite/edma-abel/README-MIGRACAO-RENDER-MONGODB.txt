Edma & Abel — Convite migrado para Render + MongoDB

Este pacote usa o modelo actual enviado como base visual e funcional.

Arquivos principais:
- index.html: entrada do convite por nome do convidado
- convite.html: convite principal
- admin.html: painel do cliente
- checkin.html: scanner/check-in por QR Code
- capsula.html: galeria da Cápsula do Tempo
- client-config.js: define API Render e slug do convite
- lirandzo-api.js: cliente oficial para comunicar com Render/MongoDB
- mongodb-seed-data.json: evento + convidados + lista de presentes
- import-edma-abel-to-mongodb.js: importador directo para MongoDB
- guests-import-adminmanager.txt: lista pronta para colar/importar no AdminManager

URL final esperada:
https://lirandzo.com/convite/edma-abel/

Dados integrados:
- Noivos: Edma Nobre & Abel Narciso
- Data: 12 de setembro de 2026
- Slug: edma-abel
- Convidados: 118 entradas / 200 pessoas autorizadas
- Lista de presentes: 24 itens
- Paleta/Dress code: nude, vinho rosado e champagne

Atenção sobre a música:
O cliente enviou um link do YouTube. O elemento <audio> do navegador precisa de um ficheiro directo em MP3/OGG para tocar como música de fundo. Assim, o convite mantém o controlo de música funcional, mas o ficheiro de áudio deve ser substituído por um link directo quando houver MP3 final.
