/* Генератор PDF резюме — без внешних библиотек.
   Строит обычный текстовый PDF (A4, шрифт Carlito с кириллицей, ссылки, текст копируется и читается ATS).
   Браузер:  GLPDF.download({data, version, mode, contacts, fontBase})
   Node:     GLPDF.render(blocks, fonts, opts)  — используется в тестах.
   Шрифты Carlito (SIL OFL 1.1) лежат рядом: fonts/Carlito-*-sub.ttf */
(function (root) {
  'use strict';

  /* ---------------- разбор TTF ---------------- */
  function parseTTF(buf) {
    var dv = new DataView(buf), n = dv.getUint16(4), T = {}, i, o = 12;
    for (i = 0; i < n; i++, o += 16) {
      var tag = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
      T[tag] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
    }
    var head = T.head.off, hhea = T.hhea.off;
    var upm = dv.getUint16(head + 18);
    var f = {
      buf: buf, upm: upm,
      bbox: [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)],
      ascent: dv.getInt16(hhea + 4), descent: dv.getInt16(hhea + 6),
      nHM: dv.getUint16(hhea + 34), numGlyphs: dv.getUint16(T.maxp.off + 4),
      cap: Math.round(upm * 0.63)
    };
    if (T['OS/2'] && dv.getUint16(T['OS/2'].off) >= 2) f.cap = dv.getInt16(T['OS/2'].off + 88) || f.cap;
    /* ширины */
    f.adv = function (gid) {
      var k = gid < f.nHM ? gid : f.nHM - 1;
      return dv.getUint16(T.hmtx.off + k * 4);
    };
    /* cmap: формат 4 (BMP) */
    var cm = T.cmap.off, nt = dv.getUint16(cm + 2), sub = -1;
    for (i = 0; i < nt; i++) {
      var pid = dv.getUint16(cm + 4 + i * 8), eid = dv.getUint16(cm + 6 + i * 8), so = dv.getUint32(cm + 8 + i * 8);
      if ((pid === 3 && eid === 1) || (pid === 0 && dv.getUint16(cm + so) === 4)) { sub = cm + so; if (pid === 3) break; }
    }
    if (sub < 0 || dv.getUint16(sub) !== 4) throw new Error('cmap format 4 not found');
    var segX2 = dv.getUint16(sub + 6), seg = segX2 / 2;
    var endO = sub + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    f.gid = function (cp) {
      for (var s = 0; s < seg; s++) {
        if (cp <= dv.getUint16(endO + s * 2)) {
          var st = dv.getUint16(startO + s * 2);
          if (cp < st) return 0;
          var ro = dv.getUint16(rangeO + s * 2), dl = dv.getInt16(deltaO + s * 2);
          if (ro === 0) return (cp + dl) & 0xffff;
          var g = dv.getUint16(rangeO + s * 2 + ro + (cp - st) * 2);
          return g === 0 ? 0 : (g + dl) & 0xffff;
        }
      }
      return 0;
    };
    return f;
  }

  /* ---------------- вспомогательное ---------------- */
  function hex4(n) { return ('0000' + n.toString(16)).slice(-4); }
  function pdfStr(s) { // ASCII-строка для литералов
    return '(' + String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?') + ')';
  }
  function utf16hex(s) { var h = 'FEFF'; for (var i = 0; i < s.length; i++) h += hex4(s.charCodeAt(i)); return '<' + h + '>'; }
  function fix(s) {
    return String(s == null ? '' : s)
      .replace(/\s*\[уточнить[^\]]*\]/gi, '')
      .replace(/₽/g, 'руб.').replace(/✓/g, '+')
      .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
      .replace(/\u00a0/g, ' ');
  }
  function num(x) { return (Math.round(x * 100) / 100).toString(); }

  /* ---------------- отрисовка блоков в PDF ---------------- */
  /* блок: {k:'text', f:'r'|'b', size, color:[r,g,b], text, indent, bullet, after, before, lh, link, keepNext}
           {k:'rule', color, after, before} | {k:'gap', h} */
  function render(blocks, fonts, opts) {
    opts = opts || {};
    var PW = 595.28, PH = 841.89, M = opts.margin || 44, TOP = M, BOT = M + 6, W = PW - 2 * M;
    var F = { r: parseTTF(fonts.r), b: parseTTF(fonts.b) };
    var used = { r: {}, b: {} };
    var pages = [], cur = null, y = 0, ann = [];

    function newPage() { cur = { ops: [], ann: [] }; pages.push(cur); y = PH - TOP; }
    function width(font, s, size) {
      var f = F[font], w = 0;
      for (var i = 0; i < s.length; i++) w += f.adv(f.gid(s.charCodeAt(i)));
      return w * size / f.upm;
    }
    function enc(font, s) {
      var f = F[font], h = '';
      for (var i = 0; i < s.length; i++) {
        var cp = s.charCodeAt(i), g = f.gid(cp);
        if (!g && cp !== 0x20) { cp = 0x3f; g = f.gid(cp); }
        used[font][g] = cp; h += hex4(g);
      }
      return '<' + h + '>';
    }
    function col(c) { return num(c[0] / 255) + ' ' + num(c[1] / 255) + ' ' + num(c[2] / 255); }
    function wrap(font, text, size, maxW) {
      var out = [], paras = text.split('\n');
      paras.forEach(function (p) {
        var words = p.split(/ +/).filter(function (x) { return x.length; }), line = '', lw = 0, sp = width(font, ' ', size);
        if (!words.length) { out.push(''); return; }
        words.forEach(function (wd) {
          var ww = width(font, wd, size);
          while (ww > maxW) { // слишком длинное слово — режем по символам
            if (line) { out.push(line); line = ''; lw = 0; }
            var k = wd.length; while (k > 1 && width(font, wd.slice(0, k), size) > maxW) k--;
            out.push(wd.slice(0, k)); wd = wd.slice(k); ww = width(font, wd, size);
          }
          if (!line) { line = wd; lw = ww; }
          else if (lw + sp + ww <= maxW) { line += ' ' + wd; lw += sp + ww; }
          else { out.push(line); line = wd; lw = ww; }
        });
        if (line) out.push(line);
      });
      return out;
    }

    newPage();
    blocks.forEach(function (b) {
      if (b.k === 'gap') { y -= b.h; return; }
      if (b.k === 'rule') {
        y -= (b.before || 0);
        if (y - 2 < BOT) newPage();
        cur.ops.push(col(b.color || [200, 200, 195]) + ' RG ' + num(b.w || 0.6) + ' w ' + num(M) + ' ' + num(y) + ' m ' + num(PW - M) + ' ' + num(y) + ' l S');
        y -= (b.after || 0);
        return;
      }
      var size = b.size || 10, lh = (b.lh || 1.32) * size, ind = b.indent || 0, font = b.f || 'r';
      var lines = wrap(font, fix(b.text), size, W - ind);
      y -= (b.before || 0);
      var need = lh * Math.min(lines.length, b.keepNext ? lines.length : 2) + (b.keepNext || 0);
      if (y - need < BOT) newPage();
      lines.forEach(function (ln, idx) {
        if (y - lh < BOT) newPage();
        y -= lh;
        var x = M + ind, base = y + lh * 0.24;
        if (b.bullet && idx === 0) {
          cur.ops.push('BT ' + col(b.color || [0, 0, 0]) + ' rg /F1 ' + num(size) + ' Tf ' + num(M + ind - 10) + ' ' + num(base) + ' Td ' + enc('r', '\u2022') + ' Tj ET');
        }
        if (ln) {
          cur.ops.push('BT ' + col(b.color || [18, 20, 15]) + ' rg /' + (font === 'b' ? 'F2' : 'F1') + ' ' + num(size) + ' Tf ' + num(x) + ' ' + num(base) + ' Td ' + enc(font, ln) + ' Tj ET');
          if (b.link) {
            var lw = width(font, ln, size);
            cur.ann.push({ rect: [x, base - size * 0.2, x + lw, base + size * 0.85], uri: b.link });
          }
        }
      });
      y -= (b.after || 0);
    });

    /* ---------- сборка объектов PDF ---------- */
    var objs = [], streams = {};
    function add(body) { objs.push(body); return objs.length; }
    function reserve() { objs.push(null); return objs.length; }
    var catalog = reserve(), pagesRoot = reserve();
    var fontObjs = {};
    var deflate = opts.deflate; // async (Uint8Array)->Uint8Array, необязателен

    function enc8(s) { var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }
    var chunks = [], pos = 0, offsets = [];
    function push(u8) { chunks.push(u8); pos += u8.length; }
    function pushStr(s) { push(enc8(s)); }

    function toUnicodeCMap(map) {
      var gids = Object.keys(map).map(Number).sort(function (a, b) { return a - b; });
      var s = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n';
      for (var i = 0; i < gids.length; i += 100) {
        var part = gids.slice(i, i + 100);
        s += part.length + ' beginbfchar\n' + part.map(function (g) { return '<' + hex4(g) + '> <' + hex4(map[g]) + '>'; }).join('\n') + '\nendbfchar\n';
      }
      return s + 'endcmap CMapName currentdict /CMap defineresource pop end end';
    }

    var fontDefs = []; // для финальной записи
    ['r', 'b'].forEach(function (k) {
      var f = F[k], name = (k === 'r' ? 'Carlito-Regular' : 'Carlito-Bold'), gids = Object.keys(used[k]).map(Number).sort(function (a, b) { return a - b; });
      var Wd = gids.map(function (g) { return g + ' [' + Math.round(f.adv(g) * 1000 / f.upm) + ']'; }).join(' ');
      fontDefs.push({ k: k, f: f, name: name, W: Wd, map: used[k] });
    });

    return (async function () {
      /* шрифтовые объекты */
      var ids = {};
      for (var d = 0; d < fontDefs.length; d++) {
        var fd = fontDefs[d], f = fd.f, ff = reserve(), desc = reserve(), cid = reserve(), tu = reserve(), type0 = reserve();
        ids[fd.k] = type0;
        streams[ff] = { dict: '/Length1 ' + f.buf.byteLength, data: new Uint8Array(f.buf), z: true };
        streams[tu] = { dict: '', data: enc8(toUnicodeCMap(fd.map)), z: true };
        objs[desc - 1] = '<< /Type /FontDescriptor /FontName /AAAAAA+' + fd.name + ' /Flags 32 /FontBBox [' + f.bbox.map(function (v) { return Math.round(v * 1000 / f.upm); }).join(' ') + '] /ItalicAngle 0 /Ascent ' + Math.round(f.ascent * 1000 / f.upm) + ' /Descent ' + Math.round(f.descent * 1000 / f.upm) + ' /CapHeight ' + Math.round(f.cap * 1000 / f.upm) + ' /StemV ' + (fd.k === 'b' ? 130 : 80) + ' /FontFile2 ' + ff + ' 0 R >>';
        objs[cid - 1] = '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+' + fd.name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + desc + ' 0 R /CIDToGIDMap /Identity /DW 500 /W [' + fd.W + '] >>';
        objs[type0 - 1] = '<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+' + fd.name + ' /Encoding /Identity-H /DescendantFonts [' + cid + ' 0 R] /ToUnicode ' + tu + ' 0 R >>';
      }
      var pageIds = [];
      for (var p = 0; p < pages.length; p++) {
        var cont = reserve(), pg = reserve(), annIds = [];
        pages[p].ann.forEach(function (a) {
          annIds.push(add('<< /Type /Annot /Subtype /Link /Rect [' + a.rect.map(num).join(' ') + '] /Border [0 0 0] /A << /S /URI /URI ' + pdfStr(a.uri) + ' >> >>'));
        });
        streams[cont] = { dict: '', data: enc8(pages[p].ops.join('\n')), z: true };
        objs[pg - 1] = '<< /Type /Page /Parent ' + pagesRoot + ' 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 ' + ids.r + ' 0 R /F2 ' + ids.b + ' 0 R >> >> /Contents ' + cont + ' 0 R' + (annIds.length ? ' /Annots [' + annIds.map(function (i) { return i + ' 0 R'; }).join(' ') + ']' : '') + ' >>';
        pageIds.push(pg);
      }
      objs[pagesRoot - 1] = '<< /Type /Pages /Kids [' + pageIds.map(function (i) { return i + ' 0 R'; }).join(' ') + '] /Count ' + pageIds.length + ' >>';
      objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesRoot + ' 0 R /Lang (ru-RU) /ViewerPreferences << /DisplayDocTitle true >> >>';
      var info = add('<< /Title ' + utf16hex(opts.title || 'Резюме') + ' /Author ' + utf16hex(opts.author || '') + ' /Producer (resume-pdf.js) >>');

      pushStr('%PDF-1.5\n%\xE2\xE3\xCF\xD3\n');
      for (var i = 0; i < objs.length; i++) {
        offsets[i] = pos;
        var id = i + 1;
        pushStr(id + ' 0 obj\n');
        if (streams[id]) {
          var s = streams[id], data = s.data, flt = '';
          if (deflate && s.z) { data = await deflate(data); flt = '/Filter /FlateDecode '; }
          pushStr('<< ' + s.dict + ' ' + flt + '/Length ' + data.length + ' >>\nstream\n'); push(data); pushStr('\nendstream');
        } else pushStr(objs[i]);
        pushStr('\nendobj\n');
      }
      var xref = pos;
      pushStr('xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n');
      offsets.forEach(function (o) { pushStr(('0000000000' + o).slice(-10) + ' 00000 n \n'); });
      pushStr('trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
      var out = new Uint8Array(pos), q = 0;
      chunks.forEach(function (c) { out.set(c, q); q += c.length; });
      return out;
    })();
  }

  /* ---------------- содержимое резюме -> блоки ---------------- */
  var INK = [18, 20, 15], MUTED = [106, 108, 102], ACC = [124, 42, 232], LINE = [215, 215, 210];

  function buildBlocks(S, v, mode, C) {
    var P = S.person, V = S.versions[v], short = mode !== 'long', B = [];
    function h(title) {
      B.push({ k: 'text', f: 'b', size: 11, color: ACC, text: title.toUpperCase(), before: 14, after: 2, keepNext: 40 });
      B.push({ k: 'rule', color: LINE, after: 4 });
    }
    function para(text, o) { B.push(Object.assign({ k: 'text', size: 10, color: INK, text: text, after: 3 }, o || {})); }
    function bullets(arr) { arr.forEach(function (t) { if (t) para(t, { bullet: true, indent: 12, after: 2.5 }); }); }
    function lead(title, text) { para((title ? title + ' ' : '') + text, { bullet: true, indent: 12, after: 2.5 }); }

    B.push({ k: 'text', f: 'b', size: 25, text: P.name, after: 2, lh: 1.1 });
    B.push({ k: 'text', f: 'b', size: 12.5, color: ACC, text: String(V.position).replace(/\s*\n\s*/g, ' ').trim(), after: 2, lh: 1.25 });
    B.push({ k: 'text', size: 10, color: MUTED, text: V.headline, after: 6 });
    var meta = [P.city, P.format].filter(Boolean).join(' · ');
    if (meta) B.push({ k: 'text', size: 9.5, color: MUTED, text: meta, after: 1 });
    if (P.salary) B.push({ k: 'text', size: 9.5, color: MUTED, text: 'Ожидания: ' + P.salary, after: 1 });
    if (C) {
      if (C.phone) B.push({ k: 'text', f: 'b', size: 10.5, text: 'Телефон: ' + C.phone.text, link: C.phone.href, after: 0 });
      if (C.email) B.push({ k: 'text', f: 'b', size: 10.5, text: 'Почта: ' + C.email.text, link: C.email.href, after: 0 });
      if (C.telegram) B.push({ k: 'text', f: 'b', size: 10.5, text: 'Telegram: ' + C.telegram.text, link: C.telegram.href, after: 0 });
    }
    if (S.site) B.push({ k: 'text', size: 9.5, color: MUTED, text: S.site, link: 'https://' + S.site.replace(/^https?:\/\//, ''), before: 2, after: 0 });

    h('Обо мне');
    (short ? V.aboutShort : V.about).forEach(function (t) { para(t, { after: 4 }); });

    h('Ключевой опыт');
    S.jobs.forEach(function (j, ji) {
      B.push({ k: 'text', f: 'b', size: 11, text: j.role, before: ji ? 8 : 0, after: 0, keepNext: 36 });
      B.push({ k: 'text', size: 9.5, color: MUTED, text: [j.place, j.period].filter(Boolean).join(' · '), after: 3 });
      if (j.avito) {
        para(short ? j.contextShort : j.context, { color: MUTED, after: 3 });
        var ord = short ? V.order.slice(0, V.shortN) : V.order;
        ord.forEach(function (id) { var it = S.items[id]; if (it) lead(it.title, short ? it.short : it.text); });
      } else bullets(short ? j.shortBullets : j.bullets);
    });

    h('Ранний опыт · ' + S.early.period);
    S.early.groups.forEach(function (g, gi) {
      B.push({ k: 'text', f: 'b', size: 10.5, text: g.role, before: gi ? 6 : 0, after: 0, keepNext: 30 });
      B.push({ k: 'text', size: 9.5, color: MUTED, text: [g.place.trim(), g.period].filter(Boolean).join(' · '), after: 2 });
      if (short) para(g.short, { after: 2 }); else bullets(g.bullets);
    });

    h('Образование');
    S.edu.forEach(function (e) {
      B.push({ k: 'text', f: 'b', size: 10, text: e.school + (e.year ? ' — ' + e.year : ''), after: 0, keepNext: 20 });
      if (!short && e.text) para(e.text, { color: MUTED, after: 3 });
      else B.push({ k: 'gap', h: 2 });
    });

    h('Развитие');
    S.dev.forEach(function (d) {
      B.push({ k: 'text', f: 'b', size: 10, text: d.title, after: 0, keepNext: 20 });
      if (!short && d.text) para(d.text, { color: MUTED, after: 3 });
      else B.push({ k: 'gap', h: 2 });
    });

    h('Навыки');
    para((short ? V.skills.slice(0, 8) : V.skills).join(' · '), { after: 3 });
    if (!short && S.tools) para(S.tools, { color: MUTED, after: 3 });

    h('Дополнительно');
    bullets(S.extra);
    return B;
  }

  /* ---------------- браузерная часть ---------------- */
  function fetchBuf(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }); }
  function b64buf(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a.buffer; }
  function browserDeflate(u8) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(u8);
    var cs = new CompressionStream('deflate');
    var w = cs.writable.getWriter(); w.write(u8); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  var FN = { kam: 'KAM', pm: 'Implementation-PM', ai: 'AI-Adoption' };

  /* opts: data, version, mode, contacts, fontBase | fontsB64:{r,b}, save(blob,filename) */
  function make(opts) {
    var S = opts.data, v = opts.version || 'kam', mode = opts.mode || 'short';
    var fp = opts.fontsB64
      ? Promise.resolve({ r: b64buf(opts.fontsB64.r), b: b64buf(opts.fontsB64.b) })
      : Promise.all([fetchBuf((opts.fontBase || 'fonts/') + 'Carlito-Regular-sub.ttf'), fetchBuf((opts.fontBase || 'fonts/') + 'Carlito-Bold-sub.ttf')]).then(function (a) { return { r: a[0], b: a[1] }; });
    return fp.then(function (fonts) {
      var blocks = buildBlocks(S, v, mode, opts.contacts || null);
      return render(blocks, fonts, { deflate: browserDeflate, title: 'Резюме — ' + S.person.name, author: S.person.name });
    }).then(function (bytes) {
      return { blob: new Blob([bytes], { type: 'application/pdf' }), filename: 'Glushenkov_Evgeny_' + (FN[v] || v) + '.pdf', bytes: bytes };
    });
  }
  function download(opts) {
    return make(opts).then(function (r) {
      if (opts.save) return opts.save(r.blob, r.filename);
      var a = document.createElement('a'), u = URL.createObjectURL(r.blob);
      a.href = u; a.download = r.filename; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);
      return r;
    });
  }

  var API = { buildBlocks: buildBlocks, render: render, make: make, download: download };
  root.GLPDF = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
