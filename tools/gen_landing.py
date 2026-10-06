# One-off generator: builds landing-data*.json from the static pages and writes the map into landing.js
import json
from bs4 import BeautifulSoup
P='.eg-q9p__'
M=[]  # [path, selector, index, mode]
def a(path,sel,i=0,mode='t'): M.append([path,sel,i,mode])
a('title','title',0,'title')
a('logo',P+'logo')
for i in range(2): a('nav.%d'%i,P+'nav a',i)
a('topbar.resume',P+'topbar-actions a',0); a('topbar.contact',P+'topbar-actions a',1)
a('hero.label',P+'hero-label'); a('hero.name',P+'hero-name',0,'h'); a('hero.desc',P+'hero-desc')
a('hero.btn1',P+'hero-buttons a',0); a('hero.btn2',P+'hero-buttons a',1); a('hero.loc',P+'hero-loc')
a('hero.alt',P+'hero-photo img',0,'alt')
for i in range(3): a('hero.badges.%d'%i,P+'hero-badge',i)
for s,n in (('about','about'),('skills','skills')):
    a(s+'.eyebrow','#eg-%s %ssection-eyebrow'%(n,P)); a(s+'.title','#eg-%s %ssection-title'%(n,P)); a(s+'.intro','#eg-%s %sintro-text'%(n,P))
for i in range(4):
    a('about.cards.%d.num'%i,P+'personal-num',i); a('about.cards.%d.label'%i,P+'personal-label',i)
for i in range(3):
    a('about.roles.%d.num'%i,P+'roles-num',i); a('about.roles.%d.title'%i,P+'roles-title',i); a('about.roles.%d.desc'%i,P+'roles-desc',i)
for i in range(4): a('skills.pillars.%d.title'%i,P+'pillar-title',i)
for i in range(3): a('skills.pillars.%d.desc'%i,P+'pillar-desc:not(.eg-q9p__pillar-note)',i)
a('skills.pillars.3.chips',P+'chips',0,'list'); a('skills.pillars.3.note',P+'pillar-note')
a('results.eyebrow','#eg-results-label')
for i in range(6): a('results.items.%d.num'%i,P+'result-num',i); a('results.items.%d.label'%i,P+'result-label',i)
a('contact.eyebrow',P+'contact-eyebrow'); a('contact.title',P+'contact-title',0,'h'); a('contact.text',P+'contact-text')
for i in range(3): a('contact.labels.%d'%i,P+'contact-label',i)
a('footer.0',P+'footer div',0); a('footer.1',P+'footer div',1)
def put(d,path,v):
    ks=path.split('.')
    for j,k in enumerate(ks[:-1]):
        nk=ks[j+1]; nxt=[] if nk.isdigit() else {}
        if k.isdigit():
            k=int(k)
            while len(d)<=k: d.append(None)
            if d[k] is None: d[k]=nxt
            d=d[k]
        else: d=d.setdefault(k,nxt)
    k=ks[-1]
    if k.isdigit():
        k=int(k)
        while len(d)<=k: d.append(None)
        d[k]=v
    else: d[k]=v
for f,o in (('index.html','landing-data.json'),('en.html','landing-data.en.json'),('zh.html','landing-data.zh.json')):
    s=BeautifulSoup(open(f,encoding='utf8'),'lxml'); D={}
    for path,sel,i,mode in M:
        e=s.select(sel)[i]
        if mode=='title': v=e.get_text()
        elif mode=='h': v=e.decode_contents()
        elif mode=='alt': v=e.get('alt','')
        elif mode=='list': v=[li.get_text() for li in e.select('li')]
        else: v=e.get_text()
        put(D,path,v)
    json.dump(D,open(o,'w',encoding='utf8'),ensure_ascii=False,indent=1)
js=open('tools/landing.tpl.js',encoding='utf8').read().replace('/*MAP*/',json.dumps(M,ensure_ascii=False))
open('landing.js','w',encoding='utf8').write(js)
