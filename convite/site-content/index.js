const { createHash } = require('node:crypto');

const packages = {
  perola: { label: 'Pérola', key: 'pearl' },
  esmeralda: { label: 'Esmeralda', key: 'emerald' },
  rubi: { label: 'Rubi', key: 'ruby' }
};
const articles = [
  'convite-digital', 'modelo-ideal-casamento', 'rsvp-lista-convidados',
  'sessao-pre-casamento', 'checklist-casamento', 'tons-terra-elegancia'
];

function fail(message, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode });
}

function findOne(source, pattern) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) fail('O conteúdo publicado mudou de estrutura. Reveja os ficheiros do site.');
  return matches[0];
}

const escapeHtml = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const readHtml = value => value.trim().replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, entity) => ({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'"
})[entity]);

function editPackages(home, currency, input) {
  const prices = {};
  for (const [id, { label, key }] of Object.entries(packages)) {
    const card = findOne(home, new RegExp('<article\\b[^>]*data-template-name="Pacote ' + label + '"[^>]*>[\\s\\S]*?</article>', 'g'));
    const price = findOne(card[0], /data-template-price="([\d.]+) MT"/g);
    const display = findOne(card[0], /(<strong class="package-price">)[\d.]+ MT(<\/strong>)/g);
    const converter = findOne(currency, new RegExp("(key: '" + key + "', [^\\r\\n]*amount: )([0-9]+)", 'g'));
    prices[id] = { label, amount: Number(price[1].replace(/\./g, '')) };
    if (!input) continue;
    const amount = input[id];
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000000) fail(`Indique um preço inteiro válido para ${label}.`, 400);
    const formatted = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' MT';
    home = home.replace(card[0], () => card[0]
      .replace(price[0], () => `data-template-price="${formatted}"`)
      .replace(display[0], () => display[1] + formatted + display[2]));
    currency = currency.replace(converter[0], () => converter[1] + amount);
  }
  return { prices, home, currency };
}

function articleCard(list, slug) {
  return findOne(list, new RegExp('<article\\b[^>]*>(?:(?!</article>)[\\s\\S])*?href="blog-' + slug + '\\.html"(?:(?!</article>)[\\s\\S])*?</article>', 'g'));
}

