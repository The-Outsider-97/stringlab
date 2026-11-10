import { LineChart } from '../charts.js';
import { h } from '../kit.js';
import { num } from '../format.js';
import { heading, metricCard, note, numberField } from '../form.js';
import { logSlope } from '../logic.js';
import { api } from '../services.js';
import type { Store } from '../store.js';
import { actionButton, type Panel } from './common.js';


export function analysisPanel(store: Store): Panel {
  const sweepChart = new LineChart(180), sweepInfo = h('div', {}), convChart = new LineChart(170), convInfo = h('div', {});
  let start = 0.1, end = 1, steps = 24;
  const mode0 = (): string => (store.config.kind === 'open' ? 'amplitude' : 'left');

  const sweep = async (): Promise<void> => {
    const rows = await api.sweep(store.config, start, end, steps) as Array<{ amplitude: number; energy: number; constraint_residual: number; status: string }>;
    const energy = rows.map((r) => [r.amplitude, r.energy] as [number, number]);
    sweepChart.set([{ name: 'Energy', points: energy }], { xLabel: 'amplitude', yLabel: 'energy', fill: true });
    sweepChart.onPick = (a) => {
      store.edit((c) => { const m = c.modes[0]; if (!m) return; if (c.kind === 'open') m.amplitude = a; else { m.left = a; m.right = a; } }, true);
      store.seekTo(store.first);
    };
    const slope = logSlope(energy);
    const worst = Math.max(...rows.map((r) => Math.abs(r.constraint_residual)));
    const bad = rows.filter((r) => !r.status.startsWith('physical')).length;
    sweepInfo.replaceChildren(h('div', { class: 'metrics' }, metricCard('Energy exponent', slope === null ? '—' : `E ∝ A^${slope.toFixed(2)}`, slope !== null && Math.abs(slope - 2) < 0.05 ? 'good' : '', 'Least-squares slope on a log-log scale; a single mode is quadratic'),
      metricCard('Worst constraint residual', num(worst, 3), worst < 5e-3 ? 'good' : 'warn'), metricCard('Constraint-violating points', `${bad} of ${rows.length}`, bad ? 'warn' : 'good')),
    note(`Click a point to set the first mode's ${mode0()} to that value and recompute.`));
  };

  const converge = async (): Promise<void> => {
    const rows = await api.convergence(store.config, Math.min(1, store.config.duration)) as Array<{ points: number; rms_error: number; effective_dt: number }>;
    convChart.set([{ name: 'RMS error', points: rows.map((r) => [r.points, r.rms_error] as [number, number]) }], { xLabel: 'samples', yLabel: 'RMS error', logY: true });
    const orders = rows.slice(1).map((r, k) => Math.log2((rows[k] as { rms_error: number }).rms_error / r.rms_error));
    const cards = rows.map((r) => metricCard(`${r.points} samples`, num(r.rms_error, 3), '', `effective Δτ ${num(r.effective_dt, 3)}`));
    if (orders.length) cards.push(metricCard('Observed order', orders.map((o) => o.toFixed(2)).join(', '), orders.every((o) => o > 1.5) ? 'good' : 'warn', 'log₂ of the error ratio between doublings; 2 for a second-order scheme'));
    convInfo.replaceChildren(h('div', { class: 'metrics' }, cards));
  };

  const el = h('div', { class: 'panel-grid' },
    h('div', {}, heading('Mode-amplitude sweep'),
      h('div', { class: 'field-row three' }, numberField({ label: 'From', value: start, step: 0.1, onCommit: (v) => { start = v; } }).el, numberField({ label: 'To', value: end, step: 0.1, onCommit: (v) => { end = v; } }).el,
        numberField({ label: 'Samples', value: steps, min: 2, max: 200, integer: true, onCommit: (v) => { steps = v; } }).el),
      h('div', { class: 'row' }, actionButton('Run sweep', sweep, { kind: 'primary' })), sweepChart.el, sweepInfo),
    h('div', {}, heading('Convergence and numerical error'), h('div', { class: 'row' }, actionButton('Run 64 / 128 / 256 samples', converge, { kind: 'primary' })), convChart.el, convInfo,
      note('RMS displacement error of the finite-difference solution against the exact transverse modes, at the same time. The sweep varies the first mode only; closed-string scans may violate level matching and are reported as such.')));
  return { el };
}
