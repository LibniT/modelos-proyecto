import type { Dist } from '../engine/distributions';
import type { TriageLevel } from '../engine/events';
import { CLINICS, EPS_LIST, type ClinicParams, type EpsParams } from './catalog';
import type { ConditionId } from './valledupar/capabilities';
import { SITES, type Capacity, type SiteId } from './valledupar/sites';
import rutas from './valledupar/rutas.json';
import { routesFromSite, type Traffic } from './valledupar/router';
import { NO_EPS, REAL_EPS, UNKNOWN_EPS } from './valledupar/eps';

export type Mode = 'validacion' | 'realista';

export interface Params {
  mode: Mode;
  /** λ base (pacientes/hora). En realista multiplica al perfil horario. */
  arrivalRatePerHour: number;
  /**
   * Perfil horario relativo (24 valores, media ≈ 1). null = λ constante.
   * λ(t) = arrivalRatePerHour · profile[hora del día].
   */
  arrivalProfile: number[] | null;
  /** probabilidades de Triage I..V */
  triageMix: [number, number, number, number, number];
  capacity: {
    triage: number;
    admission: number;
    doctors: number;
    obsBeds: number;
    ambulances: number;
  };
  service: {
    triage: Dist;
    admission: Dist;
    doctor: Dist;
    /** opcional: consulta distinta por nivel (rompe Cobham; solo realista) */
    doctorByLevel?: Partial<Record<TriageLevel, Dist>>;
    observation: Dist;
  };
  /** desenlace tras la consulta médica (suman 1) */
  outcomes: { alta: number; observacion: number; hospitalizacion: number; remision: number };
  /** desenlace al salir de observación */
  afterObservation: { alta: number; hospitalizacion: number };
  /** traslado interno determinista entre zonas (min) */
  transit: number;
  abandonment: { enabled: boolean; levels: TriageLevel[]; patience: Dist };
  /** realista: quien no halló cama puede tomar una cama del hospital si se libera */
  observationRetry: boolean;
  clinics: ClinicParams[];
  eps: EpsParams[];
  /** periodo de calentamiento (min) tras el cual se reinician estadísticas */
  warmup: number;
  /** T25: red real de Valledupar. Ausente en los escenarios de validación y realista. */
  network?: NetworkParams;
}

/** Supuestos del escenario de red (docs/RED_VALLEDUPAR.md). Los hechos están en src/model/valledupar. */
export interface NetworkParams {
  origin: SiteId;
  /**
   * sede y tipo de cama de cada unidad simulada: clinics[j] ↔ (sites[j], pools[j]). Una sede tiene una unidad por
   * cada tipo de cama documentado (T27), así que una sede puede aparecer varias veces.
   */
  sites: SiteId[];
  pools: PoolId[];
  /** probabilidad de que la sede acepte el traslado en una coordinación, según su recepción (SUPUESTO, T27) */
  acceptance: { AD: number; C: number };
  /** condición clínica de quien se remite (SUPUESTO) */
  conditionMix: { id: ConditionId; p: number }[];
  /** búsqueda y aceptación del destino (CRUE), antes de reservar cama y ambulancia */
  coordination: Dist;
  /** alistamiento, cargue y entrega del paciente: la ambulancia sigue ocupada antes de regresar */
  handover: Dist;
  /** espera máxima en el pasillo sin destino; después se remite fuera de la red (min) */
  maxWait: number;
  /** T28: escenario de tráfico (SUPUESTO): pesa el tiempo de cada vía en todas las rutas */
  traffic: Traffic;
  /** T30: pacientes colocados en el mapa (atención prehospitalaria; todos SUPUESTOS salvo las rutas) */
  prehospital: {
    /** grupo de ambulancias propio con base en el hospital de origen (las de remisión no cambian) */
    ambulances: number;
    /** atención en la escena antes de salir */
    scene: Dist;
    /** estabilización en una sede que no da la atención definitiva */
    stabilization: Dist;
    /** paciente estable: minutos extra aceptados para ir a la red documentada de su EPS */
    epsSlack: number;
    /** paciente crítico: minutos extra máximos frente a la urgencia más cercana */
    criticalSlack: number;
    /** sin ambulancia (por sus medios): multiplicador del tiempo de ruta */
    ownMeansFactor: number;
  };
}

