import Phaser from 'phaser';
import { along, iso, type Vec } from '../layout';
import { ambulance, stamp } from '../art';
import type { Driver } from '../drivers';
import { cityLayout, type CityLayout } from './layout';
import { neighborhood, facility } from './neighborhood';

export interface ClinicView {
  name: string;
  beds: number;
  occupied: number;
}
export interface CityOptions {
  travelMeans: number[];
  clinics: () => ClinicView[];
  onClinic?: (j: number) => void;
  onHospital?: () => void;
}

const occColor = (r: number) => (r < 0.7 ? 0x328366 : r < 0.9 ? 0xc18224 : 0xc95542);
const badgeW = 208,
  badgeH = 56;
interface Landmark {
  j: number;
  image: Phaser.GameObjects.Image;
  outline: Phaser.GameObjects.Graphics;
  panel: Phaser.GameObjects.Container;
  value: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  footprint: Phaser.Geom.Polygon;
}

export class CityScene extends Phaser.Scene {
  private L!: CityLayout;
  private roads: Vec[][] = [];
  private places: Landmark[] = [];
  private fleet = new Map<string, Phaser.GameObjects.Image>();
  private lastRead = -Infinity;
  private overview = 1;
  private hover?: Landmark;

  constructor(
    private readonly driver: Driver,
    private readonly o: CityOptions,
  ) {
    super({ key: 'city', active: false });
  }

