# Prompt para GPT / Codex — T22: mejorar las visuales de SimUrgencias

Copia todo lo que está debajo de la línea en GPT (Codex) con acceso a la carpeta `C:\dev\SimUrgencias`.

---

Eres el agente de **visuales** de SimUrgencias, mi proyecto de Modelos y Simulación (Ingeniería de Sistemas). Trabajo en Windows, en `C:\dev\SimUrgencias`. Respóndeme en español.

## Contexto (léelo antes de tocar nada)
- Simulador de eventos discretos del servicio de urgencias de un hospital de Valledupar, validado con teoría de colas y mostrado como juego isométrico en el navegador (TypeScript + Vite + Phaser 3, todo offline).
- Lee en este orden: `AGENTS.md` (reglas para todas las IAs), `docs/SPEC.md` (**la §11 prevalece**; §4.4 es el contrato de eventos, congelado), `docs/TAREAS.md` (tu tarea es **T22**) y las últimas entradas de `docs/HANDOFF.md`.
- Estado: T01–T19 hechas por Claude. El motor, la validación y toda la lógica funcionan (87 pruebas en verde). **Lo que falla es el aspecto: la escena del hospital, los personajes, el mapa de la ciudad y la página se ven feos.** Tu trabajo es que se vean bien sin romper la lógica.
- Fechas: ExpoSoftware el jueves 26 de noviembre. **Congelamiento el martes 24 en la noche**: lo que no esté estable para entonces no se fusiona a `main`.

## Reglas que no se negocian
1. **El render solo consume el motor.** Nada en pantalla se mueve sin un evento (`SimEvent`) o sin leer `snapshot()`. Están permitidos los decorados estáticos (árboles, casas, plantas) y la cámara. Están prohibidas las animaciones de adorno sobre objetos del modelo (pacientes, ambulancias, camas).
2. **Prohibido `Math.random()`.** Si necesitas variedad determinista, usa un hash del id, como hace `appearanceFor` en `src/render/characters/pixels.ts`.
3. **Todo el arte se dibuja por código** (Phaser Graphics o texturas generadas en canvas). No agregues imágenes de terceros. **No uses fuentes de Google ni CDN**: debe funcionar sin internet; usa fuentes del sistema o una fuente empaquetada con licencia anotada en `docs/CREDITOS.md`.
4. **No toques** `src/engine`, `src/model`, `src/validation`, `src/batch` ni `src/engine/events.ts`. Tus carpetas son `src/render`, `src/ui`, `src/main.ts`, `index.html` y `tools/`.
5. Textos de interfaz y comentarios en **español**.
6. Antes de cada commit: `npm test` y `npx tsc --noEmit` en verde. Rama `feat/T22-visuales`, commits pequeños (`T22: ...`).

## APIs que debes conservar (las usan las pruebas y otras partes)
- `Playback` (`src/render/playback.ts`): `figures`, `position()`, `target()`, `transfers`, `ambulancePosition()`, `departures`, `listeners`, `receivedByClinic`, `capacity`, `ambulancesAway`.
- `Driver`, `LiveDriver` (con `twin`, `nLive`, `nTwin`, `accident`, `massCasualty`, `injectVisitor`, `load`) y `MockDriver` (`src/render/drivers.ts`).
- `HospitalScene`: `follow`, `goCity()`, `inCity`, `resetCamera()`, `demoZoom()`. `CityScene.goHospital()`. `mountScene(parent, driver, onHover?, city?) → { hospital, city }`.
- `src/render/layout.ts`: `iso`, `unIso`, `stationPos`, `slotPos`, `zoneAnchor`, `route`, `along`, `MAX`, `ROAD`, `ambulanceRoute`. **Puedes mover las posiciones**, pero las pruebas de `tests/render/` deben seguir pasando: nadie comparte silla, cada `MOVE` dura exactamente `duration`, nada se mueve entre eventos, y `hitTest` detecta pacientes, puestos y áreas. Si cambias la altura de los personajes, ajusta `BODY` en `src/render/hit.ts`.
- `characterPixels(app, view, pose, frame)` de 24×32 px (`src/render/characters/pixels.ts`). Puedes mejorar el dibujo, pero no la firma ni el tamaño base (para verlos más grandes, escala en la escena).
- `cityLayout`: **cada clínica debe quedar a una distancia proporcional a su tiempo medio de viaje** (hay una prueba). Es un requisito de rigor del proyecto.

## Qué mejorar, en orden de prioridad

