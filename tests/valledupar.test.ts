import md from '../docs/investigacion/red-hospitalaria-valledupar-2026-11-24.md?raw';
import { describe, expect, it } from 'vitest';
import { SITES, SOURCES } from '../src/model/valledupar/sites';
import { MATRIX_SITES, RECEPTION_MATRIX, parseCell, reception, type ConditionId } from '../src/model/valledupar/capabilities';

describe('T25 · dataset de sedes de Valledupar', () => {
  it('ids únicos, fuentes existentes y capacidades nunca en cero', () => {
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    for (const s of SITES) {
      expect(s.sources.length).toBeGreaterThan(0);
      for (const src of s.sources) expect(SOURCES[src]).toBeDefined();
      for (const f of Object.values(s.capacity) as (typeof s.capacity.adultBeds)[]) {
        if (f === null) continue; // no documentado: se queda en null
        expect(f.value).toBeGreaterThan(0);
        expect(SOURCES[f.source]).toBeDefined();
      }
    }
  });

  it('toda columna de la matriz es una sede del dataset', () => {
    for (const id of MATRIX_SITES) expect(SITES.some((s) => s.id === id)).toBe(true);
  });

  it('la matriz coincide celda a celda con el informe guardado en docs/investigacion', () => {
    const start = md.indexOf('| Paciente | Alta Complejidad');
    const lines = md.slice(start).split('\n').slice(2);
    const rows = lines
      .slice(0, lines.findIndex((l) => !l.startsWith('|')))
      .map((l) => l.split('|').slice(2, -1).map((c) => c.replace(/\*/g, '').trim()));
    const ours = Object.values(RECEPTION_MATRIX);
    expect(rows).toEqual(ours);
  });

  it('interpreta las celdas combinadas de forma conservadora', () => {
    expect(parseCell('AD/C').level).toBe('C');
    expect(parseCell('C/AD').level).toBe('C');
    expect(parseCell('ER/C').level).toBe('ER');
    expect(parseCell('NH/ER').level).toBe('NH');
    expect(parseCell('NH/SI').level).toBe('SI');
    expect(parseCell('AD adulto')).toEqual({ level: 'AD', adultOnly: true, raw: 'AD adulto' });
    expect(() => parseCell('XX')).toThrow();
  });

  it('casos del informe: quemados, pediatría, sedes sin clasificar', () => {
    const burns = MATRIX_SITES.filter((s) => reception('quemadura_grave', s).level === 'AD');
    expect(burns).toEqual(['alta-complejidad']);
    expect(reception('tce_grave', 'icvc', true).level).toBe('AD');
    expect(reception('tce_grave', 'icvc', false).level).toBe('ER'); // "AD adulto" no aplica a un menor
    expect(reception('nino_critico', 'icvc').level).toBe('ER');
    expect(reception('iam', 'clinica-valledupar').level).toBe('SI');
    const every = Object.keys(RECEPTION_MATRIX) as ConditionId[];
    for (const c of every) for (const s of MATRIX_SITES) expect(() => reception(c, s)).not.toThrow();
  });
});
