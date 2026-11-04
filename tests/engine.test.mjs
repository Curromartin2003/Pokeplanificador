// Pruebas de la lógica: node --test tests/engine.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../js/engine.js";

const HOY = "2026-11-03"; // martes
const base = (semanas = {"2026-11-02": {libre: 6, luis: [0, 2]}}, extra = {}) => E.completar({inicio: "2026-11-02", semanas, ...extra});
const todos = (v = true) => E.OBJETIVOS.map(() => v);
const aplicar = (st, p) => E.completar({...st, ...p, semanas: {...st.semanas, ...(p.semanas || {})}, dias: {...st.dias, ...(p.dias || {})},
  manual: {...st.manual, ...(p.manual || {})}, materiales: {...st.materiales, ...(p.materiales || {})}});

test("tipos de día, minutos y 30 % de callejero", () => {
  const d = E.dias(base(), HOY, "2026-11-02", "2026-11-08");
  assert.deepEqual(d.map(x => x.tipo), ["luis", "estudio", "luis", "estudio", "estudio", "estudio", "libre"]);
  assert.deepEqual(d.map(x => x.total), [60, 180, 60, 180, 60, 180, 0]);
  assert.equal(d[1].minCal, 54); assert.equal(d[1].minEst, 126);
  assert.equal(d[4].minCal, 18); assert.equal(d[4].minEst, 42);
});

test("tiempo de un día cambiado solo ese día", () => {
  const st = base(undefined, {dias: {[HOY]: {h: 60}}});
  const d = E.dia(st, HOY, HOY);
  assert.equal(d.total, 60); assert.equal(d.minEst, 42); assert.ok(d.horasCambiadas);
  assert.equal(E.dia(st, HOY, "2026-11-05").total, 180);
});

test("alterna legislación y específico mientras van por la misma vuelta", () => {
  const d = E.dias(base(), HOY, HOY, "2026-11-15").filter(x => x.tipo === "estudio");
  d.forEach((x, i) => assert.equal(x.materia, i % 2 ? "esp" : "leg"));
});

test("el plan sigue donde se quedó; lo no hecho se recoloca", () => {
  let st = base();
  const d1 = E.dia(st, HOY, HOY);
  assert.equal(d1.plan[0].n, 1); assert.equal(d1.plan[0].desde, 0);
  // Si hoy no estudio, el próximo día de legislación empieza en el mismo sitio.
  const sig = E.dias(st, "2026-11-07", "2026-11-04", "2026-11-14").find(x => x.materia === "leg" && x.fecha >= "2026-11-07");
  assert.equal(sig.plan[0].id, d1.plan[0].id); assert.equal(sig.plan[0].desde, 0);
  // Marcado, el siguiente de legislación sigue después.
  st = aplicar(st, E.marcar(st, HOY, HOY, E.I_ESTUDIO, true));
  const sig2 = E.dias(st, "2026-11-07", "2026-11-04", "2026-11-14").find(x => x.materia === "leg" && x.fecha > HOY);
  assert.notEqual(sig2.plan[0].id, d1.plan[0].id);
  assert.equal(Math.round(E.progreso(st, HOY).leg.pctVuelta * E.cola(st, "leg").tot[0]), 126);
});

test("marcar guarda los trozos hechos y desmarcar los quita", () => {
  const st = base();
  const p = E.marcar(st, HOY, HOY, E.I_ESTUDIO, true);
  assert.equal(p.dias[HOY].s.t, "leg"); assert.equal(p.dias[HOY].s.m, 126);
  assert.ok(p.dias[HOY].s.items.length >= 1);
  const st2 = aplicar(st, p);
  assert.equal(E.marcar(st2, HOY, HOY, E.I_ESTUDIO, false).dias[HOY].s, null);
});

test("puntos: todos +1, falla uno 0, falla dos o más −1, libre no cuenta", () => {
  const d = {tipo: "estudio"};
  assert.equal(E.puntosDia(d, {c: todos()}), 1);
  const uno = todos(); uno[2] = false;
  assert.equal(E.puntosDia(d, {c: uno}), 0);
  const dos = [...uno]; dos[5] = false;
  assert.equal(E.puntosDia(d, {c: dos}), -1);
  assert.equal(E.puntosDia(d, undefined), -1);
  assert.equal(E.puntosDia({tipo: "libre"}, undefined), null);
});

