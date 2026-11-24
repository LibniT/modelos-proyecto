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
| Coordenadas | Se toman de OpenStreetMap en F2; las que no se encuentren se marcan «verificar» |

## Supuestos de modelado (no son hechos)
1. **Celdas combinadas**: se toma la clase más débil (`AD/C` → C, `ER/C` → ER, `NH/ER` → NH) y cualquier `SI` → información insuficiente.
2. **«AD adulto»**: para un paciente menor de 18 años se trata como ER.
3. Los demás supuestos (mezcla de condiciones de los remitidos, camas que cada sede ofrece a la red, demanda propia, retardo de coordinación del CRUE, velocidad de la ambulancia, espera máxima antes de remitir fuera de la red) se documentan aquí cuando se implementen (F2–F3).

## Pendiente
- F2: coordenadas y calles de OpenStreetMap (ODbL, atribución visible), rutas viales precalculadas.
- F3: selección del destino por compatibilidad, capacidad simulada y ruta.
