import { h } from '../kit.js';
import { num } from '../format.js';
import { heading, metricCard, note } from '../form.js';
import { configDiff } from '../logic.js';
import type { Store } from '../store.js';
import type { Config } from '../types.js';
import { actionButton, kvTable, type Panel } from './common.js';



export function comparePanel(store: Store): Panel {
  const body = h('div', {});
  const render = (): void => {
    const base = store.baseline;
    const pin = actionButton(base ? 'Replace baseline with current' : 'Pin current as baseline', () => store.pinBaseline(), { kind: 'primary', icon: 'pin' });
    const actions = h('div', { class: 'row' }, pin, base ? h('button', { class: 'btn small', type: 'button', on: { click: () => store.clearBaseline() } }, 'Clear baseline') : null);
    if (!base) { body.replaceChildren(actions, note('Pin a baseline, change a parameter, and the difference is measured here and the baseline is drawn grey in the viewport.')); return; }
    const diff = configDiff(base.config, store.config);
    const live = store.frame, ref = store.baselineFrame();
    const cards: HTMLElement[] = [];
    if (live && ref) {
      const e1 = Number(live.diagnostics.energy), e0 = Number(ref.diagnostics.energy);
      if (Number.isFinite(e1) && Number.isFinite(e0)) cards.push(metricCard('Energy: current − baseline', num(e1 - e0), '', `${num(e1)} versus ${num(e0)}`), metricCard('Energy ratio', e0 ? num(e1 / e0, 4) : '—'));
      if (live.geometry.length === ref.geometry.length) {
        let sum = 0;
        live.geometry.forEach((p, k) => { const q = ref.geometry[k] as number[]; sum += ((p[0] as number) - (q[0] as number)) ** 2 + ((p[1] as number) - (q[1] as number)) ** 2 + ((p[2] as number) - (q[2] as number)) ** 2; });
        cards.push(metricCard('Projected-curve RMS distance', num(Math.sqrt(sum / live.geometry.length), 4), '', 'A coordinate mismatch of the drawn curves at this time, not a physical distance'));
      }
    }
    body.replaceChildren(actions, h('div', { class: 'metrics' }, cards),
      diff.length ? h('table', { class: 'diff' }, h('thead', {}, h('tr', {}, h('th', { text: 'Parameter' }), h('th', { text: 'Baseline' }), h('th', { text: 'Current' }))),
        h('tbody', {}, diff.map(([k, a, b]) => h('tr', {}, h('td', { text: k }), h('td', { text: a }), h('td', { text: b }))))) : note('The current configuration equals the baseline.'),
      kvTable([['Baseline', base.title], ['Duration', `${base.config.duration}`]]),
      note('Both runs are computed independently at the same model time; a time later than the baseline’s duration shows its last frame.'));
  };
  render();
  return { el: h('div', {}, heading('Side-by-side comparison'), body), refresh(reason) { if (reason !== 'tick' || store.frameIndex >= 0) render(); } };
}
