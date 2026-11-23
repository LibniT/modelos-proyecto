# Bitácora de relevo entre agentes

Cada sesión de IA agrega una entrada AL FINAL con el formato de `AGENTS.md`. La entrada más reciente manda.

---

## 2026-11-22 · Claude · main (copiado a la carpeta del autor)
Hecho:
- T01–T04. Motor SED completo en `src/engine` + `src/model`, validación en `src/validation`, réplicas en `src/batch` (con Worker).
- 50 pruebas pasan (`npm test`): generadores (KS), fórmulas analíticas, invariantes del modelo y **validación analítica**: los 16 valores analíticos (Erlang C por estación, Cobham por nivel, Erlang B, Little) caen dentro del IC 95 % de 30 réplicas. Tabla en `docs/VALIDACION.md` (`npm run report`).
- `src/render/mock/events.json`: 3 horas de eventos REALES del motor (modo realista) para desarrollar la escena sin el motor en vivo.
- `src/main.ts`: vista provisional en texto (reloj, estados, métricas, accidente masivo, botón de validación en Worker). Es solo para probar; T05/T06 la reemplazan.

Decisiones nuevas (también en SPEC §11):
- Clínicas: 30 / 40 / 50 camas con demanda propia 0.3 / 0.4 / 0.5 por hora (con 12–20 camas las remisiones las saturaban por completo).
- Modo realista con 6 médicos por defecto (con 5, el pico de la tarde dejaba ~30 % de abandono en IV–V).
- Nuevo estado de paciente `caminando` durante los MOVE (solo en `snapshot`, el contrato de eventos no cambia).
- La prueba automática usa el IC conjunto de Bonferroni (95 % familiar) para no fallar por azar con 16 comparaciones; la tabla reporta el IC 95 % individual.

