/** Data shapes exchanged with the StringLab server (the Python engine owns every number; the client changes projection, never physics). */
export type Kind = 'open' | 'closed';
export type Solver = 'analytical' | 'finite_difference';

export interface Mode { n: number; axis: number; enabled: boolean; amplitude?: number; phase?: number; left?: number; right?: number; phase_left?: number; phase_right?: number }

export interface Config {
  schema: number; kind: Kind; theory: string; dimensions: number; p_plus: number; alpha_prime: number; bc: string;
  zero_velocity: number[]; anchor_start: number[]; anchor_end: number[]; modes: Mode[]; solver: Solver; points: number; dt: number;
  duration: number; projection: string[]; display: { worldsheet: boolean; grid: boolean; color: string }; description: string;
}

export interface Frame {
  time: number; requested_time?: number; geometry: number[][]; projection: string[]; projection_kind: string; closed: boolean; status: string;
  diagnostics: Record<string, unknown>; solver: string; samples: number; model_assumptions?: string;
}

export interface Preset { id: number; kind: Kind; title: string; category: string; objective: string; configuration: Config; quantum: Record<string, unknown> | null; limitation: string | null }
export interface Saved { id: string; revision: number; title: string; updated_utc: string }
export interface SavedExperiment { id: string; revision: number; title: string; configuration: Config; quantum: Record<string, unknown> | null; numerical?: Record<string, unknown> | null }

export interface Prefs {
  theme: 'system' | 'light' | 'dark' | 'contrast'; scale: number; motion: 'system' | 'reduce'; speed: number; loop: boolean; trail: number; beads: number;
  camera_mode: 'perspective' | 'orthographic'; colour_by: ColourBy; show_grid: boolean; show_axes: boolean; show_worldsheet: boolean; auto_orbit: boolean;
  source: 'solver' | 'simulation';
}
export type ColourBy = 'plain' | 'speed' | 'energy' | 'depth';

export interface AgentRow { key: string; label: string; purpose: string; present: boolean; available: boolean; reason?: string }
export interface AgentStatus {
  agents: AgentRow[]; not_used: Array<{ label: string; why: string }>; recent_calls: Array<{ agent: string; operation: string; request_id: string | null }>;
  deterministic_core_requires_agents: boolean; shared_memory: boolean; last_error: string | null; connected: boolean;
}

export interface Status {
  name: string; version: string; formats: { sgeo: boolean; sdrw: boolean; pdf: boolean; sldc: boolean }; optional_agents: AgentStatus; prefs: Prefs;
  notices: Array<{ kind: string; text: string }>; slai: { slaiRoot: string | null; sldc: { available: boolean } }; storage: { dataDir: string };
}

export interface StemAnalysis {
  agent: string; time: number; configuration_sha256: string;
  scales: { rows: Array<{ key: string; label: string; magnitude: number; unit: string }>; dimensionless_check: { expression: string; value: number; passed: boolean } };
  quadrature: { method: string; intervals: number; agent_energy: number; solver_energy: number; relative_difference: number; tolerance: number; passed: boolean };
  wave_residual: { method: string; points: Array<{ sigma: number; tau: number; residual: number }>; max_abs: number; relative: number; tolerance?: number; passed: boolean; note?: string };
  sensitivity: { available: boolean; note?: string; energy?: number; inputs?: Array<{ name: string; value: number; relative_uncertainty: number; d_energy: number }>;
    combined_standard_uncertainty?: number; relative_combined?: number | null; closed_form_check?: { law: string; relative_error: number; passed: boolean } };
  note: string;
}

export interface SimulationResult {
  frames: Frame[]; published: boolean; note: string;
  provenance: { run_id: string; seed: number; deterministic: boolean; termination: string; transitions: number; model: string; solver_steps: number; steps_per_frame: number; dt: number; state_axes: number[]; configuration_sha256: string };
  verification: { rollout_matches_direct_solver: boolean; max_abs_difference: number; max_rms_error_vs_analytical: number; relative_energy_drift: number; cfl: number };
}

export interface AnimationResult {
  agent: string; schema_key: string; duration: number; times: number[]; keyframes: number; agent_revision: number | null;
  beads: Array<{ id: string; sigma_index: number; positions: number[][] }>;
  verification: { samples: number; max_distance: number; relative_to_extent: number; passed: boolean; note: string };
}

export interface NativeScene {
  format: 'slai.sgeo'; source: 'canonical_roundtrip' | 'canonical_import'; valid_native_document: boolean; digest_sha256: string; time: number | null;
  segments: Array<{ id: string; start: number[]; end: number[] }>; mesh?: { vertices: number[][]; faces: number[][] } | null; units?: string; geometry_scope?: string;
}

export const MODE_LIMIT = 32;
