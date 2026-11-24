import { describe, expect, it } from 'vitest';
import { geoMap, OSM_ATTRIBUTION } from '../../src/render/map/geo';
import { networkParams } from '../../src/model/params';
import { EmergencyDepartment } from '../../src/model/ed';
import { erlangB } from '../../src/validation/analytic';

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
});