/** Perfil horario relativo (media = 1): valle nocturno, picos en la mañana y la tarde. */
export const DAY_PROFILE = (() => {
  const raw = [6, 5, 5, 4, 4, 5, 7, 10, 14, 16, 17, 18, 18, 17, 16, 16, 15, 15, 14, 13, 12, 10, 8, 7];
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  return raw.map((x) => x / mean);
})();

/** Modo VALIDACIÓN: todo exponencial, λ constante, sin abandono → fórmulas exactas. */
export function validationParams(): Params {
  return {
    mode: 'validacion',
    arrivalRatePerHour: 12,
    arrivalProfile: null,
    triageMix: [0.02, 0.13, 0.45, 0.3, 0.1],
    capacity: { triage: 2, admission: 2, doctors: 5, obsBeds: 18, ambulances: 2 },
    service: {
      triage: { kind: 'exp', mean: 4 },
      admission: { kind: 'exp', mean: 5 },
      doctor: { kind: 'exp', mean: 20 },
      observation: { kind: 'exp', mean: 360 },
    },
    outcomes: { alta: 0.7, observacion: 0.2, hospitalizacion: 0.05, remision: 0.05 },
    afterObservation: { alta: 0.8, hospitalizacion: 0.2 },
    transit: 0.5,
    abandonment: { enabled: false, levels: [4, 5], patience: { kind: 'exp', mean: 120 } },
    observationRetry: false,
    clinics: CLINICS.map((c) => ({ ...c })),
    eps: EPS_LIST.map((e) => ({ ...e, network: [...e.network] })),
    warmup: 2 * 1440,
  };
}

/** Modo REALISTA: distribuciones asimétricas (parámetros ESTIMADOS de la literatura). */
export function realisticParams(): Params {
  const p = validationParams();
  return {
    ...p,
    mode: 'realista',
    arrivalProfile: DAY_PROFILE,
    service: {
      triage: { kind: 'lognormal', mean: 4, cv: 0.4 },
      admission: { kind: 'triangular', min: 3, mode: 5, max: 10 },
      doctor: { kind: 'gamma', mean: 20, cv: 0.6 },
      observation: { kind: 'lognormal', mean: 360, cv: 1.0 },
    },
    capacity: { ...p.capacity, doctors: 6 },
    abandonment: { enabled: true, levels: [4, 5], patience: { kind: 'exp', mean: 120 } },
    observationRetry: true,
    warmup: 1440,
  };
}

/** SUPUESTO: ocupación media de las camas de cada sede por su propia demanda. */
export const NETWORK_OCCUPANCY = 0.9;

/**
 * T27 — Tipos de cama de la red. Cada sede simula por separado cada tipo con capacidad DOCUMENTADA (sin cifra, no
 * se simula ese tipo: el selector la descarta con ese motivo). Estancias medias: SUPUESTOS.
 */
export type PoolId = 'general' | 'uci-adulto' | 'uci-pediatrica' | 'uci-neonatal' | 'quemados';
export const POOLS: { id: PoolId; field: keyof Capacity; label: string; los: number }[] = [
  { id: 'general', field: 'adultBeds', label: 'camas de adulto', los: 2 * 1440 },
  { id: 'uci-adulto', field: 'icuAdult', label: 'camas de UCI adulto', los: 5 * 1440 },
  { id: 'uci-pediatrica', field: 'icuPediatric', label: 'camas de UCI pediátrica', los: 5 * 1440 },
  { id: 'uci-neonatal', field: 'icuNeonatal', label: 'incubadoras de UCI neonatal', los: 7 * 1440 },
  { id: 'quemados', field: 'burnBeds', label: 'camas de quemados', los: 10 * 1440 },
];

