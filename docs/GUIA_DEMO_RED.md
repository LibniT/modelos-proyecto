# Guía de demostración — Red hospitalaria de Valledupar (T25–T33)

Para el stand de ExpoSoftware. Duración: 3–4 min. Funciona sin internet.

## Antes de abrir el stand
```
npm run build
npm run preview
```
Abrir `http://localhost:4173/?red` (Vite puede usar 4174 o 4175 si 4173 está ocupado: mira la consola). Para el escenario original, la misma dirección sin `?red`, o elegir el modo en el panel (cambiar de modo recarga la página).

Comprobado el 24 nov: `npm run preview` sin conexión, con recarga, solo carga archivos locales y no muestra errores en la consola.

## Recorrido sugerido
1. **El problema (hospital).** Arranca en el plano del hospital a ×60. «Es un simulador de eventos discretos del servicio de urgencias. Cada paciente que se mueve sale del motor; nada es animación de adorno.»
2. **La red real (mapa).** Pulsa **Ciudad** en la barra superior. «Las calles salen de OpenStreetMap y las sedes, del registro oficial de prestadores (REPS). El color de cada sede es su ocupación **simulada**, no la real.» Señala una sede gris: «Esta no se simula porque no encontramos su número de camas, y no lo inventamos.»
3. **El paciente del profesor (fase 2).** Arrastra el muñeco **«Arrástrame al mapa»** (abajo a la derecha) y suéltalo en cualquier punto, por ejemplo cerca del río Guatapurí. También funciona hacer clic en el muñeco y luego en el mapa.
   - **Punto no válido:** si cae en el río, el sistema lo advierte y propone la vía accesible más cercana.
   - **Formulario:** elige la condición (p. ej. «Infarto con posible angioplastia»), el triage del escenario, si está estable y la EPS.
   - **Recomendación:** el panel muestra la sede recomendada y el porqué. La tabla **«Mismo paciente, tres políticas»** compara la más cercana, la compatible más cercana y el menor tiempo hasta la atención adecuada. «La más cercana puede ser la peor si solo estabiliza: el paciente necesita un segundo traslado. Eso es el paseo de la muerte.»
   - **Instituciones evaluadas:** el desplegable da el motivo de cada una (servicio, cama simulada, ruta, relación documentada con la EPS).
   - **Traslado:** **Iniciar traslado**. La ambulancia sale del hospital de origen (ruta naranja), llega al paciente y lo lleva (ruta roja), y el **Seguimiento del paciente** marca cada etapa con la hora del motor.
   - **Regla de la EPS:** paciente estable → la red documentada de su EPS si llega ≤ 15 min después; paciente crítico → la EPS no cuenta.
4. **Una remisión del hospital.** Espera a que aparezca la franja **Remisión desde el hospital de origen** (en promedio una cada 1–2 min a ×60; a ×600 sale más rápido) y pulsa **Seguir ambulancia**. El mapa se acerca, baja a ×6 y la ambulancia recorre la ruta vial azul.
   El selector de la franja permite fijar una remisión activa o del historial.
5. **Por qué ese destino.** La franja muestra los 4 pasos de la remisión (Atención → Selección → Traslado → Recepción) con la hora simulada de cada uno; el paso activo va resaltado. Despliega «Por qué…»: condición del paciente, motivo («atención definitiva, camas libres, ruta más corta») y por qué se descartó cada sede (ruta más larga, saturada, capacidad no documentada, no habilitada para esa condición).
6. **Una ficha y su interior.** Clic en una sede, o búscala en «Buscar institución». La ficha tiene pestañas: General, Servicios, EPS, Capacidad y Fuentes. ● marca lo documentado, ◌ lo simulado y ? lo desconocido. «Entrar a la clínica» muestra su planta representativa (aclarar que no es el edificio real).
   **Paciente en su cama (T36):** crea un paciente en el mapa con «Fractura aislada», estable, sin EPS y política «Más cercana» (en el sur suele ir a OHI) y pulsa **Iniciar traslado**. Entra a esa sede: su cama aparece **reservada** (amarilla) con un alfiler rojo; cuando llega, el paciente aparece acostado. **Clic en la cama** → nombre, triage, condición, hora de reserva y de llegada, y hasta cuándo dura su estancia simulada. Clic en otra cama ocupada: «demanda propia de la sede, sin nombre». «El motor sigue con nombre a los pacientes que nosotros movemos; la demanda propia de cada clínica solo se cuenta.» (Alfiler azul = remitido desde urgencias; en la red esas remisiones van a UCI, que no tiene planta, así que se ven sobre todo en el modo original.)
   **Cafetería del hospital:** pasa el puntero sobre una persona de la cafetería: «Acompañante de …». Llega con un paciente real (≈ 40 %, supuesto) y se va cuando ese paciente sale del servicio.
   **Filtro:** en el selector «Todas las sedes» elige «Quemadura extensa o grave»: solo Alta Complejidad queda con anillo verde (atención definitiva); las demás se atenúan. Prueba también «Niño crítico» o «Infarto».
   **Vistas:** cambia el selector a «Satélite» para mostrar la ciudad real (con internet se ve nítida de cerca; sin internet, la imagen local de 10 m) y vuelve a «Mapa». Tecla **F** para pantalla completa (Esc sale).
