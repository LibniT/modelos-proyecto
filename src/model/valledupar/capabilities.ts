/**
 * T25 — Matriz de recepción por tipo de paciente, transcrita TAL CUAL del informe de investigación
 * (sección "Matriz de recepción por tipo de paciente"). Es una clasificación del informe a partir de los
 * servicios habilitados en REPS: "AD" nunca significa aceptación garantizada ni cama libre.
 *
 * Códigos del informe:
 *   AD = atención definitiva documentalmente plausible · C = condicionada · ER = estabilización y remisión
 *   NH = servicio nuclear no documentado como habilitado · SI = información insuficiente.
 * Algunas celdas combinan códigos ("AD/C", "ER/C", "NH/SI") o restringen a adultos ("AD adulto").
 */
import type { SiteId } from './sites';

export type Reception = 'AD' | 'C' | 'ER' | 'NH' | 'SI';

export type ConditionId =
  | 'quemadura_leve'
  | 'quemadura_grave'
  | 'transito_leve'
  | 'politrauma'
  | 'herida_arma'
  | 'iam'
  | 'cardiovascular_quirurgica'
  | 'acv'
  | 'tce_grave'
  | 'fractura_aislada'
  | 'fractura_expuesta_shock'
  | 'falla_respiratoria_adulto'
  | 'intoxicacion_grave'
  | 'sepsis'
  | 'cancer_programado'
  | 'radioterapia'
  | 'dialisis_aguda'
  | 'crisis_psiquiatrica'
  | 'preeclampsia'
  | 'nino_critico'
  | 'recien_nacido_critico'
  | 'cirugia_compleja_adulto'
  | 'uci_adulto';

export const CONDITION_LABEL: Record<ConditionId, string> = {
  quemadura_leve: 'Quemadura leve',
  quemadura_grave: 'Quemadura extensa o grave',
  transito_leve: 'Accidente de tránsito leve o moderado',
  politrauma: 'Politrauma grave',
  herida_arma: 'Herida por arma blanca o de fuego',
  iam: 'Infarto con posible angioplastia',
  cardiovascular_quirurgica: 'Emergencia cardiovascular quirúrgica',
  acv: 'Accidente cerebrovascular (ACV)',
  tce_grave: 'Trauma craneoencefálico grave',
  fractura_aislada: 'Fractura aislada',
  fractura_expuesta_shock: 'Fractura expuesta con shock',
  falla_respiratoria_adulto: 'Falla respiratoria (adulto)',
  intoxicacion_grave: 'Intoxicación grave',
  sepsis: 'Infección grave o sepsis',
  cancer_programado: 'Cáncer, tratamiento programado',
  radioterapia: 'Radioterapia',
  dialisis_aguda: 'Falla renal con diálisis aguda',
  crisis_psiquiatrica: 'Crisis psiquiátrica estable',
  preeclampsia: 'Preeclampsia o eclampsia grave',
  nino_critico: 'Niño crítico',
  recien_nacido_critico: 'Recién nacido crítico',
  cirugia_compleja_adulto: 'Cirugía de emergencia compleja (adulto)',
  uci_adulto: 'Necesidad de UCI adulto',
};

/** Columnas de la matriz, en el orden del informe. */
export const MATRIX_SITES: SiteId[] = ['alta-complejidad', 'hrpl', 'icvc', 'ohi', 'simon-bolivar', 'clinica-cesar', 'erasmo', 'fracturas', 'san-lucas'];

