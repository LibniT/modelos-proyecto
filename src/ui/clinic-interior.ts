import type { ClinicView } from '../render/map/city';
import type { ClinicScene } from '../render/clinic-scene';
import type { SitePlan } from '../render/companions/plans';

/**
 * T24 — Controles del interior isométrico de una clínica (la planta se dibuja en `ClinicScene`).
 * Cuenta ocupadas / disponibles / total con el snapshot del motor; las alas acercan la cámara.
 */
export class ClinicInterior {
  index?: number;
  private last = '';
  private title: HTMLElement;
  private count: HTMLElement;
  private wings: HTMLElement;
  private receipt: HTMLElement;
  constructor(
    private host: HTMLElement,
    back: () => void,
    public scene?: ClinicScene,
    private plan?: (j: number) => SitePlan | undefined,
  ) {
    host.innerHTML = `<div class="ward-head"><div><small>Interior de la clínica</small><h3></h3></div><button type="button" class="ward-back">Volver al mapa</button></div>
      <p class="ward-count" role="status"></p>
      <p class="ward-legend"><span class="lg-occ">Ocupada</span><span class="lg-res">Reservada · traslado en camino</span><span class="lg-free">Disponible</span><span class="lg-ref">Remitido desde urgencias (con nombre)</span><span class="lg-map">Paciente del mapa (con nombre)</span></p>
      <p class="ward-hint">Haz clic en una cama para ver quién la ocupa.</p>
      <div class="ward-wings" role="group" aria-label="Alas de la clínica"></div>
      <p class="ward-receipt"></p>`;
    this.title = host.querySelector('h3')!;
    this.count = host.querySelector('.ward-count')!;
    this.wings = host.querySelector('.ward-wings')!;
    this.receipt = host.querySelector('.ward-receipt')!;
    host.querySelector<HTMLButtonElement>('.ward-back')!.onclick = back;
  }
  open(j: number) {
    this.index = j;
    this.last = '';
    this.host.hidden = false;
    this.scene?.enter(j);
    const plan = this.plan?.(j);
    const total = plan?.beds.length ?? 0;
    let first = 1;
    const buttons = (plan?.wings ?? []).map((w, k) => {
      const n = plan!.beds.filter((b) => b.wing === k).length;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${w.name} · camas ${first}–${first + n - 1} (${n} de ${total})`;
      first += n;
      b.onclick = () => this.scene?.focusWing(k);
      return b;
    });
    const all = Object.assign(document.createElement('button'), { type: 'button', textContent: `Toda la sede · ${total} camas` });
    all.onclick = () => this.scene?.fit();
    this.wings.replaceChildren(...(buttons.length > 1 ? [all, ...buttons] : []));
  }
  /** Sale del interior; por defecto vuelve al mapa de la ciudad. */
  close(to: 'city' | 'hospital' = 'city') {
    if (this.index === undefined) return;
    this.host.hidden = true;
    this.index = undefined;
    this.scene?.leave(to);
  }
  update(clinics: ClinicView[], mock: boolean, received?: string, reserved = 0) {
    if (this.index === undefined) return;
    const c = clinics[this.index];
    const key = [c.name, c.occupied, c.beds, received, mock, reserved].join('|');
    if (key === this.last) return;
    this.last = key;
    this.title.textContent = c.name;
    const free = c.beds - c.occupied;
    const drawn = this.plan?.(this.index)?.beds.length ?? c.beds;
    this.count.textContent =
      `${mock ? 'Registro inicial' : 'Ocupación actual'} · ${c.occupied} ${c.occupied === 1 ? 'ocupada' : 'ocupadas'} · ${free} ${free === 1 ? 'disponible' : 'disponibles'} · ${c.beds} en total` +
      (drawn < c.beds
        ? ` · Planta representativa (no es la arquitectura real): ${drawn} camas dibujadas, cada una ≈ ${(c.beds / drawn).toFixed(1).replace('.', ',')} camas`
        : '');
    this.receipt.textContent =
      received ??
      (reserved
        ? `${reserved} ${reserved === 1 ? 'cama reservada' : 'camas reservadas'} para traslados en camino (ya cuentan como ocupadas).`
        : 'Las plazas incluyen la demanda propia y las reservas de remisión. El motor no asigna habitación a cada paciente.');
  }
}
