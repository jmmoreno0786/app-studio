/* App Studio — app de estudio sin servidor.
 * Los datos se guardan en el navegador: temas y progreso en localStorage, fotos en IndexedDB.
 * Usa "Zona padres > Copia de seguridad" para pasar los datos a otro dispositivo. */
(() => {
  'use strict';

  const { COURSES, MATH_BY_LEVEL, SUBJECTS, PUBLISHERS } = window.APP_CONTENT;
  const STORAGE_KEY = 'app-studio-v2';
  const LEGACY_KEY = 'app-studio-v1';
  const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14]; // caja 1..5 (repaso espaciado tipo Leitner)
  const POINTS_CARD = 10;
  const POINTS_MATH = 5;
  const QUIZ_LENGTH = 10;
  const MATH_LENGTH = 10;

  // Lector de texto (OCR): Tesseract.js, se descarga solo la primera vez que se usa.
  const OCR = {
    script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int',
  };

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
  // Minúscula inicial salvo siglas ("ADN" se queda igual).
  const lcFirst = (s) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);
  const slug = (s) => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tema';

  const courseById = (id) => COURSES.find((c) => c.id === id);
  const levelOf = (profile) => (courseById(profile?.course) || COURSES[6]).level;
  const subjectEmoji = (name) => (SUBJECTS.find(([n]) => n === name) || [null, '📘'])[1];
  const deckTitle = (d) => (d.unit ? `Tema ${d.unit}: ` : '') + d.name;
  const deckMeta = (d) => [d.subject, d.publisher, courseById(d.course)?.label].filter(Boolean).join(' · ');

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ($(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo descargar ' + src));
      document.head.appendChild(s);
    });
  }

  // ---------- Fotos (IndexedDB) ----------
  let dbPromise;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('app-studio', 2);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
          if (!d.objectStoreNames.contains('books')) d.createObjectStore('books');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function idb(mode, fn, store = 'photos') {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const photoPut = (id, blob) => idb('readwrite', (s) => s.put(blob, id));
  const photoGet = (id) => idb('readonly', (s) => s.get(id));
  const photoDel = (id) => idb('readwrite', (s) => s.delete(id));
  const bookPut = (id, blob) => idb('readwrite', (s) => s.put(blob, id), 'books');
  const bookGet = (id) => idb('readonly', (s) => s.get(id), 'books');
  const bookDel = (id) => idb('readwrite', (s) => s.delete(id), 'books');
  const urlCache = new Map();
  async function photoUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const blob = await photoGet(id).catch(() => null);
    const url = blob ? URL.createObjectURL(blob) : null;
    urlCache.set(id, url);
    return url;
  }
  async function deletePhotos(ids) {
    for (const id of ids || []) {
      try { await photoDel(id); } catch (e) { /* ignorar */ }
      if (urlCache.get(id)) URL.revokeObjectURL(urlCache.get(id));
      urlCache.delete(id);
    }
  }
  // Reduce la foto para que ocupe poco pero se pueda leer bien.
  function compressImage(file, maxW = 1600, maxH = 2600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('formato')); };
      img.src = url;
    });
  }
  // Pinta las miniaturas de forma asíncrona en los <img data-photo="id">.
  async function hydratePhotos(root = document) {
    for (const el of $$('img[data-photo]', root)) {
      const url = await photoUrl(el.dataset.photo);
      if (url) el.src = url;
      else el.replaceWith(Object.assign(document.createElement('div'), { className: 'missing', textContent: 'Foto no disponible en este dispositivo' }));
    }
  }

  // ---------- Datos ----------
  const newCard = (q, a) => ({ id: uid(), q, a, box: 1, due: todayStr() });
  const newDeck = (fields) => ({
    id: uid(), name: '', emoji: '📘', course: '', subject: '', publisher: '', unit: '',
    cards: [], photos: [], ocrText: '', lesson: { outline: '', summary: '' }, videos: [], ...fields,
  });
  const newProfile = (name, course) => ({
    id: uid(), name, course, points: 0, streak: 0, lastStudy: null, history: {}, decks: [], books: [],
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
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function renderHeader() {
    const p = P();
    if (!p) { $('#score').innerHTML = ''; return; }
    const streakActive = p.lastStudy === todayStr() || p.lastStudy === addDays(todayStr(), -1);
    $('#score').innerHTML = `
      <span title="Puntos">⭐ ${p.points}</span>
      <span title="Días seguidos estudiando">🔥 ${streakActive ? p.streak : 0}</span>
      <span class="who">👤 ${esc(p.name)}</span>`;
  }
  const cheer = () => pick(['¡Genial!', '¡Muy bien!', '¡Correcto!', '¡Eres un crack!', '¡Perfecto!']);
  const courseOptions = (selected, placeholder) =>
    (placeholder ? `<option value="">${placeholder}</option>` : '') +
    COURSES.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.label}</option>`).join('');
  const subjectOptions = (selected, placeholder) =>
    (placeholder ? `<option value="">${placeholder}</option>` : '') +
    SUBJECTS.map(([n]) => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const publisherDatalist = () => `<datalist id="publishers">${PUBLISHERS.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
  const deckTile = (d) => {
    const due = dueCards(d).length;
    return `<a class="card deck" href="#/deck/${d.id}">
      <div class="emoji">${esc(d.emoji || '📘')}</div>
      <div class="name">${esc(deckTitle(d))}</div>
      ${deckMeta(d) ? `<div class="muted small">${esc(deckMeta(d))}</div>` : ''}
      <div class="muted small">${d.cards.length} tarjetas · ${d.cards.length ? (due ? `${due} por repasar` : 'al día ✅') : 'sin tarjetas'}</div>
      <div class="tile-stars" title="${starCount(d)} de 5 estrellas">${starsHtml(d)}</div>
    </a>`;
  };

  // ---------- Bienvenida / perfiles ----------
  function viewWelcome() {
    app.innerHTML = `
      <div class="center"><div class="huge">📚</div></div>
      <h1 class="center">¡Bienvenido a App Studio!</h1>
      <p class="center muted">Antes de empezar, cuéntanos un poco sobre quién va a estudiar.</p>
      <form class="card" id="f">
        <label for="nm">¿Cómo te llamas?</label>
        <input type="text" id="nm" required maxlength="30" autocomplete="off" placeholder="Tu nombre">
        <label for="cu">¿En qué curso estás?</label>
        <select id="cu" required>
          <option value="" disabled selected>Elige tu curso</option>
          ${courseOptions(null)}
        </select>
        <button class="btn primary block" style="margin-top:16px">Empezar</button>
      </form>
    `;
    const sel = $('#cu');
    $('#f').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#nm').value.trim();
      if (!name || !sel.value) return;
      const prof = newProfile(name, sel.value);
      data.profiles.push(prof);
      data.activeId = prof.id;
      resetMathCfg();
      resetFilters();
      save();
      go('#/');
    };
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

  // ---------- Inicio ----------
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

      <div class="row" style="margin-top:16px">
        <a class="btn" href="#/search">🔎 Buscar tema</a>
        <a class="btn" href="#/books">📚 Mis libros</a>
        <a class="btn primary" href="#/new">➕ Nuevo tema</a>
      </div>

      <h2>¿Qué quieres estudiar?</h2>
      <div class="grid">
        ${p.decks.map(deckTile).join('')}
        <a class="card deck" href="#/math">
          <div class="emoji">➗</div>
          <div class="name">Cálculo mental</div>
          <div class="muted small">${MATH_BY_LEVEL[levelOf(p)].ops.map((o) => OPS[o]).slice(0, 4).join(', ')}…</div>
        </a>
      </div>

      <h2>Para mayores</h2>
      <a class="btn block" href="#/parents">👨‍👩‍👦 Zona padres: progreso y ajustes</a>
    `;
  }

  // ---------- Buscador de temas ----------
  const filters = { course: '', subject: '', publisher: '', q: '' };
  function resetFilters() { Object.assign(filters, { course: '', subject: '', publisher: '', q: '' }); }

  function viewSearch() {
    const p = P();
    const publishers = [...new Set(p.decks.map((d) => d.publisher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    if (filters.publisher && !publishers.includes(filters.publisher)) filters.publisher = '';
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>🔎 Buscar tema</h1>
      <div class="card">
        <label for="fq">Buscar</label>
        <input type="search" id="fq" value="${esc(filters.q)}" placeholder="Nº de tema, título o una palabra del contenido">
        <div class="filters">
          <div><label for="fc">Curso</label><select id="fc">${courseOptions(filters.course, 'Todos')}</select></div>
          <div><label for="fs">Asignatura</label><select id="fs">${subjectOptions(filters.subject, 'Todas')}</select></div>
          <div><label for="fp">Editorial</label><select id="fp"><option value="">Todas</option>${publishers.map((n) => `<option ${n === filters.publisher ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        </div>
      </div>
      <div id="results"></div>
      <div class="row" style="margin-top:8px">
        <a class="btn primary" href="#/new">➕ Nuevo tema</a>
      </div>
    `;
    const renderResults = () => {
      const q = normalize(filters.q);
      const res = p.decks.filter((d) =>
        (!filters.course || d.course === filters.course) &&
        (!filters.subject || d.subject === filters.subject) &&
        (!filters.publisher || d.publisher === filters.publisher) &&
        (!q || normalize([deckTitle(d), d.subject, d.publisher, ...d.cards.flatMap((c) => [c.q, c.a])].join(' ')).includes(q)));
      res.sort((a, b) => (a.subject || '').localeCompare(b.subject || '', 'es') || (Number(a.unit) || 0) - (Number(b.unit) || 0) || a.name.localeCompare(b.name, 'es'));
      $('#results').innerHTML = res.length
        ? `<p class="muted small">${res.length} ${res.length === 1 ? 'tema' : 'temas'}</p><div class="grid">${res.map(deckTile).join('')}</div>`
        : `<div class="card center muted">No hay temas con esos filtros.<br>Puedes crearlo con "Nuevo tema".</div>`;
    };
    $('#fq').oninput = (e) => { filters.q = e.target.value; renderResults(); };
    $('#fc').onchange = (e) => { filters.course = e.target.value; renderResults(); };
    $('#fs').onchange = (e) => { filters.subject = e.target.value; renderResults(); };
    $('#fp').onchange = (e) => { filters.publisher = e.target.value; renderResults(); };
    renderResults();
  }

  // ---------- Crear tema ----------
  function deckFormFields(d) {
    return `
      <label for="tt">Título del tema</label>
      <input type="text" id="tt" required maxlength="80" value="${esc(d.name)}" placeholder="Ej.: La célula">
      <div class="filters">
        <div><label for="tu">Nº de tema</label><input type="text" inputmode="numeric" id="tu" maxlength="5" value="${esc(d.unit)}" placeholder="Ej.: 3"></div>
        <div><label for="ts">Asignatura</label><select id="ts">${subjectOptions(d.subject, 'Elige…')}</select></div>
        <div><label for="tc">Curso</label><select id="tc">${courseOptions(d.course, 'Elige…')}</select></div>
        <div><label for="tp">Editorial</label><input type="text" id="tp" list="publishers" maxlength="40" value="${esc(d.publisher)}" placeholder="Ej.: Anaya"></div>
        <div><label for="te">Emoji</label><input type="text" id="te" maxlength="4" value="${esc(d.emoji && d.emoji !== '📘' ? d.emoji : '')}" placeholder="${esc(subjectEmoji(d.subject))}"></div>
      </div>
      ${publisherDatalist()}`;
  }
  function readDeckForm() {
    const subject = $('#ts').value;
    return {
      name: $('#tt').value.trim(),
      unit: $('#tu').value.trim(),
      subject,
      course: $('#tc').value,
      publisher: $('#tp').value.trim(),
      emoji: $('#te').value.trim() || subjectEmoji(subject),
    };
  }

  function viewNew() {
    const p = P();
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>➕ Nuevo tema</h1>
      <form class="card" id="f">
        ${deckFormFields({ name: '', unit: '', subject: filters.subject, course: filters.course || p.course, publisher: filters.publisher, emoji: '' })}
        <button class="btn primary block" style="margin-top:16px">Crear tema</button>
      </form>
      <p class="muted small">Después podrás añadir las fotos de las páginas del libro o de los apuntes y crear las tarjetas.</p>
    `;
    $('#ts').onchange = () => { $('#te').placeholder = subjectEmoji($('#ts').value); };
    $('#f').onsubmit = (e) => {
      e.preventDefault();
      const fields = readDeckForm();
      if (!fields.name) return;
      const deck = newDeck(fields);
      p.decks.push(deck);
      save();
      go(`#/edit/${deck.id}`);
    };
  }

  // ---------- Tema ----------
  function viewDeck(id) {
    const deck = getDeck(id);
    if (!deck) return go('#/');
    const due = dueCards(deck).length;
    const ex = deck.explain;
    const hasMaterial = !!(deck.lesson?.outline || deck.lesson?.summary || deck.photos?.length || deck.videos?.length);
    const row = (n, key, title, desc, href, ok) => `
      <${ok ? 'a' : 'div'} class="step ${deck.progress?.[key] ? 'done' : ''} ${ok ? '' : 'off'}" ${ok ? `href="${href}"` : ''}>
        <span class="step-n">${n}</span>
        <span class="step-body"><b>${title}</b><span class="muted small">${desc}</span></span>
        <span class="step-star">${deck.progress?.[key] ? '⭐' : '☆'}</span>
      </${ok ? 'a' : 'div'}>`;
    const needAi = 'Prepáralo con IA en "Editar este tema"';
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1 style="margin-bottom:2px">${esc(deck.emoji || '📘')} ${esc(deckTitle(deck))}</h1>
      <p class="muted">${esc(deckMeta(deck))}${deckMeta(deck) ? '<br>' : ''}${deckBookInfo(deck)}${deck.cards.length} tarjetas · ${due} por repasar hoy</p>

      <div class="card route">
        <div class="route-head"><h2 style="margin:0">🧭 Tu ruta de estudio</h2><span class="stars">${starsHtml(deck)}</span></div>
        <p class="muted small">Sigue los pasos en orden. Cada paso completado es una estrella.</p>
        ${row(1, 'entender', '📖 Entender el tema', ex ? `Explicación con ejemplos, curiosidades y preguntas · ${ex.apartados.length} apartados` : needAi, `#/explain/${deck.id}`, !!ex)}
        ${row(2, 'video', '🎬 Vídeo de la lección', ex ? 'Un repaso animado de todo el tema, narrado con la voz' : needAi, `#/video/${deck.id}`, !!ex)}
        ${row(3, 'esquema', '🗺️ Esquema en blanco', deck.lesson?.outline ? 'Recuerda cada idea del esquema antes de destaparla' : needAi, `#/blank/${deck.id}`, !!deck.lesson?.outline)}
        ${row(4, 'tarjetas', '🃏 Tarjetas', deck.cards.length ? (due ? `${due} por repasar hoy` : 'Todas al día ✅ (puedes repasarlas igual)') : 'Este tema aún no tiene tarjetas', `#/study/${deck.id}`, deck.cards.length > 0)}
        ${row(5, 'desarrollo', '✍️ Preguntas de desarrollo', deck.dev?.length ? `${deck.dev.length} preguntas tipo examen · consigue un 5 o más` : needAi, `#/dev/${deck.id}`, !!deck.dev?.length)}
        ${row(6, 'test', '📝 Test', deck.cards.length ? 'Saca un 7 o más para la estrella' : 'Hace falta tener tarjetas', `#/quiz/${deck.id}/${deck.cards.length >= 2 ? 'choice' : 'write'}`, deck.cards.length > 0)}
      </div>

      ${outlineTree(deck.lesson?.outline).length >= 2 ? `<a class="card deck map-card" href="#/map/${deck.id}" style="margin-bottom:12px">
        <div class="name">🧠 Mapa interactivo del tema</div>
        <div class="muted small">Explora el esquema tocando las ramas y juega a "¿Dónde va?"</div>
      </a>` : ''}
      ${deck.labelEx?.length ? `<div class="card">
        <h2 style="margin-top:0">🏷️ Imágenes para completar</h2>
        <p class="muted small">Dibujos del libro con los nombres tapados: ¿sabrías ponerlos?</p>
        ${deck.labelEx.map((ex) => `<a class="step" href="#/labels/${deck.id}/${ex.id}"><span class="step-n">🏷️</span><span class="step-body"><b>${esc(ex.title)}</b><span class="muted small">${ex.labels.length} nombres${ex.best != null ? ` · mejor: ${ex.best}/${ex.labels.length}` : ''}</span></span><span class="step-star">${ex.best === ex.labels.length ? '✅' : ''}</span></a>`).join('')}
      </div>` : ''}
      ${hasMaterial ? `<a class="card deck" href="#/learn/${deck.id}" style="margin-bottom:12px">
        <div class="name">📚 Material del tema</div>
        <div class="muted small">Esquema, resumen para escuchar${deck.photos?.length ? ', páginas del libro' : ''}${deck.videos?.length ? ' y vídeos' : ''}</div>
      </a>` : ''}
      ${deck.cards.length ? `<div class="row" style="margin-bottom:12px"><a class="btn" href="#/quiz/${deck.id}/write">✏️ Test escribiendo la respuesta</a></div>` : ''}
      <a class="btn ghost block" href="#/edit/${deck.id}">✏️ Editar este tema</a>
    `;
  }

  // ---- Vídeo de la lección (Remotion Player, generado al momento con los datos del tema) ----
  let currentVideo = null;
  function stopVideo() {
    if (currentVideo) { try { currentVideo.unmount(); } catch (e) { /* nada */ } currentVideo = null; }
  }
  // Prepara los datos de la lección para el vídeo a partir de la explicación de Claude.
  async function lessonForVideo(deck) {
    const ex = deck.explain;
    const cut = (t, n) => (t.length <= n ? t : `${t.slice(0, t.lastIndexOf(' ', n) > 40 ? t.lastIndexOf(' ', n) : n)}…`);
    const sections = [];
    for (const a of ex.apartados) {
      const sentences = splitSentences(String(a.texto || '').replace(/\s*\n+\s*/g, ' '))
        .map((x) => x.trim()).filter((x) => x.length > 3).slice(0, 4).map((x) => cut(x, 230));
      let figure = null;
      const im = (a.imagenes || []).find((x) => deck.photos.includes(x.pid));
      if (im) {
        const src = await figureUrl(im).catch(() => null);
        if (src) figure = { src, caption: im.pie || '' };
      }
      sections.push({ title: a.titulo, sentences, example: a.ejemplo || '', funFact: a.sabias_que || '', figure });
    }
    const withQ = ex.apartados.filter((a) => a.pregunta);
    const pickQ = withQ.length <= 3 ? withQ : [withQ[0], withQ[Math.floor(withQ.length / 2)], withQ[withQ.length - 1]];
    return {
      title: deckTitle(deck),
      emoji: deck.emoji || '📘',
      subject: [deck.subject, courseById(deck.course)?.label].filter(Boolean).join(' · '),
      intro: ex.intro || '',
      sections,
      timeline: ex.linea_tiempo.map((t) => ({ date: t.fecha, event: t.hecho })),
      causes: ex.causas_consecuencias.map((c) => ({ cause: c.causa, effect: c.consecuencia })),
      glossary: ex.glosario.map((g) => ({ term: g.termino, def: g.definicion })),
      quiz: pickQ.map((a) => ({ q: a.pregunta.enunciado, options: a.pregunta.opciones, correct: a.pregunta.correcta })),
    };
  }

  async function viewVideo(id) {
    const deck = getDeck(id);
    if (!deck || !deck.explain) return go(`#/deck/${id}`);
    let voiceOn = (() => { try { return localStorage.getItem('app-studio-video-voice') !== 'off'; } catch (e) { return true; } })();
    app.innerHTML = `
      <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
      <h1>🎬 Vídeo de la lección</h1>
      <div class="video-box">
        <div id="vp" class="video-player"><div class="muted center" style="padding:40px">Preparando el vídeo…</div></div>
        <button class="video-start" id="vstart" hidden>▶️ Ver el vídeo</button>
      </div>
      <div class="row" style="margin-top:12px;align-items:center">
        ${speech.supported ? `<label class="check" style="margin:0"><input type="checkbox" id="vvoice" ${voiceOn ? 'checked' : ''}> 🔊 Narración con voz</label>` : '<p class="muted small">Este dispositivo no puede leer en voz alta: el vídeo se verá sin narración.</p>'}
      </div>
      <p class="muted small">Si la voz tarda más en leer una escena, el vídeo la espera. Toca dos veces el vídeo para verlo a pantalla completa.</p>
      <div id="vdone"></div>`;
    const lesson = await lessonForVideo(deck);
    try {
      await loadScript('./lesson-video.js');
    } catch (e) {
      $('#vp').innerHTML = '<div class="muted center" style="padding:40px">No se pudo cargar el vídeo. Comprueba la conexión y vuelve a intentarlo.</div>';
      return;
    }
    if (location.hash !== `#/video/${id}`) return; // ya se ha cambiado de pantalla
    $('#vp').innerHTML = '';
    const handle = window.AppStudioVideo.mount($('#vp'), lesson, {
      onReady: (player) => setupVoice(player),
    });
    currentVideo = handle;
    const { scenes, starts } = handle;
    const sceneAt = (f) => { let i = 0; while (i + 1 < starts.length && starts[i + 1] <= f) i++; return i; };

    function setupVoice(player) {
      let cur = -1, speaking = false, waiting = false, autoPause = false, autoPlay = false, token = 0;
      const speakScene = (i) => {
        const my = ++token;
        speaking = true;
        speech.play([scenes[i].narration], 1, () => {}, () => {
          if (my !== token) return; // una lectura anterior que se ha cancelado
          speaking = false;
          if (waiting) { waiting = false; autoPlay = true; player.play(); }
        });
      };
      const silence = () => { token++; speech.stop(); speaking = false; waiting = false; };
      player.addEventListener('frameupdate', (e) => {
        const f = e.detail.frame;
        const i = sceneAt(f);
        if (i !== cur) {
          cur = i;
          if (voiceOn && player.isPlaying()) speakScene(i);
        } else if (voiceOn && speaking && player.isPlaying() && f >= starts[i] + scenes[i].duration - 3) {
          // La voz no ha terminado: el vídeo espera a que acabe la escena.
          waiting = true;
          autoPause = true;
          player.pause();
        }
      });
      player.addEventListener('play', () => {
        $('#vstart').hidden = true;
        if (autoPlay) { autoPlay = false; return; }
        cur = sceneAt(player.getCurrentFrame());
        if (voiceOn) speakScene(cur);
      });
      player.addEventListener('pause', () => {
        if (autoPause) { autoPause = false; return; }
        silence();
      });
      player.addEventListener('seeked', () => { silence(); cur = -1; });
      player.addEventListener('ended', () => {
        silence();
        const first = markStep(deck, 'video');
        $('#vdone').innerHTML = `<div class="card center"><div class="huge">🎉</div><h2 style="margin-top:0">¡Vídeo terminado!</h2>
          ${first ? '<p>⭐ Has ganado la estrella del vídeo</p>' : ''}
          <div class="row"><a class="btn primary" href="#/blank/${deck.id}">🗺️ Ir al esquema en blanco</a><a class="btn" href="#/deck/${deck.id}">Volver al tema</a></div></div>`;
        $('#vdone').scrollIntoView({ behavior: 'smooth' });
      });
      if ($('#vvoice')) {
        $('#vvoice').onchange = (e) => {
          voiceOn = e.target.checked;
          try { localStorage.setItem('app-studio-video-voice', voiceOn ? 'on' : 'off'); } catch (err) { /* nada */ }
          if (!voiceOn) silence(); else if (player.isPlaying()) speakScene(sceneAt(player.getCurrentFrame()));
        };
      }
      const start = $('#vstart');
      start.hidden = false;
      start.onclick = () => {
        // En iPad la voz solo puede empezar tras un toque: se "despierta" aquí mismo.
        if (speech.supported && voiceOn) { try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch (e) { /* nada */ } }
        start.hidden = true;
        player.play();
      };
    }
  }

  // ---- Mapa interactivo del esquema ----
  // Convierte el esquema ("# apartado", "- idea", "  - subidea") en ramas con ideas.
  function outlineTree(text) {
    const branches = [];
    let cur = null, lastIdea = null;
    for (const raw of String(text || '').split(/\r?\n/)) {
      if (!raw.trim()) continue;
      let m;
      if ((m = raw.trim().match(/^#+\s*(.+)$/))) { cur = { title: m[1].trim(), ideas: [] }; branches.push(cur); lastIdea = null; continue; }
      if ((m = raw.match(/^(\s*)[-•*]\s+(.+)$/))) {
        const sub = m[1].length >= 2;
        if (!cur) { cur = { title: '', ideas: [] }; branches.push(cur); }
        if (sub && lastIdea) lastIdea.subs.push(m[2].trim());
        else { lastIdea = { text: m[2].trim(), subs: [] }; cur.ideas.push(lastIdea); }
      }
    }
    // Sin títulos: cada idea principal es una rama y sus subideas, sus ideas.
    if (branches.length === 1 && !branches[0].title) {
      return branches[0].ideas.map((i) => ({ title: i.text, ideas: i.subs.map((t) => ({ text: t, subs: [] })) })).filter((b) => b.ideas.length);
    }
    return branches.filter((b) => b.title && b.ideas.length);
  }
  const MAP_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];
  const MAP_EMOJI = ['🔵', '🌸', '🌟', '🌿', '💧', '🔮', '🔥', '🐬'];
  const stripMd = (t) => String(t).replace(/\*\*/g, '');

  function viewMap(id, mode) {
    const deck = getDeck(id);
    const tree = outlineTree(deck?.lesson?.outline);
    if (!deck || tree.length < 2) return go(`#/deck/${id}`);
    const open = new Set();
    const color = (i) => MAP_COLORS[i % MAP_COLORS.length];

    function header(active) {
      return `<a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
        <div class="map-tabs">
          <a class="chip ${active === 'explore' ? 'on' : ''}" href="#/map/${deck.id}">🧭 Explorar</a>
          <a class="chip ${active === 'game' ? 'on' : ''}" href="#/map/${deck.id}/juego">🎯 ¿Dónde va?</a>
        </div>`;
    }

    function explore() {
      app.innerHTML = `${header('explore')}
        <div class="map">
          <div class="map-center"><span>${esc(deck.emoji || '📘')}</span>${esc(deck.name)}</div>
          <p class="muted small center">Toca cada rama para descubrir sus ideas. Toca una idea para escucharla.</p>
          <div class="map-branches">
            ${tree.map((b, i) => `
              <div class="branch ${open.has(i) ? 'open' : ''}" style="--c:${color(i)}">
                <button class="branch-head" data-b="${i}">
                  <span class="branch-n">${i + 1}</span>
                  <span class="branch-t">${inline(b.title)}</span>
                  <span class="branch-count">${open.has(i) ? '−' : b.ideas.length}</span>
                </button>
                ${open.has(i) ? `<div class="branch-ideas">${b.ideas.map((idea, k) => `
                  <button class="idea" data-say-text="${esc(stripMd(idea.text))}" style="animation-delay:${k * 90}ms">${inline(idea.text)}
                    ${idea.subs.length ? `<span class="subs">${idea.subs.map((t) => `<span class="sub">${inline(t)}</span>`).join('')}</span>` : ''}
                  </button>`).join('')}</div>` : ''}
              </div>`).join('')}
          </div>
          <div class="row" style="margin-top:12px">
            <button class="btn" id="openAll">${open.size === tree.length ? '🙈 Cerrar todas' : '👀 Abrir todas'}</button>
            <a class="btn primary" href="#/map/${deck.id}/juego">🎯 Jugar a "¿Dónde va?"</a>
          </div>
        </div>`;
      $$('.branch-head').forEach((b) => {
        b.onclick = () => {
          const i = Number(b.dataset.b);
          if (open.has(i)) open.delete(i); else { open.add(i); if (speech.supported) speech.play([stripMd(tree[i].title)], 1, () => {}, () => {}); }
          explore();
        };
      });
      $$('.idea').forEach((el) => {
        el.onclick = () => {
          $$('.idea').forEach((x) => x.classList.remove('speaking'));
          el.classList.add('speaking');
          if (speech.supported) speech.play([el.dataset.sayText], 1, () => {}, () => el.classList.remove('speaking'));
        };
      });
      $('#openAll').onclick = () => { if (open.size === tree.length) open.clear(); else tree.forEach((_, i) => open.add(i)); explore(); };
    }

    function game() {
      const pool = shuffle(tree.flatMap((b, i) => b.ideas.map((idea) => ({ text: idea.text, b: i }))));
      const rounds = pool.slice(0, Math.min(12, pool.length));
      let r = 0, score = 0, streak = 0, bestStreak = 0, locked = false;
      function round() {
        if (r >= rounds.length) {
          const pct = score / rounds.length;
          app.innerHTML = `${header('game')}
            <div class="card center">
              <div class="huge">${pct === 1 ? '🏆' : pct >= 0.7 ? '🎉' : '💪'}</div>
              <h1>${score} de ${rounds.length}</h1>
              <p>Mejor racha: <b>${bestStreak}</b> 🔥</p>
              <p class="muted">${pct === 1 ? '¡Perfecto! Te sabes la estructura del tema.' : 'Repasa las ramas en "Explorar" y vuelve a intentarlo.'}</p>
              <div class="row"><button class="btn primary" id="again">🔁 Otra partida</button><a class="btn" href="#/map/${deck.id}">🧭 Explorar el mapa</a></div>
            </div>`;
          $('#again').onclick = game;
          return;
        }
        const q = rounds[r];
        locked = false;
        app.innerHTML = `${header('game')}
          <div class="game-top"><span>Idea ${r + 1} de ${rounds.length}</span><span>⭐ ${score}</span><span class="streak ${streak >= 3 ? 'hot' : ''}">🔥 ${streak}</span></div>
          <div class="progress"><div style="width:${(r / rounds.length) * 100}%"></div></div>
          <div class="card idea-card pop">${inline(q.text)}</div>
          <p class="center muted">¿A qué rama del tema pertenece?</p>
          <div class="game-branches">${tree.map((b, i) => `<button class="game-b" data-gb="${i}" style="--c:${color(i)}"><span class="branch-n">${i + 1}</span>${inline(b.title)}</button>`).join('')}</div>
          <div id="gfb"></div>`;
        $$('.game-b').forEach((btn) => {
          btn.onclick = () => {
            if (locked) return;
            locked = true;
            const ok = Number(btn.dataset.gb) === q.b;
            recordAnswer(ok, 5);
            if (ok) { score++; streak++; bestStreak = Math.max(bestStreak, streak); btn.classList.add('right'); } else { streak = 0; btn.classList.add('wrong'); $(`.game-b[data-gb="${q.b}"]`).classList.add('right'); }
            $('#gfb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'ko'}">${ok ? (streak >= 3 ? `¡Racha de ${streak}! 🔥 +5` : `${cheer()} +5`) : 'Esa idea va en la rama verde'}</div>`;
            setTimeout(() => { r++; round(); }, ok ? 900 : 1800);
          };
        });
        onKey((k) => { const b = $$('.game-b')[Number(k) - 1]; if (b) b.click(); });
      }
      round();
    }

    if (mode === 'juego') game(); else explore();
  }

  // ---- Imagen muda: poner los nombres ----
  function viewLabels(id, exId) {
    const deck = getDeck(id);
    const ex = deck?.labelEx?.find((x) => x.id === exId);
    if (!ex || !ex.crop) return go(`#/deck/${id}`);
    const labels = ex.labels;
    let mode = 'bank';
    let selected = null;
    let checked = false;
    const answers = labels.map(() => '');
    const bank = shuffle([...new Set(labels.map((l) => l.text))]);
    const isRight = (i) => {
      const a = lnorm(answers[i]), c = lnorm(labels[i].text);
      return !!a && (a === c || (c.length > 5 && lev(a, c) <= 1));
    };
    // Posición de cada rótulo dentro de la zona recortada (en %), con un pequeño margen para taparlo bien.
    const pos = (b) => {
      const padX = 0.6, padY = 0.5;
      const x = b.x - padX, y = b.y - padY, w = b.w + 2 * padX, h = b.h + 2 * padY;
      return {
        left: ((x - ex.crop.x) / ex.crop.w) * 100, top: ((y - ex.crop.y) / ex.crop.h) * 100,
        width: (w / ex.crop.w) * 100, height: (h / ex.crop.h) * 100,
      };
    };

    function render() {
      app.innerHTML = `
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
        <h1>🏷️ ${esc(ex.title)}</h1>
        <p class="muted">${mode === 'bank' ? 'Toca un hueco y después el nombre que va ahí.' : 'Escribe el nombre que va en cada número.'}</p>
        <div class="lbl-wrap" id="lw"><img id="limg" alt="Dibujo del libro con los nombres tapados">
          ${labels.map((l, i) => {
            const p = pos(l.box);
            const st = checked ? (isRight(i) ? 'ok' : 'ko') : '';
            return `<button class="lbl-box ${st} ${selected === i ? 'sel' : ''} ${answers[i] ? 'filled' : ''}" data-i="${i}" style="left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%">
              ${answers[i] ? `<span class="lbl-txt">${esc(answers[i])}</span>` : `<span class="lbl-n">${i + 1}</span>`}</button>`;
          }).join('')}
        </div>
        ${mode === 'bank' ? `<div class="chips lbl-bank">${bank.map((t) => `<button class="chip ${answers.includes(t) ? 'used' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : `
          <div class="lbl-inputs">${labels.map((l, i) => `<label class="lbl-in"><span class="lbl-n">${i + 1}</span><input type="text" data-in="${i}" value="${esc(answers[i])}" autocomplete="off"></label>`).join('')}</div>`}
        <div id="lres"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="lcheck">Comprobar</button>
          <button class="btn" id="lsol">Ver solución</button>
          <button class="btn" id="lreset">Empezar de nuevo</button>
        </div>
        <label class="check mode-toggle"><input type="checkbox" id="lmode" ${mode === 'write' ? 'checked' : ''}> Sin pistas: escribir los nombres</label>`;
      (async () => {
        const blob = await photoGet(ex.pid).catch(() => null);
        if (!blob) return;
        const key = ['lbl', ex.pid, ex.crop.x, ex.crop.y, ex.crop.w, ex.crop.h].join('|');
        let url = figCache.get(key);
        if (!url) {
          url = URL.createObjectURL(await cropBlob(blob, { left: ex.crop.x, top: ex.crop.y, right: 100 - ex.crop.x - ex.crop.w, bottom: 100 - ex.crop.y - ex.crop.h }));
          figCache.set(key, url);
        }
        const img = $('#limg');
        if (!img) return;
        img.onload = sizeText;
        img.src = url;
      })();
      $$('.lbl-box').forEach((b) => {
        b.onclick = () => {
          const i = Number(b.dataset.i);
          if (checked) return;
          if (mode === 'write') { $(`[data-in="${i}"]`).focus(); return; }
          if (answers[i]) { answers[i] = ''; selected = i; } else selected = selected === i ? null : i;
          render();
        };
      });
      $$('.lbl-bank .chip').forEach((c) => {
        c.onclick = () => {
          if (checked) return;
          const t = c.dataset.t;
          let i = selected;
          if (i == null) i = answers.findIndex((a) => !a);
          if (i < 0) return toast('Toca primero el hueco donde va');
          const prev = answers.indexOf(t);
          if (prev >= 0) answers[prev] = '';
          answers[i] = t;
          selected = answers.findIndex((a) => !a);
          if (selected < 0) selected = null;
          render();
        };
      });
      $$('[data-in]').forEach((inp) => {
        inp.oninput = () => {
          const i = Number(inp.dataset.in);
          answers[i] = inp.value;
          const box = $(`.lbl-box[data-i="${i}"]`);
          box.classList.toggle('filled', !!inp.value);
          box.innerHTML = inp.value ? `<span class="lbl-txt">${esc(inp.value)}</span>` : `<span class="lbl-n">${i + 1}</span>`;
          sizeText();
        };
        inp.onfocus = () => { $$('.lbl-box').forEach((b) => b.classList.toggle('sel', b.dataset.i === inp.dataset.in)); };
      });
      $('#lmode').onchange = (e) => { mode = e.target.checked ? 'write' : 'bank'; selected = null; render(); };
      $('#lreset').onclick = () => { answers.fill(''); checked = false; selected = null; render(); };
      $('#lsol').onclick = () => { labels.forEach((l, i) => { answers[i] = l.text; }); checked = true; render(); $('#lres').innerHTML = '<p class="muted center">Esta es la solución. Pulsa "Empezar de nuevo" para intentarlo tú.</p>'; };
      $('#lcheck').onclick = () => {
        if (answers.every((a) => !a.trim())) return toast('Pon algún nombre antes de comprobar');
        checked = true;
        const n = labels.filter((_, i) => isRight(i)).length;
        labels.forEach((_, i) => recordAnswer(isRight(i), POINTS_CARD));
        ex.best = Math.max(ex.best || 0, n);
        save();
        render();
        $('#lres').innerHTML = `<div class="feedback ${n === labels.length ? 'ok' : 'ko'}">${n === labels.length ? '🏆 ¡Todos bien!' : `Has acertado ${n} de ${labels.length}. Los rojos están mal: pulsa "Empezar de nuevo" o "Ver solución".`}</div>`;
      };
    }
    // Ajusta el tamaño de letra de cada hueco a su altura.
    function sizeText() {
      $$('.lbl-box').forEach((b) => {
        let fs = Math.max(9, Math.min(22, b.clientHeight * 0.62));
        b.style.fontSize = `${fs}px`;
        const t = $('.lbl-txt', b);
        // Reduce la letra hasta que el nombre quepa a lo ancho.
        while (t && t.scrollWidth > b.clientWidth - 4 && fs > 8) { fs -= 0.5; b.style.fontSize = `${fs}px`; }
      });
    }
    window.onresize = sizeText;
    render();
  }

  // ---- Ilustraciones del libro dentro de la explicación ----
  const figCache = new Map();
  async function figureUrl(im) {
    const key = [im.pid, im.x, im.y, im.w, im.h].join('|');
    if (figCache.has(key)) return figCache.get(key);
    const blob = await photoGet(im.pid).catch(() => null);
    if (!blob) return null;
    let url;
    if (Number.isFinite(im.x) && Number.isFinite(im.w)) {
      // Margen alrededor de la zona por si Claude no la ha marcado con exactitud.
      const pad = 4;
      const c = {
        left: Math.max(0, im.x - pad), top: Math.max(0, im.y - pad),
        right: Math.max(0, 100 - (im.x + im.w) - pad), bottom: Math.max(0, 100 - (im.y + im.h) - pad),
      };
      url = URL.createObjectURL(await cropBlob(blob, c).catch(() => blob));
    } else {
      url = URL.createObjectURL(blob);
    }
    figCache.set(key, url);
    return url;
  }
  async function hydrateFigures(a, i) {
    const list = (a.imagenes || []).filter((im) => getDeckPhotos().includes(im.pid));
    for (const [k, im] of list.entries()) {
      const el = $(`img[data-fig="${i}-${k}"]`);
      if (!el) continue;
      const url = await figureUrl(im);
      if (url) el.src = url; else el.closest('figure')?.remove();
    }
    $$('[data-full]').forEach((b) => { b.onclick = () => openLightbox(b.dataset.full); });
  }
  let currentDeckPhotos = [];
  const getDeckPhotos = () => currentDeckPhotos;
  async function openLightbox(pid) {
    const url = await photoUrl(pid);
    if (!url) return;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${url}" alt="Página del libro"><button class="lb-close" aria-label="Cerrar">✕</button>`;
    const close = () => { lb.remove(); document.removeEventListener('keydown', onEsc); };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    lb.onclick = (e) => { if (e.target === lb || e.target.classList.contains('lb-close')) close(); };
    document.addEventListener('keydown', onEsc);
    document.body.appendChild(lb);
  }

  // ---- Entender: explicación por pantallas ----
  function viewExplain(id) {
    const deck = getDeck(id);
    if (!deck || !deck.explain) return go(`#/deck/${id}`);
    const ex = deck.explain;
    currentDeckPhotos = deck.photos || [];
    const screens = [{ type: 'intro' }, ...ex.apartados.map((a, i) => ({ type: 'ap', a, i }))];
    if (ex.linea_tiempo.length || ex.causas_consecuencias.length) screens.push({ type: 'rel' });
    if (ex.glosario.length) screens.push({ type: 'glo' });
    screens.push({ type: 'end' });
    let n = 0;
    const answered = new Set();

    function body(sc) {
      if (sc.type === 'intro') {
        return `<div class="card rich explain-card"><div class="big-emoji">${esc(deck.emoji || '📘')}</div>
          <h2 data-say>${esc(deckTitle(deck))}</h2>
          ${ex.intro ? `<p data-say class="lead">${inline(ex.intro)}</p>` : ''}
          <p class="muted small">En ${ex.apartados.length} pasos vas a entender todo el tema. Lee con calma (o escúchalo) y responde a la pregunta de cada paso.</p></div>`;
      }
      if (sc.type === 'ap') {
        const a = sc.a, q = a.pregunta;
        return `<div class="card rich explain-card">
          <div class="muted small">Apartado ${sc.i + 1} de ${ex.apartados.length}</div>
          <h2 data-say>${esc(a.titulo)}</h2>
          ${renderRich(a.texto)}
          ${(a.imagenes || []).filter((im) => deck.photos.includes(im.pid)).map((im, k) => `
            <figure class="fig">
              <button class="fig-btn" data-full="${im.pid}" aria-label="Ver la página completa"><img data-fig="${sc.i}-${k}" alt="${esc(im.pie || 'Ilustración del libro')}"></button>
              ${im.pie ? `<figcaption data-say>📷 ${inline(im.pie)}</figcaption>` : ''}
              <div class="fig-hint">Toca la imagen para ver la página completa</div>
            </figure>`).join('')}
          ${a.ejemplo ? `<div class="box example"><b>🧩 Para entenderlo</b><p data-say>${inline(a.ejemplo)}</p></div>` : ''}
          ${a.sabias_que ? `<div class="box fun"><b>💡 ¿Sabías que…?</b><p data-say>${inline(a.sabias_que)}</p></div>` : ''}
          </div>
          ${q ? `<div class="card check">
            <b>🤔 Comprueba que lo has entendido</b>
            <p>${inline(q.enunciado)}</p>
            <div class="options">${q.opciones.map((o, k) => `<button class="btn option" data-k="${k}"><span class="opt-n">${k + 1}</span>${inline(o)}</button>`).join('')}</div>
            <div id="qfb"></div>
          </div>` : ''}`;
      }
      if (sc.type === 'rel') {
        return `<div class="card rich explain-card">
          ${ex.linea_tiempo.length ? `<h2 data-say>🕰️ Línea del tiempo</h2>
            <ol class="timeline">${ex.linea_tiempo.map((t) => `<li data-say><span class="t-date">${esc(t.fecha)}</span><span>${inline(t.hecho)}</span></li>`).join('')}</ol>` : ''}
          ${ex.causas_consecuencias.length ? `<h2 data-say>🔗 Causas y consecuencias</h2>
            ${ex.causas_consecuencias.map((c) => `<div class="cause" data-say><div class="c-box">${inline(c.causa)}</div><div class="c-arrow">➜</div><div class="c-box res">${inline(c.consecuencia)}</div></div>`).join('')}` : ''}
        </div>`;
      }
      if (sc.type === 'glo') {
        return `<div class="card rich explain-card"><h2 data-say>📒 Palabras clave</h2>
          <dl class="glossary">${ex.glosario.map((g) => `<div data-say><dt>${esc(g.termino)}</dt><dd>${inline(g.definicion)}</dd></div>`).join('')}</dl></div>`;
      }
      return `<div class="card center explain-card"><div class="huge">🎉</div><h2>¡Has terminado la explicación!</h2>
        <p>Ahora repasa todo el tema con el <b>vídeo de la lección</b>.</p>
        <div class="row"><a class="btn primary" href="#/video/${deck.id}">🎬 Ver el vídeo</a><a class="btn" href="#/deck/${deck.id}">Volver al tema</a></div></div>`;
    }

    function render() {
      speech.stop();
      const sc = screens[n];
      const needsAnswer = sc.type === 'ap' && sc.a.pregunta && !answered.has(n);
      app.innerHTML = `
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
        <div class="progress"><div style="width:${(n / (screens.length - 1)) * 100}%"></div></div>
        ${speech.supported && sc.type !== 'end' ? `<div class="row tts" style="margin-bottom:10px">
          <button class="btn" id="ttsPlay">🔊 Escuchar</button><button class="btn" id="ttsStop" hidden>⏹ Parar</button>
          <select id="ttsRate" aria-label="Velocidad"><option value="1">Velocidad normal</option><option value="0.8">Más despacio</option><option value="1.2">Más rápido</option></select></div>` : ''}
        <div id="explain">${body(sc)}</div>
        ${sc.type !== 'end' ? `<div class="row nav">
          <button class="btn" id="prev" ${n === 0 ? 'disabled' : ''}>← Anterior</button>
          <button class="btn primary" id="next" ${needsAnswer ? 'disabled' : ''}>${needsAnswer ? 'Responde para seguir' : 'Siguiente →'}</button>
        </div>` : ''}`;
      if (sc.type === 'end') markStep(deck, 'entender');
      if (sc.type === 'ap') hydrateFigures(sc.a, sc.i);
      if ($('#prev')) $('#prev').onclick = () => { n--; render(); window.scrollTo(0, 0); };
      if ($('#next')) $('#next').onclick = () => { n++; render(); window.scrollTo(0, 0); };
      onKey((k) => {
        if (k === 'ArrowRight' && $('#next') && !$('#next').disabled) $('#next').click();
        if (k === 'ArrowLeft' && $('#prev') && !$('#prev').disabled) $('#prev').click();
        const b = $$('.check .option')[Number(k) - 1];
        if (b) b.click();
      });
      if (sc.type === 'ap' && sc.a.pregunta) {
        const q = sc.a.pregunta;
        $$('.check .option').forEach((b) => {
          b.onclick = () => {
            if (answered.has(n)) return;
            answered.add(n);
            const ok = Number(b.dataset.k) === q.correcta;
            recordAnswer(ok, POINTS_CARD);
            $$('.check .option').forEach((x) => { if (Number(x.dataset.k) === q.correcta) x.classList.add('correct'); });
            if (!ok) b.classList.add('wrong');
            $('#qfb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'ko'}">${ok ? `${cheer()} +${POINTS_CARD} ⭐` : 'Casi. Fíjate en la correcta:'}</div>${q.explicacion ? `<p class="small">${inline(q.explicacion)}</p>` : ''}`;
            const nx = $('#next');
            nx.disabled = false;
            nx.textContent = 'Siguiente →';
          };
        });
        if (answered.has(n)) $$('.check .option').forEach((x) => { if (Number(x.dataset.k) === q.correcta) x.classList.add('correct'); });
      }
      if ($('#ttsPlay')) {
        const blocks = $$('#explain [data-say]');
        const play = $('#ttsPlay'), stop = $('#ttsStop');
        const mark = (i) => blocks.forEach((b, k) => b.classList.toggle('reading', k === i));
        const reset = () => { mark(-1); play.hidden = false; stop.hidden = true; };
        play.onclick = () => { play.hidden = true; stop.hidden = false; speech.play(blocks.map((b) => plain(b.textContent)), Number($('#ttsRate').value), mark, reset); };
        stop.onclick = () => { speech.stop(); reset(); };
      }
    }
    render();
  }

  // ---- Esquema en blanco ----
  function viewBlank(id) {
    const deck = getDeck(id);
    if (!deck || !deck.lesson?.outline) return go(`#/deck/${id}`);
    let hideTitles = false;
    function render() {
      app.innerHTML = `
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
        <h1>🗺️ Esquema en blanco</h1>
        <p class="muted">Antes de destapar cada idea, intenta decirla en voz alta con tus palabras. Toca la idea para comprobarlo.</p>
        <div class="row" style="margin-bottom:12px">
          <label class="check" style="margin:0"><input type="checkbox" id="ht" ${hideTitles ? 'checked' : ''}> Tapar también los títulos (más difícil)</label>
        </div>
        <div class="card rich blank-outline" id="bo">${renderRich(deck.lesson.outline)}</div>
        <div class="muted small" id="bcount"></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="cover">🙈 Tapar todo otra vez</button>
          <button class="btn" id="reveal">👀 Destapar todo</button>
        </div>`;
      const items = $$('#bo li' + (hideTitles ? ', #bo h3' : ''));
      items.forEach((el) => { el.classList.add('blank'); el.setAttribute('role', 'button'); el.tabIndex = 0; });
      const count = () => {
        const left = items.filter((el) => el.classList.contains('blank')).length;
        $('#bcount').textContent = left ? `Te quedan ${left} de ${items.length} ideas por destapar.` : '¡Lo has recorrido entero! 👏';
        return left;
      };
      const reveal = (el) => {
        if (!el.classList.contains('blank')) return;
        el.classList.remove('blank');
        if (count() === 0 && markStep(deck, 'esquema')) $('#bcount').textContent = '¡Esquema completo! Ya conoces la estructura del tema. ⭐';
      };
      items.forEach((el) => { el.onclick = () => reveal(el); el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(el); } }; });
      $('#ht').onchange = (e) => { hideTitles = e.target.checked; render(); };
      $('#cover').onclick = () => render();
      $('#reveal').onclick = () => { items.forEach((el) => el.classList.remove('blank')); $('#bcount').textContent = 'Todo destapado. Para ganar la estrella, destápalas una a una recordándolas.'; };
      count();
    }
    render();
  }

  // ---- Preguntas de desarrollo ----
  function viewDev(id, qi) {
    const deck = getDeck(id);
    if (!deck || !deck.dev?.length) return go(`#/deck/${id}`);
    if (qi == null || !deck.dev[qi]) {
      app.innerHTML = `
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
        <h1>✍️ Preguntas de desarrollo</h1>
        <p class="muted">Como en el examen: responde con tus palabras, de forma ordenada y completa. ${aiSettings().key ? 'Claude te corregirá y te dirá qué mejorar.' : 'Después compara con la respuesta modelo.'}</p>
        ${deck.dev.map((d, i) => `<a class="card deck dev-q" href="#/dev/${deck.id}/${i}">
          <div class="name">${i + 1}. ${esc(d.q)}</div>
          <div class="muted small">${d.best != null ? `Mejor nota: <b>${d.best.toLocaleString('es-ES')}</b> ${d.best >= 8 ? '🌟' : d.best >= 5 ? '✅' : ''}` : (d.last ? 'Empezada, sin corregir' : 'Sin responder todavía')}</div>
        </a>`).join('')}
        ${deck.dev.some((d) => d.last || d.best != null) ? `
          <button class="btn block" id="devReset" style="margin-top:4px">🔄 Reiniciar las que tengan menos de un 8</button>
          <p class="muted small center">Borra esas respuestas para volver a escribirlas. Las de 8 o más se mantienen.</p>` : ''}`;
      if ($('#devReset')) {
        $('#devReset').onclick = () => {
          const toReset = deck.dev.filter((d) => (d.best == null || d.best < 8) && (d.last || d.best != null));
          if (!toReset.length) return toast('Todas tienen un 8 o más. ¡Muy bien! 🌟');
          if (!confirm(`Se borrarán ${toReset.length} ${toReset.length === 1 ? 'respuesta' : 'respuestas'} con nota menor de 8 (o sin corregir) para volver a escribirlas. ¿Seguir?`)) return;
          toReset.forEach((d) => { d.last = ''; d.best = null; });
          save();
          viewDev(id, null);
          toast(`${toReset.length} ${toReset.length === 1 ? 'pregunta reiniciada' : 'preguntas reiniciadas'}`);
        };
      }
      return;
    }
    const q = deck.dev[qi];
    const hasKey = !!aiSettings().key;
    app.innerHTML = `
      <a class="back" href="#/dev/${deck.id}">← Preguntas de desarrollo</a>
      <div class="muted small">Pregunta ${Number(qi) + 1} de ${deck.dev.length}</div>
      <div class="card"><h2 style="margin:0">${esc(q.q)}</h2></div>
      <div class="card">
        <label for="devAns" style="margin-top:0">Tu respuesta</label>
        <textarea id="devAns" class="dev-ans" placeholder="Escribe (o dicta) tu respuesta: introduce el tema, desarrolla las ideas en orden y termina con una conclusión.">${esc(q.last || '')}</textarea>
        <div class="muted small" id="wc"></div>
        <div class="row" style="margin-top:10px">
          ${SpeechRec ? '<button class="btn" id="dict">🎤 Dictar</button>' : ''}
          <button class="btn primary" id="correct">${hasKey ? '✅ Corregir con Claude' : '✅ He terminado'}</button>
        </div>
        ${SpeechRec ? '' : '<p class="muted small">Para dictar, usa el micrófono del teclado de la tablet.</p>'}
      </div>
      <div id="result"></div>`;
    const ta = $('#devAns');
    const wc = () => { const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; $('#wc').textContent = `${n} palabras`; };
    ta.oninput = () => { wc(); q.last = ta.value; };
    ta.onchange = () => save();
    wc();
    if ($('#dict')) $('#dict').onclick = () => toggleDictation(ta, $('#dict'));

    const finish = (nota) => {
      q.best = q.best == null ? nota : Math.max(q.best, nota);
      q.last = ta.value;
      recordAnswer(nota >= 5, Math.round(nota * 3));
      if (nota >= 5) markStep(deck, 'desarrollo');
      save();
    };
    const modelHtml = () => `<details class="card"><summary><b>📄 Respuesta modelo</b></summary><div class="rich">${renderRich(q.model)}</div></details>`;
    const nextBtns = () => `<div class="row">
      ${Number(qi) + 1 < deck.dev.length ? `<a class="btn primary" href="#/dev/${deck.id}/${Number(qi) + 1}">Siguiente pregunta →</a>` : `<a class="btn primary" href="#/deck/${deck.id}">Volver al tema</a>`}
      <button class="btn" id="retry">🔁 Intentarlo otra vez</button></div>`;
    const bindRetry = () => { $('#retry').onclick = () => { ta.value = ''; q.last = ''; save(); viewDev(id, qi); }; };

    $('#correct').onclick = async () => {
      stopDictation();
      const answer = ta.value.trim();
      if (answer.split(/\s+/).length < 15) return toast('Escribe un poco más (al menos unas líneas)');
      q.last = answer;
      save();
      const out = $('#result');
      if (hasKey) {
        const btn = $('#correct');
        btn.disabled = true;
        out.innerHTML = '<div class="card muted">Claude está corrigiendo tu respuesta…</div>';
        try {
          const r = await aiCorrect(deck, q, answer);
          finish(r.nota);
          out.innerHTML = `
            <div class="card center grade ${r.nota >= 5 ? 'ok' : 'ko'}"><div class="grade-n">${r.nota.toLocaleString('es-ES')}</div><div>${r.nota >= 9 ? '¡Excelente! 🏆' : r.nota >= 7 ? '¡Muy bien! 👏' : r.nota >= 5 ? 'Aprobado 👍' : 'Hay que repasarlo 💪'}</div></div>
            ${r.bien ? `<div class="card box ok-box"><b>👍 Lo que has hecho bien</b><p>${inline(r.bien)}</p></div>` : ''}
            ${r.mejorar ? `<div class="card box fun"><b>🛠️ Para mejorar</b><p>${inline(r.mejorar)}</p></div>` : ''}
            ${r.consejo ? `<div class="card box example"><b>💡 Consejo</b><p>${inline(r.consejo)}</p></div>` : ''}
            <div class="card"><b>Puntos clave</b><ul class="keypoints">${q.points.map((pt, i) => `<li class="${r.included[i] ? 'yes' : 'no'}">${r.included[i] ? '✅' : '❌'} ${inline(pt)}</li>`).join('')}</ul></div>
            ${modelHtml()}
            ${nextBtns()}`;
          bindRetry();
        } catch (e) {
          out.innerHTML = '';
          toast(e.message || 'No se pudo corregir');
        } finally {
          btn.disabled = false;
        }
        return;
      }
      // Sin clave: autoevaluación con los puntos clave
      out.innerHTML = `
        <div class="card"><b>Marca los puntos clave que has incluido en tu respuesta</b>
          <ul class="keypoints selfcheck">${q.points.map((pt, i) => `<li><label class="check" style="margin:6px 0"><input type="checkbox" data-pt="${i}"> ${inline(pt)}</label></li>`).join('')}</ul>
          <button class="btn primary block" id="grade">Calcular mi nota</button>
        </div>
        ${modelHtml()}`;
      $('#grade').onclick = () => {
        const n = $$('[data-pt]').filter((c) => c.checked).length;
        const nota = q.points.length ? Math.round((n / q.points.length) * 100) / 10 : 0;
        finish(nota);
        $('#grade').outerHTML = `<div class="card center grade ${nota >= 5 ? 'ok' : 'ko'}" style="margin-top:10px"><div class="grade-n">${nota.toLocaleString('es-ES')}</div><div>${nota >= 5 ? '¡Bien!' : 'Repasa los puntos que te faltan 💪'}</div></div>${nextBtns()}`;
        bindRetry();
      };
    };
  }

  function viewPhotos(id) {
    const deck = getDeck(id);
    if (!deck) return go('#/');
    app.innerHTML = `
      <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
      <h1>📖 Fotos del tema</h1>
      ${deck.photos.length ? deck.photos.map((pid, i) => `
        <div class="card photo-full">
          <div class="muted small">Foto ${i + 1} de ${deck.photos.length}</div>
          <a data-open="${pid}"><img data-photo="${pid}" alt="Foto ${i + 1} del tema"></a>
        </div>`).join('') : '<div class="card muted">Este tema no tiene fotos.</div>'}
    `;
    hydratePhotos(app);
    $$('[data-open]').forEach((a) => {
      a.onclick = async () => { const url = await photoUrl(a.dataset.open); if (url) window.open(url, '_blank'); };
    });
  }

  // ---- Tarjetas (repaso espaciado) ----
  function viewStudy(id) {
    const deck = getDeck(id);
    if (!deck || !deck.cards.length) return go('#/');
    let queue = dueCards(deck);
    if (!queue.length) queue = deck.cards.slice();
    queue = shuffle(queue);
    const total = queue.length;
    let done = 0, right = 0, revealed = false, given = '';
    // Modo "escribir": escribe o dicta la respuesta antes de verla. Modo "pensar": solo pensarla.
    const writeMode = () => P().cardMode !== 'think';

    function render() {
      stopDictation();
      if (!queue.length) {
        const firstStar = !deck.progress?.tarjetas;
        if (firstStar) setTimeout(() => markStep(deck, 'tarjetas'), 0);
        app.innerHTML = `
          <div class="center">
            <div class="huge">🎉</div>
            <h1>¡Repaso terminado!</h1>
            <p>Has acertado <b>${right}</b> de <b>${done}</b>.</p>
          </div>
          ${firstStar ? '<p class="center">⭐ Has ganado la estrella de las tarjetas</p>' : ''}
          <div class="row">
            <a class="btn primary" href="#/deck/${deck.id}">Volver al tema</a>
            <a class="btn" href="#/">Inicio</a>
          </div>`;
        return;
      }
      const card = queue[0];
      app.innerHTML = `
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
        <div class="muted small">Tarjeta ${Math.min(done + 1, total)} de ${total}</div>
        <div class="progress"><div style="width:${(done / total) * 100}%"></div></div>
        <div class="card flash ${writeMode() && !revealed ? 'no-tap' : ''}" id="flash">
          <div>${esc(card.q)}</div>
          ${revealed ? `<div class="answer">${esc(card.a)}</div>` : (writeMode() ? '' : '<div class="hint">Toca para ver la respuesta</div>')}
          ${writeMode() ? '' : `<div class="kbd-hint">Teclado: ${revealed ? '← No · → Sí' : 'espacio para girar'}</div>`}
        </div>
        ${revealed ? `
          ${writeMode() ? matchHtml(given, card.a) : ''}
          <p class="center muted">¿La sabías?</p>
          <div class="row">
            <button class="btn bad" id="no">❌ No</button>
            <button class="btn good" id="yes">✅ Sí</button>
          </div>
          <div class="kbd-hint center">Teclado: ← No · → Sí</div>` : (writeMode() ? `
          <form id="wf" class="card">
            <label for="wa" style="margin-top:0">Tu respuesta</label>
            <textarea id="wa" class="card-ans" rows="2" autocomplete="off" placeholder="Escríbela o díctala antes de verla">${esc(given)}</textarea>
            <div class="row" style="margin-top:10px">
              ${SpeechRec ? '<button type="button" class="btn" id="dict">🎤 Dictar</button>' : ''}
              <button class="btn primary">Comprobar</button>
            </div>
            <button type="button" class="btn ghost block small-btn" id="dunno">No me acuerdo: ver respuesta</button>
          </form>` : `<button class="btn primary block" id="reveal">Ver respuesta</button>`)}
        <label class="check mode-toggle"><input type="checkbox" id="wm" ${writeMode() ? 'checked' : ''}> Escribir o dictar la respuesta antes de verla</label>
      `;
      $('#wm').onchange = (e) => { P().cardMode = e.target.checked ? 'write' : 'think'; save(); render(); };
      if (!revealed && writeMode()) {
        const ta = $('#wa');
        ta.focus();
        ta.oninput = () => { given = ta.value; };
        // Enter comprueba (Mayúsculas + Enter hace salto de línea)
        ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#wf').requestSubmit(); } };
        if ($('#dict')) $('#dict').onclick = () => toggleDictation(ta, $('#dict'));
        $('#wf').onsubmit = (e) => {
          e.preventDefault();
          given = ta.value.trim();
          if (!given) return toast('Escribe o dicta tu respuesta (o pulsa "No me acuerdo")');
          revealed = true;
          render();
        };
        $('#dunno').onclick = () => { given = ''; revealed = true; render(); };
      } else if (!revealed) {
        const show = () => { revealed = true; render(); };
        $('#flash').onclick = show;
        $('#reveal').onclick = show;
        onKey((k) => { if (k === ' ' || k === 'Enter') show(); });
      } else {
        $('#yes').onclick = () => answer(true);
        $('#no').onclick = () => answer(false);
        onKey((k) => { if (k === 'ArrowLeft' || k === '1') answer(false); if (k === 'ArrowRight' || k === '2') answer(true); });
      }
    }
    function answer(ok) {
      const card = queue.shift();
      gradeCard(card, ok);
      recordAnswer(ok, POINTS_CARD);
      done++;
      if (ok) { right++; toast(`${cheer()} +${POINTS_CARD} ⭐`); }
      revealed = false;
      given = '';
      render();
    }
    render();
  }

  // Compara la respuesta escrita con la correcta para ayudar a decidir (la decisión final es del alumno).
  function answerMatch(given, correct) {
    const g = normalize(given), c = normalize(correct);
    if (!g) return 'empty';
    if (g === c) return 'exact';
    const words = (x) => x.split(' ').filter((w) => w.length > 2);
    const cw = words(c), gw = new Set(words(g));
    const shared = cw.filter((w) => gw.has(w)).length;
    if ((c.includes(g) && g.length >= c.length * 0.6) || g.includes(c) || (cw.length && shared / cw.length >= 0.7)) return 'close';
    return 'diff';
  }
  function matchHtml(given, correct) {
    const m = answerMatch(given, correct);
    if (m === 'empty') return '<div class="feedback ko">No pasa nada: léela con atención para recordarla la próxima vez.</div>';
    const msg = { exact: '✅ ¡Coincide con la respuesta!', close: '🤏 Se parece mucho: compáralas y decide tú.', diff: '🔍 Compara tu respuesta con la correcta.' }[m];
    return `<div class="card your-ans ${m}"><div class="small muted">Tu respuesta</div><div class="ya">${esc(given)}</div><div class="small match-msg">${msg}</div></div>`;
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
        const star = nota >= 7 && !deck.progress?.test;
        if (star) setTimeout(() => markStep(deck, 'test'), 0);
        app.innerHTML = `
          <div class="center">
            <div class="huge">${nota >= 9 ? '🏆' : nota >= 6 ? '👏' : '💪'}</div>
            <h1>Nota: ${nota.toLocaleString('es-ES')}</h1>
            <p>${right} de ${questions.length} correctas</p>
            ${star ? '<p>⭐ Has ganado la estrella del test</p>' : nota < 7 && !deck.progress?.test ? '<p class="muted small">Con un 7 o más ganas la estrella del test.</p>' : ''}
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
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
        <div class="muted small">Pregunta ${i + 1} de ${questions.length}</div>
        <div class="progress"><div style="width:${(i / questions.length) * 100}%"></div></div>
        <div class="card flash" style="min-height:140px;cursor:default">${esc(card.q)}</div>
        ${mode === 'choice'
          ? `<div class="options">${optionsFor(card).map((o, n) => `<button class="btn option" data-v="${esc(o)}"><span class="opt-n">${n + 1}</span>${esc(o)}</button>`).join('')}</div>`
          : `<form id="f"><input type="text" id="ans" class="big-input" autocomplete="off" autocapitalize="off" placeholder="Escribe aquí"><button class="btn primary block" style="margin-top:10px">Comprobar</button></form>`}
        <div id="fb"></div>
      `;
      if (mode === 'choice') {
        $$('.option').forEach((b) => { b.onclick = () => { if (!answered) check(b.dataset.v, b); }; });
        onKey((k) => { const b = $$('.option')[Number(k) - 1]; if (b && !answered) b.click(); });
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
        if (a >= 0 && b >= 0) b = -rand(1, kind === '×' ? 12 : lim); // siempre algún negativo
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

    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>👨‍👩‍👦 Zona padres</h1>
      <p class="muted"><b>${esc(p.name)}</b> · ${esc(courseById(p.course)?.label || 'sin curso')}</p>

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
            return `<li><span class="qa">${esc(d.emoji || '📘')} ${esc(deckTitle(d))} <span class="muted small">· ${d.cards.length} tarjetas, ${mastered} dominadas</span></span>
              <a class="btn" href="#/edit/${d.id}">Editar</a></li>`;
          }).join('') || '<li class="muted">Aún no hay temas</li>'}
        </ul>
        <div class="row" style="margin-top:12px">
          <a class="btn primary" href="#/new">➕ Nuevo tema</a>
          <a class="btn" href="#/books">📚 Mis libros</a>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Ajustes</h2>
        <label for="nm">Nombre</label>
        <input type="text" id="nm" value="${esc(p.name)}" maxlength="30">
        <label for="cu">Curso</label>
        <select id="cu">${courseOptions(p.course)}</select>
        <button class="btn ghost block" id="delProfile" style="margin-top:12px;color:var(--bad)">Borrar todos los datos de la app</button>
      </div>

      ${speech.supported ? `<div class="card">
        <h2 style="margin-top:0">🔊 Voz del lector</h2>
        <p class="muted small">Son las voces instaladas en este dispositivo. Las marcadas con ⭐ suelen sonar más naturales.</p>
        <div class="row" style="align-items:center">
          <select id="vsel" style="flex:1 1 260px"></select>
          <button class="btn" id="vtest" style="flex:0 0 auto">▶️ Probar</button>
        </div>
        <details style="margin-top:10px"><summary class="small"><b>¿Cómo consigo una voz más natural?</b></summary>
          <p class="small">La tablet puede descargar voces de mejor calidad (gratis). Los menús cambian según el modelo:</p>
          <ul class="small">
            <li><b>iPad:</b> Ajustes → Accesibilidad → Contenido leído → Voces → Español (España) → descarga una voz <b>"Mejorada"</b> o <b>"Premium"</b>.</li>
            <li><b>Android:</b> Ajustes → busca <b>"Salida de texto a voz"</b> → motor de Google → Instalar datos de voz → Español (España) → elige una voz.</li>
          </ul>
          <p class="small">Después, cierra la app del todo, vuelve a abrirla y elige la voz nueva aquí.</p>
        </details>
      </div>` : ''}

      <div class="card">
        <h2 style="margin-top:0">🤖 Inteligencia artificial (opcional)</h2>
        <p class="muted small">Para que "Preparar el tema con IA" funcione solo, sin copiar y pegar. Necesita una clave de la API de Claude (cuenta en <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>, con saldo; <b>no</b> la incluye el plan Pro).</p>
        <p class="muted small">La clave se guarda <b>solo en este dispositivo</b>: no va en las copias de seguridad ni al compartir temas. Quien use este móvil podría usarla, así que pon un <b>límite de gasto</b> en la consola.</p>
        <label for="aik">Clave de la API</label>
        <input type="password" id="aik" autocomplete="off" placeholder="${aiSettings().key ? '•••••••• (guardada)' : 'sk-ant-…'}">
        <label for="aim">Modelo</label>
        <select id="aim">${AI_MODELS.map((m) => `<option value="${m.id}" ${m.id === (aiSettings().model || AI_MODELS[0].id) ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="aiSave">Guardar</button>
          ${aiSettings().key ? '<button class="btn" id="aiDel" style="color:var(--bad)">Borrar clave</button>' : ''}
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Copia de seguridad</h2>
        <p class="muted small">Los datos de todos los perfiles se guardan solo en este navegador. Descarga una copia para pasarlos a otro dispositivo o por si se borra el navegador.<br><b>Las fotos y los libros en PDF no van en la copia</b> (ocuparían demasiado): se quedan en este dispositivo.</p>
        <div class="row">
          <button class="btn" id="exp">⬇️ Descargar copia</button>
          <label class="btn" style="margin:0">⬆️ Cargar copia<input type="file" id="imp" accept="application/json,.json" hidden></label>
        </div>
      </div>
    `;

    if ($('#vsel')) {
      const fill = () => {
        const list = speech.voices();
        const cur = speech.voice();
        $('#vsel').innerHTML = list.length
          ? list.map((v) => `<option value="${esc(v.voiceURI)}" ${cur && v.voiceURI === cur.voiceURI ? 'selected' : ''}>${voiceQuality(v)}${esc(v.name)} (${esc(v.lang)})</option>`).join('')
          : '<option value="">No hay voces en español en este dispositivo</option>';
      };
      fill();
      // En algunos navegadores la lista de voces llega un poco después.
      speechSynthesis.onvoiceschanged = () => { if ($('#vsel')) fill(); };
      $('#vsel').onchange = (e) => { try { localStorage.setItem(VOICE_KEY, e.target.value); } catch (err) { /* nada */ } toast('Voz guardada'); };
      $('#vtest').onclick = () => {
        speech.play([`Hola, ${p.name}. Esta es la voz que te leerá los temas. ¿Qué tal suena?`], 1, () => {}, () => {});
      };
    }
    $('#aiSave').onclick = () => {
      const cur = aiSettings();
      const key = $('#aik').value.trim() || cur.key || '';
      if (key && !/^sk-ant-/.test(key)) return toast('La clave debería empezar por sk-ant-');
      if (!setAiSettings({ key, model: $('#aim').value })) return toast('No se pudo guardar en este navegador');
      viewParents();
      toast(key ? 'Ajustes de IA guardados' : 'Modelo guardado (falta la clave)');
    };
    if ($('#aiDel')) {
      $('#aiDel').onclick = () => {
        if (!confirm('¿Borrar la clave de la API de este dispositivo?')) return;
        setAiSettings({ model: aiSettings().model });
        viewParents();
        toast('Clave borrada');
      };
    }
    $('#nm').onchange = (e) => { const v = e.target.value.trim(); if (v) { p.name = v; save(); toast('Guardado'); } };
    $('#cu').onchange = (e) => { p.course = e.target.value; resetMathCfg(); save(); viewParents(); toast('Curso cambiado'); };
    $('#delProfile').onclick = async () => {
      if (!confirm('¿Borrar TODOS los datos: temas, fotos, libros y progreso? No se puede deshacer.')) return;
      if (!confirm('¿Seguro? Si no tienes una copia de seguridad, se perderá todo.')) return;
      for (const prof of data.profiles) {
        await deletePhotos(prof.decks.flatMap((d) => d.photos || []));
        for (const b of prof.books || []) await bookDel(b.id).catch(() => {});
      }
      data = { version: 2, activeId: null, profiles: [] };
      save();
      go('#/welcome');
    };
    $('#exp').onclick = () => {
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `app-studio-copia-${todayStr()}.json`);
    };
    $('#imp').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(reader.result);
          const parsed = migrate(raw);
          if (!parsed || !parsed.profiles.length) throw new Error('formato');
          if (!confirm('Esto sustituirá todos los datos actuales por los de la copia. ¿Seguir?')) return;
          data = parsed;
          if (!P()) data.activeId = data.profiles[0].id;
          save();
          toast('Copia cargada');
          go('#/');
        } catch (err) {
          toast('Ese archivo no es una copia válida');
        }
      };
      reader.readAsText(file);
    };
  }

  // ---------- Recortar fotos/capturas (quitar barras del móvil, márgenes…) ----------
  function cropBlob(blob, c) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth, H = img.naturalHeight;
        const x = Math.round(W * c.left / 100), y = Math.round(H * c.top / 100);
        const w = Math.max(10, Math.round(W * (100 - c.left - c.right) / 100));
        const h = Math.max(10, Math.round(H * (100 - c.top - c.bottom) / 100));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
      img.src = url;
    });
  }

  function openCropPanel(deck, panel, onDone) {
    const c = { top: 0, bottom: 0, left: 0, right: 0 };
    let current = 0;
    const SIDES = [['top', 'Arriba'], ['bottom', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha']];
    panel.innerHTML = `
      <div class="crop">
        <h3 style="margin:14px 0 6px;font-size:1rem">✂️ Recortar</h3>
        <p class="muted small">Mueve las barras para quitar lo que sobra (barra de estado, botones del visor del libro, márgenes…). La zona oscura se elimina.</p>
        ${deck.photos.length > 1 ? `<div class="chips" id="cropPick">${deck.photos.map((_, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-ci="${i}">${i + 1}</button>`).join('')}</div>` : ''}
        <div class="crop-box"><img id="cropImg" data-photo="${deck.photos[0]}" alt="Vista previa">
          <div class="shade" data-s="top"></div><div class="shade" data-s="bottom"></div><div class="shade" data-s="left"></div><div class="shade" data-s="right"></div>
        </div>
        ${SIDES.map(([k, l]) => `<label class="slider">${l} <span id="v-${k}">0 %</span><input type="range" min="0" max="45" value="0" data-side="${k}"></label>`).join('')}
        ${deck.photos.length > 1 ? '<label class="check"><input type="checkbox" id="cropAll" checked> Aplicar el mismo recorte a todas las fotos</label>' : ''}
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="cropDo">Recortar</button>
          <button class="btn" id="cropCancel">Cancelar</button>
        </div>
      </div>`;
    hydratePhotos(panel);
    const paint = () => {
      const sh = (k) => $(`.shade[data-s="${k}"]`, panel);
      sh('top').style.cssText = `top:0;left:0;right:0;height:${c.top}%`;
      sh('bottom').style.cssText = `bottom:0;left:0;right:0;height:${c.bottom}%`;
      sh('left').style.cssText = `top:${c.top}%;bottom:${c.bottom}%;left:0;width:${c.left}%`;
      sh('right').style.cssText = `top:${c.top}%;bottom:${c.bottom}%;right:0;width:${c.right}%`;
      SIDES.forEach(([k]) => { $(`#v-${k}`, panel).textContent = `${c[k]} %`; });
    };
    $$('[data-side]', panel).forEach((r) => { r.oninput = () => { c[r.dataset.side] = Number(r.value); paint(); }; });
    $$('[data-ci]', panel).forEach((b) => {
      b.onclick = async () => {
        current = Number(b.dataset.ci);
        $$('[data-ci]', panel).forEach((x) => x.classList.toggle('on', x === b));
        const url = await photoUrl(deck.photos[current]);
        if (url) $('#cropImg', panel).src = url;
      };
    });
    $('#cropCancel', panel).onclick = () => { panel.innerHTML = ''; };
    $('#cropDo', panel).onclick = async () => {
      if (!c.top && !c.bottom && !c.left && !c.right) return toast('Mueve alguna barra para recortar');
      const all = $('#cropAll', panel)?.checked;
      const targets = all ? deck.photos.map((_, i) => i) : [current];
      $('#cropDo', panel).disabled = true;
      let ok = 0;
      for (const i of targets) {
        $('#photoStatus').textContent = `Recortando ${ok + 1} de ${targets.length}…`;
        try {
          const old = deck.photos[i];
          const blob = await photoGet(old);
          if (!blob) continue;
          const nid = uid();
          await photoPut(nid, await cropBlob(blob, c));
          deck.photos[i] = nid;
          await deletePhotos([old]);
          ok++;
        } catch (e) { /* se deja la foto como estaba */ }
      }
      save();
      onDone();
      toast(`${ok} ${ok === 1 ? 'foto recortada' : 'fotos recortadas'}`);
    };
    paint();
  }

  // ---------- Libros en PDF (uso personal: se guardan solo en este dispositivo) ----------
  const PDFJS = {
    lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.min.mjs',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs',
  };
  const MAX_TOPIC_PAGES = 40;
  let pdfjsPromise;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS.lib).then((lib) => { lib.GlobalWorkerOptions.workerSrc = PDFJS.worker; return lib; });
      pdfjsPromise.catch(() => { pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }
  async function openPdf(blob) {
    const lib = await loadPdfjs();
    const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    task.onPassword = (update, reason) => {
      const pw = prompt(reason === 2 ? 'Contraseña incorrecta. Vuelve a escribirla:' : 'Este PDF tiene contraseña. Escríbela:');
      if (pw === null) task.destroy(); else update(pw);
    };
    return task.promise;
  }
  // Temas del índice (marcadores) del PDF, con su página.
  async function readOutline(pdf) {
    const out = [];
    let items = null;
    try { items = await pdf.getOutline(); } catch (e) { return out; }
    const walk = async (list, level) => {
      for (const it of list || []) {
        try {
          let dest = it.dest;
          if (typeof dest === 'string') dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0] != null) {
            const idx = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0]);
            out.push({ title: String(it.title || '').trim(), page: idx + 1, level });
          }
        } catch (e) { /* entrada sin destino */ }
        if (level < 1 && it.items?.length) await walk(it.items, level + 1);
      }
    };
    await walk(items, 0);
    return out.filter((o) => o.title);
  }
  // Rango de páginas de cada entrada del índice: hasta la siguiente entrada de su mismo nivel o superior.
  function outlineRanges(book) {
    const o = (book.outline || []).slice().sort((a, b) => a.page - b.page);
    return o.map((e, i) => {
      const next = o.slice(i + 1).find((x) => x.level <= e.level && x.page > e.page);
      return { ...e, from: e.page, to: next ? Math.max(e.page, next.page - 1) : book.pages };
    });
  }
  function textFromContent(tc) {
    let out = '', lastY = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = it.transform[5], h = it.height || 10;
      if (lastY !== null && lastY - y > h * 1.8 && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n';
      out += it.str;
      if (it.hasEOL) out += '\n';
      lastY = y;
    }
    // Quita las líneas que son solo el número de página.
    return out.replace(/[ \t]+\n/g, '\n').split('\n').filter((l) => !/^\s*\d{1,4}\s*$/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  async function renderPage(pdf, n, width) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, width / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return { page, blob };
  }
  const deckBookInfo = (deck) => {
    const book = deck.bookId && P().books?.find((b) => b.id === deck.bookId);
    return book && deck.pages ? `📚 ${esc(book.name)}, págs. ${deck.pages[0]}–${deck.pages[1]}<br>` : '';
  };

  function viewBooks() {
    const p = P();
    p.books = p.books || [];
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1>📚 Mis libros</h1>
      <p class="muted small">Sube el libro digital en PDF y crea cada tema eligiendo sus páginas. El libro se guarda <b>solo en este dispositivo</b> y no se comparte con nadie.</p>
      ${p.books.map((b) => `
        <a class="card deck" href="#/book/${b.id}" style="margin-bottom:12px">
          <div class="name">${esc(subjectEmoji(b.subject))} ${esc(b.name)}</div>
          <div class="muted small">${esc([b.subject, b.publisher, courseById(b.course)?.label].filter(Boolean).join(' · '))}</div>
          <div class="muted small">${b.pages} páginas · ${p.decks.filter((d) => d.bookId === b.id).length} temas creados</div>
        </a>`).join('') || '<div class="card muted">Todavía no has subido ningún libro.</div>'}
      <label class="btn primary block" style="margin:0">📥 Subir libro en PDF<input type="file" id="pdfIn" accept="application/pdf,.pdf" hidden></label>
      <div id="pdfStatus" class="muted small" style="margin-top:8px"></div>
      <p class="muted small">¿El libro solo se puede ver en la web o app de la editorial? Haz capturas de pantalla de las páginas y súbelas en "Nuevo tema" → "Añadir fotos o capturas".</p>
    `;
    $('#pdfIn').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const st = $('#pdfStatus');
      try {
        st.textContent = 'Abriendo el PDF… (la primera vez descarga el lector, necesita internet)';
        const pdf = await openPdf(file);
        st.textContent = 'Leyendo el índice…';
        const outline = await readOutline(pdf);
        const book = {
          id: uid(), name: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Libro',
          subject: '', publisher: '', course: p.course, pages: pdf.numPages, outline,
        };
        await pdf.destroy();
        st.textContent = 'Guardando el libro en este dispositivo…';
        await bookPut(book.id, file);
        p.books.push(book);
        save();
        go(`#/book/${book.id}`);
      } catch (err) {
        st.textContent = '';
        toast(/password|contraseña/i.test(String(err?.name || err?.message)) ? 'No se pudo abrir: falta la contraseña del PDF' : 'No se pudo abrir el PDF. Comprueba que es un PDF y que tienes internet.');
      }
    };
  }

  function viewBook(id) {
    const p = P();
    const book = (p.books || []).find((b) => b.id === id);
    if (!book) return go('#/books');
    const made = (from, to) => p.decks.find((d) => d.bookId === book.id && d.pages && d.pages[0] === from && d.pages[1] === to);
    const ranges = outlineRanges(book);
    app.innerHTML = `
      <a class="back" href="#/books">← Mis libros</a>
      <h1 style="margin-bottom:2px">📚 ${esc(book.name)}</h1>
      <p class="muted">${esc([book.subject, book.publisher, courseById(book.course)?.label].filter(Boolean).join(' · '))}${book.subject || book.publisher ? '<br>' : ''}${book.pages} páginas</p>

      <details class="card" ${book.subject ? '' : 'open'}>
        <summary><b>📋 Datos del libro</b></summary>
        <form id="bm">
          <label for="bn">Nombre</label><input type="text" id="bn" value="${esc(book.name)}" maxlength="80" required>
          <div class="filters">
            <div><label for="bs">Asignatura</label><select id="bs">${subjectOptions(book.subject, 'Elige…')}</select></div>
            <div><label for="bc">Curso</label><select id="bc">${courseOptions(book.course, 'Elige…')}</select></div>
            <div><label for="bp">Editorial</label><input type="text" id="bp" list="publishers" value="${esc(book.publisher)}" maxlength="40"></div>
          </div>
          ${publisherDatalist()}
          <button class="btn primary block" style="margin-top:12px">Guardar</button>
        </form>
        <p class="muted small">Los temas que crees de este libro tendrán esta asignatura, curso y editorial.</p>
      </details>

      ${ranges.length ? `
      <div class="card">
        <h2 style="margin-top:0">📑 Temas del índice</h2>
        <p class="muted small">Sacados del índice del PDF. Pulsa "Crear" para crear el tema con sus páginas.</p>
        <ul class="list">
          ${ranges.map((r, i) => {
            const d = made(r.from, r.to);
            return `<li class="${r.level ? 'sub-item' : ''}">
              <span class="qa">${esc(r.title)} <span class="muted small">· págs. ${r.from}–${r.to}</span></span>
              ${d ? `<a class="btn" href="#/deck/${d.id}">✓ Abrir</a>` : `<button class="btn" data-mk="${i}">Crear</button>`}
            </li>`;
          }).join('')}
        </ul>
      </div>` : ''}

      <div class="card">
        <h2 style="margin-top:0">✂️ Crear un tema eligiendo páginas</h2>
        ${ranges.length ? '' : '<p class="muted small">Este PDF no tiene índice con marcadores: elige las páginas a mano.</p>'}
        <form id="rg">
          <div class="filters">
            <div><label for="pf">Desde la página</label><input type="number" id="pf" min="1" max="${book.pages}" value="1" required></div>
            <div><label for="pt">Hasta la página</label><input type="number" id="pt" min="1" max="${book.pages}" value="${Math.min(book.pages, 10)}" required></div>
          </div>
          <p class="muted small">Son las páginas del archivo PDF, que pueden no coincidir con el número impreso en el libro: mira la vista previa.</p>
          <div class="previews"><figure><div id="pvf" class="pv"></div><figcaption>Primera</figcaption></figure><figure><div id="pvt" class="pv"></div><figcaption>Última</figcaption></figure></div>
          <div class="filters">
            <div><label for="rt">Título del tema</label><input type="text" id="rt" required maxlength="80" placeholder="Ej.: La célula"></div>
            <div><label for="ru">Nº de tema</label><input type="text" inputmode="numeric" id="ru" maxlength="5" placeholder="Ej.: 3"></div>
          </div>
          <button class="btn primary block" style="margin-top:12px">Crear tema</button>
        </form>
        <div id="bkStatus" class="muted small" style="margin-top:8px"></div>
      </div>

      <button class="btn ghost block" id="delBook" style="color:var(--bad)">Borrar libro de este dispositivo</button>
      <p class="muted small">Borrar el libro no borra los temas que ya has creado.</p>
    `;

    $('#bm').onsubmit = (e) => {
      e.preventDefault();
      book.name = $('#bn').value.trim() || book.name;
      book.subject = $('#bs').value;
      book.course = $('#bc').value;
      book.publisher = $('#bp').value.trim();
      save();
      viewBook(id);
      toast('Datos del libro guardados');
    };

    let pdfP = null;
    const getPdf = async () => {
      if (!pdfP) {
        pdfP = (async () => {
          const blob = await bookGet(book.id);
          if (!blob) throw new Error('missing');
          return openPdf(blob);
        })();
        pdfP.catch(() => { pdfP = null; });
      }
      return pdfP;
    };
    // Vista previa de la primera y la última página elegidas.
    let pvTimer;
    const preview = () => {
      clearTimeout(pvTimer);
      pvTimer = setTimeout(async () => {
        try {
          const pdf = await getPdf();
          for (const [inp, box] of [['#pf', '#pvf'], ['#pt', '#pvt']]) {
            const n = Math.min(book.pages, Math.max(1, Number($(inp).value) || 1));
            const { blob } = await renderPage(pdf, n, 300);
            const el = $(box);
            if (!el) return;
            if (el.dataset.url) URL.revokeObjectURL(el.dataset.url);
            el.dataset.url = URL.createObjectURL(blob);
            el.innerHTML = `<img src="${el.dataset.url}" alt="Página ${n}"><span>pág. ${n}</span>`;
          }
        } catch (e) {
          const el = $('#pvf');
          if (el) el.textContent = 'Sin vista previa (¿sin internet?)';
        }
      }, 350);
    };
    $('#pf').oninput = preview;
    $('#pt').oninput = preview;
    preview();

    const create = async (from, to, title, unit) => {
      if (!(from >= 1 && to <= book.pages && from <= to)) return toast(`Elige páginas entre 1 y ${book.pages}`);
      if (to - from + 1 > MAX_TOPIC_PAGES) return toast(`Como mucho ${MAX_TOPIC_PAGES} páginas por tema`);
      const st = $('#bkStatus');
      $$('#app button').forEach((b) => { b.disabled = true; });
      const photos = [], texts = [];
      try {
        const pdf = await getPdf();
        for (let n = from; n <= to; n++) {
          st.textContent = `Preparando página ${n - from + 1} de ${to - from + 1}…`;
          const { page, blob } = await renderPage(pdf, n, 1600);
          const pid = uid();
          await photoPut(pid, blob);
          photos.push(pid);
          texts.push(textFromContent(await page.getTextContent()));
          page.cleanup();
        }
        const m = !unit && title.match(/^\s*(?:tema|unidad)\s+(\d+)[.:\s-]*(.*)$/i);
        const deck = newDeck({
          name: (m ? m[2] : title).trim() || title, unit: unit || (m ? m[1] : ''),
          subject: book.subject, course: book.course, publisher: book.publisher, emoji: subjectEmoji(book.subject),
          photos, ocrText: texts.filter(Boolean).join('\n\n'), bookId: book.id, pages: [from, to],
        });
        p.decks.push(deck);
        save();
        toast('Tema creado. Ahora prepara el esquema, el resumen y las preguntas.');
        go(`#/edit/${deck.id}`);
      } catch (e) {
        await deletePhotos(photos);
        st.textContent = '';
        $$('#app button').forEach((b) => { b.disabled = false; });
        toast('No se pudo crear el tema desde el PDF');
      }
    };
    $$('[data-mk]').forEach((b) => {
      b.onclick = () => { const r = ranges[Number(b.dataset.mk)]; create(r.from, r.to, r.title, ''); };
    });
    $('#rg').onsubmit = (e) => {
      e.preventDefault();
      create(Number($('#pf').value), Number($('#pt').value), $('#rt').value.trim(), $('#ru').value.trim());
    };
    $('#delBook').onclick = async () => {
      if (!confirm(`¿Borrar "${book.name}" de este dispositivo?`)) return;
      await bookDel(book.id).catch(() => {});
      p.books = p.books.filter((b) => b.id !== book.id);
      save();
      go('#/books');
    };
  }

  // ---------- Propuestas de tarjetas (revisar antes de añadir) ----------
  function showProposals(box, props, deck, onAdded) {
    box.innerHTML = `
      <h2>Tarjetas propuestas (${props.length})</h2>
      <p class="muted small">Revisa y corrige cada una. Desmarca las que no quieras.</p>
      ${props.map((pr, i) => `
        <div class="proposal">
          <input type="checkbox" checked data-pi="${i}" aria-label="Usar esta tarjeta">
          <div class="pq">
            <input type="text" value="${esc(pr.q)}" data-pq="${i}" aria-label="Pregunta">
            <textarea rows="2" data-pa="${i}" aria-label="Respuesta">${esc(pr.a)}</textarea>
          </div>
        </div>`).join('')}
      <button class="btn primary block" data-addprops style="margin-top:10px">Añadir las tarjetas marcadas</button>`;
    $('[data-addprops]', box).onclick = () => {
      let n = 0;
      $$('[data-pi]', box).forEach((cb) => {
        if (!cb.checked) return;
        const i = cb.dataset.pi;
        const q = $(`[data-pq="${i}"]`, box).value.trim(), a = $(`[data-pa="${i}"]`, box).value.trim();
        if (q && a) { deck.cards.push(newCard(q, a)); n++; }
      });
      if (!n) return toast('No hay ninguna tarjeta marcada');
      save();
      onAdded();
      toast(`${n} tarjetas añadidas`);
    };
  }

  // ---------- IA (Claude) ----------
  // Dos formas: (1) copiar/pegar con la app de Claude del usuario; (2) llamada directa a la API con una clave
  // que se guarda solo en este dispositivo (nunca en las copias de seguridad).
  const AI_KEY = 'app-studio-ai';
  const AI_MODELS = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (el mejor, ~25 cts por tema)', price: [4, 20], fallbacks: true },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (muy bueno, ~12 cts por tema)', price: [2, 10], fallbacks: true },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (el más barato, ~1 ct por tema)', price: [0.1, 0.5], fallbacks: false },
  ];
  function aiSettings() {
    try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (e) { return {}; }
  }
  function setAiSettings(v) {
    try { localStorage.setItem(AI_KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  function aiInstructions(deck, source) {
    const course = courseById(deck.course)?.label || courseById(P().course)?.label || 'Secundaria';
    const what = [deck.subject && `de ${deck.subject}`, deck.publisher && `(libro de ${deck.publisher})`].filter(Boolean).join(' ');
    return `Eres un profesor excelente, cercano y entusiasta. Prepara material para que un alumno de ${course} estudie el tema "${deckTitle(deck)}" ${what}. Te paso ${source}.
En el examen tendrá que saber DESARROLLAR el tema (no solo datos sueltos), así que el material debe ayudarle a entenderlo bien y a memorizar su estructura. Que sea claro, ameno y motivador, adecuado para su edad.

Prepara:
1. "explicacion": la explicación completa del tema, como la daría un buen profesor:
   - "intro": 2 a 4 frases que enganchen: de qué va el tema y por qué es interesante o útil.
   - "apartados": uno por cada apartado del tema, en el mismo orden. En cada uno:
     · "titulo".
     · "texto": explicación clara y completa (100 a 250 palabras), con frases cortas, párrafos separados por una línea en blanco y los conceptos clave en **negrita**. No te saltes contenidos del tema.
     · "ejemplo": un ejemplo o comparación con la vida cotidiana de un chico de su edad que ayude a entenderlo.
     · "sabias_que": una curiosidad real relacionada con el apartado, o "" si no tienes una segura.
     · "imagenes": si en las fotos hay ilustraciones, mapas, esquemas, dibujos, gráficos o tablas que ayuden a entender este apartado, indica hasta 2: "foto" = número de la foto donde está (empezando en 1, en el orden en que te las paso), la zona que ocupa la ilustración en porcentaje del ancho y alto de esa foto ("x" e "y" de la esquina superior izquierda, "ancho" y "alto", de 0 a 100) y un "pie" que explique qué se ve y qué hay que fijarse. Solo ilustraciones que existan de verdad en las fotos, nunca zonas que sean solo texto. Si no hay, [].
     · "pregunta": pregunta de comprensión con 3 o 4 "opciones", el índice de la "correcta" (empezando en 0) y una "explicacion" breve de por qué es la correcta.
   - "linea_tiempo": fechas o etapas en orden, si el tema es de Historia o tiene cronología; si no, [].
   - "causas_consecuencias": si el tema tiene hechos o procesos con causas y consecuencias; si no, [].
   - "glosario": las palabras clave del tema con una definición sencilla.
   Adapta la explicación a la asignatura: en Lengua, pon ejemplos de cada concepto; en Ciencias, explica los procesos paso a paso y compara conceptos parecidos; en Matemáticas, incluye ejemplos resueltos paso a paso.
2. "esquema": esquema del tema. Usa "# " al principio de la línea para cada apartado, "- " para cada idea y "  - " (dos espacios) para las subideas. Frases cortas. Marca los conceptos clave con **negrita**.
3. "resumen": resumen de 200 a 500 palabras, en párrafos separados por una línea en blanco, con "# " para los títulos de los apartados y los conceptos más importantes en **negrita**. Debe poder leerse en voz alta.
4. "tarjetas": entre 10 y 20 preguntas de repaso con respuestas cortas (máximo 10 palabras) y exactas, que sirvan para un test.
5. "desarrollo": entre 3 y 6 preguntas de desarrollo como las de un examen ("Explica…", "Compara…", "Describe…"), cada una con una "respuesta_modelo" de 120 a 250 palabras bien redactada, como la escribiría un buen alumno de su curso, y los "puntos_clave" (de 4 a 8) que debe incluir una buena respuesta.
6. "imagenes_mudas": si en las fotos hay dibujos, esquemas o mapas con los nombres de sus partes escritos y señalados (por ejemplo, una célula con sus partes, el aparato digestivo o un mapa con nombres), inclúyelos (hasta 3) para un ejercicio de escribir los nombres: "foto" (número de la foto, empezando en 1), la zona del dibujo con todos sus rótulos en porcentaje de la foto ("x", "y", "ancho", "alto"), un "titulo" corto y las "etiquetas": cada rótulo con su "texto" copiado exactamente como aparece escrito y su posición en porcentaje de la foto ("x", "y", "ancho", "alto"), lo más ajustada posible al texto del rótulo. Solo rótulos que nombren partes del dibujo (no títulos ni pies de foto). Si no hay ninguno, [].

Reglas: usa solo la información del tema y conocimientos básicos seguros; no inventes datos, fechas ni nombres. Si una parte de las fotos no se lee bien, ignórala. Escribe en español de España.`;
  }
  const AI_FORMAT = `

Responde SOLO con un bloque de código JSON con esta forma exacta (sin nada más):
{"explicacion": {"intro": "…", "apartados": [{"titulo": "…", "texto": "…", "ejemplo": "…", "sabias_que": "…", "imagenes": [{"foto": 1, "x": 10, "y": 40, "ancho": 50, "alto": 30, "pie": "…"}], "pregunta": {"enunciado": "…", "opciones": ["…", "…", "…"], "correcta": 0, "explicacion": "…"}}], "linea_tiempo": [{"fecha": "…", "hecho": "…"}], "causas_consecuencias": [{"causa": "…", "consecuencia": "…"}], "glosario": [{"termino": "…", "definicion": "…"}]}, "esquema": "…", "resumen": "…", "tarjetas": [{"pregunta": "…", "respuesta": "…"}], "desarrollo": [{"pregunta": "…", "respuesta_modelo": "…", "puntos_clave": ["…"]}], "imagenes_mudas": [{"foto": 1, "x": 10, "y": 30, "ancho": 80, "alto": 40, "titulo": "…", "etiquetas": [{"texto": "…", "x": 70, "y": 35, "ancho": 10, "alto": 2}]}]}`;

  const str = { type: 'string' };
  const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
  const arr = (items) => ({ type: 'array', items });
  const AI_SCHEMA = obj({
    explicacion: obj({
      intro: str,
      apartados: arr(obj({
        titulo: str, texto: str, ejemplo: str, sabias_que: str,
        imagenes: arr(obj({ foto: { type: 'integer' }, x: { type: 'number' }, y: { type: 'number' }, ancho: { type: 'number' }, alto: { type: 'number' }, pie: str })),
        pregunta: obj({ enunciado: str, opciones: arr(str), correcta: { type: 'integer' }, explicacion: str }),
      })),
      linea_tiempo: arr(obj({ fecha: str, hecho: str })),
      causas_consecuencias: arr(obj({ causa: str, consecuencia: str })),
      glosario: arr(obj({ termino: str, definicion: str })),
    }),
    esquema: str,
    resumen: str,
    tarjetas: arr(obj({ pregunta: str, respuesta: str })),
    desarrollo: arr(obj({ pregunta: str, respuesta_modelo: str, puntos_clave: arr(str) })),
    imagenes_mudas: arr(obj({
      foto: { type: 'integer' }, x: { type: 'number' }, y: { type: 'number' }, ancho: { type: 'number' }, alto: { type: 'number' }, titulo: str,
      etiquetas: arr(obj({ texto: str, x: { type: 'number' }, y: { type: 'number' }, ancho: { type: 'number' }, alto: { type: 'number' } })),
    })),
  });
  const CORRECT_SCHEMA = obj({ nota: { type: 'number' }, puntos: arr(obj({ incluido: { type: 'boolean' } })), bien: str, mejorar: str, consejo: str });

  const S = (v) => String(v ?? '').trim();
  function normalizeExplain(e) {
    if (!e || typeof e !== 'object') return null;
    const apartados = (Array.isArray(e.apartados) ? e.apartados : []).map((a) => {
      const q = a?.pregunta || {};
      const opciones = (Array.isArray(q.opciones) ? q.opciones : []).map(S).filter(Boolean);
      const correcta = Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < opciones.length ? q.correcta : -1;
      return {
        titulo: S(a?.titulo), texto: S(a?.texto), ejemplo: S(a?.ejemplo), sabias_que: S(a?.sabias_que),
        imagenes: (Array.isArray(a?.imagenes) ? a.imagenes : []).slice(0, 2).map((im) => ({
          foto: Number(im?.foto), x: Number(im?.x), y: Number(im?.y), w: Number(im?.ancho), h: Number(im?.alto), pie: S(im?.pie),
        })).filter((im) => Number.isInteger(im.foto) && im.foto >= 1),
        pregunta: S(q.enunciado) && opciones.length >= 2 && correcta >= 0 ? { enunciado: S(q.enunciado), opciones, correcta, explicacion: S(q.explicacion) } : null,
      };
    }).filter((a) => a.titulo || a.texto);
    if (!apartados.length) return null;
    const list = (v, keys) => (Array.isArray(v) ? v : []).map((x) => Object.fromEntries(keys.map((k) => [k, S(x?.[k])]))).filter((x) => keys.every((k) => x[k]));
    return {
      intro: S(e.intro), apartados,
      linea_tiempo: list(e.linea_tiempo, ['fecha', 'hecho']),
      causas_consecuencias: list(e.causas_consecuencias, ['causa', 'consecuencia']),
      glosario: list(e.glosario, ['termino', 'definicion']),
    };
  }

  // Lee la respuesta (JSON) de Claude, venga de la API o pegada a mano.
  function parseAiResult(raw) {
    let t = String(raw || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1];
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('No encuentro el bloque JSON en la respuesta');
    const jsonText = t.slice(a, b + 1);
    let o;
    try { o = JSON.parse(jsonText); } catch (e) { o = JSON.parse(jsonText.replace(/[“”]/g, '"')); }
    const esquema = S(o.esquema);
    const resumen = S(o.resumen);
    const tarjetas = (Array.isArray(o.tarjetas) ? o.tarjetas : [])
      .map((c) => ({ q: S(c?.pregunta || c?.q), a: S(c?.respuesta || c?.a) }))
      .filter((c) => c.q && c.a);
    const explicacion = normalizeExplain(o.explicacion);
    const desarrollo = (Array.isArray(o.desarrollo) ? o.desarrollo : [])
      .map((d) => ({ q: S(d?.pregunta), model: S(d?.respuesta_modelo), points: (Array.isArray(d?.puntos_clave) ? d.puntos_clave : []).map(S).filter(Boolean) }))
      .filter((d) => d.q && d.model);
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
    const mudas = (Array.isArray(o.imagenes_mudas) ? o.imagenes_mudas : []).slice(0, 3).map((m) => ({
      foto: Number(m?.foto), x: num(m?.x), y: num(m?.y), w: num(m?.ancho), h: num(m?.alto), title: S(m?.titulo),
      labels: (Array.isArray(m?.etiquetas) ? m.etiquetas : []).map((l) => ({ text: S(l?.texto), x: num(l?.x), y: num(l?.y), w: num(l?.ancho), h: num(l?.alto) }))
        .filter((l) => l.text && l.text.length <= 60),
    })).filter((m) => Number.isInteger(m.foto) && m.foto >= 1 && m.labels.length >= 2);
    if (!esquema && !resumen && !tarjetas.length && !explicacion && !desarrollo.length) throw new Error('La respuesta está vacía');
    return { esquema, resumen, tarjetas, explicacion, desarrollo, mudas };
  }

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  // Llamada a la API de Claude desde el navegador (uso personal en este dispositivo), con respuesta en directo.
  async function aiRequest({ content, schema, maxTokens = 32000, effort = 'medium', onProgress }) {
    const cfg = aiSettings();
    if (!cfg.key) throw new Error('Falta la clave de la API (Zona padres → Inteligencia artificial)');
    const model = AI_MODELS.find((m) => m.id === cfg.model) || AI_MODELS[0];
    const body = {
      model: model.id,
      max_tokens: maxTokens,
      stream: true,
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    };
    const send = (withFallbacks) => {
      const headers = {
        'content-type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2026-10-21',
        'anthropic-dangerous-direct-browser-access': 'true',
      };
      const b = { ...body };
      if (withFallbacks) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; b.fallbacks = 'default'; }
      return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(b) });
    };
    let res;
    try {
      res = await send(model.fallbacks);
      // Si la petición con "fallbacks" no se acepta, se repite sin ella.
      if (res.status === 400 && model.fallbacks) res = await send(false);
    } catch (e) {
      throw new Error('No se pudo conectar con Claude. Comprueba la conexión a internet.');
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msg = json?.error?.message || `error ${res.status}`;
      if (res.status === 401) throw new Error('La clave de la API no es válida');
      if (/credit balance/i.test(msg)) throw new Error('No queda saldo en la cuenta de la API (console.anthropic.com → Billing)');
      if (res.status === 429) throw new Error('Demasiadas peticiones seguidas. Espera un minuto y vuelve a probar.');
      if (res.status === 529 || res.status >= 500) throw new Error('Claude está saturado ahora mismo. Prueba en unos minutos.');
      throw new Error(`Claude devolvió un error: ${msg}`);
    }
    // Lectura de eventos (server-sent events)
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', stop = null, inTok = 0, outTok = 0;
    const handle = (ev) => {
      if (ev.type === 'message_start') inTok = ev.message?.usage?.input_tokens || 0;
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { text += ev.delta.text; if (onProgress) onProgress(text.length); }
      else if (ev.type === 'message_delta') { stop = ev.delta?.stop_reason || stop; outTok = ev.usage?.output_tokens || outTok; }
      else if (ev.type === 'error') throw new Error(ev.error?.type === 'overloaded_error' ? 'Claude está saturado ahora mismo. Prueba en unos minutos.' : `Claude devolvió un error: ${ev.error?.message || ''}`);
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, k);
        buf = buf.slice(k + 2);
        const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
        if (!data) continue;
        let ev;
        try { ev = JSON.parse(data); } catch (e) { continue; }
        handle(ev);
      }
    }
    if (stop === 'refusal') throw new Error('Claude no ha querido procesar este contenido');
    if (stop === 'max_tokens') throw new Error('La respuesta salió demasiado larga. Prueba con menos páginas.');
    const cost = (inTok * model.price[0] + outTok * model.price[1]) / 1e6;
    return { text, cost };
  }

  async function aiGenerate(deck, onStatus) {
    const content = [];
    const blobs = [];
    for (const pid of deck.photos || []) {
      const blob = await photoGet(pid).catch(() => null);
      if (blob) blobs.push(blob);
    }
    for (const [i, blob] of blobs.entries()) {
      onStatus(`Preparando foto ${i + 1} de ${blobs.length}…`);
      content.push({ type: 'text', text: `Foto ${i + 1}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(blob) } });
    }
    const text = (deck.ocrText || '').trim();
    if (!blobs.length && !text) throw new Error('El tema no tiene fotos ni texto');
    const source = blobs.length ? `${blobs.length} ${blobs.length === 1 ? 'foto' : 'fotos'} de las páginas` : 'el texto';
    content.push({ type: 'text', text: aiInstructions(deck, source) + (blobs.length ? '' : `\n\nTexto del tema:\n${text}`) });
    onStatus('Claude está leyendo el tema…');
    const { text: out, cost } = await aiRequest({
      content, schema: AI_SCHEMA,
      onProgress: (n) => onStatus(`Claude está escribiendo la explicación… (${n.toLocaleString('es-ES')} caracteres)`),
    });
    return { ...parseAiResult(out), cost };
  }

  // Corrección de una respuesta de desarrollo.
  async function aiCorrect(deck, q, answer) {
    const course = courseById(deck.course)?.label || courseById(P().course)?.label || 'Secundaria';
    const prompt = `Eres un profesor de ${course}, justo y motivador. Corrige la respuesta de un alumno a una pregunta de desarrollo del tema "${deckTitle(deck)}"${deck.subject ? ` de ${deck.subject}` : ''}.

Pregunta: ${q.q}

Respuesta modelo: ${q.model}

Puntos clave que debe incluir:
${q.points.map((x, i) => `${i + 1}. ${x}`).join('\n')}

Respuesta del alumno (puede estar dictada por voz, así que no tengas en cuenta la puntuación):
"""${answer}"""

Valora sobre todo que el contenido sea correcto y completo y que esté bien explicado y ordenado. Devuelve:
- "nota": de 0 a 10 (puede tener un decimal).
- "puntos": para cada punto clave, en el mismo orden, "incluido": true o false.
- "bien": lo que ha hecho bien (1 a 3 frases, hablándole de tú).
- "mejorar": lo que le falta o debe corregir (1 a 3 frases, de tú).
- "consejo": un consejo concreto para la próxima vez (1 frase).`;
    const { text, cost } = await aiRequest({ content: [{ type: 'text', text: prompt }], schema: CORRECT_SCHEMA, maxTokens: 4000, effort: 'low' });
    const o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const nota = Math.max(0, Math.min(10, Math.round(Number(o.nota) * 10) / 10 || 0));
    return { nota, included: q.points.map((_, i) => !!o.puntos?.[i]?.incluido), bien: S(o.bien), mejorar: S(o.mejorar), consejo: S(o.consejo), cost };
  }

  // ---------- Ruta de estudio: pasos y estrellas ----------
  const STEPS = [
    ['entender', '📖 Entender el tema'],
    ['video', '🎬 Vídeo de la lección'],
    ['esquema', '🗺️ Esquema en blanco'],
    ['tarjetas', '🃏 Tarjetas'],
    ['desarrollo', '✍️ Preguntas de desarrollo'],
    ['test', '📝 Test'],
  ];
  const starCount = (d) => STEPS.filter(([k]) => d.progress?.[k]).length;
  const starsHtml = (d) => STEPS.map(([k]) => (d.progress?.[k] ? '⭐' : '<span class="star-off">☆</span>')).join('');
  function markStep(deck, key) {
    deck.progress = deck.progress || {};
    if (deck.progress[key]) return false;
    deck.progress[key] = todayStr();
    P().points += 25;
    save();
    setTimeout(() => toast(starCount(deck) === STEPS.length ? `🏆 ¡Tema completo! Tienes las ${STEPS.length} estrellas` : '⭐ ¡Estrella conseguida! +25 puntos'), 300);
    return true;
  }

  // Dictado por voz (si el navegador lo permite).
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let dictation = null;
  function stopDictation() { if (dictation) { try { dictation.stop(); } catch (e) { /* nada */ } dictation = null; } }
  function toggleDictation(textarea, btn) {
    if (dictation) { stopDictation(); return; }
    const r = new SpeechRec();
    r.lang = 'es-ES';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const t = e.results[i][0].transcript.trim();
        if (t) textarea.value += (textarea.value && !/\s$/.test(textarea.value) ? ' ' : '') + t;
      }
      textarea.dispatchEvent(new Event('input'));
    };
    r.onerror = (e) => { if (e.error === 'not-allowed') toast('Hay que dar permiso al micrófono'); };
    r.onend = () => { dictation = null; btn.textContent = '🎤 Dictar'; btn.classList.remove('on'); };
    try { r.start(); } catch (e) { toast('No se pudo empezar a dictar'); return; }
    dictation = r;
    btn.textContent = '⏹ Parar dictado';
    btn.classList.add('on');
  }

  // ---------- Aprender: esquema, resumen (con audio), fotos y vídeos ----------
  const hasLesson = (d) => !!(d.lesson?.outline || d.lesson?.summary || d.photos?.length || d.videos?.length);

  // Formato sencillo: "# Título", "- punto", "  - subpunto", "**resaltado**"; líneas seguidas = un párrafo.
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>');
  function renderRich(text) {
    const out = [];
    let para = [];
    let inList = false;
    const flushPara = () => { if (para.length) { out.push(`<p data-say>${inline(para.join(' '))}</p>`); para = []; } };
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, '');
      const t = line.trim();
      if (!t) { flushPara(); closeList(); continue; }
      let m;
      if ((m = t.match(/^#+\s*(.+)$/))) { flushPara(); closeList(); out.push(`<h3 data-say>${inline(m[1])}</h3>`); continue; }
      if ((m = line.match(/^(\s*)[-•*]\s+(.+)$/))) {
        flushPara();
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li data-say class="${m[1].length >= 2 ? 'sub' : ''}">${inline(m[2])}</li>`);
        continue;
      }
      closeList();
      para.push(t);
    }
    flushPara();
    closeList();
    return out.join('');
  }
  const plain = (s) => String(s).replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^\s*[-•*]\s+/gm, '');

  function parseYouTube(url) {
    const s = String(url || '').trim();
    const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i);
    return m ? m[1] : (/^[\w-]{11}$/.test(s) ? s : null);
  }

  // Texto de OCR → líneas limpias (une palabras cortadas con guion al final de línea).
  const ocrLines = (text) => String(text || '').replace(/-\n(?=\p{Ll})/gu, '').split(/\r?\n/).map((l) => l.trim());
  const splitSentences = (p) => p.split(/(?<=[.!?])\s+(?=[¿¡]?\p{Lu})/u).map((x) => x.trim()).filter(Boolean);
  const shorten = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n) > 20 ? s.lastIndexOf(' ', n) : n).replace(/[,;:]$/, '') + '…');
  const stripArticle = (s) => s.replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, '');

  // Borrador automático de esquema y resumen (sin IA): detecta apartados, frases clave y conceptos.
  // Pensado para poder sustituirlo más adelante por una versión con IA.
  function generateLesson(text, fallbackTitle) {
    const lines = ocrLines(text);
    const isJunk = (l) => l.length < 3 || (l.match(/\p{L}/gu) || []).length < l.length * 0.5;
    const isHeading = (l, next) => {
      if (l.length > 70 || isJunk(l)) return false;
      if (/^(tema|unidad|bloque|cap[ií]tulo)\s+\d+/i.test(l)) return true;
      if (/[.,;:]$/.test(l) || !/^[¿¡]?(\d+(\.\d+)*\.?\s+)?\p{Lu}/u.test(l)) return false;
      return l.split(/\s+/).length <= 8 && (!next || !/^\p{Ll}/u.test(next));
    };
    const sections = [];
    let cur = null;
    let para = [];
    const flush = () => {
      if (para.length) {
        if (!cur) { cur = { title: fallbackTitle || 'Resumen', paras: [] }; sections.push(cur); }
        cur.paras.push(para.join(' '));
        para = [];
      }
    };
    lines.forEach((l, i) => {
      if (!l) return flush();
      if (isJunk(l)) return;
      if (isHeading(l, lines.slice(i + 1).find(Boolean))) {
        flush();
        cur = { title: l.replace(/\s+/g, ' '), paras: [] };
        sections.push(cur);
        return;
      }
      para.push(l);
    });
    flush();

    const DEF_ES = /^([^,;:()]{2,60}?)\s+(es|son)\s+(.{5,})$/;
    const DEF_NAME = /^(.{3,80}?)\s+se\s+(llaman?|denominan?|conocen?\s+como)\s+(.{2,})$/i;
    const DEF_COLON = /^([^:]{3,70}):\s+(.{2,})$/;
    const DEMONSTRATIVE = /^(est[aeo]s?|es[aeo]s?|aquel(l[ao]s?)?|ello|todo esto)\b/i;
    const KEY = /\b(importantes?|principal(es)?|fundamental(es)?|b[aá]sic[ao]s?|clasifica|divide|tipos?|formad[oa]s? por|consiste|caracter[ií]stica|funci[oó]n|causas?|consecuencias?|siempre|nunca)\b/i;
    const terms = new Set();
    const outline = [];
    const summary = [];

    for (const sec of sections) {
      const cands = [];
      sec.paras.forEach((p) => splitSentences(p).forEach((s, j) => {
        const clean = s.replace(/^[•·\-–—*]\s*/, '');
        if (clean.length < 12) return;
        let score = 0, bullet = null, m;
        const vague = DEMONSTRATIVE.test(clean);
        if (!vague && (m = clean.match(DEF_NAME))) {
          const term = m[3].replace(/[.;]+$/, '');
          if (term.split(' ').length <= 5) terms.add(term);
          score += 3; bullet = `**${term.charAt(0).toUpperCase() + term.slice(1)}**: ${lcFirst(m[1])}`;
        } else if ((m = clean.match(DEF_COLON)) && m[1].split(' ').length <= 4) {
          score += 3; bullet = `**${m[1]}**: ${shorten(m[2].replace(/[.;]+$/, ''), 90)}`;
          if (m[1].split(' ').length <= 5) terms.add(m[1]);
        } else if (!vague && (m = clean.match(DEF_ES)) && m[1].split(' ').length <= 7) {
          const term = stripArticle(m[1]);
          terms.add(term);
          score += 3; bullet = `**${term.charAt(0).toUpperCase() + term.slice(1)}**: ${shorten(m[3].replace(/[.;]+$/, ''), 90)}`;
        }
        if (KEY.test(clean)) score += 2;
        if (j === 0) score += 1;
        if (clean.length > 220) score -= 2;
        cands.push({ s: clean, score, bullet, order: cands.length, first: cands.length === 0 });
      }));
      if (!cands.length) continue;
      // Frases clave del apartado + siempre la primera (da contexto).
      let chosen = cands.filter((c) => c.score >= 2 && !c.first).sort((a, b) => b.score - a.score).slice(0, 4);
      // Si el apartado queda muy corto, añade la siguiente frase con más puntuación.
      if (!chosen.length && cands.length > 1) chosen = [cands.slice(1).sort((a, b) => b.score - a.score || a.order - b.order)[0]];
      chosen = [cands[0], ...chosen].sort((a, b) => a.order - b.order);
      outline.push(`# ${sec.title}`);
      chosen.forEach((c) => outline.push(`- ${c.bullet || shorten(c.s.replace(/[.]$/, ''), 100)}`));
      outline.push('');
      summary.push(`# ${sec.title}`, chosen.map((c) => c.s).join(' '), '');
    }

    // Resalta los conceptos clave en el resumen (solo la primera vez que aparecen).
    const sorted = [...terms].filter((t) => t.length >= 3).sort((a, b) => b.length - a.length);
    const sumLines = summary.slice();
    for (const t of sorted) {
      const re = new RegExp(`(?<![\\p{L}*])(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}*])`, 'iu');
      const i = sumLines.findIndex((l) => !l.startsWith('#') && re.test(l));
      if (i >= 0) sumLines[i] = sumLines[i].replace(re, '**$1**');
    }
    return { outline: outline.join('\n').trim(), summary: sumLines.join('\n').trim() };
  }

  // Lectura en voz alta con la voz del dispositivo.
  const VOICE_KEY = 'app-studio-voice';
  // Puntuación para elegir la voz más natural disponible en el dispositivo.
  function voiceScore(v) {
    let sc = 0;
    if (/premium|enhanced|mejorad|natural|neural|plus|wavenet|studio/i.test(v.name)) sc += 10;
    if (/^es[-_]ES/i.test(v.lang)) sc += 4;
    if (/google|microsoft/i.test(v.name)) sc += 3;
    if (!v.localService) sc += 1;
    if (/compact|eloquence|grandma|grandpa|abuel|bad news|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|bahh|albert|fred|junior|ralph|kathy/i.test(v.name)) sc -= 20;
    return sc;
  }
  const voiceQuality = (v) => (/premium|enhanced|mejorad|natural|neural|plus|wavenet|studio/i.test(v.name) ? '⭐ ' : '');
  const speech = {
    supported: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    stop() { if (this.supported) { try { speechSynthesis.cancel(); } catch (e) { /* nada */ } } },
    // Voces en español, de la que suena más natural a la más básica.
    voices() {
      const vs = this.supported ? speechSynthesis.getVoices() : [];
      return vs.filter((v) => /^es/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
    },
    voice() {
      const list = this.voices();
      let chosen = null;
      try { chosen = localStorage.getItem(VOICE_KEY); } catch (e) { /* sin almacenamiento */ }
      return (chosen && list.find((v) => v.voiceURI === chosen || v.name === chosen)) || list[0] || null;
    },
    // Lee una lista de bloques; avisa de qué bloque está leyendo y cuándo termina.
    play(blocks, rate, onBlock, onEnd) {
      this.stop();
      const voice = this.voice();
      const queue = [];
      blocks.forEach((text, bi) => splitSentences(text).forEach((s) => queue.push({ s, bi })));
      if (!queue.length) return onEnd();
      queue.forEach(({ s, bi }, k) => {
        const u = new SpeechSynthesisUtterance(s);
        u.lang = 'es-ES';
        if (voice) u.voice = voice;
        u.rate = rate;
        u.onstart = () => onBlock(bi);
        if (k === queue.length - 1) { u.onend = onEnd; u.onerror = onEnd; }
        speechSynthesis.speak(u);
      });
    },
  };

  function viewLearn(id) {
    const deck = getDeck(id);
    if (!deck) return go('#/');
    const L = deck.lesson || {};
    const sections = [
      L.outline && ['outline', '📋 Esquema'],
      L.summary && ['summary', '📝 Resumen'],
      deck.photos?.length && ['photos', '📷 Fotos'],
      deck.videos?.length && ['videos', '🎬 Vídeos'],
    ].filter(Boolean);
    app.innerHTML = `
      <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
      <h1 style="margin-bottom:2px">📖 ${esc(deckTitle(deck))}</h1>
      <p class="muted">${esc(deckMeta(deck))}</p>
      ${sections.length > 1 ? `<div class="chips" style="margin-bottom:12px">${sections.map(([k, label]) => `<button class="chip" data-jump="${k}" style="padding:0 14px">${label}</button>`).join('')}</div>` : ''}
      ${!sections.length ? '<div class="card muted">Este tema todavía no tiene explicación. Añádela en "Editar este tema".</div>' : ''}

      <div class="learn-cols ${L.outline && L.summary ? 'two' : ''}">
      ${L.outline ? `<section class="card rich" id="sec-outline"><h2 style="margin-top:0">📋 Esquema</h2>${renderRich(L.outline)}</section>` : ''}

      ${L.summary ? `<section class="card rich" id="sec-summary">
        <h2 style="margin-top:0">📝 Resumen</h2>
        ${speech.supported ? `<div class="row tts">
          <button class="btn primary" id="ttsPlay">🔊 Escuchar</button>
          <button class="btn" id="ttsPause" hidden>⏸ Pausa</button>
          <button class="btn" id="ttsStop" hidden>⏹ Parar</button>
          <select id="ttsRate" aria-label="Velocidad"><option value="1">Velocidad normal</option><option value="0.8">Más despacio</option><option value="1.2">Más rápido</option></select>
        </div>` : ''}
        <div id="summary">${renderRich(L.summary)}</div>
      </section>` : ''}
      </div>

      ${deck.photos?.length ? `<section class="card" id="sec-photos">
        <h2 style="margin-top:0">📷 Fotos del tema</h2>
        <div class="thumbs">${deck.photos.map((pid, i) => `<a class="thumb" href="#/photos/${deck.id}"><img data-photo="${pid}" alt="Foto ${i + 1}"></a>`).join('')}</div>
        <a class="btn block" href="#/photos/${deck.id}" style="margin-top:10px">Ver las fotos en grande</a>
      </section>` : ''}

      ${deck.videos?.length ? `<section class="card" id="sec-videos">
        <h2 style="margin-top:0">🎬 Vídeos</h2>
        ${deck.videos.map((v) => `<div class="video">
          <div class="video-title">${esc(v.title)}</div>
          <div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.yt)}" title="${esc(v.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
          <a class="muted small" href="https://www.youtube.com/watch?v=${esc(v.yt)}" target="_blank" rel="noopener">Abrir en YouTube</a>
        </div>`).join('')}
      </section>` : ''}

      <div class="card center">
        <h2 style="margin-top:0">¿Ya lo has estudiado? 💪</h2>
        <p class="muted small">Ahora comprueba lo que sabes.</p>
        ${deck.cards.length ? `<div class="row">
          <a class="btn primary" href="#/study/${deck.id}">🃏 Repasar tarjetas</a>
          <a class="btn" href="#/quiz/${deck.id}/${deck.cards.length >= 2 ? 'choice' : 'write'}">📝 Hacer el test</a>
        </div>` : '<p class="muted small">Este tema aún no tiene tarjetas de preguntas.</p>'}
      </div>
    `;
    hydratePhotos(app);
    $$('[data-jump]').forEach((b) => { b.onclick = () => $(`#sec-${b.dataset.jump}`).scrollIntoView({ behavior: 'smooth', block: 'start' }); });

    if (L.summary && speech.supported) {
      const blocks = $$('#summary [data-say]');
      const play = $('#ttsPlay'), pause = $('#ttsPause'), stop = $('#ttsStop');
      let paused = false;
      const mark = (i) => {
        blocks.forEach((b, k) => b.classList.toggle('reading', k === i));
        if (blocks[i]) blocks[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      const reset = () => { mark(-1); play.hidden = false; pause.hidden = true; stop.hidden = true; paused = false; pause.textContent = '⏸ Pausa'; };
      play.onclick = () => {
        play.hidden = true; pause.hidden = false; stop.hidden = false;
        speech.play(blocks.map((b) => plain(b.textContent)), Number($('#ttsRate').value), mark, reset);
      };
      pause.onclick = () => {
        if (paused) { speechSynthesis.resume(); pause.textContent = '⏸ Pausa'; } else { speechSynthesis.pause(); pause.textContent = '▶️ Seguir'; }
        paused = !paused;
      };
      stop.onclick = () => { speech.stop(); reset(); };
    }
  }

  // ---------- Editar tema: datos, fotos, texto y tarjetas ----------
  // Propone tarjetas a partir de frases típicas de libro de texto. Siempre hay que revisarlas.
  function proposeCards(text) {
    const clean = text.replace(/-\n(?=\p{Ll})/gu, '');
    const paras = clean.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    const sentences = paras.flatMap((p) => p.split(/(?<=[.!?])\s+(?=[¿¡]?\p{Lu})/u));
    const out = [];
    const seen = new Set();
    const add = (q, a) => {
      q = q.trim().replace(/\s+/g, ' ');
      a = a.trim().replace(/[.;,]+$/, '');
      if (q.length < 4 || a.length < 2 || a.length > 180) return;
      const k = normalize(q);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ q, a });
    };
    for (let s of sentences) {
      s = s.trim().replace(/\s+/g, ' ').replace(/^[•·\-–—*]\s*/, '');
      if (s.length < 8 || s.length > 320) continue;
      let m;
      // "Funciones vitales: nutrición, relación y reproducción."
      if ((m = s.match(/^([^:]{3,70}):\s+(.{2,200})$/))) { add(m[1], m[2]); continue; }
      // "Las células sin núcleo se llaman procariotas."
      if (/^(est[aeo]s?|es[aeo]s?|aquel(l[ao]s?)?|ello|todo esto)\b/i.test(s)) continue;
      if ((m = s.match(/^(.{3,80}?)\s+se\s+(llaman?|denominan?|conocen?\s+como)\s+(.{2,150})$/i))) {
        add(`¿Cómo se ${m[2].toLowerCase()} ${lcFirst(m[1])}?`.replace(/ como /, ' '), m[3]);
        continue;
      }
      // "La célula es la unidad básica de los seres vivos."
      if ((m = s.match(/^([^,;:()]{2,60}?)\s+(es|son)\s+(.{5,200})$/))) {
        if (m[1].split(' ').length > 7) continue;
        add(`¿Qué ${m[2]} ${lcFirst(m[1])}?`, m[3]);
      }
    }
    return out.slice(0, 60);
  }

  async function createOcrWorker(logger) {
    await loadScript(OCR.script);
    return window.Tesseract.createWorker('spa', 1, { workerPath: OCR.workerPath, corePath: OCR.corePath, langPath: OCR.langPath, logger: logger || (() => {}) });
  }

  // ---------- Imágenes mudas: localizar con precisión los rótulos con el lector de texto ----------
  const lnorm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m || !n) return m + n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // Coste de que la palabra leída (w) sea la palabra esperada (t); Infinity si no se parecen.
  function wordCost(t, w) {
    if (!w) return Infinity;
    if (t === w) return 0;
    if (t.length >= 4 && w.length >= 3 && (t.startsWith(w) || w.startsWith(t))) return 1;
    const d = lev(t, w);
    return d <= (t.length > 6 ? 2 : t.length > 3 ? 1 : 0) ? d : Infinity;
  }
  const imageSize = (blob) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve([img.naturalWidth, img.naturalHeight]); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
  const validBox = (b) => b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0 && b.x >= 0 && b.y >= 0 && b.x < 100 && b.y < 100;

  async function refineLabels(deck, onStatus) {
    const list = deck.labelEx || [];
    if (!list.length) return;
    let worker = null;
    try {
      onStatus('Preparando las imágenes para completar: buscando los nombres en el dibujo…');
      worker = await createOcrWorker();
    } catch (e) { worker = null; }
    for (const [k, ex] of list.entries()) {
      onStatus(`Preparando la imagen para completar ${k + 1} de ${list.length}…`);
      const blob = await photoGet(ex.pid).catch(() => null);
      if (!blob) continue;
      let lines = [];
      try {
        const [W, H] = await imageSize(blob);
        if (worker) {
          const { data } = await worker.recognize(blob, {}, { blocks: true });
          for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
            lines.push((l.words || []).map((w) => ({ t: lnorm(w.text), x0: w.bbox.x0 / W * 100, y0: w.bbox.y0 / H * 100, x1: w.bbox.x1 / W * 100, y1: w.bbox.y1 / H * 100 })).filter((w) => w.t));
          }
        }
      } catch (e) { lines = []; }
      for (const lab of ex.labels) {
        const toks = lnorm(lab.text).split(' ').filter(Boolean);
        let best = null;
        for (const words of lines) {
          for (let i = 0; i + toks.length <= words.length; i++) {
            let cost = 0;
            for (let j = 0; j < toks.length && cost !== Infinity; j++) cost += wordCost(toks[j], words[i + j].t);
            if (cost === Infinity) continue;
            const ws = words.slice(i, i + toks.length);
            const box = { x: Math.min(...ws.map((w) => w.x0)), y: Math.min(...ws.map((w) => w.y0)), x1: Math.max(...ws.map((w) => w.x1)), y1: Math.max(...ws.map((w) => w.y1)) };
            // Si hay varias coincidencias, la más cercana a donde dijo Claude.
            const dist = validBox(lab) ? Math.hypot((box.x + box.x1) / 2 - (lab.x + lab.w / 2), (box.y + box.y1) / 2 - (lab.y + lab.h / 2)) : 0;
            const score = cost * 50 + dist;
            if (!best || score < best.score) best = { score, box };
          }
        }
        if (best) lab.box = { x: best.box.x, y: best.box.y, w: best.box.x1 - best.box.x, h: best.box.y1 - best.box.y, exact: true };
        else if (validBox(lab)) lab.box = { x: lab.x, y: lab.y, w: Math.min(lab.w, 100 - lab.x), h: Math.min(lab.h, 100 - lab.y), exact: false };
      }
      // Si el lector de texto ha funcionado, un nombre que no aparece en el dibujo se descarta
      // (puede que Claude lo haya leído mal o se lo haya inventado y taparía una zona sin nombre).
      const ocrOk = lines.some((l) => l.length);
      ex.labels = ex.labels.filter((l) => l.box && (!ocrOk || l.box.exact));
      // Zona a mostrar: el dibujo más todos los rótulos, con margen.
      const boxes = ex.labels.map((l) => l.box).concat(validBox(ex) ? [ex] : []);
      if (boxes.length) {
        const pad = 3;
        const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
        const x1 = Math.min(100, Math.max(...boxes.map((b) => b.x + b.w)) + pad), y1 = Math.min(100, Math.max(...boxes.map((b) => b.y + b.h)) + pad);
        ex.crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      ex.ready = true;
    }
    deck.labelEx = list.filter((ex) => ex.labels.length >= 2 && ex.crop);
    if (worker) worker.terminate();
    onStatus(deck.labelEx.length ? `🏷️ ${deck.labelEx.length} ${deck.labelEx.length === 1 ? 'imagen lista' : 'imágenes listas'} para completar.` : '');
  }

  async function runOcr(deck, statusEl) {
    if (!deck.photos.length) return toast('Primero añade alguna foto');
    if (deck.ocrText && !confirm('Ya hay texto sacado de las fotos. ¿Sustituirlo?')) return;
    const setStatus = (t) => { statusEl.textContent = t; };
    let worker;
    try {
      setStatus('Descargando el lector de texto (solo la primera vez, puede tardar un poco)…');
      await loadScript(OCR.script);
      let current = 0;
      worker = await window.Tesseract.createWorker('spa', 1, {
        workerPath: OCR.workerPath, corePath: OCR.corePath, langPath: OCR.langPath,
        logger: (m) => {
          if (m.status === 'recognizing text') setStatus(`Leyendo foto ${current + 1} de ${deck.photos.length}… ${Math.round(m.progress * 100)} %`);
        },
      });
      const parts = [];
      for (current = 0; current < deck.photos.length; current++) {
        const blob = await photoGet(deck.photos[current]);
        if (!blob) continue;
        setStatus(`Leyendo foto ${current + 1} de ${deck.photos.length}…`);
        const { data: res } = await worker.recognize(blob);
        parts.push(res.text.trim());
      }
      deck.ocrText = parts.join('\n\n');
      save();
      return true;
    } catch (e) {
      toast('No se pudo leer el texto. Comprueba la conexión a internet e inténtalo de nuevo.');
      setStatus('');
      return false;
    } finally {
      if (worker) worker.terminate();
    }
  }

  function viewEdit(id) {
    const deck = getDeck(id);
    if (!deck) return go('#/');
    const aiDoneHtml = () => {
      const parts = [
        deck.explain && `📖 explicación (${deck.explain.apartados.length} apartados)`,
        deck.lesson?.outline && '🗺️ esquema',
        deck.lesson?.summary && '📝 resumen',
        deck.dev?.length && `✍️ ${deck.dev.length} preguntas de desarrollo`,
        deck.labelEx?.length && `🏷️ ${deck.labelEx.length} ${deck.labelEx.length === 1 ? 'imagen' : 'imágenes'} para completar`,
        deck.cards.length && `🃏 ${deck.cards.length} tarjetas`,
      ].filter(Boolean);
      return parts.length ? `<p class="small ok-line">Ya preparado: ${parts.join(' · ')}</p>` : '';
    };
    deck.photos = deck.photos || [];
    app.innerHTML = `
      <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
      <h1>✏️ Editar tema</h1>

      <details class="card" ${deck.name ? '' : 'open'}>
        <summary><b>📋 Datos del tema</b> <span class="muted small">${esc(deckMeta(deck))}</span></summary>
        <form id="meta">
          ${deckFormFields(deck)}
          <button class="btn primary block" style="margin-top:12px">Guardar datos</button>
        </form>
      </details>

      <div class="card">
        <h2 style="margin-top:0">📷 Fotos y capturas del tema</h2>
        <p class="muted small">Fotos de las páginas (con buena luz y la página recta) o <b>capturas de pantalla</b> del libro digital. Puedes subir varias a la vez: se ordenan por la hora en que se hicieron.</p>
        ${deck.bookId ? `<p class="muted small">📚 Páginas importadas del libro en PDF.</p>` : ''}
        <div class="thumbs">
          ${deck.photos.map((pid, i) => `
            <div class="thumb">
              <img data-photo="${pid}" alt="Foto ${i + 1}">
              <span class="thumb-n">${i + 1}</span>
              <button class="thumb-del" data-delphoto="${pid}" aria-label="Borrar foto ${i + 1}">✕</button>
              <div class="thumb-move">
                <button data-move="${i}" data-dir="-1" aria-label="Mover antes" ${i === 0 ? 'disabled' : ''}>◀</button>
                <button data-move="${i}" data-dir="1" aria-label="Mover después" ${i === deck.photos.length - 1 ? 'disabled' : ''}>▶</button>
              </div>
            </div>`).join('')}
        </div>
        <div class="row" style="margin-top:10px">
          <label class="btn" style="margin:0">📷 Añadir fotos o capturas<input type="file" id="addPhotos" accept="image/*" multiple hidden></label>
          ${deck.photos.length ? '<button class="btn" id="cropOpen">✂️ Recortar</button>' : ''}
        </div>
        <div id="photoStatus" class="muted small" style="margin-top:6px"></div>
        <div id="cropPanel"></div>
      </div>

      <div class="card ai">
        <h2 style="margin-top:0">🤖 Preparar el tema con IA (Claude)</h2>
        <p class="muted small">Claude lee las páginas (o el texto) y prepara la <b>explicación</b> con ejemplos, el <b>esquema</b>, el <b>resumen</b>, las <b>preguntas de desarrollo</b> y las <b>tarjetas</b>. Revisa siempre el resultado.</p>
        <div id="aiDone">${aiDoneHtml()}</div>
        <div id="lblStatus" class="muted small"></div>
        ${deck.labelEx?.length ? `<details class="lbl-admin"><summary class="small"><b>🏷️ Imágenes para completar (${deck.labelEx.length})</b></summary>
          <ul class="list">${deck.labelEx.map((ex) => `<li><span class="qa">${esc(ex.title)} <span class="muted small">· ${ex.labels.length} nombres${ex.labels.some((l) => !l.box?.exact) ? ' · alguno con posición aproximada' : ''}</span></span>
            <span><a class="btn" href="#/labels/${deck.id}/${ex.id}">Ver</a> <button class="btn" data-dellbl="${ex.id}">Quitar</button></span></li>`).join('')}</ul>
        </details>` : ''}
        ${aiSettings().key ? `
          <button class="btn primary block" id="aiAuto">✨ Hacerlo automáticamente</button>
          <div id="aiStatus" class="muted small" style="margin-top:6px"></div>
          <p class="muted small">Usa tu clave de la API (Zona padres). Cada tema cuesta unos céntimos y tarda uno o dos minutos.</p>
          <details><summary class="small"><b>O hacerlo con tu app de Claude (sin coste extra con tu plan)</b></summary>` : `
          <h3 style="margin:12px 0 6px;font-size:1rem">Con tu app de Claude (sin coste extra con tu plan)</h3>`}
          <ol class="steps small">
            <li>Pulsa el botón: se copian las instrucciones${deck.photos.length ? ' y se envían las fotos' : ''} a la app de Claude.<br>
              <button class="btn block" id="aiShare" style="margin-top:6px">📤 ${deck.photos.length ? 'Enviar fotos e instrucciones a Claude' : 'Copiar instrucciones'}</button></li>
            <li>En Claude, si no aparecen las instrucciones, mantén pulsado el cuadro de texto y elige <b>Pegar</b>. Envía el mensaje.
              ${deck.photos.length ? '<br>Si las fotos no llegan, adjúntalas desde la galería con el clip 📎.' : ''}
              <br><a href="https://claude.ai/new" target="_blank" rel="noopener">Abrir Claude</a></li>
            <li>Cuando Claude termine (la respuesta es larga), pulsa <b>Copiar</b> en su bloque de código, vuelve aquí y pégalo:
              <textarea id="aiPaste" placeholder="Pega aquí la respuesta de Claude" style="min-height:90px;margin-top:6px"></textarea>
              <button class="btn primary block" id="aiApply" style="margin-top:6px">Usar la respuesta de Claude</button></li>
          </ol>
        ${aiSettings().key ? '</details>' : '<p class="muted small">¿Prefieres que se haga solo? Configura una clave de la API en Zona padres → Inteligencia artificial.</p>'}
        <div id="aiProposals"></div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">🔤 Texto del tema</h2>
        <p class="muted small">La app puede leer el texto de las fotos (necesita internet la primera vez). Revisa el texto: puede tener algún error si la foto no es buena. También puedes pegar o escribir el texto directamente.</p>
        <button class="btn block" id="ocr" ${deck.photos.length ? '' : 'disabled'}>🔤 Sacar texto de las fotos</button>
        <div id="ocrStatus" class="muted small" style="margin-top:6px"></div>
        <div id="ocrArea">
          <label for="ocrText">Texto (puedes corregirlo)</label>
          <textarea id="ocrText" style="min-height:200px">${esc(deck.ocrText)}</textarea>
          <button class="btn primary block" id="propose" style="margin-top:10px">✨ Proponer tarjetas con este texto</button>
        </div>
        <div id="proposals"></div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">📖 Explicación: esquema y resumen</h2>
        <p class="muted small">Es lo que se ve en "Aprender" antes de las preguntas. La app puede proponer un borrador a partir del texto del tema; luego corrígelo a mano.</p>
        <button class="btn block" id="genLesson">✨ Generar esquema y resumen a partir del texto</button>
        <label for="lo">Esquema</label>
        <textarea id="lo" placeholder="# Apartado&#10;- Idea importante&#10;- **Concepto**: explicación">${esc(deck.lesson?.outline || '')}</textarea>
        <label for="ls">Resumen</label>
        <textarea id="ls" style="min-height:200px" placeholder="# Apartado&#10;Texto del resumen con las **palabras clave** resaltadas.">${esc(deck.lesson?.summary || '')}</textarea>
        <p class="muted small">Formato: <code># Título</code> para un apartado, <code>- texto</code> para un punto y <code>**palabra**</code> para resaltar.</p>
        <button class="btn primary block" id="saveLesson">Guardar explicación</button>
      </div>

      <div class="card">
        <h2 style="margin-top:0">🎬 Vídeos</h2>
        <ul class="list">
          ${(deck.videos || []).map((v) => `<li>
            <span class="qa">▶️ ${esc(v.title)} <a class="muted small" href="https://www.youtube.com/watch?v=${esc(v.yt)}" target="_blank" rel="noopener">ver en YouTube</a></span>
            <button class="icon-btn" data-delvid="${v.id}" aria-label="Quitar vídeo">🗑️</button>
          </li>`).join('') || '<li class="muted">Todavía no hay vídeos</li>'}
        </ul>
        <form id="vid">
          <label for="vu">Enlace de YouTube</label>
          <input type="url" id="vu" required placeholder="https://www.youtube.com/watch?v=…">
          <label for="vt">Título (opcional)</label>
          <input type="text" id="vt" maxlength="80" placeholder="Ej.: La célula explicada fácil">
          <button class="btn primary block" style="margin-top:12px">Añadir vídeo</button>
        </form>
        <a class="btn block" style="margin-top:10px" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent([deck.name, deck.subject, courseById(deck.course)?.label].filter(Boolean).join(' '))}">🔎 Buscar vídeos de este tema en YouTube</a>
        <p class="muted small">Mira el vídeo antes de añadirlo: que sea correcto y adecuado para su edad. Copia el enlace con "Compartir → Copiar enlace" en YouTube.</p>
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

      <details class="card">
        <summary><b>Añadir muchas de golpe</b></summary>
        <p class="muted small">Una por línea, con la pregunta y la respuesta separadas por <b>|</b> o por <b>tabulador</b> (sirve copiar dos columnas de Excel).<br>Ejemplo: <code>Capital de Francia | París</code></p>
        <textarea id="bulk" placeholder="Pregunta | Respuesta"></textarea>
        <button class="btn block" id="bulkBtn" style="margin-top:10px">Añadir todas</button>
      </details>

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
      </div>
      <button class="btn ghost block" id="delDeck" style="color:var(--bad)">Borrar tema</button>
    `;
    hydratePhotos(app);

    // Datos del tema
    $('#ts').onchange = () => { $('#te').placeholder = subjectEmoji($('#ts').value); };
    $('#meta').onsubmit = (e) => {
      e.preventDefault();
      const fields = readDeckForm();
      if (!fields.name) return toast('El tema necesita un título');
      Object.assign(deck, fields);
      save();
      viewEdit(id);
      toast('Datos guardados');
    };

    // Fotos
    $('#addPhotos').onchange = async (e) => {
      // Orden en que se hicieron (las capturas suelen hacerse página a página).
      const files = Array.from(e.target.files || []).sort((a, b) => (a.lastModified - b.lastModified) || a.name.localeCompare(b.name, 'es', { numeric: true }));
      if (!files.length) return;
      const status = $('#photoStatus');
      let added = 0, failed = 0;
      for (const [i, file] of files.entries()) {
        status.textContent = `Guardando foto ${i + 1} de ${files.length}…`;
        try {
          const blob = await compressImage(file);
          const pid = uid();
          await photoPut(pid, blob);
          deck.photos.push(pid);
          added++;
        } catch (err) {
          failed++;
        }
      }
      save();
      viewEdit(id);
      if (added) toast(`${added} ${added === 1 ? 'foto añadida' : 'fotos añadidas'}`);
      if (failed) setTimeout(() => toast(`${failed} ${failed === 1 ? 'foto no se pudo' : 'fotos no se pudieron'} guardar (formato no compatible o sin espacio)`), added ? 2700 : 0);
    };
    $$('[data-move]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.move), j = i + Number(b.dataset.dir);
        if (j < 0 || j >= deck.photos.length) return;
        [deck.photos[i], deck.photos[j]] = [deck.photos[j], deck.photos[i]];
        save();
        viewEdit(id);
      };
    });
    if ($('#cropOpen')) $('#cropOpen').onclick = () => openCropPanel(deck, $('#cropPanel'), () => viewEdit(id));
    $$('[data-delphoto]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('¿Borrar esta foto?')) return;
        await deletePhotos([b.dataset.delphoto]);
        deck.photos = deck.photos.filter((x) => x !== b.dataset.delphoto);
        save();
        viewEdit(id);
      };
    });

    // Texto (OCR) y propuestas de tarjetas
    $('#ocr').onclick = async () => {
      const btn = $('#ocr');
      btn.disabled = true;
      const ok = await runOcr(deck, $('#ocrStatus'));
      btn.disabled = false;
      if (ok) {
        $('#ocrStatus').textContent = deck.ocrText ? 'Texto listo. Revísalo y pulsa "Proponer tarjetas".' : 'No se encontró texto en las fotos.';
        $('#ocrText').value = deck.ocrText;
      }
    };
    $('#ocrText').onchange = (e) => { deck.ocrText = e.target.value; save(); };
    $('#propose').onclick = () => {
      deck.ocrText = $('#ocrText').value;
      save();
      const props = proposeCards(deck.ocrText);
      const box = $('#proposals');
      if (!props.length) {
        box.innerHTML = '<p class="muted small" style="margin-top:10px">No he encontrado frases con forma de definición ("X es…", "X: …", "X se llama…"). Puedes crear las tarjetas a mano copiando del texto.</p>';
        return;
      }
      showProposals(box, props, deck, () => viewEdit(id));
    };

    // IA: aplicar resultado (esquema, resumen y propuestas de tarjetas)
    const applyAi = (r) => {
      const had = deck.lesson?.outline || deck.lesson?.summary || deck.explain;
      deck.lesson = { outline: r.esquema || deck.lesson?.outline || '', summary: r.resumen || deck.lesson?.summary || '' };
      if (r.explicacion) {
        r.explicacion.apartados.forEach((a) => {
          a.imagenes = (a.imagenes || []).map((im) => {
            const pid = deck.photos[im.foto - 1];
            if (!pid) return null;
            const ok = [im.x, im.y, im.w, im.h].every((v) => Number.isFinite(v)) && im.w >= 3 && im.h >= 3 && im.x >= 0 && im.y >= 0 && im.x < 100 && im.y < 100;
            return ok ? { pid, x: im.x, y: im.y, w: Math.min(im.w, 100 - im.x), h: Math.min(im.h, 100 - im.y), pie: im.pie } : { pid, pie: im.pie };
          }).filter(Boolean);
        });
        deck.explain = r.explicacion;
      }
      if (r.desarrollo.length) deck.dev = r.desarrollo;
      deck.labelEx = (r.mudas || []).map((m) => ({
        id: uid(), pid: deck.photos[m.foto - 1], title: m.title || 'Pon los nombres',
        x: m.x, y: m.y, w: m.w, h: m.h, labels: m.labels.map((l) => ({ text: l.text, x: l.x, y: l.y, w: l.w, h: l.h })),
      })).filter((m) => m.pid);
      save();
      $('#aiDone').innerHTML = aiDoneHtml();
      if (deck.labelEx.length) {
        const st = $('#lblStatus');
        refineLabels(deck, (t) => { if (st) st.textContent = t; }).then(() => {
          save();
          const d = $('#aiDone');
          if (d) d.innerHTML = aiDoneHtml();
        });
      }
      $('#lo').value = deck.lesson.outline;
      $('#ls').value = deck.lesson.summary;
      const box = $('#aiProposals');
      if (r.tarjetas.length) showProposals(box, r.tarjetas, deck, () => viewEdit(id));
      else box.innerHTML = '';
      toast(`Tema ${had ? 'actualizado' : 'preparado'}${r.tarjetas.length ? `: revisa las ${r.tarjetas.length} tarjetas propuestas` : ''}`);
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const confirmReplace = () => !(deck.lesson?.outline || deck.lesson?.summary || deck.explain) || confirm('Ya hay material preparado (explicación, esquema o resumen). ¿Sustituirlo por el nuevo de Claude?');
    if ($('#aiAuto')) {
      $('#aiAuto').onclick = async () => {
        if (!deck.photos.length && !$('#ocrText').value.trim()) return toast('Añade fotos o el texto del tema primero');
        if (!confirmReplace()) return;
        deck.ocrText = $('#ocrText').value;
        const btn = $('#aiAuto'), st = $('#aiStatus');
        btn.disabled = true;
        try {
          const r = await aiGenerate(deck, (t) => { st.textContent = t; });
          st.textContent = `Hecho. Coste aproximado: ${r.cost.toLocaleString('es-ES', { maximumFractionDigits: 3 })} $`;
          if (!r.explicacion) toast('Claude no ha devuelto la explicación: prueba otra vez');
          applyAi(r);
        } catch (e) {
          st.textContent = '';
          toast(e.message || 'No se pudo completar');
        } finally {
          btn.disabled = false;
        }
      };
    }
    $('#aiShare').onclick = async () => {
      const text = deck.ocrText || $('#ocrText').value;
      const source = deck.photos.length ? `${deck.photos.length} ${deck.photos.length === 1 ? 'foto' : 'fotos'} (adjuntas)` : 'el texto';
      const prompt = aiInstructions(deck, source) + (deck.photos.length || !text.trim() ? '' : `\n\nTexto del tema:\n${text}`) + AI_FORMAT;
      if (!deck.photos.length && !text.trim()) return toast('Añade fotos o el texto del tema primero');
      const copied = navigator.clipboard ? navigator.clipboard.writeText(prompt).then(() => true, () => false) : Promise.resolve(false);
      if (deck.photos.length && navigator.canShare) {
        try {
          const files = [];
          for (const [i, pid] of deck.photos.entries()) {
            const blob = await photoGet(pid).catch(() => null);
            if (blob) files.push(new File([blob], `tema-foto-${i + 1}.jpg`, { type: 'image/jpeg' }));
          }
          if (files.length && navigator.canShare({ files })) {
            await navigator.share({ files, text: prompt });
            return;
          }
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      if (await copied) toast('Instrucciones copiadas. Abre Claude, adjunta las fotos y pega.');
      else {
        $('#aiPaste').value = prompt;
        $('#aiPaste').select();
        toast('No se pudo copiar solo: copia el texto del cuadro y luego bórralo');
      }
    };
    $('#aiApply').onclick = () => {
      let r;
      try { r = parseAiResult($('#aiPaste').value); } catch (e) {
        return toast('No entiendo la respuesta. Copia el bloque de código completo de Claude.');
      }
      if (!confirmReplace()) return;
      $('#aiPaste').value = '';
      applyAi(r);
    };

    $$('[data-dellbl]').forEach((b) => {
      b.onclick = () => {
        if (!confirm('¿Quitar esta imagen para completar?')) return;
        deck.labelEx = deck.labelEx.filter((x) => x.id !== b.dataset.dellbl);
        save();
        viewEdit(id);
      };
    });

    // Explicación (esquema y resumen)
    $('#genLesson').onclick = () => {
      const text = $('#ocrText').value.trim();
      if (!text) return toast('Primero saca el texto de las fotos o pégalo en "Texto del tema"');
      if (($('#lo').value.trim() || $('#ls').value.trim()) && !confirm('Ya hay esquema o resumen. ¿Sustituirlos por el borrador automático?')) return;
      deck.ocrText = text;
      const lesson = generateLesson(text, deck.name);
      if (!lesson.outline && !lesson.summary) return toast('No he encontrado suficiente texto para hacer un resumen');
      $('#lo').value = lesson.outline;
      $('#ls').value = lesson.summary;
      deck.lesson = lesson;
      save();
      toast('Borrador creado: revísalo y corrígelo si hace falta');
    };
    $('#saveLesson').onclick = () => {
      deck.lesson = { outline: $('#lo').value.trim(), summary: $('#ls').value.trim() };
      save();
      toast('Explicación guardada');
    };

    // Vídeos
    $('#vid').onsubmit = (e) => {
      e.preventDefault();
      const yt = parseYouTube($('#vu').value);
      if (!yt) return toast('Ese enlace no parece de un vídeo de YouTube');
      deck.videos = deck.videos || [];
      if (deck.videos.some((v) => v.yt === yt)) return toast('Ese vídeo ya está añadido');
      deck.videos.push({ id: uid(), yt, title: $('#vt').value.trim() || `Vídeo ${deck.videos.length + 1}` });
      save();
      viewEdit(id);
      toast('Vídeo añadido');
    };
    $$('[data-delvid]').forEach((b) => {
      b.onclick = () => {
        deck.videos = deck.videos.filter((v) => v.id !== b.dataset.delvid);
        save();
        viewEdit(id);
      };
    });

    // Tarjetas a mano
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
    $('#delDeck').onclick = async () => {
      if (!confirm(`¿Borrar "${deckTitle(deck)}" con todas sus tarjetas y fotos?`)) return;
      await deletePhotos(deck.photos);
      P().decks = P().decks.filter((d) => d.id !== deck.id);
      save();
      go('#/');
    };
  }

  // ---------- Teclado (tablet con teclado) ----------
  let keyHandler = null;
  function onKey(fn) { keyHandler = fn; }
  document.addEventListener('keydown', (e) => {
    if (!keyHandler || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (t && t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter') && !t.closest('#flash')) return;
    keyHandler(e.key);
    if (e.key === ' ') e.preventDefault();
  });

  // ---------- Router ----------
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function route() {
    stopVideo();
    window.onresize = null;
    $$('.lightbox').forEach((x) => x.remove());
    speech.stop();
    stopDictation();
    keyHandler = null;
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    window.scrollTo(0, 0);
    if (!P() && data.profiles.length) data.activeId = data.profiles[0].id;
    renderHeader();
    if (!P() || parts[0] === 'welcome') return viewWelcome();
    if (parts[0] === 'profiles') return go('#/');
    if (!P().course) return viewChooseCourse();
    switch (parts[0]) {
      case 'deck': return viewDeck(parts[1]);
      case 'photos': return viewPhotos(parts[1]);
      case 'learn': return viewLearn(parts[1]);
      case 'explain': return viewExplain(parts[1]);
      case 'video': return viewVideo(parts[1]);
      case 'labels': return viewLabels(parts[1], parts[2]);
      case 'map': return viewMap(parts[1], parts[2]);
      case 'blank': return viewBlank(parts[1]);
      case 'dev': return viewDev(parts[1], parts[2] != null && parts[2] !== '' ? Number(parts[2]) : null);
      case 'study': return viewStudy(parts[1]);
      case 'quiz': return viewQuiz(parts[1], parts[2] === 'write' ? 'write' : 'choice');
      case 'math': return parts[1] === 'play' ? playMath() : viewMath();
      case 'search': return viewSearch();
      case 'books': return viewBooks();
      case 'book': return viewBook(parts[1]);
      case 'new': return viewNew();
      case 'parents': return viewParents();
      case 'edit': return viewEdit(parts[1]);
      default: return viewHome();
    }
  }
  window.addEventListener('hashchange', route);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sin modo sin conexión */ });
  }
  // Pide al navegador que no borre los datos (fotos, libros) cuando falte espacio.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (P()) resetMathCfg();
  route();
})();
