/* Админка сайта: вход через Telegram, правка resume-data.json, сохранение на сайт через Worker. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var API = String(window.ADMIN_API || '').replace(/\/$/, '');
  /* для локальной проверки разрешён ?api=http://localhost:PORT */
  if (qs.get('api') && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(qs.get('api'))) API = qs.get('api');

  var TOKEN_KEY = 'gl-admin-token';
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function tokenValid(t) {
    try { var p = JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); return p.exp > Date.now() / 1000; } catch (e) { return false; }
  }
  function api(path, opt) {
    opt = opt || {};
    var h = { 'Content-Type': 'application/json' };
    var t = store(TOKEN_KEY); if (t && !opt.noAuth) h.Authorization = 'Bearer ' + t;
    return fetch(API + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); });
  }

  /* ---------------- вход ---------------- */
  var pollTimer = null;
  function showLogin(msg) { $('app').hidden = true; $('login').hidden = false; $('lerr').textContent = msg || ''; $('lgo').disabled = false; }
  function showApp() { $('login').hidden = true; $('app').hidden = false; loadData(); }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function startLogin() {
    if (!API) { $('lerr').textContent = 'Не задан адрес сервера входа. Откройте admin/config.js и впишите адрес Worker (инструкция в worker/SETUP.md).'; return; }
    $('lerr').textContent = ''; $('lgo').disabled = true;
    api('/auth/start', { method: 'POST', noAuth: true }).then(function (r) {
      if (r.status === 429) throw new Error('Слишком много попыток. Подождите 10 минут или возьмите ссылку у бота (/admin).');
      if (r.status !== 200) throw new Error('Не удалось отправить запрос в Telegram.');
      var id = r.json.id, secret = r.json.secret, until = Date.now() + (r.json.ttl || 300) * 1000;
      var w = $('lwait'); w.hidden = false; w.textContent = 'Открыл запрос в Telegram — нажмите «Подтвердить» в сообщении от бота.';
      stopPoll();
      pollTimer = setInterval(function () {
        if (Date.now() > until) { stopPoll(); w.hidden = true; showLogin('Время вышло. Попробуйте ещё раз.'); return; }
        api('/auth/poll?id=' + encodeURIComponent(id) + '&secret=' + encodeURIComponent(secret), { noAuth: true }).then(function (p) {
          var s = p.json.status;
          if (s === 'approved') { stopPoll(); store(TOKEN_KEY, p.json.token); w.hidden = true; showApp(); }
          else if (s === 'denied') { stopPoll(); w.hidden = true; showLogin('Вход отклонён в Telegram.'); }
          else if (s === 'expired') { stopPoll(); w.hidden = true; showLogin('Запрос устарел. Попробуйте ещё раз.'); }
        }).catch(function () { });
      }, 2000);
    }).catch(function (e) { showLogin(e.message || 'Ошибка сети'); });
  }
  $('lgo').addEventListener('click', startLogin);

  function redeemFromHash() {
    var m = /[#&]l=([\w-]+)/.exec(location.hash);
    if (!m) return Promise.resolve(false);
    history.replaceState(null, '', location.pathname + location.search);
    return api('/auth/redeem', { method: 'POST', noAuth: true, body: { link: m[1] } }).then(function (r) {
      if (r.status === 200) { store(TOKEN_KEY, r.json.token); return true; }
      showLogin('Ссылка устарела или уже использована. Запросите новую у бота: /admin');
      return null;
    });
  }

  /* ---------------- данные ---------------- */
  var D = null, ORIG = null, SHA = null, dirty = false;
  var HIDE = { photo: 1, phone: 1, email: 1, telegram: 1, avito: 1 };
  var LABELS = {
    person: 'Общие данные', name: 'Имя и фамилия', city: 'Город', format: 'Формат работы', salary: 'Ожидания по зарплате',
    versions: 'Версии резюме (вкладки)', kam: 'KAM и продажи', pm: 'Проекты и внедрение', ai: 'AI Adoption',
    label: 'Название вкладки', position: 'Должность', headline: 'Подзаголовок', aboutShort: 'Обо мне — кратко', about: 'Обо мне — подробно',
    skills: 'Навыки', shortN: 'Сколько пунктов Авито в кратком виде', order: 'Порядок блоков Авито (коды из раздела «Блоки Авито»)',
    items: 'Блоки Авито (используются в версиях)', title: 'Заголовок', text: 'Текст', short: 'Кратко',
    jobs: 'Ключевой опыт', role: 'Должность', place: 'Компания и город', period: 'Период', bullets: 'Пункты', shortBullets: 'Пункты — кратко',
    context: 'Описание компании/роли', contextShort: 'Описание — кратко', id: 'Код',
    early: 'Ранний опыт', groups: 'Места работы', footer: 'Примечание',
    edu: 'Образование', school: 'Учебное заведение', year: 'Год / специальность',
    dev: 'Развитие и обучение', tools: 'Инструменты (текстом)', extra: 'Дополнительно', site: 'Адрес сайта для PDF'
  };
  var LANDING_SECTIONS = ['title', 'logo', 'nav', 'topbar', 'hero', 'about', 'skills', 'results', 'contact', 'footer'];
  var LL = {
    logo: 'Имя в шапке', nav: 'Меню (пункты)', topbar: 'Кнопки в шапке', resume: 'Кнопка «Резюме»', hero: 'Первый экран',
    label: 'Метка над заголовком', name: 'Заголовок (<br> — перенос строки, <span class="eg-q9p__accent-blue">слово</span> — цветное: blue / green / pink / purple / red)',
    desc: 'Описание', btn1: 'Первая кнопка', btn2: 'Вторая кнопка', loc: 'Локация и формат', alt: 'Подпись к фото', badges: 'Плашки на фото',
    about: 'Блок «Обо мне»', eyebrow: 'Надпись над заголовком', intro: 'Вступление', cards: 'Карточки с цифрами', num: 'Цифра / номер',
    roles: 'Роли', skills: 'Блок «Компетенции»', pillars: 'Направления', chips: 'Инструменты (плашки)', note: 'Примечание',
    results: 'Результаты', items: 'Показатели', contact: 'Блок «Контакты»', labels: 'Подписи карточек контактов', footer: 'Подвал'
  };
  var isLanding = function () { return /^landing-/.test(FILE); };
  var SECTIONS = ['person', 'versions', 'items', 'jobs', 'early', 'edu', 'dev', 'tools', 'extra', 'site'];
  var LONG = { text: 1, short: 1, about: 1, aboutShort: 1, bullets: 1, shortBullets: 1, context: 1, contextShort: 1, tools: 1, footer: 1, headline: 1 };
  var openSet = {};

  function getAt(path) { return path.reduce(function (o, k) { return o[k]; }, D); }
  function setAt(path, v) { var p = getAt(path.slice(0, -1)); p[path[path.length - 1]] = v; changed(); }
  function lab(k) { return (isLanding() && LL[k]) || LABELS[k] || k; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function blank(v) {
    if (Array.isArray(v)) return [];
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = blank(v[k]); }); return o; }
    return typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : '';
  }
  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 520) + 'px'; }

  function strField(path, key, val) {
    var long = LONG[key] || String(val).length > 80 || /\n/.test(val);
    var inp = long ? el('textarea') : el('input'); if (!long) inp.type = 'text';
    inp.value = val;
    inp.addEventListener('input', function () { setAt(path, inp.value); if (long) autosize(inp); });
    if (long) setTimeout(function () { autosize(inp); }, 0);
    return inp;
  }
  function numField(path, val) {
    var i = el('input'); i.type = 'number'; i.value = val;
    i.addEventListener('input', function () { setAt(path, i.value === '' ? 0 : Number(i.value)); });
    return i;
  }
  function field(path, key, val) {
    var w = el('div', 'fld'); var l = el('label', '', lab(key)); w.appendChild(l);
    var inp = typeof val === 'number' ? numField(path, val) : strField(path, key, val);
    l.appendChild(document.createTextNode('')); w.appendChild(inp); return w;
  }
  function ctl(arrPath, i, len, redraw) {
    var c = el('div', 'ctl');
    function mk(t, title, fn, cls, dis) { var b = el('button', 'btn sm ' + (cls || ''), t); b.type = 'button'; b.title = title; b.disabled = !!dis; b.addEventListener('click', fn); c.appendChild(b); }
    function move(d) { var a = getAt(arrPath), j = i + d; var t = a[i]; a[i] = a[j]; a[j] = t; changed(); redraw(); }
    mk('↑', 'Выше', function () { move(-1); }, '', i === 0);
    mk('↓', 'Ниже', function () { move(1); }, '', i === len - 1);
    mk('✕', 'Удалить', function () { if (confirm('Удалить этот пункт?')) { getAt(arrPath).splice(i, 1); changed(); redraw(); } }, 'del');
    return c;
  }
  function cardTitle(o, i) {
    var k = ['title', 'role', 'school', 'label'].filter(function (k) { return typeof o[k] === 'string' && o[k]; })[0];
    return (i + 1) + '. ' + (k ? o[k].slice(0, 60) : 'пункт');
  }
  function arrayField(path, key, arr, redraw) {
    var w = el('div', 'fld'); w.appendChild(el('label', '', lab(key)));
    var list = el('div', 'list'); w.appendChild(list);
    var fixed = isLanding() && key !== 'chips';
    var objs = arr.length && typeof arr[0] === 'object';
    arr.forEach(function (v, i) {
      var p = path.concat(i);
      if (objs) {
        var c = el('div', 'card'), hd = el('div', 'hd'); hd.appendChild(el('b', '', cardTitle(v, i))); if (!fixed) hd.appendChild(ctl(path, i, arr.length, redraw)); c.appendChild(hd);
        c.appendChild(objBody(p, v, redraw)); list.appendChild(c);
      } else {
        var r = el('div', 'row'); r.appendChild(strField(p, key === 'order' ? 'order' : 'bullets', v)); if (!fixed) r.appendChild(ctl(path, i, arr.length, redraw)); list.appendChild(r);
      }
    });
    var add = el('button', 'btn sm', '+ Добавить'); add.type = 'button';
    add.addEventListener('click', function () { arr.push(objs ? blank(arr[0]) : ''); changed(); redraw(); });
    if (!fixed) w.appendChild(add); return w;
  }
  function objBody(path, obj, redraw) {
    var b = el('div', 'body');
    Object.keys(obj).forEach(function (k) {
      if (HIDE[k]) return;
      var v = obj[k], p = path.concat(k);
      if (Array.isArray(v)) b.appendChild(arrayField(p, k, v, redraw));
      else if (v && typeof v === 'object') b.appendChild(group(p, k, v, redraw));
      else if (typeof v === 'string' || typeof v === 'number') b.appendChild(field(p, k, v));
    });
    return b;
  }
  function group(path, key, obj, redraw, nameOverride) {
    var d = el('details', 'sec'), id = path.join('/'); d.dataset.p = id; if (openSet[id]) d.open = true;
    d.addEventListener('toggle', function () { openSet[id] = d.open; });
    d.appendChild(el('summary', '', nameOverride || lab(key)));
    d.appendChild(objBody(path, obj, redraw)); return d;
  }
  function section(key, redraw) {
    var v = D[key]; if (v === undefined) return null;
    if (typeof v === 'string') { var d = el('details', 'sec'); d.dataset.p = key; if (openSet[key]) d.open = true; d.addEventListener('toggle', function () { openSet[key] = d.open; }); d.appendChild(el('summary', '', lab(key))); var b = el('div', 'body'); b.appendChild(strField([key], key, v)); d.appendChild(b); return d; }
    if (Array.isArray(v)) {
      var d2 = el('details', 'sec'); d2.dataset.p = key; if (openSet[key]) d2.open = true; d2.addEventListener('toggle', function () { openSet[key] = d2.open; });
      d2.appendChild(el('summary', '', lab(key))); var b2 = el('div', 'body'); b2.appendChild(arrayField([key], key, v, redraw)); d2.appendChild(b2); return d2;
    }
    var g = group([key], key, v, redraw);
    if (key === 'items') {
      /* блоки Авито — словарь id -> {title,text,short}: заголовок карточки по названию */
      Array.prototype.forEach.call(g.querySelectorAll(':scope > .body > details > summary'), function (s) {
        var id = s.parentNode.dataset.p.split('/')[1]; var t = (v[id] && v[id].title) || ''; s.textContent = id + ' — ' + t.slice(0, 50);
      });
    }
    if (key === 'items') { var note = el('p', 'note', 'Коды (b1, b2…) используются в «Порядок блоков Авито» у каждой версии: чтобы блок появился в версии, впишите его код в нужное место списка.'); g.querySelector('.body').prepend(note); }
    return g;
  }
  function draw() {
    var f = $('form'); f.textContent = '';
    (isLanding() ? LANDING_SECTIONS : SECTIONS).forEach(function (k) { var s = section(k, draw); if (s) f.appendChild(s); });
    if (isLanding()) { var tt = f.querySelector('details[data-p="title"] > summary'); if (tt) tt.textContent = 'Название вкладки браузера'; }
  }

  /* ---------------- предпросмотр ---------------- */
  var pvReady = false, pvTimer = null;
  function sendPreview() { var w = $('pv').contentWindow; if (w && pvReady) w.postMessage({ glData: D }, location.origin); }
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data && e.data.glReady) { pvReady = true; sendPreview(); } });
  var FILES = {
    'resume-data.json': ['Резюме (RU)', '../resume.html?preview=1&v=kam&m=long'],
    'resume-data.en.json': ['Resume (EN)', '../resume-en.html?preview=1&v=kam&m=long'],
    'resume-data.zh.json': ['简历 (中文)', '../resume-zh.html?preview=1&v=kam&m=long'],
    'landing-data.json': ['Главная (RU)', '../index.html?preview=1'],
    'landing-data.en.json': ['Главная (EN)', '../en.html?preview=1'],
    'landing-data.zh.json': ['Главная (中文)', '../zh.html?preview=1']
  };
  var FILE = (function () { var f = null; try { f = sessionStorage.getItem('adm-file'); } catch (e) {} return FILES[f] ? f : 'resume-data.json'; })();
  (function () {
    var sel = $('file'); if (!sel) return;
    Object.keys(FILES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = FILES[k][0]; sel.appendChild(o); });
    sel.value = FILE;
    sel.addEventListener('change', function () {
      if (dirty && !confirm('Есть несохранённые правки. Перейти к другому файлу и потерять их?')) { sel.value = FILE; return; }
      FILE = sel.value; try { sessionStorage.setItem('adm-file', FILE); } catch (e) {}
      loadData();
    });
  })();
  function initPreview() { pvReady = false; $('pv').src = FILES[FILE][1]; }

  /* ---------------- состояние ---------------- */
  function setStatus(msg, cls) { var s = $('status'); s.textContent = msg || ''; s.className = cls || ''; }
  function changed() {
    dirty = JSON.stringify(D) !== ORIG;
    $('dot').className = 'dot' + (dirty ? ' dirty' : ''); $('save').disabled = !dirty; $('undo').disabled = !dirty;
    if (dirty) setStatus('Есть несохранённые правки'); else setStatus('');
    clearTimeout(pvTimer); pvTimer = setTimeout(sendPreview, 250);
  }
  function loadData() {
    setStatus('Загружаю…');
    api('/data?f=' + encodeURIComponent(FILE)).then(function (r) {
      if (r.status === 401) { store(TOKEN_KEY, null); showLogin('Сессия закончилась. Войдите снова.'); return; }
      if (r.status !== 200) { setStatus('Не удалось загрузить данные: ' + (r.json.error || r.status), 'bad'); return; }
      D = r.json.data; SHA = r.json.sha; ORIG = JSON.stringify(D); draw(); initPreview(); changed(); setStatus('Данные загружены');
    }).catch(function () { setStatus('Нет связи с сервером', 'bad'); });
  }
  $('undo').addEventListener('click', function () { if (!confirm('Отбросить все несохранённые правки?')) return; D = JSON.parse(ORIG); draw(); changed(); });
  $('save').addEventListener('click', function () {
    $('save').disabled = true; setStatus('Сохраняю на сайт…');
    api('/save', { method: 'POST', body: { f: FILE, data: D, sha: SHA } }).then(function (r) {
      if (r.status === 200) { D = r.json.data; SHA = r.json.sha; ORIG = JSON.stringify(D); draw(); changed(); setStatus('Сохранено. Сайт обновится примерно через минуту.', 'ok'); return; }
      if (r.status === 401) { store(TOKEN_KEY, null); showLogin('Сессия закончилась. Войдите снова — правки в этой вкладке не потеряются, если вернуться без перезагрузки.'); return; }
      if (r.status === 409) setStatus('На сайте уже другая версия. Скачайте JSON со своими правками и обновите страницу.', 'bad');
      else if (r.status === 422) setStatus('Данные не прошли проверку: ' + (r.json.detail || ''), 'bad');
      else setStatus('Не сохранилось: ' + (r.json.error || r.status), 'bad');
      $('save').disabled = false;
    }).catch(function () { setStatus('Нет связи с сервером', 'bad'); $('save').disabled = false; });
  });
  $('dl').addEventListener('click', function () {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' }));
    a.download = FILE; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  });
  $('out').addEventListener('click', function () { if (dirty && !confirm('Есть несохранённые правки. Выйти?')) return; store(TOKEN_KEY, null); location.reload(); });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- старт ---------------- */
  redeemFromHash().then(function (r) {
    if (r === null) return;
    var t = store(TOKEN_KEY);
    if (t && tokenValid(t)) showApp(); else showLogin(API ? '' : 'Не задан адрес сервера входа. Откройте admin/config.js и впишите адрес Worker (инструкция в worker/SETUP.md).');
  });
})();
