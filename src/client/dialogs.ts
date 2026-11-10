/** Save, library, export, import, settings and shortcut dialogs, built on the kit's dialog, prompt, confirm and appearance controls. */
import { ApiError, appearanceControls, confirmDialog, glyph, h, normaliseAppearance, openDialog, promptDialog, saveBlob, toast } from './kit.js';
import { csvCell } from './format.js';
import { sliderField, switchField, selectField } from './form.js';
import { api, downloadExport, postBytes } from './services.js';
import { errorText, type Store } from './store.js';
import type { NativeScene } from './types.js';
import { jsonBlock } from './panels/common.js';

// ---------------------------------------------------------------------------------------------------------------- save and library
export async function saveExperiment(store: Store, asNew = false): Promise<void> {
  const name = await promptDialog({ title: asNew ? 'Save as a new experiment' : 'Save experiment', label: 'Name', value: store.title, maxLength: 120, confirmLabel: 'Save',
    validate: (v) => (v.trim() ? null : 'Give the experiment a name.') });
  if (!name) return;
  const body = { id: asNew ? null : store.savedId, expected_revision: asNew ? 0 : store.savedRevision, title: name.trim(), configuration: store.config, quantum: store.quantum, numerical: store.numerical };
  try {
    store.markSaved(await api.save(body));
    toast(`Saved “${store.title}”, revision ${store.savedRevision}.`, { kind: 'ok' });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const copy = await confirmDialog({ title: 'This experiment changed elsewhere', message: 'A newer revision exists, so saving over it would discard that work.', detail: 'Save your version as a new experiment instead?', confirmLabel: 'Save as new' });
      if (copy) await saveExperiment(store, true);
    } else toast(errorText(error), { kind: 'error' });
  }
}

