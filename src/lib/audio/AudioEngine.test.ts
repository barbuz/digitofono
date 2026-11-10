import { describe, expect, it } from 'vitest';
import { AudioEngine, CHORUS_MAX_WET, MAX_VOICES, VIBRATO_MAX_CENTS } from './AudioEngine';
import { FakeAudioContext, FakeGain } from './fakeAudio';

function makeEngine() {
  const ctx = new FakeAudioContext();
  const engine = new AudioEngine(() => ctx as unknown as AudioContext);
  return { ctx, engine };
}

function internals(engine: AudioEngine) {
  return engine as unknown as { chorusWet: FakeGain; vibratoDepth: FakeGain };
}

/**
 * Settings are pushed by the Player constructor, which runs before any user
 * gesture has created the AudioContext. The engine must remember them and apply
 * them at init, or the first note plays at hardcoded bus defaults.
 */
describe('AudioEngine deferred settings', () => {
  it('applies ensemble and vibrato set before the context exists', async () => {
    const { engine } = makeEngine();

    engine.setEnsemble(0.5);
    engine.setVibrato(0.4);

    await engine.ensureRunning();

    expect(internals(engine).chorusWet.gain.value).toBeCloseTo(0.5 * CHORUS_MAX_WET);
    expect(internals(engine).vibratoDepth.gain.value).toBeCloseTo(0.4 * VIBRATO_MAX_CENTS);
  });

  it('applies volume and reverb set before the context exists', async () => {
    const { engine } = makeEngine();

    engine.setMasterVolume(0.3);
    engine.setReverbAmount(0.7);

    await engine.ensureRunning();

    const { masterGain, reverbReturn } = engine as unknown as {
      masterGain: FakeGain;
      reverbReturn: FakeGain;
    };
    expect(masterGain.gain.value).toBeCloseTo(0.3);
    expect(reverbReturn.gain.value).toBeCloseTo(0.7);
  });

  it('clamps ensemble and vibrato to their 0..1 range', async () => {
    const { engine } = makeEngine();
    await engine.ensureRunning();

    engine.setEnsemble(5);
    engine.setVibrato(-3);

    expect(internals(engine).chorusWet.gain.value).toBeCloseTo(CHORUS_MAX_WET);
    expect(internals(engine).vibratoDepth.gain.value).toBeCloseTo(0);
  });
});

describe('AudioEngine voice pool', () => {
  function startVoice(engine: AudioEngine, frequency: number) {
    const voice = engine.allocate()!;
    voice.start({
      preset: engine.currentPreset,
      waveDark: engine.currentWaveDark!,
      waveBright: engine.currentWaveBright!,
      frequency,
      morph: 0.5,
      cutoffHz: 4000,
      level: 0.8,
      harmonyRatios: [],
      harmonyLevels: [],
    });
    return voice;
  }

  it('never grows the pool past the fixed voice cap', async () => {
    const { engine } = makeEngine();
    await engine.ensureRunning();

    for (let i = 0; i < MAX_VOICES + 8; i += 1) startVoice(engine, 200 + i * 10);

    const pool = (engine as unknown as { pool: unknown[] }).pool;
    expect(pool.length).toBe(MAX_VOICES);
  });

  it('steals an existing voice instead of allocating beyond the cap', async () => {
    const { engine } = makeEngine();
    await engine.ensureRunning();

    const voices = new Set<unknown>();
    for (let i = 0; i < MAX_VOICES; i += 1) voices.add(startVoice(engine, 200 + i * 10));
    expect(voices.size).toBe(MAX_VOICES);

    // Every further note must reuse one of the capped set, not add to it.
    for (let i = 0; i < 20; i += 1) {
      expect(voices.has(startVoice(engine, 400 + i))).toBe(true);
    }
    expect((engine as unknown as { pool: unknown[] }).pool.length).toBe(MAX_VOICES);
  });
});
