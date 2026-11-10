import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configDiff, convertModes, coordinates, logSlope, resizeAxes } from '../src/client/logic.js';
import { constraintOf, csvCell, num, numericKeys, titleCase } from '../src/client/format.js';
import type { Config, Mode } from '../src/client/types.js';

const config = (over: Partial<Config> = {}): Config => ({
  schema: 1, kind: 'open', theory: 'bosonic', dimensions: 5, p_plus: 1, alpha_prime: 1, bc: 'NN', zero_velocity: [0, 0, 0], anchor_start: [0, 0, 0], anchor_end: [1, 0, 0],
  modes: [{ n: 1, axis: 3, enabled: true, amplitude: 0.4, phase: 0.2 } as Mode], solver: 'analytical', points: 128, dt: 0.01, duration: 12, projection: ['X1', 'X2', 'X3'],
  display: { worldsheet: false, grid: true, color: 'plain' }, description: '', ...over,
} as Config);

test('coordinates: σ, light-cone pair, then D-2 transverse axes', () => {
  assert.deepEqual(coordinates(5), ['σ', 'X+', 'X-', 'X1', 'X2', 'X3']);
  assert.equal(coordinates(26).length, 3 + 24);
});

test('logSlope recovers a power law and rejects degenerate input', () => {
  const pts: Array<[number, number]> = [1, 2, 4, 8, 16].map((x) => [x, 3 * x ** 1.5]);
  assert.ok(Math.abs((logSlope(pts) as number) - 1.5) < 1e-12);
  assert.equal(logSlope([[1, 1], [2, 2]]), null);
  assert.equal(logSlope([[1, 1], [1, 2], [1, 3]]), null);
  assert.equal(logSlope([[0, 1], [-1, 2], [1, 0], [2, 4]]), null, 'non-positive points are dropped');
});

test('convertModes carries amplitudes between open and closed strings and back', () => {
  const closed = convertModes([{ n: 2, axis: 1, enabled: true, amplitude: 0.5, phase: 0.1 } as Mode], 'closed')[0] as Mode;
  assert.deepEqual([closed.left, closed.right, closed.phase_left, closed.phase_right], [0.5, 0.5, 0.1, 0.1]);
  const open = convertModes([closed], 'open')[0] as Mode;
  assert.deepEqual([open.amplitude, open.phase], [0.5, 0.1]);
  assert.equal(open.n, 2);
});

test('resizeAxes keeps per-axis arrays, mode axes and the projection consistent', () => {
  const c = config({ dimensions: 4, projection: ['X1', 'X3', 'X2'] });
  resizeAxes(c);
  assert.equal(c.anchor_start.length, 2);
  assert.equal(c.zero_velocity.length, 2);
  assert.ok((c.modes[0] as Mode).axis <= 2);
  for (const p of c.projection) assert.ok(coordinates(4).includes(p), `${p} is a coordinate of the 4-D string`);
  const grown = config({ dimensions: 7 }); resizeAxes(grown);
  assert.equal(grown.anchor_end.length, 5);
});

test('configDiff lists only what changed, including nested mode fields', () => {
  const a = config(), b = config({ alpha_prime: 2 });
  (b.modes[0] as Mode).amplitude = 0.9;
  const diff = configDiff(a, b);
  assert.deepEqual(diff.map((d) => d[0]), ['alpha_prime', 'modes[1].amplitude']);
  assert.deepEqual(diff[0], ['alpha_prime', '1', '2']);
  assert.deepEqual(configDiff(a, config()), []);
});

test('num, titleCase, csvCell, constraintOf, numericKeys', () => {
  assert.equal(num(0), '0');
  assert.equal(num(0.000012345), '1.2345e-5');
  assert.equal(num(123456), '1.2346e+5');
  assert.equal(num(3.14159265, 3), '3.14');
  assert.equal(num(Number.POSITIVE_INFINITY), 'Infinity');
  assert.equal(num(null), '—');
  assert.equal(titleCase('level_matching_residual'), 'Level matching residual');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '""');
  assert.deepEqual(constraintOf({ level_matching_residual: 1e-9, relative_energy_drift: 3 }), { key: 'level_matching_residual', value: 1e-9 });
  assert.equal(constraintOf({ level_matching_residual: Number.NaN }), null);
  assert.deepEqual(numericKeys([{ diagnostics: { a: 1, b: 'x', c: 2 } }, { diagnostics: { a: 2, b: 'y', c: 'z' } }]), ['a']);
});
