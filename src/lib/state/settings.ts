import { writable, get, type Readable } from 'svelte/store';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type Settings } from './schema';

const STORAGE_KEY = 'digitofono.settings.v1';

function load(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.version !== SETTINGS_VERSION) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...parsed };
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

export function resetSettings(): void {
  settings.set({ ...DEFAULT_SETTINGS });
}

export function getSettings(): Settings {
  return get(settings);
}

export type SettingsStore = Readable<Settings>;
