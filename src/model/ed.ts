import { Simulator, type Handle } from '../engine/sim';
import { RngFactory, type Rng } from '../engine/rng';
import { sample, type Dist } from '../engine/distributions';
import { Resource } from '../engine/resource';
import { TimeAverage, Tally } from '../engine/stats';
import type { PatientInfo, SimEvent, SimEventType, TriageLevel, Zone } from '../engine/events';
import { NAMES } from './catalog';
import { CONDITION_POOL, POOLS, type Params, type PoolId } from './params';
import { chooseDestination, type Decision, type SiteState } from './referral';
import { CONDITION_LABEL, reception, type ConditionId } from './valledupar/capabilities';
import { SITES, type SiteId } from './valledupar/sites';
import { routesFrom, routesFromSite, sitePoints, type RoadPoint, type Route } from './valledupar/router';
import { choosePrehospital, type Candidate, type Policy, type PrehospitalDecision } from './prehospital';
import { epsRelation } from './valledupar/eps';

/**
 * MODELO DEL SERVICIO DE URGENCIAS (docs/SPEC.md §2).
 *
 *   llegada → triage (FIFO) → admisión EPS (FIFO; Triage I la salta)
 *           → médico (prioridad I..V sin interrupción, FIFO por nivel)
 *           → alta | hospitalización | observación (K camas) | remisión
 *   sin cama o remisión → pasillo → clínica de la red EPS en ambulancia
 *
 * La verificación de derechos (admisión) va DESPUÉS del triage: Res. 5596/2015, art. 6.
 * Unidades de tiempo: minutos.
 */

export type PatientState =
  | 'llegando'
  | 'caminando'
  | 'esperando triage'
  | 'en triage'
  | 'esperando admisión'
  | 'en admisión'
  | 'esperando médico'
  | 'en consulta'
  | 'en observación'
  | 'en pasillo'
  | 'en traslado'
  | 'salió';

export type Outcome = 'alta' | 'hospitalizacion' | 'remitido' | 'abandono';

export interface Journey {
  arrival: number;
  departure?: number;
  triageWait?: number;
  admissionWait?: number;
  doctorWait?: number;
  doorToDoctor?: number;
  observationTime?: number;
  hallwayWait?: number;
  clinic?: string;
  outcome?: Outcome;
  /** T25: condición que motivó la remisión y por qué se eligió el destino */
  condition?: string;
  referralReason?: string;
  /** instante en que se aceptó el destino y se reservó la cama */
  referralAt?: number;
}

interface Patient {
  info: PatientInfo;
  /** nivel real (se revela en el triage) */
  level: TriageLevel;
  state: PatientState;
  zone: Zone;
  resourceId?: string;
  waitingSince: number;
  journey: Journey;
  triageEnd?: number;
  renege?: Handle;
  hallwayReason?: 'capacidad' | 'complejidad';
  hallwaySince?: number;
  reservedClinic?: number;
  massCasualty?: boolean;
  /** T25 (red): condición clínica, coordinación con el CRUE terminada, última evaluación de destinos */
  condition?: ConditionId;
  coordinated?: boolean;
  decision?: Decision;
}

interface Clinic {
  occupied: number;
  occ: TimeAverage;
  bgArrivals: number;
  bgBlocked: number;
}

export interface PatientSnapshot {
  id: string;
  name: string;
  eps: string;
  ageRange: PatientInfo['ageRange'];
  /** visible solo después del triage */
  triage?: TriageLevel;
  state: PatientState;
  zone: Zone;
  resourceId?: string;
  waitingSince: number;
  arrival: number;
  isVisitor: boolean;
  symptom?: string;
  /** T25 (red): condición de remisión y evaluación de destinos más reciente */
  condition?: string;
  decision?: Decision;
}

export interface ResourceSnapshot {
  capacity: number;
  busy: number;
  queue: number;
}

export interface Snapshot {
  t: number;
  patients: PatientSnapshot[];
  triage: ResourceSnapshot;
  admission: ResourceSnapshot;
  doctors: ResourceSnapshot;
  ambulances: ResourceSnapshot;
  obsBeds: { capacity: number; occupied: number };
  hallway: number;
  clinics: { id: number; name: string; beds: number; occupied: number }[];
}

/** T30: paciente colocado en el mapa por el visitante. */
export interface PrehospitalRequest {
  info: Omit<PatientInfo, 'id' | 'isVisitor'>;
  /** triage del escenario (no es una clasificación clínica oficial) */
  level: TriageLevel;
  condition: ConditionId;
  stable: boolean;
  /** false: llega por sus medios (sin ambulancia) */
  ambulance: boolean;
  /** punto ya validado y ajustado a la vía (`place()` del router) */
  point: RoadPoint;
  policy?: Policy;
}

export interface PrehospitalLeg {
  kind: 'a-escena' | 'a-destino' | 'a-definitiva';
  to: SiteId | 'paciente';
  t0: number;
  minutes: number;
  meters: number;
  path: number[];
  amb?: string;
}

/** Historia de un paciente prehospitalario, con los tiempos exactos del motor. */
export interface PrehospitalCase {
  id: string;
  name: string;
  eps: string;
  ageRange: PatientInfo['ageRange'];
  level: TriageLevel;
  condition: ConditionId;
  critical: boolean;
  point: { x: number; y: number };
  created: number;
  decision: PrehospitalDecision;
  /** ambulancia pedida (sale de la cola del grupo prehospitalario) */
  requested?: number;
  dispatched?: number;
  atScene?: number;
  leftScene?: number;
  destination?: SiteId;
  arrived?: number;
  /** estabilización terminada en una sede sin atención definitiva */
  stabilized?: number;
  onward?: { site: SiteId; decidedAt: number; minutes: number; requested?: number; departed?: number; arrived?: number };
  /** cuándo quedó libre cada ambulancia que lo atendió */
  ambulanceFree: number[];
  legs: PrehospitalLeg[];
  outcome?: 'urgencias del hospital de origen' | 'cama en la sede' | 'fuera de la red';
  status: string;
}

export interface EdOptions {
  seed: number;
  /** guardar el registro de eventos (escena). Apagado en el modo batch. */
  recordEvents?: boolean;
  /** aplicar el calentamiento (reinicio de estadísticas en params.warmup). */
  useWarmup?: boolean;
}

const LEVELS: TriageLevel[] = [1, 2, 3, 4, 5];

export class EmergencyDepartment {
  readonly sim = new Simulator();
  readonly params: Params;
  private readonly rngs: RngFactory;
  private readonly r: Record<string, Rng>;

