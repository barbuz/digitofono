import { describe, expect, it } from 'vitest';
import { Voice } from './Voice';
import { FakeAudioContext, FakeGain } from './fakeAudio';
import { PRESETS } from './presets';

const preset = PRESETS.warm;

function makeVoice() {
  const ctx = new FakeAudioContext();
  const out = new FakeGain();
  const voice = new Voice(ctx as unknown as AudioContext, out as unknown as AudioNode, 0);
  const wave = {} as PeriodicWave;
  const params = {
    preset,
    waveDark: wave,
    waveBright: wave,
    frequency: 220,
    morph: 0.5,
    cutoffHz: 2000,
    level: 0.8,
  };
  return { ctx, voice, params };
}

describe('Voice lifecycle', () => {
  it('can be reused for a second note after release', () => {
    const { ctx, voice, params } = makeVoice();

    voice.start(params);
    expect(voice.active).toBe(true);

    voice.release(false);
    expect(voice.active).toBe(false);

    ctx.currentTime += 10;
    expect(voice.reusable).toBe(true);

    // The regression: a reused voice must not touch its previous, already
    // stopped oscillators.
    expect(() => voice.start(params)).not.toThrow();
    expect(voice.active).toBe(true);
  });

  it('survives many reuse cycles', () => {
    const { ctx, voice, params } = makeVoice();
    for (let i = 0; i < 5; i += 1) {
      voice.start(params);
      voice.release(i % 2 === 0);
      ctx.currentTime += 10;
    }
    expect(voice.active).toBe(false);
    expect(voice.reusable).toBe(true);
  });

  it('is not reusable until its release has finished sounding', () => {
    const { voice, params } = makeVoice();
    voice.start(params);
    voice.release(false);
    expect(voice.reusable).toBe(false);
  });

  it('ignores repeated releases', () => {
    const { voice, params } = makeVoice();
    voice.start(params);
    voice.release(true);
    expect(() => voice.release(true)).not.toThrow();
  });

  it('tolerates parameter updates when idle', () => {
    const { voice } = makeVoice();
    expect(() => {
      voice.glideFrequency(440);
      voice.setMorph(0.2);
      voice.setCutoff(1200);
      voice.setLevel(0.5);
    }).not.toThrow();
  });
});
