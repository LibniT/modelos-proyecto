/**
 * T15 — Gráfica de Welch para justificar el calentamiento.
 * Genera docs/WELCH.md y docs/figuras/t15-welch.svg. Uso: npm run welch (≈ 1 min)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { averagedSeries } from '../src/batch/welch';
import { realisticParams, validationParams } from '../src/model/params';
import { mmc } from '../src/validation/analytic';
import { distMean } from '../src/engine/distributions';
import { warmupIndex, welchMovingAverage } from '../src/validation/welch';

const N = 1000;
const SEED = 3000;
const HOURS = 168;
const DAYS = 14;
const W_HOUR = 12; // ventana de 25 h
const W_DAY = 1; // ventana de 3 días
const TOL = 0.05;

const t0 = Date.now();
const pv = validationParams();
const pr = realisticParams();
const v = averagedSeries(pv, N, SEED, HOURS, 60, ['L', 'doctor.Lq']);
const r = averagedSeries(pr, N, SEED, DAYS, 1440, ['L', 'doctor.Lq']);

const vL = welchMovingAverage(v['L'], W_HOUR);
const vQ = welchMovingAverage(v['doctor.Lq'], W_HOUR);
const rL = welchMovingAverage(r['L'], W_DAY);
const rQ = welchMovingAverage(r['doctor.Lq'], W_DAY);
const [wvL, wvQ, wrL, wrQ] = [vL, vQ, rL, rQ].map((s) => warmupIndex(s, TOL));
// Sesgo que deja cada calentamiento d (días) en una medición de 7 días: media de los días d+1..d+7 frente al nivel estable.
const MEASURE_DAYS = 7;
const biasByWarmup = [0, 1, 2, 3].map((d) => ({ d, bias: r['L'].slice(d, d + MEASURE_DAYS).reduce((a, b) => a + b, 0) / MEASURE_DAYS / wrL.level - 1 }));
const usedBias = biasByWarmup[pr.warmup / 1440].bias;
const lqErlang = mmc(pv.arrivalRatePerHour / 60, 1 / distMean(pv.service.doctor), pv.capacity.doctors).Lq;

const num = (x: number, d = 2) => x.toFixed(d).replace('.', ',');

// ---------- Figura: tres paneles de líneas ----------
interface Line { ys: number[]; x0: number; dx: number; color: string; width?: number; dash?: string }
function panel(ox: number, title: string, xLabel: string, yLabel: string, lines: Line[], xMax: number, xTicks: number[], marks: { x: number; label: string; color: string }[], ref?: { y: number; label: string }): string {
  const W = 320, H = 260, L = 48, B = 40, T = 30, R = 10;
  const all = lines.flatMap((l) => l.ys).concat(ref ? [ref.y] : []);
  // Paso "redondo" (1, 2, 2,5, 5 × 10^k) para 4 divisiones del eje.
  const rough = (Math.max(...all) * 1.1) / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((x) => x >= rough)!;
  const yMax = 4 * step;
  const px = (x: number) => ox + L + ((W - L - R) * x) / xMax;
  const py = (y: number) => T + (H - T - B) * (1 - y / yMax);
  let s = `<text x="${ox + W / 2}" y="18" text-anchor="middle" font-weight="bold">${title}</text>`;
  const yTicks = Array.from({ length: 5 }, (_, k) => step * k);
  for (const t of yTicks) s += `<line x1="${px(0)}" y1="${py(t)}" x2="${px(xMax)}" y2="${py(t)}" stroke="#e5e7eb"/><text x="${px(0) - 6}" y="${py(t) + 4}" text-anchor="end">${num(t, Number.isInteger(t) ? 0 : Number.isInteger(t * 10) ? 1 : 2)}</text>`;
  for (const t of xTicks) s += `<text x="${px(t)}" y="${H - B + 16}" text-anchor="middle">${t}</text>`;
  s += `<line x1="${px(0)}" y1="${T}" x2="${px(0)}" y2="${H - B}" stroke="#333"/><line x1="${px(0)}" y1="${H - B}" x2="${px(xMax)}" y2="${H - B}" stroke="#333"/>`;
  if (ref) s += `<line x1="${px(0)}" y1="${py(ref.y)}" x2="${px(xMax)}" y2="${py(ref.y)}" stroke="#16a34a" stroke-dasharray="6 4"/><text x="${px(xMax) - 4}" y="${py(ref.y) + 14}" text-anchor="end" fill="#16a34a">${ref.label}</text>`;
  // Rótulos escalonados para que no se encimen.
  marks.forEach((m, k) => (s += `<line x1="${px(m.x)}" y1="${T}" x2="${px(m.x)}" y2="${H - B}" stroke="${m.color}" stroke-dasharray="4 3"/><text x="${px(m.x) + 4}" y="${T + 12 + 14 * k}" fill="${m.color}">${m.label}</text>`));
  for (const l of lines) s += `<polyline fill="none" stroke="${l.color}" stroke-width="${l.width ?? 1}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''} points="${l.ys.map((y, i) => `${px(l.x0 + i * l.dx).toFixed(1)},${py(y).toFixed(1)}`).join(' ')}"/>`;
  s += `<text x="${ox + L + (W - L) / 2}" y="${H - 4}" text-anchor="middle">${xLabel}</text>`;
  s += `<text transform="translate(${ox + 12} ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${yLabel}</text>`;
  return s;
}
const hourTicks = [0, 24, 48, 72, 96, 120, 144, 168];
const raw = '#cbd5e1';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 270" font-family="sans-serif" font-size="11" fill="#222">
<rect width="980" height="270" fill="white"/>
${panel(0, 'Validación: pacientes en el sistema', 'hora', 'L (pacientes)', [
  { ys: v['L'], x0: 0.5, dx: 1, color: raw },
  { ys: vL, x0: 0.5, dx: 1, color: '#1d4ed8', width: 2 },
], HOURS, hourTicks, [
  { x: wvL.index, label: `Welch ${wvL.index} h`, color: '#d97706' },
  { x: pv.warmup / 60, label: `usado ${pv.warmup / 60} h`, color: '#dc2626' },
])}
${panel(330, 'Validación: cola del médico', 'hora', 'Lq (pacientes)', [
  { ys: v['doctor.Lq'], x0: 0.5, dx: 1, color: raw },
  { ys: vQ, x0: 0.5, dx: 1, color: '#1d4ed8', width: 2 },
], HOURS, hourTicks, [
  { x: wvQ.index, label: `Welch ${wvQ.index} h`, color: '#d97706' },
  { x: pv.warmup / 60, label: `usado ${pv.warmup / 60} h`, color: '#dc2626' },
], { y: lqErlang, label: `Erlang C = ${num(lqErlang, 3)}` })}
${panel(660, 'Realista: L por día (ciclo NHPP)', 'día', 'L (pacientes, prom. diario)', [
  { ys: r['L'], x0: 0.5, dx: 1, color: raw, width: 1.5 },
  { ys: rL, x0: 0.5, dx: 1, color: '#1d4ed8', width: 2 },
], DAYS, Array.from({ length: DAYS / 2 + 1 }, (_, k) => 2 * k), [
  { x: wrL.index, label: `Welch ${wrL.index} d`, color: '#d97706' },
  { x: pr.warmup / 1440, label: `usado ${pr.warmup / 1440} d`, color: '#dc2626' },
])}
</svg>`;
mkdirSync('docs/figuras', { recursive: true });
writeFileSync('docs/figuras/t15-welch.svg', svg);

const md = `# Calentamiento: método gráfico de Welch (T15)

Generado automáticamente con \`npm run welch\` el ${new Date().toISOString().slice(0, 10)}.

**Pregunta:** ¿cuánto tiempo hay que descartar al inicio de cada réplica (el sistema arranca vacío) para medir el estado estable? Los informes de referencia usan una "regla de 48 h" sin justificarla (SPEC §8.4).

**Método (Law & Kelton, §9.5.1):** ${N} réplicas independientes (semillas ${SEED}–${SEED + N - 1}) que arrancan vacías. En cada periodo *j* se mide el promedio temporal exacto de la variable (las estadísticas se reinician al inicio del periodo). Se promedia entre réplicas (Ȳ_j) y se suaviza con la media móvil de Welch de ventana *w*. El calentamiento *l* es el primer periodo desde el cual la curva suavizada queda **siempre** dentro de ±${TOL * 100} % del nivel estable (media de la segunda mitad).

**Variables:** L = pacientes en el sistema (incluye observación, el componente más lento: estancia media de 6 h) y Lq = cola del médico. No se usa la espera media por periodo: es un cociente (suma de esperas / pacientes atendidos) que pondera igual las horas tranquilas y las congestionadas y queda sesgado (≈ 9,0 min contra 11,08 min de Erlang C con estos datos).

**Modo realista:** las llegadas siguen un perfil horario (NHPP) que se repite cada día, así que el proceso nunca es estacionario hora a hora. Se aplica Welch a los **promedios diarios**, que sí son estacionarios en régimen (Law & Kelton, parámetros de ciclo en estado estable).

![Gráficas de Welch](figuras/t15-welch.svg)

## Resultados

| Modo | Variable | Periodo | w | Nivel estable | Calentamiento de Welch | Calentamiento usado |
|---|---|---|---|---|---|---|
| Validación | L | 1 h | ${W_HOUR} | ${num(wvL.level)} | **${wvL.index} h** | ${pv.warmup / 60} h |
| Validación | Lq médico | 1 h | ${W_HOUR} | ${num(wvQ.level, 3)} (Erlang C: ${num(lqErlang, 3)}) | **${wvQ.index} h** | ${pv.warmup / 60} h |
| Realista | L | 1 día | ${W_DAY} | ${num(wrL.level)} | **${wrL.index} día(s)** | ${pr.warmup / 1440} día |
| Realista | Lq médico | 1 día | ${W_DAY} | ${num(wrQ.level, 3)} | ${wrQ.index} día(s) | ${pr.warmup / 1440} día |

Promedios diarios de L en el modo realista: ${r['L'].map((x) => num(x)).join(' · ')}.

## Sesgo según el calentamiento (modo realista, L)

La media móvil con w = ${W_DAY} mezcla el día 1 (${num((1 - r['L'][0] / wrL.level) * 100, 1)} % bajo el nivel) en el valor suavizado del día 2; por eso el criterio estricto marca ${wrL.index} días. Sin suavizar, el día 2 queda a solo ${num(Math.abs(1 - r['L'][1] / wrL.level) * 100, 1)} % del nivel. Lo que importa es el sesgo que queda en lo que se mide (${MEASURE_DAYS} días tras el calentamiento):

| Calentamiento | Sesgo de L medido en ${MEASURE_DAYS} días |
|---|---|
${biasByWarmup.map((b) => `| ${b.d} día(s) | ${num(b.bias * 100, 2)} % |`).join('\n')}

## Conclusión

- **Modo validación:** Welch pide ${Math.max(wvL.index, wvQ.index)} h; se usan ${pv.warmup / 60} h, más del doble. Es conservador: descartar de más solo cuesta cómputo, no introduce sesgo. Además el nivel de la cola del médico coincide con Erlang C (${num(wvQ.level, 3)} contra ${num(lqErlang, 3)}).
- **Modo realista:** el criterio estricto marca ${wrL.index} día(s), pero con el calentamiento usado de ${pr.warmup / 1440} día el sesgo que queda en L es de ${num(usedBias * 100, 2)} %, muy por debajo de la precisión de los IC del experimento T14 (semiamplitudes relativas de 1 % a 13 %). Se mantiene ${pr.warmup / 1440} día; si se quisiera sesgo prácticamente nulo, ${biasByWarmup[2].d} días lo dejan en ${num(biasByWarmup[2].bias * 100, 2)} %.
- La "regla de 48 h" de los informes queda justificada para el modo validación (con margen).

Tiempo de cómputo: ${((Date.now() - t0) / 1000).toFixed(0)} s.
`;
writeFileSync('docs/WELCH.md', md);
console.log(md);