  readonly triage: Resource<Patient>;
  readonly admission: Resource<Patient>;
  readonly doctors: Resource<Patient>;
  readonly ambulances: Resource<Patient>;

  private readonly patients = new Map<string, Patient>();
  private readonly hallway: Patient[] = [];
  private readonly obsFree: number[] = [];
  private obsCapacity: number;
  private obsOccupied = 0;
  private readonly clinics: Clinic[];
  /** flujos solo del escenario de red (no alteran los flujos de los escenarios originales) */
  private readonly net?: { condition: Rng; crue: Rng; handover: Rng; accept: Rng };
  private remitOutOfNetwork = 0;
  /** T30: grupo de ambulancias prehospitalario, casos y llegadas aleatorias que reemplazan */
  private readonly preAmb?: Resource<PrehospitalCase>;
  private readonly preRng?: Rng;
  private readonly preCases = new Map<string, PrehospitalCase>();
  private skipArrivals = 0;
  private nextId = 1;
  private readonly visitorQueue: PatientInfo[] = [];

  private readonly record: boolean;
  private events: SimEvent[] = [];
  private evSeq = 0;
  private readonly listeners: ((e: SimEvent) => void)[] = [];

  // ---------- estadísticas (se reinician al terminar el calentamiento) ----------
  private statsStart = 0;
  private arrivals = 0;
  private arrivalsAdmission = 0;
  private arrivalsByLevel = [0, 0, 0, 0, 0];
  private readonly inSystem: TimeAverage;
  private readonly sojourn = new Tally();
  private readonly doctorWaitByLevel = LEVELS.map(() => new Tally());
  private readonly doorToDoctor = new Tally();
  private triageIIOnTime = 0;
  private triageIICount = 0;
  private obsRequests = 0;
  private obsBlocked = 0;
  private readonly obsOcc: TimeAverage;
  private remitComplexity = 0;
  private remitCapacity = 0;
  private transfers = 0;
  private readonly hallwayWait = new Tally();
  private readonly hallwayN: TimeAverage;
  private reneges = 0;
  private renegeEligible = 0;
  private departures = 0;

  constructor(params: Params, opts: EdOptions) {
    this.params = structuredClone(params);
    this.rngs = new RngFactory(opts.seed);
    this.record = opts.recordEvents ?? false;
    const names = ['arrivals', 'mix', 'triage', 'admission', 'doctor', 'routing', 'patience', 'observation', 'ambulance', 'eps', 'names', 'clinicChoice', 'mass'];
    this.r = Object.fromEntries(names.map((n) => [n, this.rngs.stream(n)]));
    if (this.params.network)
      this.net = { condition: this.rngs.stream('condicion'), crue: this.rngs.stream('crue'), handover: this.rngs.stream('entrega'), accept: this.rngs.stream('aceptacion') };

    const c = this.params.capacity;
    this.triage = new Resource(this.sim, 'triage', c.triage, 'fifo');
    this.admission = new Resource(this.sim, 'admission', c.admission, 'fifo');
    this.doctors = new Resource(this.sim, 'doctor', c.doctors, 'priority');
    this.ambulances = new Resource(this.sim, 'amb', c.ambulances, 'fifo');
    if (this.params.network) {
      this.preAmb = new Resource(this.sim, 'pre', this.params.network.prehospital.ambulances, 'fifo');
      this.preRng = this.rngs.stream('prehospital');
    }
    this.obsCapacity = c.obsBeds;
    for (let i = c.obsBeds - 1; i >= 0; i--) this.obsFree.push(i);

    this.inSystem = new TimeAverage(0, 0);
    this.obsOcc = new TimeAverage(0, 0);
    this.hallwayN = new TimeAverage(0, 0);

    this.clinics = this.params.clinics.map(() => ({ occupied: 0, occ: new TimeAverage(0, 0), bgArrivals: 0, bgBlocked: 0 }));
    this.params.clinics.forEach((cl, j) => this.scheduleClinicBackground(j, cl.backgroundRatePerHour));
    if (this.params.network) this.startClinicsInEquilibrium();

    this.scheduleNextArrival();
    if (opts.useWarmup && this.params.warmup > 0) this.sim.scheduleAt(this.params.warmup, () => this.resetStats());
  }

  // =====================================================================
  // API pública
  // =====================================================================

  /** Avanza la simulación hasta `t` (minutos). */
  step(t: number): void {
    this.sim.runUntil(t);
  }

  get now(): number {
    return this.sim.now;
  }

  onEvent(fn: (e: SimEvent) => void): void {
    this.listeners.push(fn);
  }

  /** Devuelve y vacía los eventos registrados desde la última llamada. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /**
   * Inyecta un paciente creado por un visitante. REEMPLAZA a la siguiente
   * llegada Poisson (no se suma): el proceso de llegadas sigue siendo Poisson.
   * Desactivado en modo validación.
   */
  injectVisitor(info: Omit<PatientInfo, 'id' | 'isVisitor'>): boolean {
    if (this.params.mode === 'validacion') return false;
    this.visitorQueue.push({ ...info, id: '', isVisitor: true });
    return true;
  }

  /**
   * T30 — Paciente colocado en el mapa (solo escenario de red). Se decide el destino con las rutas desde su punto;
   * una ambulancia del grupo prehospitalario sale del hospital de origen, lo atiende en la escena y lo lleva.
   * Si va al hospital de origen, entra al flujo completo de urgencias y REEMPLAZA la próxima llegada aleatoria
   * (lambda se conserva, como con el visitante); si va a otra sede ocupa una cama del tipo que necesita.
   */
  injectPrehospital(req: PrehospitalRequest): PrehospitalCase | null {
    const n = this.params.network;
    if (!n || !this.preAmb) return null;
    const id = `p${this.nextId++}`;
    const critical = req.level <= 2 || !req.stable;
    const adult = req.info.ageRange !== '0-17';
    const routes = routesFrom(req.point, sitePoints(), n.traffic);
    const decision = this.prehospitalDecision(req.condition, adult, critical, req.info.eps, routes, n.origin, req.policy);
    const c: PrehospitalCase = {
      id,
      name: req.info.name,
      eps: req.info.eps,
      ageRange: req.info.ageRange,
      level: req.level,
      condition: req.condition,
      critical,
      point: { x: req.point.x, y: req.point.y },
      created: this.sim.now,
      decision,
      ambulanceFree: [],
      legs: [],
      status: 'evaluando destino',
    };
    this.preCases.set(id, c);
    const dest = decision.chosen;
    if (!dest) {
      c.outcome = 'fuera de la red';
      c.status = 'sin destino en la red';
      return c;
    }
    c.destination = dest.site;
    const unit = dest.kind === 'definitiva' ? this.unitOf(dest.site, CONDITION_POOL[req.condition]) : -1;
    if (unit >= 0) this.clinicOccupy(unit); // la cama se reserva al decidir (regulación por el CRUE)
    const toDest = routes[dest.site]!;
    const goDest = (amb?: number) => this.preLeg(c, 'a-destino', dest.site, toDest, amb, () => this.preArrive(c, dest.site, unit, req, amb));
    if (!req.ambulance) {
      goDest();
      return c;
    }
    c.requested = this.sim.now;
    c.status = 'esperando ambulancia';
    this.preAmb.request(c, 0, (aid) => {
      c.dispatched = this.sim.now;
      const pick = routesFrom(sitePoints()[n.origin], { p: req.point }, n.traffic).p!;
      this.preLeg(c, 'a-escena', 'paciente', pick, aid, () => {
        c.atScene = this.sim.now;
        c.status = 'atención en la escena';
        this.sim.schedule(sample(n.prehospital.scene, this.preRng!), () => {
          c.leftScene = this.sim.now;
          goDest(aid);
        });
      });
    });
    return c;
  }