function editArticle(page, list, slug, input) {
  const card = articleCard(list, slug);
  const header = findOne(page, /<header class="blog-article-hero\b[^>]*>[\s\S]*?<\/header>/g);
  const body = findOne(page, /<div class="article-body">[\s\S]*?(?=<section class="article-cta-panel)/g);
  const fields = [];
  function edit(source, pattern, labels) {
    return source.replace(pattern, (markup, open, value, close) => {
      const label = labels[open.match(/^<([a-z0-9]+)/)[1]];
      const text = readHtml(value);
      const index = fields.push({ label, text }) - 1;
      if (!input) return markup;
      const next = input[index];
      if (typeof next !== 'string' || !next.trim() || next.length > 5000) fail(`Verifique o campo «${label}».`, 400);
      return next.trim() === text ? markup : open + escapeHtml(next.trim()) + close;
    });
  }
  const nextHeader = edit(header[0], /(<h1>|<p>|<span class="blog-card-category">)([^<]+)(<\/(?:h1|p|span)>)/g,
    { h1: 'Título', p: 'Introdução', span: 'Categoria' });
  const nextBody = edit(body[0], /(<(?:h2|h3|p|li)>)([^<]+)(<\/(?:h2|h3|p|li)>)/g,
    { h2: 'Título de secção', h3: 'Subtítulo', p: 'Parágrafo', li: 'Item da lista' });
  const nextCard = edit(card[0], /(<p class="blog-card-excerpt">)([^<]+)(<\/p>)/g, { p: 'Resumo na lista do blog' });
  const titleField = fields.findIndex(field => field.label === 'Título');
  const categoryField = fields.findIndex(field => field.label === 'Categoria');
  if (titleField < 0 || categoryField < 0 || fields.at(-1)?.label !== 'Resumo na lista do blog') fail('O artigo tem uma estrutura incompatível com o editor.');
  if (!input) return { fields };
  if (input.length !== fields.length) fail('Os campos do artigo mudaram. Volte a carregar os conteúdos.');
  const title = input[titleField].trim();
  const category = input[categoryField].trim();
  let publicCard = nextCard;
  if (category !== fields[categoryField].text) {
    publicCard = publicCard.replace(/(<span class="blog-card-category">)[^<]+(<\/span>)/, (_, open, close) => open + escapeHtml(category) + close);
  }
  page = page.replace(header[0], () => nextHeader).replace(body[0], () => nextBody);
  if (title !== fields[titleField].text) {
    const seoTitle = escapeHtml(title + ' - Blog Lirandzo');
    publicCard = publicCard
      .replace(/(<h2 class="blog-card-title"><a\b[^>]*>)[^<]+(<\/a><\/h2>)/, (_, open, close) => open + escapeHtml(title) + close)
      .replace(/aria-label="Ler artigo:[^"]*"/g, () => `aria-label="Ler artigo: ${escapeHtml(title)}"`);
    page = page.replace(/<title>[^<]*<\/title>/, () => `<title>${seoTitle}</title>`)
      .replace(/data-title-pt="[^"]*"/, () => `data-title-pt="${seoTitle}"`)
      .replace(/content="[^"]*" ((?:property|name)="(?:og|twitter):title")/g, (_, attr) => `content="${seoTitle}" ${attr}`)
      .replace(/("headline"\s*:\s*)"(?:\\.|[^"\\])*"/, (_, key) => key + JSON.stringify(title).replace(/</g, '\\u003c'));
  }
  return { page, list: list.replace(card[0], () => publicCard) };
}

function mountSiteContent(app, { gh, requireAdmin, asyncRoute }) {
  async function snapshot(paths) {
    const branch = encodeURIComponent(process.env.GITHUB_BRANCH || '');
    const ref = await gh(`/git/ref/heads/${branch}`);
    const commit = ref.object.sha;
    const files = await Promise.all(paths.map(async path => {
      const file = await gh(`/contents/${path}?ref=${commit}`);
      if (file.encoding !== 'base64' || typeof file.content !== 'string') fail(`O GitHub não devolveu o conteúdo de ${path}.`, 502);
      return { path, sha: file.sha, text: Buffer.from(file.content, 'base64').toString('utf8') };
    }));
    return { branch, commit, files, revision: files.map(file => file.sha).join(':') };
  }

  async function publish(state, contents, revision, message) {
    if (revision !== state.revision) fail('O conteúdo foi alterado entretanto. Volte a carregar antes de publicar.');
    const entries = state.files.flatMap((file, i) => file.text === contents[i] ? [] : [
      { path: file.path, content: contents[i], mode: '100644', type: 'blob' }
    ]);
    const publicFiles = state.files.map((file, i) => ({
      path: file.path,
      digest: createHash('sha256').update(contents[i].replace(/\r\n/g, '\n')).digest('hex')
    }));
    if (!entries.length) return { changed: false, revision: state.revision, publicFiles };
    const nextRevision = state.files.map((file, i) => {
      if (file.text === contents[i]) return file.sha;
      const bytes = Buffer.from(contents[i]);
      return createHash(file.sha.length === 64 ? 'sha256' : 'sha1')
        .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    }).join(':');
    const post = (path, body) => gh(path, { method: 'POST', body: JSON.stringify(body) });
    const base = await gh(`/git/commits/${state.commit}`);
    const tree = await post('/git/trees', { base_tree: base.tree.sha, tree: entries });
    const commit = await post('/git/commits', { message, tree: tree.sha, parents: [state.commit] });
    try {
      await gh(`/git/refs/heads/${state.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
    } catch (error) {
      if (/fast.forward/i.test(error.message)) fail('O ramo mudou durante a publicação. Volte a carregar e tente novamente.');
      throw error;
    }
    return { changed: true, commit: commit.sha, revision: nextRevision, publicFiles };
  }

  const root = '/manager/site-content';
  const respond = (res, data) => res.set('Cache-Control', 'no-store').json({ status: 'success', data });
  const readPackages = () => snapshot(['index.html', 'lang-currency.js']);
  const readArticle = slug => {
    if (!articles.includes(slug)) fail('Artigo indisponível.', 404);
    return snapshot([`blog-${slug}.html`, 'blog.html']);
  };
  const { pages, transform } = require('../adminmanager-page-fields');
  const pageState = name => {
    if (!pages.includes(name) && !articles.some(slug => name === 'blog-' + slug + '.html')) fail('Página desconhecida.', 404);
    return snapshot(name === 'index.html' ? [name, 'lang-currency.js'] : [name]);
  };
  app.get(root + '/pages/:name', requireAdmin, asyncRoute(async (req,res) => {
    const state = await pageState(req.params.name);
    const prices = state.files.length === 2 ? editPackages(...state.files.map(f=>f.text)).prices : {};
    respond(res,{fields:transform(state.files[0].text).fields,prices,revision:state.revision});
  }));
  app.put(root + '/pages/:name', requireAdmin, asyncRoute(async (req,res) => {
    const state = await pageState(req.params.name);
    const changes=req.body?.changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) fail('Campos inválidos.',400);
    const {output}=transform(state.files[0].text,changes);
    let contents=[output];
    if(state.files.length===2){
      const {home,currency}=editPackages(output,state.files[1].text,req.body.prices);
      contents=[home,currency];
    }
    respond(res,await publish(state,contents,req.body.revision,'Actualizar página '+req.params.name));
  }));
  app.get(root + '/packages', requireAdmin, asyncRoute(async (req, res) => {
    const state = await readPackages();
    const { prices } = editPackages(...state.files.map(file => file.text));
    respond(res, { prices, revision: state.revision });
  }));
  app.put(root + '/packages', requireAdmin, asyncRoute(async (req, res) => {
    if (!req.body?.prices || typeof req.body.prices !== 'object') fail('Indique os preços dos pacotes.', 400);
    const state = await readPackages();
    const { home, currency } = editPackages(...state.files.map(file => file.text), req.body.prices);
    respond(res, await publish(state, [home, currency], req.body.revision, 'Actualizar preços do site Lirandzo'));
  }));
  app.get(root + '/articles', requireAdmin, asyncRoute(async (req, res) => {
    const state = await snapshot(['blog.html']);
    respond(res, articles.map(slug => ({
      slug, title: readHtml(findOne(articleCard(state.files[0].text, slug)[0], /<h2 class="blog-card-title"><a\b[^>]*>([^<]+)<\/a><\/h2>/g)[1])
    })));
  }));
  app.get(root + '/articles/:slug', requireAdmin, asyncRoute(async (req, res) => {
    const state = await readArticle(req.params.slug);
    respond(res, { ...editArticle(...state.files.map(file => file.text), req.params.slug), revision: state.revision });
  }));
  app.put(root + '/articles/:slug', requireAdmin, asyncRoute(async (req, res) => {
    if (!Array.isArray(req.body?.fields)) fail('Indique os campos do artigo.', 400);
    const state = await readArticle(req.params.slug);
    const { page, list } = editArticle(...state.files.map(file => file.text), req.params.slug, req.body.fields);
    respond(res, await publish(state, [page, list], req.body.revision, `Editar artigo do blog: ${req.params.slug}`));
  }));
}

module.exports = { mountSiteContent, editPackages, editArticle, articles };
