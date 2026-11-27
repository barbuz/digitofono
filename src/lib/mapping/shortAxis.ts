import { clamp01 } from './pitch';

/**
 * Every numeric settings slider can be the short-axis variable. The first four
 * are the tone controls that were always assignable; the rest extend the same
 * idea to the envelope, wave shape and global performance controls.
 */
export type ShortAxisId =
  | 'timbre'
  | 'harmonicMorph'
  | 'harmony'
  | 'volume'
  | 'filterQ'
  | 'attack'
  | 'decay'
  | 'sustain'
  | 'release'
  | 'darkTilt'
  | 'darkEven'
  | 'brightTilt'
  | 'brightEven'
  | 'snapStrength'
  | 'masterVolume'
  | 'reverb'
  | 'ensemble'
  | 'vibrato';

/** The `Settings` field an axis target writes. */
export type AxisField =
  | 'timbre'
  | 'morph'
  | 'harmony'
  | 'voiceLevel'
  | 'filterQ'
  | 'attack'
  | 'decay'
  | 'sustain'
  | 'release'
  | 'darkTilt'
  | 'darkEven'
  | 'brightTilt'
  | 'brightEven'
  | 'snapStrength'
  | 'volume'
  | 'reverbAmount'
  | 'ensemble'
  | 'vibrato';

export interface AxisTarget {
  id: ShortAxisId;
  label: string;
  field: AxisField;
  min: number;
  max: number;
  curve: 'linear' | 'log';
}

export const SHORT_AXIS_IDS: ShortAxisId[] = [
  'timbre',
  'harmonicMorph',
  'harmony',
  'volume',
  'filterQ',
  'attack',
  'decay',
  'sustain',
  'release',
  'darkTilt',
  'darkEven',
  'brightTilt',
  'brightEven',
  'snapStrength',
  'masterVolume',
  'reverb',
  'ensemble',
  'vibrato',
];

export const FILTER_Q_MIN = 0.3;
export const FILTER_Q_MAX = 3;
export const TILT_MIN = 0.3;
export const TILT_MAX = 3;
export const ATTACK_MIN = 0.005;
export const ATTACK_MAX = 1;
export const DECAY_MIN = 0.02;
export const DECAY_MAX = 2;
export const RELEASE_MIN = 0.02;
export const RELEASE_MAX = 3;

