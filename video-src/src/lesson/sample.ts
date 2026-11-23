import { staticFile } from 'remotion';
import type { LessonData } from './types';

// Lección de ejemplo para previsualizar el vídeo en Remotion Studio.
export const sampleLesson = (): LessonData => ({
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
