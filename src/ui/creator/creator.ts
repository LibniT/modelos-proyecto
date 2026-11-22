/**
 * T10 — Creador de paciente (SPEC E1–E2, F4: ventana modal). El paciente creado REEMPLAZA a la siguiente
 * llegada Poisson (`ed.injectVisitor`), así el proceso de llegadas sigue siendo Poisson. Desactivado en validación.
 */
import type { AppearanceSpec, PatientInfo } from '../../engine/events';
import type { EmergencyDepartment } from '../../model/ed';
import { CLOTH, HAIR_COLORS, HAIR_STYLES, SKIN, TOP_STYLES, W, H, characterPixels, paint } from '../../render/characters/pixels';
import { LEVEL_NAME, SYMPTOMS } from './symptoms';

const AGES: PatientInfo['ageRange'][] = ['0-17', '18-39', '40-64', '65+'];
const ACCESSORIES: [AppearanceSpec['accessory'], string][] = [
  [undefined, 'Ninguno'],
  ['cap', 'Gorra'],
  ['glasses', 'Gafas'],
  ['mask', 'Tapabocas'],
];

const swatches = (name: string, colors: string[], label: string) =>
  `<div class="cr-sw" role="radiogroup" aria-label="${label}">${colors
    .map((c, i) => `<label><input type="radio" name="${name}" value="${i}" ${i === 0 ? 'checked' : ''} aria-label="${label} ${i + 1}"><span style="background:${c}"></span></label>`)
    .join('')}</div>`;

