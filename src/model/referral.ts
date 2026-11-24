/**
 * T25 — Selección del destino de una remisión en la red de Valledupar (función pura, sin estado).
 *
 * No es una tabla diagnóstico → clínica. Para cada sede se revisa, en este orden:
 *   1. que reciba urgencias;
 *   2. la recepción documentada para la condición y la edad (matriz del informe: AD / C / ER / NH / SI);
 *   3. que tenga ubicación y ruta vial;
 *   4. que su capacidad esté documentada (si no, no se inventa: se descarta);
 *   5. que tenga cama simulada libre.
 * Gana la de menor tiempo de ruta entre las AD; si ninguna AD tiene cupo, la de menor tiempo entre las C
 * (supuesto: una sede condicionada solo se pide cuando no hay atención definitiva disponible).
 * Si ninguna cumple, no hay destino: el paciente espera y se reevalúa. Nunca se fuerza un destino incompatible.
 */
import { RECEPTION_LABEL, reception, type ConditionId, type Reception } from './valledupar/capabilities';
import { SITES, type SiteId } from './valledupar/sites';

/** Estado de una sede en el instante de la decisión (lo pone el motor). */
export interface SiteState {
  /** índice en `params.clinics`; ausente = capacidad no documentada, la sede no entra a la simulación */
  clinic?: number;
  beds?: number;
  occupied?: number;
  /** tiempo base de la ruta desde el origen (min); null = sin ubicación o sin ruta */
  minutes: number | null;
}

export interface Evaluation {
  site: SiteId;
  name: string;
  level: Reception;
  ok: boolean;
  /** por qué se eligió o se descartó, en español */
  reason: string;
  minutes?: number;
}

export interface Decision {
  chosen?: Evaluation & { clinic: number };
  evaluated: Evaluation[];
}

export function chooseDestination(condition: ConditionId, adult: boolean, origin: SiteId, state: Partial<Record<SiteId, SiteState>>): Decision {
  const evaluated: Evaluation[] = [];
  for (const s of SITES) {
    if (s.id === origin) continue;
    const { level, raw } = reception(condition, s.id, adult);
    const st = state[s.id];
    const base = { site: s.id, name: s.name, level };
    const no = (reason: string) => evaluated.push({ ...base, ok: false, reason });
    if (!s.emergency) no('no recibe urgencias');
    else if (level === 'NH' || level === 'ER' || level === 'SI') no(`${RECEPTION_LABEL[level]} (informe: «${raw}»)`);
    else if (!st || st.minutes === null) no('sin ubicación o sin ruta vial');
    else if (st.clinic === undefined || st.beds === undefined) no('capacidad no documentada');
    else if ((st.occupied ?? 0) >= st.beds) no(`saturada (${st.occupied}/${st.beds} camas simuladas)`);
    else evaluated.push({ ...base, ok: true, reason: `${RECEPTION_LABEL[level]}, ${st.beds - (st.occupied ?? 0)} camas simuladas libres`, minutes: st.minutes });
  }
  const pick = (lv: Reception) =>
    evaluated
      .filter((e) => e.ok && e.level === lv)
      .sort((a, b) => a.minutes! - b.minutes! || occ(a) - occ(b) || a.site.localeCompare(b.site))[0];
  const occ = (e: Evaluation) => {
    const st = state[e.site]!;
    return (st.occupied ?? 0) / st.beds!;
  };
  const best = pick('AD') ?? pick('C');
  if (!best) return { evaluated };
  best.reason = `${best.level === 'C' ? 'sin atención definitiva con cupo; ' : ''}${best.reason}; ruta más corta entre las elegibles (${best.minutes!.toFixed(1)} min)`;
  return { chosen: { ...best, clinic: state[best.site]!.clinic! }, evaluated };
}
