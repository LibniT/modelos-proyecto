/**
 * T24 — Dibujo por código de las plantas de `plans.ts` (mismo lenguaje que el hospital: proyección, paleta,
 * mobiliario de interior.ts y personajes de pixels.ts) y de los acompañantes del modelo social.
 * Todo lo que se mueve sale de `Social` (reloj simulado); el mobiliario es estático.
 */
import Phaser from 'phaser';
import { along, iso, type Vec } from '../layout';
import { pts, shade } from '../draw';
import { cream, glass, ink, rect, slab, stamp, tree, type G } from '../art';
import { furniture } from '../interior';
import { H, STAFF, appearanceFor, characterPixels, paint, type Pose, type View } from '../characters/pixels';
import type { AppearanceSpec } from '../../engine/events';
import type { MachineKind, Prop, SitePlan } from './plans';
import { MACHINE_NAME, MIN_PER_TILE, PRODUCTS, type Social } from './social';

export const PERSON = 1.9;
const FONT = 'Segoe UI, system-ui, sans-serif';
const WALL = 0xd5e1d6;
const FLOOR: Record<string, number> = { baldosa: 0xe8e4d4, madera: 0xdcc09a, pasto: 0x9fc48c, sala: 0xdce9e5, pasillo: 0xd9dcd2 };
const GUIDE: Record<string, number> = { baldosa: 0x99aba3, madera: 0xb78d5d, pasto: 0x6a947c, sala: 0x639a9b, pasillo: 0x96919a };
const CAFE_STAFF: AppearanceSpec = { skin: 3, hairStyle: 4, hairColor: '#1f1a17', topStyle: 0, topColor: '#b8483a', bottomColor: '#374151' };