  /**
   * T31 — Vista previa de la decisión para el punto y los datos del formulario, con el estado actual del motor.
   * No cambia nada (no reserva camas ni ambulancias ni consume aleatorios).
   */
  previewPrehospital(req: PrehospitalRequest): { decision: PrehospitalDecision; routes: Record<string, Route | null>; pickup: Route | null } | null {
    const n = this.params.network;
    if (!n) return null;
    const routes = routesFrom(req.point, sitePoints(), n.traffic);
    const decision = this.prehospitalDecision(req.condition, req.info.ageRange !== '0-17', req.level <= 2 || !req.stable, req.info.eps, routes, n.origin, req.policy);
    return { decision, routes, pickup: routesFrom(sitePoints()[n.origin], { p: req.point }, n.traffic).p };
  }

  /** Ambulancias prehospitalarias ocupadas y en cola. */
  get prehospitalAmbulances(): { capacity: number; busy: number; queue: number; utilization: number } | undefined {
    const a = this.preAmb;
    return a && { capacity: a.capacity, busy: a.inService, queue: a.queueLength, utilization: a.capacity ? a.busy.mean(this.sim.now) / a.capacity : NaN };
  }

  /** Casos prehospitalarios (para el seguimiento en pantalla). */
  prehospitalCases(): PrehospitalCase[] {
    return [...this.preCases.values()];
  }

  /** Accidente masivo: n pacientes Triage I–III llegan a la vez (solo realista). */
  triggerMassCasualty(n: number): boolean {
    if (this.params.mode === 'validacion') return false;
    this.emit('MASS_CASUALTY', { data: { n } });
    for (let i = 0; i < n; i++) {
      const level = (this.r.mass.weighted([0.25, 0.45, 0.3]) + 1) as TriageLevel;
      this.arrive(undefined, level, true);
    }
    return true;
  }

  setCapacity(kind: keyof Params['capacity'], n: number): void {
    n = Math.max(0, Math.floor(n));
    this.params.capacity[kind] = n;
    if (kind === 'triage') this.triage.setCapacity(n);
    else if (kind === 'admission') this.admission.setCapacity(n);
    else if (kind === 'doctors') this.doctors.setCapacity(n);
    else if (kind === 'ambulances') this.ambulances.setCapacity(n);
    else if (kind === 'obsBeds') this.setObsBeds(n);
    this.emit('PARAM_CHANGE', { data: { [kind]: n } });
  }

  setArrivalRate(perHour: number): void {
    this.params.arrivalRatePerHour = Math.max(0, perHour);
    this.emit('PARAM_CHANGE', { data: { arrivalRatePerHour: this.params.arrivalRatePerHour } });
  }

  snapshot(): Snapshot {
    const res = (r: Resource<Patient>): ResourceSnapshot => ({ capacity: r.capacity, busy: r.inService, queue: r.queueLength });
    return {
      t: this.sim.now,
      patients: [...this.patients.values()].map((p) => ({
        id: p.info.id,
        name: p.info.name,
        eps: p.info.eps,
        ageRange: p.info.ageRange,
        triage: p.info.triage,
        state: p.state,
        zone: p.zone,
        resourceId: p.resourceId,
        waitingSince: p.waitingSince,
        arrival: p.journey.arrival,
        isVisitor: p.info.isVisitor,
        symptom: p.info.symptom,
        ...(p.condition ? { condition: CONDITION_LABEL[p.condition], decision: p.decision } : {}),
      })),
      triage: res(this.triage),
      admission: res(this.admission),
      doctors: res(this.doctors),
      ambulances: res(this.ambulances),
      obsBeds: { capacity: this.obsCapacity, occupied: this.obsOccupied },
      hallway: this.hallway.length,
      clinics: this.params.clinics.map((cl, j) => ({ id: cl.id, name: cl.name, beds: cl.beds, occupied: this.clinics[j].occupied })),
    };
  }

  /**
   * Métricas desde el último reinicio de estadísticas. Tiempos en minutos.
   * Claves estables: se usan en el batch, la UI y las pruebas de validación.
   */
  metrics(): Record<string, number> {
    const t = this.sim.now;
    const T = t - this.statsStart;
    const m: Record<string, number> = {};
    m['T'] = T;
    m['lambda'] = T > 0 ? this.arrivals / T : NaN;
    m['L'] = this.inSystem.mean(t);
    m['W'] = this.sojourn.mean;
    for (const [key, r] of [
      ['triage', this.triage],
      ['admission', this.admission],
      ['doctor', this.doctors],
    ] as const) {
      m[`${key}.Wq`] = r.wait.mean;
      m[`${key}.Lq`] = r.qLen.mean(t);
      m[`${key}.rho`] = r.capacity > 0 ? r.busy.mean(t) / r.capacity : NaN;
    }
    m['admission.lambda'] = T > 0 ? this.arrivalsAdmission / T : NaN;
    LEVELS.forEach((lv, i) => {
      m[`doctor.Wq.L${lv}`] = this.doctorWaitByLevel[i].mean;
      m[`share.L${lv}`] = this.arrivals > 0 ? this.arrivalsByLevel[i] / this.arrivals : NaN;
    });
    m['triageII.compliance'] = this.triageIICount > 0 ? this.triageIIOnTime / this.triageIICount : NaN;
    m['doorToDoctor'] = this.doorToDoctor.mean;
    m['obs.blockProb'] = this.obsRequests > 0 ? this.obsBlocked / this.obsRequests : NaN;
    m['obs.occupancy'] = this.obsOcc.mean(t);
    m['remit.complexity'] = this.arrivals > 0 ? this.remitComplexity / this.arrivals : NaN;
    m['remit.capacity'] = this.arrivals > 0 ? this.remitCapacity / this.arrivals : NaN;
    m['hallway.wait'] = this.hallwayWait.mean;
    m['hallway.L'] = this.hallwayN.mean(t);
    m['hallway.max'] = this.hallwayN.max;
    m['renege.frac'] = this.renegeEligible > 0 ? this.reneges / this.renegeEligible : NaN;
    m['amb.rho'] = this.ambulances.capacity > 0 ? this.ambulances.busy.mean(t) / this.ambulances.capacity : NaN;
    m['transfers'] = this.transfers;
    if (this.net) m['remit.outOfNetwork'] = this.arrivals > 0 ? this.remitOutOfNetwork / this.arrivals : NaN;
    m['departures'] = this.departures;
    this.clinics.forEach((c, j) => {
      m[`clinic${j}.bgBlockProb`] = c.bgArrivals > 0 ? c.bgBlocked / c.bgArrivals : NaN;
      m[`clinic${j}.occupancy`] = c.occ.mean(t);
    });
    return m;
  }

