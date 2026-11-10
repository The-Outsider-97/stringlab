/** Turns the experiment into drawable primitives (line segments, round points, triangles). Pure: no DOM, no WebGL, so it is unit-tested, and both
 *  renderers (WebGL2 and the 2D fallback) draw exactly the same scene.
 *
 *  The scene is split in two layers. The *static* layer (grid, axes, worldsheet, an imported native scene) changes only when the run, the palette or a
 *  display option changes; worldsheet primitives carry the model time they belong to, so playback reveals the sheet by moving one uniform instead of
 *  rebuilding geometry. The *dynamic* layer (the string, its material points, trails, the pinned probe) is rebuilt for every drawn frame. */
import type { Frame, NativeScene } from './types.js';
import { type Bounds, type V3, beadIndices, history } from './geometry.js';

export type RGBA = [number, number, number, number];

/** Floats per instance: p0(3) p1(3) c0(4) c1(4) width(1) tau(1). ``tau`` is the model time a primitive appears at (-Infinity: always). */
export const SEG_FLOATS = 16;
/** Floats per point: position(3) colour(4) size(1). */
export const PT_FLOATS = 8;
/** Floats per triangle vertex: position(3) normal(3) colour(4) tau(1). */
export const TRI_FLOATS = 11;
export const ALWAYS = -1e30;

export interface Layer { segs: Float32Array; nSeg: number; pts: Float32Array; nPt: number; tris: Float32Array; nTri: number; labels: Label[] }
export interface Label { at: V3; text: string; tone: 'axis0' | 'axis1' | 'axis2' | 'tick' | 'note' }

export interface Palette {
  string: RGBA; halo: RGBA; text: RGBA; muted: RGBA; grid: RGBA; gridMajor: RGBA; axes: [RGBA, RGBA, RGBA]; sheet: RGBA; native: RGBA; probe: RGBA; background: RGBA;
}

export type ColourBy = 'plain' | 'speed' | 'energy' | 'depth';

/** Blue to red through green and amber: readable on light and dark backgrounds, and in the usual colour-vision deficiencies (it varies in lightness too). */
export const RAMP: RGBA[] = ['#2c6fbb', '#3aa6c5', '#5cc490', '#c9d65a', '#f2a93b', '#e5593f'].map((value) => hex(value));

