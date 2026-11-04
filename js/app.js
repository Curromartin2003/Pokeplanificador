// Interfaz del planificador. Pinta todo a partir del estado (engine.js) y guarda los cambios con store.js.
import * as E from "./engine.js";
import {abrir} from "./store.js";
import * as P3 from "./parque3d.js";
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

function onEstado(raw, definitivo, desdeCache) {
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
  // Nunca con la copia guardada en el dispositivo (podría estar atrasada): solo con los datos del servidor.
  const sem = desdeCache ? null : E.semilla(st, hoy);
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
  const rg = E.rango(res.total);
  $("#puntos").innerHTML = `<b>${res.total > 0 ? "+" : ""}${res.total}</b><span>${rg.icono} ${esc(rg.nombre)} ›</span>`;
  $("#puntos").onclick = () => abrirNiveles();
  $("#puntos").className = "puntos " + (res.total > 0 ? "pos" : res.total < 0 ? "neg" : "");
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === ui.vista));
  const f = {hoy: vHoy, semana: vSemana, temario: vTemario, progreso: vProgreso, ajustes: vAjustes, convocatorias: vConvocatorias, parque: vParque}[ui.vista] || vHoy;
  badgeConv();
  pantalla(f(hoy, res));
  enlazar();
  if (ui.vista === "parque") montarParque();
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
  if (fecha === hoy) aviso = avisoCambios(hoy) + avisoPremio(hoy) + avisoConv() + aviso + camino(hoy);
  if (antes) return nav + `<div class="vacio"><p>El plan empieza el ${E.fechaLarga(st.inicio)}.</p></div>`;
  if (d.tipo === "libre") return nav + aviso + `<div class="libre"><div class="big">🌴</div><h2>Día libre</h2><p>Hoy no hay objetivos ni estudio: descansa de verdad. La puntuación no cambia.</p></div>` + manana(hoy, fecha);

  const c = E.OBJETIVOS.map((_, i) => !!(rec.c && rec.c[i]));
  const cuentan = E.objetivosDelDia(d), N = cuentan.length;
  const hechos = cuentan.filter(i => c[i]).length;
  const p = E.puntosDia(d, rec);
  const chip = d.tipo === "luis" ? `<span class="chip luis">Clase de Luis</span>` : `<span class="chip ${d.materia}">${E.MATERIAS[d.materia]}</span>`;
  const marcador = `<div class="marcador ${p > 0 ? "pos" : p < 0 ? "neg" : "cero"}">
    <div class="anillo" style="--p:${hechos / N}"><span>${hechos}/${N}</span></div>
    <div><b>${futuro ? "Aún no ha llegado" : p > 0 ? "🚒 ¡Turno completado! +1" : p < 0 ? "−1 punto" : "Se mantiene"}</b>
    <p>${futuro ? "Podrás marcar los objetivos ese día." : hechos === N ? "¡Todos hechos!" : hechos === N - 1 ? "Te falta 1: con todos sumas un punto." : `Te faltan ${N - hechos}. Si fallas 2 o más, restas un punto.`}${d.sinEstudio ? " Hoy sin estudio: cuentan los otros 6." : ""}</p>
    ${chip}</div></div>`;

  const items = E.OBJETIVOS.map((txt, i) => {
    let titulo = txt, det = "";
    if (i === E.I_ESTUDIO) {
      if (d.tipo === "luis") { titulo = "Clase de Luis"; det = `<p class="det">Hoy solo clase y callejero.</p>`; }
      else {
        titulo = `Estudio: ${d.partes.map(x => E.MATERIAS[x.t]).join(" y ")} · ${E.textoMin(d.min)}`;
        const real = rec.s && typeof rec.s.real === "number" ? rec.s.real : null;
        const fm = E.minutosDia(rec).est;
        det = (fecha === hoy && fm ? `<p class="det">⏱ Hoy llevas ${E.textoMin(fm)} de estudio.</p>` : "")
          + (rec.hastaAqui && !rec.s ? `<p class="det">📍 Ya marcaste hasta dónde llegaste hoy. Marca el estudio cuando acabes.</p>` : "")
          + (rec.s ? `<p class="det tardado">${real !== null ? `Has tardado <b>${E.textoMin(real)}</b> (previsto ${E.textoMin(d.min)})` : "¿Cuánto has tardado?"} <button class="enlace peque" data-a="tiempoReal" data-f="${fecha}" data-m="${real ?? d.min}">${real !== null ? "Cambiar" : "Apuntarlo"}</button></p>` : "") + planHTML(d);
      }
    }
    if (i === 4) {
      titulo = `Callejero · ${E.textoMin(d.minCal)}`;
      const url = st.callejeroUrl;
      // Distritos que estás estudiando (puedes marcar varios: se quedan hasta que los cambies). El día que marcas el
      // callejero se apunta lo que estudiaste.
      const sel = (rec.cal && rec.cal.length ? rec.cal : (st.calle && st.calle.sel) || []);
      det = `<p class="det">${sel.length ? `Estudiando: <b>${sel.map(esc).join(" · ")}</b>` : `Sugerencia: <b>${esc(d.foco)}</b>`}
        <button class="enlace peque" data-a="distritos" data-f="${fecha}">${sel.length ? "Cambiar distritos" : "Elegir distritos"}</button>
        ${fecha === hoy ? `<span class="acc-parte"><button class="btn peque temp" data-a="foco" data-t="callejero">⏱ Temporizador</button>${E.minutosDia(rec).cal ? ` <span class="nota">Llevas ${E.textoMin(E.minutosDia(rec).cal)}.</span>` : ""}</span>` : ""}
        ${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Abrir Pokecallejero</a>` : ""}</p>`;
    }
    if (!cuentan.includes(i)) return `<li class="obj nocuenta"><span class="tick fuera">–</span>
      <div class="txt"><span class="t"><span class="ic">${E.ICONOS[i]}</span>${esc(i === E.I_ESTUDIO ? (d.tipo === "luis" ? "Clase de Luis" : "Estudio") : "Callejero")}</span><p class="det">Hoy sin estudio (0 h): no cuenta para los puntos.</p></div></li>`;
    return `<li class="obj ${c[i] ? "ok" : ""}">
      <button class="tick" data-tick="${i}" ${futuro ? "disabled" : ""} aria-pressed="${c[i]}" aria-label="${esc(titulo)}">
        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <div class="txt"><span class="t"><span class="ic">${E.ICONOS[i]}</span>${esc(titulo)}</span>${det}</div></li>`;
  }).join("");
  const tiempo = `<div class="tiempo"><label>Tiempo ${fecha === hoy ? "de hoy" : "de este día"}:
    <select id="tiempoDia">${[["", `Normal (${E.textoMin(d.horasNormales)})`], ["0", "0 h (sin estudio)"], ["60", "1 h"], ["120", "2 h"], ["180", "3 h"]]
      .map(([v, t]) => `<option value="${v}" ${(d.horasCambiadas ? String(d.total) : "") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    ${d.horasCambiadas ? `<span class="nota">Cambiado solo este día.</span>` : ""}</div>`;
  return nav + aviso + marcador + `<ul class="objs">${items}</ul>` + tiempo + manana(hoy, fecha);
}

// Recompensas ganadas y aún sin cumplir.
function avisoPremio(hoy) {
  const total = E.resumen(st, hoy).total;
  const pend = E.RANGOS.filter(r => r.premio && total >= r.min && !(st.premios || {})[r.nombre]);
  if (!pend.length) return "";
  const r = pend[pend.length - 1];
  return `<div class="avisopremio"><span class="big">🎉</span><div><b>¡Has llegado a ${esc(r.nombre)}!</b><p>Te has ganado: <b>${esc(r.premio)}</b>${pend.length > 1 ? ` (y ${pend.length - 1} más sin cumplir)` : ""}.</p>
    <button class="btn peque" data-a="niveles">Ver recompensas</button></div></div>`;
}

// Novedades de tus convocatorias sin ver, con el enlace directo a cada documento.
function avisoConv() {
  if (!conv) return "";
  const v = st.convVisto || E.sumaDias(HOY(), -7);
  const nov = [...conv.mias.flatMap(c => (c.novedades || []).filter(n => n.fecha > v).map(n => ({...n, conv: c.nombre.split(" · ")[0]}))),
    ...(conv.sevilla || []).filter(x => x.fecha > v).map(x => ({fecha: x.fecha, url: x.url, texto: x.titulo, conv: `BOP de Sevilla · ${x.org || "Sevilla"} · ${x.tipo}`}))]
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!nov.length) return "";
  return `<div class="avisoconv"><b>📢 Novedades en tus convocatorias</b><ul>${nov.slice(0, 4).map(n =>
    `<li><small>${esc(n.conv)} · ${E.fechaLarga(n.fecha, false)}</small>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.texto)}</a>` : esc(n.texto)}</li>`).join("")}</ul>
    <button class="btn peque" data-a="verConv">Ver todo</button></div>`;
}

// «De aquí a tu plaza»: cuenta atrás a tu próxima cita, avance del temario, racha y frase del día.
function camino(hoy) {
  let cita = null;
  if (st.examen && st.examen >= hoy) cita = {fecha: st.examen, texto: "tu examen"};
  if (conv) for (const c of conv.mias) for (const f of c.fases) {
    if (!f.hecho && f.fecha && f.fecha >= hoy && (!cita || f.fecha < cita.fecha))
      cita = {fecha: f.fecha, texto: `${c.nombre.split(" · ")[0]}: ${f.texto.split(":")[0].toLowerCase()}`, aprox: /aprox|prevista|sin confirmar/i.test(f.texto)};
  }
  const q = {leg: E.cola(st, "leg"), esp: E.cola(st, "esp")}, pr = E.progreso(st, hoy);
  const tot = q.leg.tot[0] + q.esp.tot[0];
  const hecho1 = ["leg", "esp"].reduce((a, t) => a + q[t].items.filter(c => c.v === 1).reduce((b, c) => b + E.fraccion(pr.leg.h, c.id) * c.min, 0), 0);
  const pct = tot ? hecho1 / tot : 0;
  const res = E.resumen(st, hoy), dias = cita ? E.difDias(hoy, cita.fecha) : null;
  return `<div class="camino">
    <div class="cam-top"><span class="cam-tit">De aquí a tu plaza</span>${res.racha ? `<span class="racha">🔥 ${res.racha} ${res.racha === 1 ? "día" : "días"} seguidos</span>` : ""}</div>
    ${cita ? `<div class="cuenta"><b>${dias === 0 ? "¡Hoy!" : dias}</b><span>${dias === 0 ? "" : dias === 1 ? "día" : "días"}${cita.aprox ? " aprox." : ""}<br>para ${esc(cita.texto)}</span></div>`
      : `<p class="nota">Pon la fecha de tu examen en <button class="enlace" data-a="ajustes">Ajustes</button> para ver la cuenta atrás.</p>`}
    <div class="cam-barra"><div class="cam-et"><span>1.ª vuelta al temario</span><b>${Math.round(pct * 100)} %</b></div><span class="barra manguera"><i style="width:${Math.max(2, Math.round(pct * 100))}%"></i></span></div>
    <p class="frase">«${esc(E.fraseDelDia(hoy))}»</p></div>`;
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
      <span class="parte">${it.partes > 1 ? `Parte ${it.parte}/${it.partes}: ` : ""}${esc(it.nombre)}</span>${it.ref ? `<span class="ref">📄 ${esc(it.ref)}</span>` : ""}<span class="min">${estado}</span>${marcaHTML(it.id)}${d.fecha <= HOY() ? `<span class="acc-parte">${d.fecha === HOY() && !d.hecho ? `<button class="btn peque temp" data-a="foco" data-t="estudio" data-item="${it.id}">⏱ Temporizador</button>` : ""}<button class="btn peque sec" data-a="hastaAqui" data-f="${d.fecha}" data-id="${it.id}">📍 Me quedé aquí</button></span>` : ""}</li>`;
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
  const pr = E.progreso(st, hoy), h = pr.leg.h, tiempos = E.tiemposTema(st, hoy);
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
          ${marcaHTML(c.id)}<span class="botones"><button class="enlace peque" data-a="hastaAqui" data-t="${t}" data-id="${c.id}">📍 Me quedé aquí</button><button class="enlace peque" data-a="irA" data-t="${t}" data-id="${c.id}">Empezar aquí</button>
          ${v === 1 ? `<button class="enlace peque" data-a="noEntra" data-t="${t}" data-n="${tm.n}" data-key="${esc(c.key)}" data-v="1">No entra</button>` : ""}</span></li>`;
      }).join("")}</ul>
      ${(() => { const fuera = tm.todas.filter(x => !tm.partes.includes(x));
        return fuera.length ? `<ul class="subidos fuera-lista"><li><b>No entran:</b></li>${fuera.map(x => `<li>${esc(x.nombre)} <button class="enlace peque" data-a="noEntra" data-t="${t}" data-n="${tm.n}" data-key="${esc(x.key)}" data-v="0">Volver a meter</button></li>`).join("")}</ul>` : ""; })()}
      <div class="acc-tema"><button class="btn peque sec" data-a="visto" data-t="${t}" data-n="${tm.n}" data-v="${visto ? 0 : 1}">${visto ? "Quitar «visto»" : "Marcar como visto"}</button>
        ${botonSubir(t, tm.n)}</div>
      ${subidos.length ? `<ul class="subidos">${subidos.map((d, i) => `<li>📎 ${esc(d.doc)} <small>(${d.pal.length} págs., subido el ${E.fechaLarga(d.t, false)})</small> <button class="enlace peque" data-a="quitarPdf" data-k="${k}" data-i="${i}">Quitar</button></li>`).join("")}</ul>` : ""}
      ${t === "esp" && tm.n > 33 ? `<button class="enlace peque" data-a="renombrar" data-k="${k}">Cambiar el título de este tema</button>` : ""}
      <p class="contenido">${tm.material.length ? `<b>Tu material:</b> ${esc(tm.material.join(" · "))}<br>` : "<b>Sin material todavía:</b> partes según el decreto.<br>"}${esc(tm.contenido)}</p>` : "";
      return `<li class="tema ${est}"><button class="cab" data-a="abrirTema" data-k="${k}">
        <span class="num">${tm.n > 33 && t === "esp" ? "S" + (tm.n - 33) : tm.n}</span><span class="nom">${esc(tm.titulo)}${tm.material.length ? ` <span class="pdf" title="Con tu material">📄</span>` : ""}${visto && v === 1 ? ` <span class="chip visto">visto</span>` : ""}${(() => {
          const tt = Math.round(tiempos[`${k}|${v}`] || 0);
          return tt > 0 ? `<span class="tiempo-tema ${est === "hecho" ? "fin" : ""}">⏱ ${est === "hecho" ? "Estudiado en" : "Llevas"} ${E.textoMin(tt)}</span>` : "";
        })()}</span>
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
  const rg = E.rango(res.total);
  const rangoHTML = `<div class="tarjeta rango"><div class="rg-ic">${rg.icono}</div><div><span class="nota">Tu rango</span><h3>${esc(rg.nombre)}</h3>
    ${rg.sig ? `<span class="barra"><i style="width:${Math.round(rg.pct * 100)}%"></i></span><p class="nota">Te ${rg.faltan === 1 ? "falta 1 punto" : `faltan ${rg.faltan} puntos`} para <b>${esc(rg.sig.nombre)}</b> ${rg.sig.icono}</p>` : `<p class="nota">Rango máximo. ¡Ya eres Intendente!</p>`}
    <button class="enlace peque" data-a="niveles">Ver todos los niveles y recompensas</button></div></div>`;
  return `<h1>Progreso</h1>${rangoHTML}
    <div class="kpis"><div><b class="${res.total > 0 ? "pos" : res.total < 0 ? "neg" : ""}">${res.total > 0 ? "+" : ""}${res.total}</b><span>Puntos</span></div>
      <div><b>${res.racha}</b><span>Racha de +1</span></div><div><b>${res.mejor}</b><span>Mejor racha</span></div></div>
    <div class="tarjeta"><h3>Vuelta al temario</h3>
      ${prev[0] ? `<p class="grande">Terminas la 1.ª vuelta el <b>${E.fechaLarga(prev[0])}</b>${semanas ? ` (en ${semanas} semanas)` : ""}.</p>` : ""}
      ${retraso}
      <div class="dos"><div><span>Legislación</span><b>${pr.leg.vuelta}.ª vuelta · ${Math.round(pr.leg.pctVuelta * 100)} %</b><span class="barra"><i style="width:${Math.round(pr.leg.pctVuelta * 100)}%"></i></span></div>
      <div><span>Específico</span><b>${pr.esp.vuelta}.ª vuelta · ${Math.round(pr.esp.pctVuelta * 100)} %</b><span class="barra"><i style="width:${Math.round(pr.esp.pctVuelta * 100)}%"></i></span></div></div>
      <ul class="vueltas">${vueltas}</ul>
      <p class="nota">Ritmo ${E.RITMOS[st.ritmo].nombre.toLowerCase()}. Un día legislación y otro específico; cuando una materia acaba la vuelta, todos los días son de la otra hasta que la acaba también, y empieza la siguiente vuelta de las dos. Se calcula con la semana tipo actual y suponiendo que cumples el plan desde hoy.</p></div>
    ${ritmoReal()}
    ${examen}
    <div class="tarjeta"><h3>Puntos acumulados</h3>${graf}</div>
    <div class="tarjeta"><h3>${E.difDias(desde, E.lunes(hoy)) >= 49 ? "Últimas 8 semanas" : "Calendario"}</h3><div class="cal">${E.DIAS_CORTO.map(x => `<b>${x}</b>`).join("")}${cal}</div>
      <p class="leyenda"><i class="pos"></i>+1 <i class="cero"></i>0 <i class="neg"></i>−1 <i class="libre"></i>libre</p></div>
    <div class="tarjeta"><h3>Cumplimiento de cada objetivo</h3><ul class="cumple">${obj}</ul></div>
    <div class="tarjeta"><h3>Historial de cambios del plan</h3><ul class="historial">${[...CAMBIOS, ...st.cambios].slice().reverse().map(c =>
      `<li><small>${E.fechaLarga(c.fecha, false)}</small> ${esc(c.texto)}${c.antes && c.despues && c.antes !== c.despues ? ` <span class="nota">1.ª vuelta: ${E.fechaLarga(c.antes, false)} → ${E.fechaLarga(c.despues, false)}</span>` : ""}</li>`).join("")}</ul></div>`;
}
function ritmoReal() {
  const c = E.calibracion(st);
  const txt = t => {
    const r = c[t], n = c.registros[t];
    if (!n) return `<li><b>${E.MATERIAS[t]}:</b> aún sin datos. Apunta lo que tardas al marcar el estudio.</li>`;
    const pct = Math.round((r - 1) * 100);
    return `<li><b>${E.MATERIAS[t]}:</b> ${Math.abs(pct) < 3 ? "vas justo a lo previsto" : pct > 0 ? `tardas un ${pct} % más de lo previsto` : `vas un ${-pct} % más rápido de lo previsto`} <span class="nota">(${E.textoMin(n)} registrados)</span></li>`;
  };
  return `<div class="tarjeta"><h3>Tu ritmo real</h3><ul class="vueltas sinlinea">${txt("leg")}${txt("esp")}</ul>
    <p class="nota">Las vueltas se recalculan con estos ritmos: cuanto más apuntes, más se ajustan.</p></div>`;
}
function grafica(v) {
  if (v.length < 2) return `<p class="nota">La gráfica aparece cuando lleves un par de días.</p>`;
  const W = 320, H = 110, min = Math.min(0, ...v), max = Math.max(1, ...v);
  const x = i => (i / (v.length - 1)) * W, y = n => H - 8 - ((n - min) / (max - min)) * (H - 16);
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join("");
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="cero"/><path d="${d}"/></svg>`;
}

