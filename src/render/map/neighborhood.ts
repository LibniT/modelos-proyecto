/** Barrio ficticio de Valledupar. Casas, árboles, andenes y río son decorado estático. */
import { iso, type Vec } from '../layout';
import { pts, shade } from '../draw';
import { cream, glass, ink, rect, slab, tree, type G } from '../art';
import type { CityLayout } from './layout';

function road(g: G, a: Vec, b: Vec, width: number, main: boolean): void {
  const p = iso(a),
    q = iso(b);
  for (const [thick, color] of [
    [width + 7, 0xa4af96],
    [width + 5, 0xf5e5c4],
    [width, 0x667d79],
  ]) {
    g.lineStyle(thick, color).lineBetween(p.x, p.y, q.x, q.y);
  }
  if (!main) return;
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  for (let t = 12; t < len - 12; t += 24) {
    const line = (k: number) => ({ x: p.x + ((q.x - p.x) * k) / len, y: p.y + ((q.y - p.y) * k) / len });
    const u = line(t),
      v = line(t + 9);
    g.lineStyle(2, 0xf5de9b).lineBetween(u.x, u.y, v.x, v.y);
  }
  for (const frac of [0.18, 0.82]) {
    const u = (q.x - p.x) / len,
      v = (q.y - p.y) / len;
    for (let k = -2; k <= 2; k++) {
      const x = p.x + (q.x - p.x) * frac + u * k * 3.8,
        y = p.y + (q.y - p.y) * frac + v * k * 3.8;
      g.lineStyle(2, 0xede6cb).lineBetween(x - v * width * 0.35, y + u * width * 0.35, x + v * width * 0.35, y - u * width * 0.35);
    }
  }
}

function house(g: G, x: number, y: number, i: number): void {
  const col = [0xe59b75, 0xe5c477, 0x95bfc0, 0xe0ada3, 0xa3ba8e][i % 5];
  const z = 12 + (i % 3) * 4;
  slab(g, x - 0.48, y - 0.4, 0.98, 0.84, 0, z, cream);
  slab(g, x - 0.54, y - 0.45, 1.1, 0.94, z, 3, col);
  const eave = pts(
    [
      { x: x - 0.55, y: y + 0.49 },
      { x: x + 0.56, y: y + 0.49 },
    ],
    z + 3,
  );
  const ridge = pts(
    [
      { x: x + 0.56, y },
      { x: x - 0.55, y },
    ],
    z + 11,
  );
  g.fillStyle(col).fillPoints([...eave, ...ridge], true);
  g.fillStyle(shade(col, 0.73)).fillPoints(
    [
      ...pts(
        [
          { x: x + 0.56, y: y - 0.45 },
          { x: x + 0.56, y: y + 0.49 },
        ],
        z + 3,
      ),
      ridge[0],
    ],
    true,
  );
  slab(g, x - 0.31, y + 0.44, 0.22, 0.025, 4, 5, glass);
  slab(g, x + 0.16, y + 0.44, 0.19, 0.025, 0, 10, ink);
}

export function neighborhood(g: G, L: CityLayout): void {
  const { w, h, hospital, clinics } = L;
  slab(g, 0, 0, w, h, -10, 10, 0xbad09e);
  // Dos orillas escalonadas y reflejos inmóviles en el Guatapurí.
  for (let x = 0; x < w; x += 0.25) {
    const y = h - 1.65 + 0.35 * Math.sin(x * 0.54);
    rect(g, x, y - 0.22, 0.26, 1.54, 0, 0xe5cc99);
    rect(g, x, y, 0.26, 1.12, 0, 0x70b9b3);
    rect(g, x, y + 0.18, 0.26, 0.6, 0, 0x55a7a9);
    if (Math.floor(x * 4) % 7 === 0) rect(g, x, y + 0.45, 0.6, 0.055, 1, 0xb9e6d7);
  }
  const streets: { a: Vec; b: Vec; main: boolean }[] = [];
  for (const x of [hospital.x - 2.7, hospital.x + 3.2, w - 2.05]) streets.push({ a: { x, y: 0.5 }, b: { x, y: h - 2.4 }, main: false });
  for (const y of [2.25, hospital.y - 4.4]) streets.push({ a: { x: 0.5, y }, b: { x: w - 0.5, y }, main: false });
  clinics.forEach((c) => streets.push({ a: hospital, b: c, main: true }));
  for (const { a, b, main } of streets) road(g, a, b, main ? 23 : 12, main);

  const items: { depth: number; draw: () => void }[] = [];
  const parkX = hospital.x + 7.9,
    parkY = hospital.y - 3.6;
  rect(g, parkX, parkY, 3, 2.15, 0, 0xacc68e);
  rect(g, parkX, parkY + 0.85, 3, 0.36, 0, 0xe6d0a6);
  rect(g, parkX + 1.34, parkY, 0.32, 2.15, 0, 0xe6d0a6);
  for (const [dx, dy] of [
    [0.35, 0.45],
    [2.55, 0.4],
    [0.42, 1.7],
    [2.56, 1.78],
  ]) {
    const x = parkX + dx,
      y = parkY + dy;
    items.push({ depth: x + y, draw: () => tree(g, x, y, 1) });
  }
  for (const dx of [0.76, 2.0]) {
    const x = parkX + dx,
      y = parkY + 1.35;
    items.push({
      depth: x + y,
      draw: () => {
        slab(g, x, y, 0.5, 0.18, 0, 3, ink);
        slab(g, x - 0.02, y - 0.02, 0.54, 0.22, 3, 2, 0xc49b6d);
      },
    });
  }
  const nearby = (x: number, y: number) => {
    const p = iso({ x, y });
    return streets.some(({ a, b, main }) => {
      const u = iso(a),
        v = iso(b),
        dx = v.x - u.x,
        dy = v.y - u.y;
      const t = Math.min(1, Math.max(0, ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy) < (main ? 30 : 24);
    });
  };
  let i = 0;
  for (let x = 1; x < w - 0.9; x += 1.42)
    for (let y = 1; y < h - 2.45; y += 1.47) {
      i++;
      if (x > parkX - 0.5 && x < parkX + 3.5 && y > parkY - 0.5 && y < parkY + 2.65) continue;
      if ([hospital, ...clinics].some((c) => Math.abs(c.x - x) < 2.1 && Math.abs(c.y - y) < 2.15) || nearby(x, y)) continue;
      const index = i,
        park = x > hospital.x + 4 && y > hospital.y - 4;
      if (park && i % 3 === 0) continue;
      const draw = park || i % 4 === 0 ? () => tree(g, x, y, 0.6 + (index % 4) * 0.08) : () => house(g, x, y, index);
      items.push({ depth: x + y, draw });
    }
  items.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw());
}

