// Lógica del planificador, sin nada de interfaz (se prueba con `node --test tests/`).
// Todo se calcula a partir del estado guardado; nada del plan se guarda salvo lo ya hecho.
import {LEGISLACION, ESPECIFICO} from "./temario.js";

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
  "Examen oficial del tribunal",
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
export function estadoNuevo(hoy) {
  return {v: 1, inicio: hoy, ritmo: "competitivo", reparto: "alterno", examen: null, semanas: {}, dias: {},
    ajuste: {leg: 0, esp: 0}, titulos: {}, callejeroUrl: "", base: null};
}
export const completar = s => ({...estadoNuevo(s && s.inicio || hoyLocal()), ...(s || {}),
  ajuste: {leg: 0, esp: 0, ...(s && s.ajuste || {})}, semanas: {...(s && s.semanas || {})}, dias: {...(s && s.dias || {})},
  titulos: {...(s && s.titulos || {})}});

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
  const total = tipo === "libre" ? 0 : MINUTOS[dow];
  const minCal = Math.round(total * PCT_CALLEJERO);
  return {fecha, dow, tipo, total, minCal, minEst: tipo === "estudio" ? total - minCal : 0, semanaPuesta: cfg.puesta};
}

/* ---------- colas de estudio ---------- */
const temas = t => (t === "leg" ? LEGISLACION : ESPECIFICO);
const r5 = x => Math.max(5, Math.round(x / 5) * 5);
const cacheCola = new Map();
export function cola(st, t) {
  const f = (RITMOS[st.ritmo] || RITMOS.competitivo).f;
  const key = t + f + JSON.stringify(st.titulos);
  if (cacheCola.has(key)) return cacheCola.get(key);
  const out = [], fin = [];
  let pos = 0;
  for (let v = 1; v <= VUELTAS; v++) {
    const vf = VUELTA_F[Math.min(v, VUELTA_F.length) - 1];
    for (const tm of temas(t)) {
      const titulo = st.titulos[t + tm.n] || tm.titulo;
      if (v === 1) {
        tm.partes.forEach(([nombre, m], i) => {
          const min = r5(m * f);
          out.push({t, v, n: tm.n, titulo, parte: i + 1, partes: tm.partes.length, nombre, min, ini: pos});
          pos += min;
        });
      } else {
        const min = r5(tm.partes.reduce((a, p) => a + p[1], 0) * f * vf);
        out.push({t, v, n: tm.n, titulo, parte: 1, partes: 1, min, ini: pos,
          nombre: v === 2 ? "2.ª vuelta: repaso con tus esquemas y test del tema" : `${v}.ª vuelta: repaso rápido y test`});
        pos += min;
      }
    }
    fin.push(pos);
  }
  const r = {items: out, fin};
  cacheCola.set(key, r);
  return r;
}
// Trozos de la cola entre pos y pos+len minutos.
export function tramo(q, pos, len) {
  const res = [];
  const end = pos + len;
  for (const c of q.items) {
    const a = Math.max(pos, c.ini), b = Math.min(end, c.ini + c.min);
    if (b > a) res.push({...c, desde: a - c.ini, hasta: b - c.ini, mins: b - a});
    if (c.ini >= end) break;
  }
  return res;
}
export const vueltaDe = (q, pos) => { const i = q.fin.findIndex(x => pos < x); return i < 0 ? q.fin.length : i + 1; };

/* ---------- recorrido día a día ---------- */
// Recorre desde el inicio hasta `hasta` y llama a cb(dia) en cada día. Los días ya pasados solo avanzan el temario si
// se marcó el estudio; desde hoy en adelante se supone que se cumple el plan (para calcular fechas).
export function recorrer(st, hoy, hasta, cb) {
  const pos = {leg: st.ajuste.leg || 0, esp: st.ajuste.esp || 0};
  const q = {leg: cola(st, "leg"), esp: cola(st, "esp")};
  let sig = "leg", nCal = 0;
  for (let f = st.inicio; f <= hasta; f = sumaDias(f, 1)) {
    const d = infoDia(st, f), rec = st.dias[f] || null;
    d.rec = rec;
    if (d.tipo !== "libre") d.foco = FOCOS_CALLEJERO[nCal++ % FOCOS_CALLEJERO.length];
    if (d.tipo === "estudio") {
      let t, m;
      if (rec && rec.s) { t = rec.s.t; m = rec.s.m; d.hecho = true; }
      else {
        t = st.reparto === "proporcional"
          ? (pos.leg / q.leg.fin[0] <= pos.esp / q.esp.fin[0] ? "leg" : "esp") : sig;
        m = d.minEst; d.hecho = false;
      }
      d.materia = t; d.min = m; d.pos = pos[t];
      d.plan = tramo(q[t], pos[t], m);
      if (d.hecho || f >= hoy) pos[t] += m;
      sig = t === "leg" ? "esp" : "leg";
    }
    d.posDespues = {...pos};
    if (cb(d, q) === false) break;
  }
  return pos;
}

