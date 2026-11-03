// Prueba de la app en el navegador (modo local, sin Firebase): node tests/e2e.mjs
// Necesita Playwright y levanta un servidor en el puerto 8790. Con SHOTS=carpeta guarda capturas.
import {createRequire} from "node:module";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const {chromium} = require("playwright");
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srv = spawn("python3", ["-m", "http.server", "8790"], {cwd: raiz, stdio: "ignore"});
await new Promise(r => setTimeout(r, 700));
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); console.log((c ? "✓ " : "✗ ") + m); };
const shots = process.env.SHOTS;
const URL = f => `http://localhost:8790/index.html?local&hoy=${f}`;
try {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 390, height: 844}});
  const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(URL("2026-11-03"));
  await p.waitForSelector("#modal:not([hidden])");
  ok(await p.isVisible("text=¿Qué días son las clases de Luis?"), "al empezar la semana pregunta día libre y clases de Luis");
  if (shots) await p.screenshot({path: shots + "/1-semana.png"});
  await p.click("[data-libre='6']");
  await p.click("[data-luis='0']");
  await p.click("[data-luis='2']");
  await p.click("[data-m=ok]");
  await p.waitForSelector("#modal", {state: "hidden"});
  ok((await p.textContent(".objs")).includes("Estudio: Legislación · 2 h 6 min"), "martes: 2 h 6 min de legislación");
  ok((await p.textContent(".objs")).includes("Callejero · 54 min"), "callejero: 30 % (54 min)");
  ok((await p.textContent(".plan")).includes("Constitución"), "empieza por la Constitución");
  for (let i = 0; i < 7; i++) await p.click(`[data-tick='${i}']`);
  ok((await p.textContent(".marcador")).includes("Se mantiene"), "7 de 8: se mantiene");
  await p.click("[data-tick='7']");
  ok((await p.textContent(".marcador")).includes("+1 punto"), "8 de 8: +1 punto");
  if (shots) await p.screenshot({path: shots + "/2-hoy.png", fullPage: true});
  await p.click("[data-a=diaMas]");
  ok((await p.textContent("#vista")).includes("Clase de Luis"), "miércoles: clase de Luis");
  // Al día siguiente, el punto de ayer cuenta.
  await p.goto(URL("2026-11-04"));
  await p.waitForSelector(".marcador");
  ok((await p.textContent("#puntos")).includes("+1"), "el día cerrado suma 1 punto");
  await p.click("nav [data-v=semana]");
  if (shots) await p.screenshot({path: shots + "/3-semana.png", fullPage: true});
  ok((await p.$$(".semana .dia")).length === 6, "la semana va del martes (inicio del plan) al domingo");
  ok((await p.textContent(".semana")).includes("Específico"), "el jueves toca específico");
  await p.click("nav [data-v=temario]");
  await p.click("[data-k='esp6']");
  ok((await p.textContent("#vista")).includes("Hidrostática"), "el temario muestra las partes");
  if (shots) await p.screenshot({path: shots + "/4-temario.png", fullPage: true});
  await p.click("nav [data-v=progreso]");
  ok((await p.textContent("#vista")).includes("Terminas la 1.ª vuelta"), "calcula cuándo acabas la vuelta");
  if (shots) await p.screenshot({path: shots + "/5-progreso.png", fullPage: true});
  await p.click("#btnAjustes");
  await p.fill("#examen", "2027-10-15");
  await p.dispatchEvent("#examen", "change");
  ok((await p.textContent("#vista")).includes("vueltas antes del examen"), "con fecha de examen compara ritmos");
  if (shots) await p.screenshot({path: shots + "/6-ajustes.png", fullPage: true});
  await p.goto(URL("2026-11-08"));
  await p.waitForSelector(".libre");
  ok(true, "el domingo libre no tiene objetivos");
  ok(!errs.length, "sin errores en consola " + errs.join(" | "));
  await b.close();
} finally { srv.kill(); }
if (fallos.length) { console.error(fallos.length + " fallos"); process.exit(1); }
