import { Chart, Legend, LinearScale, LineController, LineElement, PointElement } from 'chart.js';
import type { EmergencyDepartment } from '../model/ed';
import type { LiveDriver } from '../render/drivers';
import { SHORT } from '../render/map/geo';

Chart.register(Legend, LinearScale, LineController, LineElement, PointElement);
type Point = { x: number; y: number };
type Sample = { t: number; queues: number[]; beds: number[]; vehicles: number[] };
const colors = ['#18665e', '#aa5037', '#446caa', '#926c2b', '#7a4f9a', '#3f8a3a', '#b0457a'];
const hours = (x: number) => {
  const minute = Math.round(x * 60);
  return `${Math.floor(minute / 60) % 24}:${String(minute % 60).padStart(2, '0')}`;
};

/** Las instancias de Chart viven lo mismo que la pestaña. Cada motor conserva solo su ventana de muestras. */
export function mountLiveCharts(root: HTMLElement) {
  root.innerHTML = `<div class="graph-summary"><p id="graph-session"></p><div><strong>Espera media por médico</strong><output></output></div><div><strong>Triage II atendido en ≤ 30 min</strong><output></output></div></div><section class="net-panel" hidden><h3>Red hospitalaria de Valledupar</h3><div class="graph-summary net-kpis"></div><table><thead><tr><th>Sede</th><th>Ocupadas ahora</th><th>Ocupación media</th><th>Remitidos recibidos</th></tr></thead><tbody></tbody></table><p class="note">Ocupación simulada, no la real. Indicadores desde el último reinicio de métricas; los remitidos recibidos cuentan la sesión.</p></section><div class="staff-load"><strong>Puestos ocupados ahora</strong></div><div class="graph-grid"></div>`;
  // T26: indicadores de la red (solo en el escenario ?red)
  const net = root.querySelector<HTMLElement>('.net-panel')!;
  const kpis = ['Traslados completados', 'Espera media en el pasillo para remitir', 'Remitidos fuera de la red', 'Uso de ambulancias'].map((label) => {
    const box = document.createElement('div');
    const out = document.createElement('output');
    box.append(Object.assign(document.createElement('strong'), { textContent: label }), out);
    net.querySelector('.net-kpis')!.append(box);
    return out;
  });
  const rows = net.querySelector('tbody')!;
  const loads = ['Triage', 'Admisión', 'Médicos'].map((label) => {
    const item = document.createElement('label');
    item.append(label + ' ');
    const value = document.createElement('b'),
      meter = document.createElement('meter');
    meter.min = 0;
    meter.max = 1;
    item.append(value, meter);
    root.querySelector('.staff-load')!.append(item);
    return { value, meter };
  });
  const grid = root.querySelector('.graph-grid')!;
  const outputs = root.querySelectorAll('output');
  const title = root.querySelector('p')!;
  const history = new WeakMap<EmergencyDepartment, Sample[]>();
  const cards = [
    ['Pacientes en el sistema', 'Pacientes', 'Trayectoria exacta por llegada y salida.'],
    ['Colas por estación', 'Pacientes', 'Personas que esperan para iniciar el servicio.'],
    ['Ocupación de camas', 'Camas', 'Observación y red de clínicas. La leyenda incluye la capacidad actual.'],
    ['Disponibilidad de ambulancias', 'Ambulancias', 'Ocupadas incluye el regreso. En traslado cuenta los viajes con paciente.'],
  ];
  const charts = cards.map(([name, unit, caption]) => {
    const card = document.createElement('article');
    card.innerHTML = `<h3>${name}</h3><p>${caption}</p><div class="plot"><canvas aria-label="${name}"></canvas></div>`;
    grid.append(card);
    return new Chart<'line', Point[]>(card.querySelector('canvas')!, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#234a48' } } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Hora simulada' }, ticks: { maxTicksLimit: 5, callback: (v) => hours(Number(v)) } },
          y: { beginAtZero: true, title: { display: true, text: unit }, ticks: { precision: 0 } },
        },
      },
    });
  });
  function plot(index: number, names: string[], points: Point[][], start: number, end: number) {
    const chart = charts[index];
    names.forEach((label, i) => {
      const line = (chart.data.datasets[i] ??= {
        data: [],
        pointRadius: 0,
        borderWidth: 2,
        borderColor: colors[i],
        borderDash: index === 0 && i > 0 ? [4, 3] : [],
        stepped: index === 0 && i === 2 ? false : 'before',
      });
      line.label = label;
      line.data = points[i];
    });
    chart.data.datasets.length = names.length;
    Object.assign(chart.options.scales!.x!, { min: start / 60, max: Math.max(start + 1, end) / 60 });
    chart.update('none');
  }
  let lastPaint = -Infinity;
  let previous: EmergencyDepartment | undefined;
  return (driver: LiveDriver, practice: boolean) => {
    const ed = driver.ed,
      t = ed.now;
    let samples = history.get(ed);
    if (!samples) {
      samples = [];
      history.set(ed, samples);
    }
    const last = samples.at(-1);
    if (!last || t - last.t >= 1) {
      const s = ed.snapshot();
      samples.push({
        t,
        queues: [s.triage.queue, s.admission.queue, s.doctors.queue],
        beds: [s.obsBeds.occupied, ...s.clinics.map((c) => c.occupied)],
        vehicles: [Math.max(0, s.ambulances.capacity - s.ambulances.busy), s.ambulances.busy, driver.pb.transfers.size],
      });
      while (samples.length > 1 && samples[1].t < t - 720) samples.shift();
    }
    if (root.hidden) {
      lastPaint = -Infinity;
      return;
    }
    if (previous === ed && performance.now() - lastPaint < 400) return;
    previous = ed;
    lastPaint = performance.now();
    const s = ed.snapshot(),
      m = ed.metrics();
    const format = (v: number, unit: string) =>
      Number.isFinite(v) ? v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' ' + unit : 'Sin datos';
    net.hidden = !ed.params.network;
    if (ed.params.network) {
      const pct = (x: number) => format(100 * x, '%');
      kpis[0].textContent = String(m['transfers']);
      kpis[1].textContent = format(m['hallway.wait'], 'min');
      kpis[2].textContent = pct(m['remit.outOfNetwork']) + ' de las llegadas';
      kpis[3].textContent = pct(m['amb.rho']);
      rows.replaceChildren(
        ...s.clinics.map((c, j) => {
          const tr = document.createElement('tr');
          for (const v of [c.name, `${c.occupied}/${c.beds} · ${pct(c.occupied / c.beds)}`, pct(m[`clinic${j}.occupancy`] / c.beds), String(driver.pb.receivedByClinic.get(j) ?? 0)])
            tr.append(Object.assign(document.createElement('td'), { textContent: v }));
          return tr;
        }),
      );
    }
    outputs[0].textContent = format(m['doctor.Wq'], 'min');
    outputs[1].textContent = format(100 * m['triageII.compliance'], '%');
    title.textContent =
      (practice ? 'Demostración controlada' : 'Corrida principal') +
      ' · Espera y cumplimiento desde el último reinicio. Colas, camas y ambulancias se observan a intervalos de al menos un minuto simulado. Últimas 12 horas disponibles.';
    [s.triage, s.admission, s.doctors].forEach((station, i) => {
      loads[i].value.textContent = station.busy + '/' + station.capacity;
      loads[i].meter.value = station.busy / Math.max(1, station.capacity);
    });
    const start = Math.max(driver.nLive?.t[0] ?? samples[0].t, t - 720);
    const names = ['Hospital'],
      series = [driver.nLive?.points(start, t) ?? []];
    if (driver.accident && driver.nTwin) {
      const t0 = driver.accident.t0;
      names[0] = 'Con accidente';
      names.push('Gemelo sin accidente');
      series.push(driver.nTwin.points(Math.max(start, t0), t));
      if (t0 >= start) {
        names.push('Accidente · ' + hours(t0 / 60));
        const ymax = Math.max(1, ...series.flat().map((p) => p.y));
        series.push([
          { x: t0 / 60, y: 0 },
          { x: t0 / 60, y: ymax },
        ]);
      }
    }
    plot(0, names, series, start, t);
    const resourcePlot = (i: number, key: 'queues' | 'beds' | 'vehicles', labels: string[]) => {
      const points = labels.map((_, j) => samples.map((a) => ({ x: a.t / 60, y: a[key][j] })));
      plot(i, labels, points, start, t);
    };
    resourcePlot(1, 'queues', ['Triage', 'Admisión', 'Médico']);
    if (ed.params.network) {
      // Red real: sedes de 21 a 173 camas; en porcentaje se comparan en la misma escala.
      const caps = [s.obsBeds.capacity, ...s.clinics.map((c) => c.beds)];
      const labels = ['Observación', ...ed.params.network.sites.map((id) => SHORT[id])];
      plot(2, labels.map((l, j) => `${l} / ${caps[j]}`), labels.map((_, j) => samples.map((a) => ({ x: a.t / 60, y: (100 * a.beds[j]) / Math.max(1, caps[j]) }))), start, t);
      charts[2].options.scales!.y!.title = { display: true, text: '% ocupado' };
    } else resourcePlot(2, 'beds', [`Observación / ${s.obsBeds.capacity}`, ...s.clinics.map((c) => c.name.replace('Clínica ', '') + ' / ' + c.beds)]);
    resourcePlot(3, 'vehicles', ['Disponibles', 'Ocupadas', 'En traslado']);
  };
}
