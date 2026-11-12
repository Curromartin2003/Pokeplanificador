// Service worker: la app abre sin conexión. Lo propio, primero red (para tener siempre la última versión); si no hay
// conexión o la red no contesta en 2,5 s (los bloqueos de LaLiga a Cloudflare en días de partido dejan las peticiones
// colgadas y la app se quedaba en blanco), caché, y la respuesta de la red, si llega, se guarda para la próxima vez. Las librerías de Firebase (gstatic) no cambian de versión: primero caché.
// Los datos no pasan por aquí: los guarda y sincroniza Firestore con su propia caché.
const CACHE = "pokeplanificador-v43";
const CORE = ["./", "index.html", "css/app.css", "css/glass.css", "js/app.js", "js/engine.js", "js/store.js", "js/temario.js", "js/docs_esp.js", "js/parque3d.js",
  "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.host === "www.gstatic.com" || url.host === "fonts.gstatic.com" || url.host === "fonts.googleapis.com" || url.host === "cdn.jsdelivr.net") {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => guarda(req, res))));
  } else if (url.origin === location.origin) {
    e.respondWith(redOCache(req));
  }
});
function guarda(req, res) {
  if (res.ok || res.type === "opaque") { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
  return res;
}
function redOCache(req) {
  // Sin la caché HTTP del navegador: si no, podía devolver una versión vieja de la app durante una hora.
  const red = fetch(req.url, {cache: "no-cache", credentials: "same-origin"}).then(res => guarda(req, res));
  const cache = () => caches.match(req, {ignoreSearch: true});
  return new Promise(ok => {
    let hecho = false;
    const fin = r => { if (!hecho && r) { hecho = true; ok(r); } };
    const t = setTimeout(() => cache().then(fin), 2500);
    red.then(r => { clearTimeout(t); fin(r); })
      .catch(() => { clearTimeout(t); cache().then(r => r ? fin(r) : red.catch(() => fin(Response.error()))); });
  });
}
