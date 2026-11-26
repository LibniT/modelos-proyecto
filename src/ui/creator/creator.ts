/**
 * T10 — Creador de paciente (SPEC E1–E2, F4: ventana modal). El paciente creado REEMPLAZA a la siguiente
 * llegada Poisson (`ed.injectVisitor`), así el proceso de llegadas sigue siendo Poisson. Desactivado en validación.
 * El sexo (T37) es de la interfaz: elige el peinado inicial y se muestra en «Mi paciente». El motor no lo usa
 * (ningún tiempo depende de él) y el contrato de eventos congelado no tiene ese campo, así que no viaja en ARRIVAL.
 */
import type { AppearanceSpec, PatientInfo } from '../../engine/events';
import type { EmergencyDepartment } from '../../model/ed';
import { CLOTH, HAIR_COLORS, HAIR_FOR, HAIR_STYLES, SKIN, TOP_FOR, TOP_STYLES, W, H, characterPixels, paint, stylesFor } from '../../render/characters/pixels';
import { LEVEL_NAME, SYMPTOMS } from './symptoms';

const AGES: PatientInfo['ageRange'][] = ['0-17', '18-39', '40-64', '65+'];
export type Sex = 'mujer' | 'hombre';
/** peinado y ropa iniciales según el sexo elegido (índices de HAIR_STYLES / TOP_STYLES); se pueden cambiar después */
const START: Record<Sex, { hair: number; top: number }> = { mujer: { hair: 1, top: 0 }, hombre: { hair: 0, top: 0 } };
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

