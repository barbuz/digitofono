import { shortAxisToCutoff, shortAxisToGain, shortAxisToMorph } from '../mapping/shortAxis';
import { MAX_HARMONY_NOTES, harmonyGains } from '../mapping/harmony';
import type { Settings } from '../state/schema';
import type { Preset } from '../state/schema';

/** Cutoff sweep bounds for the timbre short axis. */
export const TIMBRE_MIN_HZ = 300;
export const TIMBRE_MAX_HZ = 8000;

export interface AxisValues {
  cutoffHz: number;
  morph: number;
  level: number;
  /** Level of each harmony note, parallel to `HARMONY_INTERVALS_SEMITONES`. */
  harmony: number[];
}

/** Harmony notes are silent unless the harmony axis is selected. */
const NO_HARMONY: number[] = new Array(MAX_HARMONY_NOTES).fill(0);

/**
 * Resolve the continuous voice parameters from the short-axis position.
 * Only the selected short axis follows the finger; the others fall back to the
 * preset defaults so a single axis is always in control.
 */
export function resolveAxes(settings: Settings, preset: Preset, shortPos: number): AxisValues {
  let cutoffHz = preset.filterDefaultHz;
  let morph = preset.morphDefault;
  let level = 1;
  let harmony = NO_HARMONY;

  switch (settings.shortAxis) {
    case 'timbre':
      cutoffHz = shortAxisToCutoff(shortPos, { minHz: TIMBRE_MIN_HZ, maxHz: TIMBRE_MAX_HZ });
      break;
    case 'harmonicMorph':
      morph = shortAxisToMorph(shortPos).brightGain;
      break;
    case 'harmony':
      harmony = harmonyGains(shortPos, settings.harmonyVoicing);
      break;
    case 'volume':
      level = shortAxisToGain(shortPos);
      break;
  }

  return { cutoffHz, morph, level, harmony };
}
