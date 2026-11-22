import { erlangB, erlangC, mmc, cobham } from '../src/validation/analytic';
import { studentTQuantile, normalCdf } from '../src/validation/special';

describe('Fórmulas analíticas (valores de referencia conocidos)', () => {
  it('Erlang B(5, 3) = 0.11005', () => {
    expect(erlangB(5, 3)).toBeCloseTo(0.110054, 5);
  });
  it('Erlang C(2, 1) = 1/3', () => {
    expect(erlangC(2, 1)).toBeCloseTo(1 / 3, 10);
  });
  it('M/M/1 coincide con ρ/(μ−λ)', () => {
    const r = mmc(0.5, 1, 1);
    expect(r.Wq).toBeCloseTo(1, 10);
    expect(r.Lq).toBeCloseTo(0.5, 10);
  });
  it('Cobham con c = 1 coincide con M/M/1 con prioridades', () => {
    // λ1 = 0.2, λ2 = 0.3, μ = 1: W1 = ρ/μ /(1−σ1), W2 = ρ/μ /((1−σ1)(1−σ2))
    const [w1, w2] = cobham([0.2, 0.3], 1, 1);
    expect(w1).toBeCloseTo(0.5 / 0.8, 10);
    expect(w2).toBeCloseTo(0.5 / (0.8 * 0.5), 10);
  });
  it('el promedio ponderado de Cobham es la espera de Erlang C (conservación)', () => {
    const lams = [0.004, 0.026, 0.09, 0.06, 0.02];
    const lam = lams.reduce((a, b) => a + b, 0);
    const w = cobham(lams, 1 / 20, 5);
    const avg = w.reduce((s, wi, i) => s + (wi * lams[i]) / lam, 0);
    expect(avg).toBeCloseTo(mmc(lam, 1 / 20, 5).Wq, 8);
  });
  it('cuantiles: t(0.975, 29) = 2.0452, Φ(1.96) = 0.975', () => {
    expect(studentTQuantile(0.975, 29)).toBeCloseTo(2.04523, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
  });
});
