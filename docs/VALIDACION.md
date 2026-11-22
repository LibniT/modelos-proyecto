# Validación del motor SimUrgencias

Generado automáticamente con `npm run report` el 2026-11-22.

**Escenario (modo validación):** λ = 12/h; triage c = 2, E[S] = 4 min; admisión c = 2, E[S] = 5 min; médicos c = 5, E[S] = 20 min; observación K = 18 camas, E[S] = 6 h; mezcla de triage I–V = 2 % / 13 % / 45 % / 30 % / 10 %. Todos los tiempos exponenciales, sin abandono.

**Diseño:** 30 réplicas independientes (semillas 1000–1029), calentamiento de 2 días eliminado, 7 días medidos por réplica. IC del 95 % con t de Student (ν = 29).

**Resultado:** 16 de 16 valores analíticos caen dentro del IC 95 % individual. La prueba automática exige el IC conjunto de Bonferroni (95 % familiar, 16 comparaciones).

| Medida | Fórmula | Analítico | Simulado (media) | IC 95 % | Error rel. | ¿En IC? |
|---|---|---|---|---|---|---|
| Triage: utilización ρ | λ/(cμ) | 0.4000 | 0.3995 | [0.3956, 0.4034] | -0.13 % | sí |
| Triage: espera en cola Wq (min) | Erlang C | 0.7619 | 0.7784 | [0.7339, 0.8229] | 2.17 % | sí |
| Triage: longitud de cola Lq | λ·Wq | 0.1524 | 0.1557 | [0.1463, 0.1651] | 2.17 % | sí |
| Admisión: utilización ρ | λ(1−p₁)/(cμ) | 0.4900 | 0.4874 | [0.4812, 0.4935] | -0.54 % | sí |
| Admisión: espera Wq (min) | Erlang C | 1.580 | 1.598 | [1.505, 1.691] | 1.14 % | sí |
| Médicos: utilización ρ | λ/(cμ) | 0.8000 | 0.8062 | [0.7965, 0.8159] | 0.78 % | sí |
| Médicos: espera Wq (min) | Erlang C | 11.082 | 11.673 | [10.447, 12.899] | 5.33 % | sí |
| Médicos: longitud de cola Lq | λ·Wq | 2.216 | 2.345 | [2.094, 2.597] | 5.80 % | sí |
| Espera Triage I (min) | Cobham | 2.252 | 2.351 | [2.133, 2.570] | 4.38 % | sí |
| Espera Triage II (min) | Cobham | 2.560 | 2.704 | [2.547, 2.861] | 5.63 % | sí |
| Espera Triage III (min) | Cobham | 4.844 | 5.199 | [4.843, 5.556] | 7.34 % | sí |
| Espera Triage IV (min) | Cobham | 15.223 | 16.747 | [14.958, 18.536] | 10.01 % | sí |
| Espera Triage V (min) | Cobham | 39.579 | 39.273 | [32.993, 45.554] | -0.77 % | sí |
| Observación: P(no hay cama) | Erlang B | 0.0723 | 0.0704 | [0.0605, 0.0804] | -2.55 % | sí |
| Observación: camas ocupadas | a·(1−B) | 13.378 | 13.362 | [13.172, 13.552] | -0.12 % | sí |
| Ley de Little: L − λ·W | L = λW | 0.0000 | 0.0324 | [-0.0435, 0.1082] | 0.14 % | sí |

Notas:
- La espera por nivel de triage se compara con la fórmula de Cobham (M/M/c con prioridades sin interrupción y la misma μ en todas las clases).
- En observación, la cama se reserva en el momento de la decisión, así que el tiempo de ocupación es E[S] + traslado interno (0.5 min); Erlang B depende solo de esa media.
- La Ley de Little se verifica sobre la propia trayectoria: L (promedio temporal de pacientes en el sistema) contra λ̂ · Ŵ.

Tiempo de cómputo: 0.6 s.
