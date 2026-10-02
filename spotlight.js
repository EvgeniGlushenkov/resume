/* Spotlight effect for the hero block: a solid #9859e6 circle the size of 3 capital letters
   follows the cursor and lights up the letter shapes. Same size on all language versions.
   Self-contained: injects its own CSS. */
(function () {
  if (!window.matchMedia || window.matchMedia('(hover: none)').matches) return;
  var hero = document.querySelector('.eg-q9p__hero-content');
  var name = document.querySelector('.eg-q9p__hero-name');
  if (!hero || !name) return;

  var lang = (document.documentElement.lang || 'ru').toLowerCase();
  var isRu = lang.indexOf('ru') === 0;

  var els = Array.prototype.slice.call(hero.querySelectorAll(
    '.eg-q9p__hero-label, .eg-q9p__hero-name, .eg-q9p__accent-blue, .eg-q9p__accent-green, .eg-q9p__hero-desc'
  ));

  var css =
    '@supports (-webkit-background-clip:text) or (background-clip:text){' +
    '.eg-q9p .eg-hl{--r:0px;--mx:-9999px;--my:-9999px;--base:var(--text);--hl:#9859e6;' +
    'background-image:radial-gradient(circle max(var(--r),.01px) at var(--mx) var(--my),var(--hl) 0,var(--hl) 100%,transparent 100%),linear-gradient(var(--base),var(--base));' +
    '-webkit-background-clip:text;background-clip:text;' +
    '-webkit-text-fill-color:transparent;color:transparent}' +
    '.eg-q9p .eg-hl.eg-q9p__hero-label{--base:var(--muted)}' +
    '.eg-q9p .eg-hl.eg-q9p__accent-blue{--base:var(--blue)}' +
    '.eg-q9p .eg-hl.eg-q9p__accent-green{--base:var(--green)}' +
    '.eg-q9p .eg-hl.eg-q9p__hero-desc{--base:var(--text)}' +
    '}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var radius = 0;
  function calcRadius() {
    var cs = getComputedStyle(name);
    var ctx = document.createElement('canvas').getContext('2d');
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var capW = ctx.measureText(isRu ? '\u041d' : 'H').width;
    radius = capW * 3 / 2;
  }
  function init() {
    calcRadius();
    els.forEach(function (el) { el.classList.add('eg-hl'); });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(init);
  } else {
    init();
  }
  window.addEventListener('resize', calcRadius);

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tx = 0, ty = 0, cx = 0, cy = 0, tr = 0, cr = 0, raf = null, first = true;

  function paint() {
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (cx - r.left) + 'px');
      el.style.setProperty('--my', (cy - r.top) + 'px');
      el.style.setProperty('--r', cr + 'px');
    });
  }
  function tick() {
    var k = reduce ? 1 : 0.2;
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
    cr += (tr - cr) * k;
    paint();
    var moving = Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4 || Math.abs(tr - cr) > 0.4;
    if (moving) {
      raf = requestAnimationFrame(tick);
    } else {
      cx = tx; cy = ty; cr = tr; paint(); raf = null;
    }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  hero.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    tx = e.clientX; ty = e.clientY; tr = radius;
    if (first) { cx = tx; cy = ty; first = false; }
    kick();
  });
  hero.addEventListener('pointerleave', function () {
    tr = 0; kick();
  });
  window.addEventListener('scroll', function () { if (cr > 0.5) { paint(); } }, { passive: true });
})();
