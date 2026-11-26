'use strict';

const byId = id => document.getElementById(id);
const duration = 25 * 60;
let remaining = duration;
let deadline = 0;
let tick;

function paintClock() {
  const seconds = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : remaining;
  byId('clock').textContent = [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
  byId('mini-clock').querySelector('b').textContent = byId('clock').textContent;
  if (seconds === 0 && deadline) {
    clearInterval(tick);
    deadline = 0;
    remaining = 0;
    byId('timer').textContent = 'Начать заново';
    saveClock();
  }
}

const timerKey = 'avito.case.timer.v1';
function saveClock() {
  try { sessionStorage.setItem(timerKey, JSON.stringify({deadline, remaining})); } catch {}
}
try {
  const saved = JSON.parse(sessionStorage.getItem(timerKey));
  if (saved && Number.isFinite(saved.deadline) && Number.isFinite(saved.remaining)) {
    deadline = saved.deadline;
    remaining = saved.remaining;
    byId('timer').textContent = deadline ? 'Пауза' : remaining === duration ? 'Начать отсчёт' : remaining ? 'Продолжить' : 'Начать заново';
    if (deadline) tick = setInterval(paintClock, 250);
  }
} catch {}
paintClock();
const mini = byId('mini-clock');
new IntersectionObserver(([entry]) => {
  mini.hidden = entry.isIntersecting;
}, {threshold: 0.25}).observe(byId('timer-home'));

byId('timer').addEventListener('click', () => {
  if (deadline) {
    remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    deadline = 0;
    clearInterval(tick);
    byId('timer').textContent = 'Продолжить';
  } else {
    deadline = Date.now() + (remaining || duration) * 1000;
    tick = setInterval(paintClock, 250);
    byId('timer').textContent = 'Пауза';
  }
  saveClock();
  paintClock();
});

byId('reset').addEventListener('click', () => {
  clearInterval(tick);
  remaining = duration;
  deadline = 0;
  byId('timer').textContent = 'Начать отсчёт';
  saveClock();
  paintClock();
});

const currency = new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 2, minimumFractionDigits: 0});
const fields = ['spend','jobs','unit'].map(byId);
function recalculate() {
  const [spend, jobs, unit] = fields.map(field => field.valueAsNumber);
  const valid = fields.every(field => Number.isFinite(field.valueAsNumber) && field.validity.valid);
  const net = jobs * unit - spend;
  const loss = valid && net < 0;
  byId('net').parentElement.classList.toggle('loss', loss);
  byId('net').textContent = valid ? currency.format(net) : 'Проверьте ввод';
  byId('ratio').textContent = !valid ? 'Введите расходы, целое число ремонтов и вклад.' : jobs > 0 ? currency.format(spend / jobs) + ' за дополнительный ремонт' : 'Положительного прироста ремонтов нет';
  byId('threshold').textContent = !valid ? '' : unit > 0 ? 'Для положительного вклада нужно ремонтов: ' + (Math.floor(spend / unit) + 1) : 'При таком вкладе каждый новый ремонт не покрывает продвижение.';
}
fields.forEach(field => field.addEventListener('input', recalculate));
recalculate();

