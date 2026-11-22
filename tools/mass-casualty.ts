/**
 * T17 — Experimento: tiempo de recuperación tras un accidente masivo, con números aleatorios comunes.
 * Cada réplica corre dos veces con la misma semilla: con accidente y sin él (contrafactual).
 * Genera docs/ACCIDENTE.md y docs/figuras/t17-accidente.svg. Uso: npm run accidente
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { EmergencyDepartment } from '../src/model/ed';
import { realisticParams } from '../src/model/params';
import { RECOVERY, recoveryTime, trackN } from '../src/batch/recovery';
import { confidenceInterval } from '../src/validation/ci';

const N = 200;
const SEED = 4000;
const SIZES = [8, 15];
const T0 = 1440 + 10 * 60; // día 2, 10:00 (después del calentamiento de 1 día)
const HOURS = 48;
const p = realisticParams();

const num = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
const t0w = Date.now();

interface Result { size: number; rec: (number | undefined)[]; excess: number[][]; base: number[][] }
const results: Result[] = SIZES.map((size) => {
  const rec: (number | undefined)[] = [];
  const excess: number[][] = []; // [réplica][hora] exceso medio de N en esa hora
  const base: number[][] = [];
  for (let i = 0; i < N; i++) {
    const acc = new EmergencyDepartment(p, { seed: SEED + i });
    const ref = new EmergencyDepartment(p, { seed: SEED + i });
    const na = trackN(acc);
    const nb = trackN(ref);
    acc.step(T0);
    ref.step(T0);
    acc.triggerMassCasualty(size);
    acc.step(T0 + HOURS * 60);
    ref.step(T0 + HOURS * 60);
    rec.push(recoveryTime(na, nb, T0, T0 + HOURS * 60));
    excess.push(Array.from({ length: HOURS }, (_, h) => na.avg(T0 + h * 60, T0 + (h + 1) * 60) - nb.avg(T0 + h * 60, T0 + (h + 1) * 60)));
    base.push(Array.from({ length: HOURS }, (_, h) => nb.avg(T0 + h * 60, T0 + (h + 1) * 60)));
  }
  return { size, rec, excess, base };
});

const rows = results.map((r) => {
  const done = r.rec.filter((x): x is number => x !== undefined).map((x) => x / 60);
  const ci = confidenceInterval(done);
  const sorted = [...done].sort((a, b) => a - b);
  const meanExcess = Array.from({ length: HOURS }, (_, h) => confidenceInterval(r.excess.map((e) => e[h])));
  const meanBase = Array.from({ length: HOURS }, (_, h) => r.base.reduce((s, b) => s + b[h], 0) / N);
  // Recuperación de la curva media: primera hora en que el exceso medio queda dentro del 10 % del nivel sin accidente.
  const hMean = meanExcess.findIndex((e, h) => Math.abs(e.mean) <= RECOVERY.tol * meanBase[h]);
  return { size: r.size, n: done.length, censored: N - done.length, ci, median: sorted[Math.floor(sorted.length / 2)], p90: sorted[Math.floor(sorted.length * 0.9)], meanExcess, hMean };
});

// ---------- Figura: exceso medio de pacientes por hora tras el accidente, con IC 95 % ----------
const W = 640, H = 280, L = 52, B = 40, T = 30, R = 14;
const yMax = Math.ceil(Math.max(...rows.flatMap((r) => r.meanExcess.map((e) => e.hi))) + 1);
const px = (h: number) => L + ((W - L - R) * h) / HOURS;
const py = (y: number) => T + (H - T - B) * (1 - y / yMax);
const colors = ['#1d4ed8', '#dc2626'];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="11" fill="#222"><rect width="${W}" height="${H}" fill="white"/>`;
svg += `<text x="${W / 2}" y="18" text-anchor="middle" font-weight="bold">Pacientes de más por el accidente (con − sin, misma semilla)</text>`;
for (let y = 0; y <= yMax; y += Math.max(1, Math.round(yMax / 5))) svg += `<line x1="${L}" y1="${py(y)}" x2="${W - R}" y2="${py(y)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${py(y) + 4}" text-anchor="end">${y}</text>`;
for (let h = 0; h <= HOURS; h += 6) svg += `<text x="${px(h)}" y="${H - B + 16}" text-anchor="middle">${h}</text>`;
svg += `<line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#333"/><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#333"/>`;
rows.forEach((r, k) => {
  const c = colors[k];
  const band = r.meanExcess.map((e, h) => `${px(h + 0.5)},${py(Math.max(0, e.hi))}`).concat([...r.meanExcess].reverse().map((e, j) => `${px(HOURS - j - 0.5)},${py(Math.max(0, e.lo))}`));
  svg += `<polygon points="${band.join(' ')}" fill="${c}" opacity="0.15"/>`;
  svg += `<polyline fill="none" stroke="${c}" stroke-width="2" points="${r.meanExcess.map((e, h) => `${px(h + 0.5)},${py(Math.max(0, e.mean))}`).join(' ')}"/>`;
  svg += `<line x1="${px(r.ci.mean)}" y1="${T}" x2="${px(r.ci.mean)}" y2="${H - B}" stroke="${c}" stroke-dasharray="4 3"/>`;
  svg += `<text x="${W - R - 4}" y="${T + 14 + 14 * k}" text-anchor="end" fill="${c}">${r.size} heridos: recuperación media ${num(r.ci.mean)} h</text>`;
});
svg += `<text x="${L + (W - L) / 2}" y="${H - 4}" text-anchor="middle">horas desde el accidente</text><text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">pacientes de más</text></svg>`;
mkdirSync('docs/figuras', { recursive: true });
writeFileSync('docs/figuras/t17-accidente.svg', svg);

const md = `# Accidente masivo: tiempo de recuperación (T17)

Generado automáticamente con \`npm run accidente\` el ${new Date().toISOString().slice(0, 10)}.

**Pregunta:** si llegan de golpe N heridos (Triage I–III), ¿cuánto tarda el servicio en volver a funcionar como si no hubiera pasado nada?

**Definición (SPEC §2.6, ajustada):** la SPEC mide hasta que N(t) "vuelve a ±10 % del nivel previo". Con llegadas que cambian según la hora (NHPP), el nivel previo no sirve de referencia: a media mañana N sube aunque no haya accidente. Por eso cada réplica se corre **dos veces con la misma semilla** (números aleatorios comunes): con accidente y sin él. La recuperación es el primer instante, desde ${RECOVERY.smooth} min después del accidente, en que el promedio temporal de N en los últimos ${RECOVERY.smooth} min con accidente queda a ±${RECOVERY.tol * 100} % del mismo promedio sin accidente.

**Diseño:** modo realista (${p.capacity.doctors} médicos, ${p.capacity.triage} enfermeras de triage, ${p.capacity.admission} auxiliares de admisión, ${p.capacity.obsBeds} camas); accidente el día 2 a las 10:00; ${N} réplicas (semillas ${SEED}–${SEED + N - 1}) por tamaño; ${HOURS} h de seguimiento. IC del 95 % con t de Student.

![Exceso de pacientes tras el accidente](figuras/t17-accidente.svg)

## Resultados

| Heridos | Recuperación media (h) [IC 95 %] | Mediana (h) | Percentil 90 (h) | Sin recuperar en ${HOURS} h | Curva media dentro del 10 % desde la hora |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.size} | ${num(r.ci.mean)} [${num(r.ci.lo)}; ${num(r.ci.hi)}] | ${num(r.median)} | ${num(r.p90)} | ${r.censored} de ${N} | ${r.hMean >= 0 ? r.hMean : '—'} |`).join('\n')}

## Lectura

${rows.map((r) => `- **${r.size} heridos:** en promedio el servicio tarda **${num(r.ci.mean)} h** en recuperarse (IC 95 %: ${num(r.ci.lo)} a ${num(r.ci.hi)} h); en el 10 % de los casos más lentos, más de ${num(r.p90)} h.`).join('\n')}
- La recuperación de una corrida es muy variable: depende de qué tan cargado estaba el servicio a esa hora y de cuántos heridos requieren observación o remisión. Por eso se reporta la media con IC y el percentil 90, no un único número.
${rows.some((r) => r.censored > 0) ? `- Hay réplicas que no se recuperan en ${HOURS} h (columna "sin recuperar"): la media de esa fila excluye esos casos y por eso la subestima.\n` : ''}
En la aplicación, el botón "Accidente masivo" mide lo mismo **en vivo** con un gemelo del hospital (misma semilla, sin accidente) que corre en paralelo.

Parámetros estimados con fines académicos; EPS y clínicas ficticias.

Tiempo de cómputo: ${((Date.now() - t0w) / 1000).toFixed(0)} s.
`;
writeFileSync('docs/ACCIDENTE.md', md);
console.log(md);
