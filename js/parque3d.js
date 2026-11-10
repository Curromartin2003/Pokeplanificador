// Parque de bomberos en 3D (three.js): modelos propios de cada pieza de la tienda con acabado realista (reflejos, pintura
// con barniz, metal, cristal, cantos redondeados y texturas dibujadas en lienzo), el plano isométrico del parque con una
// parcela por pieza, miniaturas para la tienda y el visor del temporizador. Sin imágenes ni modelos externos.
let THREE = null, Orbit = null, Redonda = null, Sala = null;
export let error = null;
export async function cargar() {
  if (THREE) return THREE;
  try {
    const t = await import("three");
    ({OrbitControls: Orbit} = await import("three/addons/controls/OrbitControls.js"));
    THREE = t;
    // Extras para el acabado (cantos redondeados y reflejos): si no cargan, el parque se ve igual pero más sencillo.
    try { ({RoundedBoxGeometry: Redonda} = await import("three/addons/geometries/RoundedBoxGeometry.js")); ({RoomEnvironment: Sala} = await import("three/addons/environments/RoomEnvironment.js")); } catch (x) {}
  } catch (e) {
    // Navegadores sin «import maps»: la misma versión desde esm.sh (resuelve sus propias dependencias).
    try {
      const t = await import("https://esm.sh/three@0.160.0");
      ({OrbitControls: Orbit} = await import("https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js"));
      THREE = t;
      try { ({RoundedBoxGeometry: Redonda} = await import("https://esm.sh/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js")); ({RoomEnvironment: Sala} = await import("https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js")); } catch (x) {}
    } catch (e2) { error = String(e2 && e2.message || e2); throw e2; }
  }
  // Comprobación de WebGL: si el dispositivo no lo tiene, se usa el plano sencillo.
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) throw new Error("Este dispositivo no tiene WebGL");
  } catch (e) { error = e.message; THREE = null; throw e; }
  return THREE;
}
export const disponible = () => !!THREE;

