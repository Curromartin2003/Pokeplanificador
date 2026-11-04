// Lógica del planificador, sin nada de interfaz (se prueba con `node --test tests/`).
// Todo se calcula a partir del estado guardado; nada del plan se guarda salvo lo ya hecho.
import {LEGISLACION, ESPECIFICO, SEMILLAS} from "./temario.js";
import {DOCS_ESP} from "./docs_esp.js";

export const OBJETIVOS = [
  "Despertarme a las 7:00 y hacer la cama",
  "Tomar la creatina",
  "Mover el cuerpo",
  "Estudio del día",
  "Callejero",
  "Comer bien",
  "Cero alcohol",
  "Móvil fuera a la 1:00 y a dormir",
];
export const I_ESTUDIO = 3;
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_CORTO = ["L", "M", "X", "J", "V", "S", "D"];
// Minutos disponibles cada día de la semana (lunes = 0). El sábado y el domingo valen 3 h: uno de los dos es libre.
export const MINUTOS = [60, 180, 60, 180, 60, 180, 180];
export const PCT_CALLEJERO = 0.3;
export const MATERIAS = {leg: "Legislación", esp: "Específico"};
// Ritmos: multiplican los minutos estimados de cada parte. «Competitivo» es el de referencia.
export const RITMOS = {
  base: {nombre: "Base", f: 1.25, txt: "más tiempo por tema"},
  competitivo: {nombre: "Competitivo", f: 1, txt: "lectura activa y esquema"},
  intenso: {nombre: "Intenso", f: 0.8, txt: "ritmo de opositor que va a por plaza"},
};
// Cada vuelta lleva una fracción del tiempo de la 1.ª (la 2.ª ya es sobre esquemas, las demás repaso y test).
export const VUELTA_F = [1, 0.5, 0.35, 0.3];
const VUELTAS = 8;
export const FOCOS_CALLEJERO = [
  "Casco Antiguo", "Triana", "Macarena", "Nervión", "Los Remedios", "Sur", "Cerro-Amate", "Bellavista-La Palmera",
  "Este-Alcosa-Torreblanca", "San Pablo-Santa Justa", "Norte", "BIC y urgencias", "Carreteras y puntos kilométricos",
  "Hospitales, colegios y parques", "Examen oficial del tribunal",
];

/* ---------- fechas (cadenas AAAA-MM-DD, sin horas para no depender del horario de verano) ---------- */
const P = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const F = t => new Date(t).toISOString().slice(0, 10);
export const sumaDias = (s, n) => F(P(s) + n * 864e5);
export const difDias = (a, b) => Math.round((P(b) - P(a)) / 864e5);
export const diaSemana = s => (new Date(P(s)).getUTCDay() + 6) % 7;
export const lunes = s => sumaDias(s, -diaSemana(s));
export function hoyLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function fechaLarga(s, conDia = true) {
  const [y, m, d] = s.split("-").map(Number);
  return (conDia ? DIAS[diaSemana(s)].toLowerCase() + " " : "") + `${d} de ${MESES[m - 1]}` + (y !== new Date().getFullYear() ? ` de ${y}` : "");
}

/* ---------- estado ---------- */
// manual: ajustes a mano de lo hecho en cada trozo ({id: fracción}); materiales: PDF subidos desde la app
// ({"esp16": [{id, doc, wpm, pal, t}]}); cambios: historial de novedades; leidos / etaVista: avisos ya vistos.
export function estadoNuevo(hoy) {
  return {v: 2, inicio: hoy, ritmo: "competitivo", examen: null, semanas: {}, dias: {}, manual: {}, materiales: {},
    titulos: {}, fuera: {}, callejeroUrl: "", base: null, cambios: [], leidos: {}, etaVista: null, semilla: 0};
}
export const completar = s => {
  const b = estadoNuevo(s && s.inicio || hoyLocal());
  const o = {...b, ...(s || {})};
  for (const k of ["semanas", "dias", "manual", "materiales", "titulos", "leidos", "fuera", "calle", "premios", "parque", "marcas"]) o[k] = {...((s && s[k]) || {})};
  o.cambios = Array.isArray(s && s.cambios) ? s.cambios : [];
  return o;
};

// Configuración de una semana: la suya si se ha puesto y, si no, la de la última semana configurada (o la primera).
export function semana(st, mon) {
  if (st.semanas[mon]) return {...st.semanas[mon], puesta: true};
  const ks = Object.keys(st.semanas).sort();
  const antes = ks.filter(k => k < mon).pop() || ks[0];
  const c = antes ? st.semanas[antes] : {libre: 6, luis: []};
  return {libre: c.libre, luis: [...(c.luis || [])], puesta: false};
}

export function infoDia(st, fecha) {
  const dow = diaSemana(fecha), cfg = semana(st, lunes(fecha));
  const tipo = dow === cfg.libre ? "libre" : (cfg.luis || []).includes(dow) ? "luis" : "estudio";
  const rec = st.dias[fecha];
  const cambiado = tipo !== "libre" && rec && typeof rec.h === "number";
  const total = tipo === "libre" ? 0 : cambiado ? rec.h : MINUTOS[dow];
  const minCal = Math.round(total * PCT_CALLEJERO);
  return {fecha, dow, tipo, total, minCal, minEst: tipo === "estudio" ? total - minCal : 0, semanaPuesta: cfg.puesta,
    horasCambiadas: cambiado, horasNormales: MINUTOS[dow], sinEstudio: cambiado && total === 0};
}

/* ---------- temas y trozos ---------- */
const r5 = x => Math.max(5, Math.round(x / 5) * 5);
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const PAL_ESCANEADA = 150; // página sin texto (escaneada o casi todo imagen): se cuenta como 150 palabras

