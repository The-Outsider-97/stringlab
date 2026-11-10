import { h } from '../kit.js';
import { num } from '../format.js';
import { heading, note } from '../form.js';
import { api } from '../services.js';
import { actionButton, kvTable, scalarTable } from './common.js';
const EQUATIONS = [
    ['Metric', 'Δs² = −2 ΔX⁺ΔX⁻ + Σᵢ (ΔYᵢ)²'],
    ['Light-cone gauge', 'X⁺ = p⁺ τ   (p⁺ > 0)'],
    ['Transverse wave equation', '∂²τ Yᵢ − ∂²σ Yᵢ = 0'],
    ['Virasoro constraint', '∂σ X⁻ = (∂τY · ∂σY) / p⁺'],
    ['Virasoro constraint', '∂τ X⁻ = (|∂τY|² + |∂σY|²) / (2p⁺)'],
    ['Closed-string closure', '∮ dσ (∂τY · ∂σY) = 0'],
    ['Tension', 'T = 1 / (2πα′),   ħ = c = 1'],
];
export function mathPanel(store) {
    const live = h('div', {});
    const actions = h('div', {});
    const el = h('div', {}, heading('Equations and physical-state restrictions'), h('div', { class: 'equations' }, EQUATIONS.map(([name, eq]) => h('div', { class: 'eq' }, h('small', { text: name }), h('code', { text: eq })))), h('div', { class: 'card flat' }, h('h4', { text: 'This experiment' }), live), h('div', { class: 'row' }, actionButton('Integrate both on-shell actions', async () => {
        const result = await api.actions(store.config, 40);
        actions.replaceChildren(h('h4', { text: 'On-shell actions by numerical quadrature' }), scalarTable(result, ['references', 'scientific_scope']), note(String(result.scientific_scope ?? '')), note(`References: ${result.references?.join(', ') ?? ''}`));
    }, { icon: 'refresh' })), actions, note('Sources: Tong (2009) §§1.2–1.4; Wray (2011) ch. 2–3. A free-wave solution alone is not automatically a physical string state: the constraints and level matching above decide that.'));
    const render = () => {
        const c = store.config, f = store.frame, d = f?.diagnostics ?? {};
        live.replaceChildren(kvTable([
            ['Boundary', c.bc], ['Dimension D', String(c.dimensions)], ['Tension T', num(1 / (2 * Math.PI * c.alpha_prime), 6)],
            ['Level-matching residual', f ? num(d.level_matching_residual) : 'not evaluated'],
            ['Nambu–Goto on-shell ∫dσ', num(d.ng_on_shell_density_integral_sigma)], ['Polyakov on-shell ∫dσ', num(d.polyakov_on_shell_density_integral_sigma)],
            ['Difference', num(d.on_shell_action_density_difference)],
        ]), note('The two on-shell integrands agree in conformal light-cone gauge; they are restrictions of one solution, not two independent solvers.'));
        if (store.source.kind === 'dynamics')
            live.append(note(`The active run is the ${store.source.label} nonlinear solver; its equations and diagnostics are in the Dynamics tab.`));
    };
    render();
    return { el, refresh(reason) { if (reason !== 'tick')
            render(); } };
}
//# sourceMappingURL=math.js.map