# 📚 App Studio

App sencilla para ayudar a estudiar. Es una página web normal: funciona en móvil, tablet y ordenador, sin instalar nada y sin conexión a servidores.

## Qué tiene

Versión pensada para **un solo alumno** en su propio dispositivo.

- **👤 Bienvenida**: la primera vez pregunta el nombre y el curso, y adapta el cálculo mental al curso.
- **📚 Mis libros (PDF)**: se sube el libro digital en PDF una vez. Si el PDF tiene índice (marcadores), la app muestra los temas con sus páginas y cada uno se crea con un botón; si no, se eligen las páginas a mano, con vista previa de la primera y la última. Cada tema guarda las páginas como imágenes y su texto, sin necesidad de OCR. Los libros con contraseña la piden al abrirse. Se usa [pdf.js](https://github.com/mozilla/pdf.js), que se descarga la primera vez.
- **📷 Fotos y capturas**: para libros que solo se ven en la web o app de la editorial se suben capturas de pantalla (varias a la vez, ordenadas por la hora en que se hicieron). Se pueden reordenar y **recortar** (barra de estado, botones del visor, márgenes), con el mismo recorte para todas.
- **🔎 Buscador de temas** por curso, asignatura, editorial, número de tema o cualquier palabra del contenido.
- **🔤 Texto del tema**: viene del PDF, se lee de las fotos (OCR con [Tesseract.js](https://github.com/naptha/tesseract.js), en el navegador) o se pega a mano.
- **🤖 Preparar el tema con IA (Claude)**: esquema, resumen y preguntas.
  - **Con la app de Claude (copiar y pegar)**: se envían las fotos y unas instrucciones a la app de Claude y se pega la respuesta. Sin coste extra para quien ya tiene un plan de Claude.
  - **Automática con la API de Claude**: se guarda una clave de la API (console.anthropic.com, de pago por uso; los planes Free y Pro no incluyen créditos de API) en *Zona padres → Inteligencia artificial*. La clave se guarda solo en el dispositivo y la app llama directamente a `api.anthropic.com`. Conviene poner un límite de gasto en la consola.
- **✨ Borrador sin IA**: esquema, resumen y tarjetas propuestas a partir del texto mediante reglas (definiciones, apartados y frases clave). Siempre hay que revisarlo.
- **📖 Aprender antes de preguntar**: esquema, resumen con conceptos resaltados que se puede **escuchar en voz alta**, fotos del tema y **vídeos de YouTube**.
- **🃏 Tarjetas de repaso** con repaso espaciado (sistema Leitner, 5 niveles: 0, 1, 3, 7 y 14 días).
- **📝 Test** de hasta 10 preguntas, eligiendo o escribiendo la respuesta (sin tener en cuenta mayúsculas ni tildes), con nota final.
- **➗ Cálculo mental adaptado al curso**: sumas y restas; tablas y divisiones; porcentajes y fracción de un número; y, en ESO y Bachillerato, números enteros, potencias y raíces.
- **⭐ Puntos y 🔥 racha** de días seguidos estudiando.
- **👨‍👩‍👦 Zona padres**: gráfica de actividad de 14 días, temas, ajustes, IA y copia de seguridad.

## Cómo usarla

Abre `index.html` en el navegador. No necesita instalar nada.

Para usarla desde el móvil o la tablet, lo más fácil es publicarla con **GitHub Pages**: en *Settings → Pages* del repositorio, elige la rama y la carpeta raíz (`/`).

## Dónde se guardan los datos

Todo se guarda **solo en el navegador del dispositivo**: temas y progreso en `localStorage`, y fotos y libros en IndexedDB. No se envía nada a ningún sitio, salvo cuando se usa la IA: entonces las fotos o el texto del tema se envían a Claude (Anthropic). Otra conexión externa es la descarga del lector de texto (unos MB desde cdn.jsdelivr.net) la primera vez que se usa "Sacar texto de las fotos". Las fotos se leen en el propio dispositivo y no se suben a ningún sitio. Por eso:

- Para pasar los temas y el progreso a otro dispositivo, usa *Zona padres → Copia de seguridad*.
- Si se borran los datos del navegador, se pierde el progreso. Conviene descargar una copia de vez en cuando.
- Las fotos y los libros en PDF **no** se incluyen en la copia de seguridad, porque ocupan mucho. Se quedan solo en el dispositivo: la app no comparte el contenido de los libros con nadie.

## Archivos

- `index.html`: estructura de la página
- `styles.css`: estilos (incluye modo oscuro)
- `content.js`: cursos, operaciones de cálculo mental por nivel, asignaturas y sugerencias de editoriales
- `app.js`: toda la lógica, sin librerías externas
