# Pokeplanificador

Planificador diario de la oposición de Bombero/a (temario del Decreto 36/2025, BOJA n.º 32 de 17-02-2025, Anexo I).
Te dice qué estudiar cada día, calcula cuándo terminas cada vuelta al temario y puntúa tus objetivos diarios.
Usa la misma cuenta de Firebase que Pokecallejero, así que se sincroniza entre todos tus dispositivos.

## Cómo funciona
- **Semana**: al empezar cada semana la app pregunta qué día libras (sábado o domingo) y qué dos días son las clases de Luis.
- **Horas**: lunes, miércoles y viernes 1 h; martes, jueves y el sábado o domingo que no libres 3 h. El 30 % de cada día
  es callejero. Los días de clase de Luis solo hay clase y callejero. El día libre es libre del todo.
- **Estudio**: un día legislación y otro específico (o «proporcional» en Ajustes). Cada día dice el tema, la parte y los
  minutos exactos, siguiendo donde lo dejaste. Lo que no marcas como hecho pasa al siguiente día de esa materia.
- **Vueltas**: la 1.ª vuelta es lectura, subrayado y esquema por partes; la 2.ª lleva el 50 % del tiempo (esquemas y
  test); la 3.ª el 35 %; las siguientes el 30 %. Ritmos: base (×1,25), competitivo (×1) e intenso (×0,8).
- **Puntos**: 8 objetivos al día. Todos hechos: +1. Falla uno: se queda igual. Fallan dos o más: −1. Los días sin marcar
  cuentan como fallados; el libre no cuenta.

## Estructura
- `index.html`, `css/app.css`: la página.
- `js/temario.js`: los 12 temas de legislación, los 33 específicos y los 5 del SPEIS, divididos en partes con minutos.
- `js/engine.js`: toda la lógica (plan del día, colas por vuelta, previsiones y puntos), sin interfaz.
- `js/store.js`: Firestore (`data/users/{uid}/planificador`) o, sin Firebase o con `?local`, localStorage.
- `js/app.js`: interfaz. `sw.js` + `manifest.webmanifest`: instalable y sin conexión.

## Probar
```bash
python3 -m http.server 8765
```
Abre `http://localhost:8765/?local` (datos solo en el navegador). `&hoy=2026-11-10` simula otra fecha.
```bash
node --test tests/engine.test.mjs
```
```bash
node tests/e2e.mjs
```

## Publicar (Netlify)
Netlify → Add new site → Import an existing project → GitHub → `Pokeplanificador`. No hace falta comando de
construcción: `netlify.toml` publica la raíz. Cada push a la rama de producción se publica solo.
