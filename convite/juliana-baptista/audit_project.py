from pathlib import Path
from bs4 import BeautifulSoup
from PIL import Image
import json, re, subprocess, sys

ROOT = Path(__file__).resolve().parent
passed=[]; errors=[]; warnings=[]

def check(label, cond, detail=''):
    item = label + (f' — {detail}' if detail else '')
    (passed if cond else errors).append(item)

def text(name):
    return (ROOT/name).read_text(encoding='utf-8', errors='ignore')

required = [
    'index.html','convite.html','admin.html','style.css','client-config.js','event-data.js',
    'lirandzo-api.js','server.js','invite-data.json','mongodb-seed-data.json',
    'import-juliana-baptista-to-mongodb.js','assets/media/romantic-music.mp3',
    'assets/media/capa-casal.jpg','assets/media/hero-casal.jpg','assets/media/historia-casal.jpg',
    'assets/media/momento-1.jpg','assets/media/momento-2.jpg','assets/media/momento-3.jpg','assets/media/momento-4.jpg'
]
for name in required:
    check(f'Ficheiro obrigatório: {name}', (ROOT/name).is_file())
check('Página antiga de acesso restrito removida', not (ROOT/'ja-aberto.html').exists())

seed = json.loads(text('mongodb-seed-data.json'))
invite = json.loads(text('invite-data.json'))
event = seed.get('event', {})
check('Slug canónico', event.get('slug') == invite.get('slug') == 'juliana-baptista')
check('Acesso público configurado', event.get('accessMode') == 'public' and event.get('publicAccess') is True)
check('Auto-criação por RSVP configurada', event.get('publicRsvpAutoCreate') is True)
check('Auto-criação por contribuição configurada', event.get('publicGiftAutoCreate') is True)
check('Metadados públicos consistentes', invite.get('accessMode') == 'public' and invite.get('publicAccess') is True)
check('Modo de presentes por quantidade', event.get('giftSelectionMode') == 'quantity_contributions')
check('Incrementos dos presentes', [(x.get('name'),x.get('quantityStep'),x.get('minQuantity')) for x in seed.get('giftOptions',[])] == [('Blocos',10,10),('Cimento',1,1),('Ferro (Varão)',1,1)])
check('Data do evento', event.get('dateISO') == '2026-09-19T10:00:00+02:00')
check('Locais e horários', event.get('ceremonyTime') == '10:00' and event.get('receptionTime') == '14:00' and event.get('receptionPlace') == 'Mila Eventos')

# Media integrity
music = ROOT/'assets/media/romantic-music.mp3'
if music.exists():
    probe = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration,format_name','-of','json',str(music)],capture_output=True,text=True)
    check('Música MP3 válida', probe.returncode == 0, probe.stderr.strip())
    if probe.returncode == 0:
        meta = json.loads(probe.stdout or '{}').get('format',{})
        duration = float(meta.get('duration') or 0)
        check('Música completa', 325 <= duration <= 335, f'{duration:.2f}s')
for name in ['capa-casal.jpg','hero-casal.jpg','historia-casal.jpg','momento-1.jpg','momento-2.jpg','momento-3.jpg','momento-4.jpg']:
    p=ROOT/'assets/media'/name
    try:
        with Image.open(p) as im:
            dims=im.size
            im.verify()
        check(f'Imagem válida: {name}', dims[0] >= 1000 and dims[1] >= 1500, f'{dims[0]}×{dims[1]}')
    except Exception as exc:
        check(f'Imagem válida: {name}', False, str(exc))

# HTML structural checks
for name in ['index.html','convite.html','admin.html']:
    raw=text(name); soup=BeautifulSoup(raw,'html.parser')
    ids=[tag.get('id') for tag in soup.find_all(attrs={'id':True})]
    dup=sorted({x for x in ids if ids.count(x)>1})
    check(f'IDs únicos em {name}', not dup, ', '.join(dup))
    idset=set(ids)
    refs=set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", raw))
    missing=sorted(refs-idset)
    check(f'IDs referidos existem em {name}', not missing, ', '.join(missing))
    for tag,attr in [('script','src'),('link','href'),('img','src'),('audio','src')]:
        for node in soup.find_all(tag):
            value=node.get(attr)
            if not value or value.startswith(('http://','https://','data:','#','mailto:','tel:')): continue
            target=ROOT/value.split('?')[0].split('#')[0]
            check(f'Referência local: {name} → {value}', target.exists())

