import { AREAS, GRID, MAX, ROAD, iso, stationPos } from './layout';
import { pts } from './draw';
import { cream, glass, ink, rect, slab, tree, type G } from './art';

const floorColors = [0xbfc8be, 0xe0e5d9, 0xece8d8, 0xe8dbc2, 0xf0d6c9, 0xf0e0bc, 0xd5e4d9, 0xdddcd2, 0xd5e7e4];
const guides = [0x758c87, 0x598b93, 0x99aba3, 0xb78d5d, 0xc67c64, 0xc69c54, 0x6a947c, 0x96919a, 0x639a9b];

/** Planta de corte sobre un zócalo, con el andén de acceso y la vía de ambulancias. */
export function floorPlan(g: G): void {
  slab(g, 0, 0, GRID.w, GRID.h, -13, 13, 0xa3b6ac);
  rect(g, ROAD.x0, ROAD.y0, ROAD.x1 - ROAD.x0, ROAD.y1 - ROAD.y0, 0, 0x617974);
  for (let i = 0; i < MAX.amb - 1; i++) {
    const y = (stationPos('amb-' + i)!.y + stationPos('amb-' + (i + 1))!.y) / 2;
    for (let x = ROAD.x0 + 0.3; x < 0; x += 1.25) rect(g, x, y, 0.63, 0.06, 1, 0xf2dc9d);
  }
  AREAS.forEach((a, i) => {
    rect(g, a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0, 0, floorColors[i]);
    g.lineStyle(1, ink, 0.14);
    for (let x = a.x0; x <= a.x1; x++)
      g.strokePoints(
        pts([
          { x, y: a.y0 },
          { x, y: a.y1 },
        ]),
      );
    for (let y = a.y0; y <= a.y1; y++)
      g.strokePoints(
        pts([
          { x: a.x0, y },
          { x: a.x1, y },
        ]),
      );
    rect(g, a.x0 + 0.12, a.y0 + 0.12, a.x1 - a.x0 - 0.24, 0.09, 1, guides[i]);
    rect(g, a.x0 + 0.12, a.y0 + 0.12, 0.09, a.y1 - a.y0 - 0.24, 1, guides[i]);
  });
  for (let i = 0; i < 3; i++) {
    rect(g, 2.5, 6.72 + i * 0.17, 14.1, 0.08, 1, guides[4 + i]);
    rect(g, 6.6 + i * 3.5, 6.72 + i * 0.17, 0.08, 2.5 - i * 0.17, 1, guides[4 + i]);
  }
  // Ventanas altas y montantes a lo largo de los consultorios.
  slab(g, 3, -0.16, 23, 0.23, 0, 51, 0xd5e1d6);
  slab(g, 3, -0.18, 23, 0.27, 49, 4, cream);
  slab(g, 3, 0.07, 23, 0.025, 9, 4, 0x74a09b);
  for (let x = 3.4; x < 25.4; x += 2) {
    slab(g, x, 0.07, 1.28, 0.035, 22, 19, 0x5d8890);
    slab(g, x + 0.05, 0.11, 0.56, 0.015, 24, 15, 0xa6d4d2);
    slab(g, x + 0.68, 0.11, 0.54, 0.015, 24, 15, 0xc7e4da);
    slab(g, x - 0.05, 0.07, 1.38, 0.11, 21, 3, cream);
  }
  for (const [y, len] of [
    [8.9, 2.4],
    [13.1, 2.9],
  ]) {
    slab(g, -0.15, y, 0.22, len, 0, 46, 0xc1d4c9);
    slab(g, -0.17, y, 0.26, len, 44, 4, cream);
    slab(g, 0.07, y + 0.2, 0.04, len - 0.4, 15, 23, glass);
  }
  // Umbral entre jambas; las puertas de acceso quedan abiertas.
  rect(g, -0.6, 11.3, 0.7, 1.8, 1, 0xb2aaa0);
  for (const y of [11.28, 13.04]) slab(g, -0.12, y, 0.2, 0.12, 0, 48, ink);
  slab(g, -0.12, 11.28, 0.22, 1.88, 45, 4, 0x54827d);
  tree(g, -0.45, 14.1, 0.85);
  tree(g, -0.42, 9.35, 0.78);
}