test("resumen: total, racha y días sin marcar restan", () => {
  const uno = todos(); uno[0] = false;
  const st = base(undefined, {dias: {"2026-11-02": {c: todos()}, "2026-11-03": {c: uno}, "2026-11-04": {c: todos()}, "2026-11-05": {c: todos()}}});
  const r = E.resumen(st, "2026-11-10");
  assert.equal(r.total, 1 + 0 + 1 + 1 - 1 - 1 - 1);
  assert.equal(r.racha, 0); assert.equal(r.mejor, 2);
});

test("específico: solo entran los temas con PDF; legislación entera", () => {
  const st = base();
  const n = t => new Set(E.cola(st, t).items.filter(c => c.v === 1).map(c => c.n));
  assert.equal(n("leg").size, 12);
  const esp = n("esp");
  assert.ok(esp.has(6) && esp.has(13) && esp.has(17));
  assert.ok(!esp.has(2) && !esp.has(11) && !esp.has(19));
  assert.ok(E.temasSinMaterial(st).some(x => x.n === 2));
});

test("subir un PDF mete el tema en la vuelta y retrasa la fecha", () => {
  const st = base();
  const antes = E.previsiones(st, HOY)[0];
  const st2 = aplicar(st, {materiales: {esp2: [{id: "x", doc: "SPEIS Andalucía", wpm: 70, pal: Array(30).fill(500), t: HOY}]}});
  assert.ok(E.cola(st2, "esp").items.some(c => c.n === 2 && c.v === 1));
  assert.ok(E.previsiones(st2, HOY)[0] > antes);
});

test("los PDF se parten en trozos de ~50 min por páginas", () => {
  const ps = E.partesDePdf({doc: "X", wpm: 70, pal: Array(20).fill(700)});
  assert.ok(ps.length >= 3);
  assert.ok(ps.every(p => p.min <= 75 && p.min >= 15));
  assert.equal(ps[0].ref, "X · págs. 1-" + ps[0].ref.split("-")[1]);
});

test("marcar un tema como visto lo saca de la 1.ª vuelta y vuelve en la 2.ª", () => {
  const st = aplicar(base(), E.visto(base(), HOY, "esp", 1));
  assert.ok(E.temaVisto(st, HOY, "esp", 1));
  const d = E.dias(st, HOY, HOY, "2026-11-10").filter(x => x.materia === "esp");
  assert.ok(d[0].plan.every(it => it.n !== 1));
  const v2 = E.cola(st, "esp").items.find(c => c.v === 2 && c.n === 1);
  assert.ok(v2 && E.fraccion(E.hecho(st, HOY), v2.id) === 0);
});

test("empezar aquí: lo anterior hecho, lo demás pendiente", () => {
  const st = base();
  const c = E.cola(st, "esp").items.find(x => x.v === 1 && x.n === 6);
  const st2 = aplicar(st, E.irA(st, HOY, "esp", c.id));
  assert.equal(E.progreso(st2, HOY).esp.actual.id, c.id);
});

test("vueltas a la par: acabada la legislación, solo específico; luego se empieza todo", () => {
  const st = base();
  const qL = E.cola(st, "leg");
  // Toda la legislación de la 1.ª vuelta hecha salvo 10 min del último trozo.
  const des = {};
  qL.items.filter(c => c.v === 1).forEach(c => { des[c.id] = 1; });
  const ult = qL.items.filter(c => c.v === 1).pop();
  des[ult.id] = 1 - 10 / ult.min;
  const s2 = aplicar(st, {manual: des});
  const hoy = E.dia(s2, HOY, HOY);
  assert.equal(hoy.partes[0].t, "leg"); assert.equal(hoy.partes[0].m, 10);
  assert.equal(hoy.partes[1].t, "esp"); assert.equal(hoy.partes[1].m, 116);
  // Después, todos los días son de específico.
  const ds = E.dias(s2, HOY, "2026-11-04", "2026-11-30").filter(d => d.tipo === "estudio");
  assert.ok(ds.every(d => d.partes.every(x => x.t === "esp")));
  // En toda la previsión, la 2.ª vuelta de legislación no empieza antes de acabar la 1.ª de específico.
  const qE = E.cola(st, "esp");
  E.recorrer(st, HOY, "2028-12-31", d => {
    if (d.tipo !== "estudio") return;
    const espAcabado = qE.items.every(c => c.v !== 1 || E.fraccion(d.h, c.id) > 0.999);
    for (const it of d.plan) if (it.t === "leg" && it.v === 2) assert.ok(espAcabado, d.fecha);
  });
});

