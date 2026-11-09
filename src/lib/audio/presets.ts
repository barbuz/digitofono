import type { Preset, PresetId } from '../state/schema';

/**
 * Harmonic amplitude arrays with rolled-off partials. Combined with the
 * always-on lowpass filter these give warm, glassy tones rather than the
 * buzzy edge of a raw saw or square.
 */
function rolloff(count: number, exponent: number): number[] {
  return Array.from({ length: count }, (_, i) => 1 / Math.pow(i + 1, exponent));
}

/** Odd-partial dominant, hollow (clarinet-ish). */
function oddOnly(count: number, exponent: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    (i + 1) % 2 === 1 ? 1 / Math.pow(i + 1, exponent) : 0,
  );
}

export const PRESETS: Record<PresetId, Preset> = {
  warm: {
    id: 'warm',
    name: 'Warm',
    attack: 0.015,
    decay: 0.25,
    sustain: 0.85,
    release: 0.2,
    filterDefaultHz: 2500,
    filterQ: 0.9,
    morphDefault: 0.35,
    waveDark: oddOnly(16, 1.4),
    waveBright: rolloff(16, 1.2),
  },
  hollow: {
    id: 'hollow',
    name: 'Hollow',
    attack: 0.02,
    decay: 0.3,
    sustain: 0.8,
    release: 0.25,
    filterDefaultHz: 1800,
    filterQ: 1.1,
    morphDefault: 0.2,
    waveDark: oddOnly(16, 1.1),
    waveBright: oddOnly(16, 1.6),
  },
  bell: {
    id: 'bell',
    name: 'Bell',
    attack: 0.005,
    decay: 0.9,
    sustain: 0.35,
    release: 0.6,
    filterDefaultHz: 5000,
    filterQ: 0.7,
    morphDefault: 0.6,
    waveDark: rolloff(16, 1.6),
    waveBright: [
      1, 0.0, 0.5, 0.0, 0.28, 0.0, 0.18, 0.0, 0.12, 0.0, 0.08, 0.0, 0.06, 0.0, 0.04, 0.0,
    ],
  },
  pad: {
    id: 'pad',
    name: 'Pad',
    attack: 0.35,
    decay: 0.5,
    sustain: 0.8,
    release: 0.9,
    filterDefaultHz: 1600,
    filterQ: 0.8,
    morphDefault: 0.4,
    waveDark: oddOnly(16, 1.3),
    waveBright: rolloff(16, 1.5),
  },
  pluck: {
    id: 'pluck',
    name: 'Pluck',
    attack: 0.006,
    decay: 0.4,
    sustain: 0.0,
    release: 0.25,
    filterDefaultHz: 3200,
    filterQ: 1.0,
    morphDefault: 0.5,
    waveDark: rolloff(16, 1.8),
    waveBright: rolloff(16, 1.1),
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
