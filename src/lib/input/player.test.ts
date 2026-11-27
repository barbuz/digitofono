import { describe, expect, it } from 'vitest';
import { Player, TAP_MS, type SurfaceGeometry } from './player';
import type { AudioEngine } from '../audio/AudioEngine';
import { DEFAULT_SETTINGS, type Settings } from '../state/schema';
import {
  ATTACK_MAX,
  ATTACK_MIN,
  FILTER_Q_MAX,
  FILTER_Q_MIN,
  RELEASE_MAX,
} from '../mapping/shortAxis';

/**
 * Exercises the Player's touch bookkeeping - the layer where the "every second
 * tap is lost" and "first note sticks forever" bugs lived. The engine is
 * replaced with a recorder so the assertions stay on the real routing logic:
 * that every press is registered, and that every press is eventually released.
 */

class RecordingVoice {
  started = 0;
  lastFrequency = 0;
  releases: boolean[] = [];
  releaseTimes: (number | undefined)[] = [];
  lastFilterQ = 0;
  lastEnvelope: { attack: number; decay: number; sustain: number; release: number } | null = null;
  lastSustain: number | null = null;
  lastWaves: unknown = null;
  lastStartWaves: unknown = null;
  /** Params of the last `start`, so tests can assert what the Player built. */
  lastParams: {
    harmonyRatios: number[];
    harmonyLevels: number[];
    filterQ: number;
    envelope: { attack: number; decay: number; sustain: number; release: number };
  } | null = null;

  start(params: {
    frequency: number;
    harmonyRatios: number[];
    harmonyLevels: number[];
    filterQ: number;
    envelope: { attack: number; decay: number; sustain: number; release: number };
    waveDark: unknown;
    waveBright: unknown;
  }): void {
    this.started += 1;
    this.lastFrequency = params.frequency;
    this.lastFilterQ = params.filterQ;
    this.lastEnvelope = params.envelope;
    this.lastStartWaves = { dark: params.waveDark, bright: params.waveBright };
    this.lastParams = params;
  }

  glideFrequency(): void {}
  setMorph(): void {}
  setHarmony(): void {}
  setCutoff(): void {}
  setLevel(): void {}
  setFilterQ(q: number): void {
    this.lastFilterQ = q;
  }
  setSustain(value: number): void {
    this.lastSustain = value;
  }
  setWaves(dark: unknown, bright: unknown): void {
    this.lastWaves = { dark, bright };
  }

  release(asPluck: boolean, releaseSeconds?: number): void {
    this.releases.push(asPluck);
    this.releaseTimes.push(releaseSeconds);
  }
}

class RecordingEngine {
  voices: RecordingVoice[] = [];
  masterVolumes: number[] = [];
  reverbAmounts: number[] = [];
  private pool: RecordingVoice[] = [];

  ensureRunning(): Promise<void> {
    return Promise.resolve();
  }

  allocate(): RecordingVoice {
    const free = this.pool.find((v) => v.releases.length > 0);
    if (free) {
      free.releases = [];
      free.releaseTimes = [];
      this.voices.push(free);
      return free;
    }
    const voice = new RecordingVoice();
    this.pool.push(voice);
    this.voices.push(voice);
    return voice;
  }

  get currentWaveDark(): unknown {
    return {};
  }

  get currentWaveBright(): unknown {
    return {};
  }

  wavesFor(): { dark: unknown; bright: unknown } {
    return { dark: {}, bright: {} };
  }

  setWaveShape(): void {}
  setMasterVolume(value: number): void {
    this.masterVolumes.push(value);
  }
  setReverbAmount(value: number): void {
    this.reverbAmounts.push(value);
  }
  setEnsemble(): void {}
  setVibrato(): void {}
}

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  snapStrength: 0.6,
  shortAxis: 'timbre',
  ensemble: 0.3,
  scaleLines: 0,
};

const geometry: SurfaceGeometry = {
  longLength: 800,
  shortLength: 400,
  longIsVertical: true,
};

function makePlayer() {
  const engine = new RecordingEngine();
  const player = new Player(settings, geometry, {}, engine as unknown as AudioEngine);
  return { engine, player };
}

