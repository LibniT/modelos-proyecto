# Experimento: red hospitalaria de Valledupar (T27)

Generado automáticamente con `npm run red-experimento` el 2026-11-24.

**Pregunta:** ¿qué limita más el tiempo que un paciente espera en el pasillo para ser remitido: las ambulancias, la coordinación con el CRUE o la aceptación de las sedes?

**Diseño:** escenario de red (`?red`): sedes reales con una unidad por tipo de cama documentado (camas de adulto, UCI adulto, pediátrica y neonatal, quemados), ocupación propia del 90 % (supuesto), selección del destino por compatibilidad, cama del tipo que la condición necesita y ruta vial, aceptación simulada (AD 85 %, C 50 %; supuesto). 30 réplicas por escenario, calentamiento de 1 día eliminado, 7 días medidos; IC del 95 % con t de Student (ν = 29). **Números aleatorios comunes:** la réplica *i* de todos los escenarios usa la semilla 5000 + *i*; las diferencias contra el escenario actual se estiman réplica a réplica.

![Espera en el pasillo por escenario](figuras/t27-red.svg)

## Resultados por escenario (media [IC 95 %])

| Escenario | Espera en el pasillo hasta la ambulancia (min) | Remitidos fuera de la red (% de llegadas) | Traslados por día | Uso de ambulancias (%) |
|---|---|---|---|---|
| 1 ambulancia | 81,6 [74,7; 88,6] | 0,42 [0,37; 0,48] | 16,1 [15,6; 16,7] | 19,8 [19,0; 20,5] |
| 2 ambulancias (actual) | 77,9 [71,8; 84,1] | 0,43 [0,39; 0,48] | 16,6 [15,9; 17,3] | 10,1 [9,7; 10,5] |
| 3 ambulancias | 77,7 [72,7; 82,8] | 0,43 [0,38; 0,48] | 16,6 [16,0; 17,3] | 6,8 [6,5; 7,0] |
| CRUE 15 min | 72,8 [67,0; 78,6] | 0,45 [0,40; 0,49] | 16,6 [16,0; 17,1] | 10,1 [9,7; 10,5] |
| CRUE 60 min | 89,9 [83,7; 96,2] | 0,40 [0,36; 0,45] | 16,1 [15,4; 16,7] | 9,8 [9,4; 10,2] |
| Aceptación total | 75,3 [69,6; 80,9] | 0,44 [0,38; 0,50] | 16,7 [16,1; 17,4] | 10,2 [9,8; 10,7] |
| Sedes al 70 % | 62,8 [58,1; 67,5] | 0,33 [0,30; 0,37] | 17,5 [16,9; 18,1] | 10,6 [10,2; 11,0] |

## Diferencias pareadas contra el escenario actual

| Escenario − actual | Δ espera (min) | ¿Signif.? | Var. CRN / indep. | Δ fuera de la red (pp) | ¿Signif.? |
|---|---|---|---|---|---|
| 1 ambulancia | 3,7 [-2,4; 9,8] | no | 0,43 | -0,01 [-0,06; 0,04] | no |
| 3 ambulancias | -0,2 [-4,2; 3,8] | no | 0,25 | -0,00 [-0,04; 0,04] | no |
| CRUE 15 min | -5,1 [-11,7; 1,5] | no | 0,61 | 0,01 [-0,03; 0,06] | no |
| CRUE 60 min | 12,0 [5,6; 18,5] | sí | 0,54 | -0,03 [-0,10; 0,03] | no |
| Aceptación total | -2,6 [-8,2; 2,9] | no | 0,44 | 0,01 [-0,05; 0,06] | no |
| Sedes al 70 % | -15,1 [-22,2; -8,0] | sí | 0,84 | -0,10 [-0,15; -0,04] | sí |

"Var. CRN / indep." = Var(X − Y) / (Var X + Var Y): fracción de la varianza que queda al comparar con números aleatorios comunes.

## Lectura

- **Ambulancias:** con 1 la espera es 81,6 min; con 3, 77,7 min (actual: 77,9 min); diferencias no significativas. Las ambulancias se usan el 10 % del tiempo: no son el cuello de botella.
- **CRUE:** pasar de 30 a 15 min de coordinación cambia la espera en -5,1 min (no significativo); a 60 min, en 12,0 min (sí significativo).
- **Aceptación:** si todas las sedes aceptaran a la primera, la espera cambiaría en -2,6 min (no significativo).
- **Camas:** con las sedes al 70 % de ocupación en vez del 90 %, la espera cambia en -15,1 min (sí significativo) y los remitidos fuera de la red en -0,10 pp.
- **Fuera de la red** (corrida de 30 días, semilla 1): Crisis psiquiátrica estable 26, Quemadura extensa o grave 11, Niño crítico 2.
- La espera incluye a quienes quedaron en el pasillo por falta de cama de observación en el hospital de origen.

Escenario académico: capacidades documentadas (REPS); ocupación, aceptación, tiempos de coordinación y de entrega son supuestos. No describe la disponibilidad real de ninguna institución.

Tiempo de cómputo: 11.0 s.
