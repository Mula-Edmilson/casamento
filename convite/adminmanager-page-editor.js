(() => {
  const get = id => document.getElementById(id);
  const select=get('sitePage'), host=get('pageFields'), state=get('pageState'), save=get('pageSave'), preview=get('pagePreview'), frame=get('pageFrame');
  const {pages,transform}=window.sitePageFields;
  const labels=['Página inicial e pacotes','Blog','Formulário','Privacidade','Termos','Página 404'];
  pages.forEach((name,i)=>select.add(new Option(labels[i],name)));
  let revision, source, fields, inputs, amounts, active;
  let focusedPackage = '';
  const editor = get('sitePageEditor');
  function focusPackage(name = '') {
    focusedPackage = name;
    editor.querySelector('h2').textContent = name || 'Editar página';
    select.closest('label').hidden = Boolean(name);
    save.textContent = name ? 'Guardar pacote' : 'Publicar página';
    for (const item of host.children) {
      const selected = item.querySelector('summary').textContent === name;
      item.hidden = Boolean(name && !selected);
      if (name) item.open = selected;
    }
    frame.hidden = true;
  }
  window.focusSitePackage = focusPackage;
  const endpoint=()=>'/manager/site-content/pages/'+active;
  function control(parent,label,value,numeric=false){
    const wrapper=document.createElement('label'); wrapper.className='field';wrapper.textContent=label;
    const input=document.createElement(numeric?'input':'textarea');
    if(numeric){input.type='number';input.min='1';input.step='1';}
    input.value=value;if(numeric)input.dataset.original=value;wrapper.append(input);parent.append(wrapper);return input;
  }
  async function load(){
    select.disabled=true;save.disabled=true;preview.disabled=true;frame.hidden=true;host.replaceChildren();
    active=select.value;revision=null;source='';inputs={};amounts={};state.textContent='A abrir a página…';
    try{
      const response=await fetch('../'+active,{cache:'no-cache'});
      if(response.ok) source=await response.text();
      let data;
      try{data=(await window.lirandzoAdminManagerRequest(endpoint(),{signal:AbortSignal.timeout(45000)})).data;}catch{}
      const publicFields=source ? transform(source).fields : [];
      const sameContent=Array.isArray(data?.fields) && publicFields.length===data.fields.length && publicFields.every((field,i)=>field.id===data.fields[i].id && field.value===data.fields[i].value);
      if(Array.isArray(data?.fields)){fields=sameContent?publicFields:data.fields;revision=data.revision==='preview' ? null : data.revision;}
      else {if(!source)throw Error('Página indisponível.');fields=transform(source).fields;data={};}
      const groups=new Map();
      function group(name){if(!groups.has(name)){const item=document.createElement('details'), title=document.createElement('summary');title.textContent=name;item.append(title);host.append(item);groups.set(name,item);}return groups.get(name);}
      const doc=new DOMParser().parseFromString(source,'text/html');
      for(const [id,label] of Object.entries({perola:'Pérola',esmeralda:'Esmeralda',rubi:'Rubi'})){
        const price=data.prices?.[id]?.amount ?? doc.querySelector('[data-template-name="Pacote '+label+'"]')?.dataset.templatePrice.replace(/\D/g,'');
        if(price!=null) amounts[id]=control(group('Pacote '+label),'Preço (MT)',price,true);
      }
      for(const field of fields) {
        const features = field.label.startsWith('Funcionalidades incluídas');
        const input = control(group(field.group),features?'Funcionalidades · uma por linha':field.label,features?field.value.split('|').join('\n'):field.value);
        if(features){input.rows=Math.min(12,field.value.split('|').length);input.dataset.features='true';}
        inputs[field.id]=input;
      }
      focusPackage(focusedPackage);
      state.textContent=revision?'Conteúdo do ramo de publicação.':'Conteúdo público. Edição disponível para pré-visualização local.';
      save.disabled=!revision;preview.disabled=!source || Boolean(revision && !sameContent);
    }catch(error){state.textContent=error.message;}finally{select.disabled=false;}
  }
  function changes(){
    const result={};
    for(const field of fields){
      if(focusedPackage && field.group!==focusedPackage) continue;
      const input=inputs[field.id];
      const value=input.dataset.features ? input.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).join('|') : input.value;
      if(value!==field.value) result[field.id]=value;
    }
    return result;
  }
  select.onchange=load;
  preview.onclick=()=>{
    try{
      const doc=new DOMParser().parseFromString(transform(source,changes()).output,'text/html');
      for(const [id,input] of Object.entries(amounts)){const label={perola:'Pérola',esmeralda:'Esmeralda',rubi:'Rubi'}[id];const card=doc.querySelector('[data-template-name="Pacote '+label+'"]');if(card)card.querySelector('.package-price').textContent=input.value+' MT';}
      const base=doc.createElement('base');base.href=new URL('../',location.href);doc.head.prepend(base);
      const style=doc.createElement('style');style.textContent='.fade-in-section{opacity:1!important;transform:none!important}';doc.head.append(style);
      if(focusedPackage){
        const card=[...doc.querySelectorAll('[data-template-name]')].find(node=>node.dataset.templateName===focusedPackage);
        if(card){
          const section=card.closest('section').cloneNode(false);
          const features=doc.createElement('ul');
          for(const text of card.dataset.features.split('|')){const li=doc.createElement('li');li.textContent=text;features.append(li);}
          card.append(features);section.append(card);doc.body.replaceChildren(section);
          style.textContent+='body{display:block}#pacotes{padding:16px}.template-card{max-width:480px;margin:auto;transform:none!important}';
        }
      }
      frame.srcdoc=doc.documentElement.outerHTML;frame.hidden=false;
    }catch(error){state.textContent=error.message;}
  };
  save.onclick=async()=>{
    if(!revision)return;
    save.disabled=true;select.disabled=true;host.inert=true;
    try{const prices=Object.fromEntries(Object.entries(amounts).map(([id,input])=>[id,focusedPackage && input.closest('details').hidden ? Number(input.dataset.original) : input.valueAsNumber]));
      const {data}=await window.lirandzoAdminManagerRequest(endpoint(),{method:'PUT',body:JSON.stringify({changes:changes(),prices,revision})});
      void window.verifySitePublication(data.publicFiles);await window.refreshSiteCatalog();await load();state.textContent=data.changed?'Página gravada no GitHub. A publicação depende do deploy.':'Conteúdo já actualizado.';
    }catch(error){state.textContent=error.message;}finally{save.disabled=!revision;select.disabled=false;host.inert=false;}
  };
  window.openSitePage=load;
})();
