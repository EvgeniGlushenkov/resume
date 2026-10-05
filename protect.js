/* Protection layer (deterrent only): contact veil + math captcha, anti-copy, notices.
   Contact data is never stored in plain text in the HTML. Unlock lasts until the page is reloaded or left. */
(function () {
  'use strict';
  var d = document;
  var L = (d.documentElement.lang || 'ru').toLowerCase().slice(0, 2);
  var ALL = {
    ru: { t: 'Проверка', s: 'Решите пример, чтобы увидеть контакты', qa: 'Сколько будет ', p: 'Ответ', ok: 'Показать', no: 'Закрыть', er: 'Неверно. Попробуйте ещё раз', cp: 'Копирование отключено' },
    en: { t: 'Verification', s: 'Solve the sum to reveal the contact details', qa: 'What is ', p: 'Answer', ok: 'Show', no: 'Close', er: 'Wrong answer. Try again', cp: 'Copying is disabled' },
    zh: { t: '验证', s: '请完成计算以查看联系方式', qa: '计算：', p: '答案', ok: '显示', no: '关闭', er: '答案不对，请再试一次', cp: '已禁用复制' }
  };
  var TX = ALL[L] || ALL.ru;

  /* ---------- contact data (reversed + base64) ---------- */
  function dec(s) { try { return atob(s).split('').reverse().join(''); } catch (e) { return ''; } }
  var C = {
    phone: ['NjItMDYtMzU5ICkxMTkoIDcr', 'NjIwNjM1OTExOTcr'],
    email: ['dXIubGlhbUB2b2tuZWhzdWxnaW5lZ3Zl'],
    telegram: ['dm9rbmVoc3VsR2luZWd2RQ==']
  };
  function val(k) {
    if (k === 'phone') return { text: dec(C.phone[0]), href: 'tel:' + dec(C.phone[1]) };
    if (k === 'email') { var e = dec(C.email[0]); return { text: e, href: 'mailto:' + e }; }
    var t = dec(C.telegram[0]);
    return { text: '@' + t, href: 'https://t.me/' + t, blank: true };
  }

  var UNL = false;
  function unlocked() { return UNL; }
  function unlock() { UNL = true; }

  /* ---------- styles ---------- */
  var css =
    'html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
    'input,textarea{-webkit-user-select:text;user-select:text}' +
    'img{-webkit-user-drag:none;user-drag:none}' +
    '@media print{html{display:none!important}}' +
    '.eg-veil{filter:blur(7px);-webkit-user-select:none;user-select:none;pointer-events:none;transition:filter .35s ease}' +
    '.eg-hint{font-family:"DM Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6a6c66;margin-top:auto}' +
    'a[data-eg-contact],a[data-eg-open]{cursor:pointer}' +
    '.egp-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(18,20,15,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:egpf .2s ease}' +
    '@keyframes egpf{from{opacity:0}to{opacity:1}}' +
    '@keyframes egps{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}' +
    '.egp-box{box-sizing:border-box;width:100%;max-width:420px;background:#fff;border:1px solid #e7e7e3;border-radius:24px;padding:32px;box-shadow:0 30px 80px rgba(18,20,15,.25);font-family:"Manrope","Noto Sans SC","Helvetica Neue",Arial,sans-serif;color:#12140f}' +
    '.egp-box.shake{animation:egps .35s ease}' +
    '.egp-eb{font:500 11px/1 "DM Mono",ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;color:#6a6c66}' +
    '.egp-q{margin:18px 0 6px;font-weight:800;font-size:46px;line-height:1;letter-spacing:-.04em}' +
    '.egp-s{margin:0 0 20px;font-size:15px;line-height:1.45;color:#6a6c66}' +
    '.egp-in{box-sizing:border-box;width:100%;border:1px solid #e7e7e3;border-radius:999px;padding:14px 20px;font:700 18px "Manrope",sans-serif;color:#12140f;background:#f8f8f6;outline:0}' +
    '.egp-in:focus{border-color:#9859e6}' +
    '.egp-er{min-height:18px;margin-top:10px;font-size:13px;color:#b3261e}' +
    '.egp-row{display:flex;gap:10px;margin-top:10px}' +
    '.egp-b{flex:1;border-radius:999px;padding:13px 18px;font:500 11px/1 "DM Mono",ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;border:1px solid #12140f;background:#12140f;color:#f8f8f6;transition:transform .2s ease,background .2s ease}' +
    '.egp-b.g{background:transparent;color:#12140f;border-color:#e7e7e3}' +
    '.egp-b:hover{transform:translateY(-2px);background:#9859e6;border-color:#9859e6;color:#fff}';
  var st = d.createElement('style');
  st.id = 'egp-css';
  st.textContent = css;
  d.head.appendChild(st);

  /* ---------- captcha: sum of two numbers, result up to 100 ---------- */
  function pair() {
    var a = 5 + Math.floor(Math.random() * 86);
    var b = 5 + Math.floor(Math.random() * (96 - a));
    return [a, b];
  }
  var open = false;
  function ask(cb) {
    if (unlocked()) { cb(); return; }
    if (open) return;
    open = true;
    var p = pair();
    var ans = String(p[0] + p[1]);
    var prev = d.activeElement;

    var ov = d.createElement('div'); ov.className = 'egp-ov';
    var box = d.createElement('div'); box.className = 'egp-box';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', TX.qa + p[0] + ' + ' + p[1] + '?');
    var eb = d.createElement('div'); eb.className = 'egp-eb'; eb.textContent = TX.t;
    var q = d.createElement('div'); q.className = 'egp-q'; q.textContent = p[0] + ' + ' + p[1] + ' = ?';
    var s = d.createElement('p'); s.className = 'egp-s'; s.textContent = TX.s;
    var inp = d.createElement('input'); inp.className = 'egp-in'; inp.type = 'text';
    inp.inputMode = 'numeric'; inp.autocomplete = 'off'; inp.placeholder = TX.p; inp.maxLength = 3;
    var er = d.createElement('div'); er.className = 'egp-er'; er.setAttribute('aria-live', 'polite');
    var row = d.createElement('div'); row.className = 'egp-row';
    var bn = d.createElement('button'); bn.type = 'button'; bn.className = 'egp-b g'; bn.textContent = TX.no;
    var by = d.createElement('button'); by.type = 'button'; by.className = 'egp-b'; by.textContent = TX.ok;
    row.appendChild(bn); row.appendChild(by);
    [eb, q, s, inp, er, row].forEach(function (x) { box.appendChild(x); });
    ov.appendChild(box); d.body.appendChild(ov);
    setTimeout(function () { inp.focus(); }, 30);

    function close() {
      open = false;
      d.removeEventListener('keydown', onKey, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (prev && prev.focus) try { prev.focus(); } catch (e) {}
    }
    function submit() {
      if (inp.value.trim() === ans) { unlock(); close(); cb(); return; }
      er.textContent = TX.er; inp.value = '';
      box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      p = pair();
      ans = String(p[0] + p[1]);
      q.textContent = p[0] + ' + ' + p[1] + ' = ?';
      box.setAttribute('aria-label', TX.qa + p[0] + ' + ' + p[1] + '?');
      inp.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter' && d.activeElement === inp) { e.preventDefault(); submit(); }
    }
    d.addEventListener('keydown', onKey, true);
    by.addEventListener('click', submit);
    bn.addEventListener('click', close);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
  }

  /* ---------- reveal ---------- */
  function reveal() {
    Array.prototype.forEach.call(d.querySelectorAll('[data-eg-contact]'), function (el) {
      var v = val(el.getAttribute('data-eg-contact'));
      var vv = el.querySelector('.eg-veil');
      if (vv) { vv.textContent = v.text; vv.classList.remove('eg-veil'); }
      var h = el.querySelector('.eg-hint');
      if (h && h.parentNode) h.parentNode.removeChild(h);
      el.setAttribute('href', v.href);
      if (v.blank) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      el.removeAttribute('data-eg-contact');
      el.removeAttribute('role');
    });
  }
  d.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-eg-contact],[data-eg-open]') : null;
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute('data-eg-open')) {
      ask(function () { var v = val('telegram'); window.open(v.href, '_blank', 'noopener'); });
    } else {
      ask(reveal);
    }
  });
  d.addEventListener('keydown', function (e) {
    var t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.hasAttribute && t.hasAttribute('data-eg-contact')) {
      e.preventDefault(); ask(reveal);
    }
  });

  window.EGP = { ask: ask, val: val, unlocked: unlocked };

  /* ---------- anti-copy (deterrent) ---------- */
  function inField(t) { return t && t.closest && t.closest('input,textarea'); }
  ['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach(function (ev) {
    d.addEventListener(ev, function (e) {
      if (inField(e.target)) return;
      e.preventDefault();
      if (ev === 'copy' && e.clipboardData) e.clipboardData.setData('text/plain', TX.cp);
    }, true);
  });
  d.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var m = e.ctrlKey || e.metaKey;
    if (e.key === 'F12' ||
        (m && 'usp'.indexOf(k) > -1 && k.length === 1) ||
        (m && 'cxa'.indexOf(k) > -1 && k.length === 1 && !inField(e.target)) ||
        (m && e.shiftKey && 'ijc'.indexOf(k) > -1 && k.length === 1)) {
      e.preventDefault();
    }
  }, true);
})();
