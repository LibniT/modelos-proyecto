/**
 * Fuentes de eventos para la escena. Sin Phaser (se prueban en Node).
 * Reloj del render: t += dt_real × velocidad / 60 (min), SPEC §4.5.
 */
import type { SimEvent } from '../engine/events';
import type { EmergencyDepartment, Snapshot } from '../model/ed';
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
  pb: Playback;
  speed = 60;
  paused = false;

  /** `ed` debe crearse con `recordEvents: true`. */
  constructor(readonly ed: EmergencyDepartment) {
    ed.drainEvents(); // lo anterior ya está resumido en el snapshot
    this.pb = new Playback(ed.snapshot());
  }

  tick(dt: number): void {
    if (this.paused) return;
    const t = this.ed.now + (Math.min(dt, MAX_DT) * this.speed) / 60;
    this.ed.step(t);
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
