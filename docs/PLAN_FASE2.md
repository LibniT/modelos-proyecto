# SimUrgencias, fase 2: plan (borrador para revisar)

Fecha: 24 nov 2026. Autor del borrador: Claude. **Todavía no se cambió código.**

Línea base: `main` en `dd2d12c`, sin cambios pendientes. Pasan 137 pruebas y `npx tsc --noEmit`.

---

## 0. Lo primero: con el tiempo que queda no alcanza todo

La feria es el jueves 26. El corte para funciones nuevas que acordamos es el **miércoles 25 a las 20:00**, así que quedan unas 30 horas de reloj. Lo que pide el documento suma unas 35–40 horas de trabajo si se hace bien y con pruebas.

Este plan propone un **P0 recortado que sí cabe**: el paciente en el mapa, rutas desde cualquier punto, selección explicable, EPS reales con trazabilidad, rediseño de la vista Ciudad, ficha y seguimiento nuevos. Todo lo demás pasa a P1 o P2, con la razón al lado. Si P0 no pasa las pruebas antes del corte, la feria se hace con `main` en `dd2d12c`, que ya funciona.

---

## 1. Diagnóstico del estado actual

| Pieza | Estado | Qué significa para la fase 2 |
|---|---|---|
| Motor DES (`src/engine`) | Sólido y validado, con contrato de eventos congelado. | No se toca. |
| Modelo del hospital (`src/model/ed.ts`) | Solo el HRPL tiene urgencias completas (triage, consulta, observación). Las sedes de la red son **unidades de camas** (17 unidades en 6 sedes), cada una con su demanda propia y su estancia. | Un paciente llevado a otra sede **ocupa una cama de esa unidad**; ahí no hay triage ni consulta modelados. Es la limitación más importante (pregunta 3). |
| Ambulancias | Un solo grupo de 2 ambulancias con base en el HRPL. Solo hacen remisiones HRPL → sede. | El despacho prehospitalario puede usar el mismo grupo, y así compite con las remisiones (pregunta 4). |
| Rutas | Se **precalculan** en `tools/valledupar-map.ts`: Dijkstra sobre el grafo OSM con sentidos de circulación, **solo desde el HRPL**, a 30 km/h fijos. El navegador recibe `rutas.json`, no el grafo. | Para rutas desde cualquier punto hay que exportar el grafo y llevar Dijkstra a `src/model`. |
| Calles | `calles.json` (200 kB) solo dibuja: 3 552 polilíneas simplificadas, sin sentidos ni conectividad. | No sirve como grafo, pero el cache OSM sí: 4 199 vías, 8 164 intersecciones, 924 vías de un sentido y 256 con `access`. |
| Selector (`src/model/referral.ts`) | Elige por compatibilidad (matriz AD/C), cama libre del tipo requerido, minutos de ruta, aceptación y nueva coordinación. Ya devuelve el motivo de cada sede. | Se reutiliza casi entero, porque los minutos ya llegan como dato en `SiteState`. |
| Visitante (`injectVisitor`) | El paciente creado por el visitante **reemplaza la próxima llegada aleatoria**, y así se conserva la tasa λ. | Se mantiene la regla (ver §9). |
| EPS | Cinco EPS **ficticias** en `catalog.ts`, con flujo aleatorio `eps`. Entran en la huella de regresión de los escenarios originales. | Las ficticias se quedan en los escenarios de validación y realista. El modo `?red` usa las reales. |
| UI | Pestañas Escena / Gráficas en vivo / Motor (texto) / Validación. Barra de botones encima del mapa. La ficha es una lista de líneas en `#card`. | El rediseño es sobre todo HTML y CSS en `main.ts`, `tour.css` y `expo.css`, sin cambiar de framework. |

## 2. Las capturas

**No recibí las imágenes en este mensaje.** Analicé los dos componentes desde el código, que es lo que generan esas capturas.

