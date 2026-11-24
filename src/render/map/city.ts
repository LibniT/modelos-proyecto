import Phaser from 'phaser';
import { along, iso, type Vec } from '../layout';
import { ambulance, stamp } from '../art';
import type { Driver } from '../drivers';
import { cityLayout, type CityLayout } from './layout';
import { neighborhood, facility } from './neighborhood';
import type { GeoMap } from './geo';

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
  /** T25: mapa real de Valledupar (red) en lugar del barrio isométrico */
  geo?: GeoMap;
  /** clic en una sede que no se simula (ficha informativa) */
  onSite?: (id: string) => void;
}

const occColor = (r: number) => (r < 0.7 ? 0x328366 : r < 0.9 ? 0xc18224 : 0xc95542);
const badgeW = 208,
  badgeH = 56;
interface Landmark {
  /** −1 hospital, ≥ 0 clínica simulada, −2 sede del mapa real que no se simula */
  j: number;
  image: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  outline: Phaser.GameObjects.Graphics;
  panel: Phaser.GameObjects.Container;
  value: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  footprint: Phaser.Geom.Polygon;
  /** mapa real: id de la sede, desplazamiento de su placa (px de pantalla) y línea guía */
  site?: string;
  label?: Vec;
  leader?: Phaser.GameObjects.Graphics;
  /** mapa real: color fijo del marcador (origen, no simulada) o según la ocupación */
  fixed?: number;
}

export class CityScene extends Phaser.Scene {
  private L!: CityLayout;
  private roads: Vec[][] = [];
  private places: Landmark[] = [];
  private fleet = new Map<string, Phaser.GameObjects.Image>();
  private lastRead = -Infinity;
  private overview = 1;
  private manualCamera = false;
  followedAmbulance?: string;
  get minZoom(): number { return this.overview * .75; }
  get maxZoom(): number { return this.overview * (this.o.geo ? 10 : 3); }
  /** mundo → pantalla: proyección isométrica del barrio, o el plano real tal cual */
  private screen = (v: Vec): Vec => (this.o.geo ? v : iso(v));
  private routeGfx?: Phaser.GameObjects.Graphics;
  private zoomedFor?: string;
  private geoZoom = 0;
  private hover?: Landmark;

  constructor(
    private readonly driver: Driver,
    private readonly o: CityOptions,
  ) {
    super({ key: 'city', active: false });
  }

