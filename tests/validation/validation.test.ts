import { runReplications } from '../../src/batch/replicate';
import { validationParams } from '../../src/model/params';
import { validationTable, validationMarkdown } from '../../src/validation/report';
import { erlangB } from '../../src/validation/analytic';
import { confidenceInterval } from '../../src/validation/ci';

/**
 * VALIDACIÓN DEL MODELO contra fórmulas exactas (docs/SPEC.md §2.4–2.5).
 * 30 réplicas · calentamiento 2 días · medición 7 días · semillas 1000..1029.
 * Criterio: cada valor analítico dentro del IC conjunto (Bonferroni, 95 % familiar).
 */
describe('Validación analítica (modo validación)', () => {
  const p = validationParams();
  const res = runReplications({ params: p, n: 30, seedBase: 1000, measure: 7 * 1440 });
  const rows = validationTable(p, res);

  it('imprime la tabla', () => {
    console.log('\n' + validationMarkdown(rows) + '\n');
    expect(rows.length).toBeGreaterThan(10);
  });

  for (const r of rows) {
    it(`${r.label} (${r.formula})`, () => {
      expect(r.inBonferroni, `${r.label}: analítico ${r.analytic} fuera de [${r.loB}, ${r.hiB}]`).toBe(true);
    });
  }

  it('la mezcla de triage observada coincide con la configurada', () => {
    p.triageMix.forEach((share, i) => {
      const ci = confidenceInterval(res.raw.map((r) => r[`share.L${i + 1}`]));
      expect(share).toBeGreaterThanOrEqual(ci.lo - 1e-9);
      expect(share).toBeLessThanOrEqual(ci.hi + 1e-9);
    });
  });
});

describe('Validación de las clínicas (Erlang B con su demanda propia)', () => {
  // Sin remisiones hacia las clínicas, cada una es un M/M/K/K puro con su λ_j.
  const p = validationParams();
  p.outcomes = { alta: 0.75, observacion: 0.2, hospitalizacion: 0.05, remision: 0 };
  p.capacity.obsBeds = 200;
  // Carga de prueba alta (a = 0.9·K) para que el bloqueo sea medible.
  p.clinics.forEach((cl) => {
    cl.backgroundRatePerHour = (0.9 * cl.beds) / ((cl.los.kind === 'exp' ? cl.los.mean : 2880) / 60);
  });
  const res = runReplications({ params: p, n: 30, seedBase: 5000, measure: 60 * 1440 });
  p.clinics.forEach((cl, j) => {
    it(`${cl.name}: P(bloqueo) = Erlang B(${cl.beds}, λ·E[S])`, () => {
      const a = (cl.backgroundRatePerHour / 60) * (cl.los.kind === 'exp' ? cl.los.mean : NaN);
      const b = erlangB(cl.beds, a);
      const ci = confidenceInterval(res.raw.map((r) => r[`clinic${j}.bgBlockProb`]), 1 - 0.05 / 3);
      console.log(`${cl.name}: B analítico ${b.toFixed(4)} · simulado ${ci.mean.toFixed(4)} [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`);
      expect(b).toBeGreaterThanOrEqual(ci.lo);
      expect(b).toBeLessThanOrEqual(ci.hi);
    });
  });
});
