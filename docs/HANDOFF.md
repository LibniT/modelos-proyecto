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
