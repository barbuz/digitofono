import { describe, expect, it } from 'vitest';
import { Voice } from './Voice';
import { FakeAudioContext, FakeGain } from './fakeAudio';
import { PRESETS } from './presets';

const preset = PRESETS.warm;

function baseParams() {
  return {
    preset,
    waveDark: {} as PeriodicWave,
    waveBright: {} as PeriodicWave,
    frequency: 220,
    morph: 0.5,
    cutoffHz: 2000,
    level: 0.8,
    harmonyRatios: [] as number[],
    harmonyLevels: [] as number[],
  };
}

function makeVoice() {
  const ctx = new FakeAudioContext();
  const out = new FakeGain();
  const voice = new Voice(ctx as unknown as AudioContext, out as unknown as AudioNode, 0);
  return { ctx, voice, params: baseParams() };
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
  return { ctx, voice, params: baseParams(), vibrato };
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
      voice.setHarmony([1.5, 2], [0.5, 0.5]);
      voice.setCutoff(1200);
      voice.setLevel(0.5);
    }).not.toThrow();
  });
});

describe('Voice harmony', () => {
  it('builds a dark/bright pair per harmony note, plus the root', () => {
    const { ctx, voice, params } = makeVoice();
    voice.start({ ...params, harmonyRatios: [1.25, 1.5, 1.875], harmonyLevels: [0.5, 0.25, 0.1] });

    // Two oscillators per note (dark + bright): root + three harmony notes.
    expect(ctx.oscillators).toHaveLength(8);
  });

  it('tunes each note to the root frequency times its ratio', () => {
    const { ctx, voice, params } = makeVoice();
    voice.start({ ...params, harmonyRatios: [1.5, 2], harmonyLevels: [0.5, 0.5] });

    const frequencies = ctx.oscillators.map((o) => o.frequency.value);
    // Root pair at 220, then 330 and 440 for each note's two oscillators.
    expect(frequencies).toEqual([220, 220, 330, 330, 440, 440]);
  });

  it('starts and stops every oscillator exactly once', () => {
    const { voice, params } = makeVoice();
    voice.start({ ...params, harmonyRatios: [1.25, 1.5, 1.875], harmonyLevels: [0.5, 0.5, 0.5] });
    expect(() => voice.release(false)).not.toThrow();
  });

  it('keeps the chord ratios while gliding, so it transposes as a chord', () => {
    const { ctx, voice, params } = makeVoice();
    voice.start({ ...params, harmonyRatios: [1.5, 2], harmonyLevels: [0.5, 0.5] });

    voice.glideFrequency(440);
    // 440 * 1.5 = 660, 440 * 2 = 880; the root pair follows the root.
    expect(ctx.oscillators.map((o) => o.frequency.value)).toEqual([440, 440, 660, 660, 880, 880]);
  });

  it('retunes harmony notes when the diatonic ratios change mid-glide', () => {
    const { ctx, voice, params } = makeVoice();
    voice.start({ ...params, harmonyRatios: [1.5, 2], harmonyLevels: [0.5, 0.5] });

    voice.glideFrequency(220);
    voice.setHarmony([1.25, 1.5], [0.8, 0.4]);
    // 220 * 1.25 = 275, 220 * 1.5 = 330.
    expect(ctx.oscillators.map((o) => o.frequency.value)).toEqual([220, 220, 275, 275, 330, 330]);
  });

  it('builds harmony notes at zero level when the chord is not engaged', () => {
    const { ctx, voice, params } = makeVoice();
    // Ratios present but levels 0: the notes exist (so they can fade in) yet
    // are silent, which is what the short axis at 0 must sound like.
    voice.start({ ...params, harmonyRatios: [1.5, 2], harmonyLevels: [0, 0] });
    expect(ctx.oscillators).toHaveLength(6);
    expect(() => voice.setHarmony([1.5, 2], [1, 1])).not.toThrow();
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
