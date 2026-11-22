# SimUrgencias — Especificación (SPEC)

> Versión 1.1 · 22 de noviembre de 2026 (ver §11: cambios que prevalecen sobre el resto) · Autor: Libni Jahzeel Torres Castro
> Resultado de la entrevista de diseño (grill-me). Este documento es la **fuente de verdad** para todas las sesiones de IA (Claude, Codex) que trabajen en el repositorio. Si algo del código contradice este archivo, gana este archivo hasta que se actualice aquí.

---

## 0. Resumen

SimUrgencias es un **simulador de eventos discretos (SED)** del servicio de urgencias de un hospital de Valledupar, **validado contra teoría de colas** y presentado como un **juego isométrico en pixel art** que corre en el navegador sin internet. Se expone en **ExpoSoftware el jueves 26 de noviembre de 2026** (Universidad Popular del Cesar), con póster en la plantilla institucional.

Pregunta que responde: *¿cuántos médicos, enfermeras de triage y camas de observación necesita el servicio para cumplir la Resolución 5596 de 2015 (Triage II atendido en ≤ 30 min) sin remitir a demasiados pacientes?*

Regla de oro: **todo lo que se ve en pantalla sale del motor de simulación**. La animación es una réplica del modelo, nunca un adorno.

---

## 1. Registro de decisiones

### A. Alcance y restricciones
| # | Decisión |
|---|---|
| A1 | Fecha: jueves 26 nov 2026. Hoy 11 nov → 15 días. ~5 h/día del autor (~75 h) + IAs en paralelo. |
| A2 | Equipo: 1 persona (nivel intermedio, sabe Git, no dibuja pixel art). |
| A3 | El profesor no exige tecnología. Aprobación de la idea: 12 nov. Se lleva la propuesta de una página. |
| A4 | Presentación en el portátil del autor + monitor externo, **100 % offline**, interacción con mouse. |
| A5 | Entregable extra: **póster** con plantilla institucional (ver §10). |

### B. Modelo
| # | Decisión |
|---|---|
| B1 | Red: llegada → **triage** → **admisión (verificación EPS)** → **médico** → observación / alta / hospitalización / remisión. El triage va **antes** de la admisión (Res. 5596, art. 6 parágrafo). Triage I salta la admisión. |
| B2 | Laboratorios e imágenes **no** son estación; su efecto va dentro del tiempo de consulta. |
| B3 | Cola del médico: **prioridad por nivel de triage, sin interrupción**; FIFO dentro de cada nivel. Triage y admisión: FIFO. |
| B4 | **Dos modos**: *validación* (todo exponencial, fórmulas exactas) y *realista* (Lognormal/Gamma/Triangular por media y CV, parámetros etiquetados "estimados" + análisis de sensibilidad). |
| B5 | Llegadas: λ constante (validación) y perfil horario NHPP por thinning (realista; el deslizador es multiplicador del perfil). |
| B6 | Abandono: solo Triage IV y V, mientras esperan médico, paciencia exponencial media ≈ 120 min. **Apagado en validación.** |
| B7 | Traslados internos = retardos deterministas cortos (0,5–1 min) **dentro del modelo** (estaciones de servidores infinitos). |
| B8 | Reloj en minutos. Velocidades ×1, ×60 (defecto), ×600 y pausa. Por encima de ×120 los sprites saltan en vez de caminar. |
| B9 | Estacionario: réplicas con eliminación, calentamiento por **gráfica de Welch**, **n = 30** réplicas de 7 días, IC 95 % t-Student. NHPP: 1 día de calentamiento + días medidos, 30 réplicas. Comparación de escenarios con **números aleatorios comunes**. |
| B10 | Validación: Erlang C por estación, Cobham por nivel, Little, Erlang B, KS a generadores. |
| B11 | La escena animada es **una réplica** con semilla visible. Las métricas con IC salen del modo batch. |