  /** Reinicia todas las estadísticas (fin del calentamiento). El estado del sistema no cambia. */
  resetStats(): void {
    const t = this.sim.now;
    this.statsStart = t;
    this.arrivals = 0;
    this.arrivalsAdmission = 0;
    this.arrivalsByLevel = [0, 0, 0, 0, 0];
    this.inSystem.reset(t);
    this.sojourn.reset();
    this.doctorWaitByLevel.forEach((x) => x.reset());
    this.doorToDoctor.reset();
    this.triageIIOnTime = 0;
    this.triageIICount = 0;
    this.obsRequests = 0;
    this.obsBlocked = 0;
    this.obsOcc.reset(t);
    this.remitComplexity = 0;
    this.remitCapacity = 0;
    this.transfers = 0;
    this.remitOutOfNetwork = 0;
    this.hallwayWait.reset();
    this.hallwayN.reset(t);
    this.reneges = 0;
    this.renegeEligible = 0;
    this.departures = 0;
    this.triage.resetStats();
    this.admission.resetStats();
    this.doctors.resetStats();
    this.ambulances.resetStats();
    this.clinics.forEach((c) => {
      c.occ.reset(t);
      c.bgArrivals = 0;
      c.bgBlocked = 0;
    });
  }

  // =====================================================================
  // Proceso de llegadas
  // =====================================================================

  private arrivalRateAt(tMin: number): number {
    const base = this.params.arrivalRatePerHour / 60;
    const prof = this.params.arrivalProfile;
    if (!prof) return base;
    const hour = Math.floor((tMin / 60) % 24);
    return base * prof[hour];
  }

  private scheduleNextArrival(): void {
    const prof = this.params.arrivalProfile;
    const rng = this.r.arrivals;
    if (!prof) {
      const lam = this.params.arrivalRatePerHour / 60;
      if (lam <= 0) {
        // Sin llegadas: reintentar más tarde por si el usuario sube λ.
        this.sim.schedule(1, () => this.scheduleNextArrival());
        return;
      }
      this.sim.schedule(-Math.log(rng.next()) / lam, () => this.onArrivalEvent());
      return;
    }
    // Proceso de Poisson no homogéneo por adelgazamiento (Lewis-Shedler).
    const lamMax = (this.params.arrivalRatePerHour / 60) * Math.max(...prof);
    if (lamMax <= 0) {
      this.sim.schedule(1, () => this.scheduleNextArrival());
      return;
    }
    let t = this.sim.now;
    for (;;) {
      t += -Math.log(rng.next()) / lamMax;
      if (rng.next() <= this.arrivalRateAt(t) / lamMax) break;
    }
    this.sim.scheduleAt(t, () => this.onArrivalEvent());
  }

  private onArrivalEvent(): void {
    const visitor = this.visitorQueue.shift();
    // El nivel se sortea SIEMPRE (consume el mismo número aleatorio con o sin visitante → CRN).
    const drawn = (this.r.mix.weighted(this.params.triageMix) + 1) as TriageLevel;
    if (!visitor && this.skipArrivals > 0) {
      // T30: un paciente prehospitalario ya llegó en lugar de esta llegada aleatoria.
      this.skipArrivals--;
      this.scheduleNextArrival();
      return;
    }
    const level = visitor?.triage ?? drawn;
    this.arrive(visitor, level, false);
    this.scheduleNextArrival();
  }

  private makeInfo(): PatientInfo {
    const rn = this.r.names;
    const ages: PatientInfo['ageRange'][] = ['0-17', '18-39', '40-64', '65+'];
    return {
      id: '',
      name: `${rn.pick(NAMES.FIRST)} ${rn.pick(NAMES.LAST)}`,
      ageRange: ages[rn.weighted([0.2, 0.38, 0.27, 0.15])],
      eps: this.params.eps[this.r.eps.weighted(this.params.eps.map((e) => e.share))].id,
      isVisitor: false,
    };
  }

  private arrive(visitor: PatientInfo | undefined, level: TriageLevel, mass: boolean, bay = mass): Patient {
    const info: PatientInfo = visitor ? { ...visitor } : this.makeInfo();
    info.id = info.id || `p${this.nextId++}`;
    info.triage = undefined; // se revela en el triage
    const p: Patient = {
      info,
      level,
      state: 'llegando',
      zone: bay ? 'ambulance_bay' : 'entrance',
      waitingSince: this.sim.now,
      journey: { arrival: this.sim.now },
      massCasualty: mass,
    };
    this.patients.set(info.id, p);
    this.arrivals++;
    this.arrivalsByLevel[level - 1]++;
    this.inSystem.add(this.sim.now, 1);
    this.emit('ARRIVAL', { p, to: p.zone, data: { info: { ...info }, massCasualty: mass } });
    this.move(p, 'triage_queue', () => this.joinTriage(p));
    return p;
  }

  // =====================================================================
  // Estaciones
  // =====================================================================

  private joinTriage(p: Patient): void {
    this.setWaiting(p, 'esperando triage');
    this.emit('QUEUE_JOIN', { p, to: 'triage_queue' });
    this.triage.request(p, 0, (sid) => {
      p.journey.triageWait = this.sim.now - p.waitingSince;
      this.serve(p, 'triage', sid, 'en triage', this.params.service.triage, this.r.triage, () => {
        this.triage.release(sid);
        p.triageEnd = this.sim.now;
        p.info.triage = p.level;
        this.emit('TRIAGE_ASSIGNED', { p, data: { level: p.level } });
        if (p.level === 1) {
          // Triage I: atención inmediata, la admisión se hace después.
          this.move(p, 'waiting_room', () => this.joinDoctor(p));
        } else {
          this.move(p, 'admission_queue', () => this.joinAdmission(p));
        }
      });
    });
  }