/* ---------- Convocatorias ---------- */
// data/convocatorias.json lo actualiza cada mañana la tarea de GitHub (scripts/convocatorias.py).
let conv = null, convCargando = false;
async function cargarConv() {
  if (convCargando) return;
  convCargando = true;
  try {
    const r = await fetch("data/convocatorias.json?t=" + Math.floor(Date.now() / 600000), {cache: "no-cache"});
    if (r.ok) conv = await r.json();
  } catch (e) {}
  convCargando = false;
  pintar();
}
const ANDALUCIA = /almer[ií]a|c[aá]diz|c[oó]rdoba|granada|huelva|ja[eé]n|m[aá]laga|sevilla/i;
function novedadesSinVer() {
  if (!conv) return 0;
  const v = st.convVisto || E.sumaDias(HOY(), -7);
  return conv.mias.reduce((a, c) => a + (c.novedades || []).filter(n => n.fecha > v).length, 0)
    + (conv.sevilla || []).filter(x => x.fecha > v).length
    + conv.espana.filter(c => ((c.fin && c.fin >= HOY()) || c.fase === "bases") && (c.fecha || "") > v).length;
}
function badgeConv() {
  const b = $("#badgeConv"); if (!b) return;
  const n = ui.vista === "convocatorias" ? 0 : novedadesSinVer();
  b.hidden = !n; b.textContent = n;
}
function vConvocatorias(hoy) {
  if (!conv) { cargarConv(); return `<h1>Convocatorias</h1><div class="vacio"><p>Cargando…</p></div>`; }
  const visto = ui.convVistoAntes ?? (st.convVisto || E.sumaDias(hoy, -7));
  const fecha = f => f ? E.fechaLarga(f, false) + (f.slice(0, 4) !== String(new Date().getFullYear()) ? "" : "") : "pendiente";
  const mias = conv.mias.map(c => {
    const nov = [...(c.novedades || [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
    const fases = c.fases.map(f => `<li class="${f.hecho ? "hecho" : ""}"><span>${f.hecho ? "✓" : "○"}</span><span class="f">${f.fecha ? E.fechaLarga(f.fecha, false) : "pendiente"}</span><span>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.texto)}</a>` : esc(f.texto)}</span></li>`).join("");
    return `<div class="conv"><span class="estado">${esc(c.estado)}</span><h3>${esc(c.nombre)}</h3>
      <p class="meta">${esc(c.lugar)} · ${esc(c.plazas)} · ${esc(c.sistema)}</p>
      <ul class="fases">${fases}</ul>
      ${nov.length ? `<b class="small">Novedades</b><ul class="novedades">${nov.map(n => `<li class="${n.fecha > visto ? "nueva" : ""}"><small>${E.fechaLarga(n.fecha, false)}</small> ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.texto)}</a>` : esc(n.texto)}</li>`).join("")}</ul>` : ""}
      <details><summary>Más información</summary><p class="nota">${esc(c.resumen)}</p><p class="nota">${esc(c.aviso || "")}</p></details>
      <div class="enlaces">${c.enlaces.map(e => `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.texto)}</a>`).join("")}</div></div>`;
  }).join("");
  const f = ui.filtroConv || "todas";
  // Si unas bases del BOJA ya tienen anuncio en el BOE del mismo organismo, se queda solo el del BOE (que trae el plazo).
  const boe = conv.espana.filter(c => c.fuente !== "BOJA");
  const lugar = c => ((c.organismo || "").split(/\s+/).pop() || "").toLowerCase();
  const yaEnBoe = c => boe.some(b => lugar(c).length > 3 && (b.organismo || "").toLowerCase().includes(lugar(c)) && (b.fecha || "") >= (c.fecha || ""));
  let lista = conv.espana.filter(c => c.fuente !== "BOJA" || !yaEnBoe(c))
    .map(c => ({...c, abierta: !!(c.fin && c.fin >= hoy), bases: c.fase === "bases"}));
  if (f === "abiertas") lista = lista.filter(c => c.abierta);
  if (f === "bases") lista = lista.filter(c => c.bases);
  if (f === "andalucia") lista = lista.filter(c => ANDALUCIA.test(c.provincia || "") || ANDALUCIA.test(c.organismo));
  const prio = c => c.abierta ? 2 : c.bases ? 1 : 0;
  lista.sort((a, b) => (prio(b) - prio(a)) || (b.fecha || "").localeCompare(a.fecha || ""));
  const espana = lista.map(c => {
    const quedan = c.abierta ? E.difDias(hoy, c.fin) : null;
    const estado = c.abierta ? `Plazo abierto: quedan ${quedan} ${quedan === 1 ? "día" : "días"} (hasta el ${E.fechaLarga(c.fin, false)})`
      : c.bases ? "Bases publicadas: el plazo se abre cuando salga en el BOE" : `Plazo cerrado${c.fin ? " el " + E.fechaLarga(c.fin, false) : ""}`;
    return `<div class="conv"><span class="estado ${c.abierta ? "abierta" : c.bases ? "" : "cerrada"}">${estado}</span>
      <h3>${esc(c.organismo)}${c.provincia && !c.organismo.includes(c.provincia) ? ` (${esc(c.provincia)})` : ""}</h3>
      <p class="meta">${c.plazas ? `${c.plazas} ${c.plazas === 1 ? "plaza" : "plazas"} · ` : ""}${esc(c.sistema)} · ${c.fuente === "BOJA" ? "BOJA" : "BOE"} del ${E.fechaLarga(c.fecha, false)}${c.fecha > visto ? " · <b>nueva</b>" : ""}</p>
      <details><summary>Detalles</summary><p class="nota">${esc(c.detalle)}</p>${c.bases ? `<p class="nota"><b>Bases:</b> ${esc(c.bases)}</p>` : ""}${c.plazo ? `<p class="nota"><b>Plazo:</b> ${esc(c.plazo)} (fecha de fin aproximada: no cuenta festivos autonómicos ni locales).</p>` : ""}</details>
      <div class="enlaces"><a href="${esc(c.url)}" target="_blank" rel="noopener">Anuncio en el ${c.fuente === "BOJA" ? "BOJA" : "BOE"}</a>${c.pdf ? `<a href="${esc(c.pdf)}" target="_blank" rel="noopener">PDF</a>` : ""}</div></div>`;
  }).join("") || `<div class="vacio"><p>No hay convocatorias con este filtro.</p></div>`;
  const abiertas = conv.espana.filter(c => c.fin && c.fin >= hoy).length;
  return `<h1>Convocatorias</h1><p class="sub">Se revisan cada mañana (BOE y páginas oficiales). Última revisión con cambios: ${E.fechaLarga(conv.actualizado.slice(0, 10), false)}.</p>
    <section class="bloque"><div class="bcab"><h2>Mis convocatorias</h2></div>${mias}</section>
    <section class="bloque"><div class="bcab"><h2>Radar BOP de Sevilla</h2><span>toda la provincia</span></div>
      <p class="nota">Todo lo de bomberos por turno libre que sale en el Boletín de la Provincia de Sevilla (bases, listas, tribunales, exámenes), revisado cada mañana. Lo nuevo sale también en Hoy.</p>
      ${(conv.sevilla || []).length ? `<ul class="novedades radar">${conv.sevilla.slice(0, 25).map(x => `<li class="${x.fecha > visto ? "nueva" : ""}"><small>${E.fechaLarga(x.fecha, false)} · ${esc(x.org || "Sevilla")} · <b>${esc(x.tipo)}</b></small><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titulo)}</a></li>`).join("")}</ul>`
        : `<div class="vacio"><p>Nada de bomberos en el BOP de Sevilla por ahora.</p></div>`}
      ${conv.sevilla_ok === false ? `<p class="nota">La primera revisión completa del BOP de Sevilla se hace en la próxima actualización de la mañana.</p>` : ""}
    </section>
    <section class="bloque"><div class="bcab"><h2>Convocatorias España</h2><span>${abiertas} con plazo abierto</span></div>
      <p class="nota">Bombero/a por turno libre (oposición o concurso-oposición), sin promoción interna ni movilidad, del último año. Primero las de plazo de instancias abierto, después las que ya tienen bases y aún no plazo. Fuentes: BOE (toda España, cuando se abre el plazo) y BOJA (bases de Andalucía en cuanto se publican).</p>
      <div class="filtros">${[["todas", "Todas"], ["abiertas", "Plazo abierto"], ["bases", "Bases publicadas"], ["andalucia", "Andalucía"]].map(([k, t]) => `<button class="${f === k ? "on" : ""}" data-a="filtroConv" data-f="${k}">${t}</button>`).join("")}</div>
      ${espana}</section>`;
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