### C. EPS y remisión
| # | Decisión |
|---|---|
| C1 | Disparadores de remisión: (i) **complejidad** (probabilidad p_r tras la consulta) y (ii) **capacidad** (requiere cama y las K están ocupadas). Nunca se niega la atención inicial. |
| C2 | Quien espera traslado queda **en camilla en el pasillo**, sin bloquear al médico. |
| C3 | EPS y clínicas **ficticias**, con proporciones de afiliación inspiradas en las reales y aviso "datos estimados con fines académicos". Hospital: "Hospital Regional (inspirado en el HRPL)". |
| C4 | Clínica destino: dentro de la red de la EPS, con cama libre, menor tiempo de traslado; empate → menor ocupación. |
| C5 | Cada clínica: K_j camas + **demanda de fondo propia** λ_j. |
| C6 | Ambulancias = recurso limitado (defecto 2); viaje Lognormal media ≈ 20 min ida. |
| C7 | Nadie con cupo → espera en pasillo y se reintenta en cada liberación de cama. Métrica: "tiempo esperando remisión". |

### D–F. Mapa, personajes, interacción
| # | Decisión |
|---|---|
| D1 | Mapa = una imagen isométrica con hospital + 3 clínicas, indicadores de ocupación en vivo, ambulancias movidas por el motor. Clic hospital → escena (fundido 0,3 s); clic clínica → tarjeta. **Deseable.** |
| D2 | El motor simula todo siempre; las escenas son vistas. |
| D3 | Hospital = **un mapa isométrico** con zonas (entrada/ambulancia, triage, admisión + sala de espera, boxes, observación, pasillo) y cámara con paneo y zoom. |
| D4 | Los deslizadores de la escena tienen como máximo los puestos dibujados (médicos ≤ 8, camas obs ≤ 20, triage ≤ 3, admisión ≤ 3). El batch acepta cualquier valor. Zona de desborde si no alcanzan las sillas. |
| E1 | Creador: nombre, rango de edad, EPS, **síntoma** (lista ~10 → nivel de triage) y vestidor. |
| E2 | El paciente creado **reemplaza a la siguiente llegada Poisson** (no se suma). Inyección desactivada en validación. |
| E3 | Botón "Seguir a mi personaje" + **tarjeta de recorrido** al final (Importante). |
| F1 | Hover sobre pacientes (nombre, EPS, triage, estado, estación, espera) y recursos (estado, paciente, utilización). Clic = fijar o seguir. |
| F2 | Accidente masivo (N pacientes I–III a la vez): **Importante**, solo modo realista, se mide tiempo de recuperación. |
| F3 | Panel con métricas en vivo (ver §2.6) + Chart.js empaquetado. Todo en español. |
| F4 | Una ventana (escena + panel plegable + creador modal) en el MVP; dos ventanas con `BroadcastChannel` = Deseable. |
| F5 | Modo demo tras 60 s sin uso: recorrido de cámara + subtítulos generados por eventos. **Importante.** |

### G–H. Arte y tecnología
| # | Decisión |
|---|---|
| G1 | Packs comprados: **silverteacup** (hospital isométrico, ≥ 2 USD) y **zephilie** (objetos médicos + fachadas, ≥ 3 USD, CC BY 4.0). PNG **fuera de Git**; repositorio **privado**; créditos en "Acerca de". |
| G2 | Personajes **generados por código** (~24×32 px, matrices + paleta), 2 direcciones dibujadas + reflejo = 4; animaciones quieto, caminar (4 cuadros), sentado, acostado. |
| G3 | Tile 64×32 a ×2 con `pixelArt: true` — **pendiente de prueba visual** con los packs reales. |
| G4 | Desarrollo con **cajas grises** primero; el arte nunca bloquea el motor. |
| H1 | **Todo en el navegador, TypeScript**. Motor SED propio, Phaser 3, Web Worker para batch, Vite. |
| H2 | Motor por eventos (heap binario), generador **sfc32** con semilla, un flujo por fuente, sin dependencias del DOM. |
| H3 | Movimiento por **rutas fijas de puntos de paso**; sin A*. |
| H4 | Vitest + ESLint + Prettier. Repositorio privado en GitHub; etiqueta por hito y `v1.0-expo`. |
| H5 | Feria: `vite build` + `vite preview` en el portátil; copia en USB y **video de respaldo**. |
| H6 | Si el profesor pide Python: notebook SimPy (~150 líneas) que replica un escenario y debe coincidir dentro del IC. |

