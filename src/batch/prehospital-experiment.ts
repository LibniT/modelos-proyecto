/**
 * T33 — Experimentos prehospitalarios con el motor completo, réplicas y números aleatorios comunes (CRN).
 *
 * En cada réplica i, todos los escenarios reciben EXACTAMENTE los mismos pacientes (instantes, puntos, condición,
 * triage) generados con la semilla seedBase + i, y el motor usa esa misma semilla: las diferencias entre escenarios
 * se estiman réplica a réplica (IC pareados). Supuestos de la llegada de pacientes al mapa (no hay datos):
 *   - Poisson de tasa `ratePerHour`;
 *   - punto uniforme sobre la longitud de la red vial;
 *   - condición según la mezcla de remisiones del escenario de red; triage I/II/III con 25/50/25 %;
 *     triage III = estable; edad pediátrica solo para niño y recién nacido crítico; EPS no simulada.
 */
import { RngFactory } from '../engine/rng';
import { EmergencyDepartment, type PrehospitalCase } from '../model/ed';
import { networkParams } from '../model/params';
import type { Policy } from '../model/prehospital';
import type { ConditionId } from '../model/valledupar/capabilities';
import { roadPointAt, sitePoints, type RoadPoint, type Traffic } from '../model/valledupar/router';
import { confidenceInterval, type Interval } from '../validation/ci';

export interface PreScenario {
  label: string;
  policy: Policy;
  traffic: Traffic;
  ambulances: number;
}
export interface PreConfig {
  n: number;
  seedBase: number;
  /** días con llegadas de pacientes al mapa (después se deja terminar a los que están en curso) */
  days: number;
  ratePerHour: number;
}
export interface PreArrival {
  t: number;
  point: RoadPoint;
  condition: ConditionId;
  level: 1 | 2 | 3;
  ageRange: '0-17' | '40-64';
}

export const PRE_KEYS = ['firstCare', 'adequate', 'reached', 'secondTransfer', 'outNetwork', 'ambWait', 'km', 'util'] as const;
export type PreKey = (typeof PRE_KEYS)[number];
export const PRE_LABEL: Record<PreKey, string> = {
  firstCare: 'Tiempo hasta la primera atención (min)',
  adequate: 'Tiempo hasta la atención adecuada (min)',
  reached: 'Llegan a la atención adecuada (%)',
  secondTransfer: 'Necesitan un segundo traslado (%)',
  outNetwork: 'Sin destino en la red (%)',
  ambWait: 'Espera por ambulancia (min)',
  km: 'Distancia recorrida con el paciente (km)',
  util: 'Uso de ambulancias prehospitalarias (%)',
};

/** Pacientes de una réplica (independientes del escenario: CRN). */
export function prehospitalArrivals(seed: number, days: number, ratePerHour: number): PreArrival[] {
  const rng = new RngFactory(seed).stream('llegadas-mapa');
  const mix = networkParams().network!.conditionMix;
  const out: PreArrival[] = [];
  for (let t = -Math.log(1 - rng.next()) * (60 / ratePerHour); t < days * 1440; t += -Math.log(1 - rng.next()) * (60 / ratePerHour)) {
    const point = roadPointAt(rng.next(), rng.next());
    const condition = mix[rng.weighted(mix.map((c) => c.p))].id;
    const level = (rng.weighted([0.25, 0.5, 0.25]) + 1) as 1 | 2 | 3;
    out.push({ t, point, condition, level, ageRange: condition === 'nino_critico' || condition === 'recien_nacido_critico' ? '0-17' : '40-64' });
  }
  return out;
}

/** Instante en que el paciente llega a la atención adecuada (cama definitiva), si llega. */
function adequateAt(c: PrehospitalCase, edReferral?: number): number | undefined {
  const ch = c.decision.chosen;
  if (!ch) return undefined;
  if (ch.kind === 'definitiva') return c.arrived;
  if (c.onward?.arrived !== undefined) return c.onward.arrived;
  return edReferral; // estabilizado en el hospital de origen y luego remitido desde urgencias
}

