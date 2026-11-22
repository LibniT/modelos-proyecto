/**
 * Generador pseudoaleatorio sfc32 (Small Fast Counter, Chris Doty-Humphrey).
 * Período ≥ 2^32 garantizado por el contador; pasa PractRand hasta varios TB.
 *
 * Regla del proyecto: PROHIBIDO usar Math.random(). Toda aleatoriedad sale de
 * un flujo (stream) con nombre, derivado de una semilla maestra. Así:
 *  - una réplica es 100 % reproducible a partir de su semilla;
 *  - dos escenarios con la misma semilla usan los mismos números en cada fuente
 *    (números aleatorios comunes, CRN), aunque cambie la capacidad de un recurso.
 */

/** Hash de 32 bits (cyrb53 recortado) para convertir el nombre de un flujo en semilla. */
function hashString(s: string): number {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** splitmix32: expande una semilla de 32 bits en estados bien mezclados. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm();
    // Calentar el generador para descorrelacionar estados iniciales parecidos.
    for (let i = 0; i < 15; i++) this.nextUint32();
  }

  nextUint32(): number {
    // Implementación de referencia de sfc32 (PractRand).
    let t = (this.a + this.b) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.d = (this.d + 1) >>> 0;
    t = (t + this.d) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Uniforme en el intervalo abierto (0, 1): nunca devuelve 0 ni 1 (seguro para log). */
  next(): number {
    return (this.nextUint32() + 0.5) / 4294967296;
  }

  /** Entero uniforme en [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Elige un índice según pesos no negativos (no necesitan sumar 1). */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let u = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      u -= weights[i];
      if (u < 0) return i;
    }
    return weights.length - 1;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}

/** Fábrica de flujos independientes: stream('arrivals'), stream('doctor'), ... */
export class RngFactory {
  private readonly cache = new Map<string, Rng>();
  constructor(readonly seed: number) {}

  stream(name: string): Rng {
    let r = this.cache.get(name);
    if (!r) {
      r = new Rng((hashString(name) ^ Math.imul(this.seed >>> 0, 0x9e3779b1)) >>> 0);
      this.cache.set(name, r);
    }
    return r;
  }
}
