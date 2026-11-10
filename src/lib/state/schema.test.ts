import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from './schema';

describe('default settings', () => {
  it('carries the version it declares', () => {
    expect(DEFAULT_SETTINGS.version).toBe(SETTINGS_VERSION);
  });

  it('starts with the tuned ear defaults', () => {
    expect(DEFAULT_SETTINGS.ensemble).toBe(0.75);
    expect(DEFAULT_SETTINGS.snapStrength).toBe(0.2);
    expect(DEFAULT_SETTINGS.scaleLines).toBe(0.5);
  });

  it('has no polyphony setting, since the voice cap is fixed', () => {
    expect('polyphony' in DEFAULT_SETTINGS).toBe(false);
  });
});
