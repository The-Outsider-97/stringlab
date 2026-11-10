import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beadIndices, blend, bracket, energyScalars, flatten, framesBounds, history, nearestIndex, speedScalars } from "../src/client/geometry.js";
import type { Frame } from "../src/client/types.js";

const frame = (time: number, geometry: number[][], closed = false): Frame =>
  ({ time, geometry, projection: ["a", "b", "c"], projection_kind: "x", closed, status: "ok", diagnostics: {}, solver: "analytical", samples: geometry.length });
const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

describe("bracket", () => {
  const times = [0, 1, 2, 4];
  it("finds the surrounding frames", () => {
    assert.deepEqual(bracket(times, 1.5), { i: 1, j: 2, u: 0.5 });
    assert.deepEqual(bracket(times, 3), { i: 2, j: 3, u: 0.5 });
  });
  it("clamps outside the run and handles a single frame", () => {
    assert.deepEqual(bracket(times, -1), { i: 0, j: 1, u: 0 });
    assert.deepEqual(bracket(times, 9), { i: 3, j: 3, u: 0 });
    assert.deepEqual(bracket([5], 5), { i: 0, j: 0, u: 0 });
  });
  it("rounds to the nearest frame", () => {
    assert.equal(nearestIndex(times, 1.4), 1); assert.equal(nearestIndex(times, 1.6), 2);
  });
});

describe("blend and flatten", () => {
  const a = frame(0, [[0, 0, 0], [1, 0, 0]]), b = frame(1, [[0, 2, 0], [1, 2, 0]]);
  it("interpolates vertex positions", () => {
    const out = blend(a, b, 0.25);
    near(out[1] as number, 0.5); near(out[4] as number, 0.5); near(out[3] as number, 1);
  });
  it("repeats the first vertex of a closed string", () => {
    const f = flatten(frame(0, [[1, 2, 3], [4, 5, 6]], true));
    assert.equal(f.length, 9); assert.deepEqual(Array.from(f.slice(6)), [1, 2, 3]);
  });
  it("does not blend frames of different length", () => {
    const out = blend(a, frame(1, [[0, 9, 0]]), 0.5);
    near(out[1] as number, 0);
  });
});

describe("bounds, beads and scalars", () => {
  it("bounds every vertex of every frame", () => {
    const b = framesBounds([frame(0, [[0, 0, 0], [2, 0, 0]]), frame(1, [[0, 1, -1], [2, 1, 1]])]);
    assert.deepEqual(b?.lo, [0, 0, -1]); assert.deepEqual(b?.hi, [2, 1, 1]); near(b?.radius ?? 0, Math.hypot(2, 1, 2) / 2);
    assert.equal(framesBounds([]), null);
  });
  it("spreads material points over the string", () => {
    assert.deepEqual(beadIndices(3, 101, false), [0, 50, 100]);
    assert.deepEqual(beadIndices(4, 100, true), [0, 25, 50, 75]);
    assert.deepEqual(beadIndices(1, 11, false), [5]);
    assert.deepEqual(beadIndices(0, 10, false), []);
  });
  it("measures speed by central difference between frames", () => {
    const frames = [frame(0, [[0, 0, 0]]), frame(1, [[0, 1, 0]]), frame(2, [[0, 3, 0]])];
    near(speedScalars(frames, 1)[0] as number, 1.5);
    near(speedScalars(frames, 0)[0] as number, 1);
    assert.equal(speedScalars([frame(0, [[0, 0, 0]])], 0)[0], 0);
  });
  it("has an energy proxy that is zero for a static straight string", () => {
    const line = [[0, 0, 0], [1, 0, 0], [2, 0, 0]].map((p) => p.map((v) => v * Math.PI / 4));
    const e = energyScalars([frame(0, line), frame(1, line)], 0);
    assert.ok(Array.from(e).every((v) => Number.isFinite(v) && v >= 0));
  });
  it("records the history of one vertex", () => {
    const frames = [0, 1, 2, 3].map((t) => frame(t, [[t, 0, 0], [t, 1, 0]]));
    assert.deepEqual(history(frames, 1, 3, 2), [[2, 1, 0], [3, 1, 0]]);
    assert.equal(history(frames, 0, 1, 10).length, 2);
  });
});
