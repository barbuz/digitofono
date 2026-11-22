import {
  shortAxisToCutoff,
  shortAxisToGain,
  shortAxisToMorph,
  TIMBRE_MAX_HZ,
  TIMBRE_MIN_HZ,
} from '../mapping/shortAxis';
import { harmonyGains, MAX_HARMONY_NOTES } from '../mapping/harmony';
import type { Settings } from '../state/schema';

export { TIMBRE_MAX_HZ, TIMBRE_MIN_HZ };

const NO_HARMONY: number[] = new Array(MAX_HARMONY_NOTES).fill(0);

export interface AxisValues {
  cutoffHz: number;
  morph: number;
  level: number;
  /** Level of each harmony note, parallel to `HARMONY_INTERVALS_SEMITONES`. */
  harmony: number[];
}

/**
 * Resolve the continuous voice parameters from the short-axis position.
 * Only the selected short axis follows the finger; every other parameter uses
 * its stored value, so all four can be tuned independently.
 */
export function resolveAxes(settings: Settings, shortPos: number): AxisValues {
  const timbre = settings.shortAxis === 'timbre' ? shortPos : settings.timbre;
  const morph = settings.shortAxis === 'harmonicMorph' ? shortPos : settings.morph;
  const harmony = settings.shortAxis === 'harmony' ? shortPos : settings.harmony;
  const level = settings.shortAxis === 'volume' ? shortPos : settings.voiceLevel;

  return {
    cutoffHz: shortAxisToCutoff(timbre, { minHz: TIMBRE_MIN_HZ, maxHz: TIMBRE_MAX_HZ }),
    morph: shortAxisToMorph(morph).brightGain,
    harmony: harmony === 0 ? NO_HARMONY : harmonyGains(harmony, settings.harmonyVoicing),
    level: shortAxisToGain(level),
  };
}
