window.addEventListener('load', () => {
    const video = document.getElementById('mainVideo');
    const btnPlay = document.querySelector('.btn-play');

    if (btnPlay && video) {
        btnPlay.addEventListener('click', () => {
            // Verifica se o vídeo está sem som
            if (video.muted) {
                // 1. Ativa o som
                video.muted = false;
                
                // 2. Reinicia o vídeo para ouvir a mensagem desde o início
                video.currentTime = 0;
                video.play(); 

                // 3. Muda o botão para a opção de silenciar (com ícone de som cortado)
                btnPlay.innerHTML = `
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                    SILENCIAR
                `;
            } else {
                // Se já tiver som, volta a colocar no mudo
                video.muted = true;

                // Volta ao botão original (com ícone do telemóvel)
                btnPlay.innerHTML = `
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zM9 7h6v2H9zm0 4h6v2H9zm0 4h6v2H9z"/></svg>
                    TOCA AQUI
                `;
            }
        });
    }
});