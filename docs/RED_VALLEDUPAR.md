# Red hospitalaria de Valledupar — fuentes, hechos y supuestos (T25)

> Escenario **académico**. La ocupación que muestra SimUrgencias es **simulada**, no la disponibilidad real de ninguna institución. No sirve para decidir traslados de pacientes reales; en Colombia esa decisión depende del estado clínico, de la disponibilidad operativa y de la regulación del CRUE (Res. 926 de 2017).

## Fuentes
| Archivo | Contenido |
|---|---|
| `docs/investigacion/red-hospitalaria-valledupar-2026-11-24.md` | Informe de investigación (corte 24 nov 2026): REPS (base visible producida el 4 nov 2026), SISPRO, MinSalud, portales institucionales |
| `docs/investigacion/SimUrgencias_prompt_mapa_y_referencias.pdf` | Requisitos de la ampliación y maquetas de referencia (anexos A–C) |
| `src/model/valledupar/sites.ts` | 12 sedes: nombre, dirección, código REPS cuando el informe lo da, servicios, capacidades con fuente por dato |
| `src/model/valledupar/capabilities.ts` | Matriz de recepción por tipo de paciente (23 condiciones × 9 sedes), transcrita del informe |

La prueba `tests/valledupar.test.ts` compara la matriz **celda a celda** con la tabla del informe guardado, así que una transcripción equivocada rompe `npm test`.

## Qué es hecho documentado
- **Servicios habilitados y capacidad instalada** (camas, UCI, quirófanos, consultorios de urgencias, ambulancias) según REPS. Cuando la cifra viene de un portal institucional y no de REPS, se anota (14 camas de quemados de Alta Complejidad, 105 camillas de la nueva urgencia del HRPL).
- **Clasificación de recepción** AD / C / ER / NH / SI del informe. Es una inferencia del propio informe a partir de los servicios REPS: «AD» significa atención definitiva *documentalmente plausible*, nunca aceptación garantizada.

## Qué NO se sabe y cómo se trata
| Vacío | Tratamiento |
|---|---|
| Capacidad sin cifra (p. ej. Simón Bolívar, Clínica Valledupar, San Lucas, UCI pediátrica de Alta Complejidad) | `null`. Nunca 0 ni un valor inventado |
| Sedes fuera de la matriz (Santa Isabel – OHI, Clínica Valledupar, SOHEC) | Recepción «SI» (información insuficiente) para toda condición |
| Contratos EPS por sede | El informe no halló una fuente confiable; además la urgencia no se condiciona a convenio. **El escenario de red no usa restricción EPS** |
| Disponibilidad en tiempo real (camas libres, especialista, quirófano) | No existe en fuentes públicas; la simula el modelo con supuestos explícitos (F3) |
| Coordenadas | Objeto OSM con el nombre de la sede; si no existe, nomenclatura de la dirección sobre las calles OSM. Si OSM no tiene el cruce exacto se usa el vecino y se marca «verificar». Sin ninguna de las dos, la sede queda en `missing` sin posición ni ruta (hoy: Clínica de Fracturas) |

## Supuestos de modelado (no son hechos)
1. **Celdas combinadas**: se toma la clase más débil (`AD/C` → C, `ER/C` → ER, `NH/ER` → NH) y cualquier `SI` → información insuficiente.
2. **«AD adulto»**: para un paciente menor de 18 años se trata como ER.
3. **Velocidad de la ambulancia**: 30 km/h urbano; tiempo de viaje Lognormal con media = distancia vial / 30 km/h y CV 0,3 (ida y regreso por separado).
4. **Escenario de red** (`networkParams()` en `src/model/params.ts`, parte del realista):
   - Sedes simuladas: las que reciben urgencias, tienen ruta y **camas de adulto documentadas en REPS**: Alta Complejidad (173), ICVC (114), OHI (123), Clínica del Cesar (92), Erasmo (21). Sus camas simuladas = las documentadas.
   - Demanda propia de cada sede: Poisson con ocupación media del **90 %** y estancia Exp(48 h) (supuesto). Sin cama, la demanda propia se pierde (Erlang B, como en el escenario ficticio).
   - Condición de quien se remite (supuesto): IAM 20 %, UCI adulto 20 %, TCE grave 10 %, politrauma 10 %, diálisis aguda 10 %, niño crítico 8 %, crisis psiquiátrica 7 %, emergencia cardiovascular quirúrgica 5 %, quemadura grave 5 %, recién nacido crítico 5 %.
   - Búsqueda y aceptación del destino (CRUE): Lognormal media 30 min, CV 1.
   - Alistamiento, cargue y entrega: Lognormal media 15 min, CV 0,5; la ambulancia sigue ocupada y luego regresa.
   - Espera máxima sin destino: 12 h; después, «remisión fuera de la red».
   - Una sede «C» (condicionada) solo se pide si ninguna «AD» tiene cupo.
   - Sin restricción EPS.

