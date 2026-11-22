# Instrucciones para agentes de IA (Codex, Claude, otros)

Proyecto: **SimUrgencias**, simulador de eventos discretos del servicio de urgencias de un hospital de Valledupar, validado con teoría de colas y mostrado como juego isométrico en el navegador. Autor: Libni Jahzeel Torres Castro (Modelos y Simulación).

## Antes de escribir código (obligatorio)
1. Lee `docs/SPEC.md` (qué se construye y por qué; §4.4 es el contrato de eventos).
2. Lee `docs/TAREAS.md` y toma **una** tarea pendiente de tu carpeta. Márcala `en curso (<agente>, <fecha>)`.
3. Lee las últimas entradas de `docs/HANDOFF.md`.

## Reglas
- **El render solo consume el motor.** Nada en pantalla se mueve sin un evento (`SimEvent`) o sin leer `snapshot()`. Prohibidas las animaciones "de adorno" que no salgan del modelo.
- **Contrato congelado:** `src/engine/events.ts` y SPEC §4.4. No los cambies; si necesitas algo, escríbelo como pregunta en `HANDOFF.md`.
- **No toques carpetas de otro agente** (ver la columna "Carpetas" de `TAREAS.md`). `src/engine`, `src/model`, `src/validation` y `src/batch` son del agente del motor.
- **Prohibido `Math.random()`** en todo el proyecto. Usa `Rng`/`RngFactory` de `src/engine/rng.ts`.
- `src/engine` y `src/model` no importan nada del DOM ni de Phaser.
- Antes de cada commit: `npm test` y `npx tsc --noEmit` deben pasar.
- Commits pequeños y frecuentes: `T05: dibuja zona de triage`. Rama por tarea: `feat/T05-escena`.
- Textos de la interfaz y comentarios en **español**.
- Arte: todo **dibujado por código** (Phaser Graphics o sprites generados en `tools/`). No agregues imágenes de terceros sin licencia anotada en `docs/CREDITOS.md`.

## Al terminar la sesión (obligatorio, aunque quede a medias)
Agrega al final de `docs/HANDOFF.md`:
```
## <fecha> · <agente> · <rama>
Hecho: ...
A medias: ...
Siguiente paso: ...
Preguntas para <otro agente / autor>: ...
```
y actualiza el estado de la tarea en `docs/TAREAS.md`.

## Comandos
- `npm install` · `npm run dev` (http://localhost:5173) · `npm test` · `npm run report` (genera `docs/VALIDACION.md`) · `npm run experiment` (T14: genera `docs/EXPERIMENTO_MEDICOS.md` y `docs/figuras/t14-medicos.svg`) · `npm run welch` (T15: genera `docs/WELCH.md` y `docs/figuras/t15-welch.svg`, ≈ 1 min) · `npm run accidente` (T17: genera `docs/ACCIDENTE.md` y `docs/figuras/t17-accidente.svg`) · `npm run mock` (regenera `src/render/mock/events.json`) · `npm run build` + `npm run preview` (versión para la feria, sin internet).
