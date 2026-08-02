from pathlib import Path
from bs4 import BeautifulSoup
from PIL import Image
import json, re, subprocess, sys, hashlib
import tinycss2

ROOT = Path(__file__).resolve().parent
errors=[]; warnings=[]; passed=[]

def ok(label, cond, detail=''):
    item = label + (f': {detail}' if detail else '')
    (passed if cond else errors).append(item)

def load(name):
    return (ROOT/name).read_text(encoding='utf-8')

# Required package files
required=[
    'index.html','convite.html','admin.html','style.css','client-config.js','event-data.js',
    'lirandzo-api.js','server.js','invite-data.json','mongodb-seed-data.json',
    'import-juliana-baptista-to-mongodb.js','assets/media/romantic-music.mp3',
    'assets/media/capa-casal.jpg','assets/media/hero-casal.jpg','assets/media/historia-casal.jpg',
    'assets/media/momento-1.jpg','assets/media/momento-2.jpg','assets/media/momento-3.jpg','assets/media/momento-4.jpg'
]
for f in required:
    ok(f'Ficheiro obrigatório {f}', (ROOT/f).is_file())

# JSON and event consistency
seed=json.loads(load('mongodb-seed-data.json'))
invite=json.loads(load('invite-data.json'))
event=seed['event']; gifts=seed['giftOptions']
ok('Slug canónico', event.get('slug')==invite.get('slug')=='juliana-baptista')
ok('Data do evento', event.get('dateISO')=='2026-09-19T10:00:00+02:00')
ok('Prazo RSVP', event.get('rsvpDeadlineISO')=='2026-08-30')
ok('Cerimónia', event.get('ceremonyTime')=='10:00' and 'Campoane' in event.get('ceremonyPlace',''))
ok('Recepção', event.get('receptionTime')=='14:00' and event.get('receptionPlace')=='Mila Eventos')
ok('Paleta declarada', event.get('colors')=='Verde pálido e branco')
ok('Modo de contribuições', event.get('giftSelectionMode')=='quantity_contributions')
ok('Três opções exactas', [g['name'] for g in gifts]==['Blocos','Cimento','Ferro (Varão)'])
ok('Incremento dos blocos', gifts[0].get('quantityStep')==10 and gifts[0].get('minQuantity')==10)
ok('Incrementos restantes', all(g.get('quantityStep')==1 and g.get('minQuantity')==1 for g in gifts[1:]))
ok('Nomes completos', event.get('bride')=='Juliana Menora Lobo' and event.get('groom')=='Baptista Tomás Nhambeu')
ok('Monograma JB', event.get('monogram')=='JB')
ok('Pais da noiva', event.get('brideParents')=='José Lobo e Javita Saide Assura')
ok('Pais do noivo', event.get('groomParents')=='Tomás Nhambeu e Rosita Moiane')
ok('Versículo e referência', event.get('verseReference')=='Isaías 41.20' and 'mão do Senhor' in event.get('verse',''))
ok('Mapa exacto da cerimónia', event.get('ceremonyMap')=='https://share.google/2y6d8LAtg4z0XRKWf')
ok('Mapa exacto da recepção', event.get('receptionMap')=='https://maps.app.goo.gl/3oxf1yefnEgN4nAa7')
ok('Contacto do cliente', event.get('supportWhatsapp')=='+258825930786' and event.get('clientEmail')=='zezylucasmubobo@gmail.com')
ok('Sem contas bancárias', event.get('bankAccounts')==[] and event.get('mobilePayments')==[])
ok('Funções do pacote', event.get('sections',{}).get('gifts') is True and event.get('sections',{}).get('checkin') is False and event.get('sections',{}).get('capsule') is False)

# Media integrity
music=ROOT/'assets/media/romantic-music.mp3'
if music.exists():
    probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration,format_name,bit_rate','-of','json',str(music)],capture_output=True,text=True)
    ok('MP3 válido', probe.returncode==0, probe.stderr.strip())
    if probe.returncode==0:
        meta=json.loads(probe.stdout or '{}').get('format',{})
        duration=float(meta.get('duration') or 0)
        ok('Música completa', 325 <= duration <= 335, f'{duration:.2f}s')
        ok('Formato da música', 'mp3' in str(meta.get('format_name','')).lower())
    ok('Música com tamanho plausível', music.stat().st_size > 5_000_000, str(music.stat().st_size))

for name in ['capa-casal.jpg','hero-casal.jpg','historia-casal.jpg','momento-1.jpg','momento-2.jpg','momento-3.jpg','momento-4.jpg']:
    p=ROOT/'assets/media'/name
    try:
        with Image.open(p) as im:
            im.verify()
        with Image.open(p) as im:
            ok(f'Imagem válida {name}', im.width >= 1000 and im.height >= 1500, f'{im.width}×{im.height}')
    except Exception as exc:
        ok(f'Imagem válida {name}', False, str(exc))

