import { EmergencyDepartment } from '../../src/model/ed';
import { realisticParams } from '../../src/model/params';
import { LiveDriver } from '../../src/render/drivers';
import { SYMPTOMS } from '../../src/ui/creator/symptoms';
import type { AppearanceSpec } from '../../src/engine/events';

describe('Creador de paciente → escena (T10)', () => {
  it('el visitante llega con su apariencia y el triage le asigna el nivel de su síntoma', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 4, recordEvents: true });
    ed.step(8 * 60);
    const d = new LiveDriver(ed);
    const look: AppearanceSpec = { skin: 3, hairStyle: 2, hairColor: '#b03a2e', topStyle: 0, topColor: '#7c3aed', bottomColor: '#374151', accessory: 'glasses' };
    const s = SYMPTOMS.find((x) => x.level === 2)!;
    expect(ed.injectVisitor({ name: 'Visitante Expo', ageRange: '18-39', eps: 'sierra', symptom: s.text, triage: s.level, appearance: look })).toBe(true);
    let id: string | undefined;
    for (let k = 0; k < 600 && !id; k++) {
      d.tick(0.25); // 15 s simulados por paso a ×60
      id = [...d.pb.figures.values()].find((f) => f.isVisitor)?.id;
    }
    expect(id).toBeDefined();
    expect(d.pb.figures.get(id!)!.appearance).toEqual(look);
    for (let k = 0; k < 2000 && d.pb.figures.get(id!)?.triage === undefined; k++) d.tick(0.25);
    expect(d.pb.figures.get(id!)!.triage).toBe(2);
  });

  it('hay síntomas de los cinco niveles', () => {
    expect(new Set(SYMPTOMS.map((s) => s.level))).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});
