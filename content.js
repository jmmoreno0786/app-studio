/* Cursos, operaciones de cálculo mental por nivel, asignaturas y sugerencias de editoriales. */
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

  // Asignaturas (con su emoji por defecto).
  const SUBJECTS = [
    ['Matemáticas', '📐'],
    ['Lengua Castellana y Literatura', '✍️'],
    ['Inglés', '🇬🇧'],
    ['Francés', '🇫🇷'],
    ['Ciencias de la Naturaleza', '🌱'],
    ['Ciencias Sociales', '🌍'],
    ['Biología y Geología', '🔬'],
    ['Geografía e Historia', '🗺️'],
    ['Física y Química', '⚗️'],
    ['Tecnología', '⚙️'],
    ['Música', '🎵'],
    ['Educación Plástica y Visual', '🎨'],
    ['Educación Física', '⚽'],
    ['Lengua cooficial', '🗣️'],
    ['Latín', '🏛️'],
    ['Filosofía', '💭'],
    ['Economía', '💶'],
    ['Religión / Valores', '🕊️'],
    ['Otra', '📘'],
  ];

  // Sugerencias para el campo "Editorial" (se puede escribir cualquier otra).
  const PUBLISHERS = [
    'Anaya', 'SM', 'Santillana', 'Edelvives', 'Vicens Vives', 'Oxford', 'McGraw Hill', 'Editex',
    'Bruño', 'Edebé', 'Casals', 'Teide', 'Algaida', 'Everest', 'Pearson', 'Burlington Books',
    'Cambridge', 'Macmillan',
  ];

  return { COURSES, MATH_BY_LEVEL, SUBJECTS, PUBLISHERS };
})();