# HTML structure, IDs, references and JS DOM IDs
for fn in ['index.html','convite.html','admin.html','ja-aberto.html']:
    text=load(fn)
    soup=BeautifulSoup(text,'html.parser')
    ids=[tag.get('id') for tag in soup.find_all(attrs={'id':True})]
    dup=sorted({i for i in ids if ids.count(i)>1})
    ok(f'IDs HTML únicos em {fn}', not dup, ', '.join(dup))
    idset=set(ids)
    direct_refs=set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", text))
    ok(f'IDs referidos existem em {fn}', not (direct_refs-idset), ', '.join(sorted(direct_refs-idset)))
    for tag,attr in [('script','src'),('link','href'),('img','src'),('audio','src')]:
        for el in soup.find_all(tag):
            value=el.get(attr)
            if not value or value.startswith(('http://','https://','data:','#','mailto:','tel:')): continue
            target=ROOT/value.split('?')[0].split('#')[0]
            ok(f'Referência local {fn} → {value}', target.exists())

# CSS integrity and palette
css=load('style.css')
parsed=tinycss2.parse_stylesheet(css, skip_comments=False, skip_whitespace=False)
css_errors=[x.message for x in parsed if getattr(x,'type',None)=='error']
ok('CSS principal sem erros de parsing', not css_errors, '; '.join(css_errors))
for token in ['--bg: #F2F7F1','--accent: #4F6B5D','--section-bg: #E6EFE5','--border-color: #B4C8B6']:
    ok(f'Paleta verde contém {token}', token in css)
idx=load('index.html')
ok('Capa usa verde harmonizado', '--accent: #5F7D68' in idx and '--section-bg: #E6EFE5' in idx)
ok('Theme color verde na capa', '<meta name="theme-color" content="#E6EFE5">' in idx)
ok('Theme color verde no convite', '<meta name="theme-color" content="#E6EFE5">' in load('convite.html'))
ok('Sem paleta cinza antiga', not any(x in css+idx for x in ['#F8F9FC','#474747','#9BA3B0','#F0F2F7','#616e83','#8A939F']))

# No legacy/model content
client_files=['index.html','convite.html','admin.html','event-data.js','invite-data.json','mongodb-seed-data.json','client-config.js','lirandzo-api.js','style.css','ja-aberto.html']
legacy=re.compile(r'Am[eé]lia|Edilson|amelia-edilson|AE-[0-9]|Palhota|Santos Anjos|Macuacua|Simbine|2026-08-29|29 de agosto|1244585079|857265105|model-photo-[123]',re.I)
for fn in client_files:
    matches=legacy.findall(load(fn))
    ok(f'Sem dados antigos em {fn}', not matches, ', '.join(sorted(set(matches))))

# Invitation content and media placement
conv=load('convite.html')
conv_soup=BeautifulSoup(conv,'html.parser')
story_chapters=conv_soup.select('#storyTimeline .story-chapter')
ok('Quatro capítulos da história', len(story_chapters)==4)
ok('Estrutura dos capítulos', all(len(ch.select(':scope > .chapter-content'))==1 for ch in story_chapters))
ok('Pais apresentados correctamente', all(x in conv for x in ['Filha de','José Lobo','Javita Saide Assura','Filho de','Tomás Nhambeu','Rosita Moiane']))
ok('Horários públicos correctos', '>10:00<' in conv and '>14:00<' in conv)
ok('Mapas públicos correctos', event['ceremonyMap'] in conv and event['receptionMap'] in conv)
ok('Capa real aplicada', 'assets/media/capa-casal.jpg' in idx)
ok('Hero real aplicado', "assets/media/hero-casal.jpg" in css)
ok('História real aplicada', 'assets/media/historia-casal.jpg' in conv)
ok('Quatro fotos reais na galeria', len(conv_soup.select('#galeria .gallery-image-container img'))==4)
ok('Nova música ligada ao convite', '<audio id="backgroundMusic" loop src="assets/media/romantic-music.mp3"></audio>' in conv)
ok('Sem função QR no cliente', 'qrUrl' not in load('lirandzo-api.js') and 'quickchart.io/qr' not in load('lirandzo-api.js'))
ok('Sem Check-in no convite', 'checkin.html' not in conv and 'Checker.html' not in conv)
ok('Sem dados bancários antigos', 'Conta Bancária' not in conv and 'M-Pesa' not in conv)

