import { describe, expect, it } from 'vitest';
import calles from '../src/model/valledupar/calles.json';
import grafo from '../src/model/valledupar/grafo.json';
import rutas from '../src/model/valledupar/rutas.json';
import { nearestRoad, place, routesFrom, SPEED_KMH, type RoadPoint } from '../src/model/valledupar/router';

const sites = rutas.sites as Record<string, { x: number; y: number }>;
const snapped = Object.fromEntries(Object.entries(sites).map(([id, s]) => [id, nearestRoad(s.x, s.y)!]));
const { hrpl, ...others } = snapped;

describe('T28 · rutas desde cualquier punto', () => {
  it('las 12 sedes quedan sobre una vía cercana', () => {
    for (const [id, s] of Object.entries(sites)) {
      const p = place(s.x, s.y);
      expect(p.ok, id).toBe(true);
      if (p.ok) expect(p.point.distM, id).toBeLessThan(80);
    }
  });

  it('fuera del área: se rechaza sin proponer punto', () => {
    const p = place(50_000, 50_000);
    expect(p.ok).toBe(false);
    expect(p.ok ? undefined : p.suggestion).toBeUndefined();
  });

  it('en el río Guatapurí: se advierte y se propone una vía accesible', () => {
    const river = calles.rivers.find((r) => r.big === 1)!.p;
    const k = 2 * Math.floor(river.length / 4);
    const p = place(river[k], river[k + 1]);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.reason).toMatch(/agua/);
    expect(p.suggestion).toBeDefined();
    expect(place(p.suggestion!.x, p.suggestion!.y).ok).toBe(true);
  });

  it('hay ruta del hospital de origen a cada sede, por vías existentes, de punta a punta', () => {
    const r = routesFrom(hrpl, others);
    for (const [id, route] of Object.entries(r)) {
      expect(route, id).not.toBeNull();
      const path = route!.path;
      const to = others[id as keyof typeof others];
      expect(Math.hypot(path[0] - hrpl.x, path[1] - hrpl.y), id).toBeLessThan(1.5);
      expect(Math.hypot(path.at(-2)! - to.x, path.at(-1)! - to.y), id).toBeLessThan(1.5);
      expect(route!.meters, id).toBeGreaterThanOrEqual(Math.hypot(to.x - hrpl.x, to.y - hrpl.y) - 2);
      for (let i = 0; i < path.length; i += 2) expect(nearestRoad(path[i], path[i + 1], 5)!.distM, id).toBeLessThan(1.5);
    }
  });

  it('respeta el sentido único: en contravía hay que dar la vuelta', () => {
    const k = (grafo.edges as number[][]).findIndex((e) => e[4] === 1 && e[2] > 80 && e[3] === 5);
    const len = (grafo.edges as number[][])[k][2];
    const at = (f: number): RoadPoint => ({ x: 0, y: 0, edge: k, at: f * len, distM: 0 });
    const ahead = routesFrom(at(0.1), { t: at(0.9) }).t!;
    expect(ahead.meters).toBeCloseTo(0.8 * len, -1);
    expect(ahead.minutes).toBeCloseTo((((0.8 * len) / 1000 / SPEED_KMH[5]) * 60), 1);
    const back = routesFrom(at(0.9), { t: at(0.1) }).t;
    expect(back).not.toBeNull();
    expect(back!.meters).toBeGreaterThan(0.8 * len + 20);
  });

  it('el tráfico congestionado nunca acelera una ruta y alarga al menos una', () => {
    const free = routesFrom(hrpl, others, 'fluido');
    const jam = routesFrom(hrpl, others, 'congestionado');
    for (const id of Object.keys(free) as (keyof typeof others)[]) expect(jam[id]!.minutes).toBeGreaterThanOrEqual(free[id]!.minutes);
    expect(Object.keys(free).some((id) => jam[id as keyof typeof others]!.minutes > free[id as keyof typeof others]!.minutes * 1.2)).toBe(true);
  });
});
