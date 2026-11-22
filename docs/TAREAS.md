# Tareas — SimUrgencias

Cada tarea es pequeña, tiene dueño sugerido, carpetas permitidas y un **criterio de aceptación verificable**. Cualquier IA puede tomar la siguiente pendiente de su carpeta (ver `AGENTS.md`).

Estados: `pendiente` · `en curso (agente, fecha)` · `hecha` · `bloqueada (por Txx)`.

## Dos metas

| Meta | Fecha | Condición |
|---|---|---|
| **A. ExpoSoftware** | jueves 26 nov | Se va solo si el **martes 24 en la noche** T05–T08 y T11 funcionan sin errores en `npm run preview` sin internet. Si no, no se va; no es un fracaso. |
| **B. Final de corte** | ≈ 2 dic (**confirmar fecha exacta**) | Versión completa: Meta A + tareas de la sección B. |

---

## Meta A — imprescindible

| ID | Tarea | Agente sugerido | Carpetas | Estado |
|---|---|---|---|---|
| T01 | Estructura del proyecto, Vite + TS + Vitest, docs de coordinación | Claude | raíz, `docs/` | hecha (Claude, 22 nov) |
| T02 | Núcleo del motor: sfc32 con flujos, heap, simulador, distribuciones (Exp, Gamma, Lognormal, Triangular) + pruebas KS | Claude | `src/engine`, `tests` | hecha (Claude, 22 nov) |
| T03 | Modelo de urgencias: red triage → admisión → médico (prioridad) → observación / alta / remisión, pasillo, ambulancias, clínicas, abandono, NHPP, visitantes, accidente masivo, eventos y snapshot | Claude | `src/model`, `tests` | hecha (Claude, 22 nov) |
| T04 | Validación: Erlang C, Cobham, Erlang B, Little, IC t-Student, réplicas, `npm run report` | Claude | `src/validation`, `src/batch`, `tests` | hecha (Claude, 22 nov) |
| T05 | **Escena isométrica dibujada por código** que reproduce `src/render/mock/events.json` | Codex A | `src/render` | pendiente |
| T06 | Conectar la escena al motor en vivo (`ed.step`, `drainEvents`, `snapshot`) + controles pausa / ×1 / ×60 / ×600 | Codex A o Claude | `src/render`, `src/main.ts` | bloqueada (por T05) |
| T07 | Panel: deslizadores (λ, médicos, triage, admisión, camas, ambulancias), selector de modo, métricas en vivo, gráfica N(t) con Chart.js | Codex A | `src/ui` | pendiente |
| T08 | Tooltips al pasar el mouse (pacientes y recursos) | Codex A | `src/render`, `src/ui` | bloqueada (por T05) |
| T09 | Generador de personajes por código (24×32 px, paleta, 4 direcciones, quieto / caminar / sentado / acostado) | Codex B | `tools/`, `src/render/characters`, `assets/generated` | pendiente |
| T10 | Creador simple: nombre, edad, EPS, síntoma, colores → `ed.injectVisitor(...)` | Codex B | `src/ui/creator` | pendiente |
| T11 | Pestaña "Validación" en la UI (ya existe la base en `src/main.ts`): tabla + botón, con Worker | Claude | `src/ui/validation` | hecha (Claude, 22 nov) |
| T12 | Remisión visible: ambulancia sale de la escena con el paciente (TRANSFER_START/END) | Codex A | `src/render` | bloqueada (por T05) |
| T13 | Prueba final sin internet con el monitor externo + video de respaldo | Autor | — | pendiente (24 nov) |

### Detalle T05 (escena) — lo que necesita saber el agente
- Lee SPEC §4.4 y `src/engine/events.ts`. Reproduce `src/render/mock/events.json` (`initial` = snapshot inicial, `events` = lista ordenada).
- Reloj del render: `t_render += dt_real × velocidad / 60` (min); procesa eventos con `t ≤ t_render`.
- `MOVE` → el sprite camina de `from` a `to` por una **ruta fija de puntos de paso** en exactamente `duration` minutos simulados. Por encima de ×120, salta al destino.
- `resourceId` dice el puesto: `triage-0`, `admission-1`, `doctor-3`, `bed-12`, `amb-0`. Cada puesto es un lugar fijo dibujado.
- Pacientes provisionales: rombo o círculo con el **color del triage** (sin triage: gris; I rojo, II naranja, III amarillo, IV verde, V azul). T09 los reemplaza por sprites.
- Disposición sugerida (grilla isométrica 26×16, tile 64×32): entrada (2,13); ambulancias (1,3); triage: 3 cubículos en x=6; admisión: 3 ventanillas en x=10; sala de espera: 20 sillas en x=12–16; boxes médicos: 8 en la fila y=3; pasillo con camillas en x=17–18; observación: 20 camas en x=19–24; salida (0,8).
- **Aceptación:** `npm run dev` muestra el hospital dibujado por código; a ×60 los pacientes del mock aparecen, hacen fila, ocupan puestos y salen siguiendo los eventos; nada se mueve sin evento; sin errores en consola.

### Detalle T07 (panel)
- Límites de los deslizadores = puestos dibujados: médicos ≤ 8, triage ≤ 3, admisión ≤ 3, camas ≤ 20, ambulancias ≤ 3. Usa `ed.setCapacity(...)` y `ed.setArrivalRate(...)`.
- Métricas (claves de `ed.metrics()`): `triageII.compliance`, `doctor.Wq`, `doctor.Wq.L1..L5`, `doorToDoctor`, `doctor.rho`, `obs.occupancy`, `hallway.L`, `renege.frac`, `remit.complexity`, `remit.capacity`, `amb.rho`.
- Aviso visible: "EPS y clínicas ficticias · parámetros estimados con fines académicos".

---

## Meta B — final de corte

| ID | Tarea | Agente sugerido | Carpetas | Estado |
|---|---|---|---|---|
| T14 | Experimento de escenarios con números aleatorios comunes: 4, 5, 6, 7 médicos → espera Triage II y % cumplimiento, con IC (gráfica para póster/informe) | Claude | `src/batch`, `tools/`, `docs/` | pendiente |
| T15 | Gráfica de Welch para justificar el calentamiento | Claude | `tools/`, `docs/` | pendiente |
| T16 | Seguir a mi personaje + tarjeta de recorrido (`DEPARTURE.data.journey`) | Codex B | `src/render`, `src/ui` | pendiente |
| T17 | Botón accidente masivo en la UI + tiempo de recuperación | Codex A | `src/ui` | pendiente |
| T18 | Modo demo automático (60 s sin uso → recorrido de cámara + subtítulos por eventos) | Codex A | `src/render` | pendiente |
| T19 | Mapa de la ciudad con hospital y 3 clínicas (ocupación en vivo, ambulancias) | Codex B | `src/render/map` | pendiente |
| T20 | Notebook SimPy de contraste (solo si el profesor lo pide) | Claude | `notebooks/` | pendiente |
| T21 | Póster / informe: textos y figuras desde `docs/VALIDACION.md` y T14 | Autor + Claude | `docs/` | pendiente |
