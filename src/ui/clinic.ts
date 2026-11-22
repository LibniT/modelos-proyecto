/**
 * T19 — Tarjeta de una clínica en el mapa: ocupación en vivo, contratos con las EPS y su referencia analítica
 * (Erlang B con su demanda propia, validada en docs/VALIDACION.md).
 */
import type { Params } from '../model/params';
import { distMean } from '../engine/distributions';
import { erlangB } from '../validation/analytic';

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d).replace('.', ',')} %`;

export function clinicCard(j: number, p: Params, occupied: number, received: number): { title: string; lines: string[] } {
  const c = p.clinics[j];
  const los = distMean(c.los);
  const a = (c.backgroundRatePerHour / 60) * los; // carga ofrecida (Erlangs) de la demanda propia
  const b = erlangB(c.beds, a);
  const eps = p.eps.filter((e) => e.network.includes(c.id)).map((e) => e.name);
  return {
    title: c.name,
    lines: [
      `Camas ocupadas: ${occupied} de ${c.beds} (${pct(occupied / c.beds)})`,
      `Remitidos desde el hospital en esta sesión: ${received}`,
      `EPS con contrato: ${eps.join(', ') || 'ninguna'}`,
      `Viaje en ambulancia: ${distMean(c.travel).toFixed(0)} min en promedio`,
      `Demanda propia: ${String(c.backgroundRatePerHour).replace('.', ',')} pacientes/h · estancia media ${(los / 60).toFixed(0)} h`,
      `Probabilidad de encontrarla llena solo con su demanda propia (${a.toFixed(1).replace('.', ',')} Erlangs, Erlang B): ${b < 0.001 ? '< 0,1 %' : pct(b, 1)}`,
    ],
  };
}
