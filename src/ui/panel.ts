/**
 * T07 — Panel de control: deslizadores de parámetros, selector de modo, métricas en vivo y N(t).
 * Todo cambio pasa por la API del motor (setCapacity / setArrivalRate); la escena se entera por PARAM_CHANGE.
 */
import { Chart, LinearScale, LineController, LineElement, PointElement } from 'chart.js';
import type { Mode, Params } from '../model/params';
import type { LiveDriver } from '../render/drivers';
import { MAX } from '../render/layout';

Chart.register(LineController, LineElement, PointElement, LinearScale);

type CapKey = keyof Params['capacity'];
/** Límites = puestos dibujados en la escena (SPEC D4). */
const SLIDERS: { key: CapKey | 'lambda'; label: string; min: number; max: number; step: number }[] = [
  { key: 'lambda', label: 'Llegadas λ (pac/h)', min: 1, max: 30, step: 0.5 },
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

/** Ventana de la gráfica, en minutos simulados. */
const WINDOW = 12 * 60;

const clock = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** `reload(mode)` carga en el driver un motor nuevo del modo pedido (y su gemelo, T17). */
export function mountPanel(root: HTMLElement, driver: LiveDriver, reload: (mode: Mode) => void): void {
  root.innerHTML = `
<div class="pnl">
  <h3><label for="pn-mode">Modo de simulación</label></h3>
  <select id="pn-mode">
    <option value="realista">Realista · perfil horario y abandono</option>
    <option value="validacion">Validación · λ constante</option>
  </select>
  <details open><summary>Capacidad y llegadas</summary><div class="sliders">
    ${SLIDERS.map((s) => `<label>${s.label}<output id="pn-out-${s.key}"></output><input type="range" id="pn-${s.key}" aria-label="${s.label}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`).join('')}
  </div></details>
  <div class="chart"><h3>Pacientes en el sistema</h3>
    <div class="chart-box"><canvas id="pn-chart" aria-label="Pacientes a lo largo de las últimas doce horas simuladas"></canvas></div>
    <p class="note" id="pn-twin-note" hidden>La línea punteada muestra el mismo hospital sin el accidente, con la misma semilla.</p>
  </div>
  <details open><summary>Métricas <small id="pn-since"></small></summary>
    <dl>${METRICS.map((m, i) => `<dt>${m.label}</dt><dd id="pn-m${i}">—</dd>`).join('')}</dl>
    <p class="note">Cada cambio de parámetros reinicia las métricas. Incluyen el transitorio de la configuración actual.</p>
  </details>
</div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const chart = new Chart($<HTMLCanvasElement>('pn-chart'), {
    type: 'line',
    data: {
      datasets: [
        // Chart.js traza primero la horizontal y salta en la abscisa del siguiente evento.
        { data: [] as { x: number; y: number }[], borderColor: '#257d76', borderWidth: 2.5, pointRadius: 0, stepped: 'before' },
        // T17: el gemelo sin accidente (solo se llena después de un accidente)
        { data: [] as { x: number; y: number }[], borderColor: '#677373', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, stepped: 'before' },
      ],
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', ticks: { color: '#536e69', callback(v) {
          const minutes = Number(v) * 60;
          return this.max - this.min < .12 ? clock(minutes) + ':' + String(Math.floor(minutes * 60) % 60).padStart(2, '0') : clock(minutes);
        }, maxTicksLimit: 4 }, grid: { color: '#dce4d8' } },
        y: { beginAtZero: true, ticks: { color: '#536e69', precision: 0 }, grid: { color: '#dce4d8' } },
      },
      plugins: { legend: { display: false } },
    },
  });
  const series = chart.data.datasets[0].data as { x: number; y: number }[];
  const twinSeries = chart.data.datasets[1].data as { x: number; y: number }[];

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
    reload((e.target as HTMLSelectElement).value as Mode);
    series.length = 0;
    twinSeries.length = 0;
    syncInputs();
    restartStats();
  };

  syncInputs();
  restartStats();

  // 5 veces por segundo: métricas del motor y N(t) desde su trayectoria exacta (no se muestrea).
  setInterval(() => {
    if(root.hidden || !root.offsetWidth)return;
    const ed = driver.ed;
    const m = ed.metrics();
    METRICS.forEach((x, i) => ($(`pn-m${i}`).textContent = x.show(m)));
    if (!driver.nLive) return;
    const a = Math.max(ed.now - WINDOW, 0);
    series.splice(0, series.length, ...driver.nLive.points(a, ed.now));
    // El gemelo sin accidente se dibuja desde el accidente (antes es idéntico).
    twinSeries.splice(0, twinSeries.length, ...(driver.accident && driver.nTwin ? driver.nTwin.points(Math.max(a, driver.accident.t0), ed.now) : []));
    $('pn-twin-note').hidden = !driver.accident;
    chart.update('none');
  }, 200);
}
