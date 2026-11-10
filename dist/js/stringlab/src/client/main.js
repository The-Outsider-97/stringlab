/** Entry point: load the experiment state from the local server, build the shell, and tell the startup screen how it went. */
import { Shell } from './shell.js';
import { Store, errorText } from './store.js';
const say = (message, progress) => { window.dispatchEvent(new CustomEvent('slai:startup-update', { detail: { message, progress } })); };
async function start() {
    const root = document.getElementById('app');
    if (!root)
        throw new Error('The page is missing its #app element.');
    say('Reading the experiment library…', 0.2);
    const store = new Store();
    await store.load();
    say('Preparing the 3D view…', 0.6);
    const renderer = new URLSearchParams(location.search).get('renderer');
    const shell = new Shell(root, store, renderer === '2d' ? 'canvas2d' : undefined);
    say('Computing the first run…', 0.85);
    await store.compute(true);
    window.stringlab = { store, shell }; // handles for the browser tests and for debugging
    window.dispatchEvent(new CustomEvent('slai:ready'));
}
start().catch((error) => {
    console.error(error);
    window.dispatchEvent(new CustomEvent('slai:startup-error', { detail: `StringLab could not start: ${errorText(error)} Start it from the SLAI launcher or with python -m applications.stringlab.` }));
});
//# sourceMappingURL=main.js.map