import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { clearSongScale, getSongScale, setSongScale, songScale } from './songScale';
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from './schema';
import type { SongScale } from '../mapping/songScale';

const song: SongScale = {
  pitchClasses: [0, 2, 4, 7, 9],
  tonic: 0,
  scale: 'majorPentatonic',
  label: 'C major pentatonic',
  confidence: 0.8,
  candidates: [],
  baseMidi: 54,
  octaveSpan: 2.5,
  tuningCents: 0,
  lowMidi: 55,
  highMidi: 79,
};

describe('songScale store', () => {
  beforeEach(() => clearSongScale());

  it('starts empty', () => {
    expect(getSongScale()).toBeNull();
    expect(get(songScale).song).toBeNull();
  });

  it('holds a learned scale until it is cleared', () => {
    setSongScale(song);
    expect(get(songScale).song).toEqual(song);
    clearSongScale();
    expect(getSongScale()).toBeNull();
  });

  it('stays out of the persisted settings, so the version need not move', () => {
    // A learned scale is a per-session experiment, not a preference: keeping it
    // out of `Settings` is what lets this feature ship without a version bump
    // that would wipe every existing install's settings.
    expect('songScale' in DEFAULT_SETTINGS).toBe(false);
    expect(SETTINGS_VERSION).toBe(3);
  });
});