**Ficha de la sede (SOHEC).**
- `showInfoCard` vuelca en un solo bloque todo lo que devuelve `siteLines()`: fuentes, método de ubicación, ruta, matriz de recepción y capacidad. Todo con el mismo peso visual y con scroll dentro de la tarjeta, que tapa el mapa.
- Falta jerarquía. No se distingue lo documentado de lo simulado ni de lo desconocido.

**«Remisión de la corrida».** Hallazgos concretos:
1. **El paciente que muestra cambia solo.** Muestra `referrals.latest`, que es el último paciente que entró al pasillo (`HALLWAY_WAIT`). Con remisiones simultáneas, la franja salta al más reciente sin avisar, salvo que se esté siguiendo una ambulancia. Por eso no se entiende a quién muestra.
2. **El nombre no explica nada.** «de la corrida» no le dice nada a un visitante.
3. **Los intervalos sí están registrados, pero no se explican.** El intervalo pasillo → aceptación mezcla la espera de cama del tipo requerido, la demora del CRUE y las reofertas por rechazo, y el motor sabe cuál fue cada una. Aceptación → salida es la espera de ambulancia. Hoy se muestran como «pasos» sin decir qué fue lo que se esperó.
4. **Una inconsistencia real.** La hora en que «la ambulancia queda libre» no sale de un evento (el contrato no lo tiene). La calcula `ReferralLog.tick()` en el cuadro de render, así que tiene un error de hasta *un cuadro × velocidad de simulación* (minutos a velocidad alta). En el nuevo seguimiento se calcula con el dato exacto del motor: hora de llegada + entrega + regreso, que ya se sortean al iniciar el traslado y pueden ir en `TRANSFER_END.data`.

## 3. Cómo leo los requerimientos del profesor

- **Lo central** es «¿a dónde lo llevo desde aquí?»: cualquier punto, condición, edad y EPS → alternativas explicadas, con una recomendada que **no es necesariamente la más cercana**.
- **Lo que demuestra el valor** es comparar tres políticas (más cercana, compatible más cercana, mínimo tiempo hasta atención adecuada) con el mismo paciente y, en el experimento, con muchos pacientes.
- **Erasmo y Alta Complejidad son solo ejemplos.** El sistema decide con la matriz de recepción documentada (`capabilities.ts`, informe del 24 nov), no con reglas escritas a mano.

## 4. Qué se reutiliza

- **Rutas:** el grafo vial y el Dijkstra de `tools/valledupar-map.ts`, incluidos los sentidos y las rotondas.
- **Motor y estadística:** `MinHeap` del motor, la proyección `proj`/`unproj`, la matriz de recepción `reception()`, el selector `chooseDestination` con su aceptación, y `CONDITION_POOL`/`POOLS`.
- **Ambulancia:** la de `CityScene`, que ya recorre `path` de `rutas.json`. Hay que pasarle otra geometría.
- **Creación del paciente:** el creador de personaje (`mountCreator`: nombre ficticio, edad, síntomas → triage) se reutiliza como formulario, con más campos.
- **Experimentos:** `compareScenarios` (réplicas, CRN, IC pareados) para los experimentos.
- **Seguimiento y ficha:** `ReferralLog`/`referralSteps` (sin DOM, con pruebas) como base del seguimiento, y `siteLines` como contenido de las pestañas de la ficha.

## 5. EPS: investigación preliminar (verificar antes de usar)

