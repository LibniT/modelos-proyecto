import { EmergencyDepartment } from '../../src/model/ed';
import { realisticParams } from '../../src/model/params';
import { LiveDriver } from '../../src/render/drivers';

describe('Escena conectada al motor en vivo (T06)', () => {
  it('la escena coincide con snapshot(): mismos pacientes, mismos puestos, mismas ambulancias fuera', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 77, recordEvents: true });
    ed.step(8 * 60);
    const d = new LiveDriver(ed);
    d.speed = 600;
    let checks = 0;
    for (let frame = 0; frame < 60 * 60; frame++) {
      if (frame === 600) ed.triggerMassCasualty(8);
      if (frame === 1200) ed.setCapacity('doctors', 4);
      d.tick(1 / 60);
      if (frame % 30) continue;
      const s = ed.snapshot();
      expect(d.pb.t).toBe(ed.now);
      expect(new Set(d.pb.figures.keys())).toEqual(new Set(s.patients.map((p) => p.id)));
      for (const p of s.patients) {
        const f = d.pb.figures.get(p.id)!;
        if (p.state === 'en traslado') expect(f.hidden).toBe(true);
        else if (/^(en triage|en admisión|en consulta|en observación)$/.test(p.state)) expect(f.resourceId).toBe(p.resourceId);
      }
      expect(d.pb.ambulancesAway.size).toBe(s.ambulances.busy);
      expect(d.pb.capacity.doctors).toBe(s.doctors.capacity);
      checks++;
    }
    expect(checks).toBe(120);
    expect(ed.now).toBeCloseTo(8 * 60 + 600, 6); // 60 s reales a ×600 = 600 min
  });

  it('en pausa el reloj no avanza', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 5, recordEvents: true });
    const d = new LiveDriver(ed);
    d.paused = true;
    d.tick(1);
    expect(ed.now).toBe(0);
  });
});
