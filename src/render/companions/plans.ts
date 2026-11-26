/**
 * T24 — Plantas de las tres clínicas y de la cafetería del hospital (sin Phaser: las usan la escena, el
 * modelo social y las pruebas). Coordenadas en baldosas, como `layout.ts`; las paredes del fondo
 * (y = 0 y x = 0) se dibujan en la textura base y las interiores como piezas ordenadas en profundidad.
 * Las camas salen de la capacidad activa del motor: cada cama dibujada es una plaza.
 */
import type { Vec } from '../layout';

/** −1 = hospital principal; 0, 1, 2 = clínicas (mismo índice que `params.clinics`). */
export type Site = number;
export type MachineKind = 'refrescos' | 'papas';
export type SeatKind = 'espera' | 'cafe' | 'banca' | 'visita';
export type Face = 'SE' | 'SW' | 'NE' | 'NW';

export interface Seat {
  p: Vec;
  kind: SeatKind;
  /** nodo de la red de recorridos desde el que se llega en línea recta */
  node: string;
  face: Face;
}
export interface MachineSpot {
  kind: MachineKind;
  p: Vec;
  node: string;
  /** puesto frente a la máquina; la fila sigue en `front + step·i` */
  front: Vec;
  step: Vec;
}
export interface Segment {
  a: Vec;
  b: Vec;
}
export interface Room {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  floor: 'baldosa' | 'madera' | 'pasto' | 'sala' | 'pasillo';
  /** posición del letrero (si lo lleva) */
  sign?: Vec;
}
export interface Bed {
  p: Vec;
  wing: number;
}
export interface Wing {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export type PropKind = 'mostrador' | 'mesa-cafe' | 'planta' | 'recepcion' | 'enfermeria' | 'arbol' | 'cortina';
export interface Prop {
  kind: PropKind;
  p: Vec;
  /** a lo largo de x ('x') o de y ('y'): mostradores y cortinas */
  along?: 'x' | 'y';
  len?: number;
}

export interface SitePlan {
  site: Site;
  name: string;
  w: number;
  h: number;
  rooms: Room[];
  /** paredes interiores sólidas (ejes x o y); las puertas son huecos, dibujados con marco */
  walls: Segment[];
  doors: Segment[];
  /** ventanas del muro del fondo y = 0 (tramos en x) y x = 0 (tramos en y) */
  windows: Segment[];
  /** puertas de la fachada del fondo (huecos en y = 0 o x = 0) */
  backDoors: Segment[];
  beds: Bed[];
  wings: Wing[];
  seats: Seat[];
  machines: MachineSpot[];
  props: Prop[];
  /** personal fijo de recepción, enfermería y cafetería (decorado estático, no es un recurso del motor) */
  staff: Vec[];
  nodes: Record<string, Vec>;
  edges: [string, string][];
  /** punto exterior por el que entran y salen los acompañantes */
  spawn: Vec;
  /** nodo de la puerta conectado con `spawn` */
  entry: string;
  /** máximo de acompañantes automáticos a la vez */
  cap: number;
}

export const QUEUE_SPOTS = 4;
const BED_HALF = { x: 0.5, y: 0.975 };

/** T36: paciente con identidad en una sede (remitido desde urgencias o llevado desde el mapa). */
export interface NamedBed {
  id: string;
  reserved: boolean;
  from: 'urgencias' | 'mapa';
}
/** Qué hay en una cama dibujada (para pintarla y para la tarjeta del clic). */
export type BedSlot = ({ kind: 'named' } & NamedBed) | { kind: 'anon' } | { kind: 'reserved' } | { kind: 'free' };

/**
 * T36: reparte `n` camas dibujadas. Cada paciente con identidad conserva su cama mientras esté (`assigned` se
 * actualiza en el lugar); el resto de las plazas ocupadas (demanda propia, anónima) y las reservas sin nombre
 * toman las primeras libres del orden fijo `order`. `occ` y `res` ya están acotados a `n` e incluyen a los con nombre.
 */
export function assignBeds(order: number[], n: number, assigned: Map<string, number>, occ: number, res: number, named: NamedBed[]): BedSlot[] {
  named = named.slice(0, occ);
  const ids = new Set(named.map((x) => x.id));
  for (const id of [...assigned.keys()]) if (!ids.has(id)) assigned.delete(id);
  const used = new Set(assigned.values());
  for (const x of named) {
    if (assigned.has(x.id)) continue;
    const bed = order.find((b) => !used.has(b));
    if (bed === undefined) break;
    assigned.set(x.id, bed);
    used.add(bed);
  }
  const slots: BedSlot[] = Array.from({ length: n }, () => ({ kind: 'free' }));
  for (const x of named) {
    const bed = assigned.get(x.id);
    if (bed !== undefined) slots[bed] = { kind: 'named', ...x };
  }
  let anonRes = Math.max(0, res - named.filter((x) => x.reserved).length);
  let anon = Math.max(0, occ - named.length - anonRes);
  for (const bed of order) {
    if (used.has(bed)) continue;
    if (anon > 0) {
      anon--;
      slots[bed] = { kind: 'anon' };
    } else if (anonRes > 0) {
      anonRes--;
      slots[bed] = { kind: 'reserved' };
    }
  }
  return slots;
}

/** Cafetería común de las clínicas: rincón x0..x0+7, y0..y0+5, con puerta en el muro y0 + 5 (x 4,0–5,2). */
function clinicCafe(plan: SitePlan, x0: number, y0: number): void {
  const at = (x: number, y: number) => ({ x: x0 + x, y: y0 + y });
  plan.rooms.push({ name: 'Cafetería', x0, y0, x1: x0 + 7, y1: y0 + 5, floor: 'madera', sign: at(3.4, 0.4) });
  plan.walls.push({ a: at(0, 5), b: at(4, 5) }, { a: at(5.2, 5), b: at(7, 5) });
  plan.doors.push({ a: at(4, 5), b: at(5.2, 5) });
  plan.nodes['puerta-caf'] = at(4.6, 5);
  plan.nodes['caf'] = at(4.6, 4.2);
  plan.edges.push(['puerta-caf', 'caf']);
  plan.props.push({ kind: 'mostrador', p: at(0.75, 2.0), along: 'y', len: 2.4 }, { kind: 'planta', p: at(6.4, 4.4) });
  plan.staff.push(at(0.3, 2.0));
  plan.machines.push(
    { kind: 'refrescos', p: at(4.6, 0.42), node: 'caf', front: at(4.6, 1.25), step: { x: 0, y: 0.68 } },
    { kind: 'papas', p: at(5.5, 0.42), node: 'caf', front: at(5.5, 1.25), step: { x: 0, y: 0.68 } },
  );
  for (const ty of [1.6, 3.4]) {
    plan.props.push({ kind: 'mesa-cafe', p: at(2.3, ty) });
    plan.seats.push({ p: at(1.6, ty), kind: 'cafe', node: 'caf', face: 'SE' }, { p: at(3.0, ty), kind: 'cafe', node: 'caf', face: 'NW' });
  }
}

/**
 * Habitaciones de 3 × 5 baldosas con hasta 4 camas, a un lado de un corredor horizontal.
 * `door` = fila y del muro hacia el corredor; las camas tienen la cabecera contra el muro opuesto.
 */
function wardRooms(plan: SitePlan, x0: number, yWall: number, side: 'norte' | 'sur', beds: number, wing: number, corridorY: number, prefix: string): number {
  const rooms = Math.ceil(beds / 4);
  const far = side === 'norte' ? yWall - 5 : yWall + 5;
  const rowY = side === 'norte' ? [far + 1.3, far + 3.6] : [far - 1.3, far - 3.6];
  let placed = 0;
  for (let k = 0; k < rooms; k++) {
    const rx = x0 + 3 * k;
    // muro hacia el corredor con puerta centrada, y tabique con la habitación siguiente
    plan.walls.push({ a: { x: rx, y: yWall }, b: { x: rx + 1, y: yWall } }, { a: { x: rx + 2, y: yWall }, b: { x: rx + 3, y: yWall } });
    plan.doors.push({ a: { x: rx + 1, y: yWall }, b: { x: rx + 2, y: yWall } });
    if (k > 0) plan.walls.push({ a: { x: rx, y: Math.min(yWall, far) }, b: { x: rx, y: Math.max(yWall, far) } });
    for (const y of rowY)
      for (const dx of [0.65, 2.35]) if (placed < beds) plan.beds.push({ p: { x: rx + dx, y }, wing }), placed++;
    const node = `${prefix}-${k}`;
    plan.nodes[node] = { x: rx + 1.5, y: corridorY };
    plan.seats.push({ p: { x: rx + 1.5, y: side === 'norte' ? far + 3.0 : far - 3.0 }, kind: 'visita', node, face: side === 'norte' ? 'NE' : 'SW' });
    if (k > 0) plan.edges.push([`${prefix}-${k - 1}`, node]);
  }
  return rooms;
}

/** Clínica Río Claro: recepción, espera corta y un ala abierta junto a los ventanales. */
function rioClaro(beds: number): SitePlan {
  const cols = Math.ceil(beds / 3);
  const w = 7 + Math.max(10, Math.ceil(cols * 1.15 + 0.9));
  const h = 12;
  const plan = empty(0, 'Clínica Río Claro', w, h, 6);
  plan.rooms.push(
    { name: 'Recepción', x0: 0, y0: 5, x1: 7, y1: h, floor: 'baldosa', sign: { x: 1.6, y: 5.5 } },
    { name: 'Ala de los ventanales', x0: 7, y0: 0, x1: w, y1: h, floor: 'sala', sign: { x: (7 + w) / 2, y: 0.3 } },
  );
  clinicCafe(plan, 0, 0);
  plan.walls.push({ a: { x: 7, y: 0 }, b: { x: 7, y: 10 } }, { a: { x: 7, y: 11.4 }, b: { x: 7, y: h } });
  plan.doors.push({ a: { x: 7, y: 10 }, b: { x: 7, y: 11.4 } });
  plan.windows.push({ a: { x: 7.4, y: 0 }, b: { x: w - 0.4, y: 0 } }, { a: { x: 0, y: 6.5 }, b: { x: 0, y: 9.5 } });
  plan.props.push({ kind: 'recepcion', p: { x: 1.6, y: 7.0 }, along: 'x', len: 2.4 }, { kind: 'planta', p: { x: 0.5, y: 11.4 } }, { kind: 'planta', p: { x: 6.5, y: 5.6 } });
  plan.staff.push({ x: 1.6, y: 6.35 });
  for (const y of [8.6, 9.8]) for (const x of [4.0, 4.9, 5.8]) plan.seats.push({ p: { x, y }, kind: 'espera', node: 'recep', face: 'NW' });
  const rows = [1.3, 4.35, 7.4];
  for (let i = 0; i < beds; i++) plan.beds.push({ p: { x: 7.6 + Math.floor(i / 3) * 1.15, y: rows[i % 3] }, wing: 0 });
  plan.wings.push({ name: 'Ala de los ventanales', x0: 7, y0: 0, x1: w, y1: h });
  Object.assign(plan.nodes, {
    calle: { x: 3.0, y: h + 0.9 },
    entrada: { x: 3.0, y: 11.2 },
    recep: { x: 3.2, y: 8.0 },
    'puerta-ala': { x: 7, y: 10.7 },
    ala: { x: 8.2, y: 10.7 },
    'ala-fondo': { x: w - 1.2, y: 10.7 },
  });
  plan.edges.push(['calle', 'entrada'], ['entrada', 'recep'], ['recep', 'puerta-caf'], ['entrada', 'puerta-ala'], ['puerta-ala', 'ala'], ['ala', 'ala-fondo']);
  // Sillas de visita al pie de la última fila, una cada dos columnas.
  for (let c = 0; c < cols; c += 2) plan.seats.push({ p: { x: 7.6 + c * 1.15, y: 9.0 }, kind: 'visita', node: c < cols / 2 ? 'ala' : 'ala-fondo', face: 'NE' });
  plan.spawn = plan.nodes.calle;
  plan.entry = 'entrada';
  return plan;
}

/** Clínica La Pilonera: corredor central, enfermería y habitaciones a ambos lados. */
function pilonera(beds: number): SitePlan {
  const north = Math.ceil(beds / 2),
    south = beds - north;
  const rooms = Math.ceil(north / 4);
  const w = 7 + 3 * rooms,
    h = 12;
  const plan = empty(1, 'Clínica La Pilonera', w, h, 6);
  plan.rooms.push(
    { name: 'Corredor', x0: 0, y0: 5, x1: w, y1: 7, floor: 'pasillo' },
    { name: 'Enfermería', x0: 0, y0: 7, x1: 7, y1: h, floor: 'baldosa', sign: { x: 4.2, y: 11.6 } },
    { name: 'Habitaciones norte', x0: 7, y0: 0, x1: w, y1: 5, floor: 'sala', sign: { x: (7 + w) / 2, y: 0.3 } },
    { name: 'Habitaciones sur', x0: 7, y0: 7, x1: w, y1: h, floor: 'sala', sign: { x: (7 + w) / 2, y: 11.6 } },
  );
  clinicCafe(plan, 0, 0);
  plan.walls.push({ a: { x: 7, y: 0 }, b: { x: 7, y: 5 } }, { a: { x: 7, y: 7 }, b: { x: 7, y: h } });
  plan.walls.push({ a: { x: 0, y: 7 }, b: { x: 1.2, y: 7 } }, { a: { x: 2.6, y: 7 }, b: { x: 7, y: 7 } });
  plan.doors.push({ a: { x: 1.2, y: 7 }, b: { x: 2.6, y: 7 } });
  plan.backDoors.push({ a: { x: 0, y: 5.4 }, b: { x: 0, y: 6.6 } });
  for (let k = 0; k < rooms; k++) plan.windows.push({ a: { x: 7.6 + 3 * k, y: 0 }, b: { x: 9.4 + 3 * k, y: 0 } });
  plan.windows.push({ a: { x: 0, y: 8.5 }, b: { x: 0, y: 10.5 } });
  plan.props.push({ kind: 'enfermeria', p: { x: 4.6, y: 8.3 }, along: 'x', len: 2.6 }, { kind: 'planta', p: { x: 6.5, y: 11.4 } });
  plan.staff.push({ x: 4.6, y: 9.0 });
  for (const x of [0.9, 1.75, 2.6, 3.45]) plan.seats.push({ p: { x, y: 10.7 }, kind: 'espera', node: 'enf', face: 'NE' });
  Object.assign(plan.nodes, {
    calle: { x: -1.0, y: 6 },
    entrada: { x: 0.6, y: 6 },
    corredor: { x: 3.2, y: 6 },
    'puerta-enf': { x: 1.9, y: 7 },
    enf: { x: 1.9, y: 8.9 },
  });
  plan.edges.push(['calle', 'entrada'], ['entrada', 'corredor'], ['corredor', 'puerta-caf'], ['corredor', 'puerta-enf'], ['puerta-enf', 'enf'], ['entrada', 'puerta-enf']);
  plan.edges.push(['corredor', 'n-0'], ['corredor', 's-0']);
  wardRooms(plan, 7, 5, 'norte', north, 0, 6, 'n');
  wardRooms(plan, 7, 7, 'sur', south, 1, 6, 's');
  // Los nodos del corredor de ambos lados coinciden en x: se enlazan entre sí.
  for (let k = 0; k < rooms; k++) if (plan.nodes[`s-${k}`]) plan.edges.push([`n-${k}`, `s-${k}`]);
  plan.wings.push({ name: 'Ala norte', x0: 7, y0: 0, x1: w, y1: 5.5 }, { name: 'Ala sur', x0: 7, y0: 6.5, x1: w, y1: h });
  plan.spawn = plan.nodes.calle;
  plan.entry = 'entrada';
  return plan;
}

/** Clínica Valle Verde: dos alas alrededor de un patio con bancas. */
function valleVerde(beds: number): SitePlan {
  const north = Math.ceil(beds / 2),
    south = beds - north;
  const rooms = Math.ceil(north / 4);
  const w = 7 + 3 * rooms,
    h = 16;
  const plan = empty(2, 'Clínica Valle Verde', w, h, 7);
  plan.rooms.push(
    { name: 'Recepción y espera', x0: 0, y0: 5, x1: 7, y1: h, floor: 'baldosa', sign: { x: 1.6, y: 5.5 } },
    { name: 'Galería norte', x0: 7, y0: 5, x1: w, y1: 6.2, floor: 'pasillo' },
    { name: 'Patio', x0: 7, y0: 6.2, x1: w, y1: 9.8, floor: 'pasto', sign: { x: (7 + w) / 2, y: 8 } },
    { name: 'Galería sur', x0: 7, y0: 9.8, x1: w, y1: 11, floor: 'pasillo' },
    { name: 'Ala norte', x0: 7, y0: 0, x1: w, y1: 5, floor: 'sala', sign: { x: (7 + w) / 2, y: 0.3 } },
    { name: 'Ala sur', x0: 7, y0: 11, x1: w, y1: h, floor: 'sala', sign: { x: (7 + w) / 2, y: 15.6 } },
  );
  clinicCafe(plan, 0, 0);
  plan.walls.push({ a: { x: 7, y: 0 }, b: { x: 7, y: 5 } }, { a: { x: 7, y: 11 }, b: { x: 7, y: h } });
  for (let k = 0; k < rooms; k++) plan.windows.push({ a: { x: 7.6 + 3 * k, y: 0 }, b: { x: 9.4 + 3 * k, y: 0 } });
  plan.windows.push({ a: { x: 0, y: 7 }, b: { x: 0, y: 10 } });
  plan.props.push({ kind: 'recepcion', p: { x: 1.6, y: 8.0 }, along: 'x', len: 2.4 }, { kind: 'planta', p: { x: 0.5, y: 15.4 } });
  plan.staff.push({ x: 1.6, y: 7.35 });
  for (const y of [12.4, 13.6]) for (const x of [3.6, 4.5, 5.4, 6.3]) plan.seats.push({ p: { x, y }, kind: 'espera', node: 'recep', face: 'NW' });
  Object.assign(plan.nodes, {
    calle: { x: 2.6, y: h + 0.9 },
    entrada: { x: 2.6, y: 15.0 },
    recep: { x: 2.8, y: 10.5 },
    'patio-o': { x: 8.0, y: 8.0 },
    'patio-e': { x: w - 0.8, y: 8.0 },
  });
  plan.edges.push(['calle', 'entrada'], ['entrada', 'recep'], ['recep', 'puerta-caf'], ['recep', 'gn-0'], ['recep', 'gs-0'], ['recep', 'patio-o']);
  wardRooms(plan, 7, 5, 'norte', north, 0, 5.6, 'gn');
  wardRooms(plan, 7, 11, 'sur', south, 1, 10.4, 'gs');
  plan.edges.push(['patio-o', 'gn-0'], ['patio-o', 'gs-0'], ['patio-e', `gn-${rooms - 1}`], ['patio-e', `gs-${Math.ceil(south / 4) - 1}`]);
  // Bancas del patio mirando al sendero central (y = 8), con árboles entre ellas.
  let prev = 'patio-o';
  for (let x = 9.5, k = 0; x < w - 1.5; x += 4, k++) {
    const node = `patio-${k}`;
    plan.nodes[node] = { x: x + 0.8, y: 8 };
    plan.edges.push([prev, node]);
    prev = node;
    plan.seats.push({ p: { x, y: 6.9 }, kind: 'banca', node, face: 'SW' }, { p: { x: x + 1.6, y: 9.1 }, kind: 'banca', node, face: 'NE' });
    plan.props.push({ kind: 'arbol', p: { x: x + 2.2, y: 6.75 } });
  }
  plan.edges.push([prev, 'patio-e']);
  plan.wings.push({ name: 'Ala norte', x0: 7, y0: 0, x1: w, y1: 5.5 }, { name: 'Ala sur', x0: 7, y0: 10.5, x1: w, y1: h });
  plan.spawn = plan.nodes.calle;
  plan.entry = 'entrada';
  return plan;
}

function empty(site: Site, name: string, w: number, h: number, cap: number): SitePlan {
  return { site, name, w, h, rooms: [], walls: [], doors: [], windows: [], backDoors: [], beds: [], wings: [], seats: [], machines: [], props: [], staff: [], nodes: {}, edges: [], spawn: { x: 0, y: 0 }, entry: '', cap };
}

/** Planta de la clínica j con `beds` camas (la capacidad activa del motor). */
export function clinicPlan(j: number, beds: number): SitePlan {
  return [rioClaro, pilonera, valleVerde][j](beds);
}

/**
 * Cafetería del hospital principal, delante de triage y admisión (y 16–20), conectada con la entrada
 * (hueco x 3,6–4,8) y con la sala de espera (hueco x 12,4–13,6). Mismas coordenadas que `layout.ts`.
 */
export function hospitalCafe(): SitePlan {
  const plan = empty(-1, 'Hospital Regional', 26, 20, 8);
  plan.rooms.push({ name: 'Cafetería', x0: 3, y0: 16, x1: 14, y1: 20, floor: 'madera', sign: { x: 8.5, y: 19.6 } });
  plan.walls.push({ a: { x: 3, y: 16 }, b: { x: 3.6, y: 16 } }, { a: { x: 4.8, y: 16 }, b: { x: 12.4, y: 16 } }, { a: { x: 13.6, y: 16 }, b: { x: 14, y: 16 } });
  plan.walls.push({ a: { x: 3, y: 16 }, b: { x: 3, y: 20 } }, { a: { x: 14, y: 16 }, b: { x: 14, y: 20 } });
  plan.doors.push({ a: { x: 3.6, y: 16 }, b: { x: 4.8, y: 16 } }, { a: { x: 12.4, y: 16 }, b: { x: 13.6, y: 16 } });
  plan.props.push({ kind: 'mostrador', p: { x: 3.75, y: 18.0 }, along: 'y', len: 2.6 }, { kind: 'planta', p: { x: 13.4, y: 19.4 } }, { kind: 'planta', p: { x: 5.4, y: 16.4 } });
  plan.staff.push({ x: 3.3, y: 18.0 });
  plan.machines.push(
    { kind: 'refrescos', p: { x: 6.6, y: 16.42 }, node: 'caf', front: { x: 6.6, y: 17.25 }, step: { x: 0, y: 0.62 } },
    { kind: 'papas', p: { x: 7.5, y: 16.42 }, node: 'caf', front: { x: 7.5, y: 17.25 }, step: { x: 0, y: 0.62 } },
  );
  for (const [tx, ty] of [
    [9.3, 17.3],
    [11.5, 17.3],
    [9.3, 19.0],
    [11.5, 19.0],
  ]) {
    plan.props.push({ kind: 'mesa-cafe', p: { x: tx, y: ty } });
    plan.seats.push({ p: { x: tx - 0.7, y: ty }, kind: 'cafe', node: 'mesas', face: 'SE' }, { p: { x: tx + 0.7, y: ty }, kind: 'cafe', node: 'mesas', face: 'NW' });
  }
  Object.assign(plan.nodes, {
    calle: { x: -1.0, y: 12.2 },
    puerta: { x: 0.5, y: 12.2 },
    vestibulo: { x: 3.0, y: 15.2 },
    'puerta-caf': { x: 4.2, y: 16 },
    caf: { x: 5.0, y: 19.3 },
    mesas: { x: 10.4, y: 18.15 },
  });
  plan.edges.push(['calle', 'puerta'], ['puerta', 'vestibulo'], ['vestibulo', 'puerta-caf'], ['puerta-caf', 'caf'], ['caf', 'mesas']);
  plan.backDoors.push({ a: { x: 0, y: 11.3 }, b: { x: 0, y: 13.1 } }); // umbral de la entrada (interior.ts)
  plan.spawn = plan.nodes.calle;
  plan.entry = 'puerta';
  return plan;
}

/** Recorrido por la red de nodos (Dijkstra; la red tiene unas decenas de nodos). */
export function routeNodes(plan: SitePlan, from: string, to: string): string[] {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  const len = (a: string, b: string) => Math.hypot(plan.nodes[a].x - plan.nodes[b].x, plan.nodes[a].y - plan.nodes[b].y);
  while (open.size) {
    let u = '';
    for (const n of open) if (!u || dist.get(n)! < dist.get(u)!) u = n;
    open.delete(u);
    if (u === to) break;
    for (const [a, b] of plan.edges) {
      const v = a === u ? b : b === u ? a : undefined;
      if (!v) continue;
      const d = dist.get(u)! + len(u, v);
      if (d < (dist.get(v) ?? Infinity)) dist.set(v, d), prev.set(v, u), open.add(v);
    }
  }
  if (!dist.has(to)) throw new Error(`Sin recorrido de ${from} a ${to} en ${plan.name}`);
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}

/** Huella de una cama en el piso (para pruebas y selección). */
export const bedRect = (b: Bed) => ({ x0: b.p.x - BED_HALF.x, x1: b.p.x + BED_HALF.x, y0: b.p.y - BED_HALF.y, y1: b.p.y + BED_HALF.y });

/**
 * Orden en que se pintan las plazas ocupadas: se reparten entre alas (1.ª del ala A, 1.ª del ala B, …).
 * Es solo una representación agregada: el motor no guarda qué cama ocupa cada paciente.
 */
export function fillOrder(plan: SitePlan): number[] {
  const byWing = plan.wings.map((_, w) => plan.beds.flatMap((b, i) => (b.wing === w ? [i] : [])));
  const order: number[] = [];
  for (let k = 0; order.length < plan.beds.length; k++) for (const list of byWing) if (k < list.length) order.push(list[k]);
  return order;
}
