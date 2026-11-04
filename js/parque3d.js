// Parque de bomberos en 3D (three.js): modelos propios de baja poligonización para cada pieza de la tienda, el plano
// isométrico del parque con una parcela por pieza, miniaturas para la tienda y el visor del temporizador.
// Todo se crea con formas simples (cajas, cilindros, conos...), sin imágenes externas.
let THREE = null, Orbit = null;
export async function cargar() {
  if (THREE) return THREE;
  THREE = await import("three");
  ({OrbitControls: Orbit} = await import("three/addons/controls/OrbitControls.js"));
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
};
export function modelo(id) {
  const g = new THREE.Group();
  (MODELOS[id] || MODELOS.extintor)(g);
  return g;
}

/* ---------- plano del parque ---------- */
// Posición de cada pieza (x, z, giro, escala). El parque mide 22 × 18 unidades.
const SITIO = {
  // Cocheras (izquierda, sobre asfalto)
  mando: [-8.2, -4.5, 0, 1], sanitaria: [-8.2, -2.3, 0, 1], bul: [-8.2, -0.1, 0, 1], bup: [-8.2, 2.1, 0, 1], autoescala: [-8.2, 4.3, 0, 1], brazo: [-4.4, 6.2, Math.PI / 2, 1],
  // Instalaciones (fondo)
  edificio: [-3.5, -6.2, 0, 1.15], vestuarios: [0, -6.4, 0, 1], cocina: [2.6, -6.4, 0, 1], dormitorio: [5.2, -6.4, 0, 1], comunicaciones: [8, -6.4, 0, 1],
  epis: [-0.2, -3.4, 0, 1], gym: [2.6, -3.4, 0, 1], altura: [8.2, -3.2, 0, 1], humo: [5.4, -3.3, 0, 1], patio: [3.4, 0.2, 0, 1.4],
  // Material (estantería del almacén, centro)
  extintor: [-4.2, -1.6, 0, 0.6], hacha: [-3.4, -1.6, 0, 0.6], linterna: [-2.6, -1.6, 0, 0.6], guantes: [-1.8, -1.6, 0, 0.6], casco: [-1, -1.6, 0, 0.6],
  cizalla: [-4.2, 0.2, 0, 0.6], cuerdas: [-3.4, 0.2, 0, 0.6], escalera: [-2.6, 0.2, 0, 0.6], era: [-1.8, 0.2, 0, 0.6], separador: [-1, 0.2, 0, 0.6],
  // Exterior
  arbol: [9.5, 6.8, 0, 1], flores: [6.2, 7.2, 0, 1], palmera: [9.6, 3.2, 0, 1], naranjo: [2.4, 7, 0, 1],
  // Trofeos (entrada)
  medalla: [-1.4, 4.4, 0, 0.9], placa: [0.2, 4.4, 0, 0.9],
};

