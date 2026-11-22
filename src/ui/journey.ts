/**
 * T16 — Tarjeta de recorrido: se arma con `DEPARTURE.data.journey` (SPEC E3), sin consultar nada más del registro.
 */
import type { SimEvent } from '../engine/events';
import type { Journey } from '../model/ed';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const clock = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const mins = (x: number) => `${x.toFixed(0)} min`;

export interface Card {
  title: string;
  level: number;
  lines: string[];
}

/** `avgDoorToDoctor`: promedio puerta–médico de la corrida (métricas del motor), para comparar. */
export function journeyCard(e: SimEvent, avgDoorToDoctor: number): Card {
  const d = e.data as { journey: Journey; level: number; name: string; isVisitor: boolean };
  const j = d.journey;
  const lines = [`Nivel de triage: ${ROMAN[d.level]}`];
  lines.push(`Llegó a las ${clock(j.arrival)} y salió a las ${clock(j.departure ?? e.t)}: ${mins((j.departure ?? e.t) - j.arrival)} en el servicio`);
  if (j.triageWait !== undefined) lines.push(`Espera para el triage: ${mins(j.triageWait)}`);
  if (j.admissionWait !== undefined) lines.push(`Espera en admisión: ${mins(j.admissionWait)}`);
  if (j.doctorWait !== undefined) {
    // doctorWait se mide desde el fin del triage hasta el médico: es la medida de la Res. 5596.
    const norm = d.level === 2 ? ` (Res. 5596, Triage II ≤ 30 min: ${j.doctorWait <= 30 ? 'cumplió' : 'NO cumplió'})` : '';
    lines.push(`Del triage al médico: ${mins(j.doctorWait)}${norm}`);
  }
  if (j.doorToDoctor !== undefined)
    lines.push(`Puerta–médico: ${mins(j.doorToDoctor)}${Number.isFinite(avgDoorToDoctor) ? ` (promedio de todos hoy: ${mins(avgDoorToDoctor)})` : ''}`);
  if (j.hallwayWait !== undefined) lines.push(`Esperó en el pasillo: ${mins(j.hallwayWait)}`);
  if (j.observationTime !== undefined) lines.push(`En observación: ${mins(j.observationTime)}`);
  const outcome = { alta: 'Alta a la casa', hospitalizacion: 'Hospitalizado', remitido: `Remitido a ${j.clinic ?? 'una clínica'} en ambulancia`, abandono: 'Se fue sin ser atendido (abandono)' };
  lines.push(`Desenlace: ${j.outcome ? outcome[j.outcome] : '—'}`);
  return { title: `Recorrido de ${d.name}${d.isVisitor ? ' (tu paciente)' : ''}`, level: d.level, lines };
}
