/**
 * T26 — Seguimiento de una remisión en 4 pasos (figura C del PDF de T25):
 *   01 Atención (estabilizar) → 02 Selección (aceptar destino) → 03 Traslado (ambulancia) → 04 Recepción (liberar recurso).
 * Todo sale de eventos del motor; la liberación de la ambulancia no tiene evento (§4.4 congelado) y se lee del
 * estado del recurso. La lógica (`ReferralLog`, `referralSteps`) no toca el DOM y se prueba en Node.
 */
import type { SimEvent } from '../engine/events';
import type { PatientSnapshot } from '../model/ed';

export interface Referral {
  id: string;
  consultEnd?: number;
  hallway?: number;
  condition?: string;
  reason?: string;
  discarded?: { site: string; reason: string }[];
  accepted?: number;
  depart?: number;
  amb?: string;
  clinic?: string;
  trip?: number;
  arrive?: number;
  released?: number;
  /** hora exacta en que la ambulancia queda libre (dato del motor en TRANSFER_END, escenario de red) */
  freeAt?: number;
  /** salió fuera de la red sin destino elegible */
  out?: number;
}

const KEEP = 60;

export class ReferralLog {
  readonly all = new Map<string, Referral>();
  latest?: string;
  private consult = new Map<string, number>();

  onEvent(e: SimEvent): void {
    const id = e.patientId;
    if (!id) return;
    const d = (e.data ?? {}) as Record<string, unknown>;
    if (e.type === 'SERVICE_END' && d.station === 'doctor') this.consult.set(id, e.t);
    else if (e.type === 'HALLWAY_WAIT') {
      this.all.set(id, { id, consultEnd: this.consult.get(id), hallway: e.t });
      this.latest = id;
      if (this.all.size > KEEP) this.all.delete(this.all.keys().next().value!);
    } else if (e.type === 'BED_ASSIGNED' && this.all.get(id)?.depart === undefined) {
      this.all.delete(id); // tomó una cama de observación del hospital: ya no se remite
      if (this.latest === id) this.latest = [...this.all.keys()].at(-1);
    } else {
      const r = this.all.get(id);
      if (!r) return;
      if (e.type === 'TRANSFER_START') {
        Object.assign(r, {
          depart: e.t,
          amb: e.resourceId,
          trip: e.duration,
          clinic: d.clinic as string,
          condition: d.condition as string | undefined,
          reason: d.reason as string | undefined,
          discarded: d.discarded as Referral['discarded'],
          accepted: (d.acceptedAt as number | undefined) ?? e.t,
        });
      } else if (e.type === 'TRANSFER_END') {
        r.arrive = e.t;
        if (typeof d.freeAt === 'number') r.freeAt = d.freeAt;
      }
      else if (e.type === 'DEPARTURE' && r.depart === undefined) {
        const j = (d.journey ?? {}) as { clinic?: string; referralReason?: string; condition?: string };
        if (j.clinic === 'fuera de la red') Object.assign(r, { out: e.t, reason: j.referralReason, condition: j.condition });
      }
    }
  }

  /**
   * La ambulancia vuelve a estar libre (entrega + regreso). Con el dato del motor (`freeAt`) la hora es exacta;
   * sin él, se toma cuando deja de figurar como ocupada (precisión de un cuadro).
   */
  tick(t: number, away: ReadonlySet<string>): void {
    for (const r of this.all.values()) {
      if (r.arrive === undefined || r.released !== undefined) continue;
      if (r.freeAt !== undefined) {
        if (t >= r.freeAt) r.released = r.freeAt;
      } else if (r.amb && !away.has(r.amb)) r.released = t;
    }
  }
}

export type StepState = 'hecho' | 'en curso' | 'pendiente' | 'no aplica';
export interface Step {
  n: string;
  title: string;
  sub: string;
  state: StepState;
  when?: number;
  detail: string;
}

/** Los 4 pasos con su estado. `live` es el paciente en el snapshot (condición y evaluación mientras espera). */
export function referralSteps(r: Referral, now: number, live?: PatientSnapshot): Step[] {
  const min = (x: number) => `${x.toFixed(1).replace('.', ',')} min`;
  const condition = r.condition ?? live?.condition;
  const waiting = r.depart === undefined && r.out === undefined;
  const pending = live?.decision && !live.decision.chosen;
  const selection =
    r.out !== undefined
      ? `Sin destino elegible: ${r.reason ?? 'espera máxima cumplida'}. Remitido fuera de la red.`
      : r.depart !== undefined
        ? `${condition ?? ''} → ${r.clinic}.`
        : pending
          ? `${condition ?? ''}: ninguna sede elegible ahora; se reevalúa al liberarse una cama.`
          : `${condition ?? 'Condición por definir'}: coordinación con el CRUE (búsqueda y aceptación del destino).`;
  return [
    {
      n: '01',
      title: 'Atención',
      sub: 'Estabilizar',
      state: 'hecho',
      when: r.consultEnd ?? r.hallway,
      detail: 'Consulta médica terminada; pasa al pasillo de remisión.',
    },
    {
      n: '02',
      title: 'Selección',
      sub: 'Aceptar destino',
      state: r.out !== undefined || r.depart !== undefined ? 'hecho' : 'en curso',
      when: r.out ?? r.accepted,
      detail: selection + (waiting && r.hallway !== undefined ? ` Espera: ${min(now - r.hallway)}.` : ''),
    },
    {
      n: '03',
      title: 'Traslado',
      sub: 'Ambulancia',
      state: r.out !== undefined ? 'no aplica' : r.depart === undefined ? 'pendiente' : r.arrive === undefined ? 'en curso' : 'hecho',
      when: r.depart,
      detail:
        r.depart === undefined
          ? r.accepted !== undefined
            ? 'Cama reservada; esperando ambulancia libre.'
            : 'Se asigna cuando haya destino.'
          : `${r.amb} · ruta de ${min(r.trip ?? 0)}` + (r.arrive === undefined ? ` · faltan ${min(Math.max(0, r.depart + (r.trip ?? 0) - now))}` : ''),
    },
    {
      n: '04',
      title: 'Recepción',
      sub: 'Liberar recurso',
      state: r.out !== undefined ? 'no aplica' : r.arrive === undefined ? 'pendiente' : r.released === undefined ? 'en curso' : 'hecho',
      when: r.arrive,
      detail:
        r.arrive === undefined
          ? 'La sede recibe al paciente en la cama reservada.'
          : r.released === undefined
            ? `Recibido en ${r.clinic}. Ambulancia en entrega y regreso.`
            : `Recibido en ${r.clinic}. Ambulancia libre ${min(r.released - r.arrive)} después.`,
    },
  ];
}
