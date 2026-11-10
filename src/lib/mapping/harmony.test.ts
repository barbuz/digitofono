import { describe, expect, it } from 'vitest';
import {
  HARMONY_INTERVALS_SEMITONES,
  MAX_HARMONY_NOTES,
  harmonyGains,
  harmonyMidiValues,
} from './harmony';
import { midiToFrequency } from './pitch';
import { isInScale } from './scales';

describe('harmonyMidiValues', () => {
  it('builds a major triad in the chromatic scale', () => {
    // C4 (60): major third E4 (64) and perfect fifth G4 (67).
    expect(harmonyMidiValues(60, 'chromatic')).toEqual([64, 67]);
  });

  it('stacks thirds above the root in a major scale', () => {
    expect(harmonyMidiValues(60, 'major')).toEqual([64, 67]);
  });

  it('snaps to a minor third in a minor scale instead of forcing a major one', () => {
    // C4 (60) in C natural minor: the major third (64) is not in the scale, so
    // it snaps down to Eb (63); the fifth G (67) is already in scale.
    expect(harmonyMidiValues(60, 'naturalMinor')).toEqual([63, 67]);
  });

  it('keeps the notes diatonic for a non-root degree', () => {
    // D4 (62) in C major: F (65) and A (69).
    expect(harmonyMidiValues(62, 'major')).toEqual([65, 69]);
  });

  it('wraps across the octave when the interval crosses the scale top', () => {
    // B4 (71) in C major: the third up snaps to D5 (74), the fifth to F5 (77).
    expect(harmonyMidiValues(71, 'major')).toEqual([74, 77]);
  });

  it('keeps both notes in scale for a sparse scale', () => {
    // C4 (60) in C major pentatonic [0,2,4,7,9]: E (64) and G (67) are both in
    // the scale, so the major third and fifth survive untouched.
    expect(harmonyMidiValues(60, 'majorPentatonic')).toEqual([64, 67]);
  });

  it('returns one note per configured interval', () => {
    expect(harmonyMidiValues(60, 'major')).toHaveLength(HARMONY_INTERVALS_SEMITONES.length);
    expect(HARMONY_INTERVALS_SEMITONES.length).toBe(MAX_HARMONY_NOTES);
  });

  it('is strictly ascending and in scale for every degree of every scale', () => {
    for (const scale of ['chromatic', 'major', 'naturalMinor', 'blues', 'majorPentatonic'] as const) {
      for (let midi = 48; midi <= 72; midi += 1) {
        const values = harmonyMidiValues(midi, scale);
        expect(values[0]).toBeGreaterThan(midi);
        expect(values[1]).toBeGreaterThan(values[0]);
        expect(isInScale(values[0], scale)).toBe(true);
        expect(isInScale(values[1], scale)).toBe(true);
      }
    }
  });

  it('produces consonant frequency ratios for a chromatic major triad', () => {
    const [third, fifth] = harmonyMidiValues(60, 'chromatic').map((m) => midiToFrequency(m));
    const root = midiToFrequency(60);
    expect(third / root).toBeCloseTo(Math.pow(2, 4 / 12), 6);
    expect(fifth / root).toBeCloseTo(Math.pow(2, 7 / 12), 6);
  });
});

describe('harmonyGains', () => {
  it('is silent at 0, so one end is the bare note', () => {
    expect(harmonyGains(0)).toEqual([0, 0]);
  });

  it('is full at 1, so the other end is the whole chord', () => {
    expect(harmonyGains(1)).toEqual([1, 1]);
  });

  it('adds the notes one at a time as the axis advances', () => {
    // First note fills the first half, second note the second half.
    const [first, second] = harmonyGains(0.5);
    expect(first).toBeCloseTo(1, 9);
    expect(second).toBeCloseTo(0, 9);
  });

  it('is monotonic non-decreasing for every note', () => {
    const previous = new Array(MAX_HARMONY_NOTES).fill(-Infinity);
    for (let i = 0; i <= 50; i += 1) {
      const gains = harmonyGains(i / 50);
      gains.forEach((g, note) => {
        expect(g).toBeGreaterThanOrEqual(previous[note]);
        previous[note] = g;
      });
    }
  });

  it('clamps out-of-range positions', () => {
    expect(harmonyGains(-1)).toEqual([0, 0]);
    expect(harmonyGains(2)).toEqual([1, 1]);
  });
});
