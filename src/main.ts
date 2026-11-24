/// <reference types="vite/client" />
/**
 * Página principal: un solo motor en vivo alimenta la escena (T05–T06) y la vista de texto.
 * Panel de control (T07) a la derecha de la escena. La validación corre aparte en un Web Worker (T11).
 * `?mock` reproduce src/render/mock/events.json en vez del motor (desarrollo).
 */
import { EmergencyDepartment } from './model/ed';
import { networkParams, realisticParams, validationParams, type Mode } from './model/params';
import { geoMap, HIRES_ATTRIBUTION, OSM_ATTRIBUTION, SATELLITE_ATTRIBUTION, type MapStyle } from './render/map/geo';
import { SITES, type SiteId } from './model/valledupar/sites';
import { siteLines } from './ui/site-card';
import { CONDITION_LABEL, type ConditionId } from './model/valledupar/capabilities';
import { ReferralLog, referralSteps } from './ui/referral-steps';
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
import { Social } from './render/companions/social';
import { clinicPlan, hospitalCafe, type MachineKind, type SitePlan } from './render/companions/plans';
import { VendingPanel, orderText } from './ui/vending';
import './ui/expo.css';
import './ui/tour.css';
import './ui/city.css';
import { mountPrehospital, type PrehospitalUi } from './ui/prehospital-panel';

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
      <section class="trip-strip" id="trip-strip" hidden><div><strong id="trip-label"></strong><span id="trip-state"></span></div><div id="trip-why" hidden><ol id="trip-steps" class="steps"></ol><details id="trip-eval"><summary></summary><ul></ul></details></div><div><button id="ride">Seguir ambulancia</button><button id="enter-destination" hidden>Entrar a la clínica</button><button id="repeat" hidden>Repetir demostración</button></div></section>
      <div class="map-card">
        <div class="map-head"><div><span class="map-symbol" aria-hidden="true">◇</span><b id="map-heading">Plano del hospital</b></div>
          <div class="view-group" role="group" aria-label="Vista y cámara"><span id="cafe-group" role="group" aria-label="Cafetería"><button id="buy-drink">Máquina de refrescos</button><button id="buy-snack">Máquina de papas</button></span><button id="view">Ver ciudad</button><button id="minus" aria-label="Alejar">−</button><button id="plus" aria-label="Acercar">+</button><button id="fit">Ver todo</button><select id="map-focus" aria-label="Resaltar sedes por condición" hidden><option value="">Todas las sedes</option></select><select id="map-style" aria-label="Vista del mapa" hidden><option value="mapa">Mapa</option><option value="satelite">Satélite</option><option value="simple">Solo calles</option></select><button id="fullscreen" title="Tecla F">Pantalla completa</button></div>
        </div>
        <div class="canvas-wrap">
          <div id="scene"></div><section id="ward" hidden></section><section id="vending" hidden></section><div id="tip" hidden></div>
          <div id="card" role="dialog" aria-label="Información de la simulación" hidden></div>
          <aside id="side" class="side" aria-label="Paciente en el mapa" hidden></aside>
          <button id="doll" class="doll" type="button" hidden aria-label="Paciente: arrástralo al mapa, o haz clic y luego clic en el mapa"><svg viewBox="0 0 44 56" width="44" height="56" aria-hidden="true"><ellipse cx="22" cy="52" rx="13" ry="3.5" fill="#193f40" opacity=".25"/><circle cx="22" cy="12" r="9" fill="#f2c9a0"/><path d="M13 9a9 9 0 0 1 18 0c-3-2-6-3-9-3s-6 1-9 3z" fill="#3b2a20"/><rect x="11" y="22" width="22" height="20" rx="7" fill="#c8442f"/><rect x="20" y="26" width="4" height="12" fill="#fff"/><rect x="16" y="30" width="12" height="4" fill="#fff"/><rect x="14" y="40" width="6" height="11" rx="2" fill="#234e51"/><rect x="24" y="40" width="6" height="11" rx="2" fill="#234e51"/></svg><span>Arrástrame al mapa</span></button>
          <div id="subs" aria-live="polite" hidden></div>
          <div id="demo-banner" hidden>Demostración · mueve el puntero para tomar el control</div>
        </div>
        <div class="map-foot"><div id="legend"></div><div id="city-key" hidden>Ocupación de camas <span>● &lt; 70 %</span><span>● 70–89 %</span><span>● ≥ 90 %</span><span id="key-net" hidden>● no simulada <b>—</b> ruta del traslado</span><span id="key-focus" hidden>◯ verde: atención definitiva · ◯ ámbar: condicionada · atenuadas: no la atienden o sin información</span></div><small id="osm-attrib" hidden></small></div>
      </div>
      <p id="companion-state" role="status"></p><p id="toast" role="status"></p><p id="recovery" role="status"></p><p id="following"></p><p id="source"></p>
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

