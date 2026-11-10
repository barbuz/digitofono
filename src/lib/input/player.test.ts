import { describe, expect, it } from 'vitest';
import { Player, TAP_MS, type SurfaceGeometry } from './player';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Settings } from '../state/schema';

/**
 * Exercises the Player's touch bookkeeping - the layer where the "every second
 * tap is lost" and "first note sticks forever" bugs lived. The engine is
 * replaced with a recorder so the assertions stay on the real routing logic:
 * that every press is registered, and that every press is eventually released.
 */

class RecordingVoice {
  started = 0;
  releases: boolean[] = [];
  /** Params of the last `start`, so tests can assert what the Player built. */
  lastParams: { harmonyRatios: number[]; harmonyLevels: number[] } | null = null;

  start(params: { harmonyRatios: number[]; harmonyLevels: number[] }): void {
    this.started += 1;
    this.lastParams = params;
  }

  glideFrequency(): void {}
  setMorph(): void {}
  setHarmony(): void {}
  setCutoff(): void {}
  setLevel(): void {}

  release(asPluck: boolean): void {
    this.releases.push(asPluck);
  }
}

class RecordingEngine {
  voices: RecordingVoice[] = [];
  private pool: RecordingVoice[] = [];

  ensureRunning(): Promise<void> {
    return Promise.resolve();
  }

  allocate(): RecordingVoice {
    const free = this.pool.find((v) => v.releases.length > 0);
    if (free) {
      free.releases = [];
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

  setPreset(): void {}
  setMasterVolume(): void {}
  setReverbAmount(): void {}
  setEnsemble(): void {}
  setVibrato(): void {}
}

const settings: Settings = {
  version: 2,
  baseMidi: 48,
  octaveSpan: 3,
  scale: 'chromatic',
  snapStrength: 0.6,
  shortAxis: 'timbre',
  harmonyVoicing: 'diatonic',
  volume: 0.8,
  reverbAmount: 0.12,
  ensemble: 0.3,
  vibrato: 0.2,
  scaleLines: 0,
  preset: 'warm',
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

  it('passes no ratios when another axis is selected', () => {
    const { engine, player } = makeHarmonyPlayer({ shortAxis: 'timbre' });

    player.pointerDown(1, 200, 400);

    expect(engine.voices[0].lastParams!.harmonyRatios).toEqual([]);
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
