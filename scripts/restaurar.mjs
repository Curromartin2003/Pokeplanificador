// Restaura el documento del planificador desde la mejor copia rescate_* (la que tiene más días, semanas y avance),
// le aplica las correcciones pendientes (semillas) con el código ya arreglado y lo guarda entero. Antes guarda una copia
// del estado actual en rescate_antes_de_restaurar_<hora>. Uso: node scripts/restaurar.mjs [AAAA-MM-DD]
import admin from "firebase-admin";
import * as E from "../js/engine.js";
import {aFirestore, desdeFirestore, fusionar} from "../js/store.js";
admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.SA))});
const db = admin.firestore();
const hoy = process.argv[2] || new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const cuenta = d => {
  const x = d || {}, dias = x.dias || {};
  const ses = Object.values(dias).reduce((a, r) => a + Object.keys((r && r.sesiones) || {}).length + ((r && r.ses) || []).length, 0);
  return {dias: Object.keys(dias).length, sesiones: ses, semanas: Object.keys(x.semanas || {}).length, manual: Object.keys(x.manual || {}).length, semilla: x.semilla};
};
for (const col of await db.collection("data").doc("users").listCollections()) {
  const ref = col.doc("planificador"), actual = await ref.get();
  if (!actual.exists) continue;
  const copias = (await col.get()).docs.filter(d => /^rescate_\d+$/.test(d.id));
  if (!copias.length) { console.log("sin copias de rescate"); continue; }
  const val = d => { const c = cuenta(d.data()); return [c.dias, c.sesiones, c.semanas, c.manual]; };
  copias.sort((a, b) => { const x = val(a), y = val(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; });
  const mejor = copias[0];
  console.log("copia elegida", mejor.id, new Date(+mejor.id.slice(8)).toISOString(), JSON.stringify(cuenta(mejor.data())));
  await col.doc("rescate_antes_de_restaurar_" + Date.now()).set(actual.data());
  const base = desdeFirestore(mejor.data());
  const st = E.completar(base);
  const p = E.semilla(st, hoy) || {};
  const final = fusionar(base, p);
  await ref.set(aFirestore(final));
  const total = E.resumen(E.completar(final), hoy).total;
  console.log("restaurado:", JSON.stringify(cuenta(final)), "· puntos hoy:", total, "· semilla", final.semilla);
}
process.exit(0);
