/**
 * Método gráfico de Welch para elegir el periodo de calentamiento (Law & Kelton, §9.5.1).
 */

/**
 * Media móvil de Welch con ventana w sobre la serie promedio entre réplicas Ȳ_1..Ȳ_m:
 *   Ȳ_i(w) = (1/(2w+1)) Σ_{s=−w..w} Ȳ_{i+s}          si i = w+1, …, m−w
 *   Ȳ_i(w) = (1/(2i−1)) Σ_{s=−(i−1)..i−1} Ȳ_{i+s}    si i = 1, …, w
 * (índices desde 1 en la fórmula; el arreglo devuelto tiene m − w valores).
 */
export function welchMovingAverage(y: number[], w: number): number[] {
  const m = y.length;
  const out: number[] = [];
  for (let i = 1; i <= m - w; i++) {
    const h = i <= w ? i - 1 : w;
    let s = 0;
    for (let k = i - h; k <= i + h; k++) s += y[k - 1];
    out.push(s / (2 * h + 1));
  }
  return out;
}

/**
 * Criterio reproducible para leer la gráfica: primer índice (desde 0) a partir del cual la media móvil
 * queda SIEMPRE dentro de ±tol (relativo) del nivel estable, estimado como la media de la segunda mitad.
 */
export function warmupIndex(smoothed: number[], tol = 0.05): { index: number; level: number } {
  const half = smoothed.slice(Math.floor(smoothed.length / 2));
  const level = half.reduce((a, b) => a + b, 0) / half.length;
  let index = smoothed.length;
  for (let i = smoothed.length - 1; i >= 0 && Math.abs(smoothed[i] - level) <= tol * Math.abs(level); i--) index = i;
  return { index, level };
}
