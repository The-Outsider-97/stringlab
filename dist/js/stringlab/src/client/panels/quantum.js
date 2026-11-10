import { LineChart } from '../charts.js';
import { debounce, h } from '../kit.js';
import { num, titleCase } from '../format.js';
import { heading, metricCard, note, numberField } from '../form.js';
import { api } from '../services.js';
import { actionButton, badge, kvTable } from './common.js';
export function quantumPanel(store) {
    const results = h('div', {});
    const dual = h('div', {});
    const scan = new LineChart(180);
    const scanNote = note('');
    let built = '';
    const state = () => store.quantum;
    const stamp = () => JSON.stringify(store.quantum);
    const compute = debounce(() => { void run(); }, 300);
    const run = async () => {
        try {
            const r = await api.quantum(store.quantum);
            const physical = String(r.physical_state ?? '').startsWith('valid');
            const cards = [
                metricCard('Mass²', num(r.mass_squared), r.tachyonic ? 'bad' : '', String(r.mass_unit ?? '')), metricCard('Left level N_L', String(r.level_left)), metricCard('Right level N_R', String(r.level_right)),
                metricCard('Level matching', r.level_matching ? 'satisfied' : 'violated', r.level_matching ? 'good' : 'bad'), metricCard('State', physical ? 'valid' : titleCase(String(r.physical_state)), physical ? 'good' : 'warn'),
            ];
            if (r.compact)
                cards.push(metricCard('p_L, p_R', `${num(r.p_left, 4)}, ${num(r.p_right, 4)}`));
            results.replaceChildren(h('div', { class: 'metrics' }, cards), ...(r.tachyonic ? [note('Tachyonic: the mass² is negative.')] : []), note(String(r.description ?? '')));
        }
        catch (e) {
            results.replaceChildren(h('div', { class: 'notice err' }, e instanceof Error ? e.message : String(e)));
        }
    };
    const oscillators = (side) => {
        const list = state()[side] ?? (state()[side] = []);
        return h('div', { class: 'osc' }, h('h4', { text: side === 'left' ? 'Left movers' : 'Right movers' }), ...list.map((o, i) => h('div', { class: 'field-row three osc-row' }, numberField({ label: 'Mode', value: o.mode, min: 1, max: 64, integer: true, onCommit: (v) => { o.mode = v; changed(); } }).el, numberField({ label: 'Axis', value: o.axis, min: 1, max: 24, integer: true, onCommit: (v) => { o.axis = v; changed(); } }).el, numberField({ label: 'Occupation', value: o.occupation, min: 0, max: 20, integer: true, onCommit: (v) => { o.occupation = v; changed(); } }).el, h('button', { class: 'btn small ghost', type: 'button', attrs: { 'aria-label': `Remove ${side} oscillator ${i + 1}` }, on: { click: () => { list.splice(i, 1); changed(true); } } }, 'Remove'))), h('button', { class: 'btn small', type: 'button', on: { click: () => { list.push({ mode: 1, occupation: 1, axis: 1 }); changed(true); } } }, 'Add oscillator'));
    };
    const form = h('div', {});
    const build = () => {
        built = stamp();
        const q = state();
        form.replaceChildren(h('div', { class: 'field-row three' }, numberField({ label: 'Radius R', value: Number(q.radius ?? 1), min: 0.05, max: 50, step: 0.1, onCommit: (v) => { q.radius = v; changed(); } }).el, numberField({ label: 'Momentum n', value: Number(q.momentum ?? 0), integer: true, min: -20, max: 20, onCommit: (v) => { q.momentum = v; changed(); } }).el, numberField({ label: 'Winding w', value: Number(q.winding ?? 0), integer: true, min: -20, max: 20, onCommit: (v) => { q.winding = v; changed(); } }).el), h('div', { class: 'two-col' }, oscillators('left'), oscillators('right')));
    };
    const changed = (rebuild = false) => { if (rebuild)
        build(); built = stamp(); compute(); dual.replaceChildren(); void radiusScan(); };
    const radiusScan = async () => {
        const q = state();
        const base = Number(q.radius ?? 1), alpha = Number(q.alpha_prime ?? 1), self = Math.sqrt(alpha);
        const radii = Array.from({ length: 28 }, (_, k) => self * 0.3 * (10 ** (k / 27))); // 0.3√α′ … 3√α′, evenly in log R
        try {
            const rows = await Promise.all(radii.map((R) => api.quantum({ ...q, radius: R })));
            scan.set([{ name: 'M²', points: rows.map((r, k) => [radii[k], Number(r.mass_squared)]) }], { xLabel: 'R', yLabel: 'mass²', cursor: base });
            scan.onPick = (x) => { q.radius = Number(x.toPrecision(4)); build(); changed(); };
            scanNote.textContent = `Mass² of this state as the radius varies (momentum ${q.momentum}, winding ${q.winding}). T-duality exchanges R ↔ α′/R together with n ↔ w; the self-dual radius is √α′ = ${num(self, 4)}. Click to set R.`;
        }
        catch {
            scanNote.textContent = '';
        }
    };
    const tdual = async () => {
        const d = await api.tdual(store.quantum);
        const next = d.dual_configuration;
        dual.replaceChildren(h('h4', { text: 'T-dual description' }), kvTable([
            ['Dual radius R′ = α′/R', num(next.radius, 6)], ['Dual momentum n′ = w', String(next.momentum)], ['Dual winding w′ = n', String(next.winding)],
            ['Mass² difference', num(d.mass_squared_difference, 3)], ['p_R reflection error', num(d.p_right_reflection_error, 3)], ['Level matching preserved', d.level_matching_preserved ? 'yes' : 'no']
        ]), h('p', {}, badge(d.valid ? '✓ spectrum invariant' : '✗ spectrum changed', d.valid ? 'ok' : 'bad')), h('button', { class: 'btn small', type: 'button', on: { click: () => { store.quantum = structuredClone(next); build(); changed(); } } }, 'Use the dual parameters'));
    };
    build();
    void run();
    void radiusScan();
    const el = h('div', {}, heading('Critical bosonic oscillator spectrum (independent of the classical geometry)'), form, results, h('div', { class: 'row' }, actionButton('T-dualise', tdual)), dual, scan.el, scanNote, note('Finite Fock-state levels in D = 26 with a compact direction. It does not animate a wavefunction, implement BRST cohomology, or prove that corresponding particles exist.'));
    return { el, refresh(reason) { if (reason === 'meta' && stamp() !== built) {
            build();
            void run();
            void radiusScan();
        } } };
}
//# sourceMappingURL=quantum.js.map