import { EmergencyDepartment } from '../model/ed';
import type { Params } from '../model/params';
import { confidenceInterval, type Interval } from '../validation/ci';

export interface ReplicationConfig {
  params: Params;
  /** número de réplicas */
  n: number;
  /** semilla base; la réplica i usa seedBase + i (mismas semillas entre escenarios → CRN) */
  seedBase: number;
  /** duración medida tras el calentamiento (min) */
  measure: number;
}

export interface ReplicationResult {
  raw: Record<string, number>[];
  ci: Record<string, Interval>;
}

/** Método de réplicas independientes con eliminación del calentamiento. */
export function runReplications(cfg: ReplicationConfig, onProgress?: (done: number) => void, level = 0.95): ReplicationResult {
  const raw: Record<string, number>[] = [];
  for (let i = 0; i < cfg.n; i++) {
    const ed = new EmergencyDepartment(cfg.params, { seed: cfg.seedBase + i, useWarmup: true });
    ed.step(cfg.params.warmup + cfg.measure);
    raw.push(ed.metrics());
    onProgress?.(i + 1);
  }
  const keys = Object.keys(raw[0]);
  const ci: Record<string, Interval> = {};
  for (const k of keys) ci[k] = confidenceInterval(raw.map((r) => r[k]), level);
  return { raw, ci };
}
