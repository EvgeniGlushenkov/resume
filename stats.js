/* Счётчик просмотров: анонимный «маячок» на воркер (worker/index.js, маршрут /hit).
   Без cookies и без личных данных: уходит только имя страницы и пометка «первый просмотр за визит».
   Не считаются: предпросмотр в админке, страница внутри iframe, localhost и file://, браузеры с Do Not Track
   и тот браузер, где один раз открыта любая страница с ?nostat=1 (вернуть счёт: ?nostat=0).
   Подключается на всех публичных страницах после goals.js. */
(function () {
  'use strict';
  var API = window.STATS_API || 'https://resume-admin.ukeityrjd.workers.dev';
  var NOSTAT = 'eg-nostat', VISIT = 'eg-visit';

  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function get(kind, k) { try { var s = store(kind); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(kind, k, v) { try { var s = store(kind); if (s) s.setItem(k, v); } catch (e) {} }
  function del(kind, k) { try { var s = store(kind); if (s) s.removeItem(k); } catch (e) {} }

  var qs = new URLSearchParams(location.search);
  if (qs.get('nostat') === '1') set('localStorage', NOSTAT, '1');
  else if (qs.get('nostat') === '0') del('localStorage', NOSTAT);

  if (qs.get('preview') === '1') return;
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname) || location.protocol === 'file:') return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  if (get('localStorage', NOSTAT) === '1') return;

  var page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
  if (page === 'resume' && qs.get('taxi') === '1') page = 'resume-taxi';   // отдельная ссылка для Такси

  function send() {
    var first = get('sessionStorage', VISIT) ? 0 : 1;                      // первый просмотр в этой вкладке = новый визит
    set('sessionStorage', VISIT, '1');
    var body = JSON.stringify({ p: page, n: first });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(API + '/hit', new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch(API + '/hit', { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'no-cors' }); } catch (e) {}
  }

  /* langs.js прячет страницу выключенного языка, пока ждёт настройки сайта, и потом уводит на русскую версию.
     Такой показ не считаем: ждём, пока страница станет видимой (до 5 секунд). Если уйдёт на редирект, отправка не случится. */
  var tries = 0;
  (function wait() {
    if (document.documentElement.style.visibility === 'hidden' && tries++ < 25) { setTimeout(wait, 200); return; }
    send();
  })();
})();
