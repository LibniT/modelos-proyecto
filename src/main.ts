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
import { mountAccidentStatus } from './ui/accident-status';
import { DemoMode } from './render/demo';

import { SessionDriver, rehearse, type Visitor } from './render/rehearsal';
import { ClinicInterior } from './ui/clinic-interior';
import { mountLiveCharts } from './ui/live-charts';
import './ui/expo.css';
import './ui/tour.css';

const app = document.getElementById('app')!;
app.innerHTML = `
<header class="mast"><div class="mast-inner">
  <h1><span class="brand-cross" aria-hidden="true">✚</span>SimUrgencias</h1>
  <nav aria-label="Vistas del simulador" role="tablist">
    <button role="tab" data-tab="scene" aria-selected="true">Escena</button>
    <button role="tab" data-tab="graphs" aria-selected="false">Gráficas en vivo</button>
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
  <div id="session-banner" hidden><strong>Demostración controlada</strong><span>Motor independiente · corrida principal en pausa</span><button id="end-practice">Volver a mi corrida</button></div>
  <section id="tab-scene">
    <div class="stage">
      <div class="map-column">
      <section class="visit-strip" id="visit-strip">
        <div><strong>Mi paciente</strong><span id="visitor-state" role="status">Crea un visitante para seguir su recorrido.</span></div>
        <div><label>Destino del ensayo <select id="destination"></select></label><button id="practice">Demostrar traslado con mi paciente</button></div>
      </section>
      <section class="trip-strip" id="trip-strip" hidden><div><strong id="trip-label"></strong><span id="trip-state"></span></div><div><button id="ride">Seguir ambulancia</button><button id="enter-destination" hidden>Entrar a la clínica</button><button id="repeat" hidden>Repetir demostración</button></div></section>
      <div class="map-card">
        <div class="map-head"><div><span class="map-symbol" aria-hidden="true">◇</span><b id="map-heading">Plano del hospital</b></div>
          <div class="view-group" role="group" aria-label="Vista y cámara"><button id="view">Ver ciudad</button><button id="minus" aria-label="Alejar">−</button><button id="plus" aria-label="Acercar">+</button><button id="fit">Ver todo</button></div>
        </div>
        <div class="canvas-wrap">
          <div id="scene"></div><section id="ward" hidden></section><div id="tip" hidden></div>
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
  <section id="tab-graphs" hidden></section>
  <section id="tab-val" hidden></section>
</main>`;

const $ = (id: string) => document.getElementById(id)!;

mountValidationPanel($('tab-val'));
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
      for (const t of ['scene', 'sim', 'graphs', 'val']) $(`tab-${t}`).hidden = b.dataset.tab !== t;
      $('controls').hidden = b.dataset.tab === 'val';
      $('view-title').textContent =
        b.dataset.tab === 'val'
          ? 'Validación del modelo'
          : b.dataset.tab === 'graphs'
            ? 'Gráficas en vivo'
            : b.dataset.tab === 'sim'
              ? 'Estado del motor'
              : 'Servicio de urgencias';
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
const primary = mockMode ? undefined : new LiveDriver(...makePair('realista'));
const original = primary ?? new MockDriver();
let live = primary;
const driver = new SessionDriver(original);
let practice: ReturnType<typeof rehearse> | undefined;
let tracked: { info: Visitor; id?: string; outcome?: string } | undefined;
let pending: NonNullable<typeof tracked>[] = [];
type Ride = { amb: string; patientId: string; destination: number; initialSpeed: number; arrived: boolean; name: string };
let ride: Ride | undefined;
let savedView: { city: boolean; follow?: string; amb?: string; ride?: Ride; ward?: number } | undefined;
let requestedCity: boolean | undefined;
const button = (id: string) => $(id) as HTMLButtonElement;
const destination = $('destination') as HTMLSelectElement;
destination.replaceChildren(...realisticParams().clinics.map((c, i) => new Option(c.name, String(i))));
const ward = new ClinicInterior($('ward'), () => {
  ward.close();
  if (!scene.inCity) scene.goCity();
});
const updateGraphs = primary ? mountLiveCharts($('tab-graphs')) : undefined;
document.querySelector<HTMLButtonElement>('[data-tab="graphs"]')!.hidden = mockMode;
$('visit-strip').hidden = mockMode;
// T08: tooltips con el estado actual del motor (solo en vivo; el mock no tiene snapshot).
const tip = $('tip');
let lastTip = '',
  lastTipRead = -Infinity;
