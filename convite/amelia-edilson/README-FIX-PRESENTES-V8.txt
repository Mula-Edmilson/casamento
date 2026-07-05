LIRANDZO · Amélia & Edilson · Fix v8

Objectivo desta versão:
- O admin deixa de carregar PDFs, imagens, thumbnails ou links de ficheiro na área de presentes.
- O admin mostra somente: data/hora, convidado, nome do presente escolhido e estado.
- A lista é carregada por uma rota leve: get_gift_selections / list_gift_selections.
- A reserva real continua no MongoDB em GiftItem.
- Registos antigos em Contribution são sincronizados no backend, mas aparecem apenas como texto.
- Duplicados antigos continuam sinalizados como Duplicado, sem apagar histórico.

Deploy:
1. Substituir server.js no backend pelo server.js v8.
2. Fazer redeploy no Render.
3. Substituir a pasta convite/amelia-edilson/ pelo conteúdo deste ZIP.
4. Fazer hard refresh no admin.
