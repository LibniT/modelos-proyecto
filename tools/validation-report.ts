/**
 * Genera docs/VALIDACION.md: tabla analítico vs simulado con IC 95 %.
 * Uso: npm run report
 */
import { writeFileSync } from 'node:fs';
import { runReplications } from '../src/batch/replicate';
import { validationParams } from '../src/model/params';
import { validationMarkdown, validationTable } from '../src/validation/report';

const p = validationParams();
const n = 30;
const measureDays = 7;
const t0 = Date.now();
const res = runReplications({ params: p, n, seedBase: 1000, measure: measureDays * 1440 });
const rows = validationTable(p, res);
const ok = rows.filter((r) => r.inCI).length;

const md = `# Validación del motor SimUrgencias

Generado automáticamente con \`npm run report\` el ${new Date().toISOString().slice(0, 10)}.

**Escenario (modo validación):** λ = ${p.arrivalRatePerHour}/h; triage c = ${p.capacity.triage}, E[S] = 4 min; admisión c = ${p.capacity.admission}, E[S] = 5 min; médicos c = ${p.capacity.doctors}, E[S] = 20 min; observación K = ${p.capacity.obsBeds} camas, E[S] = 6 h; mezcla de triage I–V = ${p.triageMix.map((x) => (x * 100).toFixed(0) + ' %').join(' / ')}. Todos los tiempos exponenciales, sin abandono.

**Diseño:** ${n} réplicas independientes (semillas 1000–${1000 + n - 1}), calentamiento de ${p.warmup / 1440} días eliminado, ${measureDays} días medidos por réplica. IC del 95 % con t de Student (ν = ${n - 1}).

**Resultado:** ${ok} de ${rows.length} valores analíticos caen dentro del IC 95 % individual. La prueba automática exige el IC conjunto de Bonferroni (95 % familiar, ${rows.length} comparaciones).

${validationMarkdown(rows)}

Notas:
- La espera por nivel de triage se compara con la fórmula de Cobham (M/M/c con prioridades sin interrupción y la misma μ en todas las clases).
- En observación, la cama se reserva en el momento de la decisión, así que el tiempo de ocupación es E[S] + traslado interno (${p.transit} min); Erlang B depende solo de esa media.
- La Ley de Little se verifica sobre la propia trayectoria: L (promedio temporal de pacientes en el sistema) contra λ̂ · Ŵ.

Tiempo de cómputo: ${((Date.now() - t0) / 1000).toFixed(1)} s.
`;
writeFileSync('docs/VALIDACION.md', md);
console.log(md);
