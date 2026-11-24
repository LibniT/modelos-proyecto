/**
 * T32 — Ficha de institución en pestañas (General · Servicios · EPS · Capacidad · Fuentes), en el panel lateral
 * derecho del mapa. Distingue lo documentado (●), lo simulado (◌) y lo desconocido (?). No quita información de la
 * investigación: lo técnico (método de ubicación, fuentes, notas, matriz completa) queda en pestañas secundarias.
 */
import rutas from '../model/valledupar/rutas.json';
import { CONDITION_LABEL, RECEPTION_MATRIX, reception, type ConditionId, type Reception } from '../model/valledupar/capabilities';
import { REAL_EPS, relationOf } from '../model/valledupar/eps';
import { nearestRoad, routesFrom, routesFromSite, sitePoints, type Traffic } from '../model/valledupar/router';
import { SITES, SOURCES, type Capacity, type SiteId } from '../model/valledupar/sites';
import { fmtMin } from './patient-timeline';

export interface SiteUnit {
  label: string;
  occupied: number;
  beds: number;
  /** índice de la unidad (para entrar al interior) */
  j: number;
  general: boolean;
}

const CAPACITY_LABEL: Record<keyof Capacity, string> = {
  adultBeds: 'Camas de adulto',
  pediatricBeds: 'Camas pediátricas',
  icuAdult: 'UCI adulto',
  icuPediatric: 'UCI pediátrica',
  icuNeonatal: 'UCI neonatal',
  intermediateAdult: 'Cuidado intermedio adulto',
  observation: 'Observación',
  operatingRooms: 'Quirófanos',
  emergencyRooms: 'Consultorios de urgencias',
  ambulances: 'Ambulancias',
  burnBeds: 'Camas de quemados',
};
const GROUP: [Reception, string][] = [
  ['AD', 'Atención definitiva documentada'],
  ['C', 'Condicionada'],
  ['ER', 'Estabiliza y remite'],
  ['NH', 'No habilitado (servicio no documentado)'],
  ['SI', 'Sin información suficiente'],
];
const STATUS: Record<string, string> = {
  confirmada: 'Relación confirmada',
  'confirmada-servicios': 'Confirmada para servicios específicos',
  'no-vigente': 'Relación no vigente',
  inexistente: 'Explícitamente inexistente',
  insuficiente: 'Información insuficiente',
};
const TABS = ['General', 'Servicios', 'EPS', 'Capacidad', 'Fuentes'] as const;
type Tab = (typeof TABS)[number];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, ...kids: (Node | string | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== undefined && k !== false) e.append(k);
  return e;
}
const mark = (kind: 'doc' | 'sim' | 'unk') => h('span', 'mark ' + kind, kind === 'doc' ? '●' : kind === 'sim' ? '◌' : '?');
const row = (kind: 'doc' | 'sim' | 'unk', label: string, value: string | Node) => h('div', 'fact', mark(kind), h('span', 'fl', label), h('span', 'fv', value));
const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;
const occColor = (r: number) => (r < 0.7 ? '#2e7d4f' : r < 0.9 ? '#a66a12' : '#b23b2a');

export interface SitePanelOptions {
  root: HTMLElement;
  /** unidades simuladas de la sede (vacío si no se simula) */
  units: (id: SiteId) => SiteUnit[];
  /** punto del paciente seleccionado en el mapa (metros), si hay */
  patient: () => { x: number; y: number } | undefined;
  traffic: Traffic;
  onEnter: (j: number) => void;
  onClose: () => void;
}