Siguiente paso: T05 (escena, Codex A), T07 (panel, Codex A), T09 (personajes, Codex B) pueden empezar en paralelo. Claude: T11 y luego T14.

Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Claude · main (ramas feat/T11-validacion y feat/T14-medicos, ya fusionadas)
Hecho:
- Repositorio en GitHub (`origin` = https://github.com/LibniT/modelos-proyecto.git). El material de investigación local (`docs/*.docx`, `docs/PROMPT_GRILL_ME.md`, `imagenes-guia/`) queda fuera de Git por decisión del autor (`.gitignore`).
- T11: `src/ui/validation/panel.ts` → `mountValidationPanel(el)`. Tabla HTML analítico vs simulado, barra de progreso y resumen (16/16 dentro del IC 95 %). `src/main.ts` tiene ahora dos pestañas (Simulación / Validación). **Para T06:** al reemplazar `main.ts`, conserva la llamada a `mountValidationPanel`.
- T14: `src/batch/experiment.ts` (`doctorExperiment`, IC por escenario + IC pareado contra la referencia + razón de varianza CRN/independiente), `npm run experiment` → `docs/EXPERIMENTO_MEDICOS.md` + `docs/figuras/t14-medicos.svg`. 54 pruebas pasan. `npm run build` compila.
- Hallazgo para el póster: el cumplimiento del Triage II no pasa del ~96 % ni con 20 médicos; el límite es la **admisión** (2 auxiliares), no los médicos. Con 4 médicos el abandono IV–V llega a ~49 %.

A medias: nada.

Siguiente paso: T05 (escena) sigue sin empezar y es el camino crítico de la Meta A. Claude: T15 (Welch).

Notas:
- CRN está sincronizado solo en parte: los tiempos de servicio se toman al empezar cada atención, y el orden cambia con el número de médicos. Si se quiere más reducción de varianza en la espera del Triage II, muestrear los tiempos de cada paciente al llegar (cambia las trayectorias; habría que regenerar `VALIDACION.md` y el mock).
- `.claude/launch.json` (local, sin subir) arranca `npm run dev` en el panel de vista previa de Claude.

Preguntas para el autor: fecha exacta del final de corte. ¿Probar con 3 auxiliares de admisión en un experimento aparte?

## 2026-11-22 · Claude · main (rama feat/T05-escena, ya fusionada)
Hecho:
- T05 (la tomó Claude por decisión del autor). Tres piezas en `src/render`:
  - `layout.ts`: grilla 26×16, proyección `iso()`, posición de cada puesto (`stationPos('doctor-3')`), sillas / filas / camillas (`slotPos`), puntos de zona (`zoneAnchor`) y rutas fijas por el pasillo central (`route`, `along`). Sin Phaser.
  - `playback.ts`: `Playback` consume `SimEvent` (`push`, `advance(t)`) y da la posición de cada paciente (`position(f, t, snap)`). Sin Phaser, con 4 pruebas en `tests/render` (nadie comparte silla, MOVE dura exactamente `duration`, nada se mueve entre eventos).
  - `scene.ts`: `HospitalScene` (Phaser Graphics, sin imágenes) + `Driver`. `MockDriver` reproduce el mock en bucle. Puestos por encima de la capacidad salen en gris. Cámara: arrastrar y rueda.
- `main.ts`: pestañas Escena / Motor (texto) / Validación. 58 pruebas pasan, `npm run build` compila (bundle ~1,6 MB por Phaser; sin CDN, funciona sin internet).

Decisiones (fieles al modelo):
- El modelo no tiene traslado cola → puesto: con `SERVICE_START` el paciente aparece en el puesto en ese instante (no se inventa una caminata).
- `BED_ASSIGNED` llega al final del MOVE a observación: el paciente camina a la entrada de observación y luego ocupa su cama.
- `TRANSFER_START`: el paciente y la ambulancia desaparecen. **El regreso de la ambulancia no emite evento**: en el mock no vuelve a aparecer. En T06 hay que leerlo de `snapshot().ambulances.busy`.

Siguiente paso: T06 (conectar al motor en vivo): crear un `LiveDriver` que implemente `Driver` (`ed.step(t)`, `pb.push(ed.drainEvents())`, `pb.advance(t)`) y construir `Playback` con `ed.snapshot()`. T07/T08/T12 ya no están bloqueadas.

Preguntas para el autor: ¿T06 la hago yo (Claude) o Codex? Fecha exacta del final de corte.

## 2026-11-22 · Claude · main (rama feat/T06-en-vivo, ya fusionada)
Hecho:
- T06. `src/render/drivers.ts` (sin Phaser): interfaz `Driver`, `LiveDriver(ed)` y `MockDriver` (movido desde `scene.ts`). `LiveDriver.tick(dt)`: `ed.step(t)` → `pb.push(ed.drainEvents())` → `pb.advance(t)`; un cuadro largo se limita a 0,25 s reales.
- Ambulancias: su regreso no emite evento, así que `LiveDriver` lee qué ambulancias están fuera del recurso. Para eso agregué `Resource.isFree(id)` (solo lectura) en `src/engine/resource.ts`. El contrato de eventos no cambió.
- `main.ts`: un solo motor alimenta la escena y la pestaña "Motor (texto)". Controles compartidos: pausa, ×1/×60/×120/×600 y accidente masivo. `?mock` en la URL reproduce el mock.
- `tests/render/live.test.ts`: 10 h simuladas a ×600, con accidente masivo y cambio de médicos; en 120 comparaciones la escena coincide con `snapshot()` (pacientes, puestos, ambulancias fuera, capacidad). 60 pruebas pasan, `npm run build` compila.

Siguiente paso: T07 (panel con deslizadores, `src/ui`): usa `driver.ed.setCapacity(...)` / `setArrivalRate(...)`; la escena ya reacciona a `PARAM_CHANGE` (puestos en gris). T08 tooltips: `driver.pb.figures` + `ed.snapshot()`.

Preguntas para el autor: ¿T07 la hago yo o Codex? Fecha exacta del final de corte.

## 2026-11-22 · Claude · main (rama feat/T07-panel, ya fusionada)
Hecho:
- T07 (la tomó Claude por decisión del autor). `src/ui/panel.ts` → `mountPanel(root, liveDriver, makeEd)`, a la derecha de la escena:
  - Deslizadores λ (1–30/h), médicos ≤ 8, triage ≤ 3, admisión ≤ 3, camas ≤ 20, ambulancias ≤ 3 → `ed.setArrivalRate` / `ed.setCapacity`. La escena reacciona por `PARAM_CHANGE`.
  - Selector de modo: crea un motor nuevo (`makeEd`) y lo carga con `LiveDriver.load(ed)` (nuevo). El accidente masivo se desactiva en validación (el motor lo rechaza).
  - Métricas en vivo (todas las claves pedidas). **Cada cambio de parámetros llama `ed.resetStats()`**, así las métricas miden solo la configuración actual (se indica "desde HH:MM").
  - Gráfica N(t) con Chart.js: N leído de `snapshot()` cada ≥ 5 min simulados, ventana de 12 h, escalonada.
  - Aviso "EPS y clínicas ficticias · parámetros estimados con fines académicos".
- 61 pruebas pasan, `npm run build` compila.

Meta A: T05, T06, T07 y T11 hechas. Falta T08 (tooltips) como mejora y T13 (prueba sin internet, autor, martes 24).

Siguiente paso: T08 (tooltips: `driver.pb.figures` para ubicar al paciente bajo el puntero + `ed.snapshot()` para sus datos), T09 (personajes, Codex B), T12 (ambulancia animada).

Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Claude · main (rama feat/T08-tooltips, ya fusionada)
Hecho:
- T08 (la tomó Claude por decisión del autor). Al pasar el mouse por la escena:
  - **Paciente:** nombre, triage, edad, EPS, estado, tiempo en el servicio, tiempo esperando (o en cama), síntoma si lo hay.
  - **Puesto** (cubículo, ventanilla, consultorio, cama, ambulancia): a quién atiende, libre, o sin personal si supera la capacidad actual; ambulancia "regresando".
  - **Área:** ocupados / capacidad y cola (triage, admisión, consultorios), espera por médico, camas, pasillo, ocupación de clínicas.
- `src/render/hit.ts`: `hitTest(pb, punto, snap)` (paciente > puesto por la huella del mueble > área). `layout.unIso` (inversa de `iso`). `scene.ts`: `mountScene(parent, driver, onHover?)`.
- `src/ui/tooltip.ts`: `describe(hit, snapshot, epsName, ambAway)` → título y líneas. Todo sale de `ed.snapshot()` (SPEC §4.5). En `?mock` no hay tooltips (no hay snapshot).
- 65 pruebas pasan (4 nuevas en `tests/render/hit.test.ts`), `npm run build` compila.

Limitación conocida: la detección de muebles usa el piso; sobre la cara superior de un mueble alto (tabiques, ambulancias) el punto cae un poco delante y puede mostrar el área en vez del puesto.

Siguiente paso: T09 (personajes, Codex B) y T12 (ambulancia animada). Autor: T13 el martes 24 (`npm run build` + `npm run preview` sin wifi en el monitor de la feria).

Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Claude · main (revisión de T13)
Hecho:
- El autor probó la versión de la feria **sin internet** (wifi y ethernet desconectados): `npm run build` + `npm run preview` en http://localhost:4173. Claude revisó cuadro a cuadro el video de respaldo (2:44, `Videos/2026-11-22 15-45-16.mp4`, fuera del repositorio): se ven `localhost:4173` en la barra y el ícono de red de Windows sin conexión.
- Funcionan en el video: escena en vivo a ×1/×60/×120/×600, pestaña Motor (texto), pestaña Validación (16/16 dentro del IC 95 % en 0,5 s), cambio de modo, deslizadores al máximo y al mínimo (λ = 30, 1 enfermera de triage → la cola de triage crece y desborda hacia la entrada, como debe en un sistema inestable), tooltips y gráfica N(t).
- Detalle visto: al volver a la pestaña Escena, el lienzo queda en negro menos de 0,5 s hasta que Phaser detecta el nuevo tamaño. No es un fallo.
- El aviso de `vite build` "Some chunks are larger than 500 kB" es solo una advertencia (Phaser pesa ~1,7 MB); no afecta la versión sin internet.

A medias: repetir la prueba el martes 24 en el monitor externo de la feria (resolución distinta).

Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Claude · main (ramas feat/T15-welch y feat/T12-remision, ya fusionadas)
Hecho:
- T15 (Welch). `src/validation/welch.ts` (media móvil de Welch + criterio reproducible de banda ±5 %), `src/batch/welch.ts` (series por periodo con `resetStats()` al inicio de cada periodo = promedio temporal exacto del periodo), `npm run welch` → `docs/WELCH.md` + `docs/figuras/t15-welch.svg`. 1000 réplicas.
  - Validación (por hora, w = 12): L se estabiliza en 18 h y la cola del médico en 16 h, con nivel 2,251 contra 2,216 de Erlang C. Se usan 48 h, con margen.
  - Realista (NHPP): Welch sobre **promedios diarios** (el proceso es periódico). El criterio estricto marca 2 días porque la media móvil arrastra el día 1 (15 % bajo); el sesgo que deja 1 día de calentamiento en 7 días medidos es −0,24 % (2 días: −0,05 %). Se mantiene 1 día.
  - No se usa la espera media por periodo: es un cociente con sesgo (≈ 9,0 contra 11,08 min). Se usa Lq (promedio temporal).
- T12. `Playback.transfers` (TRANSFER_START → TRANSFER_END) y `ambulancePosition(amb, t)`: la ambulancia recorre una vía fija (`layout.ROAD`, `ambulanceRoute`) en exactamente la duración del traslado del motor; al llegar desaparece y reaparece en la bahía cuando el recurso queda libre (regreso sin evento, se lee del recurso). Por encima de ×120 no se dibuja (salta al destino). Tooltip: "Trasladando a X a Clínica Y".
- 69 pruebas pasan, `npm run build` compila.

Siguiente paso: T09 (personajes) y T10 (creador) siguen asignadas a Codex B. Claude: T21 (textos y figuras del póster desde VALIDACION.md, EXPERIMENTO_MEDICOS.md y WELCH.md).

Preguntas para el autor: fecha exacta del final de corte. ¿T09/T10 los hace Codex o Claude?

## 2026-11-22 · Claude · main (rama feat/T09-T10-personajes, ya fusionada)
Hecho:
- T09 (la tomó Claude por decisión del autor). `src/render/characters/pixels.ts`: personajes de 24×32 px dibujados por código como **matriz de píxeles pura** (`characterPixels`) + `paint(ctx)`. Vistas SE y NE (SW y NW por reflejo), caminar con 4 cuadros, sentado, 5 tonos de piel, 5 peinados × 6 colores de pelo, 3 tipos de camisa, colores de ropa, gorra/gafas/tapabocas, contorno de 1 px. Personal con uniforme: médico (bata blanca), enfermera de triage (verde azulado) y auxiliar de admisión.
  - Escena: texturas en caché, dirección según el vector del MOVE, cuadro de caminata según la **distancia recorrida en el MOVE** (sin MOVE no hay paso), sentados en la sala de espera, acostados en cama y camilla. Burbuja de color del triage sobre la cabeza y flecha amarilla para los visitantes. Niños más pequeños; canas a los 65+.
  - Pacientes del motor: aspecto de un catálogo determinista de 64 combinaciones (hash del id, sin Math.random) para no crear texturas sin límite.
  - Hoja de personajes para revisar: `npm run dev` → http://localhost:5173/tools/characters.html
- T10. `src/ui/creator/`: botón "Crear mi paciente" → ventana modal con nombre, edad, EPS, síntoma (12 ejemplos que cubren los 5 niveles de la Res. 5596, con advertencia de que son ilustrativos) y vestidor con vista previa de frente y de espaldas. Llama `ed.injectVisitor(...)`: el visitante **reemplaza la próxima llegada Poisson** y su nivel es el de su síntoma. Desactivado en validación.
- `window.__sim = { driver, live }` solo en `npm run dev` (no existe en el build) para inspeccionar desde la consola.
- 75 pruebas pasan, `npm run build` compila. SPEC §11.10 documenta que los personajes se generan en tiempo de ejecución, no como PNG.

Probado en el navegador: el creador inyecta a "Visitante Expo", llega a los ~6 min simulados, el triage le da nivel II (dolor en el pecho) y aparece con su gorra y la flecha amarilla.

Siguiente paso: T16 (seguir a mi personaje + tarjeta de recorrido con `DEPARTURE.data.journey`) encaja con el creador. Luego T17–T19 (Meta B) y T21 (póster).

Preguntas para el autor: fecha exacta del final de corte. Revisar en el monitor de la feria que los personajes se lean bien a esa distancia (escala ADULT = 1,6 en scene.ts).

## 2026-11-22 · Claude · main (rama feat/T16-seguir, ya fusionada)
Hecho:
- T16 (la tomó Claude por decisión del autor).
  - **Seguir:** clic (sin arrastrar) sobre un paciente → la cámara lo sigue, con un anillo amarillo bajo sus pies; si va en ambulancia, sigue a la ambulancia. Clic en el piso o arrastrar suelta la cámara. Botón "Seguir a mi paciente" (sigue al visitante más reciente) y **seguimiento automático** del paciente recién creado en cuanto llega. `HospitalScene.follow` (mountScene devuelve ahora la escena).
  - **Tarjeta de recorrido** (`src/ui/journey.ts`, `journeyCard`): se arma solo con `DEPARTURE.data.journey` cuando sale un paciente seguido o cualquier visitante. Llegada/salida, esperas de triage y admisión, **del triage al médico con veredicto de la Res. 5596** para el Triage II, puerta–médico contra el promedio de la corrida, pasillo, observación y desenlace (alta, hospitalizado, remitido a la clínica X, abandono).
  - `Playback.departures`: cola de salidas que la interfaz consume.
- 78 pruebas pasan, `npm run build` compila. Probado en el navegador: crear → seguir automáticamente → tarjeta al salir ("del triage al médico 6 min: cumplió"); clic para seguir y soltar.

Siguiente paso: Meta B restante: T17 (botón de accidente masivo + tiempo de recuperación), T18 (modo demo), T19 (mapa de la ciudad), T21 (póster).

Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Claude · main (rama feat/T17-accidente, ya fusionada)
Hecho:
- T17 (la tomó Claude por decisión del autor).
  - **Definición con rigor:** con NHPP el "nivel previo" de la SPEC no sirve (N cambia con la hora). La recuperación se mide contra el **contrafactual con CRN**: el mismo hospital con la misma semilla sin el accidente. Recuperación = primer instante (desde t0 + 30 min) en que el promedio temporal exacto de N en 30 min queda a ±10 % del contrafactual. SPEC §11.11.
  - `src/batch/recovery.ts`: `NPath` (trayectoria escalonada exacta de N(t) por eventos ARRIVAL/DEPARTURE, promedios exactos, puntos para graficar), `trackN(ed)`, `recoveryTime(...)`.
  - **En vivo:** `LiveDriver` lleva un **gemelo** (misma semilla, sin dibujar) que recibe los mismos PARAM_CHANGE y visitantes, pero no el accidente. Probado: antes del accidente la trayectoria de N es idéntica punto por punto. `LiveDriver.massCasualty(n)`, `LiveDriver.injectVisitor(info)`. El panel recibe `reload(mode)`.
  - **Interfaz:** selector de heridos (5/8/15/25) + botón; texto en vivo "Aún no se recupera… / Recuperado en X h Y min (a las HH:MM)"; en la gráfica, línea gris punteada del gemelo.
  - **Gráfica N(t) exacta:** ya no se muestrea cada 200 ms; se dibuja la trayectoria escalonada exacta (`stepped: 'after'`), con cada salto en el instante del evento.
  - **Experimento** `npm run accidente` → `docs/ACCIDENTE.md` + `docs/figuras/t17-accidente.svg` (200 réplicas, accidente el día 2 a las 10:00): **8 heridos → 4,1 h [3,8; 4,5]; 15 heridos → 6,5 h [6,2; 6,9]**; percentil 90: 7,1 h y 10,3 h; ninguna réplica sin recuperar en 48 h.
- 81 pruebas pasan, `npm run build` compila.

Siguiente paso: T18 (modo demo automático), T19 (mapa de la ciudad), T21 (póster: ya hay figuras de validación, T14, Welch y accidente).

Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Claude · main (rama feat/T18-demo, ya fusionada)
Hecho:
- T18 (la tomó Claude por decisión del autor). `src/render/demo.ts`:
  - `caption(e, nameOf, epsName)`: subtítulo de cada evento (llegada, triage con la explicación de su nivel y la Res. 5596 en el II, sala de espera por prioridad, consultorio, desenlace, pasillo, ambulancia, abandono, accidente masivo). Solo usa datos del evento.
  - `DemoMode`: tras 60 s sin uso (pointer, tecla, rueda, toque) vuelve a la pestaña Escena, pone ×60, acerca la cámara y **sigue al siguiente paciente que llega**, narrando sus eventos (3 líneas, las viejas se van). Al salir el paciente aparece su tarjeta de recorrido (T16), que se oculta sola a los 8 s, y la cámara toma al próximo en llegar (máximo 2 min reales por paciente). Cualquier uso detiene la demo y restaura velocidad, pausa y cámara.
  - `Playback.onApply` (se llama antes de aplicar cada evento) y `HospitalScene.resetCamera()` / `demoZoom()`.
  - `?demo=10` en la URL adelanta la demo a 10 s (para probar o para la feria).
- 84 pruebas pasan, `npm run build` compila. Probado en el navegador con `?demo=3`: arranca sola, sigue y narra; mover el mouse la detiene y restaura.

Siguiente paso: T19 (mapa de la ciudad con hospital y clínicas) y T21 (póster).

Preguntas para el autor: fecha exacta del final de corte. En la feria: ¿60 s de inactividad está bien o prefieres menos (`?demo=30`)?

## 2026-11-22 · Claude · main (rama feat/T19-mapa, ya fusionada)
Hecho:
- T19 (la tomó Claude por decisión del autor). `src/render/map/`:
  - `layout.ts` (`cityLayout`): cada clínica a una distancia **proporcional a su tiempo medio de viaje** del modelo (12, 18 y 25 min → 0,55 baldosas/min), en direcciones este, norte y noreste.
  - `city.ts` (`CityScene`): segunda escena del mismo juego de Phaser (empieza dormida). Hospital con cruz roja, 3 clínicas con barra y texto de ocupación en vivo (`ed.snapshot().clinics`), vías, casas y río (decorado estático). Las **ambulancias con paciente** avanzan por su vía en proporción a la duración real del traslado (`TRANSFER_START.duration`). Su `update` también llama `driver.tick`: **el motor sigue simulando en el mapa** (SPEC D2; verificado: 25 min simulados en 2,5 s a ×600).
  - Clic en el hospital → escena del hospital con fundido de 0,3 s; clic en una clínica → tarjeta (`src/ui/clinic.ts`): ocupación, remitidos recibidos en la sesión, EPS con contrato, viaje medio, demanda propia y **probabilidad de encontrarla llena con su demanda propia (Erlang B)**.
  - Botón "Ver ciudad / Ver hospital". La demo (T18) vuelve al hospital si arranca en el mapa.
- `src/render/draw.ts`: utilidades isométricas compartidas (box, boxAt, pts, shade). `Playback.listeners` (lista de oyentes; antes `onApply`), `transfers[].clinicId` y `receivedByClinic`.
- 87 pruebas pasan, `npm run build` compila.

Con esto quedan hechas todas las tareas de software de las metas A y B (T01–T19). Pendiente: T13 en el monitor externo (autor, 24 nov) y T21 (póster). T20 solo si el profesor lo pide.

Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Claude · main (relevo a Codex para visuales)
Hecho: T22 creada en `docs/TAREAS.md` y prompt completo para GPT/Codex en `docs/PROMPT_VISUALES_GPT.md` (reglas, APIs que no se deben romper, prioridades y cómo verificar).
A medias: nada de código.
Siguiente paso: **Codex: T22.** Prioridad 1: el autor solo ve 1 clínica en el mapa de la ciudad; revisar el encuadre (`fit` en `src/render/map/city.ts`) en 1366×768, 1920×1080 y anchos < 900 px. Luego, rediseño visual del mapa, la escena, los personajes y la página. Claude: T21 (póster) cuando el autor lo pida.
Preguntas para el autor: fecha exacta del final de corte.

## 2026-11-22 · Codex · feat/T22-visuales
Hecho: T22. La ciudad encuadra las siluetas y las placas de las cuatro sedes al entrar, regresar y redimensionar. Río Claro, La Pilonera y Valle Verde conservan sus distancias del modelo. La red muestra ocupación del snapshot, resalta los edificios bajo el puntero y ofrece acercar, alejar y ver todo. El registro grabado identifica la ocupación inicial que contiene. Se dibujaron por código las fachadas, calles, parque, río y ambulancias orientadas por la vía.
El plano del hospital tiene paredes, ventanas, umbral, guías de piso, mobiliario y cortinas. Personal, pacientes y muebles comparten el orden de profundidad. El arte estático se guarda en texturas y los vehículos se reutilizan. Se revisaron los personajes de 24×32, la detección bajo el puntero, los controles por grupo, el vestidor, las tarjetas y la gráfica.
Verificado en Chrome: al abrir el mapa en 1366×768, 1920×1080, 800×780 y 390×844 caben las cuatro sedes con su placa. En la versión anterior las tres clínicas también aparecieron en la primera apertura de estas pruebas, aunque los rótulos eran diminutos en móvil y volver al mapa conservaba el desplazamiento. En la nueva versión se comprobaron las tres tarjetas, el regreso al mapa tras desplazar la cámara, el cambio de ancho, un visitante y su recorrido, el accidente, la pausa, Validación (16/16), la demo con subtítulos, el mock y la hoja de personajes. A ×600, Phaser indicó unos 166 fps en una muestra corta de Chrome automatizado en este equipo.
Pasaron las 87 pruebas, TypeScript y el build. Preview funcionó desde localhost con peticiones externas bloqueadas, incluido el Worker de validación. La consola de la prueba no registró excepciones ni solicitudes externas.
A medias: publicación remota. La revisión automática rechazó tanto el envío de main como el de feat/T22-visuales y pidió autorización explícita para el destino. La implementación y las pruebas están completas. La vista interior opcional de las clínicas quedó fuera.
Siguiente paso: T13, probar el portátil y el monitor físico de la feria a dos metros el 24 de noviembre.
Preguntas para el autor: ninguna sobre T22.

## 2026-11-22 · Codex · feat/T23-recorrido-feria
Hecho: T23. El creador vincula las solicitudes FIFO con el id real de ARRIVAL. «Mi paciente» distingue espera, estado, triage y salida. El aviso de accidente separa hora, heridos, tiempo, diferencia media y recuperación según T17. En las tres tarjetas se puede entrar a la planta de camas y volver al mapa. Las plazas representan ocupación agregada; el mock indica expresamente que presenta la ocupación inicial.

La remisión normal respeta la red de la EPS, la cama disponible y la ambulancia del motor. «Seguir ambulancia» usa ×60 y restituye la velocidad al recibir DEPARTURE por remisión. El ensayo controlado usa otra instancia de EmergencyDepartment, con semilla 2026, la apariencia y el nombre creados, la clínica elegida en la red de ensayo y un desenlace de remisión. Prepara la consulta mediante eventos. La cama se reserva antes del despacho. El motor regula el tiempo de viaje y la liberación posterior del vehículo. Al salir del ensayo vuelve el reloj original, incluida su pausa, velocidad y gemelo. «Repetir demostración» prepara una instancia nueva.

«Gráficas en vivo» conserva la trayectoria exacta de N(t), identifica el accidente y su gemelo, y mantiene hasta 12 horas de muestras de colas, camas y ambulancias por motor. Señala puestos ocupados ahora, espera y cumplimiento acumulados, y falta de datos. El Worker de validación sigue siendo independiente.

Zoom reproducido en Chrome con traza de setZoom: los botones del hospital alcanzaban 3 y 0,15, la rueda limitaba a 2,5 y 0,3. ScaleManager.refresh llamaba a fit al volver a la pestaña y restauraba el zoom general (0,535 en la prueba). La cámara usa límites comunes y conserva el encuadre manual frente a resize. Se ensayaron 20 impulsos alternados de rueda/botón en cada dirección, tras arrastrar, cambiar de pestaña y redimensionar, en ciudad y hospital a 1366×768, 1920×1080 y 800×780. La ciudad conserva el encuadre de las cuatro sedes al entrar.

Verificación: 87 pruebas, TypeScript y build correctos. Dos visitantes seguidos, tres viajes con el segundo, reserva antes de partir, ocupación al llegar contrastada con snapshot, pausa, cancelación, repetición y restauración del snapshot de la corrida original. Tarjetas de las tres sedes, remisión normal del mock, demo automática con ?demo=5, cambio de modo, reinicio de indicadores y reapertura de gráficas. Preview en localhost con HTTP/HTTPS externos bloqueados: tres destinos, cero solicitudes externas, cero excepciones y validación 16/16 dentro del IC 95 %. En Chrome automatizado sobre Windows (i7-13620H, 1920×1080, ×600 con accidente) Phaser indicó 157 fps al terminar una muestra de seis segundos.

Guion del stand: 1) «Crear mi paciente» y «Enviar al hospital». 2) Esperar la llegada y pulsar «Seguir a [nombre]». 3) Elegir «Destino del ensayo» y «Demostrar traslado con mi paciente». 4) Acompañar la ambulancia y, al llegar, pulsar «Entrar a la clínica». 5) Abrir «Gráficas en vivo»; «Volver a mi corrida» devuelve la sesión principal para mostrar el accidente con su gemelo.
A medias: queda la comprobación física de legibilidad a dos metros en el monitor del stand (T13).
Siguiente paso: repetir este guion en el monitor externo el 24. Trabajo local en su rama; la publicación pendiente de T22 se gestiona aparte.
Preguntas para el autor: ninguna sobre T23.