/** SUPUESTO (T27): tipo de cama que necesita cada condición remitida, según el «recurso crítico» del informe. */
export const CONDITION_POOL: Record<ConditionId, PoolId> = {
  quemadura_leve: 'general',
  quemadura_grave: 'quemados',
  transito_leve: 'general',
  politrauma: 'uci-adulto',
  herida_arma: 'uci-adulto',
  iam: 'uci-adulto',
  cardiovascular_quirurgica: 'uci-adulto',
  acv: 'uci-adulto',
  tce_grave: 'uci-adulto',
  fractura_aislada: 'general',
  fractura_expuesta_shock: 'uci-adulto',
  falla_respiratoria_adulto: 'uci-adulto',
  intoxicacion_grave: 'uci-adulto',
  sepsis: 'uci-adulto',
  cancer_programado: 'general',
  radioterapia: 'general',
  dialisis_aguda: 'uci-adulto',
  crisis_psiquiatrica: 'general',
  preeclampsia: 'uci-adulto',
  nino_critico: 'uci-pediatrica',
  recien_nacido_critico: 'uci-neonatal',
  cirugia_compleja_adulto: 'uci-adulto',
  uci_adulto: 'uci-adulto',
};

/**
 * Escenario RED VALLEDUPAR: el realista + destinos reales. Entra a la simulación cada sede con urgencias y ruta
 * vial, con una unidad por cada tipo de cama DOCUMENTADO (REPS o portal institucional); la demanda propia de
 * cada unidad se fija para una ocupación media de NETWORK_OCCUPANCY. No hay restricción EPS (la urgencia no se
 * condiciona a convenio).
 */
export function networkParams(traffic: Traffic = 'fluido'): Params {
  const p = realisticParams();
  const origin = rutas.origin as SiteId;
  // T28: tiempos de ruta del router (más rápida por tiempo, velocidad por clase de vía y tráfico supuestos)
  const routes = routesFromSite(origin, traffic);
  const units = SITES.filter((s) => s.id !== origin && s.emergency && routes[s.id]).flatMap((s) =>
    POOLS.filter((k) => s.capacity[k.field]).map((k) => ({ s, k, beds: s.capacity[k.field]!.value })),
  );
  const clinics: ClinicParams[] = units.map(({ s, k, beds }, j) => {
    const r = routes[s.id]!;
    return {
      id: j,
      name: k.id === 'general' ? s.name : `${s.name} · ${k.label.replace(/^camas de |^incubadoras de /, '')}`,
      beds,
      backgroundRatePerHour: (NETWORK_OCCUPANCY * beds * 60) / k.los,
      los: { kind: 'exp', mean: k.los },
      travel: { kind: 'lognormal', mean: r.minutes, cv: 0.3 },
      travelBack: { kind: 'lognormal', mean: routesFromSite(s.id, traffic)[origin]!.minutes, cv: 0.3 },
    };
  });
  return {
    ...p,
    clinics,
    // T29: EPS reales de Valledupar. Sin cifras oficiales y completas de afiliados por EPS en el municipio, los
    // pacientes aleatorios quedan con «EPS no simulada»; la EPS real la elige el visitante en el formulario.
    eps: [...REAL_EPS.map((e) => ({ id: e.id, name: e.name, share: 0, network: [] })), { ...NO_EPS, share: 0, network: [] }, { ...UNKNOWN_EPS, share: 1, network: [] }],
    network: {
      origin,
      sites: units.map((u) => u.s.id),
      pools: units.map((u) => u.k.id),
      acceptance: { AD: 0.85, C: 0.5 },
      conditionMix: [
        { id: 'iam', p: 0.2 },
        { id: 'uci_adulto', p: 0.2 },
        { id: 'tce_grave', p: 0.1 },
        { id: 'politrauma', p: 0.1 },
        { id: 'dialisis_aguda', p: 0.1 },
        { id: 'nino_critico', p: 0.08 },
        { id: 'crisis_psiquiatrica', p: 0.07 },
        { id: 'cardiovascular_quirurgica', p: 0.05 },
        { id: 'quemadura_grave', p: 0.05 },
        { id: 'recien_nacido_critico', p: 0.05 },
      ],
      coordination: { kind: 'lognormal', mean: 30, cv: 1 },
      handover: { kind: 'lognormal', mean: 15, cv: 0.5 },
      maxWait: 720,
      traffic,
      prehospital: {
        ambulances: 2,
        scene: { kind: 'lognormal', mean: 12, cv: 0.5 },
        stabilization: { kind: 'lognormal', mean: 60, cv: 0.5 },
        epsSlack: 15,
        criticalSlack: 10,
        ownMeansFactor: 1.5,
      },
    },
  };
}
