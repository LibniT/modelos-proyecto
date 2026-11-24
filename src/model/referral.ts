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
  /** elegible, pero la sede no aceptó el traslado en esta coordinación (aceptación simulada) */
  rejected?: boolean;
}

export interface Decision {
  chosen?: Evaluation & { clinic: number };
  evaluated: Evaluation[];
}

/**
 * `resource`: tipo de cama que se necesita (p. ej. «camas de UCI adulto»), para los motivos.
 * `accept`: aceptación simulada de cada candidata, en orden de preferencia (por defecto, todas aceptan).
 */
export function chooseDestination(
  condition: ConditionId,
  adult: boolean,
  origin: SiteId,
  state: Partial<Record<SiteId, SiteState>>,
  resource = 'camas',
  accept: (e: Evaluation) => boolean = () => true,
): Decision {
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
    else if (st.clinic === undefined || st.beds === undefined) no(`sin ${resource} documentadas`);
    else if ((st.occupied ?? 0) >= st.beds) no(`saturada (${st.occupied}/${st.beds} ${resource} simuladas)`);
    else evaluated.push({ ...base, ok: true, reason: `${RECEPTION_LABEL[level]}, ${st.beds - (st.occupied ?? 0)} ${resource} simuladas libres`, minutes: st.minutes });
  }
  const occ = (e: Evaluation) => {
    const st = state[e.site]!;
    return (st.occupied ?? 0) / st.beds!;
  };
  const sorted = (lv: Reception) =>
    evaluated.filter((e) => e.ok && e.level === lv).sort((a, b) => a.minutes! - b.minutes! || occ(a) - occ(b) || a.site.localeCompare(b.site));
  // Se ofrece primero a las AD por cercanía y después a las C; la primera que acepta es el destino.
  let best: Evaluation | undefined;
  const tried = new Set<Evaluation>();
  for (const e of [...sorted('AD'), ...sorted('C')]) {
    tried.add(e);
    if (accept(e)) {
      best = e;
      break;
    }
    e.ok = false;
    e.rejected = true;
    e.reason = `${e.reason}; no aceptó el traslado en esta coordinación (aceptación simulada)`;
  }
  if (!best) return { evaluated };
  const rejectedAD = evaluated.some((e) => e.rejected && e.level === 'AD');
  best.reason = `${best.level === 'C' ? (rejectedAD ? 'ninguna sede con atención definitiva aceptó; ' : 'sin atención definitiva con cupo; ') : ''}${best.reason}; ${
    [...tried].some((e) => e.rejected) ? 'primera que aceptó en orden de cercanía' : 'ruta más corta entre las elegibles'
  } (${best.minutes!.toFixed(1)} min)`;
  for (const e of evaluated)
    if (e.ok && e !== best)
      e.reason = e.level === 'C' && best.level === 'AD' ? 'condicionada: se prefiere una sede con atención definitiva y cupo' : `elegible, pero su ruta es más larga (${e.minutes!.toFixed(1)} min)`;
  return { chosen: { ...best, clinic: state[best.site]!.clinic! }, evaluated };
}
