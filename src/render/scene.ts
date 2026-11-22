/**
 * T05 — Escena isométrica dibujada por código (Phaser Graphics, sin imágenes).
 * Dibuja lo que dice el `Playback`; el `Driver` (drivers.ts) decide de dónde salen los eventos.
 */
import Phaser from 'phaser';
import { AREAS, GRID, MAX, ROAD, iso, slotPos, stationPos, type Vec } from './layout';
import type { Playback } from './playback';
import type { Driver } from './drivers';
import { hitTest, type Hit } from './hit';

/** Lo que hay bajo el puntero y dónde está el puntero (px del lienzo); undefined = nada o fuera. */
export type HoverFn = (hit: Hit | undefined, x: number, y: number) => void;

export const TRIAGE_COLOR = [0x9ca3af, 0xdc2626, 0xf97316, 0xeab308, 0x16a34a, 0x2563eb];
const SNAP_SPEED = 120;

const shade = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
const pts = (ps: Vec[], lift = 0) => ps.map((p) => {
  const q = iso(p);
  return new Phaser.Math.Vector2(q.x, q.y - lift);
});

/** Caja isométrica sobre el rectángulo [x0, x1] × [y0, y1] con altura h px. */
function box(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, h: number, color: number): void {
  g.fillStyle(shade(color, 0.78)).fillPoints(pts([{ x: x0, y: y1 }, { x: x1, y: y1 }]).concat(pts([{ x: x1, y: y1 }, { x: x0, y: y1 }], h)), true);
  g.fillStyle(shade(color, 0.62)).fillPoints(pts([{ x: x1, y: y0 }, { x: x1, y: y1 }]).concat(pts([{ x: x1, y: y1 }, { x: x1, y: y0 }], h)), true);
  g.fillStyle(color).fillPoints(pts([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], h), true);
}
const boxAt = (g: Phaser.GameObjects.Graphics, c: Vec, w: number, d: number, h: number, color: number) => box(g, c.x - w / 2, c.y - d / 2, c.x + w / 2, c.y + d / 2, h, color);

/** Personal fijo en un puesto activo (no se mueve: es el recurso). */
function staff(g: Phaser.GameObjects.Graphics, p: Vec): void {
  const q = iso(p);
  g.fillStyle(0x000000, 0.2).fillEllipse(q.x, q.y, 14, 7);
  g.fillStyle(0xffffff).fillCircle(q.x, q.y - 10, 6).lineStyle(1.5, 0x0f766e).strokeCircle(q.x, q.y - 10, 6);
}

export class HospitalScene extends Phaser.Scene {
  private floor!: Phaser.GameObjects.Graphics;
  private people!: Phaser.GameObjects.Graphics;
  private staticKey = '';
  private pointerOver = false;

  constructor(
    private readonly driver: Driver,
    private readonly onHover?: HoverFn,
  ) {
    super('hospital');
  }

