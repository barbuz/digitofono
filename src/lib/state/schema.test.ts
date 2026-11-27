import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_TONE, SETTINGS_VERSION } from './schema';
import { PRESETS } from '../audio/presets';
import { timbrePositionForHz } from '../mapping/shortAxis';

describe('default settings', () => {
  it('carries the version it declares', () => {
    expect(DEFAULT_SETTINGS.version).toBe(SETTINGS_VERSION);
  });

  it('starts with the tuned ear defaults', () => {
    expect(DEFAULT_SETTINGS.ensemble).toBe(0.75);
    expect(DEFAULT_SETTINGS.snapStrength).toBe(0.2);
    expect(DEFAULT_SETTINGS.scaleLines).toBe(0.5);
    expect(DEFAULT_SETTINGS.shortAxis).toBe('harmony');
  });

  it('has no polyphony setting, since the voice cap is fixed', () => {
    expect('polyphony' in DEFAULT_SETTINGS).toBe(false);
  });

  it('uses the warm preset as its tone defaults', () => {
    expect(DEFAULT_SETTINGS.preset).toBe('warm');
    expect(DEFAULT_TONE).toEqual(PRESETS.warm.values);
    expect(DEFAULT_SETTINGS.timbre).toBeCloseTo(timbrePositionForHz(2500), 9);
  });
});
