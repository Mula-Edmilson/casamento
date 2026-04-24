(() => {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(() => {
    const revealTargets = [
      ...document.querySelectorAll('.section, #pacotes .package-card-premium, #testemunhos .styled-testimonial, .info-block, .modal-card-details')
    ];

    revealTargets.forEach((el, index) => {
      if (!el.classList.contains('motion-reveal')) el.classList.add('motion-reveal');
      el.dataset.motionDelay = String(index % 5);
    });

    if (!('IntersectionObserver' in window)) {
      revealTargets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    revealTargets.forEach((el) => observer.observe(el));
  });
})();
