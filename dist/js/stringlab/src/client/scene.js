import { beadIndices, history } from './geometry.js';
/** Floats per instance: p0(3) p1(3) c0(4) c1(4) width(1) tau(1). ``tau`` is the model time a primitive appears at (-Infinity: always). */
export const SEG_FLOATS = 16;
/** Floats per point: position(3) colour(4) size(1). */
export const PT_FLOATS = 8;
/** Floats per triangle vertex: position(3) normal(3) colour(4) tau(1). */
export const TRI_FLOATS = 11;
export const ALWAYS = -1e30;
/** Blue to red through green and amber: readable on light and dark backgrounds, and in the usual colour-vision deficiencies (it varies in lightness too). */
export const RAMP = ['#2c6fbb', '#3aa6c5', '#5cc490', '#c9d65a', '#f2a93b', '#e5593f'].map((value) => hex(value));
export function hex(value, alpha = 1) {
    const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
    if (!m)
        return [0.3, 0.7, 0.9, alpha];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}
/** Computed value of a CSS colour (``rgb()``, ``rgba()`` or ``color(srgb …)``) as 0..1 floats. */
export function parseCssColour(text) {
    const m = /^(?:rgba?|color\(srgb)\(?\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(text.trim());
    if (!m)
        return null;
    const srgb = text.trim().startsWith('color(');
    const k = srgb ? 1 : 1 / 255;
    return [Number(m[1]) * k, Number(m[2]) * k, Number(m[3]) * k, m[4] !== undefined ? Number(m[4]) : 1];
}
export function ramp(t, alpha = 1, stops = RAMP) {
    const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x)), u = x - i;
    const a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, alpha];
}
export const withAlpha = (c, alpha) => [c[0], c[1], c[2], alpha];
class Builder {
    segs = new Float32Array(SEG_FLOATS * 256);
    nSeg = 0;
    pts = new Float32Array(PT_FLOATS * 64);
    nPt = 0;
    tris = new Float32Array(TRI_FLOATS * 3 * 256);
    nTri = 0;
    labels = [];
    seg(a, b, ca, cb, width, tau = ALWAYS) {
        if (this.nSeg * SEG_FLOATS + SEG_FLOATS > this.segs.length) {
            const next = new Float32Array(this.segs.length * 2);
            next.set(this.segs);
            this.segs = next;
        }
        this.segs.set([a[0], a[1], a[2], b[0], b[1], b[2], ca[0], ca[1], ca[2], ca[3], cb[0], cb[1], cb[2], cb[3], width, tau], this.nSeg * SEG_FLOATS);
        this.nSeg += 1;
    }
    point(p, c, size) {
        if (this.nPt * PT_FLOATS + PT_FLOATS > this.pts.length) {
            const next = new Float32Array(this.pts.length * 2);
            next.set(this.pts);
            this.pts = next;
        }
        this.pts.set([p[0], p[1], p[2], c[0], c[1], c[2], c[3], size], this.nPt * PT_FLOATS);
        this.nPt += 1;
    }
    tri(a, b, c, ca, cb, cc, ta, tb, tc) {
        if (this.nTri * 3 * TRI_FLOATS + 3 * TRI_FLOATS > this.tris.length) {
            const next = new Float32Array(this.tris.length * 2);
            next.set(this.tris);
            this.tris = next;
        }
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        let o = this.nTri * 3 * TRI_FLOATS;
        for (const [p, col, tau] of [[a, ca, ta], [b, cb, tb], [c, cc, tc]]) {
            this.tris.set([p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], col[3], tau], o);
            o += TRI_FLOATS;
        }
        this.nTri += 1;
    }
    done() {
        return { segs: this.segs.subarray(0, this.nSeg * SEG_FLOATS), nSeg: this.nSeg, pts: this.pts.subarray(0, this.nPt * PT_FLOATS), nPt: this.nPt,
            tris: this.tris.subarray(0, this.nTri * 3 * TRI_FLOATS), nTri: this.nTri, labels: this.labels };
    }
}
/** 1, 2 or 5 times a power of ten at least ``raw``: grid lines at round values. */
export function niceStep(raw) {
    if (!(raw > 0) || !Number.isFinite(raw))
        return 1;
    const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
export function formatTick(value) {
    if (Math.abs(value) < 1e-9)
        return '0';
    const abs = Math.abs(value);
    return abs >= 1e4 || abs < 1e-3 ? value.toExponential(0) : String(Number(value.toPrecision(3)));
}
const MAX_SHEET_ROWS = 96, MAX_SHEET_FRAMES = 56, MAX_RIBS = 24;
export function buildStatic(input) {
    const b = new Builder();
    const { bounds, palette } = input;
    if (bounds) {
        if (input.grid)
            grid(b, bounds, palette);
        if (input.axes)
            axes(b, bounds, palette, input.projection);
        if (input.worldsheet && input.frames.length > 1)
            sheet(b, input.frames, palette);
    }
    if (input.native)
        native(b, input.native, palette);
    return b.done();
}
function grid(b, bounds, palette) {
    const step = niceStep((bounds.radius * 2.6) / 10);
    const half = Math.min(20, Math.max(2, Math.ceil((bounds.radius * 1.1) / step))) * step;
    const z = bounds.lo[2] - bounds.radius * 0.04;
    const cx = Math.round(bounds.center[0] / step) * step, cy = Math.round(bounds.center[1] / step) * step;
    for (let k = -half; k <= half + step * 1e-6; k += step) {
        const major = Math.abs(Math.round(k / step)) % 5 === 0;
        const colour = major ? palette.gridMajor : palette.grid;
        b.seg([cx - half, cy + k, z], [cx + half, cy + k, z], colour, colour, 1);
        b.seg([cx + k, cy - half, z], [cx + k, cy + half, z], colour, colour, 1);
    }
    for (let k = -half; k <= half + step * 1e-6; k += step * 2) {
        if (Math.abs(k) < 1e-9)
            continue;
        b.labels.push({ at: [cx + k, cy - half, z], text: formatTick(cx + k), tone: 'tick' });
    }
}
function axes(b, bounds, palette, projection) {
    const origin = [bounds.lo[0], bounds.lo[1], bounds.lo[2] - bounds.radius * 0.04];
    const length = Math.max(bounds.radius * 0.6, 1e-3);
    const ends = [[origin[0] + length, origin[1], origin[2]], [origin[0], origin[1] + length, origin[2]], [origin[0], origin[1], origin[2] + length]];
    ends.forEach((end, i) => {
        const colour = palette.axes[i];
        b.seg(origin, end, colour, colour, 2.4);
        b.point(end, colour, 7);
        b.labels.push({ at: end, text: projection[i] ?? 'XYZ'[i], tone: ['axis0', 'axis1', 'axis2'][i] });
    });
}
/** The worldsheet X(τ, σ): translucent triangles between stored frames, σ-curves (one per drawn frame) and τ-ribs (one per drawn point). */
function sheet(b, frames, palette) {
    const first = frames[0], last = frames[frames.length - 1];
    const rows = first.geometry.length, closed = first.closed;
    const t0 = first.time, span = Math.max(1e-12, last.time - t0);
    const rowStep = Math.max(1, Math.ceil(rows / MAX_SHEET_ROWS)), frameStep = Math.max(1, Math.ceil(frames.length / MAX_SHEET_FRAMES));
    const picked = [];
    for (let f = 0; f < frames.length; f += frameStep)
        picked.push(f);
    if (picked[picked.length - 1] !== frames.length - 1)
        picked.push(frames.length - 1);
    const rowList = [];
    for (let r = 0; r < rows; r += rowStep)
        rowList.push(r);
    if (!closed && rowList[rowList.length - 1] !== rows - 1)
        rowList.push(rows - 1);
    const at = (f, r) => { const g = frames[f].geometry[r % rows]; return [g[0], g[1], g[2]]; };
    const col = (f, alpha) => ramp((frames[f].time - t0) / span, alpha);
    const rowPairs = rowList.map((r, k) => [r, rowList[k + 1] ?? (closed ? rowList[0] : r)]).filter(([a, c]) => a !== c || closed);
    for (let k = 0; k + 1 < picked.length; k++) {
        const fa = picked[k], fb = picked[k + 1];
        if (frames[fa].geometry.length !== rows || frames[fb].geometry.length !== rows)
            continue;
        const ta = frames[fa].time, tb = frames[fb].time;
        const ca = col(fa, 0.2), cb = col(fb, 0.2);
        for (const [r0, r1] of rowPairs) {
            b.tri(at(fa, r0), at(fb, r0), at(fb, r1), ca, cb, cb, ta, tb, tb);
            b.tri(at(fa, r0), at(fb, r1), at(fa, r1), ca, cb, ca, ta, tb, ta);
        }
    }
    for (const f of picked) {
        if (frames[f].geometry.length !== rows)
            continue;
        const c = col(f, 0.5), t = frames[f].time;
        for (let r = 0; r < rows - (closed ? 0 : 1); r++)
            b.seg(at(f, r), at(f, r + 1), c, c, 1, t);
    }
    const ribStep = Math.max(1, Math.floor(rows / MAX_RIBS));
    for (let r = 0; r < rows; r += ribStep) {
        for (let k = 0; k + 1 < picked.length; k++) {
            const fa = picked[k], fb = picked[k + 1];
            if (frames[fa].geometry.length !== rows || frames[fb].geometry.length !== rows)
                continue;
            b.seg(at(fa, r), at(fb, r), withAlpha(palette.sheet, 0.4), withAlpha(palette.sheet, 0.4), 1, frames[fb].time);
        }
    }
}
function native(b, scene, palette) {
    for (const s of scene.segments)
        b.seg(s.start, s.end, palette.native, palette.native, 2.6);
    if (scene.mesh) {
        const v = scene.mesh.vertices;
        const c = withAlpha(palette.native, 0.32);
        for (const f of scene.mesh.faces)
            for (let k = 1; k + 1 < f.length; k++) {
                const a = v[f[0]], p = v[f[k]], q = v[f[k + 1]];
                if (a && p && q)
                    b.tri(a, p, q, c, c, c, ALWAYS, ALWAYS, ALWAYS);
            }
    }
}
export function buildDynamic(input) {
    const b = new Builder();
    const frame = input.frames[input.index];
    if (!frame)
        return b.done();
    const { palette } = input;
    const n = input.blended.length / 3;
    const rows = frame.geometry.length;
    const p = (k) => [input.blended[k * 3], input.blended[k * 3 + 1], input.blended[k * 3 + 2]];
    const centre = input.bounds?.center ?? [0, 0, 0], radius = input.bounds?.radius ?? 1;
    const colourAt = (k, alpha) => {
        if (input.colourBy === 'plain')
            return withAlpha(input.stringColour, alpha);
        if (input.colourBy === 'depth') {
            const q = p(k);
            return ramp(((q[0] - centre[0]) * input.viewDir[0] + (q[1] - centre[1]) * input.viewDir[1] + (q[2] - centre[2]) * input.viewDir[2]) / (2 * radius) + 0.5, alpha);
        }
        return ramp(input.scalar && input.scalarMax > 0 ? Math.sqrt(input.scalar[k] / input.scalarMax) : 0, alpha);
    };
    if (input.ghost && input.ghost.length >= 6) {
        const g = (k) => [input.ghost?.[k * 3], input.ghost?.[k * 3 + 1], input.ghost?.[k * 3 + 2]];
        const m = input.ghost.length / 3;
        for (let k = 0; k + 1 < m; k++)
            b.seg(g(k), g(k + 1), withAlpha(palette.muted, 0.85), withAlpha(palette.muted, 0.85), 2);
    }
    if (!input.hideString) {
        for (let k = 0; k + 1 < n; k++)
            b.seg(p(k), p(k + 1), withAlpha(palette.halo, 0.2), withAlpha(palette.halo, 0.2), input.width * 3.2);
        for (let k = 0; k + 1 < n; k++)
            b.seg(p(k), p(k + 1), colourAt(k, 1), colourAt(k + 1, 1), input.width);
        if (!input.closed && n > 1) {
            b.point(p(0), withAlpha(palette.text, 1), 9);
            b.point(p(n - 1), withAlpha(palette.text, 1), 9);
        }
        const rowsForBeads = beadIndices(input.beads, rows, input.closed);
        for (const row of rowsForBeads) {
            if (input.trail > 1 && input.index > 0) {
                const path = history(input.frames, row, input.index, input.trail);
                for (let k = 0; k + 1 < path.length; k++) {
                    const f0 = (k / Math.max(1, path.length - 1)) ** 1.4, f1 = ((k + 1) / Math.max(1, path.length - 1)) ** 1.4;
                    const c = ramp(row / Math.max(1, rows - 1));
                    b.seg(path[k], path[k + 1], withAlpha(c, 0.55 * f0), withAlpha(c, 0.55 * f1), 1.8);
                }
            }
            b.point(p(row), withAlpha(ramp(row / Math.max(1, rows - 1)), 1), 8);
        }
        for (const q of input.agentBeads ?? []) {
            b.point(q, withAlpha(palette.text, 0.9), 15);
            b.point(q, withAlpha(palette.background, 1), 9);
        }
        if (input.probe !== null && input.probe >= 0 && input.probe < rows) {
            const full = history(input.frames, input.probe, input.index, input.index + 1);
            for (let k = 0; k + 1 < full.length; k++)
                b.seg(full[k], full[k + 1], withAlpha(palette.probe, 0.25), withAlpha(palette.probe, 0.85), 2);
            b.point(p(input.probe), withAlpha(palette.probe, 0.35), 20);
            b.point(p(input.probe), withAlpha(palette.probe, 1), 10);
        }
    }
    return b.done();
}
//# sourceMappingURL=scene.js.map