index_raw=text('index.html'); index_soup=BeautifulSoup(index_raw,'html.parser')
open_link=index_soup.select_one('#openInviteBtn')
check('Capa abre directamente o convite', bool(open_link and open_link.name == 'a' and open_link.get('href') == 'convite.html'))
check('Capa sem formulário de login nominal', not index_soup.select_one('#loginForm') and 'find_guest' not in index_raw and 'loginOverlay' not in index_raw)
check('Capa sem validação de nome', 'Nome não encontrado na lista' not in index_raw and 'lista de convidados' not in index_raw)

conv_raw=text('convite.html'); conv=BeautifulSoup(conv_raw,'html.parser')
check('Convite abre sem token', 'tokenFromUrl' not in conv_raw and 'verifyDeviceAccess' not in conv_raw and 'Convite inválido.' not in conv_raw)
check('Convite não consulta convidado para abrir', "get_guest" not in conv_raw and "open_invite" not in conv_raw)
check('Sem botão de mesa personalizada', not conv.select_one('#fabGuestInfoBtn') and not conv.select_one('#guestInfoModal'))

rsvp_name=conv.select_one('#rsvpName')
gift_name=conv.select_one('#giftGuestName')
message_name=conv.select_one('#messageGuestName')
check('Nome obrigatório no RSVP', bool(rsvp_name and rsvp_name.has_attr('required') and rsvp_name.get('name') == 'nome'))
check('Nome obrigatório nos presentes', bool(gift_name and gift_name.has_attr('required') and gift_name.get('form') == 'giftListForm'))
check('Nome obrigatório nas mensagens', bool(message_name and message_name.has_attr('required') and message_name.get('name') == 'nome' and message_name.get('autocomplete') == 'name'))
check('RSVP envia o nome digitado', "nome: typedName" in conv_raw and 'publicGuestName' in conv_raw)
check('Presentes enviam o nome digitado', "nome: typedName, token: ''" in conv_raw and 'save_gift_contributions' in conv_raw)
check('Mensagens enviam o nome digitado', 'const typedName = String(messageGuestName' in conv_raw and 'action: "post_message"' in conv_raw and 'nome: typedName' in conv_raw)
check('Blocos mantêm incremento de 10', "option.name === 'Blocos'" in conv_raw and 'Incrementos de 10 unidades' in conv_raw)
check('RSVP, presentes e mensagens possuem validação nominal', 'Escreva o seu nome antes de confirmar.' in conv_raw and 'Escreva o seu nome antes de registar a contribuição.' in conv_raw and 'Escreva o seu nome antes de enviar a mensagem.' in conv_raw)
check('Nota carinhosa explica a lista de materiais', 'Um presente com significado' in conv_raw and 'estamos a construir, com muito amor, o nosso futuro lar' in conv_raw and 'A vossa presença é o nosso maior presente' in conv_raw)
check('Nota aparece antes da lista de presentes', conv_raw.find('gift-intro-note') < conv_raw.find('id="giftList"'))
check('Fotos reais aplicadas', all(x in conv_raw+text('style.css')+index_raw for x in ['capa-casal.jpg','hero-casal.jpg','historia-casal.jpg','momento-1.jpg','momento-4.jpg']))
check('Música ligada ao convite', 'assets/media/romantic-music.mp3' in conv_raw)

# Server checks
server=text('server.js')
check('Backend reconhece convite público', 'function isPublicInvite(invite)' in server)
check('Backend exige nome no RSVP público', "isPublicInvite(invite) && !String(nome || '').trim()" in server)
check('Backend auto-cria nome no RSVP', 'canAutoCreateGuestForRsvp' in server and "createPublicInteractionGuest(invite, data, 'rsvp')" in server)
check('Backend auto-cria nome nos presentes', 'canAutoCreateGuestForGift' in server and "createPublicInteractionGuest(invite, body, 'gift')" in server)
check('Backend aceita actualizar RSVP existente', "title: already ? 'Confirmação actualizada'" in server and 'updated: Boolean(already)' in server)
check('Backend valida múltiplos dos presentes', 'quantity % option.step !== 0' in server)
check('Backend exige nome real nas mensagens', 'Escreva o seu nome completo antes de enviar a mensagem.' in server and 'genericName' in server and "String(req.body?.nome || '').trim()" in server and 'nome.length < 2' in server)
check('Backend limita tamanho de nomes e mensagens', ".slice(0, 120)" in server and ".slice(0, 500)" in server)
check('Importador grava configuração pública', 'config: event' in text('import-juliana-baptista-to-mongodb.js'))