const onHover = (hit: Hit | undefined, x: number, y: number) => {
  const now = performance.now();
  if (hit && !tip.hidden && now - lastTipRead < 80) return;
  lastTipRead = now;
  const active = live;
  const t =
    hit &&
    active &&
    describe(
      hit,
      active.ed.snapshot(),
      (id) => active.ed.params.eps.find((e) => e.id === id)?.name ?? id,
      active.pb.ambulancesAway,
      (a) => active.pb.transfers.get(a)?.clinic,
    );
  tip.hidden = !t;
  if (!t) return;
  const color = t.level === undefined ? '#bdd7cb' : `#${TRIAGE_COLOR[t.level].toString(16).padStart(6, '0')}`;
  const content = JSON.stringify([t.title, color, t.lines]);
  if (content !== lastTip) {
    lastTip = content;
    const b = document.createElement('b');
    b.textContent = t.title;
    b.style.borderLeftColor = color;
    tip.replaceChildren(b, ...t.lines.map((l) => Object.assign(document.createElement('div'), { textContent: l })));
  }
  // A la derecha del puntero; si no cabe, a la izquierda.
  const w = $('scene').clientWidth;
  tip.style.left = `${x + 16 + tip.offsetWidth > w ? x - 16 - tip.offsetWidth : x + 16}px`;
  tip.style.top = `${Math.max(0, Math.min(y + 12, $('scene').clientHeight - tip.offsetHeight))}px`;
};
// T19: mapa de la ciudad (segunda escena). Distancias ∝ tiempo medio de viaje; ocupación del snapshot del motor.
const clinicParams = () => (live ? live.ed.params : realisticParams()).clinics;
const clinicState = () => (live ? live.ed.snapshot().clinics : (original as MockDriver).initialClinics);
const { hospital: scene, city } = mountScene($('scene'), driver, live ? onHover : undefined, {
  travelMeans: clinicParams().map((c) => distMean(c.travel)),
  clinics: clinicState,
  onClinic: (j) => {
    const p = live ? live.ed.params : realisticParams();
    const occ = clinicState()[j].occupied;
    const c = clinicCard(j, p, occ, driver.pb.receivedByClinic.get(j) ?? 0);
    if (mockMode) c.lines[0] += ' · al inicio del registro';
    showInfoCard(c.title, '#e6edf3', c.lines, () => openWard(j));
  },
});
function openWard(j: number) {
  $('card').hidden = true;
  ward.open(j);
  ward.update(clinicState(), mockMode, arrivalNotice(j));
}
function arrivalNotice(j: number) {
  return ride?.arrived && ride.destination === j ? 'Traslado recibido · ' + ride.name : undefined;
}
$('view').onclick = () => {
  ward.close();
  if (scene.inCity) city?.goHospital();
  else scene.goCity();
};
// Solo en desarrollo (npm run dev): inspeccionar el estado desde la consola. No existe en el build de la feria.
if (import.meta.env.DEV)
  Object.assign(window, {
    __sim: {
      driver,
      get live() {
        return live;
      },
      primary,
      scene,
    },
  });
$('fit').onclick = () => {
  if (scene.inCity) {
    if (city) city.followedAmbulance = undefined;
    city?.fit();
  } else {
    scene.follow = undefined;
    scene.resetCamera();
  }
};
for (const [id, factor] of [
  ['minus', 0.8],
  ['plus', 1.25],
] as const)
  $(id).onclick = () => (scene.inCity ? city?.zoomBy(factor) : scene.zoomBy(factor));
$('visitor-tools').hidden = $('mass-tools').hidden = mockMode;
$('panel').hidden = mockMode;
if (mockMode) $('city-key').prepend('Registro inicial · ');
if (primary)
  mountPanel($('panel'), primary, (mode) => {
    primary.load(...makePair(mode));
    tracked = undefined;
    pending = [];
    ride = undefined;
    scene.follow = undefined;
    ward.close();
    $('card').hidden = true;
    watched.clear();
    observeVisitors();
  });

$('source').textContent = mockMode
  ? 'Modo mock: reproduce src/render/mock/events.json (3 h de eventos reales del motor, semilla 2026).'
  : 'Motor en vivo. Arrastra para mover la cámara y usa la rueda para acercar. EPS y clínicas ficticias · parámetros estimados con fines académicos.';