---

## 2. Modelo matemático

### 2.1 Red de colas

```
            ┌──────────── Triage I (salta admisión) ─────────────┐
            │                                                     ▼
Llegada ─▶ Triage ─▶ Admisión EPS ─▶ [cola prioridad I..V] ─▶ Médico
 λ(t)      c_T,FIFO   c_A,FIFO                                    │
                                     ┌──────────────┬────────────┼──────────────┐
                                     ▼              ▼            ▼              ▼
                               remisión (p_r)  observación   alta (p_a)   hospitalización
                                     │          K camas                   (sale del modelo)
                                     ▼              │ sin cama
                                  Pasillo ◀─────────┘
                                     │  ambulancia (c_amb)
                                     ▼
                              Clínica de la red EPS (K_j camas + λ_j propia)
```

### 2.2 Recursos (valores por defecto; todos editables)
| Recurso | Símbolo | Defecto | Máx. en escena |
|---|---|---|---|
| Enfermeras de triage | c_T | 2 | 3 |
| Auxiliares de admisión | c_A | 2 | 3 |
| Médicos (cada uno con su box) | c_M | 5 | 8 |
| Camas de observación | K | 18 | 20 |
| Ambulancias | c_amb | 2 | 3 |
| Clínicas | — | 3 (K_j = 12, 16, 20) | — |

### 2.3 Parámetros (⚠ estimados — rangos de la literatura, ver §8)
| Componente | Validación | Realista | Rango bibliográfico |
|---|---|---|---|
| Llegadas | Poisson λ = 12/h | NHPP: noche ≈ 6/h, pico ≈ 18/h | 4–10/h noche, 15–30/h pico |
| Mezcla de triage I/II/III/IV/V | 2/13/45/30/10 % | igual | I 1–2,5 %, II 10–18 %, III 40–55 %, IV+V 25–40 % |
| Triage | Exp, media 4 min | Lognormal media 4, CV 0,4 | 2–6 min |
| Admisión | Exp, media 5 min | Triangular (3, 5, 10) | 3–10 min |
| Consulta médica | Exp, media 20 min (igual para todos los niveles) | Gamma media 20, CV 0,6 (opcional por nivel) | 12–35 min |
| Observación | Exp, media 6 h | Lognormal media 6 h, CV 1,0 | 4–72 h |
| Traslado ambulancia (ida) | Exp media 20 min | Lognormal media 20, CV 0,5 | estimado |
| Abandono (IV, V) | apagado | Exp, media 120 min | 2–10 % de abandono |
| Desenlace tras médico | alta 70 %, observación 20 %, hospitalización 5 %, remisión p_r 5 % | igual (dependencia por nivel = por investigar) | alta 65–75 %, hosp. 15–25 %, remisión 5–15 % |
| Traslados internos | 0 (o constante) | 0,5–1 min deterministas | — |

Las distribuciones se definen en la UI por **media y CV**; el motor convierte:
- Gamma: k = 1/CV², θ = media·CV².
- Lognormal: σ² = ln(1 + CV²), μ = ln(media) − σ²/2.

Carga del escenario de validación por defecto: triage ρ = 12/(2·15) = 0,40; admisión ρ ≈ 11,76/(2·12) = 0,49; médicos ρ = 12/(5·3) = **0,80**.

### 2.4 Fórmulas de validación

**Erlang C (M/M/c)**, con a = λ/μ, ρ = a/c < 1:

```
C(c,a) = [a^c/c! · c/(c−a)] / [ Σ_{n=0}^{c−1} a^n/n! + a^c/c! · c/(c−a) ]
Wq = C(c,a) / (cμ − λ)      Lq = λ·Wq      W = Wq + 1/μ      L = λ·W
```

**Cobham (M/M/c, prioridad sin interrupción, μ igual en todas las clases)**, clase k = 1 (Triage I) … 5 (Triage V):

