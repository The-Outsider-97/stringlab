/** The right-hand inspector: every parameter of the experiment, plus the display options of the viewport. Fields are built once and synchronised from the
 *  store, so a recompute (or another view changing the configuration) never steals focus from the field being typed in. */
import { glyph, h, plural } from './kit.js';
import { numberField, segmented, selectField, sliderField, switchField, type NumberField, type Segmented, type SelectField, type Switch } from './form.js';
import { convertModes, coordinates, resizeAxes } from './logic.js';
import type { Store } from './store.js';
import { MODE_LIMIT, type Config, type Mode, type Kind } from './types.js';

const OPEN_BC: Array<[string, string]> = [['NN', 'Neumann · Neumann (free ends)'], ['DD', 'Dirichlet · Dirichlet (fixed ends)'], ['ND', 'Neumann · Dirichlet'], ['DN', 'Dirichlet · Neumann']];
const CLOSED_BC: Array<[string, string]> = [['periodic', 'Periodic (closed loop)']];




export class Inspector {
  readonly el: HTMLElement;
  private banner = h('div', { class: 'notice err', attrs: { role: 'alert' } });
  private fields: { kind?: Segmented<Kind>; bc?: SelectField; dimensions?: NumberField; alpha?: NumberField; pPlus?: NumberField; solver?: SelectField; points?: NumberField; dt?: NumberField; duration?: NumberField;
    proj: SelectField[]; axis?: SelectField; start?: NumberField; end?: NumberField; drift?: NumberField } = { proj: [] };
  private modeHost = h('div', { class: 'modes' });
  private tension = h('strong', { text: '' });
  private cfl = h('p', { class: 'hint' });
  private projNote = h('p', { class: 'hint' });
  private display: Record<string, { set(v: never): void }> = {};
  private structure = '';
  private axisIndex = 0;
  private solverBlocks: HTMLElement[] = [];

  constructor(private readonly store: Store) {
    this.banner.hidden = true;
    this.el = h('div', { class: 'inspector-body' }, this.banner);
    this.build();
    store.events.on((e) => { if (e === 'config' || e === 'meta') this.sync(); if (e === 'error' || e === 'status' || e === 'frames') this.showError(); if (e === 'prefs') this.syncDisplay(); });
    this.sync(); this.syncDisplay();
  }

  private section(title: string, ...children: Array<HTMLElement | null>): HTMLElement {
    return h('section', { class: 'group' }, h('h3', { text: title }), ...children);
  }

  private build(): void {
    const s = this.store, f = this.fields;
    f.kind = segmented<Kind>('String type', [['open', 'Open'], ['closed', 'Closed']], s.config.kind, (kind) => {
      if (kind === s.config.kind) return;
      s.edit((c) => { c.kind = kind; c.bc = kind === 'closed' ? 'periodic' : 'NN'; c.modes = convertModes(c.modes, kind); }, true);
    });
    f.bc = selectField('Endpoint conditions', OPEN_BC, s.config.bc, (bc) => s.edit((c) => { c.bc = bc; }));
    f.dimensions = numberField({ label: 'Spacetime dimensions', value: s.config.dimensions, min: 4, max: 26, integer: true, hint: 'D − 2 transverse directions. 26 is the critical bosonic dimension.',
      onCommit: (v) => s.edit((c) => { c.dimensions = v; resizeAxes(c); }, true) });
    f.alpha = numberField({ label: 'Regge slope α′', unit: 'length²', value: s.config.alpha_prime, min: 1e-6, step: 0.1, onCommit: (v) => s.edit((c) => { c.alpha_prime = v; }) });
    f.pPlus = numberField({ label: 'Light-cone rate ∂τX⁺', unit: 'length', value: s.config.p_plus, min: 1e-3, step: 0.1, onCommit: (v) => s.edit((c) => { c.p_plus = v; }) });

    f.solver = selectField('Evolution method', [['analytical', 'Analytical Fourier modes'], ['finite_difference', 'Numerical leapfrog (finite difference)']], s.config.solver, (v) => s.edit((c) => { c.solver = v as Config['solver']; }, true));
    f.points = numberField({ label: 'Samples along σ', value: s.config.points, min: 32, max: 4096, step: 16, integer: true, onCommit: (v) => s.edit((c) => { c.points = v; }) });
    f.dt = numberField({ label: 'Time step Δτ', value: s.config.dt, min: 1e-5, step: 0.001, hint: 'Used by the finite-difference solver only.', onCommit: (v) => s.edit((c) => { c.dt = v; }) });
    f.duration = numberField({ label: 'Run duration τ', value: s.config.duration, min: 0.01, max: 100, step: 0.5, onCommit: (v) => s.edit((c) => { c.duration = v; }) });

    for (let i = 0; i < 3; i++) f.proj.push(selectField(`Axis ${'XYZ'[i]}`, coordinates(s.config.dimensions).map((x) => [x, x]), s.config.projection[i] ?? 'σ', (v) => s.edit((c) => { c.projection[i] = v; })));
    f.axis = selectField('Transverse axis', [], '1', (v) => { this.axisIndex = Number(v) - 1; this.syncAxis(); });
    f.start = numberField({ label: 'Start position', value: 0, step: 0.25, onCommit: (v) => s.edit((c) => { c.anchor_start[this.axisIndex] = v; }) });
    f.end = numberField({ label: 'End position', value: 0, step: 0.25, onCommit: (v) => s.edit((c) => { c.anchor_end[this.axisIndex] = v; }) });
    f.drift = numberField({ label: 'Drift velocity', value: 0, step: 0.05, hint: 'Constant velocity of the whole string along this axis.', onCommit: (v) => s.edit((c) => { c.zero_velocity[this.axisIndex] = v; }) });

    const solverOnly = (el: HTMLElement): HTMLElement => { this.solverBlocks.push(el); return el; };
    this.el.append(
      this.section('Model', f.kind.el, f.bc.el, f.dimensions.el),
      this.section('Physical parameters', f.alpha.el, f.pPlus.el, h('div', { class: 'readout' }, h('span', { text: 'Tension T = 1 / 2πα′' }), this.tension)),
      this.section(`Modes`, this.modeHost, h('button', { class: 'btn small', type: 'button', on: { click: () => s.addMode() } }, glyph('plus'), 'Add mode')),
      this.section('Solver and sampling', f.solver.el, h('div', { class: 'field-row' }, f.points.el, solverOnly(f.dt.el)), f.duration.el, this.cfl),
      this.section('Coordinate projection', h('div', { class: 'field-row three' }, f.proj.map((p) => p.el)), this.projNote),
      this.section('Endpoints and drift', f.axis.el, h('div', { class: 'field-row' }, f.start.el, f.end.el), f.drift.el,
        h('p', { class: 'hint', text: 'Fixed support positions for Dirichlet ends; a constant translation for the others.' })),
    );
    this.el.append(this.buildDisplay());
  }