  create(): void {
    this.L = cityLayout(this.o.travelMeans);
    const { hospital, clinics, w, h } = this.L;
    this.roads = clinics.map((c) => {
      const dx = c.x - hospital.x,
        dy = c.y - hospital.y,
        d = Math.hypot(dx, dy) || 1;
      return [
        { x: hospital.x + (dx / d) * 1.8, y: hospital.y + (dy / d) * 1.8 },
        { x: c.x - (dx / d) * 1.3, y: c.y - (dy / d) * 1.3 },
      ];
    });
    const left = h * 32 + 25;
    const ground = stamp(this, 'barrio', (w + h) * 32 + 50, (w + h) * 16 + 100, left, 48, (g) => neighborhood(g, this.L));
    this.add.image(-left, -48, ground).setOrigin(0);
    const state = this.o.clinics();
    [hospital, ...clinics].forEach((at, index) => {
      const j = index - 1,
        p = iso(at);
      const key = stamp(this, 'edificio-' + j, 256, 196, 128, 130, (g) => facility(g, j));
      const img = this.add
        .image(p.x, p.y, key)
        .setOrigin(0.5, 130 / 196)
        .setDepth(1000 + p.y);
      const radius = j < 0 ? 100 : j === 1 ? 60 : 76,
        half = radius / 2,
        roof = j < 0 ? 72 : j === 1 ? 96 : j === 2 ? 70 : 54;
      const footprint = new Phaser.Geom.Polygon([
        p.x - radius,
        p.y - roof,
        p.x,
        p.y - half - roof,
        p.x + radius,
        p.y - roof,
        p.x + radius,
        p.y,
        p.x,
        p.y + half,
        p.x - radius,
        p.y,
      ]);
      const outline = this.add
        .graphics()
        .setDepth(999 + p.y)
        .setVisible(false);
      outline.lineStyle(5, 0xf9c457).strokePoints(footprint.points, true);
      const bg = this.add.graphics();
      bg.fillStyle(0x294a46, 0.17).fillRoundedRect(-badgeW / 2 + 2, 3, badgeW, badgeH, 8);
      bg.fillStyle(j < 0 ? 0x234e51 : 0xfffaea).fillRoundedRect(-badgeW / 2, 0, badgeW, badgeH, 8);
      const style = { fontFamily: 'Segoe UI, sans-serif', fontSize: '20px', fontStyle: 'bold', color: j < 0 ? '#fff5de' : '#193f40' };
      const name = this.add.text(0, 2, j < 0 ? 'Hospital · Urgencias' : (state[j]?.name ?? 'Clínica'), style).setOrigin(0.5, 0);
      const value = this.add
        .text(0, 27, '', { ...style, fontSize: '16px', fontStyle: 'normal', color: j < 0 ? '#d7eadf' : '#345354' })
        .setOrigin(0.5, 0);
      const bar = this.add.graphics();
      const panel = this.add.container(p.x, p.y + half + 5, [bg, name, value, bar]).setDepth(3000);
      this.places.push({ j, image: img, outline, panel, value, bar, footprint });
    });
    this.fit();
    this.scale.on('resize', this.fit, this);
    this.events.on('wake', () => {
      this.fit();
      this.cameras.main.fadeIn(220);
      this.lastRead = -Infinity;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      if (p.isDown) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
      this.highlight(p.isDown ? undefined : this.pick(p));
    });
    this.input.on('gameout', () => this.highlight(undefined));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.88 : 1.14));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) > 6) return;
      const place = this.pick(p);
      if (place?.j === -1) this.goHospital();
      else if (place) this.o.onClinic?.(place.j);
    });
    this.cameras.main.fadeIn(220);
  }

  /** Encuadra la silueta y la placa completa de cada edificio dentro del lienzo actual. */
  fit(): void {
    if (!this.places.length) return;
    const cam = this.cameras.main;
    const width = cam.width,
      height = cam.height;
    if (width < 2 || height < 2) return;
    let z = Math.min(width / 940, height / 575);
    let x0 = 0,
      y0 = 0,
      x1 = 0,
      y1 = 0;
    for (let i = 0; i < 6; i++) {
      x0 = y0 = Infinity;
      x1 = y1 = -Infinity;
      for (const { j, image, panel, footprint } of this.places) {
        panel.setScale(Math.max(1, 0.68 / z));
        const base = Math.max(...footprint.points.map((p) => p.y));
        panel.y = base + 5;
        if (width < 560 && j === 1) panel.y = Math.min(...footprint.points.map((p) => p.y)) - badgeH * panel.scaleY - 7;
        if (width < 560 && j === 0) panel.y = Math.max(panel.y, this.places[0].panel.y + badgeH * panel.scaleY + 12 / z);
        const radius = (badgeW * panel.scaleX) / 2;
        panel.x = image.x;
        x0 = Math.min(x0, panel.x - radius);
        x1 = Math.max(x1, panel.x + radius);
        y0 = Math.min(y0, panel.y);
        y1 = Math.max(y1, panel.y + badgeH * panel.scaleY);
        for (const p of footprint.points) {
          x0 = Math.min(x0, p.x);
          x1 = Math.max(x1, p.x);
          y0 = Math.min(y0, p.y);
          y1 = Math.max(y1, p.y);
        }
      }
      z = Math.min((width - 24) / (x1 - x0), (height - 32) / (y1 - y0), 1.65) * 0.97;
    }
    this.overview = z;
    cam.setZoom(z).centerOn((x0 + x1) / 2, (y0 + y1) / 2);
  }

  zoomBy(factor: number): void {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.overview * 0.75, this.overview * 3));
  }

  private pick(pointer: Phaser.Input.Pointer): Landmark | undefined {
    pointer.updateWorldPoint(this.cameras.main);
    const { worldX: x, worldY: y } = pointer;
    return (
      this.places.find(
        ({ panel }) => Math.abs(x - panel.x) <= (badgeW * panel.scaleX) / 2 && y >= panel.y && y <= panel.y + badgeH * panel.scaleY,
      ) ?? this.places.find((p) => Phaser.Geom.Polygon.Contains(p.footprint, x, y))
    );
  }

  private highlight(place?: Landmark): void {
    if (this.hover === place) return;
    this.hover?.outline.setVisible(false);
    this.hover = place;
    place?.outline.setVisible(true);
    this.input.setDefaultCursor(place ? 'pointer' : 'default');
  }

  update(time: number, delta: number): void {
    this.driver.tick(delta / 1000);
    const pb = this.driver.pb;
    for (const [id, img] of this.fleet)
      if (!pb.transfers.has(id)) {
        img.setVisible(false);
      }
    for (const [id, tr] of pb.transfers) {
      const route = this.roads[tr.clinicId];
      if (!route) continue;
      const key = 'ambulancia-ciudad-' + tr.clinicId;
      if (!this.textures.exists(key))
        stamp(this, key, 140, 100, 70, 65, (g) => ambulance(g, { x: route[1].x - route[0].x, y: route[1].y - route[0].y }));
      let img = this.fleet.get(id);
      if (!img) {
        img = this.add.image(0, 0, key).setOrigin(0.5, 0.65).setScale(0.54);
        this.fleet.set(id, img);
      }
      const p = iso(along(route, tr.dur > 0 ? (pb.t - tr.t0) / tr.dur : 1));
      img
        .setTexture(key)
        .setPosition(p.x, p.y)
        .setDepth(1000 + p.y)
        .setVisible(true);
    }
    if (time - this.lastRead < 250) return;
    this.lastRead = time;
    const clinics = this.o.clinics();
    for (const { j, value, bar } of this.places) {
      if (j < 0) {
        const beds = Array.from(pb.figures.values()).filter((f) => f.resourceId?.startsWith('bed-')).length;
        value.setText(`${pb.figures.size} pac. · ${beds}/${pb.capacity.obsBeds} obs. · ${pb.transfers.size} en viaje`);
        continue;
      }
      const c = clinics[j];
      if (!c) continue;
      const ratio = c.occupied / Math.max(1, c.beds);
      value.setText(`${c.occupied} / ${c.beds} camas · ${Math.round(ratio * 100)} %`);
      bar
        .clear()
        .fillStyle(0xd7ddd1)
        .fillRect(-92, 50, 184, 4)
        .fillStyle(occColor(ratio))
        .fillRect(-92, 50, 184 * Math.min(1, ratio), 4);
    }
  }

  goHospital(): void {
    this.highlight(undefined);
    const cam = this.cameras.main;
    if (cam.fadeEffect.isRunning) return;
    cam.fadeOut(220, 22, 53, 54);
    cam.once('camerafadeoutcomplete', () => {
      this.scene.switch('hospital');
      this.o.onHospital?.();
    });
  }
}