```
σ_k = Σ_{i=1}^{k} λ_i / (cμ)
Wq_k = C(c,a) / [ cμ · (1 − σ_{k−1}) · (1 − σ_k) ]      (σ_0 = 0)
```

**Erlang B (sistema de pérdida M/G/K/K, insensible a la distribución de servicio)**, recursión estable:

```
B(0,a) = 1
B(k,a) = a·B(k−1,a) / (k + a·B(k−1,a))
```

**Ley de Little**: L = λW, verificada sobre la trayectoria simulada (área bajo N(t) / T contra λ̂·Ŵ).

**Red de Jackson**: la salida de un M/M/c es Poisson (Burke), el adelgazamiento y la superposición de Poisson son Poisson, y un retardo constante preserva Poisson. Por eso, en modo validación, cada estación se valida como M/M/c independiente y W_total = Σ W_estación + Σ retardos.

### 2.5 Condiciones para que la validación sea exacta (modo validación)
1. Todos los tiempos exponenciales; consulta con la **misma μ** en todos los niveles (requisito de Cobham).
2. Sin abandono, sin inyección de visitantes, sin accidente masivo, λ constante.
3. **Observación como pérdida pura**: quien no encuentra cama sale hacia el flujo de remisión y **no reintenta cama del hospital** (en modo realista sí reintenta; eso lo convierte en un sistema con reintentos, que ya no es Erlang B).
4. **Clínicas**: Erlang B se valida solo con su demanda de fondo λ_j (Poisson). El desborde que llega del hospital **no es Poisson** (es tráfico "con picos"); ver §8.
5. Prueba de aceptación: el valor analítico cae dentro del IC 95 % de 30 réplicas. Se reporta también el error relativo.

### 2.6 Métricas (definiciones)
| Métrica | Definición |
|---|---|
| ρ por recurso | tiempo ocupado / (c · T) |
| Lq, Wq por estación | promedios temporales y por paciente |
| Espera por nivel de triage | fin del triage → inicio de la atención médica |
| **Cumplimiento Triage II** | % de Triage II con espera (fin triage → médico) ≤ 30 min |
| Puerta-médico | llegada → inicio de la atención médica |
| Estancia total (LOS) | llegada → salida del modelo |
| % abandono | abandonos / llegadas IV+V |
| % remisión | por complejidad y por capacidad, por separado |
| Pacientes en pasillo | N(t), máximo y promedio |
| Tiempo esperando remisión | entrada al pasillo → salida en ambulancia |
| Utilización de ambulancias | ρ_amb |
| Tiempo de recuperación (accidente) | desde el evento hasta que N(t) vuelve a ±10 % del nivel previo |

---

## 3. Funcionalidades (MoSCoW)

| Prioridad | Funcionalidad |
|---|---|
| **Imprescindible** | Motor SED (red completa, prioridad, dos modos, semillas) |
| **Imprescindible** | Escena del hospital movida por el motor (cajas grises → arte) |
| **Imprescindible** | Hover sobre pacientes y recursos; pausa y velocidades |
| **Imprescindible** | Panel de parámetros + métricas en vivo, con cumplimiento del Triage II |
| **Imprescindible** | Modo batch (Worker), 30 réplicas, IC, pestaña de validación |
| Importante | Creador de personaje (síntoma → triage, vestidor por paleta) |
| Importante | Remisión a 3 clínicas + ambulancias |
| Importante | Seguir personaje + tarjeta de recorrido |
| Importante | Accidente masivo |
| Importante | Modo demo automático |
| Deseable | Mapa de ciudad con zonas clicables |
| Deseable | Dos ventanas (`BroadcastChannel`) |
| Deseable | Notebook SimPy de contraste (obligatorio solo si lo pide el profesor) |
| No entra | Escenas animadas de las clínicas; A*; vestidor con prendas dibujadas a mano |

**Regla de recorte:** si el 18 de noviembre no está el MVP en gris, **toda la fase F4 se elimina**.

---

## 4. Arquitectura y stack

### 4.1 Stack
- TypeScript + Vite (sin servidor).
- Phaser 3 (escena isométrica, proyección hecha a mano; **no** usar el plugin isométrico abandonado).
- Chart.js (panel), empaquetado localmente.
- Vitest (pruebas), ESLint + Prettier.
- Web Worker para el modo batch.

