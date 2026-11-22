import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { DEFAULT_TONE } from './schema';

const STORAGE_KEY = 'digitofono.userPresets.v1';

function installStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  vi.stubGlobal('localStorage', localStorage);
  return store;
}

async function loadPresets() {
  vi.resetModules();
  return import('./userPresets');
}

describe('user presets', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('saves a named preset and persists it', async () => {
    const storage = installStorage();
    const { userPresets, saveUserPreset } = await loadPresets();

    const saved = saveUserPreset('My pad', { ...DEFAULT_TONE, morph: 0.8 });

    expect(saved.name).toBe('My pad');
    expect(get(userPresets)).toHaveLength(1);
    expect(get(userPresets)[0].values.morph).toBeCloseTo(0.8, 9);

    const raw = storage.get(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)[0].name).toBe('My pad');
  });

  it('updates an existing preset with the same name instead of duplicating it', async () => {
    installStorage();
    const { userPresets, saveUserPreset } = await loadPresets();

    const first = saveUserPreset('Lead', { ...DEFAULT_TONE, morph: 0.2 });
    const second = saveUserPreset('lead', { ...DEFAULT_TONE, morph: 0.9 });

    expect(get(userPresets)).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(get(userPresets)[0].values.morph).toBeCloseTo(0.9, 9);
  });

  it('deletes a preset', async () => {
    installStorage();
    const { userPresets, saveUserPreset, deleteUserPreset } = await loadPresets();

    const saved = saveUserPreset('Temporary', DEFAULT_TONE);
    deleteUserPreset(saved.id);

    expect(get(userPresets)).toHaveLength(0);
  });

  it('loads saved presets and fills missing tone fields from the defaults', async () => {
    installStorage({
      [STORAGE_KEY]: JSON.stringify([
        { id: 'user:abc', name: 'Old', values: { morph: 0.7 } },
      ]),
    });
    const { userPresets } = await loadPresets();

    const [preset] = get(userPresets);
    expect(preset.name).toBe('Old');
    expect(preset.values.morph).toBeCloseTo(0.7, 9);
    expect(preset.values.attack).toBeCloseTo(DEFAULT_TONE.attack, 9);
  });

  it('ignores malformed storage', async () => {
    installStorage({ [STORAGE_KEY]: 'not json' });
    const { userPresets } = await loadPresets();
    expect(get(userPresets)).toEqual([]);
  });
});
