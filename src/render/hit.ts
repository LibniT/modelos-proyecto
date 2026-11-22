/**
 * ¿Qué hay bajo el puntero? Paciente > puesto > área. Sin Phaser (se prueba en Node).
 */
import { AREAS, MAX, iso, stationPos, unIso, type Vec } from './layout';
import type { Playback } from './playback';

export type Hit = { kind: 'patient'; id: string } | { kind: 'station'; id: string } | { kind: 'area'; name: string };

/** cuerpo del personaje: centro a `dy` px sobre los pies y radio de acierto (px de mundo) */
export const BODY = { dy: 26, r: 16 };
/** huella de cada puesto respecto a su posición (baldosas): cubre el mueble dibujado en scene.ts */
const FOOTPRINT = {
  triage: [-0.5, 1.5, -0.9, 0.9],
  admission: [-0.5, 1.5, -0.9, 0.9],
  doctor: [-0.9, 0.9, -2.3, 1.8],
  bed: [-0.6, 0.6, -1.1, 1.1],
  amb: [-1.2, 1.2, -0.8, 0.8],
} as const;

const STATIONS = (Object.keys(FOOTPRINT) as (keyof typeof FOOTPRINT)[]).flatMap((k) =>
  Array.from({ length: MAX[k] }, (_, i) => {
    const id = `${k}-${i}`;
    const p = stationPos(id)!;
    const [x0, x1, y0, y1] = FOOTPRINT[k];
    return { id, x0: p.x + x0, x1: p.x + x1, y0: p.y + y0, y1: p.y + y1 };
  }),
);

export function hitTest(pb: Playback, world: Vec, snap: boolean): Hit | undefined {
  let best: Hit | undefined;
  let bestD = BODY.r;
  for (const f of pb.figures.values()) {
    if (f.hidden) continue;
    const q = iso(pb.position(f, pb.t, snap));
    // De pie (centro del cuerpo) o acostado (a ras de la cama): vale el más cercano.
    const d = Math.min(Math.hypot(world.x - q.x, world.y - (q.y - BODY.dy)), Math.hypot(world.x - q.x, world.y - (q.y - 12)));
    if (d < bestD) [best, bestD] = [{ kind: 'patient', id: f.id }, d];
  }
  if (best) return best;

  const g = unIso(world);
  // T12: ambulancia en traslado sobre la vía (solo se dibuja hasta ×120).
  if (!snap)
    for (const id of pb.transfers.keys()) {
      const p = pb.ambulancePosition(id, pb.t)!;
      if (Math.abs(g.x - p.x) <= 1.2 && Math.abs(g.y - p.y) <= 0.8) return { kind: 'station', id };
    }
  const s = STATIONS.find((r) => g.x >= r.x0 && g.x <= r.x1 && g.y >= r.y0 && g.y <= r.y1);
  if (s) return { kind: 'station', id: s.id };

  // Las áreas se recorren de la última a la primera: la última dibujada queda encima.
  const a = [...AREAS].reverse().find((r) => g.x >= r.x0 && g.x < r.x1 && g.y >= r.y0 && g.y < r.y1);
  return a ? { kind: 'area', name: a.name } : undefined;
}
