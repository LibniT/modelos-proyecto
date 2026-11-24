/**
 * T28 — Rutas desde cualquier punto de Valledupar sobre el grafo vial de OpenStreetMap (`grafo.json`, sin internet).
 *
 * - `place(x, y)`: valida un punto (área cubierta, agua, distancia a una vía) y lo ajusta al segmento vial más cercano.
 * - `routesFrom(origen, destinos, tráfico)`: un Dijkstra por tiempo desde el origen da la ruta a todos los destinos;
 *   respeta sentidos únicos, devuelve geometría, metros y minutos. Sin camino en el grafo → `null` (no se inventa).
 *
 * Velocidades por clase de vía y factores de tráfico: SUPUESTOS de simulación (no hay datos de tráfico de
 * Valledupar; ver docs/MODELO_PREHOSPITALARIO.md). Sin DOM ni Phaser.
 */
import { MinHeap } from '../../engine/heap';
import calles from './calles.json';
import grafo from './grafo.json';
import rutas from './rutas.json';

export type Traffic = 'fluido' | 'moderado' | 'congestionado';
export const TRAFFIC_LABEL: Record<Traffic, string> = { fluido: 'Tráfico fluido', moderado: 'Tráfico moderado', congestionado: 'Tráfico congestionado' };

/** km/h de una ambulancia con sirena en tráfico fluido, por clase (troncal … servicio). Supuesto. */
export const SPEED_KMH = [50, 45, 40, 35, 30, 25, 15];
/** Multiplicador del tiempo de cada clase según el escenario de tráfico. Supuesto. */
export const TRAFFIC_FACTOR: Record<Traffic, number[]> = {
  fluido: [1, 1, 1, 1, 1, 1, 1],
  moderado: [1.3, 1.3, 1.25, 1.2, 1.15, 1.1, 1.05],
  congestionado: [1.8, 1.8, 1.7, 1.5, 1.35, 1.2, 1.1],
};
/** Distancia máxima del clic a una vía para aceptar el punto. */
export const MAX_SNAP_M = 150;

export interface RoadPoint {
  x: number;
  y: number;
  edge: number;
  /** metros desde el nodo `a` de la arista */
  at: number;
  /** distancia del punto pedido a la vía */
  distM: number;
}
export type Placement = { ok: true; point: RoadPoint } | { ok: false; reason: string; suggestion?: RoadPoint };
export interface Route {
  meters: number;
  minutes: number;
  /** [x0, y0, x1, y1, …] en metros, del origen al destino */
  path: number[];
}

type P = [number, number];
interface Edge {
  a: number;
  b: number;
  len: number;
  cls: number;
  oneway: boolean;
  pts: P[];
  /** longitud acumulada en cada punto de `pts` */
  cum: number[];
}

const CELL = 100;
let G: { nodes: P[]; edges: Edge[]; out: { e: number; fwd: boolean }[][]; grid: Map<string, [number, number][]>; box: number[] } | undefined;

function graph() {
  if (G) return G;
  const nodes: P[] = [];
  for (let i = 0; i < grafo.nodes.length; i += 2) nodes.push([grafo.nodes[i], grafo.nodes[i + 1]]);
  const out: { e: number; fwd: boolean }[][] = nodes.map(() => []);
  const grid = new Map<string, [number, number][]>();
  const edges = (grafo.edges as number[][]).map(([a, b, len, cls, oneway, ...mid], i): Edge => {
    const pts: P[] = [nodes[a]];
    for (let k = 0; k < mid.length; k += 2) pts.push([mid[k], mid[k + 1]]);
    pts.push(nodes[b]);
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    out[a].push({ e: i, fwd: true });
    if (!oneway) out[b].push({ e: i, fwd: false });
    for (let k = 0; k + 1 < pts.length; k++) {
      // el segmento se registra en todas las celdas de su caja (los segmentos miden pocas celdas)
      const [x0, x1] = [Math.min(pts[k][0], pts[k + 1][0]), Math.max(pts[k][0], pts[k + 1][0])];
      const [y0, y1] = [Math.min(pts[k][1], pts[k + 1][1]), Math.max(pts[k][1], pts[k + 1][1])];
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const key = `${cx},${cy}`;
          (grid.get(key) ?? grid.set(key, []).get(key)!).push([i, k]);
        }
    }
    // la longitud geométrica manda (la del JSON está redondeada)
    return { a, b, len: cum[cum.length - 1] || len, cls, oneway: oneway === 1, pts, cum };
  });
  const xs = nodes.map((n) => n[0]),
    ys = nodes.map((n) => n[1]);
  G = { nodes, edges, out, grid, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  return G;
}

