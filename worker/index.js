/* Cloudflare Worker: вход в админку через Telegram + сохранение резюме в GitHub.
   Секреты и настройки — см. worker/SETUP.md.
   Маршруты:
     POST /auth/start            -> {id, secret}   (шлёт владельцу запрос в Telegram с кнопками)
     GET  /auth/poll?id&secret   -> {status, token?}
     POST /auth/redeem {link}    -> {token}        (прямая ссылка из бота, команда /admin)
     POST /tg                    -> вебхук Telegram
     GET  /data?f=<файл>          -> {data, sha, file}    (нужен токен)
     POST /save {f,data,sha}         -> {ok, commit}   (нужен токен)
     POST /hit {p,n}             -> 204            (счётчик просмотров со страниц сайта, см. stats.js)
     GET  /health
   По расписанию (cron): раз в сутки шлёт владельцу в Telegram статистику за вчера.
   Команда боту /stats: статистика за сегодня на текущий момент. */

const enc = new TextEncoder();
const SESSION_TTL = 12 * 3600;        // сессия, секунд
const REQ_TTL = 300;                  // запрос на вход живёт 5 минут
const LINK_TTL = 600;                 // прямая ссылка живёт 10 минут
const MAX_PENDING_PER_10MIN = 6;      // защита от спама в Telegram
const MAX_BODY = 400 * 1024;
const STAT_TTL = 100 * 86400;         // дневная статистика хранится 100 суток
const MAX_HITS_PER_DAY = 800;         // потолок записей в сутки: бесплатный KV разрешает 1000 записей в день

/* ---------- утилиты ---------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const rand = (n = 16) => b64u(crypto.getRandomValues(new Uint8Array(n)));

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function safeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function sha256(s) {
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
async function mintToken(env) {
  const payload = b64u(enc.encode(JSON.stringify({ sub: 'owner', exp: Math.floor(Date.now() / 1000) + SESSION_TTL })));
  return payload + '.' + (await hmac(env.SESSION_SECRET, payload));
}
async function checkToken(env, req) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  if (!safeEq(sig, await hmac(env.SESSION_SECRET, payload))) return false;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    return p.sub === 'owner' && p.exp > Date.now() / 1000;
  } catch (e) { return false; }
}

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(env, req, obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(env, req) } });
}

/* ---------- Telegram ---------- */
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json().catch(() => ({}));
}
const adminUrl = (env) => String(env.ADMIN_URL || '').replace(/\/?$/, '/');

/* ---------- GitHub ---------- */
const ghHeaders = (env) => ({ Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'resume-admin-worker', 'X-GitHub-Api-Version': '2022-11-28' });
const ghUrl = (env, path) => `https://api.github.com/repos/${env.GH_REPO}/contents/${path}`;
function utf8ToB64(s) {
  const bytes = enc.encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, '')); const u = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(u);
}
async function ghGet(env, path) {
  const r = await fetch(`${ghUrl(env, path)}?ref=${encodeURIComponent(env.GH_BRANCH || 'main')}`, { headers: ghHeaders(env) });
  if (!r.ok) throw new Error('github_get_' + r.status);
  const j = await r.json();
  return { data: JSON.parse(b64ToUtf8(j.content)), sha: j.sha };
}

