/**
 * T25 · F2 — Cartografía y rutas de la red de Valledupar a partir de OpenStreetMap (ODbL).
 *
 *   npm run red-vial
 *
 * 1. Lee las calles y sedes de salud de OSM (una consulta Overpass; queda en `tools/.cache/`, fuera de Git).
 * 2. Ubica cada sede: objeto OSM con su nombre, o la nomenclatura de su dirección ("Calle 14 #17-47") sobre las
 *    calles OSM. El error del método por dirección se mide en las sedes que tienen ambos.
 * 3. Calcula la ruta vial más corta (Dijkstra, respeta sentidos únicos) desde el hospital de origen a cada sede.
 * 4. Escribe `src/model/valledupar/rutas.json` (sedes + rutas, lo usa el motor) y
 *    `src/model/valledupar/calles.json` (calles simplificadas, solo para el mapa). Coordenadas en metros.
 *
 * Sin internet en tiempo de ejecución: la aplicación solo lee esos dos JSON.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MinHeap } from '../src/engine/heap';
import { SITES, type SiteId } from '../src/model/valledupar/sites';
import { LAT0, LON0, proj, unproj, type P } from '../src/model/valledupar/proj';

const BBOX = '10.41,-73.31,10.52,-73.19';
const BASE = `(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|service)$"](${BBOX});nwr["amenity"~"^(hospital|clinic)$"](${BBOX});nwr["healthcare"~"^(hospital|clinic)$"](${BBOX}););out body geom;`;
/** Dos consultas: calles + sedes etiquetadas como salud, y sedes que en OSM solo son edificios con nombre. */
const QUERIES = {
  'tools/.cache/osm-valledupar.json': `[out:json][timeout:120];${BASE}`,
  // F6: agua, ríos y zonas verdes para la vista «Mapa».
  'tools/.cache/osm-entorno.json': `[out:json][timeout:90][bbox:${BBOX}];(way["natural"~"^(water|wood|scrub|grassland)$"];way["waterway"~"^(river|riverbank|stream|canal)$"];way["leisure"~"^(park|garden|recreation_ground)$"];way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green|reservoir)$"];);out geom;`,
  'tools/.cache/osm-nombres.json': `[out:json][timeout:90][bbox:${BBOX}];(nwr["name"~"Cardiovascular|OHI|Humana|Isabel|Bol[ií]var|Erasmo|Fractura|Lucas|SOHEC|Oncolog|Mental|Cl[ií]nica|CL[IÍ]NICA|Instituto"]["highway"!~"."];);out tags center;`,
};
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/** SUPUESTO de simulación: velocidad media urbana de la ambulancia. */
export const AMBULANCE_KMH = 30;
/** Origen de las remisiones: "Hospital de origen (simulado)" ubicado en el HRPL. */
const ORIGIN: SiteId = 'hrpl';

/** Sedes con objeto OSM propio (nombre verificado a mano contra el informe). */
const OSM_MATCH: Partial<Record<SiteId, string>> = {
  'alta-complejidad': 'way/1317791406',
  hrpl: 'node/6456494546',
  'clinica-cesar': 'way/687405295',
  'clinica-valledupar': 'way/687405515',
  'simon-bolivar': 'way/1317710511',
};

interface El {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

async function load(): Promise<{ base: string; elements: El[] }> {
  const all: El[] = [];
  let base = '';
  for (const [file, query] of Object.entries(QUERIES)) {
    if (!existsSync(file)) {
      mkdirSync('tools/.cache', { recursive: true });
      for (const url of MIRRORS) {
        const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'SimUrgencias-academico/0.1' } });
        const text = await r.text();
        if (text.includes('"elements"')) {
          writeFileSync(file, text);
          break;
        }
        console.warn(`${url}: sin respuesta útil (${r.status})`);
      }
      if (!existsSync(file)) throw new Error(`Overpass no respondió; reintenta más tarde (${file})`);
    }
    const d = JSON.parse(readFileSync(file, 'utf8'));
    base ||= d.osm3s.timestamp_osm_base;
    all.push(...d.elements);
  }
  return { base, elements: all };
}

