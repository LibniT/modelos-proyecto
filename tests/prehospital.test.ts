import { describe, expect, it } from 'vitest';
import { RngFactory } from '../src/engine/rng';
import { EmergencyDepartment, type PrehospitalRequest } from '../src/model/ed';
import { networkParams, realisticParams } from '../src/model/params';
import { choosePrehospital, type Candidate, type PrehospitalInput } from '../src/model/prehospital';
import { epsRelation } from '../src/model/valledupar/eps';
import { nearestRoad, place, sitePoints } from '../src/model/valledupar/router';
import type { SiteId } from '../src/model/valledupar/sites';

// ---------- selector puro ----------
const base = (candidates: Candidate[], over: Partial<PrehospitalInput> = {}): PrehospitalInput => ({
  condition: 'iam',
  adult: true,
  critical: false,
  candidates,
  stabilization: 60,
  coordination: 30,
  epsSlack: 15,
  criticalSlack: 10,
  ...over,
});
// IAM: Alta Complejidad e ICVC son AD; Clínica de Fracturas no (matriz del informe).
const bed = (free: number) => ({ free, total: 10, label: 'camas de UCI adulto' });
const cand = (site: SiteId, minutes: number | null, extra: Partial<Candidate> = {}): Candidate => ({ site, minutes, meters: (minutes ?? 0) * 500, eps: 'insuficiente', onward: { site: 'icvc', minutes: 8 }, ...extra });

describe('T30 · selección prehospitalaria (función pura)', () => {
  it('las tres políticas difieren: más cercana, compatible más cercana y menor tiempo hasta la atención adecuada', () => {
    const d = choosePrehospital(base([cand('fracturas', 2), cand('alta-complejidad', 4, { beds: bed(0) }), cand('icvc', 9, { beds: bed(3) })]));
    expect(d.byPolicy.cercana.site).toBe('fracturas');
    expect(d.byPolicy.compatible.site).toBe('icvc');
    expect(d.byPolicy.tiempo.site).toBe('icvc');
    const sat = d.options.find((o) => o.site === 'alta-complejidad')!;
    expect(sat.kind).toBe('estabilizacion');
    expect(sat.reasons.join(' ')).toMatch(/saturada/);
    expect(d.options.find((o) => o.site === 'fracturas')!.reasons.join(' ')).toMatch(/No dispone del servicio requerido/);
  });

  it('paciente crítico: si la definitiva queda lejos, se estabiliza en la urgencia más cercana', () => {
    const c = [cand('fracturas', 2), cand('icvc', 20, { beds: bed(3) })];
    expect(choosePrehospital(base(c, { critical: true })).chosen!.site).toBe('fracturas');
    expect(choosePrehospital(base(c, { critical: false })).chosen!.site).toBe('icvc');
  });

  it('EPS: un estable va a la red documentada de su EPS si cuesta ≤ 15 min más; un crítico no', () => {
    const near = [cand('alta-complejidad', 5, { beds: bed(2) }), cand('icvc', 15, { beds: bed(2), eps: 'confirmada' })];
    expect(choosePrehospital(base(near, { epsName: 'Nueva EPS' })).chosen!.site).toBe('icvc');
    expect(choosePrehospital(base(near, { epsName: 'Nueva EPS', critical: true })).chosen!.site).toBe('alta-complejidad');
    const far = [cand('alta-complejidad', 5, { beds: bed(2) }), cand('icvc', 25, { beds: bed(2), eps: 'confirmada' })];
    expect(choosePrehospital(base(far, { epsName: 'Nueva EPS' })).chosen!.site).toBe('alta-complejidad');
  });

  it('la falta de convenio o de información nunca excluye una sede de urgencias', () => {
    const d = choosePrehospital(base([cand('alta-complejidad', 5, { beds: bed(2), eps: 'inexistente' }), cand('icvc', 30, { beds: bed(2), eps: 'confirmada' })], { epsName: 'X' }));
    expect(d.chosen!.site).toBe('alta-complejidad');
    expect(d.chosen!.reasons.join(' ')).toMatch(/no impide la atención/);
    expect(epsRelation('salud-total', 'fracturas')).toBe('insuficiente');
  });

  it('sin sedes alcanzables no hay destino', () => {
    const d = choosePrehospital(base([cand('icvc', null), cand('sohec', 3)]));
    expect(d.chosen).toBeUndefined();
    expect(d.options.every((o) => o.kind === 'no-compatible')).toBe(true);
  });
});

// ---------- motor ----------
const near = (id: string, dx = 120) => {
  const s = sitePoints()[id];
  const p = place(s.x + dx, s.y);
  return p.ok ? p.point : nearestRoad(s.x, s.y)!;
};
const req = (over: Partial<PrehospitalRequest> = {}): PrehospitalRequest => ({
  info: { name: 'Paciente de prueba', ageRange: '40-64', eps: 'nueva-eps' },
  level: 2,
  condition: 'iam',
  stable: false,
  ambulance: true,
  point: near('erasmo'),
  ...over,
});

