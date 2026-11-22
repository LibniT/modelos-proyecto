/**
 * T18 — Modo demo (SPEC F5): tras un rato sin uso, la cámara sigue a un paciente de la llegada a la salida
 * y los subtítulos narran SUS eventos del motor. Cualquier toque, tecla o movimiento del mouse devuelve el control.
 */
import type { SimEvent, TriageLevel } from '../engine/events';
import type { Driver } from './drivers';
import type { Playback } from './playback';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const LEVEL_TEXT = ['', 'atención inmediata', 'debe ver al médico en máximo 30 minutos (Res. 5596)', 'urgencia que puede esperar un poco', 'consulta prioritaria, sin riesgo para la vida', 'consulta no urgente'];

/** Subtítulo de un evento (o undefined si no se narra). Solo usa datos del evento y el nombre del paciente. */
export function caption(e: SimEvent, nameOf: (id: string) => string, epsName: (id: string) => string): string | undefined {
  const name = e.patientId ? nameOf(e.patientId) : '';
  const d = (e.data ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'ARRIVAL': {
      const info = d.info as { name: string; eps: string; isVisitor?: boolean };
      if (d.massCasualty) return `${info.name} llega en ambulancia, herido en el accidente`;
      return `${info.name}${info.isVisitor ? ' (creado por un visitante)' : ''} llega a urgencias · ${epsName(info.eps)}`;
    }
    case 'TRIAGE_ASSIGNED': {
      const l = d.level as TriageLevel;
      return `Triage ${ROMAN[l]}: ${LEVEL_TEXT[l]}`;
    }
    case 'QUEUE_JOIN':
      if (e.to === 'waiting_room') return 'Espera en la sala: el médico atiende por nivel de triage, no por orden de llegada';
      if (e.to === 'admission_queue') return 'Hace fila en admisión para verificar su EPS';
      return undefined;
    case 'SERVICE_START':
      if (d.station === 'triage') return `${name} pasa a triage con la enfermera`;
      if (d.station === 'doctor') return `${name} entra al consultorio ${Number(e.resourceId?.split('-')[1]) + 1}`;
      return undefined;
    case 'ROUTED':
      return { alta: 'El médico le da de alta', observacion: 'Queda en observación', hospitalizacion: 'Lo van a hospitalizar', remision: 'Necesita remisión a una clínica de su EPS' }[d.route as string];
    case 'HALLWAY_WAIT':
      return d.reason === 'capacidad' ? 'No hay cama de observación libre: espera en una camilla del pasillo' : 'Su caso requiere más complejidad: espera ambulancia en el pasillo';
    case 'TRANSFER_START':
      return `Sale en ambulancia hacia ${d.clinic}`;
    case 'RENEGE':
      return `${name} se cansa de esperar y se va sin ser atendido`;
    case 'MASS_CASUALTY':
      return `¡Accidente masivo! Llegan ${d.n} heridos al mismo tiempo`;
    case 'DEPARTURE':
      return { alta: `${d.name} se va a casa`, hospitalizacion: `${d.name} pasa a hospitalización`, remitido: `${d.name} llegó a la clínica`, abandono: `${d.name} salió sin atención` }[d.outcome as string];
    default:
      return undefined;
  }
}

/** Lo que el modo demo necesita de la escena (HospitalScene lo cumple). */
export interface DemoCamera {
  follow: string | undefined;
  resetCamera(): void;
  demoZoom(): void;
}

export interface DemoOptions {
  scene: DemoCamera;
  driver: Driver;
  subtitle: HTMLElement;
  banner: HTMLElement;
  /** tarjeta de recorrido: se oculta sola en la demo al pasar al siguiente paciente */
  card?: HTMLElement;
  epsName: (id: string) => string;
  /** segundos sin uso antes de empezar (SPEC: 60) */
  idleSeconds?: number;
  /** al empezar (p. ej. volver a la pestaña Escena) */
  onStart?: () => void;
}

const clock = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class DemoMode {
  active = false;
  private idleSince = performance.now();
  private saved = { speed: 60, paused: false };
  private pb?: Playback;
  private wantNext = false;
  private followedAt = 0;
  private lines: string[] = [];
  private lastLineAt = 0;
  private readonly idleMs: number;

  constructor(private readonly o: DemoOptions) {
    this.idleMs = (o.idleSeconds ?? 60) * 1000;
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'])
      addEventListener(ev, () => this.touch(), { passive: true, capture: true });
    setInterval(() => this.tick(), 250);
  }

  private touch(): void {
    this.idleSince = performance.now();
    if (this.active) this.stop();
  }

  private tick(): void {
    const { driver, scene } = this.o;
    if (driver.pb !== this.pb) {
      // El Playback cambia al cambiar de modo: se vuelve a enganchar.
      this.pb = driver.pb;
      this.pb.listeners.push((e) => this.onEvent(e));
    }
    const now = performance.now();
    if (!this.active) {
      if (now - this.idleSince > this.idleMs) this.start();
      return;
    }
    // El paciente seguido salió (la escena suelta la cámara) o lleva 2 min reales: pasar al siguiente que llegue.
    if (!scene.follow || now - this.followedAt > 120_000) {
      if (!this.wantNext && this.o.card && !this.o.card.hidden) setTimeout(() => (this.o.card!.hidden = true), 8000);
      this.wantNext = true;
    }
    this.o.subtitle.hidden = this.lines.length === 0;
    if (now - this.lastLineAt > 6000 && this.lines.length > 1) this.lines.shift(); // los subtítulos viejos se van
    this.o.subtitle.textContent = this.lines.join('\n');
  }

  private onEvent(e: SimEvent): void {
    if (!this.active) return;
    const { scene, epsName } = this.o;
    if (e.type === 'ARRIVAL' && this.wantNext) {
      scene.follow = e.patientId;
      this.wantNext = false;
      this.followedAt = performance.now();
    }
    if (e.patientId !== scene.follow && e.type !== 'MASS_CASUALTY') return;
    const nameOf = (id: string) => this.pb?.figures.get(id)?.name ?? id;
    const c = caption(e, nameOf, epsName);
    if (!c) return;
    this.lines.push(`${clock(e.t)} · ${c}`);
    if (this.lines.length > 3) this.lines.shift();
    this.lastLineAt = performance.now();
  }

  start(): void {
    const { driver, scene, banner } = this.o;
    this.o.onStart?.();
    this.active = true;
    this.saved = { speed: driver.speed, paused: driver.paused };
    driver.speed = 60; // a ×60 se ve caminar a la gente y los subtítulos alcanzan a leerse
    driver.paused = false;
    scene.follow = undefined;
    this.wantNext = true;
    this.lines = [];
    scene.demoZoom();
    banner.hidden = false;
  }

  stop(): void {
    const { driver, scene, banner, subtitle } = this.o;
    this.active = false;
    driver.speed = this.saved.speed;
    driver.paused = this.saved.paused;
    scene.follow = undefined;
    scene.resetCamera();
    banner.hidden = subtitle.hidden = true;
    this.lines = [];
  }
}
