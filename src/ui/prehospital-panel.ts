/**
 * T31–T32 — Paciente en el mapa (escenario de red): muñeco arrastrable o clic, validación del punto, formulario,
 * alternativas explicadas y seguimiento del paciente. La decisión y los tiempos son del motor
 * (`previewPrehospital`, `injectPrehospital`, `prehospitalCases`); aquí solo se muestran.
 */
import type { EmergencyDepartment, PrehospitalCase, PrehospitalRequest } from '../model/ed';
import type { TriageLevel } from '../engine/events';
import { CONDITION_POOL, POOLS } from '../model/params';
import { KIND_LABEL, POLICIES, POLICY_LABEL, type Option, type Policy, type PrehospitalDecision } from '../model/prehospital';
import { CONDITION_LABEL, type ConditionId } from '../model/valledupar/capabilities';
import { NO_EPS, REAL_EPS, relationOf } from '../model/valledupar/eps';
import { unproj } from '../model/valledupar/proj';
import { place, type RoadPoint, type Route } from '../model/valledupar/router';
import { SITES } from '../model/valledupar/sites';
import type { CityScene } from '../render/map/city';
import { CaseLog, caseSummary, caseTitle, fmtMin, timeline } from './patient-timeline';

export interface PrehospitalUi {
  /** lo que dibuja el mapa: casos, punto elegido y ruta de la recomendación */
  mapState: () => { cases: PrehospitalCase[]; pending?: { x: number; y: number }; preview?: number[] };
  onPick: (x: number, y: number) => void;
  update: () => void;
  /** el panel tiene algo que mostrar (formulario o seguimiento) */
  open: () => boolean;
  /** punto del paciente que se está configurando o siguiendo (metros) */
  point: () => { x: number; y: number } | undefined;
  log: CaseLog;
  /** ids de pacientes del mapa (para no confundirlos con los del creador de personaje) */
  ids: Set<string>;
}

interface Options {
  root: HTMLElement;
  doll: HTMLButtonElement;
  stage: HTMLElement;
  ed: () => EmergencyDepartment | undefined;
  now: () => number;
  city: () => CityScene | undefined;
  clock: (t: number) => string;
  notify: (msg: string) => void;
  onStart: (c: PrehospitalCase) => void;
  onFollow: (amb: string) => void;
}

