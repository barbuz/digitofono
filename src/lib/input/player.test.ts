import { describe, expect, it, vi } from 'vitest';
import { Player, TAP_MS, HAPTIC_MS, type SurfaceGeometry } from './player';
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

  start(): void {
    this.started += 1;
  }

  glideFrequency(): void {}
  setMorph(): void {}
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
  setPolyphony(): void {}
  setMasterVolume(): void {}
  setReverbAmount(): void {}
}

const settings: Settings = {
  version: 1,
  baseMidi: 48,
  octaveSpan: 3,
  scale: 'chromatic',
  snapStrength: 0.6,
  shortAxis: 'timbre',
  volume: 0.8,
  reverbAmount: 0.12,
  scaleLines: 0,
  polyphony: 8,
  preset: 'warm',
  haptics: false,
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

function makeHapticPlayer() {
  const engine = new RecordingEngine();
  const player = new Player(
    { ...settings, haptics: true },
    geometry,
    {},
    engine as unknown as AudioEngine,
  );
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

describe('Player haptics', () => {
  it('fires one tick of a perceptible length on touch-down', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { vibrate });
    try {
      const { player } = makeHapticPlayer();
      player.pointerDown(1, 200, 400);

      expect(vibrate).toHaveBeenCalledTimes(1);
      expect(vibrate).toHaveBeenCalledWith(HAPTIC_MS);
      // Guards the original bug: too short to actuate on real Android hardware.
      expect(HAPTIC_MS).toBeGreaterThanOrEqual(10);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not vibrate when the setting is off', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { vibrate });
    try {
      const { player } = makePlayer();
      player.pointerDown(1, 200, 400);

      expect(vibrate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ticks once per press, not on move or release', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { vibrate });
    try {
      const { player } = makeHapticPlayer();
      player.pointerDown(1, 200, 400);
      player.pointerMove(1, 220, 420);
      player.pointerMove(1, 240, 440);
      player.pointerUp(1);

      expect(vibrate).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('survives a browser with no vibration support', () => {
    vi.stubGlobal('navigator', {});
    try {
      const { player } = makeHapticPlayer();
      expect(() => player.pointerDown(1, 200, 400)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