### 1. Bug: en el mapa de la ciudad solo se ve 1 clínica
El autor solo ve una clínica y deberían verse las tres (Río Claro al este, La Pilonera al norte y Valle Verde al noreste). Reprodúcelo en 1366×768, 1920×1080 y anchos menores a 900 px (la página pasa a una columna). Revisa el encuadre en `CityScene.create` (`fit`): la fórmula de zoom no considera la altura de los edificios, los rótulos ni el tamaño real del lienzo. Las tres clínicas y el hospital deben verse completos al abrir el mapa en cualquier pantalla. Agrega botones de acercar, alejar y "ver todo" si ayudan.

### 2. Mapa de la ciudad (hoy se ve muy feo)
- Rediséñalo como un barrio isométrico creíble: manzanas, calles con andenes y cruces, árboles, techos variados, un parque, el río (Valledupar tiene el río Guatapurí, aunque aquí todo es ficticio).
- El hospital, con entrada de urgencias, zona de ambulancias y quizá un helipuerto. Cada clínica, con un edificio distinto y un letrero con su nombre.
- Barras de ocupación legibles, con el número de camas y el color según la ocupación (verde menos de 70 %, ámbar menos de 90 %, rojo de ahí en adelante).
- Ambulancias más reconocibles (sprite isométrico por código, con orientación según la vía).
- Al pasar el mouse por una clínica o el hospital, que se resalte; el clic ya abre la tarjeta (clínica) o entra a la escena (hospital).
- **Opcional, solo si sobra tiempo:** clic en una clínica → vista interior sencilla con sus camas, ocupadas según `snapshot().clinics[j].occupied`. Las clínicas del modelo son solo un conjunto de camas (Erlang B): no inventes pacientes moviéndose adentro.

### 3. Escena del hospital
- Paredes con altura, puertas y ventanas; pisos con textura por código (baldosas, líneas de guía de colores por zona como en los hospitales reales); separaciones entre zonas.
- Muebles con detalle: sillas con respaldo en la sala de espera, camas con almohada y sábana, cortinas entre camas de observación, escritorios con computador en admisión y triage, camillas en el pasillo, plantas y señalización ("Triage", "Admisión", "Consultorios", "Observación").
- Orden de profundidad correcto: un personaje detrás de una pared o un mueble debe quedar tapado (hoy todos los personajes se dibujan encima de los muebles).
- Una paleta coherente para todo y sombras suaves.
- Legible a la distancia de una feria: personajes y burbujas de triage más grandes (escala `ADULT` en `scene.ts`), rótulos más claros.

### 4. Personajes
Mejora el pixel art (sombreado, vista 3/4 más clara, manos, zapatos, variedad de peinados), conservando 24×32, la paleta, las vistas SE y NE con reflejo, las poses y los 4 cuadros de caminata. Revisa la hoja de personajes en `npm run dev` → `/tools/characters.html`.

### 5. Página e interfaz
Encabezado con el nombre del proyecto, botones agrupados (simulación, vista, paciente), panel lateral más ordenado, gráfica legible, tarjetas y subtítulos con mejor tipografía. Se presenta en el monitor de la feria: piensa en 1920×1080 a unos 2 m de distancia.

## Cómo verificar (obligatorio antes de dar algo por hecho)
- `npm run dev` → http://localhost:5173. Mira la Escena, el mapa ("Ver ciudad"), "Crear mi paciente", "Accidente masivo", la pestaña Validación y la demo (`?demo=5` la inicia a los 5 s sin uso).
- `?mock` reproduce un registro grabado (útil para comparar antes y después).
- `window.__sim` (solo en desarrollo) da acceso a `{ driver, live, scene }` desde la consola.
- Rendimiento: 60 fps a ×600 en un portátil normal. No crees objetos de Phaser en cada cuadro; reutiliza texturas y sprites.
- `npm run build` + `npm run preview` **con el wifi apagado**: todo debe verse igual.
- `npm test` y `npx tsc --noEmit` en verde.

## Al terminar (aunque quede a medias)
1. Agrega tu entrada al final de `docs/HANDOFF.md` con el formato de `AGENTS.md` (hecho, a medias, siguiente paso, preguntas).
2. Actualiza el estado de T22 en `docs/TAREAS.md`.
3. Fusiona a `main` **solo lo que esté estable y probado** y haz `git push`. Si algo queda a medias el martes 24 en la noche, déjalo en su rama: la versión actual funciona y es la que va a la feria.
