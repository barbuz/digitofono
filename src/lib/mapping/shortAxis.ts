import { clamp01 } from './pitch';

/**
 * The numeric performance sliders that can be the short-axis variable. The
 * first four are the tone controls that were always assignable; the rest extend
 * the same idea to the envelope, wave shape and global performance controls.
 * Setup-only sliders such as master volume, octave span and scale-line opacity
 * stay out.
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
  | 'reverbAmount'
  | 'ensemble'
  | 'vibrato';

export interface AxisTarget {
  id: ShortAxisId;
  label: string;
  /** Plain-language help shown in the settings tooltip. */
  description: string;
  field: AxisField;
  /** Range written to `field`. */
  min: number;
  max: number;
  /** Slider step; log targets render a normalized 0..1 slider. */
  step: number;
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
    description:
      'Low-pass filter cutoff, 300 Hz to 8 kHz. Lower is darker and rounder; higher is brighter and more open.',
    field: 'timbre',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.005,
  },
  harmonicMorph: {
    id: 'harmonicMorph',
    label: 'Harmonic morph',
    description:
      'Crossfades the dark and bright wave tables. 0% is the dark table, 100% the bright table; both sound in between.',
    field: 'morph',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.01,
  },
  harmony: {
    id: 'harmony',
    label: 'Harmony (chord)',
    description:
      'Adds harmony notes above the root. 0 is the bare note; higher brings in the third, fifth and seventh. Harmony voicing chooses the intervals.',
    field: 'harmony',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.01,
  },
  volume: {
    id: 'volume',
    label: 'Note level',
    description:
      'Per-note amplitude inside each voice, 0 to 100%. Saved with the tone preset; master volume is the separate overall output level.',
    field: 'voiceLevel',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.01,
  },
  filterQ: {
    id: 'filterQ',
    label: 'Filter resonance',
    description:
      'Filter Q, 0.3 to 3.0. Higher values emphasize frequencies near the cutoff for a sharper, more nasal or whistling tone.',
    field: 'filterQ',
    min: FILTER_Q_MIN,
    max: FILTER_Q_MAX,
    curve: 'linear',
    step: 0.05,
  },
  attack: {
    id: 'attack',
    label: 'Attack',
    description:
      'Time to rise from silence to full level, 5 ms to 1 s. Sampled when the note starts.',
    field: 'attack',
    min: ATTACK_MIN,
    max: ATTACK_MAX,
    curve: 'log',
    step: 0.001,
  },
  decay: {
    id: 'decay',
    label: 'Decay',
    description:
      'Time from the peak down to the sustain level, 20 ms to 2 s. Sampled when the note starts.',
    field: 'decay',
    min: DECAY_MIN,
    max: DECAY_MAX,
    curve: 'log',
    step: 0.001,
  },
  sustain: {
    id: 'sustain',
    label: 'Sustain',
    description:
      'Level held while the finger stays down, 0 to 100%. Follows the finger live after decay.',
    field: 'sustain',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.01,
  },
  release: {
    id: 'release',
    label: 'Release',
    description:
      'Fade-out time after lifting, 20 ms to 3 s. Sampled at lift.',
    field: 'release',
    min: RELEASE_MIN,
    max: RELEASE_MAX,
    curve: 'log',
    step: 0.001,
  },
  darkTilt: {
    id: 'darkTilt',
    label: 'Dark tilt',
    description:
      'How fast the dark oscillator upper harmonics roll off, 0.3 to 3.0. Higher is darker.',
    field: 'darkTilt',
    min: TILT_MIN,
    max: TILT_MAX,
    curve: 'linear',
    step: 0.05,
  },
  darkEven: {
    id: 'darkEven',
    label: 'Dark even partials',
    description:
      'Even-harmonic content in the dark table. 0% is odd-only and hollow; 100% keeps every partial.',
    field: 'darkEven',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.01,
  },
  brightTilt: {
    id: 'brightTilt',
    label: 'Bright tilt',
    description:
      'How fast the bright oscillator upper harmonics roll off, 0.3 to 3.0. Higher is darker.',
    field: 'brightTilt',
    min: TILT_MIN,
    max: TILT_MAX,
    curve: 'linear',
    step: 0.05,
  },
  brightEven: {
    id: 'brightEven',
    label: 'Bright even partials',
    description:
      'Even-harmonic content in the bright table. 0% is odd-only and hollow; 100% keeps every partial.',
    field: 'brightEven',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.01,
  },
  snapStrength: {
    id: 'snapStrength',
    label: 'Snap strength',
    description:
      'How strongly pitch locks to the scale. 0 is free glide; higher corrects small errors; 1 lands on scale degrees.',
    field: 'snapStrength',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.05,
  },
  reverb: {
    id: 'reverb',
    label: 'Reverb',
    description:
      'Amount of reverb/space, 0 to 100%.',
    field: 'reverbAmount',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.02,
  },
  ensemble: {
    id: 'ensemble',
    label: 'Ensemble',
    description:
      'Amount of detuned chorus. Thickens the sound but can blur pitch.',
    field: 'ensemble',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.05,
  },
  vibrato: {
    id: 'vibrato',
    label: 'Vibrato',
    description:
      'Depth of periodic pitch movement. Adds expression and can soften tuning errors.',
    field: 'vibrato',
    min: 0,
    max: 1,
    curve: 'linear',
    step: 0.05,
  },
};

export type SetupSliderId = 'octaveSpan' | 'masterVolume' | 'scaleLines';

export interface SetupTarget {
  id: SetupSliderId;
  /** `Settings` field written by this slider. */
  field: 'octaveSpan' | 'volume' | 'scaleLines';
  label: string;
  /** Plain-language help shown in the settings tooltip. */
  description: string;
  /** Always-visible hint under the slider, when there is one. */
  hint: string;
  min: number;
  max: number;
  step: number;
}

export const SETUP_SLIDER_IDS: SetupSliderId[] = ['octaveSpan', 'masterVolume', 'scaleLines'];

/** Sliders that configure the instrument rather than a performance parameter. */
export const SETUP_TARGETS: Record<SetupSliderId, SetupTarget> = {
  octaveSpan: {
    id: 'octaveSpan',
    field: 'octaveSpan',
    label: 'Octaves',
    description:
      'How many octaves the long axis spans, 1 to 5 in half-octave steps. Changes the pitch range, not the axis variable.',
    hint: '',
    min: 1,
    max: 5,
    step: 0.5,
  },
  masterVolume: {
    id: 'masterVolume',
    field: 'volume',
    label: 'Master volume',
    description:
      'Final output level after all voices and effects, 0 to 100%. Not part of a tone preset.',
    hint: 'overall output; not saved with presets',
    min: 0,
    max: 1,
    step: 0.02,
  },
  scaleLines: {
    id: 'scaleLines',
    field: 'scaleLines',
    label: 'Scale lines',
    description:
      'Opacity of the guide lines at each scale step, 0 to 100%. 0 hides them; purely visual.',
    hint: 'guide lines at each scale step; 0 hides them',
    min: 0,
    max: 1,
    step: 0.05,
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
