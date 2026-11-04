// Dónde se guarda el estado.
//  - Con Firebase (firebase-config.js): el mismo proyecto y la misma cuenta que Pokecallejero. Un solo documento,
//    data/users/{uid}/planificador, que ya permiten las reglas de Pokecallejero. Se sincroniza al momento entre
//    dispositivos y funciona sin conexión (caché local de Firestore).
//  - Sin Firebase, o con ?local en la dirección: localStorage (solo este dispositivo; lo usan las pruebas).
const V = "10.14.1";
const CDN = m => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;

export function fusionar(a, b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b;
  const o = {...(a && typeof a === "object" && !Array.isArray(a) ? a : {})};
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) ? fusionar(o[k], v) : v;
  return o;
}

export async function abrir({onEstado, onUsuario}) {
  const cfg = window.POKE_FB || {};
  const local = !cfg.firebase || new URLSearchParams(location.search).has("local");
  return local ? abrirLocal(onEstado, onUsuario) : abrirFirebase(cfg, onEstado, onUsuario);
}

function abrirLocal(onEstado, onUsuario) {
  const K = "pp.estado";
  let st = null;
  try { st = JSON.parse(localStorage.getItem(K) || "null"); } catch (e) { st = null; }
  const api = {
    modo: "local",
    email: "este dispositivo",
    async guardar(p) {
      st = fusionar(st, p);
      try { localStorage.setItem(K, JSON.stringify(st)); } catch (e) {}
      onEstado(st, true);
    },
    async salir() {},
  };
  setTimeout(() => { onUsuario({email: api.email}); onEstado(st, true, false); }, 0);
  window.addEventListener("storage", e => { if (e.key === K) { try { st = JSON.parse(e.newValue || "null"); onEstado(st, true); } catch (x) {} } });
  return api;
}

async function abrirFirebase(cfg, onEstado, onUsuario) {
  const [{initializeApp}, A, FS] = await Promise.all([import(CDN("app")), import(CDN("auth")), import(CDN("firestore"))]);
  const app = initializeApp(cfg.firebase);
  const auth = A.getAuth(app);
  auth.languageCode = "es";
  let db;
  try { db = FS.initializeFirestore(app, {localCache: FS.persistentLocalCache({tabManager: FS.persistentMultipleTabManager()})}); }
  catch (e) { db = FS.getFirestore(app); }
  if (cfg.emulator) {
    A.connectAuthEmulator(auth, `http://${cfg.emulator}:9099`, {disableWarnings: true});
    FS.connectFirestoreEmulator(db, cfg.emulator, 8080);
  }
  let ref = null, unsub = null;
  const api = {
    modo: "firebase",
    email: "",
    async entrar(email, pw) { await A.signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pw); },
    async recuperar(email) { await A.sendPasswordResetEmail(auth, email.trim().toLowerCase()); },
    async guardar(p) {
      if (!ref) return;
      // No se espera a que llegue al servidor: sin conexión, Firestore lo guarda y lo sube al volver.
      FS.setDoc(ref, p, {merge: true}).catch(e => console.warn("guardar", e));
    },
    async salir() { if (unsub) unsub(); await A.signOut(auth); location.reload(); },
  };
  A.onAuthStateChanged(auth, u => {
    if (unsub) { unsub(); unsub = null; }
    if (!u) { ref = null; onUsuario(null); return; }
    if (!u.emailVerified) { onUsuario({email: u.email, sinVerificar: true}); return; }
    api.email = u.email;
    onUsuario({email: u.email});
    ref = FS.doc(db, `data/users/${u.uid}/planificador`);
    unsub = FS.onSnapshot(ref, {includeMetadataChanges: true}, s => {
      // Si aún no hay documento y la respuesta viene de la caché, se espera al servidor antes de crear uno nuevo.
      onEstado(s.exists() ? s.data() : null, !s.metadata.fromCache || s.exists(), s.metadata.fromCache || s.metadata.hasPendingWrites);
    }, e => onUsuario({email: u.email, error: e.code || String(e)}));
  });
  return api;
}
