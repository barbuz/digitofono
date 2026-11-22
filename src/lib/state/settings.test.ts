import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESETS } from '../audio/presets';

/**
 * The store reads localStorage at module load, so each case installs a stub and
 * re-imports the module. Without a version bump a stored blob wins over the new
 * defaults, which is the whole reason the key and version move together.
 */
function installStorage(seed: Record<string, string>) {
  const store = new Map(Object.entries(seed));
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  vi.stubGlobal('localStorage', localStorage);
  return store;
}

async function loadStore() {
  vi.resetModules();
  return import('./settings');
}

describe('settings persistence', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to defaults when nothing is stored', async () => {
    installStorage({});
    const { getSettings } = await loadStore();
    expect(getSettings().ensemble).toBe(0.75);
    expect(getSettings().preset).toBe('warm');
  });

  it('discards settings saved by an older version', async () => {
    // A v1 blob with the old defaults; the version bump must ignore it so the
    // new defaults actually reach a device that has played before.
    installStorage({
      'digitofono.settings.v1': JSON.stringify({
        version: 1,
        ensemble: 0.3,
        snapStrength: 0.6,
        scaleLines: 0,
      }),
    });

    const { getSettings } = await loadStore();
    expect(getSettings().ensemble).toBe(0.75);
    expect(getSettings().snapStrength).toBe(0.2);
    expect(getSettings().scaleLines).toBe(0.5);
  });

  it('keeps settings saved by the current version', async () => {
    installStorage({
      'digitofono.settings.v2': JSON.stringify({ version: 2, ensemble: 0.1, volume: 0.42 }),
    });

    const { getSettings } = await loadStore();
    expect(getSettings().ensemble).toBe(0.1);
    expect(getSettings().volume).toBe(0.42);
    // Untouched fields still come from the defaults.
    expect(getSettings().snapStrength).toBe(0.2);
  });

  it('fills in a newly added field from the defaults without a version bump', async () => {
    // A v2 blob written before `harmonyVoicing` existed. The additive field must
    // fall back to the default via the merge, so the version need not move.
    installStorage({
      'digitofono.settings.v2': JSON.stringify({ version: 2, shortAxis: 'harmony' }),
    });

    const { getSettings } = await loadStore();
    expect(getSettings().shortAxis).toBe('harmony');
    expect(getSettings().harmonyVoicing).toBe('diatonic');
    // `listen` is likewise additive and must default to off for an old blob.
    expect(getSettings().listen).toBe(false);
  });

  it('hydrates tone values from the saved preset for an older blob', async () => {
    // A blob from before tone values moved into settings. It only knows the
    // preset id, so the new fields must come from that preset, not from warm.
    installStorage({
      'digitofono.settings.v2': JSON.stringify({ version: 2, preset: 'bell' }),
    });

    const { getSettings } = await loadStore();
    expect(getSettings().preset).toBe('bell');
    expect(getSettings().timbre).toBeCloseTo(PRESETS.bell.values.timbre, 9);
    expect(getSettings().attack).toBeCloseTo(PRESETS.bell.values.attack, 9);
    expect(getSettings().brightEven).toBe(PRESETS.bell.values.brightEven);
  });
});

describe('preset selection', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('applies every tone value from a preset', async () => {
    installStorage({});
    const { applyPreset, getSettings } = await loadStore();

    applyPreset(PRESETS.pad);
    const current = getSettings();
    expect(current.preset).toBe('pad');
    expect(current.timbre).toBeCloseTo(PRESETS.pad.values.timbre, 9);
    expect(current.morph).toBeCloseTo(PRESETS.pad.values.morph, 9);
    expect(current.attack).toBeCloseTo(PRESETS.pad.values.attack, 9);
    expect(current.darkTilt).toBeCloseTo(PRESETS.pad.values.darkTilt, 9);
  });

  it('marks the preset custom when a tone value is edited', async () => {
    installStorage({});
    const { updateTone, getSettings } = await loadStore();

    updateTone({ morph: 0.91 });
    expect(getSettings().preset).toBe('custom');
    expect(getSettings().morph).toBeCloseTo(0.91, 9);
  });

  it('does not mark the preset custom for a non-tone setting', async () => {
    installStorage({});
    const { updateSettings, getSettings } = await loadStore();

    updateSettings({ reverbAmount: 0.5 });
    expect(getSettings().preset).toBe('warm');
    expect(getSettings().reverbAmount).toBe(0.5);
  });
});
