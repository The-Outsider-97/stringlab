import { h } from '../kit.js';
import { heading, note, selectField } from '../form.js';
import { api } from '../services.js';
import { actionButton, jsonBlock, scalarTable } from './common.js';
const MODELS = [
    ['rns', 'Open RNS superstring spectrum', { sector: 'NS', dimensions: 10, alpha_prime: 1, oscillators: [{ field: 'fermion', mode: 0, axis: 1, occupation: 1 }] }],
    ['rns-closed', 'Closed RNS spectrum and level matching', { left_sector: 'NS', right_sector: 'NS', dimensions: 10, left: [{ field: 'fermion', mode: 0, axis: 1, occupation: 1 }], right: [{ field: 'fermion', mode: 0, axis: 1, occupation: 1 }] }],
    ['cft', 'CFT: Virasoro central anomaly', { theory: 'bosonic', dimensions: 26, m: 2, n: -2 }],
    ['cft-correlator', 'CFT: free-boson vertex correlator', { alpha_prime: 1, momenta: [[1], [-1]], positions: [[0, 0], [2, 0]] }],
    ['cft-character', 'CFT: oscillator character', { dimensions: 2, max_level: 12 }],
    ['brst', 'BRST anomaly and intercept conditions', { theory: 'bosonic', dimensions: 26, intercept: 1, mode: 2 }],
    ['dbrane', 'Flat static Dp-brane (DBI)', { p: 2, dimensions: 10, alpha_prime: 1, tension: 1 }],
    ['dbrane-affine', 'Affine moving Dp-brane (DBI)', { p: 2, dimensions: 10, velocity: [0, 0, 0.2, 0, 0, 0, 0, 0, 0] }],
    ['dbrane-trajectory', 'Homogeneous moving Dp trajectory', { p: 2, dimensions: 10, velocity: [0, 0, 0.2, 0, 0, 0, 0, 0, 0], frames: 12, duration: 3 }],
    ['calabi-yau', 'Calabi–Yau algebraic example', { example: 'fermat_quintic', complex_coordinates: [[1, 0], [-1, 0], [0, 0], [0, 0], [0, 0]] }],
    ['cy-torus', 'Flat torus shortest geodesic', { radius: 1, start: [0, 0, 0, 0, 0, 0], end: [6.28, 0, 0, 0, 0, 0], wave_numbers: [1, 0, 0, 0, 0, 0] }],
    ['cy-quintic-metric', 'Quintic projective tangent metric', { complex_coordinates: [[1, 0], [-1, 0], [0, 0], [0, 0], [0, 0]] }],
];
export function advancedPanel(_store) {
    let key = 'rns';
    const input = h('textarea', { class: 'code', rows: 8, spellcheck: false, attrs: { 'aria-label': 'Model input (JSON)' } });
    const out = h('div', {});
    const load = () => { input.value = JSON.stringify(MODELS.find((m) => m[0] === key)[2], null, 2); };
    const choose = selectField('Calculation', MODELS.map(([k, label]) => [k, label]), key, (v) => { key = v; load(); out.replaceChildren(); });
    load();
    const run = actionButton('Compute', async () => {
        let body;
        try {
            body = JSON.parse(input.value);
        }
        catch (e) {
            out.replaceChildren(h('div', { class: 'notice err' }, `The input is not valid JSON: ${e instanceof Error ? e.message : String(e)}`));
            return;
        }
        const result = await api.advanced(key, body);
        out.replaceChildren(scalarTable(result), jsonBlock(result));
    }, { kind: 'primary', icon: 'check' });
    return { el: h('div', {}, heading('Finite theoretical calculations (clearly bounded models)'), note('Validated exact or reduced calculations: free RNS spectra, free CFT correlators, finite Fock characters, BRST prerequisite checks, affine Dp DBI and special Calabi–Yau geometries. Full interacting QFT, BRST cohomology and general Ricci-flat metric solvers are out of scope.'), choose.el, input, h('div', { class: 'row' }, run), out) };
}
//# sourceMappingURL=advanced.js.map