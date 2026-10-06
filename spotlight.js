/* Spotlight effect: a solid #9859e6 circle the size of 3 capital letters follows the cursor
   and lights up the letter shapes. Works in the hero block and in the "who I am",
   "how I help" and "ready to talk" blocks. Same logic on all language versions.
   Self-contained: injects its own CSS. */
(function () {
  if (!window.matchMedia || window.matchMedia('(hover: none)').matches) return;
  var d = document;
  var lang = (d.documentElement.lang || 'ru').toLowerCase();
  var capChar = lang.indexOf('ru') === 0 ? '\u041d' : 'H';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TEXT = [
    '.eg-q9p__hero-label', '.eg-q9p__hero-name', '.eg-q9p__accent-blue', '.eg-q9p__accent-green', '.eg-q9p__hero-desc',
    '.eg-q9p__section-eyebrow:not(.eg-q9p__section-eyebrow--solo)', '.eg-q9p__section-title', '.eg-q9p__intro-text',
    '.eg-q9p__contact-eyebrow', '.eg-q9p__contact-title', '.eg-q9p__contact-title em', '.eg-q9p__contact-text'
  ].join(',');

  var css =
    '@supports (-webkit-background-clip:text) or (background-clip:text){' +
    '.eg-q9p .eg-hl{--r:0px;--mx:-9999px;--my:-9999px;--base:var(--text);--hl:#9859e6;' +
    'background-image:radial-gradient(circle max(var(--r),.01px) at var(--mx) var(--my),var(--hl) 0,var(--hl) 100%,transparent 100%),linear-gradient(var(--base),var(--base));' +
    '-webkit-background-clip:text;background-clip:text;' +
    '-webkit-text-fill-color:transparent;color:transparent}' +
    '.eg-q9p .eg-hl.eg-q9p__hero-label,.eg-q9p .eg-hl.eg-q9p__section-eyebrow,.eg-q9p .eg-hl.eg-q9p__contact-eyebrow{--base:var(--muted)}' +
    '.eg-q9p .eg-hl.eg-q9p__accent-blue{--base:var(--blue)}' +
    '.eg-q9p .eg-hl.eg-q9p__accent-green,.eg-q9p .eg-hl.eg-q9p__contact-title em{--base:var(--green)}' +
    '}';
  var st = d.createElement('style');
  st.textContent = css;
  d.head.appendChild(st);

  function Block(root, titleSel) {
    var self = this;
    this.root = root;
    this.title = root.querySelector(titleSel);
    this.els = Array.prototype.slice.call(root.querySelectorAll(TEXT));
    this.radius = 0;
    this.tx = 0; this.ty = 0; this.cx = 0; this.cy = 0; this.tr = 0; this.cr = 0;
    this.raf = null; this.first = true;

    this.calc = function () {
      if (!self.title) return;
      var cs = getComputedStyle(self.title);
      var ctx = d.createElement('canvas').getContext('2d');
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      self.radius = ctx.measureText(capChar).width * 3 / 2;
    };
    this.paint = function () {
      self.els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (self.cx - r.left) + 'px');
        el.style.setProperty('--my', (self.cy - r.top) + 'px');
        el.style.setProperty('--r', self.cr + 'px');
      });
    };
    this.tick = function () {
      var k = reduce ? 1 : 0.2;
      self.cx += (self.tx - self.cx) * k;
      self.cy += (self.ty - self.cy) * k;
      self.cr += (self.tr - self.cr) * k;
      self.paint();
      var moving = Math.abs(self.tx - self.cx) > 0.4 || Math.abs(self.ty - self.cy) > 0.4 || Math.abs(self.tr - self.cr) > 0.4;
      if (moving) {
        self.raf = requestAnimationFrame(self.tick);
      } else {
        self.cx = self.tx; self.cy = self.ty; self.cr = self.tr; self.paint(); self.raf = null;
      }
    };
    this.kick = function () { if (!self.raf) self.raf = requestAnimationFrame(self.tick); };

    root.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      self.tx = e.clientX; self.ty = e.clientY; self.tr = self.radius;
      if (self.first) { self.cx = self.tx; self.cy = self.ty; self.first = false; }
      self.kick();
    });
    root.addEventListener('pointerleave', function () { self.tr = 0; self.kick(); });
    window.addEventListener('scroll', function () { if (self.cr > 0.5) self.paint(); }, { passive: true });
    window.addEventListener('resize', self.calc);
  }

  var blocks = [];
  function addBlock(sel, titleSel) {
    Array.prototype.forEach.call(d.querySelectorAll(sel), function (root) {
      if (root.querySelector(titleSel)) blocks.push(new Block(root, titleSel));
    });
  }

  function init() {
    addBlock('.eg-q9p__hero-content', '.eg-q9p__hero-name');
    addBlock('.eg-q9p__section', '.eg-q9p__section-title');
    addBlock('.eg-q9p__contact', '.eg-q9p__contact-title');
    blocks.forEach(function (b) { b.calc(); });
    mark();
    // landing.js replaces headings after load (innerHTML). The old nodes lose the eg-hl class and the new
    // ones would inherit a transparent text fill from the parent, so the coloured words turn black.
    // Re-mark whenever the page text is rewritten.
    if (window.MutationObserver) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; mark(); });
      }).observe(d.body, { childList: true, subtree: true });
    }
  }

  function mark() {
    blocks.forEach(function (b) {
      b.els = Array.prototype.slice.call(b.root.querySelectorAll(TEXT));
      b.els.forEach(function (el) { if (!el.classList.contains('eg-hl')) el.classList.add('eg-hl'); });
    });
  }

  if (d.fonts && d.fonts.ready) {
    d.fonts.ready.then(init);
  } else {
    init();
  }
})();