// Solo se estudia lo subrayado y anotado: los PDF del específico y los subidos en la app llevan este factor.
export const F_SUBRAYADO = 0.6;
// Parte un PDF en trozos de unos 50 min de lectura completa por páginas (los cortes no cambian con el ritmo ni con el
// factor `f`, que solo cambia los minutos: así lo ya hecho de cada trozo se conserva).
export function partesDePdf(d, f = 1) {
  const desde = d.desde || 1, wpm = d.wpm || 70;
  const minPag = d.pal.map(w => Math.max(w < 40 ? PAL_ESCANEADA : w, 1) / wpm);
  const grupos = [];
  let ini = 0, acc = 0;
  minPag.forEach((m, i) => {
    if (acc > 0 && acc + m > 62) { grupos.push([ini, i - 1, acc]); ini = i; acc = 0; }
    acc += m;
  });
  if (acc > 0) grupos.push([ini, minPag.length - 1, acc]);
  if (grupos.length > 1 && grupos[grupos.length - 1][2] < 15) { const u = grupos.pop(); const g = grupos[grupos.length - 1]; g[1] = u[1]; g[2] += u[2]; }
  return grupos.map(([a, b, m], i) => ({
    key: `${d.doc}|${a + desde}-${b + desde}`,
    nombre: grupos.length > 1 ? `${d.doc} (${i + 1}/${grupos.length})` : d.doc,
    ref: `${d.doc} · págs. ${a + desde}-${b + desde}`, min: Math.max(5, Math.round(m * f)),
  }));
}

// Temas que entran en la vuelta: toda la legislación; del específico, solo los que tienen material (PDF).
export function temas(st, t) {
  const base = t === "leg" ? LEGISLACION : ESPECIFICO;
  const out = [];
  for (const tm of base) {
    const k = t + tm.n;
    const subidos = (st.materiales[k] || []).filter(Boolean);
    let partes, material = [...(tm.material || [])];
    if (t === "esp") {
      const docs = [...(DOCS_ESP[tm.n] || []), ...subidos];
      if (!docs.length) continue;
      partes = docs.flatMap(d => partesDePdf(d, F_SUBRAYADO));
      material = docs.map(d => d.doc);
    } else {
      partes = tm.partes.map(([nombre, min, ref]) => ({key: nombre, nombre, min, ref: ref || ""}));
      for (const d of subidos) { partes.push(...partesDePdf(d, F_SUBRAYADO)); material.push(d.doc); }
    }
    // Partes que no entran (marcadas «No entra» en la app): fuera de todas las vueltas.
    const fuera = st.fuera[k] || {};
    const todas = partes;
    partes = partes.filter(p => !fuera[hash(p.key)]);
    if (!partes.length) continue;
    out.push({n: tm.n, titulo: st.titulos[k] || tm.titulo, contenido: tm.contenido, material, partes, todas, sinMaterial: !material.length});
  }
  return out;
}
export const claveParte = p => hash(p.key);
export function temasSinMaterial(st) {
  const con = new Set(temas(st, "esp").map(x => x.n));
  return ESPECIFICO.filter(x => !con.has(x.n)).map(x => ({n: x.n, titulo: st.titulos["esp" + x.n] || x.titulo, contenido: x.contenido}));
}

const cacheCola = new Map();
// Lo que de verdad tardas: cada vez que marcas el estudio se apunta el tiempo real (s.real) y se compara con el
// previsto. La proporción de cada materia (con un poco de prudencia al principio) ajusta los minutos de lo que queda.
export function calibracion(st) {
  const sum = {leg: [0, 0], esp: [0, 0]};
  for (const [f, r] of Object.entries(st.dias)) {
    if (f < st.inicio || !r || !r.s || typeof r.s.real !== "number" || !r.s.items) continue;
    const prev = (r.s.m || 0) + (r.s.x ? r.s.x.m : 0);
    if (prev <= 0) continue;
    // El tiempo real se reparte entre las dos materias del día en proporción a lo previsto.
    for (const x of [{t: r.s.t, m: r.s.m}, r.s.x].filter(Boolean)) {
      sum[x.t][0] += r.s.real * x.m / prev; sum[x.t][1] += x.m;
    }
  }
  const PRIOR = 90; // minutos «de confianza» en la estimación inicial
  const r = t => Math.min(2.5, Math.max(0.4, (sum[t][0] + PRIOR) / (sum[t][1] + PRIOR)));
  return {leg: r("leg"), esp: r("esp"), registros: {leg: Math.round(sum.leg[1]), esp: Math.round(sum.esp[1])}};
}

export function cola(st, t) {
  const cal = calibracion(st)[t];
  const f = (RITMOS[st.ritmo] || RITMOS.competitivo).f * cal;
  const key = t + f + JSON.stringify(st.titulos) + JSON.stringify(st.materiales) + JSON.stringify(st.fuera);
  if (cacheCola.has(key)) return cacheCola.get(key);
  const items = [], tot = [];
  const ts = temas(st, t);
  for (let v = 1; v <= VUELTAS; v++) {
    const vf = VUELTA_F[Math.min(v, VUELTA_F.length) - 1];
    let suma = 0;
    for (const tm of ts) {
      const mk = (key, nombre, ref, min, parte, partes) => {
        const c = {id: t + hash(`${tm.n}|${v}|${key}`), key, t, v, n: tm.n, titulo: tm.titulo, parte, partes, nombre, ref, min};
        items.push(c); suma += min;
      };
      if (v === 1) tm.partes.forEach((p, i) => mk(p.key, p.nombre, p.ref, Math.max(5, Math.round(p.min * f)), i + 1, tm.partes.length));
      else mk("repaso", v === 2 ? "2.ª vuelta: repaso con tus esquemas y test del tema" : `${v}.ª vuelta: repaso rápido y test`,
        tm.material.join(" + "), r5(tm.partes.reduce((a, p) => a + p.min, 0) * f * vf), 1, 1);
    }
    tot.push(suma);
  }
  const porId = new Map(items.map(c => [c.id, c]));
  const r = {t, items, tot, porId};
  if (cacheCola.size > 50) cacheCola.clear();
  cacheCola.set(key, r);
  return r;
}

