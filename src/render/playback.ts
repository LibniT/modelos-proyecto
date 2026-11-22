/**
 * Reproductor del registro de eventos (SPEC §4.4–4.5). No dibuja nada: mantiene, por paciente,
 * dónde está y su último MOVE, y responde la posición en cualquier instante del reloj del render.
 * Regla: ninguna posición cambia si no es por un evento aplicado aquí.
 */
import type { AppearanceSpec, PatientInfo, SimEvent, TriageLevel, Zone } from '../engine/events';
import type { Snapshot } from '../model/ed';
import { along, ambulanceRoute, isSlotZone, route, slotPos, stationPos, zoneAnchor, type SlotZone, type Vec } from './layout';

export interface Figure {
  id: string;
  name: string;
  triage?: TriageLevel;
  zone: Zone;
  /** puesto que ocupa ('triage-0', 'doctor-3', 'bed-7'…) */
  resourceId?: string;
  /** puesto de espera dentro de una zona con sillas / fila / camillas */
  slot?: number;
  /** último traslado: ruta fija recorrida en exactamente `dur` minutos */
  walk?: { path: Vec[]; t0: number; dur: number };
  /** va en ambulancia hacia una clínica */
  hidden: boolean;
  /** T09: datos para el personaje (vienen en ARRIVAL.data.info o en el snapshot) */
  ageRange?: PatientInfo['ageRange'];
  isVisitor?: boolean;
  appearance?: AppearanceSpec;
}

export type Capacity = { triage: number; admission: number; doctors: number; obsBeds: number; ambulances: number };

export class Playback {
  readonly figures = new Map<string, Figure>();
  readonly capacity: Capacity;
  /** ambulancias que salieron (TRANSFER_START). El regreso no tiene evento: T06 lo lee de snapshot(). */
  readonly ambulancesAway = new Set<string>();
  /** T12: traslados en curso por ambulancia (TRANSFER_START → TRANSFER_END), con su duración del motor */
  readonly transfers = new Map<string, { patientId: string; t0: number; dur: number; clinic: string }>();
  /** T16: salidas aplicadas (DEPARTURE con su `journey`); la interfaz las va consumiendo */
  readonly departures: SimEvent[] = [];
  /** T18: se llama con cada evento ANTES de aplicarlo (el paciente aún existe; para subtítulos) */
  onApply?: (e: SimEvent) => void;
  /** reloj: instante del último avance */
  t: number;
  private readonly pending: SimEvent[] = [];
  private readonly used = new Map<SlotZone, Set<number>>();

  constructor(initial: Snapshot) {
    this.t = initial.t;
    this.capacity = {
      triage: initial.triage.capacity,
      admission: initial.admission.capacity,
      doctors: initial.doctors.capacity,
      obsBeds: initial.obsBeds.capacity,
      ambulances: initial.ambulances.capacity,
    };
    for (const p of initial.patients) {
      const f: Figure = { id: p.id, name: p.name, triage: p.triage, zone: p.zone, resourceId: p.resourceId, hidden: p.state === 'en traslado', ageRange: p.ageRange, isVisitor: p.isVisitor };
      if (f.hidden && p.resourceId) this.ambulancesAway.add(p.resourceId);
      if (!f.resourceId && isSlotZone(p.zone)) f.slot = this.take(p.zone);
      this.figures.set(p.id, f);
    }
  }

  /** Agrega eventos (ya vienen ordenados por t, seq desde el motor). */
  push(events: SimEvent[]): void {
    this.pending.push(...events);
  }

  /** Aplica todos los eventos con t ≤ t. */
  advance(t: number): void {
    let i = 0;
    while (i < this.pending.length && this.pending[i].t <= t) this.apply(this.pending[i++]);
    this.pending.splice(0, i);
    this.t = t;
  }

  get done(): boolean {
    return this.pending.length === 0;
  }

  /** Destino actual de la figura (puesto, silla o punto de la zona). */
  target(f: Figure): Vec {
    if (f.resourceId) {
      const s = stationPos(f.resourceId);
      if (s) return s;
    }
    if (f.slot !== undefined && isSlotZone(f.zone)) return slotPos(f.zone, f.slot);
    return zoneAnchor(f.zone);
  }

