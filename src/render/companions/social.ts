/**
 * T24 — Modelo social pequeño de acompañantes y cafeterías. NO es parte del motor clínico:
 * no emite SimEvent, no cuenta en N(t), no toca triage, camas, recursos ni remisiones.
 * Usa el reloj simulado de la sesión (avanza solo cuando avanza el reloj del render, así que la pausa
 * lo detiene) y su PROPIO generador sfc32 (otra instancia de RngFactory: no consume los aleatorios del hospital).
 * Sin DOM ni Phaser: se prueba en Node.
 *
 * T36 — En las sedes «ligadas» (el hospital) ya no llega gente al azar: cada paciente del motor que entra trae
 * un acompañante con probabilidad ACCOMPANY (decidida por su id, sin consumir aleatorios), que espera en la
 * cafetería o en la sala y se va cuando su paciente sale del servicio (alta, hospitalización o remisión).
 */
import { RngFactory, type Rng } from '../../engine/rng';
import { along, type Vec } from '../layout';
import { QUEUE_SPOTS, routeNodes, type Face, type MachineKind, type Site, type SitePlan } from './plans';

export interface Product {
  code: string;
  name: string;
  color: string;
}
export const MACHINE_NAME: Record<MachineKind, string> = { refrescos: 'Máquina de refrescos', papas: 'Máquina de papas' };
export const PRODUCTS: Record<MachineKind, Product[]> = {
  refrescos: [
    { code: 'A1', name: 'Agua', color: '#8fd3ea' },
    { code: 'A2', name: 'Refresco de cola', color: '#6b3424' },
    { code: 'A3', name: 'Limonada', color: '#e9df6b' },
  ],
  papas: [
    { code: 'B1', name: 'Papas clásicas', color: '#e8b64c' },
    { code: 'B2', name: 'Papas de limón', color: '#86bf55' },
    { code: 'B3', name: 'Papas picantes', color: '#d8553f' },
  ],
};

/** Acepta minúsculas y espacios: « a 3 » → «A3». */
export const normalizeCode = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();

export type CodeCheck = { ok: true; product: Product } | { ok: false; reason: string };
export function checkCode(machine: MachineKind, raw: string): CodeCheck {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, reason: 'Escribe el código del producto.' };
  const product = PRODUCTS[machine].find((p) => p.code === code);
  if (product) return { ok: true, product };
  const other: MachineKind = machine === 'refrescos' ? 'papas' : 'refrescos';
  const elsewhere = PRODUCTS[other].find((p) => p.code === code);
  const range = `${PRODUCTS[machine][0].code}–${PRODUCTS[machine].at(-1)!.code}`;
  if (elsewhere) return { ok: false, reason: `${code} (${elsewhere.name}) es de la ${MACHINE_NAME[other].toLowerCase()}. Aquí los códigos van de ${range}.` };
  return { ok: false, reason: `El código ${code} no existe. Aquí los códigos van de ${range}.` };
}

export type OrderState = 'en camino' | 'en fila' | 'despachando' | 'entregado' | 'cancelado';
export interface Order {
  id: number;
  site: Site;
  machine: MachineKind;
  product: Product;
  state: OrderState;
  /** reloj social al crearla y al terminarla */
  t0: number;
  t1?: number;
}

export type Activity = 'entrando' | 'sentado' | 'de pie' | 'hacia la máquina' | 'en fila' | 'comprando' | 'saliendo';
export interface Companion {
  id: string;
  site: Site;
  mine: boolean;
  activity: Activity;
  /** posición de reposo (destino del último recorrido) y nodo desde el que se llega a ella */
  at: Vec;
  node: string;
  walk?: { path: Vec[]; t0: number; dur: number };
  face: Face;
  seat?: number;
  machine?: number;
  want?: Product;
  order?: Order;
  /** producto recibido (lo lleva en la mano) */
  holding?: Product;
  /** invalida llegadas programadas de un recorrido anterior */
  leg: number;
  /** T36: paciente del motor al que acompaña (solo en sedes ligadas) */
  of?: { id: string; name: string };
}

