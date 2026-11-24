import { staticFile } from 'remotion';
import type { LessonData } from './types';

// Lección de ejemplo para previsualizar el vídeo en Remotion Studio.
const CELL = '<svg viewBox="0 0 400 300"><ellipse cx="200" cy="150" rx="170" ry="120" fill="#d1fae5" stroke="#2b2b40" stroke-width="5"/><circle cx="210" cy="140" r="48" fill="#c4b5fd" stroke="#2b2b40" stroke-width="5"/><circle cx="220" cy="130" r="14" fill="#7c3aed" stroke="#2b2b40" stroke-width="3"/><ellipse cx="105" cy="105" rx="34" ry="18" fill="#fdba74" stroke="#2b2b40" stroke-width="4" transform="rotate(-20 105 105)"/><path d="M80,108 q8,-12 16,0 q8,12 16,0 q8,-12 16,0" fill="none" stroke="#2b2b40" stroke-width="3"/><circle cx="300" cy="210" r="6" fill="#2b2b40"/><circle cx="130" cy="215" r="6" fill="#2b2b40"/><circle cx="320" cy="100" r="6" fill="#2b2b40"/><text x="210" y="225" font-size="28" text-anchor="middle" fill="#2b2b40" stroke="none">núcleo</text></svg>';
const BACTERIA = '<svg viewBox="0 0 400 300"><rect x="90" y="100" width="220" height="100" rx="50" fill="#bbf7d0" stroke="#2b2b40" stroke-width="5"/><path d="M310,150 c25,-20 40,20 65,0 c15,-12 20,-10 22,-8" fill="none" stroke="#2b2b40" stroke-width="5"/><path d="M140,150 c20,-30 40,30 60,0 c20,-30 40,30 60,0" fill="none" stroke="#16a34a" stroke-width="5"/><circle cx="130" cy="125" r="5" fill="#2b2b40"/><circle cx="270" cy="175" r="5" fill="#2b2b40"/><text x="200" y="250" font-size="30" text-anchor="middle" fill="#2b2b40" stroke="none">sin núcleo</text></svg>';
const TISSUE = '<svg viewBox="0 0 400 300"><circle cx="110" cy="100" r="55" fill="#fde68a" stroke="#2b2b40" stroke-width="4"/><circle cx="220" cy="100" r="55" fill="#fde68a" stroke="#2b2b40" stroke-width="4"/><circle cx="330" cy="100" r="55" fill="#fde68a" stroke="#2b2b40" stroke-width="4"/><circle cx="165" cy="200" r="55" fill="#fde68a" stroke="#2b2b40" stroke-width="4"/><circle cx="275" cy="200" r="55" fill="#fde68a" stroke="#2b2b40" stroke-width="4"/><circle cx="110" cy="100" r="14" fill="#a78bfa" stroke="#2b2b40" stroke-width="3"/><circle cx="220" cy="100" r="14" fill="#a78bfa" stroke="#2b2b40" stroke-width="3"/><circle cx="330" cy="100" r="14" fill="#a78bfa" stroke="#2b2b40" stroke-width="3"/><circle cx="165" cy="200" r="14" fill="#a78bfa" stroke="#2b2b40" stroke-width="3"/><circle cx="275" cy="200" r="14" fill="#a78bfa" stroke="#2b2b40" stroke-width="3"/></svg>';
const PLANT = '<svg viewBox="0 0 400 300"><rect x="70" y="40" width="260" height="220" rx="18" fill="#dcfce7" stroke="#2b2b40" stroke-width="6"/><rect x="84" y="54" width="232" height="192" rx="12" fill="none" stroke="#16a34a" stroke-width="3"/><circle cx="200" cy="150" r="40" fill="#c4b5fd" stroke="#2b2b40" stroke-width="4"/><ellipse cx="120" cy="95" rx="22" ry="12" fill="#22c55e" stroke="#2b2b40" stroke-width="3"/><ellipse cx="280" cy="100" rx="22" ry="12" fill="#22c55e" stroke="#2b2b40" stroke-width="3"/><ellipse cx="130" cy="215" rx="22" ry="12" fill="#22c55e" stroke="#2b2b40" stroke-width="3"/><ellipse cx="275" cy="210" rx="22" ry="12" fill="#22c55e" stroke="#2b2b40" stroke-width="3"/></svg>';

export const sampleLesson = (): LessonData => ({
  fontUrl: staticFile('fonts/PatrickHand.woff2'),
  title: 'La célula',
  emoji: '🔬',
  subject: 'Biología y Geología · 1º ESO',
  intro: 'Todos los seres vivos, desde una bacteria hasta tú, estamos hechos de **células**. Vamos a descubrir cómo son por dentro y qué hacen.',
  sections: [
    {
      title: 'La unidad de la vida',
      sentences: [
        'La **célula** es la unidad básica de los seres vivos.',
        'Es la estructura más pequeña capaz de realizar las **funciones vitales**: nutrición, relación y reproducción.',
      ],
      example: 'Es como un ladrillo: con muchos ladrillos se construye una casa, y con muchas células, un ser vivo.',
      funFact: 'Tu cuerpo tiene unos **37 billones** de células.',
      figure: { src: staticFile('celula-rotulos.jpg'), caption: 'Fíjate en el **núcleo** (morado) y en la **mitocondria** (naranja).' },
    },
    {
      title: 'Tipos de células',
      sentences: [
        'Las células **procariotas** no tienen núcleo definido. Por ejemplo, las bacterias.',
        'Las células **eucariotas** tienen núcleo, como las de animales y plantas.',
      ],
      example: 'La procariota es como un estudio de una sola habitación; la eucariota, como un piso con habitaciones separadas.',
      funFact: '',
      figure: null,
    },
  ],
  beats: [
    { section: 0, text: 'Todos los seres vivos están hechos de **células**', narration: 'Todos los seres vivos, desde una pequeña bacteria hasta un elefante, estamos hechos de células.', emoji: '🐘🦠', image: null, doodle: TISSUE },
    { section: 0, text: 'La célula es la **unidad básica** de la vida', narration: 'La célula es la unidad básica de la vida: la parte más pequeña que puede nutrirse, relacionarse y reproducirse.', emoji: '🔬', image: { src: staticFile('celula-rotulos.jpg'), credit: 'Imagen: libro de texto' } },
    { section: 1, text: '**Procariotas**: sin núcleo definido', narration: 'Las células procariotas no tienen un núcleo definido. Las bacterias son así.', emoji: '🦠', image: null, doodle: BACTERIA },
    { section: 1, text: '**Eucariotas**: con núcleo', narration: 'Las eucariotas sí tienen núcleo, como las células de animales y plantas.', emoji: '🌱🐶', image: null, doodle: PLANT },
    { section: 1, text: 'Por dentro tienen **orgánulos**', narration: 'Dentro de la célula hay orgánulos, como el núcleo o las mitocondrias, y cada uno tiene su trabajo.', emoji: '🔬', image: null, doodle: CELL },
  ],
  timeline: [
    { date: '1665', event: 'Robert Hooke ve por primera vez las "celdillas" del corcho' },
    { date: '1839', event: 'Schleiden y Schwann: todos los seres vivos están formados por células' },
  ],
  causes: [],
  glossary: [
    { term: 'Orgánulo', def: 'Cada una de las partes de la célula que realiza una función.' },
    { term: 'Mitocondria', def: 'Orgánulo donde se produce la energía de la célula.' },
  ],
  quiz: [
    { q: '¿Qué tipo de célula NO tiene núcleo definido?', options: ['Eucariota', 'Procariota', 'Vegetal'], correct: 1 },
  ],
});
