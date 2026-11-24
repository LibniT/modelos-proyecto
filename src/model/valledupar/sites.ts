/**
 * T25 — Sedes hospitalarias de Valledupar: HECHOS DOCUMENTADOS, sin supuestos de simulación.
 *
 * Fuente principal: informe de investigación del 24 nov 2026
 * (`docs/investigacion/red-hospitalaria-valledupar-2026-11-24.md`), que contrasta REPS (base visible
 * producida el 4 nov 2026), SISPRO y portales institucionales.
 *
 * Reglas de este archivo:
 * - Un dato no documentado es `null`, nunca 0 ni un valor inventado.
 * - "Habilitado" o "instalado" NO significa cupo libre: la disponibilidad la decide la simulación
 *   (supuestos aparte, en el escenario de red).
 * - Coordenadas: se agregan en F2 desde OpenStreetMap; hasta entonces `geo = null`.
 */

export type SourceId =
  | 'informe'
  | 'reps'
  | 'sispro'
  | 'minsalud-triage'
  | 'minsalud-sem'
  | 'web-alta-complejidad'
  | 'web-hrpl'
  | 'web-clinica-valledupar'
  | 'web-sohec';

export interface Source {
  title: string;
  url?: string;
  /** fecha del dato o de la consulta (AAAA-MM-DD) */
  date: string;
}

export const SOURCES: Record<SourceId, Source> = {
  informe: { title: 'Informe de investigación: red hospitalaria y capacidad de atención de Valledupar', date: '2026-11-24' },
  reps: { title: 'REPS — Registro Especial de Prestadores de Servicios de Salud (MinSalud)', url: 'https://prestadores.minsalud.gov.co/habilitacion/', date: '2026-11-04' },
  sispro: { title: 'SISPRO — REPS, capacidad instalada', url: 'https://www.sispro.gov.co/central-prestadores-de-servicios/Pages/REPS-Registro-especial-de-prestadores-de-servicios-de-salud.aspx', date: '2026-11-24' },
  'minsalud-triage': { title: 'MinSalud — Triaje (Resolución 5596 de 2015)', url: 'https://www2.minsalud.gov.co/salud/emergencias-y-desastres/Paginas/triage.aspx', date: '2026-11-24' },
  'minsalud-sem': { title: 'MinSalud — Sistema de Emergencias Médicas (Res. 926 de 2017) y CRUE', url: 'https://www.minsalud.gov.co/salud/prestacion-servicios/Paginas/Sistema-de-emergencias-medicas-SEM.aspx', date: '2026-11-24' },
  'web-alta-complejidad': { title: 'Clínica Alta Complejidad del Caribe — portal institucional', url: 'https://www.clinicaaltacomplejidad.com/', date: '2026-11-24' },
  'web-hrpl': { title: 'Hospital Rosario Pumarejo de López — portal institucional', url: 'https://hrplopez.gov.co/', date: '2026-11-24' },
  'web-clinica-valledupar': { title: 'Clínica Valledupar — portal institucional', url: 'https://www.clinicavalledupar.com.co/', date: '2026-11-24' },
  'web-sohec': { title: 'SOHEC — portal institucional', url: 'https://sohec.com.co/', date: '2026-11-24' },
};

/** Un número con su procedencia. */
export interface Fact {
  value: number;
  source: SourceId;
  note?: string;
}

export type SiteId =
  | 'alta-complejidad'
  | 'hrpl'
  | 'icvc'
  | 'ohi'
  | 'ohi-santa-isabel'
  | 'simon-bolivar'
  | 'clinica-cesar'
  | 'clinica-valledupar'
  | 'erasmo'
  | 'fracturas'
  | 'san-lucas'
  | 'sohec';

export interface Capacity {
  adultBeds: Fact | null;
  pediatricBeds: Fact | null;
  icuAdult: Fact | null;
  icuPediatric: Fact | null;
  icuNeonatal: Fact | null;
  intermediateAdult: Fact | null;
  observation: Fact | null;
  operatingRooms: Fact | null;
  emergencyRooms: Fact | null;
  ambulances: Fact | null;
  burnBeds: Fact | null;
}

