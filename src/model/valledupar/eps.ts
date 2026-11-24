/**
 * T29 — EPS reales de Valledupar y relaciones EPS–IPS documentadas (consulta: 24 nov 2026).
 * Investigación completa, con contradicciones y vacíos: docs/EPS_VALLEDUPAR.md.
 *
 * Reglas: no se inventan relaciones; un par sin entrada es «información insuficiente», que NO significa que no
 * haya convenio. Una relación de cartera o una factura vieja no prueba un contrato vigente (queda insuficiente,
 * con nota). En el modelo la EPS nunca restringe la atención inicial de urgencias (Ley 100/1993 art. 168;
 * Ley 1751/2015 arts. 10 y 14): solo orienta el destino de pacientes estables (prehospital.ts).
 */
import type { EpsRelation } from '../prehospital';
import type { SiteId } from './sites';

export interface RealEps {
  id: string;
  name: string;
  /** código SGSSS (listado MinSalud, 05-jun-2025) */
  code: string;
  nit: string;
  regime: string;
  status: string;
  presence: 'confirmada' | 'sin evidencia';
  /** afiliados en Valledupar, si hay cifra pública */
  affiliates?: { value: number; cut: string; source: string };
  sources: string[];
}

const LISTADO = 'https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VP/DOA/listado-eps-por-regimen.pdf';

export const REAL_EPS: RealEps[] = [
  {
    id: 'nueva-eps',
    name: 'Nueva EPS',
    code: 'EPS037 / EPSS41',
    nit: '900156264',
    regime: 'contributivo y subsidiado',
    status: 'Intervenida por la Supersalud desde abr. 2024; prórroga hasta abr. 2027',
    presence: 'confirmada',
    affiliates: { value: 88756, cut: 'sep. 2025 (58 416 subsidiado + 30 340 contributivo)', source: 'https://cesarnoticias.co/alcaldia-de-valledupar-pide-al-gobierno-nacional-evitar-colapso-sanitario-por-crisis-con-nueva-eps/' },
    sources: [LISTADO, 'https://www.larepublica.co/empresas/el-gobierno-ha-extendido-la-intervencion-de-tres-eps-a-lo-largo-del-ano-4498842'],
  },
  {
    id: 'salud-total',
    name: 'Salud Total EPS',
    code: 'EPS002 / EPSS02',
    nit: '800130907',
    regime: 'contributivo (subsidiado por movilidad)',
    status: 'No intervenida',
    presence: 'confirmada',
    affiliates: { value: 131228, cut: '2023 (informe CAPO Cesar de la EPS)', source: 'https://saludtotal.com.co/wp-content/uploads/2024/06/CAPO_CESAR_2023_SALUDTOTALEPS.pdf' },
    sources: [LISTADO],
  },
  {
    id: 'proteger',
    name: 'Proteger EPS (antes Cajacopi)',
    code: 'CCF055 / CCFC55',
    nit: '901543211-6',
    regime: 'subsidiado',
    status: 'Cambio de razón social: Res. Supersalud 2025310010011891-6 (10 dic. 2025). Su retiro parcial (Res. 2025310010007194-6) no incluye a Valledupar',
    presence: 'confirmada',
    sources: ['https://pagosimple.com/wp-content/uploads/2026/03/Comunicado-cambio-CajaCopi-EPS.pdf', 'https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/IA/SSA/resolucion-20253100100071946-de-2025.pdf'],
  },
  {
    id: 'dusakawi',
    name: 'Dusakawi EPSI',
    code: 'EPSI01 / EPSIC1',
    nit: '824001398',
    regime: 'subsidiado (indígena)',
    status: 'Estado de intervención sin verificar (fuentes contradictorias)',
    presence: 'confirmada',
    sources: [LISTADO, 'https://www.larepublica.co/empresas/acuerdos-entre-eps-hospitales-y-clinicas-en-norte-de-santander-y-cesar-4493439'],
  },
  {
    id: 'sanitas',
    name: 'EPS Sanitas',
    code: 'EPS005 / EPSS05',
    nit: '800251440',
    regime: 'contributivo',
    status: 'Intervenida en abr. 2024; devuelta a Keralty desde sep. 2025',
    presence: 'confirmada',
    sources: [LISTADO, 'https://www.epssanitas.com/usuarios/documents/9441058/981232708/Red-Farmacias-PBS.pdf'],
  },
  {
    id: 'coosalud',
    name: 'Coosalud EPS',
    code: 'ESS024 / EPS042',
    nit: '900226715',
    regime: 'contributivo y subsidiado',
    status: 'Intervenida en nov. 2024; un tribunal suspendió la intervención y la Supersalud anunció la devolución (30 oct. 2026)',
    presence: 'confirmada',
    sources: [LISTADO, 'https://www.larepublica.co/empresas/coosalud-vuelve-al-control-privado-tras-decision-de-tribunal-de-terminar-intervencion-4515086'],
  },
  {
    id: 'famisanar',
    name: 'Famisanar EPS',
    code: 'EPS017 / EPSS17',
    nit: '830003564',
    regime: 'contributivo (con subsidiado)',
    status: 'Intervenida desde 2023; prórroga hasta sep. 2027',
    presence: 'confirmada',
    sources: [LISTADO, 'https://consultorsalud.com/famisanar-fortalece-gestion-territ-conciliacion/'],
  },
  {
    id: 'asmet',
    name: 'Asmet Salud EPS',
    code: 'ESS062 / ESSC62',
    nit: '900935126',
    regime: 'subsidiado',
    status: 'Intervenida desde may. 2023; prórroga hasta jun. 2027',
    presence: 'confirmada',
    sources: [LISTADO, 'https://www.elespectador.com/salud/asmet-salud-eps-seguira-intervenida-por-la-supersalud-hasta-junio-de-2027/'],
  },
];

