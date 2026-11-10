/** The SLAI agents panel: which agents exist, what StringLab uses each for, and one verified action per agent. Every result is shown with the check
 *  StringLab made against its own solver; nothing is displayed as true merely because an agent returned it. */
import { glyph, h, replace, toast } from '../kit.js';
import { num } from '../format.js';
import { heading, metricCard, note, numberField, switchField } from '../form.js';
import { api, downloadExport } from '../services.js';
import { frameCountFor, type Store } from '../store.js';
import type { AnimationResult, SimulationResult, StemAnalysis } from '../types.js';
import { actionButton, badge, jsonBlock, kvTable, verdict, type Panel } from './common.js';

export function agentsPanel(store: Store): Panel {
  const roster = h('div', { class: 'agents' });
  const stemOut = h('div', {}), simOut = h('div', {}), animOut = h('div', {}), memOut = h('div', {}), convOut = h('div', {});
  let uncertainty = { amplitude: 0.01, alpha_prime: 0.01 };
  let beads = 4, keyframes = 60;
  let conv = { value: 1, from: 'm', to: 'km' };

  const renderRoster = (): void => {
    const a = store.agents;
    replace(roster,
      h('div', { class: 'agent-list' }, a.agents.map((row) => h('div', { class: `agent ${row.available ? 'on' : 'off'}` },
        h('div', { class: 'row' }, h('strong', { text: row.label }), badge(row.available ? 'available' : row.present ? 'present, will not load' : 'not installed', row.available ? 'ok' : 'warn')),
        h('p', { class: 'hint', text: row.purpose }), row.reason ? h('p', { class: 'hint', text: row.reason }) : null))),
      h('details', {}, h('summary', { text: 'Agents StringLab does not use, and why' }), h('ul', { class: 'plain' }, a.not_used.map((n) => h('li', {}, h('strong', { text: `${n.label}: ` }), n.why)))),
      a.recent_calls.length ? h('details', {}, h('summary', { text: `Recent agent calls (${a.recent_calls.length})` }), h('ul', { class: 'plain mono' }, a.recent_calls.map((c) => h('li', { text: `${c.agent} · ${c.operation}${c.request_id ? ` · ${c.request_id}` : ''}` })))) : null,
      a.last_error ? h('div', { class: 'notice warn' }, glyph('alert'), h('div', { class: 'grow', text: a.last_error })) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', on: { click: () => { void store.refreshAgents(); } } }, glyph('refresh'), 'Refresh'),
        h('span', { class: 'hint', text: 'The deterministic physics never needs an agent: with none available StringLab computes everything itself.' })));
  };

  // ---------------------------------------------------------------------------------------------------------------- STEM
  const stemView = (r: StemAnalysis): HTMLElement => {
    const q = r.quadrature, w = r.wave_residual, s = r.sensitivity;
    return h('div', {},
      h('h4', { text: 'Scales and dimensional consistency' }),
      kvTable(r.scales.rows.map((row) => [row.label, `${num(row.magnitude, 6)} ${row.unit}`])),
      h('p', {}, verdict(r.scales.dimensionless_check.passed), ` ${r.scales.dimensionless_check.expression} = ${num(r.scales.dimensionless_check.value, 12)} and dimensionless`),
      h('h4', { text: 'Energy by independent quadrature' }),
      h('div', { class: 'metrics' }, metricCard('STEM Agent (Simpson)', num(q.agent_energy, 10)), metricCard('StringLab solver', num(q.solver_energy, 10)), metricCard('Relative difference', num(q.relative_difference, 3), q.passed ? 'good' : 'bad', `tolerance ${q.tolerance}`)),
      h('p', {}, verdict(q.passed), ` ${q.method}, ${q.intervals} intervals`),
      h('h4', { text: 'Wave-equation residual' }),
      w.points.length ? h('table', { class: 'diff' }, h('thead', {}, h('tr', {}, ['σ', 'τ', 'Ÿ − Y″'].map((t) => h('th', { text: t })))),
        h('tbody', {}, w.points.map((p) => h('tr', {}, h('td', { text: num(p.sigma, 4) }), h('td', { text: num(p.tau, 4) }), h('td', { text: num(p.residual, 3) }))))) : note(w.note ?? 'No residual points.'),
      h('p', {}, verdict(w.passed), ` ${w.method} · max ${num(w.max_abs, 3)} · relative ${num(w.relative, 3)}`),
      h('h4', { text: 'Sensitivity of the energy' }),
      s.available && s.inputs ? h('div', {}, h('table', { class: 'diff' }, h('thead', {}, h('tr', {}, ['Input', 'Value', 'Relative u', '∂E/∂input'].map((t) => h('th', { text: t })))),
        h('tbody', {}, s.inputs.map((i) => h('tr', {}, h('td', { text: i.name }), h('td', { text: num(i.value, 4) }), h('td', { text: num(i.relative_uncertainty, 3) }), h('td', { text: num(i.d_energy, 5) }))))),
        h('p', {}, `Combined standard uncertainty ${num(s.combined_standard_uncertainty, 4)}${s.relative_combined != null ? ` (${num(s.relative_combined * 100, 3)} %)` : ''}. `,
          s.closed_form_check ? h('span', {}, verdict(s.closed_form_check.passed), ` ${s.closed_form_check.law}`) : null)) : note(s.note ?? 'Not available for this configuration.'),
      note(r.note));
  };

  // ---------------------------------------------------------------------------------------------------------------- Simulation
  const simView = (r: SimulationResult): HTMLElement => {
    const p = r.provenance, v = r.verification;
    return h('div', {}, h('div', { class: 'metrics' }, metricCard('Run', p.run_id), metricCard('Seed', String(p.seed)), metricCard('Ended', p.termination.replaceAll('_', ' ')), metricCard('Solver steps', `${p.solver_steps}`, '', `${p.steps_per_frame} per frame, Δτ ${num(p.dt, 4)}`)),
      h('p', {}, verdict(v.rollout_matches_direct_solver, 'identical to the direct solver', 'differs from the direct solver'), ` max difference ${num(v.max_abs_difference, 3)}`),
      kvTable([['RMS error vs analytical modes', num(v.max_rms_error_vs_analytical, 3)], ['Relative energy drift', num(v.relative_energy_drift, 3)], ['CFL number', num(v.cfl, 3)], ['Configuration digest', p.configuration_sha256.slice(0, 16)]]),
      note(r.note));
  };

  // ---------------------------------------------------------------------------------------------------------------- Animation
  const animView = (r: AnimationResult): HTMLElement => h('div', {},
    h('div', { class: 'metrics' }, metricCard('Material points', String(r.beads.length)), metricCard('Keyframes', String(r.keyframes)), metricCard('Max distance to the solver', num(r.verification.max_distance, 3), r.verification.passed ? 'good' : 'bad'),
      metricCard('Relative to extent', num(r.verification.relative_to_extent, 3))),
    h('p', {}, verdict(r.verification.passed), ` ${r.verification.samples} samples between keyframes compared with the solver`),
    note(r.verification.note));

  const el = h('div', { class: 'panel-grid' },
    h('div', { class: 'span-all' }, heading('SLAI agents'), roster),
    h('section', { class: 'card flat' }, h('h3', { text: 'STEM Agent · verify this solution' }),
      note('Unit-aware scales, an independent numerical integration of the energy, the wave-equation residual and the sensitivity of the energy to its inputs, each compared with the solver.'),
      h('div', { class: 'field-row' }, numberField({ label: 'Amplitude uncertainty (relative)', value: uncertainty.amplitude, min: 0, max: 0.5, step: 0.005, onCommit: (v) => { uncertainty.amplitude = v; } }).el,
        numberField({ label: 'α′ uncertainty (relative)', value: uncertainty.alpha_prime, min: 0, max: 0.5, step: 0.005, onCommit: (v) => { uncertainty.alpha_prime = v; } }).el),
      h('div', { class: 'row' }, actionButton('Verify with the STEM Agent', async () => {
        stemOut.replaceChildren(stemView(await api.agents.stem(store.config, store.exportTime(), uncertainty)));
        void store.refreshAgents();
      }, { kind: 'primary', icon: 'check-circle' })), stemOut,
      h('h4', { text: 'Unit conversion' }),
      h('div', { class: 'field-row three' }, numberField({ label: 'Value', value: conv.value, onCommit: (v) => { conv.value = v; } }).el,
        h('div', { class: 'field' }, h('label', { text: 'From' }), h('input', { value: conv.from, on: { change: (e) => { conv.from = (e.target as HTMLInputElement).value; } } })),
        h('div', { class: 'field' }, h('label', { text: 'To' }), h('input', { value: conv.to, on: { change: (e) => { conv.to = (e.target as HTMLInputElement).value; } } }))),
      h('div', { class: 'row' }, actionButton('Convert', async () => {
        const r = await api.agents.convert(conv.value, conv.from, conv.to);
        convOut.replaceChildren(h('p', {}, `${num(conv.value)} ${r.from} = `, h('strong', { text: `${num(r.result, 10)} ${r.to}` })));
      })), convOut),
    h('div', { class: 'stack' },
      h('section', { class: 'card flat' }, h('h3', { text: 'Simulation Agent · finite-difference rollout' }),
        note('Runs the leapfrog solver as a recorded rollout with a seed, a run id and a termination reason, then proves the frames equal the direct solver’s.'),
        switchField('Use the Simulation Agent for finite-difference runs', store.prefs.source === 'simulation', (on) => { store.setPrefs({ source: on ? 'simulation' : 'solver' }); if (store.config.solver === 'finite_difference') void store.compute(); }).el,
        h('div', { class: 'row' }, actionButton('Run now as a rollout', async () => {
          if (store.config.solver !== 'finite_difference') store.edit((c) => { c.solver = 'finite_difference'; }, true);
          const run = await store.runSimulationAgent(frameCountFor(store.config.duration));
          simOut.replaceChildren(simView(run));
        }, { kind: 'primary', icon: 'play' })), simOut),
      h('section', { class: 'card flat' }, h('h3', { text: 'Animation Agent · material points as SGEO tracks' }),
        note('Material points riding on the string become native keyframe tracks. The agent evaluates them and StringLab compares the result with the solver; the same scene exports as an animated .sgeo.'),
        h('div', { class: 'field-row' }, numberField({ label: 'Material points', value: beads, min: 1, max: 9, integer: true, onCommit: (v) => { beads = v; } }).el,
          numberField({ label: 'Keyframes', value: keyframes, min: 8, max: 240, integer: true, onCommit: (v) => { keyframes = v; } }).el),
        h('div', { class: 'row' },
          actionButton('Build tracks', async () => {
            const r = await api.agents.animate(store.config, beads, keyframes);
            store.setAnimation(r); animOut.replaceChildren(animView(r));
            toast('Agent material points are drawn as rings in the viewport.');
          }, { kind: 'primary', icon: 'play' }),
          actionButton('Export animated .sgeo', async () => { toast(`Saved ${await downloadExport('/export/sgeo-animated', { configuration: store.config, beads, keyframes })}`); }, { icon: 'download' }),
          h('button', { class: 'btn small', type: 'button', on: { click: () => store.setAnimation(null) } }, 'Hide agent points')), animOut),
      h('section', { class: 'card flat' }, h('h3', { text: 'Shared Memory' }),
        note('Publish a bounded snapshot of the solver diagnostics (with the configuration digest and revision) for other SLAI agents to read.'),
        h('div', { class: 'row' }, actionButton('Publish diagnostics', async () => {
          const r = await api.agents.publish(store.config, store.exportTime(), store.revision);
          memOut.replaceChildren(r.published ? h('div', {}, verdict(true, 'published'), jsonBlock(r.result)) : h('div', { class: 'notice warn' }, r.error ?? 'Not published.'));
          void store.refreshAgents();
        }, { icon: 'upload' })), memOut)));

  renderRoster();
  return { el, refresh(reason) { if (reason === 'agents') renderRoster(); } };
}

