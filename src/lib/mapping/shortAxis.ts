import { clamp01 } from './pitch';

export type ShortAxisId = 'timbre' | 'harmonicMorph' | 'volume';

export const SHORT_AXIS_IDS: ShortAxisId[] = ['timbre', 'harmonicMorph', 'volume'];

export const SHORT_AXIS_LABELS: Record<ShortAxisId, string> = {
  timbre: 'Timbre (brightness)',
  harmonicMorph: 'Harmonic morph',
  volume: 'Volume',
};

export interface TimbreMapping {
  minHz: number;
  maxHz: number;
}

/**
 * Exponential cutoff sweep so the short axis feels even across its travel.
 */
export function shortAxisToCutoff(pos: number, mapping: TimbreMapping): number {
  const t = clamp01(pos);
  return mapping.minHz * Math.pow(mapping.maxHz / mapping.minHz, t);
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
