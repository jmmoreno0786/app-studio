/* Service worker de App Studio: permite instalar la app y usarla sin conexión.
 * - Archivos de la app: primero la red (para recibir las actualizaciones) y, sin conexión, la copia guardada.
 * - Librerías de cdn.jsdelivr.net (lector de PDF y de texto): se guardan la primera vez y luego se usan sin red.
 * - Nada más (API de Claude, YouTube…) pasa por aquí. */
const APP_CACHE = 'app-studio-app-v2';
const LIB_CACHE = 'app-studio-libs-v1';
const APP_FILES = ['./', './index.html', './styles.css', './content.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './lesson-video.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== LIB_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  // Las URLs de jsdelivr llevan versión fija: si ya está guardada, no cambia.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.open(LIB_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) c.put(req, res.clone());
        return res;
      }))),
    );
  }
});