/* ---------- «Hasta aquí» ---------- */
// «📍 Me quedé aquí»: página, artículo o porcentaje de la parte, más una nota del apartado. Recoloca las vueltas.
function abrirHastaAqui(fecha, id, t) {
  const hoy = HOY();
  let it = fecha ? (E.dia(st, hoy, fecha).plan || []).find(x => x.id === id) : null;
  if (!it) it = (E.cola(st, "leg").porId.get(id) || E.cola(st, "esp").porId.get(id));
  if (!it) return;
  const r = E.rangos(it), previa = (st.marcas || {})[id] || {};
  let tipo = r.pags ? "pags" : r.arts ? "arts" : "pct", valor = previa.n || (r[tipo] ? r[tipo][0] : 50), nota = previa.txt || "";
  const box = $("#modal");
  box.hidden = false; box.dataset.cerrable = "1";
  const frac = () => tipo === "pct" ? valor / 100 : E.fraccionDe(r, tipo, valor);
  const pintarH = () => {
    const opciones = [r.pags && ["pags", "Página"], r.arts && ["arts", "Artículo"], ["pct", "Porcentaje"]].filter(Boolean);
    box.querySelector(".hoja").innerHTML = `<div class="hoja-cab"><h2>📍 ¿Dónde te has quedado?</h2><button class="ico cerrar" data-m="cancelar" aria-label="Cerrar">✕</button></div>
      <p><b>Tema ${it.n} · ${esc(it.titulo)}</b><br>${esc(it.nombre)}${it.ref ? `<br><small>📄 ${esc(it.ref)}</small>` : ""}</p>
      <div class="segm">${opciones.map(([k, n]) => `<button class="${tipo === k ? "on" : ""}" data-tipo="${k}">${n}</button>`).join("")}</div>
      <div class="hasta">${tipo === "pct" ? `<input type="range" id="valH" min="0" max="100" step="5" value="${valor}">`
        : `<label>${tipo === "pags" ? "Me he quedado en la página" : "Me he quedado en el artículo"} <input type="number" id="valH" inputmode="numeric" min="${r[tipo][0]}" max="${r[tipo][1]}" value="${valor}"></label>
           <small>De ${tipo === "pags" ? "la pág." : "el art."} ${r[tipo][0]} a ${r[tipo][1]}</small>`}
        <b id="fracH">≈ ${Math.round(frac() * 100)} % de esta parte hecho</b></div>
      <label class="campo"><span>Apartado o nota (opcional)</span><input type="text" id="notaH" maxlength="80" placeholder="Ej.: Cap. III, art. 41.2 · tabla de presiones" value="${esc(nota)}"></label>
      <p class="nota">Lo anterior cuenta como hecho y las vueltas se recolocan desde aquí.</p>
      <div class="acciones"><button class="btn sec" data-m="cancelar">Cancelar</button><button class="btn" data-m="ok">Guardar</button></div>`;
    box.querySelectorAll("[data-tipo]").forEach(b => b.onclick = () => { tipo = b.dataset.tipo; valor = tipo === "pct" ? 50 : r[tipo][0]; pintarH(); });
    const v = box.querySelector("#valH");
    v.oninput = () => { valor = +v.value || 0; box.querySelector("#fracH").textContent = `≈ ${Math.round(frac() * 100)} % de esta parte hecho`; };
    box.querySelector("#notaH").oninput = e => { nota = e.target.value; };
    box.querySelectorAll("[data-m=cancelar]").forEach(b => b.onclick = () => { box.hidden = true; });
    box.querySelector("[data-m=ok]").onclick = () => {
      box.hidden = true;
      const f = frac();
      const parche = fecha ? E.hastaAqui(st, hoy, fecha, id, f) : E.meQuede(st, hoy, t || it.t, id, f);
      const etiqueta = tipo === "pags" ? `pág. ${valor}` : tipo === "arts" ? `art. ${valor}` : `${valor} %`;
      parche.marcas = {[id]: {n: valor, tipo, txt: nota.trim(), et: etiqueta, fecha: hoy}};
      guardar(parche);
    };
  };
  pintarH();
}
const marcaHTML = id => { const m = (st.marcas || {})[id]; return m ? `<span class="quede">📍 Te quedaste en ${esc(m.et || "")}${m.txt ? ` · ${esc(m.txt)}` : ""}</span>` : ""; };

