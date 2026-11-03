// Interfaz del planificador. Pinta todo a partir del estado (engine.js) y guarda los cambios con store.js.
import * as E from "./engine.js";
import {abrir} from "./store.js";
import {FUENTE, CAMBIOS} from "./temario.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const params = new URLSearchParams(location.search);
// ?hoy=AAAA-MM-DD solo para pruebas.
const HOY = () => params.get("hoy") || E.hoyLocal();

let store = null, st = null, listo = false;
const ui = {vista: "hoy", fecha: null, semana: null, abierto: {}, modalSemana: null, login: {paso: "email", email: "", err: "", msg: ""}};

/* ---------- arranque ---------- */
async function main() {
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  try {
    store = await abrir({onEstado, onUsuario});
  } catch (e) {
    pantalla(`<div class="vacio"><h2>No se pudo conectar</h2><p>Comprueba la conexión y vuelve a abrir la app.</p></div>`);
  }
  // Al volver a la app (o al cambiar de día con la app abierta) se repinta.
  let ultimo = HOY();
  document.addEventListener("visibilitychange", () => { if (!document.hidden && HOY() !== ultimo) { ultimo = HOY(); ui.fecha = null; pintar(); } });
  setInterval(() => { if (HOY() !== ultimo) { ultimo = HOY(); ui.fecha = null; pintar(); } }, 60000);
}

function onUsuario(u) {
  if (!u) { listo = false; pintarLogin(); return; }
  if (u.sinVerificar) { ui.login = {paso: "email", email: u.email, err: "Tu correo aún no está confirmado. Confírmalo desde Pokecallejero y vuelve a entrar."}; pintarLogin(); return; }
  if (u.error) { pantalla(`<div class="vacio"><h2>Sin acceso</h2><p>Tu cuenta no tiene permiso (${esc(u.error)}). Habla con el administrador de Pokecallejero.</p><button class="btn" id="salir">Salir</button></div>`); $("#salir").onclick = () => store.salir(); return; }
  $("#login").hidden = true;
  $("#app").hidden = false;
}

function onEstado(raw, definitivo) {
  const hoy = HOY();
  if (!raw) {
    if (!definitivo) return;
    const nuevo = E.estadoNuevo(hoy);
    st = E.completar(nuevo);
    store.guardar({...nuevo, ...E.fijarBase(st, hoy)});
    return;
  }
  st = E.completar(raw);
  // Lo que se contó por el chat (temario.js → SEMILLA) se aplica una vez.
  const sem = E.semilla(st, hoy);
  if (sem && !ui.semillaEnviada) { ui.semillaEnviada = true; guardar(sem); }
  listo = true;
  pintar();
}

async function guardar(parche) {
  st = E.completar(fusion(st, parche));
  pintar();
  await store.guardar(parche);
}
function fusion(a, b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b;
  const o = {...a};
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) ? fusion(a && a[k] || {}, v) : v;
  return o;
}

/* ---------- acceso (Firebase) ---------- */
function pintarLogin() {
  $("#app").hidden = true;
  const box = $("#login");
  box.hidden = false;
  const g = ui.login;
  const err = g.err ? `<p class="err" role="alert">${esc(g.err)}</p>` : "";
  const msg = g.msg ? `<p class="nota">${esc(g.msg)}</p>` : "";
  box.querySelector(".cuerpo").innerHTML = `
    <form id="fLogin" novalidate>
      <label class="campo"><span>Correo</span><input id="lEmail" type="email" autocomplete="email" inputmode="email" value="${esc(g.email)}" placeholder="nombre@correo.com"></label>
      <label class="campo"><span>Contraseña</span><input id="lPw" type="password" autocomplete="current-password"></label>
      ${err}${msg}
      <button class="btn grande" id="lGo" type="submit">Entrar</button>
      <button class="enlace" id="lOlvido" type="button">He olvidado la contraseña</button>
      <p class="nota">Es la misma cuenta de Pokecallejero. Tu plan se sincroniza en todos tus dispositivos.</p>
    </form>`;
  $("#fLogin").onsubmit = async e => {
    e.preventDefault();
    ui.login.email = $("#lEmail").value;
    const b = $("#lGo"); b.disabled = true; b.textContent = "Entrando…";
    try { await store.entrar($("#lEmail").value, $("#lPw").value); ui.login.err = ""; }
    catch (x) { ui.login.err = errorAcceso(x); pintarLogin(); }
  };
  $("#lOlvido").onclick = async () => {
    const em = $("#lEmail").value.trim();
    ui.login.email = em;
    if (!em) { ui.login.err = "Escribe tu correo arriba."; return pintarLogin(); }
    try { await store.recuperar(em); ui.login.err = ""; ui.login.msg = `Te hemos enviado a ${em} un correo para crear una contraseña nueva. Mira también en «Spam».`; }
    catch (x) { ui.login.err = errorAcceso(x); }
    pintarLogin();
  };
}
function errorAcceso(e) {
  const c = e && e.code;
  return {"auth/invalid-credential": "Correo o contraseña incorrectos.", "auth/wrong-password": "La contraseña no es correcta.",
    "auth/user-not-found": "No hay ninguna cuenta con ese correo. Créala primero en Pokecallejero.",
    "auth/invalid-email": "Escribe un correo válido.", "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "No hay conexión."}[c] || "No se pudo entrar. Inténtalo de nuevo.";
}

/* ---------- pintado general ---------- */
function pantalla(html) { $("#vista").innerHTML = html; }
let memoPrev = {k: null, v: null};
function prevs(hoy) {
  const k = hoy + JSON.stringify([st.dias, st.manual, st.materiales, st.semanas, st.ritmo, st.titulos]);
  if (memoPrev.k !== k) memoPrev = {k, v: E.previsiones(st, hoy)};
  return memoPrev.v;
}

function pintar() {
  if (!st || !listo) return;
  const hoy = HOY();
  const res = E.resumen(st, hoy);
  $("#puntos").innerHTML = `<b>${res.total > 0 ? "+" : ""}${res.total}</b><span>puntos</span>`;
  $("#puntos").className = "puntos " + (res.total > 0 ? "pos" : res.total < 0 ? "neg" : "");
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === ui.vista));
  const f = {hoy: vHoy, semana: vSemana, temario: vTemario, progreso: vProgreso, ajustes: vAjustes}[ui.vista] || vHoy;
  pantalla(f(hoy, res));
  enlazar();
  // Al empezar la semana (o si aún no está puesta) se pregunta el día libre y las clases de Luis.
  const mon = E.lunes(hoy);
  if (!st.semanas[mon] && !ui.modalSemana && !ui.cerradoSemana) abrirSemana(mon);
}

