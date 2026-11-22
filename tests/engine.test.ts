import { Rng, RngFactory } from '../src/engine/rng';
import { MinHeap } from '../src/engine/heap';
import { Simulator } from '../src/engine/sim';
import { sample, type Dist } from '../src/engine/distributions';
import { ksTest } from '../src/validation/ks';
import { cdfOf } from '../src/validation/cdf';

describe('Rng (sfc32)', () => {
  it('es reproducible con la misma semilla', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('flujos con distinto nombre son distintos y estables', () => {
    const f1 = new RngFactory(7);
    const f2 = new RngFactory(7);
    expect(f1.stream('arrivals').next()).toBe(f2.stream('arrivals').next());
    expect(new RngFactory(7).stream('arrivals').next()).not.toBe(new RngFactory(7).stream('doctor').next());
  });

  it('U(0,1): media ≈ 1/2, varianza ≈ 1/12 y pasa KS', () => {
    const r = new Rng(1);
    const xs = Array.from({ length: 20000 }, () => r.next());
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
    expect(mean).toBeCloseTo(0.5, 2);
    // Error estándar de s² para U(0,1): √((1/80 − 1/144)/n) ≈ 5.3e-4 → tolerancia 4 EE.
    expect(Math.abs(v - 1 / 12)).toBeLessThan(4 * Math.sqrt((1 / 80 - 1 / 144) / xs.length));
    expect(ksTest(xs, (x) => x).p).toBeGreaterThan(0.01);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe('MinHeap', () => {
  it('ordena correctamente', () => {
    const h = new MinHeap<number>((a, b) => a < b);
    const r = new Rng(3);
    const xs = Array.from({ length: 500 }, () => r.next());
    xs.forEach((x) => h.push(x));
    const out: number[] = [];
    while (h.size) out.push(h.pop()!);
    expect(out).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('Simulator', () => {
  it('ejecuta en orden temporal y desempata por orden de planificación', () => {
    const s = new Simulator();
    const log: string[] = [];
    s.schedule(5, () => log.push('b'));
    s.schedule(1, () => log.push('a'));
    s.schedule(5, () => log.push('c'));
    const h = s.schedule(3, () => log.push('cancelado'));
    h.cancel();
    s.runUntil(10);
    expect(log).toEqual(['a', 'b', 'c']);
    expect(s.now).toBe(10);
  });
});

describe('Generadores de variables aleatorias (Kolmogorov-Smirnov, n = 5000, α = 0.01)', () => {
  const cases: [string, Dist][] = [
    ['Exponencial(media 20)', { kind: 'exp', mean: 20 }],
    ['Gamma(media 20, CV 0.6)', { kind: 'gamma', mean: 20, cv: 0.6 }],
    ['Gamma(media 10, CV 1.5) — k < 1', { kind: 'gamma', mean: 10, cv: 1.5 }],
    ['Lognormal(media 4, CV 0.4)', { kind: 'lognormal', mean: 4, cv: 0.4 }],
    ['Lognormal(media 360, CV 1)', { kind: 'lognormal', mean: 360, cv: 1 }],
    ['Triangular(3, 5, 10)', { kind: 'triangular', min: 3, mode: 5, max: 10 }],
  ];
  for (const [name, d] of cases) {
    it(name, () => {
      const r = new Rng(2026);
      const xs = Array.from({ length: 5000 }, () => sample(d, r));
      const { p } = ksTest(xs, cdfOf(d));
      expect(p).toBeGreaterThan(0.01);
    });
  }

  it('la media y el CV muestrales coinciden con los parámetros', () => {
    const r = new Rng(9);
    const d: Dist = { kind: 'gamma', mean: 20, cv: 0.6 };
    const xs = Array.from({ length: 50000 }, () => sample(d, r));
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
    expect(Math.abs(m - 20) / 20).toBeLessThan(0.01);
    expect(Math.abs(sd / m - 0.6) / 0.6).toBeLessThan(0.02);
  });
});