export const AXIS_TARGETS: Record<ShortAxisId, AxisTarget> = {
  timbre: {
    id: 'timbre',
    label: 'Timbre (brightness)',
    field: 'timbre',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  harmonicMorph: {
    id: 'harmonicMorph',
    label: 'Harmonic morph',
    field: 'morph',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  harmony: {
    id: 'harmony',
    label: 'Harmony (chord)',
    field: 'harmony',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  volume: {
    id: 'volume',
    label: 'Touch volume',
    field: 'voiceLevel',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  filterQ: {
    id: 'filterQ',
    label: 'Filter resonance',
    field: 'filterQ',
    min: FILTER_Q_MIN,
    max: FILTER_Q_MAX,
    curve: 'linear',
  },
  attack: {
    id: 'attack',
    label: 'Attack',
    field: 'attack',
    min: ATTACK_MIN,
    max: ATTACK_MAX,
    curve: 'log',
  },
  decay: {
    id: 'decay',
    label: 'Decay',
    field: 'decay',
    min: DECAY_MIN,
    max: DECAY_MAX,
    curve: 'log',
  },
  sustain: {
    id: 'sustain',
    label: 'Sustain',
    field: 'sustain',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  release: {
    id: 'release',
    label: 'Release',
    field: 'release',
    min: RELEASE_MIN,
    max: RELEASE_MAX,
    curve: 'log',
  },
  darkTilt: {
    id: 'darkTilt',
    label: 'Dark tilt',
    field: 'darkTilt',
    min: TILT_MIN,
    max: TILT_MAX,
    curve: 'linear',
  },
  darkEven: {
    id: 'darkEven',
    label: 'Dark even partials',
    field: 'darkEven',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  brightTilt: {
    id: 'brightTilt',
    label: 'Bright tilt',
    field: 'brightTilt',
    min: TILT_MIN,
    max: TILT_MAX,
    curve: 'linear',
  },
  brightEven: {
    id: 'brightEven',
    label: 'Bright even partials',
    field: 'brightEven',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  snapStrength: {
    id: 'snapStrength',
    label: 'Snap strength',
    field: 'snapStrength',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  masterVolume: {
    id: 'masterVolume',
    label: 'Master volume',
    field: 'volume',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  reverb: {
    id: 'reverb',
    label: 'Reverb',
    field: 'reverbAmount',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  ensemble: {
    id: 'ensemble',
    label: 'Ensemble',
    field: 'ensemble',
    min: 0,
    max: 1,
    curve: 'linear',
  },
  vibrato: {
    id: 'vibrato',
    label: 'Vibrato',
    field: 'vibrato',
    min: 0,
    max: 1,
    curve: 'linear',
  },
};

export const SHORT_AXIS_LABELS = Object.fromEntries(
  SHORT_AXIS_IDS.map((id) => [id, AXIS_TARGETS[id].label]),
) as Record<ShortAxisId, string>;

/**
 * Value of an axis target's `Settings` field at a normalized position. Linear
 * targets interpolate directly; log targets sweep exponentially, matching the
 * log-scaled time sliders.
 */
export function axisValueForPosition(id: ShortAxisId, pos: number): number {
  const target = AXIS_TARGETS[id];
  const t = clamp01(pos);
  if (target.curve === 'log') {
    return target.min * Math.pow(target.max / target.min, t);
  }
  return target.min + (target.max - target.min) * t;
}

/** Cutoff sweep bounds for the timbre short axis. */
export const TIMBRE_MIN_HZ = 300;
export const TIMBRE_MAX_HZ = 8000;

export interface TimbreMapping {
  minHz: number;
  maxHz: number;
}

export const TIMBRE_MAPPING: TimbreMapping = {
  minHz: TIMBRE_MIN_HZ,
  maxHz: TIMBRE_MAX_HZ,
};

/**
 * Exponential cutoff sweep so the short axis feels even across its travel.
 */
export function shortAxisToCutoff(pos: number, mapping: TimbreMapping = TIMBRE_MAPPING): number {
  const t = clamp01(pos);
  return mapping.minHz * Math.pow(mapping.maxHz / mapping.minHz, t);
}

/** Inverse of `shortAxisToCutoff`, clamped to the sweep bounds. */
export function timbrePositionForHz(hz: number, mapping: TimbreMapping = TIMBRE_MAPPING): number {
  const clamped = Math.max(mapping.minHz, Math.min(mapping.maxHz, hz));
  return Math.log(clamped / mapping.minHz) / Math.log(mapping.maxHz / mapping.minHz);
}

/** Cutoff in Hz for a normalized timbre position. */
export function timbreHzForPosition(pos: number, mapping: TimbreMapping = TIMBRE_MAPPING): number {
  return shortAxisToCutoff(pos, mapping);
}

/**
 * Key tracking: higher notes stay bright instead of dulling out.
 */
export function trackCutoffForPitch(cutoffHz: number, frequencyHz: number): number {
  const reference = 261.63; // C4
  return cutoffHz * Math.pow(frequencyHz / reference, 0.5);
}

export interface MorphMapping {
  brightGain: number;
  darkGain: number;
}

/** Crossfade weights between the bright and dark harmonic tables. */
export function shortAxisToMorph(pos: number): MorphMapping {
  const t = clamp01(pos);
  return { brightGain: t, darkGain: 1 - t };
}

/** Perceptual loudness curve (simple square approximation). */
export function shortAxisToGain(pos: number): number {
  const t = clamp01(pos);
  return t * t;
}