/** Celdas textuales del informe (una fila por condición, columnas en el orden de MATRIX_SITES). */
export const RECEPTION_MATRIX: Record<ConditionId, string[]> = {
  quemadura_leve: ['AD', 'AD', 'C', 'C', 'C', 'C', 'C', 'C', 'NH'],
  quemadura_grave: ['AD', 'ER/C', 'ER', 'ER', 'ER', 'ER', 'ER', 'ER', 'NH'],
  transito_leve: ['AD', 'AD', 'AD/C', 'AD', 'AD/C', 'AD', 'AD', 'AD/C', 'NH'],
  politrauma: ['AD', 'AD', 'AD/C adulto', 'AD', 'C', 'C', 'C', 'ER', 'NH'],
  herida_arma: ['AD', 'AD', 'AD/C adulto', 'AD', 'C', 'C', 'C', 'ER', 'NH'],
  iam: ['AD', 'C', 'AD', 'C', 'C', 'C', 'ER', 'NH', 'NH'],
  cardiovascular_quirurgica: ['AD', 'C', 'AD', 'C', 'C', 'C', 'ER', 'NH', 'NH'],
  acv: ['AD', 'AD', 'AD/C', 'AD/C', 'C', 'C', 'C', 'ER', 'NH'],
  tce_grave: ['AD', 'AD', 'AD adulto', 'C', 'C', 'C', 'C', 'ER', 'NH'],
  fractura_aislada: ['AD', 'AD', 'AD', 'AD', 'AD/C', 'AD', 'AD', 'AD', 'NH'],
  fractura_expuesta_shock: ['AD', 'AD', 'AD adulto', 'AD', 'C', 'C', 'C', 'ER/C', 'NH'],
  falla_respiratoria_adulto: ['AD', 'AD', 'AD', 'AD', 'AD', 'AD', 'AD', 'ER', 'NH'],
  intoxicacion_grave: ['AD', 'AD', 'AD/C', 'AD/C', 'C', 'C', 'C', 'ER', 'ER'],
  sepsis: ['AD', 'AD', 'AD adulto', 'AD', 'AD', 'AD', 'C', 'ER', 'NH'],
  cancer_programado: ['AD', 'C', 'C', 'AD/C', 'C', 'C', 'C', 'NH', 'NH'],
  radioterapia: ['NH/SI', 'NH/SI', 'NH/SI', 'NH/SI', 'NH/SI', 'NH/SI', 'NH', 'NH', 'NH'],
  dialisis_aguda: ['AD', 'C', 'AD', 'C', 'C', 'C', 'C', 'NH', 'NH'],
  crisis_psiquiatrica: ['ER', 'AD', 'ER', 'ER', 'ER', 'ER', 'ER', 'ER', 'AD'],
  preeclampsia: ['AD', 'AD', 'ER', 'AD', 'C/AD', 'C/AD', 'ER', 'NH', 'NH'],
  nino_critico: ['AD', 'AD', 'ER', 'AD', 'AD', 'AD', 'C', 'ER', 'NH'],
  recien_nacido_critico: ['AD', 'AD', 'NH/ER', 'AD', 'AD', 'AD', 'ER', 'NH', 'NH'],
  cirugia_compleja_adulto: ['AD', 'AD', 'AD', 'AD', 'C', 'C', 'C', 'ER', 'NH'],
  uci_adulto: ['AD', 'AD', 'AD', 'AD', 'AD', 'AD', 'AD', 'ER', 'NH'],
};

export interface Cell {
  /** clase operativa, interpretada de forma conservadora */
  level: Reception;
  /** la celda solo aplica a adultos ("AD adulto") */
  adultOnly: boolean;
  /** texto original del informe */
  raw: string;
}

const STRENGTH: Record<Exclude<Reception, 'SI'>, number> = { AD: 3, C: 2, ER: 1, NH: 0 };

/**
 * Interpreta una celda. Regla conservadora (supuesto de modelado): si la celda combina códigos se toma el
 * MÁS DÉBIL ("AD/C" → C, "ER/C" → ER, "NH/ER" → NH); cualquier "SI" la vuelve información insuficiente.
 */
export function parseCell(raw: string): Cell {
  const adultOnly = /\badulto\b/.test(raw);
  const codes = raw.replace(/\badulto\b/, '').trim().split('/').map((s) => s.trim());
  for (const c of codes) if (!['AD', 'C', 'ER', 'NH', 'SI'].includes(c)) throw new Error(`Celda no reconocida: "${raw}"`);
  if (codes.includes('SI')) return { level: 'SI', adultOnly, raw };
  const level = (codes as Exclude<Reception, 'SI'>[]).reduce((a, b) => (STRENGTH[b] < STRENGTH[a] ? b : a));
  return { level, adultOnly, raw };
}

/**
 * Recepción documentada de una condición en una sede. Las sedes fuera de la matriz (Santa Isabel, Clínica
 * Valledupar, SOHEC) devuelven SI: el informe no las clasifica, y eso no se rellena con un supuesto.
 * Para un paciente menor de edad, una celda "solo adultos" no aplica y se trata como ER.
 */
export function reception(condition: ConditionId, site: SiteId, adult = true): Cell {
  const col = MATRIX_SITES.indexOf(site);
  if (col < 0) return { level: 'SI', adultOnly: false, raw: 'sin clasificar en el informe' };
  const cell = parseCell(RECEPTION_MATRIX[condition][col]);
  return cell.adultOnly && !adult ? { ...cell, level: 'ER' } : cell;
}

export const RECEPTION_LABEL: Record<Reception, string> = {
  AD: 'atención definitiva documentalmente plausible',
  C: 'atención condicionada',
  ER: 'estabilización y remisión',
  NH: 'servicio no documentado como habilitado',
  SI: 'información insuficiente',
};
