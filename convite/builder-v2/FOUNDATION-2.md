# Admin Manager Builder V2 — Foundation 2

Esta fase liga a fundação de conteúdo V2 ao backend central de forma **opt-in e fail-safe**.

## Objectivo

Adicionar a infraestrutura real de Draft → Validate → Publish → Revisions → Rollback → Public Content sem converter nenhum convite existente para o novo renderer.

## Rotas previstas

### Manager

- `GET /manager/invites/:id/content`
- `PUT /manager/invites/:id/content/draft`
- `POST /manager/invites/:id/content/validate`
- `POST /manager/invites/:id/content/publish`
- `GET /manager/invites/:id/content/revisions`
- `POST /manager/invites/:id/content/rollback`

### Público

- `GET /api/public/invites/:slug/content`

## Permissões

| Acção | Editor | Admin | Público |
| --- | ---: | ---: | ---: |
| Ler conteúdo/draft | ✓ | ✓ | — |
| Guardar draft | ✓ | ✓ | — |
| Validar | ✓ | ✓ | — |
| Publicar | — | ✓ | — |
| Ler revisões | ✓ | ✓ | — |
| Preparar rollback | — | ✓ | — |
| Ler conteúdo publicado | — | — | apenas quando explicitamente activo |

## Segurança de publicação

Publicar conteúdo **não activa** o renderer V2.

A activação pública é controlada exclusivamente por:

```text
Invite.config.contentMode = "mongo-v2"
```

Nesta Foundation 2 não existe endpoint para alterar este campo.

Logo:

```text
Guardar draft   -> não altera convite público
Publicar        -> não activa renderer
Rollback        -> restaura apenas para draft
contentMode     -> continua legacy por defeito
```

O endpoint público em modo legacy devolve:

```json
{
  "active": false,
  "mode": "legacy",
  "content": null
}
```

Isto impede um frontend de começar a usar Mongo V2 apenas porque existe um `InviteContent` no banco.

## Controlo de concorrência

`PUT /draft`, `POST /publish` e `POST /rollback` exigem `expectedDraftRevision`.

Se outro operador tiver guardado uma versão entretanto, a API responde `409 DRAFT_REVISION_CONFLICT` em vez de sobrescrever o trabalho silenciosamente.

## Transacções

Operações que escrevem conteúdo e histórico usam transacções MongoDB. Não existe fallback para escrita parcial.

Dentro da mesma transacção ficam:

- `InviteContent`
- `InviteContentRevision`
- `Activity`

Se a transacção não estiver disponível, a operação falha fechada.

## Histórico

Cada save de draft cria uma revisão `stage=draft`.

Cada publish cria uma revisão `stage=published` com SHA-256 canónico do conteúdo.

O rollback recebe uma revisão publicada e cria **um novo draft**. O conteúdo público anterior permanece intacto até existir um novo `publish` explícito.

## FormSubmission

O model `FormSubmission` passa a ser registado no backend nesta fase, mas ainda não recebe endpoints públicos/Inbox. A interface de Inbox e importação de formulários será uma fase própria para evitar misturar ingestão externa com o motor de publicação.

## Integração controlada no server.js

Para reduzir o risco de editar manualmente o `server.js` central, esta branch inclui:

- `tools/apply-builder-v2-foundation2.js`
- `RUN-BUILDER-V2-FOUNDATION2.ps1`

O patcher procura marcadores exactos no servidor, recusa integração parcial e é idempotente.

O runner:

1. exige a branch `feature/admin-manager-builder-v2-foundation-2`;
2. exige working tree limpa;
3. faz CHECK do patch;
4. altera somente `convite/server.js` e `convite/package.json`;
5. executa regressão global;
6. valida o diff;
7. faz commit e push apenas para a feature branch;
8. nunca faz merge nem deploy manual.

## Fora de escopo desta fase

- editor visual no AdminManager;
- activação de qualquer convite em `mongo-v2`;
- migração de conteúdo de convites publicados;
- sincronização SEO no GitHub;
- upload/gestão de media;
- Inbox dos formulários;
- importação automática de submissões;
- renderer V2 no HTML dos convites.

## Rollout

```text
feature branch
   ↓
testes globais
   ↓
review do diff
   ↓
PR
   ↓
aprovação explícita
   ↓
merge
```

Mesmo após merge, os convites existentes continuam em `legacy` até uma migração piloto explicitamente aprovada.
