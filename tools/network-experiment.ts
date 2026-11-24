/**
 * T27 — Experimento de la red de Valledupar con réplicas y números aleatorios comunes:
 * ambulancias (1, 2, 3), demora de coordinación del CRUE (15, 30, 60 min) y aceptación de las sedes.
 * Genera docs/EXPERIMENTO_RED.md y docs/figuras/t27-red.svg.
 * Uso: npm run red-experimento
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { compareScenarios, type ScenarioComparison } from '../src/batch/experiment';
import { networkParams, type Params } from '../src/model/params';
import { EmergencyDepartment } from '../src/model/ed';
import type { Interval } from '../src/validation/ci';

const n = 30;
const measureDays = 7;
const seedBase = 5000;
const keys = ['hallway.wait', 'remit.outOfNetwork', 'transfers', 'amb.rho', 'triageII.compliance'];

const variant = (label: string, f: (p: Params) => void) => {
  const params = networkParams();
  f(params);
  return { label, params };
};
const scenarios = [
  variant('1 ambulancia', (p) => (p.capacity.ambulances = 1)),
  variant('2 ambulancias (actual)', () => {}),
  variant('3 ambulancias', (p) => (p.capacity.ambulances = 3)),
  variant('CRUE 15 min', (p) => (p.network!.coordination = { kind: 'lognormal', mean: 15, cv: 1 })),
  variant('CRUE 60 min', (p) => (p.network!.coordination = { kind: 'lognormal', mean: 60, cv: 1 })),
  variant('Aceptación total', (p) => (p.network!.acceptance = { AD: 1, C: 1 })),
  // Misma red con menos demanda propia: ocupación media del 70 % en vez del 90 % (contraste de disponibilidad de camas).
  variant('Sedes al 70 %', (p) => p.clinics.forEach((c) => (c.backgroundRatePerHour *= 0.7 / 0.9))),
];
const REF = 1;

const t0 = Date.now();
const rows = compareScenarios(scenarios, REF, { n, seedBase, measure: measureDays * 1440, keys });

const num = (x: number, d = 2) => x.toFixed(d).replace('.', ',');
const ci = (i: Interval, d = 1, k = 1) => `${num(i.mean * k, d)} [${num(i.lo * k, d)}; ${num(i.hi * k, d)}]`;
const sig = (i: Interval) => (i.lo > 0 || i.hi < 0 ? 'sí' : 'no');
const perDay = (i: Interval) => ({ ...i, mean: i.mean / measureDays, lo: i.lo / measureDays, hi: i.hi / measureDays });

const table = [
  '| Escenario | Espera en el pasillo hasta la ambulancia (min) | Remitidos fuera de la red (% de llegadas) | Traslados por día | Uso de ambulancias (%) |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.label} | ${ci(r.ci['hallway.wait'])} | ${ci(r.ci['remit.outOfNetwork'], 2, 100)} | ${ci(perDay(r.ci['transfers']))} | ${ci(r.ci['amb.rho'], 1, 100)} |`),
].join('\n');
const diffs = [
  '| Escenario − actual | Δ espera (min) | ¿Signif.? | Var. CRN / indep. | Δ fuera de la red (pp) | ¿Signif.? |',
  '|---|---|---|---|---|---|',
  ...rows
    .filter((_, j) => j !== REF)
    .map((r) => `| ${r.label} | ${ci(r.diff['hallway.wait'])} | ${sig(r.diff['hallway.wait'])} | ${num(r.varRatio['hallway.wait'])} | ${ci(r.diff['remit.outOfNetwork'], 2, 100)} | ${sig(r.diff['remit.outOfNetwork'])} |`),
].join('\n');

// ---------- Figura: espera en el pasillo por escenario, media e IC 95 % ----------
function figure(rs: ScenarioComparison[]): string {
  const W = 760, H = 300, L = 60, B = 70, T = 34;
  const vals = rs.map((r) => r.ci['hallway.wait']);
  const yMax = Math.ceil(Math.max(...vals.map((v) => v.hi)) / 10) * 10;
  const px = (i: number) => L + 40 + i * ((W - L - 80) / (vals.length - 1));
  const py = (v: number) => T + (H - T - B) * (1 - v / yMax);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12" fill="#222"><rect width="${W}" height="${H}" fill="white"/>`;
  s += `<text x="${W / 2}" y="20" text-anchor="middle" font-weight="bold">Espera en el pasillo hasta salir en ambulancia (media e IC 95 %, ${n} réplicas)</text>`;
  s += `<line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#333"/><line x1="${L}" y1="${H - B}" x2="${W - 10}" y2="${H - B}" stroke="#333"/>`;
  for (let t = 0; t <= yMax; t += yMax / 5) s += `<line x1="${L - 4}" y1="${py(t)}" x2="${W - 10}" y2="${py(t)}" stroke="#ddd"/><text x="${L - 8}" y="${py(t) + 4}" text-anchor="end">${num(t, 0)}</text>`;
  s += `<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">minutos</text>`;
  vals.forEach((v, i) => {
    const x = px(i), c = i === REF ? '#b45309' : '#1d4ed8';
    s += `<line x1="${x}" y1="${py(v.lo)}" x2="${x}" y2="${py(v.hi)}" stroke="${c}" stroke-width="2"/><line x1="${x - 6}" y1="${py(v.lo)}" x2="${x + 6}" y2="${py(v.lo)}" stroke="${c}" stroke-width="2"/><line x1="${x - 6}" y1="${py(v.hi)}" x2="${x + 6}" y2="${py(v.hi)}" stroke="${c}" stroke-width="2"/><circle cx="${x}" cy="${py(v.mean)}" r="4" fill="${c}"/>`;
    const [a, b] = rs[i].label.replace(' (actual)', '\n(actual)').split('\n');
    s += `<text x="${x}" y="${H - B + 18}" text-anchor="middle">${a}</text>` + (b ? `<text x="${x}" y="${H - B + 33}" text-anchor="middle">${b}</text>` : '');
  });
  return s + '</svg>';
}
mkdirSync('docs/figuras', { recursive: true });
writeFileSync('docs/figuras/t27-red.svg', figure(rows));

const r = (label: string) => rows.find((x) => x.label.startsWith(label))!;
// Quiénes salen fuera de la red: una corrida larga del escenario actual (30 días, semilla 1).
const outBy: Record<string, number> = {};
{
  const ed = new EmergencyDepartment(networkParams(), { seed: 1 });
  ed.onEvent((e) => {
    const j = (e.data as { journey?: { clinic?: string; condition?: string } } | undefined)?.journey;
    if (e.type === 'DEPARTURE' && j?.clinic === 'fuera de la red') outBy[j.condition ?? '?'] = (outBy[j.condition ?? '?'] ?? 0) + 1;
  });
  ed.step(31 * 1440);
}
const outText = Object.entries(outBy)
  .sort((a, b) => b[1] - a[1])
  .map(([c, k]) => `${c} ${k}`)
  .join(', ');
const md = `# Experimento: red hospitalaria de Valledupar (T27)

Generado automáticamente con \`npm run red-experimento\` el ${new Date().toISOString().slice(0, 10)}.

**Pregunta:** ¿qué limita más el tiempo que un paciente espera en el pasillo para ser remitido: las ambulancias, la coordinación con el CRUE o la aceptación de las sedes?

**Diseño:** escenario de red (\`?red\`): sedes reales con una unidad por tipo de cama documentado (camas de adulto, UCI adulto, pediátrica y neonatal, quemados), ocupación propia del 90 % (supuesto), selección del destino por compatibilidad, cama del tipo que la condición necesita y ruta vial, aceptación simulada (AD 85 %, C 50 %; supuesto). ${n} réplicas por escenario, calentamiento de ${networkParams().warmup / 1440} día eliminado, ${measureDays} días medidos; IC del 95 % con t de Student (ν = ${n - 1}). **Números aleatorios comunes:** la réplica *i* de todos los escenarios usa la semilla ${seedBase} + *i*; las diferencias contra el escenario actual se estiman réplica a réplica.

![Espera en el pasillo por escenario](figuras/t27-red.svg)

## Resultados por escenario (media [IC 95 %])

${table}

## Diferencias pareadas contra el escenario actual

${diffs}

"Var. CRN / indep." = Var(X − Y) / (Var X + Var Y): fracción de la varianza que queda al comparar con números aleatorios comunes.

## Lectura

- **Ambulancias:** con 1 la espera es ${num(r('1 amb').ci['hallway.wait'].mean, 1)} min; con 3, ${num(r('3 amb').ci['hallway.wait'].mean, 1)} min (actual: ${num(rows[REF].ci['hallway.wait'].mean, 1)} min); diferencias ${sig(r('1 amb').diff['hallway.wait']) === 'sí' || sig(r('3 amb').diff['hallway.wait']) === 'sí' ? 'significativas' : 'no significativas'}. Las ambulancias se usan el ${num(rows[REF].ci['amb.rho'].mean * 100, 0)} % del tiempo: no son el cuello de botella.
- **CRUE:** pasar de 30 a 15 min de coordinación cambia la espera en ${num(r('CRUE 15').diff['hallway.wait'].mean, 1)} min (${sig(r('CRUE 15').diff['hallway.wait'])} significativo); a 60 min, en ${num(r('CRUE 60').diff['hallway.wait'].mean, 1)} min (${sig(r('CRUE 60').diff['hallway.wait'])} significativo).
- **Aceptación:** si todas las sedes aceptaran a la primera, la espera cambiaría en ${num(r('Aceptación').diff['hallway.wait'].mean, 1)} min (${sig(r('Aceptación').diff['hallway.wait'])} significativo).
- **Camas:** con las sedes al 70 % de ocupación en vez del 90 %, la espera cambia en ${num(r('Sedes al 70').diff['hallway.wait'].mean, 1)} min (${sig(r('Sedes al 70').diff['hallway.wait'])} significativo) y los remitidos fuera de la red en ${num(r('Sedes al 70').diff['remit.outOfNetwork'].mean * 100, 2)} pp.
- **Fuera de la red** (corrida de 30 días, semilla 1): ${outText || 'ninguno'}.
- La espera incluye a quienes quedaron en el pasillo por falta de cama de observación en el hospital de origen.

Escenario académico: capacidades documentadas (REPS); ocupación, aceptación, tiempos de coordinación y de entrega son supuestos. No describe la disponibilidad real de ninguna institución.

Tiempo de cómputo: ${((Date.now() - t0) / 1000).toFixed(1)} s.
`;
writeFileSync('docs/EXPERIMENTO_RED.md', md);
console.log(md);
