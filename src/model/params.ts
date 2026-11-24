import type { Dist } from '../engine/distributions';
import type { TriageLevel } from '../engine/events';
import { CLINICS, EPS_LIST, type ClinicParams, type EpsParams } from './catalog';
import type { ConditionId } from './valledupar/capabilities';
import { SITES, type SiteId } from './valledupar/sites';
import rutas from './valledupar/rutas.json';

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
  /** sede de cada clínica simulada: clinics[j] ↔ sites[j] */
  sites: SiteId[];
  /** condición clínica de quien se remite (SUPUESTO) */
  conditionMix: { id: ConditionId; p: number }[];
  /** búsqueda y aceptación del destino (CRUE), antes de reservar cama y ambulancia */
  coordination: Dist;
  /** alistamiento, cargue y entrega del paciente: la ambulancia sigue ocupada antes de regresar */
  handover: Dist;
  /** espera máxima en el pasillo sin destino; después se remite fuera de la red (min) */
  maxWait: number;
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
 * Escenario RED VALLEDUPAR: el realista + destinos reales. Entra a la simulación cada sede con urgencias,
 * ruta vial y camas de adulto DOCUMENTADAS (REPS); su demanda propia se fija para una ocupación media de
 * NETWORK_OCCUPANCY con estancia de 48 h. Las sedes sin capacidad documentada no se simulan y el selector
 * las descarta con ese motivo. No hay restricción EPS (la urgencia no se condiciona a convenio).
 */
export function networkParams(): Params {
  const p = realisticParams();
  const origin = rutas.origin as SiteId;
  const routes = rutas.routes as Record<string, { minutes: number; backM: number } | null>;
  const los = 2880;
  const chosen = SITES.filter((s) => s.id !== origin && s.emergency && routes[s.id] && s.capacity.adultBeds);
  const clinics: ClinicParams[] = chosen.map((s, j) => {
    const beds = s.capacity.adultBeds!.value;
    const r = routes[s.id]!;
    return {
      id: j,
      name: s.name,
      beds,
      backgroundRatePerHour: (NETWORK_OCCUPANCY * beds * 60) / los,
      los: { kind: 'exp', mean: los },
      travel: { kind: 'lognormal', mean: r.minutes, cv: 0.3 },
      travelBack: { kind: 'lognormal', mean: (r.backM / 1000 / rutas.ambulanceKmh) * 60, cv: 0.3 },
    };
  });
  return {
    ...p,
    clinics,
    network: {
      origin,
      sites: chosen.map((s) => s.id),
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
    },
  };
}
