/**
 * T05 — Escena isométrica dibujada por código (Phaser Graphics, sin imágenes; personajes T09 generados por código).
 * Dibuja lo que dice el `Playback`; el `Driver` (drivers.ts) decide de dónde salen los eventos.
 */
import Phaser from 'phaser';
import { AREAS, GRID, MAX, ROAD, iso, slotPos, stationPos, type Vec } from './layout';
import { ambulance, rect, slab, stamp } from './art';
import { floorPlan, furniture, type Furniture } from './interior';
import { CityScene, type CityOptions } from './map/city';
import type { Playback } from './playback';
import type { Driver } from './drivers';
import { hitTest, type Hit } from './hit';
import type { AppearanceSpec } from '../engine/events';
import type { Figure } from './playback';
import { H, SKIN, STAFF, appearanceFor, characterPixels, paint, type Pose, type View } from './characters/pixels';
import { ClinicScene, type ClinicSceneOptions } from './clinic-scene';
import { PlanView, hospitalCafeFloor } from './companions/view';
import type { Social } from './companions/social';
import type { MachineKind } from './companions/plans';

/** T24: cafetería del hospital con acompañantes del modelo social (fuera del motor clínico). */
export interface CafeOptions {
  social: () => Social;
  onMachine: (site: number, kind: MachineKind) => void;
}

/** Dirección isométrica del personaje: SE y NE se dibujan; SW y NW son su reflejo. */
type Dir = 'SE' | 'SW' | 'NE' | 'NW';
const ADULT = 1.9;
const CHILD = 1.48;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

/** Lo que hay bajo el puntero y dónde está el puntero (px del lienzo); undefined = nada o fuera. */
export type HoverFn = (hit: Hit | undefined, x: number, y: number) => void;

export const TRIAGE_COLOR = [0x9ca3af, 0xdc2626, 0xf97316, 0xeab308, 0x16a34a, 0x2563eb];
const SNAP_SPEED = 120;

const pathLength = (ps: Vec[]) => ps.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - ps[i].x, p.y - ps[i].y), 0);

export class HospitalScene extends Phaser.Scene {
  private parked: Phaser.GameObjects.Image[] = [];
  private moving: Phaser.GameObjects.Image[] = [];
  private people!: Phaser.GameObjects.Graphics;
  /** burbujas de triage y marca de visitante (encima de los personajes) */
  private marks!: Phaser.GameObjects.Graphics;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly lastDir = new Map<string, Dir>();
  private readonly looks = new WeakMap<Figure, AppearanceSpec>();
  private fittings: Phaser.GameObjects.Image[] = [];
  private staticKey = '';
  private pointerOver = false;
  /** T16: paciente que sigue la cámara (clic sobre él o botón "Seguir a mi paciente") */
  follow: string | undefined;
  private fitCamera = () => {};
  private manualCamera = false;
  readonly minZoom = 0.15;
  readonly maxZoom = 3;
  private cafeView?: PlanView;

  constructor(
    private readonly driver: Driver,
    private readonly onHover?: HoverFn,
    private readonly cafe?: CafeOptions,
  ) {
    super('hospital');
  }

