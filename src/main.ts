/**
 * Página principal: un solo motor en vivo alimenta la escena (T05–T06) y la vista de texto.
 * La validación corre aparte en un Web Worker (T11). El panel de deslizadores llega con T07.
 * `?mock` reproduce src/render/mock/events.json en vez del motor (desarrollo).
 */
import { EmergencyDepartment } from './model/ed';
import { realisticParams } from './model/params';
import { mountValidationPanel } from './ui/validation/panel';
import { mountScene, TRIAGE_COLOR } from './render/scene';
import { LiveDriver, MockDriver } from './render/drivers';

const app = document.getElementById('app')!;
app.innerHTML = `
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1720; color: #e6edf3; }
  main { max-width: 1100px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 24px; }
  button { background: #2563eb; color: white; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; margin-right: 6px; }
  pre { background: #16202b; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
  nav button { background: #1e293b; } nav button[aria-selected="true"] { background: #2563eb; }
  [data-speed][aria-pressed="true"] { outline: 2px solid #facc15; }
</style>
<main>
  <h1>SimUrgencias</h1>
  <nav class="row" role="tablist">
    <button role="tab" data-tab="scene" aria-selected="true">Escena</button>
    <button role="tab" data-tab="sim" aria-selected="false">Motor (texto)</button>
    <button role="tab" data-tab="val" aria-selected="false">Validación</button>
  </nav>
  <div class="row" id="controls">
    <button id="pause">Pausa</button>
    <button data-speed="1">×1</button><button data-speed="60">×60</button><button data-speed="120">×120</button><button data-speed="600">×600</button>
    <button id="mass">Accidente masivo (8)</button>
    <span id="clock"></span>
  </div>
  <section id="tab-scene">
    <div id="scene" style="height: 620px; border-radius: 8px; overflow: hidden"></div>
    <p class="row" id="legend"></p>
    <p style="font-size: 12px; opacity: .75" id="source"></p>
  </section>
  <section id="tab-sim" hidden><pre id="state"></pre></section>
  <section id="tab-val" hidden></section>
</main>`;

const $ = (id: string) => document.getElementById(id)!;

mountValidationPanel($('tab-val'));
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
      for (const t of ['scene', 'sim', 'val']) $(`tab-${t}`).hidden = b.dataset.tab !== t;
      $('controls').hidden = b.dataset.tab === 'val';
    }),
);

const mockMode = new URLSearchParams(location.search).has('mock');
const ed = new EmergencyDepartment(realisticParams(), { seed: Date.now() % 100000, recordEvents: !mockMode });
ed.step(8 * 60); // arranca a las 08:00 del día 1
const driver = mockMode ? new MockDriver() : new LiveDriver(ed);
mountScene($('scene'), driver);

$('source').textContent = mockMode
  ? 'Modo mock: reproduce src/render/mock/events.json (3 h de eventos reales del motor, semilla 2026).'
  : 'Motor en vivo (modo realista). Arrastra para mover la cámara y usa la rueda para acercar. EPS y clínicas ficticias · parámetros estimados con fines académicos.';
$('legend').innerHTML = ['Sin triage', 'I', 'II', 'III', 'IV', 'V']
  .map((n, i) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#${TRIAGE_COLOR[i].toString(16).padStart(6, '0')}"></span> ${n}</span>`)
  .join(' ');

const speedButtons = document.querySelectorAll<HTMLButtonElement>('[data-speed]');
const markSpeed = () => speedButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === driver.speed)));
speedButtons.forEach(
  (b) =>
    (b.onclick = () => {
      driver.speed = Number(b.dataset.speed);
      markSpeed();
    }),
);
markSpeed();
$('pause').onclick = () => {
  driver.paused = !driver.paused;
  $('pause').textContent = driver.paused ? 'Continuar' : 'Pausa';
};
$('mass').hidden = mockMode;
$('mass').onclick = () => ed.triggerMassCasualty(8);

function fmtClock(t: number): string {
  const day = Math.floor(t / 1440) + 1;
  const h = Math.floor((t % 1440) / 60);
  const m = Math.floor(t % 60);
  return `Día ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Textos: 5 veces por segundo basta (la escena se dibuja en cada cuadro).
setInterval(() => {
  $('clock').textContent = `${fmtClock(driver.pb.t)} · ×${driver.speed}${driver.paused ? ' (pausa)' : ''} · pacientes: ${driver.pb.figures.size}`;
  if (mockMode || $('tab-sim').hidden) return;
  const s = ed.snapshot();
  const m = ed.metrics();
  const byState = new Map<string, number>();
  s.patients.forEach((p) => byState.set(p.state, (byState.get(p.state) ?? 0) + 1));
  $('state').textContent = [
    `Pacientes en el sistema: ${s.patients.length}`,
    ...[...byState].map(([k, v]) => `  ${k}: ${v}`),
    `Triage: ${s.triage.busy}/${s.triage.capacity} ocupados, cola ${s.triage.queue}`,
    `Admisión: ${s.admission.busy}/${s.admission.capacity}, cola ${s.admission.queue}`,
    `Médicos: ${s.doctors.busy}/${s.doctors.capacity}, cola ${s.doctors.queue}`,
    `Observación: ${s.obsBeds.occupied}/${s.obsBeds.capacity} camas · pasillo ${s.hallway} · ambulancias ${s.ambulances.busy}/${s.ambulances.capacity}`,
    ...s.clinics.map((c) => `${c.name}: ${c.occupied}/${c.beds}`),
    '',
    `Cumplimiento Triage II (≤30 min): ${(m['triageII.compliance'] * 100).toFixed(1)} %`,
    `Espera media por médico: ${m['doctor.Wq'].toFixed(1)} min · puerta-médico ${m['doorToDoctor'].toFixed(1)} min`,
    `Abandono IV-V: ${(m['renege.frac'] * 100).toFixed(1)} % · remisión ${((m['remit.complexity'] + m['remit.capacity']) * 100).toFixed(1)} %`,
  ].join('\n');
}, 200);
