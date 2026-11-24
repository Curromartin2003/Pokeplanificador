# Pokeplanificador — guía para Claude Code

Web estática (sin build) en español. Planificador de estudio de la oposición de bombero de Sevilla, compañera de
Pokecallejero (repo `Pokecallejero-oficial`), con el mismo proyecto de Firebase y la misma cuenta.

- Lógica pura en `js/engine.js` (probada con `node --test tests/engine.test.mjs`); interfaz en `js/app.js`;
  guardado en `js/store.js`; temario en `js/temario.js` (Decreto 36/2025, Anexo I, Bombero/a turno libre);
  PDF del específico en `js/docs_esp.js` (palabras por página de cada PDF; se generan con pdftotext).
- Estado: un único documento Firestore `data/users/{uid}/planificador` (permitido por las reglas de Pokecallejero:
  `match /data/users/{uid}/{documento}`). Se escribe con `setDoc(..., {merge: true})` y parches parciales.
  Firestore no admite listas dentro de listas (`s.items`): `aFirestore`/`desdeFirestore` (store.js) las envuelven en `{_a: [...]}`
  al guardar y las desenvuelven al leer. Hasta el 24-11-2026 eso hacía fallar en silencio todo guardado de un día con estudio
  marcado. Si un guardado falla, evento `pp-error-guardar` → aviso rojo en la app.
  Forma: `{inicio, ritmo, examen, semanas: {lunesISO: {libre: 5|6, luis: [dow]}}, dias: {fecha: {c: [8 bool], h?: minutos,
  s: {t, m, x, items: [[idTrozo, fracción]]} | null}}, manual: {idTrozo: ajuste}, materiales: {"esp16": [{id, doc, wpm, pal, t}]},
  titulos, callejeroUrl, base, cambios: [...], leidos, etaVista, semilla, objetivos}`. Días: lunes = 0.
- Objetivos editables (✎ en cada uno en Hoy, «➕ Añadir objetivo»): `objetivos: [{t, ic, desde?, hasta?}]`, la posición es la
  de `dias[f].c` para siempre; quitar = `hasta` (deja de contar ese día), añadir = `desde`; estudio (3) y callejero (4) no se
  quitan. `listaObjetivos`, `objetivosDelDia(d, st)`, `puntosDia(d, rec, st)`.
- Modelo: cada tema se divide en trozos con id estable (hash de tema + vuelta + clave de la parte). Lo hecho es una
  fracción por trozo: ajustes a mano (`manual`, «Empezar aquí», «Marcar como visto») + lo que guarda cada día marcado
  (`s.items`). El plan no se guarda: se recalcula recorriendo los días desde `inicio`; primero los temas empezados.
- Reglas del usuario: 1 h L/X/V, 3 h M/J y sábado o domingo (el otro libre del todo); 2 días de clase de Luis por semana
  (solo clase + callejero); `dias[f].h` cambia el tiempo de un día suelto; callejero 30 % del tiempo; un día legislación y
  otro específico mientras van por la misma vuelta; la que acaba su vuelta espera (todos los días a la otra) hasta que la
  otra la acaba, y entonces empiezan las dos la siguiente; puntos: 8/8 → +1, 7/8 → 0, ≤6/8 → −1.
- Temario: legislación entera (partes a mano por artículos/páginas). Específico: solo entran en la vuelta los temas con
  PDF (`DOCS_ESP` o subidos en la app, que se parten solos en trozos de ~50 min por páginas con `partesDePdf`).
  Velocidades: Constitución, PRL y TREBEP a fondo; el resto de leyes, lo subrayado (60 %); específico ~70 palabras/min,
  normas largas como consulta.
- Lo que el usuario cuenta por el chat y afecta a sus datos va en `SEMILLA` (temario.js): se aplica una vez al abrir la
  app (sube `id` para una nueva). Las novedades del plan van en `CAMBIOS` y la app las avisa con el cambio de fecha.
  Semillas también admiten `diasCompletos: [fecha]` (día cumplido sin marcar: todos los objetivos y el estudio del plan) y
  `tiempoTema: {"leg1|1": min}` → `tiemposManual` (corrección del tiempo de un tema; también con «⏱ Corregir el tiempo» en Temario).
- Puntos: `puntosIniciales` (7, por SEMILLAS) + los de cada día. Tiempo: `atribuirDia` asigna cada minuto de estudio a su
  tema (parte del temporizador, lo apuntado con el temporizador libre; el resto, entre los `s.items` del día o a la materia
  del día). `tiemposTema` → Temario («Terminado en N min de estudio»); `repartoMinutos` → Mi parque (legislación,
  específico, callejero; total y esta semana).