  private buildDisplay(): HTMLElement {
    const s = this.store;
    const d = this.display;
    const colour = segmented('Colour string by', [['plain', 'Plain'], ['speed', 'Speed'], ['energy', 'Energy'], ['depth', 'Depth']], s.prefs.colour_by, (v) => s.setPrefs({ colour_by: v }));
    const beads = sliderField({ label: 'Material points', value: s.prefs.beads, min: 0, max: 48, step: 1, format: (v) => (v ? `${v}` : 'off'), onInput: (v) => s.setPrefs({ beads: v }) });
    const trail = sliderField({ label: 'Trail length', value: s.prefs.trail, min: 0, max: 80, step: 2, format: (v) => (v ? `${v} frames` : 'off'), onInput: (v) => s.setPrefs({ trail: v }) });
    const sw = (key: 'show_grid' | 'show_axes' | 'show_worldsheet' | 'auto_orbit', label: string): Switch => switchField(label, s.prefs[key], (v) => s.setPrefs({ [key]: v }));
    const grid = sw('show_grid', 'Grid'), axes = sw('show_axes', 'Axes'), sheet = sw('show_worldsheet', 'Worldsheet'), orbit = sw('auto_orbit', 'Slow auto-orbit');
    const ortho = switchField('Orthographic camera', s.prefs.camera_mode === 'orthographic', (v) => s.setPrefs({ camera_mode: v ? 'orthographic' : 'perspective' }));
    Object.assign(d, { colour_by: colour, beads, trail, show_grid: grid, show_axes: axes, show_worldsheet: sheet, auto_orbit: orbit, camera: ortho });
    return this.section('Display', colour.el, beads.el, trail.el, h('div', { class: 'switches' }, grid.el, axes.el, sheet.el, ortho.el, orbit.el));
  }

  private showError(): void {
    const text = this.store.error;
    this.banner.hidden = !text;
    this.banner.replaceChildren(...(text ? [glyph('alert'), h('div', { class: 'grow', text }), ] : []));
  }

  private syncDisplay(): void {
    const p = this.store.prefs, d = this.display;
    (d.colour_by as Segmented<never>).set(p.colour_by as never);
    (d.beads as { set(v: number): void }).set(p.beads); (d.trail as { set(v: number): void }).set(p.trail);
    (d.show_grid as Switch).set(p.show_grid); (d.show_axes as Switch).set(p.show_axes); (d.show_worldsheet as Switch).set(p.show_worldsheet);
    (d.auto_orbit as Switch).set(p.auto_orbit); (d.camera as Switch).set(p.camera_mode === 'orthographic');
  }

  private syncAxis(): void {
    const c = this.store.config, f = this.fields;
    f.start?.set(c.anchor_start[this.axisIndex] ?? 0); f.end?.set(c.anchor_end[this.axisIndex] ?? 0); f.drift?.set(c.zero_velocity[this.axisIndex] ?? 0);
  }