// ---------- proyección local (equirrectangular, error < 0,1 % en 10 km) ----------
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Douglas–Peucker. */
function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const L = dist(a, b) || 1;
  let worst = 0,
    k = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
    if (d > worst) [worst, k] = [d, i];
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, k + 1), tol).slice(0, -1), ...simplify(pts.slice(k), tol)];
}
/** puntos intermedios cada `step` m (para hallar cruces entre vértices lejanos) */
function densify(pts: P[], step: number): P[] {
  const out: P[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const n = Math.max(1, Math.ceil(dist(pts[i], pts[i + 1]) / step));
    for (let k = 0; k < n; k++) out.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / n, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / n]);
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}
/** Douglas–Peucker para un anillo cerrado (primer punto = último): se parte en el vértice más lejano del inicio. */
function simplifyRing(pts: P[], tol: number): P[] {
  let k = 0;
  pts.forEach((p, i) => dist(p, pts[0]) > dist(pts[k], pts[0]) && (k = i));
  return [...simplify(pts.slice(0, k + 1), tol).slice(0, -1), ...simplify(pts.slice(k), tol)];
}
const flat = (pts: P[]) => pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);

// ---------- geocodificación por nomenclatura colombiana ----------
const CROSS: Record<string, string[]> = {
  Calle: ['Carrera', 'Transversal'],
  Diagonal: ['Carrera', 'Transversal'],
  Carrera: ['Calle', 'Diagonal'],
  Transversal: ['Calle', 'Diagonal'],
};

function geocoder(ways: El[]) {
  const byName = new Map<string, P[]>();
  for (const w of ways) {
    const n = w.tags?.name;
    if (!n || !w.geometry) continue;
    const list = byName.get(n) ?? [];
    list.push(...densify(w.geometry.map((g) => proj(g.lat, g.lon)), 8));
    byName.set(n, list);
  }
  /** cruce de dos calles con nombre: par de puntos más cercano (≤ 12 m, con puntos cada 8 m) */
  const corner = (a: string, b: string): P | null => {
    const A = byName.get(a),
      B = byName.get(b);
    if (!A || !B) return null;
    let best = Infinity,
      at: P | null = null;
    for (const p of A)
      for (const q of B) {
        const d = dist(p, q);
        if (d < best) [best, at] = [d, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]];
      }
    return best <= 12 ? at : null;
  };
  /** "Calle 14 #17-47": sobre la Calle 14, a 47 m del cruce con la Carrera 17, hacia la Carrera 18. */
  return (address: string): { p: P; detail: string } | null => {
    const m = /^(Calle|Carrera|Diagonal|Transversal)\s+(\w+)\s*#\s*(\d+)([A-Z]?)-(\d+)/.exec(address);
    if (!m) return null;
    const [, kind, num, crossNum, crossLetter, meters] = m;
    const street = `${kind} ${num}`;
    // Cruce exacto; si OSM no lo tiene, la calle sin letra o una vecina (error ≤ 1 cuadra, se marca para verificar).
    const tries = [`${crossNum}${crossLetter}`, ...(crossLetter ? [crossNum] : []), String(Number(crossNum) + 1), String(Number(crossNum) - 1)];
    for (const [i, cn] of tries.entries())
    for (const ck of CROSS[kind]) {
      const c1 = corner(street, `${ck} ${cn}`);
      if (!c1) continue;
      if (i > 0) return { p: c1, detail: `cruce ${street} × ${ck} ${cn} (OSM no tiene el cruce con ${ck} ${crossNum}${crossLetter}; error ≤ 1 cuadra)` };
      const c2 = corner(street, `${ck} ${Number(crossNum) + 1}`);
      if (!c2) return { p: c1, detail: `cruce ${street} × ${ck} ${crossNum}${crossLetter} (sin cruce siguiente; error ≤ 1 cuadra)` };
      const t = Math.min(1, Number(meters) / Math.max(dist(c1, c2), 1));
      return { p: [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t], detail: `${street}, ${meters} m desde ${ck} ${crossNum}${crossLetter}` };
    }
    return null;
  };
}

const center = (e: El): P => {
  if (e.lat !== undefined) return proj(e.lat, e.lon!);
  if (e.center) return proj(e.center.lat, e.center.lon);
  const b = e.bounds!;
  return proj((b.minlat + b.maxlat) / 2, (b.minlon + b.maxlon) / 2);
};

