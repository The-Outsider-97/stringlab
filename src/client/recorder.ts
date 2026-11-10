/** Records the viewport, as the person sees it, to a WebM file: the run is played once from the start and every drawn frame is composited
 *  (scene and overlay) onto a canvas that the browser's MediaRecorder encodes. */
import { saveBlob } from './kit.js';
import type { Store } from './store.js';
import type { Viewport } from './viewport.js';

export function canRecord(): boolean { return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'; }

export interface Recording { stop(): void; done: Promise<string> }

export function record(viewport: Viewport, store: Store, onProgress?: (fraction: number) => void): Recording {
  if (!canRecord()) throw new Error('This browser cannot record video. The picture can still be saved as a PNG.');
  const out = document.createElement('canvas');
  const px = viewport.pixels;
  out.width = px.width; out.height = px.height;
  const c = out.getContext('2d') as CanvasRenderingContext2D;
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const recorder = new MediaRecorder(out.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (e) => { if (e.data.size) chunks.push(e.data); });
  let raf = 0, finished = false, unsubscribe = (): void => undefined;
  const previousLoop = store.loop;
  let resolveDone: (name: string) => void = () => undefined, rejectDone: (error: Error) => void = () => undefined;
  const done = new Promise<string>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });

  const finish = (): void => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    unsubscribe();
    store.setLoop(previousLoop);
    if (recorder.state !== 'inactive') recorder.stop();
  };
  recorder.addEventListener('stop', () => {
    const name = `stringlab_${store.title.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'run'}.webm`;
    if (!chunks.length) { rejectDone(new Error('Nothing was recorded.')); return; }
    saveBlob(new Blob(chunks, { type: type || 'video/webm' }), name);
    resolveDone(name);
  });
  recorder.addEventListener('error', () => rejectDone(new Error('The recording failed.')));
  unsubscribe = store.ticks.on(() => {
    onProgress?.((store.position - store.first) / Math.max(1e-9, store.lastTime - store.first));
    if (!store.clock.playing) setTimeout(finish, 250);          // let the last frame reach the encoder
  });

  const paint = (): void => { viewport.render(); c.clearRect(0, 0, out.width, out.height); viewport.composite(c); raf = requestAnimationFrame(paint); };
  store.setLoop('once');
  store.goStart();
  recorder.start(250);
  paint();
  store.togglePlay();
  return { stop: finish, done };
}