7. **Indicadores de la red.** Pestaña **Estadísticas**: traslados, espera para remitir, remitidos fuera de la red, uso de ambulancias y una tabla por sede; la ocupación de camas se grafica en porcentaje.
8. **Validación.** Pestaña **Validación**: el modelo original pasa 16 de 16 comparaciones con la teoría de colas. «La red real es un escenario aparte; el modelo validado no cambió.»

## Cifras para conversar (corrida de 30 días, semilla 1)
- 456 traslados en 30 días, todos a camas de UCI o de quemados (cada sede simula por separado cada tipo de cama documentado). Las sedes del centro están a 0,4–3 km del origen (1–6 min de viaje).
- 0,57 % de las llegadas se remiten fuera de la red: crisis psiquiátricas, porque la única sede con atención definitiva (San Lucas) no tiene capacidad documentada.
- La única unidad de quemados documentada es la de Alta Complejidad; el modelo nunca envía una quemadura grave a otra sede.

- **Experimento de remisiones** (`docs/EXPERIMENTO_RED.md`): más ambulancias de remisión no reducen la espera para remitir (se usan el 10 % del tiempo). Sí la reducen bajar la ocupación de las sedes (−16 min) y la demora del CRUE (a 60 min la sube 15 min).
- **Experimento del paciente en el mapa** (`docs/EXPERIMENTO_PREHOSPITALARIO.md`, 20 réplicas con números aleatorios comunes):
  - **Más cercana:** 92 % de los pacientes necesita un segundo traslado, y la atención adecuada llega ≈ 174 min después de la llamada, frente a ≈ 38 min con la política del simulador (+136 min, significativo).
  - **Tráfico congestionado:** +13 min.
  - **Ambulancias:** con 1 colapsa; con 3, −8,5 min.
  - **Sector:** la periferia espera ≈ 12 min más que el centro.

## Lo que hay que decir si preguntan
- **Es académico.** La ocupación y la aceptación del destino son simuladas con supuestos explícitos (`docs/RED_VALLEDUPAR.md`); no sirve para decidir traslados reales. En la vida real decide el CRUE.
- **EPS.**
  - Hay 8 EPS reales con presencia confirmada en Valledupar y 18 relaciones EPS–clínica con fuente (`docs/EPS_VALLEDUPAR.md`); el resto es «información insuficiente», que no significa «sin convenio».
  - La EPS nunca impide la atención de urgencias (Ley 100 art. 168, Ley 1751 art. 14). Solo orienta el destino de un paciente estable.
  - Los pacientes aleatorios muestran «EPS no simulada» porque no hay cifras oficiales de afiliados por EPS en el municipio.
- **Tráfico.** No hay datos públicos de tráfico de Valledupar. Las velocidades por tipo de vía y los escenarios fluido, moderado y congestionado son supuestos, y no se usa Google.
- **Paciente del mapa en otra sede.** En las otras sedes solo se simulan las camas, sin triage ni consulta. El recorrido completo por dentro se ve cuando el destino es el hospital de origen.
- **Ubicaciones.** Salen de OpenStreetMap (objeto o dirección) y se contrastaron una por una con Google Maps; todas quedaron a menos de 100 m, salvo el Instituto Cardiovascular y la Clínica de Fracturas, que se ubicaron con Google Maps.

## Si algo falla
- Pantalla congelada o rara: recargar (F5 del navegador). El motor arranca de nuevo a las 08:00.
- Sin remisiones a la vista: subir a ×600 un momento y volver a ×60.
- Plan B: el escenario original sin `?red` (probado desde T13) y el video de respaldo.