const drills = {
  manager: [
    ['Почему первым вы идёте к «М.Мастеру»? Что заставит вас изменить выбор?', 'У сети есть публичный кейс и история работы с обращениями. Уточню активность кабинета, свободные смены и возможность сверять оплаты. Если резерв исчерпан, проверю выездные зоны «ТехМастера».'],
    ['Вы показали российский рынок. Сколько ремонтов это даст одному московскому сервису?', 'Из национальной суммы это вывести нельзя. 46,6 млрд ₽ за полугодие требуют сверки. По Москве есть запросы за конкретный период. Для оценки проверю цепочку: уникальные обращения по услуге и району, запись, оплата. Сверху объём ограничен свободными сменами и запчастями.'],
    ['Оплаты выросли в двух зонах. Как вы поймёте, что сработало продвижение?', 'Сначала проверю прошлую динамику, масштаб зон и условия сервиса. Сравню изменения за одинаковые интервалы по всем оплаченным ремонтам выбранной услуги. Проверю другие кампании и перемещение заказов между зонами. Если сравнение ненадёжно, попрошу дополнительные периоды или зоны.'],
    ['Авито показывает рост контактов, а у диспетчера столько же оплат. Ваше первое действие?', 'Сверю несколько обращений с заказ-нарядами и сроком оплаты. Потом проверю пропущенные звонки, отказы после сметы и отсутствие слотов. Выберу причину, владельца исправления и дату проверки. Расширение подождёт.'],
    ['Когда вы предложите больше бюджета и где его потратите?', 'Когда дополнительный вклад после рекламы положителен, прирост воспроизводится и сервис выдерживает нагрузку. Сначала усилю проверенную услугу. Следующий шаг ограничу суммой и числом смен, заранее назначу дату пересмотра.'],
    ['К концу второго месяца прироста нет. Что останется от шестимесячного плана?', 'Сниму расширение по зонам и услугам. Разберу учёт и потери с сервисом. Если выявим исправимую причину, согласую один повторный тест с лимитом. Если спрос не окупается, остановлю платный формат и вернусь к клиенту при изменении условий.']
  ],
  client: [
    ['Владелец кабинета. У вас полчаса. С чего начнём и что я получу по итогам?', 'Спрошу, какую услугу и в каком районе вы готовы выполнить завтра. Попрошу показать путь одного заказа от первого звонка до оплаты. Предложу зафиксировать услугу, пару зон, владельцев данных и дату решения по бюджету.'],
    ['Маркетинг. На Картах и в 2ГИС уже есть отзывы. Зачем отдавать следующий рубль Авито?', 'Для точки приёма близость и маршрут могут давать лучший результат. Для выезда попробуем объявление по конкретному ремонту там, где есть свободный мастер. Сравним предельную стоимость дополнительной оплаты с вкладом. Если Карты выгоднее, сохраним там бюджет.'],
    ['Диспетчер. Мастера сами берут заявки с Профи.ру. Что изменится с Авито?', 'На Профи.ру мастер выбирает подходящую заявку. На Авито по объявлению приходят входящие: их надо быстро принять и распределить. Если некому отвечать, сначала назначим диспетчера. Сверим расходы обоих каналов с оплаченными выездами.'],
    ['Сервис. Маркетинг просит больше заявок, но у меня мастера расписаны. Запускаемся?', 'Попрошу график по районам и типам ремонта. Если есть окно, ограничим рекламу его вместимостью. Если смен нет, снимаем платный запуск с календаря. Маркетинг уточняет спрос, сервис подтверждает доступные часы, владелец бюджета утверждает лимит после согласования с финансами.'],
    ['Финансы. У нас нет сквозного учёта. Как вы покажете окупаемость?', 'Диспетчер свяжет обращение и заказ-наряд, финансы сверят оплату, сервис даст прямые затраты. Проверим журнал на закрытых заказах. Если доступны только итоги зон, оценим совокупное изменение с оговорками. Если недоступны и они, предложу этап настройки учёта.'],
    ['Финансы. Вклад с заказа упал до 1 600 ₽, а дополнительных ремонтов всего 15. Ваше решение?', '15 × 1 600 ₽ = 24 000 ₽. При расходах 24 000 ₽ пилот вышел в ноль. Для положительного вклада нужен хотя бы шестнадцатый ремонт при тех же условиях. Новый бюджет пока не согласовываю.']
  ]
};
drills.manager.push(
  ['В пилоте выросло число оплат из Авито, зато продажи через Карты упали. Какой результат покажете?', 'Сверю все оплаченные ремонты услуги в обеих зонах и общий вклад по каналам. Если заказ просто сменил источник, дополнительного ремонта нет. Учту изменение суммарных расходов и пересмотрю перераспределение бюджета.'],
  ['В одной зоне вдвое больше мастеров. Достаточно вычесть один прирост из другого?', 'Проверю исходный масштаб, динамику, часы работы и загрузку. Лучше подобрать более похожую зону. Если базы различаются, зафиксирую ожидаемое изменение относительно базы по истории и проверю вывод на другой паре.'],
  ['Сколько можно платить за обращение при конверсии 20% и вкладе 2 000 ₽?', 'При этих допущениях один контакт приносит в среднем 400 ₽ до рекламы. Это верхняя граница для выхода в ноль, если все эти ремонты дополнительные. Для запаса прибыли лимит ставлю ниже и проверяю его по оплатам.'],
  ['Что именно вы называете ростом среднего чека в этом кейсе?', 'Для Авито смотрю на расходы аккаунта на площадке за сопоставимый период. Чек одного ремонта относится к экономике сервиса. Могу обосновать больший месячный бюджет новой прибыльной зоной или услугой.']
);
drills.client.push(
  ['Финансы. Часть заказов закрывают через две недели. Когда сравниваем зоны?', 'Зафиксируем когорты по дате обращения и одинаковое окно до оплаты. Отдельно покажем незакрытые наряды. Решение о бюджете примем, когда обе когорты успеют пройти цикл ремонта.'],
  ['Сервис. Мы поменяли цены в тестовом районе в середине пилота. Теперь что?', 'Запишем дату и услуги, которых коснулось изменение. Проверим, как поменялись запись и вклад. Для решения о продвижении повторим сравнение при одинаковых ценовых условиях.'],
  ['Маркетинг. Клиент написал в чат, потом позвонил и оформил один заказ. Сколько считать?', 'Обращения сохраним для разбора нагрузки. В отчёте об оплатах один закрытый заказ-наряд учитываем один раз. Порядок связывания каналов и удаления дублей согласуем с диспетчерской до запуска.']
);
let role = 'manager';
let index = 0;
function showQuestion() {
  const questions = drills[role];
  const [question, answer] = questions[index];
  byId('position').textContent = 'Вопрос ' + (index + 1) + ' из ' + questions.length;
  byId('question').textContent = question;
  byId('answer').textContent = answer;
  byId('hint').open = false;
  byId('prev').disabled = index === 0;
  byId('next').textContent = index === questions.length - 1 ? 'Пройти ещё раз' : 'Следующий вопрос →';
}
document.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => {
  role = button.dataset.role;
  document.querySelectorAll('[data-role]').forEach(other => other.setAttribute('aria-pressed', String(button === other)));
  index = 0;
  showQuestion();
}));
byId('prev').addEventListener('click', () => { index--; showQuestion(); });
byId('next').addEventListener('click', () => { index = (index + 1) % drills[role].length; showQuestion(); });
showQuestion();