/* ---------- temporizador (crece lo que eliges mientras estudias) ---------- */
// El estado del temporizador vive en este dispositivo (localStorage) para que siga aunque se recargue la app.
const FK = "pp.foco";
let foco = null, focoTick = null, ocultoDesde = null;
const leerFoco = () => { try { return JSON.parse(localStorage.getItem(FK) || "null"); } catch (e) { return null; } };
const guardarFoco = () => { try { foco ? localStorage.setItem(FK, JSON.stringify(foco)) : localStorage.removeItem(FK); } catch (e) {} };
const ahora = () => Date.now();
const msEst = f => f.est + (f.estado === "run" ? ahora() - f.desde : 0);
const msDesc = f => f.desc + (f.estado === "pause" ? ahora() - f.desde : 0);
const mmss = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

function elegirYEmpezar(tipo, item) {
  if (leerFoco()) { foco = leerFoco(); pintarFoco(); return; }
  const box = $("#modal");
  const disp = E.TIENDA.filter(x => E.tengo(st, x.id));
  let sel = (st.parque && st.parque.sel && E.tengo(st, st.parque.sel)) ? st.parque.sel : "extintor";
  const pintarE = () => {
    box.hidden = false;
    box.querySelector(".hoja").innerHTML = `<h2>⏱ ${tipo === "callejero" ? "Callejero" : "Estudio"}: ¿qué consigues para tu parque de bomberos?</h2>
      <p class="nota">Mientras estudias se va fabricando o construyendo. Con al menos ${E.MIN_SESION} min sale adelante y va a tu parque. Si sales de la app más de 20 segundos con el temporizador en marcha, se pierde (el tiempo sí cuenta). Para descansar, usa «Parar».</p>
      <div class="chips objetos">${disp.map(x => `<button class="${x.id === sel ? "on" : ""}" data-o="${x.id}">${iconoPieza(x, "mini3d chico")}${esc(x.nombre)}</button>`).join("")}</div>
      <p class="nota">Desbloquea más en la tienda de «Mi parque».</p>
      <div class="acciones"><button class="btn sec" data-m="cancelar">Cancelar</button><button class="btn" data-m="ok">Empezar</button></div>`;
    box.querySelectorAll("[data-o]").forEach(b => b.onclick = () => { sel = b.dataset.o; pintarE(); });
    box.querySelector("[data-m=cancelar]").onclick = () => { box.hidden = true; };
    box.querySelector("[data-m=ok]").onclick = () => {
      box.hidden = true;
      const parte = item ? (E.dia(st, HOY(), HOY()).plan || []).find(x => x.id === item) : null;
      const que = parte ? `Tema ${parte.n} · ${parte.nombre}` : tipo === "callejero" ? (((st.calle && st.calle.sel) || []).join(" · ") || "Callejero") : "";
      foco = {tipo, obj: sel, item: item || null, que, fecha: HOY(), ini: new Date().toISOString(), estado: "run", desde: ahora(), est: 0, desc: 0, seco: false};
      guardarFoco();
      if (!st.parque || st.parque.sel !== sel) guardar({parque: {sel}});
      pintarFoco();
    };
  };
  pintarE();
}