# Required flows and route compatibility
adm=load('admin.html'); server=load('server.js')
for label,needle,text in [
 ('Login nominal','find_guest',idx),('Validação por token','get_guest',conv),('Marca abertura','open_invite',conv),
 ('RSVP','action: "rsvp"',conv),('Mensagens','post_message',conv),('Contribuições por quantidade','save_gift_contributions',conv),
 ('Admin adiciona convidados','add_guest',adm),('Backend aceita contribuições','handleSaveGiftContributions',server),
 ('Backend encaminha contribuições',"action === 'save_gift_contributions'",server),
 ('Backend tem /admin-api',"app.post('/admin-api'",server),('Backend tem login manager',"app.post('/manager/login'",server)
]: ok(label, needle in text)
ok('Backend tem /api GET e POST', "app.get('/api'" in server and "app.post('/api'" in server)
ok('Sem Check-in na navegação do admin', "{ id: 'checkins'" not in adm)
ok('Sem Cápsula na navegação do admin', "{ id: 'capsule'" not in adm)

# Regression: new guest must remain “Não aberto”, then become open only after access.
ok('Backend cria convidado Não aberto', "status: 'Não aberto'" in server[server.find('async function adminAddGuest'):server.find('async function adminHideMessage')])
ok('Backend distingue Não aberto de Aberto', 'function isExplicitlyNotOpenedStatus' in server and 'isGuestOpenedStatus(g.status)' in server)
ok('Get guest marca abertura correctamente', '!isGuestOpenedStatus(currentStatus)' in server)
ok('Admin trata Não aberto antes de procurar Aberto', "status.includes('nao aberto')" in adm and "status.includes('convite aberto')" in adm)

# Pure logic unit tests copied directly from server source.
helper_match=re.search(r"function normalizeText\(value\) \{.*?\n\}\nfunction isExplicitlyNotOpenedStatus\(value\) \{.*?\n\}\nfunction isGuestOpenedStatus\(value\) \{.*?\n\}", server, re.S)
if helper_match:
    unit=helper_match.group(0)+"""
const cases = [
  ['Não aberto', false], ['nao aberto', false], ['Pendente', false],
  ['Convite Aberto', true], ['Aberto', true], ['Confirmado', true], ['Entrou', true]
];
for (const [value, expected] of cases) {
  if (isGuestOpenedStatus(value) !== expected) throw new Error(value + ' esperado=' + expected);
}
"""
    temp=ROOT/'.audit-open-status.js'; temp.write_text(unit,encoding='utf-8')
    result=subprocess.run(['node',str(temp)],capture_output=True,text=True)
    temp.unlink(missing_ok=True)
    ok('Teste unitário dos estados Aberto/Não aberto', result.returncode==0, result.stderr.strip())
else:
    ok('Teste unitário dos estados Aberto/Não aberto', False, 'Funções não encontradas')

# JavaScript syntax: standalone and inline
js_files=['client-config.js','event-data.js','lirandzo-api.js','server.js','import-juliana-baptista-to-mongodb.js']
for fn in js_files:
    result=subprocess.run(['node','--check',str(ROOT/fn)],capture_output=True,text=True)
    ok(f'Sintaxe JavaScript {fn}', result.returncode==0, result.stderr.strip())
for fn in ['index.html','convite.html','admin.html','ja-aberto.html']:
    soup=BeautifulSoup(load(fn),'html.parser')
    for i,tag in enumerate(soup.find_all('script')):
        if tag.get('src'): continue
        temp=ROOT/f'.audit-{fn}-{i}.js'; temp.write_text(tag.string or tag.get_text() or '',encoding='utf-8')
        result=subprocess.run(['node','--check',str(temp)],capture_output=True,text=True)
        temp.unlink(missing_ok=True)
        ok(f'Sintaxe inline {fn} bloco {i}', result.returncode==0, result.stderr.strip())

# External integration limitation
warnings.append('Teste live do Render/MongoDB não executado: este ambiente não conseguiu resolver api-casamento-mj.onrender.com. A integração foi validada por rotas, payloads, sintaxe e consistência estrutural; faça o teste final depois do upload.')

report=[]
report.append('AUDITORIA TÉCNICA FINAL — JULIANA & BAPTISTA')
report.append('='*51)
report.append(f'APROVADOS: {len(passed)}')
report.append(f'ERROS: {len(errors)}')
report.append(f'AVISOS: {len(warnings)}\n')
if errors:
    report.append('ERROS ENCONTRADOS')
    report.extend(f'- {x}' for x in errors)
    report.append('')
report.append('VALIDAÇÕES APROVADAS')
report.extend(f'- {x}' for x in passed)
report.append('\nLIMITAÇÕES / AVISOS')
report.extend(f'- {x}' for x in warnings)
report.append('\nRESULTADO: ' + ('REPROVADO' if errors else 'APROVADO PARA PUBLICAÇÃO, condicionado ao teste live após upload.'))
(ROOT/'AUDITORIA-JULIANA-BAPTISTA.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
sys.exit(1 if errors else 0)
