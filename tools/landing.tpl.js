/* Fills the landing page from JSON (landing-data*.json). Static HTML stays as fallback. */
(function(){
var SRC=(document.currentScript&&document.currentScript.getAttribute('data-src'))||'landing-data.json';
var MAP=/*MAP*/;
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