/** Cuatro siluetas: urgencias con helipuerto, clínica de ladrillo, torre y pabellón ajardinado. */
export function facility(g: G, j: number): void {
  const hospital = j < 0;
  const w = hospital ? 3.15 : j === 1 ? 1.64 : 2.42,
    d = hospital ? 2.32 : j === 2 ? 1.95 : 1.55;
  const h = hospital ? 57 : [37, 66, 43][j % 3];
  const color = hospital ? 0xe4e9d8 : [0xf3be9d, 0xf6dfa9, 0xe7eacb][j % 3];
  const trim = hospital ? 0x48787b : [0xaf624e, 0x4c7c88, 0x5a826a][j % 3];
  const x = -w / 2,
    y = -d / 2;
  g.fillStyle(ink, 0.15).fillEllipse(10, 7, (w + d) * 28, (w + d) * 11);
  slab(g, x - 0.2, y - 0.19, w + 0.4, d + 0.38, 0, 4, 0xebddbc);
  slab(g, x, y, w, d, 4, h, color);
  // Solo las dos caras de la cornisa: una tapa de ancho completo ocultaría los ventanales.
  for (let z = 14; z < h; z += 17) {
    slab(g, x, y + d, w, 0.055, z - 3, 2, trim);
    slab(g, x + w, y, 0.055, d, z - 3, 2, trim);
    for (let i = 0; i < Math.floor(w / 0.45); i++) {
      const u = x + 0.1 + i * 0.46;
      slab(g, u, y + d, 0.34, 0.025, z, 10, 0x46717c);
      slab(g, u + 0.022, y + d + 0.025, 0.2, 0.018, z + 2, 7, 0x9bc8c9);
    }
    for (let i = 0; i < Math.floor(d / 0.48); i++) slab(g, x + w, y + 0.09 + i * 0.49, 0.025, 0.34, z, 9, glass);
  }
  slab(g, x - 0.09, y - 0.09, w + 0.18, d + 0.18, h + 4, 4, cream);
  rect(g, x + 0.1, y + 0.1, w - 0.2, d - 0.2, h + 8, trim);
  slab(g, x + 0.35, y + d, 0.64, 0.04, 4, 16, ink);
  slab(g, x + 0.19, y + d - 0.02, 1.05, 0.42, 20, 4, hospital ? 0xdb785c : trim);
  if (hospital) {
    const roof = iso({ x: -0.25, y: 0.05 });
    g.fillStyle(0xc4d5b6).fillEllipse(roof.x, roof.y - h - 8, 55, 25);
    g.lineStyle(2, cream).strokeEllipse(roof.x, roof.y - h - 8, 49, 20);
    rect(g, -0.58, -0.18, 0.14, 0.56, h + 9, cream);
    rect(g, -0.16, -0.18, 0.14, 0.56, h + 9, cream);
    rect(g, -0.44, 0.04, 0.28, 0.14, h + 9, cream);
    slab(g, -1.28, -0.85, 0.53, 0.45, h + 8, 7, 0xc2cfc5);
    const p = iso({ x: 0.99, y: d / 2 });
    g.fillStyle(0xb44f3c)
      .fillRect(p.x - 7, p.y - 46, 14, 5)
      .fillRect(p.x - 2.5, p.y - 51, 5, 15);
    rect(g, x + w + 0.25, y, 0.65, 1.3, 1, 0x677e7a);
    for (let i = 0; i < 3; i++) rect(g, x + w + 0.26, y + 0.15 + i * 0.42, 0.58, 0.05, 2, cream);
  } else if (j === 0) {
    for (let i = 0; i < 4; i++) slab(g, x + 0.28 + i * 0.48, y + 0.21, 0.38, 0.55, h + 8, 3, 0x6493a1);
  } else if (j === 1) {
    slab(g, -0.52, -0.45, 1.04, 0.85, h + 8, 12, color);
    slab(g, -0.56, -0.49, 1.12, 0.93, h + 20, 3, trim);
  } else {
    slab(g, x + 0.18, y + 0.2, 0.84, 0.86, h + 8, 15, color);
    slab(g, x + 0.1, y + 0.12, 1.0, 1.02, h + 23, 3, trim);
    for (let i = 0; i < 3; i++) {
      const p = iso({ x: x + 1.22 + i * 0.32, y: y + 0.54 });
      g.fillStyle(0x72a47b).fillEllipse(p.x, p.y - h - 13, 16, 10);
    }
  }
}
