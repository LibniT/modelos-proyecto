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
3. Los demás supuestos (mezcla de condiciones de los remitidos, camas que cada sede ofrece a la red, demanda propia, retardo de coordinación del CRUE, velocidad de la ambulancia, espera máxima antes de remitir fuera de la red) se documentan aquí cuando se implementen (F2–F3).

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

## Pendiente
- F3: selección del destino por compatibilidad, capacidad simulada y ruta.
- F4: mapa real en `CityScene` con la atribución de OSM visible.
