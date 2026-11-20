(() => {
const pages = ['index.html','blog.html','form.html','privacidade.html','termos.html','404.html'];
const safe = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const decode = value => value.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function transform(html, changes = {}) {
  const fields = [];
  let group = 'Cabeçalho';
  function field(raw,label,kind='text') {
    const id = String(fields.length);
    fields.push({id,group,label,value:decode(raw),kind});
    if (!Object.hasOwn(changes,id)) return raw;
    const value = changes[id];
    if (typeof value !== 'string' || !value.trim() || value.length > 16000) throw Object.assign(Error('Valor inválido em '+label),{statusCode:400});
    if (kind==='url' && !/^(https?:\/\/|mailto:|tel:|#|\/[^/]|[\wÀ-ÿ.-]+(?:[/?#]|$))/i.test(value)) throw Object.assign(Error('Endereço inválido.'),{statusCode:400});
    return safe(value.trim());
  }
  let inPackage=false, packageParent='', tag='';
  const output = html.replace(/<!--[\s\S]*?-->|<(script|style|svg|textarea)\b[^>]*>[\s\S]*?<\/\1>|<[^>]+>|[^<]+/gi, token=>{
    if (/^<(?:script|style|svg|textarea|!)/i.test(token)) return token;
    if (/^<article\b/.test(token) && token.includes('data-template-name=')) {
      packageParent=group; inPackage=true; group=token.match(/data-template-name="([^"]+)"/)[1];
    } else if (/^<section\b/.test(token)) group=token.match(/\bid="([^"]+)"/)?.[1] || group;
    else if (/^<\/article/.test(token) && inPackage) {inPackage=false;group=packageParent;}
    if (token.startsWith('<')) tag=token.match(/^<(\w+)/)?.[1] || '';
    if (token.startsWith('<')) return token.replace(/\s(href|src|alt|placeholder|data-features|data-demo-url|aria-label|data-description-pt|data-title-pt)="([^"]*)"/g,(whole,key,raw)=>{
      if (/^<(link|base|script)\b/i.test(token)) return whole;
      const labels={'data-features':'Funcionalidades incluídas (separadas por |)','data-demo-url':'Demonstração','href':'Destino','src':'Imagem ou multimédia','alt':'Descrição da imagem'};
      return ' '+key+'="'+field(raw,labels[key]||key,['href','src','data-demo-url'].includes(key)?'url':'text')+'"';
    });
    const value=token.trim();
    if (!value || (inPackage && /^[\d.]+ MT$/.test(value))) return token;
    const label = {h3:'Nome apresentado',li:'Destaque do cartão',button:'Texto do botão',strong:'Preço apresentado'}[tag];
    return token.replace(value,()=>field(value,inPackage?(label || 'Texto do pacote'):'Texto'));
  });
  if(Object.keys(changes).some(id=>!fields[Number(id)] || fields[Number(id)].id!==id)) throw Error('Campo desconhecido.');
  return {fields,output};
}
if(typeof module !== 'undefined' && module.exports) module.exports={pages,transform};
else window.sitePageFields={pages,transform};
})();