export async function openLibrary(store: Store): Promise<void> {
  const host = h('div', { class: 'library' });
  const dialog = openDialog({ title: 'Saved experiments', eyebrow: 'Library', body: host, noCancel: true, actions: [{ label: 'Close', run: () => null }] });
  const render = async (): Promise<void> => {
    try {
      const list = await api.experiments();
      host.replaceChildren(h('p', { class: 'muted', text: 'Experiments are stored in your SLAI data folder, on this computer.' }),
        ...(list.length ? list.map((e) => h('div', { class: 'lib-row' },
          h('div', { class: 'grow' }, h('strong', { text: e.title }), h('div', { class: 'muted', text: `revision ${e.revision} · ${new Date(e.updated_utc).toLocaleString()}` })),
          h('button', { class: 'btn small primary', type: 'button', on: { click: () => { void store.loadSaved(e.id).then(() => dialog.close()).catch((err: unknown) => toast(errorText(err), { kind: 'error' })); } } }, 'Open'),
          h('button', { class: 'btn small danger', type: 'button', on: { click: () => { void remove(e.id, e.title); } } }, glyph('trash'), 'Delete')))
          : [h('p', { class: 'empty', text: 'No saved experiments yet.' })]));
    } catch (error) { host.replaceChildren(h('div', { class: 'notice err', text: errorText(error) })); }
  };
  const remove = async (id: string, title: string): Promise<void> => {
    if (!(await confirmDialog({ title: 'Delete experiment', message: `Delete “${title}”? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    try { await api.remove(id); if (store.savedId === id) { store.savedId = null; store.savedRevision = 0; } store.events.emit('saved'); toast('Deleted.'); } catch (error) { toast(errorText(error), { kind: 'error' }); }
    await render();
  };
  await render();
}

// ---------------------------------------------------------------------------------------------------------------- export
interface Format { label: string; detail: string; run: () => Promise<string> }

export function exportDialog(store: Store, actions: { screenshot: () => Promise<string>; record: (() => Promise<string>) | null }): void {
  const f = store.status.formats;
  const time = store.exportTime();
  const base = { configuration: store.config, time };
  const file = async (path: string, body: unknown = base): Promise<string> => downloadExport(path, body);
  const live = store.source.kind === 'dynamics';
  const list: Format[] = [];

  if (live) {
    // a nonlinear run is not represented by the Fourier configuration, so these exports carry the frames themselves
    list.push({ label: 'Numerical trajectory · JSON', detail: `All ${store.frames.length} frames, the solver settings and the assumptions.`, run: async () => {
      const payload = { application: 'StringLab', schema_version: 1, solver: store.source.model, solver_configuration: store.numerical, frames: store.frames, solver_assumptions: store.frames[0]?.model_assumptions ?? '',
        fidelity: 'Sampled numerical embedding and diagnostics; interpolation is display-only; no independent solver certification.' };
      saveBlob(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }), 'stringlab_numerical_trajectory.json'); return 'stringlab_numerical_trajectory.json';
    } });
    list.push({ label: 'Numerical diagnostics · CSV', detail: 'One row per frame, every diagnostic as a column.', run: async () => {
      const keys = [...new Set(store.frames.flatMap((fr) => Object.keys(fr.diagnostics)))].sort();
      const rows = [['frame', 'time', 'solver', ...keys].map(csvCell).join(','), ...store.frames.map((fr, i) => [i, fr.time, fr.solver, ...keys.map((k) => (typeof fr.diagnostics[k] === 'number' ? fr.diagnostics[k] : JSON.stringify(fr.diagnostics[k] ?? null)))].map(csvCell).join(','))];
      saveBlob(new Blob([`${rows.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }), 'stringlab_numerical_diagnostics.csv'); return 'stringlab_numerical_diagnostics.csv';
    } });
  } else {
    if (f.sgeo) list.push({ label: 'Native SGEO · projected 3D string', detail: 'The string as editable SLAI geometry at the current time.', run: () => file('/export/sgeo') },
      { label: 'Native SGEO · worldsheet mesh', detail: 'The worldsheet surface as a mesh.', run: () => file('/export/sgeo', { ...base, worldsheet: true }) });
    if (f.sgeo && store.agentAvailable('animation')) list.push({ label: 'Animated SGEO · material points', detail: 'Keyframed tracks from the Animation Agent.', run: () => file('/export/sgeo-animated', { configuration: store.config, beads: 4, keyframes: 60 }) });
    if (f.sdrw) list.push({ label: 'Native SDRW · coordinate diagram', detail: 'Editable 2D drawing of the projection.', run: () => file('/export/sdrw') });
    list.push({ label: 'Scientific snapshot · JSON', detail: 'Configuration, frame and diagnostics: the source of truth for recreating the run.', run: () => file('/export/json') },
      { label: 'Time series · CSV', detail: 'Diagnostics against τ for the whole run.', run: () => file('/export/csv') });
    if (f.pdf) list.push({ label: 'Reproducible report · PDF', detail: 'Parameters, equations, figures and diagnostics.', run: () => file('/export/pdf') });
    if (f.sldc) list.push({ label: 'Editable report · SLDC', detail: 'The report as a native SLAI document with editable equations.', run: () => file('/export/sldc') });
  }
  list.push({ label: 'Picture · PNG', detail: 'The viewport exactly as drawn now.', run: actions.screenshot });
  if (actions.record) list.push({ label: 'Video · WebM', detail: 'The run played once from the start, recorded from the viewport.', run: actions.record });

  const dialog = openDialog({ title: 'Export', eyebrow: live ? 'Nonlinear run' : 'Scientific results', size: 'wide', noCancel: true, actions: [{ label: 'Close', run: () => null }],
    body: [live ? h('p', { class: 'note', text: `The active ${store.source.label} evolution is independent of the Fourier configuration, so the Fourier reports are not offered for it.` }) : null,
      h('div', { class: 'export-grid' }, list.map((fmt) => h('button', { class: 'export-item', type: 'button', on: { click: () => {
        void fmt.run().then((name) => { toast(`Saved ${name}`, { kind: 'ok' }); dialog.close(); }).catch((e: unknown) => toast(errorText(e), { kind: 'error' }));
      } } }, h('strong', { text: fmt.label }), h('span', { class: 'muted', text: fmt.detail })))),
      h('p', { class: 'hint', text: 'SGEO and SDRW keep editable projected geometry, not the full higher-dimensional or time-dependent state. Keep the JSON snapshot as the source of truth.' })] });
}

// ---------------------------------------------------------------------------------------------------------------- import
export async function importNative(store: Store, file: File, show: boolean): Promise<void> {
  const lower = file.name.toLowerCase();
  const kind = lower.endsWith('.sgeo') ? 'sgeo' : lower.endsWith('.sdrw') ? 'sdrw' : null;
  if (!kind) throw new Error('Only .sgeo and .sdrw files can be opened here.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Files over 6 MB are not accepted.');
  const bytes = await file.arrayBuffer();
  if (show && kind === 'sgeo') {
    const scene = await postBytes<NativeScene>('/import/sgeo/scene', bytes);
    if (!scene.valid_native_document) throw new Error('The file is not a valid native SGEO document.');
    store.setNative(scene);
    toast(`Showing ${scene.segments.length} segments${scene.mesh ? ` and ${scene.mesh.faces.length} faces` : ''} from ${file.name}.`, { kind: 'ok' });
  }
}

