/**
 * CONTRATO DEL REGISTRO DE EVENTOS — congelado (docs/SPEC.md §4.4).
 * El render y la UI SOLO consumen esto. No cambiar sin actualizar SPEC.md.
 */
export type TriageLevel = 1 | 2 | 3 | 4 | 5;

export type Zone =
  | 'entrance'
  | 'triage_queue'
  | 'triage'
  | 'admission_queue'
  | 'admission'
  | 'waiting_room'
  | 'doctor_box'
  | 'observation_bed'
  | 'hallway'
  | 'ambulance_bay'
  | 'exit'
  | `clinic_${number}`;

export type SimEventType =
  | 'ARRIVAL'
  | 'MOVE'
  | 'QUEUE_JOIN'
  | 'SERVICE_START'
  | 'SERVICE_END'
  | 'TRIAGE_ASSIGNED'
  | 'ROUTED'
  | 'BED_ASSIGNED'
  | 'BED_RELEASED'
  | 'HALLWAY_WAIT'
  | 'TRANSFER_START'
  | 'TRANSFER_END'
  | 'RENEGE'
  | 'DEPARTURE'
  | 'MASS_CASUALTY'
  | 'PARAM_CHANGE';

export interface SimEvent {
  /** minutos de simulación */
  t: number;
  /** desempate estable */
  seq: number;
  type: SimEventType;
  patientId?: string;
  /** p. ej. 'doctor-3', 'bed-12', 'amb-1', 'triage-0' */
  resourceId?: string;
  from?: Zone;
  to?: Zone;
  /** minutos (MOVE, SERVICE_START, TRANSFER_START, BED_ASSIGNED) */
  duration?: number;
  data?: Record<string, unknown>;
}

export interface AppearanceSpec {
  skin: number;
  hairStyle: number;
  hairColor: string;
  topStyle: number;
  topColor: string;
  bottomColor: string;
  accessory?: 'cap' | 'glasses' | 'mask';
}

export interface PatientInfo {
  id: string;
  name: string;
  ageRange: '0-17' | '18-39' | '40-64' | '65+';
  /** id de EPS ficticia */
  eps: string;
  symptom?: string;
  triage?: TriageLevel;
  /** creado en el stand */
  isVisitor: boolean;
  appearance?: AppearanceSpec;
}
