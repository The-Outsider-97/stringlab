/** The 3D viewport: a WebGL2 (or 2D canvas) picture of the string, a 2D overlay for labels, the orientation gizmo and the probe, and the camera controls.
 *  The camera, its matrices and the ray maths are the SLAI kit's (tools/web/src/math3d.ts, shared with SPADRA); the scene is built by scene.ts and
 *  drawn by renderer.ts. Nothing here computes physics: the frames come from the engine and the viewport only changes how they are projected. */
import { HOME_VIEW, cameraEye, cameraMatrices, clamp, h, orbitAbout, rayPlane, rayThrough, sub, transform, zoomAt, normalise, } from './kit.js';
import { blend, bracket, energyScalars, framesBounds, pointsBounds, speedScalars } from './geometry.js';
import { Canvas2DRenderer, GLRenderer } from './renderer.js';
import { buildDynamic, buildStatic, hex, parseCssColour } from './scene.js';
const PITCH_LIMIT = 1.5;
const DEFAULT_STRING = '#4db9e7';
const PRESETS = {
    front: { yaw: 0, pitch: 0 }, side: { yaw: Math.PI / 2, pitch: 0 }, top: { yaw: 0, pitch: 1.5707 }, iso: HOME_VIEW,
};
const TOKENS = ['string', 'halo', 'text', 'muted', 'grid', 'grid-major', 'axis0', 'axis1', 'axis2', 'sheet', 'native', 'probe', 'background'];
export class Viewport {
    store;
    el;
    renderer;
    camera = { yaw: HOME_VIEW.yaw, pitch: HOME_VIEW.pitch, distance: 6, target: [0, 0, 0], ortho: false };
    overlay;
    octx;
    readout;
    probeHost;
    size = { w: 1, h: 1, dpr: 1 };
    dirty = true;
    raf = 0;
    lastFrameTime = 0;
    bounds = null;
    boundsFor = null;
    palette;
    paletteKey = 0;
    staticLayer = null;
    staticKey = '';
    scalarMaxCache = new Map();
    buffer = new Float32Array(0);
    matrices;
    hover = null;
    gizmos = [];
    pointers = new Map();
    drag = null;
    inertia = { vyaw: 0, vpitch: 0 };
    flight = null;
    pinch = 0;
    extent = 1;
    /** The pixel size the tests and the screenshot button can rely on. */
    get pixels() { return { width: this.renderer.canvas.width, height: this.renderer.canvas.height }; }
    constructor(store, force) {
        this.store = store;
        const stage = h('canvas', { class: 'vp-canvas', attrs: { 'aria-hidden': 'true' } });
        let renderer;
        let canvas = stage;
        if (force === 'canvas2d')
            renderer = new Canvas2DRenderer(stage);
        else {
            try {
                renderer = new GLRenderer(stage);
            }
            catch (error) {
                console.info('StringLab: WebGL2 unavailable, drawing with the 2D canvas.', error instanceof Error ? error.message : error);
                canvas = h('canvas', { class: 'vp-canvas', attrs: { 'aria-hidden': 'true' } }); // a fresh element: one that failed to give a GL context is not guaranteed a 2D one
                renderer = new Canvas2DRenderer(canvas);
            }
        }
        this.renderer = renderer;
        this.overlay = h('canvas', { class: 'vp-overlay', attrs: { 'aria-hidden': 'true' } });
        const octx = this.overlay.getContext('2d');
        if (!octx)
            throw new Error('Canvas 2D is not available.');
        this.octx = octx;
        this.readout = h('p', { class: 'visually-hidden', attrs: { role: 'status', 'aria-live': 'polite' } });
        this.probeHost = h('span', { class: 'vp-tokens', attrs: { 'aria-hidden': 'true' } });
        this.el = h('div', {
            class: 'viewport', tabindex: 0, attrs: { role: 'application', 'aria-label': '3D string view. Drag to orbit, shift-drag to pan, scroll to zoom. Arrow keys orbit, plus and minus zoom, F fits the view, 1 to 4 choose front, side, top and isometric views.' },
        }, canvas, this.overlay, this.probeHost, this.readout);
        this.buildTokens();
        this.refreshPalette();
        this.matrices = cameraMatrices(this.camera, 1, 1, 1);
        new ResizeObserver(() => this.resize()).observe(this.el);
        this.bind();
        store.events.on((event) => this.onStore(event));
        store.ticks.on(() => this.invalidate());
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.refreshPalette(); this.invalidate(); });
        this.resize();
        this.fit(false);
    }
    get kind() { return this.renderer.kind; }
    // ------------------------------------------------------------------------------------------------------------------ store
    onStore(event) {
        if (event === 'frames' || event === 'meta') {
            const first = this.boundsFor === null;
            this.bounds = null;
            this.boundsFor = null;
            this.scalarMaxCache.clear();
            if (event === 'frames') {
                this.frameBounds();
                if (first || this.store.clock.position <= this.store.first + 1e-9)
                    this.fit(!first && !this.store.reducedMotion);
            }
        }
        else if (event === 'prefs') {
            this.refreshPalette();
            if (this.store.prefs.camera_mode === 'orthographic' !== this.camera.ortho)
                this.setOrtho(this.store.prefs.camera_mode === 'orthographic');
            if (this.store.prefs.auto_orbit)
                this.inertia = { vyaw: 0, vpitch: 0 };
        }
        else if (event === 'native')
            this.fit(!this.store.reducedMotion);
        this.invalidate();
    }
    frameBounds() {
        const frames = this.store.frames;
        if (this.boundsFor !== frames) {
            this.boundsFor = frames;
            this.bounds = framesBounds(frames, Math.max(1, Math.floor(frames.length / 40)));
        }
        return this.bounds;
    }
    nativeBounds(scene) {
        const points = [];
        for (const s of scene.segments)
            points.push(s.start, s.end);
        if (scene.mesh)
            points.push(...scene.mesh.vertices);
        return pointsBounds(points);
    }
    focusBounds() {
        const native = this.store.nativeScene;
        if (native?.source === 'canonical_import')
            return this.nativeBounds(native) ?? this.frameBounds();
        return this.frameBounds();
    }
    // ------------------------------------------------------------------------------------------------------------------ palette
    buildTokens() {
        for (const name of TOKENS)
            this.probeHost.append(h('span', { class: `vp-tok vp-tok-${name}`, data: { token: name } }));
    }
    /** The colours come from the interface tokens (so every theme, including high contrast, restyles the picture), read once per theme change. */
    refreshPalette() {
        const read = (name, fallback) => {
            const el = this.probeHost.querySelector(`[data-token="${name}"]`);
            return (el && parseCssColour(getComputedStyle(el).color)) || fallback;
        };
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.palette = {
            string: read('string', hex(DEFAULT_STRING)), halo: read('halo', hex(DEFAULT_STRING, 0.3)), text: read('text', dark ? [1, 1, 1, 1] : [0, 0, 0, 1]),
            muted: read('muted', [0.5, 0.5, 0.5, 1]), grid: read('grid', [0.5, 0.5, 0.5, 0.2]), gridMajor: read('grid-major', [0.5, 0.5, 0.5, 0.4]),
            axes: [read('axis0', hex('#e5593f')), read('axis1', hex('#5cc490')), read('axis2', hex('#3aa6c5'))], sheet: read('sheet', [0.6, 0.7, 1, 1]),
            native: read('native', hex('#f2a93b')), probe: read('probe', hex('#f2a93b')), background: read('background', dark ? [0.08, 0.09, 0.11, 1] : [0.95, 0.96, 0.98, 1]),
        };
        this.paletteKey += 1;
    }
    // ------------------------------------------------------------------------------------------------------------------ size and drawing
    resize() {
        const box = this.el.getBoundingClientRect();
        const w = Math.max(1, Math.floor(box.width)), h2 = Math.max(1, Math.floor(box.height));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.size = { w, h: h2, dpr };
        this.renderer.resize(w, h2, dpr);
        this.overlay.width = Math.round(w * dpr);
        this.overlay.height = Math.round(h2 * dpr);
        this.invalidate();
    }
    invalidate() {
        this.dirty = true;
        if (!this.raf)
            this.raf = requestAnimationFrame((now) => this.frame(now));
    }
    frame(now) {
        this.raf = 0;
        const seconds = this.lastFrameTime ? Math.min(0.1, (now - this.lastFrameTime) / 1000) : 0;
        this.lastFrameTime = now;
        let animating = false;
        if (this.flight) {
            const f = this.flight, u = clamp((now - f.start) / f.duration, 0, 1), e = u * u * (3 - 2 * u);
            const mix = (a, b) => a + (b - a) * e;
            this.camera.yaw = mix(f.from.yaw, f.to.yaw);
            this.camera.pitch = mix(f.from.pitch, f.to.pitch);
            this.camera.distance = mix(f.from.distance, f.to.distance);
            this.camera.target = [mix(f.from.target[0], f.to.target[0]), mix(f.from.target[1], f.to.target[1]), mix(f.from.target[2], f.to.target[2])];
            if (u >= 1)
                this.flight = null;
            else
                animating = true;
            this.dirty = true;
        }
        if (!this.drag && (Math.abs(this.inertia.vyaw) > 0.01 || Math.abs(this.inertia.vpitch) > 0.01)) {
            orbitAbout(this.camera, this.camera.target, this.inertia.vyaw * seconds, this.inertia.vpitch * seconds, PITCH_LIMIT);
            const k = Math.exp(-seconds * 6);
            this.inertia.vyaw *= k;
            this.inertia.vpitch *= k;
            animating = true;
            this.dirty = true;
        }
        if (this.store.prefs.auto_orbit && !this.drag && !this.store.reducedMotion && !document.hidden) {
            orbitAbout(this.camera, this.camera.target, seconds * 0.22, 0, PITCH_LIMIT);
            animating = true;
            this.dirty = true;
        }
        if (this.dirty) {
            this.dirty = false;
            this.render();
        }
        if (animating)
            this.raf = requestAnimationFrame((t) => this.frame(t));
        else
            this.lastFrameTime = 0;
    }
    /** Draw now. Also used by the screenshot and the recorder, which read the canvas in the same task. */
    render() {
        const { w, h: hh } = this.size;
        const bounds = this.focusBounds();
        this.extent = bounds?.radius ?? 1;
        this.matrices = cameraMatrices(this.camera, w, hh, this.extent);
        const store = this.store, prefs = store.prefs;
        const eye = cameraEye(this.camera);
        const viewDir = normalise(sub(this.camera.target, eye));
        const native = store.nativeScene;
        const frames = store.frames;
        const key = [frames.length, frames[0]?.time, frames[frames.length - 1]?.time, this.paletteKey, prefs.show_grid, prefs.show_axes, prefs.show_worldsheet, native?.digest_sha256, bounds?.radius.toFixed(4), store.revision, store.source.kind].join('|');
        if (!this.staticLayer || key !== this.staticKey) {
            this.staticKey = key;
            this.staticLayer = buildStatic({ frames, bounds, palette: this.palette, grid: prefs.show_grid, axes: prefs.show_axes, worldsheet: prefs.show_worldsheet, projection: frames[0]?.projection ?? [], native });
        }
        const layers = [this.staticLayer];
        const frame = store.frame;
        let blended = null;
        if (frame) {
            const { i, j, u } = store.span;
            const a = frames[i], b = frames[j];
            if (a && b) {
                const n = (a.geometry.length + (a.closed ? 1 : 0)) * 3;
                if (this.buffer.length < n)
                    this.buffer = new Float32Array(n);
                blended = blend(a, b, u, this.buffer).subarray(0, n);
                layers.push(buildDynamic({
                    frames, index: store.frameIndex, time: store.position, blended, closed: a.closed, colourBy: prefs.colour_by, trail: store.prefs.trail, beads: prefs.beads, probe: store.probe,
                    palette: this.palette, bounds, viewDir, scalar: this.scalars(prefs.colour_by, store.frameIndex), scalarMax: this.scalarMax(prefs.colour_by),
                    hideString: native?.source === 'canonical_import', width: 3, stringColour: this.stringColour(),
                    ghost: this.ghost(), agentBeads: this.agentBeads(),
                }));
            }
        }
        this.renderer.draw({ vp: this.matrices.viewProjection, width: w, height: hh, dpr: this.size.dpr, time: store.position, background: this.palette.background, layers, viewDir });
        this.drawOverlay(this.staticLayer, blended, frame?.closed ?? false);
    }
    /** The pinned baseline's string at the current time, blended between its stored frames like the live one. */
    ghost() {
        const frames = this.store.baseline?.frames;
        if (!frames?.length)
            return null;
        const { i, j, u } = bracket(frames.map((f) => f.time), clamp(this.store.position, frames[0]?.time ?? 0, frames[frames.length - 1]?.time ?? 0));
        const a = frames[i], b = frames[j];
        return a && b ? blend(a, b, u) : null;
    }
    /** Where the Animation Agent's keyframe tracks put its material points now (linear between keyframes, as the agent evaluates them). */
    agentBeads() {
        const result = this.store.animation;
        if (!result || !result.times.length)
            return [];
        const { i, j, u } = bracket(result.times, this.store.position);
        return result.beads.map((bead) => {
            const a = bead.positions[i] ?? bead.positions[0], b = bead.positions[j] ?? a;
            return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u);
        });
    }
    stringColour() {
        const chosen = this.store.config.display.color;
        return chosen && chosen.toLowerCase() !== DEFAULT_STRING ? hex(chosen) : this.palette.string;
    }
    scalars(mode, index) {
        if (mode !== 'speed' && mode !== 'energy')
            return null;
        return (mode === 'speed' ? speedScalars : energyScalars)(this.store.frames, index);
    }
    scalarMax(mode) {
        if (mode !== 'speed' && mode !== 'energy')
            return 0;
        const key = mode;
        let max = this.scalarMaxCache.get(key);
        if (max === undefined) {
            max = 0;
            const frames = this.store.frames, stride = Math.max(1, Math.floor(frames.length / 24));
            for (let f = 0; f < frames.length; f += stride) {
                const values = (mode === 'speed' ? speedScalars : energyScalars)(frames, f);
                for (let k = 0; k < values.length; k++)
                    if (values[k] > max)
                        max = values[k];
            }
            this.scalarMaxCache.set(key, max);
        }
        return max;
    }
    // ------------------------------------------------------------------------------------------------------------------ overlay
    screen(p) {
        const [x, y, z, w] = transform(this.matrices.viewProjection, p);
        if (w < 0.002)
            return null;
        return { x: (x / w * 0.5 + 0.5) * this.size.w, y: (1 - (y / w * 0.5 + 0.5)) * this.size.h, depth: z / w };
    }
    cssText(c, alpha = 1) { return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`; }
    drawOverlay(layer, blended, closed) {
        const c = this.octx, { w, h: hh, dpr } = this.size;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, hh);
        c.font = '600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        c.textBaseline = 'middle';
        for (const label of layer.labels) {
            const p = this.screen(label.at);
            if (!p || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > hh + 20)
                continue;
            const axis = label.tone.startsWith('axis');
            c.fillStyle = axis ? this.cssText(this.palette.axes[Number(label.tone.slice(4))]) : this.cssText(this.palette.muted, 0.9);
            c.font = axis ? '700 13px ui-sans-serif, system-ui, sans-serif' : '11px ui-monospace, Menlo, Consolas, monospace';
            c.fillText(label.text, p.x + 7, p.y - 7);
        }
        this.drawGizmo(c);
        const rows = this.store.frame?.geometry.length ?? 0;
        const probes = [];
        const at = (row) => blended && row < rows ? this.screen([blended[row * 3], blended[row * 3 + 1], blended[row * 3 + 2]]) : null;
        if (this.store.probe !== null) {
            const p = at(this.store.probe);
            if (p)
                probes.push({ row: this.store.probe, pinned: true, ...p });
        }
        if (this.hover && this.hover.row !== this.store.probe) {
            const p = at(this.hover.row);
            if (p)
                probes.push({ row: this.hover.row, pinned: false, ...p });
        }
        for (const probe of probes)
            this.tooltip(c, probe.row, probe.x, probe.y, probe.pinned, closed);
    }
    tooltip(c, row, x, y, pinned, closed) {
        const frame = this.store.frame;
        if (!frame)
            return;
        const g = frame.geometry[row];
        if (!g)
            return;
        const rows = frame.geometry.length;
        const sigma = (row / (closed ? rows : Math.max(1, rows - 1))) * (closed ? 360 : 180);
        const names = frame.projection;
        const lines = [`${pinned ? 'Pinned ' : ''}σ ${sigma.toFixed(1)}° · row ${row + 1}/${rows}`, `${names[0] ?? 'x'} ${g[0]?.toFixed(3)}   ${names[1] ?? 'y'} ${g[1]?.toFixed(3)}   ${names[2] ?? 'z'} ${g[2]?.toFixed(3)}`];
        c.font = '11px ui-monospace, Menlo, Consolas, monospace';
        const width = Math.max(...lines.map((l) => c.measureText(l).width)) + 16, height = lines.length * 16 + 8;
        const bx = clamp(x + 14, 6, this.size.w - width - 6), by = clamp(y - height - 10, 6, this.size.h - height - 6);
        c.strokeStyle = this.cssText(this.palette.probe, 0.9);
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, 9, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = this.cssText(this.palette.background, 0.9);
        c.beginPath();
        c.roundRect(bx, by, width, height, 8);
        c.fill();
        c.strokeStyle = this.cssText(this.palette.muted, 0.6);
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = this.cssText(this.palette.text, 1);
        lines.forEach((l, k) => c.fillText(l, bx + 8, by + 12 + k * 16));
    }
    drawGizmo(c) {
        const m = this.matrices.view;
        const cx = 44, cy = this.size.h - 52, r = 26;
        this.gizmos = [];
        const axes = [
            { name: 'side', v: [1, 0, 0], label: this.store.frame?.projection[0] ?? 'X', colour: this.palette.axes[0] },
            { name: 'front', v: [0, 1, 0], label: this.store.frame?.projection[1] ?? 'Y', colour: this.palette.axes[1] },
            { name: 'top', v: [0, 0, 1], label: this.store.frame?.projection[2] ?? 'Z', colour: this.palette.axes[2] },
        ];
        const projected = axes.map((a) => ({ ...a, sx: (m[0] ?? 0) * a.v[0] + (m[4] ?? 0) * a.v[1] + (m[8] ?? 0) * a.v[2], sy: (m[1] ?? 0) * a.v[0] + (m[5] ?? 0) * a.v[1] + (m[9] ?? 0) * a.v[2], sz: (m[2] ?? 0) * a.v[0] + (m[6] ?? 0) * a.v[1] + (m[10] ?? 0) * a.v[2] }));
        projected.sort((a, b) => a.sz - b.sz);
        c.fillStyle = this.cssText(this.palette.background, 0.55);
        c.beginPath();
        c.arc(cx, cy, r + 14, 0, Math.PI * 2);
        c.fill();
        for (const a of projected) {
            const x = cx + a.sx * r, y = cy - a.sy * r;
            c.strokeStyle = this.cssText(a.colour, 0.9);
            c.lineWidth = 2;
            c.beginPath();
            c.moveTo(cx, cy);
            c.lineTo(x, y);
            c.stroke();
            c.fillStyle = this.cssText(a.colour, 1);
            c.beginPath();
            c.arc(x, y, 8, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#fff';
            c.font = '700 10px ui-sans-serif, system-ui, sans-serif';
            c.textAlign = 'center';
            c.fillText(a.label.slice(0, 2), x, y + 0.5);
            c.textAlign = 'start';
            this.gizmos.push({ name: a.name, x, y, r: 10 });
        }
    }
    // ------------------------------------------------------------------------------------------------------------------ camera
    /** Frame everything the run will ever show; the camera then stays put while it plays. */
    fit(animate = true) {
        const b = this.focusBounds();
        if (!b)
            return;
        const half = this.camera.ortho ? Math.tan(Math.PI / 8) : Math.sin(Math.PI / 8);
        const distance = (b.radius * 1.08) / half;
        this.flyTo({ ...this.camera, target: [...b.center], distance }, animate);
    }
    view(name, animate = true) {
        const p = PRESETS[name];
        const b = this.focusBounds();
        // the shortest way round: a view preset must not spin the model the long way
        let yaw = p.yaw;
        while (yaw - this.camera.yaw > Math.PI)
            yaw -= 2 * Math.PI;
        while (yaw - this.camera.yaw < -Math.PI)
            yaw += 2 * Math.PI;
        this.flyTo({ ...this.camera, yaw, pitch: p.pitch, target: b ? [...b.center] : this.camera.target }, animate);
        this.say(`${name === 'iso' ? 'Isometric' : name[0]?.toUpperCase() + name.slice(1)} view`);
    }
    setOrtho(ortho) {
        if (this.camera.ortho === ortho)
            return;
        // the kit's orthographic window is the perspective window at the target's distance, so the picture keeps its size
        this.camera.ortho = ortho;
        this.invalidate();
    }
    flyTo(to, animate) {
        if (!animate || this.store.reducedMotion) {
            Object.assign(this.camera, { ...to, target: [...to.target] });
            this.flight = null;
            this.invalidate();
            return;
        }
        this.flight = { from: { ...this.camera, target: [...this.camera.target] }, to, start: performance.now(), duration: 380 };
        this.invalidate();
    }
    /** Where in the world the pointer's picture plane (through the target, facing the eye) is hit. */
    planePoint(px, py) {
        const ray = rayThrough(this.matrices.viewProjection, (px / this.size.w) * 2 - 1, 1 - (py / this.size.h) * 2);
        return ray ? rayPlane(ray, this.camera.target, normalise(sub(this.camera.target, cameraEye(this.camera)))) : null;
    }
    pan(fromX, fromY, toX, toY) {
        const a = this.planePoint(fromX, fromY), b = this.planePoint(toX, toY);
        if (a && b)
            this.camera.target = [this.camera.target[0] + a[0] - b[0], this.camera.target[1] + a[1] - b[1], this.camera.target[2] + a[2] - b[2]];
    }
    zoomBy(factor, px = this.size.w / 2, py = this.size.h / 2) {
        this.flight = null;
        zoomAt(this.camera, factor, (px / this.size.w) * 2 - 1, 1 - (py / this.size.h) * 2, this.size.w, this.size.h, this.extent, this.extent * 0.05, this.extent * 60);
        this.invalidate();
    }
    // ------------------------------------------------------------------------------------------------------------------ pointer and keys
    local(e) {
        const box = this.el.getBoundingClientRect();
        return { x: e.clientX - box.left, y: e.clientY - box.top };
    }
    pickRow(x, y) {
        const frame = this.store.frame;
        if (!frame)
            return null;
        const { i, j, u } = this.store.span;
        const a = this.store.frames[i], b = this.store.frames[j];
        if (!a || !b)
            return null;
        const flat = blend(a, b, u, this.buffer);
        const rows = frame.geometry.length;
        let best = -1, bestD = 18 * 18;
        for (let k = 0; k < rows; k++) {
            const p = this.screen([flat[k * 3], flat[k * 3 + 1], flat[k * 3 + 2]]);
            if (!p)
                continue;
            const d = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (d < bestD) {
                bestD = d;
                best = k;
            }
        }
        return best >= 0 ? { row: best, x, y } : null;
    }
    bind() {
        const el = this.el;
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        el.addEventListener('pointerdown', (e) => {
            const p = this.local(e);
            el.focus({ preventScroll: true });
            const gizmo = this.gizmos.find((g) => (g.x - p.x) ** 2 + (g.y - p.y) ** 2 <= g.r * g.r);
            if (gizmo && e.button === 0 && e.pointerType !== 'touch') {
                this.view(gizmo.name);
                return;
            }
            el.setPointerCapture(e.pointerId);
            this.pointers.set(e.pointerId, p);
            this.flight = null;
            this.inertia = { vyaw: 0, vpitch: 0 };
            if (this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
                this.drag = null;
                return;
            }
            this.drag = { mode: e.shiftKey || e.button === 1 || e.button === 2 ? 'pan' : 'orbit', moved: 0, x: p.x, y: p.y, vx: 0, vy: 0, at: performance.now() };
        });
        el.addEventListener('pointermove', (e) => {
            const p = this.local(e);
            if (this.pointers.has(e.pointerId)) {
                const previous = this.pointers.get(e.pointerId);
                this.pointers.set(e.pointerId, p);
                if (this.pointers.size === 2) {
                    const [a, b] = [...this.pointers.values()];
                    const now = Math.hypot(a.x - b.x, a.y - b.y);
                    if (this.pinch > 0 && now > 0)
                        this.zoomBy(this.pinch / now, (a.x + b.x) / 2, (a.y + b.y) / 2);
                    this.pan(previous.x, previous.y, p.x, p.y);
                    this.pinch = now;
                    this.invalidate();
                    return;
                }
                if (this.drag) {
                    const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
                    this.drag.moved += Math.abs(dx) + Math.abs(dy);
                    if (this.drag.mode === 'pan')
                        this.pan(this.drag.x, this.drag.y, p.x, p.y);
                    else {
                        orbitAbout(this.camera, this.camera.target, -dx * 0.008, dy * 0.008, PITCH_LIMIT);
                        const now = performance.now(), dt = Math.max(8, now - this.drag.at) / 1000; // radians per second, smoothed, for the throw on release
                        this.drag.vx = this.drag.vx * 0.6 + ((-dx * 0.008) / dt) * 0.4;
                        this.drag.vy = this.drag.vy * 0.6 + ((dy * 0.008) / dt) * 0.4;
                        this.drag.at = now;
                    }
                    this.drag.x = p.x;
                    this.drag.y = p.y;
                    this.hover = null;
                    this.invalidate();
                }
                return;
            }
            const hit = this.pickRow(p.x, p.y);
            if (hit?.row !== this.hover?.row) {
                this.hover = hit;
                el.classList.toggle('picking', !!hit);
                this.invalidate();
            }
        });
        const end = (e) => {
            const p = this.local(e);
            const drag = this.drag;
            this.pointers.delete(e.pointerId);
            if (this.pointers.size < 2)
                this.pinch = 0;
            if (!drag)
                return;
            this.drag = null;
            if (drag.moved < 5 && e.type === 'pointerup' && drag.mode === 'orbit') {
                const hit = this.pickRow(p.x, p.y);
                this.store.setProbe(hit && hit.row !== this.store.probe ? hit.row : null);
                if (hit)
                    this.say(hit.row === this.store.probe ? `Pinned vertex ${hit.row + 1}` : 'Probe cleared');
            }
            else if (drag.mode === 'orbit' && !this.store.reducedMotion && e.type === 'pointerup' && performance.now() - drag.at < 80)
                this.inertia = { vyaw: clamp(drag.vx, -4, 4), vpitch: clamp(drag.vy, -4, 4) };
            this.invalidate();
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('pointerleave', () => { if (!this.drag && this.hover) {
            this.hover = null;
            el.classList.remove('picking');
            this.invalidate();
        } });
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const p = this.local(e);
            const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
            this.zoomBy(Math.exp(clamp(e.deltaY * scale, -240, 240) * 0.0014), p.x, p.y);
        }, { passive: false });
        el.addEventListener('dblclick', () => this.fit());
        el.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey)
                return;
            const step = e.shiftKey ? 0.25 : 0.08;
            let handled = true;
            switch (e.key) {
                case 'ArrowLeft':
                    orbitAbout(this.camera, this.camera.target, step, 0, PITCH_LIMIT);
                    break;
                case 'ArrowRight':
                    orbitAbout(this.camera, this.camera.target, -step, 0, PITCH_LIMIT);
                    break;
                case 'ArrowUp':
                    orbitAbout(this.camera, this.camera.target, 0, -step, PITCH_LIMIT);
                    break;
                case 'ArrowDown':
                    orbitAbout(this.camera, this.camera.target, 0, step, PITCH_LIMIT);
                    break;
                case '+':
                case '=':
                    this.zoomBy(0.85);
                    break;
                case '-':
                case '_':
                    this.zoomBy(1 / 0.85);
                    break;
                case 'f':
                case 'F':
                case 'Home':
                    this.fit();
                    this.say('View fitted');
                    break;
                case '1':
                    this.view('front');
                    break;
                case '2':
                    this.view('side');
                    break;
                case '3':
                    this.view('top');
                    break;
                case '4':
                case '0':
                    this.view('iso');
                    break;
                case 'Escape':
                    if (this.store.probe !== null)
                        this.store.setProbe(null);
                    else
                        handled = false;
                    break;
                default: handled = false;
            }
            if (handled) {
                e.preventDefault();
                this.invalidate();
            }
        });
    }
    say(text) { this.readout.textContent = text; }
    // ------------------------------------------------------------------------------------------------------------------ output
    /** The picture as a PNG, with the overlay, drawn in this very task so the GL buffer is still valid. */
    async snapshot() {
        this.render();
        const out = h('canvas');
        out.width = this.renderer.canvas.width;
        out.height = this.renderer.canvas.height;
        const c = out.getContext('2d');
        this.composite(c);
        return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be encoded.'))), 'image/png'));
    }
    /** Paint the current picture (scene and overlay) onto another canvas of the same size. */
    composite(c) {
        const w = this.renderer.canvas.width, hh = this.renderer.canvas.height;
        c.drawImage(this.renderer.canvas, 0, 0, w, hh);
        c.drawImage(this.overlay, 0, 0, w, hh);
    }
    /** Rows nearest the pointer, for tests that must not depend on pixel hunting. */
    projectVertex(row) {
        const frame = this.store.frame;
        const g = frame?.geometry[row];
        return g ? this.screen([g[0], g[1], g[2]]) : null;
    }
    dispose() { this.renderer.dispose(); }
}
//# sourceMappingURL=viewport.js.map