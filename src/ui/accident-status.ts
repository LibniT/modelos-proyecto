import { recoveryTime } from '../batch/recovery';
import type { LiveDriver } from '../render/drivers';

const duration = (minutes: number) => {
  const whole = Math.round(minutes);
  return Math.floor(whole / 60) + ' h ' + String(whole % 60).padStart(2, '0') + ' min';
};

/** El gemelo y la regla de recuperación son los mismos del experimento T17. */
export function mountAccidentStatus(root: HTMLElement, clock: (t: number) => string) {
  root.hidden = true;
  root.innerHTML =
    '<strong>Accidente masivo</strong><dl class="acc-facts"></dl><small>Se compara con el mismo hospital y la misma semilla sin accidente. La recuperación exige que los promedios de 30 min queden a ±10 %.</small>';
  const fields = ['Hora', 'Heridos', 'Tiempo transcurrido', 'Diferencia media', 'Recuperación'].map((name) => {
    const cell = document.createElement('div'),
      label = document.createElement('dt'),
      value = document.createElement('dd');
    label.textContent = name;
    cell.append(label, value);
    root.querySelector('dl')!.append(cell);
    return value;
  });
  let current: LiveDriver['accident'],
    nextCheck = 0,
    recovered: number | undefined;
  return (driver: LiveDriver | undefined) => {
    const acc = driver?.accident;
    root.hidden = !acc;
    if (!driver || !acc || !driver.nLive || !driver.nTwin) return;
    if (acc !== current) {
      current = acc;
      nextCheck = acc.t0 + 30;
      recovered = undefined;
    }
    const time = driver.ed.now;
    if (recovered === undefined && time >= nextCheck) {
      recovered = recoveryTime(driver.nLive, driver.nTwin, acc.t0, time, undefined, nextCheck);
      nextCheck = acc.t0 + 30 + Math.floor(time - acc.t0 - 30) + 1;
    }
    const window = Math.min(30, time - acc.t0);
    const difference = window > 0 ? driver.nLive.avg(time - window, time) - driver.nTwin.avg(time - window, time) : NaN;
    fields[0].textContent = clock(acc.t0);
    fields[1].textContent = String(acc.n);
    fields[2].textContent = duration(time - acc.t0);
    fields[3].textContent = Number.isFinite(difference)
      ? (difference >= 0 ? '+' : '') + difference.toFixed(1) + ' pacientes · ' + (window < 30 ? 'desde el accidente' : 'últimos 30 min')
      : 'Sin datos';
    fields[4].textContent = recovered === undefined ? 'En curso' : 'Recuperado en ' + duration(recovered);
  };
}
