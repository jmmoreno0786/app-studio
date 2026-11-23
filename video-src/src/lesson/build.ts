import type { LessonData, Scene } from './types';

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
// Fotogramas del fundido de salida de cada escena (la app pausa antes, para que el texto se siga viendo).
export const FADE_OUT = 6;

export const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];
export const colorFor = (i: number) => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];

export const plain = (t: string) => String(t || '').replace(/\*\*/g, '').trim();

// Tiempo aproximado que tarda la voz en leer un texto (unas 2,4 palabras por segundo).
const speechSeconds = (t: string) => plain(t).split(/\s+/).filter(Boolean).length / 2.4;
const secs = (t: string, extra: number, min: number) => Math.round(Math.max(min, speechSeconds(t) + extra) * FPS);

// Divide un texto largo en trozos que quepan en pantalla, sin cortar frases si se puede.
// Así lo que se lee y lo que se ve es exactamente lo mismo.
export function chunkText(text: string, max = 170): string[] {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  if (plain(t).length <= max) return [t];
  const sentences = t.split(/(?<=[.!?…])\s+(?=[¿¡]?\S)/u);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (plain(s).length > max) {
      // Frase muy larga: se parte por comas o punto y coma.
      if (cur) { out.push(cur); cur = ''; }
      let part = '';
      for (const piece of s.split(/(?<=[,;:])\s+/)) {
        if (part && plain(`${part} ${piece}`).length > max) { out.push(part); part = piece; } else part = part ? `${part} ${piece}` : piece;
      }
      if (part) out.push(part);
      continue;
    }
    if (cur && plain(`${cur} ${s}`).length > max) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  // Cierra la negrita si un trozo la deja abierta.
  return out.map((c) => ((c.match(/\*\*/g) || []).length % 2 ? `${c}**` : c));
}

