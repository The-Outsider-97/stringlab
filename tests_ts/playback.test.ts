import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { advance, newClock, seek, stepFrame, toggle, type Clock } from "../src/client/playback.js";

const playing = (position: number, direction: 1 | -1 = 1): Clock => ({ position, direction, playing: true, loops: 0 });
const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

describe("advance", () => {
  it("does nothing while paused or with no span", () => {
    const c = newClock(1);
    assert.equal(advance(c, 1, 1, 0, 10, "loop"), c);
    assert.equal(advance(playing(1), 1, 1, 5, 5, "loop").position, 1);
  });
  it("moves at speed model-time units per second", () => {
    near(advance(playing(1), 0.5, 2, 0, 10, "loop").position, 2);
  });
  it("loops back to the start with the remainder", () => {
    const c = advance(playing(9.5), 1, 1, 0, 10, "loop");
    near(c.position, 0.5); assert.equal(c.loops, 1); assert.ok(c.playing);
  });
  it("stops at the end in once mode", () => {
    const c = advance(playing(9.5), 1, 1, 0, 10, "once");
    near(c.position, 10); assert.equal(c.playing, false);
  });
  it("bounces in ping-pong mode, also for a step longer than the run", () => {
    let c = advance(playing(9), 2, 1, 0, 10, "pingpong");
    near(c.position, 9); assert.equal(c.direction, -1);
    c = advance(c, 9.5, 1, 0, 10, "pingpong");
    near(c.position, 0.5); assert.equal(c.direction, 1);
    c = advance(playing(3), 25, 1, 0, 10, "pingpong");           // 1.25 round trips: out to 10, back to 0, out to 5
    near(c.position, 8); 
  });
  it("runs backwards and wraps the other way", () => {
    const c = advance(playing(0.5, -1), 1, 1, 0, 10, "loop");
    near(c.position, 9.5);
  });
});

describe("transport", () => {
  it("restarts when played at the end", () => {
    const c = toggle({ position: 10, direction: 1, playing: false, loops: 0 }, 0, 10);
    assert.ok(c.playing); near(c.position, 0);
    assert.equal(toggle(c, 0, 10).playing, false);
  });
  it("clamps a seek", () => {
    near(seek(newClock(), 99, 0, 10).position, 10);
    near(seek(newClock(), -3, 0, 10).position, 0);
  });
  it("steps between stored frames and wraps", () => {
    const times = [0, 1, 2, 3];
    near(stepFrame(times, 1, 1), 2);
    near(stepFrame(times, 3, 1), 0);
    near(stepFrame(times, 0, -1), 3);
    near(stepFrame(times, 1.5, -1), 1);
    near(stepFrame(times, 1.5, 1), 2);
  });
});
