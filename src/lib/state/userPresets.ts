import { writable, get } from 'svelte/store';
import { DEFAULT_TONE, type ToneState, type UserPreset, type UserPresetId } from './schema';

const STORAGE_KEY = 'digitofono.userPresets.v1';

function isUserPreset(value: unknown): value is UserPreset {
  if (!value || typeof value !== 'object') return false;
  const preset = value as Partial<UserPreset>;
  return (
    typeof preset.id === 'string' &&
    preset.id.startsWith('user:') &&
    typeof preset.name === 'string' &&
    !!preset.values &&
    typeof preset.values === 'object'
  );
}

function load(): UserPreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUserPreset).map((preset) => ({
      ...preset,
      values: { ...DEFAULT_TONE, ...preset.values },
    }));
  } catch {
    return [];
  }
}

function persist(value: UserPreset[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); presets live in memory only.
  }
}

function createUserPresetStore() {
  const store = writable<UserPreset[]>(load());
  store.subscribe(persist);
  return store;
}

export const userPresets = createUserPresetStore();

function newId(): UserPresetId {
  const random = Math.random().toString(36).slice(2, 8);
  return `user:${Date.now().toString(36)}-${random}`;
}

/**
 * Save the current tone values under a name. A name already in use updates that
 * preset instead of creating a duplicate.
 */
export function saveUserPreset(name: string, values: ToneState): UserPreset {
  const trimmed = name.trim() || 'My preset';
  const list = get(userPresets);
  const existing = list.find((preset) => preset.name.toLowerCase() === trimmed.toLowerCase());

  const saved: UserPreset = existing
    ? { ...existing, name: trimmed, values: { ...values } }
    : { id: newId(), name: trimmed, values: { ...values } };

  userPresets.set(
    existing ? list.map((preset) => (preset.id === existing.id ? saved : preset)) : [...list, saved],
  );
  return saved;
}

export function deleteUserPreset(id: string): void {
  userPresets.update((list) => list.filter((preset) => preset.id !== id));
}

export function findUserPreset(id: string): UserPreset | undefined {
  return get(userPresets).find((preset) => preset.id === id);
}

export function isUserPresetId(id: unknown): id is UserPresetId {
  return typeof id === 'string' && id.startsWith('user:');
}
