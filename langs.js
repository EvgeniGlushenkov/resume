/* Языки сайта: какие версии показывать (site-config.json, правится в админке).
   Русский включён всегда. По умолчанию (и если файл не загрузился): RU + EN, китайский выключен.
   Выключенный язык: ссылка на него убирается из переключателя, а его страницы отправляют на русскую версию. */
(function () {
  'use strict';
  var d = document;
  var DEFAULT = { ru: true, en: true, zh: false };
  var PAGES = { /* страница -> [язык, русская замена] */
    'en.html': ['en', 'index.html'], 'resume-en.html': ['en', 'resume.html'],
    'zh.html': ['zh', 'index.html'], 'resume-zh.html': ['zh', 'resume.html']
  };
  var qs = new URLSearchParams(location.search);
  var preview = qs.get('preview') === '1';

  function norm(c) {
    var L = (c && c.languages) || {}, out = {};
    Object.keys(DEFAULT).forEach(function (k) { out[k] = typeof L[k] === 'boolean' ? L[k] : DEFAULT[k]; });
    out.ru = true;
    return out;
  }
  function pageOf(href) { var m = /([\w-]+\.html)(?:[?#].*)?$/i.exec(href || ''); return m ? m[1].toLowerCase() : ''; }

  function apply(L) {
    /* 1. текущая страница выключена — уходим на русскую (кроме предпросмотра в админке) */
    var cur = PAGES[pageOf(location.pathname)];
    if (cur && !L[cur[0]] && !preview) { location.replace(cur[1] + location.search + location.hash); return; }
    if (!domReady) return;
    /* 2. переключатели языков */
    Array.prototype.forEach.call(d.querySelectorAll('.eg-q9p__lang'), function (box) {
      var links = Array.prototype.filter.call(box.children, function (e) { return e.tagName === 'A'; });
      Array.prototype.forEach.call(box.querySelectorAll('.eg-q9p__lang-sep'), function (s) { s.parentNode.removeChild(s); });
      var shown = 0;
      links.forEach(function (a) {
        var p = PAGES[pageOf(a.getAttribute('href'))], on = !p || L[p[0]];
        a.hidden = !on;
        if (on) {
          if (shown++) { var s = d.createElement('span'); s.className = 'eg-q9p__lang-sep'; s.textContent = '/'; box.insertBefore(s, a); }
        }
      });
      box.hidden = shown < 2;
    });
    /* 3. прочие ссылки на выключенные страницы (если появятся) */
    Array.prototype.forEach.call(d.querySelectorAll('a[href]'), function (a) {
      if (a.closest('.eg-q9p__lang')) return;
      var p = PAGES[pageOf(a.getAttribute('href'))];
      if (p && !L[p[0]]) a.setAttribute('href', p[1]);
    });
  }

  var BASE = d.currentScript ? d.currentScript.src.replace(/[^/]*$/, '') : '';
  var fromAdmin = false, cfg = null, domReady = false;
  /* страница выключенного по умолчанию языка: прячем до ответа site-config.json, чтобы не мелькала */
  var cur = PAGES[pageOf(location.pathname)], wait = cur && !DEFAULT[cur[0]] && !preview;
  var root = d.documentElement;
  if (wait) root.style.visibility = 'hidden';
  function done(c) {
    if (cfg) return; cfg = norm(c);
    if (domReady) apply(cfg); else if (cur && !cfg[cur[0]] && !preview) apply(cfg);
    if (wait && !(cur && !cfg[cur[0]])) root.style.visibility = '';
  }
  if (preview) {
    window.addEventListener('message', function (e) {
      if (e.origin === location.origin && e.data && e.data.glData && e.data.glData.languages) { fromAdmin = true; apply(norm(e.data.glData)); }
    });
  }
  fetch(BASE + 'site-config.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) { if (!fromAdmin) done(c); }, function () { done(null); });
  if (wait) setTimeout(function () { done(null); }, 3000);
  /* на странице выключенного по умолчанию языка ждём настоящий конфиг: иначе значения по умолчанию
     отправили бы на русскую версию, даже если язык включён в админке (done() применит всё сам) */
  function ready() { domReady = true; if (!fromAdmin && (cfg || !wait)) apply(cfg || norm(null)); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', ready); else ready();
})();
