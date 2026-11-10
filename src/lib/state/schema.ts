import type { ScaleId } from '../mapping/scales';
import type { ShortAxisId } from '../mapping/shortAxis';

export type PresetId = 'warm' | 'hollow' | 'bell' | 'pad' | 'pluck';

export interface Preset {
  id: PresetId;
  name: string;
  /** ADSR, seconds (sustain is a 0-1 level). */
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Filter defaults when timbre is NOT the short axis. */
  filterDefaultHz: number;
  filterQ: number;
  /** Morph position when harmonic morph is NOT the short axis. */
  morphDefault: number;
  /** Harmonic amplitudes (index 0 = fundamental). */
  waveDark: number[];
  waveBright: number[];
}

export interface Settings {
  version: number;
  baseMidi: number;
  octaveSpan: number;
  scale: ScaleId;
  snapStrength: number;
  shortAxis: ShortAxisId;
  volume: number;
  reverbAmount: number;
  /** Opacity (0..1) of the guide lines drawn at each scale step; 0 hides them. */
  scaleLines: number;
  polyphony: number;
  preset: PresetId;
}

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  baseMidi: 48,
  octaveSpan: 3,
  scale: 'chromatic',
  snapStrength: 0.6,
  shortAxis: 'timbre',
  volume: 0.8,
  reverbAmount: 0.12,
  scaleLines: 0,
  polyphony: 8,
  preset: 'warm',
};
