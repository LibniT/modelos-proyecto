/**
 * T25 — Mapa real de Valledupar (sin Phaser, se prueba en Node). Las coordenadas vienen de OpenStreetMap ya
 * proyectadas a metros (`npm run red-vial`); aquí solo se voltea el eje norte para la pantalla (y hacia abajo).
 */
import calles from '../../model/valledupar/calles.json';
import rutas from '../../model/valledupar/rutas.json';
import { SITES, type SiteId } from '../../model/valledupar/sites';
import satelite from '../../model/valledupar/satelite.json';
import { LAT0, proj, tileBounds, tileOf, unproj } from '../../model/valledupar/proj';
import type { Vec } from '../layout';

export const OSM_ATTRIBUTION = calles.attribution;
export const SATELLITE_ATTRIBUTION = satelite.attribution;

/**
 * Satélite de alta resolución EN LÍNEA (Esri World Imagery, ~0,5 m). Solo se pide si hay conexión; sin ella queda
 * Sentinel-2 local. No se guarda en el repositorio: los términos de Esri no permiten el uso sin conexión.
 */
export const HIRES_ATTRIBUTION = 'Esri, Maxar, Earthstar Geographics y la comunidad de usuarios GIS (en línea)';
const HIRES_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

export interface HiresTile {
  key: string;
  url: string;
  z: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Teselas en línea que cubren la vista (en metros de pantalla, y hacia abajo = sur) con un píxel de tesela por
 * píxel de pantalla aproximadamente. `zoom` es el de la cámara (píxeles de pantalla por metro).
 */
export function hiresTiles(view: { x: number; y: number; width: number; height: number }, zoom: number): HiresTile[] {
  const z = Math.max(12, Math.min(19, Math.ceil(Math.log2(156543.03 * Math.cos((LAT0 * Math.PI) / 180) * zoom))));
  const nw = unproj([view.x, -view.y]),
    se = unproj([view.x + view.width, -(view.y + view.height)]);
  const a = tileOf(z, nw.lat, nw.lon),
    b = tileOf(z, se.lat, se.lon);
  const out: HiresTile[] = [];
  for (let x = a.x; x <= b.x; x++)
    for (let y = a.y; y <= b.y; y++) {
      const t = tileBounds(z, x, y);
      const [x0, n] = proj(t.north, t.west),
        [x1, s] = proj(t.south, t.east);
      out.push({ key: `esri-${z}-${x}-${y}`, url: `${HIRES_URL}/${z}/${y}/${x}`, z, x0, y0: -n, x1, y1: -s });
    }
  return out;
}

/** Vistas del mapa real: calles con ríos, parques y nombres; imagen satelital; o solo calles. */
export type MapStyle = 'mapa' | 'satelite' | 'simple';

/** Nombres cortos para las placas del mapa (el nombre completo va en la ficha). */
export const SHORT: Record<SiteId, string> = {
  'alta-complejidad': 'Alta Complejidad',
  hrpl: 'Hospital de origen (simulado)',
  icvc: 'Inst. Cardiovascular',
  ohi: 'OHI',
  'ohi-santa-isabel': 'Santa Isabel – OHI',
  'simon-bolivar': 'Simón Bolívar',
  'clinica-cesar': 'Clínica del Cesar',
  'clinica-valledupar': 'Clínica Valledupar',
  erasmo: 'Clínica Erasmo',
  fracturas: 'Clínica de Fracturas',
  'san-lucas': 'San Lucas',
  sohec: 'SOHEC',
};

/**
 * Desplazamiento de cada placa respecto de su marcador, en píxeles de pantalla. Las sedes del centro están a
 * 100–300 m unas de otras y sus placas se taparían.
 * shortcut: tabla fija para estas 12 sedes; si se agregan sedes, cambiar a una disposición automática.
 */
const LABEL: Partial<Record<SiteId, Vec>> = {
  hrpl: { x: 0, y: 34 },
  'alta-complejidad': { x: -175, y: -10 },
  icvc: { x: 40, y: -122 },
  ohi: { x: -165, y: 62 },
  'clinica-cesar': { x: 175, y: -60 },
  'clinica-valledupar': { x: 165, y: 30 },
  sohec: { x: 20, y: -175 },
  'san-lucas': { x: 150, y: -120 },
  'ohi-santa-isabel': { x: 140, y: 60 },
  'simon-bolivar': { x: 0, y: 34 },
  erasmo: { x: -60, y: -48 },
  fracturas: { x: -150, y: 70 },
};

export interface GeoSite {
  id: SiteId;
  name: string;
  short: string;
  at: Vec;
  /** índice de la clínica simulada; ausente si la sede no entra a la simulación */
  clinic?: number;
  origin: boolean;
  /** por qué no se simula (sin capacidad documentada, no recibe urgencias) */
  note?: string;
  /** ubicación aproximada (cruce vecino): verificar */
  verify: boolean;
  label: Vec;
}

export interface GeoMap {
  roads: { major: boolean; p: Vec[] }[];
  sites: GeoSite[];
  /** ruta de ida a cada clínica simulada, en el orden de `params.clinics` */
  routes: Vec[][];
  missing: string[];
  water: Vec[][];
  green: Vec[][];
  rivers: { big: boolean; p: Vec[] }[];
  labels: { name: string; at: Vec; deg: number }[];
  /** teselas satelitales (en public/), con su rectángulo en metros de pantalla */
  tiles: { key: string; url: string; x0: number; y0: number; x1: number; y1: number }[];
}

const pts = (flat: number[]): Vec[] => {
  const out: Vec[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: -flat[i + 1] });
  return out;
};

/** `simulated`: sede de cada clínica simulada (params.network.sites). */
export function geoMap(simulated: SiteId[]): GeoMap {
  const located = rutas.sites as Record<string, { x: number; y: number; verify: boolean }>;
  const routes = rutas.routes as Record<string, { path: number[] } | null>;
  const sites: GeoSite[] = [];
  for (const s of SITES) {
    const g = located[s.id];
    if (!g) continue;
    const clinic = simulated.indexOf(s.id);
    const origin = s.id === rutas.origin;
    sites.push({
      id: s.id,
      name: s.name,
      short: SHORT[s.id],
      at: { x: g.x, y: -g.y },
      ...(clinic >= 0 ? { clinic } : {}),
      origin,
      ...(clinic < 0 && !origin ? { note: s.emergency ? (s.capacity.adultBeds ? 'no simulada' : 'capacidad no documentada') : 'no recibe urgencias' } : {}),
      verify: g.verify,
      label: LABEL[s.id] ?? { x: 0, y: 34 },
    });
  }
  return {
    roads: calles.roads.map((r) => ({ major: r.major === 1, p: pts(r.p) })),
    sites,
    routes: simulated.map((id) => pts(routes[id]?.path ?? [])),
    missing: Object.keys(rutas.missing).map((id) => SITES.find((s) => s.id === id)?.name ?? id),
    water: calles.water.map(pts),
    green: calles.green.map(pts),
    rivers: calles.rivers.map((r) => ({ big: r.big === 1, p: pts(r.p) })),
    labels: calles.labels.map((l) => ({ name: l.name, at: { x: l.x, y: -l.y }, deg: l.deg })),
    tiles: satelite.tiles.map(({ x, y }) => {
      const b = tileBounds(satelite.z, x, y);
      const [x0, n] = proj(b.north, b.west),
        [x1, s] = proj(b.south, b.east);
      const name = `${satelite.z}_${x}_${y}`;
      return { key: 'sat-' + name, url: `satelite/${name}.jpg`, x0, y0: -n, x1, y1: -s };
    }),
  };
}