$('legend').innerHTML =
  '<b>Triage</b> ' +
  ['Sin triage', 'I', 'II', 'III', 'IV', 'V']
    .map(
      (n, i) =>
        `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#${TRIAGE_COLOR[i].toString(16).padStart(6, '0')}"></span> ${n}</span>`,
    )
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
  suspend: () =>
    !!practice || (!!ride && !ride.arrived) || ward.index !== undefined || !$('tab-graphs').hidden || !!document.querySelector('dialog[open]'),
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
// La cola de inyección es FIFO. El id se conoce solamente cuando el motor emite ARRIVAL.
function observeVisitors() {
  primary?.ed.onEvent((e) => {
    if (e.type === 'ARRIVAL' && (e.data?.info as { isVisitor?: boolean })?.isVisitor) {
      const entered = pending.shift();
      if (entered) {
        entered.id = e.patientId;
        if (entered === tracked) scene.follow = e.patientId;
      }
    }
    if (e.type === 'DEPARTURE' && tracked?.id && tracked.id === e.patientId) tracked.outcome = String(e.data?.outcome);
  });
}
observeVisitors();
if (primary)
  mountCreator(
    button('create'),
    () => ({
      params: primary.ed.params,
      injectVisitor: (info) => {
        if (practice || !primary.injectVisitor(info)) return false;
        tracked = { info };
        pending.push(tracked);
        return true;
      },
    }),
    () => {},
  );
$('follow').hidden = mockMode;
$('follow').onclick = () => {
  document.querySelector<HTMLButtonElement>('[data-tab=scene]')!.click();
  const id = practice?.patientId ?? tracked?.id;
  if (!id) return;
  const transfer = Array.from(driver.pb.transfers).find(([, tr]) => tr.patientId === id);
  if (transfer) {
    startRide(transfer[0]);
    return;
  }
  ward.close();
  if (scene.inCity) city?.goHospital();
  scene.follow = id;
};

function startRide(amb: string) {
  const tr = driver.pb.transfers.get(amb);
  if (!tr || !city) return;
  if (!ride || ride.patientId !== tr.patientId) {
    if (ride && !ride.arrived) driver.speed = ride.initialSpeed;
    ride = {
      amb,
      patientId: tr.patientId,
      destination: tr.clinicId,
      initialSpeed: driver.speed,
      arrived: false,
      name: driver.pb.figures.get(tr.patientId)?.name ?? tr.patientId,
    };
    driver.speed = 60;
  }
  ward.close();
  city.followedAmbulance = amb;
  scene.follow = tr.patientId;
  if (!practice && !scene.inCity && driver.pb.t - tr.t0 >= Math.min(2, tr.dur * 0.16)) scene.goCity();
}
function startPractice() {
  if (!tracked?.id || !primary || primary.ed.params.mode !== 'realista' || (practice && !ride?.arrived)) return;
  const next = rehearse(tracked.info, Number(destination.value));
  if (!practice) {
    savedView = { city: scene.inCity, follow: scene.follow, amb: city?.followedAmbulance, ride, ward: ward.index };
  }
  practice = next;
  driver.current = next.driver;
  live = next.driver;
  ride = undefined;
  ward.close();
  $('card').hidden = true;
  $('toast').textContent = '';
  if (city) city.followedAmbulance = undefined;
  requestedCity = false;
  if (scene.inCity) city?.goHospital();
  scene.resetCamera();
  scene.follow = next.patientId;
  $('session-banner').hidden = false;
  $('panel').hidden = true;
  button('practice').disabled = true;
  button('repeat').hidden = true;
  button('enter-destination').hidden = true;
  button('ride').hidden = true;
  $('trip-state').textContent = 'Consulta preparada. Esperando la salida en ambulancia.';
}
function exitPractice() {
  if (!practice) return;
  practice = undefined;
  driver.current = original;
  live = primary;
  ride = savedView?.ride;
  ward.close();
  $('card').hidden = true;
  $('toast').textContent = '';
  if (city) city.followedAmbulance = savedView?.amb;
  requestedCity = savedView?.city;
  if (savedView?.ward !== undefined) openWard(savedView.ward);
  if (savedView?.city && !scene.inCity) scene.goCity();
  else if (!savedView?.city && scene.inCity) city?.goHospital();
  scene.resetCamera();
  scene.follow = savedView?.follow;
  savedView = undefined;
  $('session-banner').hidden = true;
  $('panel').hidden = false;
}
button('practice').onclick = startPractice;
button('repeat').onclick = startPractice;
button('end-practice').onclick = exitPractice;
button('ride').onclick = () => {
  const amb = ride && !ride.arrived ? ride.amb : driver.pb.transfers.keys().next().value;
  if (amb) startRide(amb);
};
button('enter-destination').onclick = () => {
  if (ride?.arrived) openWard(ride.destination);
};