  private sync(): void {
    const c = this.store.config, f = this.fields;
    const open = c.kind === 'open';
    f.kind?.set(c.kind);
    if (f.bc) { f.bc.select.replaceChildren(...(open ? OPEN_BC : CLOSED_BC).map(([v, t]) => h('option', { value: v, text: t }))); f.bc.set(c.bc); f.bc.select.disabled = !open; }
    f.dimensions?.set(c.dimensions); f.alpha?.set(c.alpha_prime); f.pPlus?.set(c.p_plus); f.solver?.set(c.solver); f.points?.set(c.points); f.dt?.set(c.dt); f.duration?.set(c.duration);
    this.tension.textContent = (1 / (2 * Math.PI * c.alpha_prime)).toPrecision(6);
    for (const block of this.solverBlocks) block.hidden = c.solver !== 'finite_difference';
    const sigmaRange = open ? Math.PI : 2 * Math.PI, dsigma = sigmaRange / Math.max(1, c.points - (open ? 1 : 0));
    this.cfl.textContent = c.solver === 'finite_difference' ? `Δσ = ${dsigma.toPrecision(3)} · Courant number Δτ/Δσ = ${(c.dt / dsigma).toPrecision(3)} ${c.dt / dsigma > 1 ? '(unstable: keep it ≤ 1)' : '(stable)'}` : '';
    this.cfl.hidden = !this.cfl.textContent;
    const available = coordinates(c.dimensions);
    f.proj.forEach((p, i) => { p.select.replaceChildren(...available.map((x) => h('option', { value: x, text: x }))); p.set(c.projection[i] ?? 'σ'); });
    this.projNote.textContent = c.projection.includes('σ') ? 'σ is a worldsheet coordinate, not a spatial one: this is a parameter-space diagram.' : 'Selected target-space coordinates; the other dimensions are hidden.';
    const axes = c.dimensions - 2;
    if (this.axisIndex >= axes) this.axisIndex = 0;
    const axisSel = f.axis?.select;
    if (axisSel && axisSel.options.length !== axes) axisSel.replaceChildren(...Array.from({ length: axes }, (_, i) => h('option', { value: String(i + 1), text: `X${i + 1}` })));
    f.axis?.set(String(this.axisIndex + 1));
    this.syncAxis();
    this.syncModes();
  }

  private syncModes(): void {
    const c = this.store.config;
    const signature = `${c.kind}|${c.modes.length}|${c.dimensions}|${c.modes.map((m) => m.enabled).join('')}`;
    if (signature !== this.structure) { this.structure = signature; this.renderModes(); return; }
    this.modeHost.querySelectorAll<HTMLInputElement>('input[data-mode]').forEach((input) => {
      if (document.activeElement === input) return;
      const m = c.modes[Number(input.dataset.mode)];
      const v = m ? (m as unknown as Record<string, number | undefined>)[input.dataset.key as string] : undefined;
      if (v !== undefined) input.value = String(v);
    });
  }

  private renderModes(): void {
    const s = this.store, c = s.config;
    this.modeHost.replaceChildren(...c.modes.map((mode, i) => {
      const field = (label: string, key: keyof Mode, min: number, max: number, integer = false): HTMLElement => {
        const nf = numberField({ label, value: (mode[key] as number | undefined) ?? 0, min, max, integer, step: integer ? 1 : 0.05, onCommit: (v) => s.edit((cfg) => { ((cfg.modes[i] as unknown) as Record<string, number>)[key] = v; }) });
        nf.input.dataset.mode = String(i); nf.input.dataset.key = key;
        return nf.el;
      };
      const on = switchField(`Mode ${i + 1}`, mode.enabled, (v) => s.edit((cfg) => { (cfg.modes[i] as Mode).enabled = v; }, true));
      const remove = h('button', { class: 'iconbtn tiny', type: 'button', attrs: { 'aria-label': `Remove mode ${i + 1}`, title: 'Remove mode' }, on: { click: () => s.edit((cfg) => { cfg.modes.splice(i, 1); }, true) } }, glyph('close'));
      return h('div', { class: `mode${mode.enabled ? '' : ' off'}` }, h('div', { class: 'mode-head' }, on.el, remove),
        h('div', { class: 'field-row' }, field('Harmonic n', 'n', 1, 64, true), field('Axis Xᵢ', 'axis', 1, c.dimensions - 2, true)),
        c.kind === 'open'
          ? h('div', { class: 'field-row' }, field('Amplitude', 'amplitude', -5, 5), field('Phase (rad)', 'phase', -100, 100))
          : h('div', { class: 'field-row' }, field('Left amplitude', 'left', -5, 5), field('Right amplitude', 'right', -5, 5), field('Left phase', 'phase_left', -100, 100), field('Right phase', 'phase_right', -100, 100)));
    }));
    if (!c.modes.length) this.modeHost.append(h('p', { class: 'empty', text: 'No modes: the string stays at rest. Add one.' }));
    this.modeHost.append(h('p', { class: 'hint', text: `${plural(c.modes.length, 'mode')} of at most ${MODE_LIMIT}.` }));
  }
}

