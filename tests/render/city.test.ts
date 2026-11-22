import { cityLayout, TILES_PER_MIN } from '../../src/render/map/layout';
import { clinicCard } from '../../src/ui/clinic';
import { realisticParams } from '../../src/model/params';
import { distMean } from '../../src/engine/distributions';
import { erlangB } from '../../src/validation/analytic';

describe('Mapa de la ciudad (T19)', () => {
  const p = realisticParams();
  const means = p.clinics.map((c) => distMean(c.travel));
  const L = cityLayout(means);

  it('cada clínica está a una distancia proporcional a su tiempo medio de viaje', () => {
    L.clinics.forEach((c, j) => expect(Math.hypot(c.x - L.hospital.x, c.y - L.hospital.y)).toBeCloseTo(means[j] * TILES_PER_MIN, 9));
  });

  it('todo cabe en el mapa, con margen', () => {
    for (const q of [L.hospital, ...L.clinics]) {
      expect(q.x).toBeGreaterThanOrEqual(3);
      expect(q.y).toBeGreaterThanOrEqual(3);
      expect(q.x).toBeLessThanOrEqual(L.w - 3);
      expect(q.y).toBeLessThanOrEqual(L.h - 3);
    }
  });

  it('tarjeta de clínica: ocupación, red de EPS y Erlang B con su demanda propia', () => {
    const c = clinicCard(0, p, 12, 3);
    expect(c.title).toBe(p.clinics[0].name);
    expect(c.lines[0]).toBe(`Camas ocupadas: 12 de ${p.clinics[0].beds} (40 %)`);
    expect(c.lines[1]).toContain(': 3');
    const withNet = p.eps.filter((e) => e.network.includes(0)).map((e) => e.name);
    for (const n of withNet) expect(c.lines[2]).toContain(n);
    const a = (p.clinics[0].backgroundRatePerHour / 60) * distMean(p.clinics[0].los);
    expect(c.lines[5]).toContain(erlangB(p.clinics[0].beds, a) < 0.001 ? '< 0,1 %' : '%');
  });
});
