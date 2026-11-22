/**
 * T17 — Tiempo de recuperación tras un accidente masivo (SPEC §2.6, F2).
 *
 * La SPEC lo define como el tiempo "hasta que N(t) vuelve a ±10 % del nivel previo". Con llegadas NHPP
 * el nivel cambia con la hora del día, así que el "nivel previo" correcto es el CONTRAFACTUAL: el mismo
 * hospital con la misma semilla y sin el accidente (números aleatorios comunes). Se comparan promedios
 * temporales exactos de N en ventanas de `smooth` minutos para que el ruido de una corrida no decida.
 */
import type { EmergencyDepartment } from '../model/ed';

/** Trayectoria escalonada exacta de N(t) (pacientes en el sistema). */
export class NPath {
  readonly t: number[] = [];
  readonly n: number[] = [];
  constructor(t0: number, n0: number) {
    this.t.push(t0);
    this.n.push(n0);
  }
  push(t: number, n: number): void {
    this.t.push(t);
    this.n.push(n);
  }
  get last(): number {
    return this.n[this.n.length - 1];
  }
  /** Índice del último tramo que empieza en o antes de t (búsqueda binaria). */
  private index(t: number): number {
    let lo = 0, hi = this.t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /** Valor en el instante t (continuo por la derecha). */
  at(t: number): number {
    return this.n[this.index(t)];
  }
  /** Puntos (x en horas) de la trayectoria en [a, b] para graficar: un escalón en el instante de cada llegada o salida. */
  points(a: number, b: number): { x: number; y: number }[] {
    let i = this.index(a);
    const out = [{ x: Math.max(a, this.t[0]) / 60, y: this.n[i] }];
    for (i++; i < this.t.length && this.t[i] <= b; i++) out.push({ x: this.t[i] / 60, y: this.n[i] });
    out.push({ x: b / 60, y: this.at(b) });
    return out;
  }
  /** Promedio temporal exacto de N en [a, b]. */
  avg(a: number, b: number): number {
    let area = 0;
    for (let i = this.index(a); i < this.t.length && this.t[i] < b; i++) {
      const lo = Math.max(a, this.t[i]);
      const hi = Math.min(b, i + 1 < this.t.length ? this.t[i + 1] : Infinity);
      if (hi > lo) area += this.n[i] * (hi - lo);
    }
    return area / (b - a);
  }
}

/** Registra N(t) del motor desde ahora (ARRIVAL suma, DEPARTURE resta). */
export function trackN(ed: EmergencyDepartment): NPath {
  const path = new NPath(ed.now, ed.snapshot().patients.length);
  ed.onEvent((e) => {
    if (e.type === 'ARRIVAL') path.push(e.t, path.last + 1);
    else if (e.type === 'DEPARTURE') path.push(e.t, path.last - 1);
  });
  return path;
}

export interface RecoveryOptions {
  /** ventana del promedio temporal (min) */
  smooth: number;
  /** banda relativa */
  tol: number;
  /** paso de evaluación (min) */
  step: number;
}
export const RECOVERY: RecoveryOptions = { smooth: 30, tol: 0.1, step: 1 };

/**
 * Minutos desde el accidente (t0) hasta el primer instante t ≥ t0 + smooth en que el promedio de N en
 * [t − smooth, t] con accidente queda a ±tol del mismo promedio sin accidente. `undefined` si aún no ocurre antes de tEnd.
 */
export function recoveryTime(acc: NPath, base: NPath, t0: number, tEnd: number, o: RecoveryOptions = RECOVERY, from = t0 + o.smooth): number | undefined {
  // `from` permite continuar una búsqueda ya hecha hasta cierto instante (uso en vivo).
  for (let t = Math.max(from, t0 + o.smooth); t <= tEnd; t += o.step) {
    const a = acc.avg(t - o.smooth, t);
    const b = base.avg(t - o.smooth, t);
    if (Math.abs(a - b) <= o.tol * b) return t - t0;
  }
  return undefined;
}