describe('Player touch routing', () => {
  it('starts a voice and registers a touch on every press', () => {
    const { engine, player } = makePlayer();

    player.pointerDown(1, 200, 400);
    player.pointerDown(2, 210, 500);

    expect(engine.voices).toHaveLength(2);
    expect(engine.voices[0].started).toBe(1);
    expect(engine.voices[1].started).toBe(1);
  });

  it('releases every voice it starts, leaving none stuck', () => {
    const { engine, player } = makePlayer();

    // Three consecutive quick taps. Under the old pool-reuse bug the second
    // press threw and its voice was never released.
    for (const id of [1, 2, 3]) {
      player.pointerDown(id, 200, 400);
      player.pointerUp(id);
    }

    expect(engine.voices).toHaveLength(3);
    for (const voice of engine.voices) {
      expect(voice.releases).toHaveLength(1);
    }
  });

  it('treats a quick lift as a pluck and a long hold as a sustained release', () => {
    const { engine, player } = makePlayer();

    player.pointerDown(1, 200, 400);
    player.pointerUp(1);
    expect(engine.voices[0].releases[0]).toBe(true);

    player.pointerDown(2, 200, 400);
    // Simulate a long press by moving the recorded start time backwards.
    (player as unknown as { touches: Map<number, { startTime: number }> }).touches.get(2)!.startTime -=
      TAP_MS + 500;
    player.pointerUp(2);
    expect(engine.voices[1].releases[0]).toBe(false);
  });

  it('ignores a move or release for an unknown pointer', () => {
    const { player } = makePlayer();
    expect(() => {
      player.pointerMove(99, 100, 100);
      player.pointerUp(99);
    }).not.toThrow();
  });
});

describe('Player harmony wiring', () => {
  function makeHarmonyPlayer(patch: Partial<Settings> = {}) {
    const engine = new RecordingEngine();
    const harmonySettings: Settings = { ...settings, shortAxis: 'harmony', ...patch };
    const player = new Player(harmonySettings, geometry, {}, engine as unknown as AudioEngine);
    return { engine, player };
  }

  it('passes one ratio per harmony note when the harmony axis is active', () => {
    const { engine, player } = makeHarmonyPlayer();

    player.pointerDown(1, 200, 400);

    const ratios = engine.voices[0].lastParams!.harmonyRatios;
    // A major seventh chord: three notes above the root.
    expect(ratios).toHaveLength(3);
    // Ascending, all above the root.
    expect(ratios[0]).toBeGreaterThan(1);
    expect(ratios[1]).toBeGreaterThan(ratios[0]);
    expect(ratios[2]).toBeGreaterThan(ratios[1]);
  });

  it('passes no ratios when another axis is selected and harmony is off', () => {
    const { engine, player } = makeHarmonyPlayer({ shortAxis: 'timbre', harmony: 0 });

    player.pointerDown(1, 200, 400);

    expect(engine.voices[0].lastParams!.harmonyRatios).toEqual([]);
  });

  it('builds ratios on the harmony axis even at position 0', () => {
    const { engine, player } = makeHarmonyPlayer();

    player.pointerDown(1, 0, 400);

    expect(engine.voices[0].lastParams!.harmonyRatios).toHaveLength(3);
    expect(engine.voices[0].lastParams!.harmonyLevels).toEqual([0, 0, 0]);
  });

  it('passes ratios when a fixed harmony amount is set off-axis', () => {
    const { engine, player } = makeHarmonyPlayer({ shortAxis: 'timbre', harmony: 0.5 });

    player.pointerDown(1, 200, 400);

    expect(engine.voices[0].lastParams!.harmonyRatios).toHaveLength(3);
    expect(engine.voices[0].lastParams!.harmonyLevels.some((level) => level > 0)).toBe(true);
  });

  it('uses the fixed major voicing regardless of the scale', () => {
    const { engine, player } = makeHarmonyPlayer({
      scale: 'naturalMinor',
      harmonyVoicing: 'major',
    });

    player.pointerDown(1, 200, 400);

    const ratios = engine.voices[0].lastParams!.harmonyRatios;
    // Major third, fifth and seventh, as ratios of the root.
    expect(ratios[0]).toBeCloseTo(Math.pow(2, 4 / 12), 6);
    expect(ratios[1]).toBeCloseTo(Math.pow(2, 7 / 12), 6);
    expect(ratios[2]).toBeCloseTo(Math.pow(2, 11 / 12), 6);
  });

  it('puts the octaves voicing an octave below, one and two above the root', () => {
    const { engine, player } = makeHarmonyPlayer({ harmonyVoicing: 'octaves' });

    player.pointerDown(1, 200, 400);

    const ratios = engine.voices[0].lastParams!.harmonyRatios;
    expect(ratios[0]).toBeCloseTo(0.5, 6);
    expect(ratios[1]).toBeCloseTo(2, 6);
    expect(ratios[2]).toBeCloseTo(4, 6);
  });
});

