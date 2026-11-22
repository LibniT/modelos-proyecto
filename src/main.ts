/**
 * Página PROVISIONAL: demuestra el motor en el navegador (reloj del render + panel de texto)
 * y la validación en un Web Worker. La escena isométrica (T05) reemplaza la parte visual.
 */
import { EmergencyDepartment } from './model/ed';
import { realisticParams } from './model/params';
import { mountValidationPanel } from './ui/validation/panel';

const app = document.getElementById('app')!;
app.innerHTML = `
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1720; color: #e6edf3; }
  main { max-width: 1100px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 24px; }
  button { background: #2563eb; color: white; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; margin-right: 6px; }
  pre { background: #16202b; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  nav button { background: #1e293b; } nav button[aria-selected="true"] { background: #2563eb; }
</style>
<main>
  <h1>SimUrgencias — motor (vista provisional)</h1>
  <nav class="row" role="tablist">
    <button role="tab" data-tab="sim" aria-selected="true">Simulación</button>
    <button role="tab" data-tab="val" aria-selected="false">Validación</button>
  </nav>
  <section id="tab-sim">
  <div class="row">
    <button id="pause">Pausa</button>
    <button data-speed="1">×1</button><button data-speed="60">×60</button><button data-speed="600">×600</button>
    <button id="mass">Accidente masivo (8)</button>
    <span id="clock"></span>
  </div>
  <pre id="state"></pre>
  </section>
  <section id="tab-val" hidden></section>
</main>`;

mountValidationPanel(document.getElementById('tab-val')!);
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
      document.getElementById('tab-sim')!.hidden = b.dataset.tab !== 'sim';
      document.getElementById('tab-val')!.hidden = b.dataset.tab !== 'val';
    }),
);

const ed = new EmergencyDepartment(realisticParams(), { seed: Date.now() % 100000, recordEvents: false });
ed.step(8 * 60);
let speed = 60; // minutos simulados por segundo real ÷ 60 → ×60 = 1 s real = 1 min sim
let paused = false;
let last = performance.now();

function fmtClock(t: number): string {
  const day = Math.floor(t / 1440) + 1;
  const h = Math.floor((t % 1440) / 60);
  const m = Math.floor(t % 60);
  return `Día ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (!paused) ed.step(ed.now + (dt * speed) / 60);
  const s = ed.snapshot();
  const m = ed.metrics();
  document.getElementById('clock')!.textContent = `${fmtClock(s.t)} · velocidad ×${speed}${paused ? ' (pausa)' : ''}`;
  const byState = new Map<string, number>();
  s.patients.forEach((p) => byState.set(p.state, (byState.get(p.state) ?? 0) + 1));
  document.getElementById('state')!.textContent = [
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.getElementById('pause')!.onclick = () => (paused = !paused);
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => (b.onclick = () => (speed = Number(b.dataset.speed))));
document.getElementById('mass')!.onclick = () => ed.triggerMassCasualty(8);

