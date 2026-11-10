import { describe, expect, it } from 'vitest';
import {
  HARMONY_INTERVALS_SEMITONES,
  HARMONY_VOICING_IDS,
  MAX_HARMONY_NOTES,
  harmonyGains,
  harmonyMidiValues,
} from './harmony';
import { midiToFrequency } from './pitch';
import { isInScale } from './scales';

describe('harmonyMidiValues (diatonic voicing)', () => {
  it('builds a major seventh chord in the chromatic scale', () => {
    // C4 (60): major third E4 (64), perfect fifth G4 (67), major seventh B4 (71).
    expect(harmonyMidiValues(60, 'chromatic')).toEqual([64, 67, 71]);
  });

  it('stacks thirds above the root in a major scale', () => {
    expect(harmonyMidiValues(60, 'major')).toEqual([64, 67, 71]);
  });

  it('snaps each interval into a minor scale instead of forcing a major chord', () => {
    // C4 (60) in C natural minor: the major third (64) snaps down to Eb (63),
    // the fifth G (67) is already in scale, and the major seventh (71) snaps
    // down to Bb (70) - the scale's own seventh.
    expect(harmonyMidiValues(60, 'naturalMinor')).toEqual([63, 67, 70]);
  });

  it('keeps the notes diatonic for a non-root degree', () => {
    // D4 (62) in C major: the major third (66, F#) snaps down to F (65), the
    // fifth A (69) is in scale, and the major seventh (73, C#) snaps down to
    // C (72). Ties break toward the lower note.
    expect(harmonyMidiValues(62, 'major')).toEqual([65, 69, 72]);
  });

  it('wraps across the octave when an interval crosses the scale top', () => {
    // B4 (71) in C major: D5 (74), F5 (77), and the seventh snaps down to A5 (81).
    expect(harmonyMidiValues(71, 'major')).toEqual([74, 77, 81]);
  });

  it('keeps every note in scale for a sparse scale', () => {
    // C4 (60) in C major pentatonic [0,2,4,7,9]: E (64) and G (67) survive, and
    // the seventh (71) snaps up to C5 (72), the nearest pentatonic degree.
    expect(harmonyMidiValues(60, 'majorPentatonic')).toEqual([64, 67, 72]);
  });

  it('returns one note per configured interval', () => {
    expect(harmonyMidiValues(60, 'major')).toHaveLength(HARMONY_INTERVALS_SEMITONES.length);
    expect(HARMONY_INTERVALS_SEMITONES.length).toBe(MAX_HARMONY_NOTES);
  });

  it('is strictly ascending and in scale for every degree of every scale', () => {
    for (const scale of ['chromatic', 'major', 'naturalMinor', 'blues', 'majorPentatonic'] as const) {
      for (let midi = 48; midi <= 72; midi += 1) {
        const values = harmonyMidiValues(midi, scale);
        for (let i = 0; i < values.length; i += 1) {
          const lower = i === 0 ? midi : values[i - 1];
          expect(values[i]).toBeGreaterThan(lower);
          expect(isInScale(values[i], scale)).toBe(true);
        }
      }
    }
  });

  it('produces consonant frequency ratios for a chromatic major seventh', () => {
    const [third, fifth, seventh] = harmonyMidiValues(60, 'chromatic').map((m) =>
      midiToFrequency(m),
    );
    const root = midiToFrequency(60);
    expect(third / root).toBeCloseTo(Math.pow(2, 4 / 12), 6);
    expect(fifth / root).toBeCloseTo(Math.pow(2, 7 / 12), 6);
    expect(seventh / root).toBeCloseTo(Math.pow(2, 11 / 12), 6);
  });
});

describe('harmonyMidiValues (scale-independent voicings)', () => {
  it('ignores the scale with the fixed major voicing', () => {
    // The same major seventh chord on a minor scale, verbatim.
    expect(harmonyMidiValues(60, 'naturalMinor', 'major')).toEqual([64, 67, 71]);
    expect(harmonyMidiValues(60, 'majorPentatonic', 'major')).toEqual([64, 67, 71]);
  });

  it('spreads octaves around the root with the octaves voicing', () => {
    // One octave below the root, then one and two octaves above it.
    expect(harmonyMidiValues(60, 'chromatic', 'octaves')).toEqual([48, 72, 84]);
    // Independent of the scale and of the root's pitch class.
    expect(harmonyMidiValues(61, 'blues', 'octaves')).toEqual([49, 73, 85]);
  });

  it('puts the octaves voicing\'s lowest note below the root', () => {
    expect(harmonyMidiValues(60, 'major', 'octaves')[0]).toBe(48);
  });

  it('is strictly ascending for every voicing', () => {
    for (const voicing of HARMONY_VOICING_IDS) {
      for (let midi = 48; midi <= 72; midi += 1) {
        const values = harmonyMidiValues(midi, 'naturalMinor', voicing);
        expect(values[1]).toBeGreaterThan(values[0]);
        expect(values[2]).toBeGreaterThan(values[1]);
      }
    }
  });

  it('keeps the chord above the root for the chord voicings', () => {
    for (const voicing of ['diatonic', 'major'] as const) {
      for (let midi = 48; midi <= 72; midi += 1) {
        expect(harmonyMidiValues(midi, 'naturalMinor', voicing)[0]).toBeGreaterThan(midi);
      }
    }
  });
});

describe('harmonyGains', () => {
  it('is silent at 0, so one end is the bare note', () => {
    expect(harmonyGains(0)).toEqual([0, 0, 0]);
  });

  it('is full at 1, so the other end is the whole chord', () => {
    expect(harmonyGains(1)).toEqual([1, 1, 1]);
  });

  it('adds the notes one at a time as the axis advances', () => {
    // With three notes each slice is a third wide; halfway the first note is
    // fully in, the second is halfway, and the third has not started.
    const gains = harmonyGains(0.5);
    expect(gains[0]).toBeCloseTo(1, 9);
    expect(gains[1]).toBeCloseTo(0.5, 9);
    expect(gains[2]).toBeCloseTo(0, 9);
  });

  it('returns one gain per harmony note', () => {
    expect(harmonyGains(0.5)).toHaveLength(MAX_HARMONY_NOTES);
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
    expect(harmonyGains(-1)).toEqual([0, 0, 0]);
    expect(harmonyGains(2)).toEqual([1, 1, 1]);
  });
});
