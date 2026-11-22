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
import { clinicCard } from './ui/clinic';
import { distMean } from './engine/distributions';
import type { Hit } from './render/hit';
import type { SimEvent } from './engine/events';
import { mountScene, TRIAGE_COLOR } from './render/scene';
import { LiveDriver, MockDriver } from './render/drivers';
import { recoveryTime } from './batch/recovery';
import { DemoMode } from './render/demo';

import './ui/expo.css';

const app = document.getElementById('app')!;
app.innerHTML = `
<header class="mast"><div class="mast-inner">
  <h1><span class="brand-cross" aria-hidden="true">✚</span>SimUrgencias</h1>
  <nav aria-label="Vistas del simulador" role="tablist">
    <button role="tab" data-tab="scene" aria-selected="true">Escena</button>
    <button role="tab" data-tab="sim" aria-selected="false">Motor (texto)</button>
    <button role="tab" data-tab="val" aria-selected="false">Validación</button>
  </nav>
</div></header>
<main>
  <header class="heading">
    <div><div class="location">Valledupar <span> / </span> Modelos y simulación</div><h2 id="view-title">Servicio de urgencias</h2></div>
    <div class="readouts"><div><small>Tiempo simulado</small><strong id="clock">—</strong></div><div><small>Pacientes en el sistema</small><strong id="n-patients">—</strong></div></div>
  </header>
  <div id="controls" class="toolbar">
    <div class="toolgroup"><span class="group-title">Simulación</span><button id="pause">Pausa</button>
      <div class="speeds"><button data-speed="1">×1</button><button data-speed="60">×60</button><button data-speed="120">×120</button><button data-speed="600">×600</button></div></div>
    <div class="toolgroup" id="visitor-tools"><span class="group-title">Paciente</span>
      <button id="create">Crear mi paciente</button><button id="follow">Seguir a mi paciente</button></div>
    <div class="toolgroup" id="mass-tools"><label id="mass-wrap">Heridos <select id="mass-n" aria-label="Número de heridos del accidente"><option>5</option><option selected>8</option><option>15</option><option>25</option></select></label>
      <button id="mass">Accidente masivo</button></div>
  </div>
  <section id="tab-scene">
    <div class="stage">
      <div class="map-column">
      <div class="map-card">
        <div class="map-head"><div><span class="map-symbol" aria-hidden="true">◇</span><b id="map-heading">Plano del hospital</b></div>
          <div class="view-group" role="group" aria-label="Vista y cámara"><button id="view">Ver ciudad</button><button id="minus" aria-label="Alejar">−</button><button id="plus" aria-label="Acercar">+</button><button id="fit">Ver todo</button></div>
        </div>
        <div class="canvas-wrap">
          <div id="scene"></div><div id="tip" hidden></div>
          <div id="card" role="dialog" aria-label="Información de la simulación" hidden></div>
          <div id="subs" aria-live="polite" hidden></div>
          <div id="demo-banner" hidden>Demostración · mueve el puntero para tomar el control</div>
        </div>
        <div class="map-foot"><div id="legend"></div><div id="city-key" hidden>Ocupación de camas <span>● &lt; 70 %</span><span>● 70–89 %</span><span>● ≥ 90 %</span></div></div>
      </div>
      <p id="toast" role="status"></p><p id="recovery" role="status"></p><p id="following"></p><p id="source"></p>
      </div>
      <aside id="panel"></aside>
    </div>
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
      $('view-title').textContent = b.dataset.tab === 'val' ? 'Validación del modelo' : b.dataset.tab === 'sim' ? 'Estado del motor' : 'Servicio de urgencias';
    }),
);

const mockMode = new URLSearchParams(location.search).has('mock');
/**
 * Motor nuevo en el modo pedido, arrancando a las 08:00 del día 1, y su gemelo sin accidentes
 * (misma semilla) para medir la recuperación tras un accidente masivo (T17).
 */
function makePair(mode: Mode): [EmergencyDepartment, EmergencyDepartment] {
  const seed = Date.now() % 100000;
  const params = () => (mode === 'validacion' ? validationParams() : realisticParams());
  const ed = new EmergencyDepartment(params(), { seed, recordEvents: true });
  const twin = new EmergencyDepartment(params(), { seed });
  ed.step(8 * 60);
  twin.step(8 * 60);
  return [ed, twin];
}
const live = mockMode ? undefined : new LiveDriver(...makePair('realista'));
const driver = live ?? new MockDriver();
// T08: tooltips con el estado actual del motor (solo en vivo; el mock no tiene snapshot).
const tip = $('tip');
let lastTip = '', lastTipRead = -Infinity;
const onHover = (hit: Hit | undefined, x: number, y: number) => {
  const now = performance.now();
  if(hit && !tip.hidden && now-lastTipRead<80)return;
  lastTipRead=now;
  const t = hit && live && describe(hit, live.ed.snapshot(), (id) => live.ed.params.eps.find((e) => e.id === id)?.name ?? id, live.pb.ambulancesAway, (a) => live.pb.transfers.get(a)?.clinic);
  tip.hidden = !t;
  if (!t) return;
  const color = t.level === undefined ? '#bdd7cb' : `#${TRIAGE_COLOR[t.level].toString(16).padStart(6, '0')}`;
  const content = JSON.stringify([t.title,color,t.lines]);
  if(content!==lastTip){
    lastTip=content;
    const b = document.createElement('b');
    b.textContent = t.title;
    b.style.borderLeftColor = color;
    tip.replaceChildren(b, ...t.lines.map((l) => Object.assign(document.createElement('div'), { textContent: l })));
  }
  // A la derecha del puntero; si no cabe, a la izquierda.
  const w = $('scene').clientWidth;
  tip.style.left = `${x + 16 + tip.offsetWidth > w ? x - 16 - tip.offsetWidth : x + 16}px`;
  tip.style.top = `${Math.max(0,Math.min(y+12,$('scene').clientHeight-tip.offsetHeight))}px`;
};
// T19: mapa de la ciudad (segunda escena). Distancias ∝ tiempo medio de viaje; ocupación del snapshot del motor.
const clinicParams = () => (live ? live.ed.params : realisticParams()).clinics;
const clinicState = () => driver instanceof MockDriver ? driver.initialClinics : driver.ed.snapshot().clinics;
const { hospital: scene, city } = mountScene($('scene'), driver, live ? onHover : undefined, {
  travelMeans: clinicParams().map((c) => distMean(c.travel)),
  clinics: clinicState,
  onClinic: (j) => {
    const p = live ? live.ed.params : realisticParams();
    const occ = clinicState()[j].occupied;
    const c = clinicCard(j, p, occ, driver.pb.receivedByClinic.get(j) ?? 0);
    if (mockMode) c.lines[0] += ' · al inicio del registro';
    showInfoCard(c.title, '#e6edf3', c.lines);
  },
});
$('view').onclick = () => (scene.inCity ? city?.goHospital() : scene.goCity());
// Solo en desarrollo (npm run dev): inspeccionar el estado desde la consola. No existe en el build de la feria.
if (import.meta.env.DEV) Object.assign(window, { __sim: { driver, live, scene } });
$('fit').onclick = () => { if (scene.inCity) city?.fit(); else { scene.follow = undefined; scene.resetCamera(); } };
for (const [id, factor] of [['minus', .8], ['plus', 1.25]] as const)
  $(id).onclick = () => scene.inCity ? city?.zoomBy(factor) : scene.zoomBy(factor);