test("previsiones: fechas crecientes y el ritmo intenso acaba antes", () => {
  const st = base();
  const p = E.previsiones(st, HOY);
  assert.equal(p.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(p[i] > p[i - 1]);
  const c = E.comparaRitmos(st, HOY), f = r => c.find(x => x.ritmo === r).fechas[0];
  assert.ok(f("intenso") < f("competitivo") && f("competitivo") < f("base"));
});

test("semilla: semana, martes de 1 h, temas vistos y Constitución desde el Cap. III", () => {
  const st = E.completar(E.estadoNuevo(HOY));
  const st2 = aplicar(st, E.semilla(st, HOY));
  assert.deepEqual(st2.semanas["2026-11-02"], {libre: 5, luis: [3, 6]});
  assert.equal(E.dia(st2, HOY, HOY).total, 60);
  assert.ok(E.temaVisto(st2, HOY, "esp", 1) && E.temaVisto(st2, HOY, "esp", 3));
  const pr = E.progreso(st2, HOY);
  assert.equal(pr.leg.actual.n, 1); assert.match(pr.leg.actual.nombre, /Cap\. III/);
  assert.equal(pr.esp.actual.n, 4);
  assert.equal(E.semilla(st2, HOY), null);
});

test("tiempo real: si tardas más de lo previsto, lo que queda se alarga y la vuelta se retrasa", () => {
  let st = base();
  const antes = E.previsiones(st, HOY)[0];
  const c0 = E.cola(st, "leg").items[5].min;
  st = aplicar(st, E.marcar(st, HOY, HOY, E.I_ESTUDIO, true));
  const p = E.tiempoReal(st, HOY, 252); // el doble de los 126 previstos
  st = E.completar({...st, dias: {...st.dias, [HOY]: {...st.dias[HOY], s: {...st.dias[HOY].s, ...p.dias[HOY].s}}}});
  const cal = E.calibracion(st);
  assert.ok(cal.leg > 1.4 && cal.leg < 2); assert.equal(cal.esp, 1);
  assert.ok(E.cola(st, "leg").items[5].min > c0);
  assert.ok(E.previsiones(st, HOY)[0] > antes);
  // Lo ya hecho se conserva.
  assert.ok(E.progreso(st, HOY).leg.pctVuelta > 0);
});

test("«No entra» quita una parte de todas las vueltas y se puede volver a meter", () => {
  const st = base();
  const c = E.cola(st, "esp").items.find(x => x.v === 1 && x.n === 8 && /1846-2/.test(x.nombre));
  const tot0 = E.cola(st, "esp").tot;
  const st2 = aplicar(st, E.noEntra("esp", 8, c));
  st2.fuera = {esp8: E.noEntra("esp", 8, c).fuera.esp8};
  assert.ok(!E.cola(st2, "esp").items.some(x => x.id === c.id));
  assert.ok(E.cola(st2, "esp").tot[0] < tot0[0] && E.cola(st2, "esp").tot[1] < tot0[1]);
  const st3 = E.completar({...st2, fuera: {esp8: {...st2.fuera.esp8, ...E.noEntra("esp", 8, c, false).fuera.esp8}}});
  assert.ok(E.cola(st3, "esp").items.some(x => x.id === c.id));
});

test("puntos iniciales (7) y tiempo por tema con lo apuntado", () => {
  const st0 = E.completar(E.estadoNuevo(HOY));
  const st = aplicar(st0, E.semilla(st0, HOY));
  assert.equal(st.puntosIniciales, 7);
  assert.equal(E.resumen(st, HOY).total, 7);
  let s2 = aplicar(st, E.marcar(st, HOY, HOY, E.I_ESTUDIO, true));
  s2 = E.completar({...s2, dias: {...s2.dias, [HOY]: {...s2.dias[HOY], s: {...s2.dias[HOY].s, real: 50}}}});
  const t = E.tiemposTema(s2, HOY);
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 50) < 0.5);
  assert.ok(t["leg1|1"] > 0);
});