export function buildScenes(lesson: LessonData): { scenes: Scene[]; total: number } {
  const scenes: Scene[] = [];
  const add = (s: Scene) => scenes.push(s);

  // Introducción: el título y, si la introducción es larga, sus trozos como escenas siguientes.
  const introChunks = chunkText(lesson.intro, 190);
  add({
    kind: 'intro',
    section: 0,
    narration: `${plain(lesson.title)}. ${plain(introChunks[0] || '')}`,
    duration: secs(`${lesson.title}. ${introChunks[0] || ''}`, 1.6, 4.5),
    data: { title: lesson.title, emoji: lesson.emoji, subject: lesson.subject, intro: introChunks[0] || '' },
  });
  introChunks.slice(1).forEach((c, k) => {
    add({ kind: 'sentence', section: 0, narration: plain(c), duration: secs(c, 1.2, 3.2), data: { text: c, title: lesson.title, k: k + 1, of: introChunks.length } });
  });

  if (lesson.beats && lesson.beats.length) {
    // Cuerpo con el guion de Claude.
    let last = -1;
    lesson.beats.forEach((b) => {
      const sec = lesson.sections[b.section];
      if (b.section !== last && sec) {
        last = b.section;
        add({
          kind: 'sectionTitle',
          section: b.section,
          narration: `Parte ${b.section + 1}: ${plain(sec.title)}.`,
          duration: secs(sec.title, 1.4, 2.8),
          data: { n: b.section + 1, of: lesson.sections.length, title: sec.title },
        });
      }
      add({
        kind: 'beat',
        section: b.section,
        narration: plain(b.narration || b.text),
        duration: secs(b.narration || b.text, 1.4, 3.6),
        data: { ...b, sectionTitle: sec ? sec.title : '' },
      });
    });
  } else {
    // Cuerpo a partir de los apartados de la explicación.
    lesson.sections.forEach((sec, i) => {
      add({
        kind: 'sectionTitle',
        section: i,
        narration: `Parte ${i + 1}: ${plain(sec.title)}.`,
        duration: secs(sec.title, 1.4, 2.8),
        data: { n: i + 1, of: lesson.sections.length, title: sec.title },
      });
      const chunks = sec.sentences.flatMap((s) => chunkText(s, 170));
      chunks.forEach((s, k) => {
        add({ kind: 'sentence', section: i, narration: plain(s), duration: secs(s, 1.2, 3.2), data: { text: s, title: sec.title, k, of: chunks.length, figure: sec.figure } });
      });
      if (sec.figure) {
        const cap = chunkText(sec.figure.caption || 'Fíjate en esta imagen del libro.', 160)[0];
        add({ kind: 'figure', section: i, narration: plain(cap), duration: secs(cap, 2.2, 5), data: { src: sec.figure.src, caption: cap } });
      }
      chunkText(sec.example, 200).forEach((c, k) => {
        const narr = k === 0 ? `Para entenderlo: ${plain(c)}` : plain(c);
        add({ kind: 'example', section: i, narration: narr, duration: secs(narr, 1.4, 4), data: { text: c } });
      });
      chunkText(sec.funFact, 200).forEach((c, k) => {
        const narr = k === 0 ? `¿Sabías que ${plain(c).replace(/^¿?sab[ií]as que\s*/i, '')}` : plain(c);
        add({ kind: 'funFact', section: i, narration: narr, duration: secs(narr, 1.4, 4), data: { text: c } });
      });
    });
  }

  // Línea del tiempo: de 4 en 4 fechas por escena, para que todo lo que se lee se vea.
  for (let k = 0; k < lesson.timeline.length; k += 4) {
    const items = lesson.timeline.slice(k, k + 4);
    const narr = `${k === 0 ? 'La línea del tiempo. ' : ''}${items.map((t) => `${t.date}: ${plain(t.event)}.`).join(' ')}`;
    add({ kind: 'timeline', section: 2, narration: narr, duration: secs(narr, 1.6, 3 + items.length * 1.5), data: { items } });
  }

  for (let k = 0; k < lesson.causes.length; k += 3) {
    const items = lesson.causes.slice(k, k + 3);
    const narr = `${k === 0 ? 'Causas y consecuencias. ' : ''}${items.map((c) => `${plain(c.cause)}, y por eso, ${plain(c.effect)}.`).join(' ')}`;
    add({ kind: 'causes', section: 4, narration: narr, duration: secs(narr, 1.6, 3 + items.length * 2), data: { items } });
  }

  lesson.glossary.slice(0, 6).forEach((g, i) => {
    const narr = `${plain(g.term)}: ${plain(g.def)}`;
    add({ kind: 'glossary', section: i + 1, narration: narr, duration: secs(narr, 1.2, 3.2), data: { ...g, k: i } });
  });

  lesson.quiz.slice(0, 3).forEach((q, i) => {
    const ask = `Pregunta ${i + 1}. ${plain(q.q)} ${q.options.map((o, k) => `${String.fromCharCode(65 + k)}: ${plain(o)}.`).join(' ')}`;
    add({ kind: 'quizAsk', section: i + 3, narration: ask, duration: secs(ask, 3.8, 6), data: { ...q, n: i + 1 } });
    const rev = `¡La correcta es la ${String.fromCharCode(65 + q.correct)}! ${plain(q.options[q.correct])}.`;
    add({ kind: 'quizReveal', section: i + 3, narration: rev, duration: secs(rev, 1.6, 3.2), data: { ...q, n: i + 1 } });
  });

  const bye = '¡Genial! Ya conoces todo el tema. Ahora, a por el esquema en blanco.';
  add({ kind: 'outro', section: 0, narration: bye, duration: secs(bye, 2, 5), data: { title: lesson.title, emoji: lesson.emoji } });

  const total = scenes.reduce((n, s) => n + s.duration, 0);
  return { scenes, total };
}

// Fotograma en el que empieza cada escena.
export const sceneStarts = (scenes: Scene[]) => {
  const out: number[] = [];
  let acc = 0;
  for (const s of scenes) {
    out.push(acc);
    acc += s.duration;
  }
  return out;
};
