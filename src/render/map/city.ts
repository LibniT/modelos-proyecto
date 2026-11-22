/**
 * T19 — Mapa de la ciudad (SPEC D1–D2): hospital + clínicas con ocupación en vivo y ambulancias con paciente
 * que avanzan por su vía en proporción a la duración del traslado del motor. Dibujado por código.
 * El motor sigue simulando en esta vista: el update llama `driver.tick` igual que la escena del hospital.
 */
import Phaser from 'phaser';
import { along, iso, unIso, type Vec } from '../layout';
import { box, boxAt, pts } from '../draw';
import type { Driver } from '../drivers';
import { cityLayout, type CityLayout } from './layout';

export interface ClinicView {
  name: string;
  beds: number;
  occupied: number;
}

export interface CityOptions {
  /** tiempo medio de viaje a cada clínica (min): define las distancias del mapa */
  travelMeans: number[];
  /** ocupación actual de las clínicas (del snapshot del motor) */
  clinics: () => ClinicView[];
  onClinic?: (j: number) => void;
  /** se llama al pasar al hospital (clic en el edificio o botón) */
  onHospital?: () => void;
}

const CLINIC_COLORS = [0xbae6fd, 0xfde68a, 0xddd6fe];
const occColor = (r: number) => (r < 0.7 ? 0x16a34a : r < 0.9 ? 0xf59e0b : 0xdc2626);

export class CityScene extends Phaser.Scene {
  private dyn!: Phaser.GameObjects.Graphics;
  private occText: Phaser.GameObjects.Text[] = [];
  private hospText!: Phaser.GameObjects.Text;
  private L!: CityLayout;
  private lastText = 0;

  constructor(
    private readonly driver: Driver,
    private readonly o: CityOptions,
  ) {
    super({ key: 'city', active: false });
  }

  /** Ruta de la ambulancia hacia la clínica j: del borde del hospital al de la clínica. */
  private route(j: number): Vec[] {
    const a = this.L.hospital, b = this.L.clinics[j];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
    return [{ x: a.x + u.x * 2, y: a.y + u.y * 2 }, { x: b.x - u.x * 1.4, y: b.y - u.y * 1.4 }];
  }

  create(): void {
    this.L = cityLayout(this.o.travelMeans);
    const { w, h, hospital, clinics } = this.L;
    const g = this.add.graphics().setDepth(0);
    const label = (p: Vec, text: string, size = 16) =>
      this.add.text(iso(p).x, iso(p).y, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, color: '#111827', fontStyle: 'bold', backgroundColor: 'rgba(255,255,255,0.8)', padding: { x: 6, y: 2 } }).setOrigin(0.5).setDepth(3);

    // Suelo, río y vías.
    g.fillStyle(0xd9f99d).fillPoints(pts([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]), true);
    g.fillStyle(0x7dd3fc).fillPoints(pts([{ x: 0, y: h - 1.6 }, { x: w, y: h - 2.6 }, { x: w, y: h - 1.6 }, { x: 0, y: h - 0.6 }]), true);
    label({ x: w * 0.7, y: h - 1.4 }, 'Río', 12);
    clinics.forEach((_, j) => {
      const [a, b] = this.route(j);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const n = { x: -(b.y - a.y) / d * 0.45, y: (b.x - a.x) / d * 0.45 };
      g.fillStyle(0x4b5563).fillPoints(pts([{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: a.x - n.x, y: a.y - n.y }]), true);
      g.lineStyle(2, 0xfacc15, 0.8);
      for (let k = 0.05; k < 1; k += 0.1) g.strokePoints(pts([along([a, b], k), along([a, b], k + 0.05)]));
      // Casas fijas a los lados de cada vía (decorado estático, no se mueve).
      for (let k = 0.25; k < 0.9; k += 0.3) {
        const c = along([a, b], k);
        boxAt(g, { x: c.x + n.x * 3.2, y: c.y + n.y * 3.2 }, 1, 1, 18, 0xfca5a5);
        boxAt(g, { x: c.x - n.x * 3.2, y: c.y - n.y * 3.2 }, 1, 1, 14, 0xfed7aa);
      }
    });

