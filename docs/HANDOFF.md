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
