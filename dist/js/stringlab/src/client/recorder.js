/** Records the viewport, as the person sees it, to a WebM file: the run is played once from the start and every drawn frame is composited
 *  (scene and overlay) onto a canvas that the browser's MediaRecorder encodes. */
import { saveBlob } from './kit.js';
export function canRecord() { return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'; }
export function record(viewport, store, onProgress) {
    if (!canRecord())
        throw new Error('This browser cannot record video. The picture can still be saved as a PNG.');
    const out = document.createElement('canvas');
    const px = viewport.pixels;
    out.width = px.width;
    out.height = px.height;
    const c = out.getContext('2d');
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const recorder = new MediaRecorder(out.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks = [];
    recorder.addEventListener('dataavailable', (e) => { if (e.data.size)
        chunks.push(e.data); });
    let raf = 0, finished = false, unsubscribe = () => undefined;
    const previousLoop = store.loop;
    let resolveDone = () => undefined, rejectDone = () => undefined;
    const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    const finish = () => {
        if (finished)
            return;
        finished = true;
        cancelAnimationFrame(raf);
        unsubscribe();
        store.setLoop(previousLoop);
        if (recorder.state !== 'inactive')
            recorder.stop();
    };
    recorder.addEventListener('stop', () => {
        const name = `stringlab_${store.title.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'run'}.webm`;
        if (!chunks.length) {
            rejectDone(new Error('Nothing was recorded.'));
            return;
        }
        saveBlob(new Blob(chunks, { type: type || 'video/webm' }), name);
        resolveDone(name);
    });
    recorder.addEventListener('error', () => rejectDone(new Error('The recording failed.')));
    unsubscribe = store.ticks.on(() => {
        onProgress?.((store.position - store.first) / Math.max(1e-9, store.lastTime - store.first));
        if (!store.clock.playing)
            setTimeout(finish, 250); // let the last frame reach the encoder
    });
    const paint = () => { viewport.render(); c.clearRect(0, 0, out.width, out.height); viewport.composite(c); raf = requestAnimationFrame(paint); };
    store.setLoop('once');
    store.goStart();
    recorder.start(250);
    paint();
    store.togglePlay();
    return { stop: finish, done };
}
//# sourceMappingURL=recorder.js.map