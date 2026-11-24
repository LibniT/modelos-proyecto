# Póster ExpoSoftware 2026-2 · registro de entrega

Fecha: 24 nov 2026. Feria: XXIII Feria Tecnológica ExpoSoftware 2026-2, 26 nov 2026.

## Archivos
| Archivo | Qué es |
|---|---|
| `SimUrgencias_poster_ExpoSoftware_2026-2.pdf` | Póster final para imprimir (1 página, exportado de Canva en calidad «pro», vectorial con imágenes incrustadas). |
| `SimUrgencias_poster_vista_previa.png` | Vista previa 4225 × 5914 px. |
| `SimUrgencias_poster_editable.pptx` | Copia editable exportada de Canva. |
| Canva: «Copia de Plantilla Exposoftware 2026-2», página 3 | Original editable. Todos los títulos, cuadros, flechas, tarjetas y gráficas son formas y textos nativos de Canva. Las únicas imágenes son las capturas de la aplicación, la mascota (generada con Canva IA, aprobada por la autora) y los recursos de la plantilla oficial. |
| `capturas-originales/` | PNG originales tomados de la aplicación (Chrome headless, 1920 × 1500, escala 2). |

**Tamaño:** la plantilla de Canva mide 4225 × 5914 px (proporción 1 : 1,40). El PDF sale a 111,8 × 156,5 cm (96 px por pulgada). Para otro formato con la misma proporción, por ejemplo 100 × 140 cm, se imprime escalado sin recortes. Las páginas 1 y 2 del archivo de Canva son la guía y el ejemplo de la plantilla; solo se exportó la página 3.

## Cómo se obtuvieron las capturas
- `npm run dev` con `?red` (escenario de la red de Valledupar), rama `main` en 0538f0e (T33). No se modificó el motor.
- La aplicación corrió a ×600 hasta un estado estable (≈ 10:00 del día 1). Después se usó la propia interfaz: «Ciudad», «Arrástrame al mapa», formulario del paciente e «Iniciar traslado».
- La paciente es ficticia: «Paciente de la feria», 40–64 años, Nueva EPS, subsidiado, quemadura extensa o grave, triage II, inestable. El punto está sobre la red vial, al noroccidente.

| Captura | Escena |
|---|---|
| 01 | Mapa real (OpenStreetMap) con las 12 sedes y la ambulancia prehospitalaria en camino al paciente (ruta naranja). |
| 02 | Hospital de origen, interior isométrico. |
| 03 | Paciente ubicado: recomendación (Clínica Médicos – Alta Complejidad del Caribe, atención definitiva, 6 min), tabla «Mismo paciente, tres políticas» y ruta verde. |
| 04 | Estadísticas: red hospitalaria de Valledupar (ocupación simulada por unidad) y gráficas del hospital. |
| 05, 06, 07 | Seguimiento del paciente, ficha de institución y remisión del hospital en 4 pasos. Se guardan como respaldo; en el póster va la 07. |

## Cifras verificadas (archivo de origen)
| Cifra en el póster | Fuente |
|---|---|
| 16/16 medidas teóricas dentro del IC 95 % | `docs/VALIDACION.md` (30 réplicas, modelo hospitalario original) |
| Abandono IV–V: 49,1 / 22,1 / 7,2 / 1,6 % con 4 / 5 / 6 / 7 médicos; −47,5 pp | `docs/EXPERIMENTO_MEDICOS.md` (30 réplicas, CRN) |
| Espera Triage II 1,5 min con 6 médicos (1,49 [1,42; 1,56]) | `docs/EXPERIMENTO_MEDICOS.md` |
| 6,5 h de recuperación tras 15 heridos (200 réplicas) | `docs/ACCIDENTE.md` |
| Atención adecuada: 174,1 min (más cercana), 38,1 min (compatible más cercana y menor tiempo); 92,5 % y 1,2 % con segundo traslado; diferencia +136,0 min [116,0; 155,9] | `docs/EXPERIMENTO_PREHOSPITALARIO.md` (20 réplicas × 5 días, CRN) |
| 12 pac/h, 5 niveles de triage | `src/model/params.ts`, `docs/SPEC.md` |
| 12 sedes, 6 con camas simuladas | `docs/RED_VALLEDUPAR.md` |
| 155 pruebas automatizadas | `npm test` del 24 nov (155 pasan) |
| Tecnologías: TypeScript, Phaser 3, Chart.js, Vite, Vitest, Web Workers, OpenStreetMap, Dijkstra | `package.json`, `src/batch`, `src/model/valledupar/router.ts` |
| Res. 5596 de 2015: Triage II ≤ 30 min; el Triage I no pasa por admisión previa | `docs/NORMATIVA.md`, `src/model/ed.ts` (el Triage I salta la admisión) |

## Decisiones
- **Contenido:** el texto es el del PDF de instrucciones, con ajustes mínimos para la evidencia.
  - Las conclusiones distinguen el modelo original (validado con teoría de colas) de la red georreferenciada (verificada con pruebas de propiedades).
  - Una nota de rigor aclara que las capacidades y la ocupación son simuladas y que no es una herramienta clínica.
- **Gráficas:** se priorizó la comparación de políticas, como pedían las instrucciones, y se conservó la de abandono IV–V porque sus datos siguen vigentes.
- **Flujo:** se dibujó el flujo que realmente tiene el motor.
  - Recorrido: ubicación → evaluación → selección → traslado.
  - Si el destino es el hospital de origen: triage, admisión y médico.
  - Si es otra sede: solo cama simulada del tipo requerido.
  - Desenlaces: alta, observación, hospitalización y remisión.
- **Docente:** se conservó la grafía de la plantilla, «Andres Rene Perpiñan Reyes».
- **Integrantes:** el rótulo «Integrantes» es una imagen de la plantilla oficial y no se cambió.
- **Elemento oculto:** queda un texto auxiliar oculto bajo un rectángulo blanco en la gráfica de abandono, sin efecto visual. Su contenido («−47,5 puntos…») se incorporó al subtítulo. Se puede borrar en Canva.

## Pendiente o no verificado
- El PDF se revisó renderizado a baja resolución: sin cortes ni textos tapados. La legibilidad a distancia y los colores en la imprenta los debe confirmar la autora con una prueba impresa.
- No hay experimento de congestión de la red por hora (T34, sin datos con fuente).