/** Textura del personaje (una sola vez por combinación). */
export function charTexture(scene: Phaser.Scene, app: AppearanceSpec, view: View, pose: Pose, frame: number): string {
  const key = `ch:${JSON.stringify(app)}:${view}:${pose}:${frame}`;
  if (!scene.textures.exists(key)) {
    const t = scene.textures.createCanvas(key, 24, 32)!;
    paint(t.getContext(), characterPixels(app, view, pose, frame));
    t.refresh();
    t.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  return key;
}

/** Piso de la planta: zócalo, recintos con su baldosa, muros del fondo con ventanas y puertas. */
export function clinicFloor(g: G, plan: SitePlan): void {
  const { w, h } = plan;
  slab(g, 0, 0, w, h, -13, 13, 0xa3b6ac);
  roomFloors(g, plan);
  backWalls(g, plan);
}

/** Cafetería del hospital: piso propio sobre un zócalo que continúa el del edificio. */
export function hospitalCafeFloor(g: G, plan: SitePlan): void {
  for (const r of plan.rooms) slab(g, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, -13, 13, 0xa3b6ac);
  roomFloors(g, plan);
}

function roomFloors(g: G, plan: SitePlan): void {
  for (const r of plan.rooms) {
    rect(g, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 0, FLOOR[r.floor]);
    g.lineStyle(1, ink, r.floor === 'pasto' ? 0.05 : 0.12);
    const step = r.floor === 'madera' ? 0.5 : 1;
    for (let y = r.y0; y <= r.y1 + 1e-6; y += step) g.strokePoints(pts([{ x: r.x0, y }, { x: r.x1, y }]));
    if (r.floor !== 'madera') for (let x = r.x0; x <= r.x1 + 1e-6; x += 1) g.strokePoints(pts([{ x, y: r.y0 }, { x, y: r.y1 }]));
    if (r.floor === 'pasto') {
      // sendero de lajas por el centro del patio
      for (let x = r.x0 + 0.4; x < r.x1 - 0.4; x += 0.8) rect(g, x, (r.y0 + r.y1) / 2 - 0.28, 0.6, 0.56, 1, 0xd8d2bd);
      for (let x = r.x0 + 0.7; x < r.x1; x += 2.3) g.fillStyle(0x7fae73).fillPoints(pts([{ x, y: r.y0 + 0.4 }, { x: x + 0.5, y: r.y0 + 0.4 }, { x: x + 0.5, y: r.y0 + 0.7 }, { x, y: r.y0 + 0.7 }], 1), true);
    } else {
      rect(g, r.x0 + 0.12, r.y0 + 0.12, r.x1 - r.x0 - 0.24, 0.08, 1, GUIDE[r.floor]);
      rect(g, r.x0 + 0.12, r.y0 + 0.12, 0.08, r.y1 - r.y0 - 0.24, 1, GUIDE[r.floor]);
    }
  }
  for (const d of plan.site < 0 ? plan.doors : [...plan.doors, ...plan.backDoors]) rect(g, Math.min(d.a.x, d.b.x) - 0.1, Math.min(d.a.y, d.b.y) - 0.1, Math.abs(d.b.x - d.a.x) + 0.2, Math.abs(d.b.y - d.a.y) + 0.2, 1, 0xb2aaa0);
}

function backWalls(g: G, plan: SitePlan): void {
  const { w, h } = plan;
  // Muros del fondo (y = 0 a lo largo de x; x = 0 a lo largo de y), con huecos de puerta.
  const along = (axis: 'x' | 'y', len: number) => {
    const gaps = plan.backDoors.filter((d) => (axis === 'y' ? d.a.x === 0 : d.a.y === 0)).map((d) => (axis === 'y' ? [d.a.y, d.b.y] : [d.a.x, d.b.x]));
    let from = 0;
    const piece = (a: number, b: number) => {
      if (b - a <= 0) return;
      if (axis === 'x') {
        slab(g, a, -0.16, b - a, 0.23, 0, 51, WALL);
        slab(g, a, -0.18, b - a, 0.27, 49, 4, cream);
      } else {
        slab(g, -0.16, a, 0.23, b - a, 0, 51, 0xc1d4c9);
        slab(g, -0.18, a, 0.27, b - a, 49, 4, cream);
      }
    };
    for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) {
      piece(from, g0);
      from = g1;
      for (const e of [g0, g1]) (axis === 'y' ? slab(g, -0.12, e - 0.06, 0.2, 0.12, 0, 48, ink) : slab(g, e - 0.06, -0.12, 0.12, 0.2, 0, 48, ink));
      axis === 'y' ? slab(g, -0.12, g0, 0.22, g1 - g0, 45, 4, 0x54827d) : slab(g, g0, -0.12, g1 - g0, 0.22, 45, 4, 0x54827d);
    }
    piece(from, len);
  };
  along('x', w);
  along('y', h);
  for (const win of plan.windows) {
    if (win.a.y === 0 && win.b.y === 0) {
      const big = plan.site === 0; // ventanales de Río Claro: del zócalo casi al techo
      for (let x = win.a.x; x < win.b.x - 0.3; x += 1.6) {
        const len = Math.min(1.4, win.b.x - x);
        slab(g, x, 0.07, len, 0.035, big ? 8 : 20, big ? 37 : 22, 0x5d8890);
        slab(g, x + 0.06, 0.11, len - 0.12, 0.015, big ? 10 : 22, big ? 33 : 18, x % 3.2 < 1.6 ? 0xa6d4d2 : 0xc7e4da);
        slab(g, x - 0.04, 0.07, len + 0.08, 0.1, big ? 7 : 19, 3, cream);
      }
    } else {
      slab(g, 0.07, win.a.y, 0.04, win.b.y - win.a.y, 18, 22, glass);
      slab(g, 0.07, win.a.y - 0.04, 0.1, win.b.y - win.a.y + 0.08, 16, 3, cream);
    }
  }
  // Tapete de la entrada principal.
  const door = plan.nodes[plan.entry];
  rect(g, door.x - 0.7, door.y - 0.5, 1.4, 1.0, 1, 0x8c9f98);
}

/** Pared interior baja (deja ver a las personas por encima), en tramos cortos para ordenarlos en profundidad. */
function wallPiece(g: G, axis: 'x' | 'y', len: number): void {
  if (axis === 'x') {
    slab(g, -len / 2, -0.06, len, 0.12, 0, 30, 0xc9d7cc);
    slab(g, -len / 2, -0.07, len, 0.14, 30, 3, cream);
  } else {
    slab(g, -0.06, -len / 2, 0.12, len, 0, 30, 0xb9cdc2);
    slab(g, -0.07, -len / 2, 0.14, len, 30, 3, cream);
  }
}