/** `getEd` da el motor activo (cambia al cambiar de modo) o una fachada con su EPS y la inyección. `onSent` avisa a la página. */
export function mountCreator(
  openButton: HTMLButtonElement,
  getEd: () => Pick<EmergencyDepartment, 'params'> & { injectVisitor: (info: Parameters<EmergencyDepartment['injectVisitor']>[0], sex: Sex) => boolean },
  onSent: (msg: string) => void,
): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'cr';
  dlg.innerHTML = `
<style>
  dialog.cr { background: #fffdf6; color: #213f40; border: 1px solid #aec4b5; border-radius: 14px; padding: clamp(16px,2vw,28px); max-width: 690px; width: calc(100% - 24px); max-height: 92svh; overflow: auto; }
  dialog.cr::backdrop { background: rgba(24, 51, 52, .64); }
  .cr h2 { margin: 0 0 16px; font-size: 28px; }
  .cr form { display: grid; grid-template-columns: 1fr 150px; gap: 12px; }
  .cr .fields { display: grid; gap: 8px; font-size: 14px; }
  .cr .fields > label { display: grid; gap: 3px; }
  .cr input[type=text], .cr select { padding: 6px; background: #f4f6ec; color: inherit; border: 1px solid #bbcabc; border-radius: 5px; }
  .cr-sw { display: flex; gap: 4px; flex-wrap: wrap; }
  .cr-sw input { position: absolute; opacity: 0; }
  .cr-sw span { display: block; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #e1e6da; cursor: pointer; }
  .cr-sw input:checked + span { border-color: white; outline: 2px solid #245e59; }
  .cr-sw input:focus-visible + span { outline: 2px solid #60a5fa; }
  .cr .sex { display: flex; gap: 6px; border: 0; padding: 0; margin: 0; }
  .cr .sex legend { padding: 0; margin-bottom: 3px; }
  .cr .sex label { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid #bbcabc; border-radius: 99px; background: #f4f6ec; cursor: pointer; }
  .cr .sex label:has(input:checked) { background: #226d69; border-color: #226d69; color: #fff; }
  .cr .prev { text-align: center; align-self: start; background: #deeadf; border-radius: 10px; padding: 12px; }
  .cr canvas { image-rendering: pixelated; width: ${W * 3}px; height: ${H * 3}px; }
  .cr .lvl { font-weight: bold; }
  .cr .note { font-size: 11px; opacity: .7; grid-column: 1 / -1; margin: 0; }
  .cr .act { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; }
  .cr .err { color: #9d422b; grid-column: 1 / -1; margin: 0; }
  .cr [type=submit] { background: #226d69; color: white; }
  @media (max-width: 560px) { .cr form { grid-template-columns: 1fr; } }
</style>
<h2>Crea tu paciente</h2>
<form method="dialog">
  <div class="fields">
    <label>Nombre <input type="text" name="name" maxlength="30" required autocomplete="off"></label>
    <fieldset class="sex"><legend>Sexo</legend><label><input type="radio" name="sex" value="mujer" checked> Mujer</label><label><input type="radio" name="sex" value="hombre"> Hombre</label></fieldset>
    <label>Edad <select name="age">${AGES.map((a) => `<option value="${a}" ${a === '18-39' ? 'selected' : ''}>${a} años</option>`).join('')}</select></label>
    <label>EPS <select name="eps"></select></label>
    <label>Síntoma <select name="symptom">${SYMPTOMS.map((s, i) => `<option value="${i}">${s.text}</option>`).join('')}</select></label>
    <div>Nivel de triage que le corresponde: <span class="lvl" id="cr-lvl"></span></div>
    <div>Tono de piel ${swatches('skin', SKIN, 'Tono de piel')}</div>
    <label>Peinado y accesorio de cabeza <select name="hairStyle"></select></label>
    <div>Color de pelo ${swatches('hairColor', HAIR_COLORS, 'Color de pelo')}</div>
    <label>Ropa <select name="topStyle"></select></label>
    <div>Color de camisa ${swatches('topColor', CLOTH, 'Color de camisa')}</div>
    <div>Color de pantalón o falda ${swatches('bottomColor', CLOTH, 'Color de pantalón o falda')}</div>
    <label>Accesorio <select name="accessory">${ACCESSORIES.map(([, n], i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
  </div>
  <div class="prev" aria-label="Vista previa del personaje">
    <canvas id="cr-front" width="${W}" height="${H}"></canvas>
    <canvas id="cr-back" width="${W}" height="${H}"></canvas>
  </div>
  <p class="note">Los síntomas son ejemplos para la simulación, ordenados según los niveles de la Resolución 5596 de 2015; en la vida real el triage lo hace un profesional. Tu paciente reemplaza la próxima llegada al hospital, así que el modelo de llegadas no cambia.</p>
  <p class="err" id="cr-err" hidden></p>
  <div class="act"><button type="button" id="cr-cancel">Cancelar</button><button type="submit" value="send">Enviar al hospital</button></div>
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
  // T38: cada sexo ve sus peinados y su ropa (más los de todos); si la elección actual no aplica, toma la inicial.
  const fill = (name: 'hairStyle' | 'topStyle', names: string[], who: Sex, keep: boolean) => {
    const sel = form.elements.namedItem(name) as HTMLSelectElement;
    const allowed = stylesFor(name === 'hairStyle' ? HAIR_FOR : TOP_FOR, who);
    const prev = Number(sel.value);
    sel.replaceChildren(...allowed.map((i) => new Option(names[i], String(i))));
    sel.value = String(keep && allowed.includes(prev) ? prev : name === 'hairStyle' ? START[who].hair : START[who].top);
  };
  const setSex = (who: Sex, keep: boolean) => {
    fill('hairStyle', HAIR_STYLES, who, keep);
    fill('topStyle', TOP_STYLES, who, keep);
  };
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'sex') setSex(t.value as Sex, true);
    draw();
  });
  const resetHair = () => setSex('mujer', false);
  resetHair();
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
    const ok = getEd().injectVisitor({ name, ageRange: val('age') as PatientInfo['ageRange'], eps: val('eps'), symptom: s.text, triage: s.level, appearance: appearance() }, val('sex') as Sex);
    if (!ok) {
      err.textContent = 'En modo validación no se pueden agregar pacientes (cambiaría el proceso de llegadas). Cambia a modo realista.';
      err.hidden = false;
      return;
    }
    dlg.close();
    form.reset();
    resetHair();
    (form.querySelector('input[name=topColor][value="1"]') as HTMLInputElement).checked = true;
    onSent(`${name} llegará al hospital con la próxima llegada (busca la flecha amarilla).`);
  };
}
