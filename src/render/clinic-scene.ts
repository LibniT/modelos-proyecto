/**
 * T24 — Interior isométrico de una clínica (tercera escena del mismo juego; empieza dormida).
 * Las camas son las plazas del motor: `snapshot().clinics[j]` dice cuántas están ocupadas (demanda propia +
 * reservas de remisión). El motor no guarda qué cama ocupa cada paciente, así que las plazas ocupadas
 * se pintan en un orden fijo repartido entre alas, sin identidad. Los acompañantes salen del modelo social.
 */
import Phaser from 'phaser';
import { iso } from './layout';
import { rect, slab, stamp } from './art';
import { furniture } from './interior';
import type { Driver } from './drivers';
import { SKIN, HAIR_COLORS } from './characters/pixels';
import { fillOrder, type MachineKind, type SitePlan } from './companions/plans';
import { PlanView, clinicFloor } from './companions/view';
import type { Social } from './companions/social';

export interface ClinicState {
  occupied: number;
  /** camas reservadas para traslados que aún van en camino (incluidas en `occupied`) */
  reserved: number;
}
export interface ClinicSceneOptions {
  social: () => Social;
  state: (j: number) => ClinicState;
  onMachine?: (site: number, kind: MachineKind) => void;
  /** espacio (px) que ocupa la tarjeta de controles sobre el lienzo, para no tapar la planta al encuadrar */
  inset?: () => { left: number; top: number };
}

const SNAP_SPEED = 120;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

export class ClinicScene extends Phaser.Scene {
  /** clínica que se muestra (o se mostrará al despertar) */
  index = 0;
  private builtKey = '';
  private view?: PlanView;
  private made: Phaser.GameObjects.GameObject[] = [];
  private beds: { lying: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Image }[] = [];
  private order: number[] = [];
  private shown = '';
  private overview = 1;
  private manualCamera = false;
  get minZoom(): number {
    return this.overview * 0.75;
  }
  get maxZoom(): number {
    return this.overview * 4;
  }

  constructor(
    private readonly driver: Driver,
    private readonly o: ClinicSceneOptions,
  ) {
    super({ key: 'clinic', active: false });
  }

  get plan(): SitePlan {
    return this.o.social().plan(this.index)!;
  }

