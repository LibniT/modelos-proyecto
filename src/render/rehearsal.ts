import type { PatientInfo } from '../engine/events';
import { EmergencyDepartment } from '../model/ed';
import { realisticParams } from '../model/params';
import { trackN } from '../batch/recovery';
import { LiveDriver, type Driver } from './drivers';

export type Visitor = Omit<PatientInfo, 'id' | 'isVisitor'>;

/** Un solo reloj para las escenas. La sesión que no se está mostrando queda intacta. */
export class SessionDriver implements Driver {
  constructor(public current: Driver) {}
  get pb() {
    return this.current.pb;
  }
  get speed() {
    return this.current.speed;
  }
  set speed(value: number) {
    this.current.speed = value;
  }
  get paused() {
    return this.current.paused;
  }
  set paused(value: boolean) {
    this.current.paused = value;
  }
  tick(seconds: number): void {
    this.current.tick(seconds);
  }
}

/** Prepara la consulta del visitante con las APIs públicas. El motor reserva la cama y solicita el vehículo. */
export function rehearse(visitor: Visitor, destination: number) {
  const params = realisticParams();
  const clinic = params.clinics[destination];
  if (!clinic) throw new Error('Selecciona una clínica disponible.');
  params.eps.find((eps) => eps.id === visitor.eps)!.network = [clinic.id];
  params.outcomes = { alta: 0, observacion: 0, hospitalizacion: 0, remision: 1 };
  params.service.doctor = { kind: 'const', value: 2 };
  params.service.doctorByLevel = undefined;
  params.abandonment.enabled = false;
  const ed = new EmergencyDepartment(params, { seed: 2026, recordEvents: true });
  const driver = new LiveDriver(ed);
  driver.nLive = trackN(ed);
  driver.injectVisitor(visitor);
  let patientId: string | undefined;
  let ready = false;
  ed.onEvent((e) => {
    if (e.type === 'ARRIVAL' && (e.data?.info as PatientInfo)?.isVisitor) {
      patientId = e.patientId;
      // El ensayo sigue un solo caso. La demanda propia de cada clínica sigue activa.
      ed.setArrivalRate(0);
    }
    if (patientId && e.patientId === patientId && e.type === 'SERVICE_START' && e.data?.station === 'doctor') ready = true;
  });
  driver.speed = 60;
  for (let i = 0; i < 1440 && !ready; i++) driver.tick(0.25);
  if (!ready || !patientId) throw new Error('No se pudo preparar la consulta del visitante.');
  return { driver, patientId, destination };
}
