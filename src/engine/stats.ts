/** Promedio temporal de una variable de estado (p. ej., longitud de cola, servidores ocupados). */
export class TimeAverage {
  private area = 0;
  private lastT: number;
  private start: number;
  max: number;

  constructor(
    t0: number,
    public value = 0,
  ) {
    this.lastT = t0;
    this.start = t0;
    this.max = value;
  }

  set(t: number, v: number): void {
    this.area += this.value * (t - this.lastT);
    this.lastT = t;
    this.value = v;
    if (v > this.max) this.max = v;
  }

  add(t: number, dv: number): void {
    this.set(t, this.value + dv);
  }

  /** Reinicia la acumulación (fin del calentamiento) sin cambiar el valor actual. */
  reset(t: number): void {
    this.area = 0;
    this.lastT = t;
    this.start = t;
    this.max = this.value;
  }

  mean(t: number): number {
    const span = t - this.start;
    if (span <= 0) return this.value;
    return (this.area + this.value * (t - this.lastT)) / span;
  }
}

/** Acumulador por observación (media y varianza con Welford). */
export class Tally {
  n = 0;
  private m = 0;
  private s = 0;
  sum = 0;
  max = -Infinity;

  add(x: number): void {
    this.n++;
    this.sum += x;
    const d = x - this.m;
    this.m += d / this.n;
    this.s += d * (x - this.m);
    if (x > this.max) this.max = x;
  }

  get mean(): number {
    return this.n > 0 ? this.m : NaN;
  }

  get variance(): number {
    return this.n > 1 ? this.s / (this.n - 1) : NaN;
  }

  reset(): void {
    this.n = 0;
    this.m = 0;
    this.s = 0;
    this.sum = 0;
    this.max = -Infinity;
  }
}