## Motor de remisión (F3)
`src/model/referral.ts` (función pura) evalúa cada sede y devuelve la elegida y el motivo de cada descarte: no recibe urgencias · recepción ER/NH/SI · sin ubicación o sin ruta · capacidad no documentada · saturada. Entre las elegibles gana la AD con la ruta más corta (empate: menor ocupación); si no hay AD con cupo, la C más cercana; si no hay ninguna, el paciente espera y se reevalúa en cada liberación de cama.

Secuencia en el motor (`src/model/ed.ts`, solo cuando `params.network` existe): consulta → pasillo → condición → coordinación CRUE → selección y **reserva de cama** → espera de ambulancia → `TRANSFER_START` (con condición, motivo y alternativas descartadas en `data`) → viaje por la ruta → `TRANSFER_END` → entrega → regreso. Los escenarios de validación y realista no cambian: una prueba compara su registro de eventos con el de T24.

**Corrida de referencia** (semilla 1, 30 días tras 1 de calentamiento): 496 traslados (ICVC 299, Alta Complejidad 192, OHI 5); 0,4 % de las llegadas se remiten fuera de la red, todas por crisis psiquiátrica: San Lucas es la única sede AD aparte del origen y su capacidad no está documentada, así que el modelo no la usa. Clínica del Cesar y Erasmo casi no reciben remisiones porque ICVC y Alta Complejidad, a 1 min de ruta, tienen cupo casi siempre.

**Arranque en equilibrio:** las sedes no empiezan vacías. Su ocupación inicial se sortea de la distribución estacionaria del sistema de pérdida M/M/K/K con su demanda propia (Poisson truncada en K); como la estancia es exponencial, a cada cama ocupada le queda Exp(48 h). Una prueba verifica que la media inicial coincide con a·(1 − B) de Erlang B.

**Limitaciones:** un solo grupo de camas por sede (sin separar UCI adulto, pediátrica y neonatal); la aceptación de una sede C es automática; la ocupación del 90 % es la misma en todas las sedes.

## Cartografía y rutas (F2)
`npm run red-vial` (`tools/valledupar-map.ts`) toma de OpenStreetMap las vías del casco urbano y las sedes de salud (Overpass, solo durante la preparación; la descarga queda en `tools/.cache/`, fuera de Git) y genera:
- `src/model/valledupar/calles.json`: 3552 vías simplificadas (Douglas–Peucker, 3 m), en metros sobre una proyección local. Solo para dibujar.
- `src/model/valledupar/rutas.json`: posición de cada sede con su método y procedencia, y la ruta vial más corta desde el hospital de origen (Dijkstra sobre el grafo OSM, respetando sentidos únicos y glorietas): geometría, distancia de ida, distancia de regreso, distancia en línea recta y tiempo base.

**Control del método por dirección:** en las 4 sedes con objeto OSM la ubicación por nomenclatura queda a 30–54 m del objeto.

| Sede | Ubicación | Vial (km) | Recta (km) | Tiempo base (min) |
|---|---|---|---|---|
| Alta Complejidad | OSM | 0,57 | 0,30 | 1,1 |
| ICVC | dirección ⚠ | 0,51 | 0,27 | 1,0 |
| OHI principal | dirección ⚠ | 0,62 | 0,38 | 1,2 |
| Santa Isabel – OHI | dirección | 1,21 | 0,87 | 2,4 |
| Simón Bolívar | OSM | 2,22 | 1,59 | 4,4 |
| Clínica del Cesar | OSM | 0,81 | 0,41 | 1,6 |
| Clínica Valledupar | OSM | 0,41 | 0,33 | 0,8 |
| Erasmo | dirección ⚠ | 2,96 | 2,29 | 5,9 |
| San Lucas | dirección | 1,36 | 0,92 | 2,7 |
| SOHEC | dirección ⚠ | 0,66 | 0,49 | 1,3 |
| Clínica de Fracturas | sin ubicación | — | — | — |

⚠ = cruce aproximado (error ≤ 1 cuadra), verificar.