// T16: tarjeta de recorrido al salir un paciente seguido (o cualquier visitante).
const watched = new Set<string>();
function showCard(e: SimEvent): void {
  const c = journeyCard(e, live ? live.ed.metrics()['doorToDoctor'] : NaN);
  showInfoCard(c.title, `#${TRIAGE_COLOR[c.level].toString(16).padStart(6, '0')}`, c.lines);
}
/** Tarjeta sobre la escena (recorrido de un paciente o clínica del mapa). Solo textContent. */
function showInfoCard(title: string, color: string, lines: string[], enter?: () => void): void {
  const b = document.createElement('b');
  b.textContent = title;
  b.style.borderLeftColor = color;
  const close = Object.assign(document.createElement('button'), { textContent: 'Cerrar' });
  close.onclick = () => ($('card').hidden = true);
  $('card').replaceChildren(b, ...lines.map((l) => Object.assign(document.createElement('div'), { textContent: l })), close);
  if (enter) {
    const go = document.createElement('button');
    go.textContent = 'Entrar a la clínica';
    go.onclick = enter;
    close.before(go);
  }
  $('card').hidden = false;
}
$('mass').onclick = () => live?.massCasualty(Number(($('mass-n') as HTMLSelectElement).value));
const updateAccident = mountAccidentStatus($('recovery'), fmtClock);

