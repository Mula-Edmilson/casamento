(() => {
  const root = '/manager/site-content';
  const byId = id => document.getElementById(id);
  const pricesForm = byId('sitePricesForm');
  const articleForm = byId('siteArticleForm');
  const priceFields = byId('sitePriceFields');
  const articleFields = byId('siteArticleFields');
  const articleSelect = byId('siteArticleSelect');
  let pricesRevision = '';
  let articleRevision = '';
  let openSlug = '';
  let initialLoad = false;
  let verification = 0;
  window.verifySitePublication = async function (files) {
    const attempt = ++verification;
    const status = byId('sitePublicationStatus');
    if (!Array.isArray(files) || !files.length || !status) return;
    status.hidden = false;
    status.textContent = 'A verificar a versão disponível no site público…';
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let retry = 0; retry < 9; retry++) {
      if (retry) await pause(10000);
      if (attempt !== verification) return;
      try {
        const matches = await Promise.all(files.map(async ({ path, digest }) => {
          const url = new URL('../' + path, location.href);
          url.searchParams.set('verificar', digest.slice(0, 12) + '-' + Date.now());
          const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
          if (!response.ok) return false;
          const source = (await response.text()).replace(/\r\n/g, '\n');
          const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
          return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('') === digest;
        }));
        if (attempt !== verification) return;
        if (matches.every(Boolean)) {
          status.textContent = 'Publicação confirmada no site público.';
          await window.refreshSiteCatalog();
          return;
        }
      } catch { /* The static host may still be deploying. */ }
    }
    if (attempt === verification) status.textContent = 'Gravado no ramo. A versão pública ainda está por confirmar.';
  };

  async function publicPage(path) {
    const response = await fetch(new URL(path, location.href), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Não foi possível ler a página pública.');
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  }

  async function publicPrices() {
    const page = await publicPage('../index.html');
    const prices = {};
    for (const [id, label] of [['perola', 'Pérola'], ['esmeralda', 'Esmeralda'], ['rubi', 'Rubi']]) {
      const value = page.querySelector(`[data-template-name="Pacote ${label}"]`)?.dataset.templatePrice;
      if (!/^[\d.]+ MT$/.test(value || '')) throw new Error(`Preço publicado de ${label} indisponível.`);
      prices[id] = { label, amount: Number(value.replace(/\D/g, '')) };
    }
    return { prices };
  }

  async function publicArticles() {
    const page = await publicPage('../blog.html');
    const entries = [...page.querySelectorAll('.blog-card-title a')].flatMap(link => {
      const slug = link.getAttribute('href')?.match(/^blog-([a-z0-9-]+)\.html$/)?.[1];
      return slug ? [{ slug, title: link.textContent.trim() }] : [];
    });
    if (!entries.length) throw new Error('Não foi possível encontrar os artigos do blog.');
    return entries;
  }

  async function publicArticle(slug) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Artigo indisponível.');
    const [page, list] = await Promise.all([publicPage(`../blog-${slug}.html`), publicPage('../blog.html')]);
    const fields = [];
    const append = (element, label) => {
      if (element?.textContent.trim()) fields.push({ label, text: element.textContent.trim() });
    };
    const hero = page.querySelector('.blog-article-hero');
    append(hero?.querySelector('.blog-card-category'), 'Categoria');
    append(hero?.querySelector('h1'), 'Título');
    append(hero?.querySelector('p'), 'Introdução');
    for (const node of page.querySelectorAll('.article-body .article-section :is(h2,h3,p,li)')) {
      append(node, { H2: 'Título de secção', H3: 'Subtítulo', P: 'Parágrafo', LI: 'Item da lista' }[node.tagName]);
    }
    append(list.querySelector(`.blog-card-title a[href="blog-${slug}.html"]`)?.closest('.blog-card')?.querySelector('.blog-card-excerpt'), 'Resumo na lista do blog');
    if (!fields.some(field => field.label === 'Título')) throw new Error('Conteúdo do artigo indisponível.');
    return { fields };
  }

  async function readContent(path, valid, fallback) {
    try {
      const { data } = await request(path, { signal: AbortSignal.timeout(45000) });
      if (!valid(data)) throw new Error('O backend devolveu uma resposta incompleta.');
      return { data, source: data.revision === 'preview' ? 'preview' : 'api' };
    } catch (error) {
      try {
        return { data: await fallback(), source: 'public' };
      } catch (fallbackError) {
        throw new Error(`${error.message} ${fallbackError.message}`);
      }
    }
  }

  function sourceMessage(source) {
    if (source === 'public') return 'Conteúdo do site público. Liga o backend de publicação para editar e guardar.';
    if (source === 'preview') return 'Conteúdo local. A publicação está desactivada nesta pré-visualização.';
    return 'Conteúdo lido do ramo de publicação.';
  }

  function addField(container, { id, label, value, numeric = false }) {
    const field = document.createElement('div');
    field.className = 'field';
    const caption = document.createElement('label');
    caption.htmlFor = id;
    caption.textContent = label;
    const input = document.createElement(numeric ? 'input' : 'textarea');
    input.id = id;
    input.required = true;
    input.value = value;
    if (numeric) {
      input.type = 'number';
      input.min = '1';
      input.max = '100000000';
      input.step = '1';
    } else {
      input.maxLength = 5000;
      input.rows = 3;
    }
    field.append(caption, input);
    container.append(field);
  }

  async function run(form, status, progress, action) {
    if (form.getAttribute('aria-busy') === 'true') return;
    form.setAttribute('aria-busy', 'true');
    const controls = [...form.elements].filter(control => !control.disabled);
    controls.forEach(control => { control.disabled = true; });
    showMsg(status, progress);
    try {
      showMsg(status, await action());
    } catch (error) {
      showMsg(status, error.message, true);
    } finally {
      controls.filter(control => control.type !== 'submit').forEach(control => { control.disabled = false; });
      form.querySelector('[type="submit"]').disabled = form === pricesForm ? !pricesRevision : !articleRevision;
      form.removeAttribute('aria-busy');
    }
  }

  const request = (path, options) => window.lirandzoAdminManagerRequest(root + path, options);
  const put = payload => ({ method: 'PUT', body: JSON.stringify(payload) });
  const published = data => data.changed
    ? `Alterações registadas no GitHub (${data.commit.slice(0, 7)}). O site actualiza após o deploy.`
    : 'Os valores já correspondem à versão publicada.';

  const pricesStatus = byId('sitePricesStatus');
  const loadPrices = () => run(pricesForm, pricesStatus, 'A carregar preços…', async () => {
    const { data, source } = await readContent('/packages', value => value?.prices && value.revision, publicPrices);
    pricesRevision = source === 'api' ? data.revision : '';
    priceFields.replaceChildren();
    for (const [id, price] of Object.entries(data.prices)) {
      addField(priceFields, { id, label: `${price.label} (MT)`, value: price.amount, numeric: true });
    }
    if (source === 'public') for (const input of priceFields.querySelectorAll('input')) input.readOnly = true;
    return sourceMessage(source);
  });
  byId('sitePricesLoad').addEventListener('click', loadPrices);
  pricesForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!pricesRevision) return;
    const prices = Object.fromEntries([...priceFields.querySelectorAll('input')].map(input => [input.id, input.valueAsNumber]));
    void run(pricesForm, pricesStatus, 'A publicar preços…', async () => {
      const { data } = await request('/packages', put({ prices, revision: pricesRevision }));
      pricesRevision = data.revision;
      void window.verifySitePublication(data.publicFiles);
      return published(data);
    });
  });

  const articleStatus = byId('siteArticleStatus');
  const articleEditing = byId('siteArticleEditing');
  const articleOpen = byId('siteArticleOpen');
  const loadArticles = async () => {
    let loaded = false;
    await run(articleForm, articleStatus, 'A carregar artigos…', async () => {
    const { data } = await readContent('/articles', value => Array.isArray(value) && value.length > 0, publicArticles);
    articleSelect.replaceChildren(...data.map(article => new Option(article.title, article.slug)));
    if (openSlug) articleSelect.value = openSlug;
    articleSelect.disabled = false;
    articleOpen.disabled = false;
    loaded = true;
    return 'Escolha um artigo para editar.';
    });
    if (loaded && !openSlug) await loadArticle();
  };
  const loadArticle = () => run(articleForm, articleStatus, 'A abrir o artigo…', async () => {
    const slug = articleSelect.value;
    const { data, source } = await readContent(`/articles/${encodeURIComponent(slug)}`, value => Array.isArray(value?.fields) && value.revision, () => publicArticle(slug));
    openSlug = slug;
    articleRevision = source === 'api' ? data.revision : '';
    articleFields.replaceChildren();
    data.fields.forEach((field, index) => addField(articleFields, {
      id: `siteArticleField${index}`, label: field.label, value: field.text
    }));
    if (source === 'public') for (const input of articleFields.querySelectorAll('textarea')) input.readOnly = true;
    articleEditing.textContent = `Em edição: ${data.fields.find(field => field.label === 'Título').text}`;
    articleEditing.classList.remove('hidden');
    return sourceMessage(source);
  });
  byId('siteArticlesLoad').addEventListener('click', loadArticles);
  articleOpen.addEventListener('click', loadArticle);
  articleForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!articleRevision) return;
    const fields = [...articleFields.querySelectorAll('textarea')].map(input => input.value);
    void run(articleForm, articleStatus, 'A publicar artigo…', async () => {
      const { data } = await request(`/articles/${encodeURIComponent(openSlug)}`, put({ fields, revision: articleRevision }));
      articleRevision = data.revision;
      void window.verifySitePublication(data.publicFiles);
      void window.refreshSiteCatalog();
      const option = [...articleSelect.options].find(item => item.value === openSlug);
      const titleField = [...articleFields.querySelectorAll('label')].find(label => label.textContent === 'Título');
      if (option && titleField) {
        option.text = byId(titleField.htmlFor).value.trim();
        articleEditing.textContent = `Em edição: ${option.text}`;
      }
      return published(data);
    });
  });
  window.loadSiteContentPanel = () => {
    void window.refreshSiteCatalog();
    if (initialLoad) return;
    initialLoad = true;
    void Promise.all([window.openSitePage(), loadArticles()]);
  };
})();