function pintarFoco() {
  const box = $("#foco");
  if (!foco) { box.hidden = true; document.body.classList.remove("enfoco"); clearInterval(focoTick); focoTick = null; mantenerPantalla(false); return; }
  box.hidden = false;
  document.body.classList.add("enfoco");
  mantenerPantalla(foco.estado === "run");
  const obj = E.TIENDA.find(x => x.id === foco.obj) || E.TIENDA[0];
  const est = msEst(foco), desc = msDesc(foco), min = est / 60000;
  const crece = Math.min(1, min / 25);  // a los 25 min está crecido del todo
  const listo = min >= E.MIN_SESION;
  box.innerHTML = `<div class="foco-in ${foco.estado}">
    <p class="foco-tipo">${foco.tipo === "callejero" ? "🗺️ Callejero" : "📚 Estudio"} · ${foco.estado === "run" ? "concentrado" : "en descanso"}</p>
    ${foco.que ? `<p class="foco-que">${esc(foco.que)}</p>` : ""}
    <div class="foco-arbol" style="--c:${crece}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="pista"/><circle cx="60" cy="60" r="54" class="avance" style="stroke-dashoffset:${339.3 * (1 - Math.min(1, min / 25))}"/></svg>
      ${P3.disponible() ? `<span class="visor3d" id="visorFoco"></span>` : `<span class="obj ${foco.seco ? "seco" : ""}" style="transform:scale(${0.35 + 0.65 * crece})">${foco.seco ? (obj.tipo === "exterior" ? "🥀" : "💥") : listo ? obj.icono : obj.tipo === "exterior" ? "🌱" : "🏗️"}</span>`}</div>
    <p class="foco-obj">${foco.seco ? (obj.tipo === "exterior" ? "Se ha secado" : "Se ha estropeado") + " por salir de la app. El tiempo sigue contando." : listo ? `${esc(obj.nombre)} ya está a salvo: sigue para terminarlo del todo` : `${obj.tipo === "exterior" ? "Plantando" : obj.tipo === "material" ? "Fabricando" : "Construyendo"}: ${esc(obj.nombre)} (a salvo a los ${E.MIN_SESION} min)`}</p>
    ${foco.pregunta ? `<div class="foco-pregunta"><b>La app ha estado oculta ${foco.pregunta >= 120 ? Math.round(foco.pregunta / 60) + " min" : foco.pregunta + " s"}. ¿Qué ha pasado?</b>
      <div class="foco-btns"><button class="btn grande2" data-f="bloqueo">🔒 Se bloqueó la pantalla</button><button class="btn sec grande2" data-f="sali">📱 He salido de la app</button></div></div>` : ""}
    <div class="foco-tiempos"><div><b>${mmss(est)}</b><span>estudio</span></div><div><b>${mmss(desc)}</b><span>descanso</span></div></div>
    <div class="foco-btns">${foco.estado === "run"
      ? `<button class="btn sec grande2" data-f="parar">⏸ Parar</button>`
      : `<button class="btn grande2" data-f="seguir">▶ Seguir</button>`}
      <button class="btn grande2 fin" data-f="fin">⏹ Finalizar</button></div>
    <p class="nota claro">No puedes salir de aquí hasta parar o finalizar.</p></div>`;
  box.querySelectorAll("[data-f]").forEach(b => b.onclick = () => accionFoco(b.dataset.f));
  const vh = box.querySelector("#visorFoco");
  if (vh) { try { P3.visorCreciendo(vh, obj.id, listo ? Math.max(crece, 0.5) : crece, foco.seco); } catch (e) {} }
  if (!focoTick) focoTick = setInterval(() => { if (foco) pintarFoco(); }, 1000);
}

async function accionFoco(a) {
  if (!foco) return;
  const t = ahora();
  if (a === "bloqueo") { delete foco.pregunta; }
  else if (a === "sali") { delete foco.pregunta; foco.seco = true; }
  else if (a === "parar" && foco.estado === "run") { foco.est += t - foco.desde; foco.estado = "pause"; foco.desde = t; }
  else if (a === "seguir" && foco.estado === "pause") { foco.desc += t - foco.desde; foco.estado = "run"; foco.desde = t; }
  else if (a === "fin") {
    if (foco.estado === "run") foco.est += t - foco.desde; else foco.desc += t - foco.desde;
    const f = foco; foco = null; guardarFoco(); pintarFoco();
    const est = Math.round(f.est / 60000), desc = Math.round(f.desc / 60000);
    const ok = !f.seco && est >= E.MIN_SESION;
    const rec = st.dias[f.fecha] || {};
    const id = "s" + Date.parse(f.ini).toString(36);
    await guardar({dias: {[f.fecha]: {sesiones: {[id]: {tipo: f.tipo, ini: f.ini, est, desc, obj: f.obj, ok, item: f.item || null}}}}});
    finFoco(f, est, desc, ok);
    return;
  }
  guardarFoco(); pintarFoco();
}

function finFoco(f, est, desc, ok) {
  const box = $("#modal"), obj = E.TIENDA.find(x => x.id === f.obj) || E.TIENDA[0];
  const hoy = HOY(), d = E.dia(st, hoy, f.fecha), rec = st.dias[f.fecha] || {};
  const i = f.tipo === "callejero" ? 4 : E.I_ESTUDIO;
  const yaHecho = rec.c && rec.c[i];
  const totalHoy = f.tipo === "callejero" ? E.minutosDia(st.dias[f.fecha]).cal : E.minutosDia(st.dias[f.fecha]).est;
  box.hidden = false;
  box.querySelector(".hoja").innerHTML = `<div class="fin-foco"><div class="big">${ok ? iconoPieza(obj, "mini3d grande") : obj.tipo === "exterior" ? "🥀" : "💥"}</div>
    <h2>${ok ? `¡${esc(obj.nombre)} ya está en tu parque!` : f.seco ? "Se perdió por salir de la app" : `Menos de ${E.MIN_SESION} min: no ha salido adelante`}</h2>
    <p>Estudio: <b>${E.textoMin(est)}</b> · Descanso: <b>${E.textoMin(desc)}</b> · +${est} monedas</p>
    <p class="nota">Hoy llevas ${E.textoMin(totalHoy)} de ${f.tipo === "callejero" ? "callejero" : "estudio"}.</p></div>
    <div class="acciones">${!yaHecho && d.tipo !== "libre" ? `<button class="btn sec" data-m="no">Aún no he acabado</button><button class="btn" data-m="marcar">Marcar ${f.tipo === "callejero" ? "el callejero" : "el estudio"} como hecho</button>` : `<button class="btn" data-m="no">Vale</button>`}</div>`;
  box.querySelector("[data-m=no]").onclick = () => { box.hidden = true; };
  const mb = box.querySelector("[data-m=marcar]");
  if (mb) mb.onclick = async () => {
    box.hidden = true;
    const parche = E.marcar(st, hoy, f.fecha, i, true);
    if (i === 4) parche.dias[f.fecha].cal = (st.calle && st.calle.sel) || [];
    if (i === E.I_ESTUDIO && parche.dias[f.fecha].s) parche.dias[f.fecha].s.real = totalHoy;
    await guardar(parche);
  };
}