/* ---------- проверка данных ---------- */
const REQUIRED = ['person', 'versions', 'items', 'jobs', 'early', 'edu', 'dev', 'extra'];
const ALLOWED_KEYS = new Set([...REQUIRED, 'tools', 'site']);
function validate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'data_not_object';
  for (const k of REQUIRED) if (!(k in d)) return 'missing_' + k;
  for (const v of ['kam', 'pm', 'ai']) {
    const x = d.versions && d.versions[v];
    if (!x || typeof x.position !== 'string' || !Array.isArray(x.about) || !Array.isArray(x.aboutShort) || !Array.isArray(x.skills) || !Array.isArray(x.order)) return 'bad_version_' + v;
  }
  if (!Array.isArray(d.jobs) || !d.jobs.length) return 'bad_jobs';
  if (!d.person || typeof d.person.name !== 'string') return 'bad_person';
  for (const j of d.jobs) {
    if (typeof j.role !== 'string') return 'bad_job';
    if (j.avito && (typeof j.context !== 'string' || typeof j.contextShort !== 'string')) return 'bad_avito_job';
  }
  return null;
}
function sanitize(d) {
  const out = {};
  for (const k of Object.keys(d)) if (ALLOWED_KEYS.has(k)) out[k] = d[k];
  /* контакты живут только в protect.js, в открытые данные они попасть не должны */
  out.person = { ...out.person, phone: 'x', email: 'x', telegram: 'x' };
  return out;
}

/* ---------- файлы сайта, доступные из админки ---------- */
const FILES = {
  'resume-data.json': 'resume', 'resume-data.en.json': 'resume', 'resume-data.zh.json': 'resume',
  'landing-data.json': 'landing', 'landing-data.en.json': 'landing', 'landing-data.zh.json': 'landing',
  'site-config.json': 'config'
};
const DEFAULT_FILE = 'resume-data.json';
const LANDING_KEYS = ['title', 'logo', 'nav', 'topbar', 'hero', 'about', 'skills', 'results', 'contact', 'footer'];
function plain(v, depth = 0) {
  if (depth > 6) return false;
  if (typeof v === 'string') return v.length < 4000;
  if (Array.isArray(v)) return v.length < 100 && v.every((x) => plain(x, depth + 1));
  if (v && typeof v === 'object') return Object.values(v).every((x) => plain(x, depth + 1));
  return false;
}
function cleanHtml(h) {
  return String(h).replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (m, sl, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!['br', 'em', 'strong', 'span'].includes(tag)) return '';
    if (tag === 'span' && !sl) { const c = /class\s*=\s*"(eg-q9p__accent-(?:blue|green|pink|purple|red))"/i.exec(attrs); return c ? `<span class="${c[1]}">` : '<span>'; }
    return sl ? `</${tag}>` : `<${tag}>`;
  }).replace(/<(?![/a-z])/gi, '&lt;');
}
function validateLanding(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'data_not_object';
  for (const k of ['hero', 'about', 'skills', 'results', 'contact']) if (!d[k] || typeof d[k] !== 'object') return 'missing_' + k;
  if (!plain(d)) return 'bad_values';
  return null;
}
function sanitizeLanding(d) {
  const out = {};
  for (const k of LANDING_KEYS) if (k in d) out[k] = d[k];
  if (out.hero && typeof out.hero.name === 'string') out.hero = { ...out.hero, name: cleanHtml(out.hero.name) };
  if (out.contact && typeof out.contact.title === 'string') out.contact = { ...out.contact, title: cleanHtml(out.contact.title) };
  return out;
}
/* настройки сайта: какие языки включены (русский всегда включён) */
function validateConfig(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'data_not_object';
  const L = d.languages;
  if (!L || typeof L !== 'object') return 'missing_languages';
  for (const k of ['en', 'zh']) if (typeof L[k] !== 'boolean') return 'bad_language_' + k;
  return null;
}
function sanitizeConfig(d) { return { languages: { ru: true, en: d.languages.en, zh: d.languages.zh } }; }
function validateFile(f, d) { return FILES[f] === 'landing' ? validateLanding(d) : FILES[f] === 'config' ? validateConfig(d) : validate(d); }
function sanitizeFile(f, d) { return FILES[f] === 'landing' ? sanitizeLanding(d) : FILES[f] === 'config' ? sanitizeConfig(d) : sanitize(d); }