describe('T30 · paciente prehospitalario en el motor', () => {
  it('solo existe en el escenario de red', () => {
    expect(new EmergencyDepartment(realisticParams(), { seed: 1 }).injectPrehospital(req())).toBeNull();
  });

  it('recorrido completo y en orden: ambulancia → escena → destino, con la geometría y la duración del motor', () => {
    const ed = new EmergencyDepartment(networkParams(), { seed: 3, recordEvents: true });
    ed.step(60);
    const c = ed.injectPrehospital(req())!;
    ed.step(60 + 24 * 60);
    expect(c.outcome).toBeDefined();
    expect(c.created).toBeLessThanOrEqual(c.dispatched!);
    expect(c.dispatched!).toBeLessThanOrEqual(c.atScene!);
    expect(c.atScene!).toBeLessThanOrEqual(c.leftScene!);
    expect(c.leftScene!).toBeLessThanOrEqual(c.arrived!);
    expect(c.ambulanceFree[0]).toBeGreaterThanOrEqual(c.arrived!);
    const legs = ed.drainEvents().filter((e) => e.patientId === c.id && e.type === 'TRANSFER_START');
    expect(legs.map((e) => e.data!.leg)).toEqual(c.legs.map((l) => l.kind));
    legs.forEach((e, i) => expect(e.duration).toBeCloseTo(c.legs[i].minutes, 9));
    // el primer tramo termina en el paciente; el segundo sale de ahí
    const [a, b] = c.legs;
    expect(Math.hypot(a.path.at(-2)! - c.point.x, a.path.at(-1)! - c.point.y)).toBeLessThan(1.5);
    expect(Math.hypot(b.path[0] - c.point.x, b.path[1] - c.point.y)).toBeLessThan(1.5);
    expect(c.decision.options.length).toBe(12);
  });

  it('si va al hospital de origen entra a urgencias y reemplaza una llegada aleatoria (λ se conserva)', () => {
    const count = (inject: boolean) => {
      const ed = new EmergencyDepartment(networkParams(), { seed: 5, recordEvents: true });
      ed.step(30);
      const c = inject ? ed.injectPrehospital(req({ condition: 'fractura_aislada', level: 4, stable: true, point: near('hrpl', 60), policy: 'cercana' }))! : undefined;
      ed.step(12 * 60);
      if (c) {
        expect(c.destination).toBe('hrpl');
        expect(c.outcome).toBe('urgencias del hospital de origen');
      }
      const ev = ed.drainEvents();
      if (c) expect(ev.some((e) => e.type === 'ARRIVAL' && e.patientId === c.id && e.to === 'ambulance_bay')).toBe(true);
      return ev.filter((e) => e.type === 'ARRIVAL').length;
    };
    expect(count(true)).toBe(count(false));
  });

  it('con una sola ambulancia el segundo paciente espera a que quede libre', () => {
    const p = networkParams();
    p.network!.prehospital.ambulances = 1;
    const ed = new EmergencyDepartment(p, { seed: 2 });
    const a = ed.injectPrehospital(req())!;
    const b = ed.injectPrehospital(req({ point: near('icvc') }))!;
    ed.step(24 * 60);
    expect(b.dispatched!).toBeGreaterThanOrEqual(a.ambulanceFree[0]);
    expect(b.dispatched! - b.requested!).toBeGreaterThan(0);
  });

  it('reproducible con la misma semilla; conserva pacientes y camas', () => {
    const run = () => {
      const ed = new EmergencyDepartment(networkParams('congestionado'), { seed: 11 });
      const rng = new RngFactory(99).stream('puntos');
      const conds = ['iam', 'politrauma', 'tce_grave', 'nino_critico', 'fractura_aislada', 'quemadura_grave'] as const;
      const cases = [];
      for (let i = 0; i < 20; i++) {
        ed.step(i * 45);
        const p = place(-3000 + rng.next() * 6000, -3000 + rng.next() * 6000);
        const point = p.ok ? p.point : p.suggestion!;
        const condition = conds[i % conds.length];
        cases.push(ed.injectPrehospital(req({ point, condition, level: (1 + (i % 5)) as 1, stable: i % 2 === 0, info: { name: `P${i}`, ageRange: condition === 'nino_critico' ? '0-17' : '18-39', eps: 'salud-total' } }))!);
      }
      ed.step(5 * 1440);
      for (const c of ed.snapshot().clinics) expect(c.occupied).toBeLessThanOrEqual(c.beds);
      return cases;
    };
    const a = run();
    expect(a.every((c) => c.outcome !== undefined)).toBe(true);
    expect(JSON.stringify(run())).toBe(JSON.stringify(a));
  });
});