    // Hospital (con cruz roja en el techo) y clínicas.
    box(g, hospital.x - 1.5, hospital.y - 1.5, hospital.x + 1.5, hospital.y + 1.5, 48, 0xf8fafc);
    g.fillStyle(0xdc2626).fillPoints(pts([{ x: hospital.x - 0.25, y: hospital.y - 0.9 }, { x: hospital.x + 0.25, y: hospital.y - 0.9 }, { x: hospital.x + 0.25, y: hospital.y + 0.9 }, { x: hospital.x - 0.25, y: hospital.y + 0.9 }], 48), true);
    g.fillPoints(pts([{ x: hospital.x - 0.9, y: hospital.y - 0.25 }, { x: hospital.x + 0.9, y: hospital.y - 0.25 }, { x: hospital.x + 0.9, y: hospital.y + 0.25 }, { x: hospital.x - 0.9, y: hospital.y + 0.25 }], 48), true);
    // Rótulo hacia el oeste (−x, +y): ahí no pasa ninguna vía, así no tapa las ambulancias.
    label({ x: hospital.x - 1.2, y: hospital.y + 3.2 }, 'Hospital · urgencias (clic para entrar)', 15);
    this.hospText = label({ x: hospital.x - 1.9, y: hospital.y - 1.9 }, '', 13);
    clinics.forEach((c, j) => {
      boxAt(g, c, 2.2, 2.2, 34, CLINIC_COLORS[j % CLINIC_COLORS.length]);
      label({ x: c.x + 1.5, y: c.y + 1.5 }, this.o.clinics()[j]?.name ?? `Clínica ${j + 1}`, 14);
      this.occText.push(label({ x: c.x - 1.6, y: c.y - 1.6 }, '', 12));
    });

    this.dyn = this.add.graphics().setDepth(2);

    // Cámara que encuadra el mapa; clic en edificios.
    const cam = this.cameras.main;
    const fit = () => {
      const c = iso({ x: w / 2, y: h / 2 });
      cam.setZoom(Math.min(this.scale.width / ((w + h) * 34), this.scale.height / ((w + h) * 18)));
      cam.centerOn(c.x, c.y - 20);
    };
    fit();
    this.scale.on('resize', fit);
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) > 6) return;
      p.updateWorldPoint(cam);
      const q = unIso({ x: p.worldX, y: p.worldY + 30 }); // +30: los edificios son altos, se apunta al techo
      if (Math.abs(q.x - hospital.x) < 2.2 && Math.abs(q.y - hospital.y) < 2.2) this.goHospital();
      else {
        const j = clinics.findIndex((c) => Math.abs(q.x - c.x) < 1.8 && Math.abs(q.y - c.y) < 1.8);
        if (j >= 0) this.o.onClinic?.(j);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.events.on('wake', () => cam.fadeIn(300));
    cam.fadeIn(300);
  }

  update(_time: number, delta: number): void {
    this.driver.tick(delta / 1000); // el motor sigue en esta vista (SPEC D2)
    const pb = this.driver.pb;
    const g = this.dyn.clear();
    // Ambulancias con paciente: posición ∝ tiempo de viaje del motor (TRANSFER_START.duration).
    for (const tr of pb.transfers.values()) {
      if (!this.L.clinics[tr.clinicId]) continue;
      const p = along(this.route(tr.clinicId), tr.dur > 0 ? (pb.t - tr.t0) / tr.dur : 1);
      boxAt(g, p, 0.9, 0.6, 16, 0xffffff);
      boxAt(g, { x: p.x - 0.25, y: p.y }, 0.2, 0.61, 17, 0xdc2626);
    }
    // Barras de ocupación (4 veces por segundo basta).
    const clinics = this.o.clinics();
    clinics.forEach((c, j) => {
      const at = this.L.clinics[j];
      if (!at) return;
      const q = iso(at);
      const r = c.beds > 0 ? c.occupied / c.beds : 0;
      g.fillStyle(0x111827, 0.8).fillRect(q.x - 32, q.y - 62, 64, 8);
      g.fillStyle(occColor(r)).fillRect(q.x - 31, q.y - 61, 62 * Math.min(1, r), 6);
    });
    const now = performance.now();
    if (now - this.lastText > 250) {
      this.lastText = now;
      clinics.forEach((c, j) => this.occText[j]?.setText(`${c.occupied}/${c.beds} camas (${Math.round((100 * c.occupied) / Math.max(1, c.beds))} %)`));
      const beds = [...pb.figures.values()].filter((f) => f.resourceId?.startsWith('bed-')).length;
      this.hospText.setText(`${pb.figures.size} pacientes · observación ${beds}/${pb.capacity.obsBeds} · ambulancias en camino: ${pb.transfers.size}`);
    }
  }

  /** Pasa a la escena del hospital con un fundido de 0,3 s (SPEC D1). */
  goHospital(): void {
    const cam = this.cameras.main;
    cam.fadeOut(300, 15, 23, 32);
    cam.once('camerafadeoutcomplete', () => {
      this.scene.switch('hospital');
      this.o.onHospital?.();
    });
  }
}
