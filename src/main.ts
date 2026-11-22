/// <reference types="vite/client" />
/**
 * Página principal: un solo motor en vivo alimenta la escena (T05–T06) y la vista de texto.
 * Panel de control (T07) a la derecha de la escena. La validación corre aparte en un Web Worker (T11).
 * `?mock` reproduce src/render/mock/events.json en vez del motor (desarrollo).
 */
import { EmergencyDepartment } from './model/ed';
import { realisticParams, validationParams, type Mode } from './model/params';
import { mountValidationPanel } from './ui/validation/panel';
import { mountPanel } from './ui/panel';
import { describe } from './ui/tooltip';
import { mountCreator } from './ui/creator/creator';
import { journeyCard } from './ui/journey';
import type { Hit } from './render/hit';
import type { SimEvent } from './engine/events';
import { mountScene, TRIAGE_COLOR } from './render/scene';
import { LiveDriver, MockDriver } from './render/drivers';

const app = document.getElementById('app')!;
app.innerHTML = `
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1720; color: #e6edf3; }
  main { max-width: 1400px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 24px; }
  button { background: #2563eb; color: white; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; margin-right: 6px; }
  pre { background: #16202b; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
  nav button { background: #1e293b; } nav button[aria-selected="true"] { background: #2563eb; }
  [data-speed][aria-pressed="true"] { outline: 2px solid #facc15; }
  button:disabled { opacity: .4; cursor: not-allowed; }
  #tip { position: absolute; pointer-events: none; background: rgba(15, 23, 32, .94); border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; font-size: 12px; line-height: 1.45; max-width: 280px; z-index: 5; }
  #tip b { display: block; font-size: 13px; margin-bottom: 2px; }
  #card { position: absolute; top: 8px; left: 8px; z-index: 6; max-width: 360px; background: rgba(15, 23, 32, .96); border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.5; }
  #card b { display: block; font-size: 14px; margin-bottom: 4px; }
  #card button { margin-top: 8px; padding: 4px 10px; }
  .stage { display: grid; grid-template-columns: 1fr 320px; gap: 12px; align-items: start; }
  @media (max-width: 900px) { .stage { grid-template-columns: 1fr; } }
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
    <button id="create" style="background:#16a34a">Crear mi paciente</button>
    <button id="follow" style="background:#a16207">Seguir a mi paciente</button>
    <span id="clock"></span>
  </div>
  <section id="tab-scene">
    <div class="stage">
      <div style="position: relative; min-width: 0">
        <div id="scene" style="height: 680px; border-radius: 8px; overflow: hidden"></div>
        <div id="tip" hidden></div>
        <div id="card" role="dialog" aria-label="Recorrido del paciente" hidden></div>
      </div>
      <aside id="panel"></aside>
    </div>
    <p class="row" id="legend"></p>
    <p id="toast" role="status" style="color:#facc15; min-height: 1em; margin: 4px 0"></p>
    <p id="following" class="row" style="margin: 0"></p>
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
/** Motor nuevo en el modo pedido, arrancando a las 08:00 del día 1. */
function makeEd(mode: Mode): EmergencyDepartment {
  const ed = new EmergencyDepartment(mode === 'validacion' ? validationParams() : realisticParams(), { seed: Date.now() % 100000, recordEvents: true });
  ed.step(8 * 60);
  return ed;
}
const live = mockMode ? undefined : new LiveDriver(makeEd('realista'));
const driver = live ?? new MockDriver();
// T08: tooltips con el estado actual del motor (solo en vivo; el mock no tiene snapshot).
const tip = $('tip');
const onHover = (hit: Hit | undefined, x: number, y: number) => {
  const t = hit && live && describe(hit, live.ed.snapshot(), (id) => live.ed.params.eps.find((e) => e.id === id)?.name ?? id, live.pb.ambulancesAway, (a) => live.pb.transfers.get(a)?.clinic);
  tip.hidden = !t;
  if (!t) return;
  const color = t.level === undefined ? '#e6edf3' : `#${TRIAGE_COLOR[t.level].toString(16).padStart(6, '0')}`;
  const b = document.createElement('b');
  b.textContent = t.title;
  b.style.color = color;
  tip.replaceChildren(b, ...t.lines.map((l) => Object.assign(document.createElement('div'), { textContent: l })));
  // A la derecha del puntero; si no cabe, a la izquierda.
  const w = $('scene').clientWidth;
  tip.style.left = `${x + 16 + tip.offsetWidth > w ? x - 16 - tip.offsetWidth : x + 16}px`;
  tip.style.top = `${y + 12}px`;
};
const scene = mountScene($('scene'), driver, live ? onHover : undefined);
// Solo en desarrollo (npm run dev): inspeccionar el estado desde la consola. No existe en el build de la feria.
if (import.meta.env.DEV) Object.assign(window, { __sim: { driver, live, scene } });
if (live) mountPanel($('panel'), live, makeEd);

