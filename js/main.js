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
        el.textContent = (hasDecimal ? val.toFixed(1) : Math.round(val).toLocaleString("ru-RU")) + suffix;
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
    if (d >= 11 && d <= 14) return "свечей";
    const d10 = d % 10;
    if (d10 === 1) return "свеча";
    if (d10 >= 2 && d10 <= 4) return "свечи";
    return "свечей";
  }

  function renderCandle() {
    if (candleTotalEl) candleTotalEl.textContent = String(candleTotal);
    if (candleTotalWord) candleTotalWord.textContent = candleWord(candleTotal);
    if (candleMsg) {
      candleMsg.textContent = candleIsLit
        ? "Спасибо! Ваша свеча горит в память о героях."
        : "Нажмите на свечу, чтобы зажечь её в память о героях.";
    }
  }

  function setCandleLit(serverTotal) {
    candleIsLit = true;
    candleTotal = typeof serverTotal === "number" ? serverTotal : candleTotal + 1;
    if (candle) {
      candle.classList.add("lit");
      candle.setAttribute("aria-pressed", "true");
      candle.setAttribute("aria-label", "Свеча зажжена");
      candle.setAttribute("aria-disabled", "true");
      candle.title = "Свеча зажжена";
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
          if (candleMsg) candleMsg.textContent = "На этом адресе уже зажжено много свечей — попробуйте позже.";
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
      q: "Когда началась Великая Отечественная война?",
      a: ["22 июня 1940 года", "22 июня 1941 года", "1 сентября 1939 года", "5 декабря 1941 года"],
      correct: 1,
      explain: "22 июня 1941 года фашистская Германия вероломно напала на СССР. Первый удар приняли пограничники и гарнизон Брестской крепости."
    },
    {
      q: "Сколько дней длилась Великая Отечественная война?",
      a: ["980 дней", "1120 дней", "1418 дней", "1717 дней"],
      correct: 2,
      explain: "Война длилась 1418 дней и ночей — с 22 июня 1941 года по 9 мая 1945 года."
    },
    {
      q: "Какая белорусская деревня стала символом всех сожжённых вместе с жителями деревень?",
      a: ["Хатынь", "Ола", "Борки", "Дальва"],
      correct: 0,
      explain: "22 марта 1943 года каратели сожгли Хатынь вместе со 149 жителями, из них 75 детей. Имена погибших увековечены на «Кладбище деревень»."
    },
    {
      q: "Как называлась операция, в ходе которой летом 1944 года была освобождена Беларусь?",
      a: ["«Уран»", "«Цитадель»", "«Кутузов»", "«Багратион»"],
      correct: 3,
      explain: "Операция «Багратион» (23 июня – 29 августа 1944 года) — одна из крупнейших наступательных операций Второй мировой войны."
    },
    {
      q: "Когда Минск был освобождён от оккупантов?",
      a: ["3 июля 1944 года", "9 мая 1945 года", "23 июня 1944 года", "28 июля 1944 года"],
      correct: 0,
      explain: "Минск освобождён 3 июля 1944 года. Эта дата отмечается как День Независимости Республики Беларусь."
    },
    {
      q: "Сколько жителей Беларуси погибло в годы войны?",
      a: ["около 900 тысяч", "более 2,2 миллиона — каждый третий", "около 1 миллиона", "более 4 миллионов"],
      correct: 1,
      explain: "Беларусь потеряла более 2,2 млн жителей — практически каждого третьего. Это самая высокая доля потерь среди союзных республик."
    },
    {
      q: "Кто возглавил оборону Восточного форта Брестской крепости?",
      a: ["Пётр Гаврилов", "Николай Гастелло", "Константин Заслонов", "Иван Якубовский"],
      correct: 0,
      explain: "Майор Пётр Михайлович Гаврилов руководил обороной Восточного форта до конца июля 1941 года. За мужество удостоен звания Героя Советского Союза."
    },
    {
      q: "Какое почётное звание получила Брестская крепость в 1965 году?",
      a: ["«Город-герой»", "«Крепость-герой»", "«Трудовой славы»", "«Непокорённая»"],
      correct: 1,
      explain: "Брестская крепость — единственная крепость, удостоенная звания «Крепость-герой» за выдающуюся стойкость защитников."
    },
    {
      q: "Уроженец Беларуси, дважды Герой Советского Союза, Маршал Советского Союза — это…",
      a: ["Георгий Жуков", "Иван Якубовский", "Пётр Машеров", "Александр Покрышкин"],
      correct: 1,
      explain: "Иван Игнатьевич Якубовский — уроженец Могилёвской области, дважды Герой Советского Союза, Маршал Советского Союза."
    },
    {
      q: "Сколько лет было Марату Казею, когда он погиб в бою с фашистами?",
      a: ["12 лет", "16 лет", "14 лет", "15 лет"],
      correct: 2,
      explain: "Пионер-герой Марат Казей из Дзержинского района погиб в 14 лет, подорвав себя гранатой, когда оказался в окружении. Герой Советского Союза (посмертно)."
    },
    {
      q: "Кто из минских подпольщиц лично уничтожила гауляйтера Беларуси Вильгельма Кубе?",
      a: ["Вера Хоружая", "Зина Портнова", "Елена Мазаник", "Надежда Троян"],
      correct: 2,
      explain: "22 сентября 1943 года Елена Мазаник заложила мину в особняк гауляйтера Вильгельма Кубе. Мину доставили Мария Осипова и Надежда Троян."
    },
    {
      q: "Кто из подпольщиц передала Елене Мазаник мину для гауляйтера Кубе?",
      a: ["Мария Осипова", "Ольга Щербацевич", "Вера Хоружая", "Римма Шершнёва"],
      correct: 0,
      explain: "Мария Осипова передала мину подпольщице, служившей в доме Кубе. За операцию героини удостоены звания Героя Советского Союза (1943)."
    },
    {
      q: "Минская подпольщица, публично казнённая фашистами вместе с 12-летним сыном в октябре 1941 года, — это…",
      a: ["Ульяна Громова", "Ольга Щербацевич", "Любовь Шевцова", "Елена Колесова"],
      correct: 1,
      explain: "Ольга Щербацевич укрывала в Минске раненых красноармейцев. Фото её казни вместе с сыном Володей, снятое оккупантами, обошло весь мир."
    },
    {
      q: "Сколько раненых вынесла с поля боя санинструктор Зинаида Туснолобова-Марченко?",
      a: ["48", "75", "123", "210"],
      correct: 2,
      explain: "За 8 месяцев на фронте Зинаида Туснолобова вынесла 123 раненых. После ранения в 1943 году потеряла руки и ноги. Герой Советского Союза (1957)."
    },
    {
      q: "Какой подвиг совершила юная партизанка из Гомельщины Римма Шершнёва?",
      a: ["Закрыла собой амбразуру вражеского дзота", "Подорвала себя вместе с врагами", "Угнала вражеский эшелон", "Вынесла знамя полка из окружения"],
      correct: 0,
      explain: "Римма Шершнёва — первая и единственная женщина, закрывшая своим телом амбразуру вражеского дзота. Погибла в декабре 1942 года. Герой Советского Союза (посмертно)."
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
    if (pct >= 0.9) return "Блестящий результат! Вы настоящий хранитель исторической памяти. Расскажите о проекте друзьям — память объединяет поколения.";
    if (pct >= 0.7) return "Отличный результат! Вы хорошо знаете историю. Загляните в разделы «Хроника» и «Герои», чтобы узнать ещё больше.";
    if (pct >= 0.5) return "Хороший результат! Но память можно укрепить — пройдитесь по разделам сайта и вернитесь к викторине ещё раз.";
    return "Стоит больше узнать о подвиге нашего народа. Откройте «Хронику» и «Места памяти» — и попробуйте пройти викторину снова. Помнить — это важно!";
  }

  function renderQuiz() {
    const bare = QUESTIONS[quizOrder[quizIndex]];
    const order = answerOrders[quizIndex];
    active = {
      q: bare.q,
      a: order.map(oi => bare.a[oi]),
      correct: order.indexOf(bare.correct),
      explain: bare.explain
    };
    progress.style.width = ((quizIndex) / QUESTIONS.length * 100) + "%";
    counter.textContent = "Вопрос " + (quizIndex + 1) + " из " + QUESTIONS.length;
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
    explain.innerHTML = (i === active.correct ? "✅ Верно! " : "❌ Не совсем. ") + active.explain;
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
      resultScore.textContent = "Ваш результат: " + quizScore + " из " + QUESTIONS.length;
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
      name: "Иван Петрович Ковалёв",
      years: "1909–1944",
      rank: "Партизан, пулемётчик отряда «Мститель»",
      place: "Логойский район",
      text: "До войны прадед работал на Минском тракторном заводе. В 1942 году ушёл в партизанский отряд. Погиб в июне 1944 года при разгроме вражеского гарнизона — в последних боях перед освобождением родных мест. Похоронен в братской могиле под Логойском. В семье хранится его наградной лист и письмо, написанное за день до гибели.",
      author: "Рассказ правнука (пример)"
    },
    {
      name: "Анна Григорьевна Миронович",
      years: "1923–2017",
      rank: "Труженица тыла",
      place: "Минская область",
      text: "Бабушке было 18 лет, когда началась война. Днём работала в поле — убирала хлеб для фронта, а ночью в госпитале помогала медсёстрам: стирала бинты, дежурила у раненых. Всю жизнь берегла фронтовое письмо старшего брата. Он не вернулся… Память о нём в нашей семье жива до сих пор.",
      author: "Рассказ правнучки (пример)"
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
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "ветеран";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "ветерана";
    return "ветеранов";
  }

  function setRegimentCount(n) {
    if (regimentCount) regimentCount.textContent = n + " " + pluralVeteran(n);
  }

  function regimentCardEl(item) {
    const card = document.createElement("article");
    card.className = "regiment-card";
    const imgBlock = item.photo
      ? '<div class="regiment-card__img"><img src="' + item.photo + '" alt="Портрет: ' + (item.name || "") + '"></div>'
      : '<div class="regiment-card__img regiment-card__img--medal"><span class="regiment-card__medal">' + initials(item.name) + '</span></div>';
    const meta = [item.place, item.years].filter(Boolean).join(" · ");
    card.innerHTML =
      imgBlock +
      '<div class="regiment-card__body">' +
        '<h3 class="regiment-card__name"></h3>' +
        '<p class="regiment-card__meta">' + meta + '</p>' +
        '<p class="regiment-card__role"></p>' +
        '<p class="regiment-card__text"></p>' +
        '<p class="regiment-card__author"></p>' +
        (item.text && item.text.length > 300 ? '<button class="regiment-card__more" type="button">Читать далее</button>' : "") +
      "</div>";
    card.querySelector(".regiment-card__name").textContent = item.name;
    card.querySelector(".regiment-card__role").textContent = item.rank;
    const textEl = card.querySelector(".regiment-card__text");
    textEl.textContent = item.text;
    card.querySelector(".regiment-card__author").textContent = item.author ? "Историю добавил(а): " + item.author : "";
    if (item.text && item.text.length > 300) {
      const more = card.querySelector(".regiment-card__more");
      more.addEventListener("click", () => {
        const expanded = textEl.classList.toggle("expanded");
        more.textContent = expanded ? "Свернуть" : "Читать далее";
      });
    }
    return card;
  }

  function renderRegiment(list) {
    regimentList.innerHTML = "";
    if (!list || list.length === 0) {
      regimentList.innerHTML = '<p class="regiment-empty">В полку пока никто не добавлен. Станьте первым — расскажите о своём родственнике.</p>';
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
      setRegimentStatus("Сервер недоступен — показаны примеры. Чтобы добавить ветерана, запустите проект: node server.js", "warn");
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
        photoPreview.innerHTML = data ? '<img src="' + data + '" alt="Предпросмотр фото ветерана">' : "";
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
        if (!res.ok) { setRegimentStatus("Не удалось отправить заявку. Проверьте текст и повторите.", "warn"); return; }
        setRegimentStatus("Спасибо! Заявка отправлена на модерацию — после проверки ветеран появится в полку.", "ok");
        regimentForm.reset();
        if (photoPreview) photoPreview.innerHTML = "";
      } catch {
        setRegimentStatus("Сервер недоступен — заявка не отправлена. Запустите проект через node server.js.", "warn");
      }
    });
  }

  if (regimentSearch) regimentSearch.addEventListener("input", applyRegimentSearch);

  loadRegiment();

  /* ---------- Лайтбокс ---------- */
  const galleryItems = $$(".gallery__item").map(fig => ({
    src: fig.querySelector("img").src,
    alt: fig.querySelector("img").alt,
    caption: fig.querySelector("h3").textContent + " · " + fig.querySelector(".gallery__year").textContent + " — " + fig.querySelector("p").textContent
  }));
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
        btn.textContent = open ? "Свернуть" : "Читать далее";
        btn.setAttribute("aria-expanded", String(open));
        btn.setAttribute("aria-label", open ? "Свернуть рассказ о мемориале" : "Читать далее о мемориале");
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
    /* Клик по карточке (кроме фото) раскрывает историю; кнопка «Читать далее» — то же самое */
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

  /* ---------- Год в подвале ---------- */
  const yearEl = $("#footer-year");
  if (yearEl) yearEl.textContent = "© " + new Date().getFullYear() + " «Связь поколений: мы помним»";
})();
