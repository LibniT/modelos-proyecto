import { doctorExperiment } from '../src/batch/experiment';
import { realisticParams } from '../src/model/params';

describe('Experimento de médicos con números aleatorios comunes (T14)', () => {
  const keys = ['doctor.Wq.L2', 'triageII.compliance', 'share.L2'];
  const rows = doctorExperiment({ base: realisticParams(), doctors: [4, 6], reference: 6, n: 8, seedBase: 2000, measure: 2 * 1440, keys });

  it('la referencia tiene diferencia pareada exactamente 0', () => {
    expect(rows[1].diff['doctor.Wq.L2'].mean).toBe(0);
    expect(rows[1].diff['doctor.Wq.L2'].half).toBe(0);
  });

  it('CRN: la mezcla de triage es idéntica entre escenarios (mismo flujo de llegadas)', () => {
    expect(rows[0].diff['share.L2'].mean).toBe(0);
    expect(rows[0].diff['share.L2'].sd).toBe(0);
  });

  it('CRN reduce la varianza de la diferencia del cumplimiento', () => {
    expect(rows[0].varRatio['triageII.compliance']).toBeLessThan(0.5);
  });

  it('menos médicos → más espera del Triage II', () => {
    expect(rows[0].diff['doctor.Wq.L2'].lo).toBeGreaterThan(0);
  });
});
