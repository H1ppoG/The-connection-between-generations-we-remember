/* ============================================================
   «Связь поколений: мы помним» — интерактив
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Утилиты localStorage (с запасным вариантом) ---------- */
  const store = (() => {
    let mem = {};
    try {
      const t = "__svaz_storage_test__";
      localStorage.setItem(t, "1");
      localStorage.removeItem(t);
      return {
        get(k, d) { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); },
        set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
      };
    } catch (e) {
      return {
        get(k, d) { return k in mem ? mem[k] : d; },
        set(k, v) { mem[k] = v; }
      };
    }
  })();

  /* ---------- Локализация ---------- */
  const i18n = window.i18n || { getLang: () => "ru", t: k => k, tt: o => o, tP: k => k };
  const t = (key) => i18n.t(key);
  const tP = (key, params) => (i18n.tP ? i18n.tP(key, params) : i18n.t(key));
  const tt = (obj) => i18n.tt(obj);
  const LANG = () => i18n.getLang();

  /* ---------- Шапка: фон при прокрутке, кнопка «наверх» ---------- */
  const header = $("#header");
  const toTop = $("#to-top");
  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 40);
    toTop.classList.toggle("visible", window.scrollY > 620);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ---------- Мобильное меню ---------- */
  const burger = $("#burger");
  const nav = $("#nav");
  function closeMenu() {
    nav.classList.remove("open");
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  }
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
  });
  $$(".nav__link").forEach(l => l.addEventListener("click", closeMenu));
  document.addEventListener("click", (e) => {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !burger.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  /* ---------- Активный пункт меню ---------- */
  const sections = ["about", "chronicle", "heroes", "memory", "candle", "dialogue", "regiment", "quiz"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const linkById = {};
  $$(".nav__link").forEach(l => { linkById[l.getAttribute("href").slice(1)] = l; });

  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        $$(".nav__link").forEach(l => l.classList.remove("active"));
        const target = linkById[en.target.id];
        if (target) target.classList.add("active");
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => navObserver.observe(s));

  /* ---------- Появление блоков ---------- */
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });
  $$(".reveal").forEach(el => revealObserver.observe(el));

  /* ---------- Анимированные счётчики ---------- */
  const numObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      obs.unobserve(en.target);
      const el = en.target;
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      const hasDecimal = String(el.dataset.count).includes(".");
      const dur = 1500;
      const t0 = performance.now();
      function frame(now) {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = (hasDecimal ? val.toFixed(1) : Math.round(val).toLocaleString(LANG() === "be" ? "be-BY" : "ru-RU")) + suffix;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }, { threshold: 0.4 });
  $$(".stat__num").forEach(el => numObserver.observe(el));

  /* ---------- Свеча памяти ---------- */
  const candle = $("#candle-btn");
  const candleMsg = $("#candle-msg");
  const candleTotalEl = $("#candle-total");
  const candleTotalWord = $("#candle-total-word");

  let candleTotal = 0;
  let candleIsLit = false;
  let candleMode = "server"; // "server" — учёт по IP, "local" — только в браузере

  // Устройство запоминает себя токеном: две разные машины за одним IP — две свечи
  function deviceToken() {
    let t = store.get("candleToken", "");
    if (!t) {
      t = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      store.set("candleToken", t);
    }
    return t;
  }

  function candleWord(n) {
    const d = n % 100;
    const words = t("candle.words").split(","); // [1, 2-4, 5+]
    if (d >= 11 && d <= 14) return words[2];
    const d10 = d % 10;
    if (d10 === 1) return words[0];
    if (d10 >= 2 && d10 <= 4) return words[1];
    return words[2];
  }

  function renderCandle() {
    const lang = LANG();
    if (candleTotalEl) candleTotalEl.textContent = String(candleTotal).toLocaleString(lang === "be" ? "be-BY" : "ru-RU");
    if (candleTotalWord) candleTotalWord.textContent = candleWord(candleTotal);
    if (candleMsg) {
      candleMsg.textContent = candleIsLit
        ? t("candle.msg.lit")
        : t("candle.msg.unlit");
    }
  }

  function setCandleLit(serverTotal) {
    candleIsLit = true;
    candleTotal = typeof serverTotal === "number" ? serverTotal : candleTotal + 1;
    if (candle) {
      candle.classList.add("lit");
      candle.setAttribute("aria-pressed", "true");
      candle.setAttribute("aria-label", t("candle.litAria"));
      candle.setAttribute("aria-disabled", "true");
      candle.title = t("candle.litAria");
      candle.removeAttribute("tabindex");
    }
    store.set("candleLit", "1");
    renderCandle();
  }

  async function initCandle() {
    try {
      const res = await fetch("api/candle?token=" + encodeURIComponent(deviceToken()), { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("no-api");
      const data = await res.json();
      candleTotal = Number(data.total) || 0;
      if (data.lit) { setCandleLit(candleTotal); return; }
      candleMode = "server";
      renderCandle();
    } catch {
      candleMode = "local";
      candleTotal = store.get("candleTotalLocal", 0);
      if (store.get("candleLit", "0") === "1") setCandleLit(candleTotal);
      else renderCandle();
    }
  }

  async function lightCandle() {
    if (candleIsLit) return;
    if (candleMode === "server") {
      try {
        const res = await fetch("api/candle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "light", token: deviceToken() })
        });
        if (!res.ok) throw new Error("bad-status");
        const data = await res.json();
        if (data.status === "limit") {
          if (candleMsg) candleMsg.textContent = t("candle.msg.limit");
          return;
        }
        setCandleLit(Number(data.total) || candleTotal);
        return;
      } catch {
        candleMode = "local";
      }
    }
    candleTotal = store.get("candleTotalLocal", 0) + 1;
    store.set("candleTotalLocal", candleTotal);
    setCandleLit(candleTotal);
  }

  if (candle) {
    candle.addEventListener("click", lightCandle);
    candle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        lightCandle();
      }
    });
  }
  initCandle();

  /* ---------- Викторина ---------- */
  const QUESTIONS = [
    {
      q: { ru: "Когда началась Великая Отечественная война?", be: "Калі пачалася Вялікая Айчынная вайна?" },
      a: [
        { ru: "22 июня 1940 года", be: "22 чэрвеня 1940 года" },
        { ru: "22 июня 1941 года", be: "22 чэрвеня 1941 года" },
        { ru: "1 сентября 1939 года", be: "1 верасня 1939 года" },
        { ru: "5 декабря 1941 года", be: "5 снежня 1941 года" }
      ],
      correct: 1,
      explain: { ru: "22 июня 1941 года фашистская Германия вероломно напала на СССР. Первый удар приняли пограничники и гарнизон Брестской крепости.", be: "22 чэрвеня 1941 года фашысцкая Германія вераломна напала на СССР. Першы ўдар прынялі пагранічнікі і гарнізон Брэсцкай крэпасці." }
    },
    {
      q: { ru: "Сколько дней длилась Великая Отечественная война?", be: "Колькі дзён доўжылася Вялікая Айчынная вайна?" },
      a: [
        { ru: "980 дней", be: "980 дзён" },
        { ru: "1120 дней", be: "1120 дзён" },
        { ru: "1418 дней", be: "1418 дзён" },
        { ru: "1717 дней", be: "1717 дзён" }
      ],
      correct: 2,
      explain: { ru: "Война длилась 1418 дней и ночей — с 22 июня 1941 года по 9 мая 1945 года.", be: "Вайна доўжылася 1418 дзён і начэй — з 22 чэрвеня 1941 года па 9 мая 1945 года." }
    },
    {
      q: { ru: "Какая белорусская деревня стала символом всех сожжённых вместе с жителями деревень?", be: "Якая беларуская вёска стала сімвалам усіх спаленых разам з жыхарамі вёсак?" },
      a: [
        { ru: "Хатынь", be: "Хатынь" },
        { ru: "Ола", be: "Ола" },
        { ru: "Борки", be: "Боркі" },
        { ru: "Дальва", be: "Дальва" }
      ],
      correct: 0,
      explain: { ru: "22 марта 1943 года каратели сожгли Хатынь вместе со 149 жителями, из них 75 детей. Имена погибших увековечены на «Кладбище деревень».", be: "22 сакавіка 1943 года карнікі спалілі Хатынь разам са 149 жыхарамі, з іх 75 дзяцей. Імёны загінуўшых увекавечаны на «Могілках вёсак»." }
    },
    {
      q: { ru: "Как называлась операция, в ходе которой летом 1944 года была освобождена Беларусь?", be: "Як называлася аперацыя, у ходзе якой летам 1944 года была вызвалена Беларусь?" },
      a: [
        { ru: "«Уран»", be: "«Уран»" },
        { ru: "«Цитадель»", be: "«Цытадэль»" },
        { ru: "«Кутузов»", be: "«Кутузаў»" },
        { ru: "«Багратион»", be: "«Баграціён»" }
      ],
      correct: 3,
      explain: { ru: "Операция «Багратион» (23 июня – 29 августа 1944 года) — одна из крупнейших наступательных операций Второй мировой войны.", be: "Аперацыя «Баграціён» (23 чэрвеня – 29 жніўня 1944 года) — адна з найбуйнейшых наступальных аперацый Другой сусветнай вайны." }
    },
    {
      q: { ru: "Когда Минск был освобождён от оккупантов?", be: "Калі Мінск быў вызвалены ад акупантаў?" },
      a: [
        { ru: "3 июля 1944 года", be: "3 ліпеня 1944 года" },
        { ru: "9 мая 1945 года", be: "9 мая 1945 года" },
        { ru: "23 июня 1944 года", be: "23 чэрвеня 1944 года" },
        { ru: "28 июля 1944 года", be: "28 ліпеня 1944 года" }
      ],
      correct: 0,
      explain: { ru: "Минск освобождён 3 июля 1944 года. Эта дата отмечается как День Независимости Республики Беларусь.", be: "Мінск вызвалены 3 ліпеня 1944 года. Гэтая дата адзначаецца як Дзень Незалежнасці Рэспублікі Беларусь." }
    },
    {
      q: { ru: "Сколько жителей Беларуси погибло в годы войны?", be: "Колькі жыхароў Беларусі загінула ў гады вайны?" },
      a: [
        { ru: "около 900 тысяч", be: "каля 900 тысяч" },
        { ru: "более 2,2 миллиона — каждый третий", be: "больш за 2,2 мільёна — кожны трэці" },
        { ru: "около 1 миллиона", be: "каля 1 мільёна" },
        { ru: "более 4 миллионов", be: "больш за 4 мільёны" }
      ],
      correct: 1,
      explain: { ru: "Беларусь потеряла более 2,2 млн жителей — практически каждого третьего. Это самая высокая доля потерь среди союзных республик.", be: "Беларусь страціла больш за 2,2 млн жыхароў — практычна кожнага трэцяга. Гэта самая высокая доля страт сярод саюзных рэспублік." }
    },
    {
      q: { ru: "Кто возглавил оборону Восточного форта Брестской крепости?", be: "Хто ўзначаліў абарону Усходняга форта Брэсцкай крэпасці?" },
      a: [
        { ru: "Пётр Гаврилов", be: "Пётр Гаўрылаў" },
        { ru: "Николай Гастелло", be: "Мікалай Гастэла" },
        { ru: "Константин Заслонов", be: "Канстанцін Заслонаў" },
        { ru: "Иван Якубовский", be: "Іван Якубоўскі" }
      ],
      correct: 0,
      explain: { ru: "Майор Пётр Михайлович Гаврилов руководил обороной Восточного форта до конца июля 1941 года. За мужество удостоен звания Героя Советского Союза.", be: "Маёр Пётр Міхайлавіч Гаўрылаў кіраваў абаронай Усходняга форта да канца ліпеня 1941 года. За мужнасць удастоены звання Героя Савецкага Саюза." }
    },
    {
      q: { ru: "Какое почётное звание получила Брестская крепость в 1965 году?", be: "Якое ганаровае званне атрымала Брэсцкая крэпасць у 1965 годзе?" },
      a: [
        { ru: "«Город-герой»", be: "«Горад-герой»" },
        { ru: "«Крепость-герой»", be: "«Крэпасць-герой»" },
        { ru: "«Трудовой славы»", be: "«Працоўнай славы»" },
        { ru: "«Непокорённая»", be: "«Нескароная»" }
      ],
      correct: 1,
      explain: { ru: "Брестская крепость — единственная крепость, удостоенная звания «Крепость-герой» за выдающуюся стойкость защитников.", be: "Брэсцкая крэпасць — адзіная крэпасць, удастоеная звання «Крэпасць-герой» за выдатную стойкасць абаронцаў." }
    },
    {
      q: { ru: "Уроженец Беларуси, дважды Герой Советского Союза, Маршал Советского Союза — это…", be: "Ураджэнец Беларусі, двойчы Герой Савецкага Саюза, Маршал Савецкага Саюза — гэта…" },
      a: [
        { ru: "Георгий Жуков", be: "Георгій Жукаў" },
        { ru: "Иван Якубовский", be: "Іван Якубоўскі" },
        { ru: "Пётр Машеров", be: "Пётр Машэраў" },
        { ru: "Александр Покрышкин", be: "Аляксандр Пакрышкін" }
      ],
      correct: 1,
      explain: { ru: "Иван Игнатьевич Якубовский — уроженец Могилёвской области, дважды Герой Советского Союза, Маршал Советского Союза.", be: "Іван Ігнатавіч Якубоўскі — ураджэнец Магілёўскай вобласці, двойчы Герой Савецкага Саюза, Маршал Савецкага Саюза." }
    },
    {
      q: { ru: "Сколько лет было Марату Казею, когда он погиб в бою с фашистами?", be: "Колькі гадоў было Марату Казею, калі ён загінуў у баі з фашыстамі?" },
      a: [
        { ru: "12 лет", be: "12 гадоў" },
        { ru: "16 лет", be: "16 гадоў" },
        { ru: "14 лет", be: "14 гадоў" },
        { ru: "15 лет", be: "15 гадоў" }
      ],
      correct: 2,
      explain: { ru: "Пионер-герой Марат Казей из Дзержинского района погиб в 14 лет, подорвав себя гранатой, когда оказался в окружении. Герой Советского Союза (посмертно).", be: "Піянер-герой Марат Казей з Дзяржынскага раёна загінуў у 14 гадоў, падарваўшы сябе гранатай, калі апынуўся ў акружэнні. Герой Савецкага Саюза (пасмяротна)." }
    },
    {
      q: { ru: "Кто из минских подпольщиц лично уничтожила гауляйтера Беларуси Вильгельма Кубе?", be: "Хто з мінскіх падпольшчыц асабіста знішчыла гаўляйтара Беларусі Вільгельма Кубэ?" },
      a: [
        { ru: "Вера Хоружая", be: "Вера Харужая" },
        { ru: "Зина Портнова", be: "Зіна Партнова" },
        { ru: "Елена Мазаник", be: "Алена Мазанік" },
        { ru: "Надежда Троян", be: "Надзея Траян" }
      ],
      correct: 2,
      explain: { ru: "22 сентября 1943 года Елена Мазаник заложила мину в особняк гауляйтера Вильгельма Кубе. Мину доставили Мария Осипова и Надежда Троян.", be: "22 верасня 1943 года Алена Мазанік заклала міну ў асабняк гаўляйтара Вільгельма Кубэ. Міну даставілі Марыя Асіпава і Надзея Траян." }
    },
    {
      q: { ru: "Кто из подпольщиц передала Елене Мазаник мину для гауляйтера Кубе?", be: "Хто з падпольшчыц перадала Алене Мазанік міну для гаўляйтара Кубэ?" },
      a: [
        { ru: "Мария Осипова", be: "Марыя Асіпава" },
        { ru: "Ольга Щербацевич", be: "Вольга Шчэрбацэвіч" },
        { ru: "Вера Хоружая", be: "Вера Харужая" },
        { ru: "Римма Шершнёва", be: "Рыма Шэршнёва" }
      ],
      correct: 0,
      explain: { ru: "Мария Осипова передала мину подпольщице, служившей в доме Кубе. За операцию героини удостоены звания Героя Советского Союза (1943).", be: "Марыя Асіпава перадала міну падпольшчыцы, якая служыла ў доме Кубэ. За аперацыю гераіні ўдастоены звання Героя Савецкага Саюза (1943)." }
    },
    {
      q: { ru: "Минская подпольщица, публично казнённая фашистами вместе с 12-летним сыном в октябре 1941 года, — это…", be: "Мінская падпольшчыца, публічна пакараная смерцю фашыстамі разам з 12-гадовым сынам у кастрычніку 1941 года, — гэта…" },
      a: [
        { ru: "Ульяна Громова", be: "Ульяна Грамава" },
        { ru: "Ольга Щербацевич", be: "Вольга Шчэрбацэвіч" },
        { ru: "Любовь Шевцова", be: "Любоў Шаўцова" },
        { ru: "Елена Колесова", be: "Алена Калесава" }
      ],
      correct: 1,
      explain: { ru: "Ольга Щербацевич укрывала в Минске раненых красноармейцев. Фото её казни вместе с сыном Володей, снятое оккупантами, обошло весь мир.", be: "Вольга Шчэрбацэвіч хавала ў Мінску параненых чырвонаармейцаў. Фота яе пакарання разам з сынам Валодзем, зробленае акупантамі, абляцела ўвесь свет." }
    },
    {
      q: { ru: "Сколько раненых вынесла с поля боя санинструктор Зинаида Туснолобова-Марченко?", be: "Колькі параненых вынесла з поля бою санінструктар Зінаіда Тусналобава-Марчанка?" },
      a: [
        { ru: "48", be: "48" },
        { ru: "75", be: "75" },
        { ru: "123", be: "123" },
        { ru: "210", be: "210" }
      ],
      correct: 2,
      explain: { ru: "За 8 месяцев на фронте Зинаида Туснолобова вынесла 123 раненых. После ранения в 1943 году потеряла руки и ноги. Герой Советского Союза (1957).", be: "За 8 месяцаў на фронце Зінаіда Тусналобава вынесла 123 параненых. Пасля ранення ў 1943 годзе страціла рукі і ногі. Герой Савецкага Саюза (1957)." }
    },
    {
      q: { ru: "Какой подвиг совершила юная партизанка из Гомельщины Римма Шершнёва?", be: "Які подзвіг здзейсніла юная партызанка з Гомельшчыны Рыма Шэршнёва?" },
      a: [
        { ru: "Закрыла собой амбразуру вражеского дзота", be: "Закрыла сабой амбразуру варожага дзота" },
        { ru: "Подорвала себя вместе с врагами", be: "Падарвала сябе разам з ворагамі" },
        { ru: "Угнала вражеский эшелон", be: "Выкрала варожы эшалон" },
        { ru: "Вынесла знамя полка из окружения", be: "Вынесла сцяг палка з акружэння" }
      ],
      correct: 0,
      explain: { ru: "Римма Шершнёва — первая и единственная женщина, закрывшая своим телом амбразуру вражеского дзота. Погибла в декабре 1942 года. Герой Советского Союза (посмертно).", be: "Рыма Шэршнёва — першая і адзіная жанчына, якая закрыла сваім целам амбразуру варожага дзота. Загінула ў снежні 1942 года. Герой Савецкага Саюза (пасмяротна)." }
    }
  ];

  const quizBox = $("#quiz-box");
  const progress = $("#quiz-progress");
  const counter = $("#quiz-counter");
  const question = $("#quiz-question");
  const answers = $("#quiz-answers");
  const explain = $("#quiz-explain");
  const nextBtn = $("#quiz-next");
  const result = $("#quiz-result");
  const resultScore = $("#quiz-result-score");
  const resultText = $("#quiz-result-text");
  const restartBtn = $("#quiz-restart");

  let quizIndex = 0;
  let quizScore = 0;
  let quizOrder = [];     // перемешанный порядок вопросов (индексы в QUESTIONS)
  let answerOrders = [];  // для каждого вопроса: новая позиция -> исходный индекс ответа
  let active = null;      // текущий вопрос с перемешанными ответами
  const LETTERS = ["А", "Б", "В", "Г"];

  function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startQuiz() {
    quizIndex = 0;
    quizScore = 0;
    quizOrder = shuffleArr(QUESTIONS.map((_, i) => i));
    answerOrders = quizOrder.map(qi => shuffleArr(QUESTIONS[qi].a.map((_, i) => i)));
    question.hidden = false;
    counter.hidden = false;
    result.hidden = true;
    renderQuiz();
  }

  function resultMessage(score, total) {
    const pct = score / total;
    if (pct >= 0.9) return t("quiz.res.90");
    if (pct >= 0.7) return t("quiz.res.70");
    if (pct >= 0.5) return t("quiz.res.50");
    return t("quiz.res.low");
  }

  function renderQuiz() {
    const bare = QUESTIONS[quizOrder[quizIndex]];
    const order = answerOrders[quizIndex];
    active = {
      q: tt(bare.q),
      a: order.map(oi => tt(bare.a[oi])),
      correct: order.indexOf(bare.correct),
      explain: tt(bare.explain)
    };
    progress.style.width = ((quizIndex) / QUESTIONS.length * 100) + "%";
    counter.textContent = tP("quiz.counter", { n: quizIndex + 1, m: QUESTIONS.length });
    question.textContent = active.q;
    explain.hidden = true;
    explain.textContent = "";
    nextBtn.hidden = true;
    answers.innerHTML = "";
    active.a.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.className = "quiz__answer";
      btn.type = "button";
      btn.innerHTML = '<span class="quiz__answer-letter">' + LETTERS[i] + "</span><span>" + text + "</span>";
      btn.addEventListener("click", () => choose(i, btn));
      answers.appendChild(btn);
    });
  }

  function choose(i, btn) {
    $$(".quiz__answer").forEach(b => b.disabled = true);
    const btns = $$(".quiz__answer");
    btns[active.correct].classList.add("correct");
    if (i !== active.correct) btn.classList.add("wrong");
    else quizScore += 1;
    explain.hidden = false;
    explain.innerHTML = (i === active.correct ? t("quiz.right") : t("quiz.wrong")) + active.explain;
    nextBtn.hidden = false;
  }

  nextBtn.addEventListener("click", () => {
    quizIndex += 1;
    if (quizIndex < QUESTIONS.length) {
      renderQuiz();
    } else {
      progress.style.width = "100%";
      quizBox.classList.add("quiz--done");
      answers.innerHTML = "";
      question.hidden = true;
      counter.hidden = true;
      explain.hidden = true;
      nextBtn.hidden = true;
      result.hidden = false;
      resultScore.textContent = tP("quiz.score", { s: quizScore, t: QUESTIONS.length });
      resultText.textContent = resultMessage(quizScore, QUESTIONS.length);
    }
  });

  restartBtn.addEventListener("click", startQuiz);

  startQuiz();

  /* ---------- Бессмертный полк ---------- */
  const regimentList = $("#regiment-list");
  const regimentForm = $("#regiment-form");
  const regimentSearch = $("#regiment-search");
  const regimentCount = $("#regiment-count");
  const regimentStatus = $("#regiment-status");
  const photoInput = $("#regiment-photo");
  const photoPreview = $("#regiment-photo-preview");

  /* Примеры для показа, когда проект открыт без сервера */
  const REGIMENT_SEED = [
    {
      name: { ru: "Иван Петрович Ковалёв", be: "Іван Пятровіч Кавалёў" },
      years: "1909–1944",
      rank: { ru: "Партизан, пулемётчик отряда «Мститель»", be: "Партызан, кулямётчык атрада «Мсцівец»" },
      place: { ru: "Логойский район", be: "Лагойскі раён" },
      text: {
        ru: "До войны прадед работал на Минском тракторном заводе. В 1942 году ушёл в партизанский отряд. Погиб в июне 1944 года при разгроме вражеского гарнизона — в последних боях перед освобождением родных мест. Похоронен в братской могиле под Логойском. В семье хранится его наградной лист и письмо, написанное за день до гибели.",
        be: "Да вайны прадзед працаваў на Мінскім трактарным заводзе. У 1942 годзе пайшоў у партызанскі атрад. Загінуў у чэрвені 1944 года пры разгроме варожага гарнізона — у апошніх баях перад вызваленнем родных мясцін. Пахаваны ў брацкай магіле каля Лагойска. У сям'і захоўваецца яго ўзнагародны ліст і ліст, напісаны за дзень да гібелі."
      },
      author: { ru: "Рассказ правнука (пример)", be: "Аповед праўнука (прыклад)" }
    },
    {
      name: { ru: "Анна Григорьевна Миронович", be: "Ганна Рыгораўна Мірановіч" },
      years: "1923–2017",
      rank: { ru: "Труженица тыла", be: "Працаўніца тылу" },
      place: { ru: "Минская область", be: "Мінская вобласць" },
      text: {
        ru: "Бабушке было 18 лет, когда началась война. Днём работала в поле — убирала хлеб для фронта, а ночью в госпитале помогала медсёстрам: стирала бинты, дежурила у раненых. Всю жизнь берегла фронтовое письмо старшего брата. Он не вернулся… Память о нём в нашей семье жива до сих пор.",
        be: "Бабушцы было 18 гадоў, калі пачалася вайна. Днём працавала ў полі — прыбірала хлеб для фронту, а ўначы ў шпіталі дапамагала медсёстрам: прала бінты, дзяжурыла каля параненых. Усё жыццё берагла франтавы ліст старэйшага брата. Ён не вярнуўся… Памяць пра яго ў нашай сям'і жывая дагэтуль."
      },
      author: { ru: "Рассказ правнучки (пример)", be: "Аповед праўнучкі (прыклад)" }
    }
  ];

  let regimentItems = [];
  let regimentMode = "server";

  function setRegimentStatus(text, kind) {
    if (!regimentStatus) return;
    regimentStatus.textContent = text;
    regimentStatus.className = "regiment-status" + (kind ? " regiment-status--" + kind : "");
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    const a = parts[0] ? parts[0][0] : "";
    const b = parts[1] ? parts[1][0] : "";
    return (a + b).toUpperCase() || "Г";
  }

  function pluralVeteran(n) {
    const d = n % 100;
    const words = t("regiment.words").split(","); // [1, 2-4, 5+]
    if (d >= 11 && d <= 14) return words[2];
    const d10 = d % 10;
    if (d10 === 1) return words[0];
    if (d10 >= 2 && d10 <= 4) return words[1];
    return words[2];
  }

  function setRegimentCount(n) {
    if (regimentCount) regimentCount.textContent = n + " " + pluralVeteran(n);
  }

  function regimentCardEl(item) {
    const card = document.createElement("article");
    card.className = "regiment-card";
    const imgBlock = item.photo
      ? '<div class="regiment-card__img"><img src="' + item.photo + '" alt="Портрет: ' + (tt(item.name) || "") + '"></div>'
      : '<div class="regiment-card__img regiment-card__img--medal"><span class="regiment-card__medal">' + initials(tt(item.name)) + '</span></div>';
    const meta = [tt(item.place), item.years].filter(Boolean).join(" · ");
    card.innerHTML =
      imgBlock +
      '<div class="regiment-card__body">' +
        '<h3 class="regiment-card__name"></h3>' +
        '<p class="regiment-card__meta">' + meta + '</p>' +
        '<p class="regiment-card__role"></p>' +
        '<p class="regiment-card__text"></p>' +
        '<p class="regiment-card__author"></p>' +
        (item.text && tt(item.text).length > 300 ? '<button class="regiment-card__more" type="button">' + t("regiment.more") + '</button>' : "") +
      "</div>";
    card.querySelector(".regiment-card__name").textContent = tt(item.name);
    card.querySelector(".regiment-card__role").textContent = tt(item.rank);
    const textEl = card.querySelector(".regiment-card__text");
    textEl.textContent = tt(item.text);
    card.querySelector(".regiment-card__author").textContent = item.author ? t("regiment.authorBy") + " " + tt(item.author) : "";
    if (item.text && tt(item.text).length > 300) {
      const more = card.querySelector(".regiment-card__more");
      more.addEventListener("click", () => {
        const expanded = textEl.classList.toggle("expanded");
        more.textContent = expanded ? t("regiment.collapse") : t("regiment.more");
      });
    }
    return card;
  }

  function renderRegiment(list) {
    regimentList.innerHTML = "";
    if (!list || list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "regiment-empty";
      empty.textContent = t("regiment.empty");
      regimentList.appendChild(empty);
      return;
    }
    list.forEach(item => regimentList.appendChild(regimentCardEl(item)));
  }

  function applyRegimentSearch() {
    const q = (regimentSearch ? regimentSearch.value : "").trim().toLowerCase();
    if (!q) { renderRegiment(regimentItems); return; }
    renderRegiment(regimentItems.filter(i =>
      (i.name || "").toLowerCase().includes(q) ||
      (i.rank || "").toLowerCase().includes(q) ||
      (i.place || "").toLowerCase().includes(q)
    ));
  }

  async function loadRegiment() {
    try {
      const res = await fetch("api/regiment", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("no-api");
      const data = await res.json();
      regimentMode = "server";
      regimentItems = data.items || [];
      setRegimentCount(regimentItems.length);
      renderRegiment(regimentItems);
    } catch {
      regimentMode = "local";
      regimentItems = REGIMENT_SEED;
      renderRegiment(regimentItems);
      setRegimentStatus(t("regiment.status.demo"), "warn");
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      if (!file) return resolve(null);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 800;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  if (photoInput && photoPreview) {
    photoInput.addEventListener("change", () => {
      const f = photoInput.files[0];
      if (!f) { photoPreview.innerHTML = ""; return; }
      fileToDataUrl(f).then(data => {
        photoPreview.innerHTML = data ? '<img src="' + data + '" alt="' + t("regiment.photoPreview") + '">' : "";
      });
    });
  }

  if (regimentForm) {
    regimentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const gv = id => $("#" + id).value.trim();
      const payload = {
        name: gv("reg-name"),
        years: gv("reg-years"),
        rank: gv("reg-rank"),
        place: gv("reg-place"),
        text: gv("reg-text"),
        author: gv("reg-author"),
        photo: null
      };
      if (!payload.name || !payload.text || !payload.author) return;
      if (photoInput && photoInput.files && photoInput.files[0]) {
        payload.photo = await fileToDataUrl(photoInput.files[0]);
      }
      try {
        const res = await fetch("api/regiment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setRegimentStatus(t("regiment.status.bad"), "warn"); return; }
        setRegimentStatus(t("regiment.status.ok"), "ok");
        regimentForm.reset();
        if (photoPreview) photoPreview.innerHTML = "";
      } catch {
        setRegimentStatus(t("regiment.status.offline"), "warn");
      }
    });
  }

  if (regimentSearch) regimentSearch.addEventListener("input", applyRegimentSearch);

  loadRegiment();

  /* ---------- Лайтбокс ---------- */
  let galleryItems = [];
  function buildGalleryItems() {
    galleryItems = $$(".gallery__item").map(fig => ({
      src: fig.querySelector("img").src,
      alt: fig.querySelector("img").getAttribute("alt"),
      caption: fig.querySelector("h3").textContent + " · " + fig.querySelector(".gallery__year").textContent + " — " + fig.querySelector(".gallery__short").textContent
    }));
  }
  buildGalleryItems();
  const lightbox = $("#lightbox");
  const lbImg = $("#lightbox-img");
  const lbCaption = $("#lightbox-caption");
  let lbIndex = 0;

  function openLightbox(i) {
    lbIndex = i;
    lbImg.src = galleryItems[i].src;
    lbImg.alt = galleryItems[i].alt;
    lbCaption.textContent = galleryItems[i].caption;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = "";
  }
  function stepLightbox(d) {
    lbIndex = (lbIndex + d + galleryItems.length) % galleryItems.length;
    lbImg.src = galleryItems[lbIndex].src;
    lbImg.alt = galleryItems[lbIndex].alt;
    lbCaption.textContent = galleryItems[lbIndex].caption;
  }

  $$(".gallery__item").forEach((fig, i) => {
    const photo = fig.querySelector(".gallery__photo");
    const expand = fig.querySelector(".gallery__expand");
    const short = fig.querySelector(".gallery__short");
    const btn = fig.querySelector(".gallery__more");

    const toggleExpand = () => {
      const open = fig.classList.toggle("expanded");
      if (expand) expand.hidden = !open;
      if (short) short.hidden = open;
      if (btn) {
        btn.textContent = open ? t("gallery.collapse") : t("gallery.more");
        btn.setAttribute("aria-expanded", String(open));
      }
    };

    if (photo) {
      photo.addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox(i);
      });
      photo.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(i);
        }
      });
    }
    /* Клик по карточке раскрывает историю */
    fig.addEventListener("click", toggleExpand);
  });
  $("#lightbox-close").addEventListener("click", closeLightbox);
  $("#lightbox-prev").addEventListener("click", () => stepLightbox(-1));
  $("#lightbox-next").addEventListener("click", () => stepLightbox(1));
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  /* ---------- Герои: подробная информация по клику на портрет ---------- */
  const heroCards = $$(".hero-card");
  const hm = $("#hero-modal");
  const hmImg = $("#hm-img");
  const hmLife = $("#hm-life");
  const hmName = $("#hm-name");
  const hmRole = $("#hm-role");
  const hmBio = $("#hm-bio");
  const hmDeeds = $("#hm-deeds");
  let hmIndex = 0;
  let hmOpener = null;

  /* n — порядковый номер карточки, совпадает с ключами hero.N.* */
  function heroData(card) {
    const n = heroCards.indexOf(card) + 1;
    const img = card.querySelector("img");
    return {
      src: img ? img.currentSrc || img.src : "",
      alt: img ? img.alt : "",
      life: t("hero." + n + ".life"),
      name: t("hero." + n + ".name"),
      role: t("hero." + n + ".role"),
      bio: t("hero." + n + ".bio"),
      deeds: [t("hero." + n + ".deed1"), t("hero." + n + ".deed2"), t("hero." + n + ".deed3")]
        .filter((s) => s && s.indexOf("hero.") !== 0),
    };
  }

  function paintHero(i) {
    const d = heroData(heroCards[i]);
    hmIndex = i;
    hmImg.src = d.src;
    hmImg.alt = d.alt;
    hmLife.textContent = d.life;
    hmLife.hidden = !d.life || d.life.indexOf("hero.") === 0;
    hmName.textContent = d.name;
    hmRole.textContent = d.role;
    hmBio.textContent = d.bio;
    hmDeeds.innerHTML = "";
    d.deeds.forEach((txt) => {
      const li = document.createElement("li");
      li.textContent = txt;
      hmDeeds.appendChild(li);
    });
    hmDeeds.hidden = d.deeds.length === 0;
  }

  /* Центрирует стрелки по фотографии */
  function centerHeroNav() {
    const fig = hm.querySelector(".hero-modal__figure");
    if (!fig || hm.hidden) return;
    const f = fig.getBoundingClientRect();
    const host = hm.getBoundingClientRect();
    const offset = f.top + f.height / 2 - host.top;
    hm.style.setProperty("--hm-nav-y", offset + "px");
  }

  function openHero(i, opener) {
    paintHero(i);
    hmOpener = opener || null;
    hm.hidden = false;
    document.body.style.overflow = "hidden";
    centerHeroNav();
    $("#hm-close").focus();
  }
  function closeHero() {
    hm.hidden = true;
    document.body.style.overflow = "";
    if (hmOpener) { hmOpener.focus(); hmOpener = null; }
  }
  function stepHero(d) {
    paintHero((hmIndex + d + heroCards.length) % heroCards.length);
    centerHeroNav();
  }

  heroCards.forEach((card, i) => {
    const photo = card.querySelector(".hero-card__photo");
    if (!photo) return;
    photo.classList.add("is-clickable");
    photo.setAttribute("tabindex", "0");
    photo.setAttribute("role", "button");
    const open = () => openHero(i, photo);
    photo.addEventListener("click", open);
    photo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
  $("#hm-close").addEventListener("click", closeHero);
  $("#hm-prev").addEventListener("click", () => stepHero(-1));
  $("#hm-next").addEventListener("click", () => stepHero(1));
  hmImg.addEventListener("load", centerHeroNav);
  window.addEventListener("resize", centerHeroNav);
  hm.addEventListener("click", (e) => { if (e.target === hm) closeHero(); });
  document.addEventListener("keydown", (e) => {
    if (hm.hidden) return;
    if (e.key === "Escape") closeHero();
    if (e.key === "ArrowLeft") stepHero(-1);
    if (e.key === "ArrowRight") stepHero(1);
  });

  /* Подписи на портретах */
  function paintHeroPhotoLabels() {
    heroCards.forEach((card) => {
      const photo = card.querySelector(".hero-card__photo");
      if (!photo) return;
      const n = heroCards.indexOf(card) + 1;
      photo.setAttribute("data-more", t("heroes.more"));
      photo.setAttribute("aria-label", tP("heroes.open", { name: t("hero." + n + ".name") }));
    });
  }
  paintHeroPhotoLabels();

  /* ---------- Год в подвале ---------- */
  const yearEl = $("#footer-year");
  function setYear() {
    if (yearEl) yearEl.textContent = tP("footer.year", { y: new Date().getFullYear() });
  }
  setYear();

  /* ---------- Переключение языка ---------- */
  document.addEventListener("svaz:langchange", () => {
    renderCandle();
    startQuiz();
    buildGalleryItems();
    if (regimentItems.length || regimentMode) {
      setRegimentCount(regimentItems.length);
      renderRegiment(regimentItems);
    }
    setYear();
    paintHeroPhotoLabels();
    if (!hm.hidden) paintHero(hmIndex);
  });
})();
