import { appearanceFor, characterPixels, H, STAFF, W } from '../../src/render/characters/pixels';

const opaque = (px: (string | null)[][]) => px.flat().filter(Boolean).length;

describe('Generador de personajes (T09)', () => {
  it('24 × 32 px con contorno, para todas las vistas, poses y cuadros', () => {
    for (const view of ['SE', 'NE'] as const)
      for (const pose of ['idle', 'walk', 'sit'] as const)
        for (let f = 0; f < 4; f++) {
          const px = characterPixels(STAFF.doctor, view, pose, f);
          expect(px).toHaveLength(H);
          px.forEach((r) => expect(r).toHaveLength(W));
          expect(px.flat()).toContain('#111827'); // contorno
          expect(opaque(px)).toBeGreaterThan(150);
        }
  });

  it('caminar: 4 cuadros, los neutros iguales a quieto y los pasos distintos entre sí', () => {
    const a = STAFF.triage;
    const f = [0, 1, 2, 3].map((k) => JSON.stringify(characterPixels(a, 'SE', 'walk', k)));
    expect(f[0]).toBe(JSON.stringify(characterPixels(a, 'SE', 'idle')));
    expect(f[2]).toBe(f[0]);
    expect(f[1]).not.toBe(f[0]);
    expect(f[3]).not.toBe(f[1]);
  });

  it('de espaldas no hay ojos; de frente sí', () => {
    const a = { ...STAFF.admission, accessory: undefined };
    const eyes = (v: 'SE' | 'NE') => characterPixels(a, v, 'idle')[8].filter((c) => c === '#111827').length;
    expect(eyes('SE')).toBeGreaterThan(eyes('NE'));
  });

  it('apariencia de pacientes del motor: determinista, catálogo acotado y canas a los 65+', () => {
    expect(appearanceFor('p17', '18-39')).toEqual(appearanceFor('p17', '18-39'));
    const looks = new Set(Array.from({ length: 2000 }, (_, i) => JSON.stringify(appearanceFor(`p${i}`, '18-39'))));
    expect(looks.size).toBeLessThanOrEqual(64);
    expect(appearanceFor('p5', '65+').hairColor).toBe('#c9c9c9');
  });
});
