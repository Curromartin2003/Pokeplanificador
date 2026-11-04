// Parque de bomberos en 3D (three.js): modelos propios de baja poligonización para cada pieza de la tienda, el plano
// isométrico del parque con una parcela por pieza, miniaturas para la tienda y el visor del temporizador.
// Todo se crea con formas simples (cajas, cilindros, conos...), sin imágenes externas.
let THREE = null, Orbit = null;
export let error = null;
export async function cargar() {
  if (THREE) return THREE;
  try {
    const t = await import("three");
    ({OrbitControls: Orbit} = await import("three/addons/controls/OrbitControls.js"));
    THREE = t;
  } catch (e) {
    // Navegadores sin «import maps»: la misma versión desde esm.sh (resuelve sus propias dependencias).
    try {
      const t = await import("https://esm.sh/three@0.160.0");
      ({OrbitControls: Orbit} = await import("https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js"));
      THREE = t;
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
const mats = new Map();
function mat(c, extra = {}) {
  const k = c + JSON.stringify(extra);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({color: c, roughness: 0.75, metalness: 0.05, flatShading: true, ...extra}));
  return mats.get(k);
}
function sombra(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function caja(g, w, h, d, c, x = 0, y = 0, z = 0, extra) {
  const m = sombra(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, extra)));
  m.position.set(x, y + h / 2, z); g.add(m); return m;
}
function cil(g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 12, extra) {
  const m = sombra(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, extra)));
  m.position.set(x, y + h / 2, z); g.add(m); return m;
}
function esfera(g, r, c, x = 0, y = 0, z = 0, seg = 10, extra) {
  const m = sombra(new THREE.Mesh(new THREE.IcosahedronGeometry(r, seg > 8 ? 1 : 0), mat(c, extra)));
  m.position.set(x, y, z); g.add(m); return m;
}
function cono(g, r, h, c, x = 0, y = 0, z = 0, seg = 8) {
  const m = sombra(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(c)));
  m.position.set(x, y + h / 2, z); g.add(m); return m;
}
function rueda(g, x, z, r = 0.22, y = 0) {
  const m = cil(g, r, r, 0.16, COL.negro, x, y, z, 14);
  m.rotation.x = Math.PI / 2; m.position.y = r + y; return m;
}
// Camión genérico: cabina + caja + ruedas. Medidas en «unidades» (1 parcela ≈ 2,2 unidades).
function camion(g, {largo = 2.4, alto = 0.9, color = COL.rojo, cabina = 0.7, franja = COL.blanco, ruedas = 2} = {}) {
  caja(g, largo - cabina, alto, 0.95, color, -cabina / 2, 0.22, 0);
  caja(g, cabina, alto * 0.85, 0.95, color, (largo - cabina) / 2, 0.22, 0);
  caja(g, 0.05, alto * 0.4, 0.8, COL.cristal, largo / 2 + 0.005, 0.22 + alto * 0.38, 0, {roughness: 0.2});
  caja(g, largo - cabina, 0.1, 0.97, franja, -cabina / 2, 0.22 + alto * 0.45, 0);
  caja(g, 0.25, 0.08, 0.5, COL.azul, (largo - cabina) / 2, 0.22 + alto * 0.85, 0, {emissive: 0x1b4aa8, emissiveIntensity: 0.6});
  const xs = ruedas === 3 ? [-largo / 2 + 0.35, -largo / 2 + 0.85, largo / 2 - 0.4] : [-largo / 2 + 0.45, largo / 2 - 0.4];
  for (const x of xs) { rueda(g, x, 0.48); rueda(g, x, -0.48); }
}
function edificio(g, {w = 1.8, h = 1.2, d = 1.6, color = COL.crema, tejado = COL.rojoOsc, puerta = COL.azul} = {}) {
  caja(g, w, h, d, color);
  caja(g, w + 0.15, 0.12, d + 0.15, tejado, 0, h, 0);
  caja(g, 0.38, 0.62, 0.05, puerta, 0, 0, d / 2 + 0.01);
  for (const x of [-w / 3, w / 3]) caja(g, 0.32, 0.28, 0.05, COL.cristal, x, h * 0.5, d / 2 + 0.01, {roughness: 0.2});
}

