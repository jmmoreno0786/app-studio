/* Cursos y temas de ejemplo.
 * El temario real depende de la comunidad autónoma y del libro de texto:
 * estos temas son solo un punto de partida, lo mejor es crear tarjetas con los apuntes del alumno. */
window.APP_CONTENT = (() => {
  const COURSES = [
    { id: '1p', label: '1º Primaria', level: 'p12' },
    { id: '2p', label: '2º Primaria', level: 'p12' },
    { id: '3p', label: '3º Primaria', level: 'p34' },
    { id: '4p', label: '4º Primaria', level: 'p34' },
    { id: '5p', label: '5º Primaria', level: 'p56' },
    { id: '6p', label: '6º Primaria', level: 'p56' },
    { id: '1eso', label: '1º ESO', level: 'eso' },
    { id: '2eso', label: '2º ESO', level: 'eso' },
    { id: '3eso', label: '3º ESO', level: 'eso' },
    { id: '4eso', label: '4º ESO', level: 'eso' },
    { id: '1bach', label: '1º Bachillerato', level: 'bach' },
    { id: '2bach', label: '2º Bachillerato', level: 'bach' },
    { id: 'otro', label: 'Otro / adulto', level: 'bach' },
  ];

  // Operaciones de cálculo mental disponibles por nivel.
  const MATH_BY_LEVEL = {
    p12: { ops: ['add', 'sub'], maxOptions: [10, 20, 100], defaults: { op: 'add', max: 20 } },
    p34: { ops: ['add', 'sub', 'mul', 'div'], maxOptions: [20, 100, 1000], defaults: { op: 'mul', max: 100 } },
    p56: { ops: ['add', 'sub', 'mul', 'div', 'pct', 'frac'], maxOptions: [100, 1000], defaults: { op: 'mul', max: 1000 } },
    eso: { ops: ['add', 'sub', 'mul', 'div', 'int', 'pow', 'sqrt', 'pct', 'frac'], maxOptions: [100, 1000], defaults: { op: 'int', max: 100 } },
    bach: { ops: ['add', 'sub', 'mul', 'div', 'int', 'pow', 'sqrt', 'pct', 'frac'], maxOptions: [100, 1000], defaults: { op: 'int', max: 1000 } },
  };

  const PRIMARIA = [
    {
      name: 'Capitales de Europa', emoji: '🌍',
      cards: [
        ['Capital de Francia', 'París'],
        ['Capital de Italia', 'Roma'],
        ['Capital de Portugal', 'Lisboa'],
        ['Capital de Alemania', 'Berlín'],
        ['Capital de Reino Unido', 'Londres'],
        ['Capital de Grecia', 'Atenas'],
      ],
    },
    {
      name: 'Inglés: animales', emoji: '🇬🇧',
      cards: [
        ['Perro', 'Dog'],
        ['Gato', 'Cat'],
        ['Caballo', 'Horse'],
        ['Pájaro', 'Bird'],
        ['Pez', 'Fish'],
        ['Vaca', 'Cow'],
      ],
    },
  ];

  const ESO1 = [
    {
      name: 'Geografía: el planeta y España', emoji: '🗺️',
      cards: [
        ['Océano más grande del planeta', 'Pacífico'],
        ['Océano que separa Europa de América', 'Atlántico'],
        ['Línea imaginaria que divide la Tierra en hemisferio norte y sur', 'Ecuador'],
        ['Meridiano que se toma como referencia (meridiano 0)', 'Greenwich'],
        ['Montaña más alta del mundo', 'Everest'],
        ['Pico más alto de España', 'Teide'],
        ['Pico más alto de la península ibérica', 'Mulhacén'],
        ['Río más largo de la península ibérica', 'Tajo'],
        ['Río que pasa por Sevilla', 'Guadalquivir'],
        ['Río que pasa por Zaragoza', 'Ebro'],
      ],
    },
    {
      name: 'Biología: los seres vivos', emoji: '🔬',
      cards: [
        ['Unidad básica de todos los seres vivos', 'La célula'],
        ['Las tres funciones vitales', 'Nutrición, relación y reproducción'],
        ['Célula sin núcleo definido', 'Procariota'],
        ['Célula con núcleo definido', 'Eucariota'],
        ['Orgánulo donde se realiza la fotosíntesis', 'Cloroplasto'],
        ['Orgánulo donde se realiza la respiración celular', 'Mitocondria'],
        ['Ser vivo que fabrica su propio alimento', 'Autótrofo'],
        ['Ser vivo que se alimenta de otros seres vivos', 'Heterótrofo'],
        ['Animales con columna vertebral', 'Vertebrados'],
        ['Los cinco grupos de vertebrados', 'Peces, anfibios, reptiles, aves y mamíferos'],
      ],
    },
    {
      name: 'Historia: Prehistoria y primeras civilizaciones', emoji: '🏺',
      cards: [
        ['Etapas de la Prehistoria', 'Paleolítico, Neolítico y Edad de los Metales'],
        ['Invento que marca el final de la Prehistoria', 'La escritura'],
        ['Etapa en la que aparecen la agricultura y la ganadería', 'Neolítico'],
        ['Forma de vida de los grupos humanos del Paleolítico (se desplazaban)', 'Nómada'],
        ['Cueva de Cantabria famosa por sus pinturas del Paleolítico', 'Altamira'],
        ['Monumento megalítico formado por una gran piedra clavada en vertical', 'Menhir'],
        ['Aleación de cobre y estaño', 'Bronce'],
        ['Ríos entre los que surgió Mesopotamia', 'Tigris y Éufrates'],
        ['Tipo de escritura de Mesopotamia', 'Cuneiforme'],
        ['Río junto al que se desarrolló la civilización egipcia', 'Nilo'],
      ],
    },
    {
      name: 'Lengua: gramática y tildes', emoji: '✍️',
      cards: [
        ['Palabra que nombra personas, animales, objetos o ideas', 'Sustantivo'],
        ['Palabra que acompaña al sustantivo y expresa cualidades', 'Adjetivo'],
        ['Palabra que expresa acciones, estados o procesos', 'Verbo'],
        ['Palabra que sustituye al sustantivo', 'Pronombre'],
        ['Palabra que modifica al verbo e indica lugar, tiempo, modo…', 'Adverbio'],
        ['Las palabras agudas llevan tilde cuando acaban en…', 'Vocal, n o s'],
        ['Las palabras llanas llevan tilde cuando NO acaban en…', 'Vocal, n o s'],
        ['¿Cuándo llevan tilde las palabras esdrújulas?', 'Siempre'],
        ['Palabra cuya sílaba tónica es la última', 'Aguda'],
        ['Palabra cuya sílaba tónica es la penúltima', 'Llana'],
      ],
    },
    {
      name: 'Inglés: verbos irregulares', emoji: '🇬🇧',
      cards: [
        ['be (pasado – participio)', 'was/were – been'],
        ['go (pasado – participio)', 'went – gone'],
        ['have (pasado – participio)', 'had – had'],
        ['do (pasado – participio)', 'did – done'],
        ['see (pasado – participio)', 'saw – seen'],
        ['eat (pasado – participio)', 'ate – eaten'],
        ['write (pasado – participio)', 'wrote – written'],
        ['buy (pasado – participio)', 'bought – bought'],
        ['take (pasado – participio)', 'took – taken'],
        ['come (pasado – participio)', 'came – come'],
        ['make (pasado – participio)', 'made – made'],
        ['know (pasado – participio)', 'knew – known'],
      ],
    },
  ];

  // Temas de ejemplo por curso. Los cursos sin entrada no traen temas de ejemplo.
  const STARTER_BY_COURSE = {
    '3p': PRIMARIA, '4p': PRIMARIA, '5p': PRIMARIA, '6p': PRIMARIA,
    '1eso': ESO1,
  };

  return { COURSES, MATH_BY_LEVEL, STARTER_BY_COURSE };
})();
