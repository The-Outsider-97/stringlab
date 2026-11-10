/** Playback clock: pure functions over a small state, so looping, ping-pong and stepping are unit-tested without a browser. */
export type LoopMode = 'loop' | 'pingpong' | 'once';

export interface Clock { position: number; direction: 1 | -1; playing: boolean; loops: number }

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export function newClock(position = 0): Clock { return { position, direction: 1, playing: false, loops: 0 }; }

/** Advance by ``seconds`` of wall time at ``speed`` model-time units per second inside [first, last]. A long gap (a hidden tab) is clamped by the caller. */
export function advance(clock: Clock, seconds: number, speed: number, first: number, last: number, mode: LoopMode): Clock {
  if (!clock.playing || !(last > first) || !(speed > 0) || !(seconds > 0)) return clock;
  const span = last - first;
  let position = clock.position + seconds * speed * clock.direction;
  let direction: 1 | -1 = clock.direction, loops = clock.loops;
  let playing: boolean = clock.playing;
  if (mode === 'pingpong') {
    // walk the distance, bouncing off the ends; a long step is first reduced by whole round trips
    let remaining = (seconds * speed) % (2 * span);
    let at = clock.position;
    loops += Math.floor((seconds * speed) / (2 * span)) * 2;
    while (remaining > 1e-12) {
      const wall = direction === 1 ? last : first;
      const room = Math.abs(wall - at);
      if (remaining < room) { at += direction * remaining; remaining = 0; }
      else { at = wall; remaining -= room; direction = direction === 1 ? -1 : 1; loops += 1; }
    }
    position = at;
  } else if (direction === 1 && position >= last) {
    if (mode === 'once') { position = last; playing = false; } else { position = first + ((position - first) % span); loops += 1; }
  } else if (direction === -1 && position <= first) {
    if (mode === 'once') { position = first; playing = false; } else { position = last - ((first - position) % span); loops += 1; }
  }
  return { position, direction, playing, loops };
}

/** Space bar and the play button: pressing play at the end of a run restarts it. */
export function toggle(clock: Clock, first: number, last: number): Clock {
  if (clock.playing) return { ...clock, playing: false };
  const atEnd = clock.direction === 1 ? clock.position >= last - 1e-9 : clock.position <= first + 1e-9;
  return { ...clock, playing: true, position: atEnd ? (clock.direction === 1 ? first : last) : clock.position };
}

export function seek(clock: Clock, position: number, first: number, last: number): Clock {
  return { ...clock, position: Math.min(last, Math.max(first, position)) };
}

/** Step to the next (or previous) stored frame, wrapping around. */
export function stepFrame(times: readonly number[], position: number, delta: 1 | -1): number {
  if (!times.length) return position;
  const eps = 1e-9;
  if (delta === 1) return (times.find((t) => t > position + eps) ?? times[0]) as number;
  for (let k = times.length - 1; k >= 0; k--) if ((times[k] as number) < position - eps) return times[k] as number;
  return times[times.length - 1] as number;
}