## 2026-11-22 · Claude · feat/T24-clinicas-cafeteria (desde feat/T23-recorrido-feria, 43848dd)
Hecho: T24.
- **Interiores isométricos de las tres clínicas** (`src/render/clinic-scene.ts`, tercera escena del juego, dormida al inicio; reemplaza la cuadrícula HTML). Plantas en `src/render/companions/plans.ts`, dibujadas con la misma proyección, paleta, mobiliario y personajes del hospital (`src/render/companions/view.ts`): muros del fondo con ventanas y puertas, tabiques bajos ordenados en profundidad, jambas, recepción/enfermería, letreros en español. Río Claro: recepción, espera corta (6 sillas) y ala abierta junto a los ventanales. La Pilonera: corredor central con entrada por el muro del fondo, enfermería y habitaciones de 4 camas a ambos lados. Valle Verde: recepción y espera, dos alas alrededor de un patio con sendero, árboles y bancas. Las camas salen de la capacidad activa del motor (`params.clinics[j].beds`): cada cama dibujada es una plaza; alas seleccionables («Ala norte · camas 1–25 (25 de 50)») y «Toda la sede».
- **Ocupación**: `snapshot().clinics[j].occupied` (demanda propia + reservas). Las camas reservadas para traslados en camino (`Playback.transfers` hacia j) se pintan con tarjeta amarilla; al llegar, «Traslado recibido · nombre» sin sumar otra cama (verificado: 1 ocupada al despachar y 1 al llegar). Las plazas ocupadas se pintan en un orden fijo repartido entre alas, con un paciente genérico: el motor no guarda qué cama ocupa cada paciente y no se atribuye habitación. En `?mock`: «Registro inicial · 4 ocupadas».
- **Cafeterías**: una en el hospital (delante de triage y admisión, y 16–20, conectada con la entrada y la sala de espera; los rótulos del frente de esas áreas pasan al fondo de cada área) y una más pequeña en cada clínica, con mostrador y personal, mesas con sillas orientadas, y las dos máquinas juntas.
- **Modelo social** (`src/render/companions/social.ts`, sin DOM ni Phaser): acompañantes con llegadas, destinos (espera, visita, cafetería, banca, máquina), sillas y puestos de fila exclusivos, filas FIFO por máquina, despacho de 0,6 min y salidas. Reloj propio que avanza con el reloj de la sesión (la pausa lo detiene) y generador sfc32 propio (`new RngFactory(seed).stream('acompanantes:<sede>')`, otra instancia: no consume los aleatorios del hospital). Máximo 8 acompañantes en el hospital y 6–7 por clínica, más Mi acompañante. Recorridos por una red de nodos que pasa por las puertas (prueba: ningún tramo cruza una pared). No emite SimEvent ni toca N(t), triage, camas, recursos, remisiones, gemelo ni validación.
- **Máquinas** (`src/ui/vending.ts`): clic o toque en la máquina (resalta al pasar el puntero) o botones «Máquina de refrescos» / «Máquina de papas» en la cabecera del plano (hospital o clínica). Códigos A1 Agua, A2 Refresco de cola, A3 Limonada; B1 Papas clásicas, B2 Papas de limón, B3 Papas picantes. Teclado físico o en pantalla, minúsculas y espacios aceptados, «Confirmar código» crea UNA solicitud para Mi acompañante; estados «En camino», «En fila (n personas antes)», «La máquina está despachando», «Mi acompañante recibió Limonada · A3». Compra simulada y gratuita, existencias ilimitadas. Código vacío, inexistente o de la otra máquina: mensaje claro. Doble clic / Enter doble: no duplica. Otra máquina u otra sede con solicitud en curso: la bloquea y dice dónde está. Pausa: el estado queda congelado y lo indica. Cerrar (botón o Escape, desde cualquier foco): avisa «la solicitud sigue en curso» o «sin comprar» y devuelve el foco. «Cancelar solicitud» mientras va en camino o en fila. Cambiar de sede o volver al mapa conserva sede, máquina y producto.
- **Sesiones**: un modelo social por driver (corrida principal, cada ensayo, registro grabado). El ensayo y «Repetir demostración» crean el suyo y al salir se descarta; la corrida principal recupera su pedido, reloj, pausa y velocidad (verificado). Una sola escena despierta a la vez; entrar a una clínica cancela fundidos pendientes (había una carrera que despertaba el mapa a la vez que la clínica). La demo por inactividad se suspende con la máquina abierta o un pedido en curso.