/** Opción del formulario para quien no tiene EPS o no la conoce (la urgencia se atiende igual). */
export const NO_EPS = { id: 'sin-eps', name: 'Sin EPS o desconocida' };
/** EPS de los pacientes aleatorios: no hay cifras oficiales y completas de afiliados por EPS en Valledupar. */
export const UNKNOWN_EPS = { id: 'sin-dato', name: 'EPS no simulada (sin cifras oficiales de afiliados)' };

export interface EpsIpsRelation {
  eps: string;
  ips: SiteId;
  status: EpsRelation;
  regime?: string;
  service?: string;
  validity: string;
  note?: string;
  source: string;
  consulted: string;
}

const C = '2026-11-24';
const LIBERTAD = 'https://diariolalibertad.com/2026/09/17/grupo-clinica-medicos-suspende-servicios-a-cuatro-eps-en-valledupar-solo-atendera-urgencias-vitales/';
const suspended = (eps: string, ips: SiteId): EpsIpsRelation => ({
  eps,
  ips,
  status: 'no-vigente',
  service: 'servicios programados (mantiene urgencias vitales)',
  validity: 'desde el 17 sep. 2026',
  note: 'Suspensión del Grupo Clínica Médicos por cartera; el 30 sep. 2026 se acordó reabrir servicios para Coosalud (ejecución no verificada).',
  source: LIBERTAD,
  consulted: C,
});

