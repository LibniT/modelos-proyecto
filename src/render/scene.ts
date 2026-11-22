/**
 * T05 — Escena isométrica dibujada por código (Phaser Graphics, sin imágenes; personajes T09 generados por código).
 * Dibuja lo que dice el `Playback`; el `Driver` (drivers.ts) decide de dónde salen los eventos.
 */
import Phaser from 'phaser';
import { AREAS, GRID, MAX, ROAD, iso, slotPos, stationPos, type Vec } from './layout';
import { box, boxAt, pts } from './draw';
import { CityScene, type CityOptions } from './map/city';
import type { Playback } from './playback';
import type { Driver } from './drivers';
import { hitTest, type Hit } from './hit';
import type { AppearanceSpec } from '../engine/events';
import type { Figure } from './playback';
import { H, SKIN, STAFF, appearanceFor, characterPixels, paint, type Pose, type View } from './characters/pixels';

/** Dirección isométrica del personaje: SE y NE se dibujan; SW y NW son su reflejo. */
type Dir = 'SE' | 'SW' | 'NE' | 'NW';
const ADULT = 1.6;
const CHILD = 1.25;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

/** Lo que hay bajo el puntero y dónde está el puntero (px del lienzo); undefined = nada o fuera. */
export type HoverFn = (hit: Hit | undefined, x: number, y: number) => void;

export const TRIAGE_COLOR = [0x9ca3af, 0xdc2626, 0xf97316, 0xeab308, 0x16a34a, 0x2563eb];
const SNAP_SPEED = 120;


const pathLength = (ps: Vec[]) => ps.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - ps[i].x, p.y - ps[i].y), 0);

export class HospitalScene extends Phaser.Scene {
  private floor!: Phaser.GameObjects.Graphics;
  private people!: Phaser.GameObjects.Graphics;
  /** burbujas de triage y marca de visitante (encima de los personajes) */
  private marks!: Phaser.GameObjects.Graphics;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly lastDir = new Map<string, Dir>();
  private staffImgs: Phaser.GameObjects.Image[] = [];
  private staticKey = '';
  private pointerOver = false;
  /** T16: paciente que sigue la cámara (clic sobre él o botón "Seguir a mi paciente") */
  follow: string | undefined;
  private fitCamera = () => {};

  constructor(
    private readonly driver: Driver,
    private readonly onHover?: HoverFn,
  ) {
    super('hospital');
  }

