/** Pure configuration and analysis logic shared by the panels (no DOM, so it is unit-tested in tests_ts). */
import type { Config, Kind, Mode } from './types.js';

export function coordinates(dimensions: number): string[] { return ['σ', 'X+', 'X-', ...Array.from({ length: dimensions - 2 }, (_, i) => `X${i + 1}`)]; }

/** Modes written for the other kind of string: same harmonics and axes, amplitudes carried over (a closed string splits an amplitude into left and right movers). */
export function convertModes(modes: Mode[], kind: Kind): Mode[] {
  return modes.map((m) => kind === 'closed'
    ? { n: m.n, axis: m.axis, enabled: m.enabled, left: m.left ?? m.amplitude ?? 0, right: m.right ?? m.amplitude ?? 0, phase_left: m.phase_left ?? m.phase ?? 0, phase_right: m.phase_right ?? m.phase ?? 0 }
    : { n: m.n, axis: m.axis, enabled: m.enabled, amplitude: m.amplitude ?? m.left ?? 0, phase: m.phase ?? m.phase_left ?? 0 });
}

/** Adjust everything that has one entry per transverse axis when the dimension changes. */
export function resizeAxes(c: Config): void {
  const axes = c.dimensions - 2;
  for (const key of ['anchor_start', 'anchor_end', 'zero_velocity'] as const) c[key] = Array.from({ length: axes }, (_, j) => c[key][j] ?? 0);
  for (const m of c.modes) m.axis = Math.min(Math.max(1, m.axis), axes);
  const available = coordinates(c.dimensions);
  c.projection = c.projection.map((p, i) => (available.includes(p) ? p : (available[i] as string)));
}

/** Least-squares slope of log y against log x: the exponent in y ∝ x^p. */
export function logSlope(points: Array<[number, number]>): number | null {
  const p = points.filter(([x, y]) => x > 0 && y > 0).map(([x, y]) => [Math.log(x), Math.log(y)] as [number, number]);
  if (p.length < 3) return null;
  const mx = p.reduce((a, q) => a + q[0], 0) / p.length, my = p.reduce((a, q) => a + q[1], 0) / p.length;
  const sxx = p.reduce((a, q) => a + (q[0] - mx) ** 2, 0);
  return sxx > 0 ? p.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / sxx : null;
}

function flattenConfig(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (Array.isArray(value) && value.some((v) => typeof v === 'object')) value.forEach((v, i) => flattenConfig(v, `${prefix}[${i + 1}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flattenConfig(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = JSON.stringify(value);
  return out;
}

/** The parameters that differ between two configurations, as "name: before → after". */
export function configDiff(a: Config, b: Config): Array<[string, string, string]> {
  const fa = flattenConfig(a), fb = flattenConfig(b);
  return [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => fa[k] !== fb[k]).sort().map((k) => [k, fa[k] ?? '—', fb[k] ?? '—']);
}