$('visitor-tools').hidden = $('mass-tools').hidden = mockMode;
$('panel').hidden = mockMode;
if (mockMode) $('city-key').prepend('Registro inicial · ');
if (live) mountPanel($('panel'), live, (mode) => live.load(...makePair(mode)));

$('source').textContent = mockMode
  ? 'Modo mock: reproduce src/render/mock/events.json (3 h de eventos reales del motor, semilla 2026).'
  : 'Motor en vivo. Arrastra para mover la cámara y usa la rueda para acercar. EPS y clínicas ficticias · parámetros estimados con fines académicos.';
$('legend').innerHTML = '<b>Triage</b> ' + ['Sin triage', 'I', 'II', 'III', 'IV', 'V']
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
// T18: modo demo tras 60 s sin uso (?demo=10 lo adelanta, para probar).
new DemoMode({
  scene,
  driver,
  subtitle: $('subs'),
  banner: $('demo-banner'),
  card: $('card'),
  epsName: (id) => live?.ed.params.eps.find((e) => e.id === id)?.name ?? id,
  idleSeconds: Number(new URLSearchParams(location.search).get('demo')) || 60,
  onStart: () => {
    document.querySelector<HTMLButtonElement>('[data-tab="scene"]')!.click();
    if (scene.inCity) city?.goHospital(); // la demo cuenta la historia dentro del hospital
  },
});
$('pause').onclick = () => {
  driver.paused = !driver.paused;
  $('pause').textContent = driver.paused ? 'Continuar' : 'Pausa';
};
$('mass').hidden = $('mass-wrap').hidden = mockMode;
$('create').hidden = mockMode;
// T16: al crear un paciente, la cámara lo sigue en cuanto llega.
let followNextVisitor = false;
if (live)
  mountCreator($('create') as HTMLButtonElement, () => ({ params: live.ed.params, injectVisitor: (i) => live.injectVisitor(i) }), (msg) => {
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
  showInfoCard(c.title, `#${TRIAGE_COLOR[c.level].toString(16).padStart(6, '0')}`, c.lines);
}
/** Tarjeta sobre la escena (recorrido de un paciente o clínica del mapa). Solo textContent. */
function showInfoCard(title: string, color: string, lines: string[]): void {
  const b = document.createElement('b');
  b.textContent = title;
  b.style.borderLeftColor = color;
  const close = Object.assign(document.createElement('button'), { textContent: 'Cerrar' });
  close.onclick = () => ($('card').hidden = true);
  $('card').replaceChildren(b, ...lines.map((l) => Object.assign(document.createElement('div'), { textContent: l })), close);
  $('card').hidden = false;
}
$('mass').onclick = () => live?.massCasualty(Number(($('mass-n') as HTMLSelectElement).value));
/** T17: recuperación del último accidente (se calcula una vez que ocurre y queda fija). */
let recovered: { t0: number; minutes: number } | undefined;
let checked = { t0: NaN, until: 0 }; // hasta dónde ya se buscó la recuperación del accidente actual

function fmtClock(t: number): string {
  const day = Math.floor(t / 1440) + 1;
  const h = Math.floor((t % 1440) / 60);
  const m = Math.floor(t % 60);
  return `Día ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Textos: 5 veces por segundo basta (la escena se dibuja en cada cuadro).
setInterval(() => {
  markSpeed(); // la demo cambia y restaura la velocidad
  $('view').textContent = scene.inCity ? 'Ver hospital' : 'Ver ciudad';
  $('pause').textContent = driver.paused ? 'Continuar' : 'Pausa';
  $('clock').textContent = fmtClock(driver.pb.t);
  $('n-patients').textContent = String(driver.pb.figures.size);
  $('map-heading').textContent = scene.inCity ? 'Red de clínicas' : 'Plano del hospital';
  $('legend').hidden = scene.inCity;
  $('city-key').hidden = !scene.inCity;
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
  $('following').textContent = scene.inCity ? 'Selecciona una clínica para consultar sus camas y convenios, o el hospital para entrar.' : f ? `Siguiendo a ${f.name} (anillo amarillo). Arrastra la escena o haz clic en el piso para soltar.` : 'Haz clic sobre un paciente para seguirlo con la cámara.';
  if (!live) return;
  const ed = live.ed;
  // T17: recuperación en vivo contra el gemelo sin accidente (misma semilla).
  const acc = live.accident;
  if (!acc) $('recovery').textContent = '';
  else {
    if (recovered?.t0 !== acc.t0) {
      if (checked.t0 !== acc.t0) checked = { t0: acc.t0, until: acc.t0 + 30 };
      const r = recoveryTime(live.nLive!, live.nTwin!, acc.t0, ed.now, undefined, checked.until);
      recovered = r === undefined ? undefined : { t0: acc.t0, minutes: r };
      // Siguiente punto de la grilla t0 + 30 + k (paso de 1 min), la misma que usa el experimento.
      checked.until = acc.t0 + 30 + Math.max(0, Math.floor(ed.now - acc.t0 - 30) + 1);
    }
    const w = Math.min(30, ed.now - acc.t0);
    const extra = w > 0 ? live.nLive!.avg(ed.now - w, ed.now) - live.nTwin!.avg(ed.now - w, ed.now) : acc.n;
    const dur = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;
    $('recovery').textContent =
      `Accidente de ${acc.n} heridos a las ${fmtClock(acc.t0).slice(-5)}. ` +
      (recovered
        ? `Recuperado en ${dur(recovered.minutes)} (a las ${fmtClock(acc.t0 + recovered.minutes).slice(-5)}).`
        : `Aún no se recupera (lleva ${dur(ed.now - acc.t0)}); ahora hay ${extra.toFixed(1)} pacientes de más.`) +
      ' Se compara con el mismo hospital sin el accidente (misma semilla), dentro de ±10 % en promedio de 30 min.';
  }
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
