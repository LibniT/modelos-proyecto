# Normativa de urgencias y cómo la representa el modelo (T29)

Normas verificadas el 24 nov 2026. Fuentes y URL: [EPS_VALLEDUPAR.md §D](EPS_VALLEDUPAR.md#d-normas-número-artículo-contenido-en-una-línea). **SimUrgencias es un modelo académico.** No es una herramienta clínica ni un sistema de despacho, y su triage es una condición del escenario, no una clasificación oficial.

| Norma | Qué dice (resumen) | Cómo entra al modelo (simplificado) |
|---|---|---|
| Ley 100/1993, art. 168 | La atención inicial de urgencias es obligatoria y no requiere contrato ni orden previa. | Cualquier sede con urgencias habilitadas puede **estabilizar** a cualquier paciente, tenga o no relación con su EPS. |
| Ley 1751/2015, art. 10 lit. b y art. 14 | Urgencias sin pago ni documento previo, y sin autorización administrativa entre IPS y EPS. | La EPS **nunca excluye** una sede: no hay paso de autorización antes de la atención inicial. |
| Decreto 780/2016, arts. 2.5.3.2.1–2.5.3.2.4 | Obligatoriedad y definiciones; la IPS responde por el paciente hasta el alta o la remisión. | En una sede de estabilización el paciente queda a cargo de esa sede hasta que el CRUE encuentre destino. |
| Decreto 780/2016, arts. 2.5.3.2.16 y 2.5.3.2.17 | Referencia y contrarreferencia; funciones del CRUE. | Remisión con **coordinación del CRUE** (demora supuesta) y búsqueda de sede definitiva con cama; si no hay, el CRUE vuelve a buscar hasta 12 h y después el paciente sale «fuera de la red». |
| Res. 5596/2015 | Triage en 5 categorías: I inmediata, II ≤ 30 min. El triage no puede usarse para negar la atención. | El triage del formulario define **paciente crítico** (I–II, o marcado inestable): para él la EPS no cuenta y se limita el tiempo extra frente a la urgencia más cercana. En el hospital de origen, el triage del motor sigue la Res. 5596. |
| Res. 1441/2016 (RIPSS) | Redes integrales de prestadores de las EPS. | La **red documentada de la EPS** solo orienta el destino de un paciente **estable**: va a una sede de su red si llega ≤ 15 min después que la mejor opción (decisión de la autora). |
| Res. 926/2017, Ley 1438/2011 art. 67 | Sistema de Emergencias Médicas: atención prehospitalaria, transporte y centros reguladores. | Grupo de **ambulancias prehospitalarias** propio (2, base en el hospital de origen; supuesto), con tiempo de escena supuesto. |
| Ley 1438/2011 art. 32; Decreto 064/2020 | La persona sin afiliación también se atiende: paga ella si puede; si no, se afilia de oficio o paga la entidad territorial. | Opción **«Sin EPS o desconocida»** en el formulario: se atiende igual y no tiene red preferida. |
| Res. 3100/2019 (habilitación) | Servicios habilitados. **Ojo:** la Res. 1732/2026 la actualiza y deroga, con transición; no se leyó su texto. | Servicios y capacidad de cada sede: REPS e informe hospitalario (`sites.ts`, `capabilities.ts`). |

**Lo que el modelo distingue:**
- **Atención inicial:** cualquier urgencia habilitada.
- **Estabilización:** tiempo supuesto en una sede sin atención definitiva.
- **Atención definitiva:** recepción AD o C y cama simulada libre del tipo requerido.
- **Continuidad del tratamiento:** estancia en la cama de la sede.
- **Coordinación administrativa:** CRUE.
- **Remisión:** segundo traslado en ambulancia.

El modelo no representa la facturación ni los pagos.
