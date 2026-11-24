/**
 * T32 — Seguimiento del paciente colocado en el mapa: línea de tiempo con SOLO las etapas de su recorrido.
 * Todo sale del motor: la historia del caso (`ed.prehospitalCases()`, tiempos exactos) y los eventos de urgencias
 * del hospital de origen (triage, consulta, salida). Un intervalo sin registro no se explica. Sin DOM.
 */
import type { SimEvent } from '../engine/events';
import type { PrehospitalCase } from '../model/ed';
import { KIND_LABEL, POLICY_LABEL } from '../model/prehospital';
import { CONDITION_LABEL } from '../model/valledupar/capabilities';
import { SITES, type SiteId } from '../model/valledupar/sites';
import { CONDITION_POOL, POOLS } from '../model/params';

export interface Stage {
  key: string;
  title: string;
  /** minuto de simulación en que ocurrió (si ya ocurrió) */
  when?: number;
  state: 'hecho' | 'en curso' | 'pendiente';
  detail: string;
}

/** Lo que pasó dentro de urgencias del hospital de origen (eventos del motor). */
export interface EdTrace {
  triage?: { t: number; level: number };
  doctor?: number;
  obs?: number;
  hallway?: number;
  referral?: { t: number; clinic: string };
  departure?: { t: number; outcome: string };
}