function prop(g: G, p: Prop): void {
  const L = p.len ?? 1;
  const sx = p.along === 'y' ? 0.6 : L,
    sy = p.along === 'y' ? L : 0.6;
  g.fillStyle(ink, 0.1).fillEllipse(4, 2, 30 + L * 26, 16 + L * 6);
  switch (p.kind) {
    case 'mostrador':
      slab(g, -sx / 2, -sy / 2, sx, sy, 0, 20, 0xa8774d);
      slab(g, -sx / 2 - 0.04, -sy / 2 - 0.04, sx + 0.08, sy + 0.08, 20, 3, 0xf3e3c3);
      slab(g, -0.18, -sy / 2 + 0.2, 0.36, 0.5, 23, 9, 0xd9eef0); // vitrina de pan
      slab(g, -0.16, -sy / 2 + 0.25, 0.32, 0.4, 23, 3, 0xe0a060);
      slab(g, -0.12, sy / 2 - 0.5, 0.24, 0.24, 23, 6, ink); // caja registradora
      for (let k = 0; k < 3; k++) rect(g, -0.1 + k * 0.08, -0.1, 0.06, 0.06, 23.5, 0xf8f4e6); // tazas
      return;
    case 'recepcion':
    case 'enfermeria': {
      const col = p.kind === 'recepcion' ? 0x6b9a8f : 0x4f86a8;
      slab(g, -sx / 2, -sy / 2, sx, sy, 0, 19, col);
      slab(g, -sx / 2 - 0.05, -sy / 2 - 0.05, sx + 0.1, sy + 0.1, 19, 3, 0xeacfa4);
      slab(g, -0.25, -0.12, 0.08, 0.3, 22, 12, ink); // monitor
      slab(g, -0.21, -0.1, 0.02, 0.26, 24, 8, glass);
      if (p.kind === 'enfermeria') {
        // cruz en el frente del mostrador
        const c = iso({ x: 0, y: sy / 2 });
        g.fillStyle(0xfff7e4).fillRect(c.x - 8, c.y - 13, 16, 5).fillRect(c.x - 2.5, c.y - 18, 5, 15);
        slab(g, 0.25, -0.15, 0.3, 0.25, 22, 4, 0xfaf3df); // carpetas
      }
      return;
    }
    case 'mesa-cafe':
      slab(g, -0.08, -0.08, 0.16, 0.16, 0, 14, 0x7a6a5b);
      slab(g, -0.36, -0.36, 0.72, 0.72, 14, 3, 0xe8d2ad);
      slab(g, -0.07, -0.07, 0.12, 0.12, 17, 4, 0xfffaf0);
      return;
    case 'arbol':
      tree(g, 0, 0, 1.05);
      return;
    case 'planta':
      furniture(g, 'planta', true);
      return;
    case 'cortina':
      return;
  }
}

/** Silla con el respaldo del lado contrario a donde mira quien se sienta. */
function chair(g: G, face: string): void {
  g.fillStyle(ink, 0.12).fillEllipse(3, 2, 32, 14);
  slab(g, -0.19, -0.15, 0.38, 0.31, 0, 8, 0x849b95);
  slab(g, -0.31, -0.28, 0.62, 0.56, 8, 5, 0x568981);
  const back = { SE: [-0.32, -0.29, 0.1, 0.58], NW: [0.22, -0.29, 0.1, 0.58], SW: [-0.31, -0.32, 0.62, 0.1], NE: [-0.31, 0.22, 0.62, 0.1] }[face]!;
  slab(g, back[0], back[1], back[2], back[3], 13, 11, 0x87bab8);
}

/** Banca del patio con respaldo del lado contrario a donde mira quien se sienta. */
function bench(g: G, face: 'SW' | 'NE'): void {
  g.fillStyle(ink, 0.1).fillEllipse(3, 2, 56, 18);
  for (const x of [-0.5, 0.45]) slab(g, x, -0.15, 0.06, 0.3, 0, 8, 0x5c5248);
  slab(g, -0.6, -0.22, 1.2, 0.44, 8, 3, 0xb98a5a);
  const by = face === 'SW' ? -0.24 : 0.18;
  slab(g, -0.6, by, 1.2, 0.06, 11, 10, 0xa77a4d);
}

