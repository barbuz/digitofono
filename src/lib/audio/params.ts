import { shortAxisToCutoff, shortAxisToGain, shortAxisToMorph } from '../mapping/shortAxis';
import type { Settings } from '../state/schema';
import type { Preset } from '../state/schema';

/** Cutoff sweep bounds for the timbre short axis. */
export const TIMBRE_MIN_HZ = 300;
export const TIMBRE_MAX_HZ = 8000;

export interface AxisValues {
  cutoffHz: number;
  morph: number;
  level: number;
}

/**
 * Resolve the three continuous voice parameters from the short-axis position.
 * Only the selected short axis follows the finger; the others fall back to the
 * preset defaults so a single axis is always in control.
 */
export function resolveAxes(settings: Settings, preset: Preset, shortPos: number): AxisValues {
  let cutoffHz = preset.filterDefaultHz;
  let morph = preset.morphDefault;
  let level = 1;

  switch (settings.shortAxis) {
    case 'timbre':
      cutoffHz = shortAxisToCutoff(shortPos, { minHz: TIMBRE_MIN_HZ, maxHz: TIMBRE_MAX_HZ });
      break;
    case 'harmonicMorph':
      morph = shortAxisToMorph(shortPos).brightGain;
      break;
    case 'volume':
      level = shortAxisToGain(shortPos);
      break;
  }

  return { cutoffHz, morph, level };
}
