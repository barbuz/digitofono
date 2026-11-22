import { timbrePositionForHz } from '../mapping/shortAxis';
import { DEFAULT_TONE, type Preset, type PresetId, type ToneState } from '../state/schema';

/**
 * Presets are snapshots of the tone sliders, not runtime modes. Selecting one
 * copies its values into the settings; editing any slider then makes the
 * current state "custom".
 */
function values(patch: Partial<ToneState>): ToneState {
  return { ...DEFAULT_TONE, ...patch };
}

export const PRESETS: Record<PresetId, Preset> = {
  warm: {
    id: 'warm',
    name: 'Warm',
    values: { ...DEFAULT_TONE },
  },
  hollow: {
    id: 'hollow',
    name: 'Hollow',
    values: values({
      timbre: timbrePositionForHz(1800),
      morph: 0.2,
      filterQ: 1.1,
      attack: 0.02,
      decay: 0.3,
      sustain: 0.8,
      release: 0.25,
      darkTilt: 1.1,
      darkEven: 0,
      brightTilt: 1.6,
      brightEven: 0,
    }),
  },
  bell: {
    id: 'bell',
    name: 'Bell',
    values: values({
      timbre: timbrePositionForHz(5000),
      morph: 0.6,
      filterQ: 0.7,
      attack: 0.005,
      decay: 0.9,
      sustain: 0.35,
      release: 0.6,
      darkTilt: 1.6,
      darkEven: 1,
      // The old bell table was odd-only with a slow rolloff; this is the
      // closest point in the parametric family.
      brightTilt: 0.9,
      brightEven: 0,
    }),
  },
  pad: {
    id: 'pad',
    name: 'Pad',
    values: values({
      timbre: timbrePositionForHz(1600),
      morph: 0.4,
      filterQ: 0.8,
      attack: 0.35,
      decay: 0.5,
      sustain: 0.8,
      release: 0.9,
      darkTilt: 1.3,
      darkEven: 0,
      brightTilt: 1.5,
      brightEven: 1,
    }),
  },
  pluck: {
    id: 'pluck',
    name: 'Pluck',
    values: values({
      timbre: timbrePositionForHz(3200),
      morph: 0.5,
      filterQ: 1.0,
      attack: 0.006,
      decay: 0.4,
      sustain: 0,
      release: 0.25,
      darkTilt: 1.8,
      darkEven: 1,
      brightTilt: 1.1,
      brightEven: 1,
    }),
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function isPresetId(id: unknown): id is PresetId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, id);
}
