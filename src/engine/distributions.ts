import type { Rng } from './rng';

/**
 * Distribuciones de tiempos. En la interfaz se definen por MEDIA y COEFICIENTE
 * DE VARIACIÓN (CV = desviación / media); aquí se convierten a sus parámetros:
 *   Gamma:     k = 1/CV²,  θ = media·CV²
 *   Lognormal: σ² = ln(1 + CV²),  μ = ln(media) − σ²/2
 * Exponencial ≡ Gamma con CV = 1.
 */
export type Dist =
  | { kind: 'exp'; mean: number }
  | { kind: 'gamma'; mean: number; cv: number }
  | { kind: 'lognormal'; mean: number; cv: number }
  | { kind: 'triangular'; min: number; mode: number; max: number }
  | { kind: 'const'; value: number };

export function distMean(d: Dist): number {
  switch (d.kind) {
    case 'exp':
    case 'gamma':
    case 'lognormal':
      return d.mean;
    case 'triangular':
      return (d.min + d.mode + d.max) / 3;
    case 'const':
      return d.value;
  }
}

/** Normal estándar por Box-Muller (una variable por llamada; simple y reproducible). */
export function standardNormal(rng: Rng): number {
  const u1 = rng.next();
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Gamma(k, 1) por Marsaglia-Tsang (2000); para k < 1 usa el aumento k+1 y U^(1/k). */
export function gammaUnit(k: number, rng: Rng): number {
  if (k < 1) {
    const u = rng.next();
    return gammaUnit(k + 1, rng) * Math.pow(u, 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = standardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sample(d: Dist, rng: Rng): number {
  switch (d.kind) {
    case 'exp':
      // Transformada inversa: F⁻¹(u) = −media·ln(1−u); 1−u ~ U(0,1).
      return -d.mean * Math.log(rng.next());
    case 'gamma': {
      const k = 1 / (d.cv * d.cv);
      const theta = d.mean * d.cv * d.cv;
      return gammaUnit(k, rng) * theta;
    }
    case 'lognormal': {
      const s2 = Math.log(1 + d.cv * d.cv);
      const mu = Math.log(d.mean) - s2 / 2;
      return Math.exp(mu + Math.sqrt(s2) * standardNormal(rng));
    }
    case 'triangular': {
      const { min: a, mode: c, max: b } = d;
      const u = rng.next();
      const fc = (c - a) / (b - a);
      return u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }
    case 'const':
      return d.value;
  }
}