export class CaseLog {
  readonly trace = new Map<string, EdTrace>();
  watch(id: string): void {
    if (!this.trace.has(id)) this.trace.set(id, {});
  }
  onEvent(e: SimEvent): void {
    const tr = e.patientId ? this.trace.get(e.patientId) : undefined;
    if (!tr || e.data?.prehospital) return;
    if (e.type === 'TRIAGE_ASSIGNED') tr.triage = { t: e.t, level: Number(e.data?.level) };
    else if (e.type === 'SERVICE_START' && e.data?.station === 'doctor') tr.doctor ??= e.t;
    else if (e.type === 'BED_ASSIGNED' && e.resourceId?.startsWith('bed-')) tr.obs ??= e.t;
    else if (e.type === 'HALLWAY_WAIT') tr.hallway ??= e.t;
    else if (e.type === 'TRANSFER_START') tr.referral = { t: e.t, clinic: String(e.data?.clinic ?? '') };
    else if (e.type === 'DEPARTURE') tr.departure = { t: e.t, outcome: String(e.data?.outcome ?? '') };
  }
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const OUTCOME: Record<string, string> = { alta: 'alta', abandono: 'abandono', hospitalizacion: 'hospitalización', remitido: 'remisión a otra sede' };
const name = (id: SiteId | 'paciente') => (id === 'paciente' ? 'el paciente' : SITES.find((s) => s.id === id)!.name);
export const fmtMin = (m: number) => (m < 1 ? `${Math.round(m * 60)} s` : m < 120 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1).replace('.', ',')} h`);
/** «pre-0» → «Ambulancia prehospitalaria 1» */
export const ambLabel = (a?: string) => (a ? `Ambulancia prehospitalaria ${Number(a.split('-')[1]) + 1}` : 'Ambulancia');
const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;

export function caseTitle(c: PrehospitalCase): string {
  return `${c.name} · ${CONDITION_LABEL[c.condition]} · triage ${ROMAN[c.level]}${c.critical ? ' · crítico' : ''}`;
}

/** Etapas del recorrido. `now` es el reloj de la simulación que se está mostrando. */
export function timeline(c: PrehospitalCase, now: number, ed?: EdTrace): Stage[] {
  const raw: (Omit<Stage, 'state'> & { done: boolean })[] = [];
  const add = (key: string, title: string, done: boolean, detail: string, when?: number) => raw.push({ key, title, done, detail, ...(when !== undefined ? { when } : {}) });
  const chosen = c.decision.chosen;
  add('creado', 'Paciente en el mapa', true, `Punto ajustado a la vía más cercana. ${caseTitle(c)}.`, c.created);
  add('destino', 'Destino elegido', true, chosen ? `${chosen.name} · ${KIND_LABEL[chosen.kind].toLowerCase()}. ${c.decision.why}` : c.decision.why, c.created);
  if (!chosen) return finish(raw, now);
  const toScene = c.legs.find((l) => l.kind === 'a-escena' && l.to === 'paciente');
  const toDest = c.legs.find((l) => l.kind === 'a-destino');
  if (c.requested !== undefined) {
    add('ambulancia', 'Ambulancia asignada', c.dispatched !== undefined, c.dispatched !== undefined ? `${ambLabel(toScene?.amb)} · esperó ${fmtMin(c.dispatched - c.requested)} por una ambulancia libre.` : 'Todas las ambulancias prehospitalarias están ocupadas: espera en cola.', c.dispatched);
    add('escena', 'Llegada al paciente', c.atScene !== undefined, toScene ? `${km(toScene.meters)} desde la base · ${fmtMin(toScene.minutes)} de recorrido.` : 'Sale de la base en el hospital de origen.', c.atScene);
    add('salida', 'Atención en la escena', c.leftScene !== undefined, c.leftScene !== undefined && c.atScene !== undefined ? `Duró ${fmtMin(c.leftScene - c.atScene)}.` : 'Valoración y alistamiento antes de salir.', c.leftScene);
  }
  const dest = chosen.site;
  add(
    'traslado',
    `Traslado a ${name(dest)}`,
    c.arrived !== undefined,
    toDest ? `${km(toDest.meters)} · ${fmtMin(toDest.minutes)}${toDest.amb ? '' : ' por sus medios'} (estimado por la ruta).` : `${km(chosen.meters ?? 0)} · ${fmtMin(chosen.minutes ?? 0)} estimados.`,
    toDest?.t0,
  );
  const origin = c.decision.options.find((o) => o.site === dest);
  if (chosen.kind === 'definitiva' && dest !== 'hrpl') {
    const label = POOLS.find((k) => k.id === CONDITION_POOL[c.condition])!.label;
    add('cama', `Ingreso a ${name(dest)}`, c.arrived !== undefined, `Ocupa una de sus ${label} simuladas (reservada al elegir el destino). En esta sede no se simulan triage ni consulta.`, c.arrived);
  } else if (dest === 'hrpl' || c.destination === 'hrpl') {
    add('llegada', 'Llegada a urgencias del hospital de origen', c.arrived !== undefined, 'Entra por la bahía de ambulancias al flujo simulado completo.', c.arrived);
  } else {
    add('llegada', `Llegada a ${name(dest)}`, c.arrived !== undefined, origin?.reasons[0] ?? '', c.arrived);
    add('estabilizacion', 'Estabilización', c.stabilized !== undefined, c.stabilized !== undefined && c.arrived !== undefined ? `Duró ${fmtMin(c.stabilized - c.arrived)}.` : 'Atención inicial de urgencias; luego el CRUE busca la atención definitiva.', c.stabilized);
    const ow = c.onward;
    add('crue', 'Remisión coordinada (CRUE)', !!ow, ow ? `${name(ow.site)} · esperó ${fmtMin(ow.decidedAt - c.stabilized!)} por un destino con cama.` : c.outcome === 'fuera de la red' ? 'Sin sede definitiva con cama.' : 'Buscando una sede definitiva con cama.', ow?.decidedAt);
    if (ow || c.outcome !== 'fuera de la red') {
      const leg = c.legs.find((l) => l.kind === 'a-definitiva');
      add('remision', ow ? `Traslado a ${name(ow.site)}` : 'Traslado a la atención definitiva', !!ow?.arrived, leg ? `${km(leg.meters)} · ${fmtMin(leg.minutes)} estimados.` : 'Espera una ambulancia.', leg?.t0);
    }
  }
  // Dentro de urgencias del hospital de origen: lo que registró el motor.
  if (c.destination === 'hrpl' && c.arrived !== undefined) {
    add('triage', 'Triage hospitalario', !!ed?.triage, ed?.triage ? `Triage ${ROMAN[ed.triage.level]} (${fmtMin(ed.triage.t - c.arrived)} después de llegar).` : 'En espera del triage.', ed?.triage?.t);
    add('consulta', 'Consulta médica', ed?.doctor !== undefined, ed?.doctor !== undefined && ed.triage ? `Empezó ${fmtMin(ed.doctor - ed.triage.t)} después del triage.` : 'En espera de médico.', ed?.doctor);
    if (ed?.obs !== undefined) add('obs', 'Observación', true, 'Cama de observación del hospital.', ed.obs);
    if (ed?.hallway !== undefined) add('pasillo', 'Espera en el pasillo', true, 'Sin cama de observación o requiere remisión.', ed.hallway);
    if (ed?.referral) add('remision-ed', `Remisión a ${ed.referral.clinic}`, true, 'Traslado en ambulancia de remisión.', ed.referral.t);
  }
  const final =
    c.outcome === 'fuera de la red'
      ? 'Remitido fuera de la red (sin destino con cama).'
      : ed?.departure
        ? `Salida de urgencias por ${OUTCOME[ed.departure.outcome] ?? ed.departure.outcome}.`
        : c.outcome === 'cama en la sede'
          ? 'Hospitalizado en la sede (estancia simulada).'
          : undefined;
  if (final) add('final', 'Estado final', true, final, ed?.departure?.t ?? c.arrived);
  if (c.ambulanceFree.length) add('libre', 'Ambulancia libre', true, 'Entregó al paciente y volvió a la base.', c.ambulanceFree.at(-1));
  return finish(raw, now);
}

function finish(raw: (Omit<Stage, 'state'> & { done: boolean })[], now: number): Stage[] {
  let active = false;
  return raw
    .filter((s) => s.when === undefined || s.when <= now || !s.done)
    .map(({ done, ...s }) => {
      const state: Stage['state'] = done ? 'hecho' : active ? 'pendiente' : 'en curso';
      if (!done) active = true;
      return { ...s, state };
    });
}

/** Resumen del caso para la cabecera del seguimiento. */
export function caseSummary(c: PrehospitalCase, now: number): { label: string; value: string }[] {
  const chosen = c.decision.chosen;
  const out = [
    { label: 'Estado', value: c.status },
    { label: 'Destino', value: chosen ? name(chosen.site) : '—' },
    { label: 'Política', value: POLICY_LABEL[c.decision.policy] },
    { label: 'Tiempo transcurrido', value: fmtMin(now - c.created) },
  ];
  if (c.dispatched !== undefined && c.requested !== undefined) out.push({ label: 'Espera por ambulancia', value: fmtMin(c.dispatched - c.requested) });
  if (chosen?.minutes !== undefined) out.push({ label: 'Traslado estimado', value: `${km(chosen.meters ?? 0)} · ${fmtMin(chosen.minutes)}` });
  if (c.onward && c.stabilized !== undefined) out.push({ label: 'Espera por cama (CRUE)', value: fmtMin(c.onward.decidedAt - c.stabilized) });
  return out;
}