  create(): void {
    if (this.o.geo) this.buildGeo(this.o.geo);
    else this.buildIso();
    this.fit();
    this.scale.on('resize', () => { if (!this.manualCamera && !this.followedAmbulance) this.fit(); });
    this.events.on('wake', () => {
      this.fit();
      this.cameras.main.fadeIn(220);
      this.lastRead = -Infinity;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      if (p.isDown) {
        this.manualCamera = true;
        this.followedAmbulance = undefined;
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
      this.highlight(p.isDown ? undefined : this.pick(p));
    });
    this.input.on('gameout', () => this.highlight(undefined));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? .8 : 1.25));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) > 6) return;
      const place = this.pick(p);
      if (place?.j === -1) this.goHospital();
      else if (place?.j === -2) this.o.onSite?.(place.site!);
      else if (place) this.o.onClinic?.(place.j);
    });
    this.cameras.main.fadeIn(220);
  }

  /** Placa con nombre, texto de estado y barra de ocupación. */
  private badge(x: number, y: number, title: string, dark: boolean) {
    const bg = this.add.graphics();
    bg.fillStyle(0x294a46, 0.17).fillRoundedRect(-badgeW / 2 + 2, 3, badgeW, badgeH, 8);
    bg.fillStyle(dark ? 0x234e51 : 0xfffaea).fillRoundedRect(-badgeW / 2, 0, badgeW, badgeH, 8);
    const style = { fontFamily: 'Segoe UI, sans-serif', fontSize: '20px', fontStyle: 'bold', color: dark ? '#fff5de' : '#193f40' };
    const name = this.add.text(0, 2, title, style).setOrigin(0.5, 0);
    if (name.width > badgeW - 12) name.setScale((badgeW - 12) / name.width);
    const value = this.add
      .text(0, 27, '', { ...style, fontSize: '16px', fontStyle: 'normal', color: dark ? '#d7eadf' : '#345354' })
      .setOrigin(0.5, 0);
    const bar = this.add.graphics();
    const panel = this.add.container(x, y, [bg, name, value, bar]).setDepth(3000);
    return { panel, value, bar };
  }

  /** T25: calles de OpenStreetMap, sedes reales y rutas viales (en metros; norte arriba). */
  private buildGeo(m: GeoMap): void {
    const xs = m.roads.flatMap((r) => r.p.map((p) => p.x)),
      ys = m.roads.flatMap((r) => r.p.map((p) => p.y));
    const g = this.add.graphics();
    g.fillStyle(0xe7eadf).fillRect(Math.min(...xs) - 400, Math.min(...ys) - 400, Math.max(...xs) - Math.min(...xs) + 800, Math.max(...ys) - Math.min(...ys) + 800);
    for (const major of [false, true])
      for (const r of m.roads) if (r.major === major) g.lineStyle(major ? 22 : 9, major ? 0xf2d38c : 0xffffff).strokePoints(r.p);
    this.roads = m.routes;
    this.routeGfx = this.add.graphics().setDepth(10);
    for (const s of m.sites) {
      const marker = this.add.graphics().setPosition(s.at.x, s.at.y).setDepth(20);
      const outline = this.add.graphics().setDepth(19).setVisible(false);
      const j = s.clinic ?? (s.origin ? -1 : -2);
      const { panel, value, bar } = this.badge(s.at.x, s.at.y, s.short + (s.verify ? ' ⚠' : ''), s.origin);
      if (j === -2) value.setText(s.note ?? '');
      const leader = this.add.graphics().setDepth(15);
      this.places.push({ j, image: marker, outline, panel, value, bar, footprint: new Phaser.Geom.Polygon(), site: s.id, label: s.label, leader, fixed: s.origin ? 0x236e6b : j === -2 ? 0x8a9590 : undefined });
      this.paintMarker(this.places.at(-1)!, j === -2 ? 0x8a9590 : 0x328366);
    }
  }

  /** Marcador de sede: círculo de color con cruz blanca, tamaño constante en pantalla. */
  private paintMarker(place: Landmark, color: number): void {
    const g = place.image as Phaser.GameObjects.Graphics;
    g.clear()
      .fillStyle(0xffffff)
      .fillCircle(0, 0, 17)
      .fillStyle(place.fixed ?? color)
      .fillCircle(0, 0, 14)
      .fillStyle(0xffffff)
      .fillRect(-2.5, -8, 5, 16)
      .fillRect(-8, -2.5, 16, 5);
  }

  private buildIso(): void {
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
      const { panel, value, bar } = this.badge(p.x, p.y + half + 5, j < 0 ? 'Hospital · Urgencias' : (state[j]?.name ?? 'Clínica'), j < 0);
      this.places.push({ j, image: img, outline, panel, value, bar, footprint });
    });
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
      for (const place of this.places) {
        const { j, image, panel, footprint, label } = place;
        if (label) this.placeGeo(place, z);
        else {
          panel.setScale(Math.max(1, 0.68 / z));
          const base = Math.max(...footprint.points.map((p) => p.y));
          panel.y = base + 5;
          if (width < 560 && j === 1) panel.y = Math.min(...footprint.points.map((p) => p.y)) - badgeH * panel.scaleY - 7;
          if (width < 560 && j === 0) panel.y = Math.max(panel.y, this.places[0].panel.y + badgeH * panel.scaleY + 12 / z);
          panel.x = image.x;
        }
        const radius = (badgeW * panel.scaleX) / 2;
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
    this.manualCamera = false;
    if (this.o.geo) for (const p of this.places) this.placeGeo(p, z);
    cam.setZoom(z).centerOn((x0 + x1) / 2, (y0 + y1) / 2);
  }

  /** Mapa real: marcador, placa y línea guía de tamaño constante en pantalla para el zoom `z`. */
  private placeGeo(p: Landmark, z: number): void {
    const { image, panel, footprint, label } = p;
    panel.setScale(0.6 / z);
    image.setScale(1 / z);
    panel.x = image.x + label!.x / z;
    panel.y = image.y + label!.y / z - (label!.y < 0 ? badgeH * panel.scaleY : 0);
    const r = 22 / z;
    footprint.setTo([image.x - r, image.y - r, image.x + r, image.y - r, image.x + r, image.y + r, image.x - r, image.y + r]);
    p.leader!.clear().lineStyle(2 / z, 0x34595a, 0.7).lineBetween(image.x, image.y, panel.x, panel.y + (label!.y < 0 ? badgeH * panel.scaleY : 0));
    p.outline.clear().lineStyle(4 / z, 0xf9c457).strokeCircle(image.x, image.y, 21 / z);
  }

  zoomBy(factor: number): void {
    const cam = this.cameras.main;
    this.manualCamera = true;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.minZoom, this.maxZoom));
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
    const zoom = this.cameras.main.zoom;
    if (this.o.geo && zoom !== this.geoZoom) {
      this.geoZoom = zoom;
      for (const p of this.places) this.placeGeo(p, zoom);
    }
    for (const [id, img] of this.fleet)
      if (!pb.transfers.has(id)) {
        img.setVisible(false);
      }
    for (const [id, tr] of pb.transfers) {
      const route = this.roads[tr.clinicId];
      if (!route) continue;
      const key = this.o.geo ? 'ambulancia-mapa' : 'ambulancia-ciudad-' + tr.clinicId;
      if (this.o.geo)
        stamp(this, key, 46, 32, 23, 16, (g) =>
          g.fillStyle(0x193f40).fillRoundedRect(-22, -15, 44, 30, 7).fillStyle(0xffffff).fillRoundedRect(-19, -12, 38, 24, 5).fillStyle(0xc95542).fillRect(-3, -9, 6, 18).fillRect(-9, -3, 18, 6),
        );
      else if (!this.textures.exists(key))
        stamp(this, key, 140, 100, 70, 65, (g) => ambulance(g, { x: route[1].x - route[0].x, y: route[1].y - route[0].y }));
      let img = this.fleet.get(id);
      if (!img) {
        img = this.add.image(0, 0, key).setOrigin(0.5, this.o.geo ? 0.5 : 0.65).setScale(0.54);
        this.fleet.set(id, img);
      }
      const p = this.screen(along(route, tr.dur > 0 ? (pb.t - tr.t0) / tr.dur : 1));
      if (this.o.geo) img.setScale(0.8 / this.cameras.main.zoom);
      if (id === this.followedAmbulance) {
        // Mapa real: las sedes del centro están a cientos de metros; al empezar a seguir, acerca la cámara.
        if (this.o.geo && this.zoomedFor !== id) {
          this.zoomedFor = id;
          this.cameras.main.setZoom(Math.min(this.maxZoom, this.overview * 4));
        }
        this.cameras.main.centerOn(p.x, p.y - (this.o.geo ? 0 : 15));
      }
      img
        .setTexture(key)
        .setPosition(p.x, p.y)
        .setDepth(this.o.geo ? 2500 : 1000 + p.y)
        .setVisible(true);
    }
    if (time - this.lastRead < 250) return;
    this.lastRead = time;
    const clinics = this.o.clinics();
    // Mapa real: resalta la ruta vial de cada traslado en curso.
    if (this.routeGfx) {
      this.routeGfx.clear().lineStyle(7 / this.cameras.main.zoom, 0x2f6fd6, 0.9);
      for (const tr of pb.transfers.values()) if (this.roads[tr.clinicId]?.length) this.routeGfx.strokePoints(this.roads[tr.clinicId]);
    }
    for (const place of this.places) {
      const { j, value, bar } = place;
      if (j === -2) continue;
      if (j === -1) {
        const beds = Array.from(pb.figures.values()).filter((f) => f.resourceId?.startsWith('bed-')).length;
        value.setText(`${pb.figures.size} pac. · ${beds}/${pb.capacity.obsBeds} obs. · ${pb.transfers.size} en viaje`);
        continue;
      }
      const c = clinics[j];
      if (!c) continue;
      const ratio = c.occupied / Math.max(1, c.beds);
      if (place.label) this.paintMarker(place, occColor(ratio));
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
