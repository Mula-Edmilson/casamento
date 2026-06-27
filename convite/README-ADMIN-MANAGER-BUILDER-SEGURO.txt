# Lirandzo Admin Manager — Reconstrução segura

Data: 2026-06-27

## O que mudou

Esta versão troca a lógica antiga de “copiar template simples” por um construtor seguro por blocos controlados.

Foram recriados os templates a partir dos convites reais publicados em `convite/`:

- `convite/rosalina-monteiro` → `convite/templates/rubi-rosalina`
- `convite/edma-abel` → `convite/templates/esmeralda-edma`
- `convite/calate-helder` → `convite/templates/perola-calate`
- `convite/flicia-walter-convite` → `convite/templates/perola-flicia`
- `convite/minoca-abubacar` → `convite/templates/perola-publico`
- `convite/amelia-edilson` → `convite/templates/perola-amelia`

Cada template agora tem:

- `index.html`
- `convite.html`
- `admin.html` avançado, vindo do convite real correspondente
- `style.css`
- `lirandzo-api.js`
- `cms-template.js`
- `template.schema.json`

## Abordagem segura

Não foi feito drag-and-drop livre nesta fase. A criação é por blocos controlados:

- Hero/capa
- Pais/família
- História
- Agenda
- Mapa
- Galeria
- Dress code
- Menu
- Presentes
- Contribuições
- Mensagens
- Cápsula
- Check-in
- RSVP

Isto preserva o layout premium dos convites reais e reduz risco de quebrar HTML/CSS.

## Regras importantes

Para criar convite novo completo:

1. Abrir `convite/adminmanager.html`.
2. Escolher um modelo real.
3. Preencher dados completos.
4. Carregar fotos/música.
5. Manter marcado `Copiar template para GitHub`.
6. Criar convite.

O sistema cria automaticamente:

- pasta `convite/slug/`
- `client-config.js`
- `event-data.js`
- `invite-data.json`
- uploads em `assets/media/`

## Variáveis Render recomendadas

```
MONGODB_URI=...
MANAGER_PASSWORD=...
MANAGER_SECRET=uma_chave_com_mais_de_16_caracteres
PUBLIC_API_BASE_URL=https://api-casamento-mj.onrender.com
PUBLIC_SITE_URL=https://lirandzo.com
ALLOWED_ORIGINS=https://lirandzo.com,https://www.lirandzo.com
GITHUB_TOKEN=...
GITHUB_OWNER=Mula-Edmilson
GITHUB_REPO=casamento
GITHUB_BRANCH=main
INVITES_BASE_PATH=convite
JSON_LIMIT=50mb
```

## Nota técnica

Os convites reais existentes em `convite/` não foram apagados nem alterados estruturalmente. A reconstrução foca o Admin Manager e os templates usados para novos convites.
