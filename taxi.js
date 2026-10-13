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
  var HOST = document.getElementById('gl-resume'), PAGE = document.getElementById('gl-tx-page');   /* PAGE — отдельный лендинг (taxi-test.html): только карта с машинками */
  if (!HOST && !PAGE) return;
  var KEY = 'gl-taxi', NS = 'http://www.w3.org/2000/svg';
  var SR = null, built = false, on = false, raf = 0, bg, track, ov, world, ymap, proj, ready = false, cars = [], tmo = 0, taps = 0, tapT = 0, GX0 = 0, GY0 = 0, CX = 0, HM = 1;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  /* ссылка «Резюме» со страницы тестового (resume.html?v=pm&taxi=1) сразу открывает специальное резюме */
  if (HOST && /(?:^|&)taxi=1(?:&|$)/.test(location.search.slice(1))) ls(KEY, '1');

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

  /* реальные маршруты (OSRM по данным OSM): lon,lat в 1e-5°, первая пара — абсолют, дальше приращения */
  var ROUTES = [
    '3030991,5998629,-157,55,-283,-133,-165,53,-131,88,-79,261,-83,54,-221,68,169,528,-151,473,-41,-4,135,-451,-637,-66,29,-56,-293,-30,0,-31,-72,-5',
    '3035582,5998740,174,-92,274,-12,417,-95,193,203,627,210,107,-2,173,79',
    '3033625,5998413,52,-61,-102,-10,-38,89,2236,218,-208,109,188,94,57,-137,198,19,-39,61',
    '3027686,5998216,793,115,29,17,-29,19,-1256,-100,-762,35,-810,3,-2,110,271,-13,-1,-56',
    '3027068,5997767,378,-86,79,257,302,94,397,80,276,36,110,-72,12,-52',
    '3031722,5997113,-2,-25,-272,10,330,471,118,115,522,278,959,424,152,44,62,-154,-116,-17,-174,-67',
    '3034662,5997046,37,3,-46,84,178,28,-106,198,-311,358,5,33,1030,104,20,-57,113,8',
    '3026291,5996955,7,-36,646,46,-90,128,128,289,177,55,427,-98,5,91,-69,56',
    '3034490,5996625,-15,68,-197,-23,-111,241,-906,-142,-401,500',
    '3029712,5996498,240,135,817,131,124,3,59,37,-32,33,74,27,182,-56,221,-30,-88,-140,-38,-24,-41,15,41,25,-45,9',
    '3026143,5996054,8,13,820,-134,206,97,-29,45,72,59,205,94,374,-152,259,83,786,151,-676,329,316,-5,40,-38',
    '3032640,5995953,14,-11,431,123,257,-301,775,40,-15,248',
    '3030098,5995788,75,-28,147,90,89,-38,37,-55,800,123,-10,19,1004,202,186,-225,36,-26,67,21,53,-61',
    '3031936,5995306,368,-18,197,88,-213,166,-269,108,-305,44,-299,5,-283,-42,-75,77,43,11',
    '3036811,5995019,286,51,322,90,425,142,625,268,144,38,149,14,185,-13,361,-118',
    '3028577,5994899,454,332,571,-168,14,11,-211,63,21,63,153,-13',
    '3030699,5994203,-89,164,-273,146,26,229,70,50,162,45,485,303',
    '3032609,5994338,-30,18,65,25,-77,48,425,106,39,51,-23,52,1109,249,149,-208,29,-242',
    '3026362,5994075,30,-19,40,11,628,-520,1505,449,-418,362',
    '3033553,5993532,-71,-131,-229,-99,252,100,138,334,423,87,155,-24,287,25,25,447,510,24,195,-38,97,33,-62,52',
    '3037017,5993357,-28,-20,-399,141,362,338,-607,57,-366,8,-223,4,-12,-47',
    '3032122,5993285,25,26,71,-16,-131,-142,-239,-64,-835,558,-258,-87',
    '3029999,5992814,14,-66,491,113,-89,182,-114,83,458,110,-369,208,-302,215,99,-84',
    '3035683,5992675,-900,105,-37,79,-64,-66,-444,-175,253,451,-42,11,11,18',
    '3037665,5992350,-779,296,267,213,-501,177,-16,-20',
    '3033352,5991889,-111,23,124,-117,605,177,-155,128,914,535,46,263,400,-51,2,-38',
    '3027669,5991830,33,-20,735,307,-65,38,201,76,-145,160,-259,-59,-4,-18,-151,17,-154,105,-224,-46',
    '3032502,5991519,-323,300,-286,-105,-81,20,-36,389',
    '3027472,5991117,-5,39,204,7,370,628,118,56,-313,188,-31,-12,-48,30,-61,-31,-52,25,-134,-72,-60,31,-114,-78',
    '3029571,5990919,193,-2,10,-58,5,79,-21,458,-254,-4,-4,70,57,5,-4,111',
    '3028295,5990715,-124,0,-1,70,-257,8,0,27,52,0,1,70,-1546,10,151,224,545,19,-2,-37,-108,-2',
    '3032679,5990071,-160,74,219,136,-16,40,1005,105,84,63,-246,329,-98,299,-173,165,82,30,-72,-12',
    '3027111,5990137,24,61,-180,36,-83,141,-175,68,-46,48,96,95,0,241,155,25',
    '3031308,5989927,-46,-47,-52,-4,-4,282,396,94,338,-9,704,70,-48,85,-32,4',
    '3027776,5989734,-62,51,48,12,-22,31,436,80,-42,62,897,286,76,176,487,431,454,-9,-74,-733',
    '3027785,5989362,-102,44,-29,99,547,92,136,48,1008,155,48,120,-53,11,-30,-6,-32,-127',
    '3031514,5989211,15,-16,392,78,-37,-132,22,-26,62,-3,32,31,-27,128,504,216',
    '3028347,5988742,-577,146,-12,24,244,243,516,-111,206,220',
    '3037457,5988249,299,-188,1007,399,-698,468,433,199,-209,-87,-40,28,41,29,-76,66,-339,69,-37,-3,37,-29',
    '3026142,5988197,135,-33,-466,-461,-109,-17,-48,-31,35,-55,117,-6,53,39,-29,67,329,325,572,-151,1018,1021,421,-98,7,16',
    '3036952,5987850,87,-62,-565,-222,-874,-165,-368,491,-243,-56,-111,23,-345,571',
    '3032568,5987479,-116,-2,-7,113,139,2,-1,15,-551,-9,-23,814,-182,16',
    '3033830,5987147,27,46,70,7,-263,-3,-25,579,177,387,152,209,185,-29',
    '3025440,5987174,139,10,59,-208,57,5,-91,303,392,35,229,77,336,307',
    '3028340,5987280,266,1,29,253,-226,12,-42,109,24,170,60,51,-25,18,-265,-12,-179,31,-228,-256,-535,105,-309,-326,-182,-147,-233,-146,-237,-82,-183,-36,-383,-34,-88,293,66,5',
    '3036579,5986495,-92,187,601,88,-529,694,-77,-16,15,-20,-190,-29',
    '3031978,5986206,-15,-33,-536,-8,-48,790,-34,0,-7,33,-81,-32,-44,27,38,30,-29,66',
    '3033520,5986300,6,-112,172,3,7,252,1102,11',
    '3027809,5985406,0,22,305,-6,216,339,33,159,369,221,-1252,646,165,-91,-207,-103,-287,-5,-67,75',
    '3031936,5985437,86,57,80,8,15,-262,-29,-20,-1426,-19,-30,72,-138,33,48,1095,-76,-46,-13,-284,-421,5,4,84',
    '3031281,5984950,-1,26,55,3,-8,76,160,3,-37,714,302,171,-75,31,-52,-31',
    '3033568,5984585,-4,-21,54,1,6,-113,-585,-9,-61,1056,-540,5,-14,248,125,3',
    '3038190,5984968,50,13,-32,36,244,75,-495,536,-952,-148,-938,-110,-41,21,30,27,305,28,57,-98,-203,-22,51,-101,-307,-44,-3,-18',
    '3030230,5984767,-158,-79,-236,102,-641,41,80,370,-1240,-9,-12,-489,65,36,12,107',
    '3033435,5984020,-19,11,49,22,50,-11,-456,248,-20,153,-793,-15,-26,17,-34,374,75,1,-5,36',
    '3035579,5983746,309,29,-251,585,44,80,-86,199,154,-30,-47,131',
    '3033065,5983668,106,50,113,-3,538,256,-9,472,127,-5,627,-153',
    '3034452,5983540,-64,17,407,-219,48,20,1184,95,-63,142,-201,-12',
    '3030559,5983069,0,39,232,-3,21,-335,381,2,-29,190,287,1,14,79,80,41,468,18,-32,524',
    '3036375,5982848,-31,65,-91,-11,-131,326,635,77,188,-16,311,37,41,-120',
    '3033442,5982320,-18,88,175,5,61,0,13,-92,7,424,-46,303,920,19,507,48,31,-12,3,-83,-276,-131,-457,246,267,126,-45,24',
    '3028761,5982173,33,39,-535,129,-1073,760,-99,-70,-114,4,68,40',
    '3033836,5982115,-141,-7,44,-169,1127,-67,374,163,270,36,416,199,17,14,-90,48',
    '3028093,5981716,-253,51,-296,169,-437,95,-153,129,53,20,452,37,-122,91,336,126',
    '3032132,5981621,170,-31,57,-362,-458,-185,-388,199,-368,-6,-386,189,-34,-16,-77,42,-125,18,-192,197',
    '3027671,5981445,855,83,30,15,-56,160,855,96,-10,24',
    '3026417,5981257,-24,128,594,37,353,141,-41,17,-38,-13,-134,69,49,22,192,-91,290,-69,833,187,65,-142,-140,-38,81,-182,-144,-15',
    '3030680,5980767,8,-55,-116,69,225,223,-1386,329,-1,-76,-44,-20,-212,-4,-165,56,-62,-66,87,-43,-74,-69',
    '3037445,5980490,-146,360,13,328,-55,-31,-213,-30,-297,-32,-61,9,-45,-24,-813,-105,-19,-26,79,-195',
    '3035536,5979867,1002,145,-42,87,-82,-10,-69,138,133,16,-139,367,-220,-5,-26,67',
    '3028266,5979765,63,-95,189,25,-158,221,-138,5,-127,46,-232,33,-84,31,-392,60',
    '3029176,5979681,-10,-18,-156,20,-111,-11,-95,-59,-28,5,-25,-42,-474,71,-292,92,-457,70,-91,32,-90,13,3,-41'
  ];
  function routeD(str) {
    var a = str.split(',').map(Number), x = 0, y = 0, d = '';
    for (var i = 0; i < a.length; i += 2) {
      x = i ? x + a[i] : a[i]; y = i ? y + a[i + 1] : a[i + 1];
      var p = P(x / 1e5, y / 1e5);
      d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
    return d;
  }
  function overlayMarkup() {
    var s = '<defs>' + carSym('gl-cy', '#fce000', '#fff3a6', true) + carSym('gl-cw', '#fdfdfb', '#ecebe7', false) + carSym('gl-ck', '#2b2a29', '#444340', false) + carSym('gl-cx', '#fce000', '#ffe86a', true) + '</defs><g id="gl-tx-world">';
    ROUTES.forEach(function (r, k) { s += '<path id="gl-r-' + k + '" d="' + routeD(r) + '" fill="none" stroke="none"/>'; });
    var a = P(30.3150, 59.9360), f = P(30.2625, 59.8003);
    /* пин «3 мин» у Адмиралтейской, как в Яндекс Go */
    s += '<g transform="translate(' + a[0].toFixed(0) + ' ' + a[1].toFixed(0) + ')"><rect x="-2.5" y="-62" width="5" height="62" fill="#e8573d"/><rect x="-32" y="-132" width="64" height="72" rx="20" fill="#e8573d"/>' +
      '<text x="0" y="-92" text-anchor="middle" style="font:800 28px Manrope,Arial,sans-serif;fill:#fff">3</text><text x="0" y="-72" text-anchor="middle" style="font:700 12px Manrope,Arial,sans-serif;fill:#fff">мин</text><circle r="8" fill="#fff" stroke="#e8573d" stroke-width="4"/></g>';
    /* финиш — Пулково */
    s += '<g transform="translate(' + f[0].toFixed(0) + ' ' + f[1].toFixed(0) + ')"><rect x="-2.5" y="-50" width="5" height="50" fill="#21201f"/><circle cx="0" cy="-80" r="32" fill="#21201f"/>' +
      '<path d="M0-100l4 12 13 7v3l-13-3-1 8 5 3v3l-8-2-8 2v-3l5-3-1-8-13 3v-3l13-7z" fill="#fce000"/></g>';
    return s + '<g id="gl-tx-cars"></g></g>';
  }

  /* машины: [маршрут, откуда(0..1), куда(0..1), цвет, смещение окна, полуширина окна (∝ длине маршрута — вдвое медленнее), полоса]; у каждой свой маршрут */
  var FLEET = [
    [0, 0.0, 1.0, 'gl-cy', 0, 0.1139, 1], [1, 0.0, 1.0, 'gl-cx', 0, 0.0477, 1], [2, 1.0, 0.0, 'gl-cw', 0, 0.0727, 1],
    [3, 0.0, 1.0, 'gl-cy', 0, 0.0815, 1], [4, 1.0, 0.0, 'gl-cw', 0, 0.0428, 1], [5, 0.0, 1.0, 'gl-cx', 0, 0.0833, 1],
    [6, 0.0, 1.0, 'gl-cw', 0, 0.0546, 1], [7, 1.0, 0.0, 'gl-cy', 0, 0.0484, 1], [8, 0.0, 1.0, 'gl-cw', 0, 0.0532, 1],
    [9, 0.0, 1.0, 'gl-cx', 0, 0.0485, 1], [10, 0.0, 1.0, 'gl-ck', 0, 0.088, 1], [11, 0.0, 1.0, 'gl-cy', 0, 0.0456, 1],
    [12, 0.0, 1.0, 'gl-cw', 0, 0.0616, 1], [13, 1.0, 0.0, 'gl-cx', 0, 0.0467, 1], [14, 0.0, 1.0, 'gl-ck', 0, 0.0558, 1],
    [15, 0.0, 1.0, 'gl-cy', 0, 0.0376, 1], [16, 1.0, 0.0, 'gl-cw', 0, 0.0426, 1], [17, 1.0, 0.0, 'gl-cx', 0, 0.0576, 1],
    [18, 1.0, 0.0, 'gl-ck', 0, 0.0725, 1], [19, 0.0, 1.0, 'gl-cy', 0, 0.0815, 1], [20, 1.0, 0.0, 'gl-cw', 0, 0.0486, 1],
    [21, 0.0, 1.0, 'gl-cx', 0, 0.0452, 1], [22, 1.0, 0.0, 'gl-ck', 0, 0.0567, 1], [23, 0.0, 1.0, 'gl-cy', 0, 0.053, 1],
    [24, 0.0, 1.0, 'gl-cw', 0, 0.0399, 1], [25, 0.0, 1.0, 'gl-cx', 0, 0.0721, 1], [26, 0.0, 1.0, 'gl-ck', 0, 0.0504, 1],
    [27, 1.0, 0.0, 'gl-cy', 0, 0.0361, 1], [28, 0.0, 1.0, 'gl-cw', 0, 0.0557, 1], [29, 1.0, 0.0, 'gl-cx', 0, 0.0386, 1],
    [30, 1.0, 0.0, 'gl-ck', 0, 0.0655, 1], [31, 0.0, 1.0, 'gl-cy', 0, 0.0692, 1], [32, 1.0, 0.0, 'gl-cw', 0, 0.0342, 1],
    [33, 0.0, 1.0, 'gl-cx', 0, 0.0453, 1], [34, 0.0, 1.0, 'gl-ck', 0, 0.0963, 1], [35, 0.0, 1.0, 'gl-cy', 0, 0.0509, 1],
    [36, 1.0, 0.0, 'gl-cw', 0, 0.0346, 1], [37, 0.0, 1.0, 'gl-cx', 0, 0.0438, 1], [38, 0.0, 1.0, 'gl-ck', 0, 0.085, 1],
    [39, 1.0, 0.0, 'gl-cy', 0, 0.1119, 1], [40, 0.0, 1.0, 'gl-cw', 0, 0.0825, 1], [41, 0.0, 1.0, 'gl-cx', 0, 0.0535, 1],
    [42, 1.0, 0.0, 'gl-ck', 0, 0.0568, 1], [43, 1.0, 0.0, 'gl-cy', 0, 0.0484, 1], [44, 0.0, 1.0, 'gl-cw', 0, 0.1173, 1],
    [45, 1.0, 0.0, 'gl-cx', 0, 0.0529, 1], [46, 1.0, 0.0, 'gl-ck', 0, 0.0498, 1], [47, 1.0, 0.0, 'gl-cy', 0, 0.0375, 1],
    [48, 1.0, 0.0, 'gl-cw', 0, 0.0892, 1], [49, 0.0, 1.0, 'gl-cx', 0, 0.1119, 1], [50, 1.0, 0.0, 'gl-ck', 0, 0.0463, 1],
    [51, 0.0, 1.0, 'gl-cy', 0, 0.0779, 1], [52, 0.0, 1.0, 'gl-cw', 0, 0.0934, 1], [53, 1.0, 0.0, 'gl-cx', 0, 0.0835, 1],
    [54, 0.0, 1.0, 'gl-ck', 0, 0.0536, 1], [55, 0.0, 1.0, 'gl-cy', 0, 0.0468, 1], [56, 0.0, 1.0, 'gl-cw', 0, 0.0519, 1],
    [57, 1.0, 0.0, 'gl-cx', 0, 0.0455, 1], [58, 1.0, 0.0, 'gl-ck', 0, 0.0715, 1], [59, 1.0, 0.0, 'gl-cy', 0, 0.0429, 1],
    [60, 1.0, 0.0, 'gl-cw', 0, 0.0972, 1], [61, 0.0, 1.0, 'gl-cx', 0, 0.0545, 1], [62, 1.0, 0.0, 'gl-ck', 0, 0.0585, 1],
    [63, 1.0, 0.0, 'gl-cy', 0, 0.0498, 1], [64, 1.0, 0.0, 'gl-cw', 0, 0.0687, 1], [65, 0.0, 1.0, 'gl-cx', 0, 0.0404, 1],
    [66, 1.0, 0.0, 'gl-ck', 0, 0.0775, 1], [67, 1.0, 0.0, 'gl-cy', 0, 0.0631, 1], [68, 0.0, 1.0, 'gl-cw', 0, 0.0645, 1],
    [69, 1.0, 0.0, 'gl-cx', 0, 0.0538, 1], [70, 0.0, 1.0, 'gl-ck', 0, 0.0362, 1], [71, 1.0, 0.0, 'gl-cy', 0, 0.0409, 1]
  ];

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
    '.gl-tx-task{border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;max-width:360px;min-height:56px;margin-top:20px;padding:0 24px;border-radius:18px;background:#fce000;color:#21201f;font:500 18px/1.2 var(--f-body);text-decoration:none;text-align:center;transition:background .15s,transform .1s}.gl-tx-task:hover{background:#ffd21e}.gl-tx-task:active{transform:scale(.98)}.gl-tx-task:focus-visible{outline:2px solid #21201f;outline-offset:3px}' +
    '.gl-tx-box{display:grid;gap:10px;width:100%;max-width:360px;margin-top:12px;font:400 15px/1.35 var(--f-body);color:#21201f}.gl-tx-box input{box-sizing:border-box;width:100%;min-height:48px;padding:0 16px;border:2px solid #ebe9e3;border-radius:16px;background:#fff;color:#21201f;font:inherit}.gl-tx-box input:focus{outline:none;border-color:#fce000}.gl-tx-box .gl-tx-go{min-height:48px;border:0;border-radius:16px;background:#21201f;color:#fff;font:500 16px/1 var(--f-body);cursor:pointer}.gl-tx-box .gl-tx-go:disabled{opacity:.5;cursor:default}.gl-tx-box .gl-tx-msg{color:#6f6e69}.gl-tx-box .gl-tx-open{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:16px;background:#21201f;color:#fff;font:500 16px/1 var(--f-body);text-decoration:none}' +
    '.gl-tx-rate{position:absolute;z-index:3;display:flex;align-items:center;gap:9px;background:#21201f;color:#fff;border-radius:18px;padding:9px 16px 9px 12px;box-shadow:0 8px 22px rgba(33,32,31,.28)}' +
    '@media (max-width:560px){details.sec{padding:18px}}';
  var BTN_CSS = '.gl-tx-btn{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:#21201f;border-radius:16px;padding:6px 8px;cursor:pointer;height:34px;opacity:.38;filter:grayscale(1);transition:opacity .2s,filter .2s}.gl-tx-btn:hover{opacity:.7}.gl-tx-btn svg{width:34px;height:auto}.gl-tx-btn[aria-pressed="true"]{opacity:1;filter:none;background:#21201f;padding:6px 12px}.gl-tx-btn[aria-pressed="true"] svg{width:46px}.gl-tx-btn:focus-visible{outline:2px solid #21201f;outline-offset:2px}';

  /* ---------- тексты под вакансию «Менеджер по развитию бизнеса в Такси (СПб)» — только в режиме «Такси» ---------- */
  var TASK_API = 'https://resume-admin.ukeityrjd.workers.dev';   /* тот же Worker, что и у админки */
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
  /* ---------- «Тестовое задание»: доступ по подтверждению в Telegram ---------- */
  var taskTimer = null;
  function stopTaskPoll() { if (taskTimer) { clearInterval(taskTimer); taskTimer = null; } }
  function taskApi(path, opt) {
    opt = opt || {};
    return fetch(TASK_API + path, { method: opt.method || 'GET', headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); });
  }
  function toggleTaskBox(btn) {
    var old = SR.querySelector('.gl-tx-box');
    if (old) { old.remove(); stopTaskPoll(); return; }
    var box = document.createElement('div'); box.className = 'gl-tx-box';
    box.innerHTML = '<span class="gl-tx-msg">Тестовое задание открывается после подтверждения в Telegram. Представьтесь, пожалуйста.</span>' +
      '<input type="text" maxlength="80" placeholder="Имя и компания" aria-label="Имя и компания" autocomplete="organization">' +
      '<button type="button" class="gl-tx-go">Запросить доступ</button>';
    btn.insertAdjacentElement('afterend', box);
    var inp = box.querySelector('input'), go = box.querySelector('.gl-tx-go'), msg = box.querySelector('.gl-tx-msg');
    inp.focus();
    function fail(t) { stopTaskPoll(); msg.textContent = t; go.disabled = false; go.textContent = 'Запросить ещё раз'; inp.disabled = false; }
    function send() {
      var name = inp.value.trim();
      if (name.length < 2) { msg.textContent = 'Напишите имя и компанию.'; inp.focus(); return; }
      go.disabled = true; inp.disabled = true; msg.textContent = 'Отправляю запрос…';
      taskApi('/task/start', { method: 'POST', body: { name: name } }).then(function (r) {
        if (r.status === 429) throw new Error('Слишком много запросов. Попробуйте через 10 минут или напишите мне в Telegram.');
        if (r.status !== 200) throw new Error('Не удалось отправить запрос. Напишите мне в Telegram.');
        var id = r.json.id, secret = r.json.secret, until = Date.now() + (r.json.ttl || 300) * 1000;
        msg.textContent = 'Запрос отправлен. Как только я подтвержу его в Telegram, здесь появится ссылка. Страницу можно не закрывать.';
        go.hidden = true; stopTaskPoll();
        taskTimer = setInterval(function () {
          if (Date.now() > until) { go.hidden = false; fail('Время ожидания вышло. Запросите ещё раз или напишите мне в Telegram.'); return; }
          taskApi('/task/poll?id=' + encodeURIComponent(id) + '&secret=' + encodeURIComponent(secret)).then(function (p) {
            var st = p.json.status;
            if (st === 'approved' && /^https:\/\//.test(p.json.url || '')) {
              stopTaskPoll(); msg.textContent = 'Доступ открыт.';
              var a = document.createElement('a'); a.className = 'gl-tx-open'; a.href = p.json.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Открыть презентацию';
              box.appendChild(a);
            } else if (st === 'denied') { go.hidden = false; fail('В доступе отказано. Если это ошибка, напишите мне в Telegram.'); }
            else if (st === 'expired') { go.hidden = false; fail('Запрос устарел. Запросите ещё раз.'); }
          }).catch(function () { });
        }, 2000);
      }).catch(function (e) { fail(e.message || 'Ошибка сети'); });
    }
    go.addEventListener('click', send);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  }
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
    var task = SR.querySelector('.gl-tx-task'), hl = SR.querySelector('.hl');
    if (v && hl && !task) {
      task = document.createElement('a'); task.href = 'taxi-test.html'; task.className = 'gl-tx-task'; task.textContent = 'Тестовое задание';
      hl.insertAdjacentElement('afterend', task);
    }
    if (!v && task) { var bx = SR.querySelector('.gl-tx-box'); if (bx) bx.remove(); stopTaskPoll(); task.remove(); }
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
  if (!HOST) { on = true; document.documentElement.classList.add('gl-taxi'); build(); return; }
  var tries = 0;
  (function wait() { if (!init() && tries++ < 100) setTimeout(wait, 100); })();
})();