function suelo(scene) {
  const g = new THREE.Group();
  const c = (w, d, col, x, z, y = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mat(col)); m.position.set(x, y - 0.1, z); m.receiveShadow = true; g.add(m); return m; };
  c(24, 20, 0x7CC46F, 0, 0, -0.02);                    // césped
  c(5.4, 13.2, 0x7E868E, -8.2, 0, 0.01);               // asfalto de cocheras
  for (let z = -5.6; z <= 5.6; z += 2.2) c(3.6, 0.06, 0xF4F4F2, -8.2, z, 0.02);
  c(13.6, 6.2, 0xC9C4B8, 3.2, -4.8, 0.01);             // hormigón de instalaciones
  c(5, 3.6, 0xD9DEE2, -2.6, -0.7, 0.01);               // almacén de material
  c(3.6, 1.8, 0xE8D9B5, -0.6, 4.4, 0.01);              // entrada
  c(2, 8, 0xE8D9B5, -0.6, 7.2, 0.0);                   // camino
  // Valla
  for (let x = -11.5; x <= 11.5; x += 1) { for (const z of [-9.6, 9.6]) if (!(z > 0 && Math.abs(x + 0.6) < 1.2)) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), mat(0xF4F4F2)); p.position.set(x, 0.3, z); g.add(p); } }
  for (let z = -9.5; z <= 9.5; z += 1) for (const x of [-11.6, 11.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), mat(0xF4F4F2)); p.position.set(x, 0.3, z); g.add(p); }
  for (const z of [-9.6, 9.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(23.2, 0.06, 0.06), mat(0xF4F4F2)); r.position.set(0, 0.5, z); g.add(r); }
  for (const x of [-11.6, 11.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 19.2), mat(0xF4F4F2)); r.position.set(x, 0.5, 0); g.add(r); }
  scene.add(g);
}
function parcela(scene, x, z, s) {
  const w = s < 0.8 ? 0.7 : s > 1.2 ? 3 : 2;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.28}));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z);
  const borde = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, w)), new THREE.LineDashedMaterial({color: 0xffffff, dashSize: 0.15, gapSize: 0.1}));
  borde.computeLineDistances(); borde.rotation.x = -Math.PI / 2; borde.position.set(x, 0.04, z);
  scene.add(m); scene.add(borde);
  return [m, borde];
}

let inst = null;
// Devuelve (y reutiliza) el visor del parque: un elemento <div> con el lienzo, que la app mete donde toque.
export function parque(veces, nuevos = []) {
  if (!inst) inst = crearParque();
  inst.actualizar(veces, nuevos);
  return inst.el;
}
function crearParque() {
  const el = document.createElement("div");
  el.className = "parque3d";
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  cam.position.set(18, 18, 18);
  cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f5e, 0.9));
  const sol = new THREE.DirectionalLight(0xffffff, 1.25);
  sol.position.set(10, 18, 8); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, {left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60});
  scene.add(sol);
  suelo(scene);
  const ctr = new Orbit(cam, renderer.domElement);
  ctr.enableDamping = true; ctr.minZoom = 0.7; ctr.maxZoom = 3.5; ctr.maxPolarAngle = 1.2; ctr.minPolarAngle = 0.5;
  ctr.enablePan = true; ctr.screenSpacePanning = true;
  const piezas = {}, parcelas = {}, anims = [];
  for (const [id, [x, z, r, s]] of Object.entries(SITIO)) parcelas[id] = parcela(scene, x, z, s);
  function poner(id, animar) {
    if (piezas[id]) return;
    const [x, z, r, s] = SITIO[id] || [0, 0, 0, 1];
    const g = modelo(id);
    g.position.set(x, 0, z); g.rotation.y = r;
    g.scale.setScalar(animar ? 0.01 : s);
    scene.add(g); piezas[id] = g;
    for (const p of parcelas[id] || []) p.visible = false;
    if (animar) anims.push({g, s, t0: performance.now()});
  }
  function tamano() {
    const w = el.clientWidth || 360, h = el.clientHeight || 320;
    renderer.setSize(w, h, false);
    const a = w / h, v = 12.5;
    Object.assign(cam, {left: -v * a, right: v * a, top: v, bottom: -v});
    cam.updateProjectionMatrix();
  }
  new ResizeObserver(tamano).observe(el);
  (function bucle() {
    requestAnimationFrame(bucle);
    if (!el.isConnected) return;
    const t = performance.now();
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i], k = Math.min(1, (t - a.t0) / 700);
      const e = k < 1 ? 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) : 1; // rebote
      a.g.scale.setScalar(Math.max(0.01, a.s * e));
      if (k >= 1) anims.splice(i, 1);
    }
    ctr.update();
    renderer.render(scene, cam);
  })();
  return {
    el,
    actualizar(veces, nuevos) {
      for (const id of Object.keys(SITIO)) if (veces[id]) poner(id, nuevos.includes(id));
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
