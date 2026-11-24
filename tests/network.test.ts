import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/engine/events';
import { EmergencyDepartment } from '../src/model/ed';
import { CONDITION_POOL, networkParams, POOLS, realisticParams, validationParams, type Params } from '../src/model/params';
import { CONDITION_LABEL, reception, type ConditionId } from '../src/model/valledupar/capabilities';
import { SITES } from '../src/model/valledupar/sites';

const run = (p: Params, days: number, seed = 7, every?: (ed: EmergencyDepartment) => void) => {
  const ed = new EmergencyDepartment(p, { seed, recordEvents: true });
  const ev: SimEvent[] = [];
  for (let t = 60; t <= days * 1440; t += 60) {
    ed.step(t);
    ev.push(...ed.drainEvents());
    every?.(ed);
  }
  return { ed, ev };
};
/** FNV-1a de 32 bits: huella corta del registro de eventos (sin depender de node:crypto). */
const fnv = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
};
const conditionId = Object.fromEntries(Object.entries(CONDITION_LABEL).map(([k, v]) => [v, k as ConditionId]));

describe('T25 · escenario de red de Valledupar', () => {
  it('regresión: los escenarios originales producen el mismo registro que antes de T25', () => {
    // Huellas del registro de T24 (semilla 2611, 3 días; se comprobó con SHA-256 que T25 no lo cambia).
    // Si cambian, cambió el modelo original.
    const hash = (p: Params) => {
      const ed = new EmergencyDepartment(p, { seed: 2611, recordEvents: true });
      ed.step(3 * 1440);
      return fnv(JSON.stringify(ed.drainEvents()));
    };
    expect(hash(validationParams())).toBe('16e03972');
    expect(hash(realisticParams())).toBe('f3070a70');
  });

  it('solo entran a la simulación sedes con capacidad documentada y ruta', () => {
    const p = networkParams();
    expect(p.network!.sites).not.toContain(p.network!.origin);
    for (const id of p.network!.sites) {
      const s = SITES.find((x) => x.id === id)!;
      expect(s.capacity.adultBeds).not.toBeNull();
      expect(s.emergency).toBe(true);
    }
    expect(p.network!.sites).not.toContain('san-lucas'); // capacidad no documentada
    expect(p.network!.sites).toContain('fracturas'); // T26: ubicada; 4 camas de adulto en REPS
  });

  it('cada traslado va a una sede compatible y al tipo de cama que la condición necesita, con motivo', () => {
    const p = networkParams();
    const { ev } = run(p, 7);
    const starts = ev.filter((e) => e.type === 'TRANSFER_START');
    expect(starts.length).toBeGreaterThan(5);
    for (const e of starts) {
      const d = e.data as { clinic: string; condition: string; reason: string; discarded: unknown[] };
      const cond = conditionId[d.condition];
      const j = Number(String(e.to).split('_')[1]);
      const site = p.network!.sites[j];
      const levels = [reception(cond, site, true).level, reception(cond, site, false).level];
      expect(levels.some((l) => l === 'AD' || l === 'C'), `${d.condition} → ${d.clinic}`).toBe(true);
      expect(p.network!.pools[j], `${d.condition} → ${d.clinic}`).toBe(CONDITION_POOL[cond]);
      expect(d.reason).toMatch(/ruta más corta|primera que aceptó/);
      expect(d.discarded.length).toBeGreaterThan(0);
    }
  });

  it('T27: cada tipo de cama simulado tiene capacidad documentada; las UCI sin cifra no se simulan', () => {
    const p = networkParams();
    p.network!.sites.forEach((id, j) => {
      const field = POOLS.find((k) => k.id === p.network!.pools[j])!.field;
      expect(SITES.find((s) => s.id === id)!.capacity[field]!.value).toBe(p.clinics[j].beds);
    });
    // Alta Complejidad tiene UCI pediátrica habilitada pero sin cifra: no se inventa una unidad.
    expect(p.network!.sites.some((id, j) => id === 'alta-complejidad' && p.network!.pools[j] === 'uci-pediatrica')).toBe(false);
    expect(p.network!.sites.some((id, j) => id === 'alta-complejidad' && p.network!.pools[j] === 'quemados')).toBe(true);
  });

  it('T27: con aceptación nula nadie sale; con aceptación total no hay rechazos', () => {
    const none = networkParams();
    none.network!.acceptance = { AD: 0, C: 0 };
    expect(run(none, 2).ev.some((e) => e.type === 'TRANSFER_START')).toBe(false);
    const all = networkParams();
    all.network!.acceptance = { AD: 1, C: 1 };
    for (const e of run(all, 2).ev.filter((x) => x.type === 'TRANSFER_START')) expect(String((e.data as { reason: string }).reason)).not.toMatch(/aceptó/);
  });

  it('conserva pacientes, camas y ambulancias; cada traslado llega', () => {
    const p = networkParams();
    let checked = 0;
    const { ed, ev } = run(p, 7, 11, (ed) => {
      const s = ed.snapshot();
      s.clinics.forEach((c) => expect(c.occupied).toBeLessThanOrEqual(c.beds));
      expect(s.ambulances.busy).toBeLessThanOrEqual(s.ambulances.capacity);
      checked++;
    });
    expect(checked).toBe(7 * 24);
    const arrivals = ev.filter((e) => e.type === 'ARRIVAL').length;
    const departures = ev.filter((e) => e.type === 'DEPARTURE').length;
    expect(arrivals).toBe(departures + ed.snapshot().patients.length);
    const started = new Set(ev.filter((e) => e.type === 'TRANSFER_START').map((e) => e.patientId));
    const ended = ev.filter((e) => e.type === 'TRANSFER_END').map((e) => e.patientId);
    for (const id of ended) expect(started.has(id)).toBe(true);
    const inTransit = ed.snapshot().patients.filter((x) => x.state === 'en traslado').length;
    expect(ended.length + inTransit).toBe(started.size);
  });

  it('sin ambulancias nadie sale en traslado: esperan con la cama reservada', () => {
    const p = networkParams();
    p.capacity.ambulances = 0;
    const { ed, ev } = run(p, 3);
    expect(ev.some((e) => e.type === 'TRANSFER_START')).toBe(false);
    expect(ed.snapshot().ambulances.queue).toBeGreaterThan(0);
  });

  it('red saturada: tras la espera máxima se remite fuera de la red, nunca a una sede incompatible', () => {
    const p = networkParams();
    p.clinics.forEach((c) => (c.beds = 1)); // con demanda propia, casi siempre llenas
    const { ed, ev } = run(p, 7);
    const out = ev.filter((e) => e.type === 'DEPARTURE' && (e.data as { journey: { clinic?: string } }).journey.clinic === 'fuera de la red');
    expect(out.length).toBeGreaterThan(0);
    for (const e of out) {
      const j = (e.data as { journey: { hallwayWait: number } }).journey;
      expect(j.hallwayWait).toBeGreaterThanOrEqual(p.network!.maxWait - 1e-9);
    }
    expect(ed.metrics()['remit.outOfNetwork']).toBeGreaterThan(0);
  });

  it('misma semilla, mismo registro (reproducible)', () => {
    const a = run(networkParams(), 2, 5).ev;
    const b = run(networkParams(), 2, 5).ev;
    expect(a).toEqual(b);
  });
});
