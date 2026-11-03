// Pruebas de la lógica: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../js/engine.js";

const HOY = "2026-11-03"; // martes
const base = (semanas = {"2026-11-02": {libre: 6, luis: [0, 2]}}) => E.completar({inicio: "2026-11-02", semanas});
const todos = (v = true) => E.OBJETIVOS.map(() => v);

test("tipos de día, minutos y 30 % de callejero", () => {
  const st = base();
  const d = E.dias(st, HOY, "2026-11-02", "2026-11-08");
  assert.deepEqual(d.map(x => x.tipo), ["luis", "estudio", "luis", "estudio", "estudio", "estudio", "libre"]);
  assert.deepEqual(d.map(x => x.total), [60, 180, 60, 180, 60, 180, 0]);
  assert.equal(d[1].minCal, 54); assert.equal(d[1].minEst, 126);
  assert.equal(d[4].minCal, 18); assert.equal(d[4].minEst, 42);
  assert.equal(d[0].minCal, 18); // día de Luis: solo clase y callejero
});

test("alterna legislación y específico", () => {
  const d = E.dias(base(), HOY, "2026-11-02", "2026-11-15").filter(x => x.tipo === "estudio");
  d.forEach((x, i) => assert.equal(x.materia, i % 2 ? "esp" : "leg"));
});

test("el plan del día empieza donde se quedó y lo no hecho se recoloca", () => {
  let st = base();
  const d1 = E.dia(st, HOY, HOY);
  assert.equal(d1.materia, "leg"); assert.equal(d1.plan[0].n, 1); assert.equal(d1.pos, 0);
  // Si hoy no estudio, mañana (otro martes de legislación) sigue en el mismo punto.
  const proxLeg = E.dias(st, "2026-11-07", "2026-11-04", "2026-11-14").find(x => x.tipo === "estudio" && x.materia === "leg" && x.fecha >= "2026-11-07");
  assert.equal(proxLeg.pos, 0);
  // Marcado el estudio, la próxima de legislación sigue después de los 126 min.
  st = E.completar({...st, dias: {[HOY]: {c: todos(), s: {t: "leg", m: 126}}}});
  const sig = E.dias(st, "2026-11-07", "2026-11-04", "2026-11-14").find(x => x.materia === "leg" && x.fecha > HOY);
  assert.equal(sig.pos, 126);
});

test("marcar el estudio guarda materia y minutos; desmarcar lo quita", () => {
  const st = base();
  const p = E.marcar(st, HOY, HOY, E.I_ESTUDIO, true);
  assert.deepEqual(p.dias[HOY].s, {t: "leg", m: 126});
  const st2 = E.completar({...st, dias: p.dias});
  assert.equal(E.marcar(st2, HOY, HOY, E.I_ESTUDIO, false).dias[HOY].s, null);
  assert.equal(E.progreso(st2, HOY).leg.pos, 126);
});

test("puntos: todos +1, falla uno 0, falla dos o más −1, libre no cuenta", () => {
  const d = {tipo: "estudio"};
  assert.equal(E.puntosDia(d, {c: todos()}), 1);
  const uno = todos(); uno[2] = false;
  assert.equal(E.puntosDia(d, {c: uno}), 0);
  const dos = [...uno]; dos[5] = false;
  assert.equal(E.puntosDia(d, {c: dos}), -1);
  assert.equal(E.puntosDia(d, {c: todos(false)}), -1);
  assert.equal(E.puntosDia(d, undefined), -1);
  assert.equal(E.puntosDia({tipo: "libre"}, undefined), null);
});

test("resumen: total, racha y días sin marcar restan", () => {
  const uno = todos(); uno[0] = false;
  const st = E.completar({...base(), dias: {"2026-11-02": {c: todos()}, "2026-11-03": {c: uno}, "2026-11-04": {c: todos()}, "2026-11-05": {c: todos()}}});
  const r = E.resumen(st, "2026-11-10"); // 6, 7 y 9 sin marcar → −1 cada uno; 8 es libre
  assert.equal(r.total, 1 + 0 + 1 + 1 - 1 - 1 - 1);
  assert.equal(r.racha, 0); assert.equal(r.mejor, 2);
  assert.equal(r.hist.find(h => h.fecha === "2026-11-08").p, null);
});

test("las semanas sin configurar usan la última puesta", () => {
  const st = base({"2026-11-02": {libre: 5, luis: [1, 3]}});
  const d = E.infoDia(st, "2026-11-21"); // sábado de otra semana
  assert.equal(d.tipo, "libre"); assert.equal(d.semanaPuesta, false);
  assert.equal(E.infoDia(st, "2026-11-22").total, 180); // el domingo se estudia 3 h
});

test("previsiones: fechas crecientes y el ritmo intenso acaba antes", () => {
  const st = base();
  const p = E.previsiones(st, HOY);
  assert.equal(p.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(p[i] > p[i - 1]);
  const c = E.comparaRitmos(st, HOY);
  const f = r => c.find(x => x.ritmo === r).fechas[0];
  assert.ok(f("intenso") < f("competitivo") && f("competitivo") < f("base"));
  // El reparto proporcional nunca debe acabar la 1.ª vuelta claramente después del alterno.
  assert.ok(E.difDias(p[0], E.previsiones({...st, reparto: "proporcional"}, HOY)[0]) <= 14);
});

test("irA coloca el temario al principio de la parte elegida", () => {
  const st = base();
  const q = E.cola(st, "esp");
  const t6 = q.items.find(c => c.n === 6 && c.v === 1);
  const st2 = E.completar({...st, ...E.irA(st, HOY, "esp", t6.ini)});
  assert.equal(E.progreso(st2, HOY).esp.actual.n, 6);
  const sig = E.dias(st2, HOY, HOY, "2026-11-10").find(x => x.materia === "esp");
  assert.equal(sig.plan[0].n, 6); assert.equal(sig.plan[0].desde, 0);
});

test("temario completo: 12 de legislación y 38 de específico (33 + 5 del SPEIS)", () => {
  const st = base();
  const n = t => new Set(E.cola(st, t).items.filter(c => c.v === 1).map(c => c.n)).size;
  assert.equal(n("leg"), 12); assert.equal(n("esp"), 38);
});