/* ---------- lo hecho ---------- */
const EPS = 1e-6;
const hechoDe = (h, id) => Math.min(1, Math.max(0, h[id] || 0));
// Lo hecho en cada trozo: los días marcados hasta `hasta` más los ajustes a mano.
export function hecho(st, hasta, conManual = true) {
  const h = conManual ? {...st.manual} : {};
  for (const [f, r] of Object.entries(st.dias)) {
    if (f < st.inicio || f > hasta || !r || !r.s || !r.s.items) continue;
    for (const [id, fr] of r.s.items) h[id] = (h[id] || 0) + fr;
  }
  return h;
}
const pendiente = (h, c) => (1 - hechoDe(h, c.id)) * c.min;
export const vueltaActual = (q, h) => { for (const c of q.items) if (pendiente(h, c) > EPS) return c.v; return Infinity; };
// Trozos pendientes de una vuelta, en orden; primero los temas ya empezados.
function pendientes(q, h, v) {
  const lst = q.items.filter(c => c.v === v && pendiente(h, c) > EPS);
  const emp = new Set(q.items.filter(c => c.v === v && hechoDe(h, c.id) > EPS).map(c => c.n));
  return [...lst.filter(c => emp.has(c.n)), ...lst.filter(c => !emp.has(c.n))];
}
// Toma `min` minutos de la vuelta en curso de la materia t. Devuelve los trozos y los minutos que han sobrado.
function tomar(q, h, min, aplicar) {
  const v = vueltaActual(q, h);
  if (v === Infinity) return {plan: [], resto: min};
  const plan = [];
  let resto = min;
  for (const c of pendientes(q, h, v)) {
    if (resto <= EPS) break;
    const hecho0 = hechoDe(h, c.id) * c.min, quedan = c.min - hecho0, m = Math.min(quedan, resto);
    plan.push({...c, desde: Math.round(hecho0), hasta: Math.round(hecho0 + m), mins: Math.round(m), fr: m / c.min});
    resto -= m;
    if (aplicar) h[c.id] = (h[c.id] || 0) + m / c.min;
  }
  return {plan, resto};
}

/* ---------- recorrido día a día ---------- */
// Recorre desde el inicio hasta `hasta` y llama a cb(dia) en cada día. Los días pasados solo cuentan si se marcó el
// estudio; desde hoy se supone que se cumple el plan (para las previsiones).
// Reparto: un día cada materia mientras van por la misma vuelta; la que la acaba espera y todos los días son de la otra
// hasta que la acaba también; el día en que una acaba su vuelta, lo que sobra va a la otra.
export function recorrer(st, hoy, hasta, cb) {
  const q = {leg: cola(st, "leg"), esp: cola(st, "esp")};
  const h = {...st.manual};
  let sig = "leg", nCal = 0;
  for (let f = st.inicio; f <= hasta; f = sumaDias(f, 1)) {
    const d = infoDia(st, f), rec = st.dias[f] || null;
    d.rec = rec;
    if (d.tipo !== "libre") d.foco = FOCOS_CALLEJERO[nCal++ % FOCOS_CALLEJERO.length];
    if (d.tipo === "estudio") {
      let plan = [];
      if (rec && rec.s && rec.s.items) {
        for (const [id, fr] of rec.s.items) {
          const c = q.leg.porId.get(id) || q.esp.porId.get(id);
          const antes = hechoDe(h, id);
          h[id] = (h[id] || 0) + fr;
          if (c) plan.push({...c, desde: Math.round(antes * c.min), hasta: Math.round(Math.min(1, antes + fr) * c.min), mins: Math.round(fr * c.min), fr});
        }
        d.hecho = true;
      } else {
        const aplicar = f >= hoy;
        const hh = aplicar ? h : {...h};
        const vl = vueltaActual(q.leg, hh), ve = vueltaActual(q.esp, hh);
        const t = vl > ve ? "esp" : ve > vl ? "leg" : sig, otra = t === "leg" ? "esp" : "leg";
        const a = tomar(q[t], hh, d.minEst, true);
        plan = a.plan;
        if (a.resto > 0.5) {
          const b = tomar(q[otra], hh, a.resto, true);
          plan.push(...b.plan);
          if (b.resto > 0.5) plan.push(...tomar(q[t], hh, b.resto, true).plan);
        }
        d.hecho = false;
      }
      d.plan = plan;
      const por = {};
      for (const it of plan) por[it.t] = (por[it.t] || 0) + it.fr * it.min;
      d.partes = Object.entries(por).map(([t, m]) => ({t, m: Math.round(m)}));
      if (!d.partes.length && rec && rec.s && rec.s.t) d.partes = [{t: rec.s.t, m: rec.s.m || 0}];
      if (!d.partes.length) d.partes = [{t: sig, m: 0}];
      d.materia = d.partes[0].t;
      d.min = d.hecho ? d.partes.reduce((x, p) => x + p.m, 0) : d.minEst;
      // Un día sin estudio no gasta el turno de la materia que tocaba.
      const ult = plan.length ? plan[plan.length - 1].t : rec && rec.s && rec.s.t ? rec.s.t : (sig === "leg" ? "esp" : "leg");
      sig = ult === "leg" ? "esp" : "leg";
    }
    d.h = h;
    if (cb(d, q) === false) break;
  }
  return h;
}

