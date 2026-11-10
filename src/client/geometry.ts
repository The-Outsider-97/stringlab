/** Pure geometry helpers for the viewport and the charts (no DOM, no WebGL, so they are unit-tested in tests_ts). */
import type { Frame } from './types.js';

export type V3 = [number, number, number];

/** The two stored frames around time ``t`` and the fraction between them. Times must be nondecreasing. */
export function bracket(times: readonly number[], t: number): { i: number; j: number; u: number } {
  const last = times.length - 1;
  if (last <= 0 || t <= (times[0] as number)) return { i: 0, j: Math.min(1, Math.max(0, last)), u: 0 };
  if (t >= (times[last] as number)) return { i: last, j: last, u: 0 };
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((times[mid] as number) <= t) lo = mid; else hi = mid; }
  const a = times[lo] as number, b = times[hi] as number;
  return { i: lo, j: hi, u: b > a ? (t - a) / (b - a) : 0 };
}

export function nearestIndex(times: readonly number[], t: number): number {
  const { i, j, u } = bracket(times, t);
  return u >= 0.5 ? j : i;
}

/** Flat xyz array of a frame; a closed string repeats its first vertex so a segment buffer can wrap without a special case. */
export function flatten(frame: Frame, out?: Float32Array): Float32Array {
  const n = frame.geometry.length + (frame.closed ? 1 : 0);
  const buffer = out && out.length >= n * 3 ? out : new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const p = frame.geometry[k % frame.geometry.length] as number[];
    buffer[k * 3] = p[0] as number; buffer[k * 3 + 1] = p[1] as number; buffer[k * 3 + 2] = p[2] as number;
  }
  return buffer;
}

/** Linear blend of two frames' vertices into a flat array (display only: playback never replaces integration with interpolation). */
export function blend(a: Frame, b: Frame, u: number, out?: Float32Array): Float32Array {
  const fa = flatten(a, out);
  if (a === b || u <= 0 || a.geometry.length !== b.geometry.length) return fa;
  const fb = flatten(b);
  const n = a.geometry.length + (a.closed ? 1 : 0);
  for (let k = 0; k < n * 3; k++) fa[k] = (fa[k] as number) + ((fb[k] as number) - (fa[k] as number)) * u;
  return fa;
}

export interface Bounds { lo: V3; hi: V3; center: V3; radius: number }

/** Bounding box and enclosing radius of the frames (every ``stride``-th), so the camera can frame a whole run and stay put during playback. */
export function framesBounds(frames: readonly Frame[], stride = 1): Bounds | null {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (let f = 0; f < frames.length; f += Math.max(1, stride)) {
    for (const p of (frames[f] as Frame).geometry) {
      for (let k = 0; k < 3; k++) { const v = p[k] as number; if (v < lo[k]!) lo[k] = v; if (v > hi[k]!) hi[k] = v; }
      any = true;
    }
  }
  if (!any) return null;
  const center: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.max(Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, 1e-3);
  return { lo, hi, center, radius };
}

export function pointsBounds(points: readonly number[][]): Bounds | null {
  return framesBounds([{ geometry: points as number[][] } as Frame]);
}

/** Indices of ``count`` material points spread evenly along the string (ends included for an open string). */
export function beadIndices(count: number, rows: number, closed: boolean): number[] {
  if (count <= 0 || rows <= 0) return [];
  if (count === 1) return [Math.floor(rows / 2)];
  const out: number[] = [];
  for (let k = 0; k < count; k++) out.push(closed ? Math.round((k * rows) / count) % rows : Math.round((k * (rows - 1)) / (count - 1)));
  return out;
}

/** |∂Y/∂τ| per vertex by central difference between neighbouring frames (one-sided at the ends); zero for a single frame. */
export function speedScalars(frames: readonly Frame[], index: number): Float32Array {
  const f = frames[index] as Frame;
  const n = f.geometry.length + (f.closed ? 1 : 0);
  const out = new Float32Array(n);
  const a = frames[Math.max(0, index - 1)] as Frame, b = frames[Math.min(frames.length - 1, index + 1)] as Frame;
  const dt = b.time - a.time;
  if (!(dt > 0) || a.geometry.length !== f.geometry.length || b.geometry.length !== f.geometry.length) return out;
  for (let k = 0; k < n; k++) {
    const pa = a.geometry[k % f.geometry.length] as number[], pb = b.geometry[k % f.geometry.length] as number[];
    out[k] = Math.hypot((pb[0] as number) - (pa[0] as number), (pb[1] as number) - (pa[1] as number), (pb[2] as number) - (pa[2] as number)) / dt;
  }
  return out;
}

/** Local energy-density proxy of the *projected* curve: |∂τY|² + |∂σY|² (the second term by central difference along the string). */
export function energyScalars(frames: readonly Frame[], index: number): Float32Array {
  const speed = speedScalars(frames, index);
  const f = frames[index] as Frame;
  const m = f.geometry.length;
  const n = speed.length;
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const kk = k % m;
    const prev = f.closed ? (kk + m - 1) % m : Math.max(0, kk - 1), next = f.closed ? (kk + 1) % m : Math.min(m - 1, kk + 1);
    const pa = f.geometry[prev] as number[], pb = f.geometry[next] as number[];
    const span = f.closed ? 2 : Math.max(1, next - prev);
    const dsigma = Math.hypot((pb[0] as number) - (pa[0] as number), (pb[1] as number) - (pa[1] as number), (pb[2] as number) - (pa[2] as number)) / span * m / (f.closed ? 2 * Math.PI : Math.PI);
    out[k] = (speed[k] as number) ** 2 + dsigma ** 2;
  }
  return out;
}

export function scalarMax(arrays: Iterable<Float32Array>): number {
  let max = 0;
  for (const a of arrays) for (let k = 0; k < a.length; k++) if ((a[k] as number) > max) max = a[k] as number;
  return max;
}

/** Position history of vertex ``row`` over the frames up to ``upTo`` (most recent last), at most ``length`` samples. */
export function history(frames: readonly Frame[], row: number, upTo: number, length: number): V3[] {
  const out: V3[] = [];
  for (let f = Math.max(0, upTo - length + 1); f <= upTo; f++) {
    const g = (frames[f] as Frame).geometry;
    const p = g[row % g.length] as number[];
    out.push([p[0] as number, p[1] as number, p[2] as number]);
  }
  return out;
}