export function hex(value: string, alpha = 1): RGBA {
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return [0.3, 0.7, 0.9, alpha];
  const n = parseInt(m[1] as string, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

/** Computed value of a CSS colour (``rgb()``, ``rgba()`` or ``color(srgb …)``) as 0..1 floats. */
export function parseCssColour(text: string): RGBA | null {
  const m = /^(?:rgba?|color\(srgb)\(?\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(text.trim());
  if (!m) return null;
  const srgb = text.trim().startsWith('color(');
  const k = srgb ? 1 : 1 / 255;
  return [Number(m[1]) * k, Number(m[2]) * k, Number(m[3]) * k, m[4] !== undefined ? Number(m[4]) : 1];
}

export function ramp(t: number, alpha = 1, stops: readonly RGBA[] = RAMP): RGBA {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), u = x - i;
  const a = stops[i] as RGBA, b = stops[i + 1] as RGBA;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, alpha];
}

export const withAlpha = (c: RGBA, alpha: number): RGBA => [c[0], c[1], c[2], alpha];

class Builder {
  segs = new Float32Array(SEG_FLOATS * 256); nSeg = 0;
  pts = new Float32Array(PT_FLOATS * 64); nPt = 0;
  tris = new Float32Array(TRI_FLOATS * 3 * 256); nTri = 0;
  labels: Label[] = [];

  seg(a: V3, b: V3, ca: RGBA, cb: RGBA, width: number, tau = ALWAYS): void {
    if (this.nSeg * SEG_FLOATS + SEG_FLOATS > this.segs.length) { const next = new Float32Array(this.segs.length * 2); next.set(this.segs); this.segs = next; }
    this.segs.set([a[0], a[1], a[2], b[0], b[1], b[2], ca[0], ca[1], ca[2], ca[3], cb[0], cb[1], cb[2], cb[3], width, tau], this.nSeg * SEG_FLOATS);
    this.nSeg += 1;
  }

  point(p: V3, c: RGBA, size: number): void {
    if (this.nPt * PT_FLOATS + PT_FLOATS > this.pts.length) { const next = new Float32Array(this.pts.length * 2); next.set(this.pts); this.pts = next; }
    this.pts.set([p[0], p[1], p[2], c[0], c[1], c[2], c[3], size], this.nPt * PT_FLOATS);
    this.nPt += 1;
  }

  tri(a: V3, b: V3, c: V3, ca: RGBA, cb: RGBA, cc: RGBA, ta: number, tb: number, tc: number): void {
    if (this.nTri * 3 * TRI_FLOATS + 3 * TRI_FLOATS > this.tris.length) { const next = new Float32Array(this.tris.length * 2); next.set(this.tris); this.tris = next; }
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let o = this.nTri * 3 * TRI_FLOATS;
    for (const [p, col, tau] of [[a, ca, ta], [b, cb, tb], [c, cc, tc]] as Array<[V3, RGBA, number]>) {
      this.tris.set([p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], col[3], tau], o);
      o += TRI_FLOATS;
    }
    this.nTri += 1;
  }

  done(): Layer {
    return { segs: this.segs.subarray(0, this.nSeg * SEG_FLOATS), nSeg: this.nSeg, pts: this.pts.subarray(0, this.nPt * PT_FLOATS), nPt: this.nPt,
      tris: this.tris.subarray(0, this.nTri * 3 * TRI_FLOATS), nTri: this.nTri, labels: this.labels };
  }
}

/** 1, 2 or 5 times a power of ten at least ``raw``: grid lines at round values. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return '0';
  const abs = Math.abs(value);
  return abs >= 1e4 || abs < 1e-3 ? value.toExponential(0) : String(Number(value.toPrecision(3)));
}

// ---------------------------------------------------------------------------------------------------------------- static layer
export interface StaticInput {
  frames: readonly Frame[]; bounds: Bounds | null; palette: Palette; grid: boolean; axes: boolean; worldsheet: boolean; projection: readonly string[];
  native: NativeScene | null;
}

const MAX_SHEET_ROWS = 96, MAX_SHEET_FRAMES = 56, MAX_RIBS = 24;

export function buildStatic(input: StaticInput): Layer {
  const b = new Builder();
  const { bounds, palette } = input;
  if (bounds) {
    if (input.grid) grid(b, bounds, palette);
    if (input.axes) axes(b, bounds, palette, input.projection);
    if (input.worldsheet && input.frames.length > 1) sheet(b, input.frames, palette);
  }
  if (input.native) native(b, input.native, palette);
  return b.done();
}

function grid(b: Builder, bounds: Bounds, palette: Palette): void {
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
    if (Math.abs(k) < 1e-9) continue;
    b.labels.push({ at: [cx + k, cy - half, z], text: formatTick(cx + k), tone: 'tick' });
  }
}

function axes(b: Builder, bounds: Bounds, palette: Palette, projection: readonly string[]): void {
  const origin: V3 = [bounds.lo[0], bounds.lo[1], bounds.lo[2] - bounds.radius * 0.04];
  const length = Math.max(bounds.radius * 0.6, 1e-3);
  const ends: V3[] = [[origin[0] + length, origin[1], origin[2]], [origin[0], origin[1] + length, origin[2]], [origin[0], origin[1], origin[2] + length]];
  ends.forEach((end, i) => {
    const colour = palette.axes[i] as RGBA;
    b.seg(origin, end, colour, colour, 2.4);
    b.point(end, colour, 7);
    b.labels.push({ at: end, text: projection[i] ?? 'XYZ'[i] as string, tone: (['axis0', 'axis1', 'axis2'] as const)[i] as 'axis0' });
  });
}

/** The worldsheet X(τ, σ): translucent triangles between stored frames, σ-curves (one per drawn frame) and τ-ribs (one per drawn point). */
function sheet(b: Builder, frames: readonly Frame[], palette: Palette): void {
  const first = frames[0] as Frame, last = frames[frames.length - 1] as Frame;
  const rows = first.geometry.length, closed = first.closed;
  const t0 = first.time, span = Math.max(1e-12, last.time - t0);
  const rowStep = Math.max(1, Math.ceil(rows / MAX_SHEET_ROWS)), frameStep = Math.max(1, Math.ceil(frames.length / MAX_SHEET_FRAMES));
  const picked: number[] = [];
  for (let f = 0; f < frames.length; f += frameStep) picked.push(f);
  if (picked[picked.length - 1] !== frames.length - 1) picked.push(frames.length - 1);
  const rowList: number[] = [];
  for (let r = 0; r < rows; r += rowStep) rowList.push(r);
  if (!closed && rowList[rowList.length - 1] !== rows - 1) rowList.push(rows - 1);
  const at = (f: number, r: number): V3 => { const g = (frames[f] as Frame).geometry[r % rows] as number[]; return [g[0] as number, g[1] as number, g[2] as number]; };
  const col = (f: number, alpha: number): RGBA => ramp(((frames[f] as Frame).time - t0) / span, alpha);
  const rowPairs = rowList.map((r, k) => [r, rowList[k + 1] ?? (closed ? rowList[0] as number : r)] as const).filter(([a, c]) => a !== c || closed);

  for (let k = 0; k + 1 < picked.length; k++) {
    const fa = picked[k] as number, fb = picked[k + 1] as number;
    if ((frames[fa] as Frame).geometry.length !== rows || (frames[fb] as Frame).geometry.length !== rows) continue;
    const ta = (frames[fa] as Frame).time, tb = (frames[fb] as Frame).time;
    const ca = col(fa, 0.2), cb = col(fb, 0.2);
    for (const [r0, r1] of rowPairs) {
      b.tri(at(fa, r0), at(fb, r0), at(fb, r1), ca, cb, cb, ta, tb, tb);
      b.tri(at(fa, r0), at(fb, r1), at(fa, r1), ca, cb, ca, ta, tb, ta);
    }
  }
  for (const f of picked) {
    if ((frames[f] as Frame).geometry.length !== rows) continue;
    const c = col(f, 0.5), t = (frames[f] as Frame).time;
    for (let r = 0; r < rows - (closed ? 0 : 1); r++) b.seg(at(f, r), at(f, r + 1), c, c, 1, t);
  }
  const ribStep = Math.max(1, Math.floor(rows / MAX_RIBS));
  for (let r = 0; r < rows; r += ribStep) {
    for (let k = 0; k + 1 < picked.length; k++) {
      const fa = picked[k] as number, fb = picked[k + 1] as number;
      if ((frames[fa] as Frame).geometry.length !== rows || (frames[fb] as Frame).geometry.length !== rows) continue;
      b.seg(at(fa, r), at(fb, r), withAlpha(palette.sheet, 0.4), withAlpha(palette.sheet, 0.4), 1, (frames[fb] as Frame).time);
    }
  }
}

function native(b: Builder, scene: NativeScene, palette: Palette): void {
  for (const s of scene.segments) b.seg(s.start as V3, s.end as V3, palette.native, palette.native, 2.6);
  if (scene.mesh) {
    const v = scene.mesh.vertices as V3[];
    const c = withAlpha(palette.native, 0.32);
    for (const f of scene.mesh.faces) for (let k = 1; k + 1 < f.length; k++) {
      const a = v[f[0] as number], p = v[f[k] as number], q = v[f[k + 1] as number];
      if (a && p && q) b.tri(a, p, q, c, c, c, ALWAYS, ALWAYS, ALWAYS);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- dynamic layer
export interface DynamicInput {
  frames: readonly Frame[]; index: number; time: number;
  /** Interpolated vertices (flat xyz), a closed string repeating its first vertex. */
  blended: Float32Array; closed: boolean;
  colourBy: ColourBy; trail: number; beads: number; probe: number | null;
  palette: Palette; bounds: Bounds | null; viewDir: V3; scalar: Float32Array | null; scalarMax: number;
  hideString: boolean; width: number; stringColour: RGBA;
  /** A pinned baseline's string at the same time (flat xyz), drawn beneath the live one for comparison. */
  ghost?: Float32Array | null;
  /** Positions of the Animation Agent's material points at this time; drawn as rings so a mismatch with the solver's own points would show. */
  agentBeads?: readonly V3[];
}

export function buildDynamic(input: DynamicInput): Layer {
  const b = new Builder();
  const frame = input.frames[input.index];
  if (!frame) return b.done();
  const { palette } = input;
  const n = input.blended.length / 3;
  const rows = frame.geometry.length;
  const p = (k: number): V3 => [input.blended[k * 3] as number, input.blended[k * 3 + 1] as number, input.blended[k * 3 + 2] as number];
  const centre = input.bounds?.center ?? [0, 0, 0], radius = input.bounds?.radius ?? 1;

  const colourAt = (k: number, alpha: number): RGBA => {
    if (input.colourBy === 'plain') return withAlpha(input.stringColour, alpha);
    if (input.colourBy === 'depth') {
      const q = p(k);
      return ramp(((q[0] - centre[0]) * input.viewDir[0] + (q[1] - centre[1]) * input.viewDir[1] + (q[2] - centre[2]) * input.viewDir[2]) / (2 * radius) + 0.5, alpha);
    }
    return ramp(input.scalar && input.scalarMax > 0 ? Math.sqrt((input.scalar[k] as number) / input.scalarMax) : 0, alpha);
  };

  if (input.ghost && input.ghost.length >= 6) {
    const g = (k: number): V3 => [input.ghost?.[k * 3] as number, input.ghost?.[k * 3 + 1] as number, input.ghost?.[k * 3 + 2] as number];
    const m = input.ghost.length / 3;
    for (let k = 0; k + 1 < m; k++) b.seg(g(k), g(k + 1), withAlpha(palette.muted, 0.85), withAlpha(palette.muted, 0.85), 2);
  }
  if (!input.hideString) {
    for (let k = 0; k + 1 < n; k++) b.seg(p(k), p(k + 1), withAlpha(palette.halo, 0.2), withAlpha(palette.halo, 0.2), input.width * 3.2);
    for (let k = 0; k + 1 < n; k++) b.seg(p(k), p(k + 1), colourAt(k, 1), colourAt(k + 1, 1), input.width);
    if (!input.closed && n > 1) { b.point(p(0), withAlpha(palette.text, 1), 9); b.point(p(n - 1), withAlpha(palette.text, 1), 9); }

    const rowsForBeads = beadIndices(input.beads, rows, input.closed);
    for (const row of rowsForBeads) {
      if (input.trail > 1 && input.index > 0) {
        const path = history(input.frames, row, input.index, input.trail);
        for (let k = 0; k + 1 < path.length; k++) {
          const f0 = (k / Math.max(1, path.length - 1)) ** 1.4, f1 = ((k + 1) / Math.max(1, path.length - 1)) ** 1.4;
          const c = ramp(row / Math.max(1, rows - 1));
          b.seg(path[k] as V3, path[k + 1] as V3, withAlpha(c, 0.55 * f0), withAlpha(c, 0.55 * f1), 1.8);
        }
      }
      b.point(p(row), withAlpha(ramp(row / Math.max(1, rows - 1)), 1), 8);
    }
    for (const q of input.agentBeads ?? []) { b.point(q, withAlpha(palette.text, 0.9), 15); b.point(q, withAlpha(palette.background, 1), 9); }
    if (input.probe !== null && input.probe >= 0 && input.probe < rows) {
      const full = history(input.frames, input.probe, input.index, input.index + 1);
      for (let k = 0; k + 1 < full.length; k++) b.seg(full[k] as V3, full[k + 1] as V3, withAlpha(palette.probe, 0.25), withAlpha(palette.probe, 0.85), 2);
      b.point(p(input.probe), withAlpha(palette.probe, 0.35), 20);
      b.point(p(input.probe), withAlpha(palette.probe, 1), 10);
    }
  }
  return b.done();
}