### 4.2 Estructura de carpetas
```
SimUrgencias/
├─ docs/                 SPEC.md, HANDOFF.md, informes, póster
├─ src/
│  ├─ engine/            núcleo SED: reloj, heap, rng (sfc32), distribuciones, recursos, colas
│  ├─ model/             red de urgencias, parámetros, escenarios, EPS/clínicas ficticias
│  ├─ validation/        Erlang C, Cobham, Erlang B, Little, KS, IC t-Student, Welch
│  ├─ batch/             Web Worker de réplicas
│  ├─ render/            escenas Phaser: HospitalScene, MapScene, CreatorScene
│  ├─ ui/                panel HTML/CSS, tooltips, tarjeta de recorrido
│  └─ main.ts
├─ tools/                generador de sprites por código
├─ tests/                Vitest
├─ assets/
│  ├─ generated/         sprites generados (en Git)
│  └─ vendor/            packs comprados (IGNORADO por Git)
├─ AGENTS.md             instrucciones para Codex
├─ CLAUDE.md             instrucciones para Claude
└─ package.json
```

### 4.3 Reglas del motor
1. `src/engine` y `src/model` **no importan nada del DOM ni de Phaser**. Corren igual en el navegador, en el Worker y en Node (Vitest).
2. Prohibido `Math.random()`. Toda aleatoriedad sale de `Rng` (sfc32) con un flujo por fuente: `arrivals`, `triage`, `admission`, `doctor`, `routing`, `patience`, `observation`, `ambulance`, `clinic-j`.
3. El motor expone `step(untilTime)`; el render avanza su reloj `t_render += dt_real × velocidad` y llama `step(t_render)`.
4. La salida del motor es el **registro de eventos** (§4.4). El render **solo consume**; nunca decide nada del modelo.

### 4.4 Contrato del registro de eventos (CONGELADO — no cambiar sin actualizar este archivo)

```ts
// src/engine/events.ts
export type TriageLevel = 1 | 2 | 3 | 4 | 5;

export type Zone =
  | 'entrance' | 'triage_queue' | 'triage' | 'admission_queue' | 'admission'
  | 'waiting_room' | 'doctor_box' | 'observation_bed' | 'hallway'
  | 'ambulance_bay' | 'exit' | `clinic_${number}`;

export type SimEventType =
  | 'ARRIVAL'            // paciente creado en la entrada
  | 'MOVE'               // inicia traslado interno; incluye from, to, duration
  | 'QUEUE_JOIN'         // entra a una cola
  | 'SERVICE_START'      // un recurso empieza a atenderlo
  | 'SERVICE_END'
  | 'TRIAGE_ASSIGNED'    // nivel de triage asignado
  | 'ROUTED'             // desenlace tras el médico: alta | observacion | hospitalizacion | remision
  | 'BED_ASSIGNED' | 'BED_RELEASED'
  | 'HALLWAY_WAIT'       // sin cama o esperando remisión
  | 'TRANSFER_START' | 'TRANSFER_END'   // ambulancia
  | 'RENEGE'             // abandono
  | 'DEPARTURE'          // sale del modelo
  | 'MASS_CASUALTY'      // evento de accidente masivo
  | 'PARAM_CHANGE';      // cambio de parámetros en caliente

export interface SimEvent {
  t: number;                 // minutos de simulación
  seq: number;               // desempate estable
  type: SimEventType;
  patientId?: string;
  resourceId?: string;       // ej. 'doctor-3', 'bed-12', 'amb-1'
  from?: Zone;
  to?: Zone;
  duration?: number;         // minutos (MOVE, SERVICE_START, TRANSFER_START)
  data?: Record<string, unknown>;
}

export interface PatientInfo {
  id: string;
  name: string;
  ageRange: '0-17' | '18-39' | '40-64' | '65+';
  eps: string;               // id de EPS ficticia
  symptom?: string;
  triage?: TriageLevel;
  isVisitor: boolean;        // creado en el stand
  appearance?: AppearanceSpec;
}

export interface AppearanceSpec {
  skin: number; hairStyle: number; hairColor: string;
  topStyle: number; topColor: string; bottomColor: string; accessory?: 'cap' | 'glasses' | 'mask';
}
```

