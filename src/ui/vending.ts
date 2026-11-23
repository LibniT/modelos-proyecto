/**
 * T24 — Panel de una máquina de la cafetería. Compra simulada y gratuita para «Mi acompañante»
 * (no es el paciente: no entra al motor clínico). Teclado físico o en pantalla; Escape cierra y el foco vuelve.
 */
import { MACHINE_NAME, PRODUCTS, normalizeCode, type Order, type Social } from '../render/companions/social';
import type { MachineKind, Site } from '../render/companions/plans';

export interface VendingOptions {
  social: () => Social;
  siteName: (site: Site) => string;
  paused: () => boolean;
  /** aviso breve fuera del panel (al cerrar, al entregar) */
  notify: (msg: string) => void;
}

const label = (o: Order) => `${o.product.name} · ${o.product.code}`;

/** Estado de un pedido en palabras para el público. */
export function orderText(social: Social, o: Order, paused: boolean): string {
  const me = social.mine;
  let s: string;
  switch (o.state) {
    case 'en camino':
      s = `${label(o)} · En camino a la máquina`;
      break;
    case 'en fila': {
      const k = me ? social.placeInLine(me) : -1;
      s = `${label(o)} · En fila${k > 0 ? ` (${k} ${k === 1 ? 'persona' : 'personas'} antes)` : ''}`;
      break;
    }
    case 'despachando':
      s = `${label(o)} · La máquina está despachando`;
      break;
    case 'entregado':
      return `Mi acompañante recibió ${label(o)}`;
    case 'cancelado':
      return `Solicitud cancelada: ${label(o)}`;
  }
  return s + (paused ? ' · simulación en pausa' : '');
}

export class VendingPanel {
  site?: Site;
  kind?: MachineKind;
  private opener?: HTMLElement | null;
  private input!: HTMLInputElement;
  private msg!: HTMLElement;
  private ok!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;
  private boughtHere = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly o: VendingOptions,
  ) {
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-labelledby', 'vend-title');
    // En todo el documento: el foco puede haber quedado fuera del panel (p. ej. en un botón que se deshabilitó).
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  /** ¿Alguien está escribiendo un código? (la demo automática lo respeta) */
  get typing(): boolean {
    return this.isOpen && this.input.value.trim() !== '';
  }

  open(site: Site, kind: MachineKind, opener: HTMLElement | null = document.activeElement as HTMLElement | null): void {
    if (!this.isOpen) this.opener = opener;
    this.site = site;
    this.kind = kind;
    this.boughtHere = false;
    const other: MachineKind = kind === 'refrescos' ? 'papas' : 'refrescos';
    const products = PRODUCTS[kind];
    this.host.className = 'vend vend-' + kind;
    this.host.innerHTML = `
      <header><div><small></small><h3 id="vend-title"></h3></div><button type="button" class="vend-close">Cerrar</button></header>
      <ul class="vend-products" aria-label="Productos y códigos"></ul>
      <div class="vend-pad">
        <label for="vend-code">Escribe el código del producto</label>
        <input id="vend-code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="p. ej. ${products[2].code}">
        <div class="vend-keys" role="group" aria-label="Teclado en pantalla"></div>
        <button type="button" class="vend-ok">Confirmar código</button>
        <p class="vend-msg" role="status" aria-live="polite"></p>
        <div class="vend-more"><button type="button" class="vend-cancel" hidden>Cancelar solicitud</button><button type="button" class="vend-other"></button></div>
        <p class="vend-note">Compra simulada y gratuita · existencias ilimitadas · la recibe Mi acompañante</p>
      </div>`;
    const $ = <T extends HTMLElement>(sel: string) => this.host.querySelector(sel) as T;
    $('small').textContent = 'Cafetería · ' + this.o.siteName(site);
    $('h3').textContent = MACHINE_NAME[kind];
    $<HTMLUListElement>('.vend-products').replaceChildren(
      ...products.map((p) => {
        const li = document.createElement('li');
        const sw = document.createElement('i');
        sw.style.background = p.color;
        li.append(sw, Object.assign(document.createElement('b'), { textContent: p.code }), Object.assign(document.createElement('span'), { textContent: p.name }));
        return li;
      }),
    );
    this.input = $('input');
    this.msg = $('.vend-msg');
    this.ok = $('.vend-ok');
    this.cancelBtn = $('.vend-cancel');
    const keys = $('.vend-keys');
    for (const k of ['A', 'B', '1', '2', '3', 'Borrar', 'Limpiar']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = k;
      if (k.length > 1) b.className = 'wide';
      b.onclick = () => {
        this.input.value = k === 'Borrar' ? this.input.value.slice(0, -1) : k === 'Limpiar' ? '' : normalizeCode(this.input.value) + k;
        this.input.focus();
      };
      keys.append(b);
    }
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirm();
      }
    });
    this.ok.onclick = () => this.confirm();
    $<HTMLButtonElement>('.vend-close').onclick = () => this.close();
    this.cancelBtn.onclick = () => {
      const s = this.o.social();
      const o = s.myOrder;
      if (s.cancel() && o) this.o.notify(`Solicitud cancelada: ${label(o)}. No se entregó nada.`);
      this.update();
    };
    const otherBtn = $<HTMLButtonElement>('.vend-other');
    otherBtn.textContent = 'Ir a la ' + MACHINE_NAME[other].toLowerCase();
    otherBtn.onclick = () => this.open(site, other);
    this.host.hidden = false;
    this.say('');
    this.update();
    this.input.focus();
  }

  private say(text: string): void {
    this.msg.textContent = text;
    this.msg.dataset.kind = '';
  }

  private confirm(): void {
    if (this.site === undefined || !this.kind) return;
    const s = this.o.social();
    const r = s.request(this.site, this.kind, this.input.value);
    if (!r.ok) {
      this.msg.textContent = r.reason;
      this.msg.dataset.kind = 'error';
      return;
    }
    this.boughtHere = true;
    this.input.value = '';
    this.input.focus(); // «Confirmar código» queda deshabilitado mientras dura la solicitud
    this.update();
  }

  /** Cierra la vista (no cancela la solicitud) y devuelve el foco a quien abrió el panel. */
  close(): void {
    if (!this.isOpen) return;
    const s = this.o.social();
    this.host.hidden = true;
    const o = s.myOrder;
    if (s.orderActive && o) this.o.notify(`Cerraste la máquina. La solicitud de ${label(o)} sigue en curso (${o.state}).`);
    else if (!this.boughtHere) this.o.notify('Cerraste la máquina sin comprar.');
    const back = this.opener;
    this.opener = undefined;
    if (back && back.isConnected && !back.closest('[hidden]')) back.focus();
  }

  /** Relee el pedido de Mi acompañante (5 veces por segundo desde main). */
  update(): void {
    if (!this.isOpen) return;
    const s = this.o.social();
    const o = s.myOrder;
    const active = s.orderActive;
    this.ok.disabled = active;
    this.cancelBtn.hidden = !(active && o && (o.state === 'en camino' || o.state === 'en fila'));
    if (this.msg.dataset.kind === 'error' && !active) return; // deja leer el error hasta el próximo intento
    if (!o) return this.say('Elige un producto y escribe su código.');
    const where = active && (o.site !== this.site || o.machine !== this.kind) ? `En ${this.o.siteName(o.site)}, ${MACHINE_NAME[o.machine].toLowerCase()}: ` : '';
    const text = where + orderText(s, o, this.o.paused());
    if (this.msg.textContent !== text) this.say(active && where ? text + '. Espera la entrega o cancela para pedir aquí.' : text);
  }
}
