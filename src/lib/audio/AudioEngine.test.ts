import { describe, expect, it } from 'vitest';
import { AudioEngine, CHORUS_MAX_WET, VIBRATO_MAX_CENTS } from './AudioEngine';
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
