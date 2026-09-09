(() => {
  'use strict';
  const EVENT_DATE = new Date('2026-11-14T14:00:00+02:00');
  const WHATSAPP_NUMBER = '258858511647';
  const MAP_URL = 'https://maps.app.goo.gl/1JTxHuKMnCRXwyrM6';
  const MUSIC_URL = 'https://static.wixstatic.com/mp3/819ea0_e333d443f2f545e59d79429cdd3c1361.mp3';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
  }

  function openWhatsapp(text) {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function updateCountdown() {
    const diff = EVENT_DATE.getTime() - Date.now();
    const ids = ['days','hours','minutes','seconds'];
    if (diff <= 0) { ids.forEach((id,i)=>{ const el=document.getElementById(id); if(el) el.textContent=i===0?'0':'00'; }); return; }
    let total=Math.floor(diff/1000);
    const days=Math.floor(total/86400); total-=days*86400;
    const hours=Math.floor(total/3600); total-=hours*3600;
    const minutes=Math.floor(total/60); const seconds=total-minutes*60;
    const values={days:String(days),hours:String(hours).padStart(2,'0'),minutes:String(minutes).padStart(2,'0'),seconds:String(seconds).padStart(2,'0')};
    Object.entries(values).forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.textContent=v;});
  }

  function initReveal() {
    const items = $$('.fade-in-section');
    if (!('IntersectionObserver' in window)) { items.forEach(el=>el.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .08, rootMargin: '0px 0px -5% 0px' });
    items.forEach(el=>observer.observe(el));
    const titles = $$('.section-title');
    titles.forEach(el=>observer.observe(el));
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.remove('loading');
    requestAnimationFrame(() => document.body.classList.add('loaded'));
    updateCountdown(); setInterval(updateCountdown,1000); initReveal();

    const music = $('#backgroundMusic');
    const musicControl = $('#musicControl');

    const updateMusicIcon = () => {
      if (!music || !musicControl) return;
      musicControl.innerHTML = music.paused
        ? `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg>`
        : `<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13M9 18a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM21 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/></svg>`;
      musicControl.classList.toggle('playing', !music.paused);
      musicControl.setAttribute('aria-label', music.paused ? 'Tocar música' : 'Pausar música');
    };

    const prepareMusic = () => {
      if (!music) return;
      if (music.getAttribute('src') !== MUSIC_URL) music.setAttribute('src', MUSIC_URL);
      music.loop = true;
      music.preload = 'auto';
      music.setAttribute('playsinline', '');
      music.volume = 0.72;
    };

    const safePlayMusic = () => {
      if (!music) return Promise.resolve(false);
      prepareMusic();
      return music.play()
        .then(() => {
          sessionStorage.removeItem('lirandzoPlayMusic');
          updateMusicIcon();
          return true;
        })
        .catch(() => {
          updateMusicIcon();
          return false;
        });
    };

    if (music && musicControl) {
      prepareMusic();
      updateMusicIcon();

      musicControl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (music.paused) safePlayMusic();
        else {
          music.pause();
          updateMusicIcon();
        }
      });

      const startOnFirstInteraction = () => {
        safePlayMusic().then((played) => {
          if (played) {
            document.removeEventListener('pointerdown', startOnFirstInteraction, true);
            document.removeEventListener('touchstart', startOnFirstInteraction, true);
            document.removeEventListener('keydown', startOnFirstInteraction, true);
          }
        });
      };

      // Tenta iniciar ao entrar. Se o navegador bloquear autoplay,
      // inicia na primeira interacção do convidado.
      safePlayMusic().then((played) => {
        if (!played) {
          document.addEventListener('pointerdown', startOnFirstInteraction, true);
          document.addEventListener('touchstart', startOnFirstInteraction, true);
          document.addEventListener('keydown', startOnFirstInteraction, true);
        }
      });

      music.addEventListener('play', updateMusicIcon);
      music.addEventListener('pause', updateMusicIcon);
    }

    $('#fabRsvpBtn')?.addEventListener('click',()=>openModal('rsvpModal'));
    $('#rsvpBtn')?.addEventListener('click',()=>openModal('rsvpModal'));
    $('#fabEventInfoBtn')?.addEventListener('click',()=>openModal('eventInfoModal'));
    $('#infoButton')?.addEventListener('click',()=>openModal('eventInfoModal'));
    $('#fabMapBtn')?.addEventListener('click',()=>openModal('locationChooserModal'));
    $('#locationBtn')?.addEventListener('click',()=>openModal('locationChooserModal'));
    $('#travelDetailsBtn')?.addEventListener('click',()=>openModal('locationChooserModal'));
    $('#fabWhatsappBtn')?.addEventListener('click',()=>openWhatsapp('Olá! Gostaria de falar sobre o Lobolo de Eddy & Egna.'));
    $('#whatsappBtn')?.addEventListener('click',()=>openWhatsapp('Olá! Gostaria de falar sobre o Lobolo de Eddy & Egna.'));

    $$('[data-open-modal]').forEach(btn=>btn.addEventListener('click',()=>openModal(btn.dataset.openModal)));
    $$('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.closest('.modal'))));
    $$('.modal').forEach(modal=>modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(modal); }));
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') $$('.modal.open').forEach(closeModal); });

    $('#rsvpForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#guestName');
      const status = $('#rsvpStatus');
      const name = (input?.value || '').trim();
      if (!name) { if(status) status.textContent='Por favor, escreva o seu nome.'; input?.focus(); return; }
      if(status) status.textContent='A abrir o WhatsApp…';
      const text = `Olá! Confirmo a minha presença no Lobolo de Eddy & Egna, no dia 14 de novembro de 2026 às 14:00. Nome: ${name}.`;
      openWhatsapp(text);
    });
  });
})();