  private joinAdmission(p: Patient): void {
    this.arrivalsAdmission++;
    this.setWaiting(p, 'esperando admisión');
    this.emit('QUEUE_JOIN', { p, to: 'admission_queue' });
    this.admission.request(p, 0, (sid) => {
      p.journey.admissionWait = this.sim.now - p.waitingSince;
      this.serve(p, 'admission', sid, 'en admisión', this.params.service.admission, this.r.admission, () => {
        this.admission.release(sid);
        this.move(p, 'waiting_room', () => this.joinDoctor(p));
      });
    });
  }

  private joinDoctor(p: Patient): void {
    this.setWaiting(p, 'esperando médico');
    this.emit('QUEUE_JOIN', { p, to: 'waiting_room', data: { level: p.level } });
    const ab = this.params.abandonment;
    const eligible = ab.enabled && ab.levels.includes(p.level);
    if (ab.levels.includes(p.level)) this.renegeEligible++;
    if (eligible) {
      const patience = sample(ab.patience, this.r.patience);
      p.renege = this.sim.schedule(patience, () => {
        if (this.doctors.cancel(p)) {
          this.reneges++;
          this.emit('RENEGE', { p, from: 'waiting_room' });
          this.move(p, 'exit', () => this.depart(p, 'abandono'));
        }
      });
    }
    this.doctors.request(p, p.level, (sid) => {
      p.renege?.cancel();
      const wait = this.sim.now - (p.triageEnd ?? p.waitingSince);
      const queueWait = this.sim.now - p.waitingSince;
      this.doctorWaitByLevel[p.level - 1].add(queueWait);
      this.doorToDoctor.add(this.sim.now - p.journey.arrival);
      if (p.level === 2) {
        this.triageIICount++;
        if (wait <= 30) this.triageIIOnTime++;
      }
      p.journey.doctorWait = wait;
      p.journey.doorToDoctor = this.sim.now - p.journey.arrival;
      const dist: Dist = this.params.service.doctorByLevel?.[p.level] ?? this.params.service.doctor;
      p.zone = 'doctor_box';
      this.serve(p, 'doctor', sid, 'en consulta', dist, this.r.doctor, () => {
        this.doctors.release(sid);
        this.routeAfterDoctor(p);
      });
    });
  }

  private routeAfterDoctor(p: Patient): void {
    const o = this.params.outcomes;
    const k = this.r.routing.weighted([o.alta, o.observacion, o.hospitalizacion, o.remision]);
    const route = (['alta', 'observacion', 'hospitalizacion', 'remision'] as const)[k];
    this.emit('ROUTED', { p, data: { route } });
    if (route === 'alta') this.move(p, 'exit', () => this.depart(p, 'alta'));
    else if (route === 'hospitalizacion') this.move(p, 'exit', () => this.depart(p, 'hospitalizacion'));
    else if (route === 'observacion') this.requestObservation(p);
    else {
      this.remitComplexity++;
      this.move(p, 'hallway', () => this.enterHallway(p, 'complejidad'));
    }
  }

  // ---------- observación: sistema de pérdida con K camas ----------

  private requestObservation(p: Patient): void {
    this.obsRequests++;
    if (this.obsFree.length > 0) {
      // La cama se reserva YA (en el instante de la decisión), no al llegar.
      this.reserveBed(p);
      this.move(p, 'observation_bed', () => this.occupyBed(p));
    } else {
      this.obsBlocked++;
      this.remitCapacity++;
      this.move(p, 'hallway', () => this.enterHallway(p, 'capacidad'));
    }
  }

  private reserveBed(p: Patient): void {
    this.obsFree.sort((a, b) => b - a);
    const bed = this.obsFree.pop()!;
    p.resourceId = `bed-${bed}`;
    this.obsOccupied++;
    this.obsOcc.set(this.sim.now, this.obsOccupied);
  }

  private occupyBed(p: Patient): void {
    const los = sample(this.params.service.observation, this.r.observation);
    p.state = 'en observación';
    p.zone = 'observation_bed';
    p.waitingSince = this.sim.now;
    this.emit('BED_ASSIGNED', { p, resourceId: p.resourceId, duration: los });
    const start = this.sim.now;
    this.sim.schedule(los, () => {
      p.journey.observationTime = this.sim.now - start;
      const bedId = p.resourceId!;
      this.releaseBed(bedId);
      this.emit('BED_RELEASED', { p, resourceId: bedId });
      p.resourceId = undefined;
      const a = this.params.afterObservation;
      const out: Outcome = this.r.routing.weighted([a.alta, a.hospitalizacion]) === 0 ? 'alta' : 'hospitalizacion';
      this.move(p, 'exit', () => this.depart(p, out));
    });
  }

  private releaseBed(bedId: string): void {
    const bed = Number(bedId.slice(4));
    this.obsOccupied--;
    this.obsOcc.set(this.sim.now, this.obsOccupied);
    if (bed < this.obsCapacity) this.obsFree.push(bed);
    // Modo realista: un paciente del pasillo que esperaba cama la toma.
    if (this.params.observationRetry && this.obsFree.length > 0) {
      const i = this.hallway.findIndex((h) => h.hallwayReason === 'capacidad' && h.reservedClinic === undefined);
      if (i >= 0) {
        const h = this.hallway.splice(i, 1)[0];
        this.leaveHallway(h);
        this.remitCapacity--; // ya no será remitido por capacidad
        this.reserveBed(h);
        this.move(h, 'observation_bed', () => this.occupyBed(h));
      }
    }
  }

  private setObsBeds(n: number): void {
    // Camas nuevas libres; si se reduce, las camas de id ≥ n desaparecen al liberarse.
    for (let b = this.obsCapacity; b < n; b++) this.obsFree.push(b);
    for (let i = this.obsFree.length - 1; i >= 0; i--) if (this.obsFree[i] >= n) this.obsFree.splice(i, 1);
    this.obsCapacity = n;
  }

  // ---------- pasillo, remisión y ambulancias ----------

  private enterHallway(p: Patient, reason: 'capacidad' | 'complejidad'): void {
    p.hallwayReason = reason;
    p.hallwaySince = this.sim.now;
    this.setWaiting(p, 'en pasillo');
    p.zone = 'hallway';
    this.hallway.push(p);
    this.hallwayN.set(this.sim.now, this.hallway.length);
    this.emit('HALLWAY_WAIT', { p, data: { reason } });
    if (this.net) this.startCoordination(p);
    else this.tryDispatchHallway();
  }