// Si sales de la app con el temporizador en marcha más de 20 s, lo que crece se seca (el tiempo sigue contando).
// Pantalla siempre encendida mientras cuenta (Screen Wake Lock, si el móvil lo permite).
let bloqueoPantalla = null, pidiendoPantalla = false;
async function mantenerPantalla(on) {
  try {
    if (on && "wakeLock" in navigator && !bloqueoPantalla && !pidiendoPantalla && !document.hidden) {
      pidiendoPantalla = true;
      bloqueoPantalla = await navigator.wakeLock.request("screen").finally(() => { pidiendoPantalla = false; });
      bloqueoPantalla.addEventListener("release", () => { bloqueoPantalla = null; });
    } else if (!on && bloqueoPantalla) { await bloqueoPantalla.release(); bloqueoPantalla = null; }
  } catch (e) { bloqueoPantalla = null; }
}
// Si la app se oculta más de 20 s con el temporizador en marcha, al volver se pregunta qué ha pasado: si solo se
// bloqueó la pantalla, sigue creciendo; si saliste de la app, se pierde (el tiempo cuenta igual).
document.addEventListener("visibilitychange", () => {
  if (!foco || foco.estado !== "run") { ocultoDesde = null; return; }
  if (document.hidden) { ocultoDesde = ahora(); return; }
  mantenerPantalla(true);
  if (ocultoDesde && ahora() - ocultoDesde > 20000 && !foco.seco) { foco.pregunta = Math.round((ahora() - ocultoDesde) / 1000); guardarFoco(); pintarFoco(); }
  ocultoDesde = null;
});
window.addEventListener("beforeunload", e => { if (foco && foco.estado === "run") { e.preventDefault(); e.returnValue = ""; } });

/* ---------- Mi parque ---------- */
function iconoPieza(x, cls = "mini3d") {
  if (P3.disponible()) { try { return `<img class="${cls}" src="${P3.miniatura(x.id)}" alt="${esc(x.nombre)}">`; } catch (e) {} }
  return `<span class="${cls} emo">${x.icono}</span>`;
}
function datosCiudad(hoy) {
  const e = E.estadisticas(st, hoy), piezas = E.piezasCiudad(st, hoy);
  const abiertas = E.CIUDAD.filter(z => E.zonaAbierta(z.id, e.total)).map(z => z.id);
  const cuenta = {};
  for (const p of piezas) cuenta[p.id] = (cuenta[p.id] || 0) + 1;
  return {e, piezas, abiertas, cuenta};
}
function montarParque() {
  const host = $("#parque3dHost");
  if (!host || !P3.disponible()) return;
  const hoy = HOY(), {piezas, abiertas} = datosCiudad(hoy);
  let visto = [];
  try { visto = JSON.parse(localStorage.getItem("pp.parqueVisto") || "[]"); } catch (e) {}
  const keys = piezas.map(p => p.key), nuevos = keys.filter(k => !visto.includes(k));
  try { localStorage.setItem("pp.parqueVisto", JSON.stringify(keys)); } catch (e) {}
  const zonaDe = {}, horas = {};
  for (const x of E.TIENDA) zonaDe[x.id] = x.zona;
  for (const z of E.CIUDAD) horas[z.id] = z.horas;
  try {
    host.appendChild(P3.parque({piezas, zonaDe, pos: (st.parque && st.parque.pos) || {}, abiertas, horas, nuevos,
      onMover: (key, v) => guardar({parque: {pos: {[key]: v.map(n => Math.round(n * 100) / 100)}}})}));
    P3.editar(!!ui.editarParque);
    host.classList.add("con3d");
  } catch (e) { console.warn("parque 3D", e); host.classList.remove("con3d"); host.insertAdjacentHTML("beforeend", `<p class="nota">No se pudo dibujar el 3D (${esc(e.message || e)}).</p>`); }
}

function vParque(hoy) {
  const {e, piezas, abiertas, cuenta} = datosCiudad(hoy);
  const h = m => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
  const perdidos = e.plantados.filter(x => !x.ok).length;
  const sig = E.CIUDAD.find(z => !abiertas.includes(z.id));
  const lista = E.TIENDA.filter(x => cuenta[x.id]).sort((a, b) => cuenta[b.id] - cuenta[a.id]);
  // Plano sencillo (si el 3D no carga): el parque siempre visible, con un hueco por pieza que se va llenando.
  const fallback = `<div class="escena plano">${[...E.ZONAS.map(z => ({t: `${z.icono} ${z.nombre}`, cls: z.tipo, xs: E.TIENDA.filter(x => x.zona === "parque" && x.tipo === z.tipo)})),
    ...E.CIUDAD.filter(z => z.id !== "parque").map(z => ({t: `${z.icono} ${z.nombre}${abiertas.includes(z.id) ? "" : ` · 🔒 ${z.horas} h`}`, cls: "ciudad" + (abiertas.includes(z.id) ? "" : " cerrada"), xs: E.TIENDA.filter(x => x.zona === z.id)}))]
    .map(g => `<div class="zona z-${g.cls}"><span class="rotulo">${g.t}</span><div class="huecos">${g.xs.map(x => cuenta[x.id]
      ? `<span class="pieza" title="${esc(x.nombre)}">${iconoPieza(x, "mini3d")}${cuenta[x.id] > 1 ? `<i>×${cuenta[x.id]}</i>` : ""}</span>`
      : `<span class="hueco" title="${esc(x.nombre)}"></span>`).join("")}</div></div>`).join("")}</div>
    ${P3.error ? `<p class="nota">No se ha podido cargar el parque en 3D en este dispositivo (${esc(P3.error)}). <button class="enlace" data-a="reintentar3d">Reintentar</button></p>` : ""}`;
  return `<div class="parque-cab"><h1>Mi parque</h1><div class="parque-btns">
      ${P3.disponible() ? `<button class="btn sec ${ui.editarParque ? "on" : ""}" data-a="editarParque">${ui.editarParque ? "✓ Listo" : "✋ Mover"}</button>` : ""}
      <button class="btn tienda-btn" data-a="tienda">🛒 Tienda · 🪙 ${e.monedas}</button></div></div>
    ${ui.editarParque ? `<div class="aviso">✋ Arrastra cualquier pieza para cambiarla de sitio. Toca dos veces para girarla. Cuando acabes, pulsa «Listo».</div>` : ""}
    <div id="parque3dHost" class="parque3d-host">${fallback}</div>
    ${P3.disponible() ? `<p class="nota centro">Toca un sitio para acercarte · arrastra para girar · pellizca o usa la rueda para el zoom.</p>` : ""}
    <div class="parque-stats"><div class="grande"><b>${h(e.hoy)}</b><span>hoy</span></div><div><b>${h(e.semana)}</b><span>esta semana</span></div>
      <div><b>${h(e.mes)}</b><span>este mes</span></div><div><b>${h(e.anio)}</b><span>este año</span></div><div><b>${h(e.total)}</b><span>en total</span></div>
      <div class="monedas"><b>🪙 ${e.monedas}</b><span>monedas</span></div></div>
    <div class="tarjeta"><h3>Tu ciudad de bomberos</h3><ul class="ciudad">${E.CIUDAD.map(z => {
      const ab = abiertas.includes(z.id), falta = Math.max(0, z.horas * 60 - e.total);
      const n = piezas.filter(p => (E.TIENDA.find(t => t.id === p.id) || {}).zona === z.id).length;
      return `<li class="${ab ? "ok" : ""}"><b>${z.icono} ${z.nombre}</b><span>${ab ? `${n} ${n === 1 ? "pieza" : "piezas"}` : `🔒 se abre a las ${z.horas} h · te faltan ${h(falta)}`}</span></li>`;
    }).join("")}</ul>${sig ? `<p class="nota">Cuantas más horas estudies, más grande se hace tu ciudad. La próxima zona, ${sig.nombre}, se abre a las ${sig.horas} h.</p>` : `<p class="nota">¡Has abierto toda la ciudad!</p>`}</div>
    <div class="tarjeta"><h3>Tus piezas (${piezas.length})</h3>
      ${lista.length ? `<ul class="mis-piezas">${lista.map(x => `<li>${iconoPieza(x, "mini3d")}<span>${esc(x.nombre)}</span><b>×${cuenta[x.id]}</b></li>`).join("")}</ul>`
        : `<p class="nota">Aún no tienes piezas. Usa el temporizador junto a lo que estudias en «Hoy» y elige qué quieres crear: con al menos ${E.MIN_SESION} min aparece en tu parque. Cada repetición es otra copia en el mapa.</p>`}
      ${perdidos ? `<p class="nota">💥 ${perdidos} ${perdidos === 1 ? "se perdió" : "se perdieron"} por salir de la app o por no llegar a ${E.MIN_SESION} min.</p>` : ""}</div>
    <p class="nota">Estudio ${h(e.est)} · Callejero ${h(e.cal)} · Descanso ${h(e.desc)} · ${e.sesiones} sesiones con temporizador. 1 minuto estudiado = 1 moneda.</p>
    <button class="btn sec" data-a="olvidado">➕ Apuntar tiempo olvidado</button>`;
}