/* ---------- обработчики ---------- */
async function authStart(env, req) {
  const origin = req.headers.get('Origin');
  if (origin && !cors(env, req)['Access-Control-Allow-Origin']) return json(env, req, { error: 'bad_origin' }, 403);
  const now = Math.floor(Date.now() / 1000);
  const bucket = 'rl:' + Math.floor(now / 600);
  const n = parseInt((await env.AUTH.get(bucket)) || '0', 10);
  if (n >= MAX_PENDING_PER_10MIN) return json(env, req, { error: 'too_many_requests' }, 429);
  await env.AUTH.put(bucket, String(n + 1), { expirationTtl: 700 });

  const id = rand(12), secret = rand(24);
  const ip = req.headers.get('CF-Connecting-IP') || '—';
  const cf = req.cf || {};
  const where = [cf.city, cf.country].filter(Boolean).join(', ') || '—';
  await env.AUTH.put('req:' + id, JSON.stringify({ status: 'pending', sh: await sha256(secret) }), { expirationTtl: REQ_TTL });
  const res = await tg(env, 'sendMessage', {
    chat_id: env.OWNER_TG_ID,
    text: `Запрос на вход в админку резюме\n\nГде: ${where}\nIP: ${ip}\n\nЭто вы?`,
    reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'ok:' + id }, { text: '❌ Это не я', callback_data: 'no:' + id }]] }
  });
  if (res && res.ok === false) return json(env, req, { error: 'telegram_failed' }, 502);
  return json(env, req, { id, secret, ttl: REQ_TTL });
}

async function authPoll(env, req, url) {
  const id = url.searchParams.get('id') || '', secret = url.searchParams.get('secret') || '';
  const raw = await env.AUTH.get('req:' + id);
  if (!raw) return json(env, req, { status: 'expired' });
  const r = JSON.parse(raw);
  if (!safeEq(r.sh, await sha256(secret))) return json(env, req, { status: 'expired' });
  if (r.status === 'approved') {
    await env.AUTH.delete('req:' + id);              // одноразово
    return json(env, req, { status: 'approved', token: await mintToken(env), ttl: SESSION_TTL });
  }
  if (r.status === 'denied') { await env.AUTH.delete('req:' + id); return json(env, req, { status: 'denied' }); }
  return json(env, req, { status: 'pending' });
}

async function authRedeem(env, req) {
  let body; try { body = await req.json(); } catch (e) { return json(env, req, { error: 'bad_json' }, 400); }
  const key = 'link:' + String(body.link || '').slice(0, 80);
  const raw = await env.AUTH.get(key);
  if (!raw) return json(env, req, { error: 'link_expired' }, 401);
  await env.AUTH.delete(key);                        // одноразово
  return json(env, req, { token: await mintToken(env), ttl: SESSION_TTL });
}

