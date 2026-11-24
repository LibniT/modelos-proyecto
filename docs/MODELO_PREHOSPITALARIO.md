# Modelo prehospitalario: rutas, tráfico y selección hospitalaria (T28–T30)

Escenario académico (`?red`). **No describe la disponibilidad real de ninguna institución ni el tráfico real de Valledupar.**

## Rutas (T28)

- **Grafo:** `npm run red-vial` exporta `src/model/valledupar/grafo.json` desde OpenStreetMap (ODbL). Tiene 8 292 intersecciones y 12 952 aristas. Solo entra la **componente fuertemente conexa** principal: desde cualquier punto aceptado se puede ir y volver. Se descartan las vías `access=private/no`. Cada arista guarda longitud, clase de vía, sentido único (`oneway`, rotondas) y geometría.
- **Validación del punto (`place`):**
  - fuera del área cubierta: rechazado;
  - en el agua (polígonos OSM o ±20 m de la línea del río): rechazado, con la vía más cercana propuesta;
  - a más de 150 m de una vía: igual que el agua;
  - en los demás casos se ajusta al **segmento** más cercano, a mitad de cuadra (rejilla espacial de 100 m).
- **Rutas (`routesFrom`):** un Dijkstra **por tiempo** desde el punto da la ruta a todas las sedes a la vez. Se arranca y se llega a mitad de cuadra solo en el sentido permitido. Cada ruta devuelve geometría, metros y minutos. Si no hay camino en el grafo, la ruta es `null`: no se inventan rutas.
  - A* no hace falta: es una búsqueda a varios destinos.
  - OSRM, GraphHopper y Valhalla exigen un servidor y tampoco tienen tráfico real.
- **No modelado:** restricciones de giro (las relaciones OSM no están en el cache).
- **Rutas de remisión:** desde T28, las rutas del hospital de origen a las sedes también salen del router, con la misma velocidad por clase. Por eso los tiempos de remisión de T27 cambiaron (ver `EXPERIMENTO_RED.md` al regenerarlo).

## Tráfico (supuestos de simulación)

No se encontraron aforos ni velocidades públicas de Valledupar. Google Routes no sirve aquí:
- restringe guardar sus resultados;
- exige mostrarlos en un mapa de Google o con su atribución;
- requiere clave, facturación e internet.

Por eso el tráfico es **simulado**:

| Clase de vía | Velocidad de la ambulancia, tráfico fluido (km/h) | × moderado | × congestionado |
|---|---|---|---|
| troncal | 50 | 1,30 | 1,80 |
| primaria | 45 | 1,30 | 1,80 |
| secundaria | 40 | 1,25 | 1,70 |
| terciaria | 35 | 1,20 | 1,50 |
| sin clasificar | 30 | 1,15 | 1,35 |
| residencial | 25 | 1,10 | 1,20 |
| servicio | 15 | 1,05 | 1,10 |

El factor multiplica el tiempo de cada arista. Así, con congestión, el algoritmo puede preferir calles menores. **Son supuestos, no mediciones.**

## Paciente prehospitalario en el motor (T30)

1. El visitante coloca al paciente (punto validado), con condición, edad, EPS, triage del escenario y estabilidad.
2. **Selección** (`src/model/prehospital.ts`). Cada sede queda clasificada como **definitiva**, **solo estabiliza y remite**, **información insuficiente** o **no compatible**, con sus motivos. El tiempo estimado hasta la atención adecuada es:
   - definitiva: ruta;
   - estabilización: ruta + estabilización (60 min) + CRUE (30 min) + ruta a la mejor sede definitiva con cama.
3. Las **tres políticas** se calculan siempre, para comparar:
   - *más cercana* (urgencia de menor ruta);
   - *compatible más cercana* (definitiva de menor ruta);
   - *menor tiempo hasta la atención adecuada* (la que usa el motor).
4. **EPS** (decisión de la autora):
   - **paciente crítico** (triage I–II o inestable): la EPS no cuenta, y si la mejor definitiva queda a más de 10 min de la urgencia más cercana, se estabiliza primero;
   - **paciente estable**: va a una sede de la red documentada de su EPS si llega ≤ 15 min después que la mejor.
5. **Ambulancia:** grupo **prehospitalario propio** de 2 ambulancias con base en el hospital de origen, en cola FIFO. Las 2 de remisión de T27 no cambian. El viaje es determinista (minutos de la ruta). La escena es lognormal (media 12 min). Al llegar hay una entrega lognormal (15 min) y después el regreso a la base. Sin ambulancia («por sus medios»), el tiempo es la ruta × 1,5.
6. **Destino:**
   - **hospital de origen:** el paciente entra por la bahía de ambulancias al flujo completo de urgencias y **reemplaza la próxima llegada aleatoria**, así que λ se conserva (prueba: mismo número de llegadas con y sin el paciente);
   - **otra sede con atención definitiva:** ocupa una cama del tipo que necesita, reservada al decidir. En las otras sedes no se modelan triage ni consulta, y se avisa en pantalla;
   - **sede de estabilización:** estabilización → CRUE → segunda ambulancia a la definitiva. Si no hay cama, el CRUE vuelve a buscar hasta 12 h y después el paciente sale «fuera de la red».
7. **Eventos:** se usan solo los tipos del contrato congelado. Los tramos son `TRANSFER_START`/`TRANSFER_END` con `data.prehospital`, `data.leg` y `data.path`; la cama es `BED_ASSIGNED`. La historia exacta de cada caso está en `ed.prehospitalCases()`.
8. **Aleatoriedad:** flujo nuevo `prehospital`. Los flujos y la huella de regresión de los escenarios originales no cambian.

## Pruebas

- `tests/valledupar-router.test.ts`: sedes, área, río, rutas por vías existentes, contravía y tráfico.
- `tests/prehospital.test.ts`:
  - políticas, paciente crítico, EPS ≤ 15 min, «sin convenio no excluye», sin destino;
  - orden de los tiempos y duración de los eventos;
  - conservación de λ, ambulancia ocupada;
  - reproducibilidad y camas ≤ capacidad.
