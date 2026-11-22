/**
 * T09 — Personajes pixel art dibujados por código (24 × 32 px). Sin DOM ni Phaser:
 * `characterPixels` devuelve una matriz de colores; `paint` la pinta en cualquier canvas 2D.
 * Vistas: 'SE' (de frente, mirando abajo-derecha) y 'NE' (de espaldas, arriba-derecha);
 * SW y NW son sus reflejos horizontales (SPEC §6.2).
 */
import type { AppearanceSpec, PatientInfo } from '../../engine/events';

export const W = 24;
export const H = 32;
export type View = 'SE' | 'NE';
export type Pose = 'idle' | 'walk' | 'sit';
export type Pixels = (string | null)[][];

export const SKIN = ['#f3d2b3', '#e0ac69', '#c68642', '#8d5524', '#5a3825'];
export const HAIR_COLORS = ['#1f1a17', '#4a2c1a', '#8b5a2b', '#d9b26f', '#b03a2e', '#c9c9c9'];
export const CLOTH = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#ec4899', '#0891b2', '#f8fafc', '#374151', '#a16207'];
export const HAIR_STYLES = ['corto', 'largo', 'rizado', 'rapado', 'moño'];
export const TOP_STYLES = ['manga corta', 'manga larga', 'sin mangas'];
const SHOES = '#1f2937';
const OUTLINE = '#111827';
const EYE = '#111827';

/** Hash FNV-1a (determinista; el proyecto prohíbe Math.random). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Apariencia de un paciente generado por el motor (sin vestidor): sale de un catálogo acotado
 * de 64 combinaciones para no crear texturas sin límite en una corrida larga.
 */
export function appearanceFor(id: string, ageRange: PatientInfo['ageRange']): AppearanceSpec {
  const h = hash(id) % 64;
  const pick = (n: number, salt: number) => hash(`${h}:${salt}`) % n;
  return {
    skin: pick(SKIN.length, 1),
    hairStyle: pick(HAIR_STYLES.length, 2),
    hairColor: ageRange === '65+' ? HAIR_COLORS[5] : HAIR_COLORS[pick(5, 3)],
    topStyle: pick(TOP_STYLES.length, 4),
    topColor: CLOTH[pick(CLOTH.length, 5)],
    bottomColor: CLOTH[[0, 8, 9, 6][pick(4, 6)]],
    accessory: (['cap', 'glasses', 'mask', undefined, undefined, undefined] as const)[pick(6, 7)],
  };
}

/** Personal (recursos): aspecto fijo por puesto. */
export const STAFF: Record<'doctor' | 'triage' | 'admission', AppearanceSpec> = {
  doctor: { skin: 1, hairStyle: 0, hairColor: HAIR_COLORS[0], topStyle: 1, topColor: '#ffffff', bottomColor: '#1e3a8a' },
  triage: { skin: 2, hairStyle: 4, hairColor: HAIR_COLORS[1], topStyle: 0, topColor: '#0d9488', bottomColor: '#0d9488' },
  admission: { skin: 0, hairStyle: 1, hairColor: HAIR_COLORS[3], topStyle: 1, topColor: '#f59e0b', bottomColor: '#374151' },
};

