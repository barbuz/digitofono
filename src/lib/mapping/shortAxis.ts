import { clamp01 } from './pitch';

export type ShortAxisId = 'timbre' | 'harmonicMorph' | 'harmony' | 'volume';

export const SHORT_AXIS_IDS: ShortAxisId[] = ['timbre', 'harmonicMorph', 'harmony', 'volume'];

export const SHORT_AXIS_LABELS: Record<ShortAxisId, string> = {
  timbre: 'Timbre (brightness)',
  harmonicMorph: 'Harmonic morph',
  harmony: 'Harmony (chord)',
  volume: 'Volume',
};

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
