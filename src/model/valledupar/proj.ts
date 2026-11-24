/**
 * T25 — Proyección local de Valledupar (equirrectangular centrada en la ciudad, error < 0,1 % en 10 km).
 * La usan `npm run red-vial` (calles, rutas) y el mapa (teselas de satélite). Metros; y crece hacia el norte.
 */
export const LAT0 = 10.465;
export const LON0 = -73.25;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110574;

export type P = [number, number];
export const proj = (lat: number, lon: number): P => [(lon - LON0) * KX, (lat - LAT0) * KY];
export const unproj = ([x, y]: P) => ({ lat: +(LAT0 + y / KY).toFixed(6), lon: +(LON0 + x / KX).toFixed(6) });

/** Esquinas (noroeste, sureste) de la tesela Web Mercator z/x/y en grados. */
export function tileBounds(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lon = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return { north: lat(y), west: lon(x), south: lat(y + 1), east: lon(x + 1) };
}

/** Índices de tesela que contienen el punto (para elegir cuáles descargar). */
export function tileOf(z: number, lat: number, lon: number) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) };
}
