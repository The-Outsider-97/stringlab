/** A small interactive line chart on a canvas, coloured by the interface tokens. Hover reads a value, click picks an x (the panels use it to seek in time
 *  or to apply a swept parameter), and a vertical cursor follows the playback position. */
import { h, clamp } from './kit.js';
import { cssColour, tokenColour } from './colours.js';
import { num } from './format.js';
import { niceStep } from './scene.js';
const TONES = ['string', 'axis1', 'probe', 'axis0', 'axis2'];
const LEFT = 58, RIGHT = 14, TOP = 12, BOTTOM = 34;
export class LineChart {
    el;
    onPick = null;
    canvas = h('canvas', { class: 'chart', tabindex: 0 });
    legend = h('div', { class: 'chips legend' });
    readout = h('p', { class: 'muted chart-readout', attrs: { role: 'status', 'aria-live': 'off' } });
    series = [];
    options = {};
    hoverX = null;
    box = { w: 300, h: 180, dpr: 1 };
    range = { x0: 0, x1: 1, y0: 0, y1: 1 };
    constructor(height = 190) {
        this.canvas.style.setProperty('height', `${height}px`);
        this.el = h('div', { class: 'chart-wrap' }, this.legend, this.canvas, this.readout);
        new ResizeObserver(() => this.draw()).observe(this.canvas);
        this.canvas.addEventListener('pointermove', (e) => { this.hoverX = this.toX(e); this.draw(); this.read(); });
        this.canvas.addEventListener('pointerleave', () => { this.hoverX = null; this.draw(); this.readout.textContent = ''; });
        this.canvas.addEventListener('click', (e) => { const x = this.toX(e); const p = this.nearest(x); if (p && this.onPick)
            this.onPick(p.x, p.y, p.series); });
        this.canvas.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')
                return;
            e.preventDefault();
            const base = this.hoverX ?? this.options.cursor ?? this.range.x0;
            const step = (this.range.x1 - this.range.x0) / 60;
            this.hoverX = clamp(base + (e.key === 'ArrowRight' ? step : -step), this.range.x0, this.range.x1);
            this.draw();
            this.read();
        });
        this.canvas.addEventListener('keyup', (e) => { if (e.key === 'Enter' && this.hoverX !== null) {
            const p = this.nearest(this.hoverX);
            if (p && this.onPick)
                this.onPick(p.x, p.y, p.series);
        } });
    }
    set(series, options = {}) {
        this.series = series.map((s) => ({ ...s, points: s.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (!options.logY || y > 0)) }));
        this.options = options;
        this.legend.replaceChildren(...(series.length > 1 ? series.map((s, i) => h('span', { class: 'chip static' }, h('i', { class: `swatch-dot tone-${i % TONES.length}` }), s.name)) : []));
        this.canvas.setAttribute('role', 'img');
        this.canvas.setAttribute('aria-label', options.summary ?? `${series.map((s) => s.name).join(', ')} ${options.yLabel ? `(${options.yLabel}) ` : ''}against ${options.xLabel ?? 'x'}. Arrow keys read values, Enter picks.`);
        this.draw();
    }
    setCursor(x) { if (this.options.cursor !== x) {
        this.options = { ...this.options, cursor: x };
        this.draw();
    } }
    toX(e) {
        const r = this.canvas.getBoundingClientRect();
        return this.range.x0 + clamp((e.clientX - r.left - LEFT) / Math.max(1, r.width - LEFT - RIGHT), 0, 1) * (this.range.x1 - this.range.x0);
    }
    nearest(x) {
        let best = null, d = Infinity;
        this.series.forEach((s, si) => { for (const [px, py] of s.points) {
            const dd = Math.abs(px - x);
            if (dd < d) {
                d = dd;
                best = { x: px, y: py, series: si };
            }
        } });
        return best;
    }
    read() {
        const p = this.hoverX === null ? null : this.nearest(this.hoverX);
        this.readout.textContent = p ? `${this.options.xLabel ?? 'x'} ${num(p.x, 4)} · ${this.series.length > 1 ? `${this.series[p.series]?.name} ` : ''}${num(p.y, 5)}` : '';
    }
    draw() {
        const box = this.canvas.getBoundingClientRect();
        const w = Math.max(40, Math.floor(box.width)), hh = Math.max(40, Math.floor(box.height));
        if (box.width === 0)
            return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.box = { w, h: hh, dpr };
        if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(hh * dpr)) {
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(hh * dpr);
        }
        const c = this.canvas.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, hh);
        const text = tokenColour('text'), muted = tokenColour('muted'), grid = tokenColour('grid');
        const all = this.series.flatMap((s) => s.points);
        if (!all.length) {
            c.fillStyle = cssColour(muted);
            c.font = '12px system-ui, sans-serif';
            c.fillText('No data to plot.', LEFT, hh / 2);
            return;
        }
        const log = !!this.options.logY;
        const tr = (y) => (log ? Math.log10(y) : y);
        let x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
        let y0 = Math.min(...all.map((p) => tr(p[1]))), y1 = Math.max(...all.map((p) => tr(p[1])));
        if (x1 - x0 < 1e-12) {
            x0 -= 0.5;
            x1 += 0.5;
        }
        if (log) {
            y0 = Math.floor(y0);
            y1 = Math.ceil(y1);
            if (y1 === y0)
                y1 += 1;
        }
        else {
            const pad = (y1 - y0) < 1e-12 ? Math.max(Math.abs(y1) * 0.05, 1e-9) : (y1 - y0) * 0.08;
            y0 -= pad;
            y1 += pad;
        }
        this.range = { x0, x1, y0, y1 };
        const px = (x) => LEFT + ((x - x0) / (x1 - x0)) * (w - LEFT - RIGHT);
        const py = (y) => TOP + (1 - (tr(y) - y0) / (y1 - y0)) * (hh - TOP - BOTTOM);
        c.font = '11px ui-monospace, Menlo, Consolas, monospace';
        c.textBaseline = 'middle';
        // y grid and labels
        const yStep = log ? 1 : niceStep((y1 - y0) / 4);
        for (let v = Math.ceil(y0 / yStep) * yStep; v <= y1 + 1e-12; v += yStep) {
            const yy = TOP + (1 - (v - y0) / (y1 - y0)) * (hh - TOP - BOTTOM);
            c.strokeStyle = cssColour(grid, 0.5);
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(LEFT, yy);
            c.lineTo(w - RIGHT, yy);
            c.stroke();
            c.fillStyle = cssColour(muted);
            c.textAlign = 'right';
            c.fillText(log ? `1e${Math.round(v)}` : num(v, 3), LEFT - 6, yy);
        }
        const xStep = niceStep((x1 - x0) / 5);
        c.textAlign = 'center';
        c.textBaseline = 'top';
        for (let v = Math.ceil(x0 / xStep) * xStep; v <= x1 + 1e-12; v += xStep) {
            const xx = px(v);
            c.strokeStyle = cssColour(grid, 0.35);
            c.beginPath();
            c.moveTo(xx, TOP);
            c.lineTo(xx, hh - BOTTOM);
            c.stroke();
            c.fillStyle = cssColour(muted);
            c.fillText(num(v, 3), xx, hh - BOTTOM + 5);
        }
        c.strokeStyle = cssColour(muted, 0.8);
        c.beginPath();
        c.moveTo(LEFT, TOP);
        c.lineTo(LEFT, hh - BOTTOM);
        c.lineTo(w - RIGHT, hh - BOTTOM);
        c.stroke();
        c.fillStyle = cssColour(muted);
        c.textAlign = 'right';
        c.textBaseline = 'bottom';
        if (this.options.xLabel)
            c.fillText(this.options.xLabel, w - RIGHT, hh - 1);
        if (this.options.yLabel) {
            c.textAlign = 'left';
            c.textBaseline = 'top';
            c.fillText(this.options.yLabel, LEFT + 6, TOP);
        }
        this.series.forEach((s, si) => {
            const colour = tokenColour(TONES[si % TONES.length]);
            if (!s.points.length)
                return;
            if (this.options.fill && si === 0) {
                c.fillStyle = cssColour(colour, 0.14);
                c.beginPath();
                c.moveTo(px(s.points[0][0]), hh - BOTTOM);
                for (const [x, y] of s.points)
                    c.lineTo(px(x), py(y));
                c.lineTo(px(s.points[s.points.length - 1][0]), hh - BOTTOM);
                c.closePath();
                c.fill();
            }
            c.strokeStyle = cssColour(colour);
            c.lineWidth = 2;
            c.lineJoin = 'round';
            c.beginPath();
            s.points.forEach(([x, y], k) => (k ? c.lineTo(px(x), py(y)) : c.moveTo(px(x), py(y))));
            c.stroke();
            if (s.points.length <= 48) {
                c.fillStyle = cssColour(colour);
                for (const [x, y] of s.points) {
                    c.beginPath();
                    c.arc(px(x), py(y), 3, 0, Math.PI * 2);
                    c.fill();
                }
            }
        });
        const cursor = this.options.cursor;
        if (cursor !== null && cursor !== undefined && cursor >= x0 && cursor <= x1) {
            c.strokeStyle = cssColour(tokenColour('probe'), 0.9);
            c.lineWidth = 1.5;
            c.setLineDash([4, 3]);
            c.beginPath();
            c.moveTo(px(cursor), TOP);
            c.lineTo(px(cursor), hh - BOTTOM);
            c.stroke();
            c.setLineDash([]);
        }
        if (this.hoverX !== null) {
            const p = this.nearest(this.hoverX);
            if (p) {
                c.strokeStyle = cssColour(text, 0.5);
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(px(p.x), TOP);
                c.lineTo(px(p.x), hh - BOTTOM);
                c.stroke();
                c.fillStyle = cssColour(tokenColour(TONES[p.series % TONES.length]));
                c.beginPath();
                c.arc(px(p.x), py(p.y), 4.5, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = cssColour(text);
                c.lineWidth = 1.5;
                c.stroke();
            }
        }
    }
}
//# sourceMappingURL=charts.js.map