async function telegramHook(env, req) {
  if (!safeEq(req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', env.TG_WEBHOOK_SECRET || '')) return new Response('forbidden', { status: 403 });
  let u; try { u = await req.json(); } catch (e) { return new Response('ok'); }
  const owner = String(env.OWNER_TG_ID || '');

  if (u.callback_query) {
    const q = u.callback_query, from = String(q.from && q.from.id);
    const [act, id] = String(q.data || '').split(':');
    if (from !== owner) { await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа', show_alert: true }); return new Response('ok'); }
    const raw = await env.AUTH.get('req:' + id);
    if (!raw) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Запрос устарел' });
    } else {
      const r = JSON.parse(raw); r.status = act === 'ok' ? 'approved' : 'denied';
      await env.AUTH.put('req:' + id, JSON.stringify(r), { expirationTtl: 120 });
      await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: act === 'ok' ? 'Вход подтверждён' : 'Отклонено' });
      if (q.message) await tg(env, 'editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: act === 'ok' ? '✅ Вход подтверждён' : '❌ Вход отклонён' });
    }
    return new Response('ok');
  }

  const m = u.message;
  if (m && m.text) {
    const from = String(m.from && m.from.id), cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
    if (cmd === '/id') { await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Ваш Telegram ID: ' + from }); return new Response('ok'); }
    if (from === owner && cmd === '/stats') { await tg(env, 'sendMessage', { chat_id: m.chat.id, text: await statsReport(env, 0) }); return new Response('ok'); }
    if (from === owner && (cmd === '/admin' || cmd === '/link' || cmd === '/start')) {
      const tok = rand(24);
      await env.AUTH.put('link:' + tok, '1', { expirationTtl: LINK_TTL });
      await tg(env, 'sendMessage', { chat_id: m.chat.id, text: `Прямая ссылка в админку (одноразовая, 10 минут):\n${adminUrl(env)}#l=${tok}`, disable_web_page_preview: true });
    }
  }
  return new Response('ok');
}

async function getData(env, req) {
  if (!(await checkToken(env, req))) return json(env, req, { error: 'unauthorized' }, 401);
  const f = new URL(req.url).searchParams.get('f') || DEFAULT_FILE;
  if (!FILES[f]) return json(env, req, { error: 'bad_file' }, 400);
  try { return json(env, req, { ...(await ghGet(env, f)), file: f }); } catch (e) { return json(env, req, { error: String(e.message || e) }, 502); }
}

async function save(env, req) {
  if (!(await checkToken(env, req))) return json(env, req, { error: 'unauthorized' }, 401);
  const text = await req.text();
  if (text.length > MAX_BODY) return json(env, req, { error: 'too_large' }, 413);
  let body; try { body = JSON.parse(text); } catch (e) { return json(env, req, { error: 'bad_json' }, 400); }
  const f = body.f || DEFAULT_FILE;
  if (!FILES[f]) return json(env, req, { error: 'bad_file' }, 400);
  const bad = validateFile(f, body.data);
  if (bad) return json(env, req, { error: 'invalid_data', detail: bad }, 422);
  const data = sanitizeFile(f, body.data);
  let cur;
  try { cur = await ghGet(env, f); } catch (e) { return json(env, req, { error: String(e.message || e) }, 502); }
  if (body.sha && body.sha !== cur.sha) return json(env, req, { error: 'conflict', detail: 'Файл на сайте изменился. Обновите админку.' }, 409);
  const r = await fetch(ghUrl(env, f), {
    method: 'PUT', headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Админка: обновление ' + f, content: utf8ToB64(JSON.stringify(data, null, 1) + '\n'), sha: cur.sha, branch: env.GH_BRANCH || 'main' })
  });
  if (!r.ok) return json(env, req, { error: 'github_put_' + r.status }, 502);
  const j = await r.json();
  return json(env, req, { ok: true, file: f, commit: j.commit && j.commit.sha, sha: j.content && j.content.sha, data });
}

/* ---------- счётчик просмотров и ежедневная статистика ----------
   Хранится только число просмотров и визитов по страницам за день: ни IP, ни cookies, ни отпечатков.
   Ключ в KV: st:ГГГГ-ММ-ДД -> {v: просмотров, s: визитов, p: {страница: просмотров}}. Сутки считаются по env.STATS_TZ
   (по умолчанию Europe/Moscow). Запись не атомарна: при редких визитах этого достаточно, при двух просмотрах
   в одну и ту же миллисекунду один может потеряться. */
const STAT_PAGES = {
  index: 'Сайт-визитка (RU)', en: 'Сайт-визитка (EN)', zh: 'Сайт-визитка (中文)',
  resume: 'Резюме (RU)', 'resume-taxi': 'Резюме для Такси', 'resume-en': 'Резюме (EN)', 'resume-zh': 'Резюме (中文)',
  'test-yandex-taxi': 'Тестовое Такси (актуальное)', 'taxi-test': 'Тестовое Такси (предыдущее)',
  'taxi-test-2': 'Тестовое Такси (по документу)', 'taxi-test-archive': 'Тестовое Такси (архив)'
};
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|go-http|java\/|node-fetch|axios/i;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const emptyDay = () => ({ v: 0, s: 0, p: {} });

function dayKey(env, ts = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.STATS_TZ || 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
}
const dayLabel = (key) => { const [, m, d] = key.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
async function readDay(env, key) {
  try { const raw = await env.AUTH.get('st:' + key); return raw ? { ...emptyDay(), ...JSON.parse(raw) } : emptyDay(); } catch (e) { return emptyDay(); }
}

async function hit(env, req) {
  const h = cors(env, req);
  if (!h['Access-Control-Allow-Origin']) return new Response(null, { status: 403 });          // только со своего сайта
  const quiet = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...h } });
  if (BOT_RE.test(req.headers.get('User-Agent') || '')) return quiet(204);                      // боты и превью не считаются
  let b; try { b = JSON.parse((await req.text()).slice(0, 200)); } catch (e) { return quiet(400); }
  const p = b && typeof b.p === 'string' ? b.p : '';
  if (!Object.prototype.hasOwnProperty.call(STAT_PAGES, p)) return quiet(400);                  // только известные страницы
  const day = dayKey(env);
  const d = await readDay(env, day);
  if (d.v >= MAX_HITS_PER_DAY) return quiet(204);                                               // защита квоты записи KV
  d.v += 1; if (b.n === 1) d.s += 1; d.p[p] = (d.p[p] || 0) + 1;
  await env.AUTH.put('st:' + day, JSON.stringify(d), { expirationTtl: STAT_TTL });
  return quiet(204);
}