function fmtClock(t: number): string {
  const day = Math.floor(t / 1440) + 1;
  const h = Math.floor((t % 1440) / 60);
  const m = Math.floor(t % 60);
  return `Día ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Textos: 5 veces por segundo basta (la escena se dibuja en cada cuadro).
setInterval(() => {
  const showing = scene.inCity ? city : scene;
  if (requestedCity !== undefined && showing?.cameras?.main && !showing.cameras.main.fadeEffect.isRunning) {
    if (requestedCity === scene.inCity) requestedCity = undefined;
    else if (requestedCity) scene.goCity();
    else city?.goHospital();
  }
  markSpeed(); // la demo cambia y restaura la velocidad
  $('view').textContent = scene.inCity ? 'Ver hospital' : 'Ver ciudad';
  $('pause').textContent = driver.paused ? 'Continuar' : 'Pausa';
  $('clock').textContent = fmtClock(driver.pb.t);
  $('n-patients').textContent = String(driver.pb.figures.size);
  $('map-heading').textContent = scene.inCity ? 'Red de clínicas' : 'Plano del hospital';
  $('legend').hidden = scene.inCity;
  $('city-key').hidden = !scene.inCity;
  const camera = scene.inCity ? city : scene;
  const zoom = camera?.cameras?.main?.zoom;
  button('minus').disabled = ward.index !== undefined || !camera || zoom === undefined || zoom <= camera.minZoom + 1e-6;
  button('plus').disabled = ward.index !== undefined || !camera || zoom === undefined || zoom >= camera.maxZoom - 1e-6;
  button('fit').disabled = ward.index !== undefined;
  if (ward.index !== undefined) {
    ward.update(clinicState(), mockMode, arrivalNotice(ward.index));
    $('map-heading').textContent = 'Interior de la clínica';
  }
  const pb = driver.pb;
  const visitorId = practice?.patientId ?? tracked?.id;
  const visitor = visitorId ? pb.figures.get(visitorId) : undefined;
  const active = Array.from(pb.transfers).find(([, tr]) => tr.patientId === (practice?.patientId ?? scene.follow));
  if (active && ride?.patientId !== active[1].patientId) startRide(active[0]);
  if (ride && !ride.arrived && city?.followedAmbulance && !scene.inCity) {
    const tr = pb.transfers.get(ride.amb);
    if (tr && pb.t - tr.t0 >= Math.min(2, tr.dur * 0.16)) scene.goCity();
  }
  if (scene.follow && !practice) watched.add(scene.follow);
  for (const e of pb.departures.splice(0)) {
    if (ride && e.patientId === ride.patientId && e.data?.outcome === 'remitido') {
      ride.arrived = true;
      driver.speed = ride.initialSpeed;
      if (city) {
        city.followedAmbulance = undefined;
        if (scene.inCity) city.fit();
      }
    }
    if (!practice && (watched.has(e.patientId!) || e.data?.isVisitor)) showCard(e);
    if (!practice) watched.delete(e.patientId!);
  }
  button('follow').disabled = !visitor;
  $('follow').textContent = tracked ? 'Seguir a ' + tracked.info.name : 'Seguir a mi paciente';
  const first = pb.transfers.entries().next().value;
  const tr = ride && !ride.arrived ? pb.transfers.get(ride.amb) : first?.[1];
  $('trip-strip').hidden = !practice && !ride && !first;
  $('trip-label').textContent = practice ? 'Traslado de demostración' : 'Remisión de la corrida';
  button('ride').hidden = !tr;
  button('enter-destination').hidden = !ride?.arrived;
  button('repeat').hidden = !practice || !ride?.arrived;
  if (tr)
    $('trip-state').textContent =
      `${pb.figures.get(tr.patientId)?.name ?? tr.patientId} → ${tr.clinic} · ${Math.max(0, tr.t0 + tr.dur - pb.t).toFixed(1)} min restantes`;
  else if (ride?.arrived)
    $('trip-state').textContent = ride.name + ' llegó a ' + clinicState()[ride.destination].name + '. Cama reservada al asignar el destino.';
  else if (practice) $('trip-state').textContent = 'Consulta preparada. Al terminar, el motor reservará la cama y despachará la ambulancia.';
  button('practice').disabled = !tracked?.id || !!practice || primary?.ed.params.mode !== 'realista';
  destination.disabled = !!practice && !ride?.arrived;
  const f = scene.follow ? driver.pb.figures.get(scene.follow) : undefined;
  $('following').textContent = scene.inCity
    ? 'Selecciona una clínica para consultar sus camas y convenios, o el hospital para entrar.'
    : f
      ? `Siguiendo a ${f.name} (anillo amarillo). Arrastra la escena o haz clic en el piso para soltar.`
      : 'Haz clic sobre un paciente para seguirlo con la cámara.';
  if (!live) return;
  const ed = live.ed;
  updateGraphs?.(live, !!practice);
  const snap = ed.snapshot();
  const v = snap.patients.find((p) => p.id === visitorId);
  const outcomes: Record<string, string> = { alta: 'alta', abandono: 'abandono', hospitalizacion: 'hospitalización', remitido: 'remisión' };
  let state = tracked ? tracked.info.name + ' · pendiente de la próxima llegada.' : 'Crea un visitante para seguir su recorrido.';
  if (v) {
    state = v.name + ' · ' + v.state + (v.triage ? ' · Triage ' + ['', 'I', 'II', 'III', 'IV', 'V'][v.triage] : ' · sin clasificar');
    if (v.state === 'en pasillo' && !snap.ambulances.capacity) state += ' · sin ambulancias habilitadas';
    else if (v.state === 'en pasillo' && snap.ambulances.queue) state += ' · ambulancias ocupadas, en espera de un vehículo';
    else if (
      v.state === 'en pasillo' &&
      ed.params.eps.find((e) => e.id === v.eps)?.network.every((j) => snap.clinics[j].occupied >= snap.clinics[j].beds)
    )
      state += ' · red sin camas libres, en espera de cupo';
  } else if (practice && ride?.arrived) state = ride.name + ' · recibido en la clínica';
  else if (tracked?.outcome) state = tracked.info.name + ' · salida por ' + (outcomes[tracked.outcome] ?? tracked.outcome);
  $('visitor-state').textContent = state;
  updateAccident(live);
  // El motor rechaza el accidente masivo y los visitantes en validación (cambiarían el proceso de llegadas).
  ($('mass') as HTMLButtonElement).disabled = ($('create') as HTMLButtonElement).disabled = !!practice || ed.params.mode === 'validacion';
  if ($('tab-sim').hidden) return;
  const s = snap;
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
