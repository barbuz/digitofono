import { describe, expect, it } from 'vitest';
import { analyzeChroma } from './chroma';
import { midiToFrequency } from './pitch';

const SAMPLE_RATE = 11025;

/** A tone with a few harmonics, so peak picking has something realistic. */
function addTone(
  buffer: Float32Array,
  start: number,
  duration: number,
  midi: number,
  amplitude = 0.3,
  detuneCents = 0,
): void {
  const frequency = midiToFrequency(midi) * Math.pow(2, detuneCents / 1200);
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

function melody(notes: number[], detuneCents = 0, secondsEach = 0.4): Float32Array {
  const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * (notes.length * secondsEach + 0.5)));
  notes.forEach((midi, index) => {
    addTone(buffer, index * secondsEach, secondsEach, midi, 0.3, detuneCents);
  });
  return buffer;
}

/** Pitch classes above a fraction of the peak, as a set. */
function classesAbove(chroma: number[], fraction: number): number[] {
  const peak = Math.max(...chroma);
  return chroma
    .map((value, pc) => ({ value, pc }))
    .filter((entry) => entry.value >= peak * fraction)
    .map((entry) => entry.pc);
}

describe('analyzeChroma', () => {
  it('returns null for silence and for buffers shorter than a frame', () => {
    expect(analyzeChroma(new Float32Array(SAMPLE_RATE), SAMPLE_RATE)).toBeNull();
    expect(analyzeChroma(new Float32Array(64), SAMPLE_RATE)).toBeNull();
  });

  it('puts a C major triad on C, E and G and nothing else', () => {
    const buffer = new Float32Array(SAMPLE_RATE * 3);
    addTone(buffer, 0, 3, 60);
    addTone(buffer, 0, 3, 64);
    addTone(buffer, 0, 3, 67);

    const result = analyzeChroma(buffer, SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(classesAbove(result!.chroma, 0.35).sort()).toEqual([0, 4, 7]);
  });

  it('keeps a melody note that is played once among held accompaniment', () => {
    const buffer = new Float32Array(SAMPLE_RATE * 6);
    addTone(buffer, 0, 6, 48, 0.25);
    addTone(buffer, 0, 6, 55, 0.25);
    addTone(buffer, 2, 0.6, 73, 0.3);

    const result = analyzeChroma(buffer, SAMPLE_RATE);
    const chroma = result!.chroma;
    // The melody note is one short, quiet event against two long held notes,
    // so it will not dominate - but it must still be visible.
    expect(chroma[1]).toBeGreaterThan(chroma[3]);
    expect(chroma[1]).toBeGreaterThan(chroma[10]);
  });

  it('reports no tuning offset for an in-tune recording', () => {
    const result = analyzeChroma(melody([60, 62, 64, 65, 67, 69, 71, 72]), SAMPLE_RATE);
    expect(Math.abs(result!.tuningCents)).toBeLessThanOrEqual(6);
  });

  it('recovers a sharp and a flat tuning offset', () => {
    const sharp = analyzeChroma(melody([60, 64, 67, 72], 30), SAMPLE_RATE);
    expect(sharp!.tuningCents).toBeGreaterThan(20);
    expect(sharp!.tuningCents).toBeLessThan(40);

    const flat = analyzeChroma(melody([60, 64, 67, 72], -25), SAMPLE_RATE);
    expect(flat!.tuningCents).toBeLessThan(-15);
    expect(flat!.tuningCents).toBeGreaterThan(-35);
  });

  it('keeps the pitch classes correct when the recording is detuned', () => {
    // A detuned recording must still name the right notes: the offset is
    // measured so it can be undone before folding. The *set* is what matters -
    // a chord's root is inferred, not the loudest bin, since a root's own third
    // harmonic reinforces the fifth.
    const result = analyzeChroma(melody([60, 64, 67], 35), SAMPLE_RATE);
    expect(classesAbove(result!.chroma, 0.35).sort()).toEqual([0, 4, 7]);
  });

  it('reports the register the music occupies', () => {
    const low = analyzeChroma(melody([48, 50, 52]), SAMPLE_RATE);
    const high = analyzeChroma(melody([72, 74, 76]), SAMPLE_RATE);

    expect(low!.lowMidi).toBeLessThan(high!.lowMidi);
    expect(low!.highMidi).toBeLessThan(high!.highMidi);
    expect(low!.lowMidi).toBeGreaterThan(40);
    expect(low!.highMidi).toBeLessThan(60);
    expect(high!.lowMidi).toBeGreaterThan(65);
    expect(high!.highMidi).toBeLessThan(85);
  });

  it('reports progress while analysing', () => {
    const fractions: number[] = [];
    analyzeChroma(melody([60, 64, 67, 72]), SAMPLE_RATE, (fraction) => fractions.push(fraction));
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});
