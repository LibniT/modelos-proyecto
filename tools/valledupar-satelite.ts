/**
 * T25 · F6 — Imagen satelital de Valledupar para la vista «Satélite» del mapa, sin internet en ejecución.
 *
 *   npm run satelite
 *
 * Fuente: Sentinel-2 cloudless 2023 de EOX (https://s2maps.eu), licencia CC BY-NC-SA 4.0 (uso no comercial
 * con atribución; este proyecto es académico). Resolución nativa 10 m: se usa el nivel 14 (~9,4 m por píxel),
 * unas 40 teselas. Las imágenes de Google y de Esri no se usan: sus términos no permiten guardarlas sin conexión.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tileOf } from '../src/model/valledupar/proj';

const Z = 14;
const LAYER = 's2cloudless-2023_3857';
const [S, W, N, E] = [10.41, -73.31, 10.52, -73.19]; // mismo recuadro que las calles
const a = tileOf(Z, N, W),
  b = tileOf(Z, S, E);
mkdirSync('public/satelite', { recursive: true });
const tiles: { x: number; y: number }[] = [];
for (let x = a.x; x <= b.x; x++)
  for (let y = a.y; y <= b.y; y++) {
    const file = `public/satelite/${Z}_${x}_${y}.jpg`;
    if (!existsSync(file)) {
      const r = await fetch(`https://tiles.maps.eox.at/wmts/1.0.0/${LAYER}/default/g/${Z}/${y}/${x}.jpg`, { headers: { 'User-Agent': 'SimUrgencias-academico/0.1' } });
      if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error(`Tesela ${x},${y}: ${r.status}`);
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    tiles.push({ x, y });
  }
writeFileSync(
  'src/model/valledupar/satelite.json',
  JSON.stringify({
    z: Z,
    layer: LAYER,
    generated: new Date().toISOString().slice(0, 10),
    attribution: 'Sentinel-2 cloudless 2023 by EOX IT Services GmbH (https://s2maps.eu), contiene datos modificados de Copernicus Sentinel 2023 · CC BY-NC-SA 4.0',
    tiles,
  }),
);
console.log(`${tiles.length} teselas (x ${a.x}–${b.x}, y ${a.y}–${b.y}) en public/satelite/`);
