import type { SimEvent } from '../../src/engine/events';
import { caption } from '../../src/render/demo';
import mock from '../../src/render/mock/events.json';

const events = mock.events as unknown as SimEvent[];
const nameOf = (id: string) => `Paciente ${id}`;
const eps = (id: string) => `EPS ${id}`;

describe('Subtítulos del modo demo (T18)', () => {
  it('narra el recorrido real de un paciente del mock, en orden', () => {
    const id = events.find((e) => e.type === 'TRANSFER_START')!.patientId!; // el remitido: el recorrido más completo
    const lines = events.filter((e) => e.patientId === id).map((e) => caption(e, nameOf, eps)).filter(Boolean);
    expect(lines[0]).toMatch(/llega a urgencias · EPS /);
    expect(lines).toContain(`Paciente ${id} pasa a triage con la enfermera`);
    expect(lines.some((l) => /^Triage (I|II|III|IV|V): /.test(l!))).toBe(true);
    expect(lines.some((l) => /entra al consultorio \d/.test(l!))).toBe(true);
    expect(lines).toContain('Sale en ambulancia hacia Clínica Río Claro');
    expect(lines.at(-1)).toMatch(/llegó a la clínica$/);
  });

  it('cada nivel de triage tiene su explicación y el II cita la Res. 5596', () => {
    const tri = (level: number) => caption({ t: 0, seq: 0, type: 'TRIAGE_ASSIGNED', patientId: 'p1', data: { level } }, nameOf, eps)!;
    for (let l = 1; l <= 5; l++) expect(tri(l)).toMatch(/^Triage [IV]+: \S/);
    expect(tri(2)).toContain('30 minutos (Res. 5596)');
  });

  it('el consultorio se numera desde 1 y los eventos sin interés no se narran', () => {
    expect(caption({ t: 0, seq: 0, type: 'SERVICE_START', patientId: 'p1', resourceId: 'doctor-0', data: { station: 'doctor' } }, nameOf, eps)).toBe('Paciente p1 entra al consultorio 1');
    expect(caption({ t: 0, seq: 0, type: 'MOVE', patientId: 'p1', from: 'entrance', to: 'triage_queue', duration: 0.5 }, nameOf, eps)).toBeUndefined();
    expect(caption({ t: 0, seq: 0, type: 'BED_RELEASED', patientId: 'p1' }, nameOf, eps)).toBeUndefined();
  });
});
