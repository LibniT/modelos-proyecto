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
| T05 | **Escena isométrica dibujada por código** que reproduce `src/render/mock/events.json` | Claude | `src/render` | hecha (Claude, 22 nov) |
| T06 | Conectar la escena al motor en vivo (`ed.step`, `drainEvents`, `snapshot`) + controles pausa / ×1 / ×60 / ×600 | Claude | `src/render`, `src/main.ts` | hecha (Claude, 22 nov) |
| T07 | Panel: deslizadores (λ, médicos, triage, admisión, camas, ambulancias), selector de modo, métricas en vivo, gráfica N(t) con Chart.js | Claude | `src/ui` | hecha (Claude, 22 nov) |
| T08 | Tooltips al pasar el mouse (pacientes y recursos) | Claude | `src/render`, `src/ui` | hecha (Claude, 22 nov) |
| T09 | Generador de personajes por código (24×32 px, paleta, 4 direcciones, quieto / caminar / sentado / acostado) | Claude | `tools/`, `src/render/characters`, `assets/generated` | hecha (Claude, 22 nov) |
| T10 | Creador simple: nombre, edad, EPS, síntoma, colores → `ed.injectVisitor(...)` | Claude | `src/ui/creator` | hecha (Claude, 22 nov) |
| T11 | Pestaña "Validación" en la UI (ya existe la base en `src/main.ts`): tabla + botón, con Worker | Claude | `src/ui/validation` | hecha (Claude, 22 nov) |
| T12 | Remisión visible: ambulancia sale de la escena con el paciente (TRANSFER_START/END) | Claude | `src/render` | hecha (Claude, 22 nov) |
| T13 | Prueba final sin internet con el monitor externo + video de respaldo | Autor | — | hecha en el PC del autor (22 nov: preview sin internet + video de 2:44); repetir en el monitor externo el 24 |

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
| T14 | Experimento de escenarios con números aleatorios comunes: 4, 5, 6, 7 médicos → espera Triage II y % cumplimiento, con IC (gráfica para póster/informe) | Claude | `src/batch`, `tools/`, `docs/` | hecha (Claude, 22 nov) |
| T15 | Gráfica de Welch para justificar el calentamiento | Claude | `tools/`, `docs/` | hecha (Claude, 22 nov) |
| T16 | Seguir a mi personaje + tarjeta de recorrido (`DEPARTURE.data.journey`) | Claude | `src/render`, `src/ui` | hecha (Claude, 22 nov) |
| T17 | Botón accidente masivo en la UI + tiempo de recuperación | Claude | `src/ui`, `src/batch`, `tools/` | hecha (Claude, 22 nov) |
| T18 | Modo demo automático (60 s sin uso → recorrido de cámara + subtítulos por eventos) | Claude | `src/render` | hecha (Claude, 22 nov) |
| T19 | Mapa de la ciudad con hospital y 3 clínicas (ocupación en vivo, ambulancias) | Claude | `src/render/map` | hecha (Claude, 22 nov) |
| T20 | Notebook SimPy de contraste (solo si el profesor lo pide) | Claude | `notebooks/` | pendiente |
| T21 | Póster / informe: textos y figuras desde `docs/VALIDACION.md` y T14 | Autor + Claude | `docs/` | pendiente |
| T22 | **Mejorar visuales**: arreglar el encuadre del mapa (hoy el autor solo ve 1 clínica), rediseñar mapa y escena del hospital (paredes, muebles, profundidad), personajes e interfaz. Instrucciones completas en `docs/PROMPT_VISUALES_GPT.md` | Codex (GPT) | `src/render`, `src/ui`, `src/main.ts`, `tools/` | hecha (Codex, 22 nov) |
| T23 | Recorrido de feria con visitante, remisión controlada, interiores de clínicas, gráficas en vivo y límites de cámara | Codex | `src/render`, `src/ui`, `src/main.ts`, `tools/` | hecha (Codex, 22 nov) |
| T24 | Interiores isométricos de las tres clínicas (camas del motor, alas), cafeterías con acompañantes (modelo social propio, fuera del motor) y máquinas de refrescos y papas por código | Claude | `src/render`, `src/ui`, `src/main.ts`, `tests/render` | hecha (Claude, 22 nov) |
| T25 | **Red hospitalaria real de Valledupar** (escenario adicional; los escenarios de validación y realista no cambian): dataset trazable de sedes (REPS + informe de investigación), mapa OSM offline dibujado en `CityScene`, rutas viales precalculadas, remisión por compatibilidad clínica + capacidad simulada + ruta, y una remisión completa visible. Fuente: `SimUrgencias_prompt_mapa_y_referencias.pdf` y el informe hospitalario del 24 nov | Claude | `src/model`, `src/render/map`, `src/ui`, `src/main.ts`, `tools/`, `tests`, `docs/` | hecha (Claude, 24 nov) |
| T26 | **Red Valledupar, parte 2 (P1 del PDF)**: indicadores de la red en «Gráficas en vivo», seguimiento de la remisión en 4 pasos (Atención → Selección → Traslado → Recepción), filtro del mapa por condición, ficha completa de institución y verificación de sedes | Claude | `src/ui`, `src/render/map`, `src/main.ts`, `src/model` (solo datos de la remisión), `tests`, `docs/` | hecha (Claude, 24 nov) |
| T27 | **Red Valledupar, modelo**: camas por tipo (UCI adulto/pediátrica/neonatal, quemados) por sede con capacidad documentada, aceptación probabilística del CRUE con nueva coordinación, experimento con réplicas y CRN (`npm run red-experimento`) | Claude | `src/model`, `src/batch`, `src/ui`, `tools/`, `tests`, `docs/` | hecha (Claude, 24 nov) |
| T28 | **Fase 2 · rutas desde cualquier punto**: grafo vial OSM exportado (`grafo.json`, componente fuertemente conexa), `router.ts` (validación del punto, ajuste al segmento, Dijkstra por tiempo a varios destinos, sentidos, velocidades por clase y 3 escenarios de tráfico supuestos) | Claude | `tools/`, `src/model/valledupar`, `tests` | hecha (Claude, 24 nov) |
| T29 | **Fase 2 · EPS reales**: EPS de Valledupar con estado y fuente, matriz EPS–IPS con estado de la relación, normativa de urgencias | Claude | `src/model/valledupar`, `docs/` | hecha (Claude, 24 nov) |
| T30 | **Fase 2 · paciente prehospitalario en el motor**: `injectPrehospital` (despacho, escena, traslado, ingreso), grupo de ambulancias prehospitalario, selector con rutas dinámicas, EPS (≤ 15 min extra para estables; críticos sin EPS) y 3 políticas | Claude | `src/model`, `tests` | hecha (Claude, 24 nov) |
| T31 | **Fase 2 · paciente en el mapa**: muñeco arrastrable + clic, formulario, alternativas, ambulancia con geometría dinámica | Claude | `src/render/map`, `src/ui`, `src/main.ts` | hecha (Claude, 24 nov) |
| T32 | **Fase 2 · rediseño**: vista Ciudad con el mapa protagonista, ficha con pestañas, seguimiento del paciente | Claude | `src/ui`, `src/main.ts`, CSS | hecha (Claude, 24 nov) |
| T33 | **Fase 2 · experimentos** A (políticas) y B (tráfico) con réplicas y CRN | Claude | `src/batch`, `tools/`, `docs/` | hecha (Claude, 24 nov) |
| T34 | **Fase 2 · P1 restante**: historial completo, perfil horario de tráfico, experimentos C/D | Claude | varias | parcial (Claude, 24 nov): historial de pacientes del mapa, selector de tráfico y experimentos C/D hechos; perfil horario del tráfico y varias bases de ambulancias pendientes (sin datos con fuente) |
| T35 | Arreglos de legibilidad para la feria: panel del paciente sin textos cortados; tarjeta de recorrido sin tapar la ficha de la clínica | Claude | `src/ui` | hecha (Claude, 25 nov) |
| T36 | Interiores interactivos: clic en una cama dice quién la ocupa (pacientes con nombre del motor: remitidos y del mapa); acompañantes de la cafetería del hospital ligados a pacientes reales | Claude | `src/model/ed.ts` (solo lectura nueva), `src/render`, `src/ui` | hecha (Claude, 25 nov) |
| T37 | Ajustes del ensayo: la máquina se cierra al cambiar de vista; franja de remisión minimizable; «Crear mi paciente» en pantalla completa; elegir sexo en el creador; arrastre del muñeco solo con la figura y el punto de caída | Claude | `src/ui`, `src/main.ts` | hecha (Claude, 25 nov) |
| T38 | Más peinados (16) y ropa (9) por sexo, con accesorios integrados (diadema, lazo, aretes, barba, bigote, corbata); el creador muestra a cada sexo su catálogo | Claude | `src/render/characters`, `src/ui/creator` | hecha (Claude, 25 nov) |