/** Punto de la red vial más cercano a (x, y), buscando hasta `maxM` metros. */
export function nearestRoad(x: number, y: number, maxM = 3000): RoadPoint | null {
  const g = graph();
  let best = null as RoadPoint | null;
  const seen = new Set<string>();
  const cx = Math.floor(x / CELL),
    cy = Math.floor(y / CELL);
  for (let r = 0; r * CELL <= maxM + CELL; r++) {
    for (let i = cx - r; i <= cx + r; i++)
      for (let j = cy - r; j <= cy + r; j++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== r) continue;
        for (const [e, k] of g.grid.get(`${i},${j}`) ?? []) {
          const id = `${e}:${k}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const E = g.edges[e];
          const [p, q] = [E.pts[k], E.pts[k + 1]];
          const dx = q[0] - p[0],
            dy = q[1] - p[1];
          const L2 = dx * dx + dy * dy;
          const t = L2 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / L2)) : 0;
          const px = p[0] + t * dx,
            py = p[1] + t * dy;
          const d = Math.hypot(x - px, y - py);
          if (d <= maxM && (!best || d < best.distM)) best = { x: px, y: py, edge: e, at: E.cum[k] + t * (E.cum[k + 1] - E.cum[k]), distM: d };
        }
      }
    // ya no puede aparecer nada más cerca que lo encontrado
    if (best && best.distM < r * CELL) break;
  }
  return best;
}

function inRing(x: number, y: number, ring: number[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function nearLine(x: number, y: number, line: number[], tol: number): boolean {
  for (let i = 0; i + 3 < line.length; i += 2) {
    const [px, py, qx, qy] = [line[i], line[i + 1], line[i + 2], line[i + 3]];
    const dx = qx - px,
      dy = qy - py;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / L2)) : 0;
    if (Math.hypot(x - px - t * dx, y - py - t * dy) <= tol) return true;
  }
  return false;
}
/** Ancho medio asumido del cauce del río Guatapurí / del Cesar alrededor de su línea OSM (m). */
const RIVER_HALF_M = 20;

/** Valida el punto pedido y lo ajusta a la vía; si no sirve, explica por qué y propone una vía cercana. */
export function place(x: number, y: number): Placement {
  const [x0, y0, x1, y1] = graph().box;
  if (x < x0 || x > x1 || y < y0 || y > y1) return { ok: false, reason: 'Está fuera del área cubierta por el mapa vial de Valledupar.' };
  const road = nearestRoad(x, y);
  const wet = calles.water.some((r) => inRing(x, y, r)) || calles.rivers.some((r) => r.big === 1 && nearLine(x, y, r.p, RIVER_HALF_M));
  if (wet) return { ok: false, reason: 'El punto está en el agua (río o cuerpo de agua).', ...(road ? { suggestion: road } : {}) };
  if (!road || road.distM > MAX_SNAP_M)
    return { ok: false, reason: `No hay una vía a menos de ${MAX_SNAP_M} m: una ambulancia no podría llegar ahí.`, ...(road ? { suggestion: road } : {}) };
  return { ok: true, point: road };
}

/** Minutos para recorrer `m` metros de la arista `e` con el tráfico dado. */
const minutesOn = (E: Edge, m: number, traffic: Traffic) => (m / 1000 / SPEED_KMH[E.cls]) * 60 * TRAFFIC_FACTOR[traffic][E.cls];

/** Puntos de la arista entre los desplazamientos s0 y s1 (s1 < s0: en sentido contrario). */
function piece(E: Edge, s0: number, s1: number): P[] {
  const at = (s: number): P => {
    let k = 0;
    while (k < E.cum.length - 2 && E.cum[k + 1] < s) k++;
    const seg = E.cum[k + 1] - E.cum[k] || 1;
    const t = Math.max(0, Math.min(1, (s - E.cum[k]) / seg));
    return [E.pts[k][0] + t * (E.pts[k + 1][0] - E.pts[k][0]), E.pts[k][1] + t * (E.pts[k + 1][1] - E.pts[k][1])];
  };
  const [lo, hi] = [Math.min(s0, s1), Math.max(s0, s1)];
  const mid = E.pts.filter((_, k) => E.cum[k] > lo && E.cum[k] < hi);
  const pts = [at(lo), ...mid, at(hi)];
  return s1 < s0 ? pts.reverse() : pts;
}

/**
 * Rutas más rápidas desde `from` hasta cada destino (ya ajustados con `place`/`nearestRoad`).
 * Arranque y llegada a mitad de cuadra: solo en el sentido permitido de la arista.
 */
export function routesFrom<K extends string>(from: RoadPoint, targets: Record<K, RoadPoint>, traffic: Traffic = 'fluido'): Record<K, Route | null> {
  const g = graph();
  const S = g.edges[from.edge];
  const D = new Float64Array(g.nodes.length).fill(Infinity);
  const prev: ({ e: number; fwd: boolean } | null)[] = new Array(g.nodes.length).fill(null);
  const heap = new MinHeap<[number, number]>((a, b) => a[0] < b[0]);
  const seed = (n: number, t: number) => {
    if (t < D[n]) {
      D[n] = t;
      heap.push([t, n]);
    }
  };
  seed(S.b, minutesOn(S, S.len - from.at, traffic));
  if (!S.oneway) seed(S.a, minutesOn(S, from.at, traffic));
  while (heap.size) {
    const [d, u] = heap.pop()!;
    if (d > D[u]) continue;
    for (const o of g.out[u]) {
      const E = g.edges[o.e];
      const v = o.fwd ? E.b : E.a;
      const nd = d + minutesOn(E, E.len, traffic);
      if (nd < D[v]) {
        D[v] = nd;
        prev[v] = o;
        heap.push([nd, v]);
      }
    }
  }
  // Camino de nodos desde el arranque hasta n (geometría).
  const toNode = (n: number): P[] => {
    const chain: { e: number; fwd: boolean }[] = [];
    let u = n;
    while (prev[u]) {
      chain.push(prev[u]!);
      const E = g.edges[prev[u]!.e];
      u = prev[u]!.fwd ? E.a : E.b;
    }
    // u es un nodo sembrado: el tramo inicial sale del punto de origen hacia u
    const pts: P[] = piece(S, from.at, u === S.b ? S.len : 0);
    for (const o of chain.reverse()) {
      const E = g.edges[o.e];
      pts.push(...(o.fwd ? E.pts : [...E.pts].reverse()).slice(1));
    }
    return pts;
  };
  const result = {} as Record<K, Route | null>;
  for (const key of Object.keys(targets) as K[]) {
    const T = targets[key];
    const E = g.edges[T.edge];
    const options: { t: number; pts: () => P[] }[] = [];
    if (T.edge === from.edge && T.at >= from.at) options.push({ t: minutesOn(E, T.at - from.at, traffic), pts: () => piece(E, from.at, T.at) });
    if (T.edge === from.edge && T.at <= from.at && !E.oneway) options.push({ t: minutesOn(E, from.at - T.at, traffic), pts: () => piece(E, from.at, T.at) });
    if (D[E.a] < Infinity) options.push({ t: D[E.a] + minutesOn(E, T.at, traffic), pts: () => [...toNode(E.a), ...piece(E, 0, T.at).slice(1)] });
    if (!E.oneway && D[E.b] < Infinity) options.push({ t: D[E.b] + minutesOn(E, E.len - T.at, traffic), pts: () => [...toNode(E.b), ...piece(E, E.len, T.at).slice(1)] });
    if (!options.length) {
      result[key] = null;
      continue;
    }
    const best = options.reduce((m, o) => (o.t < m.t ? o : m));
    const pts = best.pts();
    let meters = 0;
    for (let k = 1; k < pts.length; k++) meters += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    result[key] = { meters: Math.round(meters), minutes: +best.t.toFixed(2), path: pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]) };
  }
  return result;
}

// ---------- sedes de la red sobre la vía (para el motor) ----------
let SITE_POINTS: Record<string, RoadPoint> | undefined;
/** Punto vial de cada sede ubicada (`rutas.json`). */
export function sitePoints(): Record<string, RoadPoint> {
  return (SITE_POINTS ??= Object.fromEntries(Object.entries(rutas.sites as Record<string, { x: number; y: number }>).map(([id, s]) => [id, nearestRoad(s.x, s.y)!])));
}
const fromSite = new Map<string, Record<string, Route | null>>();
/** Rutas desde una sede a todas las demás (en caché por sede y tráfico). */
export function routesFromSite(id: string, traffic: Traffic = 'fluido'): Record<string, Route | null> {
  const key = `${id}|${traffic}`;
  if (!fromSite.has(key)) fromSite.set(key, routesFrom(sitePoints()[id], sitePoints(), traffic));
  return fromSite.get(key)!;
}
