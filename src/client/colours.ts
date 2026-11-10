/** Interface colours for canvases. A canvas cannot use ``var(--accent)`` or ``light-dark()``, so each colour token is read once from a hidden element whose
 *  CSS ``color`` is that token (styles.css, ``.vp-tok-*``); every theme, including high contrast, therefore restyles the charts and the viewport. */
import { h } from './kit.js';
import { parseCssColour, type RGBA } from './scene.js';

export type Token = 'string' | 'halo' | 'text' | 'muted' | 'grid' | 'grid-major' | 'axis0' | 'axis1' | 'axis2' | 'sheet' | 'native' | 'probe' | 'background' | 'ok' | 'bad' | 'surface';

let host: HTMLElement | null = null;
const cache = new Map<Token, HTMLElement>();

export function tokenColour(name: Token, fallback: RGBA = [0.5, 0.5, 0.5, 1]): RGBA {
  if (!host || !host.isConnected) { host = h('div', { class: 'vp-tokens', attrs: { 'aria-hidden': 'true' } }); document.body.append(host); cache.clear(); }
  let el = cache.get(name);
  if (!el) { el = h('span', { class: `vp-tok vp-tok-${name}` }); host.append(el); cache.set(name, el); }
  return parseCssColour(getComputedStyle(el).color) ?? fallback;
}

export function cssColour(c: RGBA, alpha = c[3]): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
}
