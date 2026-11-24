import { describe, expect, it } from 'vitest';
import { chooseDestination, type SiteState } from '../src/model/referral';
import type { SiteId } from '../src/model/valledupar/sites';

/** Todas las sedes con ruta de 5 min y 10 camas libres, salvo lo que cambie cada prueba. */
const open = (over: Partial<Record<SiteId, Partial<SiteState>>> = {}) => {
  const ids: SiteId[] = ['alta-complejidad', 'icvc', 'ohi', 'ohi-santa-isabel', 'simon-bolivar', 'clinica-cesar', 'clinica-valledupar', 'erasmo', 'fracturas', 'san-lucas', 'sohec'];
  return Object.fromEntries(ids.map((id, j) => [id, { clinic: j, beds: 10, occupied: 0, minutes: 5, ...over[id] }])) as Record<SiteId, SiteState>;
};
const why = (d: ReturnType<typeof chooseDestination>, id: SiteId) => d.evaluated.find((e) => e.site === id)!.reason;

describe('T25 · selección del destino de la remisión', () => {
  it('quemadura grave: solo Alta Complejidad es AD; las demás se descartan con su motivo', () => {
    const d = chooseDestination('quemadura_grave', true, 'hrpl', open());
    expect(d.chosen?.site).toBe('alta-complejidad');
    expect(why(d, 'icvc')).toMatch(/estabilización y remisión/);
    expect(why(d, 'san-lucas')).toMatch(/no documentado como habilitado/);
    expect(why(d, 'sohec')).toMatch(/no recibe urgencias/);
    expect(why(d, 'clinica-valledupar')).toMatch(/información insuficiente/);
  });

  it('destino incompatible nunca se elige aunque sea el más cercano', () => {
    const d = chooseDestination('quemadura_grave', true, 'hrpl', open({ 'alta-complejidad': { occupied: 10 }, erasmo: { minutes: 0.1 } }));
    expect(d.chosen).toBeUndefined(); // la única AD está llena y no hay C: espera, no se fuerza
    expect(why(d, 'alta-complejidad')).toMatch(/saturada \(10\/10/);
  });

  it('entre AD gana la ruta más corta; C solo si no hay AD con cupo', () => {
    const iam = (s: ReturnType<typeof open>) => chooseDestination('iam', true, 'hrpl', s);
    expect(iam(open({ icvc: { minutes: 1 } })).chosen?.site).toBe('icvc');
    const full = iam(open({ icvc: { occupied: 10 }, 'alta-complejidad': { occupied: 10 }, 'clinica-cesar': { minutes: 2 } }));
    expect(full.chosen?.site).toBe('clinica-cesar');
    expect(full.chosen?.level).toBe('C');
    expect(full.chosen?.reason).toMatch(/sin atención definitiva con cupo/);
  });

  it('capacidad desconocida y falta de ruta descartan sin inventar datos', () => {
    const d = chooseDestination('uci_adulto', true, 'hrpl', open({ 'simon-bolivar': { clinic: undefined, beds: undefined }, erasmo: { minutes: null } }));
    expect(why(d, 'simon-bolivar')).toBe('capacidad no documentada');
    expect(why(d, 'erasmo')).toBe('sin ubicación o sin ruta vial');
    expect(d.chosen).toBeDefined();
  });

  it('"AD adulto" no aplica a un menor', () => {
    const only = open({ 'alta-complejidad': { occupied: 10 }, ohi: { occupied: 10 } });
    expect(chooseDestination('tce_grave', true, 'hrpl', only).chosen?.site).toBe('icvc');
    expect(chooseDestination('tce_grave', false, 'hrpl', only).chosen?.site).not.toBe('icvc');
  });

  it('el origen nunca es candidato', () => {
    const d = chooseDestination('crisis_psiquiatrica', true, 'hrpl', open());
    expect(d.evaluated.some((e) => e.site === 'hrpl')).toBe(false);
    expect(d.chosen?.site).toBe('san-lucas');
  });
});

describe('T25 · motivo de las sedes elegibles no elegidas', () => {
  it('una AD más lejana dice que su ruta es más larga; una C, que se prefiere una AD con cupo', () => {
    const d = chooseDestination('iam', true, 'hrpl', open({ icvc: { minutes: 1 }, 'alta-complejidad': { minutes: 2 } }));
    expect(d.chosen?.site).toBe('icvc');
    expect(why(d, 'alta-complejidad')).toBe('elegible, pero su ruta es más larga (2.0 min)');
    expect(why(d, 'clinica-cesar')).toMatch(/se prefiere una sede con atención definitiva/);
  });
});
