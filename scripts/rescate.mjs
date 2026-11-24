// Rescate: lee las versiones del documento del planificador de la última hora (Firestore guarda 1 h de versiones)
// y guarda cada versión distinta en data/users/{uid}/rescate_<hora> dentro de la propia cuenta. No borra ni cambia nada.
import admin from "firebase-admin";
const sa = JSON.parse(process.env.SA);
admin.initializeApp({credential: admin.credential.cert(sa)});
const db = admin.firestore();
const cuenta = d => {
  const x = d || {}, dias = x.dias || {};
  const ses = Object.values(dias).reduce((a, r) => a + Object.keys((r && r.sesiones) || {}).length + ((r && r.ses) || []).length, 0);
  return {dias: Object.keys(dias).length, sesiones: ses, semanas: Object.keys(x.semanas || {}).length, manual: Object.keys(x.manual || {}).length, semilla: x.semilla};
};
const usuarios = await db.collection("data").doc("users").listCollections().catch(() => []);
let refs = [];
for (const col of usuarios) refs.push(col.doc("planificador"));
if (!refs.length) { // estructura data/users/{uid}/...: los uid son colecciones bajo el documento data/users
  console.log("no hay colecciones bajo data/users");
}
const ahora = Date.now();
for (const ref of refs) {
  const actual = await ref.get();
  if (!actual.exists) continue;
  console.log("== cuenta", ref.parent.id.slice(0, 4) + "…", "ahora:", JSON.stringify(cuenta(actual.data())));
  const vistas = new Map();
  for (let m = 59; m >= 0; m -= 1) {
    const t = admin.firestore.Timestamp.fromMillis(ahora - m * 60000);
    try {
      const snap = await db.runTransaction(tx => tx.get(ref), {readOnly: true, readTime: t});
      if (!snap.exists) continue;
      const k = snap.updateTime.toMillis();
      if (!vistas.has(k)) vistas.set(k, snap.data());
    } catch (e) { if (m === 59) console.log("lectura antigua no disponible:", String(e.message).slice(0, 120)); }
  }
  let mejor = null;
  for (const [k, d] of [...vistas].sort((a, b) => a[0] - b[0])) {
    const c = cuenta(d);
    console.log("  versión", new Date(k).toISOString(), JSON.stringify(c));
    await ref.parent.doc("rescate_" + k).set(d);
    if (!mejor || c.dias > mejor.c.dias || (c.dias === mejor.c.dias && c.sesiones >= mejor.c.sesiones)) mejor = {k, d, c};
  }
  if (mejor) { await ref.parent.doc("rescate_mejor").set({...mejor.d, _rescate: {version: new Date(mejor.k).toISOString(), ...mejor.c}}); console.log("  MEJOR:", new Date(mejor.k).toISOString(), JSON.stringify(mejor.c)); }
}
process.exit(0);