/* Текст статистики за день offset суток назад (0 — сегодня, 1 — вчера) и итог за неделю, заканчивающуюся этим днём. */
async function statsReport(env, offset) {
  const days = [];
  for (let i = offset + 6; i >= offset; i--) days.push(dayKey(env, Date.now() - i * 86400000));
  const data = await Promise.all(days.map((k) => readDay(env, k)));
  const day = data[data.length - 1], key = days[days.length - 1];
  const week = data.reduce((a, x) => ({ v: a.v + x.v, s: a.s + x.s }), { v: 0, s: 0 });
  const title = offset === 0 ? `📊 Сайт сегодня, ${dayLabel(key)} (пока)` : `📊 Сайт за ${dayLabel(key)}${offset === 1 ? ' (вчера)' : ''}`;
  const lines = [title, ''];
  if (!day.v) lines.push('Просмотров нет.');
  else {
    lines.push(`Просмотров: ${day.v}, визитов: ${day.s}`, '', 'По страницам:');
    Object.entries(day.p).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => lines.push(`• ${STAT_PAGES[p] || p}: ${n}`));
  }
  lines.push('', `За 7 дней: просмотров ${week.v}, визитов ${week.s}`);
  return lines.join('\n');
}

export default {
  async scheduled(event, env, ctx) {
    if (!env.OWNER_TG_ID) return;
    ctx.waitUntil((async () => tg(env, 'sendMessage', { chat_id: env.OWNER_TG_ID, text: await statsReport(env, 1) }))());
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
    try {
      /* вебхук Telegram приходит без Origin; остальное — только с разрешённого сайта */
      if (url.pathname === '/tg' && req.method === 'POST') return await telegramHook(env, req);
      if (url.pathname === '/health') return json(env, req, { ok: true });
      if (url.pathname === '/hit' && req.method === 'POST') return await hit(env, req);
      if (url.pathname === '/auth/start' && req.method === 'POST') return await authStart(env, req);
      if (url.pathname === '/auth/poll' && req.method === 'GET') return await authPoll(env, req, url);
      if (url.pathname === '/auth/redeem' && req.method === 'POST') return await authRedeem(env, req);
      if (url.pathname === '/data' && req.method === 'GET') return await getData(env, req);
      if (url.pathname === '/save' && req.method === 'POST') return await save(env, req);
      return json(env, req, { error: 'not_found' }, 404);
    } catch (e) {
      return json(env, req, { error: 'server_error' }, 500);
    }
  }
};
export { validate, sanitize, validateFile, sanitizeFile, FILES, dayKey };
