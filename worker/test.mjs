/* Проверка логики Worker без сети: Telegram и GitHub подменены. Запуск: node worker/test.mjs */
import worker from './index.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const kv = new Map();
const AUTH = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { AUTH, TG_BOT_TOKEN: 'T', TG_WEBHOOK_SECRET: 'whs', OWNER_TG_ID: '111', GH_TOKEN: 'G', GH_REPO: 'o/r', GH_BRANCH: 'main', DATA_PATH: 'resume-data.json', SESSION_SECRET: 'sess-secret', ALLOWED_ORIGIN: 'https://site.example', ADMIN_URL: 'https://site.example/resume/admin/' };

const real = JSON.parse(fs.readFileSync(new URL('../resume-data.json', import.meta.url), 'utf8'));
let ghFile = { data: real, sha: 'sha1' }; const tgCalls = []; const ghPuts = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://api.telegram.org/')) { tgCalls.push({ m: url.split('/').pop(), b: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true })); }
  if (url.startsWith('https://api.github.com/')) {
    if ((init.method || 'GET') === 'GET') return new Response(JSON.stringify({ sha: ghFile.sha, content: Buffer.from(JSON.stringify(ghFile.data)).toString('base64') }));
    const body = JSON.parse(init.body); ghPuts.push(body);
    ghFile = { data: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')), sha: 'sha' + (ghPuts.length + 1) };
    return new Response(JSON.stringify({ commit: { sha: 'c' + ghPuts.length }, content: { sha: ghFile.sha } }));
  }
  throw new Error('unexpected fetch ' + url);
};
const call = (path, { method = 'GET', body, headers = {} } = {}) => worker.fetch(new Request('https://w.example' + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { Origin: 'https://site.example', ...headers } }), env);
const J = async (r) => ({ s: r.status, j: await r.json() });
let n = 0; const ok = (name) => console.log('ok', ++n, name);

/* 1. запрос на вход шлёт сообщение владельцу с кнопками */
let r = await J(await call('/auth/start', { method: 'POST' }));
assert.equal(r.s, 200); const { id, secret } = r.j;
assert.equal(tgCalls[0].m, 'sendMessage'); assert.equal(tgCalls[0].b.chat_id, '111');
assert.match(tgCalls[0].b.reply_markup.inline_keyboard[0][0].callback_data, /^ok:/); ok('start отправляет запрос в Telegram');

/* 2. до подтверждения — pending, токена нет; чужой секрет не проходит */
r = await J(await call(`/auth/poll?id=${id}&secret=${secret}`)); assert.equal(r.j.status, 'pending'); assert.equal(r.j.token, undefined);
r = await J(await call(`/auth/poll?id=${id}&secret=wrong`)); assert.equal(r.j.status, 'expired'); ok('poll: pending, неверный секрет отклонён');

/* 3. чужой Telegram-пользователь не может подтвердить */
const hook = (u, secretHdr = 'whs') => worker.fetch(new Request('https://w.example/tg', { method: 'POST', body: JSON.stringify(u), headers: { 'X-Telegram-Bot-Api-Secret-Token': secretHdr } }), env);
assert.equal((await hook({}, 'bad')).status, 403); ok('вебхук без секрета отклонён');
await hook({ callback_query: { id: 'q1', from: { id: 999 }, data: 'ok:' + id, message: { chat: { id: 999 }, message_id: 1 } } });
r = await J(await call(`/auth/poll?id=${id}&secret=${secret}`)); assert.equal(r.j.status, 'pending'); ok('чужой пользователь не подтвердит вход');

/* 4. владелец подтверждает -> токен, одноразово */
await hook({ callback_query: { id: 'q2', from: { id: 111 }, data: 'ok:' + id, message: { chat: { id: 111 }, message_id: 2 } } });
r = await J(await call(`/auth/poll?id=${id}&secret=${secret}`)); assert.equal(r.j.status, 'approved'); const token = r.j.token; assert.ok(token);
r = await J(await call(`/auth/poll?id=${id}&secret=${secret}`)); assert.equal(r.j.status, 'expired'); ok('подтверждение владельцем выдаёт токен один раз');

