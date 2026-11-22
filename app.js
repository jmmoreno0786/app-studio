/* App Studio — app de estudio sin dependencias.
 * Todo se guarda en el navegador (localStorage). Usa "Zona padres > Copia de seguridad"
 * para exportar/importar los datos entre dispositivos. */
(() => {
  'use strict';

  const { COURSES, MATH_BY_LEVEL, STARTER_BY_COURSE } = window.APP_CONTENT;
  const STORAGE_KEY = 'app-studio-v2';
  const LEGACY_KEY = 'app-studio-v1';
  const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14]; // caja 1..5 (repaso espaciado tipo Leitner)
  const POINTS_CARD = 10;
  const POINTS_MATH = 5;
  const QUIZ_LENGTH = 10;
  const MATH_LENGTH = 10;

  // ---------- Utilidades ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[rand(0, arr.length - 1)];
  const todayStr = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const addDays = (dateStr, n) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return todayStr(new Date(y, m - 1, d + n));
  };
  // Para comparar respuestas escritas: sin mayúsculas, tildes, signos ni artículo inicial.
  const normalize = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"'()]/g, '')
    .replace(/[\/\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(el|la|los|las|un|una|the|a|an) /, '');

  const courseById = (id) => COURSES.find((c) => c.id === id);
  const levelOf = (profile) => (courseById(profile?.course) || COURSES[6]).level;

  // ---------- Datos ----------
  const newCard = (q, a) => ({ id: uid(), q, a, box: 1, due: todayStr() });
  const starterDecks = (courseId) => (STARTER_BY_COURSE[courseId] || []).map((d) => ({
    id: uid(), name: d.name, emoji: d.emoji, cards: d.cards.map(([q, a]) => newCard(q, a)),
  }));
  const newProfile = (name, course, withStarter) => ({
    id: uid(), name, course, points: 0, streak: 0, lastStudy: null, history: {},
    decks: withStarter ? starterDecks(course) : [],
  });

  // Convierte el formato antiguo (un solo usuario) al nuevo (varios perfiles).
  function migrate(old) {
    if (old && old.version === 2 && Array.isArray(old.profiles)) return old;
    if (old && old.profile && Array.isArray(old.decks)) {
      const p = old.profile;
      const prof = {
        id: uid(), name: p.name || 'Estudiante', course: null, points: p.points || 0, streak: p.streak || 0,
        lastStudy: p.lastStudy || null, history: p.history || {}, decks: old.decks,
      };
      return { version: 2, activeId: prof.id, profiles: [prof] };
    }
    return null;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const d = migrate(JSON.parse(raw)); if (d) return d; }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) { const d = migrate(JSON.parse(legacy)); if (d) return d; }
    } catch (e) { /* almacenamiento no disponible: seguimos en memoria */ }
    return { version: 2, activeId: null, profiles: [] };
  }
  let data = load();
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { toast('⚠️ No se pudo guardar en este navegador'); }
    renderHeader();
  }

  const P = () => data.profiles.find((p) => p.id === data.activeId) || null;
  const getDeck = (id) => P()?.decks.find((d) => d.id === id);
  const dueCards = (deck) => deck.cards.filter((c) => c.due <= todayStr());

  // Registra actividad: puntos, racha e historial del día.
  function recordAnswer(correct, points) {
    const p = P();
    const t = todayStr();
    if (p.lastStudy !== t) {
      p.streak = p.lastStudy === addDays(t, -1) ? p.streak + 1 : 1;
      p.lastStudy = t;
    }
    const h = p.history[t] || (p.history[t] = { correct: 0, total: 0 });
    h.total += 1;
    if (correct) { h.correct += 1; p.points += points; }
    save();
  }

  function gradeCard(card, correct) {
    card.box = correct ? Math.min(card.box + 1, BOX_INTERVAL_DAYS.length) : 1;
    card.due = addDays(todayStr(), BOX_INTERVAL_DAYS[card.box - 1]);
  }

  // ---------- UI común ----------
  const app = $('#app');
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function renderHeader() {
    const p = P();
    if (!p) { $('#score').innerHTML = ''; return; }
    const streakActive = p.lastStudy === todayStr() || p.lastStudy === addDays(todayStr(), -1);
    $('#score').innerHTML = `
      <span title="Puntos">⭐ ${p.points}</span>
      <span title="Días seguidos estudiando">🔥 ${streakActive ? p.streak : 0}</span>
      <a class="who" href="#/profiles" title="Cambiar de persona">👤 ${esc(p.name)}</a>`;
  }
  const cheer = () => pick(['¡Genial!', '¡Muy bien!', '¡Correcto!', '¡Eres un crack!', '¡Perfecto!']);
  const courseOptions = (selected) => COURSES.map((c) =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.label}</option>`).join('');

  // ---------- Bienvenida / perfiles ----------
  function viewWelcome() {
    const first = data.profiles.length === 0;
    app.innerHTML = `
      ${first ? '' : '<a class="back" href="#/profiles">← Volver</a>'}
      <div class="center"><div class="huge">📚</div></div>
      <h1 class="center">${first ? '¡Bienvenido/a a App Studio!' : 'Nueva persona'}</h1>
      <p class="center muted">Antes de empezar, cuéntanos un poco sobre quién va a estudiar.</p>
      <form class="card" id="f">
        <label for="nm">¿Cómo te llamas?</label>
        <input type="text" id="nm" required maxlength="30" autocomplete="off" placeholder="Tu nombre">
        <label for="cu">¿En qué curso estás?</label>
        <select id="cu" required>
          <option value="" disabled selected>Elige tu curso</option>
          ${courseOptions(null)}
        </select>
        <label class="check" id="stWrap" hidden><input type="checkbox" id="st" checked> Añadir temas de ejemplo de mi curso</label>
        <button class="btn primary block" style="margin-top:16px">Empezar</button>
      </form>
    `;
    const sel = $('#cu');
    sel.onchange = () => { $('#stWrap').hidden = !STARTER_BY_COURSE[sel.value]; };
    $('#f').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#nm').value.trim();
      if (!name || !sel.value) return;
      const prof = newProfile(name, sel.value, $('#st').checked && !!STARTER_BY_COURSE[sel.value]);
      data.profiles.push(prof);
      data.activeId = prof.id;
      resetMathCfg();
      save();
      go('#/');
    };
  }

  function viewProfiles() {
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>¿Quién va a estudiar?</h1>
      <div class="grid">
        ${data.profiles.map((p) => `
          <button class="card deck profile ${p.id === data.activeId ? 'active' : ''}" data-id="${p.id}">
            <div class="emoji">👤</div>
            <div class="name">${esc(p.name)}</div>
            <div class="muted small">${esc(courseById(p.course)?.label || 'Sin curso')} · ⭐ ${p.points}</div>
          </button>`).join('')}
        <a class="card deck" href="#/welcome">
          <div class="emoji">➕</div>
          <div class="name">Añadir persona</div>
          <div class="muted small">Cada una con su progreso</div>
        </a>
      </div>
    `;
    $$('.profile').forEach((b) => {
      b.onclick = () => { data.activeId = b.dataset.id; resetMathCfg(); save(); go('#/'); };
    });
  }

  function viewChooseCourse() {
    // Perfiles que vienen de la versión anterior (sin curso).
    const p = P();
    app.innerHTML = `
      <h1>¡Hola, ${esc(p.name)}! 👋</h1>
      <p class="muted">Hemos añadido algo nuevo: dinos en qué curso estás para adaptar los ejercicios.</p>
      <form class="card" id="f">
        <label for="cu">¿En qué curso estás?</label>
        <select id="cu" required><option value="" disabled selected>Elige tu curso</option>${courseOptions(null)}</select>
        <button class="btn primary block" style="margin-top:16px">Guardar</button>
      </form>`;
    $('#f').onsubmit = (e) => {
      e.preventDefault();
      if (!$('#cu').value) return;
      p.course = $('#cu').value;
      resetMathCfg();
      save();
      go('#/');
    };
  }

  // ---------- Inicio y temas ----------
  function viewHome() {
    const p = P();
    const t = todayStr();
    const today = p.history[t] || { correct: 0, total: 0 };
    const totalDue = p.decks.reduce((n, d) => n + dueCards(d).length, 0);

    app.innerHTML = `
      <h1 style="margin-bottom:2px">¡Hola, ${esc(p.name)}! 👋</h1>
      <p class="muted">${esc(courseById(p.course)?.label || '')}</p>
      <div class="stats">
        <div class="card stat"><div class="num">${today.correct}</div><div class="lbl">aciertos hoy</div></div>
        <div class="card stat"><div class="num">${totalDue}</div><div class="lbl">tarjetas por repasar</div></div>
        <div class="card stat"><div class="num">${p.points}</div><div class="lbl">puntos</div></div>
      </div>

      <h2>¿Qué quieres estudiar?</h2>
      <div class="grid">
        ${p.decks.map((d) => {
          const due = dueCards(d).length;
          return `<a class="card deck" href="#/deck/${d.id}">
            <div class="emoji">${esc(d.emoji || '📘')}</div>
            <div class="name">${esc(d.name)}</div>
            <div class="muted small">${d.cards.length} tarjetas · ${due ? `${due} por repasar` : 'al día ✅'}</div>
          </a>`;
        }).join('')}
        <a class="card deck" href="#/math">
          <div class="emoji">➗</div>
          <div class="name">Cálculo mental</div>
          <div class="muted small">${MATH_BY_LEVEL[levelOf(p)].ops.map((o) => OPS[o]).slice(0, 4).join(', ')}…</div>
        </a>
        <a class="card deck" href="#/parents">
          <div class="emoji">➕</div>
          <div class="name">Crear un tema</div>
          <div class="muted small">Con tus apuntes</div>
        </a>
      </div>

      <h2>Para mayores</h2>
      <a class="btn block" href="#/parents">👨‍👩‍👦 Zona padres: temas, progreso y ajustes</a>
    `;
  }

  function viewDeck(id) {
    const deck = getDeck(id);
    if (!deck) return go('#/');
    const due = dueCards(deck).length;
    const canQuiz = deck.cards.length >= 2;
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>${esc(deck.emoji || '📘')} ${esc(deck.name)}</h1>
      <p class="muted">${deck.cards.length} tarjetas · ${due} por repasar hoy</p>
      ${deck.cards.length === 0 ? `<div class="card">Este tema todavía no tiene tarjetas. Añádelas en "Editar este tema".</div>` : `
      <div class="card">
        <h2 style="margin-top:0">🃏 Tarjetas</h2>
        <p class="muted small">Lee la pregunta, piensa la respuesta y dale la vuelta. Las que fallas salen más a menudo.</p>
        <div class="row">
          <a class="btn primary" href="#/study/${deck.id}">${due ? `Repasar (${due})` : 'Repasar todas'}</a>
        </div>
      </div>
      <div class="card">
        <h2 style="margin-top:0">📝 Test</h2>
        <p class="muted small">Hasta ${QUIZ_LENGTH} preguntas, como en un examen.</p>
        <div class="row">
          ${canQuiz ? `<a class="btn primary" href="#/quiz/${deck.id}/choice">Elegir respuesta</a>` : ''}
          <a class="btn" href="#/quiz/${deck.id}/write">Escribir respuesta</a>
        </div>
        ${canQuiz ? '' : '<p class="muted small">Para el test de elegir respuesta hacen falta al menos 2 tarjetas.</p>'}
      </div>`}
      <a class="btn ghost block" href="#/edit/${deck.id}">✏️ Editar este tema</a>
    `;
  }

  // ---- Tarjetas (repaso espaciado) ----
  function viewStudy(id) {
    const deck = getDeck(id);
    if (!deck || !deck.cards.length) return go('#/');
    let queue = dueCards(deck);
    if (!queue.length) queue = deck.cards.slice();
    queue = shuffle(queue);
    const total = queue.length;
    let done = 0, right = 0, revealed = false;

    function render() {
      if (!queue.length) {
        app.innerHTML = `
          <div class="center">
            <div class="huge">🎉</div>
            <h1>¡Repaso terminado!</h1>
            <p>Has acertado <b>${right}</b> de <b>${done}</b>.</p>
          </div>
          <div class="row">
            <a class="btn primary" href="#/deck/${deck.id}">Volver al tema</a>
            <a class="btn" href="#/">Inicio</a>
          </div>`;
        return;
      }
      const card = queue[0];
      app.innerHTML = `
        <a class="back" href="#/deck/${deck.id}">← ${esc(deck.name)}</a>
        <div class="muted small">Tarjeta ${Math.min(done + 1, total)} de ${total}</div>
        <div class="progress"><div style="width:${(done / total) * 100}%"></div></div>
        <div class="card flash" id="flash">
          <div>${esc(card.q)}</div>
          ${revealed ? `<div class="answer">${esc(card.a)}</div>` : '<div class="hint">Toca para ver la respuesta</div>'}
        </div>
        ${revealed ? `
          <p class="center muted">¿La sabías?</p>
          <div class="row">
            <button class="btn bad" id="no">❌ No</button>
            <button class="btn good" id="yes">✅ Sí</button>
          </div>` : `<button class="btn primary block" id="reveal">Ver respuesta</button>`}
      `;
      if (!revealed) {
        const show = () => { revealed = true; render(); };
        $('#flash').onclick = show;
        $('#reveal').onclick = show;
      } else {
        $('#yes').onclick = () => answer(true);
        $('#no').onclick = () => answer(false);
      }
    }
    function answer(ok) {
      const card = queue.shift();
      gradeCard(card, ok);
      recordAnswer(ok, POINTS_CARD);
      done++;
      if (ok) { right++; toast(`${cheer()} +${POINTS_CARD} ⭐`); }
      revealed = false;
      render();
    }
    render();
  }

  // ---- Test ----
  function viewQuiz(id, mode) {
    const deck = getDeck(id);
    if (!deck || !deck.cards.length) return go('#/');
    if (mode === 'choice' && deck.cards.length < 2) return go(`#/deck/${id}`);
    const questions = shuffle(deck.cards).slice(0, QUIZ_LENGTH);
    const mistakes = [];
    let i = 0, right = 0, answered = false;

    function optionsFor(card) {
      const others = shuffle([...new Set(deck.cards.filter((c) => normalize(c.a) !== normalize(card.a)).map((c) => c.a))]).slice(0, 3);
      return shuffle([card.a, ...others]);
    }

    function render() {
      if (i >= questions.length) {
        const nota = Math.round((right / questions.length) * 100) / 10;
        app.innerHTML = `
          <div class="center">
            <div class="huge">${nota >= 9 ? '🏆' : nota >= 6 ? '👏' : '💪'}</div>
            <h1>Nota: ${nota.toLocaleString('es-ES')}</h1>
            <p>${right} de ${questions.length} correctas</p>
          </div>
          ${mistakes.length ? `<div class="card"><h2 style="margin-top:0">Para repasar</h2><ul class="list">
            ${mistakes.map((c) => `<li><span class="qa">${esc(c.q)}</span><b class="qa">${esc(c.a)}</b></li>`).join('')}
          </ul></div>` : ''}
          <div class="row">
            <button class="btn primary" id="again">Otra vez</button>
            <a class="btn" href="#/deck/${deck.id}">Volver al tema</a>
          </div>`;
        $('#again').onclick = () => viewQuiz(id, mode);
        return;
      }
      const card = questions[i];
      answered = false;
      app.innerHTML = `
        <a class="back" href="#/deck/${deck.id}">← ${esc(deck.name)}</a>
        <div class="muted small">Pregunta ${i + 1} de ${questions.length}</div>
        <div class="progress"><div style="width:${(i / questions.length) * 100}%"></div></div>
        <div class="card flash" style="min-height:140px;cursor:default">${esc(card.q)}</div>
        ${mode === 'choice'
          ? `<div class="options">${optionsFor(card).map((o) => `<button class="btn option" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`
          : `<form id="f"><input type="text" id="ans" class="big-input" autocomplete="off" autocapitalize="off" placeholder="Escribe aquí"><button class="btn primary block" style="margin-top:10px">Comprobar</button></form>`}
        <div id="fb"></div>
      `;
      if (mode === 'choice') {
        $$('.option').forEach((b) => { b.onclick = () => { if (!answered) check(b.dataset.v, b); }; });
      } else {
        const input = $('#ans');
        input.focus();
        $('#f').onsubmit = (e) => {
          e.preventDefault();
          if (answered || !input.value.trim()) return;
          check(input.value);
        };
      }
    }

    function check(value, btn) {
      answered = true;
      const card = questions[i];
      const ok = normalize(value) === normalize(card.a);
      gradeCard(card, ok);
      recordAnswer(ok, POINTS_CARD);
      if (ok) right++; else mistakes.push(card);
      if (btn) {
        $$('.option').forEach((b) => { if (normalize(b.dataset.v) === normalize(card.a)) b.classList.add('correct'); });
        if (!ok) btn.classList.add('wrong');
      } else {
        $('#ans').readOnly = true;
      }
      $('#fb').innerHTML = `
        <div class="feedback ${ok ? 'ok' : 'ko'}">${ok ? `${cheer()} +${POINTS_CARD} ⭐` : `La respuesta era: ${esc(card.a)}`}</div>
        <button class="btn primary block" id="next">Siguiente →</button>`;
      $('#next').onclick = () => { i++; render(); };
      $('#next').focus();
    }
    render();
  }

  // ---- Cálculo mental ----
  const OPS = {
    add: 'Sumas', sub: 'Restas', mul: 'Multiplicar', div: 'Dividir',
    int: 'Números enteros', pow: 'Potencias', sqrt: 'Raíces cuadradas',
    pct: 'Porcentajes', frac: 'Fracción de un número',
  };
  const OP_HELP = {
    int: 'Sumas, restas y multiplicaciones con números negativos.',
    pow: 'Cuadrados y cubos.',
    sqrt: 'Raíces cuadradas exactas.',
    pct: 'Ej.: el 25 % de 80.',
    frac: 'Ej.: 3/4 de 20.',
  };
  const mathCfg = { op: 'mul', tables: [2, 3, 4, 5], max: 100 };
  function resetMathCfg() {
    const cfg = MATH_BY_LEVEL[levelOf(P())];
    mathCfg.op = cfg.defaults.op;
    mathCfg.max = cfg.defaults.max;
  }

  const SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' };
  const neg = (n) => (n < 0 ? `(−${-n})` : String(n));

  function makeOp() {
    const { op, tables, max } = mathCfg;
    switch (op) {
      case 'add': { const a = rand(0, max), b = rand(0, max - a); return { text: `${a} + ${b}`, result: a + b }; }
      case 'sub': { const a = rand(0, max), b = rand(0, a); return { text: `${a} − ${b}`, result: a - b }; }
      case 'mul': { const t = pick(tables), n = rand(1, 10); return Math.random() < 0.5 ? { text: `${t} × ${n}`, result: t * n } : { text: `${n} × ${t}`, result: t * n }; }
      case 'div': { const t = pick(tables), n = rand(1, 10); return { text: `${t * n} : ${t}`, result: n }; }
      case 'int': {
        const lim = max >= 1000 ? 50 : 20;
        const kind = pick(['+', '−', '×']);
        let a = rand(-lim, lim), b = rand(-lim, lim);
        if (kind === '×') { a = rand(-12, 12); b = rand(-12, 12); }
        if (a >= 0 && b >= 0) b = -rand(1, lim > 20 && kind !== '×' ? lim : 12); // siempre algún negativo
        const result = kind === '+' ? a + b : kind === '−' ? a - b : a * b;
        return { text: `${neg(a)} ${kind} ${neg(b)}`, result };
      }
      case 'pow': {
        const r = Math.random();
        if (r < 0.55) { const b = rand(1, 15); return { text: `${b}²`, result: b * b }; }
        if (r < 0.85) { const b = rand(1, 6); return { text: `${b}³`, result: b ** 3 }; }
        const e = rand(4, 6); const b = e === 4 ? rand(2, 3) : 2;
        return { text: `${b}${SUP[e]}`, result: b ** e };
      }
      case 'sqrt': { const n = rand(1, 15); return { text: `√${n * n}`, result: n }; }
      case 'pct': {
        const p = pick([10, 20, 25, 50, 75, 5]);
        const step = { 10: 10, 20: 5, 25: 4, 50: 2, 75: 4, 5: 20 }[p];
        const n = step * rand(1, max >= 1000 ? 50 : 20);
        return { text: `${p} % de ${n}`, result: (p * n) / 100 };
      }
      case 'frac': {
        const den = rand(2, 10), num = rand(1, den - 1);
        const n = den * rand(1, 12);
        return { text: `${num}/${den} de ${n}`, result: (num * n) / den };
      }
      default: return { text: '1 + 1', result: 2 };
    }
  }

  function viewMath() {
    const cfg = MATH_BY_LEVEL[levelOf(P())];
    if (!cfg.ops.includes(mathCfg.op)) mathCfg.op = cfg.defaults.op;
    if (!cfg.maxOptions.includes(mathCfg.max)) mathCfg.max = cfg.defaults.max;
    const usesTables = mathCfg.op === 'mul' || mathCfg.op === 'div';
    const usesMax = mathCfg.op === 'add' || mathCfg.op === 'sub';
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>➗ Cálculo mental</h1>
      <div class="card">
        <label>¿Qué quieres practicar?</label>
        <div class="chips" id="ops">
          ${cfg.ops.map((k) => `<button class="chip ${mathCfg.op === k ? 'on' : ''}" data-op="${k}" style="padding:0 14px">${OPS[k]}</button>`).join('')}
        </div>
        ${OP_HELP[mathCfg.op] ? `<p class="muted small" style="margin-top:10px">${OP_HELP[mathCfg.op]}</p>` : ''}
        ${usesTables ? `
          <label>Tablas</label>
          <div class="chips" id="tables">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="chip ${mathCfg.tables.includes(n) ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}
          </div>` : ''}
        ${usesMax ? `
          <label>Números hasta</label>
          <div class="chips" id="max">
            ${cfg.maxOptions.map((n) => `<button class="chip ${mathCfg.max === n ? 'on' : ''}" data-m="${n}" style="padding:0 14px">${n}</button>`).join('')}
          </div>` : ''}
      </div>
      <button class="btn primary block" id="start">¡Empezar! (${MATH_LENGTH} operaciones)</button>
    `;
    $$('#ops .chip').forEach((b) => { b.onclick = () => { mathCfg.op = b.dataset.op; viewMath(); }; });
    $$('#tables .chip').forEach((b) => {
      b.onclick = () => {
        const n = Number(b.dataset.n);
        mathCfg.tables = mathCfg.tables.includes(n) ? mathCfg.tables.filter((x) => x !== n) : [...mathCfg.tables, n];
        viewMath();
      };
    });
    $$('#max .chip').forEach((b) => { b.onclick = () => { mathCfg.max = Number(b.dataset.m); viewMath(); }; });
    $('#start').onclick = () => {
      if (usesTables && !mathCfg.tables.length) return toast('Elige al menos una tabla');
      go('#/math/play');
    };
  }

  function playMath() {
    const list = [];
    const seen = new Set();
    let guard = 0;
    while (list.length < MATH_LENGTH && guard++ < 500) {
      const o = makeOp();
      if (seen.has(o.text) && guard < 400) continue;
      seen.add(o.text);
      list.push(o);
    }
    const allowNeg = mathCfg.op === 'int';
    const mistakes = [];
    let i = 0, right = 0;
    const startTime = Date.now();

    function render() {
      if (i >= list.length) {
        const secs = Math.round((Date.now() - startTime) / 1000);
        app.innerHTML = `
          <div class="center">
            <div class="huge">${right === list.length ? '🏆' : right >= list.length * 0.6 ? '👏' : '💪'}</div>
            <h1>${right} de ${list.length}</h1>
            <p class="muted">Tiempo: ${Math.floor(secs / 60)} min ${secs % 60} s</p>
          </div>
          ${mistakes.length ? `<div class="card"><h2 style="margin-top:0">Para repasar</h2><ul class="list">
            ${mistakes.map((m) => `<li><span>${esc(m.text)} = <b>${m.result}</b></span><span class="muted small">pusiste ${esc(m.given)}</span></li>`).join('')}
          </ul></div>` : ''}
          <div class="row">
            <button class="btn primary" id="again">Otra vez</button>
            <a class="btn" href="#/math">Cambiar</a>
          </div>`;
        $('#again').onclick = playMath;
        return;
      }
      const o = list[i];
      app.innerHTML = `
        <a class="back" href="#/math">← Cálculo mental</a>
        <div class="muted small">Operación ${i + 1} de ${list.length}</div>
        <div class="progress"><div style="width:${(i / list.length) * 100}%"></div></div>
        <div class="card flash" style="min-height:140px;font-size:2.2rem;cursor:default">${esc(o.text)} = ?</div>
        <form id="f">
          <div class="row" style="flex-wrap:nowrap">
            ${allowNeg ? '<button type="button" class="btn" id="sign" style="flex:0 0 64px;font-size:1.4rem" aria-label="Cambiar signo">±</button>' : ''}
            <input type="text" inputmode="numeric" id="ans" class="big-input" autocomplete="off" placeholder="?">
          </div>
          <button class="btn primary block" style="margin-top:10px">Comprobar</button>
        </form>
        <div id="fb"></div>`;
      const input = $('#ans');
      input.focus();
      if (allowNeg) {
        $('#sign').onclick = () => {
          const v = input.value.trim();
          input.value = v.startsWith('-') || v.startsWith('−') ? v.slice(1) : `-${v}`;
          input.focus();
        };
      }
      let answered = false;
      $('#f').onsubmit = (e) => {
        e.preventDefault();
        if (answered) { i++; return render(); }
        const v = input.value.trim().replace('−', '-');
        if (!/^-?\d+$/.test(v)) return toast('Escribe un número');
        answered = true;
        input.readOnly = true;
        const ok = Number(v) === o.result;
        recordAnswer(ok, POINTS_MATH);
        if (ok) right++; else mistakes.push({ ...o, given: v });
        $('#fb').innerHTML = `
          <div class="feedback ${ok ? 'ok' : 'ko'}">${ok ? `${cheer()} +${POINTS_MATH} ⭐` : `Era ${o.result}`}</div>
          <button type="button" class="btn primary block" id="next">Siguiente →</button>`;
        $('#next').onclick = () => { i++; render(); };
        $('#next').focus();
      };
    }
    render();
  }

  // ---- Zona padres ----
  function viewParents() {
    const p = P();
    const days = [];
    for (let k = 13; k >= 0; k--) {
      const d = addDays(todayStr(), -k);
      days.push({ d, ...(p.history[d] || { correct: 0, total: 0 }) });
    }
    const maxTotal = Math.max(1, ...days.map((x) => x.total));
    const last7 = days.slice(-7);
    const sum7 = last7.reduce((a, x) => ({ c: a.c + x.correct, t: a.t + x.total }), { c: 0, t: 0 });
    const daysStudied = last7.filter((x) => x.total > 0).length;
    const hasStarter = !!STARTER_BY_COURSE[p.course];

    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>👨‍👩‍👦 Zona padres</h1>
      <p class="muted">Perfil: <b>${esc(p.name)}</b> · ${esc(courseById(p.course)?.label || 'sin curso')} · <a href="#/profiles">cambiar</a></p>

      <div class="card">
        <h2 style="margin-top:0">Progreso (últimos 14 días)</h2>
        <p class="muted small">Últimos 7 días: estudió ${daysStudied} ${daysStudied === 1 ? 'día' : 'días'}, ${sum7.t} respuestas, ${sum7.t ? Math.round((sum7.c / sum7.t) * 100) : 0}% de aciertos.</p>
        <div class="bars">
          ${days.map((x) => `<div class="bar" title="${x.d}: ${x.correct}/${x.total}">
            <div style="height:${(x.total / maxTotal) * 100}%;opacity:${x.total ? 1 : 0.3}"></div>
            <span>${Number(x.d.slice(8))}</span></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Temas</h2>
        <ul class="list">
          ${p.decks.map((d) => {
            const mastered = d.cards.filter((c) => c.box >= 4).length;
            return `<li><span class="qa">${esc(d.emoji || '📘')} ${esc(d.name)} <span class="muted small">· ${d.cards.length} tarjetas, ${mastered} dominadas</span></span>
              <a class="btn" href="#/edit/${d.id}">Editar</a></li>`;
          }).join('') || '<li class="muted">Aún no hay temas</li>'}
        </ul>
        <form id="newDeck" style="margin-top:12px">
          <label for="dn">Nuevo tema</label>
          <div class="row">
            <input type="text" id="de" placeholder="📘" maxlength="4" style="flex:0 0 64px;text-align:center" aria-label="Emoji">
            <input type="text" id="dn" placeholder="Ej.: Ríos de España" style="flex:1 1 200px" required>
          </div>
          <button class="btn primary block" style="margin-top:10px">Crear tema</button>
        </form>
        ${hasStarter ? '<button class="btn ghost block" id="addStarter" style="margin-top:10px">➕ Añadir temas de ejemplo de este curso</button>' : ''}
      </div>

      <div class="card">
        <h2 style="margin-top:0">Ajustes de ${esc(p.name)}</h2>
        <label for="nm">Nombre</label>
        <input type="text" id="nm" value="${esc(p.name)}" maxlength="30">
        <label for="cu">Curso</label>
        <select id="cu">${courseOptions(p.course)}</select>
        <button class="btn ghost block" id="delProfile" style="margin-top:12px;color:var(--bad)">Borrar este perfil</button>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Copia de seguridad</h2>
        <p class="muted small">Los datos (de todos los perfiles) se guardan solo en este navegador. Descarga una copia para pasarlos a otro dispositivo o por si se borra el navegador.</p>
        <div class="row">
          <button class="btn" id="exp">⬇️ Descargar copia</button>
          <label class="btn" style="margin:0">⬆️ Cargar copia<input type="file" id="imp" accept="application/json,.json" hidden></label>
        </div>
      </div>
    `;

    $('#newDeck').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#dn').value.trim();
      if (!name) return;
      const deck = { id: uid(), name, emoji: $('#de').value.trim() || '📘', cards: [] };
      p.decks.push(deck);
      save();
      go(`#/edit/${deck.id}`);
    };
    if (hasStarter) {
      $('#addStarter').onclick = () => {
        const existing = new Set(p.decks.map((d) => d.name));
        const toAdd = starterDecks(p.course).filter((d) => !existing.has(d.name));
        if (!toAdd.length) return toast('Ya tienes todos los temas de ejemplo');
        p.decks.push(...toAdd);
        save();
        viewParents();
        toast(`${toAdd.length} ${toAdd.length === 1 ? 'tema añadido' : 'temas añadidos'}`);
      };
    }
    $('#nm').onchange = (e) => { const v = e.target.value.trim(); if (v) { p.name = v; save(); toast('Guardado'); } };
    $('#cu').onchange = (e) => { p.course = e.target.value; resetMathCfg(); save(); viewParents(); toast('Curso cambiado'); };
    $('#delProfile').onclick = () => {
      if (!confirm(`¿Borrar el perfil de ${p.name} con todos sus temas y progreso?`)) return;
      data.profiles = data.profiles.filter((x) => x.id !== p.id);
      data.activeId = data.profiles[0]?.id || null;
      save();
      go(data.activeId ? '#/profiles' : '#/welcome');
    };
    $('#exp').onclick = () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `app-studio-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#imp').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = migrate(JSON.parse(reader.result));
          if (!parsed || !parsed.profiles.length) throw new Error('formato');
          if (!confirm('Esto sustituirá todos los datos actuales por los de la copia. ¿Seguir?')) return;
          data = parsed;
          if (!P()) data.activeId = data.profiles[0].id;
          save();
          toast('Copia cargada');
          go('#/profiles');
        } catch (err) {
          toast('Ese archivo no es una copia válida');
        }
      };
      reader.readAsText(file);
    };
  }

  function viewEdit(id) {
    const deck = getDeck(id);
    if (!deck) return go('#/parents');
    app.innerHTML = `
      <a class="back" href="#/parents">← Zona padres</a>
      <h1>✏️ ${esc(deck.emoji || '📘')} ${esc(deck.name)}</h1>

      <div class="card">
        <div class="row">
          <input type="text" id="de" value="${esc(deck.emoji)}" maxlength="4" style="flex:0 0 64px;text-align:center" aria-label="Emoji">
          <input type="text" id="dn" value="${esc(deck.name)}" style="flex:1 1 200px" aria-label="Nombre del tema">
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Añadir tarjeta</h2>
        <form id="add">
          <label for="q">Pregunta</label>
          <input type="text" id="q" required placeholder="Ej.: Río que pasa por Zaragoza">
          <label for="a">Respuesta</label>
          <input type="text" id="a" required placeholder="Ej.: Ebro">
          <button class="btn primary block" style="margin-top:12px">Añadir</button>
        </form>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Añadir muchas de golpe</h2>
        <p class="muted small">Una por línea, con la pregunta y la respuesta separadas por <b>|</b> o por <b>tabulador</b> (sirve copiar dos columnas de Excel).<br>Ejemplo: <code>Capital de Francia | París</code></p>
        <textarea id="bulk" placeholder="Pregunta | Respuesta"></textarea>
        <button class="btn block" id="bulkBtn" style="margin-top:10px">Añadir todas</button>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Tarjetas (${deck.cards.length})</h2>
        <ul class="list">
          ${deck.cards.map((c) => `<li>
            <span class="qa">${esc(c.q)} → <b>${esc(c.a)}</b> <span class="muted small">· nivel ${c.box}/5</span></span>
            <button class="icon-btn" data-del="${c.id}" aria-label="Borrar tarjeta">🗑️</button>
          </li>`).join('') || '<li class="muted">Todavía no hay tarjetas</li>'}
        </ul>
      </div>

      <div class="row">
        <a class="btn primary" href="#/deck/${deck.id}">Ir a estudiar</a>
        <button class="btn" id="delDeck" style="color:var(--bad)">Borrar tema</button>
      </div>
    `;

    const saveMeta = () => {
      deck.name = $('#dn').value.trim() || deck.name;
      deck.emoji = $('#de').value.trim() || '📘';
      save();
      toast('Guardado');
    };
    $('#dn').onchange = saveMeta;
    $('#de').onchange = saveMeta;
    $('#add').onsubmit = (e) => {
      e.preventDefault();
      const q = $('#q').value.trim(), a = $('#a').value.trim();
      if (!q || !a) return;
      deck.cards.push(newCard(q, a));
      save();
      viewEdit(id);
      toast('Tarjeta añadida');
      $('#q').focus();
    };
    $('#bulkBtn').onclick = () => {
      let added = 0, skipped = 0;
      for (const line of $('#bulk').value.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const tab = line.includes('\t');
        const parts = tab ? line.split('\t') : line.split('|');
        const q = (parts[0] || '').trim();
        const a = parts.slice(1).join(tab ? ' ' : '|').trim();
        if (!q || !a) { skipped++; continue; }
        deck.cards.push(newCard(q, a));
        added++;
      }
      if (!added) return toast('No encontré líneas con el formato pregunta | respuesta');
      save();
      viewEdit(id);
      toast(`${added} tarjetas añadidas${skipped ? ` (${skipped} ${skipped === 1 ? 'línea no válida' : 'líneas no válidas'})` : ''}`);
    };
    $$('[data-del]').forEach((b) => {
      b.onclick = () => {
        deck.cards = deck.cards.filter((c) => c.id !== b.dataset.del);
        save();
        viewEdit(id);
      };
    });
    $('#delDeck').onclick = () => {
      if (!confirm(`¿Borrar el tema "${deck.name}" y todas sus tarjetas?`)) return;
      P().decks = P().decks.filter((d) => d.id !== deck.id);
      save();
      go('#/parents');
    };
  }

  // ---------- Router ----------
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    window.scrollTo(0, 0);
    if (!P() && data.profiles.length) data.activeId = data.profiles[0].id;
    renderHeader();
    if (!P() || parts[0] === 'welcome') return viewWelcome();
    if (parts[0] === 'profiles') return viewProfiles();
    if (!P().course) return viewChooseCourse();
    switch (parts[0]) {
      case 'deck': return viewDeck(parts[1]);
      case 'study': return viewStudy(parts[1]);
      case 'quiz': return viewQuiz(parts[1], parts[2] === 'write' ? 'write' : 'choice');
      case 'math': return parts[1] === 'play' ? playMath() : viewMath();
      case 'parents': return viewParents();
      case 'edit': return viewEdit(parts[1]);
      default: return viewHome();
    }
  }
  window.addEventListener('hashchange', route);
  if (P()) resetMathCfg();
  route();
})();
