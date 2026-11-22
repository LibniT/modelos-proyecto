import type { Simulator } from './sim';
import { TimeAverage, Tally } from './stats';

export type Discipline = 'fifo' | 'priority';

interface Waiter<T> {
  item: T;
  priority: number;
  seq: number;
  since: number;
  onGrant: (serverId: number) => void;
}

/**
 * Recurso con c servidores idénticos y cola infinita.
 * - 'fifo': orden de llegada.
 * - 'priority': menor número = mayor prioridad, SIN interrupción; FIFO dentro de la clase.
 * Registra Lq(t), ocupados(t) y la espera en cola de cada cliente.
 */
export class Resource<T> {
  private readonly queue: Waiter<T>[] = [];
  private readonly freeServers: number[] = [];
  private busyCount = 0;
  private seq = 0;
  /** Servidores que deben desaparecer al liberarse (reducción de capacidad en caliente). */
  private pendingRemoval = 0;

  readonly qLen: TimeAverage;
  readonly busy: TimeAverage;
  readonly wait = new Tally();

  constructor(
    private readonly sim: Simulator,
    readonly name: string,
    private cap: number,
    readonly discipline: Discipline = 'fifo',
  ) {
    for (let i = cap - 1; i >= 0; i--) this.freeServers.push(i);
    this.qLen = new TimeAverage(sim.now, 0);
    this.busy = new TimeAverage(sim.now, 0);
  }

  get capacity(): number {
    return this.cap;
  }
  get inService(): number {
    return this.busyCount;
  }
  get queueLength(): number {
    return this.queue.length;
  }
  queued(): readonly T[] {
    return this.queue.map((w) => w.item);
  }

  /** Pide un servidor. onGrant se llama (posiblemente de inmediato) con el id del servidor. */
  request(item: T, priority: number, onGrant: (serverId: number) => void): void {
    const w: Waiter<T> = { item, priority, seq: this.seq++, since: this.sim.now, onGrant };
    if (this.freeServers.length > 0 && this.queue.length === 0) {
      this.grant(w);
      return;
    }
    // Inserción ordenada (las colas son cortas; O(n) es suficiente y estable).
    let i = this.queue.length;
    if (this.discipline === 'priority') {
      while (i > 0 && this.queue[i - 1].priority > priority) i--;
    }
    this.queue.splice(i, 0, w);
    this.qLen.set(this.sim.now, this.queue.length);
    this.dispatch();
  }

  /** Saca a un cliente de la cola (abandono). Devuelve false si ya no estaba esperando. */
  cancel(item: T): boolean {
    const i = this.queue.findIndex((w) => w.item === item);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    this.qLen.set(this.sim.now, this.queue.length);
    return true;
  }

  release(serverId: number): void {
    this.busyCount--;
    this.busy.set(this.sim.now, this.busyCount);
    if (this.pendingRemoval > 0) {
      this.pendingRemoval--;
    } else {
      this.freeServers.push(serverId);
    }
    this.dispatch();
  }

  setCapacity(newCap: number): void {
    if (newCap === this.cap) return;
    if (newCap > this.cap) {
      let add = newCap - this.cap;
      const cancel = Math.min(add, this.pendingRemoval);
      this.pendingRemoval -= cancel;
      add -= cancel;
      for (let k = 0; k < add; k++) this.freeServers.push(this.cap + k);
    } else {
      let remove = this.cap - newCap;
      // Primero quita servidores libres (los de id más alto), luego marca ocupados.
      this.freeServers.sort((a, b) => a - b);
      while (remove > 0 && this.freeServers.length > 0) {
        this.freeServers.pop();
        remove--;
      }
      this.pendingRemoval += remove;
    }
    this.cap = newCap;
    this.dispatch();
  }

  resetStats(): void {
    this.qLen.reset(this.sim.now);
    this.busy.reset(this.sim.now);
    this.wait.reset();
  }

  private dispatch(): void {
    while (this.freeServers.length > 0 && this.queue.length > 0) {
      const w = this.queue.shift()!;
      this.qLen.set(this.sim.now, this.queue.length);
      this.grant(w);
    }
  }

  private grant(w: Waiter<T>): void {
    // Toma el servidor libre de menor id (así los sprites usan los primeros boxes).
    this.freeServers.sort((a, b) => b - a);
    const id = this.freeServers.pop()!;
    this.busyCount++;
    this.busy.set(this.sim.now, this.busyCount);
    this.wait.add(this.sim.now - w.since);
    w.onGrant(id);
  }
}