export interface Site {
  id: SiteId;
  name: string;
  /** código de prestador REPS, solo si el informe lo documenta */
  repsCode: string | null;
  address: string;
  ownership: 'publica' | 'privada';
  /** urgencias habilitadas según el informe (SOHEC es ambulatoria) */
  emergency: boolean;
  role: string;
  /** servicios habilitados relevantes para urgencias y remisión */
  services: string[];
  capacity: Capacity;
  /** fuentes generales de la ficha */
  sources: SourceId[];
  /** advertencias de procedencia o discrepancias */
  notes: string[];
  /** coordenadas WGS84; F2 las toma de OpenStreetMap */
  geo: { lat: number; lon: number; source: string } | null;
}

const none: Capacity = {
  adultBeds: null,
  pediatricBeds: null,
  icuAdult: null,
  icuPediatric: null,
  icuNeonatal: null,
  intermediateAdult: null,
  observation: null,
  operatingRooms: null,
  emergencyRooms: null,
  ambulances: null,
  burnBeds: null,
};
const reps = (value: number, note?: string): Fact => ({ value, source: 'reps', ...(note ? { note } : {}) });

export const SITES: Site[] = [
  {
    id: 'alta-complejidad',
    name: 'Clínica Médicos – Alta Complejidad del Caribe',
    repsCode: null,
    address: 'Calle 14 #17-47',
    ownership: 'privada',
    emergency: true,
    role: 'Principal nodo privado de alta complejidad; urgencias 24 h adultos y pediatría.',
    services: ['UCI adulto', 'UCI pediátrica', 'UCI neonatal', 'unidad de quemados', 'neurocirugía alta complejidad', 'cirugía cardiovascular', 'hemodinamia', 'hemodiálisis', 'cirugía ortopédica', 'parto alta complejidad', 'imágenes'],
    capacity: {
      ...none,
      adultBeds: reps(173),
      icuAdult: reps(61),
      intermediateAdult: reps(38),
      icuNeonatal: reps(15, 'incubadoras UCI neonatal'),
      operatingRooms: reps(11),
      emergencyRooms: reps(5, 'consultorios de urgencias'),
      burnBeds: { value: 14, source: 'web-alta-complejidad', note: 'publicado por la institución; la ficha REPS consultada no lo separa como categoría' },
    },
    sources: ['reps', 'web-alta-complejidad', 'informe'],
    notes: ['Única unidad dedicada de quemados documentada en la investigación; no se afirma exclusividad legal.', 'UCI pediátrica habilitada sin número documentado.'],
    geo: null,
  },
  {
    id: 'hrpl',
    name: 'Hospital Rosario Pumarejo de López E.S.E.',
    repsCode: null,
    address: 'Calle 16C #17-141',
    ownership: 'publica',
    emergency: true,
    role: 'Público departamental (ESE nivel 2 en REPS); principal centro de referencia del norte del Cesar.',
    services: ['UCI adulto', 'UCI pediátrica', 'UCI neonatal', 'neurocirugía alta complejidad', 'cirugía general', 'cirugía ortopédica', 'obstetricia', 'toxicología', 'psiquiatría', 'salud mental', 'transporte asistencial'],
    capacity: {
      ...none,
      adultBeds: reps(114),
      operatingRooms: reps(8),
      ambulances: reps(5),
      observation: { value: 105, source: 'web-hrpl', note: 'camillas de la nueva urgencia (adultos, pediatría, obstetricia), informado por la institución en 2026' },
    },
    sources: ['reps', 'web-hrpl', 'informe'],
    notes: ['UCI adulto, pediátrica y neonatal habilitadas sin número documentado en el informe.'],
    geo: null,
  },
  {
    id: 'icvc',
    name: 'Instituto Cardiovascular del Cesar',
    repsCode: null,
    address: 'Carrera 16 #16A-42',
    ownership: 'privada',
    emergency: true,
    role: 'Nodo cardiovascular especializado (adultos).',
    services: ['UCI adulto', 'cirugía cardiovascular', 'cirugía vascular', 'cirugía torácica', 'hemodinamia', 'hemodiálisis', 'neurocirugía alta complejidad', 'urgencias alta complejidad'],
    capacity: {
      ...none,
      adultBeds: reps(114),
      icuAdult: reps(22),
      intermediateAdult: reps(18),
      observation: reps(20, 'camillas de observación'),
      operatingRooms: reps(2),
    },
    sources: ['reps', 'informe'],
    notes: ['2 puestos de hemodiálisis (REPS).', 'Sin UCI pediátrica documentada: no es destino pediátrico crítico primario.'],
    geo: null,
  },
  {
    id: 'ohi',
    name: 'OHI Organización Humana Integral – sede principal',
    repsCode: '2000100018',
    address: 'Carrera 19 #14-47',
    ownership: 'privada',
    emergency: true,
    role: 'Hospital de alta complejidad multiedad.',
    services: ['UCI adulto', 'UCI pediátrica', 'UCI neonatal', 'neurocirugía', 'cirugía torácica', 'cirugía ortopédica', 'cirugía pediátrica', 'oncología', 'parto', 'urgencias alta complejidad'],
    capacity: {
      ...none,
      adultBeds: reps(123),
      pediatricBeds: reps(45),
      icuAdult: reps(19),
      icuPediatric: reps(8),
      icuNeonatal: reps(18, 'incubadoras UCI neonatal'),
      intermediateAdult: reps(21),
      operatingRooms: reps(4),
      emergencyRooms: reps(7, 'consultorios de urgencias'),
      ambulances: reps(3),
    },
    sources: ['reps', 'informe'],
    notes: ['Identificar por código REPS 2000100018; los nombres comerciales históricos pueden duplicarla.'],
    geo: null,
  },
  {
    id: 'ohi-santa-isabel',
    name: 'Clínica Santa Isabel L.D. – OHI',
    repsCode: '2000100018',
    address: 'Carrera 18D #22-33',
    ownership: 'privada',
    emergency: true,
    role: 'Segunda sede de OHI (no es un prestador independiente); adulto crítico y quirúrgico.',
    services: ['UCI adulto', 'cirugía ortopédica', 'cirugía plástica', 'cirugía vascular', 'cirugía torácica', 'cirugía general', 'neurocirugía complejidad media'],
    capacity: { ...none },
    sources: ['reps', 'informe'],
    notes: ['Sin cifras de capacidad en el informe.', 'No aparece en la matriz de recepción del informe: su compatibilidad es "información insuficiente".'],
    geo: null,
  },
  {
    id: 'simon-bolivar',
    name: 'Unidad Pediátrica Simón Bolívar IPS',
    repsCode: null,
    address: 'Carrera 18D #28-41',
    ownership: 'privada',
    emergency: true,
    role: 'Orientación materno-infantil; REPS registra también servicios de adultos.',
    services: ['UCI neonatal', 'UCI pediátrica', 'UCI adulto', 'cirugía pediátrica', 'gineco-obstetricia', 'cirugía general', 'neurocirugía complejidad media', 'imágenes', 'transporte medicalizado'],
    capacity: { ...none },
    sources: ['reps', 'informe'],
    notes: ['El informe menciona infraestructura relevante sin cifras: capacidad no documentada.'],
    geo: null,
  },
  {
    id: 'clinica-cesar',
    name: 'Clínica del Cesar S.A.',
    repsCode: null,
    address: 'Calle 16 #14-90',
    ownership: 'privada',
    emergency: true,
    role: 'Hospital general mixto adulto–materno–infantil.',
    services: ['UCI adulto', 'UCI pediátrica', 'UCI neonatal', 'hospitalización', 'cirugía', 'urgencias', 'obstetricia'],
    capacity: {
      ...none,
      adultBeds: reps(92),
      pediatricBeds: reps(22),
      icuAdult: reps(12),
      icuPediatric: reps(6, 'cunas UCI pediátrica'),
      icuNeonatal: reps(8, 'incubadoras UCI neonatal'),
      operatingRooms: reps(3),
      emergencyRooms: reps(4, 'consultorios de urgencias'),
    },
    sources: ['reps', 'informe'],
    notes: [],
    geo: null,
  },
  {
    id: 'clinica-valledupar',
    name: 'Clínica Valledupar S.A.',
    repsCode: null,
    address: 'Calle 16 #15-15',
    ownership: 'privada',
    emergency: true,
    role: 'Hospitalización adulto de alta complejidad, pediatría, UCI adulto y cirugía.',
    services: ['UCI adulto', 'cirugía', 'urgencias', 'unidad cardiovascular (portal)', 'cirugía cardiovascular (portal)', 'unidad transfusional 24 h (portal)'],
    capacity: { ...none },
    sources: ['reps', 'web-clinica-valledupar', 'informe'],
    notes: ['REPS confirma UCI adulto y hospitalización; las cifras del portal institucional no están verificadas contra REPS.', 'No aparece en la matriz de recepción del informe: su compatibilidad es "información insuficiente".'],
    geo: null,
  },
  {
    id: 'erasmo',
    name: 'Clínica Erasmo',
    repsCode: null,
    address: 'Carrera 19 #4C-72',
    ownership: 'privada',
    emergency: true,
    role: 'Trauma y ortopedia con soporte crítico adulto.',
    services: ['UCI adulto', 'cuidado intermedio', 'cirugía ortopédica', 'cirugía general', 'neurocirugía complejidad media', 'urgencias'],
    capacity: { ...none, adultBeds: reps(21), icuAdult: reps(7), intermediateAdult: reps(3), operatingRooms: reps(3) },
    sources: ['reps', 'informe'],
    notes: [],
    geo: null,
  },
  {
    id: 'fracturas',
    name: 'Clínica de Fracturas Valledupar',
    repsCode: null,
    address: 'Diagonal 20B #18D-76',
    ownership: 'privada',
    emergency: true,
    role: 'IPS focalizada en ortopedia y fracturas; no es un hospital de trauma con UCI.',
    services: ['hospitalización adulto', 'cirugía ortopédica', 'cirugía maxilofacial', 'cirugía plástica', 'urgencias'],
    capacity: { ...none, adultBeds: reps(4), operatingRooms: reps(1), ambulances: reps(4, 'ambulancias básicas') },
    sources: ['reps', 'informe'],
    notes: [],
    geo: null,
  },
  {
    id: 'san-lucas',
    name: 'Clínica de Urgencias de Salud Mental San Lucas',
    repsCode: null,
    address: 'Calle 15 #10-28',
    ownership: 'privada',
    emergency: true,
    role: 'Urgencias y hospitalización psiquiátrica; no es UCI médico-quirúrgica.',
    services: ['hospitalización salud mental', 'servicio farmacéutico', 'urgencias'],
    capacity: { ...none },
    sources: ['reps', 'informe'],
    notes: ['Intoxicación con inestabilidad fisiológica: primero hospital general (inferencia clínica del informe).'],
    geo: null,
  },
  {
    id: 'sohec',
    name: 'SOHEC – Sociedad de Oncología y Hematología del Cesar',
    repsCode: null,
    address: 'Carrera 15 #14-91 (radioterapia: Diagonal 21 #30-55)',
    ownership: 'privada',
    emergency: false,
    role: 'Oncología y hematología ambulatoria especializada; no recibe urgencias.',
    services: ['oncología clínica', 'oncología pediátrica', 'hematología', 'cirugía oncológica', 'quimioterapia', 'radioterapia'],
    capacity: { ...none },
    sources: ['reps', 'web-sohec', 'informe'],
    notes: ['28 sillas de quimioterapia y 3 salas de radioterapia (REPS).', 'No es la única prestadora de radioterapia del municipio (Rosalud 777 también la registra).'],
    geo: null,
  },
];

export const siteById = (id: SiteId): Site => {
  const s = SITES.find((x) => x.id === id);
  if (!s) throw new Error(`Sede desconocida: ${id}`);
  return s;
};
