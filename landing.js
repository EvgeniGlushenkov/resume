/* Fills the landing page from JSON (landing-data*.json). Static HTML stays as fallback. */
(function(){
var SRC=(document.currentScript&&document.currentScript.getAttribute('data-src'))||'landing-data.json';
var MAP=[["title", "title", 0, "title"], ["logo", ".eg-q9p__logo", 0, "t"], ["nav.0", ".eg-q9p__nav a", 0, "t"], ["nav.1", ".eg-q9p__nav a", 1, "t"], ["topbar.resume", ".eg-q9p__topbar-actions a", 0, "t"], ["topbar.contact", ".eg-q9p__topbar-actions a", 1, "t"], ["hero.label", ".eg-q9p__hero-label", 0, "t"], ["hero.name", ".eg-q9p__hero-name", 0, "h"], ["hero.desc", ".eg-q9p__hero-desc", 0, "t"], ["hero.btn1", ".eg-q9p__hero-buttons a", 0, "t"], ["hero.btn2", ".eg-q9p__hero-buttons a", 1, "t"], ["hero.loc", ".eg-q9p__hero-loc", 0, "t"], ["hero.alt", ".eg-q9p__hero-photo img", 0, "alt"], ["hero.badges.0", ".eg-q9p__hero-badge", 0, "t"], ["hero.badges.1", ".eg-q9p__hero-badge", 1, "t"], ["hero.badges.2", ".eg-q9p__hero-badge", 2, "t"], ["about.eyebrow", "#eg-about .eg-q9p__section-eyebrow", 0, "t"], ["about.title", "#eg-about .eg-q9p__section-title", 0, "t"], ["about.intro", "#eg-about .eg-q9p__intro-text", 0, "t"], ["skills.eyebrow", "#eg-skills .eg-q9p__section-eyebrow", 0, "t"], ["skills.title", "#eg-skills .eg-q9p__section-title", 0, "t"], ["skills.intro", "#eg-skills .eg-q9p__intro-text", 0, "t"], ["about.cards.0.num", ".eg-q9p__personal-num", 0, "t"], ["about.cards.0.label", ".eg-q9p__personal-label", 0, "t"], ["about.cards.1.num", ".eg-q9p__personal-num", 1, "t"], ["about.cards.1.label", ".eg-q9p__personal-label", 1, "t"], ["about.cards.2.num", ".eg-q9p__personal-num", 2, "t"], ["about.cards.2.label", ".eg-q9p__personal-label", 2, "t"], ["about.cards.3.num", ".eg-q9p__personal-num", 3, "t"], ["about.cards.3.label", ".eg-q9p__personal-label", 3, "t"], ["about.roles.0.num", ".eg-q9p__roles-num", 0, "t"], ["about.roles.0.title", ".eg-q9p__roles-title", 0, "t"], ["about.roles.0.desc", ".eg-q9p__roles-desc", 0, "t"], ["about.roles.1.num", ".eg-q9p__roles-num", 1, "t"], ["about.roles.1.title", ".eg-q9p__roles-title", 1, "t"], ["about.roles.1.desc", ".eg-q9p__roles-desc", 1, "t"], ["about.roles.2.num", ".eg-q9p__roles-num", 2, "t"], ["about.roles.2.title", ".eg-q9p__roles-title", 2, "t"], ["about.roles.2.desc", ".eg-q9p__roles-desc", 2, "t"], ["skills.pillars.0.title", ".eg-q9p__pillar-title", 0, "t"], ["skills.pillars.1.title", ".eg-q9p__pillar-title", 1, "t"], ["skills.pillars.2.title", ".eg-q9p__pillar-title", 2, "t"], ["skills.pillars.3.title", ".eg-q9p__pillar-title", 3, "t"], ["skills.pillars.0.desc", ".eg-q9p__pillar-desc:not(.eg-q9p__pillar-note)", 0, "t"], ["skills.pillars.1.desc", ".eg-q9p__pillar-desc:not(.eg-q9p__pillar-note)", 1, "t"], ["skills.pillars.2.desc", ".eg-q9p__pillar-desc:not(.eg-q9p__pillar-note)", 2, "t"], ["skills.pillars.3.chips", ".eg-q9p__chips", 0, "list"], ["skills.pillars.3.note", ".eg-q9p__pillar-note", 0, "t"], ["results.eyebrow", "#eg-results-label", 0, "t"], ["results.items.0.num", ".eg-q9p__result-num", 0, "t"], ["results.items.0.label", ".eg-q9p__result-label", 0, "t"], ["results.items.1.num", ".eg-q9p__result-num", 1, "t"], ["results.items.1.label", ".eg-q9p__result-label", 1, "t"], ["results.items.2.num", ".eg-q9p__result-num", 2, "t"], ["results.items.2.label", ".eg-q9p__result-label", 2, "t"], ["results.items.3.num", ".eg-q9p__result-num", 3, "t"], ["results.items.3.label", ".eg-q9p__result-label", 3, "t"], ["results.items.4.num", ".eg-q9p__result-num", 4, "t"], ["results.items.4.label", ".eg-q9p__result-label", 4, "t"], ["results.items.5.num", ".eg-q9p__result-num", 5, "t"], ["results.items.5.label", ".eg-q9p__result-label", 5, "t"], ["contact.eyebrow", ".eg-q9p__contact-eyebrow", 0, "t"], ["contact.title", ".eg-q9p__contact-title", 0, "h"], ["contact.text", ".eg-q9p__contact-text", 0, "t"], ["contact.labels.0", ".eg-q9p__contact-label", 0, "t"], ["contact.labels.1", ".eg-q9p__contact-label", 1, "t"], ["contact.labels.2", ".eg-q9p__contact-label", 2, "t"], ["footer.0", ".eg-q9p__footer div", 0, "t"], ["footer.1", ".eg-q9p__footer div", 1, "t"]];
function get(o,p){var k=p.split('.');for(var i=0;i<k.length;i++){if(o==null)return;o=o[k[i]]}return o}
function clean(h){var t=document.createElement('template');t.innerHTML=String(h);
  (function w(n){Array.prototype.slice.call(n.childNodes).forEach(function(c){
    if(c.nodeType===3)return;
    if(c.nodeType!==1){n.removeChild(c);return}
    var tag=c.tagName.toLowerCase();
    if(['br','em','strong','span'].indexOf(tag)<0){n.replaceChild(document.createTextNode(c.textContent),c);return}
    Array.prototype.slice.call(c.attributes).forEach(function(a){
      if(!(tag==='span'&&a.name==='class'&&/^eg-q9p__accent-(blue|green|pink|purple|red)$/.test(a.value)))c.removeAttribute(a.name)});
    w(c)})})(t.content);
  return t.innerHTML}
function apply(D){
  MAP.forEach(function(m){
    var v=get(D,m[0]);if(v==null)return;
    var els=document.querySelectorAll(m[1]),e=els[m[2]];if(!e)return;
    var mode=m[3];
    if(mode==='title')document.title=String(v);
    else if(mode==='alt')e.setAttribute('alt',String(v));
    else if(mode==='h')e.innerHTML=clean(v);
    else if(mode==='list'){if(!Array.isArray(v))return;e.textContent='';v.forEach(function(x){var li=document.createElement('li');li.textContent=String(x);e.appendChild(li)})}
    else e.textContent=String(v);
  })}
var qs=new URLSearchParams(location.search);
if(qs.get('preview')==='1'){
  window.addEventListener('message',function(e){if(e.origin===location.origin&&e.data&&e.data.glData)apply(e.data.glData)});
  try{parent.postMessage({glReady:1},location.origin)}catch(e){}
}else{
  fetch(SRC,{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).then(function(D){if(D)apply(D)}).catch(function(){});
}
})();
