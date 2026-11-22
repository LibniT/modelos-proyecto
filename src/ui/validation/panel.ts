/**
 * T11 — Pestaña "Validación": corre las réplicas del modo validación en un Web Worker
 * y compara cada medida simulada con su valor analítico (Erlang C, Cobham, Erlang B, Little).
 */
import type { ReplicationConfig, ReplicationResult } from '../../batch/replicate';
import { validationParams } from '../../model/params';
import { validationTable, type ValidationRow } from '../../validation/report';

const N = 30;
const MEASURE_DAYS = 7;

const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(1) : Math.abs(x) >= 1 ? x.toFixed(3) : x.toFixed(4));

function rowHtml(r: ValidationRow): string {
  const verdict = r.inCI ? 'sí' : r.inBonferroni ? 'sí (Bonferroni)' : 'NO';
  const cls = r.inCI ? 'ok' : r.inBonferroni ? 'warn' : 'bad';
  return `<tr><td>${r.label}</td><td>${r.formula}</td><td>${fmt(r.analytic)}</td><td>${fmt(r.mean)}</td>
    <td>[${fmt(r.lo)}, ${fmt(r.hi)}]</td><td>${(r.relError * 100).toFixed(2)} %</td><td class="${cls}">${verdict}</td></tr>`;
}

export function mountValidationPanel(root: HTMLElement): void {
  const p = validationParams();
  root.innerHTML = `
<style>
  .val table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 12px; }
  .val th, .val td { border-bottom: 1px solid #d1dbcf; padding: 7px 9px; text-align: right; }
  .val th { background: #e8eedf; color: #234c4d; }
  .val th:first-child, .val td:first-child, .val td:nth-child(2) { text-align: left; }
  .val .ok { color: #146444; } .val .warn { color: #866019; } .val .bad { color: #a53d35; font-weight: bold; }
  .val progress { width: 220px; vertical-align: middle; }
  .val .wrap { overflow-x: auto; }
</style>
<section class="val">
  <p>Escenario de validación: λ = ${p.arrivalRatePerHour}/h constante, todos los tiempos exponenciales, sin abandono.
  Triage c = ${p.capacity.triage}, admisión c = ${p.capacity.admission}, médicos c = ${p.capacity.doctors},
  observación K = ${p.capacity.obsBeds} camas. ${N} réplicas independientes, calentamiento de ${p.warmup / 1440} días
  eliminado y ${MEASURE_DAYS} días medidos por réplica. IC del 95 % con t de Student.</p>
  <button id="val-run">Correr validación</button>
  <progress id="val-prog" max="${N}" value="0" hidden></progress> <span id="val-status"></span>
  <div class="wrap"><table hidden>
    <thead><tr><th>Medida</th><th>Fórmula</th><th>Analítico</th><th>Simulado (media)</th><th>IC 95 %</th><th>Error rel.</th><th>¿En IC?</th></tr></thead>
    <tbody></tbody>
  </table></div>
</section>`;

  const btn = root.querySelector<HTMLButtonElement>('#val-run')!;
  const prog = root.querySelector<HTMLProgressElement>('#val-prog')!;
  const status = root.querySelector<HTMLSpanElement>('#val-status')!;
  const table = root.querySelector<HTMLTableElement>('table')!;

  btn.onclick = () => {
    btn.disabled = true;
    prog.hidden = false;
    prog.value = 0;
    status.textContent = `0/${N} réplicas`;
    const t0 = performance.now();
    const cfg: ReplicationConfig = { params: p, n: N, seedBase: 1000, measure: MEASURE_DAYS * 1440 };
    const w = new Worker(new URL('../../batch/worker.ts', import.meta.url), { type: 'module' });
    const finish = (msg: string) => {
      w.terminate();
      btn.disabled = false;
      prog.hidden = true;
      status.textContent = msg;
    };
    w.onerror = (e) => finish(`Error en el Worker: ${e.message}`);
    w.onmessage = (ev: MessageEvent<{ type: string; done?: number; result?: ReplicationResult }>) => {
      if (ev.data.type === 'progress') {
        prog.value = ev.data.done!;
        status.textContent = `${ev.data.done}/${N} réplicas`;
        return;
      }
      const rows = validationTable(p, ev.data.result!);
      table.tBodies[0].innerHTML = rows.map(rowHtml).join('');
      table.hidden = false;
      const ok = rows.filter((r) => r.inCI).length;
      const okB = rows.filter((r) => r.inBonferroni).length;
      finish(`${ok} de ${rows.length} valores analíticos dentro del IC 95 % · ${okB} de ${rows.length} con Bonferroni · ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    };
    w.postMessage(cfg);
  };
}
