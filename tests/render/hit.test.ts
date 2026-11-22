import { EmergencyDepartment } from '../../src/model/ed';
import { realisticParams } from '../../src/model/params';
import { LiveDriver } from '../../src/render/drivers';
import { BODY, hitTest } from '../../src/render/hit';
import { iso, stationPos, unIso } from '../../src/render/layout';
import { describe as tipFor } from '../../src/ui/tooltip';

function live(seed: number) {
  const ed = new EmergencyDepartment(realisticParams(), { seed, recordEvents: true });
  ed.step(8 * 60);
  const d = new LiveDriver(ed);
  d.tick(0.2); // 0,2 min simulados a ×60
  return d;
}
const eps = (id: string) => id;

describe('Tooltips (T08)', () => {
  it('unIso es la inversa de iso', () => {
    const p = { x: 7.3, y: 11.9 };
    const q = unIso(iso(p));
    expect(q.x).toBeCloseTo(p.x, 10);
    expect(q.y).toBeCloseTo(p.y, 10);
  });

  it('el puntero sobre un paciente lo identifica y su tooltip sale del snapshot', () => {
    const d = live(11);
    const f = [...d.pb.figures.values()].find((x) => !x.hidden)!;
    const q = iso(d.pb.position(f, d.pb.t));
    const hit = hitTest(d.pb, { x: q.x, y: q.y - BODY.dy }, false);
    expect(hit).toEqual({ kind: 'patient', id: f.id });
    const tip = tipFor(hit!, d.ed.snapshot(), eps, d.pb.ambulancesAway)!;
    const p = d.ed.snapshot().patients.find((x) => x.id === f.id)!;
    expect(tip.title).toContain(p.name);
    expect(tip.lines).toContain(`Estado: ${p.state}`);
  });

  it('un puesto ocupado dice a quién atiende; uno fuera de la capacidad dice que no tiene personal', () => {
    const d = live(11);
    const s = d.ed.snapshot();
    const busy = s.patients.find((p) => p.state === 'en consulta')!;
    expect(tipFor({ kind: 'station', id: busy.resourceId! }, s, eps, d.pb.ambulancesAway)!.lines[0]).toBe(
      `Atiende a ${busy.name}${busy.triage ? ` (triage ${['', 'I', 'II', 'III', 'IV', 'V'][busy.triage]})` : ''}`,
    );
    const off = tipFor({ kind: 'station', id: 'doctor-7' }, s, eps, d.pb.ambulancesAway)!; // 6 médicos por defecto
    expect(off.lines.join(' ')).toContain('Sin personal');
  });

  it('sobre un mueble vacío detecta el puesto, y fuera de los muebles el área', () => {
    const d = live(11);
    d.pb.figures.clear(); // solo interesa la geometría
    expect(hitTest(d.pb, iso(stationPos('doctor-7')!), false)).toEqual({ kind: 'station', id: 'doctor-7' });
    expect(hitTest(d.pb, iso({ x: 14.5, y: 14.8 }), false)).toEqual({ kind: 'area', name: 'Sala de espera' });
  });
});