| EPS | Régimen | Estado administrativo | Valledupar | Fuente |
|---|---|---|---|---|
| Nueva EPS | C y S | Intervenida desde abr 2024; prórroga hasta abr 2027 | Opera; «más de 90 mil usuarios» (dic 2025) | [ConsultorSalud](https://consultorsalud.com/supersalud-prorroga-intervencion-de-nueva-eps/), [Radio Guatapurí](https://www.radioguatapuri.com/noticias/nueva-eps-activa-red-de-emergencia) |
| Salud Total | C y S | Sin intervención encontrada (a verificar) | Autorizada según prensa local | [Pulzo/El Pilón](https://www.pulzo.com/nacion/listado-de-eps-autorizadas-y-no-autorizadas-en-valledupar-cuando-sera-el-traslado-de-afiliados-PP5082439A) |
| Proteger EPS (antes Cajacopi) | S (y movilidad) | Cambio de razón social por Res. Supersalud 2025310010011891-6 (10 dic 2025); mismo NIT; retiro voluntario parcial (Res. 2025310010007194-6) | Autorizada según prensa local; **hay que ver si el retiro parcial afecta al Cesar** | [ConsultorSalud](https://consultorsalud.com/cajacopi-eps-cambia-de-razon-social/), [MinSalud](https://www.minsalud.gov.co/Proteccion-Social/Paginas/asignacion-eps.aspx) |
| Dusakawi EPSI | S (indígena) | — | Autorizada; sede en Valledupar | Prensa local (a confirmar con MinSalud) |
| EPS Sanitas | C | Intervenida en abr 2024; devuelta el 8 sep 2025 | **Contradictorio:** la prensa local la lista entre las no autorizadas en Valledupar | [El Tiempo](https://www.eltiempo.com/amp/salud/datos-oficiales-muestran-que-las-intervenciones-de-la-supersalud-a-eps-no-frenaron-la-crisis-la-empeoraron-pqrd-estan-disparadas-y-en-cifras-record-3555797) |
| Familiar de Colombia | S | En el listado nacional del régimen subsidiado | **Contradictorio:** la prensa local dice que deja de operar en Valledupar | [Infobae](https://www.infobae.com/colombia/2025/07/09/solo-28-eps-estan-autorizadas-para-funcionar-en-colombia-en-2025-segun-el-ministerio-de-salud-este-es-el-listado-actualizado/) |
| Coosalud, Famisanar | C y S | Intervenidas; Coosalud con devolución ordenada por tribunal (2026) | Prensa local: deben retirarse de Valledupar | [Semana](https://www.semana.com/salud/articulo/supersalud-acata-fallo-que-ordena-devolver-coosalud-eps-a-sus-antiguos-directivos-que-pasara-con-los-afiliados/202655/) |

Además:
- **Primera relación EPS–IPS con fuente:** en diciembre de 2025, Nueva EPS nombró una red de emergencia en Valledupar tras la suspensión del Grupo Clínica Médicos. Esa red incluye a la **Clínica Erasmo**, que es una de nuestras sedes. También nombra Arenas, Santa María del Caribe, Reina del Sol, Unidad Renal y Santo Tomás, que no están en nuestras 12 sedes. La nota no dice qué servicios cubre cada una, así que la relación queda como «confirmada, servicios sin especificar».
- **Afiliados por municipio:** la fuente oficial es la BDUA, publicada en el cubo de aseguramiento de SISPRO. La página de MinSalud no enlaza un archivo directo. Hay que bajarlo del cubo, y si no se logra, no hay porcentajes. No se inventan.
- **Lo que falta:** El Pilón (las dos notas sobre qué EPS dejan Valledupar) devolvió error 429. Falta leerlo y confirmar con el acto administrativo.

**Formato propuesto** (`src/model/valledupar/eps.json`):

```
{ eps: [{ id, nombre, nit, regimen, estado, presenciaValledupar, afiliados?, fuente, consulta, limitaciones }],
  relaciones: [{ eps, ips: SiteId, sede?, regimen?, servicio?,
                 estado: 'confirmada'|'confirmada-servicios'|'no-vigente'|'inexistente'|'insuficiente',
                 vigencia?, fuente, consulta }] }
```

Una pareja que no aparece se trata como `'insuficiente'`. La falta de información **nunca** cuenta como falta de convenio.

**Normativa preliminar** (cada norma se cita con su artículo en `docs/NORMATIVA.md`):
- Ley 100/1993, art. 168: atención inicial de urgencias obligatoria, sin contrato ni autorización previa.
- Ley 1751/2015, art. 14: prohíbe exigir autorización para urgencias.
- Decreto 780/2016: atención inicial, referencia y contrarreferencia, y el antiguo Decreto 4747/2007.
- Resolución 5596/2015: triage.
- Resolución 1441/2016: redes integrales de prestación.
- Resolución 926/2017 y Ley 1438/2011, art. 67: Sistema de Emergencias Médicas y CRUE.
- Resolución 3100/2019: habilitación.

**En el modelo, la EPS nunca filtra la atención inicial ni la estabilización.** Solo puede pesar en la atención definitiva de un paciente estable (pregunta 2).

## 6. Rutas desde cualquier punto: alternativas

| Opción | Offline | Reutiliza | Costo | Veredicto |
|---|---|---|---|---|
| **Exportar el grafo OSM y correr Dijkstra en el navegador** (`src/model/valledupar/router.ts`, puro, sin DOM) | Sí | Grafo y Dijkstra de `tools/`, `MinHeap` | ~3 h | **Recomendada** |
| A* | Sí | Igual | Igual | No hace falta: con una corrida desde el origen salen las rutas a las 12 sedes a la vez (búsqueda a varios destinos), y A* ayuda solo con un destino. |
| OSRM, GraphHopper, Valhalla | Solo con servidor local | Nada | Servidor, Docker y datos | Exagerado para 8 000 nodos, y tampoco tienen tráfico real. |

Detalles:
- **Grafo comprimido:** se exportan solo las intersecciones (~8 000 nodos). Cada arista lleva longitud, clase de vía, sentido y geometría simplificada. Se estima en 400–600 kB de JSON. Se descartan las vías con `access=private/no`.
- **Pesos en tiempo:** longitud ÷ velocidad de la clase × factor de tráfico. Así la ruta más corta y la más rápida pueden no coincidir.
- **Ajuste al punto:** con una rejilla espacial de 100 m, el punto se proyecta sobre **el segmento** más cercano, no sobre el nodo. La arista se parte en el punto proyectado.
- **Validación del punto:**
  - fuera del área cubierta: rechazado;
  - dentro de un polígono de agua (el río Guatapurí está en `calles.json`): advertencia y propuesta del punto vial accesible más cercano;
  - a más de 150 m de una vía: igual que el agua;
  - el punto solo se ajusta a la **componente fuertemente conexa principal**, calculada offline, así que no se proponen vías aisladas.
- **No se inventan rutas:** sin camino en el grafo no hay ruta.
- **Restricciones de giro:** no están en el cache OSM, que no trae relaciones. Pasan a P2 y se documenta.
- **Consistencia:** las rutas HRPL → sedes de `rutas.json` se recalculan con el mismo modelo de velocidades. Esto cambia los números del modo `?red` y del experimento T27, que habría que volver a correr. **Los escenarios originales no cambian** (lo vigila la huella de regresión).

## 7. Tráfico y Google Maps

- **Datos reales de Valledupar:** no encontré aforos ni velocidades públicas. Hay un Plan Maestro de Movilidad cuestionado por el Concejo en 2022 ([proposición 004](https://concejodevalledupar.gov.co/wp-content/uploads/2022/03/PROPOSICION-N%C2%B0004-DEL-08-DE-MARZO-DE-2022.pdf)) y un crecimiento del tráfico de más del 5 % anual en la Simón Bolívar según Tránsito, pero sin series.
- **Google Routes API:** la política de Routes ([policies](https://developers.google.com/maps/documentation/routes/policies)) restringe guardar sus resultados (solo se permiten los place IDs) y pide mostrarlos en un mapa de Google o con su atribución. Además exige clave, facturación e internet. **No es compatible** con funcionar offline ni con guardar escenarios reproducibles, y no aporta a la nota de Modelos y Simulación.
- **Recomendación:** **tráfico simulado** con escenarios fluido, moderado y congestionado. Cada escenario es un factor por clase de vía (troncal, primaria, …, residencial), con perfil por hora opcional en P1 y cierre de una vía para los experimentos en P2. Todos los valores se marcan **«supuesto de simulación»** en la UI y en la documentación, y el simulador nunca dice que conoce el tráfico real.
- Google puede quedar documentado como integración opcional futura (P2), sin código ahora.

## 8. Rediseño visual (vista Ciudad)

Navegación con cuatro vistas: **Ciudad · Hospital · Estadísticas · Validación**. «Motor (texto)» pasa a un desplegable dentro de Validación. Los interiores isométricos no cambian.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ✚ SimUrgencias   [Ciudad] Hospital  Estadísticas  Validación     ▶ ⏸ ×8 │  barra superior compacta + control
├──────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────┐                                     ┌───────┐ │
│ │ 🔍 Buscar institución │                                     │ Capas │ │  buscador y capas flotantes
│ └───────────────────────┘                                     └───────┘ │
│ ┌──────────────────────────┐                                            │
│ │ PANEL LATERAL (plegable) │              M A P A                ┌───┐  │
│ │ ficha de sede o          │                                     │ + │  │
│ │ seguimiento del paciente │          (protagonista, ~75 %)      │ − │  │
│ │                          │                                     │ ◎ │  │  zoom, centrar, pantalla completa
│ │                          │                                     │ ⛶ │  │
│ └──────────────────────────┘                                     └───┘  │
│                                                         ┌──────────────┐│
│  🚑 2 en base · 1 en ruta    👤 3 pacientes activos     │ 🧍 arrástrame ││  muñeco para crear paciente
│                                                         └──────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

**Ficha de la sede** (panel lateral, pestañas):

```
┌ Clínica Alta Complejidad del Caribe ──────────── ✕ ┐
│ IPS privada · Cra 19 # 14-48          ● Urgencias  │
│ 🚑 4,2 km · 9 min desde el paciente (simulado)     │
│ [General] Servicios  EPS  Capacidad  Fuentes       │
│ ─────────────────────────────────────────────────  │
│ Atiende de forma definitiva: IAM, TCE grave, …     │
│ Ocupación simulada  ▓▓▓▓▓▓▓░░  78 %  (simulado)    │
│ EPS con relación documentada: Nueva EPS (conf.)    │
│          [ Entrar a la clínica ]                    │
└────────────────────────────────────────────────────┘
```

Tres marcas de dato en toda la app: **● documentado** (con fuente al pasar el cursor), **◌ simulado**, **? sin información**.

**Seguimiento del paciente** (reemplaza la franja):

```
┌ Seguimiento del paciente ─────────────── [P-014 ▾] ┐  selector de pacientes activos e historial
│ Rosa M. (ficticia) · 40-64 · Nueva EPS · IAM · II  │
│ Estado: EN TRASLADO a Instituto Cardiovascular     │
│ ● 10:02 Creada en Cra 9 con Cl 16                  │
│ ● 10:02 Destino elegido  (motivo ▸)                │
│ ● 10:05 Ambulancia asignada  · esperó 3 min        │
│ ● 10:13 Recogida            · 8 min hasta ella     │
│ ◉ 10:13 Traslado            · 6,1 km · 12 min est. │
│ ○       Llegada · Cama UCI adulto                  │
│ ▸ Instituciones descartadas (4)                    │
└────────────────────────────────────────────────────┘
```

- Solo aparecen las etapas del recorrido real de ese paciente.
- Cada tiempo sale de un evento o de un dato que sorteó el motor. Si un intervalo no tiene registro, no se le pone explicación.
- Estilo: tokens de color y tipografía en `:root`, cuerpo de 16–18 px (se tiene que leer a 2 m del monitor), un acento verde salud y otro azul.

## 9. Arquitectura propuesta

```
tools/valledupar-map.ts ──► src/model/valledupar/grafo.json   (nuevo; offline)
src/model/valledupar/router.ts   (nuevo, puro) snap(x,y) → punto válido | motivo; routes(origen, tráfico) → {sede: {m, min, path}}
src/model/valledupar/eps.json    (nuevo) EPS reales + matriz EPS–IPS con estado y fuente
src/model/referral.ts            (+) política: 'cercana' | 'compatible' | 'tiempo-adecuado'; motivo EPS (sin excluir)
src/model/ed.ts                  (+) injectPrehospital(paciente, punto, rutas): despacho → recogida → traslado → ingreso
src/ui/patient-tracker.ts        (nuevo, sin DOM) historia por paciente desde eventos (sucesor de ReferralLog)
src/ui/site-card.ts              (+) secciones con tipo de dato (documentado/simulado/desconocido)
src/render/map/city.ts           (+) muñeco, marcador del paciente, ruta de la ambulancia con geometría dinámica
src/main.ts, index/CSS           (~) maqueta nueva de la vista Ciudad, formulario, panel lateral
tools/prehospital-experiment.ts  (P1) experimentos A y B
```

**Flujo del paciente en el motor** (todo con eventos del contrato actual: no se agregan tipos, solo campos en `data`, como se hizo en T26):

1. `ARRIVAL` con `data.prehospital = {x, y, condición, EPS}`. El paciente existe desde que se crea en el mapa.
2. El selector elige el destino con las rutas del router y el estado simulado de camas.
3. Se pide la ambulancia: si están todas ocupadas, espera en la cola del recurso, y esa espera queda registrada. Luego `TRANSFER_START` (`data.tramo='a-escena'`, con su geometría), atención en escena (supuesto) y `TRANSFER_START` (`tramo='a-destino'`).
4. Al llegar:
   - si el destino es el **HRPL**, el paciente entra por `ambulance_bay` al flujo completo (triage, consulta, …);
   - si es **otra sede**, `BED_ASSIGNED` en la unidad del tipo de cama requerido;
   - `TRANSFER_END` lleva la hora exacta en que la ambulancia queda libre.
5. **Tasa de llegadas:**
   - si va al HRPL, se **salta la próxima llegada aleatoria** del HRPL, como con el visitante. Así λ se conserva a largo plazo; el desfase de un solo paciente se documenta;
   - si va a otra sede, es +1 llegada a esa unidad. Es despreciable frente a su demanda propia, y se documenta.
6. Todo con flujos `Rng` nombrados nuevos (`prehospital`, `escena`). Los existentes no se tocan, así que **la huella de los escenarios originales no cambia**.

**Políticas de selección:**

- **Más cercana:** la sede con urgencias de menor tiempo. Si no es AD para la condición, el paciente se estabiliza ahí y se remite.
- **Compatible más cercana:** la AD o C con cama, como hoy.
- **Tiempo hasta atención adecuada:** para cada sede, *E[T] = ruta + (si no es AD: estabilización + E[CRUE] + segunda ruta) + penalización por rechazo (1/p de aceptación) + espera de cama*. Se elige la mínima.

En la vista se muestran las tres respuestas para el mismo paciente, lado a lado. Esa es la demostración que pidió el profesor.

## 10. Archivos

- **Nuevos:** `router.ts`, `grafo.json`, `eps.json`, `patient-tracker.ts`, las pruebas `router.test.ts`, `prehospital.test.ts`, `eps.test.ts` y `patient-tracker.test.ts`, y los documentos `docs/EPS_VALLEDUPAR.md`, `docs/NORMATIVA.md` y `docs/MODELO_PREHOSPITALARIO.md` (rutas, tráfico y selección).
- **Modificados:** `tools/valledupar-map.ts`, `referral.ts`, `ed.ts` (solo el método nuevo y su programación), `params.ts` (tráfico y EPS reales solo en `networkParams`), `city.ts`, `site-card.ts`, `main.ts`, `tour.css`, `expo.css`, `README`, `RED_VALLEDUPAR.md`, `GUIA_DEMO_RED.md`, `CREDITOS.md`, `TAREAS.md` y `HANDOFF.md`.
- **No se tocan:** `src/engine/*` (y su contrato), `src/validation/*`, ni las EPS ficticias de los escenarios originales.

## 11. Tareas en orden de dependencias

| # | Tarea | Depende de | Estimado | Prioridad |
|---|---|---|---|---|
| T28 | Grafo exportado + `router.ts` (ajuste al segmento, validación del punto, Dijkstra a varios destinos, velocidades por clase, 3 escenarios de tráfico) + pruebas | — | 3–4 h | P0 |
| T29 | EPS reales + matriz EPS–IPS + normativa (investigación con fuentes; **puede ir en paralelo a T28**) | — | 3 h | P0 |
| T30 | `injectPrehospital` en el motor + selector con rutas dinámicas, motivos EPS y 3 políticas + pruebas (conservación, semillas, ambulancias ocupadas, sin destino) | T28 | 4 h | P0 |
| T31 | Muñeco arrastrable + clic, marcador, formulario (creador reutilizado), panel de alternativas, ambulancia con geometría dinámica | T28, T30 | 3–4 h | P0 |
| T32 | Rediseño de la vista Ciudad + ficha con pestañas + seguimiento del paciente | T30 (para el seguimiento) | 4–5 h | P0 |
| T33 | Experimentos A (políticas) y B (tráfico) con CRN, sobre pacientes en puntos aleatorios de la ciudad | T30 | 2–3 h | P1 |
| T34 | Historial completo, varias bases de ambulancia, perfil horario del tráfico, experimento C/D | T33 | — | P1 |
| — | Tráfico en tiempo real, Google, cierres de vías dinámicos, restricciones de giro, otros municipios | — | — | P2 |

El camino crítico es T28 → T30 → T31 (unas 11 h). T29 y T32, en su parte sin seguimiento, pueden ir en paralelo.

## 12. Riesgos y limitaciones

- **Tiempo (riesgo alto).** El plan de contingencia es la feria con `dd2d12c`. Cada tarea se integra a `main` solo si pasa pruebas, TypeScript y build.
- **Cambio de la UI a 48 h de la feria.** Se rediseña solo la vista Ciudad y sus paneles. Las otras vistas solo reciben los tokens de estilo.
- **Las otras sedes no tienen urgencias modeladas.** Un paciente llevado ahí ocupa una cama del tipo requerido: no hay triage ni consulta. Se dice en pantalla.
- **EPS.** Las fuentes de prensa se contradicen (Sanitas, Familiar). Las redes publicadas por las EPS son PDF nacionales largos, así que la mayoría de las parejas EPS–IPS quedarán «información insuficiente». Eso es honesto, pero visualmente pobre.
- **Afiliación como probabilidad de llegada.** Si se usa, es un supuesto declarado: los afiliados no equivalen a las llegadas a urgencias.
- **Velocidades y tráfico** son supuestos. No hay restricciones de giro.
- **Validez.** La validación con teoría de colas del escenario original **no** valida el modelo georreferenciado, y se dirá así. Lo que sí se puede verificar son propiedades: conservación de pacientes, rutas por aristas existentes, sentidos y reproducibilidad.

## 13. Prioridades ajustadas a la feria

**P0 (antes del miércoles a las 20:00):** T28, T29 (EPS y relaciones con fuente; normativa resumida), T30 (con las 3 políticas comparadas *para el paciente colocado*), T31 y T32.

**P1 (si sobra tiempo; si no, después de la feria):** T33, T34.

**P2 (después):** lo demás.

## 14. Decisiones de la autora (24 nov)

1. **Alcance:** todo (P0 y P1), sin recortes. Cada tarea se integra en `main` apenas pase pruebas, TypeScript y build, para que `main` siempre sirva para la feria.
2. **EPS:** paciente **crítico** (triage I–II del escenario o inestable) → la EPS no cuenta. Paciente **estable** → va a una sede compatible de la red documentada de su EPS si queda a **≤ 15 min** más que la mejor; si no, a la mejor, y se explica. La falta de información nunca excluye.
3. **Otra sede:** el paciente ocupa una cama del tipo requerido (sin triage ni consulta modelados), con aviso en pantalla.
4. **Ambulancias:** grupo prehospitalario propio con base en el HRPL; las 2 de remisión de T27 no cambian.
5. **Afiliados:** si aparecen cifras BDUA, se usan como probabilidades de EPS de los pacientes aleatorios (supuesto declarado); si no, «sin dato».
