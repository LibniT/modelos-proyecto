import { welchMovingAverage, warmupIndex } from '../src/validation/welch';
import { periodSeries } from '../src/batch/welch';
import { EmergencyDepartment } from '../src/model/ed';
import { validationParams } from '../src/model/params';

describe('Método de Welch (T15)', () => {
  it('media móvil: ventana recortada al inicio y completa después', () => {
    // i=1: y1 · i=2: (y1..y3)/3 · i≥3: ventana de 5
    expect(welchMovingAverage([1, 2, 3, 4, 5, 6, 7], 2)).toEqual([1, 2, 3, 4, 5]);
    expect(welchMovingAverage([1, 9, 1, 9, 1, 9], 1)).toEqual([1, 11 / 3, 19 / 3, 11 / 3, 19 / 3]); // m − w = 5 valores
  });

  it('calentamiento: primer índice desde el cual la curva no sale de la banda', () => {
    expect(warmupIndex([0, 5, 10, 10.2, 9.9, 10, 10.1, 10])).toEqual({ index: 2, level: expect.closeTo(10, 1) });
    // Una salida tardía de la banda mueve el índice después de ella.
    expect(warmupIndex([10, 10, 10, 13, 10, 10, 10, 10]).index).toBe(4);
  });

  it('las series por periodo dan el mismo promedio temporal que una sola medición', () => {
    // Periodos de igual largo: el promedio de los L horarios es el L de todo el horizonte.
    const s = periodSeries(validationParams(), 9, 24, 60, ['L']);
    const ed = new EmergencyDepartment(validationParams(), { seed: 9 });
    ed.step(24 * 60);
    expect(s['L'].reduce((a, b) => a + b, 0) / 24).toBeCloseTo(ed.metrics()['L'], 9);
  });
});