  create(): void {
    this.floor = this.add.graphics().setDepth(0);
    this.people = this.add.graphics().setDepth(1);
    for (const a of AREAS) {
      if (!a.label) continue;
      const q = iso(a.label);
      this.add
        .text(q.x, q.y, a.name, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#111827', fontStyle: 'bold', backgroundColor: 'rgba(255,255,255,0.75)', padding: { x: 6, y: 2 } })
        .setOrigin(0.5)
        .setDepth(2);
    }
    const rq = iso({ x: ROAD.x0 - 0.6, y: (ROAD.y0 + ROAD.y1) / 2 }); // al final de la vía, fuera de los carriles
    this.add.text(rq.x, rq.y, 'Hacia las clínicas', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#f8fafc' }).setOrigin(0.5).setDepth(2);
    const cam = this.cameras.main;
    const fit = () => {
      // Edificio + vía de las clínicas (que sube por la izquierda).
      const c = iso({ x: GRID.w / 2, y: GRID.h / 2 });
      cam.setZoom(Math.min(this.scale.width / 1400, this.scale.height / 840));
      cam.centerOn(c.x, c.y - 50);
    };
    fit();
    this.scale.on('resize', fit);
    // Cámara: arrastrar para mover, rueda para acercar.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('gameover', () => (this.pointerOver = true));
    this.input.on('gameout', () => {
      this.pointerOver = false;
      this.onHover?.(undefined, 0, 0);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.3, 2.5)));
  }

  update(_time: number, delta: number): void {
    this.driver.tick(delta / 1000);
    const pb = this.driver.pb;
    const key = JSON.stringify(pb.capacity) + [...pb.ambulancesAway].join();
    if (key !== this.staticKey) {
      this.staticKey = key;
      this.drawStatic(pb);
    }
    this.drawPeople(pb);
    if (this.onHover && this.pointerOver) {
      // Cada cuadro: el paciente bajo el puntero puede moverse aunque el puntero esté quieto.
      const p = this.input.activePointer;
      p.updateWorldPoint(this.cameras.main);
      const hit = p.isDown ? undefined : hitTest(pb, { x: p.worldX, y: p.worldY }, this.driver.speed > SNAP_SPEED);
      this.onHover(hit, p.x, p.y);
    }
  }

  private drawStatic(pb: Playback): void {
    const g = this.floor.clear();
    const cap = pb.capacity;
    // Vía a las clínicas (T12), con un carril por ambulancia.
    g.fillStyle(0x374151).fillPoints(pts([{ x: ROAD.x0, y: ROAD.y0 }, { x: ROAD.x1, y: ROAD.y0 }, { x: ROAD.x1, y: ROAD.y1 }, { x: ROAD.x0, y: ROAD.y1 }]), true);
    g.lineStyle(2, 0xfacc15, 0.8);
    for (let i = 0; i < MAX.amb - 1; i++) {
      const y = (stationPos(`amb-${i}`)!.y + stationPos(`amb-${i + 1}`)!.y) / 2;
      for (let x = ROAD.x0; x < ROAD.x1; x += 1) g.strokePoints(pts([{ x, y }, { x: x + 0.5, y }]));
    }
    for (const a of AREAS) {
      g.fillStyle(a.color).fillPoints(pts([{ x: a.x0, y: a.y0 }, { x: a.x1, y: a.y0 }, { x: a.x1, y: a.y1 }, { x: a.x0, y: a.y1 }]), true);
      g.lineStyle(1, 0x000000, 0.08);
      for (let x = a.x0; x <= a.x1; x++) g.strokePoints(pts([{ x, y: a.y0 }, { x, y: a.y1 }]));
      for (let y = a.y0; y <= a.y1; y++) g.strokePoints(pts([{ x: a.x0, y }, { x: a.x1, y }]));
    }
    // Muro del fondo (bordes y = 0 y x = 0).
    g.fillStyle(0xcbd5e1).fillPoints(pts([{ x: 3, y: 0 }, { x: GRID.w, y: 0 }]).concat(pts([{ x: GRID.w, y: 0 }, { x: 3, y: 0 }], 40)), true);
    g.fillStyle(0xb6c2d1).fillPoints(pts([{ x: 0, y: 9 }, { x: 0, y: GRID.h }]).concat(pts([{ x: 0, y: GRID.h }, { x: 0, y: 9 }], 40)), true);

    const off = 0x9ca3af; // puesto dibujado pero sin personal (capacidad menor)
    for (let i = 0; i < MAX.triage; i++) {
      const s = stationPos(`triage-${i}`)!;
      boxAt(g, { x: s.x + 0.7, y: s.y }, 0.5, 1.2, 14, i < cap.triage ? 0xf87171 : off);
      if (i < cap.triage) staff(g, { x: s.x + 1.2, y: s.y });
    }
    for (let i = 0; i < MAX.admission; i++) {
      const s = stationPos(`admission-${i}`)!;
      boxAt(g, { x: s.x + 0.7, y: s.y }, 0.4, 1.4, 18, i < cap.admission ? 0xfbbf24 : off);
      if (i < cap.admission) staff(g, { x: s.x + 1.2, y: s.y });
    }
    for (let i = 0; i < MAX.doctor; i++) {
      const s = stationPos(`doctor-${i}`)!;
      box(g, s.x + 0.9, 0.2, s.x + 1, 4.3, 30, 0x93c5fd); // tabique entre consultorios
      boxAt(g, { x: s.x, y: s.y - 1.3 }, 1.3, 0.6, 10, i < cap.doctors ? 0xffffff : off); // camilla de examen
      boxAt(g, { x: s.x - 0.3, y: s.y + 0.9 }, 0.8, 0.5, 14, i < cap.doctors ? 0x60a5fa : off); // escritorio
      if (i < cap.doctors) staff(g, { x: s.x - 0.3, y: s.y + 1.5 });
    }
    for (let i = 0; i < 20; i++) boxAt(g, slotPos('waiting_room', i), 0.6, 0.6, 8, 0x34d399);
    for (let i = 0; i < 12; i++) boxAt(g, slotPos('hallway', i), 0.6, 1.2, 8, 0xc4b5fd);
    for (let i = 0; i < MAX.bed; i++) boxAt(g, stationPos(`bed-${i}`)!, 1, 2, 10, i < cap.obsBeds ? 0xffffff : off);
    for (let i = 0; i < MAX.amb; i++) {
      if (i >= cap.ambulances || pb.ambulancesAway.has(`amb-${i}`)) continue;
      const s = stationPos(`amb-${i}`)!;
      boxAt(g, s, 2.2, 1.2, 26, 0xf8fafc);
      boxAt(g, { x: s.x - 0.6, y: s.y }, 0.4, 1.21, 27, 0xdc2626);
    }
  }

  private drawPeople(pb: Playback): void {
    const g = this.people.clear();
    // T12: ambulancias en traslado (posición ∝ tiempo de viaje del motor). Sobre ×120 saltan al destino: fuera de la escena.
    if (this.driver.speed <= SNAP_SPEED)
      for (const id of pb.transfers.keys()) {
        const p = pb.ambulancePosition(id, pb.t)!;
        boxAt(g, p, 2.2, 1.2, 26, 0xf8fafc);
        boxAt(g, { x: p.x - 0.6, y: p.y }, 0.4, 1.21, 27, 0xdc2626);
      }
    const snap = this.driver.speed > SNAP_SPEED;
    const list = [...pb.figures.values()]
      .filter((f) => !f.hidden)
      .map((f) => ({ f, p: pb.position(f, pb.t, snap) }))
      .sort((a, b) => a.p.x + a.p.y - (b.p.x + b.p.y));
    for (const { f, p } of list) {
      const q = iso(p);
      const walking = f.walk !== undefined && pb.t < f.walk.t0 + f.walk.dur;
      const lying = f.resourceId?.startsWith('bed-') || (f.zone === 'hallway' && !walking);
      const color = TRIAGE_COLOR[f.triage ?? 0];
      if (lying) {
        g.fillStyle(color).fillEllipse(q.x, q.y - 12, 22, 10).lineStyle(1.5, 0x1f2937).strokeEllipse(q.x, q.y - 12, 22, 10);
      } else {
        g.fillStyle(0x000000, 0.25).fillEllipse(q.x, q.y, 14, 7);
        g.fillStyle(color).fillCircle(q.x, q.y - 10, 7).lineStyle(1.5, 0x1f2937).strokeCircle(q.x, q.y - 10, 7);
      }
    }
  }
}

/** Crea el juego de Phaser dentro de `parent` (debe tener alto definido). */
export function mountScene(parent: HTMLElement, driver: Driver, onHover?: HoverFn): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0f1720',
    scale: { mode: Phaser.Scale.RESIZE },
    scene: new HospitalScene(driver, onHover),
    banner: false,
  });
}
