import { EmergencyDepartment } from '../src/model/ed';
import { realisticParams } from '../src/model/params';
import { LiveDriver } from '../src/render/drivers';
import { NPath, recoveryTime } from '../src/batch/recovery';

function pair(seed: number) {
  const ed = new EmergencyDepartment(realisticParams(), { seed, recordEvents: true });
  const twin = new EmergencyDepartment(realisticParams(), { seed });
  ed.step(8 * 60);
  twin.step(8 * 60);
  return new LiveDriver(ed, twin);
}
const run = (d: LiveDriver, minutes: number) => {
  const end = d.ed.now + minutes;
  while (d.ed.now < end - 1e-9) d.tick(0.25); // 0,25 min por paso a ×60
};

describe('Recuperación tras un accidente masivo (T17)', () => {
  it('NPath: promedio temporal exacto de una trayectoria escalonada', () => {
    const p = new NPath(0, 2);
    p.push(10, 4);
    p.push(30, 1);
    expect(p.avg(0, 40)).toBeCloseTo((2 * 10 + 4 * 20 + 1 * 10) / 40, 12);
    expect(p.avg(5, 15)).toBeCloseTo((2 * 5 + 4 * 5) / 10, 12);
    expect(p.at(29.9)).toBe(4);
    expect(p.at(30)).toBe(1);
    // Para la gráfica: valor al inicio de la ventana, cada escalón en su instante y el valor al final.
    expect(p.points(15, 40)).toEqual([{ x: 15 / 60, y: 4 }, { x: 30 / 60, y: 1 }, { x: 40 / 60, y: 1 }]);
  });

  it('el gemelo es idéntico al motor hasta el accidente, aun con cambios de parámetros y visitantes', () => {
    const d = pair(31);
    run(d, 60);
    d.ed.setCapacity('doctors', 4);
    d.injectVisitor({ name: 'Visitante', ageRange: '18-39', eps: 'sierra', triage: 3 });
    run(d, 120);
    d.ed.setArrivalRate(15);
    run(d, 120);
    expect(d.nLive!.t).toEqual(d.nTwin!.t);
    expect(d.nLive!.n).toEqual(d.nTwin!.n);
    expect(d.ed.metrics()['doctor.Wq']).toBe(d.twin!.metrics()['doctor.Wq']);
  });

  it('tras el accidente el motor tiene más pacientes que el gemelo y luego se recupera', () => {
    const d = pair(31);
    run(d, 120);
    expect(d.massCasualty(15)).toBe(true);
    const t0 = d.accident!.t0;
    run(d, 30);
    expect(d.nLive!.avg(t0, t0 + 30)).toBeGreaterThan(d.nTwin!.avg(t0, t0 + 30) + 5);
    run(d, 24 * 60);
    const r = recoveryTime(d.nLive!, d.nTwin!, t0, d.ed.now);
    expect(r).toBeDefined();
    expect(r!).toBeGreaterThanOrEqual(30);
  });
});
