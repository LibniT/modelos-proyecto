import { appearanceFor, characterPixels, H, HAIR_FOR, HAIR_STYLES, STAFF, TOP_FOR, TOP_STYLES, W, stylesFor } from '../../src/render/characters/pixels';

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

  it('T38: cada peinado y cada prenda se dibuja distinto, y cada sexo tiene su catálogo', () => {
    const base = { skin: 1, hairColor: '#4a2c1a', topColor: '#7c3aed', bottomColor: '#2563eb' };
    for (const view of ['SE', 'NE'] as const) {
      const hair = new Set(HAIR_STYLES.map((_, i) => JSON.stringify(characterPixels({ ...base, hairStyle: i, topStyle: 0 }, 'SE', 'idle'))));
      expect(hair.size).toBe(HAIR_STYLES.length); // de frente todos se distinguen
      const tops = new Set(TOP_STYLES.map((_, i) => JSON.stringify(characterPixels({ ...base, hairStyle: 1, topStyle: i }, view, 'idle'))));
      expect(tops.size).toBeGreaterThanOrEqual(view === 'SE' ? TOP_STYLES.length : 5);
    }
    expect(HAIR_FOR).toHaveLength(HAIR_STYLES.length);
    expect(TOP_FOR).toHaveLength(TOP_STYLES.length);
    const women = stylesFor(HAIR_FOR, 'mujer'),
      men = stylesFor(HAIR_FOR, 'hombre');
    expect(women).not.toContain(0); // «corto» de hombre: la mujer tiene «corto con aretes»
    expect(men).not.toContain(1);
    expect(stylesFor(TOP_FOR, 'hombre')).not.toContain(3); // vestido
    // los pacientes generados usan peinado y ropa del mismo catálogo (no mezclan vestido con barba)
    for (let i = 0; i < 300; i++) {
      const a = appearanceFor(`p${i}`, '40-64');
      const who = HAIR_FOR[a.hairStyle] === 'todos' ? undefined : HAIR_FOR[a.hairStyle];
      if (who) expect([who, 'todos']).toContain(TOP_FOR[a.topStyle]);
    }
  });
});