const query = new URLSearchParams(location.search);
const mockMode = query.has('mock');
/** T25: `?red` carga el escenario de la red real de Valledupar (sedes, calles y rutas de OpenStreetMap). */
const networkMode = !mockMode && query.has('red');
/** Parámetros de referencia de la sesión (clínicas del mapa, tarjetas, acompañantes). */
const baseParams = () => (networkMode ? networkParams() : realisticParams());
/**
 * Motor nuevo en el modo pedido, arrancando a las 08:00 del día 1, y su gemelo sin accidentes
 * (misma semilla) para medir la recuperación tras un accidente masivo (T17).
 */
function makePair(mode: Mode): [EmergencyDepartment, EmergencyDepartment] {
  const seed = Date.now() % 100000;
  const params = () => (networkMode ? networkParams() : mode === 'validacion' ? validationParams() : realisticParams());
  const ed = new EmergencyDepartment(params(), { seed, recordEvents: true });
  const twin = new EmergencyDepartment(params(), { seed });
  ed.step(8 * 60);
  twin.step(8 * 60);
  return [ed, twin];
}
const primary = mockMode ? undefined : new LiveDriver(...makePair(query.get('modo') === 'validacion' ? 'validacion' : 'realista'));
/** T26: remisiones de la corrida principal en 4 pasos (todo sale de eventos del motor). */
const referrals = new ReferralLog();
/** T31: paciente colocado en el mapa (solo `?red`). */
let pre: PrehospitalUi | undefined;
if (networkMode) primary?.ed.onEvent((e) => referrals.onEvent(e));
const hhmm = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
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
/**
 * T24: un modelo social por sesión (corrida principal, cada ensayo, registro grabado). Avanza con el reloj
 * de esa sesión y usa su propio generador: no toca el motor ni sus aleatorios.
 */
const socials = new WeakMap<object, Social>();
function social(): Social {
  const d = driver.current;
  let s = socials.get(d);
  if (!s) {
    const beds = (d instanceof LiveDriver ? d.ed.params : realisticParams()).clinics.map((c) => c.beds);
    // T27: en la red solo la unidad de camas de adulto de cada sede tiene planta (las UCI no tienen interior).
    const pools = live?.ed.params.network?.pools;
    s = new Social([hospitalCafe(), ...beds.flatMap((b, j) => (pools && pools[j] !== 'general' ? [] : [sitePlan(j, b)]))], 2026);
    socials.set(d, s);
  }
  return s;
}
/**
 * T25: en la red real cada sede reutiliza una de las tres plantas de T24 como planta REPRESENTATIVA, con su
 * nombre real y a lo sumo las camas que esa planta dibuja bien; la ocupación se escala (ver `state`).
 */
