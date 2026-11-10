/** The two stored frames around time ``t`` and the fraction between them. Times must be nondecreasing. */
export function bracket(times, t) {
    const last = times.length - 1;
    if (last <= 0 || t <= times[0])
        return { i: 0, j: Math.min(1, Math.max(0, last)), u: 0 };
    if (t >= times[last])
        return { i: last, j: last, u: 0 };
    let lo = 0, hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t)
            lo = mid;
        else
            hi = mid;
    }
    const a = times[lo], b = times[hi];
    return { i: lo, j: hi, u: b > a ? (t - a) / (b - a) : 0 };
}
export function nearestIndex(times, t) {
    const { i, j, u } = bracket(times, t);
    return u >= 0.5 ? j : i;
}
/** Flat xyz array of a frame; a closed string repeats its first vertex so a segment buffer can wrap without a special case. */
export function flatten(frame, out) {
    const n = frame.geometry.length + (frame.closed ? 1 : 0);
    const buffer = out && out.length >= n * 3 ? out : new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
        const p = frame.geometry[k % frame.geometry.length];
        buffer[k * 3] = p[0];
        buffer[k * 3 + 1] = p[1];
        buffer[k * 3 + 2] = p[2];
    }
    return buffer;
}
/** Linear blend of two frames' vertices into a flat array (display only: playback never replaces integration with interpolation). */
export function blend(a, b, u, out) {
    const fa = flatten(a, out);
    if (a === b || u <= 0 || a.geometry.length !== b.geometry.length)
        return fa;
    const fb = flatten(b);
    const n = a.geometry.length + (a.closed ? 1 : 0);
    for (let k = 0; k < n * 3; k++)
        fa[k] = fa[k] + (fb[k] - fa[k]) * u;
    return fa;
}
/** Bounding box and enclosing radius of the frames (every ``stride``-th), so the camera can frame a whole run and stay put during playback. */
export function framesBounds(frames, stride = 1) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (let f = 0; f < frames.length; f += Math.max(1, stride)) {
        for (const p of frames[f].geometry) {
            for (let k = 0; k < 3; k++) {
                const v = p[k];
                if (v < lo[k])
                    lo[k] = v;
                if (v > hi[k])
                    hi[k] = v;
            }
            any = true;
        }
    }
    if (!any)
        return null;
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const radius = Math.max(Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, 1e-3);
    return { lo, hi, center, radius };
}
export function pointsBounds(points) {
    return framesBounds([{ geometry: points }]);
}
/** Indices of ``count`` material points spread evenly along the string (ends included for an open string). */
export function beadIndices(count, rows, closed) {
    if (count <= 0 || rows <= 0)
        return [];
    if (count === 1)
        return [Math.floor(rows / 2)];
    const out = [];
    for (let k = 0; k < count; k++)
        out.push(closed ? Math.round((k * rows) / count) % rows : Math.round((k * (rows - 1)) / (count - 1)));
    return out;
}
/** |∂Y/∂τ| per vertex by central difference between neighbouring frames (one-sided at the ends); zero for a single frame. */
export function speedScalars(frames, index) {
    const f = frames[index];
    const n = f.geometry.length + (f.closed ? 1 : 0);
    const out = new Float32Array(n);
    const a = frames[Math.max(0, index - 1)], b = frames[Math.min(frames.length - 1, index + 1)];
    const dt = b.time - a.time;
    if (!(dt > 0) || a.geometry.length !== f.geometry.length || b.geometry.length !== f.geometry.length)
        return out;
    for (let k = 0; k < n; k++) {
        const pa = a.geometry[k % f.geometry.length], pb = b.geometry[k % f.geometry.length];
        out[k] = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) / dt;
    }
    return out;
}
/** Local energy-density proxy of the *projected* curve: |∂τY|² + |∂σY|² (the second term by central difference along the string). */
export function energyScalars(frames, index) {
    const speed = speedScalars(frames, index);
    const f = frames[index];
    const m = f.geometry.length;
    const n = speed.length;
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
        const kk = k % m;
        const prev = f.closed ? (kk + m - 1) % m : Math.max(0, kk - 1), next = f.closed ? (kk + 1) % m : Math.min(m - 1, kk + 1);
        const pa = f.geometry[prev], pb = f.geometry[next];
        const span = f.closed ? 2 : Math.max(1, next - prev);
        const dsigma = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) / span * m / (f.closed ? 2 * Math.PI : Math.PI);
        out[k] = speed[k] ** 2 + dsigma ** 2;
    }
    return out;
}
export function scalarMax(arrays) {
    let max = 0;
    for (const a of arrays)
        for (let k = 0; k < a.length; k++)
            if (a[k] > max)
                max = a[k];
    return max;
}
/** Position history of vertex ``row`` over the frames up to ``upTo`` (most recent last), at most ``length`` samples. */
export function history(frames, row, upTo, length) {
    const out = [];
    for (let f = Math.max(0, upTo - length + 1); f <= upTo; f++) {
        const g = frames[f].geometry;
        const p = g[row % g.length];
        out.push([p[0], p[1], p[2]]);
    }
    return out;
}
//# sourceMappingURL=geometry.js.map