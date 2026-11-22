/* App Studio — app de estudio sin dependencias.
 * Todo se guarda en el navegador (localStorage). Usa "Zona padres > Copia de seguridad"
 * para exportar/importar los datos entre dispositivos. */
(() => {
  'use strict';

  const STORAGE_KEY = 'app-studio-v1';
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
  const normalize = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // ---------- Datos ----------
  function defaultData() {
    const t = todayStr();
    const mk = (q, a) => ({ id: uid(), q, a, box: 1, due: t });
    return {
      profile: { name: '', points: 0, streak: 0, lastStudy: null, history: {} },
      decks: [
        {
          id: uid(), name: 'Capitales de Europa', emoji: '🌍',
          cards: [
            mk('Capital de Francia', 'París'),
            mk('Capital de Italia', 'Roma'),
            mk('Capital de Portugal', 'Lisboa'),
            mk('Capital de Alemania', 'Berlín'),
            mk('Capital de Reino Unido', 'Londres'),
            mk('Capital de Grecia', 'Atenas'),
          ],
        },
        {
          id: uid(), name: 'Inglés: animales', emoji: '🇬🇧',
          cards: [
            mk('Perro', 'Dog'),
            mk('Gato', 'Cat'),
            mk('Caballo', 'Horse'),
            mk('Pájaro', 'Bird'),
            mk('Pez', 'Fish'),
            mk('Vaca', 'Cow'),
          ],
        },
      ],
    };
  }

  let data;
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.decks) && parsed.profile) return parsed;
      }
    } catch (e) { /* almacenamiento no disponible: seguimos en memoria */ }
    return defaultData();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { toast('⚠️ No se pudo guardar en este navegador'); }
    renderScore();
  }
  data = load();

  const getDeck = (id) => data.decks.find((d) => d.id === id);
  const dueCards = (deck) => deck.cards.filter((c) => c.due <= todayStr());

  // Registra actividad: puntos, racha e historial del día.
  function recordAnswer(correct, points) {
    const p = data.profile;
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
  function renderScore() {
    const p = data.profile;
    const streakActive = p.lastStudy === todayStr() || p.lastStudy === addDays(todayStr(), -1);
    $('#score').innerHTML = `<span title="Puntos">⭐ ${p.points}</span><span title="Días seguidos estudiando">🔥 ${streakActive ? p.streak : 0}</span>`;
  }
  function cheer() {
    return ['¡Genial!', '¡Muy bien!', '¡Correcto!', '¡Eres un crack!', '¡Perfecto!'][rand(0, 4)];
  }

  // ---------- Vistas ----------
  function viewHome() {
    const p = data.profile;
    const t = todayStr();
    const today = p.history[t] || { correct: 0, total: 0 };
    const totalDue = data.decks.reduce((n, d) => n + dueCards(d).length, 0);
    const hello = p.name ? `¡Hola, ${esc(p.name)}! 👋` : '¡Hola! 👋';

    app.innerHTML = `
      <h1>${hello}</h1>
      <div class="stats">
        <div class="card stat"><div class="num">${today.correct}</div><div class="lbl">aciertos hoy</div></div>
        <div class="card stat"><div class="num">${totalDue}</div><div class="lbl">tarjetas por repasar</div></div>
        <div class="card stat"><div class="num">${p.points}</div><div class="lbl">puntos</div></div>
      </div>

      <h2>¿Qué quieres estudiar?</h2>
      <div class="grid">
        ${data.decks.map((d) => {
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
          <div class="muted small">Sumas, restas, tablas y divisiones</div>
        </a>
      </div>

      <h2>Para mayores</h2>
      <a class="btn block" href="#/parents">👨‍👩‍👦 Zona padres: crear temas y ver progreso</a>
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
      ${deck.cards.length === 0 ? `<div class="card">Este tema todavía no tiene tarjetas. Pide a un mayor que las añada en la Zona padres.</div>` : `
      <div class="card">
        <h2 style="margin-top:0">🃏 Tarjetas</h2>
        <p class="muted small">Lee la pregunta, piensa la respuesta y dale la vuelta. Las que fallas salen más a menudo.</p>
        <div class="row">
          <a class="btn primary" href="#/study/${deck.id}">${due ? `Repasar (${due})` : 'Repasar todas'}</a>
        </div>
      </div>
      <div class="card">
        <h2 style="margin-top:0">📝 Test</h2>
        <p class="muted small">${QUIZ_LENGTH} preguntas como en un examen.</p>
        <div class="row">
          <a class="btn primary" href="#/quiz/${deck.id}/choice" ${canQuiz ? '' : 'aria-disabled="true"'}>Elegir respuesta</a>
          <a class="btn" href="#/quiz/${deck.id}/write">Escribir respuesta</a>
        </div>
        ${canQuiz ? '' : '<p class="muted small">Para el test de elegir hacen falta al menos 2 tarjetas.</p>'}
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
        const pct = Math.round((right / questions.length) * 100);
        const nota = Math.round((right / questions.length) * 100) / 10;
        app.innerHTML = `
          <div class="center">
            <div class="huge">${pct >= 90 ? '🏆' : pct >= 60 ? '👏' : '💪'}</div>
            <h1>Nota: ${nota.toLocaleString('es-ES')}</h1>
            <p>${right} de ${questions.length} correctas</p>
          </div>
          ${mistakes.length ? `<div class="card"><h2 style="margin-top:0">Para repasar</h2><ul class="list">
            ${mistakes.map((c) => `<li><span class="qa">${esc(c.q)}</span><b class="qa">${esc(c.a)}</b></li>`).join('')}
          </ul></div>` : ''}
          <div class="row">
            <a class="btn primary" href="#/quiz/${deck.id}/${mode}" id="again">Otra vez</a>
            <a class="btn" href="#/deck/${deck.id}">Volver al tema</a>
          </div>`;
        $('#again').onclick = (e) => { e.preventDefault(); viewQuiz(id, mode); };
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
        $$('.option').forEach((b) => {
          b.onclick = () => {
            if (answered) return;
            check(b.dataset.v, b);
          };
        });
      } else {
        const input = $('#ans');
        input.focus();
        $('#f').onsubmit = (e) => {
          e.preventDefault();
          if (answered) return;
          if (!input.value.trim()) return;
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
      if (ok) right++; else if (!mistakes.includes(card)) mistakes.push(card);
      if (btn) {
        $$('.option').forEach((b) => {
          if (normalize(b.dataset.v) === normalize(card.a)) b.classList.add('correct');
        });
        if (!ok) btn.classList.add('wrong');
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
  const mathCfg = { op: 'mul', tables: [2, 3, 4, 5], max: 20 };
  const OPS = { add: 'Sumas', sub: 'Restas', mul: 'Multiplicar', div: 'Dividir' };

  function viewMath() {
    const usesTables = mathCfg.op === 'mul' || mathCfg.op === 'div';
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>➗ Cálculo mental</h1>
      <div class="card">
        <label>¿Qué quieres practicar?</label>
        <div class="chips" id="ops">
          ${Object.entries(OPS).map(([k, v]) => `<button class="chip ${mathCfg.op === k ? 'on' : ''}" data-op="${k}" style="padding:0 14px">${v}</button>`).join('')}
        </div>
        ${usesTables ? `
          <label>Tablas</label>
          <div class="chips" id="tables">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="chip ${mathCfg.tables.includes(n) ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}
          </div>` : `
          <label>Números hasta</label>
          <div class="chips" id="max">
            ${[10, 20, 100, 1000].map((n) => `<button class="chip ${mathCfg.max === n ? 'on' : ''}" data-m="${n}" style="padding:0 14px">${n}</button>`).join('')}
          </div>`}
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
      playMath();
    };
  }

  function makeOp() {
    const { op, tables, max } = mathCfg;
    if (op === 'add') {
      const a = rand(0, max), b = rand(0, max - a);
      return { text: `${a} + ${b}`, result: a + b };
    }
    if (op === 'sub') {
      const a = rand(0, max), b = rand(0, a);
      return { text: `${a} − ${b}`, result: a - b };
    }
    const t = tables[rand(0, tables.length - 1)];
    const n = rand(1, 10);
    if (op === 'mul') return Math.random() < 0.5 ? { text: `${t} × ${n}`, result: t * n } : { text: `${n} × ${t}`, result: t * n };
    return { text: `${t * n} : ${t}`, result: n };
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
            ${mistakes.map((m) => `<li><span>${m.text} = <b>${m.result}</b></span><span class="muted small">pusiste ${esc(m.given)}</span></li>`).join('')}
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
        <div class="card flash" style="min-height:140px;font-size:2.4rem;cursor:default">${o.text} = ?</div>
        <form id="f">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="ans" class="big-input" autocomplete="off" placeholder="?">
          <button class="btn primary block" style="margin-top:10px">Comprobar</button>
        </form>
        <div id="fb"></div>`;
      const input = $('#ans');
      input.focus();
      let answered = false;
      $('#f').onsubmit = (e) => {
        e.preventDefault();
        if (answered) { i++; return render(); }
        const v = input.value.trim();
        if (v === '' || !/^-?\d+$/.test(v)) return toast('Escribe un número');
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
    const p = data.profile;
    const days = [];
    for (let k = 13; k >= 0; k--) {
      const d = addDays(todayStr(), -k);
      days.push({ d, ...(p.history[d] || { correct: 0, total: 0 }) });
    }
    const maxTotal = Math.max(1, ...days.map((x) => x.total));
    const last7 = days.slice(-7);
    const sum7 = last7.reduce((a, x) => ({ c: a.c + x.correct, t: a.t + x.total }), { c: 0, t: 0 });
    const daysStudied = last7.filter((x) => x.total > 0).length;

    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>👨‍👩‍👦 Zona padres</h1>

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
          ${data.decks.map((d) => {
            const mastered = d.cards.filter((c) => c.box >= 4).length;
            return `<li><span class="qa">${esc(d.emoji || '📘')} ${esc(d.name)} <span class="muted small">· ${d.cards.length} tarjetas, ${mastered} dominadas</span></span>
              <a class="btn" href="#/edit/${d.id}">Editar</a></li>`;
          }).join('') || '<li class="muted">Aún no hay temas</li>'}
        </ul>
        <form id="newDeck" style="margin-top:12px">
          <label for="dn">Nuevo tema</label>
          <div class="row">
            <input type="text" id="de" placeholder="📘" maxlength="4" style="flex:0 0 64px;text-align:center">
            <input type="text" id="dn" placeholder="Ej.: Ríos de España" style="flex:1 1 200px" required>
          </div>
          <button class="btn primary block" style="margin-top:10px">Crear tema</button>
        </form>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Ajustes</h2>
        <label for="nm">Nombre del niño/a (para saludarle)</label>
        <input type="text" id="nm" value="${esc(p.name)}" placeholder="Nombre">
      </div>

      <div class="card">
        <h2 style="margin-top:0">Copia de seguridad</h2>
        <p class="muted small">Los datos se guardan solo en este navegador. Descarga una copia para pasarlos a otro dispositivo o por si se borra el navegador.</p>
        <div class="row">
          <button class="btn" id="exp">⬇️ Descargar copia</button>
          <label class="btn" style="margin:0">⬆️ Cargar copia<input type="file" id="imp" accept="application/json,.json" hidden></label>
        </div>
        <button class="btn ghost block" id="reset" style="margin-top:10px;color:var(--bad)">Borrar todos los datos</button>
      </div>
    `;

    $('#newDeck').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#dn').value.trim();
      if (!name) return;
      const deck = { id: uid(), name, emoji: $('#de').value.trim() || '📘', cards: [] };
      data.decks.push(deck);
      save();
      go(`#/edit/${deck.id}`);
    };
    $('#nm').onchange = (e) => { p.name = e.target.value.trim(); save(); toast('Guardado'); };
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
          const parsed = JSON.parse(reader.result);
          if (!parsed || !Array.isArray(parsed.decks) || !parsed.profile) throw new Error('formato');
          if (!confirm('Esto sustituirá los datos actuales por los de la copia. ¿Seguir?')) return;
          data = parsed;
          save();
          toast('Copia cargada');
          viewParents();
        } catch (err) {
          toast('Ese archivo no es una copia válida');
        }
      };
      reader.readAsText(file);
    };
    $('#reset').onclick = () => {
      if (!confirm('¿Seguro? Se borrarán todos los temas, tarjetas y puntos.')) return;
      data = defaultData();
      save();
      viewParents();
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
          <input type="text" id="q" required placeholder="Ej.: Río más largo de España">
          <label for="a">Respuesta</label>
          <input type="text" id="a" required placeholder="Ej.: Tajo">
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
      deck.cards.push({ id: uid(), q, a, box: 1, due: todayStr() });
      save();
      viewEdit(id);
      toast('Tarjeta añadida');
      $('#q').focus();
    };
    $('#bulkBtn').onclick = () => {
      const lines = $('#bulk').value.split(/\r?\n/);
      let added = 0, skipped = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.includes('\t') ? line.split('\t') : line.split('|');
        const q = (parts[0] || '').trim();
        const a = parts.slice(1).join(line.includes('\t') ? ' ' : '|').trim();
        if (!q || !a) { skipped++; continue; }
        deck.cards.push({ id: uid(), q, a, box: 1, due: todayStr() });
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
      data.decks = data.decks.filter((d) => d.id !== deck.id);
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
    renderScore();
    switch (parts[0]) {
      case 'deck': return viewDeck(parts[1]);
      case 'study': return viewStudy(parts[1]);
      case 'quiz': return viewQuiz(parts[1], parts[2] === 'write' ? 'write' : 'choice');
      case 'math': return viewMath();
      case 'parents': return viewParents();
      case 'edit': return viewEdit(parts[1]);
      default: return viewHome();
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();
