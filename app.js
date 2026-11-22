/* App Studio — app de estudio sin servidor.
 * Los datos se guardan en el navegador: temas y progreso en localStorage, fotos en IndexedDB.
 * Usa "Zona padres > Copia de seguridad" para pasar los datos a otro dispositivo. */
(() => {
  'use strict';

  const { COURSES, MATH_BY_LEVEL, STARTER_BY_COURSE, SUBJECTS, PUBLISHERS } = window.APP_CONTENT;
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
        const req = indexedDB.open('app-studio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('photos');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const photoPut = (id, blob) => idb('readwrite', (s) => s.put(blob, id));
  const photoGet = (id) => idb('readonly', (s) => s.get(id));
  const photoDel = (id) => idb('readwrite', (s) => s.delete(id));
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
  function compressImage(file, maxSide = 1800, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
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
    cards: [], photos: [], ocrText: '', ...fields,
  });
  const starterDecks = (courseId) => (STARTER_BY_COURSE[courseId] || []).map((d) => newDeck({
    name: d.name, emoji: d.emoji, subject: d.subject || '', course: courseId,
    cards: d.cards.map(([q, a]) => newCard(q, a)),
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

  // ---------- Compartir temas (archivo .json sin fotos) ----------
  async function shareDeck(deck) {
    const payload = {
      type: 'app-studio-tema', version: 1,
      tema: {
        name: deck.name, emoji: deck.emoji, course: deck.course, subject: deck.subject,
        publisher: deck.publisher, unit: deck.unit, cards: deck.cards.map((c) => ({ q: c.q, a: c.a })),
      },
    };
    const filename = `${deck.unit ? "" : "tema-"}${slug(deckTitle(deck))}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: deckTitle(deck) });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    downloadBlob(blob, filename);
  }
  function importDeckFile(file, onDone) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed && parsed.profiles) return toast('Eso es una copia completa: cárgala en Zona padres');
        const t = parsed && parsed.type === 'app-studio-tema' ? parsed.tema : null;
        if (!t || !t.name || !Array.isArray(t.cards)) throw new Error('formato');
        const deck = newDeck({
          name: String(t.name), emoji: String(t.emoji || subjectEmoji(t.subject)), course: String(t.course || ''),
          subject: String(t.subject || ''), publisher: String(t.publisher || ''), unit: String(t.unit || ''),
          cards: t.cards.filter((c) => c && c.q && c.a).map((c) => newCard(String(c.q), String(c.a))),
        });
        P().decks.push(deck);
        save();
        toast(`Tema importado (${deck.cards.length} tarjetas)`);
        onDone(deck);
      } catch (err) {
        toast('Ese archivo no es un tema válido');
      }
    };
    reader.readAsText(file);
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
      <a class="who" href="#/profiles" title="Cambiar de persona">👤 ${esc(p.name)}</a>`;
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
      <div class="muted small">${d.cards.length} tarjetas${d.photos?.length ? ` · 📷 ${d.photos.length}` : ''} · ${d.cards.length ? (due ? `${due} por repasar` : 'al día ✅') : 'sin tarjetas'}</div>
    </a>`;
  };

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
      resetFilters();
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
      b.onclick = () => { data.activeId = b.dataset.id; resetMathCfg(); resetFilters(); save(); go('#/'); };
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
        <label class="btn" style="margin:0">📥 Importar tema<input type="file" id="impDeck" accept="application/json,.json" hidden></label>
      </div>
      <p class="muted small" style="margin-top:8px">¿Alguien te ha pasado un tema? Usa "Importar tema" con el archivo <code>.json</code> que te hayan enviado.</p>
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
    $('#impDeck').onchange = (e) => {
      const f = e.target.files[0];
      if (f) importDeckFile(f, (deck) => go(`#/deck/${deck.id}`));
    };
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
    const canQuiz = deck.cards.length >= 2;
    app.innerHTML = `
      <a class="back" href="#/">← Inicio</a>
      <h1 style="margin-bottom:2px">${esc(deck.emoji || '📘')} ${esc(deckTitle(deck))}</h1>
      <p class="muted">${esc(deckMeta(deck))}${deckMeta(deck) ? '<br>' : ''}${deck.cards.length} tarjetas · ${due} por repasar hoy</p>
      ${deck.photos?.length ? `<a class="btn block" href="#/photos/${deck.id}" style="margin-bottom:12px">📖 Ver fotos del tema (${deck.photos.length})</a>` : ''}
      ${deck.cards.length === 0 ? `<div class="card">Este tema todavía no tiene tarjetas. Añádelas en "Editar este tema": a mano o a partir de las fotos.</div>` : `
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
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
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
        <a class="back" href="#/deck/${deck.id}">← ${esc(deckTitle(deck))}</a>
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
            return `<li><span class="qa">${esc(d.emoji || '📘')} ${esc(deckTitle(d))} <span class="muted small">· ${d.cards.length} tarjetas, ${mastered} dominadas</span></span>
              <a class="btn" href="#/edit/${d.id}">Editar</a></li>`;
          }).join('') || '<li class="muted">Aún no hay temas</li>'}
        </ul>
        <div class="row" style="margin-top:12px">
          <a class="btn primary" href="#/new">➕ Nuevo tema</a>
          <a class="btn" href="#/search">🔎 Buscar / importar</a>
        </div>
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
        <p class="muted small">Los datos de todos los perfiles se guardan solo en este navegador. Descarga una copia para pasarlos a otro dispositivo o por si se borra el navegador.<br><b>Las fotos no van en la copia</b> (ocuparía demasiado): se quedan en este dispositivo.</p>
        <div class="row">
          <button class="btn" id="exp">⬇️ Descargar copia</button>
          <label class="btn" style="margin:0">⬆️ Cargar copia<input type="file" id="imp" accept="application/json,.json" hidden></label>
        </div>
      </div>
    `;

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
    $('#delProfile').onclick = async () => {
      if (!confirm(`¿Borrar el perfil de ${p.name} con todos sus temas, fotos y progreso?`)) return;
      await deletePhotos(p.decks.flatMap((d) => d.photos || []));
      data.profiles = data.profiles.filter((x) => x.id !== p.id);
      data.activeId = data.profiles[0]?.id || null;
      save();
      go(data.activeId ? '#/profiles' : '#/welcome');
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
          if (raw && raw.type === 'app-studio-tema') return toast('Eso es un tema suelto: impórtalo desde "Buscar tema"');
          const parsed = migrate(raw);
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
        <h2 style="margin-top:0">📷 Fotos del tema</h2>
        <p class="muted small">Haz fotos de las páginas del libro o de los apuntes: con buena luz, la página recta y sin sombras. Puedes subir varias a la vez.</p>
        <div class="thumbs">
          ${deck.photos.map((pid, i) => `
            <div class="thumb">
              <img data-photo="${pid}" alt="Foto ${i + 1}">
              <button class="thumb-del" data-delphoto="${pid}" aria-label="Borrar foto ${i + 1}">✕</button>
            </div>`).join('')}
        </div>
        <label class="btn block" style="margin:10px 0 0">📷 Añadir fotos<input type="file" id="addPhotos" accept="image/*" multiple hidden></label>
        <div id="photoStatus" class="muted small" style="margin-top:6px"></div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">🔤 Texto de las fotos</h2>
        <p class="muted small">La app puede leer el texto de las fotos (necesita internet la primera vez). Revisa el texto: puede tener algún error si la foto no es buena.</p>
        <button class="btn block" id="ocr" ${deck.photos.length ? '' : 'disabled'}>🔤 Sacar texto de las fotos</button>
        <div id="ocrStatus" class="muted small" style="margin-top:6px"></div>
        <div id="ocrArea" ${deck.ocrText ? '' : 'hidden'}>
          <label for="ocrText">Texto (puedes corregirlo)</label>
          <textarea id="ocrText" style="min-height:200px">${esc(deck.ocrText)}</textarea>
          <button class="btn primary block" id="propose" style="margin-top:10px">✨ Proponer tarjetas con este texto</button>
        </div>
        <div id="proposals"></div>
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
        <button class="btn" id="share" ${deck.cards.length ? '' : 'disabled'}>📤 Compartir tema</button>
      </div>
      <p class="muted small">"Compartir tema" crea un archivo con las tarjetas (sin las fotos) para enviárselo a otra familia, por ejemplo por WhatsApp. Lo abren con "Buscar tema → Importar tema".</p>
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
      const files = Array.from(e.target.files || []);
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
        $('#ocrArea').hidden = !deck.ocrText;
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
        <button class="btn primary block" id="addProps" style="margin-top:10px">Añadir las tarjetas marcadas</button>`;
      $('#addProps').onclick = () => {
        let n = 0;
        $$('[data-pi]').forEach((cb) => {
          if (!cb.checked) return;
          const i = cb.dataset.pi;
          const q = $(`[data-pq="${i}"]`).value.trim(), a = $(`[data-pa="${i}"]`).value.trim();
          if (q && a) { deck.cards.push(newCard(q, a)); n++; }
        });
        if (!n) return toast('No hay ninguna tarjeta marcada');
        save();
        viewEdit(id);
        toast(`${n} tarjetas añadidas`);
      };
    };

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
    $('#share').onclick = () => shareDeck(deck);
    $('#delDeck').onclick = async () => {
      if (!confirm(`¿Borrar "${deckTitle(deck)}" con todas sus tarjetas y fotos?`)) return;
      await deletePhotos(deck.photos);
      P().decks = P().decks.filter((d) => d.id !== deck.id);
      save();
      go('#/');
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
      case 'photos': return viewPhotos(parts[1]);
      case 'study': return viewStudy(parts[1]);
      case 'quiz': return viewQuiz(parts[1], parts[2] === 'write' ? 'write' : 'choice');
      case 'math': return parts[1] === 'play' ? playMath() : viewMath();
      case 'search': return viewSearch();
      case 'new': return viewNew();
      case 'parents': return viewParents();
      case 'edit': return viewEdit(parts[1]);
      default: return viewHome();
    }
  }
  window.addEventListener('hashchange', route);
  if (P()) resetMathCfg();
  route();
})();
