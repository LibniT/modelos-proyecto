import type { Params } from '../model/params';
import type { ReplicationResult } from '../batch/replicate';
import { confidenceInterval } from './ci';
import { cobham, erlangB, mmc } from './analytic';
import { distMean } from '../engine/distributions';

export interface ValidationRow {
  /** etiqueta legible */
  label: string;
  /** clave de métrica del motor */
  key: string;
  formula: string;
  analytic: number;
  mean: number;
  lo: number;
  hi: number;
  /** límites con el nivel corregido por Bonferroni (para la prueba conjunta) */
  loB: number;
  hiB: number;
  /** ¿el valor analítico cae en el IC 95 %? */
  inCI: boolean;
  /** ¿cae en el IC conjunto de Bonferroni? */
  inBonferroni: boolean;
  relError: number;
}

/**
 * Compara la salida de las réplicas con las fórmulas exactas.
 * Requiere el modo validación (docs/SPEC.md §2.5): todo exponencial, λ constante,
 * sin abandono, observación como pérdida pura, μ de consulta igual en todos los niveles.
 */
export function validationTable(p: Params, res: ReplicationResult, level = 0.95): ValidationRow[] {
  if (p.mode !== 'validacion') throw new Error('La tabla de validación solo aplica al modo validación');
  for (const d of [p.service.triage, p.service.admission, p.service.doctor, p.service.observation]) {
    if (d.kind !== 'exp') throw new Error('Modo validación requiere tiempos exponenciales');
  }
  const lam = p.arrivalRatePerHour / 60;
  const mix = p.triageMix;
  const muT = 1 / distMean(p.service.triage);
  const muA = 1 / distMean(p.service.admission);
  const muD = 1 / distMean(p.service.doctor);
  const c = p.capacity;

  const tri = mmc(lam, muT, c.triage);
  const lamA = lam * (1 - mix[0]);
  const adm = mmc(lamA, muA, c.admission);
  const doc = mmc(lam, muD, c.doctors);
  const cob = cobham(mix.map((x) => x * lam), muD, c.doctors);
  // La cama se reserva en la decisión: tiempo de ocupación = estancia + traslado interno.
  const lamObs = lam * p.outcomes.observacion;
  const holdObs = distMean(p.service.observation) + p.transit;
  const bObs = erlangB(c.obsBeds, lamObs * holdObs);

  const spec: { label: string; key: string; formula: string; value: number }[] = [
    { label: 'Triage: utilización ρ', key: 'triage.rho', formula: 'λ/(cμ)', value: tri.rho },
    { label: 'Triage: espera en cola Wq (min)', key: 'triage.Wq', formula: 'Erlang C', value: tri.Wq },
    { label: 'Triage: longitud de cola Lq', key: 'triage.Lq', formula: 'λ·Wq', value: tri.Lq },
    { label: 'Admisión: utilización ρ', key: 'admission.rho', formula: 'λ(1−p₁)/(cμ)', value: adm.rho },
    { label: 'Admisión: espera Wq (min)', key: 'admission.Wq', formula: 'Erlang C', value: adm.Wq },
    { label: 'Médicos: utilización ρ', key: 'doctor.rho', formula: 'λ/(cμ)', value: doc.rho },
    { label: 'Médicos: espera Wq (min)', key: 'doctor.Wq', formula: 'Erlang C', value: doc.Wq },
    { label: 'Médicos: longitud de cola Lq', key: 'doctor.Lq', formula: 'λ·Wq', value: doc.Lq },
    { label: 'Espera Triage I (min)', key: 'doctor.Wq.L1', formula: 'Cobham', value: cob[0] },
    { label: 'Espera Triage II (min)', key: 'doctor.Wq.L2', formula: 'Cobham', value: cob[1] },
    { label: 'Espera Triage III (min)', key: 'doctor.Wq.L3', formula: 'Cobham', value: cob[2] },
    { label: 'Espera Triage IV (min)', key: 'doctor.Wq.L4', formula: 'Cobham', value: cob[3] },
    { label: 'Espera Triage V (min)', key: 'doctor.Wq.L5', formula: 'Cobham', value: cob[4] },
    { label: 'Observación: P(no hay cama)', key: 'obs.blockProb', formula: 'Erlang B', value: bObs },
    { label: 'Observación: camas ocupadas', key: 'obs.occupancy', formula: 'a·(1−B)', value: lamObs * holdObs * (1 - bObs) },
  ];

  const m = spec.length + 1; // + Ley de Little
  const levelB = 1 - (1 - level) / m;
  const rows: ValidationRow[] = spec.map((s) => {
    const xs = res.raw.map((r) => r[s.key]);
    const ci = confidenceInterval(xs, level);
    const cb = confidenceInterval(xs, levelB);
    return {
      label: s.label,
      key: s.key,
      formula: s.formula,
      analytic: s.value,
      mean: ci.mean,
      lo: ci.lo,
      hi: ci.hi,
      loB: cb.lo,
      hiB: cb.hi,
      inCI: s.value >= ci.lo && s.value <= ci.hi,
      inBonferroni: s.value >= cb.lo && s.value <= cb.hi,
      relError: (ci.mean - s.value) / s.value,
    };
  });

  // Ley de Little sobre la trayectoria: L − λ̂·Ŵ debe ser ≈ 0.
  const diffs = res.raw.map((r) => r['L'] - r['lambda'] * r['W']);
  const ci = confidenceInterval(diffs, level);
  const cb = confidenceInterval(diffs, levelB);
  const Lmean = res.raw.reduce((s, r) => s + r['L'], 0) / res.raw.length;
  rows.push({
    label: 'Ley de Little: L − λ·W',
    key: 'little',
    formula: 'L = λW',
    analytic: 0,
    mean: ci.mean,
    lo: ci.lo,
    hi: ci.hi,
    loB: cb.lo,
    hiB: cb.hi,
    inCI: ci.lo <= 0 && 0 <= ci.hi,
    inBonferroni: cb.lo <= 0 && 0 <= cb.hi,
    relError: ci.mean / Lmean,
  });
  return rows;
}

/** Tabla en Markdown (para docs/VALIDACION.md y el póster). */
export function validationMarkdown(rows: ValidationRow[]): string {
  const f = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(1) : Math.abs(x) >= 1 ? x.toFixed(3) : x.toFixed(4));
  const lines = ['| Medida | Fórmula | Analítico | Simulado (media) | IC 95 % | Error rel. | ¿En IC? |', '|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    lines.push(`| ${r.label} | ${r.formula} | ${f(r.analytic)} | ${f(r.mean)} | [${f(r.lo)}, ${f(r.hi)}] | ${(r.relError * 100).toFixed(2)} % | ${r.inCI ? 'sí' : r.inBonferroni ? 'sí (Bonferroni)' : 'NO'} |`);
  }
  return lines.join('\n');
}