// Apuntar a mano una sesión que no se registró (o que se perdió): cuenta como tiempo, monedas y pieza.
function abrirOlvidado() {
  const box = $("#modal"), hoy = HOY();
  box.hidden = false; box.dataset.cerrable = "1";
  const disp = E.TIENDA.filter(x => E.tengo(st, x.id));
  box.querySelector(".hoja").innerHTML = `<div class="hoja-cab"><h2>➕ Apuntar tiempo olvidado</h2><button class="ico cerrar" data-m="cerrar" aria-label="Cerrar">✕</button></div>
    <p class="nota">Para una sesión que hiciste y no quedó registrada. Cuenta como tiempo de estudio, monedas y pieza para tu parque.</p>
    <label class="campo"><span>Día</span><input type="date" id="olvF" value="${hoy}" max="${hoy}"></label>
    <div class="segm"><button class="on" data-tipo="callejero">🗺️ Callejero</button><button data-tipo="estudio">📚 Estudio</button></div>
    <label class="campo"><span>Minutos</span><input type="number" id="olvM" inputmode="numeric" min="1" max="600" value="30"></label>
    <label class="campo"><span>Pieza conseguida</span><select id="olvO">${disp.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join("")}</select></label>
    <div class="acciones"><button class="btn sec" data-m="cerrar">Cancelar</button><button class="btn" data-m="ok">Guardar</button></div>`;
  let tipo = "callejero";
  box.querySelectorAll("[data-tipo]").forEach(b => b.onclick = () => { tipo = b.dataset.tipo; box.querySelectorAll("[data-tipo]").forEach(x => x.classList.toggle("on", x === b)); });
  box.querySelectorAll("[data-m=cerrar]").forEach(b => b.onclick = () => { box.hidden = true; });
  box.querySelector("[data-m=ok]").onclick = () => {
    const f = box.querySelector("#olvF").value || hoy, m = Math.max(1, Math.round(+box.querySelector("#olvM").value || 0)), obj = box.querySelector("#olvO").value;
    box.hidden = true;
    const ini = new Date().toISOString(), id = "m" + Date.now().toString(36);
    guardar({dias: {[f]: {sesiones: {[id]: {tipo, ini, est: m, desc: 0, obj, ok: m >= E.MIN_SESION, manual: true}}}}});
  };
}

function abrirTienda() {
  const box = $("#modal"), hoy = HOY();
  const pintarT = () => {
    const {e, abiertas, cuenta} = datosCiudad(hoy), sel = st.parque && st.parque.sel;
    const item = x => {
      const tiene = E.tengo(st, x.id), abierta = abiertas.includes(x.zona), puede = abierta && e.monedas >= x.precio;
      const zona = E.CIUDAD.find(z => z.id === x.zona);
      return `<li class="${tiene ? "tiene" : puede ? "puede" : ""} ${abierta ? "" : "cerrada"}">${iconoPieza(x, "ti")}<div><b>${esc(x.nombre)}</b>${cuenta[x.id] ? ` <span class="chip visto">×${cuenta[x.id]}</span>` : ""}
        <small>${!abierta ? `🔒 se abre con ${zona.horas} h estudiadas` : x.precio ? `🪙 ${x.precio}` : "Gratis"}${abierta && !tiene && !puede ? ` · te faltan ${x.precio - e.monedas}` : tiene ? " · desbloqueado" : ""}${x.repetible ? " · repetible" : ""}</small></div>
        ${tiene ? (sel === x.id ? `<span class="chip visto">elegido</span>` : `<button class="enlace peque" data-u="${x.id}">Usar</button>`)
          : `<button class="btn peque" data-c="${x.id}" ${puede ? "" : "disabled"}>Comprar</button>`}</li>`;
    };
    const grupos = [
      ...E.ZONAS.map(z => ({t: `${z.icono} ${z.nombre}`, xs: E.TIENDA.filter(x => x.zona === "parque" && x.tipo === z.tipo)})),
      ...E.CIUDAD.filter(z => z.id !== "parque").map(z => ({t: `${z.icono} ${z.nombre}${abiertas.includes(z.id) ? "" : ` · 🔒 ${z.horas} h`}`, xs: E.TIENDA.filter(x => x.zona === z.id)})),
    ];
    box.hidden = false;
    box.dataset.cerrable = "1";
    box.querySelector(".hoja").innerHTML = `<div class="hoja-cab sticky"><h2>🛒 Tienda</h2><b>🪙 ${e.monedas}</b><button class="ico cerrar" data-m="cerrar" aria-label="Cerrar">✕</button></div>
      <p class="nota">1 minuto estudiado = 1 moneda. Lo que compras queda desbloqueado para crearlo con el temporizador tantas veces como quieras: cada vez es otra copia en tu parque. Las zonas nuevas de la ciudad se abren con las horas estudiadas.</p>
      ${grupos.map(g => `<h4 class="zona-t">${g.t}</h4><ul class="tienda">${g.xs.map(item).join("")}</ul>`).join("")}
      <div class="acciones"><button class="btn" data-m="cerrar">Cerrar</button></div>`;
    box.querySelectorAll("[data-c]").forEach(b => b.onclick = async () => {
      const it = E.TIENDA.find(x => x.id === b.dataset.c);
      if (it && confirm(`¿Comprar ${it.nombre} por ${it.precio} monedas?`)) { await guardar({parque: {compras: {[it.id]: hoy}}}); pintarT(); }
    });
    box.querySelectorAll("[data-u]").forEach(b => b.onclick = async () => { await guardar({parque: {sel: b.dataset.u}}); pintarT(); });
    box.querySelectorAll("[data-m=cerrar]").forEach(b => b.onclick = () => { box.hidden = true; });
  };
  pintarT();
}

