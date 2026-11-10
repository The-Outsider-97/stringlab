/** Application state: the experiment, its computed frames, the playback clock and the preferences. Views subscribe to ``events`` (changes) and
 *  ``ticks`` (the playback position, many times a second) instead of polling or touching each other. */
import { ApiError, applyAppearance, clamp, debounce, Emitter, normaliseAppearance, toast } from './kit.js';
import { api } from './services.js';
import { advance, newClock, seek, stepFrame, toggle } from './playback.js';
import { bracket, nearestIndex } from './geometry.js';
import { MODE_LIMIT } from './types.js';
export const errorText = (error) => error instanceof ApiError ? error.friendly : error instanceof Error ? error.message : String(error);
/** Frames per unit of model time for a computed run: smooth enough to scrub, small enough to send. */
export function frameCountFor(duration) { return clamp(Math.round(duration * 12), 60, 240); }
export class Store {
    events = new Emitter();
    ticks = new Emitter();
    status;
    presets = [];
    prefs;
    config;
    quantum = {};
    title = 'Untitled experiment';
    category = '';
    objective = '';
    presetId = 0;
    savedId = null;
    savedRevision = 0;
    revision = 0; // bumped by every edit; agents tag what they publish with it
    frames = [];
    source = { kind: 'solver', label: 'Analytical' };
    numerical = null;
    busy = null;
    error = null;
    probe = null; // the vertex row the person pinned, followed through time
    nativeScene = null;
    clock = newClock();
    loop = 'loop';
    baseline = null;
    animation = null; // the Animation Agent's keyframed material points, drawn over the string while it is set
    serial = 0;
    computeTimer = 0;
    raf = 0;
    last = 0;
    cache = new Map();
    persist = debounce((patch) => { void api.prefs(patch).catch(() => undefined); }, 400);
    pending = {};
    // ------------------------------------------------------------------------------------------------------------------ boot
    async load() {
        const [status, presets, defaults] = await Promise.all([api.status(), api.presets(), api.defaults()]);
        this.status = status;
        this.prefs = status.prefs;
        this.presets = presets;
        this.config = defaults.classical;
        this.quantum = defaults.quantum;
        this.loop = this.prefs.loop ? 'loop' : 'once';
        this.applyLook();
        const first = presets[0];
        if (first)
            this.applyPreset(first, false);
    }
    get agents() { return this.status.optional_agents; }
    agentAvailable(key) { return this.agents.agents.some((a) => a.key === key && a.available); }
    async refreshAgents() { this.status = { ...this.status, optional_agents: (await api.status()).optional_agents }; this.events.emit('agents'); }
    // ------------------------------------------------------------------------------------------------------------------ preferences
    applyLook() {
        applyAppearance(normaliseAppearance({ theme: this.prefs.theme, scale: this.prefs.scale, motion: this.prefs.motion }), 'soft');
    }
    get reducedMotion() { return this.prefs.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    setPrefs(patch) {
        this.prefs = { ...this.prefs, ...patch };
        this.pending = { ...this.pending, ...patch };
        if ('theme' in patch || 'scale' in patch || 'motion' in patch)
            this.applyLook();
        this.persist(this.pending);
        this.events.emit('prefs');
    }
    // ------------------------------------------------------------------------------------------------------------------ experiments
    applyPreset(preset, run = true) {
        this.config = structuredClone(preset.configuration);
        if (preset.quantum)
            this.quantum = structuredClone(preset.quantum);
        this.presetId = preset.id;
        this.title = preset.title;
        this.category = preset.category;
        this.objective = preset.objective;
        this.savedId = null;
        this.savedRevision = 0;
        this.numerical = null;
        this.nativeScene = null;
        this.animation = null;
        this.probe = null;
        this.source = { kind: 'solver', label: this.config.solver === 'analytical' ? 'Analytical' : 'Finite difference' };
        this.setPrefs({ show_worldsheet: !!this.config.display.worldsheet });
        this.revision += 1;
        this.events.emit('meta');
        this.events.emit('config');
        if (run)
            void this.compute(true);
    }
    async loadSaved(id) {
        const data = await api.experiment(id);
        this.config = data.configuration;
        if (data.quantum)
            this.quantum = structuredClone(data.quantum);
        this.savedId = data.id;
        this.savedRevision = data.revision;
        this.title = data.title;
        this.category = 'Saved experiment';
        this.objective = 'Reopened reproducible configuration.';
        this.presetId = 0;
        this.numerical = data.numerical ?? null;
        this.nativeScene = null;
        this.animation = null;
        this.probe = null;
        this.revision += 1;
        this.events.emit('meta');
        this.events.emit('config');
        if (this.numerical)
            await this.runDynamics(this.numerical, true);
        else
            await this.compute(true);
    }
    /** Change the experiment. The new frames are computed after a short pause, so typing a number or dragging a slider stays responsive. */
    edit(change, immediate = false) {
        const next = structuredClone(this.config);
        change(next);
        this.config = next;
        this.revision += 1;
        this.nativeScene = null;
        this.animation = null;
        this.error = null;
        this.events.emit('config');
        this.schedule(immediate ? 0 : 250);
    }
    addMode() {
        if (this.config.modes.length >= MODE_LIMIT) {
            toast(`At most ${MODE_LIMIT} modes.`, { kind: 'error' });
            return;
        }
        const n = this.config.modes.length + 1;
        const mode = this.config.kind === 'open' ? { n, axis: Math.min(2, this.config.dimensions - 2), amplitude: 0.1, phase: 0, enabled: true }
            : { n, axis: Math.min(2, this.config.dimensions - 2), left: 0.1, right: 0.1, phase_left: 0, phase_right: 0, enabled: true };
        this.edit((c) => { c.modes.push(mode); }, true);
    }
    schedule(delay) {
        window.clearTimeout(this.computeTimer);
        this.computeTimer = window.setTimeout(() => { void this.compute(); }, delay);
    }
    /** Compute the frames of the current experiment. Playback keeps running through a recompute and picks up the new frames when they arrive. */
    async compute(restart = false) {
        window.clearTimeout(this.computeTimer);
        const serial = ++this.serial;
        const config = this.config;
        const count = frameCountFor(config.duration);
        const useSimulation = this.prefs.source === 'simulation' && config.solver === 'finite_difference' && this.agentAvailable('simulation');
        const key = JSON.stringify([config, count, useSimulation]);
        this.setBusy(useSimulation ? 'Running the Simulation Agent…' : 'Computing…');
        try {
            let frames = this.cache.get(key);
            let source = { kind: 'solver', label: config.solver === 'analytical' ? 'Analytical Fourier modes' : 'Finite-difference leapfrog' };
            if (!frames) {
                if (useSimulation) {
                    const run = await api.agents.simulate(config, Math.min(count, 240), this.revision);
                    frames = run.frames;
                    source = { kind: 'simulation', label: 'Simulation Agent rollout', run: run.provenance, verification: run.verification };
                }
                else
                    frames = await api.series(config, count);
                this.cache.set(key, frames);
                if (this.cache.size > 8)
                    this.cache.delete(this.cache.keys().next().value);
            }
            else if (useSimulation)
                source = { kind: 'simulation', label: 'Simulation Agent rollout' };
            if (serial !== this.serial)
                return;
            this.numerical = null;
            this.takeFrames(frames, source, restart);
            this.error = null;
        }
        catch (error) {
            if (serial !== this.serial)
                return;
            this.error = errorText(error);
            this.events.emit('error');
        }
        finally {
            if (serial === this.serial)
                this.setBusy(null);
        }
    }
    /** Evolve one of the covariant / nonlinear models (they are independent of the Fourier configuration). */
    async runDynamics(payload, restart = true) {
        const serial = ++this.serial;
        window.clearTimeout(this.computeTimer);
        this.setBusy('Integrating the nonlinear equations…');
        try {
            const frames = await api.dynamics(payload);
            if (!frames.length)
                throw new Error('The solver returned no frames.');
            if (serial !== this.serial)
                return;
            this.numerical = structuredClone(payload);
            this.nativeScene = null;
            this.takeFrames(frames, { kind: 'dynamics', label: String(payload.model).replaceAll('_', ' '), model: String(payload.model) }, restart);
            this.error = null;
        }
        finally {
            if (serial === this.serial)
                this.setBusy(null);
        }
    }
    async runSimulationAgent(frames = frameCountFor(this.config.duration)) {
        const run = await api.agents.simulate(this.config, Math.min(frames, 240), this.revision);
        this.takeFrames(run.frames, { kind: 'simulation', label: 'Simulation Agent rollout', run: run.provenance, verification: run.verification }, true);
        return run;
    }
    backToSolver() { this.numerical = null; void this.compute(true); }
    takeFrames(frames, source, restart) {
        const wasPlaying = this.clock.playing;
        this.frames = frames;
        this.source = source;
        const first = frames[0]?.time ?? 0, last = frames[frames.length - 1]?.time ?? 0;
        this.clock = restart ? { ...newClock(first), playing: false } : { ...this.clock, position: clamp(this.clock.position, first, last), playing: wasPlaying };
        this.events.emit('meta');
        this.events.emit('frames');
        this.ticks.emit(this.clock.position);
        if (this.clock.playing)
            this.startLoop();
    }
    setBusy(text) { this.busy = text; this.events.emit('status'); }
    // ------------------------------------------------------------------------------------------------------------------ playback
    get first() { return this.frames[0]?.time ?? 0; }
    get lastTime() { return this.frames[this.frames.length - 1]?.time ?? 0; }
    get times() { return this.frames.map((f) => f.time); }
    get position() { return this.clock.position; }
    get frameIndex() { return this.frames.length ? nearestIndex(this.times, this.clock.position) : 0; }
    get frame() { return this.frames[this.frameIndex]; }
    get span() { return bracket(this.times, this.clock.position); }
    togglePlay() {
        if (!this.frames.length)
            return;
        this.clock = toggle(this.clock, this.first, this.lastTime);
        this.afterClockChange(true);
    }
    pause() { if (this.clock.playing) {
        this.clock = { ...this.clock, playing: false };
        this.afterClockChange(true);
    } }
    seekTo(position, keepPlaying = false) {
        this.clock = { ...seek(this.clock, position, this.first, this.lastTime), playing: keepPlaying && this.clock.playing };
        this.afterClockChange(this.clock.playing !== keepPlaying || !keepPlaying);
    }
    step(delta) {
        this.clock = { ...this.clock, playing: false };
        this.clock = seek(this.clock, stepFrame(this.times, this.clock.position, delta), this.first, this.lastTime);
        this.afterClockChange(true);
    }
    goStart() { this.clock = { ...this.clock, playing: false, direction: 1 }; this.seekTo(this.first); }
    goEnd() { this.clock = { ...this.clock, playing: false }; this.seekTo(this.lastTime); }
    setSpeed(speed) { this.setPrefs({ speed }); }
    setLoop(mode) { this.loop = mode; this.setPrefs({ loop: mode !== 'once' }); this.events.emit('play'); }
    afterClockChange(announce) {
        if (this.clock.playing)
            this.startLoop();
        if (announce)
            this.events.emit('play');
        this.ticks.emit(this.clock.position);
    }
    startLoop() {
        if (this.raf)
            return;
        this.last = 0;
        const frame = (now) => {
            this.raf = 0;
            if (!this.clock.playing || !this.frames.length) {
                this.last = 0;
                return;
            }
            const seconds = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
            this.last = now;
            const before = this.clock.playing;
            if (!document.hidden)
                this.clock = advance(this.clock, seconds, this.prefs.speed, this.first, this.lastTime, this.loop);
            this.ticks.emit(this.clock.position);
            if (before !== this.clock.playing)
                this.events.emit('play');
            if (this.clock.playing)
                this.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    }
    // ------------------------------------------------------------------------------------------------------------------ misc state
    setProbe(row) { this.probe = row; this.events.emit('probe'); }
    setNative(scene) { this.nativeScene = scene; this.events.emit('native'); }
    setAnimation(result) { this.animation = result; this.events.emit('agents'); }
    async pinBaseline() {
        const config = structuredClone(this.config);
        try {
            const frames = await api.series(config, frameCountFor(config.duration));
            this.baseline = { config, frames, title: this.title };
            toast('Baseline pinned. It is drawn grey in the viewport and compared in the Compare tab.');
        }
        catch (error) {
            toast(errorText(error), { kind: 'error' });
        }
        this.events.emit('meta');
    }
    clearBaseline() { this.baseline = null; this.events.emit('meta'); }
    /** Whether the pinned baseline can be compared to the current run in time (same kind of string, same number of vertices). */
    baselineFrame(time = this.clock.position) {
        const frames = this.baseline?.frames;
        if (!frames?.length)
            return null;
        const t = clamp(time, frames[0]?.time ?? 0, frames[frames.length - 1]?.time ?? 0);
        const { i } = bracket(frames.map((f) => f.time), t);
        return frames[i] ?? null;
    }
    /** Remember where this experiment is stored so the next save is a new revision of it. */
    markSaved(saved) {
        this.savedId = saved.id;
        this.savedRevision = saved.revision;
        this.title = saved.title;
        this.events.emit('meta');
        this.events.emit('saved');
    }
    exportTime() { return clamp(this.clock.position, 0, this.config.duration); }
}
//# sourceMappingURL=store.js.map