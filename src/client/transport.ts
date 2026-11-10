/** Playback controls: restart, step, play, a continuous timeline (any model time, not only stored frames), loop mode and speed. */
import { glyph, h, registerGlyph } from './kit.js';
import { selectField, type SelectField } from './form.js';
import type { Store } from './store.js';
import { SPEEDS, type LoopMode } from './playback.js';

registerGlyph('play', ['M8 5.5v13l11-6.5z']);
registerGlyph('pause', ['M8 5.5v13', 'M16 5.5v13']);
registerGlyph('step-back', ['M17 6v12', 'M15 6.5L7.5 12l7.5 5.5z']);
registerGlyph('step-forward', ['M7 6v12', 'M9 6.5l7.5 5.5L9 17.5z']);
registerGlyph('skip-start', ['M6 6v12', 'M18 6.5L9.5 12l8.5 5.5z']);
registerGlyph('skip-end', ['M18 6v12', 'M6 6.5l8.5 5.5L6 17.5z']);

export class Transport {
  readonly el: HTMLElement;
  private play: HTMLButtonElement;
  private slider: HTMLInputElement;
  private time = h('output', { class: 'time', attrs: { 'aria-live': 'off' } });
  private frame = h('span', { class: 'muted frame-info' });
  private speed: SelectField;
  private loop: SelectField;
  private scrubbing = false;

  constructor(private readonly store: Store) {
    const icon = (name: string, label: string, run: () => void): HTMLButtonElement => h('button', { class: 'iconbtn', type: 'button', attrs: { 'aria-label': label, title: label }, on: { click: run } }, glyph(name));
    this.play = h('button', { class: 'btn primary play', type: 'button', attrs: { 'aria-label': 'Play', title: 'Play / pause (Space)' }, on: { click: () => store.togglePlay() } }, glyph('play'));
    this.slider = h('input', { type: 'range', class: 'timeline', min: '0', max: '1', step: 'any', value: '0', attrs: { 'aria-label': 'Time' } });
    this.slider.addEventListener('pointerdown', () => { this.scrubbing = true; store.pause(); });
    this.slider.addEventListener('input', () => store.seekTo(Number(this.slider.value)));
    const done = (): void => { this.scrubbing = false; };
    this.slider.addEventListener('pointerup', done); this.slider.addEventListener('change', done); this.slider.addEventListener('blur', done);
    this.speed = selectField('Speed', SPEEDS.map((s) => [String(s), `${s}×`] as [string, string]), String(store.prefs.speed), (v) => store.setSpeed(Number(v)));
    this.loop = selectField('Repeat', [['loop', 'Loop'], ['pingpong', 'Ping-pong'], ['once', 'Once']], store.loop, (v) => store.setLoop(v as LoopMode));
    this.el = h('div', { class: 'transport', attrs: { role: 'group', 'aria-label': 'Playback' } },
      icon('skip-start', 'Back to start (Home)', () => store.goStart()), icon('step-back', 'Previous frame (←)', () => store.step(-1)), this.play,
      icon('step-forward', 'Next frame (→)', () => store.step(1)), icon('skip-end', 'Jump to end (End)', () => store.goEnd()),
      h('div', { class: 'grow slider-wrap' }, this.slider), this.time, this.frame, this.loop.el, this.speed.el);
    store.ticks.on(() => this.tick());
    store.events.on((e) => { if (e === 'frames' || e === 'play' || e === 'prefs' || e === 'meta') this.sync(); });
    this.sync();
  }

  private sync(): void {
    const s = this.store;
    const first = s.first, last = s.lastTime;
    this.slider.min = String(first); this.slider.max = String(last > first ? last : first + 1);
    const step = s.frames.length > 1 ? (last - first) / (s.frames.length - 1) / 4 : 0.01;
    this.slider.step = String(step > 0 ? step : 'any');
    this.slider.disabled = s.frames.length < 2;
    const playing = s.clock.playing;
    this.play.replaceChildren(glyph(playing ? 'pause' : 'play'));
    this.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.speed.set(String(s.prefs.speed));
    this.loop.set(s.loop);
    this.tick();
  }

  private tick(): void {
    const s = this.store;
    if (!this.scrubbing || document.activeElement !== this.slider) this.slider.value = String(s.position);
    this.time.textContent = `τ = ${s.position.toFixed(2)} / ${s.lastTime.toFixed(2)}`;
    this.frame.textContent = s.frames.length ? `frame ${s.frameIndex + 1} of ${s.frames.length}` : 'no frames';
    this.slider.setAttribute('aria-valuetext', this.time.textContent);
  }
}
