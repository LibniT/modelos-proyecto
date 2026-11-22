import { EmergencyDepartment } from '../model/ed';
import type { Params } from '../model/params';

/**
 * Serie por periodos de una réplica que arranca vacía en t = 0 (sin calentamiento).
 * Al empezar cada periodo se reinician las estadísticas, así `metrics()[k]` al final del periodo
 * es exactamente el valor de ese periodo (p. ej. 'L' = promedio temporal de pacientes en el sistema).
 * resetStats() no toca el estado del sistema ni los números aleatorios.
 */
export function periodSeries(params: Params, seed: number, periods: number, periodMin: number, keys: string[]): Record<string, number[]> {
  const ed = new EmergencyDepartment(params, { seed });
  const out: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]));
  for (let j = 0; j < periods; j++) {
    ed.resetStats();
    ed.step((j + 1) * periodMin);
    const m = ed.metrics();
    for (const k of keys) out[k].push(m[k]);
  }
  return out;
}

/** Ȳ_j = promedio entre n réplicas (semillas seedBase + i) del periodo j. */
export function averagedSeries(params: Params, n: number, seedBase: number, periods: number, periodMin: number, keys: string[]): Record<string, number[]> {
  const sum: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, Array(periods).fill(0)]));
  const cnt: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, Array(periods).fill(0)]));
  for (let i = 0; i < n; i++) {
    const s = periodSeries(params, seedBase + i, periods, periodMin, keys);
    for (const k of keys)
      s[k].forEach((v, j) => {
        // Un periodo sin datos (p. ej. nadie empezó consulta en esa hora) no entra al promedio.
        if (Number.isFinite(v)) {
          sum[k][j] += v;
          cnt[k][j]++;
        }
      });
  }
  return Object.fromEntries(keys.map((k) => [k, sum[k].map((s, j) => s / cnt[k][j])]));
}