/* ---------- modelos de cada pieza ---------- */
const MODELOS = {
  // Material (escala pequeña: van en el almacén)
  extintor(g) { cil(g, 0.22, 0.22, 0.85, COL.rojo); cil(g, 0.12, 0.2, 0.12, COL.rojo, 0, 0.85); caja(g, 0.28, 0.06, 0.08, COL.negro, 0.08, 0.97);
    caja(g, 0.06, 0.45, 0.06, COL.negro, 0.24, 0.4); caja(g, 0.46, 0.14, 0.02, COL.blanco, 0, 0.42, 0.22); },
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
  edificio(g) { caja(g, 2.6, 1.7, 1.9, COL.ladrillo); caja(g, 2.75, 0.14, 2.05, COL.grisOsc, 0, 1.7, 0);
    for (const x of [-0.85, 0, 0.85]) { caja(g, 0.7, 1.0, 0.05, COL.rojo, x, 0, 0.96); caja(g, 0.62, 0.04, 0.06, COL.blanco, x, 0.6, 0.97); }
    caja(g, 0.8, 1.2, 0.8, COL.ladrillo, -0.85, 1.84, -0.4); caja(g, 0.9, 0.1, 0.9, COL.grisOsc, -0.85, 3.04, -0.4);
    caja(g, 1.2, 0.25, 0.04, COL.blanco, 0.4, 1.3, 0.97); caja(g, 0.32, 0.32, 0.05, COL.cristal, -0.85, 2.3, 0.01); },
  // Vehículos
  mando(g) { caja(g, 1.7, 0.6, 0.85, COL.rojo, 0, 0.2); caja(g, 1.0, 0.45, 0.8, COL.rojo, -0.15, 0.8); caja(g, 0.95, 0.3, 0.82, COL.cristal, -0.15, 0.85, 0, {roughness: 0.2});
    caja(g, 1.7, 0.08, 0.87, COL.blanco, 0, 0.55); caja(g, 0.5, 0.08, 0.3, COL.azul, -0.15, 1.25, 0, {emissive: 0x1b4aa8, emissiveIntensity: 0.6});
    for (const x of [-0.55, 0.55]) { rueda(g, x, 0.43, 0.2); rueda(g, x, -0.43, 0.2); } },
  sanitaria(g) { caja(g, 2.0, 1.05, 1.0, COL.blanco, -0.15, 0.22); caja(g, 0.6, 0.8, 1.0, COL.blanco, 0.95, 0.22); caja(g, 0.05, 0.35, 0.85, COL.cristal, 1.255, 0.6, 0, {roughness: 0.2});
    caja(g, 2.62, 0.14, 1.02, COL.rojo, 0.15, 0.6); caja(g, 0.32, 0.1, 0.06, COL.rojo, -0.3, 0.95, 0.51); caja(g, 0.1, 0.32, 0.06, COL.rojo, -0.3, 0.85, 0.51);
    caja(g, 0.3, 0.08, 0.5, COL.azul, 0.95, 1.02, 0, {emissive: 0x1b4aa8, emissiveIntensity: 0.6}); for (const x of [-0.8, 0.85]) { rueda(g, x, 0.5); rueda(g, x, -0.5); } },
  bul(g) { camion(g, {largo: 2.3, alto: 0.95}); caja(g, 0.9, 0.12, 0.7, COL.plata, -0.45, 1.17, 0); },
  bup(g) { camion(g, {largo: 3.0, alto: 1.05, ruedas: 3}); const r = cil(g, 0.28, 0.28, 0.5, COL.plata, -0.6, 0.55, 0.5); r.rotation.x = Math.PI / 2; caja(g, 1.6, 0.12, 0.8, COL.plata, -0.5, 1.27, 0); },
  autoescala(g) { camion(g, {largo: 3.2, alto: 0.95, ruedas: 3});
    const l = new THREE.Group(); for (const z of [-0.22, 0.22]) caja(l, 3.2, 0.08, 0.06, COL.plata, 0, 0, z); for (let x = -1.5; x <= 1.5; x += 0.3) caja(l, 0.05, 0.05, 0.44, COL.plata, x, 0.02, 0);
    l.position.set(-0.3, 1.35, 0); l.rotation.z = 0.35; g.add(l); cil(g, 0.25, 0.3, 0.2, COL.grisOsc, -1.2, 1.17, 0); },
  brazo(g) { camion(g, {largo: 3.1, alto: 0.95, ruedas: 3}); cil(g, 0.28, 0.32, 0.25, COL.grisOsc, -0.9, 1.17, 0);
    const b1 = caja(g, 0.16, 1.6, 0.16, COL.plata, -0.9, 1.4, 0); b1.rotation.z = -0.5; b1.position.set(-0.55, 1.4, 0);
    const b2 = caja(g, 0.14, 1.4, 0.14, COL.plata, 0.1, 2.0, 0); b2.rotation.z = 0.9; b2.position.set(0.3, 2.0, 0);
    caja(g, 0.45, 0.32, 0.45, COL.amarillo, 0.95, 2.35, 0); },
  // Exterior
  arbol(g) { cil(g, 0.1, 0.14, 0.7, COL.marron); esfera(g, 0.5, COL.verde, 0, 1.05, 0, 10); esfera(g, 0.35, COL.verdeOsc, 0.25, 1.35, 0.1, 10); esfera(g, 0.32, COL.verde, -0.22, 1.3, -0.12, 10); },
  flores(g) { caja(g, 1.1, 0.3, 0.5, COL.madera); caja(g, 1.0, 0.05, 0.42, 0x5B3A1E, 0, 0.3);
    [0xE63946, 0xF4A261, 0xFFD166, 0xC77DFF, 0xFF6FB5, 0xE63946].forEach((c, i) => { cil(g, 0.015, 0.015, 0.22, COL.verdeOsc, -0.4 + i * 0.16, 0.3, (i % 2) * 0.12 - 0.06, 4); esfera(g, 0.08, c, -0.4 + i * 0.16, 0.56, (i % 2) * 0.12 - 0.06, 6); }); },
  palmera(g) { for (let i = 0; i < 6; i++) { const t = cil(g, 0.09, 0.11, 0.35, 0x8C6239, Math.sin(i * 0.4) * 0.12, i * 0.33, 0, 7); t.rotation.z = 0.08; }
    for (let i = 0; i < 7; i++) { const h = caja(g, 0.9, 0.04, 0.22, COL.verde, 0, 2.0, 0); h.geometry.translate(0.45, 0, 0); h.rotation.y = i * Math.PI * 2 / 7; h.rotation.z = -0.35; h.position.set(0.2, 2.05, 0); } },
  naranjo(g) { cil(g, 0.1, 0.13, 0.6, COL.marron); esfera(g, 0.62, COL.verdeOsc, 0, 1.05, 0, 10);
    for (const [x, y, z] of [[0.45, 1.1, 0.3], [-0.4, 1.25, 0.35], [0.1, 1.55, 0.45], [0.35, 0.8, -0.4], [-0.45, 0.9, -0.25]]) esfera(g, 0.09, COL.naranja, x, y, z, 6); },
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
  pino(g) { cil(g, 0.08, 0.1, 0.5, COL.marron); cono(g, 0.55, 0.9, COL.verdeOsc, 0, 0.4); cono(g, 0.42, 0.8, COL.verdeOsc, 0, 0.9); cono(g, 0.3, 0.6, COL.verde, 0, 1.4); },
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
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mat(col)); m.position.set(x, y - 0.1, z); m.receiveShadow = true; g.add(m); return m;
}
function suelo(scene) {
  const g = new THREE.Group();
  losa(g, 24, 20, 0x7CC46F, 0, 0, -0.02);
  losa(g, 5.4, 13.2, 0x7E868E, -8.2, 0, 0.01);
  for (let z = -5.6; z <= 5.6; z += 2.2) losa(g, 3.6, 0.06, 0xF4F4F2, -8.2, z, 0.02);
  losa(g, 13.6, 6.2, 0xC9C4B8, 3.2, -4.8, 0.01);
  losa(g, 5, 3.6, 0xD9DEE2, -2.6, -0.7, 0.01);
  losa(g, 3.6, 1.8, 0xE8D9B5, -0.6, 4.4, 0.01);
  losa(g, 2, 3, 0xE8D9B5, -0.6, 8.5, 0.0);
  const valla = (w, d, x, z) => { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), mat(0xF4F4F2)); r.position.set(x, 0.25, z); g.add(r); };
  valla(23.2, 0.08, 0, -9.6); valla(10.6, 0.08, -6.9, 9.6); valla(10.6, 0.08, 6.3, 9.6); valla(0.08, 19.2, -11.6, 0); valla(0.08, 19.2, 11.6, 0);
  // Portada de la entrada con el rótulo del parque
  for (const x of [-1.8, 0.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), mat(0xB4472F)); p.position.set(x, 0.8, 9.6); p.castShadow = true; g.add(p); }
  const arco = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 0.3), mat(0xC1121F)); arco.position.set(-0.6, 1.75, 9.6); arco.castShadow = true; g.add(arco);
  const r = texto("🚒 Parque de bomberos", "#8E0E17"); r.position.set(-0.6, 2.8, 9.6); g.add(r);
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
const CIUDAD_NOMBRE = {explanada: "Explanada (piezas repetidas)", maniobras: "🧯 Campo de maniobras", barrio: "🏬 Barrio", forestal: "🌲 Base forestal", aero: "🛩️ Aeródromo y puerto"};
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
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f5e, 0.9));
  const sol = new THREE.DirectionalLight(0xffffff, 1.25);
  sol.position.set(14, 26, 10); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
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
    const w = el.clientWidth, h = el.clientHeight;
    for (const o of ETIQUETAS) {
      let d = divs.get(o);
      if (!enEscena(o)) { if (d) { d.remove(); divs.delete(o); } continue; }
      if (!d) { d = document.createElement("span"); d.className = "p3d-et"; d.textContent = o.userData.texto; d.style.color = o.userData.color; capa.appendChild(d); divs.set(o, d); }
      o.getWorldPosition(vtmp); vtmp.project(cam);
      const dw = d.offsetWidth, dh = d.offsetHeight, m = 6;
      let x = (vtmp.x + 1) / 2 * w - dw / 2, y = (1 - vtmp.y) / 2 * h - dh / 2;
      x = Math.max(m, Math.min(w - dw - m, x)); y = Math.max(m + 40, Math.min(h - dh - m, y));
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
    editar(on) { modoEditar = on; el.classList.toggle("editando", on); },
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
        colocar(p, sitio, (op.nuevos || []).includes(p.key));
        if (parcelas[p.id] && !p.key.includes("_")) parcelas[p.id].visible = false;
        if (fantasmas[p.id] && !p.key.includes("_")) fantasmas[p.id].visible = false;
      }
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.0));
    const l = new THREE.DirectionalLight(0xffffff, 1.2); l.position.set(3, 5, 4); scene.add(l);
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
    const l = new THREE.DirectionalLight(0xffffff, 1.3); l.position.set(3, 6, 4); scene.add(l);
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
