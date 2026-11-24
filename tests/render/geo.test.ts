import { describe, expect, it } from 'vitest';
import { geoMap, hiresTiles, OSM_ATTRIBUTION } from '../../src/render/map/geo';
import { networkParams } from '../../src/model/params';
import { EmergencyDepartment } from '../../src/model/ed';
import { erlangB } from '../../src/validation/analytic';
import { tileBounds, tileOf } from '../../src/model/valledupar/proj';

describe('T25 · mapa real de Valledupar', () => {
  const p = networkParams();
  const m = geoMap(p.network!.sites);

  it('cada clínica simulada tiene marcador y ruta que va de su origen a su sede', () => {
    const origin = m.sites.find((s) => s.origin)!;
    p.network!.sites.forEach((id, j) => {
      const s = m.sites.find((x) => x.id === id)!;
      expect(s.clinic).toBe(j);
      const r = m.routes[j];
      expect(r.length).toBeGreaterThan(1);
      expect(Math.hypot(r[0].x - origin.at.x, r[0].y - origin.at.y)).toBeLessThan(150);
      expect(Math.hypot(r.at(-1)!.x - s.at.x, r.at(-1)!.y - s.at.y)).toBeLessThan(150);
    });
  });

  it('las sedes no simuladas dicen por qué; las faltantes no se dibujan', () => {
    for (const s of m.sites) if (s.clinic === undefined && !s.origin) expect(s.note).toBeTruthy();
    expect(m.sites.some((s) => s.id === 'fracturas')).toBe(false);
    expect(m.missing).toContain('Clínica de Fracturas Valledupar');
    expect(OSM_ATTRIBUTION).toMatch(/OpenStreetMap/);
  });

  it('el norte queda arriba: Erasmo (más al norte) tiene menor y en pantalla que Simón Bolívar', () => {
    const y = (id: string) => m.sites.find((s) => s.id === id)!.at.y;
    expect(y('erasmo')).toBeLessThan(y('simon-bolivar'));
  });

  it('las sedes arrancan en equilibrio: ocupación inicial media ≈ a·(1 − B) de Erlang B', () => {
    const j = p.network!.sites.indexOf('erasmo');
    const c = p.clinics[j];
    const a = (c.backgroundRatePerHour / 60) * 2880;
    let sum = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) sum += new EmergencyDepartment(p, { seed }).snapshot().clinics[j].occupied;
    // Media de la Poisson truncada en K = a·(1 − B(K, a)); desviación típica ≤ √a, error estándar ≤ √(a/n).
    expect(Math.abs(sum / n - a * (1 - erlangB(c.beds, a)))).toBeLessThan(4 * Math.sqrt(a / n));
  });

  it('F6: la tesela que contiene un punto lo encierra, y el satélite cubre todas las sedes', () => {
    const { x, y } = tileOf(14, 10.4693, -73.2545);
    const b = tileBounds(14, x, y);
    expect(10.4693).toBeLessThanOrEqual(b.north);
    expect(10.4693).toBeGreaterThanOrEqual(b.south);
    expect(-73.2545).toBeGreaterThanOrEqual(b.west);
    expect(-73.2545).toBeLessThanOrEqual(b.east);
    for (const s of m.sites) expect(m.tiles.some((t) => s.at.x >= t.x0 && s.at.x <= t.x1 && s.at.y >= t.y0 && s.at.y <= t.y1), s.id).toBe(true);
  });

  it('F6: zonas verdes y agua son polígonos de verdad (la simplificación no los colapsa) y hay nombres de vías', () => {
    for (const p of [...m.green, ...m.water]) expect(p.length).toBeGreaterThanOrEqual(4);
    expect(m.rivers.some((r) => r.big)).toBe(true);
    expect(m.labels.length).toBeGreaterThan(10);
    for (const l of m.labels) expect(Math.abs(l.deg)).toBeLessThanOrEqual(90); // nunca al revés
  });

  it('satélite en línea: más zoom pide más detalle y las teselas cubren la vista', () => {
    const view = { x: -500, y: -400, width: 1000, height: 600 };
    const far = hiresTiles(view, 0.06),
      near = hiresTiles(view, 1);
    expect(near[0].z).toBeGreaterThan(far[0].z);
    expect(near[0].z).toBeLessThanOrEqual(19);
    for (const ts of [far, near]) {
      expect(Math.min(...ts.map((t) => t.x0))).toBeLessThanOrEqual(view.x);
      expect(Math.max(...ts.map((t) => t.x1))).toBeGreaterThanOrEqual(view.x + view.width);
      expect(Math.min(...ts.map((t) => t.y0))).toBeLessThanOrEqual(view.y);
      expect(Math.max(...ts.map((t) => t.y1))).toBeGreaterThanOrEqual(view.y + view.height);
    }
    // a un píxel de tesela por píxel de pantalla: con zoom 1 (1 px por metro) la tesela mide < 2 m por píxel
    expect((near[0].x1 - near[0].x0) / 256).toBeLessThan(2);
  });
});
