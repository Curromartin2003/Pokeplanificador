# Pokeplanificador — guía para Claude Code

Web estática (sin build) en español. Planificador de estudio de la oposición de bombero de Sevilla, compañera de
Pokecallejero (repo `Pokecallejero-oficial`), con el mismo proyecto de Firebase y la misma cuenta.

- Lógica pura en `js/engine.js` (probada con `node --test tests/engine.test.mjs`); interfaz en `js/app.js`;
  guardado en `js/store.js`; temario en `js/temario.js` (Decreto 36/2025, Anexo I, Bombero/a turno libre).
- Estado: un único documento Firestore `data/users/{uid}/planificador` (permitido por las reglas de Pokecallejero:
  `match /data/users/{uid}/{documento}`). Se escribe con `setDoc(..., {merge: true})` y parches parciales.
  Forma: `{inicio, ritmo, reparto, examen, semanas: {lunesISO: {libre: 5|6, luis: [dow]}}, dias: {fecha: {c: [8 bool],
  s: {t: "leg"|"esp", m: minutos, x: {t, m} | null} | null}}, ajuste: {leg, esp}, titulos, callejeroUrl, base}` (`reparto` ya no se usa). Días: lunes = 0.
- El plan no se guarda: se recalcula recorriendo los días desde `inicio`. Solo avanza el temario lo marcado como hecho.
- Reglas del usuario: 1 h L/X/V, 3 h M/J y sábado o domingo (el otro libre del todo); 2 días de clase de Luis por semana
  (solo clase + callejero); callejero 30 % del tiempo; un día legislación y otro específico mientras van por la misma vuelta; la materia
  que acaba su vuelta espera (todos los días a la otra) hasta que la otra la acaba, y entonces empiezan las dos la siguiente
  (un día puede partirse: `s.x` guarda la segunda materia); puntos: 8/8 → +1,
  7/8 → 0, ≤6/8 → −1.
- Material del usuario: los temas con `material` tienen partes `[nombre, minutos, "PDF · págs. a-b"]` sacadas de sus PDF
  (minutos ≈ palabras / 40 en texto legal). Un tema puede tener varios PDF: se añaden a `material` y sus partes en orden.
  Los PDF no se suben al repositorio.
- Probar: `python3 -m http.server` y abrir `/?local&hoy=AAAA-MM-DD`. `node tests/e2e.mjs` (Playwright).
- Si cambias archivos que se precargan, sube la versión de `CACHE` en `sw.js`.
