LIRANDZO · AMÉLIA & EDILSON · FIX PRESENTES V6

Deploy recomendado:
1. Render: subir server-amelia-edilson-final-v6.js como server.js.
2. GitHub: substituir a pasta convite/amelia-edilson pelo conteúdo desta pasta.

Validações feitas:
- Server passou em node --check.
- Scripts inline de admin.html e convite.html passaram em node --check.
- Lista exacta de presentes do convite foi alinhada no backend.
- Registos antigos de contributions com ficheiro presente-escolhido-*.pdf são migrados para GiftItem.
- Presentes duplicados antigos ficam em conflito, sem apagar histórico.
- GiftItem é a fonte de verdade para bloqueio de presente.
- Cada convidado/token/nome só pode reservar 1 presente.

Não fazer reset manual dos presentes antes do deploy.