  create(): void {
    this.floor = this.add.graphics().setDepth(0);
    this.people = this.add.graphics().setDepth(1);
    this.marks = this.add.graphics().setDepth(2.5);
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
    this.fitCamera = fit;
    this.scale.on('resize', fit);
    this.events.on('wake', () => cam.fadeIn(300)); // al volver del mapa de la ciudad
    // Cámara: arrastrar para mover, rueda para acercar.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) > 6) this.follow = undefined; // arrastrar = tomar la cámara
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    // Clic (sin arrastrar) sobre un paciente: seguirlo; sobre otra cosa: dejar de seguir.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) > 6) return;
      p.updateWorldPoint(cam);
      const hit = hitTest(this.driver.pb, { x: p.worldX, y: p.worldY }, this.driver.speed > SNAP_SPEED);
      this.follow = hit?.kind === 'patient' ? hit.id : undefined;
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
    this.followCamera(pb);
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
    this.staffImgs.forEach((i) => i.destroy());
    this.staffImgs = [];
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
      if (i < cap.triage) this.placeStaff(STAFF.triage, { x: s.x + 1.2, y: s.y });
    }
    for (let i = 0; i < MAX.admission; i++) {
      const s = stationPos(`admission-${i}`)!;
      boxAt(g, { x: s.x + 0.7, y: s.y }, 0.4, 1.4, 18, i < cap.admission ? 0xfbbf24 : off);
      if (i < cap.admission) this.placeStaff(STAFF.admission, { x: s.x + 1.2, y: s.y });
    }
    for (let i = 0; i < MAX.doctor; i++) {
      const s = stationPos(`doctor-${i}`)!;
      box(g, s.x + 0.9, 0.2, s.x + 1, 4.3, 30, 0x93c5fd); // tabique entre consultorios
      boxAt(g, { x: s.x, y: s.y - 1.3 }, 1.3, 0.6, 10, i < cap.doctors ? 0xffffff : off); // camilla de examen
      boxAt(g, { x: s.x - 0.3, y: s.y + 0.9 }, 0.8, 0.5, 14, i < cap.doctors ? 0x60a5fa : off); // escritorio
      if (i < cap.doctors) this.placeStaff(STAFF.doctor, { x: s.x - 0.3, y: s.y + 1.5 });
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
    const m = this.marks.clear();
    const seen = new Set<string>();
    for (const f of pb.figures.values()) {
      if (f.hidden) continue;
      const p = pb.position(f, pb.t, snap);
      const q = iso(p);
      const w = f.walk;
      const walking = !snap && w !== undefined && pb.t < w.t0 + w.dur;
      const lying = f.resourceId?.startsWith('bed-') || (f.zone === 'hallway' && !walking);
      const app = f.appearance ?? appearanceFor(f.id, f.ageRange ?? '18-39');
      const scale = f.ageRange === '0-17' ? CHILD : ADULT;
      let top: number; // altura de la cabeza en px de mundo (para la burbuja)
      if (lying) {
        // Acostado en cama o camilla: cobija y cabeza hacia la cabecera (−y).
        const h = iso({ x: p.x, y: p.y - 0.6 });
        g.fillStyle(0xe0f2fe).fillEllipse(q.x, q.y - 12, 28, 14).lineStyle(1, 0x1f2937).strokeEllipse(q.x, q.y - 12, 28, 14);
        g.fillStyle(hex(app.hairColor)).fillCircle(h.x, h.y - 15, 6);
        g.fillStyle(hex(SKIN[app.skin] ?? SKIN[0])).fillCircle(h.x + 2, h.y - 14, 4.5);
        top = h.y - 22;
      } else {
        seen.add(f.id);
        const dir = this.dirOf(f, pb, p, walking);
        const pose: Pose = walking ? 'walk' : f.zone === 'waiting_room' ? 'sit' : 'idle';
        // Cuadro de caminata según la distancia recorrida en el MOVE (4 cuadros por baldosa): sin MOVE no hay paso.
        const frame = walking ? Math.floor((((pb.t - w!.t0) / w!.dur) * pathLength(w!.path) * 4) % 4) : 0;
        let img = this.sprites.get(f.id);
        if (!img) this.sprites.set(f.id, (img = this.add.image(0, 0, this.texture(app, 'SE', 'idle', 0)).setOrigin(0.5, 1)));
        img
          .setTexture(this.texture(app, dir[0] === 'S' ? 'SE' : 'NE', pose, frame))
          .setFlipX(dir[1] === 'W')
          .setPosition(q.x, q.y)
          .setScale(scale)
          .setDepth(1 + (p.x + p.y) / 1000);
        g.fillStyle(0x000000, 0.25).fillEllipse(q.x, q.y, 16, 7);
        top = q.y - (H - 1) * scale;
      }
      if (f.id === this.follow) m.lineStyle(2.5, 0xfacc15).strokeEllipse(q.x, q.y, 30, 14); // anillo del paciente seguido
      // Burbuja con el color del triage (gris antes de clasificar); los visitantes llevan además una flecha amarilla.
      m.fillStyle(TRIAGE_COLOR[f.triage ?? 0]).fillCircle(q.x, top - 6, 5).lineStyle(1.5, 0x1f2937).strokeCircle(q.x, top - 6, 5);
      if (f.isVisitor) m.fillStyle(0xfacc15).fillTriangle(q.x - 6, top - 22, q.x + 6, top - 22, q.x, top - 13).strokeTriangle(q.x - 6, top - 22, q.x + 6, top - 22, q.x, top - 13);
    }
    for (const [id, img] of this.sprites)
      if (!seen.has(id)) {
        img.destroy();
        this.sprites.delete(id);
        if (!pb.figures.has(id)) this.lastDir.delete(id);
      }
  }

  /** T19: pasa al mapa de la ciudad con un fundido de 0,3 s (el motor sigue en esa vista). */
  goCity(): void {
    if (!this.scene.manager.getScene('city')) return;
    this.follow = undefined;
    this.onHover?.(undefined, 0, 0);
    const cam = this.cameras.main;
    cam.fadeOut(300, 15, 23, 32);
    cam.once('camerafadeoutcomplete', () => this.scene.switch('city'));
  }