export function dia(st, hoy, fecha) {
  let out = null;
  recorrer(st, hoy, fecha, d => { if (d.fecha === fecha) out = d; });
  return out || infoDia(st, fecha);
}
export function dias(st, hoy, desde, hasta) {
  const out = [];
  recorrer(st, hoy, hasta, d => { if (d.fecha >= desde) out.push({...d, h: undefined}); });
  return out;
}

// Dónde vas en cada materia (con lo marcado hasta hoy, incluido).
export function progreso(st, hoy) {
  const h = hecho(st, hoy);
  const m = t => {
    const q = cola(st, t), v = vueltaActual(q, h);
    const vv = v === Infinity ? VUELTAS : v;
    const tot = q.tot[vv - 1] || 1;
    const hechoMin = q.items.filter(c => c.v === vv).reduce((a, c) => a + hechoDe(h, c.id) * c.min, 0);
    const actual = v === Infinity ? null : pendientes(q, h, v)[0];
    return {vuelta: vv, pctVuelta: hechoMin / tot, total1: q.tot[0], actual, h};
  };
  return {leg: m("leg"), esp: m("esp")};
}
export const fraccion = (h, id) => hechoDe(h, id);

// Fechas en que terminarías cada vuelta completa (las dos materias) si cumples el plan desde hoy.
export function previsiones(st, hoy, max = 1460) {
  const fin = [];
  let k = 0;
  const q = {leg: cola(st, "leg"), esp: cola(st, "esp")};
  const acabada = (h, v) => [q.leg, q.esp].every(x => x.items.every(c => c.v !== v || pendiente(h, c) <= EPS));
  recorrer(st, hoy, sumaDias(hoy, max), d => {
    if (d.tipo !== "estudio") return;
    while (k < 4 && acabada(d.h, k + 1)) fin[k++] = d.fecha;
    if (k >= 4) return false;
  });
  return fin; // fin[0] = fecha de la 1.ª vuelta, etc.
}

export function comparaRitmos(st, hoy) {
  return Object.keys(RITMOS).map(r => {
    const p = previsiones({...st, ritmo: r}, hoy);
    const antes = st.examen ? p.filter(f => f && f <= st.examen).length : null;
    return {ritmo: r, ...RITMOS[r], fechas: p, vueltasAntesExamen: antes};
  });
}

/* ---------- puntos ---------- */
// Objetivos que cuentan ese día: con 0 h de estudio no cuentan ni el estudio (o la clase) ni el callejero.
export const objetivosDelDia = d => OBJETIVOS.map((_, i) => i).filter(i => !(d.sinEstudio && (i === I_ESTUDIO || i === 4)));
export function puntosDia(d, rec) {
  if (d.tipo === "libre") return null;
  const cuentan = objetivosDelDia(d);
  const hechos = cuentan.filter(i => rec && rec.c && rec.c[i]).length;
  const fallos = cuentan.length - hechos;
  return fallos === 0 ? 1 : fallos === 1 ? 0 : -1;
}

export function resumen(st, hoy) {
  const hist = [];
  let total = 0;
  const cumple = OBJETIVOS.map(() => 0);
  let nDias = 0;
  for (let f = st.inicio; f < hoy; f = sumaDias(f, 1)) {
    const d = infoDia(st, f), rec = st.dias[f];
    const p = puntosDia(d, rec);
    hist.push({fecha: f, p, tipo: d.tipo, acum: total + (p || 0)});
    if (p === null) continue;
    total += p; nDias++;
    OBJETIVOS.forEach((_, i) => { if ((rec && rec.c && rec.c[i]) || !objetivosDelDia(d).includes(i)) cumple[i]++; });
  }
  let racha = 0;
  for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].p === null) continue; if (hist[i].p === 1) racha++; else break; }
  let mejor = 0, cur = 0;
  for (const h of hist) { if (h.p === null) continue; cur = h.p === 1 ? cur + 1 : 0; mejor = Math.max(mejor, cur); }
  const dHoy = infoDia(st, hoy);
  const ini = st.puntosIniciales || 0;
  for (const h of hist) h.acum += ini;
  return {total: total + ini, inicial: ini, racha, mejor, hist, nDias, cumple: cumple.map(c => (nDias ? c / nDias : 0)),
    hoy: puntosDia(dHoy, st.dias[hoy]), hoyLibre: dHoy.tipo === "libre"};
}

/* ---------- cambios (devuelven el parche que hay que guardar) ---------- */
export function marcar(st, hoy, fecha, i, valor) {
  const d = dia(st, hoy, fecha);
  const rec = st.dias[fecha] || {};
  const c = OBJETIVOS.map((_, k) => !!(rec.c && rec.c[k]));
  c[i] = valor;
  let s = rec.s || null;
  if (i === I_ESTUDIO && d.tipo === "estudio" && rec.hastaAqui) {
    // Ese día ya dijiste hasta dónde llegaste («Hasta aquí»): marcar el estudio no vuelve a sumar temario.
    s = valor ? {t: d.partes[0].t, m: d.minEst, x: null, items: [], real: rec.s && rec.s.real} : null;
  } else if (i === I_ESTUDIO && d.tipo === "estudio") {
    s = valor && d.plan && d.plan.length
      ? {t: d.partes[0].t, m: d.partes[0].m, x: d.partes[1] || null, items: d.plan.map(it => [it.id, it.fr])} : null;
  }
  return {dias: {[fecha]: {c, s}}};
}

