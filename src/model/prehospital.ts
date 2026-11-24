/**
 * T30 — Selección del destino de un paciente PREHOSPITALARIO (función pura; el motor arma los candidatos).
 *
 * Cada sede se clasifica como:
 *   - definitiva: urgencias + recepción AD o C para la condición y la edad + cama simulada libre del tipo requerido
 *     (el HRPL tiene urgencias completas simuladas: no se le pide cama de UCI, se le pide la recepción);
 *   - estabilizacion: tiene urgencias y ruta, pero no puede dar la atención definitiva ahora (no habilitada,
 *     condicionada o definitiva sin cama, o sin capacidad documentada). La atención inicial de urgencias no se
 *     niega (Ley 100/1993 art. 168; Ley 1751/2015 art. 14): cualquier sede con urgencias puede estabilizar;
 *   - insuficiente: la matriz del informe no tiene información para esa condición (puede estabilizar);
 *   - no-compatible: sin urgencias habilitadas o sin ruta vial.
 *
 * Tiempo hasta la atención adecuada (estimado, en minutos):
 *   definitiva     → ruta
 *   estabilización → ruta + estabilización + coordinación del CRUE + ruta a la mejor sede definitiva con cama
 *
 * Políticas: «más cercana» (menor ruta con urgencias), «compatible más cercana» (menor ruta con atención
 * definitiva) y «menor tiempo hasta atención adecuada» (la recomendada). Con la recomendada, un paciente
 * CRÍTICO (triage I–II o inestable) no puede ir a una sede a más de `criticalSlack` min de la urgencia más
 * cercana: se estabiliza ahí; la EPS no cuenta. Un paciente ESTABLE va a una sede definitiva de la red
 * documentada de su EPS si queda a ≤ `epsSlack` min de la mejor. La EPS nunca excluye una sede.
 */
import { CONDITION_LABEL, RECEPTION_LABEL, reception, type ConditionId, type Reception } from './valledupar/capabilities';
import { SITES, type SiteId } from './valledupar/sites';

export type Policy = 'cercana' | 'compatible' | 'tiempo';
export const POLICIES: Policy[] = ['cercana', 'compatible', 'tiempo'];
export const POLICY_LABEL: Record<Policy, string> = {
  cercana: 'Más cercana',
  compatible: 'Compatible más cercana',
  tiempo: 'Menor tiempo hasta la atención adecuada',
};
/** Estado documentado de la relación EPS–IPS (T29). La falta de información no es falta de convenio. */
export type EpsRelation = 'confirmada' | 'confirmada-servicios' | 'no-vigente' | 'inexistente' | 'insuficiente';
export type Kind = 'definitiva' | 'estabilizacion' | 'insuficiente' | 'no-compatible';
export const KIND_LABEL: Record<Kind, string> = {
  definitiva: 'Atención definitiva',
  estabilizacion: 'Solo estabiliza y remite',
  insuficiente: 'Información insuficiente',
  'no-compatible': 'No compatible',
};

/** Lo que el motor sabe de una sede en el instante de la decisión. */
export interface Candidate {
  site: SiteId;
  /** ruta desde el paciente; null = sin ruta vial */
  minutes: number | null;
  meters?: number;
  /** cama simulada del tipo requerido; ausente = capacidad no documentada */
  beds?: { free: number; total: number; label: string };
  /** HRPL: urgencias completas simuladas (triage, consulta, observación) */
  fullED?: boolean;
  /** si aquí solo se estabiliza: la mejor sede definitiva con cama desde aquí (null = ninguna ahora) */
  onward?: { site: SiteId; minutes: number } | null;
  eps: EpsRelation;
}

export interface PrehospitalInput {
  condition: ConditionId;
  adult: boolean;
  critical: boolean;
  epsName?: string;
  candidates: Candidate[];
  /** medias (min) de la estabilización y de la coordinación del CRUE, para el estimado */
  stabilization: number;
  coordination: number;
  epsSlack: number;
  criticalSlack: number;
}

export interface Option {
  site: SiteId;
  name: string;
  level: Reception;
  kind: Kind;
  /** se puede llevar ahí (al menos para estabilizar) */
  usable: boolean;
  minutes?: number;
  meters?: number;
  /** estimado hasta la atención adecuada */
  expected?: number;
  onward?: { site: SiteId; minutes: number } | null;
  eps: EpsRelation;
  reasons: string[];
}

export interface PrehospitalDecision {
  policy: Policy;
  chosen?: Option;
  /** por qué se eligió `chosen` (una frase) */
  why: string;
  options: Option[];
  byPolicy: Record<Policy, { site?: SiteId; kind?: Kind; minutes?: number; expected?: number }>;
}

const name = (id: SiteId) => SITES.find((s) => s.id === id)!.name;
const min = (x: number) => (x < 1 ? 'menos de 1 min' : `${Math.round(x)} min`);
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const IN_NETWORK: EpsRelation[] = ['confirmada', 'confirmada-servicios'];

