(() => {
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  async function render(path, id, fill) {
    const host = document.getElementById(id);
    host.textContent = 'A carregar…';
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw Error('Página indisponível.');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const items = fill(doc);
      if (!items.length) throw Error('Conteúdo indisponível.');
      host.replaceChildren(...items);
    } catch (error) { host.textContent = error.message; }
  }
  const get = id => document.getElementById(id);
  function switchView(view) {
    for (const button of document.querySelectorAll('[data-site-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.siteView === view));
    }
    get('siteCatalog').hidden = view !== 'packages';
    get('siteBlogCatalog').hidden = view !== 'blog';
    get('sitePageEditor').hidden = view !== 'pages';
    get('siteArticleForm').hidden = true;
    if(view==='pages') window.focusSitePackage?.('');
  }
  document.querySelectorAll('[data-site-view]').forEach(button =>
    button.addEventListener('click', () => switchView(button.dataset.siteView)));
  function action(label, handler) {
    const button = element('button', label);
    button.type = 'button';
    button.className = 'btn small';
    button.addEventListener('click', handler);
    return button;
  }
  window.refreshSiteCatalog = () => Promise.all([
    render('../index.html', 'siteCatalog', doc => [...doc.querySelectorAll('.package-card-premium')].map(card => {
      const entry = document.createElement('article');
      const variant = [...card.querySelector('.package-icon').classList].find(name => ['pearl','emerald','ruby','corporate'].includes(name));
      entry.className = 'site-package ' + (variant || '');
      const image = document.createElement('img');
      image.src = '../assets/package-' + variant + '.png';
      image.alt = '';
      entry.append(image);
      entry.append(element('h3', card.querySelector('h3').textContent), element('strong', card.dataset.templatePrice));
      const list = document.createElement('ul');
      list.append(...card.dataset.features.split('|').map(item => element('li', item)));
      const features = element('details', '');
      features.append(element('summary', 'Funcionalidades (' + list.children.length + ')'), list);
      entry.append(features);
      const preview = element('details', '');
      preview.append(element('summary', 'Pré-visualizar cartão do site'));
      preview.addEventListener('toggle', () => {
        if (!preview.open || preview.querySelector('iframe')) return;
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', '');
        frame.title = card.dataset.templateName;
        frame.style.cssText = 'width:100%;height:390px;border:0';
        const sample = document.implementation.createHTMLDocument(card.dataset.templateName);
        const base = sample.createElement('base');
        base.href = new URL('../index.html', location.href).href;
        sample.head.append(base);
        for (const sheet of doc.querySelectorAll('link[rel="stylesheet"],style')) sample.head.append(sheet.cloneNode(true));
        const section = sample.createElement('section');
        section.id = 'pacotes';
        section.className = 'packages-showcase';
        const copy = card.cloneNode(true);
        copy.style.cssText = 'opacity:1;visibility:visible;transform:none;width:100%;margin:auto';
        section.append(copy);
        sample.body.append(section);
        frame.srcdoc = sample.documentElement.outerHTML;
        preview.append(frame);
      });
      entry.append(preview);
      entry.append(action('Editar pacote', async () => {
        switchView('pages');
        if (get('sitePage').value !== 'index.html') {
          get('sitePage').value = 'index.html';
          await window.openSitePage();
        }
        window.focusSitePackage(card.dataset.templateName);
        get('sitePageEditor').scrollIntoView({block:'start'});
      }));
      return entry;
    })),
    render('../blog.html', 'siteBlogCatalog', doc => [...doc.querySelectorAll('.blog-card')].map(card => {
      const link = card.querySelector('.blog-card-title a');
      const article = document.createElement('article');
      const title = element('a', link.textContent);
      title.href = new URL(link.getAttribute('href'), new URL('../blog.html', location.href));
      title.target = '_blank'; title.rel = 'noopener';
      article.className = 'site-story';
      const cover = card.querySelector('img');
      if (cover) {
        const image = document.createElement('img');
        image.src = new URL(cover.getAttribute('src'), title.href).href;
        image.alt = ''; image.loading = 'lazy';
        image.onerror = () => { image.hidden = true; };
        article.append(image);
      }
      const copy = element('div', '');
      copy.append(element('small', card.querySelector('.blog-card-category')?.textContent || ''), title, element('p', card.querySelector('.blog-card-excerpt').textContent));
      copy.append(action('Editar artigo', () => {
        const select = get('siteArticleSelect');
        get('siteArticleForm').hidden = false;
        select.value = link.getAttribute('href').replace(/^blog-|\.html$/g, '');
        get('siteArticleOpen').click();
        get('siteArticleForm').scrollIntoView({block:'start'});
      }));
      article.append(copy);
      return article;
    }))
  ]);
  window.addEventListener('DOMContentLoaded', () => {
    if (location.hash === '#site' && document.body.classList.contains('role-admin')) showPanel('siteContent');
  });
})();