/* ---------- materiales y piezas básicas ---------- */
const COL = {
  rojo: 0xC1121F, rojoOsc: 0x8E0E17, amarillo: 0xF2B705, negro: 0x23262B, gris: 0x9AA3AB, grisOsc: 0x5E666E,
  blanco: 0xF4F4F2, plata: 0xC9D0D6, madera: 0x9A6233, verde: 0x3E9B4F, verdeOsc: 0x2C7A3B, naranja: 0xF28C28,
  azul: 0x2E6FD8, ladrillo: 0xB4472F, crema: 0xEBDDBF, cristal: 0x9FD3F5, oro: 0xE7B416, marron: 0x6B4423,
};
// Acabado de cada color: pintura brillante con barniz, metal pulido, goma mate, cristal que refleja el cielo...
const ACABADO = {
  [COL.rojo]: {roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12}, [COL.rojoOsc]: {roughness: 0.6},
  [COL.amarillo]: {roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2}, [COL.naranja]: {roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2},
  [COL.blanco]: {roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.2}, [COL.azul]: {roughness: 0.35, clearcoat: 0.5},
  [COL.plata]: {roughness: 0.22, metalness: 0.95}, [COL.gris]: {roughness: 0.55, metalness: 0.35}, [COL.grisOsc]: {roughness: 0.5, metalness: 0.5},
  [COL.negro]: {roughness: 0.85}, [COL.oro]: {roughness: 0.2, metalness: 1},
  [COL.madera]: {roughness: 0.85}, [COL.marron]: {roughness: 0.9}, [COL.verde]: {roughness: 0.95}, [COL.verdeOsc]: {roughness: 0.95},
  [COL.ladrillo]: {roughness: 0.92}, [COL.crema]: {roughness: 0.9},
  [COL.cristal]: {color: 0x1C3348, roughness: 0.04, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2},
};
const mats = new Map();
function mat(c, extra = {}) {
  const k = c + JSON.stringify(extra);
  if (!mats.has(k)) {
    const p = {color: c, roughness: 0.75, metalness: 0.02, ...(ACABADO[c] || {}), ...extra};
    mats.set(k, p.clearcoat ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p));
  }
  return mats.get(k);
}
// Texturas dibujadas en un lienzo (sin imágenes externas): hierba, asfalto, ladrillo, persiana, rótulos...
const lienzos = new Map();
function lienzo(tipo, dibujar, w = 256, h = 256) {
  if (!lienzos.has(tipo)) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    dibujar(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    lienzos.set(tipo, t);
  }
  return lienzos.get(tipo);
}
const rnd = (a, b) => a + Math.random() * (b - a);
const TEX = {
  grano: () => lienzo("grano", (x, w, h) => { x.fillStyle = "#e9e9e9"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = Math.floor(rnd(170, 255)); x.fillStyle = `rgba(${v},${v},${v},${rnd(0.15, 0.6)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3)); } }),
  hierba: () => lienzo("hierba", (x, w, h) => { x.fillStyle = "#dcdcdc"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const v = Math.floor(rnd(190, 245)); x.fillStyle = `rgba(${v},${v},${v},0.25)`; x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(12, 40), 0, 7); x.fill(); }
    for (let i = 0; i < 7000; i++) { const v = Math.floor(rnd(140, 255)); x.strokeStyle = `rgba(${v},${v},${Math.floor(v * 0.9)},${rnd(0.25, 0.7)})`; const px = rnd(0, w), py = rnd(0, h);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + rnd(-2, 2), py - rnd(2, 5)); x.stroke(); } }),
  ladrillo: () => lienzo("ladrillo", (x, w, h) => { x.fillStyle = "#cfc6bb"; x.fillRect(0, 0, w, h);
    const bh = 16, bw = 40; for (let f = 0; f * bh < h; f++) for (let c = -1; c * bw < w; c++) {
      const v = rnd(-18, 18); x.fillStyle = `rgb(${172 + v},${72 + v * 0.6},${50 + v * 0.5})`; x.fillRect(c * bw + (f % 2) * bw / 2 + 1.5, f * bh + 1.5, bw - 3, bh - 3); } }),
  persiana: () => lienzo("persiana", (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, 16); g.addColorStop(0, "#f2f4f6"); g.addColorStop(0.8, "#b9c0c6"); g.addColorStop(1, "#6f777e");
    for (let y = 0; y < h; y += 16) { x.fillStyle = g; x.save(); x.translate(0, y); x.fillRect(0, 0, w, 16); x.restore(); } }, 64, 256),
  porton: () => lienzo("porton", (x, w, h) => { x.fillStyle = "#c21722"; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += h / 5) { x.fillStyle = "rgba(0,0,0,0.28)"; x.fillRect(0, y, w, 3); x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect(0, y + 3, w, 2); }
    for (let i = 0; i < 4; i++) { x.fillStyle = "#15232f"; x.fillRect(14 + i * (w - 20) / 4, h / 5 + 12, (w - 20) / 4 - 10, h / 5 - 22); x.fillStyle = "rgba(160,210,245,0.35)"; x.fillRect(14 + i * (w - 20) / 4, h / 5 + 12, (w - 20) / 8, h / 5 - 22); } }),
  chevron: () => lienzo("chevron", (x, w, h) => { x.fillStyle = "#f5c400"; x.fillRect(0, 0, w, h); x.fillStyle = "#c1121f";
    for (let i = -h; i < w + h; i += 48) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 24, h); x.lineTo(i + 24 + h, 0); x.lineTo(i + h, 0); x.fill(); } }, 256, 64),
  rotulo: (txt, fondo, tinta) => lienzo("r" + txt + fondo, (x, w, h) => { if (fondo) { x.fillStyle = fondo; x.fillRect(0, 0, w, h); }
    x.fillStyle = tinta || "#fff"; x.font = `700 ${h * 0.66}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, w / 2, h / 2 + 2, w - 16); }, 512, 96),
};
// Material con una textura repetida según el tamaño de la pieza (cada combinación se crea una sola vez).
function matTex(c, tipo, rx = 1, ry = 1, extra = {}) {
  const k = `t${c}|${tipo}|${rx.toFixed(1)}|${ry.toFixed(1)}`;
  if (!mats.has(k)) {
    const t = TEX[tipo]().clone(); t.repeat.set(rx, ry); t.needsUpdate = true;
    mats.set(k, new THREE.MeshStandardMaterial({color: c, map: t, roughness: 0.92, metalness: 0, ...extra}));
  }
  return mats.get(k);
}
function sombra(m) { m.castShadow = true; m.receiveShadow = true; return m; }
const geos = new Map();
function geo(k, crear) { if (!geos.has(k)) geos.set(k, crear()); return geos.get(k); }
// Caja con los cantos redondeados (las piezas muy finas se quedan rectas). El ladrillo lleva su textura.
function caja(g, w, h, d, c, x = 0, y = 0, z = 0, extra) {
  const min = Math.min(w, h, d), r = Math.min(0.05, min * 0.28);
  const gm = geo(`c${w}|${h}|${d}`, () => (Redonda && min >= 0.05 ? new Redonda(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d)));
  const m = sombra(new THREE.Mesh(gm, c === COL.ladrillo && min > 0.3 ? matTex(0xffffff, "ladrillo", Math.max(w, d) * 1.5, h * 1.9) : mat(c, extra)));
  m.position.set(x, y + h / 2, z); g.add(m); return m;
}
function cil(g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 12, extra) {
  const s = seg <= 6 ? 8 : Math.max(seg, 24);
  const m = sombra(new THREE.Mesh(geo(`y${rt}|${rb}|${h}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)), mat(c, extra)));
  m.position.set(x, y + h / 2, z); g.add(m); return m;
}
function esfera(g, r, c, x = 0, y = 0, z = 0, seg = 10, extra) {
  const m = sombra(new THREE.Mesh(geo(`e${r}`, () => new THREE.SphereGeometry(r, 22, 16)), mat(c, extra)));
  m.position.set(x, y, z); g.add(m); return m;
}
function cono(g, r, h, c, x = 0, y = 0, z = 0, seg = 8) {
  const m = sombra(new THREE.Mesh(geo(`o${r}|${h}`, () => new THREE.ConeGeometry(r, h, Math.max(seg, 20))), mat(c)));
  m.position.set(x, y + h / 2, z); g.add(m); return m;
}
// Plano con una textura (rótulos, persianas, portones) pegado a una cara: `cara` = "z+", "z-", "x+" o "x-".
function panel(g, w, h, material, x, y, z, cara = "z+") {
  const m = new THREE.Mesh(geo(`p${w}|${h}`, () => new THREE.PlaneGeometry(w, h)), material);
  m.position.set(x, y + h / 2, z); m.rotation.y = {"z+": 0, "z-": Math.PI, "x+": Math.PI / 2, "x-": -Math.PI / 2}[cara]; m.receiveShadow = true;
  g.add(m); return m;
}
const matPanel = (tipo, ...a) => { const k = "P" + tipo + a.join("|"); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({map: TEX[tipo](...a), roughness: 0.5, metalness: tipo === "persiana" ? 0.6 : 0.05, transparent: tipo === "rotulo" && !a[1]})); return mats.get(k); };
// Luces azules de emergencia: todas comparten material y destellan a la vez (lo mueve el bucle del parque).
let luzAzul = null;
function destello() { if (!luzAzul) luzAzul = new THREE.MeshStandardMaterial({color: 0x2E6FD8, emissive: 0x2a6cff, emissiveIntensity: 1.2, roughness: 0.2}); return luzAzul; }
function faro(g, w, h, d, x, y, z) { const m = caja(g, w, h, d, COL.azul, x, y, z); m.material = destello(); return m; }
// Rueda: neumático, llanta metálica y buje.
function rueda(g, x, z, r = 0.22, y = 0) {
  const n = cil(g, r, r, 0.17, COL.negro, x, y, z, 28); n.rotation.x = Math.PI / 2; n.position.y = r + y;
  const b = sombra(new THREE.Mesh(geo(`t${r}`, () => new THREE.TorusGeometry(r * 0.86, r * 0.16, 10, 28)), mat(COL.negro))); b.position.set(x, r + y, z); g.add(b);
  const l = cil(g, r * 0.62, r * 0.62, 0.185, COL.plata, x, y, z, 20); l.rotation.x = Math.PI / 2; l.position.y = r + y;
  const c = cil(g, r * 0.2, r * 0.2, 0.2, COL.grisOsc, x, y, z, 12); c.rotation.x = Math.PI / 2; c.position.y = r + y;
  return n;
}
// Cabina de vehículo mirando a +x: parabrisas inclinado, ventanillas, faros, parachoques y retrovisores.
function cabina(g, {x0, largo, ancho, alto, y, color}) {
  const cx = x0 + largo / 2;
  caja(g, largo, alto, ancho, color, cx, y, 0);
  const pb = caja(g, 0.04, alto * 0.42, ancho * 0.86, COL.cristal, x0 + largo + 0.005, y + alto * 0.5, 0); pb.rotation.z = 0.1;
  for (const s of [-1, 1]) {
    caja(g, largo * 0.55, alto * 0.36, 0.03, COL.cristal, cx + largo * 0.12, y + alto * 0.53, s * (ancho / 2 + 0.002));
    caja(g, 0.03, 0.12, 0.09, COL.negro, x0 + largo * 0.9, y + alto * 0.62, s * (ancho / 2 + 0.07));
    caja(g, 0.04, 0.09, 0.16, 0xFFF6D8, x0 + largo + 0.01, y + alto * 0.16, s * ancho * 0.33, {emissive: 0xfff0b0, emissiveIntensity: 0.9});
    caja(g, 0.04, 0.05, 0.08, COL.naranja, x0 + largo + 0.01, y + alto * 0.3, s * ancho * 0.4, {emissive: 0xff8a00, emissiveIntensity: 0.5});
  }
  caja(g, 0.05, alto * 0.2, ancho * 0.5, COL.negro, x0 + largo + 0.01, y + alto * 0.1, 0);
  caja(g, 0.12, 0.13, ancho + 0.06, COL.plata, x0 + largo + 0.03, y - 0.1, 0);
}
// Camión de bomberos mirando a +x: chasis, cabina, carrocería con persianas, franjas reflectantes, rótulo y puente de luces.
function camion(g, {largo = 2.4, alto = 0.9, color = COL.rojo, cabina: cab = 0.7, franja = COL.blanco, ruedas = 2, rotulo = "BOMBEROS"} = {}) {
  const y0 = 0.26, ancho = 0.95, caj = largo - cab, xc = -cab / 2;
  caja(g, largo - 0.1, 0.12, ancho * 0.8, COL.negro, 0, 0.16, 0);
  caja(g, caj - 0.03, alto, ancho, color, xc, y0, 0);
  cabina(g, {x0: largo / 2 - cab, largo: cab, ancho, alto: alto * 0.88, y: y0, color});
  // Persianas del material a cada lado, franja reflectante y rótulo.
  const n = caj > 1.9 ? 3 : 2, pw = (caj - 0.25) / n;
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) panel(g, pw - 0.06, alto * 0.5, matPanel("persiana"), xc - caj / 2 + 0.125 + pw * (i + 0.5), y0 + alto * 0.2, s * (ancho / 2 + 0.006), s > 0 ? "z+" : "z-");
    caja(g, largo - 0.06, 0.07, 0.012, franja, 0, y0 + 0.05, s * (ancho / 2 + 0.004));
    caja(g, caj - 0.1, 0.03, 0.012, COL.amarillo, xc, y0 + 0.13, s * (ancho / 2 + 0.004));
    if (rotulo) panel(g, Math.min(1.1, caj - 0.3), 0.15, matPanel("rotulo", rotulo), xc, y0 + alto * 0.76, s * (ancho / 2 + 0.008), s > 0 ? "z+" : "z-");
  }
  panel(g, ancho - 0.1, alto * 0.3, matPanel("chevron"), -largo / 2 - 0.012, y0 + 0.04, 0, "x-");
  caja(g, 0.08, 0.1, ancho + 0.04, COL.plata, -largo / 2 - 0.02, y0 - 0.1, 0);
  for (const s of [-1, 1]) caja(g, 0.03, 0.12, 0.1, 0xD01020, -largo / 2 - 0.01, y0 + alto * 0.45, s * ancho * 0.38, {emissive: 0xff1020, emissiveIntensity: 0.7});
  // Puente de luces y barandilla del techo.
  faro(g, 0.16, 0.07, ancho * 0.72, largo / 2 - cab * 0.55, y0 + alto * 0.88, 0);
  caja(g, 0.2, 0.03, ancho * 0.78, COL.negro, largo / 2 - cab * 0.55, y0 + alto * 0.86, 0);
  for (const s of [-1, 1]) { faro(g, 0.07, 0.05, 0.07, -largo / 2 + 0.1, y0 + alto, s * ancho * 0.4); caja(g, caj - 0.3, 0.03, 0.03, COL.plata, xc, y0 + alto + 0.04, s * ancho * 0.44); }
  const xs = ruedas === 3 ? [-largo / 2 + 0.38, -largo / 2 + 0.9, largo / 2 - 0.42] : [-largo / 2 + 0.5, largo / 2 - 0.42];
  for (const x of xs) { rueda(g, x, 0.44, 0.24); rueda(g, x, -0.44, 0.24); for (const s of [-1, 1]) caja(g, 0.62, 0.05, 0.1, COL.negro, x, 0.5, s * 0.46); }
}
// Edificio: zócalo, muros, cornisa, puerta con marco y escalón, ventanas con marco y alféizar, y equipos en la azotea.
function ventana(g, x, y, z, w = 0.32, h = 0.3) {
  caja(g, w + 0.07, h + 0.07, 0.05, COL.blanco, x, y - 0.035, z); caja(g, w, h, 0.06, COL.cristal, x, y, z + 0.004);
  caja(g, 0.02, h, 0.065, COL.blanco, x, y, z + 0.006); caja(g, w + 0.12, 0.03, 0.1, 0xD7DCE0, x, y - 0.06, z + 0.02);
}
function edificio(g, {w = 1.8, h = 1.2, d = 1.6, color = COL.crema, tejado = COL.rojoOsc, puerta = COL.azul, rotulo = null} = {}) {
  caja(g, w, h, d, color);
  caja(g, w + 0.04, 0.16, d + 0.04, 0x8B8F94, 0, 0, 0);
  caja(g, w + 0.16, 0.08, d + 0.16, tejado, 0, h, 0); caja(g, w + 0.02, 0.1, d + 0.02, 0xD7DCE0, 0, h - 0.08, 0);
  caja(g, w - 0.1, 0.04, d - 0.1, 0x8E959C, 0, h + 0.08, 0);
  caja(g, 0.4, 0.2, 0.36, COL.gris, w * 0.25, h + 0.1, -d * 0.2); cil(g, 0.13, 0.13, 0.03, COL.negro, w * 0.25, h + 0.3, -d * 0.2, 16);
  const zf = d / 2;
  caja(g, 0.5, 0.72, 0.05, COL.blanco, 0, 0, zf); caja(g, 0.4, 0.66, 0.06, puerta, 0, 0, zf + 0.005); caja(g, 0.16, 0.2, 0.065, COL.cristal, 0, 0.38, zf + 0.008);
  esfera(g, 0.022, COL.plata, 0.14, 0.33, zf + 0.045); caja(g, 0.62, 0.05, 0.22, 0xB9BEC3, 0, 0, zf + 0.1);
  caja(g, 0.7, 0.04, 0.26, tejado, 0, 0.78, zf + 0.12);
  for (const x of [-w / 3, w / 3]) ventana(g, x, h * 0.42, zf);
  for (const s of [-1, 1]) { const v = new THREE.Group(); ventana(v, 0, h * 0.42, 0); v.rotation.y = s * Math.PI / 2; v.position.set(s * w / 2, 0, 0); g.add(v); }
  if (rotulo) panel(g, Math.min(w - 0.3, 1.2), 0.17, matPanel("rotulo", rotulo, "#f4f4f2", "#8e0e17"), 0, h - 0.3, zf + 0.012);
}
// Copa de árbol: esfera con los vértices movidos para que no sea una bola perfecta.
function copa(g, r, c, x, y, z, sy = 1) {
  const k = `f${r}|${Math.floor(Math.random() * 3)}`;
  const gm = geo(k, () => { const s = new THREE.IcosahedronGeometry(r, 3), p = s.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.16 * Math.sin(v.x * 9 / r + 1) * Math.cos(v.y * 7 / r) + 0.1 * Math.sin(v.z * 11 / r); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
    s.computeVertexNormals(); return s; });
  const m = sombra(new THREE.Mesh(gm, matTex(c, "hierba", 3, 3, {roughness: 1}))); m.position.set(x, y, z); m.scale.y = sy; m.rotation.y = Math.random() * 6; g.add(m); return m;
}
function tronco(g, r, h, x = 0, z = 0, c = 0x6B4A2E) { const t = cil(g, r * 0.7, r, h, c, x, 0, z, 10); t.material = matTex(c, "grano", 2, 3); cil(g, r * 1.25, r * 1.5, 0.06, c, x, 0, z, 10); return t; }

// Luz de ambiente con reflejos y curva de color de cine, para cualquier visor (parque, miniaturas, temporizador).
function ambiente(renderer, scene, exposicion = 1.05) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposicion;
  if (!Sala) return false;
  try { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new Sala(), 0.04).texture; pm.dispose(); return true; } catch (e) { return false; }
}

/* ---------- modelos de cada pieza ---------- */
const MODELOS = {
  // Material (escala pequeña: van en el almacén)
  extintor(g) { cil(g, 0.2, 0.2, 0.7, COL.rojo, 0, 0.04); esfera(g, 0.2, COL.rojo, 0, 0.74, 0).scale.y = 0.55; cil(g, 0.21, 0.21, 0.04, COL.negro);
    cil(g, 0.06, 0.07, 0.12, COL.plata, 0, 0.82); caja(g, 0.3, 0.035, 0.07, COL.negro, 0.08, 0.95); caja(g, 0.26, 0.03, 0.06, COL.plata, 0.07, 0.9).rotation.z = -0.2;
    cil(g, 0.035, 0.035, 0.03, COL.blanco, 0, 0.88, 0.07, 12).rotation.x = Math.PI / 2;
    const m = sombra(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 20, Math.PI), mat(COL.negro))); m.position.set(0.14, 0.72, 0); m.rotation.z = -Math.PI / 2 + 0.5; g.add(m);
    cono(g, 0.04, 0.16, COL.negro, 0.3, 0.42, 0).rotation.z = Math.PI; cil(g, 0.205, 0.205, 0.22, COL.blanco, 0, 0.36, 0, 24); cil(g, 0.207, 0.207, 0.05, COL.amarillo, 0, 0.5, 0, 24); },
  hacha(g) { const p = caja(g, 0.1, 1.2, 0.1, COL.madera); p.rotation.z = 0.25; const c = caja(g, 0.5, 0.3, 0.08, COL.plata, 0.25, 0.95); c.rotation.z = 0.25;
    caja(g, 0.16, 0.3, 0.1, COL.rojo, -0.08, 1.0); },
  linterna(g) { cil(g, 0.15, 0.15, 0.6, COL.amarillo); cil(g, 0.22, 0.15, 0.2, COL.negro, 0, 0.6); cil(g, 0.2, 0.2, 0.03, 0xFFF6C4, 0, 0.8, 0, 12, {emissive: 0xfff0a0, emissiveIntensity: 0.8}); },
  guantes(g) { for (const x of [-0.22, 0.22]) { caja(g, 0.34, 0.5, 0.16, COL.amarillo, x, 0); caja(g, 0.34, 0.14, 0.18, COL.negro, x, 0); caja(g, 0.1, 0.22, 0.1, COL.amarillo, x + 0.2, 0.18); } },
  casco(g) { const s = esfera(g, 0.42, COL.rojo, 0, 0.25, 0, 12); s.scale.y = 0.85; cil(g, 0.58, 0.62, 0.06, COL.rojo, 0, 0.18); caja(g, 0.2, 0.22, 0.05, COL.oro, 0, 0.36, 0.38); caja(g, 0.06, 0.08, 0.7, COL.amarillo, 0, 0.6, 0); },
  cizalla(g) { cil(g, 0.16, 0.16, 0.55, COL.amarillo, 0, 0.15).rotation.z = Math.PI / 2; for (const s of [-1, 1]) { const b = caja(g, 0.5, 0.08, 0.06, COL.plata, 0.5, 0.25 + s * 0.06); b.rotation.z = s * 0.25; }
    caja(g, 0.3, 0.12, 0.12, COL.negro, -0.35, 0.2); caja(g, 0.08, 0.35, 0.08, COL.rojo, -0.15, 0.3); },
  cuerdas(g) { const t = sombra(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 8, 18), mat(COL.naranja))); t.rotation.x = Math.PI / 2; t.position.y = 0.1; g.add(t);
    const t2 = t.clone(); t2.position.y = 0.24; t2.material = mat(COL.azul); g.add(t2); caja(g, 0.14, 0.3, 0.14, COL.negro, 0, 0.3); },
  escalera(g) { for (const z of [-0.25, 0.25]) caja(g, 0.07, 1.5, 0.07, COL.plata, 0, 0, z); for (let y = 0.15; y < 1.5; y += 0.25) caja(g, 0.05, 0.05, 0.5, COL.plata, 0, y, 0); g.rotation.z = -0.25; },
  era(g) { for (const x of [-0.14, 0.14]) { cil(g, 0.14, 0.14, 0.7, COL.amarillo, x, 0); esfera(g, 0.14, COL.amarillo, x, 0.7, 0, 8); } caja(g, 0.5, 0.6, 0.1, COL.negro, 0, 0.05, -0.18);
    esfera(g, 0.2, COL.negro, 0, 0.9, 0.25, 8); caja(g, 0.18, 0.12, 0.03, COL.cristal, 0, 0.88, 0.43); },
  separador(g) { cil(g, 0.16, 0.18, 0.7, COL.amarillo, 0, 0.1).rotation.z = Math.PI / 2; for (const s of [-1, 1]) { const b = caja(g, 0.55, 0.1, 0.12, COL.grisOsc, 0.55, 0.22 + s * 0.08); b.rotation.z = s * 0.35; }
    caja(g, 0.3, 0.2, 0.14, COL.negro, -0.45, 0.12); },
  // Instalaciones
  vestuarios(g) { edificio(g, {w: 1.7, h: 1, d: 1.5, color: COL.crema, puerta: COL.azul}); caja(g, 0.5, 0.06, 0.4, COL.cristal, 0.4, 1.1, 0); },
  cocina(g) { edificio(g, {w: 1.7, h: 1.05, d: 1.5, color: 0xF7E7C9, puerta: COL.verde}); caja(g, 0.25, 0.6, 0.25, COL.ladrillo, -0.55, 1.1, -0.4); esfera(g, 0.16, 0xdddddd, -0.55, 1.95, -0.4, 8); },
  epis(g) { caja(g, 1.8, 0.1, 1.2, COL.gris); caja(g, 1.8, 1.4, 0.1, COL.grisOsc, 0, 0, -0.55);
    for (const x of [-0.6, 0, 0.6]) { caja(g, 0.38, 0.75, 0.25, COL.amarillo, x, 0.35, -0.3); caja(g, 0.38, 0.08, 0.26, 0xD7DCE0, x, 0.6, -0.3); const c = esfera(g, 0.16, COL.rojo, x, 1.3, -0.3, 8); c.scale.y = 0.8; } },
  dormitorio(g) { edificio(g, {w: 1.8, h: 1.1, d: 1.5, color: COL.blanco, tejado: COL.azul, puerta: COL.marron}); caja(g, 0.6, 0.2, 0.4, COL.azul, 0.4, 1.22, 0); },
  gym(g) { caja(g, 1.9, 0.08, 1.5, 0x3A3F45); caja(g, 0.7, 0.3, 0.3, COL.negro, -0.4, 0.08, 0.3);
    const b = cil(g, 0.03, 0.03, 1.2, COL.plata, 0.3, 0.6, -0.3); b.rotation.x = Math.PI / 2;
    for (const z of [-0.85, 0.25]) { const p = cil(g, 0.22, 0.22, 0.08, COL.negro, 0.3, 0.38, z); p.rotation.x = Math.PI / 2; }
    for (const x of [0.15, 0.45]) caja(g, 0.06, 0.6, 0.06, COL.grisOsc, x, 0.08, -0.3); caja(g, 0.5, 0.5, 0.5, COL.rojo, -0.5, 0.08, -0.4); },
  patio(g) { caja(g, 2, 0.04, 1.8, 0x8E959C); for (const z of [-0.6, 0, 0.6]) caja(g, 1.8, 0.01, 0.06, COL.blanco, 0, 0.04, z);
    for (const [x, z] of [[-0.7, -0.3], [0, 0.3], [0.7, -0.3]]) { cono(g, 0.12, 0.35, COL.naranja, x, 0.05, z); caja(g, 0.26, 0.04, 0.26, COL.naranja, x, 0.04, z); }
    cil(g, 0.03, 0.03, 1.6, COL.plata, 0.85, 0.04, 0.75); caja(g, 0.4, 0.26, 0.02, COL.rojo, 0.66, 1.3, 0.75); },
  comunicaciones(g) { edificio(g, {w: 1.6, h: 1, d: 1.4, color: COL.gris, tejado: COL.grisOsc, puerta: COL.rojo});
    cil(g, 0.04, 0.06, 1.7, COL.plata, 0.5, 1.1, -0.3, 6); const p = cil(g, 0.25, 0.05, 0.1, COL.blanco, 0.5, 2.5, -0.3); p.rotation.z = 0.8;
    esfera(g, 0.06, 0xff3030, 0.5, 2.85, -0.3, 6, {emissive: 0xff2020, emissiveIntensity: 0.9}); },
  altura(g) { caja(g, 1.1, 3.2, 1.1, COL.ladrillo); for (let y = 0.6; y < 3; y += 0.7) for (const x of [-0.25, 0.25]) caja(g, 0.25, 0.35, 0.05, COL.negro, x, y, 0.56);
    caja(g, 1.4, 0.1, 1.4, COL.grisOsc, 0, 3.2); for (const [x, z] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) caja(g, 0.05, 0.4, 0.05, COL.amarillo, x, 3.3, z);
    caja(g, 0.06, 0.06, 1.3, COL.amarillo, 0.66, 3.65, 0); caja(g, 0.06, 0.06, 1.3, COL.amarillo, -0.66, 3.65, 0);
    const c = cil(g, 0.02, 0.02, 3.2, COL.naranja, 0.6, 0.05, 0.62, 4); c.rotation.z = 0.02; },
  humo(g) { caja(g, 1.6, 1.3, 1.5, 0x4A4F55); caja(g, 1.7, 0.1, 1.6, COL.negro, 0, 1.3, 0); caja(g, 0.4, 0.6, 0.05, COL.negro, 0, 0, 0.76);
    caja(g, 0.3, 0.25, 0.05, 0xFF7A1A, -0.45, 0.7, 0.76, {emissive: 0xff5a00, emissiveIntensity: 0.9});
    for (const [x, y, r] of [[0.3, 1.7, 0.25], [0.45, 2.05, 0.3], [0.2, 2.4, 0.22]]) esfera(g, r, 0x8B9096, x, y, -0.2, 8); },
  edificio(g) { const W = 2.8, H = 1.75, D = 1.9, zf = D / 2;
    caja(g, W, H, D, COL.ladrillo); caja(g, W + 0.05, 0.14, D + 0.05, 0x7C8086, 0, 0, 0);
    caja(g, W + 0.16, 0.1, D + 0.16, 0xD7DCE0, 0, H, 0); caja(g, W - 0.08, 0.05, D - 0.08, 0x6B737B, 0, H + 0.1, 0);
    for (const x of [-0.9, 0, 0.9]) { caja(g, 0.82, 1.12, 0.05, 0xD7DCE0, x, 0, zf); panel(g, 0.74, 1.06, matPanel("porton"), x, 0, zf + 0.03); caja(g, 0.86, 0.03, 0.3, 0x9AA0A6, x, 0, zf + 0.16); }
    caja(g, W - 0.3, 0.3, 0.05, COL.blanco, 0, 1.25, zf); panel(g, 1.9, 0.26, matPanel("rotulo", "BOMBEROS", "#f4f4f2", "#8e0e17"), 0, 1.27, zf + 0.03);
    for (const s of [-1, 1]) { const v = new THREE.Group(); for (const z of [-0.5, 0.5]) { ventana(v, z, 0.55, 0, 0.36, 0.34); ventana(v, z, 1.2, 0, 0.36, 0.3); } v.rotation.y = s * Math.PI / 2; v.position.set(s * W / 2, 0, 0); g.add(v); }
    // Torre de mangueras con reloj y bandera.
    caja(g, 0.8, 1.5, 0.8, COL.ladrillo, -0.95, H, -0.45); caja(g, 0.94, 0.08, 0.94, 0xD7DCE0, -0.95, H + 1.5, -0.45);
    const tj = cono(g, 0.62, 0.42, COL.rojoOsc, -0.95, H + 1.58, -0.45, 4); tj.rotation.y = Math.PI / 4;
    ventana(g, -0.95, H + 0.3, -0.05, 0.26, 0.42); const rj = cil(g, 0.17, 0.17, 0.04, COL.blanco, -0.95, H + 1.0, -0.04, 24); rj.rotation.x = Math.PI / 2; rj.position.y = H + 1.15;
    caja(g, 0.015, 0.13, 0.02, COL.negro, -0.95, H + 1.15, -0.015); caja(g, 0.09, 0.015, 0.02, COL.negro, -0.91, H + 1.15, -0.015);
    cil(g, 0.015, 0.015, 0.9, COL.plata, 0.9, H + 0.1, -0.5, 8); caja(g, 0.36, 0.22, 0.015, COL.rojo, 1.09, H + 0.76, -0.5); caja(g, 0.36, 0.075, 0.017, COL.amarillo, 1.09, H + 0.83, -0.5);
    caja(g, 0.5, 0.24, 0.4, COL.gris, 0.3, H + 0.12, -0.4); cil(g, 0.16, 0.16, 0.03, COL.negro, 0.3, H + 0.36, -0.4, 16);
    for (const x of [-1.38, 1.38]) { cil(g, 0.02, 0.02, 0.12, COL.negro, x, 1.05, zf + 0.06, 8).rotation.x = Math.PI / 2; esfera(g, 0.05, 0xFFF2B3, x, 1.1, zf + 0.12, 8, {emissive: 0xffe680, emissiveIntensity: 1}); } },
  // Vehículos
  mando(g) { const y = 0.24, a = 0.86; caja(g, 1.75, 0.1, a * 0.8, COL.negro, 0, 0.14, 0); caja(g, 1.8, 0.42, a, COL.rojo, 0, y, 0);
    caja(g, 1.05, 0.36, a * 0.94, COL.rojo, -0.2, y + 0.4, 0); caja(g, 0.98, 0.26, a * 0.955, COL.cristal, -0.2, y + 0.43, 0);
    const pb = caja(g, 0.04, 0.3, a * 0.84, COL.cristal, 0.34, y + 0.42, 0); pb.rotation.z = 0.5;
    for (const s of [-1, 1]) { caja(g, 1.82, 0.07, 0.012, COL.blanco, 0, y + 0.17, s * (a / 2 + 0.003)); caja(g, 0.04, 0.26, a * 0.97, COL.rojo, -0.2, y + 0.43, 0);
      caja(g, 0.04, 0.08, 0.16, 0xFFF6D8, 0.9, y + 0.24, s * a * 0.33, {emissive: 0xfff0b0, emissiveIntensity: 0.9}); caja(g, 0.03, 0.08, 0.12, 0xD01020, -0.9, y + 0.26, s * a * 0.34, {emissive: 0xff1020, emissiveIntensity: 0.7});
      caja(g, 0.03, 0.07, 0.08, COL.negro, 0.36, y + 0.46, s * (a / 2 + 0.05)); panel(g, 0.6, 0.11, matPanel("rotulo", "BOMBEROS"), -0.2, y + 0.26, s * (a / 2 + 0.008), s > 0 ? "z+" : "z-"); }
    caja(g, 0.05, 0.14, a * 0.5, COL.negro, 0.9, y + 0.06, 0); caja(g, 0.1, 0.1, a + 0.04, COL.plata, 0.9, y - 0.08, 0); caja(g, 0.08, 0.1, a + 0.04, COL.plata, -0.9, y - 0.08, 0);
    faro(g, 0.14, 0.06, a * 0.6, -0.15, y + 0.78, 0); caja(g, 0.18, 0.025, a * 0.66, COL.negro, -0.15, y + 0.76, 0); cil(g, 0.008, 0.008, 0.4, COL.negro, -0.6, y + 0.76, 0.2, 6);
    for (const x of [-0.58, 0.58]) { rueda(g, x, 0.4, 0.21); rueda(g, x, -0.4, 0.21); } },
  sanitaria(g) { const y0 = 0.26, a = 1.0; caja(g, 2.5, 0.12, a * 0.8, COL.negro, 0, 0.16, 0); caja(g, 1.95, 1.05, a, COL.blanco, -0.33, y0, 0);
    cabina(g, {x0: 0.65, largo: 0.65, ancho: a * 0.96, alto: 0.8, y: y0, color: COL.blanco});
    for (const s of [-1, 1]) { caja(g, 2.6, 0.12, 0.012, COL.rojo, 0, y0 + 0.38, s * (a / 2 + 0.004)); caja(g, 1.9, 0.04, 0.012, COL.amarillo, -0.33, y0 + 0.06, s * (a / 2 + 0.004));
      caja(g, 0.3, 0.09, 0.012, COL.rojo, -0.5, y0 + 0.7, s * (a / 2 + 0.006)); caja(g, 0.09, 0.3, 0.012, COL.rojo, -0.5, y0 + 0.6, s * (a / 2 + 0.006));
      caja(g, 0.4, 0.26, 0.012, COL.cristal, 0.2, y0 + 0.62, s * (a / 2 + 0.004)); faro(g, 0.07, 0.05, 0.07, -1.25, y0 + 1.05, s * a * 0.4); }
    panel(g, a - 0.1, 0.28, matPanel("chevron"), -1.312, y0 + 0.04, 0, "x-"); caja(g, 0.02, 0.6, a * 0.8, COL.blanco, -1.31, y0 + 0.36, 0); caja(g, 0.025, 0.2, 0.3, COL.cristal, -1.315, y0 + 0.7, 0);
    faro(g, 0.16, 0.07, a * 0.7, 0.9, y0 + 0.8, 0); caja(g, 0.08, 0.1, a + 0.04, COL.plata, -1.32, y0 - 0.1, 0);
    for (const x of [-0.85, 0.9]) { rueda(g, x, 0.46, 0.24); rueda(g, x, -0.46, 0.24); } },
  bul(g) { camion(g, {largo: 2.3, alto: 0.95});
    for (const z of [-0.14, 0.14]) caja(g, 1.3, 0.03, 0.03, COL.plata, -0.4, 1.3, z); for (let x = -0.95; x <= 0.15; x += 0.22) caja(g, 0.025, 0.025, 0.28, COL.plata, x, 1.3, 0);
    const r = cil(g, 0.16, 0.16, 0.3, COL.rojoOsc, -0.95, 1.22, -0.25, 16); r.rotation.x = Math.PI / 2; r.position.y = 1.38; },
  bup(g) { camion(g, {largo: 3.0, alto: 1.05, ruedas: 3});
    for (const z of [-0.16, 0.16]) caja(g, 1.9, 0.03, 0.03, COL.plata, -0.45, 1.4, z); for (let x = -1.3; x <= 0.4; x += 0.24) caja(g, 0.025, 0.025, 0.32, COL.plata, x, 1.4, 0);
    const m = cil(g, 0.05, 0.07, 0.5, COL.plata, -1.1, 1.32, 0.25, 12); m.rotation.z = -1.1; m.position.set(-1.0, 1.5, 0.28); cil(g, 0.1, 0.1, 0.1, COL.grisOsc, -1.2, 1.31, 0.28, 12);
    for (const s of [-1, 1]) { const b = cil(g, 0.07, 0.07, 0.06, COL.plata, -1.0, 0.5, s * 0.49, 12); b.rotation.x = Math.PI / 2; b.position.y = 0.6; } },
  autoescala(g) { camion(g, {largo: 3.2, alto: 0.9, ruedas: 3});
    cil(g, 0.3, 0.34, 0.16, COL.grisOsc, -1.1, 1.16, 0, 20); caja(g, 0.4, 0.3, 0.34, COL.rojo, -1.1, 1.3, 0);
    const l = new THREE.Group();
    for (const [dx, an, al] of [[0, 0.42, 0.14], [0.5, 0.34, 0.11]]) { for (const z of [-an / 2, an / 2]) { caja(l, 3.0, 0.04, 0.04, COL.plata, dx, 0, z); caja(l, 3.0, 0.03, 0.03, COL.plata, dx, al, z);
        for (let x = -1.45; x <= 1.45; x += 0.29) caja(l, 0.02, al, 0.02, COL.plata, x + dx, 0, z); }
      for (let x = -1.45; x <= 1.45; x += 0.2) caja(l, 0.03, 0.03, an, COL.plata, x + dx, 0, 0); }
    caja(l, 0.36, 0.34, 0.46, COL.plata, 2.15, -0.02, 0); caja(l, 0.36, 0.05, 0.5, COL.rojo, 2.15, 0.3, 0);
    l.position.set(0.3, 1.52, 0); l.rotation.z = 0.2; g.add(l);
    for (const s of [-1, 1]) for (const x of [-1.35, 0.35]) { caja(g, 0.1, 0.08, 0.3, COL.plata, x, 0.24, s * 0.6); caja(g, 0.16, 0.03, 0.16, COL.negro, x, 0, s * 0.7); cil(g, 0.03, 0.03, 0.24, COL.plata, x, 0.02, s * 0.7, 8); } },
  brazo(g) { camion(g, {largo: 3.1, alto: 0.9, ruedas: 3}); cil(g, 0.3, 0.34, 0.16, COL.grisOsc, -1.0, 1.16, 0, 20);
    const tramo = (x1, y1, x2, y2, gr) => { const L = Math.hypot(x2 - x1, y2 - y1), b = caja(g, L, gr, gr, COL.blanco, 0, 0, 0); b.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0); b.rotation.z = Math.atan2(y2 - y1, x2 - x1);
      const c = cil(g, gr * 0.75, gr * 0.75, gr * 1.5, COL.grisOsc, x2, y2 - gr * 0.75, 0, 14); c.rotation.x = Math.PI / 2; c.position.y = y2; };
    tramo(-1.0, 1.3, 0.4, 2.3, 0.18); tramo(0.4, 2.3, 1.5, 1.75, 0.15); tramo(-1.0, 1.3, -0.3, 1.8, 0.07);
    caja(g, 0.5, 0.06, 0.6, COL.plata, 1.6, 1.42, 0); for (const [x, z] of [[1.37, 0.28], [1.83, 0.28], [1.37, -0.28], [1.83, -0.28]]) caja(g, 0.03, 0.34, 0.03, COL.plata, x, 1.46, z);
    for (const z of [-0.28, 0.28]) caja(g, 0.5, 0.03, 0.03, COL.amarillo, 1.6, 1.8, z); for (const x of [1.37, 1.83]) caja(g, 0.03, 0.03, 0.56, COL.amarillo, x, 1.8, 0);
    for (const s of [-1, 1]) for (const x of [-1.3, 0.3]) { caja(g, 0.1, 0.08, 0.3, COL.plata, x, 0.24, s * 0.6); caja(g, 0.16, 0.03, 0.16, COL.negro, x, 0, s * 0.7); cil(g, 0.03, 0.03, 0.24, COL.plata, x, 0.02, s * 0.7, 8); } },
  // Exterior
  arbol(g) { tronco(g, 0.13, 0.85); const r1 = cil(g, 0.03, 0.05, 0.5, 0x6B4A2E, 0.14, 0.6, 0, 6); r1.rotation.z = -0.7; const r2 = cil(g, 0.03, 0.05, 0.45, 0x6B4A2E, -0.12, 0.65, 0.05, 6); r2.rotation.z = 0.8;
    copa(g, 0.5, 0x3F8F45, 0, 1.25, 0); copa(g, 0.38, 0x2F7A3A, 0.34, 1.05, 0.12); copa(g, 0.36, 0x4BA255, -0.3, 1.1, -0.14); copa(g, 0.32, 0x57AE5F, 0.05, 1.6, 0.08); copa(g, 0.28, 0x2F7A3A, -0.1, 1.0, 0.32); },
  flores(g) { caja(g, 1.1, 0.3, 0.5, COL.madera); caja(g, 1.0, 0.05, 0.42, 0x5B3A1E, 0, 0.3);
    [0xE63946, 0xF4A261, 0xFFD166, 0xC77DFF, 0xFF6FB5, 0xE63946].forEach((c, i) => { cil(g, 0.015, 0.015, 0.22, COL.verdeOsc, -0.4 + i * 0.16, 0.3, (i % 2) * 0.12 - 0.06, 4); esfera(g, 0.08, c, -0.4 + i * 0.16, 0.56, (i % 2) * 0.12 - 0.06, 6); }); },
  palmera(g) { let x = 0; for (let i = 0; i < 9; i++) { const t = cil(g, 0.085 - i * 0.003, 0.1 - i * 0.003, 0.27, 0x8C6A45, x, i * 0.25, 0, 10); t.material = matTex(0x8C6A45, "grano", 2, 1); t.rotation.z = -0.05 - i * 0.012; x += 0.02 + i * 0.006; }
    esfera(g, 0.13, 0x6B4A2E, x, 2.27, 0, 8);
    for (let i = 0; i < 11; i++) { const hoja = new THREE.Group(), a = i * Math.PI * 2 / 11, cae = i % 2 ? 0.25 : 0.55;
      for (let k = 0; k < 5; k++) { const s = caja(hoja, 0.26, 0.015, 0.2 - k * 0.032, k % 2 ? 0x3E8F47 : 0x347C3D, 0.12 + k * 0.22, -k * k * 0.03 * (1 + cae), 0); s.rotation.z = -k * 0.16 * (1 + cae); }
      hoja.rotation.y = a; hoja.rotation.z = 0.25 - cae * 0.5; hoja.position.set(x, 2.3, 0); g.add(hoja); } },
  naranjo(g) { tronco(g, 0.11, 0.7); copa(g, 0.55, 0x2E6E36, 0, 1.1, 0, 0.9); copa(g, 0.36, 0x377F3F, 0.3, 1.25, 0.15); copa(g, 0.34, 0x2A6331, -0.28, 1.2, -0.12);
    for (const [x, y, z] of [[0.5, 1.05, 0.28], [-0.42, 1.25, 0.36], [0.1, 1.5, 0.46], [0.38, 0.82, -0.42], [-0.5, 0.92, -0.25], [0.02, 0.8, 0.55], [-0.2, 1.62, -0.2], [0.58, 1.35, -0.1]]) esfera(g, 0.075, 0xF28C28, x, y, z, 8, {roughness: 0.45}); },
  // Trofeos
  medalla(g) { caja(g, 0.7, 0.6, 0.7, COL.blanco); caja(g, 0.18, 0.5, 0.05, COL.rojo, -0.08, 0.6, 0); caja(g, 0.18, 0.5, 0.05, COL.azul, 0.08, 0.6, 0);
    const d = cil(g, 0.28, 0.28, 0.07, COL.oro, 0, 1.25, 0, 18, {metalness: 0.6, roughness: 0.3}); d.rotation.x = Math.PI / 2; },
  placa(g) { caja(g, 0.8, 0.7, 0.8, 0x2B2F36); cil(g, 0.12, 0.22, 0.25, COL.oro, 0, 0.7, 0, 12, {metalness: 0.6, roughness: 0.3}); cil(g, 0.05, 0.05, 0.25, COL.oro, 0, 0.95, 0, 8, {metalness: 0.6, roughness: 0.3});
    cil(g, 0.35, 0.18, 0.45, COL.oro, 0, 1.2, 0, 14, {metalness: 0.6, roughness: 0.3}); caja(g, 0.5, 0.2, 0.02, COL.oro, 0, 0.25, 0.41, {metalness: 0.6, roughness: 0.3}); },
  // Campo de maniobras
  cocheexc(g) { caja(g, 1.6, 0.45, 0.8, 0x4F7CAC, 0, 0.18); const t = caja(g, 0.9, 0.35, 0.75, 0x4F7CAC, -0.1, 0.63); t.rotation.z = 0.12;
    caja(g, 0.85, 0.25, 0.77, COL.cristal, -0.1, 0.68, 0, {roughness: 0.2}); for (const x of [-0.5, 0.5]) { rueda(g, x, 0.4, 0.18); rueda(g, x, -0.4, 0.18); }
    caja(g, 0.5, 0.06, 0.3, COL.plata, 0.9, 0.05, 0.6); },
  contenedor(g) { caja(g, 2.2, 1.1, 1.0, 0x8C3B20); for (let x = -0.9; x <= 0.9; x += 0.3) caja(g, 0.05, 1.1, 1.02, 0x6E2C16, x, 0);
    caja(g, 0.4, 0.3, 0.04, 0xFF7A1A, 0.6, 0.5, 0.51, {emissive: 0xff5a00, emissiveIntensity: 1}); esfera(g, 0.25, 0x777777, 0.6, 1.4, 0.2, 8); esfera(g, 0.3, 0x999999, 0.8, 1.75, 0.1, 8); },
  pozo(g) { cil(g, 0.7, 0.75, 0.5, COL.gris, 0, 0, 0, 16); cil(g, 0.55, 0.55, 0.02, COL.negro, 0, 0.5, 0, 16);
    for (const [x, z] of [[-0.6, 0], [0.6, 0]]) caja(g, 0.08, 1.6, 0.08, COL.amarillo, x, 0.5, z); caja(g, 1.3, 0.08, 0.08, COL.amarillo, 0, 2.05, 0); cil(g, 0.01, 0.01, 1.5, COL.naranja, 0, 0.55, 0, 4); },
  glp(g) { const t = cil(g, 0.5, 0.5, 2.0, COL.blanco, 0, 0.6, 0, 16); t.rotation.z = Math.PI / 2; t.position.y = 0.75;
    for (const x of [-0.85, 0.85]) { const e = esfera(g, 0.5, COL.blanco, x, 0.75, 0, 10); e.scale.x = 0.5; }
    for (const x of [-0.6, 0.6]) caja(g, 0.2, 0.3, 0.8, COL.grisOsc, x, 0, 0); caja(g, 0.5, 0.1, 0.02, 0xF28C28, 0, 0.9, 0.5); },
  colapso(g) { caja(g, 1.8, 0.3, 1.4, 0xA59E93); const a = caja(g, 1.4, 0.15, 1.0, 0xC9C4B8, -0.1, 0.5, 0); a.rotation.z = 0.35; const b = caja(g, 0.2, 0.9, 0.2, 0x8E8A82, 0.6, 0.3, 0.3); b.rotation.x = 0.4;
    for (const [x, z] of [[-0.6, 0.5], [0.5, -0.5], [0.1, 0.55]]) esfera(g, 0.18, 0x8E8A82, x, 0.38, z, 6); caja(g, 0.06, 0.8, 0.06, COL.madera, -0.3, 0.3, -0.3); },
  tunel(g) { const t = sombra(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.6, 16, 1, true, 0, Math.PI), mat(0x7A7F85, {side: THREE.DoubleSide})));
    t.rotation.z = Math.PI / 2; t.rotation.y = Math.PI / 2; t.position.y = 0; g.add(t); caja(g, 2.6, 0.05, 2, 0x4A4F55, 0, 0, 0);
    for (const z of [-0.5, 0.5]) caja(g, 2.4, 0.02, 0.06, COL.blanco, 0, 0.05, z); caja(g, 0.1, 0.1, 0.1, 0xFFE066, 0, 0.92, 0, {emissive: 0xffd000, emissiveIntensity: 1}); },
  // Barrio
  hidrante(g) { cil(g, 0.14, 0.16, 0.5, COL.rojo); esfera(g, 0.15, COL.rojo, 0, 0.52, 0, 8); for (const s of [-1, 1]) { const b = cil(g, 0.06, 0.06, 0.12, COL.plata, s * 0.18, 0.3, 0); b.rotation.z = Math.PI / 2; } cil(g, 0.2, 0.2, 0.05, COL.rojo, 0, 0); },
  farolacalle(g) { cil(g, 0.05, 0.07, 2.0, COL.grisOsc, 0, 0, 0, 8); caja(g, 0.5, 0.05, 0.05, COL.grisOsc, 0.22, 1.95); esfera(g, 0.12, 0xFFF2B3, 0.45, 1.88, 0, 8, {emissive: 0xffe680, emissiveIntensity: 0.9}); },
  semaforo(g) { cil(g, 0.05, 0.05, 1.6, COL.grisOsc, 0, 0, 0, 8); caja(g, 0.25, 0.65, 0.2, COL.negro, 0, 1.5);
    [[0xff3030, 2.0], [0xffc400, 1.8], [0x2ecc71, 1.6]].forEach(([c, y]) => esfera(g, 0.07, c, 0, y, 0.11, 6, {emissive: c, emissiveIntensity: 0.7})); },
  bloque(g) { const c = [0xEBDDBF, 0xD9C5A0, 0xC8D6E5, 0xF2D0A9][Math.floor(Math.random() * 4)]; caja(g, 1.8, 2.8, 1.6, c); caja(g, 1.9, 0.12, 1.7, COL.grisOsc, 0, 2.8, 0);
    for (let y = 0.5; y < 2.6; y += 0.6) for (const x of [-0.55, 0, 0.55]) caja(g, 0.3, 0.32, 0.04, COL.cristal, x, y, 0.81, {roughness: 0.2}); caja(g, 0.4, 0.5, 0.04, COL.marron, 0, 0, 0.81); },
  gasolinera(g) { caja(g, 2.4, 0.08, 1.6, 0xDADFE3); for (const [x, z] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) caja(g, 0.1, 1.3, 0.1, COL.blanco, x, 0, z);
    caja(g, 2.2, 0.15, 1.5, COL.rojo, 0, 1.3, 0); for (const x of [-0.4, 0.4]) { caja(g, 0.25, 0.6, 0.2, COL.blanco, x, 0.08, 0); caja(g, 0.18, 0.15, 0.02, COL.negro, x, 0.5, 0.11); } },
  colegio(g) { caja(g, 2.6, 1.3, 1.6, 0xF2D0A9); caja(g, 2.7, 0.12, 1.7, COL.ladrillo, 0, 1.3, 0); caja(g, 0.5, 0.75, 0.04, COL.verde, 0, 0, 0.81);
    for (const x of [-0.9, -0.45, 0.45, 0.9]) caja(g, 0.3, 0.35, 0.04, COL.cristal, x, 0.7, 0.81, {roughness: 0.2}); cil(g, 0.02, 0.02, 1.2, COL.plata, 1.1, 1.42, 0.6, 6); caja(g, 0.35, 0.22, 0.02, 0xF2B705, 1.28, 2.3, 0.6); },
  hospital(g) { caja(g, 2.6, 2.2, 2.0, COL.blanco); caja(g, 2.7, 0.12, 2.1, 0xB0B8BF, 0, 2.2, 0); caja(g, 0.6, 0.18, 0.04, COL.rojo, 0, 1.75, 1.01); caja(g, 0.18, 0.6, 0.04, COL.rojo, 0, 1.55, 1.01);
    for (let y = 0.5; y < 1.5; y += 0.55) for (const x of [-0.9, -0.45, 0.45, 0.9]) caja(g, 0.3, 0.3, 0.04, COL.cristal, x, y, 1.01, {roughness: 0.2});
    caja(g, 0.8, 0.6, 0.04, COL.cristal, 0, 0, 1.01); cil(g, 0.6, 0.6, 0.04, 0x3A3F45, 0.5, 2.32, -0.4, 16); },
  // Base forestal
  pino(g) { tronco(g, 0.1, 0.6, 0, 0, 0x5A3E28); for (const [r, h, y, c] of [[0.6, 0.75, 0.38, 0x1F5A30], [0.48, 0.7, 0.8, 0x236637], [0.36, 0.62, 1.2, 0x28713D], [0.22, 0.5, 1.58, 0x2E7D44]]) {
      const m = cono(g, r, h, c, 0, y, 0, 9); m.material = matTex(c, "hierba", 4, 2, {roughness: 1, flatShading: true}); m.rotation.y = Math.random() * 3; } },
  torrevig(g) { for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { const p = caja(g, 0.08, 3, 0.08, COL.madera, x, 0, z); p.rotation.x = z * 0.05; p.rotation.z = -x * 0.05; }
    caja(g, 1.1, 0.7, 1.1, COL.madera, 0, 3); caja(g, 1.3, 0.12, 1.3, COL.verdeOsc, 0, 3.7); caja(g, 1.0, 0.3, 1.02, COL.cristal, 0, 3.3, 0, {roughness: 0.2}); },
  deposito(g) { cil(g, 0.9, 0.9, 1.6, 0x9DB4C0, 0, 0.9, 0, 16); cono(g, 0.95, 0.4, 0x7C97A6, 0, 2.5, 0, 16);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) caja(g, 0.1, 0.9, 0.1, COL.grisOsc, x, 0, z); },
  autoforestal(g) { camion(g, {largo: 2.5, alto: 1.0, color: 0xD9480F, franja: COL.amarillo}); caja(g, 1.2, 0.15, 0.85, COL.negro, -0.4, 1.22, 0); },
  helicoptero(g) { caja(g, 2.6, 0.06, 2.6, 0x5E666E); cil(g, 1.0, 1.0, 0.01, COL.blanco, 0, 0.06, 0, 24); const e = esfera(g, 0.55, COL.rojo, 0, 0.75, 0, 12); e.scale.set(1.5, 0.9, 0.9);
    caja(g, 1.4, 0.18, 0.18, COL.rojo, -1.1, 0.8, 0); caja(g, 0.08, 0.4, 0.05, COL.rojo, -1.75, 0.85, 0); caja(g, 0.5, 0.25, 0.6, COL.cristal, 0.45, 0.85, 0, {roughness: 0.2});
    for (const z of [-0.35, 0.35]) caja(g, 1.4, 0.05, 0.05, COL.negro, 0, 0.22, z); caja(g, 3.2, 0.03, 0.15, COL.negro, 0, 1.35, 0); caja(g, 0.15, 0.03, 3.2, COL.negro, 0, 1.35, 0); cil(g, 0.05, 0.05, 0.2, COL.negro, 0, 1.15, 0); },
  // Aeródromo y puerto
  lancha(g) { caja(g, 2.6, 0.2, 2.0, 0x2E86C1, 0, 0, 0); const c = caja(g, 1.8, 0.45, 0.8, 0xF28C28, 0, 0.2, 0); cono(g, 0.4, 0.6, 0xF28C28, 1.15, 0.2, 0).rotation.z = -Math.PI / 2;
    caja(g, 0.6, 0.4, 0.6, COL.blanco, -0.2, 0.65, 0); caja(g, 0.5, 0.2, 0.62, COL.cristal, -0.2, 0.8, 0, {roughness: 0.2}); caja(g, 0.2, 0.08, 0.3, COL.azul, -0.2, 1.06, 0, {emissive: 0x1b4aa8, emissiveIntensity: 0.6}); },
  hangar(g) { const t = sombra(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.2, 16, 1, false, 0, Math.PI), mat(0xB0B8BF)));
    t.rotation.z = Math.PI / 2; t.rotation.y = Math.PI / 2; g.add(t); caja(g, 2.0, 1.2, 0.05, COL.grisOsc, 0, 0, 1.6); caja(g, 3.4, 0.05, 3.4, 0x6B737B); },
  anfibio(g) { const f = cil(g, 0.3, 0.25, 2.6, COL.amarillo, 0, 0.8, 0, 12); f.rotation.z = Math.PI / 2; f.position.y = 0.9; caja(g, 0.7, 0.06, 3.6, COL.amarillo, 0.15, 1.1, 0);
    caja(g, 0.5, 0.5, 0.06, COL.rojo, -1.2, 1.0, 0); caja(g, 0.4, 0.06, 1.0, COL.amarillo, -1.2, 0.95, 0); for (const z of [-0.9, 0.9]) { cil(g, 0.18, 0.18, 0.3, COL.rojo, 0.35, 1.0, z).rotation.z = Math.PI / 2; }
    for (const z of [-0.6, 0.6]) caja(g, 1.8, 0.18, 0.22, COL.blanco, 0, 0.1, z); caja(g, 0.4, 0.2, 0.4, COL.cristal, 0.7, 1.05, 0, {roughness: 0.2}); caja(g, 2.6, 0.08, 2.6, 0x2E86C1, 0, 0, 0); },
};
export function modelo(id) {
  const g = new THREE.Group();
  (MODELOS[id] || MODELOS.extintor)(g);
  return g;
}

/* ---------- plano del parque y de la ciudad ---------- */
// Posición de cada pieza del parque inicial (x, z, giro, escala). El parque mide 24 × 20 unidades.
const SITIO = {
  mando: [-8.2, -4.5, 0, 1], sanitaria: [-8.2, -2.3, 0, 1], bul: [-8.2, -0.1, 0, 1], bup: [-8.2, 2.1, 0, 1], autoescala: [-8.2, 4.3, 0, 1], brazo: [-4.4, 6.2, Math.PI / 2, 1],
  edificio: [-3.5, -6.2, 0, 1.15], vestuarios: [0, -6.4, 0, 1], cocina: [2.6, -6.4, 0, 1], dormitorio: [5.2, -6.4, 0, 1], comunicaciones: [8, -6.4, 0, 1],
  epis: [-0.2, -3.4, 0, 1], gym: [2.6, -3.4, 0, 1], altura: [8.2, -3.2, 0, 1], humo: [5.4, -3.3, 0, 1], patio: [3.4, 0.2, 0, 1.4],
  extintor: [-4.2, -1.6, 0, 0.6], hacha: [-3.4, -1.6, 0, 0.6], linterna: [-2.6, -1.6, 0, 0.6], guantes: [-1.8, -1.6, 0, 0.6], casco: [-1, -1.6, 0, 0.6],
  cizalla: [-4.2, 0.2, 0, 0.6], cuerdas: [-3.4, 0.2, 0, 0.6], escalera: [-2.6, 0.2, 0, 0.6], era: [-1.8, 0.2, 0, 0.6], separador: [-1, 0.2, 0, 0.6],
  arbol: [9.5, 6.8, 0, 1], flores: [6.2, 7.2, 0, 1], palmera: [9.6, 3.2, 0, 1], naranjo: [2.4, 7, 0, 1],
  medalla: [-1.4, 4.4, 0, 0.9], placa: [0.2, 4.4, 0, 0.9],
};
// Zonas de la ciudad (rectángulos x0, x1, z0, z1) que rodean el parque.
export const AREAS = {
  parque: [-12, 12, -10, 10], explanada: [-12, 12, 10, 19], maniobras: [12, 34, -10, 19], barrio: [-12, 34, 19, 40],
  forestal: [-12, 34, -32, -10], aero: [-36, -12, -32, 40],
};
const COLOR_ZONA = {explanada: 0xD8CFB8, maniobras: 0xC9C4B8, barrio: 0x8E959C, forestal: 0x4E8A3E, aero: 0x6B737B};
const PASO = 3.4; // separación de las celdas donde se colocan solas las piezas de las zonas nuevas

const ETIQUETAS = new Set(); // rótulos: puntos del mapa con un texto que se dibuja en HTML encima (nunca se cortan)
function texto(t, color = "#1D1A19") {
  const o = new THREE.Object3D();
  o.userData.texto = t; o.userData.color = color;
  ETIQUETAS.add(o);
  return o;
}
function losa(g, w, d, col, x, z, y = 0) {
  // Hierba, asfalto y hormigón con grano; las líneas pintadas y lo muy pequeño, liso.
  const hsl = {}; new THREE.Color(col).getHSL(hsl);
  const verde = hsl.h > 0.2 && hsl.h < 0.45 && hsl.s > 0.2, fino = Math.min(w, d) < 0.5;
  const material = fino ? mat(col, {roughness: 0.7}) : matTex(col, verde ? "hierba" : "grano", w / (verde ? 5 : 3), d / (verde ? 5 : 3), {roughness: verde ? 1 : 0.88});
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), material); m.position.set(x, y - 0.1, z); m.receiveShadow = true; g.add(m); return m;
}
function suelo(scene) {
  const g = new THREE.Group();
  losa(g, 24, 20, 0x6FB35F, 0, 0, -0.02);
  losa(g, 5.4, 13.2, 0x555B62, -8.2, 0, 0.01);
  for (let z = -5.6; z <= 5.6; z += 2.2) losa(g, 3.6, 0.06, 0xF4F4F2, -8.2, z, 0.02);
  losa(g, 13.6, 6.2, 0xC9C4B8, 3.2, -4.8, 0.01);
  losa(g, 5, 3.6, 0xD9DEE2, -2.6, -0.7, 0.01);
  losa(g, 3.6, 1.8, 0xE8D9B5, -0.6, 4.4, 0.01);
  losa(g, 2, 3, 0xE8D9B5, -0.6, 8.5, 0.0);
  // Valla: murete de ladrillo con albardilla y reja metálica.
  const valla = (w, d, x, z) => { const L = Math.max(w, d), lw = w > d;
    const r = new THREE.Mesh(new THREE.BoxGeometry(lw ? w : 0.16, 0.3, lw ? 0.16 : d), matTex(0xffffff, "ladrillo", L * 1.5, 0.6)); r.position.set(x, 0.15, z); r.castShadow = r.receiveShadow = true; g.add(r);
    const a = new THREE.Mesh(new THREE.BoxGeometry(lw ? w : 0.22, 0.04, lw ? 0.22 : d), mat(0xD7DCE0)); a.position.set(x, 0.32, z); g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(lw ? w : 0.03, 0.03, lw ? 0.03 : d), mat(COL.grisOsc)); b.position.set(x, 0.72, z); g.add(b);
    const n = Math.floor(L / 0.4), ins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), mat(COL.grisOsc), n + 1), o = new THREE.Object3D();
    for (let i = 0; i <= n; i++) { o.position.set(lw ? x - w / 2 + i * L / n : x, 0.53, lw ? z : z - d / 2 + i * L / n); o.updateMatrix(); ins.setMatrixAt(i, o.matrix); } g.add(ins); };
  valla(23.2, 0.08, 0, -9.6); valla(10.6, 0.08, -6.9, 9.6); valla(10.6, 0.08, 6.3, 9.6); valla(0.08, 19.2, -11.6, 0); valla(0.08, 19.2, 11.6, 0);
  // Portada de la entrada con el rótulo del parque
  for (const x of [-1.8, 0.6]) { const p = caja(g, 0.36, 1.7, 0.36, COL.ladrillo, x, 0, 9.6); caja(g, 0.46, 0.07, 0.46, 0xD7DCE0, x, 1.7, 9.6); esfera(g, 0.09, 0xFFF2B3, x, 1.86, 9.6, 8, {emissive: 0xffe680, emissiveIntensity: 1}); }
  caja(g, 2.9, 0.34, 0.14, COL.rojo, -0.6, 1.3, 9.6); panel(g, 2.3, 0.26, matPanel("rotulo", "PARQUE DE BOMBEROS"), -0.6, 1.34, 9.675); panel(g, 2.3, 0.26, matPanel("rotulo", "PARQUE DE BOMBEROS"), -0.6, 1.34, 9.525, "z-");
  const r = texto("🚒 Parque", "#8E0E17"); r.position.set(-0.6, 2.8, 9.6); g.add(r);
  scene.add(g);
}
function zonaSuelo(scene, id, abierta, horas) {
  const [x0, x1, z0, z1] = AREAS[id], w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const g = new THREE.Group();
  if (!abierta) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), new THREE.MeshStandardMaterial({color: 0xBFC5CA, transparent: true, opacity: 0.55}));
    m.position.set(cx, -0.12, cz); g.add(m);
    const t = texto(`🔒 ${CIUDAD_NOMBRE[id] ? CIUDAD_NOMBRE[id].replace(/^\S+ /, "") + " · " : ""}${horas} h`); t.position.set(cx, 2.2, cz); g.add(t);
  } else {
    losa(g, w, d, COLOR_ZONA[id], cx, cz, -0.02);
    if (id === "barrio") { for (let x = x0 + 4; x < x1; x += 8) losa(g, 1.2, d, 0x4A4F55, x, cz, 0.01); for (let z = z0 + 4; z < z1; z += 8) losa(g, w, 1.2, 0x4A4F55, cx, z, 0.01); }
    if (id === "maniobras") { for (let x = x0 + 2; x < x1; x += 4) losa(g, 0.12, d - 2, 0xF2B705, x, cz, 0.02); }
    if (id === "aero") { losa(g, w, 18, 0x2E86C1, cx, z1 - 9, 0.0); losa(g, 3, 40, 0x4A4F55, cx, z0 + 20, 0.02); for (let z = z0 + 2; z < z0 + 40; z += 3) losa(g, 0.3, 1.4, 0xF4F4F2, cx, z, 0.03); }
    if (id === "forestal") { losa(g, 2, d, 0x9C7A4D, x0 + 6, cz, 0.01); }
    const t = texto(CIUDAD_NOMBRE[id] || id); t.position.set(cx, 2.2, cz); g.add(t);
  }
  scene.add(g);
  return g;
}
const CIUDAD_NOMBRE = {explanada: "Explanada", maniobras: "🧯 Maniobras", barrio: "🏬 Barrio", forestal: "🌲 Forestal", aero: "🛩️ Aeródromo"};
function parcela(scene, x, z, s) {
  const w = s < 0.8 ? 0.7 : s > 1.2 ? 3 : 2;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.28}));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z);
  scene.add(m);
  return m;
}
// Sitio por defecto de una pieza: la parcela del parque o la siguiente celda libre de su zona.
function sitioPorDefecto(p, zona, ocupadas, abiertas) {
  if (SITIO[p.id] && !p.key.includes("_")) return SITIO[p.id];
  // Copias repetidas de piezas del parque: a la explanada; si se llena, a cualquier zona abierta.
  const orden = [zona === "parque" ? "explanada" : zona, "explanada", ...abiertas].filter((z, i, a) => z !== "parque" && a.indexOf(z) === i && (z === "explanada" || abiertas.includes(z)));
  for (const zn of orden) {
    const [x0, x1, z0, z1] = AREAS[zn];
    for (let z = z0 + PASO / 2 + 0.4; z < z1 - 1; z += PASO) for (let x = x0 + PASO / 2 + 0.4; x < x1 - 1; x += PASO) {
      const k = `${Math.round(x * 10)},${Math.round(z * 10)}`;
      if (!ocupadas.has(k)) { ocupadas.add(k); return [x, z, 0, SITIO[p.id] ? Math.min(1, SITIO[p.id][3]) : 1]; }
    }
  }
  return [(Math.random() - 0.5) * 20, 14, 0, 1];
}
const dentro = (x, z, zonas) => [...zonas, "parque", "explanada"].some(id => { const [x0, x1, z0, z1] = AREAS[id]; return x > x0 + 0.3 && x < x1 - 0.3 && z > z0 + 0.3 && z < z1 - 0.3; });

/* ---------- vida del parque: bomberos que andan, cogen el material y usan lo que vas consiguiendo ---------- */
// Cuantas más piezas, más bomberos (de 1 a 8) y más cosas que hacer: cada tipo de pieza trae su acción.
export const nBomberos = n => Math.min(8, 1 + Math.ceil(n / 4));
const ACCION = {};
for (const id of ["extintor", "hacha", "linterna", "guantes", "casco", "cizalla", "cuerdas", "escalera", "era", "separador"]) ACCION[id] = "coger";
for (const id of ["mando", "sanitaria", "bul", "bup", "autoescala", "brazo", "autoforestal", "lancha", "anfibio"]) ACCION[id] = "lavar";
for (const id of ["edificio", "vestuarios", "cocina", "dormitorio", "comunicaciones", "humo", "epis", "bloque", "colegio", "hospital", "gasolinera", "hangar", "tunel", "colapso"]) ACCION[id] = "entrar";
for (const id of ["altura", "torrevig"]) ACCION[id] = "trepar";
for (const id of ["gym", "patio"]) ACCION[id] = "ejercicio";
for (const id of ["arbol", "flores", "palmera", "naranjo", "pino", "contenedor", "glp"]) ACCION[id] = "regar";
for (const id of ["medalla", "placa"]) ACCION[id] = "saludar";
for (const id of ["cocheexc"]) ACCION[id] = "golpear";
ACCION.helicoptero = "volar";
export const ACCIONES_TEXTO = {coger: "coger el material y practicar con él", lavar: "lavar los vehículos", entrar: "entrar y salir de las instalaciones",
  trepar: "subir a la torre", ejercicio: "entrenar", regar: "echar agua", saludar: "saludar ante los trofeos", golpear: "practicar excarcelación", volar: "salir en helicóptero"};
export function accionesDe(ids) { return [...new Set(ids.map(id => ACCION[id]).filter(Boolean))]; }

const PIEL = 0xE0AC80, TRAJE = 0x1B2540;
// Bombero con traje de intervención: botas, pantalón y chaquetón con bandas reflectantes, guantes, botella de aire y casco con visor.
function crearBombero(casco) {
  const g = new THREE.Group(), cuerpo = new THREE.Group();
  cuerpo.scale.setScalar(1.35); // algo más grandes de lo real para que se vean bien desde lejos
  g.add(cuerpo);
  const capsula = (p, r, l, c, x, y, z, extra) => { const m = sombra(new THREE.Mesh(geo(`k${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14)), mat(c, extra))); m.position.set(x, y, z); p.add(m); return m; };
  const banda = (p, r, y) => cil(p, r, r, 0.03, 0xE8F04A, 0, y, 0, 14, {emissive: 0x8a9000, emissiveIntensity: 0.35, roughness: 0.35});
  const pierna = x => { const p = new THREE.Group(); p.position.set(x, 0.32, 0); capsula(p, 0.062, 0.17, TRAJE, 0, -0.14, 0, {roughness: 0.8}); banda(p, 0.066, -0.2);
    caja(p, 0.11, 0.09, 0.19, COL.negro, 0, -0.32, 0.03); cuerpo.add(p); return p; };
  const brazo = x => { const p = new THREE.Group(); p.position.set(x, 0.63, 0); capsula(p, 0.048, 0.16, TRAJE, 0, -0.12, 0, {roughness: 0.8}); banda(p, 0.052, -0.19);
    esfera(p, 0.05, 0x2B2B2B, 0, -0.27, 0); cuerpo.add(p); return p; };
  const pi = pierna(-0.075), pd = pierna(0.075);
  const torso = capsula(cuerpo, 0.135, 0.14, TRAJE, 0, 0.5, 0, {roughness: 0.8}); torso.scale.set(1.08, 1, 0.78);
  for (const y of [0.4, 0.55]) { const b = banda(cuerpo, 0.14, y); b.scale.set(1.09, 1, 0.8); }
  caja(cuerpo, 0.03, 0.26, 0.012, 0xE8F04A, 0, 0.37, 0.108);
  cil(cuerpo, 0.05, 0.05, 0.26, COL.amarillo, 0, 0.36, -0.14, 14); esfera(cuerpo, 0.05, COL.amarillo, 0, 0.62, -0.14); caja(cuerpo, 0.16, 0.2, 0.03, COL.negro, 0, 0.38, -0.1);
  const bi = brazo(-0.195), bd = brazo(0.195);
  cil(cuerpo, 0.045, 0.05, 0.05, PIEL, 0, 0.66, 0, 12);
  const cabeza = esfera(cuerpo, 0.095, PIEL, 0, 0.775, 0, 0, {roughness: 0.7}); cabeza.scale.set(0.95, 1.05, 1);
  // Casco integral con cresta, visor dorado y cubrenucas.
  const c = sombra(new THREE.Mesh(geo("casco", () => new THREE.SphereGeometry(0.118, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56)), mat(casco, {roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08})));
  c.position.set(0, 0.79, -0.005); c.scale.set(1, 1.08, 1.1); cuerpo.add(c);
  caja(cuerpo, 0.03, 0.05, 0.2, casco, 0, 0.895, -0.01, {roughness: 0.25, clearcoat: 1});
  const v = sombra(new THREE.Mesh(geo("visor", () => new THREE.SphereGeometry(0.122, 18, 8, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.36, Math.PI * 0.2)), mat(COL.oro, {roughness: 0.12, metalness: 1})));
  v.position.set(0, 0.79, 0.004); v.scale.set(1, 1.08, 1.1); cuerpo.add(v);
  caja(cuerpo, 0.2, 0.07, 0.03, 0x2B2B2B, 0, 0.7, -0.1); caja(cuerpo, 0.06, 0.045, 0.012, COL.plata, 0, 0.84, 0.118);
  return {g, cuerpo, pi, pd, bi, bd};
}

