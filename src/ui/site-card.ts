/**
 * T26 — Ficha completa de una sede de la red real (sin DOM): hechos documentados con su fuente, ubicación y
 * ruta (con el método y si hay que verificarla), qué atiende según la matriz del informe y por qué se simula o no.
 */
import rutas from '../model/valledupar/rutas.json';
import { CONDITION_LABEL, RECEPTION_MATRIX, reception, type ConditionId, type Reception } from '../model/valledupar/capabilities';
import { SITES, SOURCES, type Capacity, type SiteId } from '../model/valledupar/sites';

const CAPACITY_LABEL: Record<keyof Capacity, string> = {
  adultBeds: 'Camas de adulto',
  pediatricBeds: 'Camas pediátricas',
  icuAdult: 'UCI adulto',
  icuPediatric: 'UCI pediátrica',
  icuNeonatal: 'UCI neonatal',
  intermediateAdult: 'Cuidado intermedio adulto',
  observation: 'Observación',
  operatingRooms: 'Quirófanos',
  emergencyRooms: 'Consultorios de urgencias',
  ambulances: 'Ambulancias',
  burnBeds: 'Camas de quemados',
};
const GROUP: [Reception, string][] = [
  ['AD', 'Atención definitiva documentada'],
  ['C', 'Condicionada'],
  ['ER', 'Estabiliza y remite'],
  ['NH', 'No habilitado (servicio no documentado)'],
  ['SI', 'Sin información suficiente'],
];
const km = (m: number) => `${(m / 1000).toFixed(2).replace('.', ',')} km`;

/** `simulated`: si la sede entra a la simulación (en ese caso la ocupación va en la tarjeta de la clínica). */
export function siteLines(id: SiteId, simulated: boolean): string[] {
  const s = SITES.find((x) => x.id === id)!;
  const geo = (rutas.sites as Record<string, { method: string; verify: boolean; note: string }>)[id];
  const route = (rutas.routes as Record<string, { distanceM: number; straightM: number; minutes: number } | null>)[id];
  const lines = [
    `${s.address} · ${s.ownership === 'publica' ? 'pública' : 'privada'}${s.repsCode ? ` · código REPS ${s.repsCode}` : ''}`,
    s.role,
  ];
  if (!simulated && id !== rutas.origin)
    lines.push(s.emergency ? 'No se simula: sin camas documentadas en las fuentes revisadas (no se inventan).' : 'No se simula: no recibe urgencias.');
  lines.push(
    geo ? `Ubicación ${geo.verify ? 'APROXIMADA (verificar)' : 'verificada'}: ${geo.note}.` : 'Ubicación: no se pudo ubicar con OpenStreetMap; no aparece en el mapa.',
  );
  if (route) lines.push(`Ruta vial desde el hospital de origen: ${km(route.distanceM)} (en línea recta ${km(route.straightM)}) · ${route.minutes.toFixed(1).replace('.', ',')} min a 30 km/h (supuesto).`);
  const facts = (Object.keys(CAPACITY_LABEL) as (keyof Capacity)[])
    .filter((k) => s.capacity[k])
    .map((k) => {
      const f = s.capacity[k]!;
      return `${CAPACITY_LABEL[k]}: ${f.value}${f.note ? ` (${f.note})` : ''} · ${f.source === 'reps' ? 'REPS' : SOURCES[f.source].title}`;
    });
  lines.push(facts.length ? 'Capacidad documentada — ' + facts.join(' · ') : 'Capacidad documentada: ninguna cifra en las fuentes revisadas.');
  lines.push('Servicios habilitados: ' + s.services.join(', ') + '.');
  const conditions = Object.keys(RECEPTION_MATRIX) as ConditionId[];
  for (const [level, label] of GROUP) {
    const list = conditions.filter((c) => reception(c, id).level === level).map((c) => CONDITION_LABEL[c]);
    if (list.length) lines.push(`${label}: ${list.join(', ')}.`);
  }
  lines.push(...s.notes);
  lines.push('Fuentes: ' + s.sources.map((k) => `${SOURCES[k].title} (${SOURCES[k].date})`).join('; ') + '.');
  return lines;
}
