import type { Dist } from '../engine/distributions';
import type { TriageLevel } from '../engine/events';

/**
 * EPS y clínicas FICTICIAS. Las proporciones de afiliación se inspiran en el
 * mercado real del Cesar (una EPS dominante), pero ningún nombre ni red de
 * contratos corresponde a entidades reales. Datos estimados con fines académicos.
 */
export interface ClinicParams {
  id: number;
  name: string;
  beds: number;
  /** demanda propia (pacientes que no vienen del hospital), por hora */
  backgroundRatePerHour: number;
  /** estancia en la clínica */
  los: Dist;
  /** viaje de ida en ambulancia desde el hospital */
  travel: Dist;
}

export interface EpsParams {
  id: string;
  name: string;
  share: number;
  /** ids de clínicas contratadas */
  network: number[];
}

export const CLINICS: ClinicParams[] = [
  { id: 0, name: 'Clínica Río Claro', beds: 30, backgroundRatePerHour: 0.3, los: { kind: 'exp', mean: 2880 }, travel: { kind: 'lognormal', mean: 12, cv: 0.5 } },
  { id: 1, name: 'Clínica La Pilonera', beds: 40, backgroundRatePerHour: 0.4, los: { kind: 'exp', mean: 2880 }, travel: { kind: 'lognormal', mean: 18, cv: 0.5 } },
  { id: 2, name: 'Clínica Valle Verde', beds: 50, backgroundRatePerHour: 0.5, los: { kind: 'exp', mean: 2880 }, travel: { kind: 'lognormal', mean: 25, cv: 0.5 } },
];

export const EPS_LIST: EpsParams[] = [
  { id: 'sierra', name: 'Salud Sierra EPS', share: 0.45, network: [0, 1] },
  { id: 'vallenata', name: 'Vallenata Salud', share: 0.2, network: [1, 2] },
  { id: 'cesarvida', name: 'Cesar Vida EPS', share: 0.15, network: [0, 2] },
  { id: 'guatapuri', name: 'Guatapurí Salud', share: 0.12, network: [2] },
  { id: 'otra', name: 'Otra EPS / régimen especial', share: 0.08, network: [0, 1, 2] },
];

/**
 * Síntomas para el creador de personaje → nivel de triage.
 * Ejemplos ILUSTRATIVOS inspirados en las definiciones del art. 5 de la
 * Resolución 5596 de 2015; no son una guía clínica.
 */
export const SYMPTOMS: { id: string; label: string; level: TriageLevel }[] = [
  { id: 'respira', label: 'Dificultad grave para respirar', level: 1 },
  { id: 'pecho', label: 'Dolor fuerte en el pecho', level: 2 },
  { id: 'dolor10', label: 'Dolor extremo (10 de 10)', level: 2 },
  { id: 'fiebre', label: 'Fiebre alta con mucho malestar', level: 3 },
  { id: 'abdomen', label: 'Dolor abdominal moderado', level: 3 },
  { id: 'vomito', label: 'Vómito que no para', level: 3 },
  { id: 'golpe', label: 'Golpe o esguince leve', level: 4 },
  { id: 'garganta', label: 'Dolor de garganta y fiebre leve', level: 4 },
  { id: 'gripa', label: 'Gripa de varios días', level: 5 },
  { id: 'control', label: 'Control de enfermedad crónica estable', level: 5 },
];

const FIRST = ['María', 'José', 'Luz', 'Carlos', 'Ana', 'Luis', 'Rosa', 'Jorge', 'Diana', 'Andrés', 'Yesenia', 'Rafael', 'Karen', 'Iván', 'Daniela', 'Alfredo', 'Marta', 'Kevin', 'Sandra', 'Emiliano', 'Leidy', 'Diomedes', 'Paola', 'Hernán'];
const LAST = ['Martínez', 'Gutiérrez', 'Mendoza', 'Ospino', 'Castro', 'Daza', 'Romero', 'Pumarejo', 'Arias', 'Maestre', 'Oñate', 'Zuleta', 'Quintero', 'Durán', 'Fuentes', 'Araújo', 'Molina', 'Cuello'];
export const NAMES = { FIRST, LAST };
