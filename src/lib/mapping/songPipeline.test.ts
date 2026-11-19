import { describe, expect, it } from 'vitest';
import { analyzeChroma } from './chroma';
import { songScaleFromChroma } from './songScale';
import { isInScale } from './scales';
import { midiToFrequency } from './pitch';

/**
 * The whole analysis chain, from samples to playable frets.
 *
 * The unit tests cover each stage; this pins that the stages agree with each
 * other, which is where a feature like this actually breaks: a scale that looks
 * right in isolation but whose pitch classes the mapping layer never plays.
 */

const SAMPLE_RATE = 11025;

function addTone(
  buffer: Float32Array,
  start: number,
  duration: number,
  midi: number,
  amplitude = 0.3,
): void {
  const frequency = midiToFrequency(midi);
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.floor((start + duration) * SAMPLE_RATE));
  for (let i = startSample; i < endSample; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.min(1, (i - startSample) / 400) * Math.min(1, (endSample - i) / 400);
    let value = 0;
    for (let h = 1; h <= 4; h += 1) {
      value += (amplitude / h) * Math.sin(2 * Math.PI * frequency * h * t);
    }
    buffer[i] += value * envelope;
  }
}

/** A short passage over a C major triad, melody included. */
function cMajorSong(): Float32Array {
  const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * 4));
  addTone(buffer, 0, 4, 48, 0.25);
  addTone(buffer, 0, 4, 52, 0.25);
  addTone(buffer, 0, 4, 55, 0.25);
  // Melody: G, A, B, C - all in C major, one at a time.
  addTone(buffer, 0.2, 0.7, 67);
  addTone(buffer, 1.0, 0.7, 69);
  addTone(buffer, 1.8, 0.7, 71);
  addTone(buffer, 2.6, 0.7, 72);
  return buffer;
}

function analyse(samples: Float32Array) {
  const chroma = analyzeChroma(samples, SAMPLE_RATE);
  expect(chroma).not.toBeNull();
  const song = songScaleFromChroma(chroma!);
  expect(song).not.toBeNull();
  return song!;
}

describe('song analysis pipeline', () => {
  it('finds the song key from a real passage', () => {
    const song = analyse(cMajorSong());
    expect(song.tonic).toBe(0);
    expect(song.scale).toBe('major');
    expect(song.label).toBe('C major');
  });

  it('produces pitch classes the mapping layer will actually play', () => {
    const song = analyse(cMajorSong());

    // Every selected pitch class must be playable: the guide lines and the
    // snap-to-scale both ask `isInScale`, so this is the contract.
    for (let midi = song.baseMidi; midi <= song.baseMidi + song.octaveSpan * 12; midi += 1) {
      const pc = ((midi % 12) + 12) % 12;
      expect(isInScale(midi, song.pitchClasses)).toBe(song.pitchClasses.includes(pc));
    }
  });

  it('keeps the song notes and drops notes it never plays', () => {
    const song = analyse(cMajorSong());
    // C, E, G, A and B are played; F and the black keys are not.
    for (const pc of [0, 4, 7, 9, 11]) {
      expect(song.pitchClasses).toContain(pc);
    }
    expect(song.pitchClasses).not.toContain(1);
    expect(song.pitchClasses).not.toContain(6);
  });

  it('drops an in-key note the song never actually plays', () => {
    // C major without any E: the frets are the notes that sound, not the whole
    // theoretical key, which is the point of laying them out from the audio.
    const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * 4));
    addTone(buffer, 0, 4, 48, 0.25);
    addTone(buffer, 0, 4, 55, 0.25);
    addTone(buffer, 0.5, 0.7, 69);
    addTone(buffer, 1.4, 0.7, 71);
    addTone(buffer, 2.3, 0.7, 72);

    const song = analyse(buffer);
    expect(song.pitchClasses).not.toContain(4);
    expect(song.pitchClasses).toContain(0);
  });

  it('fits the axis to the register the song occupies', () => {
    const song = analyse(cMajorSong());
    expect(song.baseMidi).toBeLessThanOrEqual(48);
    expect(song.baseMidi + song.octaveSpan * 12).toBeGreaterThanOrEqual(72);
    // And not wastefully wide: the whole point of fitting the axis.
    expect(song.octaveSpan).toBeLessThanOrEqual(5);
  });

  it('recovers a transposed song', () => {
    const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * 3));
    addTone(buffer, 0, 3, 50, 0.25);
    addTone(buffer, 0, 3, 57, 0.25);
    addTone(buffer, 0.3, 0.8, 62);
    addTone(buffer, 1.2, 0.8, 66);
    addTone(buffer, 2.0, 0.8, 69);

    const song = analyse(buffer);
    expect(song.tonic).toBe(2);
    expect(song.pitchClasses).toContain(6);
    expect(song.pitchClasses).toContain(9);
  });

  it('refuses to invent a scale from unpitched noise', () => {
    const noise = new Float32Array(SAMPLE_RATE * 3);
    let seed = 1;
    for (let i = 0; i < noise.length; i += 1) {
      // Deterministic white noise, which has no pitch classes at all.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = (seed / 0x7fffffff - 0.5) * 0.6;
    }
    const chroma = analyzeChroma(noise, SAMPLE_RATE);
    // Either the analysis finds nothing, or the key finder is unimpressed
    // enough that no scale is proposed - but never a confident answer.
    const song = chroma ? songScaleFromChroma(chroma) : null;
    expect(song === null || song.confidence < 0.9).toBe(true);
  });
});
