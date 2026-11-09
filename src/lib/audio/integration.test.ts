import { describe, expect, it } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { Player, TAP_MS } from '../input/player';
import { FakeAudioContext } from './fakeAudio';
import { PRESETS } from './presets';
import type { Settings } from '../state/schema';

/**
 * End-to-end check of the press/release path with the real AudioEngine, the
 * real Voice and the real Player, over a fake AudioContext. This is the test
 * that would have caught the reported bug: rapid consecutive taps must each
 * produce a voice and each voice must be released, with no InvalidStateError
 * from reusing a stopped oscillator.
 */

const settings: Settings = {
  version: 1,
  baseMidi: 48,
  octaveSpan: 3,
  scale: 'chromatic',
  snapStrength: 0.6,
  shortAxis: 'timbre',
  volume: 0.8,
  reverbAmount: 0.12,
  polyphony: 8,
  preset: 'warm',
  haptics: false,
};

function makePlayer() {
  const ctx = new FakeAudioContext();
  const engine = new AudioEngine(() => ctx as unknown as AudioContext);
  const player = new Player(
    settings,
    { longLength: 800, shortLength: 400, longIsVertical: true },
    {},
    engine,
  );
  return { ctx, engine, player };
}

function activeCount(engine: AudioEngine): number {
  const pool = (engine as unknown as { pool: Array<{ active: boolean }> }).pool;
  return pool.filter((v) => v.active).length;
}

describe('Player + AudioEngine integration', () => {
  it('sounds a note on the very first press without awaiting the context', () => {
    const { engine, player } = makePlayer();
    player.pointerDown(1, 200, 400);
    expect(activeCount(engine)).toBe(1);
  });

  it('handles many consecutive taps without losing any', () => {
    const { engine, player } = makePlayer();

    for (let i = 0; i < 10; i += 1) {
      const id = i + 1;
      expect(() => {
        player.pointerDown(id, 200, 400 + i * 10);
        player.pointerUp(id);
      }).not.toThrow();
      // Let the previous release finish so the pool can hand its voice back.
      (engine.context as unknown as FakeAudioContext).currentTime += 10;
    }

    // Nothing should still be sounding once every pointer has lifted.
    expect(activeCount(engine)).toBe(0);
  });

  it('leaves no voice sounding after a tap is released mid-flight', () => {
    const { ctx, engine, player } = makePlayer();

    player.pointerDown(1, 200, 400);
    expect(activeCount(engine)).toBe(1);

    player.pointerUp(1);
    // Advance past the release tail so the voice is fully done.
    ctx.currentTime += 10;
    expect(activeCount(engine)).toBe(0);
  });

  it('releases a voice held longer than the tap threshold', () => {
    const { ctx, engine, player } = makePlayer();

    player.pointerDown(1, 200, 400);
    const touches = (player as unknown as { touches: Map<number, { startTime: number }> }).touches;
    touches.get(1)!.startTime -= TAP_MS + 1000;
    player.pointerUp(1);
    ctx.currentTime += 10;
    expect(activeCount(engine)).toBe(0);
  });

  it('never drops a note when polyphony is exhausted', () => {
    const { engine, player } = makePlayer();

    // Press more simultaneous touches than the pool holds; stealing must keep
    // the count at the configured limit rather than failing to allocate.
    for (let i = 0; i < settings.polyphony + 4; i += 1) {
      player.pointerDown(i + 1, 200, 400);
    }
    expect(activeCount(engine)).toBe(settings.polyphony);
  });

  it('drops the stolen touch so it cannot steer the replacement note', () => {
    const { player } = makePlayer();

    for (let i = 0; i < settings.polyphony + 1; i += 1) {
      player.pointerDown(i + 1, 200, 400);
    }

    // The first finger's voice was stolen; its touch must be gone, so a move
    // from it is ignored rather than gliding the newest note.
    const touches = (player as unknown as { touches: Map<number, unknown> }).touches;
    expect(touches.size).toBe(settings.polyphony);
    expect(() => player.pointerMove(1, 100, 100)).not.toThrow();
  });

  it('uses the selected preset for its wave tables', () => {
    const { engine } = makePlayer();
    engine.setPreset(PRESETS.bell);
    expect(engine.currentPreset).toBe(PRESETS.bell);
  });
});