/** Máquina expendedora: cuerpo, vitrina con productos, teclado y bandeja en la cara que mira a +y. */
export function machineArt(g: G, kind: MachineKind): void {
  const x0 = -0.4,
    x1 = 0.4,
    y0 = -0.27,
    y1 = 0.27;
  const body = kind === 'refrescos' ? 0xc4443b : 0x2f6f99;
  g.fillStyle(ink, 0.16).fillEllipse(4, 3, 64, 22);
  slab(g, x0, y0, x1 - x0, y1 - y0, 0, 62, body);
  slab(g, x0 - 0.02, y0 - 0.02, x1 - x0 + 0.04, y1 - y0 + 0.04, 62, 3, shade(body, 0.7));
  const F = (u: number, z: number) => {
    const q = iso({ x: x0 + u * (x1 - x0), y: y1 + 0.005 });
    return new Phaser.Math.Vector2(q.x, q.y - z);
  };
  const quad = (u0: number, u1: number, z0: number, z1: number, col: number, a = 1) => g.fillStyle(col, a).fillPoints([F(u0, z0), F(u1, z0), F(u1, z1), F(u0, z1)], true);
  quad(0.06, 0.66, 12, 57, 0x1e3a40); // marco de la vitrina
  quad(0.09, 0.63, 14, 55, kind === 'refrescos' ? 0xbfe6ea : 0xd8e9ef);
  const items = PRODUCTS[kind];
  for (let row = 0; row < 3; row++) {
    const z = 18 + row * 13;
    quad(0.09, 0.63, z - 1.5, z - 0.5, 0x8aa7ad); // repisa
    for (let k = 0; k < 4; k++) {
      const u = 0.12 + k * 0.125;
      const col = Phaser.Display.Color.HexStringToColor(items[(row + k) % 3].color).color;
      if (kind === 'refrescos') {
        quad(u, u + 0.06, z, z + 9, col);
        quad(u + 0.015, u + 0.045, z + 9, z + 11, 0xf2f2f2);
      } else {
        quad(u - 0.01, u + 0.1, z, z + 9, col);
        quad(u + 0.01, u + 0.08, z + 3, z + 6, 0xfff6d8, 0.8);
      }
    }
  }
  quad(0.7, 0.94, 49, 56, 0x173235); // pantalla
  quad(0.72, 0.92, 51, 54, 0x7ee0a1);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) quad(0.72 + c * 0.07, 0.77 + c * 0.07, 30 + r * 6, 34 + r * 6, 0xf6ecd6); // teclado
  quad(0.74, 0.9, 20, 24, 0x2b2b2b); // ranura
  quad(0.12, 0.6, 3, 10, 0x15262a); // bandeja de salida
  quad(0.14, 0.58, 4, 6, 0x3b5a60);
  quad(0.0, 1.0, 58, 62, kind === 'refrescos' ? 0xf4d7b5 : 0xf6c453); // franja superior
}

const hull = (ps: Vec[]): Vec[] => {
  const s = [...ps].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Vec[]) => {
    const out: Vec[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(s), ...half(s.reverse())];
};

interface MachineView {
  kind: MachineKind;
  area: Phaser.Geom.Polygon;
  outline: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

/** Objetos estáticos de una planta (paredes interiores, puertas, muebles, máquinas, personal) y sus acompañantes. */
export class PlanView {
  readonly machines: MachineView[] = [];
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly mineLabel: Phaser.GameObjects.Text;
  private hovered?: MachineView;
  private readonly lastDir = new Map<string, 'SE' | 'SW' | 'NE' | 'NW'>();

