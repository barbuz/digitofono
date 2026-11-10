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

function makeVibratoVoice() {
  const ctx = new FakeAudioContext();
  const out = new FakeGain();
  const vibrato = new FakeGain();
  const voice = new Voice(
    ctx as unknown as AudioContext,
    out as unknown as AudioNode,
    0,
    vibrato as unknown as AudioNode,
  );
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
  return { ctx, voice, params, vibrato };
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

describe('Voice vibrato wiring', () => {
  it('routes the shared vibrato into both oscillators while sounding', () => {
    const { voice, params, vibrato } = makeVibratoVoice();
    voice.start(params);

    // Two detune params - one per oscillator - must be driven by the LFO node.
    expect(vibrato.connections).toHaveLength(2);
    expect(vibrato.connections.every((c) => c !== null && typeof c === 'object')).toBe(true);
  });

  it('cuts the vibrato connections on release so rebuilds do not leak', () => {
    const { ctx, voice, params, vibrato } = makeVibratoVoice();
    voice.start(params);
    voice.release(false);
    ctx.currentTime += 10;

    // The next start rebuilds the oscillators; the previous ones must have been
    // unlinked from the shared LFO, or each note would strand two detune params.
    voice.start(params);

    const cuts = vibrato.disconnections.filter((d) => d !== undefined);
    expect(cuts).toHaveLength(2);
  });
});
