# 📚 App Studio

App sencilla para ayudar a estudiar, desde 1º de Primaria hasta Bachillerato. Es una página web normal: funciona en móvil, tablet y ordenador, sin instalar nada y sin conexión a servidores.

## Qué tiene

- **👤 Perfiles por persona y curso**: al entrar por primera vez pregunta el nombre y el curso. Se pueden añadir varias personas en el mismo dispositivo, cada una con sus temas y su progreso.
- **🃏 Tarjetas de repaso**: pregunta delante y respuesta detrás. Usa repaso espaciado (sistema Leitner con 5 niveles): las tarjetas que se fallan vuelven a salir ese mismo día y las que se saben se espacian 1, 3, 7 y 14 días.
- **📝 Test**: 10 preguntas de un tema, eligiendo la respuesta entre opciones o escribiéndola. Al acabar da una nota y la lista de fallos. Al comprobar las respuestas escritas no cuentan las mayúsculas ni las tildes.
- **➗ Cálculo mental adaptado al curso**:
  - 1º–2º Primaria: sumas y restas.
  - 3º–4º Primaria: además, tablas de multiplicar y divisiones exactas.
  - 5º–6º Primaria: además, porcentajes y fracción de un número.
  - ESO, Bachillerato y adultos: además, números enteros (con negativos), potencias y raíces cuadradas.
- **📚 Temas de ejemplo**: hay temas de ejemplo para 3º–6º de Primaria y para 1º ESO (Geografía, Biología, Historia, Lengua e Inglés). Son contenidos generales: el temario cambia según la comunidad autónoma y el libro, así que lo mejor es crear los temas a partir de los apuntes de cada uno.
- **⭐ Puntos y 🔥 racha** de días seguidos estudiando.
- **👨‍👩‍👦 Zona padres**:
  - Gráfica de actividad de los últimos 14 días y porcentaje de aciertos.
  - Crear y editar temas y tarjetas, una a una o muchas de golpe (formato `pregunta | respuesta`, o pegando dos columnas de Excel).
  - Copia de seguridad: descargar y cargar los datos en un archivo `.json`.

## Cómo usarla

Abre `index.html` en el navegador. No necesita instalar nada.

Para usarla desde el móvil o la tablet, lo más fácil es publicarla con **GitHub Pages**: en *Settings → Pages* del repositorio, elige la rama y la carpeta raíz (`/`).

## Dónde se guardan los datos

Todo se guarda **solo en el navegador del dispositivo** (`localStorage`). No se envía nada a ningún sitio. Por eso:

- Cada dispositivo tiene sus propios datos. Para pasarlos de uno a otro, usa *Zona padres → Copia de seguridad*.
- Si se borran los datos del navegador, se pierde el progreso. Conviene descargar una copia de vez en cuando.

## Archivos

- `index.html`: estructura de la página
- `styles.css`: estilos (incluye modo oscuro)
- `content.js`: lista de cursos, operaciones por nivel y temas de ejemplo (para añadir temas de otros cursos, se editan aquí)
- `app.js`: toda la lógica, sin librerías externas
