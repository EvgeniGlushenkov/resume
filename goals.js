/* Цели Яндекс.Метрики (счётчик 113666205): клики по контактам и всем кликабельным элементам.
   Подключается на всех публичных страницах после кода счётчика. Работает и внутри shadow DOM (resume.html).
   Каждый клик отправляет btn_any + одну конкретную цель (список ниже) с параметрами {page, goal, label, href}. */
(function () {
  'use strict';
  var ID = 113666205;
  var CONTACT = { phone: 'contact_phone', email: 'contact_email', telegram: 'contact_telegram' };

  function send(goal, p) {
    try { if (typeof window.ym === 'function') window.ym(ID, 'reachGoal', goal, p); } catch (e) {}
  }
  window.EGGoal = send;

  function page() {
    var f = location.pathname.split('/').pop() || 'index.html';
    return f.replace(/\.html$/, '');
  }
  function label(el) {
    var t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 60);
  }
  function contactType(el, href) {
    var k = el.getAttribute('data-eg-contact') || el.getAttribute('data-rv');
    if (k) return k;
    if (el.hasAttribute('data-eg-open') || el.getAttribute('data-act') === 'tg') return 'telegram';
    if (/^tel:/i.test(href)) return 'phone';
    if (/^mailto:/i.test(href) && !/subject=/i.test(href)) return 'email';
    if (/^https?:\/\/t\.me\/[^/?]+$/i.test(href)) return 'telegram';
    return '';
  }

  function classify(el) {
    var href = el.getAttribute('href') || '';
    var cls = ' ' + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '') + ' ';
    var act = el.getAttribute('data-act') || '';
    var ct = contactType(el, href);
    if (ct) return CONTACT[ct] || 'contact_other';
    if (el.closest && el.closest('.egp-box')) return 'btn_captcha';
    if (href === '#eg-contact') return 'btn_contact';
    if (act === 'pdf' || /\.pdf($|\?)/i.test(href)) return 'btn_pdf';
    if (act === 'share' || el.hasAttribute('data-sh')) return 'btn_share';
    if (/hh\.ru\/resume\//i.test(href) || cls.indexOf(' hh ') > -1) return 'btn_hh';
    if (el.hasAttribute('data-ver') || el.hasAttribute('data-mode') || el.hasAttribute('data-set')) return 'btn_resume_view';
    if (cls.indexOf(' gl-tx-go ') > -1) return 'btn_taxi_access';
    if (cls.indexOf(' gl-tx-open ') > -1) return 'btn_taxi_presentation';
    if (cls.indexOf(' gl-tx-btn ') > -1) return 'btn_taxi_mode';
    if (/(^|\/)(test-yandex-taxi|taxi-test[\w-]*)\.html/i.test(href)) return 'btn_taxi_test';
    if (/(^|\/)resume(-en|-zh)?\.html/i.test(href)) return 'btn_resume';
    if (/(^|\/)(index|en|zh)\.html$/i.test(href) && el.closest && el.closest('[class*="lang"]')) return 'btn_lang';
    if (/(^|\/)(index|en|zh)\.html$/i.test(href)) return 'btn_home';
    if (/^https?:/i.test(href) && href.indexOf(location.host) < 0) return 'btn_outbound';
    if (el.tagName === 'SUMMARY' || el.hasAttribute('aria-expanded')) return 'btn_expand';
    if (href.charAt(0) === '#') return 'btn_nav';
    return 'btn_other';
  }

  var SEL = 'a,button,summary,[role="button"],[data-eg-contact],[data-eg-open]';
  function onClick(e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    var el = null;
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.nodeType === 1 && n.matches && n.matches(SEL)) { el = n; break; }
    }
    if (!el) return;
    var goal = classify(el);
    var p = { page: page(), goal: goal, label: label(el), href: (el.getAttribute('href') || '').slice(0, 120) };
    if (goal.indexOf('contact_') === 0) {
      p.state = (el.hasAttribute('data-eg-contact') || el.getAttribute('href') === '#' || el.hasAttribute('data-eg-open') || el.getAttribute('data-act') === 'tg') ? 'hidden' : 'open';
      send('contact_any', p);
    }
    send(goal, p);
    send('btn_any', p);
  }
  window.addEventListener('click', onClick, true);
})();
