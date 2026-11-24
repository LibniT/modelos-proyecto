import { describe, expect, it } from 'vitest';
import rutas from '../src/model/valledupar/rutas.json';
import calles from '../src/model/valledupar/calles.json';
import { SITES } from '../src/model/valledupar/sites';

type Route = { distanceM: number; backM: number; straightM: number; minutes: number; path: number[] } | null;
const routes = rutas.routes as Record<string, Route>;
const sites = rutas.sites as Record<string, { x: number; y: number; verify: boolean }>;
const missing = rutas.missing as Record<string, string>;

const pathLength = (p: number[]) => {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
};

describe('T25 · rutas viales precalculadas (OSM)', () => {
  it('cada sede está ubicada o declarada como faltante, nunca ambas', () => {
    for (const s of SITES) expect(Boolean(sites[s.id]) !== Boolean(missing[s.id])).toBe(true);
  });

  it('sin ubicación no hay ruta (dato faltante, no inventado)', () => {
    for (const id of Object.keys(missing)) expect(routes[id]).toBeNull();
  });

  it('la distancia vial nunca es menor que la recta, y el tiempo base sale de la velocidad supuesta', () => {
    for (const [id, r] of Object.entries(routes)) {
      if (!r) continue;
      expect(r.distanceM, id).toBeGreaterThanOrEqual(r.straightM);
      expect(r.backM, id).toBeGreaterThanOrEqual(r.straightM * 0.9);
      expect(r.minutes).toBeCloseTo((r.distanceM / 1000 / rutas.ambulanceKmh) * 60, 1);
    }
  });

  it('la geometría va del origen al destino y mide lo mismo que la distancia vial', () => {
    const o = sites[rutas.origin];
    for (const [id, r] of Object.entries(routes)) {
      if (!r) continue;
      const p = r.path,
        d = sites[id];
      expect(Math.hypot(p[0] - o.x, p[1] - o.y), `${id}: inicio`).toBeLessThan(150);
      expect(Math.hypot(p[p.length - 2] - d.x, p[p.length - 1] - d.y), `${id}: llegada`).toBeLessThan(150);
      const L = pathLength(p);
      expect(L, id).toBeLessThanOrEqual(r.distanceM * 1.01 + 2); // coordenadas redondeadas al metro
      expect(L, id).toBeGreaterThan(r.distanceM * 0.97); // la simplificación (2 m) apenas acorta
    }
  });

  it('los archivos llevan atribución de OpenStreetMap y fecha de los datos', () => {
    for (const f of [rutas, calles]) {
      expect(f.attribution).toMatch(/OpenStreetMap/);
      expect(f.osmBase).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
    expect(calles.roads.length).toBeGreaterThan(1000);
  });
});
