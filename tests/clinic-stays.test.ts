import { describe, expect, it } from 'vitest';
import { EmergencyDepartment, type PrehospitalRequest } from '../src/model/ed';
import { networkParams, realisticParams } from '../src/model/params';
import { nearestRoad, place, sitePoints } from '../src/model/valledupar/router';
import { assignBeds, hospitalCafe } from '../src/render/companions/plans';
import { ACCOMPANY, Social, idFraction } from '../src/render/companions/social';

describe('T36 · pacientes con identidad en las camas de las sedes', () => {
  it('cada remisión reserva, llega y libera su cama; nunca hay más con nombre que camas ocupadas', () => {
    const ed = new EmergencyDepartment(realisticParams(), { seed: 7 });
    const seenArrived = new Set<string>();
    const ended = new Set<string>();
    const n = ed.params.clinics.length;
    for (let t = 60; t <= 3 * 1440; t += 15) {
      ed.step(t);
      const snap = ed.snapshot();
      for (let j = 0; j < n; j++) {
        const stays = ed.clinicStays(j);
        expect(stays.length).toBeLessThanOrEqual(snap.clinics[j].occupied);
        for (const s of stays) {
          expect(s.from).toBe('urgencias');
          expect(s.reservedAt).toBeLessThanOrEqual(t);
          if (s.arrived !== undefined) {
            expect(s.arrived).toBeGreaterThanOrEqual(s.reservedAt);
            expect(s.until!).toBeGreaterThanOrEqual(t); // sigue en la cama: su estancia no ha terminado
            seenArrived.add(s.id);
          }
        }
      }
      for (const id of seenArrived) if (!Array.from({ length: n }, (_, j) => ed.clinicStays(j)).flat().some((s) => s.id === id)) ended.add(id);
    }
    expect(seenArrived.size).toBeGreaterThan(5);
    expect(ended.size).toBeGreaterThan(0); // las estancias terminan y la cama se libera
  });

  it('el paciente del mapa aparece en la cama de su sede con nombre, y sale al terminar la estancia', () => {
    const s = sitePoints().fracturas;
    const p = place(s.x + 120, s.y);
    const req: PrehospitalRequest = {
      info: { name: 'Ana Prueba', ageRange: '40-64', eps: 'sin-dato' },
      level: 4,
      condition: 'fractura_aislada',
      stable: true,
      ambulance: true,
      point: p.ok ? p.point : nearestRoad(s.x, s.y)!,
      policy: 'cercana',
    };
    const ed = new EmergencyDepartment(networkParams(), { seed: 2 });
    ed.step(30);
    const c = ed.injectPrehospital(req)!;
    const all = () => ed.params.clinics.flatMap((_, j) => ed.clinicStays(j).map((st) => ({ j, st })));
    const mine = () => all().find((x) => x.st.id === c.id);
    expect(c.decision.chosen?.kind).toBe('definitiva'); // fractura aislada junto a la Clínica de Fracturas: cama en la sede
    expect(c.destination).not.toBe(ed.params.network!.origin);
    expect(mine()?.st).toMatchObject({ name: 'Ana Prueba', from: 'mapa' });
    expect(mine()?.st.arrived).toBeUndefined(); // reservada mientras va en camino
    ed.step(30 + 6 * 60);
    expect(c.arrived).toBeDefined();
    expect(mine()?.st.arrived).toBe(c.arrived);
    ed.step(mine()!.st.until! + 1);
    expect(mine()).toBeUndefined();
  });
});

