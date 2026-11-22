/**
 * Disposición del hospital en la grilla isométrica (26 × 16 baldosas de 64 × 32 px).
 * Coordenadas en baldosas (x, y); el centro de la baldosa (i, j) es (i + 0.5, j + 0.5).
 * Sin Phaser: lo usan la escena y las pruebas.
 */
import type { Zone } from '../engine/events';

export interface Vec {
  x: number;
  y: number;
}

export const GRID = { w: 26, h: 16 };
export const TILE = { w: 64, h: 32 };
/** fila del pasillo central: los traslados que cruzan de un lado al otro pasan por aquí */
export const CORRIDOR_Y = 7;

/** Puestos dibujados = máximo de los deslizadores (SPEC D4). */
export const MAX = { triage: 3, admission: 3, doctor: 8, bed: 20, amb: 3 };

/** Proyección isométrica: baldosas → píxeles de mundo. */
export const iso = (p: Vec): Vec => ({ x: (p.x - p.y) * (TILE.w / 2), y: (p.x + p.y) * (TILE.h / 2) });

/** Áreas del piso (rectángulos [x0, x1) × [y0, y1)) con su rótulo. */
export const AREAS: { name: string; x0: number; y0: number; x1: number; y1: number; color: number; label?: Vec }[] = [
  { name: 'Ambulancias', x0: 0, y0: 0, x1: 3, y1: 7, color: 0x9ca3af, label: { x: 1.5, y: 0.3 } },
  { name: 'Consultorios', x0: 3, y0: 0, x1: 19, y1: 5, color: 0xdbeafe, label: { x: 11, y: 0.3 } },
  { name: 'Pasillo', x0: 3, y0: 5, x1: 17, y1: 9, color: 0xe5e7eb },
  { name: 'Entrada', x0: 0, y0: 7, x1: 5, y1: 16, color: 0xf5f5f4, label: { x: 2.5, y: 15.6 } },
  { name: 'Triage', x0: 5, y0: 9, x1: 8, y1: 16, color: 0xfee2e2, label: { x: 6.5, y: 15.6 } },
  { name: 'Admisión', x0: 8, y0: 9, x1: 12, y1: 16, color: 0xfef3c7, label: { x: 10, y: 15.6 } },
  { name: 'Sala de espera', x0: 12, y0: 9, x1: 17, y1: 16, color: 0xdcfce7, label: { x: 14.5, y: 15.6 } },
  { name: 'Camillas', x0: 17, y0: 5, x1: 19, y1: 16, color: 0xede9fe, label: { x: 18, y: 15.6 } },
  { name: 'Observación', x0: 19, y0: 0, x1: 26, y1: 16, color: 0xe0f2fe, label: { x: 22.5, y: 15.6 } },
];

/** Posición fija de cada puesto: 'triage-0', 'admission-2', 'doctor-5', 'bed-12', 'amb-1'. */
export function stationPos(resourceId: string): Vec | undefined {
  const m = /^(triage|admission|doctor|bed|amb)-(\d+)$/.exec(resourceId);
  if (!m) return undefined;
  const i = Number(m[2]);
  switch (m[1]) {
    case 'triage':
      return { x: 6.5, y: 10.5 + 2 * i };
    case 'admission':
      return { x: 10.5, y: 10.5 + 2 * i };
    case 'doctor':
      return { x: 4.5 + 2 * i, y: 2.5 };
    case 'bed':
      return { x: 20 + (i % 5) * 1.4, y: 1.8 + Math.floor(i / 5) * 3.6 };
    default:
      return { x: 1.5, y: 1.3 + 2.2 * i };
  }
}

/** Zonas donde los pacientes esperan en un puesto numerado (silla, fila, camilla). */
export type SlotZone = 'triage_queue' | 'admission_queue' | 'waiting_room' | 'hallway';
export const isSlotZone = (z: Zone): z is SlotZone => z === 'triage_queue' || z === 'admission_queue' || z === 'waiting_room' || z === 'hallway';

/** Puesto de espera i. Si se acaban los dibujados, sigue la misma grilla (zona de desborde). */
export function slotPos(zone: SlotZone, i: number): Vec {
  switch (zone) {
    case 'triage_queue':
      return { x: 4.3 - Math.floor(i / 8) * 0.8, y: 9.8 + (i % 8) * 0.8 };
    case 'admission_queue':
      return { x: 8.7 + Math.floor(i / 8) * 0.8, y: 9.8 + (i % 8) * 0.8 };
    case 'waiting_room':
      return { x: 12.6 + (i % 5), y: 10.2 + Math.floor(i / 5) };
    case 'hallway':
      return { x: 17.5 + (i % 2), y: 6 + Math.floor(i / 2) * 1.6 };
  }
}

/** Punto de referencia de cada zona (llegada a la zona sin puesto asignado aún). */
export function zoneAnchor(zone: Zone): Vec {
  switch (zone) {
    case 'entrance':
      return { x: 2.5, y: 14.5 };
    case 'exit':
      return { x: 0.5, y: 8 };
    case 'triage':
      return { x: 6.5, y: 9.5 };
    case 'admission':
      return { x: 10.5, y: 9.5 };
    case 'doctor_box':
      return { x: 11, y: 4.5 };
    case 'observation_bed':
      return { x: 19.5, y: 7 };
    case 'ambulance_bay':
      return { x: 2.5, y: 5.5 };
    case 'triage_queue':
    case 'admission_queue':
    case 'waiting_room':
    case 'hallway':
      return slotPos(zone, 0);
    default:
      return { x: 2.5, y: 5.5 }; // clinic_j: fuera del hospital, sale por la bahía de ambulancias
  }
}

/** Ruta fija entre dos puntos: recta si están del mismo lado del pasillo central; si no, por el pasillo. */
export function route(a: Vec, b: Vec): Vec[] {
  if ((a.y - CORRIDOR_Y) * (b.y - CORRIDOR_Y) > 0) return [a, b];
  return [a, { x: a.x, y: CORRIDOR_Y }, { x: b.x, y: CORRIDOR_Y }, b];
}

/** Punto a la fracción f ∈ [0, 1] de la longitud de la ruta. */
export function along(path: Vec[], f: number): Vec {
  const seg = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  let d = Math.min(Math.max(f, 0), 1) * seg.reduce((s, x) => s + x, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const u = seg[i] > 0 ? Math.min(d / seg[i], 1) : 1;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * u, y: path[i].y + (path[i + 1].y - path[i].y) * u };
    }
    d -= seg[i];
  }
  return path[path.length - 1];
}
