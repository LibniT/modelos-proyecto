import { EmergencyDepartment } from '../../src/model/ed';
import { realisticParams } from '../../src/model/params';
import { LiveDriver } from '../../src/render/drivers';
import { journeyCard } from '../../src/ui/journey';
import type { SimEvent } from '../../src/engine/events';

describe('Tarjeta de recorrido (T16)', () => {
  const ed = new EmergencyDepartment(realisticParams(), { seed: 21, recordEvents: true });
  ed.step(8 * 60);
  const d = new LiveDriver(ed);
  ed.injectVisitor({ name: 'Visitante Expo', ageRange: '18-39', eps: 'sierra', symptom: 'Dolor en el pecho', triage: 2 });
  const deps: SimEvent[] = [];
  for (let k = 0; k < 20000 && !deps.some((e) => (e.data as { isVisitor: boolean }).isVisitor); k++) {
    d.tick(0.25);
    deps.push(...d.pb.departures.splice(0));
  }
  const mine = deps.find((e) => (e.data as { isVisitor: boolean }).isVisitor)!;

  it('el Playback entrega la salida del visitante con su recorrido', () => {
    expect(mine).toBeDefined();
    expect(mine.type).toBe('DEPARTURE');
  });

  it('la tarjeta resume el recorrido y evalúa la Res. 5596 para el Triage II', () => {
    const c = journeyCard(mine, 20);
    const j = (mine.data as { journey: { doctorWait?: number; outcome: string } }).journey;
    expect(c.title).toBe('Recorrido de Visitante Expo (tu paciente)');
    expect(c.level).toBe(2);
    expect(c.lines[0]).toBe('Nivel de triage: II');
    if (j.doctorWait !== undefined) expect(c.lines.join(' ')).toContain(j.doctorWait <= 30 ? 'cumplió' : 'NO cumplió');
    expect(c.lines.at(-1)).toMatch(/^Desenlace: /);
  });

  it('un abandono no muestra espera por médico', () => {
    const e: SimEvent = { t: 600, seq: 1, type: 'DEPARTURE', patientId: 'p9', data: { name: 'Ana', level: 5, isVisitor: false, outcome: 'abandono', journey: { arrival: 480, triageWait: 2, admissionWait: 3, outcome: 'abandono', departure: 600 } } };
    const c = journeyCard(e, NaN);
    expect(c.lines.join(' ')).not.toContain('Del triage al médico');
    expect(c.lines.at(-1)).toBe('Desenlace: Se fue sin ser atendido (abandono)');
    expect(c.lines[1]).toBe('Llegó a las 08:00 y salió a las 10:00: 120 min en el servicio');
  });
});
