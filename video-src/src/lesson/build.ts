import type { LessonData, Scene } from './types';

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

export const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];
export const colorFor = (i: number) => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];

export const plain = (t: string) => String(t || '').replace(/\*\*/g, '').trim();

// Tiempo aproximado que tarda la voz en leer un texto (unas 2,4 palabras por segundo).
const speechSeconds = (t: string) => {
  const words = plain(t).split(/\s+/).filter(Boolean).length;
  return words / 2.4;
};

const secs = (t: string, extra: number, min: number) => Math.round(Math.max(min, speechSeconds(t) + extra) * FPS);

export function buildScenes(lesson: LessonData): { scenes: Scene[]; total: number } {
  const scenes: Scene[] = [];
  const add = (s: Scene) => scenes.push(s);

  add({
    kind: 'intro',
    section: 0,
    narration: `${plain(lesson.title)}. ${plain(lesson.intro)}`,
    duration: secs(`${lesson.title}. ${lesson.intro}`, 1.6, 4.5),
    data: { title: lesson.title, emoji: lesson.emoji, subject: lesson.subject, intro: lesson.intro },
  });

  lesson.sections.forEach((sec, i) => {
    add({
      kind: 'sectionTitle',
      section: i,
      narration: `Parte ${i + 1}: ${plain(sec.title)}.`,
      duration: secs(sec.title, 1.4, 2.8),
      data: { n: i + 1, of: lesson.sections.length, title: sec.title },
    });
    sec.sentences.forEach((s, k) => {
      add({
        kind: 'sentence',
        section: i,
        narration: plain(s),
        duration: secs(s, 1.2, 3.2),
        data: { text: s, title: sec.title, k, of: sec.sentences.length },
      });
    });
    if (sec.figure) {
      add({
        kind: 'figure',
        section: i,
        narration: plain(sec.figure.caption) || 'Fíjate en esta imagen del libro.',
        duration: secs(sec.figure.caption || 'Fíjate en esta imagen del libro.', 2.2, 5),
        data: sec.figure,
      });
    }
    if (sec.example) {
      add({
        kind: 'example',
        section: i,
        narration: `Para entenderlo: ${plain(sec.example)}`,
        duration: secs(`Para entenderlo: ${sec.example}`, 1.4, 4),
        data: { text: sec.example },
      });
    }
    if (sec.funFact) {
      add({
        kind: 'funFact',
        section: i,
        narration: `¿Sabías que ${plain(sec.funFact).replace(/^¿?sab[ií]as que\s*/i, '')}`,
        duration: secs(`¿Sabías que? ${sec.funFact}`, 1.4, 4),
        data: { text: sec.funFact },
      });
    }
  });

  const tl = lesson.timeline.slice(0, 5);
  if (tl.length) {
    const narr = `La línea del tiempo. ${tl.map((t) => `${t.date}: ${plain(t.event)}.`).join(' ')}`;
    add({ kind: 'timeline', section: 2, narration: narr, duration: secs(narr, 1.6, 3 + tl.length * 1.5), data: { items: tl } });
  }

  const cc = lesson.causes.slice(0, 3);
  if (cc.length) {
    const narr = `Causas y consecuencias. ${cc.map((c) => `${plain(c.cause)}, y por eso, ${plain(c.effect)}.`).join(' ')}`;
    add({ kind: 'causes', section: 4, narration: narr, duration: secs(narr, 1.6, 3 + cc.length * 2), data: { items: cc } });
  }

  lesson.glossary.slice(0, 5).forEach((g, i) => {
    const narr = `${plain(g.term)}: ${plain(g.def)}`;
    add({ kind: 'glossary', section: i + 1, narration: narr, duration: secs(narr, 1.2, 3.2), data: { ...g, k: i } });
  });

  lesson.quiz.slice(0, 3).forEach((q, i) => {
    const ask = `Pregunta ${i + 1}. ${plain(q.q)} ${q.options.map((o, k) => `${String.fromCharCode(65 + k)}: ${plain(o)}.`).join(' ')}`;
    add({ kind: 'quizAsk', section: i + 3, narration: ask, duration: secs(ask, 3.8, 6), data: { ...q, n: i + 1 } });
    const rev = `¡La correcta es la ${String.fromCharCode(65 + q.correct)}! ${plain(q.options[q.correct])}.`;
    add({ kind: 'quizReveal', section: i + 3, narration: rev, duration: secs(rev, 1.6, 3.2), data: { ...q, n: i + 1 } });
  });

  add({
    kind: 'outro',
    section: 0,
    narration: '¡Genial! Ya conoces todo el tema. Ahora, a por el esquema en blanco.',
    duration: secs('¡Genial! Ya conoces todo el tema. Ahora, a por el esquema en blanco.', 2, 5),
    data: { title: lesson.title, emoji: lesson.emoji },
  });

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