describe('Player song scale', () => {
  it('plays the built-in scale when no song is loaded', () => {
    const { engine, player } = makePlayer();
    // Chromatic, so every semitone is reachable: a position mid-range lands on
    // the semitone nearest to the raw continuous pitch.
    player.pointerDown(1, 200, 400);
    expect(engine.voices[0].lastFrequency).toBeGreaterThan(0);
  });

  it('snaps to the song pitch classes once one is loaded', () => {
    const { engine, player } = makePlayer();
    // A song using only C, E and G. With full snap strength every touch must
    // land on one of those three pitch classes.
    player.updateSongScale([0, 4, 7]);
    player.updateSettings({ ...settings, snapStrength: 1 });

    const allowed = new Set([0, 4, 7]);
    for (const y of [120, 200, 300, 400, 500, 620]) {
      player.pointerDown(y, 200, y);
      const midi = Math.round(69 + 12 * Math.log2(engine.voices.at(-1)!.lastFrequency / 440));
      expect(allowed.has(((midi % 12) + 12) % 12)).toBe(true);
      player.pointerUp(y);
    }
  });

  it('returns to the built-in scale when the song scale is cleared', () => {
    const { engine, player } = makePlayer();
    player.updateSongScale([0, 4, 7]);
    player.updateSettings({ ...settings, scale: 'major', snapStrength: 1 });
    player.updateSongScale(null);

    player.pointerDown(1, 200, 260);
    const midi = Math.round(69 + 12 * Math.log2(engine.voices.at(-1)!.lastFrequency / 440));
    // C major contains D (2) which the C major triad does not.
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(((midi % 12) + 12) % 12);
  });

  it('ignores an empty song scale instead of muting the instrument', () => {
    const { engine, player } = makePlayer();
    player.updateSongScale([]);
    player.pointerDown(1, 200, 400);
    expect(engine.voices[0].started).toBe(1);
    expect(engine.voices[0].lastFrequency).toBeGreaterThan(0);
  });
});

describe('Player generalized axis wiring', () => {
  function makeAxisPlayer(patch: Partial<Settings>) {
    const engine = new RecordingEngine();
    const axisSettings: Settings = { ...settings, ...patch };
    const player = new Player(axisSettings, geometry, {}, engine as unknown as AudioEngine);
    return { engine, player };
  }

  it('sweeps filter resonance with the short axis', () => {
    const { engine, player } = makeAxisPlayer({ shortAxis: 'filterQ' });

    player.pointerDown(1, 0, 400);
    expect(engine.voices[0].lastFilterQ).toBeCloseTo(FILTER_Q_MIN, 9);

    player.pointerDown(2, 400, 400);
    expect(engine.voices[1].lastFilterQ).toBeCloseTo(FILTER_Q_MAX, 9);
  });

  it('samples attack from the axis position when the note starts', () => {
    const { engine, player } = makeAxisPlayer({ shortAxis: 'attack' });

    player.pointerDown(1, 0, 400);
    expect(engine.voices[0].lastEnvelope!.attack).toBeCloseTo(ATTACK_MIN, 9);

    player.pointerDown(2, 400, 400);
    expect(engine.voices[1].lastEnvelope!.attack).toBeCloseTo(ATTACK_MAX, 9);
  });

  it('uses the release axis position at lift', () => {
    const { engine, player } = makeAxisPlayer({ shortAxis: 'release' });

    player.pointerDown(1, 400, 400);
    // Make it a sustained release, not a pluck.
    (player as unknown as { touches: Map<number, { startTime: number }> }).touches.get(1)!.startTime -=
      TAP_MS + 500;
    player.pointerUp(1);

    expect(engine.voices[0].releaseTimes[0]).toBeCloseTo(RELEASE_MAX, 9);
    expect(engine.voices[0].releases[0]).toBe(false);
  });

  it('applies a global axis value to the engine', () => {
    const { engine, player } = makeAxisPlayer({ shortAxis: 'reverb' });
    engine.reverbAmounts.length = 0;

    player.pointerDown(1, 400, 400);

    expect(engine.reverbAmounts.at(-1)).toBeCloseTo(1, 9);
  });

  it('applies master volume from settings, never from the axis', () => {
    const { engine, player } = makeAxisPlayer({ volume: 0.3 });
    expect(engine.masterVolumes.at(-1)).toBeCloseTo(0.3, 9);

    engine.masterVolumes.length = 0;
    player.pointerDown(1, 400, 400);

    expect(engine.masterVolumes).toHaveLength(0);
  });

  it('drives sustain live once the note has passed its decay', () => {
    const { engine, player } = makeAxisPlayer({ shortAxis: 'sustain', sustain: 0.5 });

    player.pointerDown(1, 0, 400);
    player.pointerMove(1, 400, 400);

    expect(engine.voices[0].lastSustain).toBeCloseTo(1, 9);
  });

  it('passes per-voice waves resolved from the axis', () => {
    const { engine, player } = makeAxisPlayer({ shortAxis: 'darkTilt' });

    player.pointerDown(1, 0, 400);

    expect(engine.voices[0].lastStartWaves).not.toBeNull();
  });
});