const DRAWN_BEDS = [30, 40, 50];
function sitePlan(j: number, beds: number): SitePlan {
  if (!networkMode) return clinicPlan(j, beds);
  return { ...clinicPlan(j % 3, Math.min(beds, DRAWN_BEDS[j % 3])), site: j, name: clinicParams()[j].name };
}
const siteName = (site: number) => (site < 0 ? (networkMode ? 'Hospital de origen' : 'Hospital Regional') : clinicParams()[site].name);
const vending = new VendingPanel($('vending'), {
  social,
  siteName,
  paused: () => driver.paused,
  notify: (msg) => ($('toast').textContent = msg),
});
const openMachine = (site: number, kind: MachineKind) => {
  $('card').hidden = true;
  vending.open(site, kind);
};
const destination = $('destination') as HTMLSelectElement;
destination.replaceChildren(...realisticParams().clinics.map((c, i) => new Option(c.name, String(i))));
const ward: ClinicInterior = new ClinicInterior(
  $('ward'),
  () => ward.close('city'),
  undefined,
  (j) => social().plan(j),
);
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
const clinicParams = () => (live ? live.ed.params : baseParams()).clinics;
const clinicState = () => (live ? live.ed.snapshot().clinics : (original as MockDriver).initialClinics);
/** Camas reservadas ahora para traslados que van en camino a la clínica j (ya incluidas en `occupied`). */
const reservedFor = (j: number) => Array.from(driver.pb.transfers.values()).filter((tr) => tr.clinicId === j).length;
const {
  hospital: scene,
  city,
  clinic: clinicScene,
} = mountScene(
  $('scene'),
  driver,
  live ? onHover : undefined,
  {
  travelMeans: clinicParams().map((c) => distMean(c.travel)),
  clinics: clinicState,
  onClinic: (j) => {
    const p = live ? live.ed.params : realisticParams();
    const occ = clinicState()[j].occupied;
    const c = clinicCard(j, p, occ, driver.pb.receivedByClinic.get(j) ?? 0);
    if (mockMode) c.lines[0] += ' · al inicio del registro';
    // T26: en la red real, debajo de la ocupación simulada va la ficha documentada de la sede.
    const site = networkMode ? p.network?.sites[j] : undefined;
    // T27: ocupación simulada de cada tipo de cama documentado de la sede (UCI, quemados…).
    const units = site
      ? p.network!.sites.flatMap((id, k) => (id === site && k !== j ? [`${p.clinics[k].name.split(' · ')[1]}: ${clinicState()[k].occupied} de ${p.clinics[k].beds} ocupadas`] : []))
      : [];
    showInfoCard(c.title, '#e6edf3', site ? [...c.lines, ...(units.length ? ['Otras camas simuladas — ' + units.join(' · ')] : []), ...siteLines(site, true)] : c.lines, () => openWard(j));
  },
  ...(networkMode
    ? {
        geo: geoMap(networkParams().network!.sites),
        onSite: (id: string) => showSiteCard(id),
        prehospital: () => pre?.mapState() ?? { cases: [] },
        onMapPick: (x: number, y: number) => pre?.onPick(x, y),
      }
    : {}),
  },
  {
    cafe: { social, onMachine: openMachine },
    clinic: {
      social,
      onMachine: openMachine,
      // Cada cama dibujada representa beds/dibujadas camas del motor (1 fuera de la red real).
      state: (j) => {
        const c = clinicState()[j];
        const drawn = social().plan(j)?.beds.length || c.beds;
        return { occupied: Math.round((c.occupied * drawn) / c.beds), reserved: Math.min(reservedFor(j), drawn) };
      },
      // La tarjeta de la clínica va a la izquierda en pantallas anchas y arriba en las estrechas.
      inset: () =>
        $('scene').clientWidth > 900 ? { left: $('ward').offsetWidth + 16, top: 0 } : { left: 0, top: $('ward').offsetHeight + 8 },
    },
  },
);
ward.scene = clinicScene;
if (networkMode && primary) {
  pre = mountPrehospital({
    root: $('side'),
    doll: button('doll'),
    stage: $('scene'),
    ed: () => (practice ? undefined : primary.ed),
    now: () => driver.pb.t,
    city: () => city,
    clock: (t) => fmtClock(t),
    notify: (msg) => ($('toast').textContent = msg),
    // Los tramos duran pocos minutos simulados: a ×6 se ven en pantalla; la cámara sigue a la ambulancia.
    onStart: (c) => {
      $('card').hidden = true;
      if (c.legs.length || c.requested !== undefined) driver.speed = 6;
      $('toast').textContent = `${c.name}: ${c.decision.chosen ? 'destino ' + c.decision.chosen.name : 'sin destino en la red'}. Velocidad ×6 para ver el traslado.`;
    },
    onFollow: (amb) => {
      if (!scene.inCity) scene.goCity();
      if (city) city.followedAmbulance = amb;
    },
  });
  primary.ed.onEvent((e) => pre!.log.onEvent(e));
}
function openWard(j: number) {
  $('card').hidden = true;
  ward.open(j);
  ward.update(clinicState(), mockMode, arrivalNotice(j), reservedFor(j));
}
function arrivalNotice(j: number) {
  return ride?.arrived && ride.destination === j ? 'Traslado recibido · ' + ride.name : undefined;
}
$('view').onclick = () => {
  if (ward.index !== undefined) return ward.close('hospital');
  if (scene.inCity) city?.goHospital();
  else scene.goCity();
};
// Pantalla completa (como un video): la columna de la escena con sus franjas. Botón o tecla F; Esc sale.
const toggleFullscreen = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.querySelector('.map-column')!.requestFullscreen().catch(() => ($('toast').textContent = 'Este navegador no permitió la pantalla completa; usa F11.'));
button('fullscreen').onclick = toggleFullscreen;
document.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
  if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || typing || !$('vending').hidden) return;
  e.preventDefault();
  toggleFullscreen();
});
document.addEventListener('fullscreenchange', () => ($('fullscreen').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa'));
button('buy-drink').onclick = () => openMachine(ward.index ?? -1, 'refrescos');
button('buy-snack').onclick = () => openMachine(ward.index ?? -1, 'papas');
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
      clinicScene,
      social,
      vending,
      openWard: (j: number) => openWard(j),
      ward,
    },
  });