  constructor(
    private readonly scene: Phaser.Scene,
    readonly plan: SitePlan,
    private readonly made: Phaser.GameObjects.GameObject[] = [],
  ) {
    const s = scene;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (made.push(o), o);
    const at = (p: Vec, key: string, oy: number, h: number, dz = 0) => {
      const q = iso(p);
      return keep(s.add.image(q.x, q.y, key).setOrigin(0.5, oy / h).setDepth(1000 + q.y + dz));
    };
    for (const wall of plan.walls) {
      const axis = wall.a.y === wall.b.y ? 'x' : 'y';
      const L = axis === 'x' ? wall.b.x - wall.a.x : wall.b.y - wall.a.y;
      const n = Math.max(1, Math.ceil(L / 0.5));
      for (let k = 0; k < n; k++) {
        const len = L / n;
        const key = stamp(s, `muro-${axis}-${len.toFixed(2)}`, 96, 96, 48, 60, (g) => wallPiece(g, axis, len));
        const c = axis === 'x' ? { x: wall.a.x + (k + 0.5) * len, y: wall.a.y } : { x: wall.a.x, y: wall.a.y + (k + 0.5) * len };
        at(c, key, 60, 96, -0.5);
      }
    }
    for (const d of plan.doors) {
      const key = stamp(s, 'jamba', 32, 64, 16, 52, (g) => slab(g, -0.07, -0.07, 0.14, 0.14, 0, 38, 0x54827d));
      at(d.a, key, 52, 64);
      at(d.b, key, 52, 64);
    }
    for (const p of plan.props) {
      const key = stamp(s, `prop-${p.kind}-${p.along ?? ''}-${p.len ?? ''}`, 192, 150, 96, 104, (g) => prop(g, p));
      at(p.p, key, 104, 150);
    }
    for (const seat of plan.seats) {
      if (seat.kind === 'banca') at(seat.p, stamp(s, `banca-${seat.face}`, 96, 64, 48, 40, (g) => bench(g, seat.face === 'SW' ? 'SW' : 'NE')), 40, 64, -1);
      else at(seat.p, stamp(s, 'silla-' + seat.face, 96, 80, 48, 56, (g) => chair(g, seat.face)), 56, 80, -1);
    }
        plan.staff.forEach((p) => {
      const room = plan.rooms.find((r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1)?.name ?? '';
      const look = room === 'Cafetería' ? CAFE_STAFF : room === 'Enfermería' ? STAFF.triage : STAFF.admission;
      const q = iso(p);
      keep(
        s.add
          .image(q.x, q.y, charTexture(s, look, 'SE', 'idle', 0))
          .setOrigin(0.5, 1)
          .setScale(PERSON)
          .setDepth(1000 + q.y),
      );
    });
    for (const m of plan.machines) {
      const key = stamp(s, `maquina-${m.kind}`, 96, 128, 44, 100, (g) => machineArt(g, m.kind));
      at(m.p, key, 100, 128);
      const corners: Vec[] = [];
      for (const [dx, dy] of [
        [-0.4, -0.27],
        [0.4, -0.27],
        [0.4, 0.27],
        [-0.4, 0.27],
      ])
        for (const z of [0, 65]) {
          const q = iso({ x: m.p.x + dx, y: m.p.y + dy });
          corners.push({ x: q.x, y: q.y - z });
        }
      const shape = hull(corners);
      const outline = keep(s.add.graphics().setDepth(2750).setVisible(false));
      outline.lineStyle(4, 0xf9c457).strokePoints(shape.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true, true);
      const top = iso(m.p);
      const label = keep(
        s.add
          .text(top.x, top.y - 78, m.kind === 'refrescos' ? 'Refrescos A1–A3' : 'Papas B1–B3', {
            fontFamily: FONT,
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#fff7e4',
            backgroundColor: m.kind === 'refrescos' ? '#9b3a32' : '#285f82',
            padding: { x: 4, y: 1 },
          })
          .setOrigin(0.5)
          .setDepth(2700),
      );
      this.machines.push({ kind: m.kind, area: new Phaser.Geom.Polygon(shape.flatMap((p) => [p.x, p.y])), outline, label });
    }
    for (const r of plan.rooms) {
      if (!r.sign) continue;
      const q = iso(r.sign);
      keep(
        s.add
          .text(q.x, q.y + (r.sign.y < 1 ? -64 : 18), r.name, { fontFamily: FONT, fontSize: '18px', color: '#fff7e4', fontStyle: 'bold', backgroundColor: '#2e5455', padding: { x: 6, y: 2 } })
          .setOrigin(0.5)
          .setDepth(2800),
      );
    }
    this.marks = keep(s.add.graphics().setDepth(2900));
    this.mineLabel = keep(
      s.add
        .text(0, 0, 'Mi acompañante', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#2b2306', backgroundColor: '#facc15', padding: { x: 4, y: 1 } })
        .setOrigin(0.5, 1)
        .setDepth(2950)
        .setVisible(false),
    );
  }

  /** Máquina bajo el punto (px de mundo). */
  machineAt(x: number, y: number): MachineKind | undefined {
    return this.machines.find((m) => Phaser.Geom.Polygon.Contains(m.area, x, y))?.kind;
  }

  hover(kind?: MachineKind): void {
    const m = this.machines.find((x) => x.kind === kind);
    if (m === this.hovered) return;
    this.hovered?.outline.setVisible(false);
    this.hovered = m;
    m?.outline.setVisible(true);
    this.scene.input.setDefaultCursor(m ? 'pointer' : 'default');
  }

  /** Dibuja a los acompañantes de esta sede en su posición del reloj social. */
  drawCompanions(social: Social, snap: boolean): void {
    const g = this.marks.clear();
    const seen = new Set<string>();
    let mine = false;
    for (const c of social.inSite(this.plan.site)) {
      const p = social.position(c, snap);
      const q = iso(p);
      seen.add(c.id);
      let img = this.sprites.get(c.id);
      if (!img) {
        img = this.scene.add.image(0, 0, '__WHITE').setOrigin(0.5, 1).setScale(PERSON);
        this.made.push(img);
        this.sprites.set(c.id, img);
      }
      const walking = !snap && social.walking(c);
      let dir = this.lastDir.get(c.id) ?? c.face;
      if (walking) {
        const w = c.walk!;
        const f = (social.now - w.t0) / w.dur;
        const a = along(w.path, f),
          b = along(w.path, Math.min(1, f + 0.02));
        const dx = b.x - a.x,
          dy = b.y - a.y;
        if (dx || dy) dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'SE' : 'NW') : dy > 0 ? 'SW' : 'NE';
      } else dir = c.face;
      this.lastDir.set(c.id, dir);
      const sitting = c.activity === 'sentado' && !walking;
      const pose: Pose = walking ? 'walk' : sitting ? 'sit' : 'idle';
      const frame = walking ? Math.floor((((social.now - c.walk!.t0) / MIN_PER_TILE) * 4) % 4) : 0; // 4 cuadros por baldosa recorrida
      const app = appearanceFor(c.mine ? 'mi-acompanante-7' : c.id, '18-39');
      img
        .setTexture(charTexture(this.scene, app, dir[0] === 'S' ? 'SE' : 'NE', pose, frame))
        .setFlipX(dir[1] === 'W')
        .setPosition(q.x, q.y)
        .setDepth(1000 + q.y + (sitting ? 0.5 : 0));
      if (!sitting) g.fillStyle(0x000000, 0.22).fillEllipse(q.x, q.y, 16, 7);
      const top = q.y - (H - 1) * PERSON - (sitting ? -8 : 0);
      if (c.holding) {
        const col = Phaser.Display.Color.HexStringToColor(c.holding.color).color;
        g.fillStyle(col).fillRect(q.x + 8, q.y - 34, 7, 9).lineStyle(1.5, 0xfff7e4).strokeRect(q.x + 8, q.y - 34, 7, 9);
      }
      if (c.mine) {
        mine = true;
        g.lineStyle(2.5, 0xfacc15).strokeEllipse(q.x, q.y, 30, 14);
        this.mineLabel.setPosition(q.x, top - 4).setVisible(true);
      }
    }
    if (!mine) this.mineLabel.setVisible(false);
    for (const [id, img] of this.sprites)
      if (!seen.has(id)) {
        img.destroy();
        this.sprites.delete(id);
        this.lastDir.delete(id);
      }
  }
}

export { MACHINE_NAME };
