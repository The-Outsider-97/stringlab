/** Typed calls to the StringLab server. The envelope, the session cookie, the marker header and the error type are the kit's (createClient). */
import { createClient, saveBlob, type Client } from './kit.js';
import type { AnimationResult, Config, Frame, NativeScene, Preset, Saved, SavedExperiment, SimulationResult, StemAnalysis, Status, Prefs } from './types.js';

export const client: Client = createClient({ slug: 'stringlab' });

export const api = {
  status: () => client.get<Status>('/status'),
  presets: () => client.get<Preset[]>('/templates'),
  defaults: () => client.get<{ classical: Config; quantum: Record<string, unknown> }>('/default'),
  series: (configuration: Config, frames: number) => client.post<Frame[]>('/series', { configuration, frames }),
  frame: (configuration: Config, time: number) => client.post<Frame>('/frame', { configuration, time }),
  actions: (configuration: Config, samples = 40) => client.post<Record<string, unknown>>('/actions', { configuration, samples }),
  sweep: (configuration: Config, start: number, end: number, steps: number) => client.post<Array<Record<string, unknown>>>('/sweep', { configuration, start, end, steps }),
  convergence: (configuration: Config, time: number) => client.post<Array<Record<string, unknown>>>('/convergence', { configuration, time }),
  quantum: (state: Record<string, unknown>) => client.post<Record<string, unknown>>('/quantum', state),
  tdual: (state: Record<string, unknown>) => client.post<Record<string, unknown>>('/tdual', state),
  advanced: (name: string, body: unknown) => client.post<Record<string, unknown>>(`/advanced/${name}`, body),
  dynamics: (body: Record<string, unknown>) => client.post<Frame[]>('/advanced/simulate', body),
  experiments: () => client.get<Saved[]>('/experiments'),
  experiment: (id: string) => client.get<SavedExperiment>(`/experiments/${id}`),
  save: (body: Record<string, unknown>) => client.post<{ id: string; revision: number; title: string }>('/experiments', body),
  remove: (id: string) => client.del<{ deleted: string }>(`/experiments/${id}`),
  prefs: (patch: Partial<Prefs>) => client.patch<Prefs>('/prefs', patch),
  sgeoScene: (configuration: Config, time: number, worldsheet: boolean) => client.post<NativeScene>('/sgeo/scene', { configuration, time, worldsheet }),
  agents: {
    publish: (configuration: Config, time: number, revision: number) => client.post<{ published: boolean; result: Record<string, unknown>; error?: string }>('/agents/publish', { configuration, time, revision }),
    stem: (configuration: Config, time: number, uncertainty: { amplitude: number; alpha_prime: number }) => client.post<StemAnalysis>('/agents/stem', { configuration, time, uncertainty }),
    convert: (value: number, from: string, to: string) => client.post<{ result: number; from: string; to: string }>('/agents/convert', { value, from, to }),
    simulate: (configuration: Config, frames: number, revision: number) => client.post<SimulationResult>('/agents/simulate', { configuration, frames, revision }),
    animate: (configuration: Config, beads: number, keyframes: number) => client.post<AnimationResult>('/agents/animate', { configuration, beads, keyframes }),
  },
};

/** Fetch an export (a POST that carries the experiment) and hand it to the browser. Returns the file name the server chose. */
export async function downloadExport(path: string, body: unknown): Promise<string> {
  const file = await client.download(path, undefined, body);
  saveBlob(file.blob, file.filename);
  return file.filename;
}

/** Post a native file (.sgeo or .sdrw) for inspection or display. */
export function postBytes<T>(path: string, bytes: ArrayBuffer): Promise<T> {
  return client.upload<T>(path, bytes);
}
