/**
 * Prueba de Kolmogorov-Smirnov de una muestra contra una CDF teórica.
 * D = sup |F_n(x) − F(x)|. Valor p con la distribución asintótica de Kolmogorov
 * y la corrección de Stephens (√n + 0.12 + 0.11/√n).
 */
export function ksTest(sampleValues: number[], cdf: (x: number) => number): { D: number; p: number } {
  const x = [...sampleValues].sort((a, b) => a - b);
  const n = x.length;
  let D = 0;
  for (let i = 0; i < n; i++) {
    const F = cdf(x[i]);
    D = Math.max(D, (i + 1) / n - F, F - i / n);
  }
  const en = Math.sqrt(n);
  const lam = (en + 0.12 + 0.11 / en) * D;
  return { D, p: kolmogorovQ(lam) };
}

/** Q_KS(λ) = 2 Σ (−1)^{j−1} e^{−2 j² λ²}. */
function kolmogorovQ(lam: number): number {
  if (lam < 1e-3) return 1;
  let sum = 0;
  let sign = 1;
  for (let j = 1; j <= 100; j++) {
    const term = sign * Math.exp(-2 * j * j * lam * lam);
    sum += term;
    if (Math.abs(term) < 1e-12) break;
    sign = -sign;
  }
  return Math.max(0, Math.min(1, 2 * sum));
}
