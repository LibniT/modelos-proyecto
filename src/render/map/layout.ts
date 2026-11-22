/**
 * T19 — Disposición del mapa de la ciudad (sin Phaser). Cada clínica está a una distancia PROPORCIONAL a su
 * tiempo medio de viaje en ambulancia (parámetro del modelo), así lo que se ve en el mapa respeta el modelo.
 */
import type { Vec } from '../layout';

/** baldosas del mapa por minuto de viaje medio */
export const TILES_PER_MIN = 0.55;
const MARGIN = 4;
/** direcciones de las vías (en baldosas): este, norte y noreste; si hubiera más clínicas, se reparten entre 0° y −90°. */
function direction(j: number, n: number): Vec {
  const a = n === 3 ? [0, -Math.PI / 2, -Math.PI / 4][j] : (-Math.PI / 2) * (n > 1 ? j / (n - 1) : 0);
  return { x: Math.cos(a), y: Math.sin(a) };
}

export interface CityLayout {
  w: number;
  h: number;
  hospital: Vec;
  clinics: Vec[];
}

/** `travelMeans`: tiempo medio de viaje a cada clínica (min). */
export function cityLayout(travelMeans: number[]): CityLayout {
  const rel = travelMeans.map((m, j) => {
    const d = direction(j, travelMeans.length);
    return { x: d.x * m * TILES_PER_MIN, y: d.y * m * TILES_PER_MIN };
  });
  const minX = Math.min(0, ...rel.map((p) => p.x));
  const minY = Math.min(0, ...rel.map((p) => p.y));
  const hospital = { x: MARGIN - minX, y: MARGIN - minY };
  const clinics = rel.map((p) => ({ x: hospital.x + p.x, y: hospital.y + p.y }));
  const w = Math.ceil(Math.max(hospital.x, ...clinics.map((c) => c.x)) + MARGIN);
  const h = Math.ceil(Math.max(hospital.y, ...clinics.map((c) => c.y)) + MARGIN);
  return { w, h, hospital, clinics };
}
