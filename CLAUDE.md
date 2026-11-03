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
  titulos, callejeroUrl, base, cambios: [...], leidos, etaVista, semilla}`. Días: lunes = 0.
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
- Los PDF no se suben al repositorio.
- Probar: `python3 -m http.server` y abrir `/?local&hoy=AAAA-MM-DD`. `node tests/e2e.mjs` (Playwright).
- Si cambias archivos que se precargan, sube la versión de `CACHE` en `sw.js`.
