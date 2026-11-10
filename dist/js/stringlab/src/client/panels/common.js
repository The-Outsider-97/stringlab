/** Pieces shared by the lower panels. */
import { copyText, glyph, h, toast } from '../kit.js';
import { errorText } from '../store.js';
import { num } from '../format.js';
/** A button that runs an async action, shows that it is working, and reports a failure next to itself instead of in a console. */
export function actionButton(label, run, options = {}) {
    const button = h('button', { class: `btn small${options.kind === 'primary' ? ' primary' : ''}`, type: 'button', title: options.title,
        on: { click: () => {
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
                run().catch((e) => toast(errorText(e), { kind: 'error' })).finally(() => { button.disabled = false; button.removeAttribute('aria-busy'); });
            } } }, options.icon ? glyph(options.icon) : null, label);
    return button;
}
export function kvTable(rows, className = 'kv') {
    return h('dl', { class: className }, rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
}
export const badge = (text, tone = 'plain') => h('span', { class: `badge ${tone === 'ok' ? 'tone-green' : tone === 'warn' ? 'tone-amber' : tone === 'bad' ? 'err' : 'plain'}`, text });
export const verdict = (passed, yes = 'passed', no = 'failed') => badge(passed ? `✓ ${yes}` : `✗ ${no}`, passed ? 'ok' : 'bad');
export function jsonBlock(value) {
    const text = JSON.stringify(value, null, 2);
    return h('div', { class: 'json' }, h('button', { class: 'btn small ghost', type: 'button', on: { click: () => { void copyText(text).then((ok) => toast(ok ? 'Copied.' : 'Copy failed.')); } } }, glyph('copy'), 'Copy'), h('pre', { class: 'result', text }));
}
/** A table of the scalar entries of an object: numbers formatted, booleans as ticks, nested values summarised. */
export function scalarTable(data, skip = []) {
    const rows = Object.entries(data).filter(([k]) => !skip.includes(k)).map(([k, v]) => [k.replaceAll('_', ' '),
        typeof v === 'number' ? num(v, 6) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'string' ? v : Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : v && typeof v === 'object' ? '…' : '—']);
    return kvTable(rows);
}
//# sourceMappingURL=common.js.map