/* ---------- Hoy ---------- */
function vHoy(hoy) {
  const fecha = ui.fecha || hoy;
  const d = E.dia(st, hoy, fecha);
  const rec = st.dias[fecha] || {};
  const futuro = fecha > hoy, antes = fecha < st.inicio;
  const nav = `<div class="navdia">
    <button class="ico" data-a="diaMenos" aria-label="Día anterior">‹</button>
    <div><h1>${fecha === hoy ? "Hoy" : fecha === E.sumaDias(hoy, -1) ? "Ayer" : fecha === E.sumaDias(hoy, 1) ? "Mañana" : cap(E.DIAS[d.dow])}</h1>
    <p class="sub">${cap(E.fechaLarga(fecha))}</p></div>
    <button class="ico" data-a="diaMas" aria-label="Día siguiente">›</button></div>
    ${fecha !== hoy ? `<button class="enlace centro" data-a="diaHoy">Volver a hoy</button>` : ""}`;
  let aviso = "";
  if (fecha === hoy && d.dow === 6 && !st.semanas[E.lunes(E.sumaDias(hoy, 1))])
    aviso = `<div class="aviso">Mañana empieza semana. <button class="btn peque" data-a="semanaSig">Elegir día libre y clases de Luis</button></div>`;
  if (fecha === hoy) aviso = avisoCambios(hoy) + aviso;
  if (antes) return nav + `<div class="vacio"><p>El plan empieza el ${E.fechaLarga(st.inicio)}.</p></div>`;
  if (d.tipo === "libre") return nav + aviso + `<div class="libre"><div class="big">🌴</div><h2>Día libre</h2><p>Hoy no hay objetivos ni estudio: descansa de verdad. La puntuación no cambia.</p></div>` + manana(hoy, fecha);

  const c = E.OBJETIVOS.map((_, i) => !!(rec.c && rec.c[i]));
  const hechos = c.filter(Boolean).length;
  const p = E.puntosDia(d, rec);
  const chip = d.tipo === "luis" ? `<span class="chip luis">Clase de Luis</span>` : `<span class="chip ${d.materia}">${E.MATERIAS[d.materia]}</span>`;
  const marcador = `<div class="marcador ${p > 0 ? "pos" : p < 0 ? "neg" : "cero"}">
    <div class="anillo" style="--p:${hechos / 8}"><span>${hechos}/8</span></div>
    <div><b>${futuro ? "Aún no ha llegado" : p > 0 ? "+1 punto" : p < 0 ? "−1 punto" : "Se mantiene"}</b>
    <p>${futuro ? "Podrás marcar los objetivos ese día." : hechos === 8 ? "¡Todos hechos!" : hechos === 7 ? "Te falta 1: con todos sumas un punto." : `Te faltan ${8 - hechos}. Si fallas 2 o más, restas un punto.`}</p></div>
    ${chip}</div>`;

  const items = E.OBJETIVOS.map((txt, i) => {
    let titulo = txt, det = "";
    if (i === E.I_ESTUDIO) {
      if (d.tipo === "luis") { titulo = "Clase de Luis"; det = `<p class="det">Hoy solo clase y callejero.</p>`; }
      else { titulo = `Estudio: ${d.partes.map(x => E.MATERIAS[x.t]).join(" y ")} · ${E.textoMin(d.min)}`; det = planHTML(d); }
    }
    if (i === 4) {
      titulo = `Callejero · ${E.textoMin(d.minCal)}`;
      const url = st.callejeroUrl;
      det = `<p class="det">Enfoque: <b>${esc(d.foco)}</b>${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Abrir Pokecallejero</a>` : ""}</p>`;
    }
    return `<li class="obj ${c[i] ? "ok" : ""}">
      <button class="tick" data-tick="${i}" ${futuro ? "disabled" : ""} aria-pressed="${c[i]}" aria-label="${esc(titulo)}">
        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <div class="txt"><span class="t">${esc(titulo)}</span>${det}</div></li>`;
  }).join("");
  const tiempo = `<div class="tiempo"><label>Tiempo ${fecha === hoy ? "de hoy" : "de este día"}:
    <select id="tiempoDia">${[["", `Normal (${E.textoMin(d.horasNormales)})`], ["60", "1 h"], ["120", "2 h"], ["180", "3 h"]]
      .map(([v, t]) => `<option value="${v}" ${(d.horasCambiadas ? String(d.total) : "") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    ${d.horasCambiadas ? `<span class="nota">Cambiado solo este día.</span>` : ""}</div>`;
  return nav + aviso + marcador + `<ul class="objs">${items}</ul>` + tiempo + manana(hoy, fecha);
}

// Aviso de cambios en el plan: novedades sin leer y cómo cambia la fecha de las vueltas.
function avisoCambios(hoy) {
  const eta = prevs(hoy)[0] || null;
  const nuevos = [...CAMBIOS.filter(c => !st.leidos[c.id]), ...st.cambios.filter(c => !st.leidos[c.id])];
  const cambiaEta = st.etaVista && eta && st.etaVista !== eta;
  if (!nuevos.length && !cambiaEta && st.etaVista) return "";
  const dd = cambiaEta ? E.difDias(st.etaVista, eta) : 0;
  const vel = !st.etaVista ? `Tu 1.ª vuelta completa: <b>${E.fechaLarga(eta)}</b>.` : cambiaEta
    ? `1.ª vuelta: <s>${E.fechaLarga(st.etaVista)}</s> → <b>${E.fechaLarga(eta)}</b> (${Math.abs(dd)} días ${dd > 0 ? "más tarde" : "antes"}).`
    : `La fecha de tu 1.ª vuelta no cambia: ${E.fechaLarga(eta)}.`;
  return `<div class="cambios"><b>Cambios en tu plan</b>${nuevos.length ? `<ul>${nuevos.map(c => `<li>${esc(c.texto)}</li>`).join("")}</ul>` : ""}
    <p>${vel}</p><button class="btn peque" data-a="leidoCambios" data-eta="${eta || ""}">Entendido</button></div>`;
}

function planHTML(d) {
  if (!d.plan || !d.plan.length) return "";
  return `<ol class="plan">${d.plan.map(it => {
    const sigue = it.desde > 0, corta = it.hasta < it.min;
    const estado = sigue && corta ? `del min ${it.desde} al ${it.hasta} de ${it.min}` : sigue ? `termina (te quedan ${it.mins} min)` : corta ? `empieza: ${it.mins} de ${it.min} min` : `${it.mins} min`;
    const cambio = d.partes.length > 1 && it.t !== d.plan[0].t && it === d.plan.find(z => z.t === it.t)
      ? `<li class="aviso-vuelta">Terminas la vuelta de ${E.MATERIAS[d.plan[0].t].toLowerCase()}: el resto del tiempo, ${E.MATERIAS[it.t].toLowerCase()}.</li>` : "";
    return cambio + `<li><span class="tt">${it.v > 1 ? it.v + ".ª vuelta · " : ""}Tema ${it.n} · ${esc(it.titulo)}</span>
      <span class="parte">${it.partes > 1 ? `Parte ${it.parte}/${it.partes}: ` : ""}${esc(it.nombre)}</span>${it.ref ? `<span class="ref">📄 ${esc(it.ref)}</span>` : ""}<span class="min">${estado}</span></li>`;
  }).join("")}</ol>`;
}

function manana(hoy, fecha) {
  const sig = E.sumaDias(fecha, 1);
  const d = E.dia(st, hoy, sig);
  let t = d.tipo === "libre" ? "Día libre" : d.tipo === "luis" ? `Clase de Luis y callejero (${d.minCal} min)` :
    `${d.partes.map(x => E.MATERIAS[x.t]).join(" y ")} ${E.textoMin(d.min)}: ${d.plan && d.plan[0] ? `Tema ${d.plan[0].n} · ${esc(d.plan[0].titulo)}` : ""} · callejero ${d.minCal} min`;
  return `<div class="manana"><span>${fecha === hoy ? "Mañana" : cap(E.fechaLarga(sig))}</span><p>${t}</p></div>`;
}

/* ---------- Semana ---------- */
function vSemana(hoy) {
  const mon = ui.semana || E.lunes(hoy);
  const cfg = E.semana(st, mon);
  const ds = E.dias(st, hoy, mon < st.inicio ? st.inicio : mon, E.sumaDias(mon, 6));
  const est = ds.filter(d => d.tipo === "estudio");
  const min = t => est.reduce((a, d) => a + d.partes.filter(x => x.t === t).reduce((b, x) => b + x.m, 0), 0);
  const cal = ds.reduce((a, d) => a + (d.minCal || 0), 0);
  const fin = E.sumaDias(mon, 6);
  const cab = `<div class="navdia"><button class="ico" data-a="semMenos" aria-label="Semana anterior">‹</button>
    <div><h1>Semana</h1><p class="sub">${E.fechaLarga(mon, false)} – ${E.fechaLarga(fin, false)}</p></div>
    <button class="ico" data-a="semMas" aria-label="Semana siguiente">›</button></div>
    <div class="tarjeta fila"><div><b>Libre:</b> ${E.DIAS[cfg.libre]} · <b>Clases de Luis:</b> ${cfg.luis.length ? cfg.luis.map(i => E.DIAS[i]).join(" y ") : "ninguna"}
    ${cfg.puesta ? "" : `<p class="nota">Sin confirmar: se usa la de la semana anterior.</p>`}</div>
    <button class="btn peque" data-a="editSemana" data-m="${mon}">${cfg.puesta ? "Cambiar" : "Elegir"}</button></div>
    <div class="resumenSem"><div><b>${E.textoMin(min("leg"))}</b><span>Legislación</span></div><div><b>${E.textoMin(min("esp"))}</b><span>Específico</span></div><div><b>${E.textoMin(cal)}</b><span>Callejero</span></div></div>`;
  const lista = ds.map(d => {
    const rec = st.dias[d.fecha];
    const p = d.fecha < hoy ? E.puntosDia(d, rec) : null;
    const hechos = rec && rec.c ? rec.c.filter(Boolean).length : 0;
    const pts = d.tipo === "libre" ? "" : d.fecha < hoy ? `<span class="pt ${p > 0 ? "pos" : p < 0 ? "neg" : "cero"}">${p > 0 ? "+1" : p < 0 ? "−1" : "0"}</span>` : d.fecha === hoy ? `<span class="pt hoy">${hechos}/8</span>` : "";
    const que = d.tipo === "libre" ? "Libre" : d.tipo === "luis" ? `Clase de Luis + callejero ${d.minCal} min` :
      `${d.partes.map(x => E.MATERIAS[x.t]).join(" y ")} ${E.textoMin(d.min)} + callejero ${d.minCal} min`;
    const temas = d.plan ? [...new Map(d.plan.map(x => [x.v + "-" + x.n, x])).values()].map(x => `${x.v > 1 ? x.v + ".ª v. · " : ""}T${x.n} ${esc(x.titulo)}`).join(" · ") : "";
    return `<li class="dia ${d.tipo} ${d.fecha === hoy ? "hoy" : ""}" data-a="verDia" data-f="${d.fecha}">
      <div class="dn"><b>${E.DIAS_CORTO[d.dow]}</b><span>${+d.fecha.slice(8)}</span></div>
      <div class="dq"><span class="t">${que}</span>${temas ? `<span class="s">${temas}</span>` : ""}</div>${pts}</li>`;
  }).join("");
  return cab + `<ul class="semana">${lista}</ul>`;
}

/* ---------- Temario ---------- */
function vTemario(hoy) {
  const pr = E.progreso(st, hoy), h = pr.leg.h;
  const bloque = t => {
    const p = pr[t], v = p.vuelta, ts = E.temas(st, t), q = E.cola(st, t);
    const lista = ts.map(tm => {
      const cs = q.items.filter(c => c.v === v && c.n === tm.n);
      const tot = cs.reduce((a, c) => a + c.min, 0) || 1, hechoMin = cs.reduce((a, c) => a + E.fraccion(h, c.id) * c.min, 0);
      const pct = hechoMin / tot, est = pct >= 0.999 ? "hecho" : pct > 0.001 ? "curso" : "pend";
      const k = t + tm.n, abierto = ui.abierto[k], visto = E.temaVisto(st, hoy, t, tm.n);
      const subidos = st.materiales[k] || [];
      const partes = abierto ? `<ul class="partes">${cs.map(c => {
        const f = E.fraccion(h, c.id), e = f >= 0.999 ? "hecho" : f > 0.001 ? "curso" : "pend";
        return `<li class="${e}"><span>${c.partes > 1 ? c.parte + ". " : ""}${esc(c.nombre)}${c.ref ? `<small class="ref">📄 ${esc(c.ref)}</small>` : ""}</span><span class="m">${c.min} min</span>
          <button class="enlace peque" data-a="irA" data-t="${t}" data-id="${c.id}">Empezar aquí</button></li>`;
      }).join("")}</ul>
      <div class="acc-tema"><button class="btn peque sec" data-a="visto" data-t="${t}" data-n="${tm.n}" data-v="${visto ? 0 : 1}">${visto ? "Quitar «visto»" : "Marcar como visto"}</button>
        ${botonSubir(t, tm.n)}</div>
      ${subidos.length ? `<ul class="subidos">${subidos.map((d, i) => `<li>📎 ${esc(d.doc)} <small>(${d.pal.length} págs., subido el ${E.fechaLarga(d.t, false)})</small> <button class="enlace peque" data-a="quitarPdf" data-k="${k}" data-i="${i}">Quitar</button></li>`).join("")}</ul>` : ""}
      ${t === "esp" && tm.n > 33 ? `<button class="enlace peque" data-a="renombrar" data-k="${k}">Cambiar el título de este tema</button>` : ""}
      <p class="contenido">${tm.material.length ? `<b>Tu material:</b> ${esc(tm.material.join(" · "))}<br>` : "<b>Sin material todavía:</b> partes según el decreto.<br>"}${esc(tm.contenido)}</p>` : "";
      return `<li class="tema ${est}"><button class="cab" data-a="abrirTema" data-k="${k}">
        <span class="num">${tm.n > 33 && t === "esp" ? "S" + (tm.n - 33) : tm.n}</span><span class="nom">${esc(tm.titulo)}${tm.material.length ? ` <span class="pdf" title="Con tu material">📄</span>` : ""}${visto && v === 1 ? ` <span class="chip visto">visto</span>` : ""}</span>
        <span class="barra"><i style="width:${Math.round(pct * 100)}%"></i></span></button>${partes}</li>`;
    }).join("");
    const sin = t === "esp" ? E.temasSinMaterial(st) : [];
    return `<section class="bloque"><div class="bcab"><h2>${E.MATERIAS[t]}</h2><span>${v}.ª vuelta · ${Math.round(p.pctVuelta * 100)} %</span></div>
      <div class="barra gruesa"><i style="width:${Math.round(p.pctVuelta * 100)}%"></i></div>
      ${p.actual ? `<p class="nota">Vas por: Tema ${p.actual.n} · ${esc(p.actual.nombre)}</p>` : ""}
      <ul class="temas">${lista}</ul>
      ${sin.length ? `<h3 class="fuera">Sin PDF: fuera de la vuelta (${sin.length})</h3><p class="nota">Cuando subas su PDF, el tema entra en la vuelta y el plan se recalcula.</p>
        <ul class="temas sin">${sin.map(x => `<li class="tema pend"><div class="cab"><span class="num">${x.n > 33 ? "S" + (x.n - 33) : x.n}</span><span class="nom">${esc(x.titulo)}</span>${botonSubir("esp", x.n)}</div></li>`).join("")}</ul>` : ""}
    </section>`;
  };
  return `<h1>Temario</h1><p class="sub">${esc(FUENTE)}</p>
    <p class="nota">Toca un tema para ver sus partes. «Empezar aquí» coloca el plan en esa parte; «Marcar como visto» saca el tema de la 1.ª vuelta. Con «Subir PDF» añades material y la vuelta se recalcula.</p>
    ${ui.subiendo ? `<div class="aviso">${esc(ui.subiendo)}</div>` : ""}
    ${bloque("leg")}${bloque("esp")}`;
}
const botonSubir = (t, n) => `<label class="btn peque subir">Subir PDF<input type="file" accept="application/pdf" hidden data-subir="${t}${n}"></label>`;

// Lee un PDF en el navegador (pdf.js) y cuenta las palabras de cada página.
let pdfjs = null;
async function cargarPdfjs() {
  if (pdfjs) return pdfjs;
  await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return pdfjs;
}
async function palabrasPdf(file) {
  const lib = await cargarPdfjs();
  const pdf = await lib.getDocument({data: await file.arrayBuffer()}).promise;
  const pal = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    pal.push(tc.items.map(x => x.str).join(" ").split(/\s+/).filter(Boolean).length);
    if (i % 10 === 0) { ui.subiendo = `Leyendo «${file.name}»: página ${i} de ${pdf.numPages}…`; pintar(); }
  }
  return pal;
}
async function subirPdf(k, file) {
  const t = k.startsWith("leg") ? "leg" : "esp", n = +k.slice(3);
  const ritmo = prompt(`¿Cómo vas a estudiar «${file.name}»?\n1 = a fondo (como la Constitución)\n2 = normal, lo subrayado\n3 = lectura rápida o consulta`, "2");
  if (ritmo === null) return;
  const wpm = {1: 40, 2: t === "leg" ? 65 : 70, 3: 130}[ritmo.trim()] || 70;
  try {
    ui.subiendo = `Leyendo «${file.name}»…`; pintar();
    const pal = await palabrasPdf(file);
    const hoy = HOY(), antes = prevs(hoy)[0] || null;
    const doc = file.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim().slice(0, 80);
    const lista = [...(st.materiales[k] || []), {id: Date.now().toString(36), doc, wpm, pal, t: hoy}];
    const despues = E.previsiones(E.completar({...st, materiales: {...st.materiales, [k]: lista}}), hoy)[0] || null;
    const mins = E.partesDePdf({doc, wpm, pal}).reduce((a, x) => a + x.min, 0);
    const texto = `Añadido «${doc}» al tema ${n} de ${E.MATERIAS[t].toLowerCase()} (${pal.length} págs., ${E.textoMin(mins)} en la 1.ª vuelta).`;
    ui.subiendo = null;
    await guardar({materiales: {[k]: lista}, cambios: [...st.cambios, {id: "u" + Date.now().toString(36), fecha: hoy, texto, antes, despues}]});
  } catch (e) {
    ui.subiendo = "No se pudo leer el PDF. Prueba con otro archivo o con conexión."; pintar();
  }
}

/* ---------- Progreso ---------- */
function vProgreso(hoy, res) {
  const prev = prevs(hoy);
  const pr = E.progreso(st, hoy);
  const semanas = prev[0] ? Math.ceil(E.difDias(hoy, prev[0]) / 7) : null;
  let retraso = "";
  if (st.base && st.base.v1 && prev[0]) {
    const dd = E.difDias(st.base.v1, prev[0]);
    retraso = dd > 3 ? `<p class="mal">Vas ${dd} días por detrás del plan del ${E.fechaLarga(st.base.desde, false)}: lo que no marcas se recoloca en los días siguientes.</p>`
      : dd < -3 ? `<p class="bien">Vas ${-dd} días por delante del plan.</p>` : `<p class="bien">Vas al día con el plan.</p>`;
  }
  const examen = st.examen ? (() => {
    const n = prev.filter(f => f && f <= st.examen).length;
    const dias = E.difDias(hoy, st.examen);
    return `<div class="tarjeta"><h3>Examen: ${E.fechaLarga(st.examen)} <span class="nota">(${dias} días)</span></h3>
      <p>Al ritmo actual llegas con <b>${n} ${n === 1 ? "vuelta" : "vueltas"}</b> completas. ${n >= 3 ? "Es un ritmo de aprobado con plaza." : n === 2 ? "Bien, pero lo competitivo son 3 vueltas: prueba el ritmo intenso en Ajustes." : "Necesitas subir el ritmo: mira Ajustes."}</p></div>`;
  })() : `<div class="tarjeta"><p>Pon la fecha del examen en <button class="enlace" data-a="ajustes">Ajustes</button> para saber con cuántas vueltas llegas.</p></div>`;
  const vueltas = prev.map((f, i) => `<li><b>${i + 1}.ª vuelta</b><span>${f ? E.fechaLarga(f) : "—"}</span></li>`).join("");
  // Gráfica de puntos acumulados.
  const graf = grafica(res.hist.map(x => x.acum));
  // Calendario de las últimas 8 semanas.
  const l0 = E.lunes(st.inicio), desde = E.sumaDias(E.lunes(hoy), -49) > l0 ? E.sumaDias(E.lunes(hoy), -49) : l0;
  let cal = "";
  for (let f = desde; f <= E.sumaDias(E.lunes(hoy), 6); f = E.sumaDias(f, 1)) {
    const x = res.hist.find(z => z.fecha === f);
    const cls = f < st.inicio ? "fuera" : f >= hoy ? (f === hoy ? "hoy" : "fut") : x.tipo === "libre" ? "libre" : x.p > 0 ? "pos" : x.p < 0 ? "neg" : "cero";
    cal += `<i class="${cls}" title="${f}"></i>`;
  }
  const obj = E.OBJETIVOS.map((t, i) => `<li><span>${esc(i === E.I_ESTUDIO ? "Estudio del día / clase" : t)}</span><span class="barra"><i style="width:${Math.round(res.cumple[i] * 100)}%"></i></span><b>${Math.round(res.cumple[i] * 100)} %</b></li>`).join("");
  return `<h1>Progreso</h1>
    <div class="kpis"><div><b class="${res.total > 0 ? "pos" : res.total < 0 ? "neg" : ""}">${res.total > 0 ? "+" : ""}${res.total}</b><span>Puntos</span></div>
      <div><b>${res.racha}</b><span>Racha de +1</span></div><div><b>${res.mejor}</b><span>Mejor racha</span></div></div>
    <div class="tarjeta"><h3>Vuelta al temario</h3>
      ${prev[0] ? `<p class="grande">Terminas la 1.ª vuelta el <b>${E.fechaLarga(prev[0])}</b>${semanas ? ` (en ${semanas} semanas)` : ""}.</p>` : ""}
      ${retraso}
      <div class="dos"><div><span>Legislación</span><b>${pr.leg.vuelta}.ª vuelta · ${Math.round(pr.leg.pctVuelta * 100)} %</b><span class="barra"><i style="width:${Math.round(pr.leg.pctVuelta * 100)}%"></i></span></div>
      <div><span>Específico</span><b>${pr.esp.vuelta}.ª vuelta · ${Math.round(pr.esp.pctVuelta * 100)} %</b><span class="barra"><i style="width:${Math.round(pr.esp.pctVuelta * 100)}%"></i></span></div></div>
      <ul class="vueltas">${vueltas}</ul>
      <p class="nota">Ritmo ${E.RITMOS[st.ritmo].nombre.toLowerCase()}. Un día legislación y otro específico; cuando una materia acaba la vuelta, todos los días son de la otra hasta que la acaba también, y empieza la siguiente vuelta de las dos. Se calcula con la semana tipo actual y suponiendo que cumples el plan desde hoy.</p></div>
    ${examen}
    <div class="tarjeta"><h3>Puntos acumulados</h3>${graf}</div>
    <div class="tarjeta"><h3>${E.difDias(desde, E.lunes(hoy)) >= 49 ? "Últimas 8 semanas" : "Calendario"}</h3><div class="cal">${E.DIAS_CORTO.map(x => `<b>${x}</b>`).join("")}${cal}</div>
      <p class="leyenda"><i class="pos"></i>+1 <i class="cero"></i>0 <i class="neg"></i>−1 <i class="libre"></i>libre</p></div>
    <div class="tarjeta"><h3>Cumplimiento de cada objetivo</h3><ul class="cumple">${obj}</ul></div>
    <div class="tarjeta"><h3>Historial de cambios del plan</h3><ul class="historial">${[...CAMBIOS, ...st.cambios].slice().reverse().map(c =>
      `<li><small>${E.fechaLarga(c.fecha, false)}</small> ${esc(c.texto)}${c.antes && c.despues && c.antes !== c.despues ? ` <span class="nota">1.ª vuelta: ${E.fechaLarga(c.antes, false)} → ${E.fechaLarga(c.despues, false)}</span>` : ""}</li>`).join("")}</ul></div>`;
}
function grafica(v) {
  if (v.length < 2) return `<p class="nota">La gráfica aparece cuando lleves un par de días.</p>`;
  const W = 320, H = 110, min = Math.min(0, ...v), max = Math.max(1, ...v);
  const x = i => (i / (v.length - 1)) * W, y = n => H - 8 - ((n - min) / (max - min)) * (H - 16);
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join("");
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="cero"/><path d="${d}"/></svg>`;
}

/* ---------- Ajustes ---------- */
function vAjustes(hoy) {
  const comp = E.comparaRitmos(st, hoy);
  const ritmos = comp.map(r => `<label class="opcion ${st.ritmo === r.ritmo ? "on" : ""}"><input type="radio" name="ritmo" value="${r.ritmo}" ${st.ritmo === r.ritmo ? "checked" : ""}>
    <span><b>${r.nombre}</b> · ${r.txt}<br><small>1.ª vuelta: ${r.fechas[0] ? E.fechaLarga(r.fechas[0]) : "—"}${r.vueltasAntesExamen !== null ? ` · ${r.vueltasAntesExamen} vueltas antes del examen` : ""}</small></span></label>`).join("");
  return `<h1>Ajustes</h1>
    <div class="tarjeta"><h3>Ritmo</h3>${ritmos}</div>
    <div class="tarjeta"><h3>Fecha del examen</h3><input type="date" id="examen" value="${st.examen || ""}"><p class="nota">Con ella se calcula con cuántas vueltas llegas.</p></div>
    <div class="tarjeta"><h3>Enlace a Pokecallejero</h3><input type="url" id="calleUrl" placeholder="https://….netlify.app" value="${esc(st.callejeroUrl)}"><p class="nota">Aparece en el objetivo «Callejero» para abrirlo con un toque.</p></div>
    <div class="tarjeta"><h3>Semana actual</h3><button class="btn" data-a="editSemana" data-m="${E.lunes(hoy)}">Día libre y clases de Luis</button></div>
    <div class="tarjeta"><h3>Plan de referencia</h3><p class="nota">Sirve para ver si vas por delante o por detrás. ${st.base && st.base.v1 ? `Ahora: 1.ª vuelta el ${E.fechaLarga(st.base.v1)}.` : ""}</p><button class="btn" data-a="base">Fijar el plan de hoy como referencia</button></div>
    <div class="tarjeta"><h3>Cuenta</h3><p>${store.modo === "local" ? "Guardado solo en este dispositivo." : `Sincronizado con <b>${esc(store.email)}</b>.`}</p>
      ${store.modo === "local" ? "" : `<button class="btn sec" data-a="salir">Salir</button>`}</div>
    <p class="nota centro">Plan empezado el ${E.fechaLarga(st.inicio)}.</p>`;
}

/* ---------- modal de la semana ---------- */
function abrirSemana(mon) {
  const c = E.semana(st, mon);
  ui.modalSemana = {mon, libre: c.libre, luis: [...c.luis]};
  pintarModal();
}
function pintarModal() {
  const m = ui.modalSemana, box = $("#modal");
  if (!m) { box.hidden = true; return; }
  box.hidden = false;
  const fin = E.sumaDias(m.mon, 6);
  const err = m.luis.length > 2 ? `<p class="err">Marca como mucho 2 días de clase.</p>` : "";
  box.querySelector(".hoja").innerHTML = `<h2>Semana del ${E.fechaLarga(m.mon, false)} al ${E.fechaLarga(fin, false)}</h2>
    <h3>¿Qué día libras?</h3><div class="segm">${[5, 6].map(i => `<button class="${m.libre === i ? "on" : ""}" data-libre="${i}">${E.DIAS[i]}</button>`).join("")}</div>
    <h3>¿Qué días son las clases de Luis?</h3><p class="nota">Esos días solo haces la clase y el callejero.</p>
    <div class="chips">${E.DIAS.map((n, i) => `<button class="${m.luis.includes(i) ? "on" : ""}" data-luis="${i}" ${i === m.libre ? "disabled" : ""}>${n}</button>`).join("")}</div>
    ${err}<div class="acciones"><button class="btn sec" data-m="cancelar">Ahora no</button><button class="btn" data-m="ok" ${m.luis.length > 2 ? "disabled" : ""}>Guardar semana</button></div>`;
  box.querySelectorAll("[data-libre]").forEach(b => b.onclick = () => { m.libre = +b.dataset.libre; m.luis = m.luis.filter(x => x !== m.libre); pintarModal(); });
  box.querySelectorAll("[data-luis]").forEach(b => b.onclick = () => {
    const i = +b.dataset.luis;
    m.luis = m.luis.includes(i) ? m.luis.filter(x => x !== i) : [...m.luis, i].sort();
    pintarModal();
  });
  box.querySelector("[data-m=cancelar]").onclick = () => { ui.modalSemana = null; ui.cerradoSemana = true; pintarModal(); };
  box.querySelector("[data-m=ok]").onclick = async () => {
    const parche = {semanas: {[m.mon]: {libre: m.libre, luis: m.luis}}};
    const primera = !Object.keys(st.semanas).length;
    ui.modalSemana = null;
    pintarModal();
    await guardar(parche);
    if (primera || !st.base || !st.base.v1) await guardar(E.fijarBase(st, HOY()));
  };
}

/* ---------- eventos ---------- */
function enlazar() {
  const hoy = HOY();
  document.querySelectorAll("[data-tick]").forEach(b => b.onclick = () => {
    const fecha = ui.fecha || hoy, i = +b.dataset.tick;
    const rec = st.dias[fecha] || {};
    const valor = !(rec.c && rec.c[i]);
    if (navigator.vibrate && valor) navigator.vibrate(12);
    guardar(E.marcar(st, hoy, fecha, i, valor));
  });
  document.querySelectorAll("[data-a]").forEach(b => b.onclick = e => {
    e.stopPropagation();
    const a = b.dataset.a, base = ui.fecha || hoy;
    if (a === "diaMenos") { ui.fecha = E.sumaDias(base, -1); pintar(); }
    else if (a === "diaMas") { ui.fecha = E.sumaDias(base, 1); pintar(); }
    else if (a === "diaHoy") { ui.fecha = null; pintar(); }
    else if (a === "semMenos") { ui.semana = E.sumaDias(ui.semana || E.lunes(hoy), -7); pintar(); }
    else if (a === "semMas") { ui.semana = E.sumaDias(ui.semana || E.lunes(hoy), 7); pintar(); }
    else if (a === "editSemana") abrirSemana(b.dataset.m);
    else if (a === "semanaSig") abrirSemana(E.lunes(E.sumaDias(hoy, 1)));
    else if (a === "verDia") { ui.fecha = b.dataset.f === hoy ? null : b.dataset.f; ir("hoy"); }
    else if (a === "abrirTema") { ui.abierto[b.dataset.k] = !ui.abierto[b.dataset.k]; pintar(); }
    else if (a === "irA") {
      if (confirm("¿Empezar el plan por esta parte? Todo lo anterior de esta vuelta cuenta como estudiado.")) guardar(E.irA(st, hoy, b.dataset.t, b.dataset.id));
    } else if (a === "visto") {
      guardar(E.visto(st, hoy, b.dataset.t, +b.dataset.n, b.dataset.v === "1"));
    } else if (a === "quitarPdf") {
      const k = b.dataset.k, lista = [...(st.materiales[k] || [])], [d] = lista.splice(+b.dataset.i, 1);
      if (d && confirm(`¿Quitar «${d.doc}» del tema? La vuelta se recalcula.`))
        guardar({materiales: {[k]: lista}, cambios: [...st.cambios, {id: "u" + Date.now().toString(36), fecha: hoy, texto: `Quitado «${d.doc}» del tema ${k.slice(3)}.`}]});
    } else if (a === "leidoCambios") {
      const leidos = {};
      for (const c of [...CAMBIOS, ...st.cambios]) leidos[c.id] = 1;
      guardar({leidos, etaVista: b.dataset.eta || null});
    } else if (a === "renombrar") {
      const k = b.dataset.k, n = prompt("Título del tema (según la convocatoria del SPEIS de Sevilla):", st.titulos[k] || "");
      if (n !== null) guardar({titulos: {[k]: n.trim() || null}});
    } else if (a === "ajustes") ir("ajustes");
    else if (a === "base") guardar(E.fijarBase(st, hoy));
    else if (a === "salir") store.salir();
  });
  document.querySelectorAll("input[name=ritmo]").forEach(r => r.onchange = () => guardar({ritmo: r.value}));
  const ex = $("#examen"); if (ex) ex.onchange = () => guardar({examen: ex.value || null});
  const cu = $("#calleUrl"); if (cu) cu.onchange = () => guardar({callejeroUrl: cu.value.trim()});
  const td = $("#tiempoDia"); if (td) td.onchange = () => { const f = ui.fecha || hoy; guardar({dias: {[f]: {...(st.dias[f] || {}), h: td.value ? +td.value : null}}}); };
  document.querySelectorAll("[data-subir]").forEach(inp => inp.onchange = () => { if (inp.files[0]) subirPdf(inp.dataset.subir, inp.files[0]); });
}
function ir(v) { ui.vista = v; if (v !== "semana") ui.semana = null; pintar(); window.scrollTo(0, 0); }
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => { if (b.dataset.v === "hoy") ui.fecha = null; ir(b.dataset.v); });
$("#btnAjustes").onclick = () => ir("ajustes");

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
main();