- Convocatorias: `data/convocatorias.json` lo genera `scripts/convocatorias.py` (solo stdlib) cada mañana con
  `.github/workflows/convocatorias.yml`: España = BOJA (bases de entidades locales andaluzas, anuncio a anuncio desde
  `boja_ultimo`) + BOE sección II.B (cuando se abre el plazo), bombero/a turno libre (oposición o concurso-oposición),
  sin promoción interna ni movilidad, con fin de plazo calculado; Mis convocatorias = `data/mis_convocatorias.json` (Aena IC10, Alcalá de Guadaíra y CPEI Badajoz; Cazorla y Segura quitada a petición del usuario)
  (fichas escritas a mano + novedades automáticas con enlace directo: anuncios del BOE que las nombran, PDF nuevos en las
  páginas vigiladas (`vigilar[].pdfs`), anuncios del BOP de Sevilla (`bop_sevilla`) y cambios de texto en las páginas).
  Las novedades sin ver salen también en Hoy.
  Revisión dos veces al día (06:41 y 15:37 UTC). `get` reintenta y usa `scripts/certs/intermedios.pem` (intermedios que
  algunas webs no envían, p. ej. alcaladeguadaira.es). Tablón de sedes Gestiona (`tablon: [{nombre, url, claves, expedientes}]`,
  `tablon_gestiona`): Alcalá publica ahí listas y fechas (la lista definitiva del 18-11-2026 salió solo ahí). BOP de Sevilla
  (lunes a viernes): se repasan los días de las 2 últimas semanas que no se pudieron leer (`bop_ok`). Lo que falla va a
  `fallos` y la app lo enseña en Plazas.
  Toda España: `canal_bombero` lee el recopilatorio nacional de canaloposiciones (bombero, turno libre, sin promoción interna
  ni mandos) para lo que sale en boletines autonómicos/provinciales sin pasar por el BOE; cada ficha enlaza al boletín de
  origen y calcula el fin si el plazo cuenta desde ese boletín. Ojo: las bases de BOP de fuera de Andalucía (p. ej. Badajoz)
  no siempre aparecen hasta el extracto del BOE. `plazo_boe: true` en una ficha de Mis convocatorias: al salir el anuncio
  del BOE se calcula `fin` y se añaden las fases.
  `data/revisados.json` guarda los anuncios ya mirados. Radar BOP de Sevilla (`sevilla`): todo anuncio de bomberos de
  turno libre de la provincia (bases, listas, tribunal, examen) con enlace directo; si nunca se ha podido leer
  (`sevilla_ok` falso) intenta los últimos 60 días. El título de cada anuncio se elige por parecido con su dirección
  (texto de antes o de después del enlace); fuera subvenciones, obras, ordenanzas. Avisos al móvil con ntfy si el workflow
  define `NTFY_TEMA` (aún sin activar: falta que el usuario lo confirme).
- Callejero: `calle.sel` = distritos que se están estudiando (varios a la vez, se quedan); al marcar el callejero se
  guarda en `dias[f].cal`.
- Temporizador (app.js, estado en localStorage `pp.foco`): Parar = descanso, Seguir, Finalizar. Al finalizar guarda la
  sesión en `dias[f].ses` [{tipo: estudio|callejero, ini, est, desc, obj, ok}]; con ≥ `MIN_SESION` min (y sin salir de la
  app más de 20 s) la pieza elegida va al parque. «📍 Hasta aquí» (`hastaAqui`) fija el avance del día y marca
  `dias[f].hastaAqui` para que marcar el estudio no vuelva a sumar temario.
- Temporizador libre («⏱ Temporizador libre» junto a «➕ Apuntar tiempo olvidado» en Mi parque): cuando quieras, estudio o
  callejero (`foco.libre`); el tiempo cuenta como cualquier sesión. Al acabar un estudio libre, `abrirEstudiado` pregunta tema,
  partes terminadas y dónde te quedaste: `E.estudiado` (solo esas partes, nunca hace retroceder) + `partesTema`; se guarda en
  `dias[f].sesiones[id].estudiado` y en `marcas`.
- «⏱ Temporizador libre» también en Hoy (debajo de los objetivos, solo el día de hoy, también en días libres).
- Clase de Luis: «⏱ Temporizador» en el objetivo de la clase (y «🎓 Clase» en el libre) → sesiones `tipo: "clase"`: cuentan como
  estudio (`minutosDia().est`) y aparte (`.clase`); en Mi parque, tarjeta «Clase de Luis» siempre visible en el reparto (2 × 2).
