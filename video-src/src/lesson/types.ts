// Datos de una lección, tal como los prepara la app a partir de la explicación de Claude.
export type Figure = { src: string; caption: string };

export type Section = {
  title: string;
  // Frases clave (pueden llevar **negrita** para resaltar conceptos).
  sentences: string[];
  example: string;
  funFact: string;
  figure: Figure | null;
};

// Escena del guion de vídeo que escribe Claude: texto corto en pantalla, narración e imagen.
export type Beat = {
  section: number; // índice del apartado (desde 0)
  text: string; // texto en pantalla (corto, con **negrita**)
  narration: string; // lo que dice la voz
  emoji: string;
  image: { src: string; credit: string } | null;
};

export type QuizQuestion = { q: string; options: string[]; correct: number };

export type LessonData = {
  title: string;
  emoji: string;
  subject: string;
  intro: string;
  sections: Section[];
  // Si hay guion de Claude, el cuerpo del vídeo se hace con estas escenas en vez de con los apartados.
  beats?: Beat[];
  timeline: { date: string; event: string }[];
  causes: { cause: string; effect: string }[];
  glossary: { term: string; def: string }[];
  quiz: QuizQuestion[];
};

export type SceneKind =
  | 'intro'
  | 'sectionTitle'
  | 'sentence'
  | 'beat'
  | 'figure'
  | 'example'
  | 'funFact'
  | 'timeline'
  | 'causes'
  | 'glossary'
  | 'quizAsk'
  | 'quizReveal'
  | 'outro';

export type Scene = {
  kind: SceneKind;
  // Duración en fotogramas.
  duration: number;
  // Texto que lee la voz de la tablet al empezar la escena.
  narration: string;
  // Índice del apartado (para el color).
  section: number;
  // Datos concretos de la escena.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};