$('fit').onclick = () => {
  if (ward.index !== undefined) clinicScene?.fit();
  else if (scene.inCity) {
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
  $(id).onclick = () => (ward.index !== undefined ? clinicScene?.zoomBy(factor) : scene.inCity ? city?.zoomBy(factor) : scene.zoomBy(factor));
$('visitor-tools').hidden = $('mass-tools').hidden = mockMode;
$('panel').hidden = mockMode;
if (mockMode) $('city-key').prepend('Registro inicial · ');
if (primary)
  mountPanel($('panel'), primary, (mode) => {
    // La red real cambia el número de sedes y el mapa: se carga en una página nueva.
    if (mode === 'red' || networkMode) {
      location.search = mode === 'red' ? '?red' : mode === 'validacion' ? '?modo=validacion' : '';
      return;
    }
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

if (networkMode) {
  $('osm-attrib').textContent = OSM_ATTRIBUTION;
  const style = $('map-style') as HTMLSelectElement;
  style.onchange = () => city?.setStyle(style.value as MapStyle);
  const focus = $('map-focus') as HTMLSelectElement;
  focus.append(...Object.entries(CONDITION_LABEL).map(([id, label]) => new Option(label, id)));
  focus.onchange = () => {
    city?.setFocus((focus.value || undefined) as ConditionId | undefined);
    $('key-focus').hidden = !focus.value;
  };
  $('key-net').hidden = false;
  $('practice').parentElement!.hidden = true; // el ensayo usa las clínicas ficticias
}
$('source').textContent = networkMode
  ? 'Red Valledupar: sedes reales (REPS), calles y rutas de OpenStreetMap. Escenario académico: la ocupación es simulada, no la disponibilidad real; no sirve para decidir traslados.'
  : mockMode
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
    !!practice ||
    (!!ride && !ride.arrived) ||
    ward.index !== undefined ||
    vending.isOpen ||
    social().orderActive ||
    !$('tab-graphs').hidden ||
    !$('side').hidden ||
    !!document.querySelector('dialog[open]'),
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
    if (e.type === 'ARRIVAL' && (e.data?.info as { isVisitor?: boolean })?.isVisitor && !pre?.ids.has(e.patientId!)) {
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
    // Red real: los viajes duran 1–6 min simulados; a ×6 se ven 10–60 s en pantalla.
    driver.speed = networkMode ? 6 : 60;
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
  vending.close();
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
  vending.close();
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
/** T25: ficha de una sede real que no entra a la simulación (hechos documentados y por qué no se simula). */
function showSiteCard(id: string): void {
  showInfoCard(SITES.find((x) => x.id === id)!.name, '#d7ddd1', siteLines(id as SiteId, false));
}
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
  if (requestedCity !== undefined && ward.index === undefined && showing?.cameras?.main && !showing.cameras.main.fadeEffect.isRunning) {
    if (requestedCity === scene.inCity) requestedCity = undefined;
    else if (requestedCity) scene.goCity();
    else city?.goHospital();
  }
  markSpeed(); // la demo cambia y restaura la velocidad
  pre?.update();
  $('doll').hidden = !(pre && scene.inCity && ward.index === undefined && !practice);
  $('side').hidden = !(pre?.open() && scene.inCity && ward.index === undefined && !practice);
  $('view').textContent = scene.inCity ? 'Ver hospital' : 'Ver ciudad';
  $('pause').textContent = driver.paused ? 'Continuar' : 'Pausa';
  $('clock').textContent = fmtClock(driver.pb.t);
  $('n-patients').textContent = String(driver.pb.figures.size);
  $('map-heading').textContent = scene.inCity ? (networkMode ? 'Red hospitalaria de Valledupar' : 'Red de clínicas') : 'Plano del hospital';
  $('legend').hidden = scene.inCity;
  $('city-key').hidden = !scene.inCity;
  $('osm-attrib').hidden = $('map-style').hidden = $('map-focus').hidden = !(networkMode && scene.inCity && ward.index === undefined);
  if (networkMode && city)
    $('osm-attrib').textContent =
      OSM_ATTRIBUTION + (city.style === 'satelite' ? ' · Imagen: ' + (city.hiresOk ? HIRES_ATTRIBUTION + ' · ' : '') + SATELLITE_ATTRIBUTION : '');
  const camera = ward.index !== undefined ? clinicScene : scene.inCity ? city : scene;
  const zoom = camera?.cameras?.main?.zoom;
  button('minus').disabled = !camera || zoom === undefined || zoom <= camera.minZoom + 1e-6;
  button('plus').disabled = !camera || zoom === undefined || zoom >= camera.maxZoom - 1e-6;
  $('cafe-group').hidden = scene.inCity && ward.index === undefined;
  if (ward.index !== undefined) {
    ward.update(clinicState(), mockMode, arrivalNotice(ward.index), reservedFor(ward.index));
    $('map-heading').textContent = 'Interior de la clínica';
    $('city-key').hidden = true;
  }
  // T24: el modelo social sigue el reloj de la sesión visible (también en el mapa) y avisa las entregas.
  const soc = social();
  soc.advance(driver.pb.t);
  for (const o of soc.inbox.splice(0)) if (o.state === 'entregado') $('toast').textContent = `Mi acompañante recibió ${o.product.name} · ${o.product.code}`;
  $('companion-state').textContent = soc.myOrder
    ? soc.orderActive
      ? `Mi acompañante · ${siteName(soc.myOrder.site)} · ${orderText(soc, soc.myOrder, driver.paused)}`
      : orderText(soc, soc.myOrder, driver.paused)
    : 'Mi acompañante · compra en la cafetería: haz clic en una máquina y escribe el código del producto.';
  vending.update();
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
  $('trip-strip').hidden = !practice && !ride && !first && !(networkMode && referrals.latest);
  $('trip-label').textContent = practice ? 'Traslado de demostración' : 'Remisión de la corrida';
  button('ride').hidden = !tr;
  button('enter-destination').hidden = !ride?.arrived;
  // T26: la remisión que se sigue, la del traslado en curso o la última que empezó.
  referrals.tick(pb.t, pb.ambulancesAway);
  const refId = (ride && !ride.arrived ? ride.patientId : undefined) ?? first?.[1].patientId ?? referrals.latest;
  const ref = !practice && networkMode && refId ? referrals.all.get(refId) : undefined;
  $('trip-why').hidden = !ref;
  if (ref && live) {
    const snapP = live.ed.snapshot().patients.find((p) => p.id === ref.id);
    $('trip-steps').replaceChildren(
      ...referralSteps(ref, pb.t, snapP).map((s) => {
        const li = document.createElement('li');
        li.className = 'st-' + s.state.replace(' ', '-');
        li.append(
          Object.assign(document.createElement('small'), { textContent: `${s.n} · ${s.state}${s.when !== undefined ? ' · ' + hhmm(s.when) : ''}` }),
          Object.assign(document.createElement('b'), { textContent: s.title }),
          Object.assign(document.createElement('em'), { textContent: s.sub }),
          Object.assign(document.createElement('span'), { textContent: s.detail }),
        );
        return li;
      }),
    );
    // Evaluación de cada sede: la del traslado o, mientras espera, la más reciente del motor.
    const evals = ref.discarded ?? snapP?.decision?.evaluated.map((e) => ({ site: e.name, reason: e.reason })) ?? [];
    const key = ref.id + ':' + evals.length + ':' + (ref.depart ?? '');
    if ($('trip-eval').dataset.key !== key) {
      $('trip-eval').dataset.key = key;
      $('trip-eval').querySelector('summary')!.textContent = (ref.reason ? `Por qué: ${ref.reason}. ` : '') + `Ver las ${evals.length} sedes evaluadas`;
      $('trip-eval').querySelector('ul')!.replaceChildren(...evals.map((d) => Object.assign(document.createElement('li'), { textContent: `${d.site}: ${d.reason}` })));
    }
    $('trip-eval').hidden = !evals.length;
    if (!tr && !ride) $('trip-state').textContent = (pb.figures.get(ref.id)?.name ?? ref.id) + (ref.arrive !== undefined ? ' · remisión completada' : ref.out !== undefined ? ' · remitido fuera de la red' : ' · remisión en curso');
  }
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
  $('following').textContent = ward.index !== undefined
    ? 'Arrastra para recorrer la clínica; haz clic en una máquina de la cafetería para comprar con Mi acompañante.'
    : scene.inCity
    ? networkMode
      ? 'Selecciona una sede para ver su ficha, o el hospital de origen para entrar. La ruta azul es el traslado en curso.'
      : 'Selecciona una clínica para consultar sus camas y convenios, o el hospital para entrar.'
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
