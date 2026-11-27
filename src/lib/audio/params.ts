import {
  AXIS_TARGETS,
  axisValueForPosition,
  shortAxisToCutoff,
  shortAxisToGain,
  shortAxisToMorph,
  TIMBRE_MAX_HZ,
  TIMBRE_MIN_HZ,
} from '../mapping/shortAxis';
import { harmonyGains, MAX_HARMONY_NOTES } from '../mapping/harmony';
import type { Envelope, Settings, WaveShape } from '../state/schema';

export { TIMBRE_MAX_HZ, TIMBRE_MIN_HZ };

const NO_HARMONY: number[] = new Array(MAX_HARMONY_NOTES).fill(0);

export interface AxisValues {
  cutoffHz: number;
  morph: number;
  level: number;
  /** Level of each harmony note, parallel to `HARMONY_INTERVALS_SEMITONES`. */
  harmony: number[];
  filterQ: number;
  envelope: Envelope;
  waveShape: WaveShape;
  snapStrength: number;
  masterVolume: number;
  reverbAmount: number;
  ensemble: number;
  vibrato: number;
}

/**
 * Resolve the continuous voice parameters from the short-axis position.
 * The selected axis overrides its own stored value; every other parameter keeps
 * its stored value, so any slider can be swept while the rest stay fixed.
 *
 * Envelope fields are sampled when the note starts (and `release` when it
 * ends), because attack, decay and sustain describe an onset rather than a
 * continuously variable sound. The remaining targets follow the finger live.
 */
export function resolveAxes(settings: Settings, shortPos: number): AxisValues {
  const target = AXIS_TARGETS[settings.shortAxis];
  const resolved = {
    ...settings,
    [target.field]: axisValueForPosition(settings.shortAxis, shortPos),
  } as Settings;

  const harmony =
    resolved.harmony === 0
      ? NO_HARMONY
      : harmonyGains(resolved.harmony, resolved.harmonyVoicing);

  return {
    cutoffHz: shortAxisToCutoff(resolved.timbre, { minHz: TIMBRE_MIN_HZ, maxHz: TIMBRE_MAX_HZ }),
    morph: shortAxisToMorph(resolved.morph).brightGain,
    level: shortAxisToGain(resolved.voiceLevel),
    harmony,
    filterQ: resolved.filterQ,
    envelope: {
      attack: resolved.attack,
      decay: resolved.decay,
      sustain: resolved.sustain,
      release: resolved.release,
    },
    waveShape: {
      darkTilt: resolved.darkTilt,
      darkEven: resolved.darkEven,
      brightTilt: resolved.brightTilt,
      brightEven: resolved.brightEven,
    },
    snapStrength: resolved.snapStrength,
    masterVolume: resolved.volume,
    reverbAmount: resolved.reverbAmount,
    ensemble: resolved.ensemble,
    vibrato: resolved.vibrato,
  };
}
