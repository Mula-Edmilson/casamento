LIRANDZO · AMÉLIA & EDILSON · FIX PRESENTES V5

O backend v5 sincroniza registos antigos de "Presente escolhido" guardados em contributions para a colecção giftitems.

Regras aplicadas:
1. O nome real do presente é extraído de selectedGift/giftChoice/selectedGifts ou do nome do ficheiro antigo: presente-escolhido-<presente>.pdf.
2. O primeiro registo cronológico reserva o presente no GiftItem.
3. Registos duplicados do mesmo presente ficam marcados como conflito no admin, sem libertar o item para novas escolhas.
4. O convite usa GiftItem.reserved como fonte de verdade para bloquear presentes.
5. Novas escolhas criam também um registo auditável em contributions com selectedGift preenchido.

Depois do deploy do server.js v5 no Render, basta abrir o admin ou o convite: a sincronização acontece automaticamente.
