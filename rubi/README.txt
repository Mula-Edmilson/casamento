LIRANDZO · PACOTE ESMERALDA · V10 — CONVITE PREMIUM COMERCIAL
==============================================================

Esta versão transforma o convite Rustic Chic Wedding numa demo comercial mais completa.

FICHEIROS PRINCIPAIS
--------------------
1. index.html
   Convite principal com experiência visual, personalização, RSVP, presentes, mural, cápsula, dashboard e QR individual.

2. admin-convidados/index.html
   Painel extra para gerir convidados, criar links únicos, definir mesas, gerar QR Codes individuais e exportar dados.

3. checkin/index.html
   App extra para a equipa validar convidados por QR Code usando a câmara.

PINs DE DEMONSTRAÇÃO
--------------------
Área dos noivos: 2026
Gestão de convidados: 2026
Check-in da equipa: 2026

FUNCIONALIDADES V10
-------------------
- Links únicos por convidado: index.html?token=TOKEN_DO_CONVIDADO
- Personalização automática por convidado
- Código QR individual por convidado
- Código de entrada individual
- Gestão de mesas
- RSVP avançado
- Presentes em lightbox com reserva
- Mural de felicitações com aprovação/moderação
- Check-in por câmara
- Prevenção de check-in duplicado no mesmo dispositivo
- Exportação CSV/JSON
- Painel de convidados
- Painel dos noivos com estatísticas
- Estrutura preparada para futura ligação a Google Sheets, Apps Script, MongoDB, Telegram ou WhatsApp

NOTA TÉCNICA IMPORTANTE
-----------------------
Esta é uma versão estática e local. Os dados ficam guardados no localStorage do navegador.
Para uso profissional real com vários dispositivos sincronizados, é necessário ligar a uma base de dados, por exemplo:
- Google Sheets + Google Apps Script
- MongoDB + Render
- Backend próprio com autenticação

CÂMARA / QR CODE
----------------
A câmara funciona melhor em HTTPS ou num servidor local.
Se abrir directamente como file://, alguns navegadores podem bloquear a câmara.
Sugestão local:
- Abrir a pasta com VS Code
- Usar Live Server
- Ou executar: python -m http.server 8000

Depois abrir:
http://localhost:8000

QR CODE REAL
------------
O QR visual usa serviço externo para gerar imagem de QR Code.
Se estiver totalmente offline, o modo manual continua disponível.

LIRANDZO
--------
Convites digitais premium com experiência, gestão e emoção.
