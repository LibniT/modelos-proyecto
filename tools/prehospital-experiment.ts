/**
 * T33 — Experimentos A (políticas de selección), B (tráfico), C (ambulancias) y D (sector de la ciudad) del paciente
 * prehospitalario, con réplicas y números aleatorios comunes. Genera docs/EXPERIMENTO_PREHOSPITALARIO.md y
 * docs/figuras/t33-prehospital.svg. Uso: npm run prehospital-experimento
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { comparePrehospital, distanceToOrigin, PRE_KEYS, PRE_LABEL, type PreComparison, type PreKey, type PreScenario } from '../src/batch/prehospital-experiment';
import { confidenceInterval, type Interval } from '../src/validation/ci';
import { SPEED_KMH, TRAFFIC_FACTOR } from '../src/model/valledupar/router';

const cfg = { n: 20, seedBase: 7000, days: 5, ratePerHour: 1.5 };
const scenarios: PreScenario[] = [
  { label: 'A · Más cercana', policy: 'cercana', traffic: 'fluido', ambulances: 2 },
  { label: 'A · Compatible más cercana', policy: 'compatible', traffic: 'fluido', ambulances: 2 },
  { label: 'A · Menor tiempo hasta la atención adecuada (referencia)', policy: 'tiempo', traffic: 'fluido', ambulances: 2 },
  { label: 'B · Tráfico moderado', policy: 'tiempo', traffic: 'moderado', ambulances: 2 },
  { label: 'B · Tráfico congestionado', policy: 'tiempo', traffic: 'congestionado', ambulances: 2 },
  { label: 'C · 1 ambulancia prehospitalaria', policy: 'tiempo', traffic: 'fluido', ambulances: 1 },
  { label: 'C · 3 ambulancias prehospitalarias', policy: 'tiempo', traffic: 'fluido', ambulances: 3 },
];
const REF = 2;

const t0 = Date.now();
const { rows, baseline } = comparePrehospital(scenarios, REF, cfg);

const num = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const ci = (i: Interval, d = 1) => `${num(i.mean, d)} [${num(i.lo, d)}; ${num(i.hi, d)}]`;
const sig = (i: Interval) => (i.lo > 0 || i.hi < 0 ? 'sí' : 'no');
const SHOW: PreKey[] = ['firstCare', 'adequate', 'reached', 'secondTransfer', 'ambWait', 'km', 'util', 'outNetwork'];

const table = [
  `| Escenario | ${SHOW.map((k) => PRE_LABEL[k]).join(' | ')} |`,
  `|---|${SHOW.map(() => '---').join('|')}|`,
  ...rows.map((r) => `| ${r.label} | ${SHOW.map((k) => ci(r.ci[k])).join(' | ')} |`),
].join('\n');
const diffs = [
  '| Escenario − referencia | Δ primera atención (min) | ¿Signif.? | Δ atención adecuada (min) | ¿Signif.? | Δ segundo traslado (pp) | ¿Signif.? |',
  '|---|---|---|---|---|---|---|',
  ...rows
    .filter((_, j) => j !== REF)
    .map((r) => `| ${r.label} | ${ci(r.diff.firstCare)} | ${sig(r.diff.firstCare)} | ${ci(r.diff.adequate)} | ${sig(r.diff.adequate)} | ${ci(r.diff.secondTransfer)} | ${sig(r.diff.secondTransfer)} |`),
].join('\n');

// D: por sector (distancia en línea recta al hospital de origen), escenario de referencia; IC entre réplicas.
const BANDS: [number, number, string][] = [
  [0, 1500, 'centro (< 1,5 km)'],
  [1500, 3000, 'intermedio (1,5–3 km)'],
  [3000, 1e9, 'periferia (> 3 km)'],
];
const bandRows = BANDS.map(([lo, hi, name]) => {
  const per = (f: (c: (typeof baseline)[number]['cases'][number]) => number | undefined) =>
    confidenceInterval(
      baseline.map((r) => {
        const xs = r.cases.filter((c) => distanceToOrigin(c) >= lo && distanceToOrigin(c) < hi).map(f).filter((x): x is number => x !== undefined);
        return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
      }),
    );
  return `| ${name} | ${ci(per((c) => (c.arrived !== undefined ? c.arrived - c.created : undefined)))} | ${ci(per((c) => (c.dispatched !== undefined && c.atScene !== undefined ? c.atScene - c.dispatched : undefined)))} |`;
});

// Figura: tiempo hasta la atención adecuada por escenario (media e IC 95 %).
function figure(rs: PreComparison[]): string {
  const W = 860, H = 330, L = 60, B = 92, T = 34;
  const vals = rs.map((r) => r.ci.adequate);
  const yMax = Math.ceil(Math.max(...vals.map((v) => v.hi)) / 10) * 10;
  const px = (i: number) => L + 40 + i * ((W - L - 80) / (vals.length - 1));
  const py = (v: number) => T + (H - T - B) * (1 - v / yMax);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12" fill="#222"><rect width="${W}" height="${H}" fill="white"/>`;
  s += `<text x="${W / 2}" y="20" text-anchor="middle" font-weight="bold">Tiempo hasta la atención adecuada (media e IC 95 %, ${cfg.n} réplicas)</text>`;
  s += `<line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#333"/><line x1="${L}" y1="${H - B}" x2="${W - 10}" y2="${H - B}" stroke="#333"/>`;
  for (let t = 0; t <= yMax; t += yMax / 5) s += `<line x1="${L - 4}" y1="${py(t)}" x2="${W - 10}" y2="${py(t)}" stroke="#ddd"/><text x="${L - 8}" y="${py(t) + 4}" text-anchor="end">${num(t, 0)}</text>`;
  s += `<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">minutos</text>`;
  vals.forEach((v, i) => {
    const x = px(i), c = i === REF ? '#b45309' : '#1d4ed8';
    s += `<line x1="${x}" y1="${py(v.lo)}" x2="${x}" y2="${py(v.hi)}" stroke="${c}" stroke-width="2"/><line x1="${x - 6}" y1="${py(v.lo)}" x2="${x + 6}" y2="${py(v.lo)}" stroke="${c}" stroke-width="2"/><line x1="${x - 6}" y1="${py(v.hi)}" x2="${x + 6}" y2="${py(v.hi)}" stroke="${c}" stroke-width="2"/><circle cx="${x}" cy="${py(v.mean)}" r="4" fill="${c}"/>`;
    const words = rs[i].label.replace(' (referencia)', '').split(' ');
    const lines: string[] = [];
    for (const w of words) if (lines.length && (lines.at(-1)! + ' ' + w).length <= 16) lines[lines.length - 1] += ' ' + w; else lines.push(w);
    lines.forEach((l, k) => (s += `<text x="${x}" y="${H - B + 16 + k * 13}" text-anchor="middle">${l}</text>`));
  });
  return s + '</svg>';
}
mkdirSync('docs/figuras', { recursive: true });
writeFileSync('docs/figuras/t33-prehospital.svg', figure(rows));

const r = (p: string) => rows.find((x) => x.label.startsWith(p))!;
const md = `# Experimento: paciente prehospitalario en Valledupar (T33)

Generado automáticamente con \`npm run prehospital-experimento\` el ${new Date().toISOString().slice(0, 10)}.

**Preguntas:**
- (A) ¿Cuánto cambia el tiempo hasta la atención adecuada según la política de selección del destino?
- (B) ¿Cuánto lo cambia el tráfico?
- (C) ¿Cuánto lo cambia el número de ambulancias prehospitalarias?
- (D) ¿Cuánto lo cambia el sector de la ciudad?

**Diseño:**
- Motor completo del escenario de red (\`?red\`): sedes reales, camas por tipo, CRUE y remisiones.
- ${cfg.n} réplicas por escenario, ${cfg.days} días con llegadas de pacientes al mapa; luego se deja terminar a los que están en curso. IC del 95 % con t de Student (ν = ${cfg.n - 1}).
- **Números aleatorios comunes:** en la réplica *i*, todos los escenarios reciben los mismos pacientes (instante, punto, condición y triage) y el motor usa la misma semilla (${cfg.seedBase} + *i*). Las diferencias contra la referencia se estiman réplica a réplica.

**Supuestos (no hay datos de Valledupar):**
- Llegadas de pacientes al mapa: Poisson de ${num(cfg.ratePerHour)} por hora.
- Punto uniforme sobre la longitud de la red vial.
- Condición según la mezcla de remisiones del escenario de red.
- Triage I, II y III con 25, 50 y 25 %; el triage III se considera estable y I–II críticos.
- EPS no simulada, para aislar los criterios clínicos y geográficos.
- Velocidades por clase de vía (${SPEED_KMH.join(', ')} km/h) y factores de tráfico (moderado ×${TRAFFIC_FACTOR.moderado[0]}…, congestionado ×${TRAFFIC_FACTOR.congestionado[0]}…).
- Escena de 12 min, estabilización de 60 min, CRUE de 30 min y entrega de 15 min (medias).

**Medidas:**
- **Primera atención:** desde que se crea el paciente hasta que llega a la primera sede.
- **Atención adecuada:** llegada a una sede con atención definitiva y cama del tipo requerido (directa o tras estabilizar y remitir).
- «Llegan a la atención adecuada» excluye a quienes se resolvieron dentro de urgencias del hospital de origen sin remisión (el modelo de urgencias decide su salida) y a quienes quedaron sin destino.

![Tiempo hasta la atención adecuada](figuras/t33-prehospital.svg)

## Resultados por escenario (media [IC 95 %])

${table}

## Diferencias pareadas contra la referencia (menor tiempo hasta la atención adecuada, tráfico fluido, 2 ambulancias)

${diffs}

## D · Por sector de la ciudad (escenario de referencia)

| Sector (distancia en línea recta al hospital de origen, base de las ambulancias) | Primera atención (min) | Ambulancia hasta el paciente (min) |
|---|---|---|
${bandRows.join('\n')}

## Lectura

- **Políticas (A):**
  - «Más cercana» lleva primero a la urgencia más próxima. Así la primera atención cambia en ${num(r('A · Más').diff.firstCare.mean)} min, pero la atención adecuada cambia en ${num(r('A · Más').diff.adequate.mean)} min (${sig(r('A · Más').diff.adequate)} significativo), con ${num(r('A · Más').ci.secondTransfer.mean)} % de segundos traslados.
  - «Compatible más cercana» difiere de la referencia en ${num(r('A · Compatible').diff.adequate.mean)} min (${sig(r('A · Compatible').diff.adequate)} significativo). Sin EPS y con camas disponibles, la sede definitiva más cercana suele ser también la de menor tiempo. Las dos políticas se separan cuando conviene estabilizar primero a un paciente crítico o cuando cuenta la red de la EPS de un paciente estable.
  - Este es el contraste que muestra el valor del algoritmo frente al «paseo de la muerte».
- **Tráfico (B):** con tráfico congestionado, la atención adecuada cambia en ${num(r('B · Tráfico cong').diff.adequate.mean)} min (${sig(r('B · Tráfico cong').diff.adequate)} significativo).
- **Ambulancias (C):**
  - con 1 ambulancia, la espera por ambulancia es de ${num(r('C · 1').ci.ambWait.mean)} min, frente a ${num(rows[REF].ci.ambWait.mean)} min en la referencia;
  - con 3, la atención adecuada cambia en ${num(r('C · 3').diff.adequate.mean)} min (${sig(r('C · 3').diff.adequate)} significativo);
  - uso de las ambulancias en la referencia: ${num(rows[REF].ci.util.mean)} %. Con una sola ambulancia, su uso (${num(r('C · 1').ci.util.mean)} %) se acerca a la saturación y la cola crece: por eso el intervalo es tan ancho.
- **Sector (D):** la periferia tarda más porque la base de las ambulancias está en el centro (hospital de origen). Varias bases es un P2.

**Validez:** la validación con teoría de colas del escenario original **no** valida este modelo georreferenciado. Lo que se verificó para él son propiedades en las pruebas (\`tests/prehospital.test.ts\`, \`tests/valledupar-router.test.ts\`):
- rutas por vías existentes y sentidos;
- conservación de λ;
- camas ≤ capacidad;
- reproducibilidad;
- orden de los tiempos.

Las cifras dependen de los supuestos anteriores. Escenario académico: no describe la disponibilidad real de ninguna institución ni el tráfico real.

Tiempo de cómputo: ${((Date.now() - t0) / 1000).toFixed(1)} s.
`;
writeFileSync('docs/EXPERIMENTO_PREHOSPITALARIO.md', md);
console.log(md);