/** `getEd` devuelve el motor activo (cambia al cambiar de modo). `onSent` avisa a la página. */
export function mountCreator(openButton: HTMLButtonElement, getEd: () => EmergencyDepartment, onSent: (msg: string) => void): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'cr';
  dlg.innerHTML = `
<style>
  dialog.cr { background: #16202b; color: #e6edf3; border: 1px solid #334155; border-radius: 10px; padding: 16px; max-width: 640px; width: calc(100% - 32px); }
  dialog.cr::backdrop { background: rgba(0, 0, 0, .55); }
  .cr h2 { margin: 0 0 10px; font-size: 18px; }
  .cr form { display: grid; grid-template-columns: 1fr 150px; gap: 12px; }
  .cr .fields { display: grid; gap: 8px; font-size: 13px; }
  .cr .fields > label { display: grid; gap: 3px; }
  .cr input[type=text], .cr select { padding: 5px; background: #0f1720; color: inherit; border: 1px solid #334155; border-radius: 4px; }
  .cr-sw { display: flex; gap: 4px; flex-wrap: wrap; }
  .cr-sw input { position: absolute; opacity: 0; }
  .cr-sw span { display: block; width: 20px; height: 20px; border-radius: 4px; border: 2px solid #334155; cursor: pointer; }
  .cr-sw input:checked + span { border-color: #facc15; }
  .cr-sw input:focus-visible + span { outline: 2px solid #60a5fa; }
  .cr .prev { text-align: center; }
  .cr canvas { image-rendering: pixelated; width: ${W * 3}px; height: ${H * 3}px; background: #e5e7eb; border-radius: 6px; }
  .cr .lvl { font-weight: bold; }
  .cr .note { font-size: 11px; opacity: .7; grid-column: 1 / -1; margin: 0; }
  .cr .act { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; }
  .cr .err { color: #fca5a5; grid-column: 1 / -1; margin: 0; }
  @media (max-width: 560px) { .cr form { grid-template-columns: 1fr; } }
</style>
<h2>Crea tu paciente</h2>
<form method="dialog">
  <div class="fields">
    <label>Nombre <input type="text" name="name" maxlength="30" required autocomplete="off"></label>
    <label>Edad <select name="age">${AGES.map((a) => `<option value="${a}" ${a === '18-39' ? 'selected' : ''}>${a} años</option>`).join('')}</select></label>
    <label>EPS <select name="eps"></select></label>
    <label>Síntoma <select name="symptom">${SYMPTOMS.map((s, i) => `<option value="${i}">${s.text}</option>`).join('')}</select></label>
    <div>Nivel de triage que le corresponde: <span class="lvl" id="cr-lvl"></span></div>
    <div>Tono de piel ${swatches('skin', SKIN, 'Tono de piel')}</div>
    <label>Peinado <select name="hairStyle">${HAIR_STYLES.map((h, i) => `<option value="${i}">${h}</option>`).join('')}</select></label>
    <div>Color de pelo ${swatches('hairColor', HAIR_COLORS, 'Color de pelo')}</div>
    <label>Camisa <select name="topStyle">${TOP_STYLES.map((t, i) => `<option value="${i}">${t}</option>`).join('')}</select></label>
    <div>Color de camisa ${swatches('topColor', CLOTH, 'Color de camisa')}</div>
    <div>Color de pantalón ${swatches('bottomColor', CLOTH, 'Color de pantalón')}</div>
    <label>Accesorio <select name="accessory">${ACCESSORIES.map(([, n], i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
  </div>
  <div class="prev" aria-label="Vista previa del personaje">
    <canvas id="cr-front" width="${W}" height="${H}"></canvas>
    <canvas id="cr-back" width="${W}" height="${H}"></canvas>
  </div>
  <p class="note">Los síntomas son ejemplos para la simulación, ordenados según los niveles de la Resolución 5596 de 2015; en la vida real el triage lo hace un profesional. Tu paciente reemplaza la próxima llegada al hospital, así que el modelo de llegadas no cambia.</p>
  <p class="err" id="cr-err" hidden></p>
  <div class="act"><button type="button" id="cr-cancel" style="background:#334155">Cancelar</button><button type="submit" value="send">Enviar al hospital</button></div>
</form>`;
  document.body.appendChild(dlg);

  const form = dlg.querySelector('form')!;
  const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | RadioNodeList).value;
  const appearance = (): AppearanceSpec => ({
    skin: Number(val('skin')),
    hairStyle: Number(val('hairStyle')),
    hairColor: HAIR_COLORS[Number(val('hairColor'))],
    topStyle: Number(val('topStyle')),
    topColor: CLOTH[Number(val('topColor'))],
    bottomColor: CLOTH[Number(val('bottomColor'))],
    accessory: ACCESSORIES[Number(val('accessory'))][0],
  });
  const draw = () => {
    const a = appearance();
    for (const [id, view] of [['cr-front', 'SE'], ['cr-back', 'NE']] as const) {
      const ctx = dlg.querySelector<HTMLCanvasElement>(`#${id}`)!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      paint(ctx, characterPixels(a, view, 'idle'));
    }
    dlg.querySelector('#cr-lvl')!.textContent = LEVEL_NAME[SYMPTOMS[Number(val('symptom'))].level];
  };
  form.addEventListener('input', draw);
  form.addEventListener('change', draw);
  // El pantalón por defecto es azul y la camisa roja, para que el primer personaje no salga de un solo color.
  (form.querySelector('input[name=topColor][value="1"]') as HTMLInputElement).checked = true;

  openButton.onclick = () => {
    const ed = getEd();
    const eps = form.elements.namedItem('eps') as HTMLSelectElement;
    eps.replaceChildren(...ed.params.eps.map((e) => new Option(e.name, e.id)));
    dlg.querySelector<HTMLElement>('#cr-err')!.hidden = true;
    draw();
    dlg.showModal();
  };
  dlg.querySelector<HTMLButtonElement>('#cr-cancel')!.onclick = () => dlg.close();

  form.onsubmit = (e) => {
    e.preventDefault();
    const name = val('name').trim();
    const err = dlg.querySelector<HTMLElement>('#cr-err')!;
    if (!name) {
      err.textContent = 'Escribe un nombre.';
      err.hidden = false;
      return;
    }
    const s = SYMPTOMS[Number(val('symptom'))];
    const ok = getEd().injectVisitor({ name, ageRange: val('age') as PatientInfo['ageRange'], eps: val('eps'), symptom: s.text, triage: s.level, appearance: appearance() });
    if (!ok) {
      err.textContent = 'En modo validación no se pueden agregar pacientes (cambiaría el proceso de llegadas). Cambia a modo realista.';
      err.hidden = false;
      return;
    }
    dlg.close();
    form.reset();
    (form.querySelector('input[name=topColor][value="1"]') as HTMLInputElement).checked = true;
    onSent(`${name} llegará al hospital con la próxima llegada (busca la flecha amarilla).`);
  };
}
