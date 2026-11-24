import type { Params } from '../model/params';
import { confidenceInterval, type Interval } from '../validation/ci';
import { runReplications } from './replicate';

export interface ScenarioRow {
  doctors: number;
  /** IC de la media de cada métrica */
  ci: Record<string, Interval>;
  /** IC de la diferencia pareada (escenario − referencia), réplica a réplica */
  diff: Record<string, Interval>;
  /**
   * Var(X − Y) / (Var X + Var Y): fracción de la varianza que queda gracias a los
   * números aleatorios comunes (1 = sin ganancia, igual que réplicas independientes).
   */
  varRatio: Record<string, number>;
}

export interface DoctorExperimentConfig {
  base: Params;
  doctors: number[];
  /** escenario de referencia para las diferencias pareadas */
  reference: number;
  n: number;
  seedBase: number;
  measure: number;
  keys: string[];
}

const variance = (xs: number[]) => confidenceInterval(xs).sd ** 2;

export interface ScenarioComparison {
  label: string;
  ci: Record<string, Interval>;
  diff: Record<string, Interval>;
  varRatio: Record<string, number>;
}

/**
 * Experimento de escenarios con números aleatorios comunes (CRN): todas las configuraciones
 * usan las mismas semillas seedBase + i, y cada proceso aleatorio del modelo tiene su propio
 * flujo, así que la réplica i de cada escenario ve exactamente las mismas llegadas.
 * Las diferencias contra el escenario `ref` se estiman réplica a réplica (IC pareado).
 */
export function compareScenarios(
  scenarios: { label: string; params: Params }[],
  ref: number,
  cfg: { n: number; seedBase: number; measure: number; keys: string[] },
  level = 0.95,
): ScenarioComparison[] {
  const runs = scenarios.map((sc) => runReplications({ params: sc.params, n: cfg.n, seedBase: cfg.seedBase, measure: cfg.measure }, undefined, level));
  const base = runs[ref];
  if (!base) throw new Error(`No existe el escenario de referencia ${ref}`);
  return runs.map((run, j) => {
    const ci: Record<string, Interval> = {};
    const diff: Record<string, Interval> = {};
    const varRatio: Record<string, number> = {};
    for (const k of cfg.keys) {
      const x = run.raw.map((r) => r[k]);
      const y = base.raw.map((r) => r[k]);
      ci[k] = run.ci[k];
      diff[k] = confidenceInterval(x.map((v, i) => v - y[i]), level);
      varRatio[k] = run === base ? NaN : diff[k].sd ** 2 / (variance(x) + variance(y));
    }
    return { label: scenarios[j].label, ci, diff, varRatio };
  });
}

/** T14: escenarios que solo cambian el número de médicos. */
export function doctorExperiment(cfg: DoctorExperimentConfig, level = 0.95): ScenarioRow[] {
  const ref = cfg.doctors.indexOf(cfg.reference);
  if (ref < 0) throw new Error(`La referencia (${cfg.reference} médicos) no está entre los escenarios`);
  const scenarios = cfg.doctors.map((d) => ({ label: String(d), params: { ...cfg.base, capacity: { ...cfg.base.capacity, doctors: d } } }));
  return compareScenarios(scenarios, ref, cfg, level).map((r, j) => ({ doctors: cfg.doctors[j], ci: r.ci, diff: r.diff, varRatio: r.varRatio }));
}