export function classify(inp: PrehospitalInput): Option[] {
  return inp.candidates.map((c): Option => {
    const site = SITES.find((s) => s.id === c.site)!;
    const level = reception(inp.condition, c.site, inp.adult).level;
    const base = { site: c.site, name: site.name, level, eps: c.eps, ...(c.minutes !== null ? { minutes: c.minutes, meters: c.meters } : {}) };
    const epsNote =
      c.eps === 'insuficiente' || !inp.epsName
        ? []
        : [IN_NETWORK.includes(c.eps) ? `Pertenece a la red documentada de ${inp.epsName}.` : `Relación con ${inp.epsName}: ${c.eps === 'no-vigente' ? 'no vigente' : 'explícitamente inexistente'} (no impide la atención de urgencias).`];
    if (!site.emergency) return { ...base, kind: 'no-compatible', usable: false, reasons: ['No tiene urgencias habilitadas.'] };
    if (c.minutes === null) return { ...base, kind: 'no-compatible', usable: false, reasons: ['Sin ruta vial desde el paciente.'] };
    const route = `${(c.meters! / 1000).toFixed(1).replace('.', ',')} km · ${min(c.minutes)} de traslado.`;
    const definitive = level === 'AD' || level === 'C';
    if (definitive && (c.fullED || (c.beds && c.beds.free > 0))) {
      const bed = c.fullED ? 'Urgencias completas simuladas.' : `Tiene ${c.beds!.label} simuladas libres (${c.beds!.free} de ${c.beds!.total}).`;
      return { ...base, kind: 'definitiva', usable: true, expected: c.minutes, reasons: [`${cap(RECEPTION_LABEL[level])} para ${CONDITION_LABEL[inp.condition].toLowerCase()}.`, bed, route, ...epsNote] };
    }
    const why = !definitive
      ? level === 'SI'
        ? 'El informe no tiene información para esta condición.'
        : level === 'ER'
          ? 'Según el informe, para esta condición solo estabiliza y remite.'
          : 'No dispone del servicio requerido (no documentado como habilitado).'
      : c.beds
        ? `Se encuentra saturada en la simulación (0 de ${c.beds.total} ${c.beds.label} libres).`
        : 'No hay capacidad documentada del tipo de cama requerido.';
    const onward = c.onward;
    const expected = onward ? c.minutes + inp.stabilization + inp.coordination + onward.minutes : undefined;
    const then = onward
      ? `Solo permite estabilización y posterior remisión (después: ${name(onward.site)}, ${min(onward.minutes)}).`
      : 'Solo permite estabilización; ahora no hay sede definitiva con cama para la remisión.';
    return { ...base, kind: level === 'SI' ? 'insuficiente' : 'estabilizacion', usable: true, expected, onward, reasons: [why, then, route, ...epsNote] };
  });
}

const by = (f: (o: Option) => number) => (a: Option, b: Option) => f(a) - f(b);

function pick(policy: Policy, opts: Option[], inp: PrehospitalInput): { chosen?: Option; why: string } {
  const usable = opts.filter((o) => o.usable);
  if (!usable.length) return { why: 'Ninguna sede con urgencias tiene ruta vial: no hay destino.' };
  const nearest = [...usable].sort(by((o) => o.minutes!))[0];
  const defs = usable.filter((o) => o.kind === 'definitiva').sort(by((o) => o.minutes!));
  if (policy === 'cercana') return { chosen: nearest, why: `Es la sede con urgencias más cercana (${min(nearest.minutes!)}).` };
  if (policy === 'compatible')
    return defs.length
      ? { chosen: defs[0], why: `Es la sede más cercana con atención definitiva disponible (${min(defs[0].minutes!)}).` }
      : { chosen: nearest, why: 'Ninguna sede tiene atención definitiva disponible: se estabiliza en la más cercana.' };
  const ranked = usable.filter((o) => o.expected !== undefined).sort(by((o) => o.expected!));
  const best = ranked[0];
  if (!best) return { chosen: nearest, why: 'Ninguna sede puede dar la atención definitiva ahora: se estabiliza en la más cercana.' };
  if (inp.critical && best.minutes! > nearest.minutes! + inp.criticalSlack)
    return { chosen: nearest, why: `Paciente crítico: la mejor opción definitiva queda a ${min(best.minutes!)} y la urgencia más cercana a ${min(nearest.minutes!)}; se estabiliza primero.` };
  if (!inp.critical && inp.epsName && !IN_NETWORK.includes(best.eps)) {
    const own = ranked.find((o) => o.kind === 'definitiva' && IN_NETWORK.includes(o.eps));
    if (own && own.expected! <= best.expected! + inp.epsSlack)
      return { chosen: own, why: `Paciente estable: ${own.name} pertenece a la red documentada de ${inp.epsName} y llega ${min(own.expected! - best.expected!)} después que la mejor opción (tolerancia ${min(inp.epsSlack)}).` };
  }
  return {
    chosen: best,
    why:
      best.kind === 'definitiva'
        ? `Menor tiempo estimado hasta la atención adecuada (${min(best.expected!)}).`
        : `Menor tiempo estimado hasta la atención adecuada (${min(best.expected!)}), estabilizando primero aquí.`,
  };
}

export function choosePrehospital(inp: PrehospitalInput, policy: Policy = 'tiempo'): PrehospitalDecision {
  const options = classify(inp);
  const byPolicy = Object.fromEntries(
    POLICIES.map((k) => {
      const c = pick(k, options, inp).chosen;
      return [k, c ? { site: c.site, kind: c.kind, minutes: c.minutes, expected: c.expected } : {}];
    }),
  ) as PrehospitalDecision['byPolicy'];
  const { chosen, why } = pick(policy, options, inp);
  return { policy, chosen, why, options, byPolicy };
}
