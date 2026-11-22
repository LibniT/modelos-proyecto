/**
 * T08 — Texto de los tooltips. Lee el estado actual del motor (`snapshot()`, SPEC §4.5), no el registro.
 */
import type { PatientSnapshot, Snapshot } from '../model/ed';
import type { Hit } from '../render/hit';

export interface Tip {
  title: string;
  lines: string[];
  /** nivel de triage para el color del título (0 = sin clasificar) */
  level?: number;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const mins = (x: number) => `${Math.max(0, x).toFixed(0)} min`;

function patientTip(p: PatientSnapshot, s: Snapshot, epsName: (id: string) => string): Tip {
  const lines = [
    `Triage: ${p.triage ? ROMAN[p.triage] : 'sin clasificar'} · edad ${p.ageRange}`,
    `EPS: ${epsName(p.eps)}`,
    `Estado: ${p.state}`,
    `En el servicio hace ${mins(s.t - p.arrival)}`,
  ];
  // waitingSince marca el inicio de la espera actual; en observación, la hora en que tomó la cama.
  if (p.state.startsWith('esperando') || p.state === 'en pasillo') lines.push(`Esperando hace ${mins(s.t - p.waitingSince)}`);
  if (p.state === 'en observación') lines.push(`En cama hace ${mins(s.t - p.waitingSince)}`);
  if (p.symptom) lines.push(`Síntoma: ${p.symptom}`);
  return { title: p.name + (p.isVisitor ? ' (visitante)' : ''), lines, level: p.triage ?? 0 };
}

const STATION_NAME: Record<string, string> = {
  triage: 'Cubículo de triage',
  admission: 'Ventanilla de admisión',
  doctor: 'Consultorio',
  bed: 'Cama de observación',
  amb: 'Ambulancia',
};

function stationTip(id: string, s: Snapshot, ambAway: ReadonlySet<string>): Tip {
  const [kind, n] = id.split('-');
  const i = Number(n);
  const cap = { triage: s.triage.capacity, admission: s.admission.capacity, doctor: s.doctors.capacity, bed: s.obsBeds.capacity, amb: s.ambulances.capacity }[kind]!;
  const who = s.patients.find((p) => p.resourceId === id && p.state !== 'caminando');
  const lines: string[] = [];
  if (who) lines.push(kind === 'amb' ? `Trasladando a ${who.name} a una clínica` : `Atiende a ${who.name}${who.triage ? ` (triage ${ROMAN[who.triage]})` : ''}`);
  else if (kind === 'amb' && ambAway.has(id)) lines.push('Regresando de la clínica');
  else if (i < cap) lines.push('Libre');
  if (i >= cap) lines.push(who ? 'Sin personal al terminar esta atención (capacidad reducida)' : 'Sin personal: la capacidad actual es menor');
  return { title: `${STATION_NAME[kind]} ${i + 1}`, lines };
}

function areaTip(name: string, s: Snapshot): Tip | undefined {
  const r = (x: { busy: number; capacity: number; queue: number }, who: string) => [`${x.busy} de ${x.capacity} ${who} ocupados`, `En cola: ${x.queue}`];
  const lines: Record<string, string[]> = {
    Triage: r(s.triage, 'puestos'),
    'Admisión': r(s.admission, 'puestos'),
    'Sala de espera': [`Esperando médico: ${s.doctors.queue}`, 'Orden de atención: por nivel de triage (I primero), sin interrumpir consultas'],
    Consultorios: r(s.doctors, 'médicos'),
    'Observación': [`${s.obsBeds.occupied} de ${s.obsBeds.capacity} camas ocupadas`],
    Camillas: [`Pacientes en pasillo: ${s.hallway}`, 'Sin cama de observación o esperando remisión'],
    Ambulancias: [`${s.ambulances.busy} de ${s.ambulances.capacity} fuera del hospital`, ...s.clinics.map((c) => `${c.name}: ${c.occupied}/${c.beds} camas`)],
  };
  return lines[name] && { title: name, lines: lines[name] };
}

export function describe(hit: Hit, s: Snapshot, epsName: (id: string) => string, ambAway: ReadonlySet<string>): Tip | undefined {
  if (hit.kind === 'patient') {
    const p = s.patients.find((x) => x.id === hit.id);
    return p && patientTip(p, s, epsName);
  }
  return hit.kind === 'station' ? stationTip(hit.id, s, ambAway) : areaTip(hit.name, s);
}