// Devuelve {actualizar(piezas, ids, abiertas), paso(dt), parar(on)}; `piezas` = {key: Group}, `ids` = {key: id}.
function crearVida(scene) {
  const bomberos = [], gotas = [], libres = [];
  const geoGota = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  let piezas = {}, ids = {}, abiertas = ["parque"], quieto = false;
  const caja3 = new THREE.Box3(), tam = new THREE.Vector3();
  const azar = (a, b) => a + Math.random() * (b - a);
  const elige = l => l[Math.floor(Math.random() * l.length)];

  function gota(x, y, z, vx, vy, vz, color, vida = 0.7, cae = true) {
    if (gotas.length > 140) return;
    const m = libres.pop() || new THREE.Mesh(geoGota, mat(color));
    m.material = mat(color); m.position.set(x, y, z); m.visible = true; m.scale.setScalar(1);
    scene.add(m); gotas.push({m, vx, vy, vz, vida, t: 0, cae});
  }
  // Medidas de una pieza y el punto de delante (su lado +z, donde están las puertas) para colocarse.
  function medidas(p) {
    caja3.setFromObject(p); caja3.getSize(tam);
    return [tam.x, tam.y, tam.z];
  }
  function delante(p, extra = 0.3) {
    const [w, , d] = medidas(p), r = p.rotation.y, lado = Math.abs(Math.sin(r)) > 0.7 ? w : d;
    return [p.position.x + Math.sin(r) * (lado / 2 + extra), p.position.z + Math.cos(r) * (lado / 2 + extra)];
  }
  const mirar = (b, x, z) => { b.g.rotation.y = Math.atan2(x - b.g.position.x, z - b.g.position.z); };
  function pose(b) { for (const k of ["pi", "pd", "bi", "bd"]) b[k].rotation.set(0, 0, 0); b.cuerpo.position.y = 0; b.cuerpo.rotation.x = 0; }
  function manos(b) { return [b.g.position.x + Math.sin(b.g.rotation.y) * 0.35, b.g.position.y + 0.65, b.g.position.z + Math.cos(b.g.rotation.y) * 0.4]; }
  function chorro(b, color, fuerza = 2.2, arriba = 1.2) {
    const [x, y, z] = manos(b), r = b.g.rotation.y + azar(-0.25, 0.25);
    gota(x, y, z, Math.sin(r) * fuerza, arriba + azar(-0.3, 0.3), Math.cos(r) * fuerza, color);
  }

  /* --- planes: cada uno es una lista de pasos {ir: () => [x, z]} o {hacer, dur, al?, cada?, fin?} --- */
  function puntoLibre() {
    const z = Math.random() < 0.75 ? "parque" : elige(["explanada", ...abiertas]);
    const [x0, x1, z0, z1] = AREAS[z] || AREAS.parque;
    return [azar(x0 + 1, x1 - 1), azar(z0 + 1, z1 - 1)];
  }
  function pasear() { const p = puntoLibre(); return [{ir: () => p}, {hacer: "esperar", dur: azar(0.6, 2.5)}]; }
  function soltarCarga(b) { if (b.carga) { b.cuerpo.remove(b.carga); b.carga = null; } }
  function plan(b, key) {
    const p = piezas[key], id = ids[key], que = ACCION[id];
    if (!p || !que) return pasear();
    p.userData.ocupada = true;
    const libre = () => { p.userData.ocupada = false; };
    const frente = {ir: () => delante(p), al: () => mirar(b, p.position.x, p.position.z)};
    const cara = () => mirar(b, p.position.x, p.position.z);
    b.deshacer = () => { libre(); p.visible = true; soltarCarga(b); b.g.visible = true; b.g.scale.setScalar(1); b.g.position.y = 0; if (que === "volar") p.position.y = 0; };
    if (que === "coger") {
      const donde = Object.keys(piezas).find(k => ids[k] === "patio");
      const sitio = donde ? [piezas[donde].position.x + azar(-1, 1), piezas[donde].position.z + azar(-0.8, 0.8)] : [azar(1, 6), azar(1, 5)];
      const usar = id === "extintor" ? "rociar" : ["hacha", "cizalla", "separador"].includes(id) ? "golpear" : id === "linterna" ? "alumbrar" : "practicar";
      return [frente, {hacer: "agachar", dur: 0.7, al: cara, fin: () => {
        p.visible = false;
        b.carga = p.children[0].clone(); b.carga.scale.setScalar(0.36 * (p.userData.s || 1) / 0.6); b.carga.position.set(0, 0.34, 0.2); b.cuerpo.add(b.carga);
      }}, {ir: () => sitio}, {hacer: usar, dur: azar(3.5, 5.5)}, {ir: () => delante(p)},
      {hacer: "agachar", dur: 0.7, al: cara, fin: () => { soltarCarga(b); p.visible = true; libre(); }}];
    }
    if (que === "entrar" || que === "volar") {
      const humo = id === "humo", alto = medidas(p)[1];
      return [frente, {hacer: "entrar", dur: 0.45, al: cara, fin: () => { b.g.visible = false; }},
        {hacer: "dentro", dur: que === "volar" ? 9 : azar(3, 6), cada: (t, dur) => {
          if (humo && Math.random() < 0.35) gota(p.position.x + azar(-0.4, 0.4), alto, p.position.z + azar(-0.4, 0.4), azar(-0.2, 0.2), azar(0.6, 1.1), azar(-0.2, 0.2), 0x7C8288, 1.6, false);
          if (que === "volar") { const k = t / dur; p.position.y = 3.2 * Math.sin(Math.PI * Math.min(1, k)) ** 0.6; p.rotation.y += 0.004; }
        }, fin: () => { if (que === "volar") p.position.y = 0; b.g.visible = true; }},
        {hacer: "salir", dur: 0.45, fin: libre}];
    }
    if (que === "trepar") {
      const alto = Math.max(1, medidas(p)[1] - 0.55);
      return [frente, {hacer: "trepar", dur: 8, al: cara, alto, fin: () => { b.g.position.y = 0; libre(); }}];
    }
    if (que === "lavar" || que === "regar") return [frente, {hacer: que, dur: azar(4, 6), al: cara, fin: libre}];
    if (que === "ejercicio") {
      const s = [p.position.x + azar(-0.6, 0.6), p.position.z + azar(-0.5, 0.5)];
      return [{ir: () => (id === "patio" ? s : delante(p, 0.1))}, {hacer: elige(["saltos", "flexiones"]), dur: azar(4, 7), fin: libre}];
    }
    return [frente, {hacer: que, dur: que === "saludar" ? 2.2 : 4, al: cara, fin: libre}];
  }
  function planear(b) {
    b.deshacer = null;
    const libresK = Object.keys(piezas).filter(k => ACCION[ids[k]] && !piezas[k].userData.ocupada && piezas[k].visible);
    if (quieto || !libresK.length || Math.random() < 0.3) return pasear();
    // Para que se vea de todo, primero se elige la acción y luego una pieza con esa acción.
    const que = elige(accionesDe(libresK.map(k => ids[k])));
    return plan(b, elige(libresK.filter(k => ACCION[ids[k]] === que)));
  }

  function animar(b, p, dt) {
    const t = p.t, s = Math.sin(t * 9);
    switch (p.hacer) {
      case "agachar": b.cuerpo.rotation.x = 0.7 * Math.sin(Math.PI * t / p.dur); b.bi.rotation.x = b.bd.rotation.x = -1.2; break;
      case "rociar": b.bi.rotation.x = b.bd.rotation.x = -1.4; if (Math.random() < 0.6) chorro(b, 0xF4F4F2, 2.4, 0.5); break;
      case "regar": case "lavar": b.bi.rotation.x = b.bd.rotation.x = -1.3 + 0.15 * s; if (Math.random() < 0.5) chorro(b, 0x6EC1F2, 1.8, p.hacer === "lavar" ? 1.6 : 1); break;
      case "golpear": b.bi.rotation.x = b.bd.rotation.x = -1.6 + 1.1 * Math.abs(Math.sin(t * 5)); b.cuerpo.rotation.x = 0.2 * Math.abs(Math.sin(t * 5)); break;
      case "alumbrar": b.bd.rotation.x = -1.5; b.g.rotation.y += dt * 0.9; break;
      case "practicar": b.bi.rotation.x = -1.2 + 0.4 * s; b.bd.rotation.x = -1.2 - 0.4 * s; break;
      case "saltos": b.cuerpo.position.y = 0.16 * Math.abs(Math.sin(t * 6)); b.bi.rotation.z = -1.3 * Math.abs(Math.sin(t * 6)); b.bd.rotation.z = 1.3 * Math.abs(Math.sin(t * 6)); break;
      case "flexiones": b.cuerpo.rotation.x = 1.35; b.cuerpo.position.y = -0.12 + 0.07 * Math.sin(t * 5); b.bi.rotation.x = b.bd.rotation.x = -1.35; break;
      case "saludar": b.bd.rotation.z = 2.4; b.bd.rotation.x = -0.3; break;
      case "entrar": b.g.scale.setScalar(Math.max(0.05, 1 - t / p.dur)); break;
      case "salir": b.g.scale.setScalar(Math.min(1, t / p.dur)); break;
      case "trepar": {
        const k = t / p.dur, sube = k < 0.4 ? k / 0.4 : k < 0.6 ? 1 : (1 - k) / 0.4;
        b.g.position.y = p.alto * Math.max(0, sube);
        if (k >= 0.4 && k < 0.6) { b.bd.rotation.z = 2.4; b.bi.rotation.x = 0; } else { b.bi.rotation.x = -2.2 + 0.5 * s; b.bd.rotation.x = -2.2 - 0.5 * s; b.pi.rotation.x = 0.4 * s; b.pd.rotation.x = -0.4 * s; }
        break; }
      default: break;
    }
    if (p.cada) p.cada(t, p.dur);
  }
  function cancelar(b) { if (b.deshacer) b.deshacer(); b.deshacer = null; b.pasos = []; pose(b); }

  return {
    actualizar(pz, idDe, ab) {
      piezas = pz; ids = idDe; abiertas = ab.filter(z => AREAS[z]);
      const n = nBomberos(Object.keys(piezas).length);
      const cascos = [COL.amarillo, COL.amarillo, COL.rojo, COL.amarillo, COL.blanco, COL.amarillo, COL.rojo, COL.amarillo];
      while (bomberos.length < n) {
        const b = crearBombero(cascos[bomberos.length % cascos.length]);
        b.g.position.set(azar(-2, 6), 0, azar(2, 8)); b.pasos = []; b.fase = Math.random() * 6; b.vel = azar(1.25, 1.6);
        scene.add(b.g); bomberos.push(b);
      }
    },
    parar(on) { quieto = on; if (on) bomberos.forEach(cancelar); },
    paso(dt) {
      for (const b of bomberos) {
        const p = b.pasos[0];
        if (!p) { b.pasos = planear(b); continue; }
        if (p.ir) {
          if (!p.dest) p.dest = p.ir();
          const dx = p.dest[0] - b.g.position.x, dz = p.dest[1] - b.g.position.z, d = Math.hypot(dx, dz);
          if (d < 0.08) { pose(b); if (p.al) p.al(); b.pasos.shift(); continue; }
          const a = Math.min(d, b.vel * dt);
          b.g.position.x += dx / d * a; b.g.position.z += dz / d * a;
          b.g.rotation.y = Math.atan2(dx, dz);
          b.fase += dt * 9;
          const s = Math.sin(b.fase) * 0.6;
          b.pi.rotation.x = s; b.pd.rotation.x = -s;
          if (b.carga) b.bi.rotation.x = b.bd.rotation.x = -1.2; else { b.bi.rotation.x = -s; b.bd.rotation.x = s; }
          b.cuerpo.position.y = 0.02 * Math.abs(Math.cos(b.fase));
        } else {
          if (p.t === undefined) { p.t = 0; pose(b); if (p.al) p.al(); }
          p.t += dt;
          animar(b, p, dt);
          if (p.t >= p.dur) { pose(b); if (p.fin) p.fin(); b.pasos.shift(); }
        }
      }
      for (let i = gotas.length - 1; i >= 0; i--) {
        const g = gotas[i]; g.t += dt;
        if (g.cae) g.vy -= 5 * dt;
        g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
        if (!g.cae) g.m.scale.setScalar(1 + g.t * 2);
        if (g.t > g.vida || g.m.position.y < 0) { scene.remove(g.m); libres.push(g.m); gotas.splice(i, 1); }
      }
    },
  };
}

