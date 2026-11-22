/** Utilidades de dibujo isométrico con Phaser Graphics (escena del hospital y mapa de la ciudad). */
import Phaser from 'phaser';
import { iso, type Vec } from './layout';

export const shade = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
export const pts = (ps: Vec[], lift = 0) => ps.map((p) => {
  const q = iso(p);
  return new Phaser.Math.Vector2(q.x, q.y - lift);
});

/** Caja isométrica sobre el rectángulo [x0, x1] × [y0, y1] con altura h px. */
export function box(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, h: number, color: number): void {
  g.fillStyle(shade(color, 0.78)).fillPoints(pts([{ x: x0, y: y1 }, { x: x1, y: y1 }]).concat(pts([{ x: x1, y: y1 }, { x: x0, y: y1 }], h)), true);
  g.fillStyle(shade(color, 0.62)).fillPoints(pts([{ x: x1, y: y0 }, { x: x1, y: y1 }]).concat(pts([{ x: x1, y: y1 }, { x: x1, y: y0 }], h)), true);
  g.fillStyle(color).fillPoints(pts([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], h), true);
}
export const boxAt = (g: Phaser.GameObjects.Graphics, c: Vec, w: number, d: number, h: number, color: number) => box(g, c.x - w / 2, c.y - d / 2, c.x + w / 2, c.y + d / 2, h, color);