  create(): void {
    this.build();
    const cam = this.cameras.main;
    this.scale.on('resize', () => {
      if (!this.manualCamera && this.scene.isActive()) this.fit();
    });
    this.events.on('wake', () => {
      this.build();
      cam.fadeIn(220);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) {
        this.manualCamera = true;
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
        this.view?.hover(undefined);
        return;
      }
      p.updateWorldPoint(cam);
      this.view?.hover(this.view.machineAt(p.worldX, p.worldY));
    });
    this.input.on('gameout', () => this.view?.hover(undefined));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.8 : 1.25));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) > 6) return;
      p.updateWorldPoint(cam);
      const kind = this.view?.machineAt(p.worldX, p.worldY);
      if (kind) this.o.onMachine?.(this.index, kind);
    });
    cam.fadeIn(220);
  }

  /** Muestra la clínica j: despierta esta escena y duerme la que esté visible (un solo reloj). */
  enter(j: number): void {
    this.index = j;
    const m = this.game.scene;
    if (m.isActive('clinic')) return this.build();
    m.switch(m.isActive('hospital') ? 'hospital' : 'city', 'clinic');
  }

  /** Sale al mapa (o al hospital) sin fundido: la otra escena despierta en el mismo cuadro. */
  leave(to: 'city' | 'hospital' = 'city'): void {
    this.view?.hover(undefined);
    if (this.game.scene.isActive('clinic')) this.game.scene.switch('clinic', to);
  }

  /** Construye la planta si cambió la clínica o su número de camas; si no, solo reencuadra. */
  private build(): void {
    const plan = this.plan;
    const key = `${plan.site}:${plan.beds.length}`;
    if (key !== this.builtKey) {
      this.made.forEach((o) => o.destroy());
      this.made = [];
      this.builtKey = key;
      const left = plan.h * 32 + 30;
      const base = stamp(this, `planta-clinica-${key}`, (plan.w + plan.h) * 32 + 60, (plan.w + plan.h) * 16 + 110, left, 80, (g) => clinicFloor(g, plan));
      this.made.push(this.add.image(-left, -80, base).setOrigin(0).setDepth(0));
      this.view = new PlanView(this, plan, this.made);
      const bedKey = stamp(this, 'mueble-cama-true', 128, 112, 64, 78, (g) => furniture(g, 'cama', true));
      const tagKey = stamp(this, 'cama-reservada', 84, 66, 42, 42, (g) => {
        slab(g, -0.3, -0.1, 0.6, 0.5, 15, 2, 0xf6c453);
        rect(g, -0.22, 0.0, 0.44, 0.08, 17.5, 0x8a5a12);
        rect(g, -0.22, 0.18, 0.3, 0.06, 17.5, 0x8a5a12);
      });
      this.beds = plan.beds.map((b, i) => {
        const q = iso(b.p);
        this.made.push(this.add.image(q.x, q.y, bedKey).setOrigin(0.5, 78 / 112).setDepth(1000 + q.y - 1));
        const lying = this.add.image(q.x, q.y, this.restingTexture(i)).setOrigin(0.5, 42 / 66).setDepth(1000 + q.y).setVisible(false);
        const tag = this.add.image(q.x, q.y, tagKey).setOrigin(0.5, 42 / 66).setDepth(1000 + q.y).setVisible(false);
        this.made.push(lying, tag);
        return { lying, tag };
      });
      this.order = fillOrder(plan);
      this.shown = '';
    }
    this.fit();
  }

  /** Paciente genérico acostado (sin identidad): 6 variantes deterministas por número de cama. */
  private restingTexture(i: number): string {
    const k = (i * 7) % 6;
    return stamp(this, 'reposo-generico-' + k, 84, 66, 42, 42, (g) => {
      slab(g, -0.19, -0.35, 0.4, 0.8, 15, 5, 0xb2d3c7);
      rect(g, -0.19, -0.22, 0.4, 0.1, 20, 0xebedda);
      g.fillStyle(hex(HAIR_COLORS[k % 5])).fillEllipse(15, -24, 13, 14);
      g.fillStyle(hex(SKIN[k % SKIN.length])).fillEllipse(12, -23, 10, 10);
      g.fillStyle(0x463f39).fillRect(11, -24, 3, 1);
    });
  }

  update(_time: number, delta: number): void {
    this.driver.tick(delta / 1000);
    const social = this.o.social();
    social.advance(this.driver.pb.t);
    const s = this.o.state(this.index);
    const occ = Math.min(s.occupied, this.beds.length);
    const res = Math.min(s.reserved, occ);
    const key = `${occ}:${res}`;
    if (key !== this.shown) {
      this.shown = key;
      this.order.forEach((bed, k) => {
        this.beds[bed].lying.setVisible(k < occ - res);
        this.beds[bed].tag.setVisible(k >= occ - res && k < occ);
      });
    }
    this.view?.drawCompanions(social, this.driver.speed > SNAP_SPEED);
  }

  /** Encuadra la planta completa (muros incluidos) debajo de la franja de controles. */
  fit(): void {
    const cam = this.cameras.main;
    if (cam.width < 2 || cam.height < 2) return;
    const { w, h } = this.plan;
    const x0 = -h * 32 - 20,
      x1 = w * 32 + 20,
      y0 = -90,
      y1 = (w + h) * 16 + 40;
    const { left, top } = this.inset();
    const z = Math.min((cam.width - left - 16) / (x1 - x0), (cam.height - top - 12) / (y1 - y0));
    this.overview = z;
    this.manualCamera = false;
    cam.zoomEffect.reset();
    cam.setZoom(z).centerOn((x0 + x1) / 2 - left / 2 / z, (y0 + y1) / 2 - top / 2 / z);
  }

  /** Acerca la cámara a un ala (para leer camas cuando la sede es grande). */
  focusWing(k: number): void {
    const wing = this.plan.wings[k];
    if (!wing) return this.fit();
    const cam = this.cameras.main;
    const a = iso({ x: wing.x0, y: wing.y1 }),
      b = iso({ x: wing.x1, y: wing.y0 }),
      c = iso({ x: wing.x0, y: wing.y0 }),
      d = iso({ x: wing.x1, y: wing.y1 });
    const { left, top } = this.inset();
    const z = Phaser.Math.Clamp(Math.min((cam.width - left - 30) / (b.x - a.x + 60), (cam.height - top - 20) / (d.y - c.y + 120)), this.minZoom, this.maxZoom);
    this.manualCamera = true;
    cam.setZoom(z).centerOn((a.x + b.x) / 2 - left / 2 / z, (c.y + d.y) / 2 - 30 - top / 2 / z);
  }

  private inset(): { left: number; top: number } {
    const cam = this.cameras.main;
    const i = this.o.inset?.() ?? { left: 0, top: 0 };
    return { left: Math.min(i.left, cam.width * 0.4), top: Math.min(i.top, cam.height * 0.45) };
  }

  zoomBy(factor: number): void {
    const cam = this.cameras.main;
    this.manualCamera = true;
    cam.zoomEffect.reset();
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.minZoom, this.maxZoom));
  }
}