export function runPrehospitalReplication(sc: PreScenario, seed: number, arrivals: PreArrival[], days: number): Record<PreKey, number> & { cases: PrehospitalCase[] } {
  const p = networkParams(sc.traffic);
  p.network!.prehospital.ambulances = sc.ambulances;
  const ed = new EmergencyDepartment(p, { seed });
  const ids = new Set<string>();
  const referralEnd = new Map<string, number>();
  ed.onEvent((e) => {
    if (e.type === 'TRANSFER_END' && !e.data?.prehospital && e.patientId && ids.has(e.patientId)) referralEnd.set(e.patientId, e.t);
  });
  for (const a of arrivals) {
    ed.step(a.t);
    const c = ed.injectPrehospital({
      info: { name: 'P', ageRange: a.ageRange, eps: 'sin-dato' },
      level: a.level,
      condition: a.condition,
      stable: a.level === 3,
      ambulance: true,
      point: a.point,
      policy: sc.policy,
    });
    if (c) ids.add(c.id);
  }
  ed.step(days * 1440);
  const util = ed.prehospitalAmbulances!.utilization;
  ed.step((days + 2) * 1440); // los que siguen en camino terminan
  const cases = ed.prehospitalCases();
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const first = cases.filter((c) => c.arrived !== undefined).map((c) => c.arrived! - c.created);
  const adeq = cases.map((c) => [c, adequateAt(c, referralEnd.get(c.id))] as const);
  const reached = adeq.filter(([, t]) => t !== undefined);
  return {
    cases,
    firstCare: mean(first),
    adequate: mean(reached.map(([c, t]) => t! - c.created)),
    reached: (100 * reached.length) / cases.length,
    secondTransfer: (100 * cases.filter((c) => c.onward).length) / cases.length,
    outNetwork: (100 * cases.filter((c) => c.outcome === 'fuera de la red').length) / cases.length,
    ambWait: mean(cases.filter((c) => c.dispatched !== undefined).map((c) => c.dispatched! - c.requested!)),
    km: mean(cases.map((c) => c.legs.filter((l) => l.kind !== 'a-escena').reduce((s, l) => s + l.meters, 0) / 1000)),
    util: 100 * util,
  };
}

export interface PreComparison {
  label: string;
  ci: Record<PreKey, Interval>;
  diff: Record<PreKey, Interval>;
}

/** Réplicas de cada escenario con CRN e IC pareados contra el escenario `ref`. */
export function comparePrehospital(scenarios: PreScenario[], ref: number, cfg: PreConfig, level = 0.95): { rows: PreComparison[]; baseline: ReturnType<typeof runPrehospitalReplication>[] } {
  const raw = scenarios.map(() => [] as Record<PreKey, number>[]);
  const baseline: ReturnType<typeof runPrehospitalReplication>[] = [];
  for (let i = 0; i < cfg.n; i++) {
    const seed = cfg.seedBase + i;
    const arrivals = prehospitalArrivals(seed, cfg.days, cfg.ratePerHour);
    scenarios.forEach((sc, j) => {
      const r = runPrehospitalReplication(sc, seed, arrivals, cfg.days);
      raw[j].push(r);
      if (j === ref) baseline.push(r);
    });
  }
  const rows = scenarios.map((sc, j) => {
    const ci = {} as Record<PreKey, Interval>;
    const diff = {} as Record<PreKey, Interval>;
    for (const k of PRE_KEYS) {
      ci[k] = confidenceInterval(raw[j].map((r) => r[k]), level);
      diff[k] = confidenceInterval(raw[j].map((r, i) => r[k] - raw[ref][i][k]), level);
    }
    return { label: sc.label, ci, diff };
  });
  return { rows, baseline };
}

/** Distancia en línea recta del punto al hospital de origen (para el experimento D, por sector). */
export const distanceToOrigin = (c: PrehospitalCase) => {
  const o = sitePoints().hrpl;
  return Math.hypot(c.point.x - o.x, c.point.y - o.y);
};