/** Luces y sombras derivadas de los colores del vestidor. */
function tone(color: string, amount: number): string {
  const rgb = parseInt(color.slice(1), 16);
  return (
    '#' +
    [16, 8, 0]
      .map((shift) => {
        const c = (rgb >> shift) & 255;
        return Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

export function characterPixels(a: AppearanceSpec, view: View, pose: Pose, frame = 0): Pixels {
  const g: Pixels = Array.from({ length: H }, () => Array<string | null>(W).fill(null));
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < H && i >= 0 && i < W) g[j][i] = c;
  };
  const skin = SKIN[a.skin] ?? SKIN[0];
  const shadow = tone(a.topColor, -0.26),
    light = tone(a.topColor, 0.22);
  const skinShade = tone(skin, -0.19),
    denim = tone(a.bottomColor, -0.26);
  const back = view === 'NE';
  const sit = pose === 'sit';
  const dy = sit ? 4 : 0; // sentado: el cuerpo baja
  // Ciclo de 4 cuadros al caminar: 0 y 2 neutros, 1 y 3 con las piernas abiertas hacia lados opuestos.
  const step = pose === 'walk' ? [0, 1, 0, -1][frame % 4] : 0;

  // Piernas y zapatos
  if (sit) {
    rect(9, 26, 9, 3, a.bottomColor); // muslos hacia adelante
    rect(15, 29, 3, 2, a.bottomColor);
    rect(15, 30, 5, 1, SHOES);
    rect(10, 29, 3, 2, denim);
    rect(10, 30, 4, 1, SHOES);
  } else {
    const lx = 9 - step,
      rx = 13 + step;
    rect(lx, 22, 3, 7 - Math.max(0, step), a.bottomColor);
    rect(rx, 22, 3, 7 - Math.max(0, -step), a.bottomColor);
    rect(lx, 22, 2, 7 - Math.max(0, step), denim);
    rect(lx, 29 - Math.max(0, step), 4, 2, SHOES);
    rect(rx, 29 - Math.max(0, -step), 5, 2, SHOES);
    rect(rx + 2, 29 - Math.max(0, -step), 2, 1, '#56616b');
  }

  // Torso y brazos
  rect(9, 13 + dy, 7, 1, light);
  rect(8, 14 + dy, 10, 3, a.topColor);
  rect(9, 17 + dy, 8, 5, a.topColor);
  rect(8, 14 + dy, 2, 7, shadow);
  rect(9, 21 + dy, 8, 1, shadow);
  rect(11, 13 + dy, 4, 1, light);
  rect(14, 14 + dy, 2, 1, light);
  if (!back && a.topStyle === 1) {
    rect(14, 15 + dy, 1, 6, light);
    rect(15, 17 + dy, 2, 1, shadow);
  }
  const sleeve = (x: number, y: number) => {
    if (a.topStyle === 1) rect(x, y, 2, 7, a.topColor);
    else if (a.topStyle === 0) {
      rect(x, y, 2, 3, a.topColor);
      rect(x, y + 3, 2, 4, skin);
    } else rect(x, y, 2, 7, skin);
    rect(x, y + 7, 2, 2, skinShade);
    rect(x + 1, y + 7, 2, 1, skin); // pulgar
  };
  sleeve(7 - step, 14 + dy + step);
  sleeve(16 + step, 13 + dy - step);
  if (!back && a.topColor === STAFF.doctor.topColor) {
    rect(12, 14 + dy, 3, 2, '#6899a3'); // cuello de la bata y credencial
    rect(15, 17 + dy, 2, 2, '#83adbb');
    rect(9, 21 + dy, 7, 2, a.topColor);
    rect(13, 18 + dy, 1, 5, '#c9d8d4');
  }

  // Cabeza
  const hx = back ? 8 : 9;
  rect(hx + 1, 3 + dy, 6, 1, skin);
  rect(hx, 4 + dy, 8, 6, skin);
  rect(hx + 1, 10 + dy, 7, 2, skin);
  rect(11, 12 + dy, 3, 1, skin); // cuello
  rect(hx, 6 + dy, 2, 5, skinShade);
  if (!back) {
    rect(16, 9 + dy, 2, 1, skin);
    rect(14, 11 + dy, 2, 1, skinShade);
    rect(9, 9 + dy, 2, 2, skin);
    rect(12, 8 + dy, 1, 1, EYE);
    rect(15, 8 + dy, 1, 1, EYE);
  }

  // Pelo (5 estilos)
  const hc = a.hairColor;
  const top = () => rect(hx, 3 + dy, 8, 2, hc);
  switch (a.hairStyle) {
    case 0: // corto
      top();
      rect(hx, 5 + dy, back ? 8 : 2, back ? 4 : 3, hc);
      break;
    case 1: // largo
      top();
      rect(hx - 1, 5 + dy, back ? 10 : 3, back ? 9 : 9, hc);
      break;
    case 2: // rizado
      rect(hx, 1 + dy, 7, 2, hc);
      rect(hx - 1, 3 + dy, 10, 2, hc);
      rect(hx - 1, 5 + dy, back ? 10 : 2, back ? 5 : 4, hc);
      break;
    case 3: // rapado
      rect(hx, 4 + dy, 8, 1, hc);
      break;
    default: // moño
      top();
      rect(hx, 5 + dy, back ? 8 : 2, back ? 4 : 2, hc);
      rect(hx - 2, 3 + dy, 3, 3, hc);
  }

  const glint = tone(hc, 0.24);
  if (a.hairStyle === 2) {
    rect(hx - 2, 3 + dy, 2, 2, hc);
    rect(hx + 6, 1 + dy, 2, 2, glint);
    rect(hx + 2, 2 + dy, 2, 1, glint);
  } else if (a.hairStyle !== 3) {
    rect(hx + 1, 3 + dy, 4, 1, glint);
    if (a.hairStyle === 1) rect(hx - 1, 6 + dy, 1, 5, glint);
    if (back) rect(hx + 1, 6 + dy, 5, 2, hc);
  }

  // Accesorios (de frente; la gorra también de espaldas)
  if (a.accessory === 'cap') {
    rect(hx - 1, 2 + dy, 10, 3, '#dc2626');
    rect(hx + 1, 2 + dy, 5, 1, '#f17f65');
    if (!back) rect(hx + 6, 4 + dy, 4, 1, '#dc2626');
  } else if (!back && a.accessory === 'glasses') {
    rect(11, 8 + dy, 3, 1, '#0f172a');
    rect(14, 8 + dy, 3, 1, '#0f172a');
    rect(12, 8 + dy, 1, 1, '#93c5fd');
    rect(15, 8 + dy, 1, 1, '#93c5fd');
  } else if (!back && a.accessory === 'mask') {
    rect(11, 9 + dy, 6, 3, '#bfdbfe');
  }

  // Contorno de 1 px para que se lea sobre cualquier piso.
  const out: Pixels = g.map((r) => [...r]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (
        !g[y][x] &&
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([u, v]) => g[y + v]?.[x + u])
      )
        out[y][x] = OUTLINE;
  return out;
}

/** Pinta la matriz en un canvas 2D (en (0,0), 1 px por celda). */
export function paint(
  ctx: { fillStyle: string | CanvasGradient | CanvasPattern; fillRect(x: number, y: number, w: number, h: number): void },
  px: Pixels,
): void {
  px.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
}