test("día con 0 h de estudio: no cuentan estudio ni callejero, con los otros 6 se suma", () => {
  const seis = todos(); seis[E.I_ESTUDIO] = false; seis[4] = false;
  const st = base(undefined, {dias: {[HOY]: {h: 0, c: seis}}});
  const d = E.dia(st, HOY, HOY);
  assert.ok(d.sinEstudio); assert.equal(d.minEst, 0); assert.equal(d.minCal, 0);
  assert.equal(E.puntosDia(d, st.dias[HOY]), 1);
  const cinco = [...seis]; cinco[0] = false;
  assert.equal(E.puntosDia(d, {c: cinco}), 0);
  // No gasta el turno: el siguiente día de estudio sigue tocando legislación.
  const sig = E.dias(st, HOY, "2026-11-04", "2026-11-10").find(x => x.tipo === "estudio");
  assert.equal(sig.materia, "leg");
});

test("Mi parque: minutos, monedas y tienda", () => {
  const st = base(undefined, {dias: {[HOY]: {ses: [{tipo: "estudio", est: 50, desc: 10, obj: "arbol", ok: true}, {tipo: "callejero", est: 20, desc: 0, obj: "extintor", ok: true}]},
    "2026-11-02": {s: {t: "leg", m: 42, real: 30, items: []}}}, parque: {compras: {hacha: HOY}}});
  const e = E.estadisticas(st, HOY);
  assert.equal(e.hoy, 70); assert.equal(e.total, 100); assert.equal(e.semana, 100); assert.equal(e.desc, 10);
  assert.equal(e.monedas, 100 - 100);
  assert.ok(E.tengo(st, "hacha") && E.tengo(st, "extintor") && !E.tengo(st, "autoescala"));
  assert.equal(e.plantados.length, 2);
});

test("«Hasta aquí»: lo anterior hecho, la parte a medias y marcar el estudio no vuelve a sumar", () => {
  let st = base();
  const d = E.dia(st, HOY, HOY);
  const segundo = d.plan[1];
  st = aplicar(st, E.hastaAqui(st, HOY, HOY, segundo.id, 0.5));
  st.dias[HOY] = {...st.dias[HOY], hastaAqui: true};
  const h = E.hecho(st, HOY);
  assert.equal(E.fraccion(h, d.plan[0].id), 1);
  assert.ok(Math.abs(E.fraccion(h, segundo.id) - 0.5) < 1e-9);
  const p = E.marcar(st, HOY, HOY, E.I_ESTUDIO, true);
  assert.deepEqual(p.dias[HOY].s.items, []);
  const st2 = aplicar(st, p);
  assert.ok(Math.abs(E.fraccion(E.hecho(st2, HOY), segundo.id) - 0.5) < 1e-9);
});

test("ciudad: cada repetición es otra copia en el mapa y las zonas se abren con las horas", () => {
  const ses = [{tipo: "estudio", est: 30, obj: "extintor", ok: true}, {tipo: "estudio", est: 30, obj: "extintor", ok: true},
    {tipo: "estudio", est: 30, obj: "bul", ok: true}, {tipo: "estudio", est: 5, obj: "bul", ok: false}];
  const st = base(undefined, {dias: {[HOY]: {ses}}});
  const p = E.piezasCiudad(st, HOY);
  assert.deepEqual(p.map(x => x.key), ["extintor", "extintor_2", "bul"]);
  assert.ok(E.zonaAbierta("parque", 0) && !E.zonaAbierta("maniobras", 39 * 60) && E.zonaAbierta("maniobras", 40 * 60));
  assert.ok(E.TIENDA.reduce((a, x) => a + x.precio, 0) > 120000, "completarlo todo lleva muchísimas horas");
});

test("semilla 3: las sesiones dadas por perdidas por bloqueo de pantalla cuentan si duraron lo suficiente", () => {
  const ses = [{tipo: "callejero", est: 33, desc: 0, obj: "extintor", ok: false}, {tipo: "estudio", est: 4, obj: "extintor", ok: false}];
  const st = E.completar({...E.estadoNuevo("2026-11-03"), semilla: 2, dias: {"2026-11-04": {ses}}});
  const p = E.semilla(st, "2026-11-04");
  assert.equal(p.semilla, 3);
  assert.deepEqual(p.dias["2026-11-04"].ses.map(x => x.ok), [true, false]);
});
