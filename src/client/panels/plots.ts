import { LineChart } from '../charts.js';
import { h } from '../kit.js';
import { CONSTRAINT_LABEL, numericKeys, titleCase } from '../format.js';
import { heading, note, segmented, selectField } from '../form.js';
import { energyScalars, speedScalars } from '../geometry.js';
import type { Store } from '../store.js';
import type { Panel } from './common.js';

type Mode = 'time' | 'vertex' | 'profile';

export function plotsPanel(store: Store): Panel {
  let mode: Mode = 'time';
  let key = 'energy';
  const chart = new LineChart(220);
  const caption = note('');
  const keySelect = selectField('Quantity', [], key, (v) => { key = v; draw(); });
  const modes = segmented<Mode>('Plot', [['time', 'Over time'], ['vertex', 'Pinned vertex'], ['profile', 'Along the string']], mode, (m) => { mode = m; draw(); });

  const draw = (): void => {
    const frames = store.frames;
    keySelect.el.hidden = mode !== 'time';
    if (!frames.length) { chart.set([]); caption.textContent = 'No frames yet.'; return; }
    if (mode === 'time') {
      const keys = numericKeys(frames);
      keySelect.select.replaceChildren(...keys.map((k) => h('option', { value: k, text: CONSTRAINT_LABEL[k] ?? titleCase(k) })));
      if (!keys.includes(key)) key = keys.includes('energy') ? 'energy' : keys[0] ?? '';
      keySelect.set(key);
      const series = [{ name: store.title, points: frames.map((f) => [f.time, f.diagnostics[key] as number] as [number, number]) }];
      const base = store.baseline?.frames;
      if (base?.length && typeof base[0]?.diagnostics[key] === 'number') series.push({ name: `Baseline: ${store.baseline?.title}`, points: base.map((f) => [f.time, f.diagnostics[key] as number] as [number, number]) });
      chart.set(series, { xLabel: 'τ', yLabel: CONSTRAINT_LABEL[key] ?? titleCase(key), cursor: store.position, logY: false });
      chart.onPick = (x) => store.seekTo(x);
      caption.textContent = 'Click the curve to jump to that time. The dashed marker follows playback. A conserved quantity is a flat line; its scale is shown on the axis.';
    } else if (mode === 'vertex') {
      const row = store.probe;
      if (row === null) { chart.set([]); caption.textContent = 'Click a point on the string in the viewport to pin it, then its path is plotted here.'; return; }
      const names = frames[0]?.projection ?? ['x', 'y', 'z'];
      chart.set([0, 1, 2].map((a) => ({ name: names[a] ?? 'xyz'[a] as string, points: frames.map((f) => [f.time, (f.geometry[row % f.geometry.length] as number[])[a] as number] as [number, number]) })),
        { xLabel: 'τ', yLabel: `vertex ${row + 1}`, cursor: store.position });
      chart.onPick = (x) => store.seekTo(x);
      caption.textContent = `Coordinates of the pinned vertex ${row + 1} through the run.`;
    } else {
      const i = store.frameIndex;
      const speed = speedScalars(frames, i), energy = energyScalars(frames, i);
      const n = frames[i]?.geometry.length ?? 0, closed = !!frames[i]?.closed;
      const sigma = (k: number): number => (k / (closed ? n : Math.max(1, n - 1))) * (closed ? 360 : 180);
      chart.set([{ name: 'speed |∂τY|', points: Array.from({ length: n }, (_, k) => [sigma(k), speed[k] ?? 0] as [number, number]) }, { name: 'energy density |∂τY|²+|∂σY|²', points: Array.from({ length: n }, (_, k) => [sigma(k), energy[k] ?? 0] as [number, number]) }],
        { xLabel: 'σ (degrees)', yLabel: `at τ = ${store.position.toFixed(2)}`, cursor: null });
      chart.onPick = (x) => store.setProbe(Math.round((x / (closed ? 360 : 180)) * (closed ? n : n - 1)) % n);
      caption.textContent = 'Click to pin the vertex at that σ. Values are of the projected curve, differenced between stored frames.';
    }
  };
  draw();
  const el = h('div', {}, heading('Evolution and profiles'), h('div', { class: 'row' }, modes.el, keySelect.el), chart.el, caption);
  let last = -1;
  return { el, refresh(reason) {
    if (reason === 'tick') { chart.setCursor(mode === 'profile' ? null : store.position); if (mode === 'profile' && store.frameIndex !== last) { last = store.frameIndex; draw(); } return; }
    draw();
  } };
}
