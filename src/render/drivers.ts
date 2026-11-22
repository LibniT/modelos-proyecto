/**
 * Fuentes de eventos para la escena. Sin Phaser (se prueban en Node).
 * Reloj del render: t += dt_real × velocidad / 60 (min), SPEC §4.5.
 */
import type { PatientInfo, SimEvent } from '../engine/events';
import type { EmergencyDepartment, Snapshot } from '../model/ed';
import type { Params } from '../model/params';
import { trackN, type NPath } from '../batch/recovery';
import { Playback } from './playback';
import mock from './mock/events.json';

export interface Driver {
  pb: Playback;
  /** velocidad: ×60 → 1 minuto simulado por segundo real */
  speed: number;
  paused: boolean;
  /** avanza el reloj del render dt segundos reales */
  tick(dt: number): void;
}

/** Un cuadro muy largo (pestaña en segundo plano) no debe hacer saltar horas de golpe. */
const MAX_DT = 0.25;

/** T06 — escena conectada al motor en vivo. */
export class LiveDriver implements Driver {
  pb!: Playback;
  ed!: EmergencyDepartment;
  /**
   * T17: gemelo SIN accidentes (misma semilla, mismos cambios de parámetros y visitantes): el contrafactual
   * con números aleatorios comunes para medir la recuperación. Nunca se dibuja.
   */
  twin?: EmergencyDepartment;
  nLive?: NPath;
  nTwin?: NPath;
  /** último accidente masivo (si hay varios, se mide desde el último; el gemelo no tiene ninguno) */
  accident?: { t0: number; n: number };
  speed = 60;
  paused = false;

  /** `ed` debe crearse con `recordEvents: true`; `twin`, con la misma semilla y en el mismo instante. */
  constructor(ed: EmergencyDepartment, twin?: EmergencyDepartment) {
    this.load(ed, twin);
  }

  /** Cambia de motor (p. ej. al cambiar de modo): la escena se reconstruye desde su snapshot. */
  load(ed: EmergencyDepartment, twin?: EmergencyDepartment): void {
    this.ed = ed;
    ed.drainEvents(); // lo anterior ya está resumido en el snapshot
    this.pb = new Playback(ed.snapshot());
    this.twin = twin;
    this.accident = undefined;
    this.nLive = this.nTwin = undefined;
    if (!twin) return;
    if (twin.now !== ed.now) throw new Error('El gemelo debe arrancar en el mismo instante que el motor');
    // Todo cambio de parámetros del motor se replica en el gemelo en el mismo instante.
    ed.onEvent((e) => {
      if (e.type !== 'PARAM_CHANGE') return;
      for (const [k, v] of Object.entries(e.data ?? {}))
        if (k === 'arrivalRatePerHour') twin.setArrivalRate(v as number);
        else twin.setCapacity(k as keyof Params['capacity'], v as number);
    });
    this.nLive = trackN(ed);
    this.nTwin = trackN(twin);
  }

  /** Visitante del creador: entra a los dos (no es parte del accidente). */
  injectVisitor(info: Omit<PatientInfo, 'id' | 'isVisitor'>): boolean {
    const ok = this.ed.injectVisitor(info);
    if (ok) this.twin?.injectVisitor(info);
    return ok;
  }

  /** Accidente masivo: solo en el motor visible. */
  massCasualty(n: number): boolean {
    const ok = this.ed.triggerMassCasualty(n);
    if (ok) this.accident = { t0: this.ed.now, n };
    return ok;
  }

  tick(dt: number): void {
    if (this.paused) return;
    const t = this.ed.now + (Math.min(dt, MAX_DT) * this.speed) / 60;
    this.ed.step(t);
    this.twin?.step(t);
    this.pb.push(this.ed.drainEvents());
    this.pb.advance(t);
    // El regreso de la ambulancia no emite evento (§4.4 congelado): se lee del estado del recurso.
    const away = this.pb.ambulancesAway;
    away.clear();
    for (let i = 0; i < this.ed.ambulances.capacity; i++) if (!this.ed.ambulances.isFree(i)) away.add(`amb-${i}`);
  }
}

/** Reproduce src/render/mock/events.json en bucle (desarrollo sin motor). */
export class MockDriver implements Driver {
  readonly initialClinics = mock.initial.clinics;
  pb!: Playback;
  speed = 60;
  paused = false;
  private readonly end = (mock.events as SimEvent[]).at(-1)!.t;
  constructor() {
    this.reset();
  }
  reset(): void {
    this.pb = new Playback(mock.initial as unknown as Snapshot);
    this.pb.push(mock.events as SimEvent[]);
  }
  tick(dt: number): void {
    if (this.paused) return;
    this.pb.advance(this.pb.t + (Math.min(dt, MAX_DT) * this.speed) / 60);
    if (this.pb.t > this.end + 5) this.reset();
  }
}
