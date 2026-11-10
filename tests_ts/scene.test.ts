import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALWAYS, PT_FLOATS, RAMP, SEG_FLOATS, TRI_FLOATS, buildDynamic, buildStatic, formatTick, hex, niceStep, ramp, type Palette } from '../src/client/scene.js';
import { framesBounds } from '../src/client/geometry.js';
import type { Frame } from '../src/client/types.js';

const c = (r: number, g: number, b: number): [number, number, number, number] => [r, g, b, 1];
const palette: Palette = { string: c(0, 1, 1), halo: c(0, 0, 1), text: c(1, 1, 1), muted: c(.5, .5, .5), grid: c(.2, .2, .2), gridMajor: c(.4, .4, .4),
  axes: [c(1, 0, 0), c(0, 1, 0), c(0, 0, 1)], sheet: c(.7, .7, 1), native: c(1, .5, 0), probe: c(1, 1, 0), background: c(0, 0, 0) };

function frame(t: number, rows: number, closed = false): Frame {
  const geometry = Array.from({ length: rows }, (_, k) => { const s = (k / (closed ? rows : rows - 1)) * (closed ? 2 * Math.PI : Math.PI); return closed ? [Math.cos(s), Math.sin(s), Math.sin(t) * 0.2] : [s, Math.sin(s) * Math.cos(t), 0]; });
  return { time: t, geometry, projection: ['X1', 'X2', 'X3'], projection_kind: 'target_space', closed, status: 'ok', diagnostics: {}, solver: 'analytical', samples: rows };
}
const run = (n: number, rows: number, closed = false): Frame[] => Array.from({ length: n }, (_, k) => frame(k * 0.1, rows, closed));
const flat = (f: Frame): Float32Array => { const out = new Float32Array((f.geometry.length + (f.closed ? 1 : 0)) * 3); for (let k = 0; k < out.length / 3; k++) out.set(f.geometry[k % f.geometry.length] as number[], k * 3); return out; };

test('hex and ramp', () => {
  assert.deepEqual(hex('#ff0000'), [1, 0, 0, 1]);
  assert.deepEqual(ramp(0), RAMP[0]);
  assert.deepEqual(ramp(1), RAMP[RAMP.length - 1]);
  assert.deepEqual(ramp(Number.NaN), RAMP[0]);
  const mid = ramp(0.5, 0.3);
  assert.equal(mid[3], 0.3);
});

test('nice steps and tick text', () => {
  assert.equal(niceStep(0.13), 0.2);
  assert.equal(niceStep(3), 5);
  assert.equal(niceStep(7.1), 10);
  assert.equal(niceStep(-1), 1);
  assert.equal(formatTick(0), '0');
  assert.equal(formatTick(1.2345), '1.23');
  assert.equal(formatTick(123456), '1e+5');
});

test('static layer: grid, axes and labels', () => {
  const frames = run(5, 16);
  const layer = buildStatic({ frames, bounds: framesBounds(frames), palette, grid: true, axes: true, worldsheet: false, projection: ['X1', 'X2', 'σ'], native: null });
  assert.ok(layer.nSeg > 10);
  assert.equal(layer.segs.length, layer.nSeg * SEG_FLOATS);
  assert.equal(layer.nTri, 0);
  assert.deepEqual(layer.labels.filter((l) => l.tone.startsWith('axis')).map((l) => l.text), ['X1', 'X2', 'σ']);
  assert.equal(buildStatic({ frames, bounds: null, palette, grid: true, axes: true, worldsheet: true, projection: [], native: null }).nSeg, 0);
});

test('worldsheet primitives carry their model time and stay bounded', () => {
  const frames = run(240, 512);
  const layer = buildStatic({ frames, bounds: framesBounds(frames, 4), palette, grid: false, axes: false, worldsheet: true, projection: [], native: null });
  assert.ok(layer.nTri > 0 && layer.nTri < 30000, `triangles: ${layer.nTri}`);
  const times = new Set<number>();
  for (let k = 0; k < layer.nTri * 3; k++) times.add(layer.tris[k * TRI_FLOATS + 10] as number);
  assert.ok(times.size > 10 && ![...times].includes(ALWAYS));
  assert.ok(Math.max(...times) <= (frames[239] as Frame).time + 1e-9);
});