  /** Posición de una ambulancia en traslado: avanza por su ruta en proporción al tiempo de viaje del motor. */
  ambulancePosition(ambId: string, t: number): Vec | undefined {
    const tr = this.transfers.get(ambId);
    if (!tr) return undefined;
    return along(ambulanceRoute(ambId), tr.dur > 0 ? (t - tr.t0) / tr.dur : 1);
  }

  /** Posición en el instante t. Con `snap` (velocidad > ×120) salta al destino sin interpolar. */
  position(f: Figure, t: number, snap = false): Vec {
    const w = f.walk;
    if (!snap && w && t < w.t0 + w.dur) {
      // El destino puede precisarse durante el traslado (silla asignada): el último punto es el destino vigente.
      const path = [...w.path.slice(0, -1), this.target(f)];
      return along(path, (t - w.t0) / w.dur);
    }
    return this.target(f);
  }

  private take(zone: SlotZone): number {
    let s = this.used.get(zone);
    if (!s) this.used.set(zone, (s = new Set()));
    let i = 0;
    while (s.has(i)) i++;
    s.add(i);
    return i;
  }

  private free(f: Figure): void {
    if (f.slot !== undefined && isSlotZone(f.zone)) this.used.get(f.zone)?.delete(f.slot);
    f.slot = undefined;
  }

  private apply(e: SimEvent): void {
    this.onApply?.(e);
    if (e.type === 'PARAM_CHANGE') {
      for (const [k, v] of Object.entries(e.data ?? {})) if (k in this.capacity && typeof v === 'number') this.capacity[k as keyof Capacity] = v;
      return;
    }
    if (!e.patientId) return;
    if (e.type === 'ARRIVAL') {
      const info = (e.data?.info ?? {}) as Partial<PatientInfo>;
      this.figures.set(e.patientId, {
        id: e.patientId,
        name: info.name ?? e.patientId,
        triage: info.triage,
        zone: e.to ?? 'entrance',
        hidden: false,
        ageRange: info.ageRange,
        isVisitor: info.isVisitor,
        appearance: info.appearance,
      });
      return;
    }
    const f = this.figures.get(e.patientId);
    if (!f) return;
    switch (e.type) {
      case 'MOVE': {
        const from = this.position(f, e.t);
        this.free(f);
        f.resourceId = undefined;
        f.zone = e.to!;
        if (isSlotZone(f.zone)) f.slot = this.take(f.zone);
        f.walk = { path: route(from, this.target(f)), t0: e.t, dur: e.duration ?? 0 };
        break;
      }
      case 'QUEUE_JOIN':
      case 'HALLWAY_WAIT':
        if (e.to) f.zone = e.to;
        if (e.type === 'HALLWAY_WAIT') f.zone = 'hallway';
        if (f.slot === undefined && isSlotZone(f.zone)) f.slot = this.take(f.zone);
        break;
      case 'SERVICE_START':
      case 'BED_ASSIGNED':
        // El modelo no tiene traslado de la cola al puesto: el paciente ocupa el puesto en este instante.
        this.free(f);
        f.walk = undefined;
        f.resourceId = e.resourceId;
        break;
      case 'TRIAGE_ASSIGNED':
        f.triage = e.data?.level as TriageLevel;
        break;
      case 'TRANSFER_START':
        this.free(f);
        f.walk = undefined;
        f.zone = 'ambulance_bay';
        f.resourceId = undefined;
        f.hidden = true;
        if (e.resourceId) {
          this.ambulancesAway.add(e.resourceId);
          this.transfers.set(e.resourceId, { patientId: f.id, t0: e.t, dur: e.duration ?? 0, clinic: String(e.data?.clinic ?? e.to) });
        }
        break;
      case 'TRANSFER_END':
        if (e.resourceId) this.transfers.delete(e.resourceId);
        break;
      case 'DEPARTURE':
        this.departures.push(e);
        this.free(f);
        this.figures.delete(f.id);
        break;
    }
  }
}
