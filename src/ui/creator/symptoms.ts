/**
 * Síntomas del creador → nivel de triage (SPEC E1, §8.5). Ejemplos ILUSTRATIVOS ordenados según las
 * definiciones de los cinco niveles de la Resolución 5596 de 2015 (MinSalud, Colombia):
 * I = amenaza inmediata para la vida; II = puede deteriorarse rápido (atención ≤ 30 min);
 * III = requiere estudios o tratamiento en urgencias, estable; IV = sin compromiso del estado general;
 * V = problema agudo o crónico sin deterioro. No son orientación médica: en la realidad clasifica un profesional.
 */
import type { TriageLevel } from '../../engine/events';

export const SYMPTOMS: { text: string; level: TriageLevel }[] = [
  { text: 'No respira o está inconsciente', level: 1 },
  { text: 'Sangrado abundante que no se detiene', level: 1 },
  { text: 'Dolor en el pecho que se extiende al brazo', level: 2 },
  { text: 'Dificultad grave para respirar', level: 2 },
  { text: 'Debilidad o adormecimiento súbito de un lado del cuerpo', level: 2 },
  { text: 'Dolor abdominal intenso', level: 3 },
  { text: 'Fiebre alta con vómito', level: 3 },
  { text: 'Posible fractura de brazo o pierna', level: 3 },
  { text: 'Herida pequeña que necesita puntos', level: 4 },
  { text: 'Dolor de oído o de garganta', level: 4 },
  { text: 'Síntomas de gripa leve', level: 5 },
  { text: 'Control o renovación de fórmula médica', level: 5 },
];

export const LEVEL_NAME = ['', 'I', 'II', 'III', 'IV', 'V'];