export type Furniture = 'silla' | 'camilla' | 'cama' | 'consulta' | 'mesa' | 'tabique' | 'cortina' | 'planta';

export function furniture(g: G, kind: Furniture, active: boolean): void {
  const textile = active ? 0x87bab8 : 0xb9c4bd;
  const trim = active ? 0x568981 : 0x9aa8a2;
  g.fillStyle(ink, 0.12).fillEllipse(3, 2, kind === 'cama' ? 65 : 32, kind === 'cama' ? 29 : 14);
  if (kind === 'planta') {
    tree(g, 0, 0, 0.78);
    slab(g, -0.13, -0.13, 0.26, 0.26, 0, 6, 0xc59474);
    return;
  }
  if (kind === 'tabique') {
    slab(g, -0.05, -0.49, 0.1, 0.98, 0, 14, 0xc4d2c6);
    slab(g, -0.045, -0.49, 0.09, 0.98, 14, 15, 0xa5c7c2);
    slab(g, -0.06, -0.5, 0.12, 1, 29, 2, cream);
    return;
  }
  if (kind === 'cortina') {
    slab(g, -0.035, -0.4, 0.07, 0.8, 8, 23, 0xa3c9ba);
    for (let i = 0; i < 4; i++) slab(g, 0.035, -0.39 + i * 0.2, 0.035, 0.055, 8, 22, 0x88b6a8);
    slab(g, -0.05, -0.44, 0.1, 0.9, 31, 2, cream);
    return;
  }
  if (kind === 'silla') {
    slab(g, -0.19, -0.15, 0.38, 0.31, 0, 8, 0x849b95);
    slab(g, -0.31, -0.27, 0.62, 0.56, 8, 5, trim);
    slab(g, -0.32, -0.29, 0.1, 0.58, 13, 11, textile);
    return;
  }
  if (kind === 'mesa') {
    slab(g, -0.18, -0.55, 0.36, 1.1, 0, 17, 0xb89d77);
    slab(g, -0.28, -0.62, 0.56, 1.24, 17, 3, 0xeacfa4);
    slab(g, 0.08, -0.25, 0.07, 0.38, 20, 3, ink);
    slab(g, 0.12, -0.29, 0.06, 0.57, 23, 12, ink);
    slab(g, 0.18, -0.26, 0.02, 0.5, 25, 8, glass);
    rect(g, -0.19, -0.13, 0.12, 0.38, 20, 0x78908b);
    return;
  }
  const w = kind === 'cama' ? 1 : kind === 'consulta' ? 1.3 : 0.61;
  const d = kind === 'cama' ? 1.95 : kind === 'consulta' ? 0.6 : 1.18;
  for (const sign of [-1, 1]) {
    const p = iso({ x: w * 0.33, y: sign * d * 0.37 });
    g.fillStyle(ink).fillCircle(p.x, p.y - 2, 3);
  }
  slab(g, -w * 0.38, -d * 0.42, w * 0.76, d * 0.84, 3, 5, 0x9caba4);
  slab(g, -w / 2, -d / 2, w, d, 8, 6, 0xfbf5e3);
  rect(g, -w * 0.47, -d * 0.05, w * 0.94, d * 0.5, 14, textile);
  rect(g, -w * 0.47, -d * 0.04, w * 0.94, d * 0.07, 15, cream);
  slab(g, -w * 0.33, -d * 0.43, w * 0.66, d * 0.26, 14, 3, 0xfffaed);
  slab(g, -w * 0.5, d * 0.46, w, 0.06, 8, 10, trim);
}
