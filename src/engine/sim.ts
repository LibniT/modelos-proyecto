import { MinHeap } from './heap';

/** Un evento futuro en la lista de eventos (FEL). */
interface Scheduled {
  t: number;
  seq: number;
  fn: () => void;
  cancelled: boolean;
}

export interface Handle {
  cancel(): void;
  readonly t: number;
}

/**
 * Núcleo de Simulación de Eventos Discretos por planificación de eventos.
 * El reloj salta de evento en evento; empates en t se resuelven por orden de
 * planificación (seq), lo que hace la ejecución determinista.
 */
export class Simulator {
  now = 0;
  private seq = 0;
  private readonly fel = new MinHeap<Scheduled>((a, b) => a.t < b.t || (a.t === b.t && a.seq < b.seq));

  schedule(delay: number, fn: () => void): Handle {
    if (!(delay >= 0) || !Number.isFinite(delay)) throw new Error(`Retardo inválido: ${delay}`);
    return this.scheduleAt(this.now + delay, fn);
  }

  scheduleAt(t: number, fn: () => void): Handle {
    if (t < this.now) throw new Error(`No se puede planificar en el pasado (${t} < ${this.now})`);
    const ev: Scheduled = { t, seq: this.seq++, fn, cancelled: false };
    this.fel.push(ev);
    return {
      t,
      cancel: () => {
        ev.cancelled = true;
      },
    };
  }

  /** Tiempo del próximo evento (Infinity si no hay). */
  peekTime(): number {
    this.dropCancelled();
    return this.fel.peek()?.t ?? Infinity;
  }

  /** Ejecuta todos los eventos con t ≤ until y deja el reloj en `until`. */
  runUntil(until: number): void {
    for (;;) {
      this.dropCancelled();
      const next = this.fel.peek();
      if (!next || next.t > until) break;
      this.fel.pop();
      this.now = next.t;
      next.fn();
    }
    if (until > this.now) this.now = until;
  }

  private dropCancelled(): void {
    while (this.fel.size > 0 && this.fel.peek()!.cancelled) this.fel.pop();
  }
}
