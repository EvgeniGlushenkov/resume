# Как включить вход через Telegram и сохранение на сайт

Что получится: вы открываете `https://evgeniglushenkov.github.io/resume/admin/`, нажимаете «Войти через Telegram», в Telegram приходит сообщение с кнопкой «Подтвердить». После этого вы правите резюме в форме, справа сразу видно, как оно выглядит, а кнопка «Сохранить на сайт» делает коммит в этот репозиторий. Сайт обновляется минуты через полторы.

Если лень нажимать кнопку: напишите боту `/admin`, он пришлёт одноразовую ссылку на 10 минут.

Нужны четыре вещи. Всё бесплатное.

## 1. Бот в Telegram
1. В Telegram найдите `@BotFather`, команда `/newbot`, придумайте имя.
2. Скопируйте токен бота (длинная строка с двоеточием). Это `TG_BOT_TOKEN`. Никому не показывайте.

## 2. Токен GitHub для записи в репозиторий
1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → `resume`.
3. Permissions → Repository permissions → **Contents: Read and write**. Больше ничего.
4. Срок: на ваше усмотрение (потом продлите). Скопируйте токен. Это `GH_TOKEN`.

## 3. Worker на Cloudflare
1. Зарегистрируйтесь на cloudflare.com (бесплатный тариф подходит).
2. Workers & Pages → Create → **Create Worker** → назовите `resume-admin` → Deploy → Edit code.
3. Удалите всё и вставьте содержимое файла `worker/index.js` из репозитория. Deploy.
4. Хранилище: Storage & Databases → KV → Create namespace `resume-auth`. Затем в Worker: Settings → Bindings → Add → KV namespace → имя переменной **AUTH**, выберите `resume-auth`.
5. Settings → Variables and Secrets → добавьте (секретные помечайте Secret):

| Имя | Значение |
|---|---|
| `TG_BOT_TOKEN` | токен бота (секрет) |
| `TG_WEBHOOK_SECRET` | любая случайная строка 30+ символов, придумайте сами (секрет) |
| `SESSION_SECRET` | ещё одна случайная строка 30+ символов (секрет) |
| `GH_TOKEN` | токен GitHub (секрет) |
| `OWNER_TG_ID` | ваш числовой Telegram ID (см. шаг 4) |
| `GH_REPO` | `EvgeniGlushenkov/resume` |
| `GH_BRANCH` | `main` |
| `DATA_PATH` | `resume-data.json` |
| `ALLOWED_ORIGIN` | `https://evgeniglushenkov.github.io` |
| `ADMIN_URL` | `https://evgeniglushenkov.github.io/resume/admin/` |

6. Запомните адрес Worker, он вида `https://resume-admin.ВАШЕ-ИМЯ.workers.dev`.

## 4. Подключить бота к Worker и узнать свой ID
Выполните в браузере или терминале (подставьте токен, адрес и секрет):

```
https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook?url=https://resume-admin.ВАШЕ-ИМЯ.workers.dev/tg&secret_token=<TG_WEBHOOK_SECRET>
```

Должно прийти `{"ok":true,...}`. Дальше напишите своему боту `/id`: он ответит вашим числовым ID. Впишите его в `OWNER_TG_ID` в настройках Worker (шаг 3.5) и сохраните.

## 5. Сказать админке адрес Worker
В файле `admin/config.js` замените пустую строку на адрес Worker:

```js
window.ADMIN_API = 'https://resume-admin.ВАШЕ-ИМЯ.workers.dev';
```

Закоммитьте. Всё, заходите в `/admin/`.

## Как это защищено
- Подтвердить вход может только Telegram-аккаунт с вашим `OWNER_TG_ID`. Чужое нажатие кнопки ничего не даёт.
- Сессия живёт 12 часов, хранится только в этой вкладке браузера.
- Ссылка из бота одноразовая и живёт 10 минут.
- Токен GitHub лежит только в Worker, в браузер и в репозиторий не попадает.
- Worker не даёт записать в данные телефон, почту и Telegram: они остаются только в `protect.js`.
- Запросов на вход не больше 6 за 10 минут.

## Что можно и нельзя править в админке
Правится русская версия резюме: три вкладки, блоки опыта, образование, навыки, PDF. Английская и китайская страницы (`resume-en.html`, `resume-zh.html`) и главная живут отдельно, их по-прежнему правят в файлах.
Контакты (телефон, почта, Telegram) меняются в `protect.js`.

## Когда закроете репозиторий
- Worker продолжит работать: он ходит в репозиторий по токену.
- Но GitHub Pages для закрытого репозитория работает только на платных тарифах GitHub (Pro/Team). На бесплатном сайт пропадёт. Запасной вариант: Cloudflare Pages, он бесплатно публикует сайт из закрытого репозитория. Тогда обновите `ALLOWED_ORIGIN` и `ADMIN_URL` на новый адрес.

## Проверка
`node worker/test.mjs` запускает 16 проверок логики Worker без сети: вход, отказ, ссылка, права, защита контактов, конфликт версий.