/* 5. «Это не я» */
r = await J(await call('/auth/start', { method: 'POST' }));
await hook({ callback_query: { id: 'q3', from: { id: 111 }, data: 'no:' + r.j.id, message: { chat: { id: 111 }, message_id: 3 } } });
r = await J(await call(`/auth/poll?id=${r.j.id}&secret=${r.j.secret}`)); assert.equal(r.j.status, 'denied'); ok('отказ в Telegram блокирует вход');

/* 6. прямая ссылка из бота */
tgCalls.length = 0;
await hook({ message: { text: '/admin', from: { id: 111 }, chat: { id: 111 } } });
const link = /#l=([\w-]+)/.exec(tgCalls[0].b.text)[1];
await hook({ message: { text: '/admin', from: { id: 222 }, chat: { id: 222 } } }); assert.equal(tgCalls.length, 1); ok('ссылку выдают только владельцу');
r = await J(await call('/auth/redeem', { method: 'POST', body: { link } })); assert.equal(r.s, 200); assert.ok(r.j.token);
r = await J(await call('/auth/redeem', { method: 'POST', body: { link } })); assert.equal(r.s, 401); ok('прямая ссылка одноразовая');
await hook({ message: { text: '/id', from: { id: 555 }, chat: { id: 555 } } }); assert.match(tgCalls.at(-1).b.text, /555/); ok('/id показывает Telegram ID');

/* 7. данные и сохранение требуют токен */
const auth = { Authorization: 'Bearer ' + token };
assert.equal((await call('/data')).status, 401); assert.equal((await call('/data', { headers: { Authorization: 'Bearer x.y' } })).status, 401);
r = await J(await call('/data', { headers: auth })); assert.equal(r.s, 200); assert.equal(r.j.sha, 'sha1'); ok('/data только с токеном');

const edit = structuredClone(r.j.data); edit.versions.kam.headline = 'Новый заголовок — проверка кириллицы ✓'; edit.person.phone = '+7 999 000-00-00'; edit.person.email = 'secret@mail.ru'; edit.evil = 'x';
r = await J(await call('/save', { method: 'POST', headers: auth, body: { data: edit, sha: 'sha1' } })); assert.equal(r.s, 200, JSON.stringify(r.j));
const saved = ghFile.data;
assert.equal(saved.versions.kam.headline, 'Новый заголовок — проверка кириллицы ✓');
assert.equal(saved.person.phone, 'x'); assert.equal(saved.person.email, 'x'); assert.equal(saved.evil, undefined); assert.equal(ghPuts[0].sha, 'sha1'); assert.equal(ghPuts[0].branch, 'main'); ok('save: коммит в GitHub, контакты и лишние поля не попадают');

r = await J(await call('/save', { method: 'POST', headers: auth, body: { data: edit, sha: 'sha1' } })); assert.equal(r.s, 409); ok('save: устаревшая версия -> conflict');
r = await J(await call('/save', { method: 'POST', headers: auth, body: { data: { person: {} } } })); assert.equal(r.s, 422); ok('save: битые данные отклоняются');
assert.equal((await call('/save', { method: 'POST', body: { data: edit } })).status, 401); ok('save без токена -> 401');

/* 8. CORS и чужой Origin */
const bad = await worker.fetch(new Request('https://w.example/auth/start', { method: 'POST', headers: { Origin: 'https://evil.example' } }), env); assert.equal(bad.status, 403);
const pre = await worker.fetch(new Request('https://w.example/data', { method: 'OPTIONS', headers: { Origin: 'https://site.example' } }), env); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://site.example'); ok('CORS: только свой сайт');

/* 9. лимит запросов входа */
let last; for (let i = 0; i < 8; i++) last = await call('/auth/start', { method: 'POST' }); assert.equal(last.status, 429); ok('лимит на запросы входа');
console.log('\nВсе проверки пройдены:', n);
