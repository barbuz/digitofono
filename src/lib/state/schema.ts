import type { HarmonyVoicing } from '../mapping/harmony';
import type { ScaleId } from '../mapping/scales';
import { timbrePositionForHz, type ShortAxisId } from '../mapping/shortAxis';

export type PresetId = 'warm' | 'hollow' | 'bell' | 'pad' | 'pluck';

/** User presets are stored separately from the settings blob. */
export type UserPresetId = `user:${string}`;

/** What the preset dropdown shows: a built-in, a saved preset, or edited state. */
export type PresetSelection = PresetId | 'custom' | UserPresetId;

export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/**
 * Every value a preset controls. A preset is a snapshot of these fields;
 * the settings are the source of truth at runtime.
 */
export interface ToneState extends Envelope {
  /** Timbre position, 0..1 on the 300..8000 Hz exponential cutoff curve. */
  timbre: number;
  /** Harmonic-morph position, 0..1. */
  morph: number;
  /** Harmony amount, 0..1 (0 = bare note, 1 = full chord). */
  harmony: number;
  /** Per-note level, 0..1. */
  voiceLevel: number;
  filterQ: number;
  /** Dark table: odd-partial rolloff exponent and even-partial weight. */
  darkTilt: number;
  darkEven: number;
  /** Bright table: odd-partial rolloff exponent and even-partial weight. */
  brightTilt: number;
  brightEven: number;
}

export interface Preset {
  id: PresetId;
  name: string;
  values: ToneState;
}

/** The four harmonic-table controls a preset can set. */
export type WaveShape = Pick<ToneState, 'darkTilt' | 'darkEven' | 'brightTilt' | 'brightEven'>;

export interface UserPreset {
  id: UserPresetId;
  name: string;
  values: ToneState;
}

export interface Settings extends ToneState {
  version: number;
  baseMidi: number;
  octaveSpan: number;
  scale: ScaleId;
  snapStrength: number;
  shortAxis: ShortAxisId;
  /** How harmony notes are chosen when the harmony amount is above zero. */
  harmonyVoicing: HarmonyVoicing;
  volume: number;
  reverbAmount: number;
  /**
   * Strength of the detuned-unison chorus, 0..1. Blurs the pitch so small
   * tuning errors are heard as a shimmer rather than a wrong note.
   */
  ensemble: number;
  /** Depth of the global pitch vibrato, 0..1. */
  vibrato: number;
  /** Opacity (0..1) of the guide lines drawn at each scale step; 0 hides them. */
  scaleLines: number;
  /**
   * Listen to the microphone and highlight the pitch being played around the
   * instrument. Off by default: it needs a permission prompt, so it must never
   * be part of the first-gesture path.
   */
  listen: boolean;
  /** Last applied preset; `custom` once any tone slider is edited. */
  preset: PresetSelection;
}

export const SETTINGS_VERSION = 2;

/** The warm preset's values, which are also the fresh-install defaults. */
export const DEFAULT_TONE: ToneState = {
  timbre: timbrePositionForHz(2500),
  morph: 0.35,
  harmony: 0,
  voiceLevel: 1,
  filterQ: 0.9,
  attack: 0.015,
  decay: 0.25,
  sustain: 0.85,
  release: 0.2,
  darkTilt: 1.4,
  darkEven: 0,
  brightTilt: 1.2,
  brightEven: 1,
};

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  ...DEFAULT_TONE,
  baseMidi: 48,
  octaveSpan: 3,
  scale: 'chromatic',
  snapStrength: 0.2,
  shortAxis: 'timbre',
  harmonyVoicing: 'diatonic',
  volume: 0.8,
  reverbAmount: 0.12,
  ensemble: 0.75,
  vibrato: 0.2,
  scaleLines: 0.5,
  listen: false,
  preset: 'warm',
};