  /**
   * T25 · red: condición del remitido → búsqueda y aceptación del destino (CRUE) → reserva de cama y
   * ambulancia. Si en `maxWait` no hubo destino elegible, se remite fuera de la red.
   */
  private startCoordination(p: Patient): void {
    const n = this.params.network!;
    p.condition ??= n.conditionMix[this.net!.condition.weighted(n.conditionMix.map((c) => c.p))].id;
    p.journey.condition = CONDITION_LABEL[p.condition];
    const waiting = () => this.hallway.includes(p) && p.reservedClinic === undefined;
    this.sim.schedule(sample(n.coordination, this.net!.crue), () => {
      if (!waiting()) return;
      p.coordinated = true;
      this.tryDispatchHallway();
    });
    this.sim.schedule(n.maxWait, () => {
      if (!waiting()) return;
      this.hallway.splice(this.hallway.indexOf(p), 1);
      this.leaveHallway(p);
      this.remitOutOfNetwork++;
      p.journey.clinic = 'fuera de la red';
      p.journey.referralReason = `sin destino elegible en ${Math.round(n.maxWait / 60)} h`;
      this.move(p, 'exit', () => this.depart(p, 'remitido'));
    });
  }

  /** Estado de cada sede para el selector (red): camas simuladas del tipo `pool` y tiempo de ruta. */
  private networkState(pool: PoolId): Partial<Record<SiteId, SiteState>> {
    const n = this.params.network!;
    const routes = routesFromSite(n.origin, n.traffic);
    const st: Partial<Record<SiteId, SiteState>> = {};
    for (const [id, r] of Object.entries(routes)) st[id as SiteId] = { minutes: r ? r.minutes : null };
    n.sites.forEach((id, j) => {
      if (n.pools[j] === pool) st[id] = { clinic: j, beds: this.params.clinics[j].beds, occupied: this.clinics[j].occupied, minutes: st[id]?.minutes ?? null };
    });
    return st;
  }

  private leaveHallway(p: Patient): void {
    this.hallwayN.set(this.sim.now, this.hallway.length);
    if (p.hallwaySince !== undefined) {
      const w = this.sim.now - p.hallwaySince;
      this.hallwayWait.add(w);
      p.journey.hallwayWait = w;
    }
  }

  /** Asigna clínica (red EPS, cama libre, menor tiempo de traslado) a quienes esperan, en orden FIFO. */
  private tryDispatchHallway(): void {
    // Copia: startTransfer puede sacar pacientes del pasillo durante el recorrido.
    for (const p of [...this.hallway]) {
      if (p.reservedClinic !== undefined) continue;
      if (this.net) {
        if (!p.coordinated) continue;
        const n = this.params.network!;
        const pediatric = p.condition === 'nino_critico' || p.condition === 'recien_nacido_critico';
        const pool = CONDITION_POOL[p.condition!];
        const net = this.net;
        const accept = (e: { level: string }) => net.accept.next() < (e.level === 'AD' ? n.acceptance.AD : n.acceptance.C);
        p.decision = chooseDestination(p.condition!, !pediatric && p.info.ageRange !== '0-17', n.origin, this.networkState(pool), POOLS.find((k) => k.id === pool)!.label, accept);
        const c = p.decision.chosen;
        if (!c) {
          // Hubo sedes con cupo pero ninguna aceptó: el CRUE vuelve a coordinar después de otro retardo.
          // Si no hubo ninguna con cupo, se reevalúa en la próxima liberación de cama.
          if (p.decision.evaluated.some((e) => e.rejected)) {
            p.coordinated = false;
            this.sim.schedule(sample(n.coordination, net.crue), () => {
              if (!this.hallway.includes(p) || p.reservedClinic !== undefined) return;
              p.coordinated = true;
              this.tryDispatchHallway();
            });
          }
          continue;
        }
        p.journey.referralReason = c.reason;
        p.journey.referralAt = this.sim.now;
        p.reservedClinic = c.clinic;
        this.clinicOccupy(c.clinic);
        this.ambulances.request(p, 0, (aid) => this.startTransfer(p, aid));
        continue;
      }
      const eps = this.params.eps.find((e) => e.id === p.info.eps);
      const network = eps ? eps.network : this.params.clinics.map((c) => c.id);
      let best = -1;
      for (const j of network) {
        const cl = this.params.clinics[j];
        if (!cl || this.clinics[j].occupied >= cl.beds) continue;
        if (best < 0) {
          best = j;
          continue;
        }
        const tb = sampleMean(this.params.clinics[best].travel);
        const tj = sampleMean(cl.travel);
        const occB = this.clinics[best].occupied / this.params.clinics[best].beds;
        const occJ = this.clinics[j].occupied / cl.beds;
        if (tj < tb || (tj === tb && occJ < occB)) best = j;
      }
      if (best < 0) continue;
      p.reservedClinic = best;
      this.clinicOccupy(best);
      this.ambulances.request(p, 0, (aid) => this.startTransfer(p, aid));
    }
  }

  private startTransfer(p: Patient, ambId: number): void {
    const j = p.reservedClinic!;
    const idx = this.hallway.indexOf(p);
    if (idx >= 0) this.hallway.splice(idx, 1);
    this.leaveHallway(p);
    const cl = this.params.clinics[j];
    const trip = sample(cl.travel, this.r.ambulance);
    p.state = 'en traslado';
    p.resourceId = `amb-${ambId}`;
    p.journey.clinic = cl.name;
    const why = p.decision && {
      condition: p.journey.condition,
      reason: p.journey.referralReason,
      acceptedAt: p.journey.referralAt,
      discarded: p.decision.evaluated.filter((e) => e.site !== p.decision!.chosen?.site).map((e) => ({ site: e.name, reason: e.reason })),
    };
    this.emit('TRANSFER_START', { p, resourceId: p.resourceId, from: 'ambulance_bay', to: `clinic_${j}`, duration: trip, data: { clinic: cl.name, ...why } });
    p.zone = 'ambulance_bay';
    this.sim.schedule(trip, () => {
      this.transfers++;
      // Entrega del paciente (red) y regreso de la ambulancia vacía: se sortean aquí (cada flujo conserva su orden)
      // para informar en el evento la hora exacta en que la ambulancia queda libre (T32, solo en la red).
      const handover = this.net ? sample(this.params.network!.handover, this.net.handover) : 0;
      const back = sample(cl.travelBack ?? cl.travel, this.r.ambulance);
      this.emit('TRANSFER_END', { p, resourceId: `amb-${ambId}`, to: `clinic_${j}`, ...(this.net ? { data: { freeAt: this.sim.now + handover + back } } : {}) });
      p.zone = `clinic_${j}`;
      this.depart(p, 'remitido');
      // Estancia en la clínica (fuera del hospital, pero ocupa su cama).
      this.sim.schedule(sample(cl.los, this.r.observation), () => this.clinicRelease(j));
      this.sim.schedule(handover + back, () => this.ambulances.release(ambId));
    });
  }