### Detalle T25 (red Valledupar)
- **Corte:** miércoles 25 nov a las 20:00. Si P0 no pasa `npm test`, `npx tsc --noEmit` y `npm run preview` sin red (con recarga), la feria se hace con la versión de T24 (`main` en 0326196).
- **P0:** F1 dataset trazable · F2 calles OSM y rutas por Dijkstra en `tools/` (velocidad de ambulancia = supuesto explícito) · F3 `src/model/referral.ts` (AD elegible; C solo si no hay AD con cupo; ER/NH/SI y capacidad no documentada se descartan con motivo; sin destino → pasillo, reevaluación y remisión fuera de la red tras la espera máxima) · F4 mapa real en `CityScene` · F5 pruebas.
- **Aceptación:** registro de eventos idéntico con la misma semilla en los escenarios originales; pruebas de destino incompatible, saturación, capacidad desconocida, sin ambulancia, sin ruta, llegada y liberación, y conservación de pacientes; atribución OSM visible; aviso «escenario académico, ocupación simulada».
- **Estado (24 nov):** F0–F4 hechas. La autora confirmó que funciona sin internet.
- **F6 (hecha 24 nov):**
  1. **Entrar a las sedes de la red.** Reutilizar las plantas isométricas de T24 (Río Claro, La Pilonera, Valle Verde) como «planta representativa» de cada sede, con su nombre real. Se dibujan hasta 50 camas; si la sede tiene más, cada cama dibujada representa varias y la ocupación se escala (se dice en pantalla). Aclarar que no reproduce la arquitectura real.
  2. **Pantalla completa** de la escena (hospital, mapa o interior): botón y tecla F, Esc para salir (API Fullscreen del navegador; no se activa mientras se escribe un código en la máquina).
  3. **Vistas del mapa:** «Mapa» (actual), «Mapa con ríos y parques» (capas OSM de agua y zonas verdes + nombres de las vías principales) y «Satélite» (imagen Sentinel-2 cloudless de EOX, 10 m por píxel, CC BY-NC-SA 4.0, unas 40 teselas guardadas en el repositorio). No se pueden empaquetar las imágenes de Google ni de Esri: sus términos prohíben el uso sin conexión; por eso el satélite será menos nítido que Google Maps al acercar.
- **F5 (hecha 24 nov, antes de F6 por decisión de la autora):** preview sin red con recarga (solo archivos locales, sin errores) y `docs/GUIA_DEMO_RED.md`. Al terminar F6: repetir la prueba con las vistas nuevas, actualizar la guía y tomar capturas.
- **Hospital de origen:** «Hospital de origen (simulado)» en las coordenadas del HRPL, salvo que la autora decida otra cosa.