test('closed worldsheet wraps around the loop', () => {
  const frames = run(6, 24, true);
  const open = buildStatic({ frames: run(6, 24), bounds: framesBounds(frames), palette, grid: false, axes: false, worldsheet: true, projection: [], native: null });
  const closed = buildStatic({ frames, bounds: framesBounds(frames), palette, grid: false, axes: false, worldsheet: true, projection: [], native: null });
  assert.ok(closed.nTri > open.nTri);
});

test('native scenes: segments, and polygons are fanned into triangles', () => {
  const layer = buildStatic({ frames: [], bounds: null, palette, grid: false, axes: false, worldsheet: false, projection: [], native: {
    format: 'slai.sgeo', source: 'canonical_import', valid_native_document: true, digest_sha256: '0', time: null,
    segments: [{ id: 'a', start: [0, 0, 0], end: [1, 0, 0] }], mesh: { vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], faces: [[0, 1, 2, 3]] } } });
  assert.equal(layer.nSeg, 1);
  assert.equal(layer.nTri, 2);
  assert.equal(layer.tris[10], Math.fround(ALWAYS));
});

function dynamic(over: Partial<Parameters<typeof buildDynamic>[0]> = {}): ReturnType<typeof buildDynamic> {
  const frames = run(20, 33);
  return buildDynamic({ frames, index: 10, time: 1, blended: flat(frames[10] as Frame), closed: false, colourBy: 'plain', trail: 0, beads: 0, probe: null, palette,
    bounds: framesBounds(frames), viewDir: [0, -1, 0], scalar: null, scalarMax: 0, hideString: false, width: 3, stringColour: palette.string, ...over });
}

test('dynamic layer: halo and core segments, end points', () => {
  const layer = dynamic();
  assert.equal(layer.nSeg, 2 * 32);
  assert.equal(layer.nPt, 2);
  assert.equal(layer.pts.length, 2 * PT_FLOATS);
});

test('beads, trails and the probe add what they should', () => {
  const base = dynamic();
  const beads = dynamic({ beads: 8 });
  assert.equal(beads.nPt, base.nPt + 8);
  const trails = dynamic({ beads: 4, trail: 10 });
  assert.equal(trails.nSeg, base.nSeg + 4 * 9);
  const probed = dynamic({ probe: 5 });
  assert.equal(probed.nPt, base.nPt + 2);
  assert.ok(probed.nSeg > base.nSeg);
});

test('hidden string draws nothing; closed strings are one segment longer', () => {
  assert.equal(dynamic({ hideString: true }).nSeg, 0);
  const frames = run(4, 20, true);
  const layer = buildDynamic({ frames, index: 1, time: .1, blended: flat(frames[1] as Frame), closed: true, colourBy: 'plain', trail: 0, beads: 0, probe: null, palette,
    bounds: framesBounds(frames), viewDir: [0, -1, 0], scalar: null, scalarMax: 0, hideString: false, width: 3, stringColour: palette.string });
  assert.equal(layer.nSeg, 2 * 20);
  assert.equal(layer.nPt, 0);
});

test('colouring by speed uses the ramp, plain does not', () => {
  const scalar = Float32Array.from({ length: 33 }, (_, k) => k);
  const speed = dynamic({ colourBy: 'speed', scalar, scalarMax: 32 });
  const plain = dynamic();
  const core = (l: ReturnType<typeof buildDynamic>, seg: number): number[] => Array.from(l.segs.subarray(seg * SEG_FLOATS + 6, seg * SEG_FLOATS + 9));
  assert.deepEqual(core(plain, 32), [0, 1, 1]);
  assert.notEqual(JSON.stringify(core(speed, 32)), JSON.stringify(core(speed, 63)));
});