const chooser = byId('slide-choice');
caseSlides.forEach(({title}, i) => chooser.add(new Option((i + 1) + ' / 16 · ' + title, i + 1)));
function renderSlide(number) {
  const slide = caseSlides[number - 1];
  chooser.value = number;
  byId('slide-image').src = 'avito-case/slide-' + String(number).padStart(2, '0') + '.webp';
  byId('slide-image').alt = 'Слайд ' + number + '. ' + slide.title;
  byId('slide-note').textContent = slide.note;
  byId('slide-pdf').href = 'case-kam.pdf#page=' + number;
  byId('prev-slide').disabled = number === 1;
  byId('next-slide').disabled = number === caseSlides.length;
  byId('slide-sources').replaceChildren(...slide.sources.map(([name,url]) => {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = name + ' ↗';
    return link;
  }));
}
function chooseSlide(n) { location.hash = 'slide-' + n; }
chooser.addEventListener('change', () => chooseSlide(Number(chooser.value)));
byId('prev-slide').addEventListener('click', () => chooseSlide(Number(chooser.value) - 1));
byId('next-slide').addEventListener('click', () => chooseSlide(Number(chooser.value) + 1));

function syncView() {
  const hash = location.hash.slice(1);
  const section = byId(hash);
  const prep = new URLSearchParams(location.search).get('mode') === 'prepare' || Boolean(section?.closest('[data-only="prepare"]'));
  const mode = prep ? 'prepare' : 'present';
  document.body.dataset.mode = mode;
  document.querySelectorAll('[data-mode-link]').forEach(link => {
    if (link.dataset.modeLink === mode) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  });
  const match = /^slide-(\d+)$/.exec(hash);
  if (match) {
    renderSlide(Math.max(1, Math.min(Number(match[1]), caseSlides.length)));
    byId('deck').scrollIntoView();
  } else if (section) {
    const parent = section.closest('details');
    if (parent) parent.open = true;
    section.scrollIntoView();
  }
}
document.querySelectorAll('[data-mode-link]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState(null, '', link.href);
  syncView();
  window.scrollTo(0, 0);
}));
window.addEventListener('popstate', syncView);
window.addEventListener('hashchange', syncView);
renderSlide(1);
syncView();
