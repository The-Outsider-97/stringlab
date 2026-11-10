import { h } from '../kit.js';
import { CONSTRAINT_LABEL, constraintOf, num, titleCase } from '../format.js';
import { heading, metricCard, note } from '../form.js';
import { speedScalars } from '../geometry.js';
import type { Store } from '../store.js';
import { badge, kvTable, type Panel } from './common.js';

export function resultsPanel(store: Store): Panel {
  const cards = h('div', { class: 'metrics' });
  const source = h('div', { class: 'card flat' });
  const probe = h('div', { class: 'card flat' });
  const table = h('div', {});
  const text = h('p', { class: 'note' });
  const el = h('div', { class: 'panel-grid' }, cards, text, source, probe, h('div', { class: 'span-all' }, heading('All diagnostics at this time'), table));
  let shown = -1, revision = -1;

  const render = (): void => {
    const f = store.frame;
    if (!f) { cards.replaceChildren(note(store.error ?? 'Choose an experiment, or correct the parameters.')); text.textContent = ''; source.hidden = probe.hidden = true; table.replaceChildren(); return; }
    const d = f.diagnostics;
    const c = constraintOf(d);
    const good = f.status.startsWith('physical') || f.status.startsWith('nonlinear') || f.status === 'ok';
    cards.replaceChildren(...[
      metricCard('Time τ', store.position.toFixed(3)),
      metricCard('Energy / on-shell action', num(d.energy ?? d.polyakov_lagrangian_integral_sigma)),
      metricCard(c ? CONSTRAINT_LABEL[c.key] ?? c.key : 'Constraint', c ? num(c.value, 3) : '—', c ? (c.value < 5e-3 ? 'good' : 'warn') : ''),
      metricCard('Model status', titleCase(f.status), good ? 'good' : 'warn'),
      metricCard('String tension', num(d.tension ?? 1 / (2 * Math.PI * store.config.alpha_prime), 5), '', 'T = 1/(2πα′) in model units'),
      typeof d.max_transverse_speed === 'number' ? metricCard('Max transverse speed', num(d.max_transverse_speed, 4), d.max_transverse_speed < 1 ? 'good' : 'warn', 'Below 1 (the speed of light) for a physical open-string mode') : null,
    ].filter((x): x is HTMLElement => x !== null));
    text.textContent = `${f.solver === 'analytical' ? 'Analytical Fourier solution' : 'Finite-difference wave evolution'} · ${f.samples} samples along σ · ${f.projection.join(' / ')} · ${f.projection_kind === 'parameter_space_diagram' ? 'parameter-space diagram: σ is not physical space.' : 'target-space coordinate projection.'}`;

    const s = store.source;
    source.hidden = false;
    source.replaceChildren(h('h4', { text: 'Computed by' }), h('p', {}, badge(s.kind === 'simulation' ? 'Simulation Agent' : s.kind === 'dynamics' ? 'Nonlinear solver' : 'StringLab engine', s.kind === 'simulation' ? 'ok' : 'plain'), ` ${s.label}`),
      s.run ? kvTable([['Run', s.run.run_id], ['Seed', String(s.run.seed)], ['Ended', s.run.termination.replaceAll('_', ' ')], ['Solver steps', `${s.run.solver_steps} (${s.run.steps_per_frame} per frame)`]]) : h('p', { class: 'hint', text: 'Switch “Computed by” to the Simulation Agent in the SLAI agents tab to run the finite-difference solver as a recorded rollout.' }),
      ...(s.verification ? [h('p', { class: 'hint', text: `Rollout equals the direct solver: ${s.verification.rollout_matches_direct_solver ? 'yes' : 'NO'} · RMS vs analytical ${num(s.verification.max_rms_error_vs_analytical, 3)} · energy drift ${num(s.verification.relative_energy_drift, 3)} · CFL ${num(s.verification.cfl, 3)}` })] : []));

    if (store.probe !== null && store.probe < f.geometry.length) {
      const g = f.geometry[store.probe] as number[];
      const v = speedScalars(store.frames, store.frameIndex)[store.probe] ?? 0;
      probe.hidden = false;
      probe.replaceChildren(h('h4', { text: `Pinned vertex ${store.probe + 1} of ${f.geometry.length}` }),
        kvTable([[f.projection[0] ?? 'x', num(g[0], 5)], [f.projection[1] ?? 'y', num(g[1], 5)], [f.projection[2] ?? 'z', num(g[2], 5)], ['Projected speed', num(v, 4)]]),
        h('button', { class: 'btn small', type: 'button', on: { click: () => store.setProbe(null) } }, 'Unpin'));
    } else { probe.hidden = true; }

    table.replaceChildren(kvTable(Object.entries(d).map(([k, v]) => [titleCase(k), typeof v === 'number' ? num(v, 6) : typeof v === 'string' ? titleCase(v) : JSON.stringify(v)]), 'kv wide'));
  };
  render();
  return { el, refresh(reason) {
    const index = store.frameIndex;
    if (reason === 'tick' && index === shown && revision === store.revision) return;
    shown = index; revision = store.revision; render();
  } };
}
