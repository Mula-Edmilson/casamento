JULIANA & BAPTISTA — VERSÃO PÚBLICA COMPATÍVEL COM O SERVIDOR GERAL

Fluxo final:
- A capa abre directamente o convite.
- Não existe login por nome antes da abertura.
- RSVP exige nome completo.
- Presentes/contribuições exigem nome completo.
- Mensagens exigem nome completo.
- O admin apresenta os nomes nas confirmações, contribuições e mensagens.

Servidor:
- Baseado no server.js geral multi-convite enviado pelo cliente.
- A autorização para criação automática é controlada no Render pela variável PUBLIC_RSVP_AUTO_CREATE_SLUGS.
- A lógica de contribuição por quantidade foi adicionada de forma genérica e só é activada quando config.giftSelectionMode = quantity_contributions.
- Os restantes convites mantêm o fluxo existente.

Variável necessária:
PUBLIC_RSVP_AUTO_CREATE_SLUGS=minoca-abubacar,juliana-baptista

Consulte CONFIGURACAO-RENDER-CONVITE-PUBLICO.txt antes de publicar.