**Supuesto:** tiempo base = distancia vial / 30 km/h. Las sedes están concentradas en el centro, así que el viaje es de 1–6 min, mucho menor que los 12–25 min del escenario ficticio. El ciclo de la ambulancia en F3 debe sumar alistamiento, cargue y entrega del paciente (supuesto aparte), no solo el viaje.

## Mapa y remisión visible (F4)
- `?red` en la dirección (o «Red Valledupar» en el selector de modo) carga el escenario. Cambiar de modo recarga la página, porque cambia el número de sedes y el mapa.
- «Ver ciudad» dibuja las calles de OpenStreetMap con Phaser en la misma `CityScene` (sin bibliotecas nuevas ni teselas, funciona sin internet): marcadores por sede coloreados por la ocupación simulada, placas con camas, sedes no simuladas en gris con su motivo, ruta azul del traslado en curso y ambulancia que avanza sobre la geometría de la ruta con el reloj del motor (pausa y velocidad incluidas). Atribución de OSM visible bajo el mapa.
- Clic en una sede simulada: ficha con ocupación, viaje y Erlang B. Clic en una no simulada: hechos documentados y por qué no se simula. Las sedes no tienen interior isométrico (las plantas de T24 son de 30–50 camas).
- La franja «Remisión de la corrida» muestra la condición, el motivo del destino y, desplegable, la evaluación de cada sede. «Seguir ambulancia» acerca el mapa y baja la velocidad a ×6 (los viajes reales son de 1–6 min).
- El ensayo con destino elegido (T23) se oculta en este escenario: usa las clínicas ficticias.

## Entrar a las sedes, pantalla completa y vistas (F6)
- **Entrar a una sede**: clic en la sede → «Entrar a la clínica». Cada sede reutiliza una de las plantas isométricas de T24 como **planta representativa** (no es la arquitectura real), con su nombre real y a lo sumo 30–50 camas dibujadas; la ocupación dibujada se escala (Alta Complejidad: 30 camas dibujadas, cada una ≈ 5,8 camas). El contador muestra siempre las cifras reales del motor.
- **Pantalla completa**: botón «Pantalla completa» o tecla F (no se activa mientras se escribe en un campo o en la máquina); Esc sale. Incluye las franjas de «Mi paciente» y de la remisión.
- **Vistas del mapa** (selector junto a «Ver todo», solo en la red): «Mapa» (calles, ríos, zonas verdes y nombres de las vías principales, de OSM), «Satélite» (Sentinel-2 cloudless 2023, 10 m por píxel, calles semitransparentes encima) y «Solo calles». El río se dibuja más ancho que su cauce para que se vea a la escala de la ciudad. **Satélite en dos capas:** con conexión se piden en vivo las teselas de Esri World Imagery (~0,5 m por píxel, al nivel de detalle del zoom) encima de Sentinel-2, y el acercamiento llega hasta ×10 como en «Mapa». Sin conexión queda Sentinel-2 local (10 m), suavizado y con el acercamiento detenido en ~2 píxeles de pantalla por píxel de imagen; la aplicación no falla, solo reintenta cada 30 s. Esri no se guarda en el repositorio porque sus términos no permiten el uso sin conexión. La autora confirmó que en la feria hay internet (24 nov). No hay imagen libre de alta resolución para Valledupar: OpenAerialMap no tiene cobertura (consulta del 24 nov) y no se encontró una ortoimagen del IGAC publicada; las de Google, Esri o Bing no se pueden guardar para uso sin conexión.

## Parte 2 (T26, P1 del PDF)
- **Indicadores de la red** (pestaña «Gráficas en vivo», solo en `?red`): traslados completados, espera media en el pasillo para remitir, % de llegadas remitidas fuera de la red, uso de ambulancias y tabla por sede (ocupadas ahora, ocupación media, remitidos recibidos). La ocupación de camas se grafica en porcentaje para comparar sedes de 21 a 173 camas.
- **Seguimiento en 4 pasos** (figura C): `src/ui/referral-steps.ts` reconstruye cada remisión desde los eventos del motor (fin de consulta, pasillo, aceptación del destino en `TRANSFER_START.data.acceptedAt`, salida, llegada) y la liberación de la ambulancia desde el estado del recurso.
- **Filtro por condición** en el mapa: anillo verde = atención definitiva documentada, ámbar = condicionada; el resto se atenúa (matriz del informe, sin disponibilidad).

## Pendiente
- Capturas de la red para el póster y el README.

Guía del stand: `docs/GUIA_DEMO_RED.md`.
