/** Interface colours for canvases. A canvas cannot use ``var(--accent)`` or ``light-dark()``, so each colour token is read once from a hidden element whose
 *  CSS ``color`` is that token (styles.css, ``.vp-tok-*``); every theme, including high contrast, therefore restyles the charts and the viewport. */
import { h } from './kit.js';
import { parseCssColour } from './scene.js';
let host = null;
const cache = new Map();
export function tokenColour(name, fallback = [0.5, 0.5, 0.5, 1]) {
    if (!host || !host.isConnected) {
        host = h('div', { class: 'vp-tokens', attrs: { 'aria-hidden': 'true' } });
        document.body.append(host);
        cache.clear();
    }
    let el = cache.get(name);
    if (!el) {
        el = h('span', { class: `vp-tok vp-tok-${name}` });
        host.append(el);
        cache.set(name, el);
    }
    return parseCssColour(getComputedStyle(el).color) ?? fallback;
}
export function cssColour(c, alpha = c[3]) {
    return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
}
//# sourceMappingURL=colours.js.map