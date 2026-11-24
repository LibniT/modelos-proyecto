# Guía de demostración — Red hospitalaria de Valledupar (T25)

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
2. **La red real (mapa).** Pulsa **Ver ciudad**. «Las calles salen de OpenStreetMap y las sedes, del registro oficial de prestadores (REPS). El color de cada sede es su ocupación **simulada**, no la real.» Señala una sede gris: «Esta no se simula porque no encontramos su número de camas, y no lo inventamos.»
3. **Una remisión.** Espera a que aparezca la franja **Remisión de la corrida** (en promedio una cada 1–2 min a ×60; a ×600 sale más rápido) y pulsa **Seguir ambulancia**. El mapa se acerca, baja a ×6 y la ambulancia recorre la ruta vial azul.
4. **Por qué ese destino.** La franja muestra los 4 pasos de la remisión (Atención → Selección → Traslado → Recepción) con la hora simulada de cada uno; el paso activo va resaltado. Despliega «Por qué…»: condición del paciente, motivo («atención definitiva, camas libres, ruta más corta») y por qué se descartó cada sede (ruta más larga, saturada, capacidad no documentada, no habilitada para esa condición).
5. **Una ficha y su interior.** Clic en una sede: ocupación, viaje y probabilidad de encontrarla llena (Erlang B); «Entrar a la clínica» muestra su planta representativa (aclarar que no es el edificio real). En una gris: los datos documentados y el motivo de no simularla.
   **Filtro:** en el selector «Todas las sedes» elige «Quemadura extensa o grave»: solo Alta Complejidad queda con anillo verde (atención definitiva); las demás se atenúan. Prueba también «Niño crítico» o «Infarto».
   **Vistas:** cambia el selector a «Satélite» para mostrar la ciudad real (con internet se ve nítida de cerca; sin internet, la imagen local de 10 m) y vuelve a «Mapa». Tecla **F** para pantalla completa (Esc sale).
6. **Indicadores de la red.** Pestaña **Gráficas en vivo**: traslados, espera para remitir, remitidos fuera de la red, uso de ambulancias y una tabla por sede; la ocupación de camas se grafica en porcentaje.
7. **Validación.** Pestaña **Validación**: el modelo original pasa 16 de 16 comparaciones con la teoría de colas. «La red real es un escenario aparte; el modelo validado no cambió.»

## Cifras para conversar (corrida de 30 días, semilla 1)
- 464 traslados en 30 días: Instituto Cardiovascular 274, Alta Complejidad 178, OHI 11, Clínica del Cesar 1. Las sedes del centro están a 0,4–3 km del origen (1–6 min de viaje).
- 0,36 % de las llegadas se remiten fuera de la red: crisis psiquiátricas, porque la única sede con atención definitiva (San Lucas) no tiene capacidad documentada.
- La única unidad de quemados documentada es la de Alta Complejidad; el modelo nunca envía una quemadura grave a otra sede.

## Lo que hay que decir si preguntan
- **Es académico.** La ocupación y la aceptación del destino son simuladas con supuestos explícitos (`docs/RED_VALLEDUPAR.md`); no sirve para decidir traslados reales. En la vida real decide el CRUE.
- **EPS.** En la red real no se filtra por EPS: no hay una fuente confiable de contratos y la urgencia no se condiciona a convenio.
- **Ubicaciones.** Salen de OpenStreetMap (objeto o dirección) y se contrastaron una por una con Google Maps; todas quedaron a menos de 100 m, salvo el Instituto Cardiovascular y la Clínica de Fracturas, que se ubicaron con Google Maps.

## Si algo falla
- Pantalla congelada o rara: recargar (F5 del navegador). El motor arranca de nuevo a las 08:00.
- Sin remisiones a la vista: subir a ×600 un momento y volver a ×60.
- Plan B: el escenario original sin `?red` (probado desde T13) y el video de respaldo.