/* ---------- niveles y recompensas ---------- */
function abrirNiveles() {
  const box = $("#modal"), hoy = HOY(), total = E.resumen(st, hoy).total, actual = E.rango(total);
  const pintarN = () => {
    box.hidden = false;
    box.dataset.cerrable = "1";
    box.querySelector(".hoja").innerHTML = `<div class="hoja-cab sticky"><h2>Niveles y recompensas</h2><button class="ico cerrar" data-m="cerrar" aria-label="Cerrar">✕</button></div>
      <p class="nota">Tienes <b>${total} puntos</b>. Cada nivel trae su recompensa: tú te encargas de cumplirla y aquí la marcas.</p>
      <ul class="niveles">${E.RANGOS.map(r => {
        const min = r.min === -Infinity ? 0 : r.min, ok = total >= min, es = r.nombre === actual.nombre;
        const hecho = (st.premios || {})[r.nombre];
        const falta = min - total;
        return `<li class="${ok ? "ok" : ""} ${es ? "actual" : ""}"><span class="ni">${r.icono}</span>
          <div><b>${esc(r.nombre)}</b> <small>${r.min === -Infinity ? "inicio" : `${min} puntos`}${es ? " · tu nivel" : ""}</small>
          ${r.premio ? `<p>🎁 ${esc(r.premio)}</p>` : `<p class="nota">El punto de partida.</p>`}
          ${r.premio ? (ok ? (hecho ? `<span class="cumplida">✓ Cumplida el ${E.fechaLarga(hecho, false)}</span> <button class="enlace peque" data-p="${esc(r.nombre)}" data-v="0">Desmarcar</button>`
            : `<button class="btn peque" data-p="${esc(r.nombre)}" data-v="1">Marcar como cumplida</button>`) : `<span class="nota">Te faltan ${falta} ${falta === 1 ? "punto" : "puntos"}</span>`) : ""}</div></li>`;
      }).join("")}</ul>
      <div class="acciones"><button class="btn" data-m="cerrar">Cerrar</button></div>`;
    box.querySelectorAll("[data-p]").forEach(b => b.onclick = async () => {
      await guardar({premios: {[b.dataset.p]: b.dataset.v === "1" ? hoy : null}});
      pintarN();
    });
    box.querySelectorAll("[data-m=cerrar]").forEach(b => b.onclick = () => { box.hidden = true; });
  };
  pintarN();
}

/* ---------- distritos del callejero ---------- */
function abrirDistritos(fecha) {
  const box = $("#modal");
  const elegidos = new Set((st.calle && st.calle.sel) || []);
  const veces = {};
  for (const r of Object.values(st.dias)) for (const x of (r && r.cal) || []) veces[x] = (veces[x] || 0) + 1;
  const pintarD = () => {
    box.hidden = false;
    box.querySelector(".hoja").innerHTML = `<h2>¿Qué distritos estás estudiando?</h2>
      <p class="nota">Marca todos los que quieras: si los estudias de arrastre, déjalos marcados y se quedan para los próximos días. Al marcar el callejero se apunta lo que estudiaste.</p>
      <div class="chips distritos">${E.FOCOS_CALLEJERO.map(n => `<button class="${elegidos.has(n) ? "on" : ""}" data-d="${esc(n)}">${esc(n)}${veces[n] ? `<small>${veces[n]} ${veces[n] === 1 ? "día" : "días"}</small>` : ""}</button>`).join("")}</div>
      <div class="acciones"><button class="btn sec" data-m="limpiar">Quitar todos</button><button class="btn" data-m="ok">Guardar</button></div>`;
    box.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const n = b.dataset.d; elegidos.has(n) ? elegidos.delete(n) : elegidos.add(n); pintarD(); });
    box.querySelector("[data-m=limpiar]").onclick = () => { elegidos.clear(); pintarD(); };
    box.querySelector("[data-m=ok]").onclick = () => {
      box.hidden = true;
      const sel = E.FOCOS_CALLEJERO.filter(n => elegidos.has(n));
      const parche = {calle: {sel}};
      // Si ese día ya habías marcado el callejero, se actualiza lo apuntado.
      const r = st.dias[fecha];
      if (r && r.c && r.c[4]) parche.dias = {[fecha]: {cal: sel}};
      guardar(parche);
    };
  };
  pintarD();
}

/* ---------- cuánto has tardado ---------- */
function abrirTiempo(fecha, previsto, actual) {
  const box = $("#modal");
  box.hidden = false;
  const v0 = actual ?? previsto;
  box.querySelector(".hoja").innerHTML = `<h2>¿Cuánto has tardado?</h2>
    <p class="nota">Previsto: ${E.textoMin(previsto)}. Con lo que de verdad tardas, la app ajusta el tiempo de lo que te queda y la fecha de tus vueltas.</p>
    <div class="tiempo-real"><button class="btn sec" data-d="-15">−15</button><label><input id="minReal" type="number" inputmode="numeric" min="1" max="600" value="${v0}"> min</label><button class="btn sec" data-d="15">+15</button></div>
    <div class="acciones"><button class="btn sec" data-m="omitir">Ahora no</button><button class="btn" data-m="ok">Guardar</button></div>`;
  const inp = box.querySelector("#minReal");
  box.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { inp.value = Math.max(1, (+inp.value || 0) + +b.dataset.d); });
  box.querySelector("[data-m=omitir]").onclick = () => { box.hidden = true; };
  box.querySelector("[data-m=ok]").onclick = () => { const m = +inp.value; box.hidden = true; if (m > 0) guardar(E.tiempoReal(st, fecha, m)); };
}

/* ---------- eventos ---------- */
function enlazar() {
  const hoy = HOY();
  document.querySelectorAll("[data-tick]").forEach(b => b.onclick = () => {
    const fecha = ui.fecha || hoy, i = +b.dataset.tick;
    const rec = st.dias[fecha] || {};
    const valor = !(rec.c && rec.c[i]);
    if (navigator.vibrate && valor) navigator.vibrate(12);
    const d = i === E.I_ESTUDIO && valor ? E.dia(st, hoy, fecha) : null;
    const parche = E.marcar(st, hoy, fecha, i, valor);
    if (i === 4) parche.dias[fecha].cal = valor ? ((st.calle && st.calle.sel) || []) : null;
    guardar(parche);
    if (d && d.tipo === "estudio" && d.plan && d.plan.length) abrirTiempo(fecha, d.min);
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
    } else if (a === "tiempoReal") {
      abrirTiempo(b.dataset.f, E.dia(st, hoy, b.dataset.f).min, +b.dataset.m);
    } else if (a === "noEntra") {
      const t = b.dataset.t, n = +b.dataset.n;
      if (b.dataset.v === "1" && !confirm("¿Quitar esta parte de todas las vueltas? (No entra por decreto o no la estudias)")) return;
      guardar(E.noEntra(t, n, {key: b.dataset.key}, b.dataset.v === "1"));
    } else if (a === "foco") {
      elegirYEmpezar(b.dataset.t, b.dataset.item);
    } else if (a === "hastaAqui") {
      abrirHastaAqui(b.dataset.f || null, b.dataset.id, b.dataset.t);
    } else if (a === "reintentar3d") {
      location.reload();
    } else if (a === "olvidado") {
      abrirOlvidado();
    } else if (a === "editarParque") {
      ui.editarParque = !ui.editarParque; pintar();
    } else if (a === "tienda") {
      abrirTienda();
    } else if (a === "comprar") {
      const it = E.TIENDA.find(x => x.id === b.dataset.id), est = E.estadisticas(st, hoy);
      if (it && est.monedas >= it.precio && confirm(`¿Comprar ${it.nombre} por ${it.precio} monedas?`)) guardar({parque: {compras: {[it.id]: hoy}}});
    } else if (a === "selObj") {
      guardar({parque: {sel: b.dataset.id}});
    } else if (a === "niveles") {
      abrirNiveles();
    } else if (a === "distritos") {
      abrirDistritos(b.dataset.f);
    } else if (a === "verConv") {
      ir("convocatorias");
    } else if (a === "filtroConv") {
      ui.filtroConv = b.dataset.f; pintar();
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
function ir(v) {
  if (v === "convocatorias") {
    // Lo nuevo se resalta en esta visita; la próxima vez ya cuenta como visto.
    ui.convVistoAntes = st.convVisto || E.sumaDias(HOY(), -7);
    if (st.convVisto !== HOY()) guardar({convVisto: HOY()});
    conv = null;
  }
  ui.vista = v; if (v !== "semana") ui.semana = null; pintar(); window.scrollTo(0, 0);
}
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => { if (b.dataset.v === "hoy") ui.fecha = null; ir(b.dataset.v); });
$("#btnAjustes").onclick = () => ir("ajustes");

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
main();
setTimeout(cargarConv, 300);
$("#modal").addEventListener("click", e => { if (e.target === e.currentTarget && e.currentTarget.dataset.cerrable) e.currentTarget.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden && $("#modal").dataset.cerrable) $("#modal").hidden = true; });
new MutationObserver(() => { if ($("#modal").hidden) delete $("#modal").dataset.cerrable; }).observe($("#modal"), {attributes: true, attributeFilter: ["hidden"]});
// Modelos 3D del parque: se cargan en segundo plano; mientras tanto (o sin WebGL) se ven iconos sencillos.
P3.cargar().then(() => { if (st) pintar(); if (foco) pintarFoco(); }).catch(() => { if (st) pintar(); });
foco = leerFoco(); if (foco) pintarFoco(); // para el aviso de novedades en la pestaña
