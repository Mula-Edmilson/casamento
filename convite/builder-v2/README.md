# Admin Manager Builder V2 — Foundation

Esta pasta contém a fundação isolada do futuro construtor/editor de convites Lirandzo.

## Princípio

O GitHub continua responsável por estrutura visual e assets:

- HTML
- CSS
- JavaScript do renderer
- ícones/fontes
- imagens, áudio e outros assets

O MongoDB passa gradualmente a ser responsável por conteúdo estruturado e estado:

- nomes e família
- data, agenda e localizações
- história, carta, dress code, menu
- configuração de secções/features
- acesso nominal ou aberto
- RSVP
- configurações de presentes
- SEO editável
- draft/publicado e histórico

O HTML deve ser renderer de componentes controlados, não o local onde o conteúdo editorial vive.

## Padrões reais cobertos

| Padrão real | Representação V2 |
| --- | --- |
| convite nominal por lista/token | `access.mode = nominal`, `rsvpIdentity = guest_token` |
| convite aberto mas com nome obrigatório nas acções | `access.mode = open`, `rsvpIdentity = name`, `requireNameOnActions = true` |
| lista de presentes MongoDB | `gifts.mode = catalog`, `gifts.catalogMode = mongo` |
| presentes legacy | `gifts.catalogMode = legacy` |
| contribuição por quantidade | `gifts.mode = quantity_contributions` |
| apenas contribuição monetária | `gifts.mode = monetary` |
| presente repetível | `gifts.options[].repeatable = true` |
| agenda com 2, 3, 4 ou mais momentos | `schedule[]` |
| secções opcionais | `features.*` |
| convites antigos | `runtime.contentMode = legacy` |
| novos/migrados | `runtime.contentMode = mongo-v2` |

Exemplos reais usados como referência de compatibilidade: Edna & Mauro, Juliana & Baptista, Celeste/Arsenio, Amélia & Edilson e Rosalina & Monteiro.

## Ficheiros

- `invite-content-v2.js` — normalização, migração de dados legacy e validação draft/publicação.
- `invite-content-v2.schema.json` — contrato JSON formal.
- `template-registry-v2.js` — registry controlado de templates reais.
- `form-submission-v2.js` — transforma submissões estruturadas em drafts V2.
- `mongo-models-v2.js` — schemas Mongo para draft/publicado, histórico e submissões.

## Modelo Draft → Published

```text
Editar no Admin
      ↓
InviteContent.draft
      ↓
Validar / Preview
      ↓
Publicar
      ↓
InviteContent.published
      ↓
Revision imutável
      ↓
Renderer público
```

Editar o draft nunca muda o convite real.

Cada publicação deverá validar o schema, gerar uma revisão, calcular hash do conteúdo e substituir `published` de forma atómica. Alterações de SEO no GitHub serão uma etapa explícita e separada.

## FormSubmission

Os formulários Pérola / Esmeralda / Rubi devem evoluir para colectores estruturados:

```text
Formulário
   ↓
FormSubmission(status=new)
   ↓
Revisão no Admin Manager
   ↓
Importar
   ↓
InviteContent.draft
```

O formulário não publica e não cria automaticamente um convite em produção.

## Template Registry

Defaults técnicos iniciais:

- Pérola nominal → `perola-amelia`
- Pérola aberto → `perola-publico`
- Esmeralda → `esmeralda-edma`
- Rubi → `rubi-rosalina`

Isto é um registry técnico, não uma redefinição comercial do que cada pacote inclui.

## Política de migração

A migração será opt-in:

```text
runtime.contentMode = legacy    -> comportamento actual
runtime.contentMode = mongo-v2  -> renderer V2
```

Valor desconhecido volta para `legacy`. Nenhum convite existente deve ser activado em massa.

## Próximas fases

### Foundation 1 — esta fase
Contrato V2, registry, schemas Mongo, mapper de formulário e testes.

### Foundation 2
Integrar os schemas no `server.js` e criar API autenticada:

- `GET /manager/invites/:id/content`
- `PUT /manager/invites/:id/content/draft`
- `POST /manager/invites/:id/content/validate`
- `POST /manager/invites/:id/content/publish`
- `GET /manager/invites/:id/content/revisions`
- `POST /manager/invites/:id/content/rollback`
- `GET /api/public/invites/:slug/content`

Todos os convites continuam legacy por defeito.

### Builder UI
Editor por secções no Admin Manager com preview, autosave de draft e botão explícito Publicar.

### Form Inbox
Recepção/importação das submissões dos formulários e mapeamento para drafts.

### Renderer V2
Um convite piloto passa a carregar conteúdo publicado do MongoDB.

## Regra de segurança

Nunca fazer migração massiva, merge ou deploy automático.

```text
branch -> testes -> diff -> PR -> aprovação explícita -> merge
```
