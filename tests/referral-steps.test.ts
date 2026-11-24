import { describe, expect, it } from 'vitest';
import { EmergencyDepartment } from '../src/model/ed';
import { networkParams } from '../src/model/params';
import { ReferralLog, referralSteps } from '../src/ui/referral-steps';

describe('T26 · seguimiento de la remisión en 4 pasos', () => {
  it('los tiempos de cada remisión van en orden y los pasos avanzan con los eventos', () => {
    const ed = new EmergencyDepartment(networkParams(), { seed: 21 });
    const log = new ReferralLog();
    ed.onEvent((e) => log.onEvent(e));
    const away = () => {
      const s = new Set<string>();
      for (let i = 0; i < ed.ambulances.capacity; i++) if (!ed.ambulances.isFree(i)) s.add(`amb-${i}`);
      return s;
    };
    for (let t = 10; t <= 3 * 1440; t += 10) {
      ed.step(t);
      log.tick(t, away());
    }
    const done = [...log.all.values()].filter((r) => r.released !== undefined);
    expect(done.length).toBeGreaterThan(3);
    for (const r of done) {
      expect(r.consultEnd!).toBeLessThanOrEqual(r.hallway!);
      expect(r.hallway!).toBeLessThanOrEqual(r.accepted!);
      expect(r.accepted!).toBeLessThanOrEqual(r.depart!);
      expect(r.arrive!).toBeCloseTo(r.depart! + r.trip!, 6);
      expect(r.released!).toBeGreaterThan(r.arrive!);
      expect(r.reason).toMatch(/ruta más corta|primera que aceptó/);
      expect(referralSteps(r, ed.now).map((s) => s.state)).toEqual(['hecho', 'hecho', 'hecho', 'hecho']);
    }
  });

  it('mientras espera destino, el paso 02 está en curso y los siguientes pendientes', () => {
    const log = new ReferralLog();
    log.onEvent({ t: 100, seq: 1, type: 'SERVICE_END', patientId: 'p1', data: { station: 'doctor' } });
    log.onEvent({ t: 100.5, seq: 2, type: 'HALLWAY_WAIT', patientId: 'p1', data: { reason: 'complejidad' } });
    const steps = referralSteps(log.all.get('p1')!, 130);
    expect(steps.map((s) => s.state)).toEqual(['hecho', 'en curso', 'pendiente', 'pendiente']);
    expect(steps[1].detail).toMatch(/Espera: 29,5 min/);
    // Si toma una cama del hospital, deja de ser remisión.
    log.onEvent({ t: 140, seq: 3, type: 'BED_ASSIGNED', patientId: 'p1' });
    expect(log.all.has('p1')).toBe(false);
  });

  it('fuera de la red: selección hecha sin destino, traslado y recepción no aplican', () => {
    const log = new ReferralLog();
    log.onEvent({ t: 0, seq: 1, type: 'HALLWAY_WAIT', patientId: 'p2' });
    log.onEvent({ t: 720, seq: 2, type: 'DEPARTURE', patientId: 'p2', data: { outcome: 'remitido', journey: { clinic: 'fuera de la red', referralReason: 'sin destino elegible en 12 h' } } });
    expect(referralSteps(log.all.get('p2')!, 720).map((s) => s.state)).toEqual(['hecho', 'hecho', 'no aplica', 'no aplica']);
  });
});
