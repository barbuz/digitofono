import { writable, get, type Readable } from 'svelte/store';
import { isPresetId, PRESETS } from '../audio/presets';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TONE,
  SETTINGS_VERSION,
  type PresetSelection,
  type Settings,
  type ToneState,
} from './schema';

const STORAGE_KEY = `digitofono.settings.v${SETTINGS_VERSION}`;

function load(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.version !== SETTINGS_VERSION) return { ...DEFAULT_SETTINGS };
    // Older blobs stored only the preset id. Hydrate the new tone fields from
    // that preset instead of from the default, or a saved Bell would load warm.
    const storedTone = isPresetId(parsed.preset) ? PRESETS[parsed.preset].values : DEFAULT_TONE;
    return { ...DEFAULT_SETTINGS, ...storedTone, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persist(value: Settings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); playing still works.
  }
}

function createSettingsStore() {
  const store = writable<Settings>(load());
  store.subscribe(persist);
  return store;
}

export const settings = createSettingsStore();

export function updateSettings(patch: Partial<Settings>): void {
  settings.update((current) => ({ ...current, ...patch }));
}

/** Edit a tone value; the preset selection becomes `custom`. */
export function updateTone(patch: Partial<ToneState>): void {
  settings.update((current) => ({ ...current, ...patch, preset: 'custom' }));
}

/** Apply a preset snapshot, preserving non-tone settings. */
export function applyPreset(preset: { id: PresetSelection; values: ToneState }): void {
  settings.update((current) => ({ ...current, ...preset.values, preset: preset.id }));
}

/** The current tone values, for saving a user preset. */
export function toneValues(value: Settings): ToneState {
  return {
    timbre: value.timbre,
    morph: value.morph,
    harmony: value.harmony,
    voiceLevel: value.voiceLevel,
    filterQ: value.filterQ,
    attack: value.attack,
    decay: value.decay,
    sustain: value.sustain,
    release: value.release,
    darkTilt: value.darkTilt,
    darkEven: value.darkEven,
    brightTilt: value.brightTilt,
    brightEven: value.brightEven,
  };
}

export function resetSettings(): void {
  settings.set({ ...DEFAULT_SETTINGS });
}

export function getSettings(): Settings {
  return get(settings);
}

export type SettingsStore = Readable<Settings>;