export function importDialog(store: Store): void {
  const input = h('input', { type: 'file', accept: '.sgeo,.sdrw', attrs: { 'aria-label': 'Choose an SGEO or SDRW file' } });
  const out = h('div', {});
  const pick = (): File | null => input.files?.[0] ?? null;
  const dialog = openDialog({ title: 'Open native geometry', eyebrow: 'Import', size: 'wide', noCancel: false, cancelLabel: 'Close',
    body: [h('p', { class: 'note', text: 'Open a SLAI SGEO or SDRW package. It is validated by the SLAI libraries and inspected here; a drawing is not automatically a valid physical initial state, so it is shown, never used as one.' }), input, out],
    actions: [
      { label: 'Inspect', run: async () => {
        const f = pick(); if (!f) { toast('Choose a file first.'); return undefined; }
        const kind = f.name.toLowerCase().endsWith('.sgeo') ? 'sgeo' : f.name.toLowerCase().endsWith('.sdrw') ? 'sdrw' : null;
        if (!kind) { toast('Only .sgeo and .sdrw files are supported.', { kind: 'error' }); return undefined; }
        out.replaceChildren(jsonBlock(await postBytes<Record<string, unknown>>(`/import/${kind}`, await f.arrayBuffer()))); return undefined;
      } },
      { label: 'Show in the viewport', kind: 'primary', run: async () => {
        const f = pick(); if (!f) { toast('Choose a file first.'); return undefined; }
        await importNative(store, f, true); return null;
      } }] });
  void dialog;
}

// ---------------------------------------------------------------------------------------------------------------- settings and shortcuts
export function settingsDialog(store: Store): void {
  const p = store.prefs;
  const status = store.status;
  openDialog({ title: 'Settings', eyebrow: 'StringLab', noCancel: true, actions: [{ label: 'Done', kind: 'primary', run: () => null }], body: [
    h('h3', { text: 'Appearance' }),
    appearanceControls(normaliseAppearance({ theme: p.theme, scale: p.scale, motion: p.motion }), (next) => store.setPrefs({ theme: next.theme, scale: next.scale, motion: next.motion })),
    h('h3', { text: 'Playback' }),
    selectField('Default speed', ['0.25', '0.5', '1', '2', '4'].map((v) => [v, `${v}×`] as [string, string]), String(p.speed), (v) => store.setSpeed(Number(v))).el,
    switchField('Loop by default', p.loop, (v) => store.setLoop(v ? 'loop' : 'once')).el,
    sliderField({ label: 'Trail length', value: p.trail, min: 0, max: 120, step: 2, format: (v) => (v ? `${v} frames` : 'off'), onInput: (v) => store.setPrefs({ trail: v }) }).el,
    h('h3', { text: 'About this installation' }),
    h('dl', { class: 'kv' }, [['Version', status.version], ['Data folder', status.storage.dataDir], ['SLAI checkout', status.slai.slaiRoot ?? 'not found'], ['SLDC reports', status.slai.sldc.available ? 'available' : 'not available'],
      ['Agents', `${status.optional_agents.agents.filter((a) => a.available).length} of ${status.optional_agents.agents.length} available`]].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
    ...status.notices.map((n) => h('div', { class: 'notice warn' }, glyph('info'), h('div', { class: 'grow', text: n.text }))),
  ] });
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'], ['← →', 'Previous / next frame'], ['Home / End', 'Jump to start / end'], ['Drag', 'Orbit the camera'], ['Shift + drag, right drag', 'Pan'], ['Scroll, pinch', 'Zoom toward the pointer'],
  ['Double-click', 'Fit the view'], ['Click a point', 'Pin / unpin a vertex'], ['F', 'Fit the view'], ['1 2 3 4', 'Front, side, top, isometric view'], ['Arrows (viewport focused)', 'Orbit'], ['+ / −', 'Zoom'],
  ['Esc', 'Clear the pinned vertex'], ['?', 'This list'],
];

export function shortcutsDialog(): void {
  openDialog({ title: 'Keyboard and mouse', eyebrow: 'Help', size: 'narrow', noCancel: true, actions: [{ label: 'Close', run: () => null }],
    body: h('dl', { class: 'kv wide' }, SHORTCUTS.flatMap(([k, v]) => [h('dt', {}, h('kbd', { text: k })), h('dd', { text: v })])) });
}