  // ---------- T30: atención prehospitalaria ----------

  /** Unidad simulada de la sede para el tipo de cama (-1 si no está documentada). */
  private unitOf(site: SiteId, pool: PoolId): number {
    const n = this.params.network!;
    return n.sites.findIndex((id, k) => id === site && n.pools[k] === pool);
  }

  /** Mejor sede definitiva con cama libre desde `from` (para estabilizar y remitir). */
  private bestOnward(from: SiteId, condition: ConditionId, adult: boolean): { site: SiteId; minutes: number } | null {
    const n = this.params.network!;
    const pool = CONDITION_POOL[condition];
    const routes = routesFromSite(from, n.traffic);
    let best = null as { site: SiteId; minutes: number } | null;
    for (const s of SITES) {
      if (s.id === from || !s.emergency || !routes[s.id]) continue;
      const level = reception(condition, s.id, adult).level;
      if (level !== 'AD' && level !== 'C') continue;
      const j = this.unitOf(s.id, pool);
      const free = s.id === n.origin || (j >= 0 && this.clinics[j].occupied < this.params.clinics[j].beds);
      if (free && (!best || routes[s.id]!.minutes < best.minutes)) best = { site: s.id, minutes: routes[s.id]!.minutes };
    }
    return best;
  }

  private prehospitalDecision(condition: ConditionId, adult: boolean, critical: boolean, eps: string, routes: Record<string, Route | null>, origin: SiteId, policy?: Policy): PrehospitalDecision {
    const n = this.params.network!;
    const pool = CONDITION_POOL[condition];
    const label = POOLS.find((k) => k.id === pool)!.label;
    const candidates: Candidate[] = SITES.map((s) => {
      const r = routes[s.id] ?? null;
      const j = this.unitOf(s.id, pool);
      return {
        site: s.id,
        minutes: r ? r.minutes : null,
        ...(r ? { meters: r.meters } : {}),
        ...(j >= 0 ? { beds: { free: this.params.clinics[j].beds - this.clinics[j].occupied, total: this.params.clinics[j].beds, label } } : {}),
        ...(s.id === origin ? { fullED: true } : {}),
        onward: s.emergency && r ? this.bestOnward(s.id, condition, adult) : null,
        eps: epsRelation(eps, s.id),
      };
    });
    const epsName = this.params.eps.find((e) => e.id === eps)?.name;
    return choosePrehospital(
      {
        condition,
        adult,
        critical,
        ...(epsName ? { epsName } : {}),
        candidates,
        stabilization: sampleMean(n.prehospital.stabilization),
        coordination: sampleMean(n.coordination),
        epsSlack: n.prehospital.epsSlack,
        criticalSlack: n.prehospital.criticalSlack,
      },
      policy,
    );
  }

  /** Un tramo en ambulancia (o por sus medios): TRANSFER_START -> TRANSFER_END con la geometría de la ruta. */
  private preLeg(c: PrehospitalCase, kind: PrehospitalLeg['kind'], to: PrehospitalLeg['to'], r: Route, amb: number | undefined, done: () => void): void {
    const own = amb === undefined;
    const minutes = own ? r.minutes * this.params.network!.prehospital.ownMeansFactor : r.minutes;
    const leg: PrehospitalLeg = { kind, to, t0: this.sim.now, minutes, meters: r.meters, path: r.path, ...(own ? {} : { amb: `pre-${amb}` }) };
    c.legs.push(leg);
    c.status = kind === 'a-escena' ? 'ambulancia en camino' : own ? 'en camino por sus medios' : 'en traslado';
    const data = { prehospital: true, leg: kind, site: to, meters: r.meters, path: r.path };
    this.emit('TRANSFER_START', { id: c.id, ...(own ? {} : { resourceId: leg.amb }), duration: minutes, data });
    this.sim.schedule(minutes, () => {
      this.emit('TRANSFER_END', { id: c.id, ...(own ? {} : { resourceId: leg.amb }), data: { prehospital: true, leg: kind, site: to } });
      done();
    });
  }

  /** La ambulancia entrega y vuelve a su base (el hospital de origen). */
  private preReturn(c: PrehospitalCase, from: SiteId, amb: number | undefined): void {
    if (amb === undefined) return;
    const n = this.params.network!;
    const back = from === n.origin ? 0 : routesFromSite(from, n.traffic)[n.origin]!.minutes;
    this.sim.schedule(sample(n.handover, this.preRng!) + back, () => {
      c.ambulanceFree.push(this.sim.now);
      this.preAmb!.release(amb);
    });
  }

  private preArrive(c: PrehospitalCase, site: SiteId, unit: number, req: PrehospitalRequest, amb: number | undefined): void {
    const n = this.params.network!;
    c.arrived ??= this.sim.now;
    if (c.onward) c.onward.arrived = this.sim.now;
    this.preReturn(c, site, amb);
    if (site === n.origin) {
      c.outcome = 'urgencias del hospital de origen';
      c.status = 'en urgencias del hospital de origen';
      this.skipArrivals++;
      const p = this.arrive({ ...req.info, id: c.id, isVisitor: true }, req.level, false, true);
      p.condition = req.condition; // si después se remite, conserva su condición
      return;
    }
    if (unit >= 0) {
      c.outcome = 'cama en la sede';
      c.status = 'hospitalizado en la sede';
      this.emit('BED_ASSIGNED', { id: c.id, resourceId: `clinic_${unit}`, data: { prehospital: true, site } });
      this.sim.schedule(sample(this.params.clinics[unit].los, this.preRng!), () => this.clinicRelease(unit));
      return;
    }
    // Sede de estabilización: después se busca la atención definitiva (CRUE).
    c.status = 'en estabilización';
    this.sim.schedule(sample(n.prehospital.stabilization, this.preRng!), () => {
      c.stabilized = this.sim.now;
      this.preOnward(c, site, req);
    });
  }

