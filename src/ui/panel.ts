/**
 * T07 — Panel de control: deslizadores de parámetros, selector de modo, métricas en vivo y N(t).
 * Todo cambio pasa por la API del motor (setCapacity / setArrivalRate); la escena se entera por PARAM_CHANGE.
 */
import { Chart, LinearScale, LineController, LineElement, PointElement } from 'chart.js';
import type { EmergencyDepartment } from '../model/ed';
import type { Mode, Params } from '../model/params';
import type { LiveDriver } from '../render/drivers';
import { MAX } from '../render/layout';

Chart.register(LineController, LineElement, PointElement, LinearScale);

type CapKey = keyof Params['capacity'];
/** Límites = puestos dibujados en la escena (SPEC D4). */
const SLIDERS: { key: CapKey | 'lambda'; label: string; min: number; max: number; step: number }[] = [
  { key: 'lambda', label: 'Llegadas λ (pac/h, media)', min: 1, max: 30, step: 0.5 },
  { key: 'doctors', label: 'Médicos', min: 1, max: MAX.doctor, step: 1 },
  { key: 'triage', label: 'Enfermeras de triage', min: 1, max: MAX.triage, step: 1 },
  { key: 'admission', label: 'Auxiliares de admisión', min: 1, max: MAX.admission, step: 1 },
  { key: 'obsBeds', label: 'Camas de observación', min: 1, max: MAX.bed, step: 1 },
  { key: 'ambulances', label: 'Ambulancias', min: 0, max: MAX.amb, step: 1 },
];

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : '—');
const min = (x: number) => (Number.isFinite(x) ? `${x.toFixed(1)} min` : '—');
const num = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const METRICS: { label: string; show: (m: Record<string, number>) => string }[] = [
  { label: 'Cumplimiento Triage II (≤ 30 min)', show: (m) => pct(m['triageII.compliance']) },
  { label: 'Espera media por médico', show: (m) => min(m['doctor.Wq']) },
  { label: 'Espera por nivel I · II · III · IV · V', show: (m) => [1, 2, 3, 4, 5].map((l) => (Number.isFinite(m[`doctor.Wq.L${l}`]) ? m[`doctor.Wq.L${l}`].toFixed(0) : '—')).join(' · ') + ' min' },
  { label: 'Puerta–médico', show: (m) => min(m['doorToDoctor']) },
  { label: 'Utilización de médicos', show: (m) => pct(m['doctor.rho']) },
  { label: 'Camas de observación ocupadas (prom.)', show: (m) => num(m['obs.occupancy']) },
  { label: 'Pacientes en pasillo (prom.)', show: (m) => num(m['hallway.L']) },
  { label: 'Abandono IV–V', show: (m) => pct(m['renege.frac']) },
  { label: 'Remisión: complejidad · capacidad', show: (m) => `${pct(m['remit.complexity'])} · ${pct(m['remit.capacity'])}` },
  { label: 'Utilización de ambulancias', show: (m) => pct(m['amb.rho']) },
];

/** Ventana de la gráfica y paso de muestreo, en minutos simulados. */
const WINDOW = 12 * 60;
const SAMPLE = 5;