export function mountSitePanel(o: SitePanelOptions): { show: (id: SiteId) => void; refresh: () => void; current: () => SiteId | undefined } {
  let id: SiteId | undefined;
  let tab: Tab = 'General';
  const body = h('div', 'tab-body');

  function general(s: (typeof SITES)[number]): Node[] {
    const out: Node[] = [];
    out.push(row('doc', 'Tipo', `${s.ownership === 'publica' ? 'Pública' : 'Privada'} · ${s.role}`));
    out.push(row('doc', 'Dirección', s.address));
    out.push(row('doc', 'Urgencias', s.emergency ? 'Habilitadas' : 'No recibe urgencias (ambulatoria)'));
    out.push(row('doc', 'Especialidades principales', s.services.slice(0, 5).join(', ') || '—'));
    const units = o.units(s.id);
    if (units.length)
      out.push(
        h(
          'div',
          'occ',
          h('small', '', 'Ocupación simulada (no es la disponibilidad real)'),
          ...units.map((u) => {
            const r = u.occupied / Math.max(1, u.beds);
            const bar = h('span', 'bar');
            const fill = h('span', 'fill');
            fill.style.width = `${Math.round(Math.min(1, r) * 100)}%`;
            fill.style.background = occColor(r);
            bar.append(fill);
            return h('div', 'unit', mark('sim'), h('span', 'fl', u.label), bar, h('span', 'fv', `${u.occupied}/${u.beds}`));
          }),
        ),
      );
    else if (s.id !== rutas.origin) out.push(row('unk', 'Ocupación', s.emergency ? 'No se simula: sin camas documentadas' : 'No se simula'));
    const p = o.patient();
    const sp = sitePoints()[s.id];
    if (p && sp) {
      const from = nearestRoad(p.x, p.y);
      const r = from && routesFrom(from, { s: sp }, o.traffic).s;
      out.push(row('sim', 'Desde el paciente', r ? `${km(r.meters)} · ${fmtMin(r.minutes)} en ambulancia (estimado)` : 'Sin ruta vial'));
    }
    const ro = s.id !== rutas.origin && sp ? routesFromSite(rutas.origin, o.traffic)[s.id] : null;
    if (ro) out.push(row('sim', 'Desde el hospital de origen', `${km(ro.meters)} · ${fmtMin(ro.minutes)} (estimado)`));
    const enter = units.find((u) => u.general);
    if (enter) out.push(h('button', 'primary enter', 'Entrar a la clínica'));
    return out;
  }

  function services(s: (typeof SITES)[number]): Node[] {
    const conditions = Object.keys(RECEPTION_MATRIX) as ConditionId[];
    return [
      h('h4', '', 'Servicios habilitados'),
      h('ul', 'plain', ...s.services.map((x) => h('li', '', mark('doc'), ' ' + x))),
      h('h4', '', 'Qué atiende según el informe hospitalario'),
      ...GROUP.flatMap(([level, label]) => {
        const list = conditions.filter((c) => reception(c, s.id).level === level).map((c) => CONDITION_LABEL[c]);
        return list.length ? [h('p', 'grp', h('b', '', label + ': '), list.join(', ') + '.')] : [];
      }),
    ];
  }

  function eps(s: (typeof SITES)[number]): Node[] {
    return [
      h('p', 'fine', 'La relación con una EPS no condiciona la atención inicial de urgencias (Ley 100/1993 art. 168; Ley 1751/2015 art. 14). La falta de información no significa que no haya convenio.'),
      ...REAL_EPS.map((e) => {
        const r = relationOf(e.id, s.id);
        if (!r) return h('div', 'eps', mark('unk'), h('b', '', e.name), h('small', '', STATUS.insuficiente));
        const link = h('a', '', 'fuente');
        link.href = r.source;
        link.target = '_blank';
        link.rel = 'noopener';
        return h('div', 'eps', mark('doc'), h('b', '', e.name), h('small', '', `${STATUS[r.status]} · ${r.validity}${r.service ? ' · ' + r.service : ''}`), r.note ? h('small', 'note', r.note) : '', h('small', '', link));
      }),
    ];
  }

  function capacity(s: (typeof SITES)[number]): Node[] {
    const facts = (Object.keys(CAPACITY_LABEL) as (keyof Capacity)[]).filter((k) => s.capacity[k]);
    return [
      h('h4', '', 'Capacidad documentada'),
      ...(facts.length
        ? facts.map((k) => {
            const f = s.capacity[k]!;
            return row('doc', CAPACITY_LABEL[k], `${f.value}${f.note ? ` (${f.note})` : ''} · ${f.source === 'reps' ? 'REPS' : SOURCES[f.source].title}`);
          })
        : [row('unk', 'Capacidad', 'Ninguna cifra en las fuentes revisadas')]),
      h('h4', '', 'Camas simuladas'),
      ...(o.units(s.id).length
        ? o.units(s.id).map((u) => row('sim', u.label, `${u.occupied} de ${u.beds} ocupadas · demanda propia supuesta (90 % de carga)`))
        : [row('unk', 'Simulación', 'Esta sede no entra a la simulación')]),
    ];
  }

  function sources(s: (typeof SITES)[number]): Node[] {
    const geo = (rutas.sites as Record<string, { method: string; verify: boolean; note: string; lat: number; lon: number }>)[s.id];
    return [
      h('div', 'legend', mark('doc'), ' documentado  ', mark('sim'), ' simulado  ', mark('unk'), ' desconocido'),
      h('h4', '', 'Ubicación'),
      h('p', '', geo ? `${geo.verify ? 'Aproximada (verificar)' : 'Verificada'} · ${geo.lat}, ${geo.lon}. ${geo.note}.` : 'No se pudo ubicar; no aparece en el mapa.'),
      ...(s.repsCode ? [h('p', '', `Código REPS: ${s.repsCode}`)] : []),
      ...(s.notes.length ? [h('h4', '', 'Notas y discrepancias'), h('ul', 'plain', ...s.notes.map((n) => h('li', '', n)))] : []),
      h('h4', '', 'Fuentes'),
      h(
        'ul',
        'plain',
        ...s.sources.map((k) => {
          const url = SOURCES[k].url;
          if (!url) return h('li', '', `${SOURCES[k].title} (${SOURCES[k].date})`);
          const a = h('a', '', SOURCES[k].title);
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener';
          return h('li', '', a, ` (${SOURCES[k].date})`);
        }),
      ),
    ];
  }

  function render(): void {
    if (!id) return;
    const s = SITES.find((x) => x.id === id)!;
    const close = h('button', 'x', '✕');
    close.setAttribute('aria-label', 'Cerrar');
    close.onclick = () => {
      id = undefined;
      o.onClose();
    };
    const tabs = h('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    for (const t of TABS) {
      const b = h('button', '', t);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t === tab));
      b.onclick = () => {
        tab = t;
        render();
      };
      tabs.append(b);
    }
    body.replaceChildren(...(tab === 'General' ? general(s) : tab === 'Servicios' ? services(s) : tab === 'EPS' ? eps(s) : tab === 'Capacidad' ? capacity(s) : sources(s)));
    const enter = body.querySelector<HTMLButtonElement>('button.enter');
    if (enter) enter.onclick = () => o.onEnter(o.units(s.id).find((u) => u.general)!.j);
    o.root.replaceChildren(h('div', 'side-head', h('h3', '', s.name), close), h('p', 'status ' + (s.emergency ? 'on' : 'off'), s.emergency ? '● Urgencias habilitadas' : '○ Sin urgencias'), tabs, body);
  }

  return {
    show: (next) => {
      if (next !== id) tab = 'General';
      id = next;
      render();
    },
    // la ocupación cambia con el motor; solo la pestaña General y Capacidad la muestran
    refresh: () => {
      if (id && (tab === 'General' || tab === 'Capacidad')) render();
    },
    current: () => id,
  };
}