// Apunta cuánto has tardado de verdad en el estudio de un día (minutos).
export function tiempoReal(st, fecha, min) {
  const rec = st.dias[fecha];
  if (!rec || !rec.s) return {};
  return {dias: {[fecha]: {s: {real: Math.max(1, Math.round(min))}}}};
}
// Marca una parte como «no entra» (o la vuelve a meter).
export function noEntra(t, n, parte, valor = true) {
  return {fuera: {[t + n]: {[hash(parte.key)]: valor ? 1 : null}}};
}

// Ajusta a mano lo hecho para que cada trozo quede en `deseado` (fracción 0-1), sin tocar lo marcado por días.
function ajustar(st, hoy, deseado) {
  const base = hecho(st, hoy, false), manual = {};
  for (const [id, x] of Object.entries(deseado)) manual[id] = x - (base[id] || 0);
  return {manual};
}
// «Hasta aquí»: en el plan de un día, los trozos anteriores al elegido quedan hechos y el elegido en la fracción dada.
export function hastaAqui(st, hoy, fecha, id, frac) {
  const d = dia(st, hoy, fecha);
  const des = {}, h = hecho(st, hoy);
  for (const it of d.plan || []) {
    if (it.id === id) { des[it.id] = Math.max(0, Math.min(1, frac)); break; }
    des[it.id] = 1;
  }
  const p = ajustar(st, hoy, des);
  p.dias = {[fecha]: {hastaAqui: true}};
  return p;
}

// «Me quedé aquí» desde el Temario: lo anterior de esa vuelta y materia queda hecho y ese trozo en la fracción dada.
export function meQuede(st, hoy, t, id, frac) {
  const q = cola(st, t), c = q.porId.get(id);
  if (!c) return {};
  const des = {};
  for (const x of q.items.filter(z => z.v === c.v)) { if (x === c) break; des[x.id] = 1; }
  des[id] = Math.max(0, Math.min(1, frac));
  return ajustar(st, hoy, des);
}
// Rango de páginas y de artículos de un trozo (para poder decir «me quedé en la pág. 14» o «en el art. 41»).
export function rangos(c) {
  const p = (c.ref || "").match(/p[aá]gs\. (\d+)-(\d+)/), a = (c.nombre || "").match(/arts?\. (\d+)(?: bis)?-(\d+)/);
  return {pags: p ? [+p[1], +p[2]] : null, arts: a ? [+a[1], +a[2]] : null};
}
export function fraccionDe(r, tipo, n) {
  const [a, b] = r[tipo] || [0, 0];
  if (b <= a) return n >= a ? 1 : 0;
  return Math.max(0, Math.min(1, (n - a) / (b - a + 1)));
}

// Empezar por un trozo: lo anterior de esa vuelta y materia queda hecho; ese trozo y lo siguiente, pendiente.
export function irA(st, hoy, t, id) {
  const q = cola(st, t), c = q.porId.get(id);
  if (!c) return {};
  const lst = q.items.filter(x => x.v === c.v), i = lst.indexOf(c), des = {};
  lst.forEach((x, k) => { des[x.id] = k < i ? 1 : 0; });
  return ajustar(st, hoy, des);
}
// Marcar (o desmarcar) un tema como visto en la 1.ª vuelta.
export function visto(st, hoy, t, n, valor = true) {
  const des = {};
  for (const c of cola(st, t).items) if (c.v === 1 && c.n === n) des[c.id] = valor ? 1 : 0;
  return ajustar(st, hoy, des);
}
export function temaVisto(st, hoy, t, n) {
  const h = hecho(st, hoy);
  const cs = cola(st, t).items.filter(c => c.v === 1 && c.n === n);
  return cs.length > 0 && cs.every(c => hechoDe(h, c.id) >= 1 - EPS);
}

// Lo que me contaste por el chat (temario.js → SEMILLAS): cada bloque se aplica una vez, en orden.
export function semilla(st, hoy) {
  const pend = SEMILLAS.filter(x => x.id > (st.semilla || 0));
  if (!pend.length) return null;
  const p = {semilla: pend[pend.length - 1].id, semanas: {}, dias: {}, manual: {}};
  let s2 = st;
  for (const S of pend) {
    if (S.semanas) Object.assign(p.semanas, S.semanas);
    for (const [f, m] of Object.entries(S.horas || {})) if (f >= hoy) p.dias[f] = {...(st.dias[f] || {}), h: m};
    if (typeof S.puntosIniciales === "number") p.puntosIniciales = S.puntosIniciales;
    s2 = completar({...s2, semanas: {...s2.semanas, ...p.semanas}, manual: {...s2.manual, ...p.manual}});
    for (const [t, ns] of Object.entries(S.vistos || {})) for (const n of ns) Object.assign(p.manual, visto(s2, hoy, t, n).manual);
    s2 = completar({...s2, manual: {...s2.manual, ...p.manual}});
    for (const [t, x] of Object.entries(S.empiezaEn || {})) {
      const c = cola(s2, t).items.find(z => z.v === 1 && z.n === x.n && z.nombre === x.nombre);
      if (c) Object.assign(p.manual, irA(s2, hoy, t, c.id).manual);
    }
    // Sesiones que se dieron por perdidas sin culpa (pantalla bloqueada): si duraron lo suficiente, cuentan.
    for (const f of S.arreglarSesiones || []) {
      const ses = (st.dias[f] && st.dias[f].ses) || [];
      if (ses.some(x => !x.ok && (x.est || 0) >= MIN_SESION)) p.dias[f] = {...(p.dias[f] || {}), ses: ses.map(x => (!x.ok && (x.est || 0) >= MIN_SESION ? {...x, ok: true} : x))};
    }
  }
  return p;
}