### 4.5 Sincronización motor–render
- El render mantiene, por paciente, el último evento `MOVE` y anima a lo largo de la ruta fija `from → to` en exactamente `duration` minutos de simulación.
- Como B7 pone los traslados dentro del modelo, el sprite **llega cuando el motor dice que llegó**.
- Por encima de ×120 el render salta al destino sin interpolar.
- Los tooltips leen un `snapshot()` del motor (estado actual de pacientes y recursos), no el registro.

---

## 5. Trabajo en paralelo con varias IAs

Herramientas: 1 Claude Pro + 2 ChatGPT Plus (Codex). **No pueden hablar entre sí directamente**; se comunican **a través del repositorio**.

### 5.1 Reparto
| Agente | Rama | Carpetas | Tarea |
|---|---|---|---|
| Claude (esta cuenta) | `feat/engine` | `src/engine`, `src/model`, `src/validation`, `src/batch`, `tests` | Motor, validación, estadística (lo más exigente en rigor) |
| Codex 1 | `feat/render` | `src/render`, `src/ui` | Escena Phaser en gris + panel, usando un **registro falso** (`src/render/mock/events.json`) que respeta §4.4 |
| Codex 2 | `feat/sprites` | `tools/`, `assets/generated` | Generador de personajes por código, vestidor (CreatorScene después) |

### 5.2 Protocolo
1. Todos leen `docs/SPEC.md` antes de empezar. `AGENTS.md` y `CLAUDE.md` dicen: "lee SPEC.md y HANDOFF.md; no toques carpetas de otro agente".
2. Al terminar cada sesión, el agente agrega una entrada a `docs/HANDOFF.md`: fecha, rama, qué hizo, qué falta, **preguntas para otro agente**.
3. El autor integra las ramas a `main` **una vez al día** y copia las preguntas pendientes al agente que corresponde.
4. Cambios al contrato §4.4 → solo el autor, actualizando SPEC.md primero.

---

## 6. Assets y sprites

### 6.1 Comprados (en `assets/vendor/`, fuera de Git)
- **silverteacup – Hospital isometric pixel art**: ~30 objetos (camas, sillas, PC, mostrador, lavamanos, puertas), paredes, pisos, 1 personaje. Licencia propia: uso comercial sí; prohibido redistribuir o revender.
- **zephilie – Isometric pixel art assets**: 47 objetos médicos (camilla de examen, atril de suero, TAC), interiores y **36 piezas de fachadas** (para el mapa). CC BY 4.0 → atribución obligatoria.

### 6.2 Por crear (por código, en `assets/generated/`)
| Asset | Detalle |
|---|---|
| Cuerpo base | 5 tonos de piel; 24×32 px; direcciones SE y NE (+ reflejo) |
| Pelo | 5 estilos × paleta de 6 colores |
| Camisa / pantalón | 2–3 estilos, color libre por paleta |
| Accesorios | gorra, gafas, tapabocas |
| Personal | médico (bata blanca), enfermera (uniforme azul), auxiliar admisión |
| Animaciones | quieto (1), caminar (4), sentado (1), acostado (1) por dirección |
| Indicadores | burbuja de color por nivel de triage (I rojo, II naranja, III amarillo, IV verde, V azul) |
| Ambulancia | sprite isométrico (si los packs no la traen) |
| Mapa | composición con fachadas de zephilie + calles |

### 6.3 Prueba visual pendiente
Antes de F3: armar un box + cama + personaje generado con los packs reales y confirmar escala (tile 64×32, ×2). Esta decisión **no se puede tomar sin verlo**.

---

## 7. Plan por fases