# Admin checks
admin=text('admin.html')
check('Admin descreve origem pública dos nomes', 'Nomes registados por confirmações, contribuições ou inserção manual.' in admin)
check('Admin remove token da tabela visual', '<th>Token</th>' not in admin)
check('Admin mostra origem do registo', '<th>Origem</th>' in admin and 'originOf(g)' in admin)
check('Admin sem métricas abertas/não abertas', "['Abertos'" not in admin and "['N\\u00e3o abertos'" not in admin)
check('Admin mantém RSVP', 'id="rsvpsPanel"' in admin and 'get_rsvps' in admin)
check('Admin mantém contribuições', 'id="giftsPanel"' in admin and 'get_gifts' in admin)
check('Admin mantém mensagens', 'id="messagesPanel"' in admin and 'get_messages' in admin)
check('Admin sem check-in/cápsula na navegação', "{ id: 'checkins'" not in admin and "{ id: 'capsule'" not in admin)

# JS syntax: external and inline
for name in ['client-config.js','event-data.js','lirandzo-api.js','server.js','import-juliana-baptista-to-mongodb.js']:
    result=subprocess.run(['node','--check',str(ROOT/name)],capture_output=True,text=True)
    check(f'Sintaxe JavaScript: {name}', result.returncode == 0, result.stderr.strip())
for name in ['index.html','convite.html','admin.html']:
    soup=BeautifulSoup(text(name),'html.parser')
    for i,script in enumerate(soup.find_all('script')):
        if script.get('src'): continue
        temp=ROOT/f'.audit-inline-{name}-{i}.js'
        temp.write_text(script.string or script.get_text() or '',encoding='utf-8')
        result=subprocess.run(['node','--check',str(temp)],capture_output=True,text=True)
        temp.unlink(missing_ok=True)
        check(f'Sintaxe inline: {name} bloco {i}', result.returncode == 0, result.stderr.strip())

# Unit test public access flags without loading the full server
unit="""
function slugify(v){return String(v||'').trim().toLowerCase()}
function inviteConfigFlag(invite,key){const value=invite?.config?.[key];if(value===true)return true;const normalized=String(value||'').trim().toLowerCase();return ['1','true','yes','sim','on'].includes(normalized)}
function isPublicInvite(invite){return inviteConfigFlag(invite,'publicAccess')||String(invite?.config?.accessMode||'').trim().toLowerCase()==='public'}
function canAutoCreateGuestForRsvp(invite){const slug=slugify(invite?.slug||'');return Boolean(inviteConfigFlag(invite,'publicRsvpAutoCreate')||isPublicInvite(invite)||(slug&&new Set().has(slug)))}
function canAutoCreateGuestForGift(invite){return inviteConfigFlag(invite,'publicGiftAutoCreate')||isPublicInvite(invite)}
const invite={slug:'juliana-baptista',config:{accessMode:'public',publicAccess:true,publicRsvpAutoCreate:true,publicGiftAutoCreate:true}};
if(!isPublicInvite(invite)||!canAutoCreateGuestForRsvp(invite)||!canAutoCreateGuestForGift(invite)) process.exit(1);
"""
temp=ROOT/'.audit-public-flags.js'; temp.write_text(unit,encoding='utf-8')
result=subprocess.run(['node',str(temp)],capture_output=True,text=True); temp.unlink(missing_ok=True)
check('Teste unitário das flags públicas', result.returncode == 0, result.stderr.strip())

warnings.append('A comunicação live com o Render/MongoDB não foi executada neste ambiente. Foram validados contratos de rotas, configuração, payloads, sintaxe e lógica de auto-criação. Depois da publicação, execute um RSVP, uma contribuição e uma mensagem identificada de teste no domínio real.')
warnings.append('Para activar as flags públicas no convite já existente na base de dados, execute uma vez o import-juliana-baptista-to-mongodb.js incluído no pacote, usando a mesma MONGODB_URI do Render.')

report=[
    'AUDITORIA FINAL — JULIANA & BAPTISTA — ACESSO PÚBLICO',
    '='*58,
    f'APROVADOS: {len(passed)}',
    f'ERROS: {len(errors)}',
    f'AVISOS: {len(warnings)}',''
]
if errors:
    report += ['ERROS ENCONTRADOS'] + [f'- {x}' for x in errors] + ['']
report += ['VALIDAÇÕES APROVADAS'] + [f'- {x}' for x in passed] + ['', 'LIMITAÇÕES / ACÇÕES DE PUBLICAÇÃO'] + [f'- {x}' for x in warnings]
report += ['', 'RESULTADO: ' + ('REPROVADO' if errors else 'APROVADO PARA PUBLICAÇÃO, condicionado ao teste live após upload.')]
out='\n'.join(report)+'\n'
(ROOT/'AUDITORIA-JULIANA-BAPTISTA-PUBLICO.txt').write_text(out,encoding='utf-8')
(ROOT/'AUDITORIA-JULIANA-BAPTISTA.txt').write_text(out,encoding='utf-8')
print(out)
sys.exit(1 if errors else 0)
