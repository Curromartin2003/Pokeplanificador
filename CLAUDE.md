# Pokeplanificador — guía para Claude Code

Web estática (sin build) en español. Planificador de estudio de la oposición de bombero de Sevilla, compañera de
Pokecallejero (repo `Pokecallejero-oficial`), con el mismo proyecto de Firebase y la misma cuenta.

- Lógica pura en `js/engine.js` (probada con `node --test tests/engine.test.mjs`); interfaz en `js/app.js`;
  guardado en `js/store.js`; temario en `js/temario.js` (Decreto 36/2025, Anexo I, Bombero/a turno libre);
  PDF del específico en `js/docs_esp.js` (palabras por página de cada PDF; se generan con pdftotext).
- Estado: un único documento Firestore `data/users/{uid}/planificador` (permitido por las reglas de Pokecallejero:
  `match /data/users/{uid}/{documento}`). Se escribe con `setDoc(..., {merge: true})` y parches parciales.
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
- Puntos: `puntosIniciales` (7, por SEMILLAS) + los de cada día. `tiemposTema` reparte el tiempo real de cada día entre
  los temas estudiados (se muestra en Temario).
- Convocatorias: `data/convocatorias.json` lo genera `scripts/convocatorias.py` (solo stdlib) cada mañana con
  `.github/workflows/convocatorias.yml`: España = BOJA (bases de entidades locales andaluzas, anuncio a anuncio desde
  `boja_ultimo`) + BOE sección II.B (cuando se abre el plazo), bombero/a turno libre (oposición o concurso-oposición),
  sin promoción interna ni movilidad, con fin de plazo calculado; Mis convocatorias = `data/mis_convocatorias.json`
  (fichas escritas a mano + novedades automáticas con enlace directo: anuncios del BOE que las nombran, PDF nuevos en las
  páginas vigiladas (`vigilar[].pdfs`), anuncios del BOP de Sevilla (`bop_sevilla`) y cambios de texto en las páginas).
  Las novedades sin ver salen también en Hoy.
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
- Mi parque: `estadisticas` (horas hoy/semana/mes/año/total; 1 min = 1 moneda), `TIENDA` por `ZONAS` (parque de bomberos: cocheras, instalaciones, material, exterior con pocas plantas, trofeos),
  `parque: {compras: {id: fecha}, sel}`.
- Parque 3D: `js/parque3d.js` (three.js 0.160 por import map desde jsDelivr): modelos de baja poligonización propios
  para cada pieza de `TIENDA` (`MODELOS`), plano isométrico con una parcela por pieza (`SITIO`), miniaturas para la tienda
  y visor del temporizador. Sin WebGL se ven iconos. Ciudad: zonas `CIUDAD` (parque, campo de maniobras 40 h, barrio 120 h,
  base forestal 250 h, aeródromo 400 h) con `AREAS` en parque3d.js; `piezasCiudad` da una copia por cada vez conseguida
  (las repetidas van a la explanada); `parque.pos[key] = [x, z, giro]` guarda lo movido a mano («✋ Mover»).
- Vida del parque (`crearVida` en parque3d.js): bomberos animados (`nBomberos` = 1 + 1 cada 4 piezas, máx. 8) que pasean y
  hacen la acción de cada pieza (`ACCION[id]`: coger material y usarlo, lavar vehículos, entrar en instalaciones, trepar,
  entrenar, echar agua, saludar, helicóptero). Planes = listas de pasos `{ir}` / `{hacer, dur, fin}`; al editar («Mover») se
  cancelan y devuelven lo que llevaban. Una pieza nueva sin entrada en `ACCION` solo se pasea.
- Los PDF no se suben al repositorio.
- Probar: `python3 -m http.server` y abrir `/?local&hoy=AAAA-MM-DD`. `node tests/e2e.mjs` (Playwright).
- Si cambias archivos que se precargan, sube la versión de `CACHE` en `sw.js`. El service worker espera a la red 2,5 s y si no,
  usa la caché: los bloqueos de LaLiga a Cloudflare (días de partido) dejaban la app en blanco.
- Publicación: Cloudflare Pages (pokeplanificador.pages.dev, desde `main`) y Firebase Hosting (pokeplanificador.web.app,
  `firebase.json` + `.github/workflows/hosting.yml`, tras cada push y cada revisión de convocatorias; necesita el secreto
  `FIREBASE_SERVICE_ACCOUNT`). Firebase no sufre los bloqueos de LaLiga a Cloudflare.
