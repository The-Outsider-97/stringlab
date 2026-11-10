/** Typed calls to the StringLab server. The envelope, the session cookie, the marker header and the error type are the kit's (createClient). */
import { createClient, saveBlob } from './kit.js';
export const client = createClient({ slug: 'stringlab' });
export const api = {
    status: () => client.get('/status'),
    presets: () => client.get('/templates'),
    defaults: () => client.get('/default'),
    series: (configuration, frames) => client.post('/series', { configuration, frames }),
    frame: (configuration, time) => client.post('/frame', { configuration, time }),
    actions: (configuration, samples = 40) => client.post('/actions', { configuration, samples }),
    sweep: (configuration, start, end, steps) => client.post('/sweep', { configuration, start, end, steps }),
    convergence: (configuration, time) => client.post('/convergence', { configuration, time }),
    quantum: (state) => client.post('/quantum', state),
    tdual: (state) => client.post('/tdual', state),
    advanced: (name, body) => client.post(`/advanced/${name}`, body),
    dynamics: (body) => client.post('/advanced/simulate', body),
    experiments: () => client.get('/experiments'),
    experiment: (id) => client.get(`/experiments/${id}`),
    save: (body) => client.post('/experiments', body),
    remove: (id) => client.del(`/experiments/${id}`),
    prefs: (patch) => client.patch('/prefs', patch),
    sgeoScene: (configuration, time, worldsheet) => client.post('/sgeo/scene', { configuration, time, worldsheet }),
    agents: {
        publish: (configuration, time, revision) => client.post('/agents/publish', { configuration, time, revision }),
        stem: (configuration, time, uncertainty) => client.post('/agents/stem', { configuration, time, uncertainty }),
        convert: (value, from, to) => client.post('/agents/convert', { value, from, to }),
        simulate: (configuration, frames, revision) => client.post('/agents/simulate', { configuration, frames, revision }),
        animate: (configuration, beads, keyframes) => client.post('/agents/animate', { configuration, beads, keyframes }),
    },
};
/** Fetch an export (a POST that carries the experiment) and hand it to the browser. Returns the file name the server chose. */
export async function downloadExport(path, body) {
    const file = await client.download(path, undefined, body);
    saveBlob(file.blob, file.filename);
    return file.filename;
}
/** Post a native file (.sgeo or .sdrw) for inspection or display. */
export function postBytes(path, bytes) {
    return client.upload(path, bytes);
}
//# sourceMappingURL=services.js.map