  create(): void {
    const base = stamp(this, 'planta-hospital', 1472, 868, 580, 156, floorPlan);
    this.add.image(-580, -156, base).setOrigin(0);
    if (this.cafe) {
      const plan = this.cafe.social().plan(-1)!;
      const floor = stamp(this, 'cafeteria-hospital', 520, 290, 560, -290, (g) => hospitalCafeFloor(g, plan));
      this.add.image(-560, 290, floor).setOrigin(0).setDepth(0.5);
      this.cafeView = new PlanView(this, plan);
    }
    for (let i = 0; i < MAX.amb; i++) {
      const key = stamp(this, 'ambulancia-hospital', 140, 100, 70, 65, (g) => ambulance(g, { x: -1, y: 0 }));
      const p = iso(stationPos('amb-' + i)!);
      this.parked.push(
        this.add
          .image(p.x, p.y, key)
          .setOrigin(0.5, 0.65)
          .setDepth(1000 + p.y),
      );
      this.moving.push(this.add.image(0, 0, key).setOrigin(0.5, 0.65).setVisible(false));
    }
    this.people = this.add.graphics().setDepth(1);
    this.marks = this.add.graphics().setDepth(2900);
    for (const a of AREAS) {
      if (!a.label) continue;
      // T24: los rótulos del frente que caerían sobre la cafetería pasan al fondo de su área.
      const spot = this.cafe && a.label.y > 15 && a.label.x < 15 ? { x: a.label.x, y: a.y0 + 0.6 } : a.label;
      const q = iso(spot);
      q.y += spot.y < 1 ? -64 : spot !== a.label ? -10 : 23;
      this.add
        .text(q.x, q.y, a.name, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '19px',
          color: '#fff7e4',
          fontStyle: 'bold',
          backgroundColor: '#2e5455',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(2800);
    }
    const rq = iso({ x: ROAD.x0 - 0.6, y: (ROAD.y0 + ROAD.y1) / 2 }); // al final de la vía, fuera de los carriles
    this.add
      .text(rq.x, rq.y, 'Hacia las clínicas', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#294e50', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2800);
    const cam = this.cameras.main;
    const fit = () => {
      // Edificio + vía de las clínicas (que sube por la izquierda).
      const c = iso({ x: GRID.w / 2, y: GRID.h / 2 });
      if (cam.width < 2 || cam.height < 2) return;
      this.manualCamera = false;
      cam.zoomEffect.reset();
      // T24: la cafetería añade una franja delante de triage y admisión.
      cam.setZoom(Math.min(cam.width / 1520, cam.height / 880));
      cam.centerOn(c.x - 16, c.y - 44);
    };
    fit();
    this.fitCamera = fit;
    this.scale.on('resize', () => { if (!this.manualCamera && !this.follow) fit(); });
    this.events.on('wake', () => cam.fadeIn(300)); // al volver del mapa de la ciudad
    // Cámara: arrastrar para mover, rueda para acercar.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.manualCamera = true;
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) > 6) this.follow = undefined; // arrastrar = tomar la cámara
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.cafeView) return;
      p.updateWorldPoint(cam);
      this.cafeView.hover(p.isDown ? undefined : this.cafeView.machineAt(p.worldX, p.worldY));
    });
    // Clic (sin arrastrar) sobre un paciente: seguirlo; sobre otra cosa: dejar de seguir.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) > 6) return;
      p.updateWorldPoint(cam);
      const kind = this.cafeView?.machineAt(p.worldX, p.worldY);
      if (kind) return this.cafe!.onMachine(-1, kind);
      const hit = hitTest(this.driver.pb, { x: p.worldX, y: p.worldY }, this.driver.speed > SNAP_SPEED);
      this.follow = hit?.kind === 'patient' ? hit.id : undefined;
    });
    this.input.on('gameover', () => (this.pointerOver = true));
    this.input.on('gameout', () => {
      this.pointerOver = false;
      this.onHover?.(undefined, 0, 0);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? .8 : 1.25));
  }

  update(_time: number, delta: number): void {
    this.driver.tick(delta / 1000);
    const pb = this.driver.pb;
    const key = JSON.stringify(pb.capacity);
    if (key !== this.staticKey) {
      this.staticKey = key;
      this.drawStatic(pb);
    }
    this.drawPeople(pb);
    if (this.cafe && this.cafeView) {
      const social = this.cafe.social();
      social.advance(pb.t);
      this.cafeView.drawCompanions(social, this.driver.speed > SNAP_SPEED);
    }
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
    const cap = pb.capacity;
    this.fittings.forEach((img) => img.destroy());
    this.fittings = [];
    const put = (kind: Furniture, p: Vec, active = true, depthOffset = 0) => {
      const at = iso(p);
      const key = 'mueble-' + kind + '-' + active;
      if (!this.textures.exists(key)) stamp(this, key, 128, 112, 64, 78, (g) => furniture(g, kind, active));
      this.fittings.push(
        this.add
          .image(at.x, at.y, key)
          .setOrigin(0.5, 78 / 112)
          .setDepth(1000 + at.y + depthOffset),
      );
    };
    for (const group of ['triage', 'admission'] as const) {
      for (let i = 0; i < MAX[group]; i++) {
        const s = stationPos(group + '-' + i)!;
        put('mesa', { x: s.x + 0.7, y: s.y }, i < cap[group]);
        if (i < cap[group]) this.placeStaff(STAFF[group], { x: s.x + 1.2, y: s.y });
      }
    }
    for (let i = 0; i < MAX.doctor; i++) {
      const s = stationPos('doctor-' + i)!;
      // Tramos cortos para que un personaje pueda pasar por delante o por detrás del tabique.
      for (let k = 0; k < 4; k++) put('tabique', { x: s.x + 0.94, y: 0.7 + k });
      put('consulta', { x: s.x, y: s.y - 1.3 }, i < cap.doctors);
      put('mesa', { x: s.x - 0.3, y: s.y + 0.83 }, i < cap.doctors);
      if (i < cap.doctors) this.placeStaff(STAFF.doctor, { x: s.x - 0.3, y: s.y + 1.5 });
    }
    for (let i = 0; i < 20; i++) put('silla', slotPos('waiting_room', i), true, -1);
    for (let i = 0; i < 12; i++) put('camilla', slotPos('hallway', i), true, -1);
    for (let i = 0; i < MAX.bed; i++) {
      const p = stationPos('bed-' + i)!;
      put('cama', p, i < cap.obsBeds, -1);
      if (i % 5 !== 4) put('cortina', { x: p.x + 0.69, y: p.y - 0.66 });
    }
    for (const p of [
      { x: 11.6, y: 15.3 },
      { x: 16.5, y: 15.1 },
      { x: 19.5, y: 4.5 },
    ])
      put('planta', p);
  }

  private drawPeople(pb: Playback): void {
    const g = this.people.clear();
    this.parked.forEach((img, i) => {
      const id = 'amb-' + i;
      img.setVisible(i < pb.capacity.ambulances && !pb.ambulancesAway.has(id));
      const p = this.driver.speed <= SNAP_SPEED && pb.transfers.has(id) ? pb.ambulancePosition(id, pb.t) : undefined;
      const moving = this.moving[i].setVisible(!!p);
      if (p) {
        const q = iso(p);
        moving.setPosition(q.x, q.y).setDepth(1000 + q.y);
      }
    });
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
      let app = f.appearance ?? this.looks.get(f);
      if (!app) {
        app = appearanceFor(f.id, f.ageRange ?? '18-39');
        this.looks.set(f, app);
      }
      const scale = f.ageRange === '0-17' ? CHILD : ADULT;
      let top: number; // altura de la cabeza en px de mundo (para la burbuja)
      seen.add(f.id);
      let img = this.sprites.get(f.id);
      if (!img) this.sprites.set(f.id, (img = this.add.image(0, 0, '__WHITE')));
      if (lying) {
        const key = 'reposo-' + app.skin + '-' + app.hairColor;
        if (!this.textures.exists(key))
          stamp(this, key, 84, 66, 42, 42, (bed) => {
            slab(bed, -0.19, -0.35, 0.4, 0.8, 15, 5, 0xb2d3c7);
            rect(bed, -0.19, -0.22, 0.4, 0.1, 20, 0xebedda);
            bed.fillStyle(hex(app.hairColor)).fillEllipse(15, -24, 13, 14);
            bed.fillStyle(hex(SKIN[app.skin] ?? SKIN[0])).fillEllipse(12, -23, 10, 10);
            bed.fillStyle(0x463f39).fillRect(11, -24, 3, 1);
          });
        img
          .setTexture(key)
          .setOrigin(0.5, 42 / 66)
          .setFlipX(false)
          .setScale(1)
          .setPosition(q.x, q.y);
        top = q.y - 30;
      } else {
        const dir = this.dirOf(f, pb, p, walking);
        const pose: Pose = walking ? 'walk' : f.zone === 'waiting_room' ? 'sit' : 'idle';
        // Cuadro de caminata según la distancia recorrida en el MOVE (4 cuadros por baldosa): sin MOVE no hay paso.
        const frame = walking ? Math.floor((((pb.t - w!.t0) / w!.dur) * pathLength(w!.path) * 4) % 4) : 0;
        img
          .setOrigin(0.5, 1)
          .setTexture(this.texture(app, dir[0] === 'S' ? 'SE' : 'NE', pose, frame))
          .setFlipX(dir[1] === 'W')
          .setPosition(q.x, q.y)
          .setScale(scale);
        g.fillStyle(0x000000, 0.25).fillEllipse(q.x, q.y, 16, 7);
        top = q.y - (H - 1) * scale;
      }
      if (img.depth !== 1000 + q.y) img.setDepth(1000 + q.y);
      if (f.id === this.follow) m.lineStyle(2.5, 0xfacc15).strokeEllipse(q.x, q.y, 30, 14); // anillo del paciente seguido
      // Burbuja con el color del triage (gris antes de clasificar); los visitantes llevan además una flecha amarilla.
      m.fillStyle(TRIAGE_COLOR[f.triage ?? 0])
        .fillCircle(q.x, top - 5, 7)
        .lineStyle(2, 0xfff7e4)
        .strokeCircle(q.x, top - 5, 7);
      if (f.isVisitor)
        m.fillStyle(0xfacc15)
          .fillTriangle(q.x - 6, top - 22, q.x + 6, top - 22, q.x, top - 13)
          .strokeTriangle(q.x - 6, top - 22, q.x + 6, top - 22, q.x, top - 13);
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
    if (!this.scene.manager.getScene('city') || this.inCity || this.cameras.main.fadeEffect.isRunning) return;
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

  zoomBy(factor: number): void {
    const cam = this.cameras.main;
    this.manualCamera = true;
    cam.zoomEffect.reset();
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.minZoom, this.maxZoom));
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
    const cx = cam.midPoint.x,
      cy = cam.midPoint.y;
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
    this.fittings.push(
      this.add
        .image(q.x, q.y, this.texture(app, 'SE', 'idle', 0))
        .setOrigin(0.5, 1)
        .setScale(ADULT)
        .setFlipX(true)
        .setDepth(1000 + q.y),
    );
  }
}

/** Crea el juego de Phaser dentro de `parent` (debe tener alto definido). */
export function mountScene(
  parent: HTMLElement,
  driver: Driver,
  onHover?: HoverFn,
  city?: CityOptions,
  extras?: { cafe: CafeOptions; clinic: ClinicSceneOptions },
): { hospital: HospitalScene; city?: CityScene; clinic?: ClinicScene } {
  const hospital = new HospitalScene(driver, onHover, extras?.cafe);
  // T19: el mapa de la ciudad es una segunda escena del mismo juego; empieza dormida.
  const cityScene = city ? new CityScene(driver, city) : undefined;
  // T24: el interior de las clínicas es una tercera escena; también empieza dormida.
  const clinic = extras ? new ClinicScene(driver, extras.clinic) : undefined;
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: true,
    scale: { mode: Phaser.Scale.RESIZE, parent },
    scene: ([hospital, cityScene, clinic] as (Phaser.Scene | undefined)[]).filter((s): s is Phaser.Scene => !!s),
    banner: false,
  });
  return { hospital, city: cityScene, clinic };
}
