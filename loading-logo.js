(function () {
  'use strict';

  var done = false;

  function finishLoading() {
    if (done || !document.body) return;
    done = true;
    document.body.classList.remove('loading');
    document.body.classList.add('loaded');
  }

  if (document.readyState === 'complete') {
    setTimeout(finishLoading, 450);
  } else {
    window.addEventListener('load', function () {
      setTimeout(finishLoading, 450);
    }, { once: true });
  }

  // Segurança: impede que o loading fique preso caso algum recurso externo demore.
  setTimeout(finishLoading, 2200);
})();
