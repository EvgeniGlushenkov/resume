/*
 * taxi.js — «специальный лендинг» для резюме «Проекты и внедрение».
 * Подключается одной строкой в resume.html (перед </body>):
 *   <script src="taxi.js" defer></script>
 * Добавляет кнопку-машинку в шапку вкладки «Проекты и внедрение» и после 7 нажатий включает оформление в стиле Яндекс Такси
 * + фон — реальная карта Петербурга (Яндекс Карты, официальный JS API 2.1), по которой при прокрутке (с севера на юг) проезжают машины.
 * В этом режиме тексты мест работы и название позиции подстроены под вакансию; при выходе возвращаются исходные.
 * Ключ API (необязательно): window.GL_YMAPS_KEY = '...' до подключения скрипта.
 * Вход секретный: на вкладке «Проекты и внедрение» нужно 7 раз подряд нажать на иконку машинки (паузы между нажатиями до 2,5 с).
 * Выход — одно нажатие на иконку. Состояние запоминается (localStorage 'gl-taxi').
 */
(function () {
  'use strict';
  var HOST = document.getElementById('gl-resume');
  if (!HOST) return;
  var KEY = 'gl-taxi', NS = 'http://www.w3.org/2000/svg';
  var SR = null, built = false, on = false, raf = 0, bg, track, ov, world, ymap, proj, ready = false, cars = [], tmo = 0, taps = 0, tapT = 0, GX0 = 0, GY0 = 0, CX = 0, HM = 1;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- иконки ---------- */
  var ICON_SIDE =
    '<svg viewBox="0 0 64 28" width="46" height="20" aria-hidden="true" focusable="false">' +
    '<path d="M3 20v-5c0-2 1.5-3.2 4-3.7l9-1.6 5-5.4c.9-1 2-1.3 3.4-1.3H42c1.6 0 2.7.5 3.7 1.6l4.6 5 7.2 1.4c2.5.5 3.5 1.8 3.5 4V20z" fill="#fce000" stroke="#21201f" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M23 10.5l4-4.6h6.5v4.6zM36 5.9h6.3l4.6 4.6H36z" fill="#21201f"/>' +
    '<path d="M31 10.5h8.5L35 20h-8.5z" fill="#fff" stroke="#21201f" stroke-width="1"/><path d="M36.5 10.5H41L36.5 20H33z" fill="#21201f"/>' +
    '<rect x="29" y="0.6" width="9" height="2.6" rx="1.2" fill="#21201f"/>' +
    '<circle cx="16.5" cy="21" r="5.2" fill="#21201f"/><circle cx="16.5" cy="21" r="2" fill="#e8e6e0"/>' +
    '<circle cx="48.5" cy="21" r="5.2" fill="#21201f"/><circle cx="48.5" cy="21" r="2" fill="#e8e6e0"/></svg>';

  function carSym(id, body, roof, taxi) {
    return '<symbol id="' + id + '" viewBox="0 0 22 46">' +
      '<ellipse cx="11.5" cy="24" rx="11" ry="23" fill="rgba(0,0,0,.14)"/>' +
      '<rect x="1" y="1" width="20" height="44" rx="8" fill="' + body + '" stroke="rgba(0,0,0,.28)" stroke-width="1"/>' +
      '<path d="M4 15q7-4 14 0l-1 5H5z" fill="#2a2a2a"/><path d="M5.5 33h11l1.5 4q-7 3-14 0z" fill="#2a2a2a"/>' +
      '<rect x="4.5" y="20" width="13" height="13" rx="3" fill="' + roof + '"/>' +
      (taxi ? '<rect x="8" y="24" width="6" height="4" rx="1" fill="#21201f"/>' : '') +
      '<rect x="-0.6" y="14" width="2" height="4" rx="1" fill="' + body + '"/><rect x="20.6" y="14" width="2" height="4" rx="1" fill="' + body + '"/></symbol>';
  }

  /* ---------- карта: Яндекс Карты (официальный JS API 2.1), север сверху → юг снизу ---------- */
  var Z = 14, LON_C = 30.32, LAT_TOP = 59.995, LAT_BOT = 59.795;
  function loadYmaps(cb) {
    if (window.ymaps) return window.ymaps.ready(cb);
    var sc = document.createElement('script');
    sc.src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU' + (window.GL_YMAPS_KEY ? '&apikey=' + encodeURIComponent(window.GL_YMAPS_KEY) : '');
    sc.onload = function () { window.ymaps.ready(cb); };
    document.head.appendChild(sc);
  }
  function P(lon, lat) { var g = proj.toGlobalPixels([lat, lon], Z); return [g[0] - GX0, g[1] - GY0]; }

  /* реальные маршруты (OSRM по данным OSM): lon,lat в 1e-4°, первая пара — абсолют, дальше приращения */
  var ROUTES = {
    nev: '303126,599370,410,-50',
    kam: '303191,599567,-30,3,-26,-1,-22,40,-18,14,0,1,34,22,-53,54,-50,65,-24,23,-9,11,0,3,6,10,9,29,16,20,6,4,-1,1,-7,-4,-17,-21,-39,1,0,7,-1,2,3,0,0,3,-2,3,-5,-1,-1,3,14,2,12,3,5,1,1,-13,18,-1',
    dvo: '303200,599420,-15,-6,9,-6,-2,-5,-3,-13,5,-16,0,-11,-67,7,-2,2,3,8,-2,3,-58,38,-6,14,-5,5,-18,8,-6,2,-26,3,-61,3,-26,3,-25,5,-160,-47,21,-18,-5,-2,-2,3',
    vo: '302780,599419,-10,-3,-8,7,4,2,-1,1,-80,-23,-84,73,-4,-1,-25,-6,-8,7,-1,0,-31,1,-11,3,-17,1,-9,3,-16,16,-85,-21,-13,-3,-11,1,-64,9,-5,2,-11,2',
    mosk: '303191,599272,63,27,-1,1,-79,-33,1,-2,-1,-2,5,-89,-1,-5,1,-6,1,-4,3,-67,-1,-11,6,-107,2,-10,2,-37,0,-2,-4,-4,0,-6,4,-7,3,-62,2,-14,-1,-45,20,-337,0,-4,-9,-7,-3,-5,0,-4,3,-6,9,-7,7,-116,-5,-2,-18,-1',
    lig: '303612,599317,-8,-14,-21,-34,-21,-31,-15,-17,-63,-101,-30,-43,-39,-38,-44,-50,-47,-30,-22,-10,-21,-8,-36,-8',
    pulk: '303200,598298,-25,0,-3,2,3,2,83,1,9,0,2,-2,0,-1,-3,-1,-31,0,-6,2,-3,42,-2,1,-4,-2,8,-144,-1,-26,7,-28,2,-18,-1,-41,8,-147,-4,-12,-8,-7,-12,-6,-12,-3,-20,-1,-18,1,-176,26,-58,12,-101,16,-10,2,-29,9,-42,6,-9,3,-19,3,-3,-2,-2,-4,-11,-18,0,-2,-2,0,-21,4,-1,1,-2,2,12,23',
    zv: '303193,598421,2,-2,1,2,0,13,-2,2,1,3,9,-6,0,-4,1,-3,3,-4,4,-2,7,-1,13,1,5,-1,207,-112,2,-3,-2,-2,-21,0,-2,1,2,1,54,3,304,36,28,5,31,7,3,0,0,-2,-2,-1,-36,-9,4,-9',
    samps: '303299,599561,35,15,-5,6,-15,19,-2,6,-9,20,-3,12,15,26,8,10,2,1,52,8,75,10,37,9,-3,7,-12,23,-33,40,1,2,8,10,0,3,-16,35,-28,67,63,8,2,1,1,2,6,4,-2,1,-9,-8,-15,-1'
  };
  function routeD(str) {
    var a = str.split(',').map(Number), x = 0, y = 0, d = '';
    for (var i = 0; i < a.length; i += 2) {
      x = i ? x + a[i] : a[i]; y = i ? y + a[i + 1] : a[i + 1];
      var p = P(x / 1e4, y / 1e4);
      d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
    return d;
  }
  function overlayMarkup() {
    var s = '<defs>' + carSym('gl-cy', '#fce000', '#fff3a6', true) + carSym('gl-cw', '#fdfdfb', '#ecebe7', false) + carSym('gl-ck', '#2b2a29', '#444340', false) + carSym('gl-cx', '#fce000', '#ffe86a', true) + '</defs><g id="gl-tx-world">';
    for (var k in ROUTES) s += '<path id="gl-r-' + k + '" d="' + routeD(ROUTES[k]) + '" fill="none" stroke="none"/>';
    var a = P(30.3150, 59.9360), f = P(30.2625, 59.8003);
    /* пин «3 мин» у Адмиралтейской, как в Яндекс Go */
    s += '<g transform="translate(' + a[0].toFixed(0) + ' ' + a[1].toFixed(0) + ')"><rect x="-2.5" y="-62" width="5" height="62" fill="#e8573d"/><rect x="-32" y="-132" width="64" height="72" rx="20" fill="#e8573d"/>' +
      '<text x="0" y="-92" text-anchor="middle" style="font:800 28px Manrope,Arial,sans-serif;fill:#fff">3</text><text x="0" y="-72" text-anchor="middle" style="font:700 12px Manrope,Arial,sans-serif;fill:#fff">мин</text><circle r="8" fill="#fff" stroke="#e8573d" stroke-width="4"/></g>';
    /* финиш — Пулково */
    s += '<g transform="translate(' + f[0].toFixed(0) + ' ' + f[1].toFixed(0) + ')"><rect x="-2.5" y="-50" width="5" height="50" fill="#21201f"/><circle cx="0" cy="-80" r="32" fill="#21201f"/>' +
      '<path d="M0-100l4 12 13 7v3l-13-3-1 8 5 3v3l-8-2-8 2v-3l5-3-1-8-13 3v-3l13-7z" fill="#fce000"/></g>';
    return s + '<g id="gl-tx-cars"></g></g>';
  }

  /* машины: [маршрут, откуда(0..1), куда(0..1), цвет, смещение окна, ширина окна, полоса] */
  var FLEET = [
    ['kam', 0.0, 1.0, 'gl-cy', 0.0, 0.07, 1], ['kam', 1.0, 0.0, 'gl-ck', 0.02, 0.07, 1], ['samps', 0.0, 1.0, 'gl-cw', 0.0, 0.07, 1], ['samps', 1.0, 0.0, 'gl-cx', 0.02, 0.07, 1],
    ['dvo', 0.0, 1.0, 'gl-cx', 0.0, 0.07, 1], ['dvo', 1.0, 0.0, 'gl-cw', 0.02, 0.07, 1], ['vo', 0.0, 1.0, 'gl-cy', 0.0, 0.07, 1], ['vo', 1.0, 0.0, 'gl-ck', 0.02, 0.07, 1],
    ['nev', 0.0, 1.0, 'gl-cy', -0.01, 0.07, 1], ['nev', 1.0, 0.0, 'gl-cw', 0.015, 0.07, 1], ['nev', 0.0, 1.0, 'gl-ck', 0.03, 0.07, 1],
    ['lig', 0.0, 1.0, 'gl-cy', 0.0, 0.07, 1], ['lig', 1.0, 0.0, 'gl-ck', 0.02, 0.07, 1],
    ['mosk', 0.02, 0.2, 'gl-cx', 0.0, 0.045, 1], ['mosk', 0.3, 0.5, 'gl-cw', 0.0, 0.045, 1], ['mosk', 0.8, 0.6, 'gl-ck', 0.0, 0.045, 1], ['mosk', 0.55, 0.98, 'gl-cy', 0.0, 0.05, 1],
    ['zv', 0.0, 1.0, 'gl-cy', 0.0, 0.07, 1], ['zv', 1.0, 0.0, 'gl-cw', 0.02, 0.07, 1],
    ['pulk', 0.0, 0.3, 'gl-cx', 0.0, 0.045, 1], ['pulk', 0.45, 0.2, 'gl-ck', 0.0, 0.045, 1], ['pulk', 0.5, 0.75, 'gl-cw', 0.0, 0.045, 1], ['pulk', 0.7, 1.0, 'gl-cy', 0.0, 0.05, 1], ['pulk', 1.0, 0.8, 'gl-cx', 0.03, 0.05, 1]
  ];

  /* вдвое больше машин: встречный поток по тем же улицам, другой цвет, сдвиг по прокрутке */
  (function () {
    var COL = ['gl-cy', 'gl-cw', 'gl-ck', 'gl-cx'];
    FLEET = FLEET.concat(FLEET.map(function (f) { return [f[0], f[2], f[1], COL[(COL.indexOf(f[3]) + 1) % 4], f[4] + 0.035, f[5], 1]; }));
  })();

  function build() {
    if (built) return; built = true;
    var st = document.createElement('style'); st.id = 'gl-tx-doc';
    st.textContent = 'html.gl-taxi body{background:#f4f3ef}#gl-resume{position:relative;z-index:1}' +
      '#gl-tx-bg{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;display:none;background:#f4f3ef}html.gl-taxi #gl-tx-bg,html.gl-taxi #gl-tx-track{display:block}' +
      '#gl-tx-ymap,#gl-tx-ov{position:absolute;inset:0;width:100%;height:100%}#gl-tx-ov{overflow:hidden}' +
      '#gl-tx-bg::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(244,243,239,.4),rgba(244,243,239,0) 16%)}' +
      '#gl-tx-ymap [class*="copyrights-pane"],#gl-tx-ymap [class*="copyright"]{pointer-events:auto}' +
      '#gl-tx-track{position:fixed;right:16px;top:110px;bottom:110px;width:34px;z-index:5;pointer-events:none;display:none}' +
      '#gl-tx-track i{position:absolute;left:15px;top:0;bottom:0;width:4px;border-radius:2px;background:rgba(33,32,31,.14)}' +
      '#gl-tx-track b{position:absolute;left:15px;top:0;width:4px;border-radius:2px;background:#fce000;box-shadow:0 0 0 1px rgba(33,32,31,.25)}' +
      '#gl-tx-track .pt{position:absolute;left:9px;width:16px;height:16px;border-radius:50%;background:#21201f;border:3px solid #fce000}#gl-tx-track .pt.b{bottom:-8px}#gl-tx-track .pt.a{top:-8px}' +
      '#gl-tx-track .cr{position:absolute;left:-6px;width:46px;margin-top:-10px;transition:top .08s linear}#gl-tx-track .cr svg{display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.25))}' +
      '#gl-tx-track .eta{position:absolute;right:46px;top:-14px;background:#e8573d;color:#fff;font:800 13px/1 Manrope,Arial,sans-serif;padding:7px 10px;border-radius:12px;white-space:nowrap}' +
      '#gl-tx-sweep{position:fixed;left:-140px;bottom:34px;z-index:100;pointer-events:none;animation:gltx 1.05s cubic-bezier(.45,.05,.4,1) forwards}#gl-tx-sweep svg{width:110px;height:auto;filter:drop-shadow(0 6px 8px rgba(0,0,0,.3))}' +
      '@keyframes gltx{to{transform:translateX(calc(100vw + 300px))}}' +
      '@media (max-width:1100px){#gl-tx-track{display:none!important}}@media print{#gl-tx-bg,#gl-tx-track,#gl-tx-sweep{display:none!important}}';
    document.head.appendChild(st);
    bg = document.createElement('div'); bg.id = 'gl-tx-bg';
    bg.innerHTML = '<div id="gl-tx-ymap"></div><svg id="gl-tx-ov" xmlns="' + NS + '"></svg>';
    document.body.insertBefore(bg, document.body.firstChild);
    ov = bg.querySelector('#gl-tx-ov');
    track = document.createElement('div'); track.id = 'gl-tx-track';
    track.innerHTML = '<i></i><b></b><span class="pt a"></span><span class="pt b"></span><div class="cr"><div class="eta">3 мин</div>' + ICON_SIDE + '</div>';
    document.body.appendChild(track);
    loadYmaps(setup);
  }
  function setup() {
    bg.style.display = 'block';
    ymap = new ymaps.Map(bg.querySelector('#gl-tx-ymap'), { center: [59.9388, LON_C], zoom: Z, controls: [] }, { yandexMapDisablePoiInteractivity: true, suppressMapOpenBlock: false });
    ymap.behaviors.disable(['drag', 'scrollZoom', 'dblClickZoom', 'multiTouch', 'rightMouseButtonMagnifier', 'leftMouseButtonMagnifier']);
    proj = ymap.options.get('projection');
    var o = proj.toGlobalPixels([LAT_TOP, LON_C], Z); GX0 = o[0]; GY0 = o[1];
    HM = proj.toGlobalPixels([LAT_BOT, LON_C], Z)[1] - GY0;
    ov.innerHTML = overlayMarkup();
    world = ov.querySelector('#gl-tx-world');
    var layer = ov.querySelector('#gl-tx-cars');
    FLEET.forEach(function (f) {
      var path = ov.querySelector('#gl-r-' + f[0]); if (!path) return;
      var g = document.createElementNS(NS, 'g'), u = document.createElementNS(NS, 'use');
      u.setAttribute('href', '#' + f[3]); u.setAttribute('x', -9); u.setAttribute('y', -19); u.setAttribute('width', 18); u.setAttribute('height', 38);
      g.appendChild(u); g.style.display = 'none'; layer.appendChild(g);
      cars.push({ el: g, path: path, len: path.getTotalLength(), f0: f[1], f1: f[2], off: f[4], wp: f[5], lane: f[6] });
    });
    bg.style.display = '';
    ready = true; layout(); kick();
  }

  function layout() {
    if (!ready) return;
    var vh = innerHeight;
    ymap.container.fitToViewport();
    cars.forEach(function (c) {
      var d = (c.f0 + c.f1) / 2, pt = c.path.getPointAtLength(c.len * d);
      c.pc = Math.min(1, Math.max(0, (pt.y - vh / 2) / Math.max(1, HM - vh))) + c.off;
    });
  }

  function frame() {
    raf = 0; if (!on || !ready) return;
    var vw = innerWidth, vh = innerHeight, de = document.documentElement;
    var L = Math.max(1, de.scrollHeight - vh), p = Math.min(1, Math.max(0, (window.pageYOffset || de.scrollTop) / L));
    ymap.setGlobalPixelCenter([GX0, GY0 + vh / 2 + p * (HM - vh)], Z, { duration: 0 });
    var g = ymap.getGlobalPixelCenter();
    world.setAttribute('transform', 'translate(' + (vw / 2 - (g[0] - GX0)).toFixed(1) + ' ' + (vh / 2 - (g[1] - GY0)).toFixed(1) + ')');
    cars.forEach(function (c) {
      var u = (p - (c.pc - c.wp)) / (2 * c.wp);
      if (u <= 0 || u >= 1) { c.el.style.display = 'none'; return; }
      var e = 0.5 * u + 0.5 * u * u * (3 - 2 * u), d = c.f0 + (c.f1 - c.f0) * e, sg = c.f1 >= c.f0 ? 1 : -1, l = c.len * d;
      var a = c.path.getPointAtLength(Math.max(0, Math.min(c.len, l))), b = c.path.getPointAtLength(Math.max(0, Math.min(c.len, l + sg * 4)));
      var hx = b.x - a.x, hy = b.y - a.y, hl = Math.sqrt(hx * hx + hy * hy) || 1; hx /= hl; hy /= hl;
      var x = a.x - hy * 4.5 * c.lane, y = a.y + hx * 4.5 * c.lane;
      c.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + (Math.atan2(hy, hx) * 180 / Math.PI + 90).toFixed(1) + ')');
      c.el.style.display = ''; c.el.style.opacity = Math.min(1, u / 0.07, (1 - u) / 0.07).toFixed(2);
    });
    var cr = track.querySelector('.cr'), fill = track.querySelector('b'), eta = track.querySelector('.eta'), n = Math.ceil((1 - p) * 3);
    cr.style.top = (p * 100) + '%'; fill.style.height = (p * 100) + '%'; eta.textContent = p > 0.985 ? 'Приехали' : (n < 1 ? 1 : n) + ' мин';
  }
  function kick() { if (on && !raf) raf = requestAnimationFrame(frame); }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function () { if (on) { layout(); kick(); } });

  /* ---------- оформление внутри shadow DOM резюме ---------- */
  var THEME =
    ':host{--bg:#fff;--surface:#fff;--ink:#21201f;--muted:#6f6e69;--line:#ebe9e3;--c-blue:#fce000;--c-green:#fff1a8;--c-pink:#ffd3c2;--c-lilac:#ecebe6;--c-yellow:#fce000;--todo-bg:#fce000;--todo-fg:#21201f}' +
    '.page{background:transparent}' +
    '.bar{background:rgba(255,255,255,.9);border:0;border-radius:28px;padding:12px 14px;box-shadow:0 8px 30px rgba(33,32,31,.08);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
    '.tabs,.seg{background:#f5f4f2;border:0;border-radius:18px}.tabs button,.seg button{border-radius:14px;color:#6f6e69}' +
    '.tabs button[aria-pressed="true"],.seg button[aria-pressed="true"]{background:#fce000;color:#21201f}' +
    '.hb,.bar .hb,.bar .shr .hb,.bar .shr button{border-radius:16px;background:#21201f;border-color:#21201f;color:#fff;font:700 14px/1 var(--f-body);letter-spacing:0;text-transform:none;padding:13px 20px}' +
    '.hb:hover{background:#fce000;border-color:#fce000;color:#21201f}.hb.back,.hb.back:hover{background:#fce000;border-color:#fce000;color:#21201f}.hb.back:hover{background:#ffd21e;border-color:#ffd21e}' +
    '.eyebrow,.rid-top{display:inline-block;background:rgba(255,255,255,.85);border-radius:999px;padding:7px 14px;color:#21201f}' +
    '.name{letter-spacing:-.04em}.photo{box-shadow:0 0 0 10px rgba(252,224,0,.55);background:#fce000}' +
    '.card,.tile,.job{border-radius:24px;box-shadow:0 6px 24px rgba(33,32,31,.07)}.card{background:rgba(255,255,255,.92)}' +
    'details.sec{background:rgba(255,255,255,.86);border-radius:28px;padding:22px 26px;box-shadow:0 8px 30px rgba(33,32,31,.07);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}' +
    '.sec .job{background:#f7f6f2;box-shadow:none}.pills li{color:#21201f}' +
    '.fb{background:#fce000;border-radius:28px}.tl{border-left-color:#21201f}.tl>li::before{background:#fce000;box-shadow:0 0 0 2px #21201f}' +
    '.hh{display:none!important}.pos{max-width:30ch}.side-head{position:relative}' +
    '.gl-tx-rate{position:absolute;z-index:3;display:flex;align-items:center;gap:9px;background:#21201f;color:#fff;border-radius:18px;padding:9px 16px 9px 12px;box-shadow:0 8px 22px rgba(33,32,31,.28)}' +
    '@media (max-width:560px){details.sec{padding:18px}}';
  var BTN_CSS = '.gl-tx-btn{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:#21201f;border-radius:16px;padding:6px 8px;cursor:pointer;height:34px;opacity:.38;filter:grayscale(1);transition:opacity .2s,filter .2s}.gl-tx-btn:hover{opacity:.7}.gl-tx-btn svg{width:34px;height:auto}.gl-tx-btn[aria-pressed="true"]{opacity:1;filter:none;background:#21201f;padding:6px 12px}.gl-tx-btn[aria-pressed="true"] svg{width:46px}.gl-tx-btn:focus-visible{outline:2px solid #21201f;outline-offset:2px}';

  /* ---------- тексты под вакансию «Менеджер по развитию бизнеса в Такси (СПб)» — только в режиме «Такси» ---------- */
  var POS = 'Собеседование на позицию | Менеджер по развитию бизнеса в Такси (Санкт-Петербург)';
  function L(a, b) { return '<li><span class="lead">' + a + '</span> ' + b + '</li>'; }
  var JOBS = {
    'Изучение и внедрение AI': '<ul class="bul">' +
      L('AI как рабочий инструмент.', 'Системно изучаю генеративный AI, AI-агентов, коннекторы (connectors) и навыки (skills) для них. Сравниваю модели и сервисы на своих задачах и оставляю в работе те, что дают результат.') +
      L('Аналитика и материалы.', 'Создаю собственные навыки и промпты под повторяющиеся задачи: презентации, документы, аналитика, подготовка материалов.') +
      L('Автоматизация рутины.', 'Настраиваю регулярные сводки и подборки по расписанию, веду учёт в таблицах.') +
      L('Обзоры рынка и сайты.', 'С помощью AI проектирую и запускаю аналитические обзоры рынка, лендинги, карьерные сайты и сайты-визитки, закрытые кабинеты с доступом по логину.') + '</ul>',
    'Старший менеджер по работе': '<p class="ctx">Автохаб — SaaS-платформа для автодилеров (партнёрский B2B-бизнес): публикация объявлений на классифайдах, оценка стоимости, выкуп и продажа автомобилей с внедрением ИИ-технологий. Пришёл в стартап MaxPoster, когда его приобрёл Авито, и прошёл интеграцию до конца. Путь: менеджер по работе с ключевыми клиентами → старший менеджер по работе с ключевыми клиентами. Работал с портфелем партнёров — собственниками и руководителями дилерских групп: разбирал, что мешает им расти, и запускал изменения вместе с продуктом, техподдержкой и командами клиента, без прямого подчинения.</p><ul class="bul">' +
      L('Рост партнёрской сети — с 1 до 43 центров.', 'Вёл региональную дилерскую группу из Краснодара с первого салона до федеральной сети: участвовал в стратегических сессиях клиента, выступал вместе с ним на отраслевых мероприятиях, подключил и обучил 480+ пользователей.') +
      L('Пилот и масштабирование — запуск центра с 14 до 5 рабочих дней.', 'Проверил гипотезу запуска кабинета за один день на пилоте с импортёрскими кабинетами, отладил стыки между техподдержкой и клиентскими менеджерами, закрепил шаблоны и зоны ответственности. Для полноценных запусков с оплатой, фидами и подрядчиками вышли на 5 дней. Процесс внедрили во всём Автохабе.') +
      L('Переговоры с собственниками и C-level.', 'Сам поставил цель работать с одной из крупнейших дилерских групп России и выстроил путь к ней: поднимал контакты из автобизнеса, выходил на руководителей через отраслевые мероприятия. Довёл переговоры до собственников и C-level, ввёл регулярные бизнес-ревью и дорожную карту. Клиента подключили за 4 месяца вместо 6, а контракт стал крупнейшим в истории Автохаба.') +
      L('Рост партнёров через использование продукта.', 'Тарифы за эти годы выросли больше чем вдвое, рынок сжимался. Приходил с расчётом, какие функции клиент недоиспользует и как они окупят новую цену. Вёл реестр отключений с причинами и планом возврата. Годовой отток портфеля снизил с 12% до 4%, использование ключевых функций поднял с 38% до 74%, вернул 9 из 10 клиентов из зоны риска.') +
      L('Онбординг и обучение партнёров.', 'Программа обучения с нуля: сценарии онбординга, база знаний, FAQ, очные и онлайн-сессии для групп от 80 человек. Обучил 3 500+ пользователей, в крупнейшей группе — около 900 сотрудников за полгода. Онбординг завершают 92%, типовых обращений в поддержку стало на 35% меньше, оценка обучения — 4,8 из 5.') +
      L('Партнёры → продукт, на данных.', 'Раз в месяц разбирал запросы дилеров и импортёров по частоте вместе с технической командой, раз в квартал защищал приоритеты перед продуктом. За 4,5 года передал 98 инициатив: 36 вошли в roadmap, 18 реализованы. Был фича-лидом доработок, провёл 50+ продуктовых интервью и презентаций, участвовал в A/B-тестах.') +
      L('Единая точка ответственности.', 'Настраивал и вёл интеграции дилера с классифайдами (Авито, Дром) и подрядчиками, разбирал технические сбои, координировал техподдержку, финансовую службу и руководителей на стороне клиента.') +
      L('Новое направление.', 'Последние полгода переносил модель работы с автомобилями с пробегом на новый сегмент — новые автомобили: подключал дилеров новых авто к Автохабу, работал вместе с командой по импортёрам.') +
      L('Внутренний эксперт.', 'Вёл стажёров, онбордил коллег на новые роли, отвечал за командную метрику вовлечённости клиентов.') +
      L('AI и автоматизация.', 'Собрал для коллег базу знаний и Telegram-бота, чтобы в командировке или на встрече отправить клиенту нужную инструкцию одной командой. Одним из первых тестировал внутреннего AI-ассистента Авито и передавал обратную связь продукту.') + '</ul>',
    'Региональный представитель': '<ul class="bul">' +
      L('Развитие регионов.', 'Расширял регионы присутствия продукта и взаимодействовал с собственниками процессов — маркетологами, директорами и собственниками.') +
      L('Подключение партнёров.', 'Подключал дилерские центры к платформе, обучал сотрудников салонов работе с лидами, контролировал качество обработки заявок.') +
      L('Техническое взаимодействие.', 'Настраивал интеграции (API, фиды и webhook) между автосалонами и продуктом.') + '</ul>',
    'Индивидуальный предприниматель': '<ul class="bul">' +
      L('Собственный бизнес полного цикла.', 'Запустил и вёл торговый бизнес: закупки и ассортимент, оптовые поставки в небольшие магазины, розничная точка, интернет-магазин и собственная курьерская служба из двух человек. Ассортимент: плодоовощная продукция, орехи, сухофрукты, экзотические продукты.') +
      L('Регуляторная часть.', 'Закрывал онлайн-кассу и фискализацию, налоговую отчётность, электронные подписи, площадки госзакупок. Участвовал в профильных выставках.') +
      L('Цифровой контур без IT-команды.', 'Сайт на Adobe Muse, витрина и приём заказов на Ecwid, домен и сервер, каталог и остатки, статусы заказов, шаблоны документов. Этот проект определил мой интерес к IT-коммерции и SaaS.') + '</ul>'
  };
  var BADGE = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 1.8l3 6.3 6.9.9-5 4.8 1.3 6.8L12 17.2 5.8 20.6l1.3-6.8-5-4.8 6.9-.9z" fill="#f2b705" stroke="#c98f00" stroke-width="1" stroke-linejoin="round"/></svg><span style="display:grid;line-height:1.05"><b style="font:800 22px/1 var(--f-display)">5,0</b><i style="font:500 11px/1.2 var(--f-body);font-style:normal;color:#b9b8b3">Рейтинг</i></span>';
  function placeBadge() {
    var b = SR.querySelector('.gl-tx-rate'), ph = SR.querySelector('.photo');
    if (!b || !ph) return;
    b.style.left = (ph.offsetLeft + 6) + 'px'; b.style.top = (ph.offsetTop + ph.offsetHeight - 58) + 'px';
  }
  function applyTexts(v) {
    var pos = SR.querySelector('.pos'), hh = SR.querySelector('.side-head'), badge = SR.querySelector('.gl-tx-rate');
    if (pos) {
      if (v && pos.getAttribute('data-o') === null) { pos.setAttribute('data-o', pos.textContent); pos.textContent = POS; }
      if (!v && pos.getAttribute('data-o') !== null) { pos.textContent = pos.getAttribute('data-o'); pos.removeAttribute('data-o'); }
    }
    [].forEach.call(SR.querySelectorAll('details.job'), function (j) {
      var role = (j.querySelector('.role') || {}).textContent || '', jb = j.querySelector('.jb'); if (!jb) return;
      if (v) {
        if (jb.getAttribute('data-o') !== null) return;
        for (var k in JOBS) if (role.indexOf(k) === 0) { jb.setAttribute('data-o', jb.innerHTML); jb.innerHTML = JOBS[k]; break; }
      } else if (jb.getAttribute('data-o') !== null) { jb.innerHTML = jb.getAttribute('data-o'); jb.removeAttribute('data-o'); }
    });
    if (v && hh && !badge) {
      badge = document.createElement('div'); badge.className = 'gl-tx-rate'; badge.innerHTML = BADGE; hh.appendChild(badge);
      if (window.ResizeObserver && SR.querySelector('.photo')) new ResizeObserver(placeBadge).observe(SR.querySelector('.photo'));
    }
    if (!v && badge) badge.remove();
    if (v) placeBadge();
  }

  function pmActive() {
    var b = SR && SR.querySelector('.tabs button[aria-pressed="true"]');
    return !!b && /Проект|внедрен/i.test(b.textContent);
  }
  function setTheme(v) {
    if (v === on) return;
    var el = SR.getElementById('gl-tx-css');
    if (v) {
      build();
      if (!el) { el = document.createElement('style'); el.id = 'gl-tx-css'; SR.appendChild(el); }
      el.textContent = THEME; document.documentElement.classList.add('gl-taxi'); on = true; applyTexts(true); layout(); frame();
    } else {
      if (el) el.remove(); document.documentElement.classList.remove('gl-taxi'); on = false; applyTexts(false);
    }
  }
  function sync() {
    if (!SR) return;
    var pm = pmActive(), grp = SR.querySelector('.bar .grp'), btn = SR.querySelector('.gl-tx-btn');
    if (!SR.getElementById('gl-tx-btncss')) { var bs = document.createElement('style'); bs.id = 'gl-tx-btncss'; bs.textContent = BTN_CSS; SR.appendChild(bs); }
    if (pm && grp && !btn) {
      btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gl-tx-btn';
      btn.setAttribute('aria-label', 'Машинка');
      btn.innerHTML = ICON_SIDE; grp.appendChild(btn);
      btn.addEventListener('click', function () {
        if (ls(KEY) === '1') { ls(KEY, '0'); btn.setAttribute('aria-pressed', 'false'); setTheme(false); return; }
        if (btn.animate) btn.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg) translateX(-2px)' }, { transform: 'rotate(0)' }], { duration: 160 });
        taps++; clearTimeout(tapT); tapT = setTimeout(function () { taps = 0; }, 2500);
        if (taps < 7) return;
        taps = 0; ls(KEY, '1'); btn.setAttribute('aria-pressed', 'true');
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          var sw = document.createElement('div'); sw.id = 'gl-tx-sweep'; sw.innerHTML = ICON_SIDE; document.body.appendChild(sw);
          build(); clearTimeout(tmo); tmo = setTimeout(function () { setTheme(true); }, 420); setTimeout(function () { sw.remove(); }, 1200);
        } else { setTheme(pmActive()); }
      });
    }
    if (btn) { btn.hidden = !pm; btn.setAttribute('aria-pressed', ls(KEY) === '1' ? 'true' : 'false'); }
    setTheme(pm && ls(KEY) === '1');
    if (on) applyTexts(true);
  }

  function init() {
    SR = HOST.shadowRoot; var app = SR && SR.getElementById('app');
    if (!app || !app.firstChild) return false;
    new MutationObserver(function () { sync(); }).observe(app, { childList: true });
    sync(); return true;
  }
  var tries = 0;
  (function wait() { if (!init() && tries++ < 100) setTimeout(wait, 100); })();
})();