| Fase | Fechas | Contenido | Hito |
|---|---|---|---|
| F0 | 11–12 nov | Repo privado, Vite + Vitest, `Rng` sfc32, heap, distribuciones + pruebas KS; compra de packs; reunión con el profesor (12) | Generadores validados |
| F1 | 13–15 nov | Red completa, modos, remisión y ambulancias en el motor, Worker batch, pestaña de validación. En paralelo: escena gris con registro falso (Codex 1) y generador de sprites (Codex 2) | **Validación pasa** |
| F2 | 16–18 nov | Integración: escena movida por el motor real, hover, controles, panel | **MVP gris (punto de recorte)** |
| F3 | 19–21 nov | Arte, creador, seguimiento, tarjeta. **21: contenido del póster cerrado** con capturas y resultados reales | Póster a imprimir el 22 |
| F4 | 22–23 nov | Mapa, clínicas visibles, accidente masivo, modo demo | **Congelamiento el 23** |
| F5 | 24–25 nov | Errores, prueba con el monitor, video de respaldo, ensayo del discurso | `v1.0-expo` |

---

## 8. Temas por investigar

1. **Verificar parámetros**: los tres informes de `docs/` son de investigación asistida por IA; varias cifras vienen de fuentes débiles. Contrastar al menos llegadas, mezcla de triage y tiempo de consulta con 2–3 artículos (SciELO/Redalyc) citables en el póster.
2. **Desenlaces por nivel de triage**: hoy son globales; idealmente P(observación | nivel), P(remisión | nivel).
3. **Tráfico de desborde hacia clínicas**: no es Poisson; si se quiere validar la clínica con remisiones, usar el método de Wilkinson (equivalent random) o limitarse a validar con su demanda de fondo.
4. **Calentamiento**: confirmar con la gráfica de Welch (la "regla de 48 h" de los informes no está justificada).
5. **Lista de síntomas → triage**: ~10 síntomas con ejemplos coherentes con la Res. 5596 (art. 5) para el creador.
6. **Res. 5596 vigente**: confirmar en la versión del Ministerio que no hay modificaciones posteriores antes de citarla en el póster.
7. **Tiempos de traslado** reales en Valledupar (entre clínicas) para la ambulancia.

---

## 9. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| No alcanza el tiempo (15 días, 1 persona) | Alta | Alto | MoSCoW, regla de recorte del 18, IAs en paralelo, cajas grises |
| Integración de ramas de distintas IAs rompe cosas | Media | Alto | Contrato §4.4 congelado, carpetas separadas, integración diaria, pruebas Vitest |
| La validación no cuadra (bug sutil del motor) | Media | Alto | F1 dedicada solo a eso; pruebas unitarias por estación antes de la red |
| Escalas de los packs no combinan | Media | Medio | Prueba visual temprana; personajes generados se ajustan a la escala |
| El profesor pide cambios el 12 | Media | Medio | Propuesta de una página; plan Python (notebook SimPy) listo |
| Falla el portátil / navegador en la feria | Baja | Alto | USB, video de respaldo, `vite preview` probado offline el 24 |
| Imprenta del póster se demora | Media | Alto | Contenido cerrado el 21, enviar el 22 |
| Licencias de assets | Baja | Medio | Repo privado, `assets/vendor` ignorado, créditos visibles |

---

## 10. Material para el póster

La plantilla institucional (ExpoSoftware, vertical, formato A) tiene estas secciones. Contenido base propuesto:

| Sección de la plantilla | Contenido SimUrgencias |
|---|---|
| Título | "SimUrgencias: simulación de eventos discretos del servicio de urgencias de un hospital de Valledupar, validada con teoría de colas" |
| Introducción | Saturación de urgencias en Valledupar; la Res. 5596 exige Triage II ≤ 30 min; la simulación permite probar escenarios sin riesgo para pacientes. |
| Objetivo general | Desarrollar un simulador de eventos discretos del servicio de urgencias, validado analíticamente, que permita evaluar la capacidad necesaria para cumplir los tiempos de la Res. 5596. |
| Objetivos específicos | 1. **Modelar** el flujo de pacientes como una red de colas con prioridad por triage. 2. **Implementar** un motor SED con visualización interactiva. 3. **Validar** el modelo contra Erlang C, Cobham, Erlang B y la Ley de Little. 4. **Evaluar** escenarios de capacidad (médicos y camas). |
| Metodología | Diagrama de las etapas del estudio de simulación: formulación → modelo conceptual (red de colas) → datos (literatura) → codificación → verificación → validación → experimentación. Incluir el diagrama de la red. |
| Resultados | Tabla analítico vs simulado ± IC; gráfica de escenarios (4/5/6 médicos vs. espera Triage II y % cumplimiento); captura del juego. |
| Conclusiones | (se llenan el 21 con resultados reales) |
| Recomendaciones | Calibrar con datos reales (RIPS); modelar desenlaces por nivel; integrar redes reales de EPS. |
| Extra | QR al video de demo. |

