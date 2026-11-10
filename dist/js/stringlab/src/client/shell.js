/** The application shell: top bar, experiment library, the 3D stage with its toolbar, transport, the lower panels, the inspector and the status bar.
 *  It only arranges views and routes events; every number comes from the store. */
import { announce, glyph, h, openMenu, registerGlyph, saveBlob, toast } from './kit.js';
import { exportDialog, importDialog, importNative, openLibrary, saveExperiment, settingsDialog, shortcutsDialog } from './dialogs.js';
import { Inspector } from './inspector.js';
import { canRecord, record } from './recorder.js';
import { api } from './services.js';
import { errorText } from './store.js';
import { Transport } from './transport.js';
import { Viewport } from './viewport.js';
import { agentsPanel } from './panels/agents.js';
import { advancedPanel } from './panels/advanced.js';
import { analysisPanel } from './panels/analysis.js';
import { comparePanel } from './panels/compare.js';
import { dynamicsPanel } from './panels/dynamics.js';
import { mathPanel } from './panels/math.js';
import { plotsPanel } from './panels/plots.js';
import { quantumPanel } from './panels/quantum.js';
import { resultsPanel } from './panels/results.js';
registerGlyph('fit', ['M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9', 'M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9', 'M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15', 'M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15']);
registerGlyph('cube', ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9']);
registerGlyph('camera', ['M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z', 'M12 10a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z']);
registerGlyph('video', ['M4 7.5A1.5 1.5 0 0 1 5.5 6h8A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16.5z', 'M15 10.5l5-3v9l-5-3']);
registerGlyph('expand', ['M5 9V5h4', 'M15 5h4v4', 'M19 15v4h-4', 'M9 19H5v-4']);
registerGlyph('axes', ['M5 19V5', 'M5 19h14', 'M5 19l7-7']);
registerGlyph('sheet', ['M4 7c4-3 8 3 16 0v10c-8 3-12-3-16 0z']);
registerGlyph('help', ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7', 'M12 16.8h.01']);
registerGlyph('orbit', ['M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M4 12c0-3 3.6-5 8-5s8 2 8 5-3.6 5-8 5-8-2-8-5z']);
const TABS = [
    { id: 'results', label: 'Results', make: resultsPanel }, { id: 'plots', label: 'Charts', make: plotsPanel }, { id: 'math', label: 'Math', make: mathPanel },
    { id: 'quantum', label: 'Quantum', make: quantumPanel }, { id: 'analysis', label: 'Sweeps', make: analysisPanel }, { id: 'compare', label: 'Compare', make: comparePanel },
    { id: 'advanced', label: 'Advanced', make: advancedPanel }, { id: 'dynamics', label: 'Dynamics', make: dynamicsPanel }, { id: 'agents', label: 'SLAI agents', make: agentsPanel },
];
const TAB_KEY = 'stringlab.tab';
const remembered = () => { try {
    return localStorage.getItem(TAB_KEY) ?? '';
}
catch {
    return '';
} };
const remember = (id) => { try {
    localStorage.setItem(TAB_KEY, id);
}
catch { /* private mode: the tab is simply not remembered */ } };
export class Shell {
    root;
    store;
    viewport;
    filter = 'all';
    presetHost = h('nav', { class: 'presets', attrs: { 'aria-label': 'Experiments' } });
    savedHost = h('div', { class: 'saved-list' });
    title = h('h1', {});
    eyebrow = h('div', { class: 'eyebrow' });
    objective = h('p', { class: 'objective' });
    sourceBadge = h('span', { class: 'badge' });
    statusText = h('span', { class: 'grow clip', attrs: { role: 'status', 'aria-live': 'polite' } });
    statusRight = h('span', { class: 'clip muted' });
    tabs = h('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Scientific workspace' } });
    panelHost = h('section', { class: 'panel-body', attrs: { 'aria-live': 'off' } });
    panels = new Map();
    active = TABS[0]?.id;
    recording = null;
    recordButton = null;
    toggles = {};
    tickScheduled = false;
    constructor(root, store, forceRenderer) {
        this.root = root;
        this.store = store;
        this.viewport = new Viewport(store, forceRenderer);
        const known = TABS.find((t) => t.id === remembered());
        if (known)
            this.active = known.id;
        this.build();
        store.events.on((e) => this.onEvent(e));
        store.ticks.on(() => this.onTick());
        this.renderPresets();
        void this.loadSaved();
        this.renderHead();
        this.renderStatus();
        this.showTab(this.active, false);
        this.keys();
        this.dropFiles();
    }
    // ------------------------------------------------------------------------------------------------------------------ layout
    build() {
        const s = this.store;
        const top = (icon, label, run, kind = '') => h('button', { class: `btn small${kind}`, type: 'button', on: { click: (e) => run(e.currentTarget) } }, glyph(icon), h('span', { class: 'label', text: label }));
        const header = h('header', { class: 'topbar' }, h('button', { class: 'iconbtn narrow-only', type: 'button', attrs: { 'aria-label': 'Experiments', 'aria-controls': 'library' }, on: { click: () => this.drawer('library') } }, glyph('menu')), h('div', { class: 'brand' }, h('span', { class: 'mark', text: '∿', attrs: { 'aria-hidden': 'true' } }), h('div', {}, h('strong', {}, 'SLAI ', h('span', { class: 'accent', text: 'StringLab' })), h('small', { text: 'Computational string physics' }))), h('div', { class: 'grow' }), top('plus', 'New', () => { const first = s.presets[0]; if (first)
            s.applyPreset(first); }), top('save', 'Save', () => { void saveExperiment(s); }), top('archive', 'Library', () => { void openLibrary(s); }), top('upload', 'Open', () => importDialog(s)), top('download', 'Export', () => exportDialog(s, { screenshot: () => this.screenshot(), record: canRecord() ? () => this.startRecording() : null })), h('button', { class: 'iconbtn', type: 'button', attrs: { 'aria-label': 'Keyboard and mouse help', title: 'Help (?)' }, on: { click: () => shortcutsDialog() } }, glyph('help')), h('button', { class: 'iconbtn', type: 'button', attrs: { 'aria-label': 'Settings', title: 'Settings' }, on: { click: () => settingsDialog(s) } }, glyph('settings')), h('button', { class: 'iconbtn narrow-only', type: 'button', attrs: { 'aria-label': 'Parameters', 'aria-controls': 'inspector' }, on: { click: () => this.drawer('inspector') } }, glyph('layout')));
        const library = h('aside', { class: 'library', attrs: { id: 'library', 'aria-label': 'Experiment library' } }, h('div', { class: 'pane-head' }, h('span', { class: 'eyebrow', text: 'Experiments' }), h('span', { class: 'muted', text: `${s.presets.length} workflows` })), h('div', { class: 'chips filters', attrs: { role: 'group', 'aria-label': 'Filter experiments' } }, ['all', 'classical', 'quantum'].map((f) => h('button', { class: 'chip', type: 'button', text: f[0]?.toUpperCase() + f.slice(1), attrs: { 'aria-pressed': String(f === this.filter) }, on: { click: (e) => { this.filter = f; e.currentTarget.parentElement?.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget))); this.renderPresets(); } } }))), this.presetHost, h('div', { class: 'pane-head' }, h('span', { class: 'eyebrow', text: 'Saved' })), this.savedHost, h('p', { class: 'hint pad', text: 'Mathematical models, computed locally. They are not experimental proof.' }));
        const stage = h('div', { class: 'stage', attrs: { id: 'stage' } }, this.viewport.el, this.toolbar());
        const centre = h('main', { class: 'centre' }, h('div', { class: 'stage-head' }, h('div', { class: 'grow' }, this.eyebrow, this.title, this.objective), this.sourceBadge), stage, new Transport(s).el, h('div', { class: 'lower' }, this.tabs, this.panelHost));
        const inspector = h('aside', { class: 'inspector', attrs: { id: 'inspector', 'aria-label': 'Parameters' } }, h('div', { class: 'pane-head' }, h('span', { class: 'eyebrow', text: 'Parameters' })), new Inspector(s).el);
        const footer = h('footer', { class: 'statusbar' }, h('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }), this.statusText, this.statusRight);
        this.root.replaceChildren(header, h('div', { class: 'work' }, library, centre, inspector), footer);
        this.buildTabs();
        if (s.status.notices.length)
            this.root.prepend(h('div', { class: 'banner' }, ...s.status.notices.map((n) => h('div', { class: 'notice warn' }, glyph('info'), h('div', { class: 'grow', text: n.text })))));
    }
    drawer(which) {
        const work = this.root.querySelector('.work');
        if (!work)
            return;
        const open = work.getAttribute('data-open') === which;
        if (open)
            work.removeAttribute('data-open');
        else
            work.setAttribute('data-open', which);
    }
    toolbar() {
        const s = this.store, vp = this.viewport;
        const button = (id, icon, label, run, pressed) => {
            const b = h('button', { class: 'iconbtn', type: 'button', attrs: { 'aria-label': label, title: label, ...(pressed === undefined ? {} : { 'aria-pressed': String(pressed) }) }, on: { click: () => run(b) } }, glyph(icon));
            this.toggles[id] = b;
            return b;
        };
        const views = [['front', 'Front'], ['side', 'Side'], ['top', 'Top'], ['iso', 'Isometric']];
        const pref = (key) => s.setPrefs({ [key]: !s.prefs[key] });
        return h('div', { class: 'toolbar', attrs: { role: 'toolbar', 'aria-label': 'Viewport' } }, button('fit', 'fit', 'Fit to the whole run (F)', () => vp.fit()), button('views', 'cube', 'Standard views (1–4)', (b) => openMenu(b, views.map(([v, l], i) => ({ label: `${l}  ${i + 1}`, run: () => vp.view(v) })), { label: 'Views' })), button('ortho', 'layout', 'Orthographic camera', () => s.setPrefs({ camera_mode: s.prefs.camera_mode === 'orthographic' ? 'perspective' : 'orthographic' }), s.prefs.camera_mode === 'orthographic'), button('grid', 'grid', 'Grid', () => pref('show_grid'), s.prefs.show_grid), button('axes', 'axes', 'Axes', () => pref('show_axes'), s.prefs.show_axes), button('sheet', 'sheet', 'Worldsheet', () => pref('show_worldsheet'), s.prefs.show_worldsheet), button('orbit', 'orbit', 'Slow auto-orbit', () => s.setPrefs({ auto_orbit: !s.prefs.auto_orbit }), s.prefs.auto_orbit), button('sgeo', 'cube', 'Validate through the SLAI SGEO library and show that snapshot', () => { void this.toggleNative(); }, false), h('span', { class: 'sep', attrs: { 'aria-hidden': 'true' } }), button('shot', 'camera', 'Save a picture (PNG)', () => { void this.screenshot().then((n) => toast(`Saved ${n}`, { kind: 'ok' })).catch((e) => toast(errorText(e), { kind: 'error' })); }), ...(canRecord() ? [(this.recordButton = button('rec', 'video', 'Record the run as a video (WebM)', () => { void this.toggleRecording(); }, false))] : []), button('full', 'expand', 'Full screen', () => { if (document.fullscreenElement)
            void document.exitFullscreen();
        else
            void (this.viewport.el.parentElement ?? this.viewport.el).requestFullscreen?.(); }));
    }
    async toggleNative() {
        const s = this.store;
        if (s.nativeScene) {
            s.setNative(null);
            return;
        }
        if (!s.status.formats.sgeo) {
            toast('The SLAI SGEO library is not available here.', { kind: 'error' });
            return;
        }
        if (s.source.kind === 'dynamics') {
            toast('The canonical SGEO snapshot covers the Fourier experiment; nonlinear runs use the live renderer.', { kind: 'error' });
            return;
        }
        try {
            const scene = await api.sgeoScene(s.config, s.exportTime(), s.prefs.show_worldsheet);
            if (!scene.valid_native_document)
                throw new Error('The SGEO scene failed validation.');
            s.setNative(scene);
            announce(`SGEO snapshot validated: ${scene.segments.length} segments`);
        }
        catch (e) {
            toast(errorText(e), { kind: 'error' });
        }
    }
    // ------------------------------------------------------------------------------------------------------------------ tabs and panels
    buildTabs() {
        this.tabs.replaceChildren(...TABS.map((t) => h('button', { class: 'tab', type: 'button', text: t.label, id: `tab-${t.id}`, attrs: { role: 'tab', 'aria-controls': 'panel', 'aria-selected': String(t.id === this.active), tabindex: t.id === this.active ? '0' : '-1' },
            on: { click: () => this.showTab(t.id), keydown: (e) => {
                    const i = TABS.findIndex((x) => x.id === t.id);
                    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
                    if (next === null)
                        return;
                    e.preventDefault();
                    const target = TABS[(next + TABS.length) % TABS.length];
                    if (target) {
                        this.showTab(target.id);
                        this.tabs.querySelector(`#tab-${target.id}`)?.focus();
                    }
                } } })));
        this.panelHost.setAttribute('role', 'tabpanel');
        this.panelHost.id = 'panel';
    }
    showTab(id, store = true) {
        const tab = TABS.find((t) => t.id === id) ?? TABS[0];
        this.active = tab.id;
        if (store)
            remember(tab.id);
        this.tabs.querySelectorAll('.tab').forEach((b) => { const on = b.id === `tab-${tab.id}`; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        this.panelHost.setAttribute('aria-labelledby', `tab-${tab.id}`);
        let panel = this.panels.get(tab.id);
        if (!panel) {
            panel = tab.make(this.store);
            this.panels.set(tab.id, panel);
        }
        this.panelHost.replaceChildren(panel.el);
        panel.refresh?.('meta');
    }
    // ------------------------------------------------------------------------------------------------------------------ events
    onEvent(event) {
        if (event === 'meta') {
            this.renderHead();
            this.renderPresets();
        }
        if (event === 'saved')
            void this.loadSaved();
        if (event === 'status' || event === 'frames' || event === 'meta' || event === 'error' || event === 'native' || event === 'agents')
            this.renderStatus();
        if (event === 'prefs' || event === 'native')
            this.syncToggles();
        const reason = event === 'config' ? 'config' : event;
        this.panels.get(this.active)?.refresh?.(reason);
        if (event === 'meta' && this.store.source.kind === 'solver' && this.store.status && this.store.presetId && this.store.quantum && this.store.presets.find((p) => p.id === this.store.presetId)?.quantum && this.active === 'results')
            this.showTab('quantum', false);
    }
    onTick() {
        if (this.tickScheduled)
            return;
        this.tickScheduled = true;
        requestAnimationFrame(() => { this.tickScheduled = false; this.panels.get(this.active)?.refresh?.('tick'); this.renderStatus(true); });
    }
    syncToggles() {
        const p = this.store.prefs, t = this.toggles;
        t.ortho?.setAttribute('aria-pressed', String(p.camera_mode === 'orthographic'));
        t.grid?.setAttribute('aria-pressed', String(p.show_grid));
        t.axes?.setAttribute('aria-pressed', String(p.show_axes));
        t.sheet?.setAttribute('aria-pressed', String(p.show_worldsheet));
        t.orbit?.setAttribute('aria-pressed', String(p.auto_orbit));
        t.sgeo?.setAttribute('aria-pressed', String(!!this.store.nativeScene));
    }
    renderHead() {
        const s = this.store;
        this.eyebrow.textContent = s.category.toUpperCase();
        this.title.textContent = s.title + (s.savedId ? ` · rev ${s.savedRevision}` : '');
        this.objective.textContent = s.objective;
        const kind = s.source.kind;
        this.sourceBadge.className = `badge ${kind === 'simulation' ? 'tone-green' : kind === 'dynamics' ? 'tone-violet' : 'tone-blue'}`;
        this.sourceBadge.textContent = kind === 'simulation' ? 'Simulation Agent rollout' : kind === 'dynamics' ? s.source.label : s.source.label;
        document.title = `${s.title} · SLAI StringLab`;
    }
    renderPresets() {
        const s = this.store;
        this.presetHost.replaceChildren(...s.presets.filter((p) => (this.filter === 'quantum' ? !!p.quantum : this.filter === 'classical' ? !p.quantum : true)).map((p) => h('button', { class: 'preset', type: 'button', title: p.objective, attrs: { 'aria-current': String(s.presetId === p.id && !s.savedId) }, on: { click: () => { s.applyPreset(p); this.root.querySelector('.work')?.removeAttribute('data-open'); } } }, h('span', { class: 'index', text: String(p.id).padStart(2, '0') }), h('span', { class: 'text' }, h('strong', { text: p.title.replace(/^\d+ · /, '') }), h('em', { text: p.category })))));
    }
    async loadSaved() {
        try {
            const list = await api.experiments();
            this.savedHost.replaceChildren(...(list.length ? list.slice(0, 12).map((e) => h('button', { class: 'preset slim', type: 'button', attrs: { 'aria-current': String(this.store.savedId === e.id) }, on: { click: () => { void this.store.loadSaved(e.id).catch((err) => toast(errorText(err), { kind: 'error' })); } } }, h('span', { class: 'text' }, h('strong', { text: e.title }), h('em', { text: `revision ${e.revision}` })))) : [h('p', { class: 'hint pad', text: 'Nothing saved yet. Save an experiment to reopen it here.' })]));
        }
        catch {
            this.savedHost.replaceChildren(h('p', { class: 'hint pad', text: 'The library could not be read.' }));
        }
    }
    renderStatus(light = false) {
        const s = this.store;
        if (!light || !this.statusText.textContent) {
            const f = s.frame;
            this.statusText.textContent = s.busy ?? (s.error ? `Error: ${s.error}` : f ? `${s.source.label} · ${s.frames.length} frames · ${f.status.replaceAll('_', ' ')}` : 'Ready');
        }
        const agents = s.agents.agents.filter((a) => a.available).length;
        this.statusRight.textContent = `${this.viewport.kind === 'webgl2' ? 'WebGL2' : '2D canvas'} · ${agents}/${s.agents.agents.length} agents · ${s.nativeScene ? 'SGEO snapshot' : 'live'}`;
        this.root.classList.toggle('busy', !!s.busy);
    }
    // ------------------------------------------------------------------------------------------------------------------ output
    fileStem() { return this.store.title.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'stringlab'; }
    async screenshot() {
        const blob = await this.viewport.snapshot();
        const name = `stringlab_${this.fileStem()}.png`;
        saveBlob(blob, name);
        return name;
    }
    async toggleRecording() {
        if (this.recording) {
            this.recording.stop();
            return;
        }
        try {
            toast(`Recorded ${await this.startRecording()}`, { kind: 'ok' });
        }
        catch (e) {
            toast(errorText(e), { kind: 'error' });
        }
    }
    startRecording() {
        const rec = record(this.viewport, this.store, (f) => { this.statusText.textContent = `Recording… ${Math.round(f * 100)} %`; });
        this.recording = rec;
        this.recordButton?.setAttribute('aria-pressed', 'true');
        return rec.done.finally(() => { this.recording = null; this.recordButton?.setAttribute('aria-pressed', 'false'); this.renderStatus(); });
    }
    // ------------------------------------------------------------------------------------------------------------------ keys and files
    keys() {
        const s = this.store;
        document.addEventListener('keydown', (e) => {
            const t = e.target;
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey)
                return;
            if (t && (t.closest('dialog') || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.getAttribute('role') === 'tab' || t.closest('.menu'))) {
                if (!(t && t.tagName === 'INPUT' && t.type === 'range' && e.key === ' '))
                    return;
            }
            if (t && t.tagName === 'BUTTON' && e.key === ' ')
                return; // Space on a button presses it
            if (e.key === ' ') {
                e.preventDefault();
                s.togglePlay();
            }
            else if (e.key === 'ArrowRight' && !t?.closest('.viewport')) {
                e.preventDefault();
                s.step(1);
            }
            else if (e.key === 'ArrowLeft' && !t?.closest('.viewport')) {
                e.preventDefault();
                s.step(-1);
            }
            else if (e.key === 'Home' && !t?.closest('.viewport')) {
                e.preventDefault();
                s.goStart();
            }
            else if (e.key === 'End') {
                e.preventDefault();
                s.goEnd();
            }
            else if (e.key === '?') {
                e.preventDefault();
                shortcutsDialog();
            }
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden)
            s.pause(); });
        window.addEventListener('resize', () => this.root.querySelector('.work')?.removeAttribute('data-open'));
    }
    dropFiles() {
        const over = (e) => { if (e.dataTransfer?.types.includes('Files')) {
            e.preventDefault();
            this.root.classList.add('dropping');
        } };
        window.addEventListener('dragenter', over);
        window.addEventListener('dragover', over);
        window.addEventListener('dragleave', (e) => { if (e.target === document.documentElement || !e.relatedTarget)
            this.root.classList.remove('dropping'); });
        window.addEventListener('drop', (e) => {
            this.root.classList.remove('dropping');
            const file = e.dataTransfer?.files[0];
            if (!file)
                return;
            e.preventDefault();
            importNative(this.store, file, true).catch((err) => toast(errorText(err), { kind: 'error' }));
        });
    }
}
//# sourceMappingURL=shell.js.map