describe('T36 · acompañantes ligados a los pacientes del hospital', () => {
  it('nadie llega sin paciente; los que vienen se van cuando su paciente sale', () => {
    const s = new Social([hospitalCafe()], 4, { linked: [-1] });
    s.advance(480);
    for (let t = 480; t <= 500; t += 0.5) s.advance(t);
    expect(s.inSite(-1)).toHaveLength(0); // sin pacientes no hay acompañantes al azar
    const pats = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Paciente ${i}` }));
    s.syncPatients(-1, pats);
    for (let t = 500; t <= 540; t += 0.1) s.advance(t);
    const here = s.inSite(-1);
    expect(here.length).toBeGreaterThan(0);
    expect(here.every((c) => c.of && pats.some((p) => p.id === c.of!.id && idFraction(p.id) < ACCOMPANY))).toBe(true);
    const seated = here.filter((c) => c.activity === 'sentado').map((c) => c.seat);
    expect(new Set(seated).size).toBe(seated.length);
    // salen todos los pacientes: sus acompañantes se van y desaparecen al llegar a la calle
    s.syncPatients(-1, []);
    expect(s.inSite(-1).every((c) => c.activity === 'saliendo')).toBe(true);
    for (let t = 540; t <= 600; t += 0.1) s.advance(t);
    expect(s.inSite(-1)).toHaveLength(0);
    // un paciente ya visto no vuelve a traer acompañante
    s.syncPatients(-1, pats);
    expect(s.inSite(-1)).toHaveLength(0);
  });

  it('la decisión de venir acompañado depende solo del id (≈ ACCOMPANY)', () => {
    const k = Array.from({ length: 4000 }, (_, i) => `p-${i}`).filter((id) => idFraction(id) < ACCOMPANY).length / 4000;
    expect(Math.abs(k - ACCOMPANY)).toBeLessThan(0.03);
    expect(idFraction('p-12')).toBe(idFraction('p-12'));
  });
});

describe('T36 · reparto de camas dibujadas', () => {
  const order = [4, 0, 3, 1, 2];
  it('el paciente con nombre conserva su cama aunque cambie la demanda anónima', () => {
    const assigned = new Map<string, number>();
    const a = assignBeds(order, 5, assigned, 3, 0, [{ id: 'x', reserved: true, from: 'mapa' }]);
    expect(a[4]).toMatchObject({ kind: 'named', id: 'x', reserved: true });
    expect(a.filter((s) => s.kind === 'anon')).toHaveLength(2);
    // llega x, la demanda anónima baja a 0 y entra y (remitido): x sigue en la cama 4
    const b = assignBeds(order, 5, assigned, 2, 0, [{ id: 'y', reserved: false, from: 'urgencias' }, { id: 'x', reserved: false, from: 'mapa' }]);
    expect(b[4]).toMatchObject({ kind: 'named', id: 'x', reserved: false });
    expect(b[0]).toMatchObject({ kind: 'named', id: 'y' });
    expect(b.filter((s) => s.kind === 'anon')).toHaveLength(0);
    // sale x: su cama queda libre para otros
    const c = assignBeds(order, 5, assigned, 2, 0, [{ id: 'y', reserved: false, from: 'urgencias' }]);
    expect(c[0]).toMatchObject({ kind: 'named', id: 'y' });
    expect(c[4]).toEqual({ kind: 'anon' });
    expect(assigned.has('x')).toBe(false);
  });
  it('cuenta exacta: ocupadas = con nombre + anónimas + reservas sin nombre, y nunca más que las camas', () => {
    const slots = assignBeds(order, 5, new Map(), 5, 2, [{ id: 'a', reserved: true, from: 'urgencias' }, { id: 'b', reserved: false, from: 'mapa' }, { id: 'c', reserved: false, from: 'mapa' }, { id: 'd', reserved: false, from: 'mapa' }, { id: 'e', reserved: false, from: 'mapa' }, { id: 'f', reserved: false, from: 'mapa' }]);
    expect(slots.filter((s) => s.kind === 'named')).toHaveLength(5);
    expect(slots.filter((s) => s.kind === 'free')).toHaveLength(0);
    const mixed = assignBeds(order, 5, new Map(), 4, 2, [{ id: 'a', reserved: true, from: 'urgencias' }]);
    expect(mixed.map((s) => s.kind).sort()).toEqual(['anon', 'anon', 'free', 'named', 'reserved']);
  });
});