- Mi parque: `estadisticas` (horas hoy/semana/mes/año/total; 1 min = 1 moneda), `TIENDA` por `ZONAS` (parque de bomberos: cocheras, instalaciones, material, exterior con pocas plantas, trofeos),
  `parque: {compras: {id: fecha}, sel}`.
- Parque 3D: `js/parque3d.js` (three.js 0.160 por import map desde jsDelivr): modelos de baja poligonización propios
  para cada pieza de `TIENDA` (`MODELOS`), plano isométrico con una parcela por pieza (`SITIO`), miniaturas para la tienda
  y visor del temporizador. Sin WebGL se ven iconos. Ciudad: zonas `CIUDAD` (parque, campo de maniobras 40 h, barrio 120 h,
  base forestal 250 h, aeródromo 400 h) con `AREAS` en parque3d.js; `piezasCiudad` da una copia por cada vez conseguida
  (las repetidas van a la explanada); `parque.pos[key] = [x, z, giro]` guarda lo movido a mano («✋ Mover»).
- Acabado del 3D (parque3d.js): `ambiente()` (reflejos con RoomEnvironment + ACES), `ACABADO` por color (pintura con barniz,
  metal, cristal), `caja` con cantos redondeados (RoundedBoxGeometry), texturas dibujadas en lienzo (`TEX`: hierba, grano,
  ladrillo, persiana, portón, chevron, rótulos) con `matTex`/`panel`, piezas base `camion`, `cabina`, `rueda`, `edificio`,
  `ventana`, `copa`, `tronco`, y luces azules que destellan (`destello`). Si los extras no cargan, se ve sin redondeos ni reflejos.
- Vida del parque (`crearVida` en parque3d.js): bomberos animados (`nBomberos` = 1 + 1 cada 4 piezas, máx. 8) que pasean y
  hacen la acción de cada pieza (`ACCION[id]`: coger material y usarlo, lavar vehículos, entrar en instalaciones, trepar,
  entrenar, echar agua, saludar, helicóptero). Planes = listas de pasos `{ir}` / `{hacer, dur, fin}`; al editar («Mover») se
  cancelan y devuelven lo que llevaban. Una pieza nueva sin entrada en `ACCION` solo se pasea.
- Estilo liquid glass: `css/glass.css`, capa encima de `app.css` (fondo de manchas de color animadas, cristal con
  `backdrop-filter`, barra de pestañas flotante, botones con brillo; modo oscuro ahumado). Sin desenfoque, cristal casi opaco.
- Tema: Ajustes → Apariencia (Automático / Claro / Oscuro), en localStorage `pp.tema` (por dispositivo); un script en el
  `<head>` pone `data-theme` antes de pintar. Cada regla oscura va dos veces: en `@media (prefers-color-scheme: dark)` con
  `:root:not([data-theme="light"])` y copiada con `:root[data-theme="dark"]`.
- Icono: cruz de bombero dorada con un check sobre rojo (`icons/icono.svg`); todos los PNG se generan con
  `node scripts/icono.cjs` (Playwright + PIL).
- Los PDF no se suben al repositorio.
- Probar: `python3 -m http.server` y abrir `/?local&hoy=AAAA-MM-DD`. `node tests/e2e.mjs` (Playwright).
- Si cambias archivos que se precargan, sube la versión de `CACHE` en `sw.js` y la misma en `window.PP_VERSION` (index.html;
  se ve en Ajustes para comprobar si el móvil tiene la última). El service worker espera a la red 2,5 s y si no,
  usa la caché: los bloqueos de LaLiga a Cloudflare (días de partido) dejaban la app en blanco.
  Pide los archivos sin la caché HTTP (`cache: "no-cache"`/`"reload"`; Firebase los servía con max-age=3600 y salían versiones
  viejas) y la app se recarga sola una vez cuando se activa un service worker nuevo (`controllerchange`).
- Publicación: Cloudflare Pages (pokeplanificador.pages.dev, desde `main`) y Firebase Hosting (pokeplanificador.web.app,
  `firebase.json` + `.github/workflows/hosting.yml`, tras cada push y cada revisión de convocatorias; necesita el secreto
  `FIREBASE_SERVICE_ACCOUNT`). Firebase no sufre los bloqueos de LaLiga a Cloudflare.
