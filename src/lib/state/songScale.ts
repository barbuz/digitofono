import { writable, get, type Readable } from 'svelte/store';
import type { SongScale } from '../mapping/songScale';

/**
 * The scale learned from a song, for this session only.
 *
 * Deliberately not part of `Settings`: that store is persisted, and a learned
 * scale is an experiment the player tries against one track, not a preference.
 * Keeping it out also means adding it needed no `SETTINGS_VERSION` bump, so no
 * existing install loses its settings.
 */
export interface SongScaleState {
  /** The learned scale, or null when the instrument is on a built-in scale. */
  song: SongScale | null;
}

const store = writable<SongScaleState>({ song: null });

export const songScale: Readable<SongScaleState> = { subscribe: store.subscribe };

export function setSongScale(song: SongScale | null): void {
  store.set({ song });
}

export function clearSongScale(): void {
  store.set({ song: null });
}

export function getSongScale(): SongScale | null {
  return get(store).song;
}