const ZOOM_GENERAL = 0.5; // la vista general se ve alejada: todo el parque y la ciudad de un vistazo
let inst = null;
// Visor de la ciudad (se reutiliza): opciones {piezas: [{key, id}], zonaDe: {id: zona}, pos: {key: [x, z, giro]},
// abiertas: [zonas], horas: {zona: horas}, nuevos: [keys], onMover(key, [x, z, giro])}.
export function parque(op) {
  if (!inst) inst = crearParque();
  inst.actualizar(op);
  return inst.el;
}
export function editar(on) { if (inst) inst.editar(on); }
function crearParque() {
  const el = document.createElement("div");
  el.className = "parque3d";
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  cam.position.set(30, 30, 30); cam.lookAt(0, 0, 0);
  cam.zoom = ZOOM_GENERAL; cam.updateProjectionMatrix();
  const conReflejos = ambiente(renderer, scene);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b8f5e, conReflejos ? 0.35 : 0.9));
  const sol = new THREE.DirectionalLight(0xfff1dc, conReflejos ? 2.6 : 1.5);
  sol.position.set(16, 24, 9); sol.castShadow = true;
  sol.shadow.mapSize.set(4096, 4096); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03; sol.shadow.radius = 3;
  Object.assign(sol.shadow.camera, {left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120});
  scene.add(sol);
  suelo(scene);
  const ctr = new Orbit(cam, renderer.domElement);
  Object.assign(ctr, {enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.7, zoomSpeed: 1.1, panSpeed: 0.9,
    minZoom: 0.3, maxZoom: 5, maxPolarAngle: 1.2, minPolarAngle: 0.45, screenSpacePanning: true, zoomToCursor: true});
  // Botones sobre el mapa: vista general y pantalla completa.
  const capa = document.createElement("div");
  capa.className = "p3d-etiquetas";
  el.appendChild(capa);
  const divs = new Map(), vtmp = new THREE.Vector3();
  const enEscena = o => { while (o.parent) o = o.parent; return o === scene; };
  function dibujarEtiquetas() {
    const w = el.clientWidth, h = el.clientHeight, puestas = [];
    for (const o of ETIQUETAS) {
      let d = divs.get(o);
      if (!enEscena(o)) { if (d) { d.remove(); divs.delete(o); } continue; }
      if (!d) { d = document.createElement("span"); d.className = "p3d-et"; d.textContent = o.userData.texto; d.style.color = o.userData.color; capa.appendChild(d); divs.set(o, d); }
      o.getWorldPosition(vtmp); vtmp.project(cam);
      const dw = d.offsetWidth, dh = d.offsetHeight, m = 6;
      let x = (vtmp.x + 1) / 2 * w - dw / 2, y = (1 - vtmp.y) / 2 * h - dh / 2;
      x = Math.max(m, Math.min(w - dw - m, x)); y = Math.max(m + 40, Math.min(h - dh - m, y));
      // Si pisa a otra etiqueta, se aparta hacia abajo (o hacia arriba si no cabe).
      for (let i = 0; i < 8 && puestas.some(r => x < r.x + r.w + 4 && x + dw + 4 > r.x && y < r.y + r.h + 3 && y + dh + 3 > r.y); i++) {
        y = y + dh + 4 <= h - dh - m ? y + dh + 4 : Math.max(m + 40, y - (dh + 4) * (i + 1));
      }
      puestas.push({x, y, w: dw, h: dh});
      d.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
  const barra = document.createElement("div");
  barra.className = "p3d-barra";
  barra.innerHTML = `<button data-p="general" title="Vista general">🗺️ Vista general</button><button data-p="completa" title="Pantalla completa">⛶</button>`;
  el.appendChild(barra);
  const ir = {objetivo: null, zoom: null};
  const vistaGeneral = () => { ir.objetivo = new THREE.Vector3(0, 0, 0); ir.zoom = ZOOM_GENERAL; };
  barra.querySelector('[data-p="general"]').onclick = vistaGeneral;
  barra.querySelector('[data-p="completa"]').onclick = () => {
    const doc = document;
    if (doc.fullscreenElement === el) { doc.exitFullscreen(); return; }
    if (el.classList.contains("completa")) { el.classList.remove("completa"); document.body.classList.remove("p3d-completa"); setTimeout(tamano, 50); return; }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => { el.classList.add("completa"); document.body.classList.add("p3d-completa"); setTimeout(tamano, 50); });
    else { el.classList.add("completa"); document.body.classList.add("p3d-completa"); setTimeout(tamano, 50); }
  };
  document.addEventListener("fullscreenchange", () => setTimeout(tamano, 50));
  const piezas = {}, parcelas = {}, anims = [], zonasG = {}, fantasmas = {};
  // Silueta transparente de cada pieza que aún no tienes, en su sitio: así se ve todo lo que falta por conseguir.
  const matFantasma = new THREE.MeshStandardMaterial({color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, roughness: 1});
  for (const [id, [x, z, r, sc]] of Object.entries(SITIO)) {
    const g = modelo(id);
    g.traverse(o => { if (o.isMesh) { o.material = matFantasma; o.castShadow = false; o.receiveShadow = false; } });
    g.position.set(x, 0, z); g.rotation.y = r; g.scale.setScalar(sc);
    scene.add(g); fantasmas[id] = g;
  }
  let op = {piezas: [], pos: {}, abiertas: ["parque"], onMover: null}, modoEditar = false;
  const vida = crearVida(scene), idDe = {};
  let tAnt = performance.now();
  for (const [id, [x, z, , s]] of Object.entries(SITIO)) parcelas[id] = parcela(scene, x, z, s);

  function colocar(p, sitio, animar) {
    const [x, z, r, s] = sitio;
    let g = piezas[p.key];
    if (!g) {
      g = new THREE.Group(); g.add(modelo(p.id)); g.userData = {key: p.key, s: s || 1};
      scene.add(g); piezas[p.key] = g;
      if (animar) { g.scale.setScalar(0.01); anims.push({g, s: s || 1, t0: performance.now()}); } else g.scale.setScalar(s || 1);
    }
    g.position.set(x, 0, z); g.rotation.y = r || 0;
  }
  function tamano() {
    const w = el.clientWidth || 360, h = el.clientHeight || 320;
    renderer.setSize(w, h, false);
    const a = w / h, v = Math.max(11, 14.5 / a);
    Object.assign(cam, {left: -v * a, right: v * a, top: v, bottom: -v});
    cam.updateProjectionMatrix();
  }
  new ResizeObserver(tamano).observe(el);

  // Mover piezas: en modo editar, arrastra una pieza por el suelo; doble toque la gira 90°.
  const ray = new THREE.Raycaster(), plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v2 = new THREE.Vector2(), punto = new THREE.Vector3();
  let arrastre = null, ultimoToque = {key: null, t: 0}, toque = null;
  // Tocar un punto del mapa (sin arrastrar) acerca la vista a ese sitio.
  renderer.domElement.addEventListener("pointerdown", e => { toque = {x: e.clientX, y: e.clientY, t: performance.now(), n: (toque && performance.now() - toque.t < 50) ? 2 : 1}; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (modoEditar || !toque || toque.n > 1) return;
    if (Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > 6 || performance.now() - toque.t > 400) return;
    rayo(e);
    if (ray.ray.intersectPlane(plano, punto)) { ir.objetivo = punto.clone(); ir.zoom = Math.max(cam.zoom, 2.2); }
  });
  const rayo = e => { const r = renderer.domElement.getBoundingClientRect(); v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v2, cam); };
  const piezaDe = o => { while (o && !(o.userData && o.userData.key)) o = o.parent; return o; };
  renderer.domElement.addEventListener("pointerdown", e => {
    if (!modoEditar) return;
    rayo(e);
    const hit = ray.intersectObjects(Object.values(piezas), true)[0];
    if (!hit) return;
    const g = piezaDe(hit.object);
    const t = performance.now();
    if (ultimoToque.key === g.userData.key && t - ultimoToque.t < 350) {
      g.rotation.y += Math.PI / 2;
      op.onMover && op.onMover(g.userData.key, [g.position.x, g.position.z, g.rotation.y % (Math.PI * 2)]);
      ultimoToque = {key: null, t: 0}; return;
    }
    ultimoToque = {key: g.userData.key, t};
    arrastre = {g, x: g.position.x, z: g.position.z};
    ctr.enabled = false; g.position.y = 0.35;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", e => {
    if (!arrastre) return;
    rayo(e);
    if (ray.ray.intersectPlane(plano, punto)) {
      const x = Math.round(punto.x * 2) / 2, z = Math.round(punto.z * 2) / 2;
      arrastre.g.position.x = x; arrastre.g.position.z = z;
    }
  });
  const soltar = () => {
    if (!arrastre) return;
    const g = arrastre.g; g.position.y = 0; ctr.enabled = true;
    if (!dentro(g.position.x, g.position.z, op.abiertas)) { g.position.x = arrastre.x; g.position.z = arrastre.z; }
    else if (g.position.x !== arrastre.x || g.position.z !== arrastre.z) op.onMover && op.onMover(g.userData.key, [g.position.x, g.position.z, g.rotation.y % (Math.PI * 2)]);
    arrastre = null;
  };
  renderer.domElement.addEventListener("pointerup", soltar);
  renderer.domElement.addEventListener("pointercancel", soltar);

  (function bucle() {
    requestAnimationFrame(bucle);
    if (!el.isConnected) return;
    const t = performance.now();
    vida.paso(Math.min(0.05, (t - tAnt) / 1000)); tAnt = t;
    if (luzAzul) luzAzul.emissiveIntensity = (t % 1100 < 120 || (t % 1100 > 240 && t % 1100 < 360)) ? 4 : 0.5;
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i], k = Math.min(1, (t - a.t0) / 700);
      const e = k < 1 ? 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) : 1;
      a.g.scale.setScalar(Math.max(0.01, a.s * e));
      if (k >= 1) anims.splice(i, 1);
    }
    // Vuelo suave hacia el punto tocado o la vista general.
    if (ir.objetivo) {
      const d = ir.objetivo.clone().sub(ctr.target).multiplyScalar(0.12);
      ctr.target.add(d); cam.position.add(d);
      if (ir.zoom) { cam.zoom += (ir.zoom - cam.zoom) * 0.12; cam.updateProjectionMatrix(); }
      if (d.length() < 0.01 && (!ir.zoom || Math.abs(ir.zoom - cam.zoom) < 0.01)) { ir.objetivo = null; ir.zoom = null; }
    }
    ctr.update();
    renderer.render(scene, cam);
    dibujarEtiquetas();
  })();
  return {
    el,
    editar(on) { if (on !== modoEditar) vida.parar(on); modoEditar = on; el.classList.toggle("editando", on); },
    actualizar(o) {
      op = {...op, ...o};
      // Zonas: suelo abierto o bloqueado con el aviso de las horas.
      for (const id of Object.keys(AREAS)) {
        if (id === "parque") continue;
        const ab = id === "explanada" || op.abiertas.includes(id);
        if (!zonasG[id] || zonasG[id].userData.ab !== ab) {
          if (zonasG[id]) scene.remove(zonasG[id]);
          zonasG[id] = zonaSuelo(scene, id, ab, (op.horas || {})[id] || 0); zonasG[id].userData.ab = ab;
        }
      }
      const ocupadas = new Set();
      for (const v of Object.values(op.pos)) ocupadas.add(`${Math.round(v[0] * 10)},${Math.round(v[1] * 10)}`);
      for (const p of op.piezas) {
        const zona = (op.zonaDe || {})[p.id] || "parque";
        const esc = SITIO[p.id] ? (p.key.includes("_") ? Math.min(1, SITIO[p.id][3]) : SITIO[p.id][3]) : 1;
        const sitio = op.pos[p.key] ? [...op.pos[p.key], esc] : sitioPorDefecto(p, zona, ocupadas, op.abiertas);
        if (piezas[p.key] && piezas[p.key].userData.ocupada) { idDe[p.key] = p.id; continue; } // la está usando un bombero
        colocar(p, sitio, (op.nuevos || []).includes(p.key)); idDe[p.key] = p.id;
        if (parcelas[p.id] && !p.key.includes("_")) parcelas[p.id].visible = false;
        if (fantasmas[p.id] && !p.key.includes("_")) fantasmas[p.id].visible = false;
      }
      vida.actualizar(piezas, idDe, op.abiertas);
      tamano();
    },
  };
}