  /** ¿Está visible el mapa de la ciudad en vez del hospital? */
  get inCity(): boolean {
    return this.scene?.isSleeping('hospital') ?? false; // antes de que Phaser arranque no hay administrador de escenas
  }

  /** Vuelve a la vista general del hospital. */
  resetCamera(): void {
    this.fitCamera();
  }

  /** T18: acerca la cámara para la demo (solo presentación; el seguimiento la centra en el paciente). */
  demoZoom(): void {
    this.fitCamera();
    this.cameras.main.zoomTo(this.cameras.main.zoom * 1.8, 1200);
  }

  /** La cámara acompaña al paciente seguido (o a su ambulancia); si ya salió, deja de seguir. */
  private followCamera(pb: Playback): void {
    if (!this.follow) return;
    const f = pb.figures.get(this.follow);
    if (!f) {
      this.follow = undefined;
      return;
    }
    const amb = [...pb.transfers].find(([, tr]) => tr.patientId === f.id)?.[0];
    const p = amb && this.driver.speed <= SNAP_SPEED ? pb.ambulancePosition(amb, pb.t)! : pb.position(f, pb.t, this.driver.speed > SNAP_SPEED);
    const q = iso(p);
    const cam = this.cameras.main;
    // Suavizado solo de la cámara (no es un objeto del modelo); salta si el objetivo está lejos.
    const cx = cam.midPoint.x, cy = cam.midPoint.y;
    const k = Math.hypot(q.x - cx, q.y - cy) > 400 ? 1 : 0.15;
    cam.centerOn(cx + (q.x - cx) * k, cy + (q.y - 20 - cy) * k);
  }

  /** Hacia dónde mira: al caminar, según el avance del MOVE; en un puesto, hacia el personal; si no, como venía. */
  private dirOf(f: Figure, pb: Playback, p: Vec, walking: boolean): Dir {
    let d: Dir | undefined;
    if (walking) {
      const t0 = f.walk!.t0;
      const a = pb.position(f, Math.max(t0, pb.t - 0.01));
      const b = pb.t - 0.01 < t0 ? pb.position(f, t0 + 0.01) : p;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx || dy) d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'SE' : 'NW') : dy > 0 ? 'SW' : 'NE';
    } else if (f.resourceId?.startsWith('doctor-')) d = 'SW';
    else if (f.resourceId) d = 'SE';
    d ??= this.lastDir.get(f.id) ?? 'SE';
    this.lastDir.set(f.id, d);
    return d;
  }

  /** Textura del personaje (se genera una sola vez por combinación). */
  private texture(app: AppearanceSpec, view: View, pose: Pose, frame: number): string {
    const key = `ch:${JSON.stringify(app)}:${view}:${pose}:${frame}`;
    if (!this.textures.exists(key)) {
      const t = this.textures.createCanvas(key, 24, 32)!;
      paint(t.getContext(), characterPixels(app, view, pose, frame));
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    return key;
  }

  /** Personal fijo de un puesto activo (es el recurso: no se mueve). Mira hacia el visitante (SW). */
  private placeStaff(app: AppearanceSpec, p: Vec): void {
    const q = iso(p);
    this.floor.fillStyle(0x000000, 0.2).fillEllipse(q.x, q.y, 16, 7);
    this.staffImgs.push(this.add.image(q.x, q.y, this.texture(app, 'SE', 'idle', 0)).setOrigin(0.5, 1).setScale(ADULT).setFlipX(true).setDepth(1 + (p.x + p.y) / 1000));
  }
}

/** Crea el juego de Phaser dentro de `parent` (debe tener alto definido). */
export function mountScene(parent: HTMLElement, driver: Driver, onHover?: HoverFn, city?: CityOptions): { hospital: HospitalScene; city?: CityScene } {
  const hospital = new HospitalScene(driver, onHover);
  // T19: el mapa de la ciudad es una segunda escena del mismo juego; empieza dormida.
  const cityScene = city ? new CityScene(driver, city) : undefined;
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0f1720',
    scale: { mode: Phaser.Scale.RESIZE },
    scene: cityScene ? [hospital, cityScene] : hospital,
    banner: false,
  });
  return { hospital, city: cityScene };
}