// ---------- grafo vial y Dijkstra ----------
function graph(ways: El[]) {
  const pos = new Map<number, P>();
  const adj = new Map<number, { to: number; w: number }[]>();
  const add = (a: number, b: number, w: number) => {
    const l = adj.get(a) ?? [];
    l.push({ to: b, w });
    adj.set(a, l);
  };
  for (const w of ways) {
    const ns = w.nodes!,
      gs = w.geometry!;
    const ow = w.tags!.oneway;
    const fwdOnly = ow === 'yes' || ow === 'true' || ow === '1' || w.tags!.junction === 'roundabout';
    const backOnly = ow === '-1';
    ns.forEach((n, i) => pos.set(n, proj(gs[i].lat, gs[i].lon)));
    for (let i = 0; i + 1 < ns.length; i++) {
      const d = dist(pos.get(ns[i])!, pos.get(ns[i + 1])!);
      if (!backOnly) add(ns[i], ns[i + 1], d);
      if (!fwdOnly) add(ns[i + 1], ns[i], d);
    }
  }
  const dijkstra = (src: number) => {
    const D = new Map<number, number>([[src, 0]]);
    const prev = new Map<number, number>();
    const h = new MinHeap<[number, number]>((a, b) => a[0] < b[0]);
    h.push([0, src]);
    while (h.size) {
      const [d, u] = h.pop()!;
      if (d > D.get(u)!) continue;
      for (const { to, w } of adj.get(u) ?? []) {
        const nd = d + w;
        if (nd < (D.get(to) ?? Infinity)) {
          D.set(to, nd);
          prev.set(to, u);
          h.push([nd, to]);
        }
      }
    }
    return { D, prev };
  };
  /** nodo más cercano que tenga salida y entrada */
  const snap = (p: P): number => {
    let best = Infinity,
      id = -1;
    for (const [n, q] of pos) {
      const d = dist(p, q);
      if (d < best && adj.has(n)) [best, id] = [d, n];
    }
    return id;
  };
  return { pos, dijkstra, snap };
}

// ---------- programa ----------
const { base, elements } = await load();
const ways = elements.filter((e) => e.type === 'way' && e.tags?.highway && e.nodes && e.geometry);
const byRef = new Map(elements.map((e) => [`${e.type}/${e.id}`, e]));
const geocode = geocoder(ways);

interface SiteGeo {
  lat: number;
  lon: number;
  x: number;
  y: number;
  method: 'osm' | 'direccion';
  ref: string;
  /** distancia entre el objeto OSM y la ubicación por dirección (control del método) */
  checkM?: number;
  verify: boolean;
  note: string;
}
const sites: Record<string, SiteGeo> = {};
const checks: number[] = [];
/** sedes sin ubicación confiable: no se dibujan ni se les inventa posición */
const missing: Record<string, string> = {};
for (const s of SITES) {
  const ref = OSM_MATCH[s.id];
  const osm = ref ? byRef.get(ref) : undefined;
  const addr = geocode(s.address);
  let p: P, method: SiteGeo['method'], note: string, checkM: number | undefined, verify: boolean;
  if (osm) {
    p = center(osm);
    checkM = addr ? Math.round(dist(p, addr.p)) : undefined;
    // Si el objeto OSM y la dirección no coinciden, gana la dirección del informe y se marca para verificar.
    if (checkM !== undefined && checkM > 300) {
      p = addr!.p;
      method = 'direccion';
      verify = true;
      note = `El objeto OSM ${ref} ("${osm.tags?.name}") queda a ${checkM} m de la dirección del informe; se usa la dirección (${addr!.detail}).`;
    } else {
      method = 'osm';
      verify = false;
      note = `Objeto OSM ${ref} ("${osm.tags?.name}")`;
      if (checkM !== undefined) checks.push(checkM);
    }
  } else if (addr) {
    p = addr.p;
    method = 'direccion';
    verify = addr.detail.includes('error ≤ 1 cuadra');
    note = `Nomenclatura sobre calles OSM: ${addr.detail}`;
  } else {
    missing[s.id] = `Sin objeto OSM y sin cruce de calles OSM para «${s.address}»: ubicación por verificar`;
    console.error(`Sin ubicación: ${s.name} (${s.address})`);
    continue;
  }
  sites[s.id] = { ...unproj(p), x: Math.round(p[0]), y: Math.round(p[1]), method, ref: ref ?? s.address, ...(checkM !== undefined ? { checkM } : {}), verify, note };
}

const G = graph(ways);
const routes: Record<string, { distanceM: number; backM: number; straightM: number; minutes: number; path: number[] } | null> = {};
const from = G.snap([sites[ORIGIN].x, sites[ORIGIN].y]);
const out = G.dijkstra(from);
for (const s of SITES) {
  if (s.id === ORIGIN) continue;
  if (!sites[s.id]) {
    routes[s.id] = null; // sin ubicación no hay ruta
    continue;
  }
  const to = G.snap([sites[s.id].x, sites[s.id].y]);
  const d = out.D.get(to);
  const back = G.dijkstra(to).D.get(from);
  if (d === undefined || back === undefined) {
    routes[s.id] = null; // dato faltante: no se inventa
    continue;
  }
  const nodes: number[] = [];
  for (let n: number | undefined = to; n !== undefined; n = out.prev.get(n)) nodes.unshift(n);
  routes[s.id] = {
    distanceM: Math.round(d),
    backM: Math.round(back),
    straightM: Math.round(dist([sites[ORIGIN].x, sites[ORIGIN].y], [sites[s.id].x, sites[s.id].y])),
    minutes: +((d / 1000 / AMBULANCE_KMH) * 60).toFixed(2),
    path: flat(simplify(nodes.map((n) => G.pos.get(n)!), 2)),
  };
}

