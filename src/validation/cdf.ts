import type { Dist } from '../engine/distributions';
import { gammaP, normalCdf } from './special';

/** CDF teórica de cada distribución del motor (para las pruebas KS). */
export function cdfOf(d: Dist): (x: number) => number {
  switch (d.kind) {
    case 'exp':
      return (x) => (x <= 0 ? 0 : 1 - Math.exp(-x / d.mean));
    case 'gamma': {
      const k = 1 / (d.cv * d.cv);
      const theta = d.mean * d.cv * d.cv;
      return (x) => (x <= 0 ? 0 : gammaP(k, x / theta));
    }
    case 'lognormal': {
      const s2 = Math.log(1 + d.cv * d.cv);
      const mu = Math.log(d.mean) - s2 / 2;
      return (x) => (x <= 0 ? 0 : normalCdf((Math.log(x) - mu) / Math.sqrt(s2)));
    }
    case 'triangular': {
      const { min: a, mode: c, max: b } = d;
      return (x) => {
        if (x <= a) return 0;
        if (x >= b) return 1;
        if (x <= c) return ((x - a) ** 2) / ((b - a) * (c - a));
        return 1 - ((b - x) ** 2) / ((b - a) * (b - c));
      };
    }
    case 'const':
      return (x) => (x < d.value ? 0 : 1);
  }
}