export const EPS_IPS: EpsIpsRelation[] = [
  {
    eps: 'nueva-eps',
    ips: 'alta-complejidad',
    status: 'confirmada',
    validity: 'dic. 2025 (reactivada tras la suspensión del 13 nov. 2025)',
    note: 'Autorizaciones restablecidas el 2 dic. 2025; sin evidencia de nueva suspensión en 2026. Relación frágil por cartera.',
    source: 'https://www.midiario.co/2025/12/02/usuarios-de-nueva-eps-en-valledupar-levantan-bloqueo-tras-acuerdos-con-la-secretaria-de-salud/',
    consulted: C,
  },
  {
    eps: 'nueva-eps',
    ips: 'clinica-valledupar',
    status: 'confirmada',
    validity: 'dic. 2025 (reactivación del grupo)',
    note: 'Cerró servicios a Nueva EPS a fines de nov. 2025; reactivación del Grupo Clínica Médicos en dic. 2025.',
    source: 'https://www.elheraldo.co/cesar/2025/11/28/clinica-valledupar-cerro-algunos-servicios-por-falta-de-pago-de-la-nueva-eps/',
    consulted: C,
  },
  { eps: 'nueva-eps', ips: 'icvc', status: 'confirmada', validity: 'oct.–dic. 2025', note: 'Giros de Nueva EPS (30 sep. 2025) y red alterna (dic. 2025).', source: 'https://semanariolacalle.com/nueva-eps-activa-cuatro-nuevas-clinicas-en-valledupar-para-asegurar-atencion-a-sus-usuarios-en-medio-de-la-crisis/', consulted: C },
  { eps: 'nueva-eps', ips: 'clinica-cesar', status: 'confirmada', validity: 'dic. 2025', note: 'Giros (30 sep. 2025) y red alterna (dic. 2025).', source: 'https://semanariolacalle.com/nueva-eps-activa-cuatro-nuevas-clinicas-en-valledupar-para-asegurar-atencion-a-sus-usuarios-en-medio-de-la-crisis/', consulted: C },
  { eps: 'nueva-eps', ips: 'hrpl', status: 'confirmada-servicios', service: 'red alterna de Nueva EPS', validity: 'dic. 2025', note: 'En ago. 2026 el hospital suspendió servicios programados a todas las EPS por el paro de hospitales públicos (fin no verificado).', source: 'https://semanariolacalle.com/nueva-eps-activa-cuatro-nuevas-clinicas-en-valledupar-para-asegurar-atencion-a-sus-usuarios-en-medio-de-la-crisis/', consulted: C },
  { eps: 'nueva-eps', ips: 'erasmo', status: 'confirmada-servicios', service: 'urgencias y hospitalización (red de emergencia)', validity: 'dic. 2025', source: 'https://www.radioguatapuri.com/noticias/nueva-eps-activa-red-de-emergencia', consulted: C },
  suspended('coosalud', 'alta-complejidad'),
  suspended('famisanar', 'alta-complejidad'),
  suspended('asmet', 'alta-complejidad'),
  suspended('dusakawi', 'alta-complejidad'),
  suspended('coosalud', 'clinica-valledupar'),
  suspended('famisanar', 'clinica-valledupar'),
  suspended('asmet', 'clinica-valledupar'),
  suspended('dusakawi', 'clinica-valledupar'),
  {
    eps: 'proteger',
    ips: 'sohec',
    status: 'no-vigente',
    regime: 'subsidiado',
    service: 'oncología (quimioterapia y radioterapia)',
    validity: 'contrato terminado el 24 sep. 2022',
    note: 'Fallo de tutela; la relación actual no está verificada.',
    source: 'https://www.ramajudicial.gov.co/documents/36693002/124719213/2022-00333-00.pdf/e074e244-b5e5-4a24-b3da-2de6b67459b2',
    consulted: C,
  },
  {
    eps: 'famisanar',
    ips: 'clinica-cesar',
    status: 'insuficiente',
    validity: 'mar. 2026',
    note: 'Convocada a la conciliación de cartera de Famisanar: prueba una deuda, no un contrato vigente.',
    source: 'https://consultorsalud.com/famisanar-fortalece-gestion-territ-conciliacion/',
    consulted: C,
  },
  {
    eps: 'proteger',
    ips: 'simon-bolivar',
    status: 'insuficiente',
    regime: 'subsidiado',
    validity: '2021',
    note: 'Cobro ejecutivo de facturas de 2021; no prueba un contrato actual.',
    source: 'https://www.ramajudicial.gov.co/documents/30791014/67202947/AUTO+LIBRA+MANDAMIENTO+EJECUTIVO+-UNIDAD+PEDIATRICA+vs+CAJACOPI+2021-00025.pdf/37058eaa-b40f-4ffd-9d4f-b57436f8599c',
    consulted: C,
  },
];

/** Estado documentado de la relación; sin entrada → información insuficiente. */
export function epsRelation(eps: string, site: SiteId): EpsRelation {
  return EPS_IPS.find((r) => r.eps === eps && r.ips === site)?.status ?? 'insuficiente';
}
export const relationOf = (eps: string, site: SiteId) => EPS_IPS.find((r) => r.eps === eps && r.ips === site);
