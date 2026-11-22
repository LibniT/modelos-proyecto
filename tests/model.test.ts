import { EmergencyDepartment } from '../src/model/ed';
import { realisticParams, validationParams } from '../src/model/params';
import type { SimEvent } from '../src/engine/events';

function run(seed: number, minutes: number, realistic = true) {
  const ed = new EmergencyDepartment(realistic ? realisticParams() : validationParams(), { seed, recordEvents: true });
  ed.step(minutes);
  return { ed, events: ed.drainEvents() };
}

describe('Modelo de urgencias: contrato de eventos e invariantes', () => {
  it('es determinista: misma semilla → mismos eventos', () => {
    const a = run(11, 24 * 60).events;
    const b = run(11, 24 * 60).events;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('los eventos están ordenados en el tiempo y con seq creciente', () => {
    const { events } = run(3, 3 * 1440);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }
  });

  it('todo paciente que sale tuvo llegada, triage y destino coherentes', () => {
    const { events, ed } = run(5, 3 * 1440);
    const byP = new Map<string, SimEvent[]>();
    for (const e of events) if (e.patientId) byP.set(e.patientId, [...(byP.get(e.patientId) ?? []), e]);
    let departed = 0;
    for (const [, evs] of byP) {
      expect(evs[0].type).toBe('ARRIVAL');
      const dep = evs.find((e) => e.type === 'DEPARTURE');
      if (!dep) continue;
      departed++;
      expect(evs.some((e) => e.type === 'TRIAGE_ASSIGNED')).toBe(true);
      expect(['alta', 'hospitalizacion', 'remitido', 'abandono']).toContain(dep.data?.outcome);
      expect(evs.at(-1)!.type).toBe('DEPARTURE');
    }
    expect(departed).toBeGreaterThan(500);
    // Conservación: los que siguen en el sistema = llegadas − salidas.
    const arrivals = events.filter((e) => e.type === 'ARRIVAL').length;
    const deps = events.filter((e) => e.type === 'DEPARTURE').length;
    expect(ed.snapshot().patients.length).toBe(arrivals - deps);
  });

  it('el Triage I nunca pasa por admisión (Res. 5596)', () => {
    const { events } = run(8, 5 * 1440);
    const level = new Map<string, number>();
    for (const e of events) if (e.type === 'TRIAGE_ASSIGNED') level.set(e.patientId!, e.data!.level as number);
    const viaAdmission = events.filter((e) => e.type === 'QUEUE_JOIN' && e.to === 'admission_queue');
    expect(viaAdmission.some((e) => level.get(e.patientId!) === 1)).toBe(false);
  });

  it('el triage siempre ocurre antes de la admisión', () => {
    const { events } = run(9, 2 * 1440);
    const triaged = new Set<string>();
    for (const e of events) {
      if (e.type === 'TRIAGE_ASSIGNED') triaged.add(e.patientId!);
      if (e.type === 'QUEUE_JOIN' && e.to === 'admission_queue') expect(triaged.has(e.patientId!)).toBe(true);
    }
  });

  it('nunca hay más pacientes en servicio que servidores', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 21 });
    for (let t = 60; t < 3 * 1440; t += 17) {
      ed.step(t);
      const s = ed.snapshot();
      expect(s.doctors.busy).toBeLessThanOrEqual(s.doctors.capacity);
      expect(s.triage.busy).toBeLessThanOrEqual(s.triage.capacity);
      expect(s.obsBeds.occupied).toBeLessThanOrEqual(s.obsBeds.capacity);
      s.clinics.forEach((c) => expect(c.occupied).toBeLessThanOrEqual(c.beds));
    }
  });

  it('el visitante REEMPLAZA la siguiente llegada (no la suma)', () => {
    const base = run(13, 600).events.filter((e) => e.type === 'ARRIVAL').map((e) => e.t);
    const ed = new EmergencyDepartment(realisticParams(), { seed: 13, recordEvents: true });
    ed.step(100);
    ed.injectVisitor({ name: 'Visitante Expo', ageRange: '18-39', eps: 'sierra', symptom: 'Dolor fuerte en el pecho', triage: 2 });
    ed.step(600);
    const evs = ed.drainEvents();
    const arr = evs.filter((e) => e.type === 'ARRIVAL');
    expect(arr.map((e) => e.t)).toEqual(base); // mismos instantes de llegada
    const v = arr.find((e) => (e.data?.info as { isVisitor: boolean }).isVisitor);
    expect(v).toBeDefined();
    expect(v!.t).toBeGreaterThan(100);
    const lvl = evs.find((e) => e.type === 'TRIAGE_ASSIGNED' && e.patientId === v!.patientId);
    expect(lvl?.data?.level).toBe(2);
  });

  it('modo validación rechaza visitantes y accidente masivo', () => {
    const ed = new EmergencyDepartment(validationParams(), { seed: 1 });
    expect(ed.injectVisitor({ name: 'x', ageRange: '18-39', eps: 'sierra' })).toBe(false);
    expect(ed.triggerMassCasualty(5)).toBe(false);
  });

  it('accidente masivo: llegan N pacientes a la vez', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 2, recordEvents: true });
    ed.step(300);
    ed.drainEvents();
    ed.triggerMassCasualty(8);
    const arr = ed.drainEvents().filter((e) => e.type === 'ARRIVAL');
    expect(arr.length).toBe(8);
    expect(new Set(arr.map((e) => e.t)).size).toBe(1);
  });

  it('cambiar la capacidad en caliente respeta el nuevo límite', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 4 });
    ed.step(600);
    ed.setCapacity('doctors', 2);
    ed.step(900); // dejar terminar las consultas en curso
    for (let t = 900; t < 1500; t += 7) {
      ed.step(t);
      expect(ed.snapshot().doctors.busy).toBeLessThanOrEqual(2);
    }
    ed.setCapacity('doctors', 8);
    ed.step(1510);
    expect(ed.snapshot().doctors.capacity).toBe(8);
  });
});

describe('Snapshot coherente con los recursos', () => {
  it('pacientes "en triage/admisión/consulta" = servidores ocupados', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 31 });
    for (let t = 30; t < 2 * 1440; t += 11) {
      ed.step(t);
      const s = ed.snapshot();
      const count = (st: string) => s.patients.filter((p) => p.state === st).length;
      expect(count('en triage')).toBe(s.triage.busy);
      expect(count('en admisión')).toBe(s.admission.busy);
      expect(count('en consulta')).toBe(s.doctors.busy);
      expect(count('en observación')).toBeLessThanOrEqual(s.obsBeds.occupied);
    }
  });
});
