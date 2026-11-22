/**
 * Fórmulas analíticas de teoría de colas usadas para VALIDAR el motor.
 * Tiempos en las mismas unidades que 1/μ (aquí, minutos).
 */

/** Erlang B por recursión estable: B(0)=1, B(k)=a·B(k−1)/(k + a·B(k−1)). */
export function erlangB(K: number, a: number): number {
  let b = 1;
  for (let k = 1; k <= K; k++) b = (a * b) / (k + a * b);
  return b;
}

/**
 * Erlang C: probabilidad de esperar en un M/M/c con carga a = λ/μ (requiere a < c).
 * Se obtiene de Erlang B: C = c·B / (c − a·(1 − B)).
 */
export function erlangC(c: number, a: number): number {
  if (a >= c) return 1;
  const b = erlangB(c, a);
  return (c * b) / (c - a * (1 - b));
}

export interface MMcResult {
  rho: number;
  Pw: number;
  Lq: number;
  Wq: number;
  W: number;
  L: number;
}

/** Medidas de desempeño del M/M/c en estado estable. */
export function mmc(lambda: number, mu: number, c: number): MMcResult {
  const a = lambda / mu;
  const rho = a / c;
  if (rho >= 1) return { rho, Pw: 1, Lq: Infinity, Wq: Infinity, W: Infinity, L: Infinity };
  const Pw = erlangC(c, a);
  const Wq = Pw / (c * mu - lambda);
  const Lq = lambda * Wq;
  const W = Wq + 1 / mu;
  return { rho, Pw, Lq, Wq, W, L: lambda * W };
}

/**
 * Fórmula de Cobham para M/M/c con prioridades SIN interrupción y la MISMA μ en todas las clases.
 *   σ_k = Σ_{i≤k} λ_i/(cμ),   Wq_k = C(c,a) / [cμ · (1 − σ_{k−1}) · (1 − σ_k)]
 * lambdas[0] es la clase de mayor prioridad (Triage I).
 */
export function cobham(lambdas: number[], mu: number, c: number): number[] {
  const lam = lambdas.reduce((s, x) => s + x, 0);
  const C = erlangC(c, lam / mu);
  const out: number[] = [];
  let sPrev = 0;
  for (const li of lambdas) {
    const s = sPrev + li / (c * mu);
    out.push(C / (c * mu * (1 - sPrev) * (1 - s)));
    sPrev = s;
  }
  return out;
}