/* ---------- miniaturas (tienda, selector) y visor del temporizador ---------- */
let mini = null;
const miniCache = new Map();
export function miniatura(id) {
  if (miniCache.has(id)) return miniCache.get(id);
  if (!mini) {
    const r = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false});
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(1); r.setSize(160, 160);
    const scene = new THREE.Scene();
    const refl = ambiente(r, scene, 1.1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, refl ? 0.4 : 1.0));
    const l = new THREE.DirectionalLight(0xffffff, refl ? 2.2 : 1.2); l.position.set(3, 5, 4); scene.add(l);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    mini = {r, scene, cam};
  }
  const g = modelo(id);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  g.position.sub(c);
  mini.scene.add(g);
  const d = size * 1.35;
  mini.cam.position.set(d * 0.75, d * 0.55, d * 0.75); mini.cam.lookAt(0, 0, 0);
  mini.r.render(mini.scene, mini.cam);
  const url = mini.r.domElement.toDataURL("image/png");
  mini.scene.remove(g);
  miniCache.set(id, url);
  return url;
}
// Visor pequeño que gira con la pieza creciendo (temporizador).
let visor = null;
export function visorCreciendo(contenedor, id, crece, perdido) {
  if (!visor) {
    const r = new THREE.WebGLRenderer({antialias: true, alpha: true, premultipliedAlpha: false});
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(220, 220);
    const scene = new THREE.Scene();
    const refl = ambiente(r, scene, 1.1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, refl ? 0.4 : 1.0));
    const l = new THREE.DirectionalLight(0xffffff, refl ? 2.2 : 1.3); l.position.set(3, 6, 4); scene.add(l);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.2, 24), mat(0x7CC46F)); base.position.y = -0.1; scene.add(base);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100); cam.position.set(5.2, 3.6, 5.2); cam.lookAt(0, 0.8, 0);
    visor = {r, scene, cam, g: null, id: null, ang: 0};
    (function bucle() {
      requestAnimationFrame(bucle);
      if (!visor.r.domElement.isConnected) return;
      visor.ang += 0.01;
      if (visor.g) visor.g.rotation.y = visor.ang;
      visor.r.render(visor.scene, visor.cam);
    })();
  }
  if (visor.id !== id + (perdido ? "x" : "")) {
    if (visor.g) visor.scene.remove(visor.g);
    const g = modelo(id);
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
    const k = 2.3 / Math.max(size.x, size.y, size.z);
    const cont = new THREE.Group(); g.scale.setScalar(k); g.position.y = 0; cont.add(g);
    if (perdido) g.traverse(o => { if (o.isMesh) o.material = mat(0x555555); });
    visor.scene.add(cont); visor.g = cont; visor.id = id + (perdido ? "x" : "");
  }
  visor.g.scale.setScalar(0.45 + 0.55 * crece);
  if (visor.r.domElement.parentNode !== contenedor) contenedor.appendChild(visor.r.domElement);
}