type Props = Record<string, unknown> & { class?: string };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: (Node | string | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = String(v);
    else if (k.startsWith('on')) (e as unknown as Record<string, unknown>)[k] = v;
    else if (v !== undefined && v !== false) e.setAttribute(k, String(v));
  }
  for (const k of kids) if (k !== undefined && k !== false) e.append(k);
  return e;
}
const select = (id: string, label: string, opts: [string, string][], value?: string) => {
  const s = el('select', { id }, ...opts.map(([v, t]) => new Option(t, v, false, v === value)));
  return { field: el('label', { class: 'field' }, el('span', {}, label), s), input: s };
};
/** condición y política tienen textos largos: ocupan las dos columnas para leerse completos */
const wide = (f: HTMLLabelElement) => (f.classList.add('wide'), f);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const KIND_CLASS: Record<Option['kind'], string> = { definitiva: 'k-def', estabilizacion: 'k-est', insuficiente: 'k-ins', 'no-compatible': 'k-no' };
const badge = (o: Option) => el('span', { class: 'kind ' + KIND_CLASS[o.kind] }, KIND_LABEL[o.kind]);
const km = (m?: number) => (m === undefined ? '—' : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const siteName = (id: string) => SITES.find((s) => s.id === id)?.name ?? id;
const epsName = (id: string) => REAL_EPS.find((e) => e.id === id)?.name ?? (id === NO_EPS.id ? NO_EPS.name : id);

export function mountPrehospital(o: Options): PrehospitalUi {
  const log = new CaseLog();
  const ids = new Set<string>();
  const regime = new Map<string, string>();
  let pending: RoadPoint | undefined;
  let preview: { decision: PrehospitalDecision; routes: Record<string, Route | null>; pickup: Route | null } | undefined;
  let mode: 'idle' | 'form' | 'case' = 'idle';
  let selected: string | undefined;
  let lastPreview = -Infinity;
  let counter = 1;

  // ---------- formulario ----------
  const nameIn = el('input', { id: 'pre-name', value: 'Paciente 1', maxlength: 40, autocomplete: 'off' });
  const age = select('pre-age', 'Grupo de edad', [['0-17', '0 a 17 años'], ['18-39', '18 a 39 años'], ['40-64', '40 a 64 años'], ['65+', '65 años o más']], '40-64');
  const eps = select('pre-eps', 'EPS', [...REAL_EPS.map((e) => [e.id, e.name] as [string, string]), [NO_EPS.id, NO_EPS.name]], 'nueva-eps');
  const reg = select('pre-regime', 'Régimen', [['contributivo', 'Contributivo'], ['subsidiado', 'Subsidiado'], ['especial', 'Especial o de excepción'], ['no-aplica', 'No aplica o no sabe']], 'subsidiado');
  const cond = select('pre-cond', 'Condición del escenario', Object.entries(CONDITION_LABEL) as [string, string][], 'iam');
  const tri = select('pre-triage', 'Triage del escenario', [1, 2, 3, 4, 5].map((n) => [String(n), `Triage ${ROMAN[n]}`] as [string, string]), '2');
  const stab = select('pre-stable', 'Estabilidad', [['inestable', 'Inestable'], ['estable', 'Estable']], 'inestable');
  const amb = el('input', { id: 'pre-amb', type: 'checkbox', checked: true });
  const pol = select('pre-policy', 'Política de selección', POLICIES.map((p) => [p, POLICY_LABEL[p]] as [string, string]), 'tiempo');
  const needs = el('p', { class: 'needs' });
  const where = el('p', { class: 'where' });
  const rec = el('div', { class: 'rec', 'aria-live': 'polite' });
  const compare = el('table', { class: 'policies' });
  const all = el('details', { class: 'options' });
  const start = el('button', { class: 'primary', onclick: () => go() }, 'Iniciar traslado');
  const form = el(
    'form',
    { class: 'pre-form', onsubmit: (e: Event) => e.preventDefault(), oninput: () => refresh(true), onchange: () => refresh(true) },
    el('label', { class: 'field wide' }, el('span', {}, 'Nombre ficticio'), nameIn),
    wide(cond.field),
    age.field,
    eps.field,
    reg.field,
    tri.field,
    stab.field,
    el('label', { class: 'field check' }, amb, el('span', {}, 'Necesita ambulancia')),
    wide(pol.field),
    needs,
    where,
    el('p', { class: 'fine' }, 'Datos ficticios: no escribas documentos de identidad ni información médica real. El triage es una condición del escenario académico, no una clasificación clínica.'),
  );

  const request = (): PrehospitalRequest | undefined =>
    pending && {
      info: { name: nameIn.value.trim() || `Paciente ${counter}`, ageRange: age.input.value as PrehospitalRequest['info']['ageRange'], eps: eps.input.value },
      level: Number(tri.input.value) as TriageLevel,
      condition: cond.input.value as ConditionId,
      stable: stab.input.value === 'estable',
      ambulance: amb.checked,
      point: pending,
      policy: pol.input.value as Policy,
    };

  function optionRow(op: Option): HTMLLIElement {
    const rel = relationOf(eps.input.value, op.site);
    return el(
      'li',
      {},
      el('div', { class: 'row' }, el('b', {}, op.name), badge(op)),
      el('small', {}, op.minutes !== undefined ? `${km(op.meters)} · ${fmtMin(op.minutes)} de traslado${op.expected !== undefined ? ` · atención adecuada en ≈ ${fmtMin(op.expected)}` : ''}` : 'Sin ruta'),
      el('ul', {}, ...op.reasons.map((r) => el('li', {}, r))),
      rel ? el('small', { class: 'src' }, `Relación con la EPS: ${rel.status} (${rel.validity}). Fuente: `, el('a', { href: rel.source, target: '_blank', rel: 'noopener' }, 'documento')) : undefined,
    );
  }

  function refresh(force = false): void {
    const ed = o.ed();
    const r = request();
    if (!ed || !r) return;
    if (!force && performance.now() - lastPreview < 2000) return;
    lastPreview = performance.now();
    preview = ed.previewPrehospital(r) ?? undefined;
    const pool = POOLS.find((k) => k.id === CONDITION_POOL[r.condition])!;
    needs.textContent = `Recurso requerido para la atención definitiva: ${pool.label}. ${r.level <= 2 || !r.stable ? 'Paciente crítico: la EPS no cuenta.' : 'Paciente estable: puede ir a la red de su EPS si llega ≤ 15 min después.'}`;
    const ll = unproj([r.point.x, r.point.y]);
    where.textContent = `Ubicación: ${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)} · ajustada a la vía (a ${Math.round(r.point.distM)} m del punto)`;
    if (!preview) return;
    const d = preview.decision;
    const ch = d.chosen;
    rec.replaceChildren(
      el('small', {}, 'Recomendación · ' + POLICY_LABEL[d.policy]),
      el('b', {}, ch ? ch.name : 'Sin destino en la red'),
      ch ? badge(ch) : '',
      el('p', {}, d.why),
      preview.pickup && r.ambulance ? el('small', {}, `La ambulancia sale del hospital de origen: ${km(preview.pickup.meters)} · ${fmtMin(preview.pickup.minutes)} hasta el paciente.`) : '',
    );
    compare.replaceChildren(
      el('caption', {}, 'Mismo paciente, tres políticas'),
      el('tr', {}, el('th', {}, 'Política'), el('th', {}, 'Sede'), el('th', {}, 'Primera atención'), el('th', {}, 'Atención adecuada')),
      ...POLICIES.map((p) => {
        const b = d.byPolicy[p];
        return el('tr', { class: p === d.policy ? 'on' : '' }, el('td', {}, POLICY_LABEL[p]), el('td', {}, b.site ? siteName(b.site) : '—'), el('td', {}, b.minutes !== undefined ? fmtMin(b.minutes) : '—'), el('td', {}, b.expected !== undefined ? '≈ ' + fmtMin(b.expected) : 'sin destino ahora'));
      }),
    );
    const sorted = [...d.options].sort((a, b) => (a.expected ?? 1e9) - (b.expected ?? 1e9) || (a.minutes ?? 1e9) - (b.minutes ?? 1e9));
    all.replaceChildren(el('summary', {}, `Las ${d.options.length} instituciones evaluadas y por qué`), el('ol', {}, ...sorted.map(optionRow)));
    start.disabled = !ch;
  }

  function go(): void {
    const ed = o.ed();
    const r = request();
    if (!ed || !r) return;
    const c = ed.injectPrehospital(r);
    if (!c) return;
    ids.add(c.id);
    regime.set(c.id, reg.input.options[reg.input.selectedIndex].text);
    log.watch(c.id);
    pending = undefined;
    preview = undefined;
    counter++;
    nameIn.value = `Paciente ${counter}`;
    selected = c.id;
    mode = 'case';
    render();
    o.onStart(c);
  }

  // ---------- punto en el mapa ----------
  function onPick(x: number, y: number): void {
    const p = place(x, y);
    if (!p.ok) {
      mode = 'form';
      pending = undefined;
      preview = undefined;
      o.root.replaceChildren(
        head('Ubicación no válida'),
        el('p', { class: 'warn' }, p.reason),
        p.suggestion ? el('button', { class: 'primary', onclick: () => onPick(p.suggestion!.x, p.suggestion!.y) }, `Usar la vía accesible más cercana (a ${Math.round(p.suggestion.distM)} m)`) : '',
        el('button', { onclick: () => arm() }, 'Elegir otro punto'),
      );
      return;
    }
    pending = p.point;
    if (mode !== 'form' || !o.root.contains(form)) {
      mode = 'form';
      o.root.replaceChildren(head('Nuevo paciente en el mapa'), form, rec, compare, all, el('div', { class: 'actions' }, start, el('button', { onclick: () => arm() }, 'Cambiar ubicación'), el('button', { onclick: () => close() }, 'Cancelar')));
    }
    refresh(true);
  }
  function arm(): void {
    const city = o.city();
    if (!city) return;
    city.placing = true;
    o.notify('Haz clic en el mapa donde está el paciente (Esc cancela).');
  }
  function close(): void {
    mode = 'idle';
    pending = undefined;
    preview = undefined;
  }
  const head = (title: string) => el('div', { class: 'side-head' }, el('h3', {}, title), el('button', { class: 'x', 'aria-label': 'Cerrar', onclick: () => close() }, '✕'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && o.city()?.placing) {
      o.city()!.placing = false;
      o.notify('');
    }
  });

  // ---------- muñeco: arrastrar y soltar, o clic y luego clic en el mapa ----------
  o.doll.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const x0 = e.clientX,
      y0 = e.clientY;
    let ghost: HTMLElement | undefined;
    // Como el muñequito de un mapa: se levanta solo la figura y sus pies marcan el punto exacto donde caerá.
    const move = (m: PointerEvent) => {
      if (!ghost && Math.hypot(m.clientX - x0, m.clientY - y0) > 6) {
        ghost = el('div', { class: 'doll-ghost', 'aria-hidden': 'true' }, o.doll.querySelector('svg')!.cloneNode(true) as SVGElement, el('i', { class: 'drop' }));
        (o.stage.closest(':fullscreen') ?? document.body).append(ghost);
        o.doll.classList.add('lifted');
      }
      if (ghost) Object.assign(ghost.style, { left: `${m.clientX}px`, top: `${m.clientY}px` });
    };
    const up = (u: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (!ghost) return arm(); // fue un clic
      ghost.remove();
      o.doll.classList.remove('lifted');
      const r = o.stage.getBoundingClientRect();
      const city = o.city();
      if (city && u.clientX >= r.left && u.clientX <= r.right && u.clientY >= r.top && u.clientY <= r.bottom) {
        const m = city.metersAtClient(u.clientX, u.clientY);
        onPick(m.x, m.y);
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  o.doll.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      arm();
    }
  });

  // ---------- seguimiento del paciente ----------
  function render(): void {
    const ed = o.ed();
    if (mode !== 'case' || !ed) return;
    const cases = ed.prehospitalCases().filter((c) => ids.has(c.id));
    const c = cases.find((x) => x.id === selected) ?? cases.at(-1);
    if (!c) return;
    const now = o.now();
    const pick = el(
      'select',
      { 'aria-label': 'Paciente', onchange: (e: Event) => ((selected = (e.target as HTMLSelectElement).value), render()) },
      ...[...cases].reverse().map((x) => new Option(`${x.name} · ${x.outcome ?? x.status}`, x.id, false, x.id === c.id)),
    );
    const leg = [...c.legs].reverse().find((l) => l.t0 <= now && now < l.t0 + l.minutes);
    const stages = timeline(c, now, log.trace.get(c.id));
    const others = c.decision.options.filter((x) => x.site !== c.decision.chosen?.site);
    const wasOpen = !!o.root.querySelector<HTMLDetailsElement>('details.options')?.open;
    o.root.replaceChildren(
      head('Seguimiento del paciente'),
      el('div', { class: 'who' }, pick, el('p', {}, `${c.id} · ${caseTitle(c)}`), el('p', { class: 'fine' }, `EPS: ${epsName(c.eps)} · ${regime.get(c.id) ?? ''} · ${c.ageRange} años`)),
      el('dl', { class: 'summary' }, ...caseSummary(c, now).flatMap((s) => [el('dt', {}, s.label), el('dd', {}, s.value)])),
      el(
        'ol',
        { class: 'timeline' },
        ...stages.map((s) => el('li', { class: 'st-' + s.state.replace(' ', '-') }, el('small', {}, s.when !== undefined ? o.clock(s.when) : s.state), el('b', {}, s.title), el('span', {}, s.detail))),
      ),
      el('details', { class: 'options', open: wasOpen }, el('summary', {}, `Instituciones descartadas o alternativas (${others.length})`), el('ol', {}, ...others.map(optionRow))),
      el('div', { class: 'actions' }, leg?.amb ? el('button', { class: 'primary', onclick: () => o.onFollow(leg.amb!) }, 'Seguir ambulancia') : '', el('button', { onclick: () => arm() }, 'Nuevo paciente'), el('button', { onclick: () => close() }, 'Cerrar')),
    );
  }

  let lastRender = -Infinity;
  return {
    log,
    ids,
    onPick,
    open: () => mode !== 'idle',
    point: () => pending ?? (selected ? o.ed()?.prehospitalCases().find((c) => c.id === selected)?.point : undefined),
    mapState: () => {
      const ed = o.ed();
      const chosen = preview?.decision.chosen;
      return {
        cases: ed ? ed.prehospitalCases().filter((c) => ids.has(c.id)) : [],
        ...(pending ? { pending: { x: pending.x, y: pending.y } } : {}),
        ...(chosen && preview?.routes[chosen.site] ? { preview: preview.routes[chosen.site]!.path } : {}),
      };
    },
    update: () => {
      if (mode === 'form') refresh();
      else if (mode === 'case' && performance.now() - lastRender > 400) {
        lastRender = performance.now();
        // no redibujar mientras se usa el selector de pacientes
        if (!o.root.querySelector('select:focus')) render();
      }
    },
  };
}