  private preOnward(c: PrehospitalCase, from: SiteId, req: PrehospitalRequest): void {
    const n = this.params.network!;
    c.status = 'esperando remisión (CRUE)';
    this.sim.schedule(sample(n.coordination, this.preRng!), () => {
      const best = this.bestOnward(from, req.condition, req.info.ageRange !== '0-17');
      if (!best) {
        if (this.sim.now - c.stabilized! >= n.maxWait) {
          c.outcome = 'fuera de la red';
          c.status = 'remitido fuera de la red';
        } else this.preOnward(c, from, req); // el CRUE vuelve a buscar
        return;
      }
      const unit = best.site === n.origin ? -1 : this.unitOf(best.site, CONDITION_POOL[req.condition]);
      if (unit >= 0) this.clinicOccupy(unit);
      c.onward = { site: best.site, decidedAt: this.sim.now, minutes: best.minutes, requested: this.sim.now };
      c.status = 'esperando ambulancia para la remisión';
      this.preAmb!.request(c, 0, (aid) => {
        const pick = routesFromSite(n.origin, n.traffic)[from]!;
        this.preLeg(c, 'a-escena', from, pick, aid, () => {
          c.onward!.departed = this.sim.now;
          this.preLeg(c, 'a-definitiva', best.site, routesFromSite(from, n.traffic)[best.site]!, aid, () => {
            c.destination = best.site;
            this.preArrive(c, best.site, unit, req, aid);
          });
        });
      });
    });
  }

  private clinicOccupy(j: number): void {
    const c = this.clinics[j];
    c.occupied++;
    c.occ.set(this.sim.now, c.occupied);
  }

  private clinicRelease(j: number): void {
    const c = this.clinics[j];
    c.occupied--;
    c.occ.set(this.sim.now, c.occupied);
    this.tryDispatchHallway();
  }

  /**
   * T25 · red: las sedes reales no arrancan vacías. Ocupación inicial = distribución estacionaria del sistema
   * de pérdida M/M/K/K con su demanda propia (Poisson truncada en K, carga a = λ·E[S]); por la falta de memoria
   * de la estancia exponencial, a cada cama ocupada le queda Exp(E[S]). Así no hace falta calentamiento.
   */
  private startClinicsInEquilibrium(): void {
    const rng = this.rngs.stream('ocupacion-inicial');
    this.params.clinics.forEach((cl, j) => {
      if (cl.los.kind !== 'exp') return;
      const a = (cl.backgroundRatePerHour / 60) * cl.los.mean;
      const logw: number[] = [];
      for (let n = 0, lw = 0; n <= cl.beds; n++, lw += Math.log(a) - Math.log(n)) logw.push(lw);
      const max = Math.max(...logw);
      const w = logw.map((x) => Math.exp(x - max));
      const n0 = rng.weighted(w);
      for (let i = 0; i < n0; i++) {
        this.clinicOccupy(j);
        this.sim.schedule(sample(cl.los, rng), () => this.clinicRelease(j));
      }
    });
  }

  /** Demanda propia de cada clínica: Poisson; si está llena, se pierde (pérdida pura, Erlang B). */
  private scheduleClinicBackground(j: number, perHour: number): void {
    if (perHour <= 0) return;
    const rng = this.rngs.stream(`clinic${j}`);
    const lam = perHour / 60;
    this.sim.schedule(-Math.log(rng.next()) / lam, () => {
      const c = this.clinics[j];
      const cl = this.params.clinics[j];
      c.bgArrivals++;
      if (c.occupied < cl.beds) {
        this.clinicOccupy(j);
        this.sim.schedule(sample(cl.los, rng), () => this.clinicRelease(j));
      } else {
        c.bgBlocked++;
      }
      this.scheduleClinicBackground(j, this.params.clinics[j].backgroundRatePerHour);
    });
  }

  // =====================================================================
  // Utilidades
  // =====================================================================

  private serve(p: Patient, station: 'triage' | 'admission' | 'doctor', sid: number, state: PatientState, dist: Dist, rng: Rng, done: () => void): void {
    const d = sample(dist, rng);
    p.state = state;
    p.resourceId = `${station}-${sid}`;
    if (station === 'triage') p.zone = 'triage';
    if (station === 'admission') p.zone = 'admission';
    if (station === 'doctor') p.zone = 'doctor_box';
    this.emit('SERVICE_START', { p, resourceId: p.resourceId, duration: d, data: { station } });
    this.sim.schedule(d, () => {
      this.emit('SERVICE_END', { p, resourceId: p.resourceId, data: { station } });
      p.resourceId = undefined;
      done();
    });
  }

  private setWaiting(p: Patient, state: PatientState): void {
    p.state = state;
    p.waitingSince = this.sim.now;
  }

  /** Traslado interno determinista (retardo sin cola → no altera esperas en cola). */
  private move(p: Patient, to: Zone, then: () => void): void {
    const d = this.params.transit;
    const from = p.zone;
    if (p.state !== 'en traslado') p.state = 'caminando';
    this.emit('MOVE', { p, from, to, duration: d });
    const arriveFn = () => {
      p.zone = to;
      then();
    };
    if (d > 0) this.sim.schedule(d, arriveFn);
    else arriveFn();
  }

  private depart(p: Patient, outcome: Outcome): void {
    p.state = 'salió';
    p.journey.outcome = outcome;
    p.journey.departure = this.sim.now;
    this.patients.delete(p.info.id);
    this.inSystem.add(this.sim.now, -1);
    this.sojourn.add(this.sim.now - p.journey.arrival);
    this.departures++;
    this.emit('DEPARTURE', { p, data: { outcome, journey: { ...p.journey }, level: p.level, name: p.info.name, isVisitor: p.info.isVisitor } });
  }

  private emit(type: SimEventType, o: { p?: Patient; id?: string; resourceId?: string; from?: Zone; to?: Zone; duration?: number; data?: Record<string, unknown> }): void {
    if (!this.record && this.listeners.length === 0) return;
    const e: SimEvent = { t: this.sim.now, seq: this.evSeq++, type };
    if (o.p) e.patientId = o.p.info.id;
    else if (o.id) e.patientId = o.id;
    if (o.resourceId !== undefined) e.resourceId = o.resourceId;
    if (o.from !== undefined) e.from = o.from;
    if (o.to !== undefined) e.to = o.to;
    if (o.duration !== undefined) e.duration = o.duration;
    if (o.data !== undefined) e.data = o.data;
    if (this.record) this.events.push(e);
    for (const fn of this.listeners) fn(e);
  }
}

/** Media de una distribución sin muestrear (para elegir clínica por tiempo esperado). */
function sampleMean(d: Dist): number {
  switch (d.kind) {
    case 'triangular':
      return (d.min + d.mode + d.max) / 3;
    case 'const':
      return d.value;
    default:
      return d.mean;
  }
}