const clock = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function mountPanel(root: HTMLElement, driver: LiveDriver, makeEd: (mode: Mode) => EmergencyDepartment): void {
  root.innerHTML = `
<style>
  .pnl { background: #16202b; border-radius: 8px; padding: 12px; font-size: 13px; }
  .pnl h3 { font-size: 14px; margin: 12px 0 6px; } .pnl h3:first-child { margin-top: 0; }
  .pnl label { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin-bottom: 6px; }
  .pnl input[type=range] { grid-column: 1 / -1; width: 100%; }
  .pnl select { width: 100%; padding: 4px; background: #0f1720; color: inherit; border: 1px solid #334155; border-radius: 4px; }
  .pnl dl { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; margin: 0; }
  .pnl dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .pnl .note { font-size: 11px; opacity: .7; margin: 6px 0 0; }
  .pnl .warn { background: #422006; color: #fde68a; padding: 6px 8px; border-radius: 6px; font-size: 12px; margin-top: 10px; }
</style>
<div class="pnl">
  <h3>Modo</h3>
  <select id="pn-mode">
    <option value="realista">Realista (perfil horario, abandono)</option>
    <option value="validacion">Validación (todo exponencial, λ constante)</option>
  </select>
  <h3>Parámetros</h3>
  ${SLIDERS.map((s) => `<label>${s.label}<output id="pn-out-${s.key}"></output><input type="range" id="pn-${s.key}" aria-label="${s.label}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`).join('')}
  <h3>Métricas <span id="pn-since" style="font-weight: normal; opacity: .7"></span></h3>
  <dl>${METRICS.map((m, i) => `<dt>${m.label}</dt><dd id="pn-m${i}">—</dd>`).join('')}</dl>
  <p class="note">Cada cambio de parámetros reinicia las métricas: miden solo la configuración actual (incluye su transitorio).</p>
  <h3>Pacientes en el sistema N(t)</h3>
  <div style="height: 150px"><canvas id="pn-chart"></canvas></div>
  <p class="warn">EPS y clínicas ficticias · parámetros estimados con fines académicos.</p>
</div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const chart = new Chart($<HTMLCanvasElement>('pn-chart'), {
    type: 'line',
    data: { datasets: [{ data: [] as { x: number; y: number }[], borderColor: '#60a5fa', borderWidth: 1.5, pointRadius: 0, stepped: true }] },
    options: {
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', ticks: { color: '#94a3b8', callback: (v) => clock(Number(v) * 60), maxTicksLimit: 6 }, grid: { color: '#1e293b' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: '#1e293b' } },
      },
      plugins: { legend: { display: false } },
    },
  });
  const series = chart.data.datasets[0].data as { x: number; y: number }[];
  let nextSample = 0;

  const restartStats = () => {
    driver.ed.resetStats();
    $('pn-since').textContent = `(desde ${clock(driver.ed.now)})`;
  };

  const syncInputs = () => {
    const p = driver.ed.params;
    $<HTMLSelectElement>('pn-mode').value = p.mode;
    for (const s of SLIDERS) {
      const v = s.key === 'lambda' ? p.arrivalRatePerHour : p.capacity[s.key];
      $<HTMLInputElement>(`pn-${s.key}`).value = String(v);
      $(`pn-out-${s.key}`).textContent = String(v);
    }
  };

  for (const s of SLIDERS) {
    const input = $<HTMLInputElement>(`pn-${s.key}`);
    input.oninput = () => {
      const v = Number(input.value);
      if (s.key === 'lambda') driver.ed.setArrivalRate(v);
      else driver.ed.setCapacity(s.key, v);
      $(`pn-out-${s.key}`).textContent = String(v);
      restartStats();
    };
  }

  $<HTMLSelectElement>('pn-mode').onchange = (e) => {
    driver.load(makeEd((e.target as HTMLSelectElement).value as Mode));
    series.length = 0;
    nextSample = 0;
    syncInputs();
    restartStats();
  };

  syncInputs();
  restartStats();

  // 5 veces por segundo: métricas y muestra de N(t) leídas del motor.
  setInterval(() => {
    const ed = driver.ed;
    const m = ed.metrics();
    METRICS.forEach((x, i) => ($(`pn-m${i}`).textContent = x.show(m)));
    if (ed.now >= nextSample) {
      // Se grafica en el instante real de lectura (no en la marca teórica): N es exactamente el del motor en ese t.
      series.push({ x: ed.now / 60, y: ed.snapshot().patients.length });
      nextSample = ed.now + SAMPLE;
      while (series.length && series[0].x < (ed.now - WINDOW) / 60) series.shift();
      chart.update('none');
    }
  }, 200);
}
