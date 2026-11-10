import { LineChart } from '../charts.js';
import { h } from '../kit.js';
import { numberField, heading, note, selectField } from '../form.js';
import { actionButton, jsonBlock } from './common.js';
const MODELS = [['polyakov', 'Covariant Polyakov · flat or FRW'], ['nambu_goto', 'Nonlinear Nambu–Goto · static gauge'], ['dbi_d1', 'D1 scalar DBI wave · prescribed electric field']];
export function dynamicsPanel(store) {
    const form = { model: 'polyakov', kind: 'closed', points: 96, frames: 80, duration: 4, amplitude: 0.4, hubble: 0, electric: 0 };
    const chart = new LineChart(170);
    const chartHead = h('h4', {});
    const caption = note('');
    const out = h('div', {});
    const drawChart = () => {
        const s = store.source;
        chart.el.hidden = chartHead.hidden = caption.hidden = s.kind !== 'dynamics';
        if (s.kind !== 'dynamics')
            return;
        const key = s.model === 'polyakov' ? 'constraint_tautau_rms' : 'relative_energy_drift';
        chartHead.textContent = s.model === 'polyakov' ? 'Virasoro constraint residual over time' : 'Energy change relative to the start';
        chart.set([{ name: key, points: store.frames.map((f) => [f.time, Number(f.diagnostics[key]) || 0]) }], { xLabel: 'τ', yLabel: key.replaceAll('_', ' '), cursor: store.position });
        chart.onPick = (x) => store.seekTo(x);
        caption.textContent = s.model === 'polyakov' ? 'RMS residual normalised by the local worldsheet scale. A small value does not prove the constraints are preserved exactly.'
            : 'With FRW expansion the background depends on time and energy is not conserved: this is the change relative to the initial energy, not necessarily an integration error.';
    };
    const evolve = actionButton('Evolve nonlinear PDE', async () => {
        const payload = { ...form, alpha_prime: store.config.alpha_prime };
        if (form.model === 'polyakov')
            payload.dimensions = Math.min(store.config.dimensions, 8);
        await store.runDynamics(payload);
        const f = store.frames;
        out.replaceChildren(jsonBlock({ solver: form.model, frames: f.length, initial: f[0]?.diagnostics, final: f[f.length - 1]?.diagnostics, assumptions: f[0]?.model_assumptions }));
        drawChart();
    }, { kind: 'primary', icon: 'play' });
    const num = (label, key, min, max, step, integer = false) => numberField({ label, value: form[key], min, max, step, integer, onCommit: (v) => { form[key] = v; } }).el;
    const el = h('div', {}, heading('Numerical worldsheet dynamics (independently evolved embeddings)'), note('Polyakov evolves every X^μ with the target-space Christoffel connection in conformal worldsheet gauge (flat or exponential FRW). Nambu–Goto evolves a nonlinear Hamiltonian in flat or FRW static gauge. D1 scalar DBI adds a fixed electric background; the gauge-field equations are not solved. Constraints and energy errors are reported, never projected away.'), h('div', { class: 'field-row' }, selectField('Model', MODELS, form.model, (v) => { form.model = v; }).el, selectField('Endpoints', [['closed', 'Closed, winding one'], ['open', 'Open']], form.kind, (v) => { form.kind = v; }).el), h('div', { class: 'field-row three' }, num('Points', 'points', 32, 512, 16, true), num('Frames', 'frames', 2, 160, 10, true), num('Duration τ', 'duration', 0.02, 20, 0.2), num('Amplitude', 'amplitude', 0, 2, 0.1), num('FRW H', 'hubble', -0.2, 0.2, 0.01), num('Electric 2πα′F₀₁', 'electric', -0.8, 0.8, 0.05)), h('div', { class: 'row' }, evolve, h('button', { class: 'btn small', type: 'button', on: { click: () => store.backToSolver() } }, 'Back to the Fourier experiment')), chartHead, chart.el, caption, out, note('Playback interpolates stored states for display only. It never substitutes interpolation for integration.'));
    drawChart();
    return { el, refresh(reason) { if (reason === 'tick') {
            if (store.source.kind === 'dynamics')
                chart.setCursor(store.position);
        }
        else
            drawChart(); } };
}
//# sourceMappingURL=dynamics.js.map