// Lo que has tardado en cada tema (por vuelta): el tiempo real apuntado cada día (o el previsto si no lo apuntaste),
// repartido entre los trozos que se estudiaron ese día. Clave: "leg1|1" (materia, tema, vuelta).
export function tiemposTema(st, hoy) {
  const q = {leg: cola(st, "leg"), esp: cola(st, "esp")}, out = {};
  for (const [f, r] of Object.entries(st.dias)) {
    if (f < st.inicio || f > hoy || !r || !r.s || !r.s.items) continue;
    const trozos = r.s.items.map(([id, fr]) => ({c: q.leg.porId.get(id) || q.esp.porId.get(id), fr})).filter(x => x.c);
    const prev = trozos.reduce((a, x) => a + x.fr * x.c.min, 0);
    const total = typeof r.s.real === "number" ? r.s.real : (r.s.m || 0) + (r.s.x ? r.s.x.m : 0);
    for (const x of trozos) {
      const k = `${x.c.t}${x.c.n}|${x.c.v}`;
      out[k] = (out[k] || 0) + (prev ? total * x.fr * x.c.min / prev : 0);
    }
  }
  return out;
}

export function fijarBase(st, hoy) {
  const p = previsiones(st, hoy);
  return {base: {v1: p[0] || null, desde: hoy, ritmo: st.ritmo}};
}

// Rangos de bombero según los puntos.
// Rangos de bombero según los puntos, cada uno con su recompensa (la cumples tú; en la app la marcas como cumplida).
export const RANGOS = [
  {min: -Infinity, nombre: "Opositor tieso", icono: "🥲", premio: null},
  {min: 30, nombre: "Opositor", icono: "📚", premio: "Comer fuera en tu sitio favorito"},
  {min: 60, nombre: "Bombero (C1)", icono: "🧑‍🚒", premio: "Comprarte algo que te guste (hasta 50 €)"},
  {min: 100, nombre: "Jefe de dotación (C1)", icono: "🚒", premio: "Un fin de semana libre entero, sin estudio ni callejero"},
  {min: 150, nombre: "Subinspector (B)", icono: "🎖️", premio: "Escapada de fin de semana a donde quieras"},
  {min: 220, nombre: "Inspector (B)", icono: "⭐", premio: "Capricho grande: ropa, zapatillas o lo que llevas tiempo queriendo (hasta 150 €)"},
  {min: 300, nombre: "Oficial (A2)", icono: "⭐⭐", premio: "Viaje de 3 o 4 días"},
  {min: 400, nombre: "Intendente (A1)", icono: "🏆", premio: "El gran viaje o el capricho gordo que te tengas guardado"},
];
export function rango(puntos) {
  let i = 0;
  while (i + 1 < RANGOS.length && puntos >= RANGOS[i + 1].min) i++;
  const sig = RANGOS[i + 1] || null;
  const desde = Math.max(0, RANGOS[i].min === -Infinity ? 0 : RANGOS[i].min);
  return {...RANGOS[i], sig, faltan: sig ? sig.min - puntos : 0, pct: sig ? Math.min(1, Math.max(0, (puntos - desde) / (sig.min - desde))) : 1};
}

// Frase del día (cambia cada día, la misma en todos tus dispositivos).
export const FRASES = [
  "Cada tema bien estudiado es una manguera bien enrollada: cuando la necesites, saldrá sola.",
  "Hoy entrenas la cabeza; mañana, la plaza.",
  "La constancia es el mejor equipo de protección.",
  "No hace falta un día perfecto, hace falta un día más.",
  "El fuego no espera a nadie. Tu plaza tampoco: a por ella.",
  "Un tick más, un paso más cerca del parque.",
  "Los que aprueban no son los que más saben, son los que no se paran.",
  "Respira, céntrate y a por la siguiente parte.",
  "Disciplina hoy, uniforme mañana.",
  "Cada hora de estudio es una guardia que ya llevas hecha.",
  "Sin prisa pero sin pausa: así se gana una oposición.",
  "El examen se aprueba en los días normales, como hoy.",
  "Tu yo de dentro de un año te lo va a agradecer.",
  "Cansado también se puede. Y se puede bien.",
  "Llegar al parque empieza en la mesa de estudio.",
  "Hoy no se negocia: cama, estudio, callejero y a dormir.",
  "Un buen bombero se hace con rutina. Un buen opositor, también.",
  "La plaza no se regala: se gana tema a tema.",
  "Lo difícil no es empezar, es volver cada día. Y aquí estás.",
  "Céntrate en lo que toca hoy. El resto ya está planificado.",
];
export function fraseDelDia(fecha) {
  let h = 0;
  for (const c of fecha) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FRASES[h % FRASES.length];
}
export const ICONOS = ["⏰", "💊", "🏃", "📚", "🗺️", "🥗", "🚫", "📵"];