Verificado:
- `npm test`: 96 pruebas (9 nuevas en `tests/render/companions.test.ts`), `npx tsc --noEmit`, `npm run build`. **Prueba clave** automatizada: misma semilla 2611 y parámetros, dos corridas de 600 min a ×600, una con compras en las cuatro sedes y otra sin; registro de eventos, snapshot y métricas idénticos y con traslados.
- Navegador (Chrome 156 del panel de Claude, Windows, 16 hilos): las tres plantas desde el mapa y Valle Verde/La Pilonera tras la ambulancia del ensayo; conteos = snapshot con el reloj avanzando y tras el traslado; compra A3 con teclado físico y B2 con teclado en pantalla, B1/A1 en la máquina equivocada, vacío, doble Enter y doble clic, pausa en despacho, Escape, cambio a hospital con pedido en Valle Verde, cancelación y compra en otra sede; `?mock`; 1920×1080, 1366×768, 820×900 y 375×812 sin desbordes; rueda, +, −, Ver todo y alas.
- `npm run preview` (localhost:4173): cero solicitudes fuera de localhost, cero errores de consola, recorrido mapa → La Pilonera → Valle Verde → compra. Rendimiento a ×600 con acompañantes, panel visible a 1920×1080: 178 fps en la clínica y 177 en el hospital (monitor de alta frecuencia), peor cuadro 16,7 ms. Pendiente: medir en el portátil y el monitor de la feria (T13).
- Capturas: `docs/figuras/t24-clinica-valle-verde.jpg`, `docs/figuras/t24-maquina-refrescos.jpg`.

A medias: nada del alcance. Sin inventario (decisión: ilimitado y así lo dice el panel). La prueba en navegador no bloqueó la red a nivel de sistema; se comprobó que no hubo solicitudes externas.
Siguiente paso: integrar la rama con T23 cuando se publique; repetir el guion en el monitor físico el 24.
Dependencias clínicas: ninguna; no se tocó `src/engine`, `src/model`, `src/validation` ni `src/batch`.
Preguntas para el autor: ¿quieres inventario limitado (con «Agotado») para la feria, o basta ilimitado? Push pendiente de tu autorización.