/** T36: fracción de pacientes que llegan acompañados (supuesto del escenario; no hay dato local). */
export const ACCOMPANY = 0.4;
/** Fracción en [0, 1) fija para cada id (FNV-1a + fmix32): la decisión no depende de los cuadros ni gasta aleatorios. */
export function idFraction(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  // mezcla final (fmix32 de MurmurHash3): sin ella, ids parecidos («p1», «p2») dan fracciones casi iguales
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** minutos simulados por baldosa (paso tranquilo; a más de ×120 la escena salta al destino) */
export const MIN_PER_TILE = 0.14;
/** minutos simulados que tarda la máquina en despachar */
export const DISPENSE = 0.6;
const STAY: Record<string, number> = { cafe: 18, espera: 30, visita: 40, banca: 22 };
/** minutos medios entre llegadas por sede (hospital, clínicas) */
const GAP = (site: Site) => (site < 0 ? 5 : 8);

type Pending = { t: number; seq: number; fn: () => void };

export class Social {
  /** reloj propio: avanza lo mismo que el reloj del render de la sesión, nunca hacia atrás */
  now = 0;
  readonly companions = new Map<string, Companion>();
  /** pedido de Mi acompañante (vigente o el último terminado) */
  myOrder?: Order;
  /** pedidos de Mi acompañante ya entregados o cancelados, para avisar a la interfaz */
  readonly inbox: Order[] = [];
  private last?: number;
  private seq = 0;
  private nextId = 0;
  private orderId = 0;
  private readonly pending: Pending[] = [];
  private readonly rng = new Map<Site, Rng>();
  private readonly seats = new Map<Site, (string | undefined)[]>();
  private readonly lines = new Map<string, string[]>();
  private readonly serving = new Set<string>();
  private readonly plans = new Map<Site, SitePlan>();
  private readonly linked: Set<Site>;
  /** pacientes ya vistos por sede ligada (cada uno decide una sola vez si viene acompañado) */
  private readonly seen = new Map<Site, Set<string>>();

  constructor(plans: SitePlan[], seed = 2026, opts: { linked?: Site[] } = {}) {
    this.linked = new Set(opts.linked ?? []);
    const f = new RngFactory(seed);
    for (const p of plans) {
      this.plans.set(p.site, p);
      this.rng.set(p.site, f.stream('acompanantes:' + p.site));
      this.seats.set(p.site, p.seats.map(() => undefined));
      p.machines.forEach((_, m) => this.lines.set(`${p.site}:${m}`, []));
    }
  }

  plan(site: Site): SitePlan | undefined {
    return this.plans.get(site);
  }

  get mine(): Companion | undefined {
    return this.companions.get('mi-acompanante');
  }

  /** Avanza hasta el instante `t` del reloj de la sesión (idempotente; si el reloj retrocede, no hace nada). */
  advance(t: number): void {
    if (this.last === undefined) {
      this.last = t;
      for (const site of this.plans.keys()) this.populate(site);
      return;
    }
    const target = this.now + Math.max(0, t - this.last);
    this.last = t;
    while (this.pending.length && this.pending[0].t <= target) {
      const e = this.pending.shift()!;
      this.now = e.t;
      e.fn();
    }
    this.now = target;
  }

  /**
   * T36: pacientes del motor presentes ahora en una sede ligada. Los que aparecen por primera vez pueden traer
   * acompañante; los acompañantes cuyo paciente ya no está, se van. En la primera llamada los acompañantes
   * de los pacientes que ya estaban aparecen sentados (como el estado inicial de `populate`).
   */
  syncPatients(site: Site, patients: { id: string; name: string }[]): void {
    if (!this.linked.has(site) || this.last === undefined) return;
    const first = !this.seen.has(site);
    const seen = this.seen.get(site) ?? new Set<string>();
    this.seen.set(site, seen);
    const here = new Set(patients.map((p) => p.id));
    for (const c of this.inSite(site)) if (c.of && !here.has(c.of.id) && c.activity !== 'saliendo') this.leave(c);
    const plan = this.plans.get(site)!;
    const rng = this.rng.get(site)!;
    for (const p of patients) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (idFraction(p.id) >= ACCOMPANY) continue;
      if (this.inSite(site).filter((c) => !c.mine).length >= plan.cap) continue;
      const wait = this.freeSeats(site, 'espera');
      const free = wait.length ? wait : this.freeSeats(site);
      if (!free.length) continue;
      const s = free[rng.int(free.length)];
      const c = this.spawn(site, false);
      c.of = { id: p.id, name: p.name };
      if (!first) {
        this.goSeat(c, s);
        continue;
      }
      this.take(c, s);
      c.at = plan.seats[s].p;
      c.node = plan.seats[s].node;
      c.face = plan.seats[s].face;
      c.activity = 'sentado';
      this.schedule(this.now + this.exp(site, STAY[plan.seats[s].kind]), () => this.afterSeat(c));
    }
  }

  /** Posición actual y los puntos que le faltan del recorrido en curso. */
  private rest(c: Companion): Vec[] {
    const w = c.walk;
    if (!w || !this.walking(c)) return [c.at];
    const seg = w.path.slice(1).map((p, i) => Math.hypot(p.x - w.path[i].x, p.y - w.path[i].y));
    let d = ((this.now - w.t0) / w.dur) * seg.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
    return [this.position(c), ...w.path.slice(i + 1)];
  }

  /** Acompañantes presentes en una sede. */
  inSite(site: Site): Companion[] {
    return [...this.companions.values()].filter((c) => c.site === site);
  }

  /** Posición en el reloj social; con `snap` salta al destino del recorrido. */
  position(c: Companion, snap = false): Vec {
    const w = c.walk;
    if (!snap && w && this.now < w.t0 + w.dur) return along(w.path, (this.now - w.t0) / w.dur);
    return c.at;
  }

  walking(c: Companion): boolean {
    return !!c.walk && this.now < c.walk.t0 + c.walk.dur;
  }

  /** Lugar en la fila de su máquina (0 = frente a la máquina), o −1. */
  placeInLine(c: Companion): number {
    return c.machine === undefined ? -1 : this.line(c.site, c.machine).indexOf(c.id);
  }

  get orderActive(): boolean {
    const s = this.myOrder?.state;
    return s === 'en camino' || s === 'en fila' || s === 'despachando';
  }

  /** Mi acompañante pide un producto por código. Crea UNA solicitud; si ya hay una en curso, la rechaza. */
  request(site: Site, machine: MachineKind, raw: string): { ok: true; order: Order } | { ok: false; reason: string } {
    const plan = this.plans.get(site);
    const m = plan?.machines.findIndex((x) => x.kind === machine) ?? -1;
    if (!plan || m < 0) return { ok: false, reason: 'Esta sede no tiene esa máquina.' };
    if (this.orderActive) {
      // Doble clic, Enter repetido u otra máquina: nunca se crea una segunda solicitud.
      const o = this.myOrder!;
      return { ok: false, reason: `Mi acompañante ya tiene una solicitud en curso: ${o.product.name} · ${o.product.code} en ${this.plans.get(o.site)!.name} (${o.state}).` };
    }
    const check = checkCode(machine, raw);
    if (!check.ok) return check;
    let me = this.mine;
    if (me && me.site !== site) {
      this.release(me);
      this.companions.delete(me.id);
      me = undefined;
    }
    me ??= this.spawn(site, true);
    this.release(me);
    const order: Order = { id: ++this.orderId, site, machine, product: check.product, state: 'en camino', t0: this.now };
    me.order = order;
    this.myOrder = order;
    this.joinLine(me, m, check.product);
    return { ok: true, order };
  }

  /** Cancela la solicitud de Mi acompañante si aún no está despachando. */
  cancel(): boolean {
    const me = this.mine,
      o = this.myOrder;
    if (!me || !o || (o.state !== 'en camino' && o.state !== 'en fila')) return false;
    this.leaveLine(me);
    o.state = 'cancelado';
    o.t1 = this.now;
    me.order = undefined;
    this.inbox.push(o);
    this.settle(me);
    return true;
  }

  // ——— interno ———

  private schedule(t: number, fn: () => void): void {
    const e = { t, seq: this.seq++, fn };
    let i = this.pending.length;
    while (i > 0 && (this.pending[i - 1].t > t || (this.pending[i - 1].t === t && this.pending[i - 1].seq > e.seq))) i--;
    this.pending.splice(i, 0, e);
  }

  private exp(site: Site, mean: number): number {
    return -mean * Math.log(this.rng.get(site)!.next());
  }

  private line(site: Site, m: number): string[] {
    return this.lines.get(`${site}:${m}`)!;
  }

  /** Estado inicial: algunos acompañantes ya sentados, y el proceso de llegadas propio de la sede. */
  private populate(site: Site): void {
    const plan = this.plans.get(site)!;
    const rng = this.rng.get(site)!;
    if (this.linked.has(site)) return; // T36: aquí los acompañantes llegan con sus pacientes (syncPatients)
    for (let k = 0; k < Math.min(3, plan.cap); k++) {
      const free = this.freeSeats(site);
      if (!free.length) break;
      const s = free[rng.int(free.length)];
      const c = this.spawn(site, false);
      this.take(c, s);
      c.at = plan.seats[s].p;
      c.node = plan.seats[s].node;
      c.face = plan.seats[s].face;
      c.activity = 'sentado';
      this.schedule(this.now + this.exp(site, STAY[plan.seats[s].kind]), () => this.afterSeat(c));
    }
    this.schedule(this.now + this.exp(site, GAP(site)), () => this.arrive(site));
  }

  private spawn(site: Site, mine: boolean): Companion {
    const plan = this.plans.get(site)!;
    const c: Companion = {
      id: mine ? 'mi-acompanante' : `acomp-${site}-${this.nextId++}`,
      site,
      mine,
      activity: 'entrando',
      at: plan.spawn,
      node: '@calle',
      face: 'NE',
      leg: 0,
    };
    this.companions.set(c.id, c);
    return c;
  }

  private freeSeats(site: Site, kind?: string): number[] {
    const plan = this.plans.get(site)!;
    const taken = this.seats.get(site)!;
    return plan.seats.flatMap((s, i) => (!taken[i] && (!kind || s.kind === kind) ? [i] : []));
  }

  private take(c: Companion, s: number): void {
    this.seats.get(c.site)![s] = c.id;
    c.seat = s;
  }

  /** Libera la silla y la fila que tenga (sin tocar su pedido). */
  private release(c: Companion): void {
    if (c.seat !== undefined) this.seats.get(c.site)![c.seat] = undefined;
    c.seat = undefined;
    if (c.machine !== undefined && this.placeInLine(c) >= 0) this.leaveLine(c);
  }

  private arrive(site: Site): void {
    const plan = this.plans.get(site)!;
    const rng = this.rng.get(site)!;
    this.schedule(this.now + this.exp(site, GAP(site)), () => this.arrive(site));
    const autos = this.inSite(site).filter((c) => !c.mine).length;
    if (autos >= plan.cap) return;
    const kinds = ['cafe', 'espera', 'visita', 'banca', 'maquina'] as const;
    const goal = kinds[rng.weighted([0.3, 0.25, 0.2, 0.15, 0.25])];
    const c = this.spawn(site, false);
    if (goal === 'maquina' && this.tryMachine(c)) return;
    const free = this.freeSeats(site, goal === 'maquina' ? 'cafe' : goal);
    const any = free.length ? free : this.freeSeats(site);
    if (!any.length) return this.leave(c);
    this.goSeat(c, any[rng.int(any.length)]);
  }

  private goSeat(c: Companion, s: number): void {
    const seat = this.plans.get(c.site)!.seats[s];
    this.take(c, s);
    c.activity = c.activity === 'entrando' ? 'entrando' : 'de pie';
    this.walkTo(c, seat.node, seat.p, () => {
      c.activity = 'sentado';
      c.face = seat.face;
      if (!c.mine) this.schedule(this.now + this.exp(c.site, STAY[seat.kind]), () => this.afterSeat(c));
    });
  }

  private afterSeat(c: Companion): void {
    if (!this.companions.has(c.id) || c.activity !== 'sentado') return;
    this.release(c);
    if (!c.holding && this.rng.get(c.site)!.next() < 0.3 && this.tryMachine(c)) return;
    if (c.of) return this.settle(c); // T36: sigue esperando a su paciente
    this.leave(c);
  }

  /** Acompañante automático: elige máquina y producto con el generador de su sede; no pasa de 3 en fila. */
  private tryMachine(c: Companion): boolean {
    const plan = this.plans.get(c.site)!;
    const rng = this.rng.get(c.site)!;
    const m = rng.int(plan.machines.length);
    if (this.line(c.site, m).length >= QUEUE_SPOTS - 1) return false;
    this.joinLine(c, m, rng.pick(PRODUCTS[plan.machines[m].kind]));
    return true;
  }

  private spot(site: Site, m: number, i: number): Vec {
    const ms = this.plans.get(site)!.machines[m];
    return { x: ms.front.x + ms.step.x * i, y: ms.front.y + ms.step.y * i };
  }

  /** Reserva su lugar en la fila al decidir (como la cama del motor) y camina hasta él. */
  private joinLine(c: Companion, m: number, product: Product): void {
    const line = this.line(c.site, m);
    line.push(c.id);
    c.machine = m;
    c.want = product;
    c.activity = 'hacia la máquina';
    const ms = this.plans.get(c.site)!.machines[m];
    this.walkTo(c, ms.node, this.spot(c.site, m, line.length - 1), () => this.reachSpot(c));
  }

  private reachSpot(c: Companion): void {
    // Si la fila avanzó mientras caminaba, sigue en línea recta hasta su puesto actual.
    const k = this.placeInLine(c);
    const want = this.spot(c.site, c.machine!, k);
    if (Math.hypot(want.x - c.at.x, want.y - c.at.y) > 1e-6) return this.walkTo(c, c.node, want, () => this.reachSpot(c), true);
    c.activity = 'en fila';
    c.face = 'NE';
    if (c.order?.state === 'en camino') c.order.state = 'en fila';
    this.tryServe(c.site, c.machine!);
  }

  private tryServe(site: Site, m: number): void {
    const key = `${site}:${m}`;
    const front = this.companions.get(this.line(site, m)[0]);
    if (this.serving.has(key) || !front || front.activity !== 'en fila') return;
    this.serving.add(key);
    front.activity = 'comprando';
    if (front.order) front.order.state = 'despachando';
    this.schedule(this.now + DISPENSE, () => {
      this.serving.delete(key);
      front.holding = front.want;
      front.want = undefined;
      if (front.order) {
        front.order.state = 'entregado';
        front.order.t1 = this.now;
        this.inbox.push(front.order);
        front.order = undefined;
      }
      this.leaveLine(front);
      this.settle(front);
    });
  }

  /** Sale de la fila: los de atrás avanzan un puesto. */
  private leaveLine(c: Companion): void {
    const line = this.line(c.site, c.machine!);
    const i = line.indexOf(c.id);
    const m = c.machine!;
    c.machine = undefined;
    c.want = undefined;
    if (i < 0) return;
    line.splice(i, 1);
    // Los que ya esperaban avanzan un puesto; los que vienen caminando se corrigen al llegar (reachSpot).
    line.forEach((id, k) => {
      const o = this.companions.get(id)!;
      if (k < i || o.activity !== 'en fila') return;
      o.activity = 'hacia la máquina'; // no se le despacha hasta que llegue a su nuevo puesto
      this.walkTo(o, o.node, this.spot(c.site, m, k), () => this.reachSpot(o), true);
    });
    this.tryServe(c.site, m);
  }

  /** Después de comprar o cancelar: Mi acompañante se queda en la cafetería; los demás a veces se sientan. */
  private settle(c: Companion): void {
    const free = this.freeSeats(c.site, 'cafe');
    if (c.mine) {
      if (free.length) this.goSeat(c, free[0]);
      else {
        c.activity = 'de pie';
        const node = this.plans.get(c.site)!.machines[0].node;
        this.walkTo(c, node, this.plans.get(c.site)!.nodes[node], () => {});
      }
      return;
    }
    if (c.of) {
      // T36: espera a su paciente sentado; si no queda silla, sale un rato (no se queda de pie ocupando paso)
      const any = free.length ? free : this.freeSeats(c.site);
      if (any.length) this.goSeat(c, any[this.rng.get(c.site)!.int(any.length)]);
      else this.leave(c);
      return;
    }
    if (free.length && this.rng.get(c.site)!.next() < 0.5) this.goSeat(c, free[this.rng.get(c.site)!.int(free.length)]);
    else this.leave(c);
  }

  private leave(c: Companion): void {
    const plan = this.plans.get(c.site)!;
    this.release(c);
    c.activity = 'saliendo';
    this.walkTo(c, plan.entry, plan.spawn, () => this.companions.delete(c.id));
  }

  /**
   * Recorrido por la red de nodos: posición actual → nodo actual → … → nodo destino → punto final.
   * `direct` = mismo recinto (avanzar en la fila): en línea recta.
   */
  private walkTo(c: Companion, node: string, dest: Vec, then: () => void, direct = false): void {
    const plan = this.plans.get(c.site)!;
    // Si va caminando, termina primero el tramo en curso (así nunca corta por una pared).
    const head = this.rest(c);
    let path: Vec[];
    if (direct) path = [...head, dest];
    else {
      const start = c.node === '@calle' ? plan.entry : c.node;
      path = [...head, ...routeNodes(plan, start, node).map((n) => plan.nodes[n]), dest];
    }
    path = path.filter((p, i) => i === 0 || Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) > 1e-6);
    const len = path.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
    const dur = Math.max(0.05, len * MIN_PER_TILE);
    c.walk = { path: path.length > 1 ? path : [path[0], dest], t0: this.now, dur };
    c.at = dest;
    c.node = node;
    const leg = ++c.leg;
    this.schedule(this.now + dur, () => {
      if (c.leg === leg && this.companions.has(c.id)) then();
    });
  }
}
