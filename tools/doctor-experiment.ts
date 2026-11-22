/**
 * T14 — Experimento de escenarios: 4, 5, 6 y 7 médicos con números aleatorios comunes.
 * Genera docs/EXPERIMENTO_MEDICOS.md y docs/figuras/t14-medicos.svg (para el póster).
 * Uso: npm run experiment
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { doctorExperiment, type ScenarioRow } from '../src/batch/experiment';
import { realisticParams } from '../src/model/params';
import type { Interval } from '../src/validation/ci';

const p = realisticParams();
const DOCTORS = [4, 5, 6, 7];
const BOUND = 20; // cota: con 20 médicos la cola del médico es prácticamente nula
const REF = p.capacity.doctors;
const n = 30;
const measureDays = 7;
const seedBase = 2000;
const keys = ['doctor.Wq.L2', 'triageII.compliance', 'doorToDoctor', 'renege.frac', 'doctor.rho', 'admission.Wq'];

const t0 = Date.now();
const rows = doctorExperiment({ base: p, doctors: [...DOCTORS, BOUND], reference: REF, n, seedBase, measure: measureDays * 1440, keys });
const main = rows.filter((r) => r.doctors !== BOUND);
const bound = rows.find((r) => r.doctors === BOUND)!;

const num = (x: number, d = 2) => x.toFixed(d).replace('.', ',');
const ci = (i: Interval, d = 2) => `${num(i.mean, d)} [${num(i.lo, d)}; ${num(i.hi, d)}]`;
const pct = (i: Interval, d = 1) => `${num(i.mean * 100, d)} [${num(i.lo * 100, d)}; ${num(i.hi * 100, d)}]`;
const sig = (i: Interval) => (i.lo > 0 || i.hi < 0 ? 'sí' : 'no');

const label = (r: ScenarioRow) => (r.doctors === BOUND ? `${BOUND} (cota)` : `${r.doctors}${r.doctors === REF ? ' (actual)' : ''}`);
const tableMain = [
  '| Médicos | Espera Triage II (min) | Cumplimiento Triage II (%) | Puerta–médico (min) | Abandono IV–V (%) | Utilización médicos (%) |',
  '|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${label(r)} | ${ci(r.ci['doctor.Wq.L2'])} | ${pct(r.ci['triageII.compliance'])} | ${ci(r.ci['doorToDoctor'], 1)} | ${pct(r.ci['renege.frac'])} | ${pct(r.ci['doctor.rho'])} |`,
  ),
].join('\n');

const tableDiff = [
  `| Médicos | Δ espera Triage II (min) | ¿Signif.? | Var. CRN / indep. | Δ cumplimiento (pp) | ¿Signif.? | Var. CRN / indep. |`,
  '|---|---|---|---|---|---|---|',
  ...main
    .filter((r) => r.doctors !== REF)
    .map((r) => {
      const w = r.diff['doctor.Wq.L2'];
      const c = r.diff['triageII.compliance'];
      const cpp = { ...c, mean: c.mean * 100, lo: c.lo * 100, hi: c.hi * 100 };
      return `| ${r.doctors} − ${REF} | ${ci(w)} | ${sig(w)} | ${num(r.varRatio['doctor.Wq.L2'])} | ${ci(cpp)} | ${sig(c)} | ${num(r.varRatio['triageII.compliance'])} |`;
    }),
].join('\n');

// ---------- Figura SVG: dos paneles con media e IC 95 % ----------
function panel(x0: number, title: string, yLabel: string, vals: Interval[], yMin: number, yMax: number, ticks: number[], band?: number): string {
  const W = 360, H = 260, L = 50, B = 40, T = 30;
  const px = (i: number) => x0 + L + 30 + i * ((W - L - 60) / (vals.length - 1));
  const py = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
  let s = `<text x="${x0 + W / 2}" y="18" text-anchor="middle" font-weight="bold">${title}</text>`;
  s += `<line x1="${x0 + L}" y1="${T}" x2="${x0 + L}" y2="${H - B}" stroke="#333"/><line x1="${x0 + L}" y1="${H - B}" x2="${x0 + W - 10}" y2="${H - B}" stroke="#333"/>`;
  for (const t of ticks) s += `<line x1="${x0 + L - 4}" y1="${py(t)}" x2="${x0 + W - 10}" y2="${py(t)}" stroke="#ddd"/><text x="${x0 + L - 8}" y="${py(t) + 4}" text-anchor="end">${num(t, 0)}</text>`;
  if (band !== undefined) s += `<line x1="${x0 + L}" y1="${py(band)}" x2="${x0 + W - 10}" y2="${py(band)}" stroke="#d97706" stroke-dasharray="5 4"/><text x="${x0 + W - 12}" y="${py(band) - 5}" text-anchor="end" fill="#d97706">cota (${BOUND} médicos)</text>`;
  s += `<text transform="translate(${x0 + 14} ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${yLabel}</text>`;
  vals.forEach((v, i) => {
    const x = px(i);
    s += `<line x1="${x}" y1="${py(v.lo)}" x2="${x}" y2="${py(v.hi)}" stroke="#1d4ed8" stroke-width="2"/>`;
    s += `<line x1="${x - 6}" y1="${py(v.lo)}" x2="${x + 6}" y2="${py(v.lo)}" stroke="#1d4ed8" stroke-width="2"/><line x1="${x - 6}" y1="${py(v.hi)}" x2="${x + 6}" y2="${py(v.hi)}" stroke="#1d4ed8" stroke-width="2"/>`;
    s += `<circle cx="${x}" cy="${py(v.mean)}" r="4" fill="#1d4ed8"/>`;
    s += `<text x="${x}" y="${H - B + 18}" text-anchor="middle">${DOCTORS[i]}</text>`;
  });
  s += `<text x="${x0 + L + (W - L) / 2}" y="${H - 4}" text-anchor="middle">Médicos</text>`;
  return s;
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const waits = main.map((r) => r.ci['doctor.Wq.L2']);
const comps = main.map((r) => ({ ...r.ci['triageII.compliance'] })).map((c) => ({ ...c, mean: c.mean * 100, lo: c.lo * 100, hi: c.hi * 100 }));
const wMax = Math.ceil(Math.max(...waits.map((w) => w.hi)));
const cMin = Math.floor(Math.min(...comps.map((c) => c.lo))) - 1;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 270" font-family="sans-serif" font-size="12" fill="#222">
<rect width="740" height="270" fill="white"/>
${panel(0, 'Espera por médico, Triage II', 'minutos', waits, 0, wMax, range(0, wMax))}
${panel(380, 'Cumplimiento Triage II (≤ 30 min)', '% (el eje no empieza en 0)', comps, cMin, 100, range(cMin, 100).filter((t) => (100 - t) % 2 === 0), bound.ci['triageII.compliance'].mean * 100)}
</svg>`;

mkdirSync('docs/figuras', { recursive: true });
writeFileSync('docs/figuras/t14-medicos.svg', svg);

const md = `# Experimento: número de médicos (T14)

Generado automáticamente con \`npm run experiment\` el ${new Date().toISOString().slice(0, 10)}.

**Pregunta:** ¿cuántos médicos necesita el servicio para atender a tiempo el Triage II (Res. 5596 de 2015: ≤ 30 min)?

**Diseño:** modo realista (perfil horario NHPP con λ media = ${p.arrivalRatePerHour}/h, consulta Gamma con media 20 min y CV 0,6, abandono en IV–V); triage c = ${p.capacity.triage}, admisión c = ${p.capacity.admission}, ${p.capacity.obsBeds} camas de observación. Escenarios: ${DOCTORS.join(', ')} médicos, más ${BOUND} médicos como cota (cola del médico prácticamente nula). ${n} réplicas por escenario, calentamiento de ${p.warmup / 1440} día eliminado, ${measureDays} días medidos. IC del 95 % con t de Student (ν = ${n - 1}).

**Números aleatorios comunes (CRN):** la réplica *i* de todos los escenarios usa la semilla ${seedBase} + *i*. Cada proceso aleatorio (llegadas, mezcla de triage, servicio de cada estación, enrutamiento, paciencia…) tiene su propio flujo, así que las llegadas y sus niveles de triage son idénticos entre escenarios. Las diferencias contra el escenario actual (${REF} médicos) se estiman réplica a réplica (IC pareado).

![Espera y cumplimiento del Triage II según el número de médicos](figuras/t14-medicos.svg)

## Resultados por escenario (media [IC 95 %])

${tableMain}

## Diferencias pareadas contra ${REF} médicos (media [IC 95 %])

${tableDiff}

"Var. CRN / indep." = Var(X − Y) / (Var X + Var Y): la fracción de la varianza de la diferencia que queda al usar CRN frente a réplicas independientes. Un valor de 0,10 equivale a necesitar unas 10 veces menos réplicas para la misma precisión.

En la figura los IC del cumplimiento de escenarios vecinos se solapan, pero las diferencias pareadas son todas significativas: comparar escenarios réplica a réplica (CRN) elimina la variabilidad de las llegadas, que es común a ambos.

## Lectura

- **Espera del Triage II por médico:** pasa de ${num(waits[0].mean)} min con ${DOCTORS[0]} médicos a ${num(waits[waits.length - 1].mean)} min con ${DOCTORS[DOCTORS.length - 1]}. Es baja en todos los escenarios porque el Triage II tiene prioridad sobre III–V en la cola del médico.
- **Cumplimiento:** mide la espera desde el fin del triage hasta el médico, así que incluye la cola y el servicio de admisión. Ni con ${BOUND} médicos supera el ${num(bound.ci['triageII.compliance'].mean * 100, 1)} %: el límite lo pone la **admisión** (espera media ${num(bound.ci['admission.Wq'].mean)} min, ${p.capacity.admission} auxiliares), no los médicos. Agregar médicos más allá de ${REF} mejora poco el cumplimiento.
- **Costo oculto de pocos médicos:** con ${DOCTORS[0]} médicos el Triage II sigue protegido por la prioridad, pero el abandono de IV–V sube a ${num(main[0].ci['renege.frac'].mean * 100, 1)} % y la espera puerta–médico a ${num(main[0].ci['doorToDoctor'].mean, 1)} min.
- **Sincronización parcial de CRN:** los tiempos de servicio se toman de su flujo al empezar cada atención, y el orden de atención cambia con el número de médicos. Por eso la ganancia de CRN es grande en cumplimiento y utilización pero moderada en la espera del Triage II.

Parámetros estimados con fines académicos; EPS y clínicas ficticias.

Tiempo de cómputo: ${((Date.now() - t0) / 1000).toFixed(1)} s.
`;
writeFileSync('docs/EXPERIMENTO_MEDICOS.md', md);
console.log(md);