/* ---------- Mi parque: tiempo estudiado, monedas y tienda ---------- */
// Cada minuto de estudio (temporizador o tiempo apuntado) es una moneda. Lo básico es gratis o barato; lo más chulo
// cuesta muchas horas (unas 10 h de estudio a la semana dan ~600 monedas).
export const TIENDA = [
  // Material
  {id: "extintor", nombre: "Extintor", icono: "🧯", precio: 0, tipo: "material"},
  {id: "hacha", nombre: "Hacha de bombero", icono: "🪓", precio: 100, tipo: "material"},
  {id: "linterna", nombre: "Linterna de casco", icono: "🔦", precio: 150, tipo: "material"},
  {id: "guantes", nombre: "Guantes de intervención", icono: "🧤", precio: 200, tipo: "material"},
  {id: "casco", nombre: "Casco", icono: "⛑️", precio: 300, tipo: "material"},
  {id: "cizalla", nombre: "Cizalla", icono: "✂️", precio: 400, tipo: "material"},
  {id: "cuerdas", nombre: "Cuerdas y arneses", icono: "🪢", precio: 500, tipo: "material"},
  {id: "escalera", nombre: "Escalera de mano", icono: "🪜", precio: 600, tipo: "material"},
  {id: "era", nombre: "Equipo de respiración (ERA)", icono: "🤿", precio: 800, tipo: "material"},
  {id: "separador", nombre: "Separador hidráulico", icono: "🔧", precio: 1000, tipo: "material"},
  // Instalaciones
  {id: "vestuarios", nombre: "Vestuarios y duchas", icono: "🚿", precio: 700, tipo: "instalaciones"},
  {id: "cocina", nombre: "Cocina del parque", icono: "🍳", precio: 900, tipo: "instalaciones"},
  {id: "epis", nombre: "Zona de EPIs", icono: "🦺", precio: 1200, tipo: "instalaciones"},
  {id: "dormitorio", nombre: "Dormitorio de guardia", icono: "🛏️", precio: 1500, tipo: "instalaciones"},
  {id: "gym", nombre: "Gimnasio", icono: "🏋️", precio: 2000, tipo: "instalaciones"},
  {id: "patio", nombre: "Patio de maniobras", icono: "🚩", precio: 2500, tipo: "instalaciones"},
  {id: "comunicaciones", nombre: "Sala de comunicaciones", icono: "📻", precio: 3000, tipo: "instalaciones"},
  {id: "altura", nombre: "Zona de altura (torre de maniobras)", icono: "🗼", precio: 4000, tipo: "instalaciones"},
  {id: "humo", nombre: "Casa de humo para prácticas", icono: "🔥", precio: 6000, tipo: "instalaciones"},
  {id: "edificio", nombre: "Edificio del parque", icono: "🏢", precio: 8000, tipo: "instalaciones"},
  // Vehículos
  {id: "mando", nombre: "Vehículo de mando", icono: "🚙", precio: 1500, tipo: "vehiculos"},
  {id: "sanitaria", nombre: "Unidad sanitaria", icono: "🚑", precio: 2000, tipo: "vehiculos"},
  {id: "bul", nombre: "BUL (bomba urbana ligera)", icono: "🚒", precio: 3000, tipo: "vehiculos"},
  {id: "bup", nombre: "BUP (bomba urbana pesada)", icono: "🚒", precio: 4500, tipo: "vehiculos"},
  {id: "autoescala", nombre: "Autoescala", icono: "🪜", precio: 6000, tipo: "vehiculos"},
  {id: "brazo", nombre: "Brazo articulado", icono: "🏗️", precio: 7500, tipo: "vehiculos"},
  // Exterior (pocas plantas)
  {id: "arbol", nombre: "Árbol", icono: "🌳", precio: 0, tipo: "exterior"},
  {id: "flores", nombre: "Jardinera de flores", icono: "🌷", precio: 100, tipo: "exterior"},
  {id: "palmera", nombre: "Palmera", icono: "🌴", precio: 300, tipo: "exterior"},
  {id: "naranjo", nombre: "Naranjo de Sevilla", icono: "🍊", precio: 600, tipo: "exterior"},
  // Trofeos
  {id: "medalla", nombre: "Medalla al mérito", icono: "🎖️", precio: 10000, tipo: "trofeos"},
  {id: "placa", nombre: "Placa de plaza conseguida", icono: "🏆", precio: 15000, tipo: "trofeos"},
  // Campo de maniobras (se abre a las 40 h)
  {id: "cocheexc", nombre: "Coche para excarcelación", icono: "🚗", precio: 600, tipo: "maniobras", zona: "maniobras"},
  {id: "contenedor", nombre: "Contenedor de fuego", icono: "🔥", precio: 900, tipo: "maniobras", zona: "maniobras"},
  {id: "pozo", nombre: "Pozo de rescate", icono: "🕳️", precio: 1200, tipo: "maniobras", zona: "maniobras"},
  {id: "glp", nombre: "Tanque de GLP de prácticas", icono: "🛢️", precio: 1800, tipo: "maniobras", zona: "maniobras"},
  {id: "colapso", nombre: "Estructura colapsada", icono: "🏚️", precio: 2500, tipo: "maniobras", zona: "maniobras"},
  {id: "tunel", nombre: "Simulador de túnel", icono: "🚇", precio: 3500, tipo: "maniobras", zona: "maniobras"},
  // Barrio (120 h)
  {id: "hidrante", nombre: "Hidrante", icono: "🚰", precio: 150, tipo: "barrio", zona: "barrio", repetible: true},
  {id: "farolacalle", nombre: "Farola", icono: "🏮", precio: 150, tipo: "barrio", zona: "barrio", repetible: true},
  {id: "semaforo", nombre: "Semáforo", icono: "🚦", precio: 250, tipo: "barrio", zona: "barrio", repetible: true},
  {id: "bloque", nombre: "Bloque de viviendas", icono: "🏬", precio: 1200, tipo: "barrio", zona: "barrio", repetible: true},
  {id: "gasolinera", nombre: "Gasolinera", icono: "⛽", precio: 2500, tipo: "barrio", zona: "barrio"},
  {id: "colegio", nombre: "Colegio", icono: "🏫", precio: 3000, tipo: "barrio", zona: "barrio"},
  {id: "hospital", nombre: "Hospital", icono: "🏥", precio: 5000, tipo: "barrio", zona: "barrio"},
  // Base forestal (250 h)
  {id: "pino", nombre: "Pino", icono: "🌲", precio: 100, tipo: "forestal", zona: "forestal", repetible: true},
  {id: "torrevig", nombre: "Torre de vigilancia", icono: "🗼", precio: 2000, tipo: "forestal", zona: "forestal"},
  {id: "deposito", nombre: "Depósito de agua", icono: "💧", precio: 2500, tipo: "forestal", zona: "forestal"},
  {id: "autoforestal", nombre: "Autobomba forestal", icono: "🚒", precio: 4500, tipo: "forestal", zona: "forestal"},
  {id: "helicoptero", nombre: "Helicóptero", icono: "🚁", precio: 7000, tipo: "forestal", zona: "forestal"},
  // Aeródromo y puerto (400 h)
  {id: "lancha", nombre: "Embarcación de rescate", icono: "🚤", precio: 6000, tipo: "aero", zona: "aero"},
  {id: "hangar", nombre: "Hangar", icono: "🛖", precio: 9000, tipo: "aero", zona: "aero"},
  {id: "anfibio", nombre: "Avión anfibio", icono: "🛩️", precio: 12000, tipo: "aero", zona: "aero"},
];
for (const x of TIENDA) if (!x.zona) x.zona = "parque";
// Zonas de la ciudad: se abren según las horas totales estudiadas.
export const CIUDAD = [
  {id: "parque", nombre: "Parque de bomberos", icono: "🚒", horas: 0},
  {id: "maniobras", nombre: "Campo de maniobras", icono: "🧯", horas: 40},
  {id: "barrio", nombre: "Barrio", icono: "🏬", horas: 120},
  {id: "forestal", nombre: "Base forestal", icono: "🌲", horas: 250},
  {id: "aero", nombre: "Aeródromo y puerto", icono: "🛩️", horas: 400},
];
export const zonaAbierta = (z, minutos) => minutos >= (CIUDAD.find(c => c.id === z) || {horas: 0}).horas * 60;
// Piezas colocadas en la ciudad: una por cada vez que se consigue (todas se ven en el mapa).
export function piezasCiudad(st, hoy) {
  const out = [], cuenta = {};
  const dias = Object.keys(st.dias).filter(f => f <= hoy).sort();
  for (const f of dias) for (const x of (st.dias[f] && st.dias[f].ses) || []) {
    if (!x.ok || !x.obj) continue;
    const it = TIENDA.find(t => t.id === x.obj);
    if (!it) continue;
    cuenta[x.obj] = (cuenta[x.obj] || 0) + 1;
    // La primera copia de cada pieza va a su sitio; cada repetición es otra copia más en el mapa.
    out.push({key: cuenta[x.obj] === 1 && !it.repetible ? x.obj : `${x.obj}_${cuenta[x.obj]}`, id: x.obj, n: cuenta[x.obj]});
  }
  return out;
}
export const ZONAS = [
  {tipo: "vehiculos", nombre: "Cocheras", icono: "🚒"},
  {tipo: "instalaciones", nombre: "Instalaciones", icono: "🏢"},
  {tipo: "material", nombre: "Material", icono: "🧯"},
  {tipo: "exterior", nombre: "Exterior", icono: "🌳"},
  {tipo: "trofeos", nombre: "Vitrina de trofeos", icono: "🏆"},
];
export const MIN_SESION = 10; // minutos mínimos para que lo que crece salga adelante