const attribution = '© colaboradores de OpenStreetMap (ODbL 1.0)';
const meta = { generated: new Date().toISOString().slice(0, 10), osmBase: base, attribution, projection: { lat0: LAT0, lon0: LON0, units: 'm', y: 'norte' } };
mkdirSync('src/model/valledupar', { recursive: true });
writeFileSync(
  'src/model/valledupar/rutas.json',
  JSON.stringify({ ...meta, origin: ORIGIN, ambulanceKmh: AMBULANCE_KMH, assumption: `Tiempo base = distancia vial / ${AMBULANCE_KMH} km/h (supuesto). Ruta más corta por distancia respetando sentidos únicos de OSM.`, sites, missing, routes }, null, 1),
);
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const roads = ways
  .filter((w) => w.tags!.highway !== 'service')
  .map((w) => ({ major: MAJOR.has(w.tags!.highway) ? 1 : 0, p: flat(simplify(w.geometry!.map((g) => proj(g.lat, g.lon)), 3)) }));
// Entorno (F6): polígonos cerrados de agua y zonas verdes; ríos como líneas (se dibujan anchos).
const closed = (w: El) => w.geometry!.length > 3 && w.nodes![0] === w.nodes!.at(-1);
const area = (pred: (t: Record<string, string>) => boolean) =>
  elements.filter((e) => e.type === 'way' && e.geometry && !e.tags?.highway && closed(e) && pred(e.tags ?? {})).map((w) => flat(simplifyRing(w.geometry!.map((g) => proj(g.lat, g.lon)), 4)));
const water = area((t) => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir');
const green = area((t) => ['wood', 'scrub', 'grassland'].includes(t.natural) || ['park', 'garden', 'recreation_ground'].includes(t.leisure) || ['grass', 'forest', 'meadow', 'recreation_ground', 'village_green'].includes(t.landuse));
const rivers = elements
  .filter((e) => e.type === 'way' && e.geometry && ['river', 'stream', 'canal'].includes(e.tags?.waterway ?? ''))
  .map((w) => ({ big: w.tags!.waterway === 'river' ? 1 : 0, p: flat(simplify(w.geometry!.map((g) => proj(g.lat, g.lon)), 4)) }));
// Nombres de las vías principales: uno por nombre, a mitad del tramo más largo, girado como la vía.
const longest = new Map<string, P[]>();
const len = (q: P[]) => q.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0);
for (const w of ways) {
  const name = w.tags!.name;
  if (!name || !MAJOR.has(w.tags!.highway)) continue;
  const q = w.geometry!.map((g) => proj(g.lat, g.lon));
  if (len(q) > len(longest.get(name) ?? [])) longest.set(name, q);
}
const labels = [...longest]
  .filter(([, q]) => len(q) > 400)
  .map(([name, q]) => {
    let d = len(q) / 2,
      i = 0;
    for (; i < q.length - 2; i++) {
      const s = Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]);
      if (d <= s) break;
      d -= s;
    }
    const [a, b] = [q[i], q[i + 1]];
    const s = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let deg = (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI; // pantalla: y hacia abajo
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
    return { name, x: Math.round(a[0] + ((b[0] - a[0]) * d) / s), y: Math.round(a[1] + ((b[1] - a[1]) * d) / s), deg: Math.round(deg) };
  });
writeFileSync('src/model/valledupar/calles.json', JSON.stringify({ ...meta, roads, water, green, rivers, labels }));
console.log(`Entorno: ${water.length} polígonos de agua, ${green.length} zonas verdes, ${rivers.length} ríos y arroyos, ${labels.length} nombres de vías.`);

console.log(`OSM base ${base}: ${ways.length} vías, ${roads.length} dibujadas.`);
for (const [id, g] of Object.entries(sites)) console.log(`${g.verify ? '⚠' : '✓'} ${id.padEnd(20)} ${g.method.padEnd(9)} ${g.lat}, ${g.lon}  ${g.checkM !== undefined ? `control ${g.checkM} m` : ''}`);
console.log(`Control del método por dirección (sedes con objeto OSM): ${checks.map((c) => c + ' m').join(', ')}`);
for (const [id, r] of Object.entries(routes)) console.log(`${id.padEnd(20)} ${r ? `${(r.distanceM / 1000).toFixed(2)} km vial · ${(r.straightM / 1000).toFixed(2)} km recta · ${r.minutes} min · regreso ${(r.backM / 1000).toFixed(2)} km` : 'SIN RUTA'}`);
