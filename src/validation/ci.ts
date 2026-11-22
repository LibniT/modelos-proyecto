import { studentTQuantile } from './special';

export interface Interval {
  n: number;
  mean: number;
  sd: number;
  half: number;
  lo: number;
  hi: number;
  /** semiamplitud relativa (half / |mean|) */
  rel: number;
}

/** IC para la media con t de Student: x̄ ± t_{1−α/2, n−1} · s/√n. */
export function confidenceInterval(xs: number[], level = 0.95): Interval {
  const v = xs.filter((x) => Number.isFinite(x));
  const n = v.length;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : NaN;
  const t = n > 1 ? studentTQuantile(1 - (1 - level) / 2, n - 1) : NaN;
  const half = (t * sd) / Math.sqrt(n);
  return { n, mean, sd, half, lo: mean - half, hi: mean + half, rel: half / Math.abs(mean) };
}