export function dia(st, hoy, fecha) {
  let out = null;
  recorrer(st, hoy, fecha, d => { if (d.fecha === fecha) out = d; });
  return out || infoDia(st, fecha);
}
export function dias(st, hoy, desde, hasta) {
  const out = [];
  recorrer(st, hoy, hasta, d => { if (d.fecha >= desde) out.push(d); });
  return out;
}

// Posición en el temario al empezar hoy (lo hecho hasta ayer más lo marcado hoy).
export function progreso(st, hoy) {
  const q = {leg: cola(st, "leg"), esp: cola(st, "esp")};
  const pos = {leg: st.ajuste.leg || 0, esp: st.ajuste.esp || 0};
  for (const [f, r] of Object.entries(st.dias)) if (f >= st.inicio && f <= hoy && r && r.s) pos[r.s.t] += r.s.m;
  const m = t => {
    const v = vueltaDe(q[t], pos[t]), ini = v === 1 ? 0 : q[t].fin[v - 2], fin = q[t].fin[v - 1];
    const actual = q[t].items.find(c => pos[t] < c.ini + c.min);
    return {pos: pos[t], vuelta: v, pctVuelta: (pos[t] - ini) / (fin - ini), total1: q[t].fin[0], actual};
  };
  return {leg: m("leg"), esp: m("esp")};
}

// Fechas en que terminarías cada vuelta completa (las dos materias) si cumples el plan desde hoy.
export function previsiones(st, hoy, max = 1460) {
  const fin = [];
  let k = 0;
  recorrer(st, hoy, sumaDias(hoy, max), (d, q) => {
    while (k < 4 && d.posDespues.leg >= q.leg.fin[k] && d.posDespues.esp >= q.esp.fin[k]) fin[k++] = d.fecha;
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
export function puntosDia(d, rec) {
  if (d.tipo === "libre") return null;
  const hechos = ((rec && rec.c) || []).slice(0, OBJETIVOS.length).filter(Boolean).length;
  const fallos = OBJETIVOS.length - hechos;
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
    OBJETIVOS.forEach((_, i) => { if (rec && rec.c && rec.c[i]) cumple[i]++; });
  }
  let racha = 0;
  for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].p === null) continue; if (hist[i].p === 1) racha++; else break; }
  let mejor = 0, cur = 0;
  for (const h of hist) { if (h.p === null) continue; cur = h.p === 1 ? cur + 1 : 0; mejor = Math.max(mejor, cur); }
  const dHoy = infoDia(st, hoy);
  return {total, racha, mejor, hist, nDias, cumple: cumple.map(c => (nDias ? c / nDias : 0)),
    hoy: puntosDia(dHoy, st.dias[hoy]), hoyLibre: dHoy.tipo === "libre"};
}

/* ---------- cambios (devuelven el parche que hay que guardar) ---------- */
export function marcar(st, hoy, fecha, i, valor) {
  const d = dia(st, hoy, fecha);
  const rec = st.dias[fecha] || {};
  const c = OBJETIVOS.map((_, k) => !!(rec.c && rec.c[k]));
  c[i] = valor;
  let s = rec.s || null;
  if (i === I_ESTUDIO && d.tipo === "estudio") s = valor ? {t: d.materia, m: d.min} : null;
  return {dias: {[fecha]: {c, s}}};
}

// Pone el temario de una materia justo al principio de una parte (para ajustar lo que ya llevas estudiado).
export function irA(st, hoy, t, ini) {
  const p = progreso(st, hoy)[t].pos;
  const dHoy = st.dias[hoy];
  const hoyHecho = dHoy && dHoy.s && dHoy.s.t === t ? dHoy.s.m : 0;
  return {ajuste: {...st.ajuste, [t]: (st.ajuste[t] || 0) + (ini - (p - hoyHecho))}};
}

export function fijarBase(st, hoy) {
  const p = previsiones(st, hoy);
  return {base: {v1: p[0] || null, desde: hoy, ritmo: st.ritmo}};
}

export const textoMin = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `${m} min`);
