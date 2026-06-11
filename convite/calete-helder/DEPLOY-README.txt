Deploy rápido — Calate & Helder

1. Publicar a pasta /calate-helder/ no caminho público desejado.
2. Slug oficial: calate-helder
3. API configurada: https://api-casamento-mj.onrender.com
4. Antes de testar RSVP no site publicado, importar o convite para o MongoDB:

   node import-calate-helder-to-mongodb.js

5. Ficheiros principais:
   - index.html: capa/acesso do convidado
   - convite.html: convite público com RSVP
   - admin.html: painel do cliente
   - event-data.js: dados do evento + lista de convidados
   - client-config.js: slug/API
   - guests-import-adminmanager.txt: lista organizada para importação

Funcionalidades removidas deste convite:
- QR Code
- Check-in
- Cápsula do Tempo

Observação:
As fotografias antigas da base foram removidas das ligações visíveis. Como ainda não foram fornecidas fotografias oficiais de Calate & Helder, o convite usa fundos florais neutros existentes na base.
