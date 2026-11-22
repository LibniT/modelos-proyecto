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