$('source').textContent = mockMode
  ? 'Modo mock: reproduce src/render/mock/events.json (3 h de eventos reales del motor, semilla 2026).'
  : 'Motor en vivo. Arrastra para mover la cámara y usa la rueda para acercar. EPS y clínicas ficticias · parámetros estimados con fines académicos.';
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
$('create').hidden = mockMode;
// T16: al crear un paciente, la cámara lo sigue en cuanto llega.
let followNextVisitor = false;
if (live)
  mountCreator($('create') as HTMLButtonElement, () => live.ed, (msg) => {
    $('toast').textContent = msg;
    followNextVisitor = true;
  });
$('follow').hidden = mockMode;
const newestVisitor = () =>
  [...driver.pb.figures.values()].filter((f) => f.isVisitor).sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1)))[0];
$('follow').onclick = () => (scene.follow = newestVisitor()?.id);

// T16: tarjeta de recorrido al salir un paciente seguido (o cualquier visitante).
const watched = new Set<string>();
function showCard(e: SimEvent): void {
  const c = journeyCard(e, live ? live.ed.metrics()['doorToDoctor'] : NaN);
  const b = document.createElement('b');
  b.textContent = c.title;
  b.style.color = `#${TRIAGE_COLOR[c.level].toString(16).padStart(6, '0')}`;
  const close = Object.assign(document.createElement('button'), { textContent: 'Cerrar' });
  close.onclick = () => ($('card').hidden = true);
  $('card').replaceChildren(b, ...c.lines.map((l) => Object.assign(document.createElement('div'), { textContent: l })), close);
  $('card').hidden = false;
}
$('mass').onclick = () => live?.ed.triggerMassCasualty(8);

function fmtClock(t: number): string {
  const day = Math.floor(t / 1440) + 1;
  const h = Math.floor((t % 1440) / 60);
  const m = Math.floor(t % 60);
  return `Día ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Textos: 5 veces por segundo basta (la escena se dibuja en cada cuadro).
setInterval(() => {
  $('clock').textContent = `${fmtClock(driver.pb.t)} · ×${driver.speed}${driver.paused ? ' (pausa)' : ''} · pacientes: ${driver.pb.figures.size}`;
  // T16: seguir, vigilar y mostrar la tarjeta de recorrido.
  if (followNextVisitor && newestVisitor()) {
    scene.follow = newestVisitor()!.id;
    followNextVisitor = false;
  }
  if (scene.follow) watched.add(scene.follow);
  for (const e of driver.pb.departures.splice(0)) {
    if (watched.has(e.patientId!) || (e.data as { isVisitor?: boolean }).isVisitor) showCard(e);
    watched.delete(e.patientId!);
  }
  ($('follow') as HTMLButtonElement).disabled = !newestVisitor();
  const f = scene.follow ? driver.pb.figures.get(scene.follow) : undefined;
  $('following').textContent = f ? `Siguiendo a ${f.name} (anillo amarillo). Arrastra la escena o haz clic en el piso para soltar.` : 'Haz clic sobre un paciente para seguirlo con la cámara.';
  if (!live) return;
  const ed = live.ed;
  // El motor rechaza el accidente masivo y los visitantes en validación (cambiarían el proceso de llegadas).
  ($('mass') as HTMLButtonElement).disabled = ($('create') as HTMLButtonElement).disabled = ed.params.mode === 'validacion';
  if ($('tab-sim').hidden) return;
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
