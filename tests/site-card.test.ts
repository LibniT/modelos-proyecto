import { describe, expect, it } from 'vitest';
import { siteLines } from '../src/ui/site-card';
import { SITES } from '../src/model/valledupar/sites';

describe('T26 · ficha completa de sede', () => {
  it('Alta Complejidad: capacidad con fuente, quemados como atención definitiva y ruta vial', () => {
    const l = siteLines('alta-complejidad', true).join('\n');
    expect(l).toMatch(/Camas de adulto: 173 · REPS/);
    expect(l).toMatch(/Camas de quemados: 14 .* portal institucional/);
    expect(l).toMatch(/Atención definitiva documentada: .*Quemadura extensa o grave/);
    expect(l).toMatch(/Ruta vial desde el hospital de origen: 0,5\d km/);
    expect(l).toMatch(/Ubicación verificada/);
    expect(l).not.toMatch(/No se simula/);
  });

  it('sede no simulada y origen de cada ubicación: lo dice sin inventar', () => {
    expect(siteLines('san-lucas', false).join('\n')).toMatch(/No se simula: sin camas documentadas/);
    expect(siteLines('icvc', true).join('\n')).toMatch(/Ubicación verificada: Google Maps/);
    expect(siteLines('erasmo', true).join('\n')).toMatch(/contrastada con Google Maps, .* \(\d+ m\)/);
    expect(siteLines('clinica-valledupar', false).join('\n')).toMatch(/Sin información suficiente: /);
  });

  it('todas las sedes producen ficha con fuentes', () => {
    for (const s of SITES) expect(siteLines(s.id, false).at(-1)).toMatch(/^Fuentes: /);
  });
});
