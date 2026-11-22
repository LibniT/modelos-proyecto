import type { ClinicView } from '../render/map/city';

/** Plano agregado: cada símbolo representa una plaza, sin asignar identidades a las camas. */
export class ClinicInterior {
  index?: number;
  private last = '';
  private title: HTMLElement;
  private count: HTMLElement;
  private ward: HTMLElement;
  private receipt: HTMLElement;
  constructor(
    private host: HTMLElement,
    back: () => void,
  ) {
    host.innerHTML = `<div class="ward-head"><div><small>Hospitalización</small><h3></h3></div><button type="button">Volver al mapa</button></div><p class="ward-count"></p><div class="ward-beds" aria-hidden="true"></div><p class="ward-receipt"></p>`;
    this.title = host.querySelector('h3')!;
    this.count = host.querySelector('.ward-count')!;
    this.ward = host.querySelector('.ward-beds')!;
    this.receipt = host.querySelector('.ward-receipt')!;
    host.querySelector('button')!.onclick = back;
  }
  open(j: number) {
    this.index = j;
    this.last = '';
    this.host.hidden = false;
  }
  close() {
    this.host.hidden = true;
    this.index = undefined;
  }
  update(clinics: ClinicView[], mock: boolean, received?: string) {
    if (this.index === undefined) return;
    const c = clinics[this.index];
    const key = [c.name, c.occupied, c.beds, received, mock].join('|');
    if (key === this.last) return;
    this.last = key;
    this.title.textContent = c.name;
    const free = c.beds - c.occupied;
    this.count.textContent = `${mock ? 'Registro inicial' : 'Ocupación actual'} · ${c.occupied} ${c.occupied === 1 ? 'ocupada' : 'ocupadas'} · ${free} ${free === 1 ? 'disponible' : 'disponibles'} · ${c.beds} en total`;
    this.ward.replaceChildren(
      ...Array.from({ length: c.beds }, (_, i) => {
        const bed = document.createElement('span');
        bed.className = i < c.occupied ? 'bed occupied' : 'bed';
        return bed;
      }),
    );
    this.receipt.textContent = received ?? 'Las plazas incluyen reservas de remisión y demanda propia de la clínica.';
  }
}
