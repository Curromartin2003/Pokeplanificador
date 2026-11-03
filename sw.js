// Service worker: la app abre sin conexión. Lo propio, primero red (para tener siempre la última versión) y si no hay
// conexión, caché. Las librerías de Firebase (gstatic) no cambian de versión: primero caché.
// Los datos no pasan por aquí: los guarda y sincroniza Firestore con su propia caché.
const CACHE = "pokeplanificador-v13";
const CORE = ["./", "index.html", "css/app.css", "js/app.js", "js/engine.js", "js/store.js", "js/temario.js", "js/docs_esp.js",
  "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.host === "www.gstatic.com" || url.host === "fonts.gstatic.com" || url.host === "fonts.googleapis.com") {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => guarda(req, res))));
  } else if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => guarda(req, res)).catch(() => caches.match(req, {ignoreSearch: true})));
  }
});
function guarda(req, res) {
  if (res.ok || res.type === "opaque") { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
  return res;
}