Ecuaciones para el póster: Erlang C, Cobham y Erlang B de §2.4.

---

*Fuentes normativas: Resolución 5596 de 2015, Ministerio de Salud y Protección Social (arts. 4, 5, 6 y 8), consultada en el Normograma de la Supersalud.*


---

## 11. Cambios v1.1 (22 nov 2026) — prevalecen sobre las secciones anteriores

1. **Plazos:** el código empezó el 22 nov. Dos metas: **A. ExpoSoftware (26 nov)**, solo si el martes 24 en la noche el MVP funciona; **B. Final de corte (≈ 2 dic, por confirmar)**, versión completa. El plan por fases del §7 queda reemplazado por `docs/TAREAS.md`.
2. **Arte:** no se compran packs. **Todo se dibuja por código** (escenario con Phaser Graphics y personajes generados en `tools/`), con una sola paleta. Sin riesgo de licencias. §6.1 queda sin efecto.
3. **Coordinación de IAs:** sin orquestador. El repositorio es la memoria compartida: `AGENTS.md`, `CLAUDE.md`, `docs/TAREAS.md` (tareas con criterio de aceptación) y `docs/HANDOFF.md` (relevo). Repositorio: https://github.com/LibniT/modelos-proyecto
4. **Clínicas por defecto:** 30 / 40 / 50 camas, demanda propia 0,3 / 0,4 / 0,5 pacientes/h, estancia Exp(48 h). Con 12–20 camas las remisiones (≈ 0,6/h × 48 h ≈ 29 Erlangs) las saturaban.
5. **Modo realista:** 6 médicos por defecto (con 5, el pico vespertino del perfil NHPP supera cμ y el abandono IV–V llega a ~30 %).
6. **Cama de observación y de clínica:** se reserva en el instante de la decisión. El tiempo de ocupación para Erlang B es E[S] + traslado interno.
7. **Estado `caminando`** en `snapshot()` durante cada `MOVE` (el contrato de eventos §4.4 no cambia).
8. **Criterio de la prueba automática:** IC conjunto de Bonferroni (95 % familiar sobre las 16 comparaciones); la tabla de `docs/VALIDACION.md` reporta además el IC 95 % individual.
9. **Validación de clínicas:** se prueba con una carga de ensayo a = 0,9·K y sin remisiones (pérdida pura), porque con la carga por defecto el bloqueo es ~10⁻⁴ y no es medible.
10. **Personajes (T09):** se generan por código **en tiempo de ejecución** (`src/render/characters/pixels.ts` → texturas de Phaser), no como PNG en `assets/generated`. Mismo resultado sin archivos de imagen. Hoja de personajes para revisarlos: `npm run dev` → `/tools/characters.html`. Los pacientes del motor toman su aspecto de un catálogo determinista de 64 combinaciones (por id); los visitantes, del vestidor. El triage se muestra con una burbuja sobre la cabeza.
11. **Tiempo de recuperación (T17):** con llegadas NHPP el "nivel previo" de N(t) no sirve de referencia (N cambia con la hora). Se mide contra el **contrafactual con números aleatorios comunes**: el mismo hospital con la misma semilla sin el accidente. Recuperación = primer instante, desde 30 min después del accidente, en que el promedio temporal exacto de N en los últimos 30 min queda a ±10 % del contrafactual (`src/batch/recovery.ts`). En la aplicación corre un gemelo en paralelo; el experimento con 200 réplicas está en `docs/ACCIDENTE.md`.