export function minutosDia(rec) {
  const ses = (rec && rec.ses) || [];
  let est = 0, cal = 0, desc = 0;
  for (const x of ses) { if (x.tipo === "callejero") cal += x.est || 0; else est += x.est || 0; desc += x.desc || 0; }
  if (!ses.some(x => x.tipo !== "callejero") && rec && rec.s && typeof rec.s.real === "number") est = rec.s.real;
  return {est, cal, desc, total: est + cal};
}
export function estadisticas(st, hoy) {
  const r = {hoy: 0, semana: 0, mes: 0, anio: 0, total: 0, est: 0, cal: 0, desc: 0, plantados: [], sesiones: 0};
  const mon = lunes(hoy);
  for (const [f, rec] of Object.entries(st.dias)) {
    if (f > hoy) continue;
    const m = minutosDia(rec);
    r.total += m.total; r.est += m.est; r.cal += m.cal; r.desc += m.desc;
    if (f === hoy) r.hoy += m.total;
    if (f >= mon) r.semana += m.total;
    if (f.slice(0, 7) === hoy.slice(0, 7)) r.mes += m.total;
    if (f.slice(0, 4) === hoy.slice(0, 4)) r.anio += m.total;
    for (const x of (rec && rec.ses) || []) { r.sesiones++; if (x.obj) r.plantados.push({fecha: f, obj: x.obj, ok: x.ok !== false, est: x.est}); }
  }
  r.plantados.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const gastado = Object.keys((st.parque && st.parque.compras) || {}).reduce((a, id) => a + ((TIENDA.find(x => x.id === id) || {}).precio || 0), 0);
  r.monedas = Math.floor(r.total) - gastado;
  r.gastado = gastado;
  return r;
}
export const tengo = (st, id) => {
  const it = TIENDA.find(x => x.id === id);
  return !!it && (it.precio === 0 || !!((st.parque && st.parque.compras) || {})[id]);
};

export const textoMin = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `${m} min`);
