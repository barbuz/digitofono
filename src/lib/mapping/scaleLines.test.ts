import { describe, expect, it } from 'vitest';
import { scaleLines } from './scaleLines';
import { positionToMidi, type PitchRange } from './pitch';
import { isInScale } from './scales';

const range: PitchRange = { baseMidi: 48, octaveSpan: 3 };

describe('scaleLines', () => {
  it('places a line on every step of the scale, and nothing else', () => {
    const lines = scaleLines(range, 'major');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(isInScale(line.midi, 'major')).toBe(true);
    }
  });

  it('includes exactly the in-scale notes across the whole range', () => {
    const lines = scaleLines(range, 'majorPentatonic');
    const expected: number[] = [];
    for (let midi = 48; midi <= 48 + 36; midi += 1) {
      if (isInScale(midi, 'majorPentatonic')) expected.push(midi);
    }
    expect(lines.map((l) => l.midi)).toEqual(expected);
  });

  it('is ascending and strictly increasing in position', () => {
    const lines = scaleLines(range, 'major');
    for (let i = 1; i < lines.length; i += 1) {
      expect(lines[i].midi).toBeGreaterThan(lines[i - 1].midi);
      expect(lines[i].pos).toBeGreaterThan(lines[i - 1].pos);
    }
  });

  it('places each line exactly where that note would be played', () => {
    // The guide lines must agree with the pitch mapping, otherwise they lie
    // about where the notes are.
    for (const line of scaleLines(range, 'dorian')) {
      expect(line.pos).toBeCloseTo(
        (line.midi - range.baseMidi) / (12 * range.octaveSpan),
        10,
      );
      expect(positionToMidi(line.pos, range)).toBeCloseTo(line.midi, 10);
    }
  });

  it('keeps every position within the 0..1 surface', () => {
    for (const line of scaleLines(range, 'chromatic')) {
      expect(line.pos).toBeGreaterThanOrEqual(0);
      expect(line.pos).toBeLessThanOrEqual(1);
    }
  });

  it('flags the tonic of each octave', () => {
    const lines = scaleLines(range, 'major');
    const tonics = lines.filter((l) => l.isTonic).map((l) => l.midi);
    expect(tonics).toEqual([48, 60, 72, 84]);
  });

  it('handles a tonic that is not C', () => {
    const lines = scaleLines({ baseMidi: 50, octaveSpan: 2 }, 'major');
    const tonics = lines.filter((l) => l.isTonic).map((l) => l.midi);
    expect(tonics).toEqual([50, 62, 74]);
  });

  it('gives a chromatic scale a line per semitone', () => {
    const lines = scaleLines({ baseMidi: 60, octaveSpan: 1 }, 'chromatic');
    expect(lines.map((l) => l.midi)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]);
  });

  it('returns just the base note when the range has zero span', () => {
    // A zero-width range maps every position to the base note, so there is a
    // single, unambiguous line.
    const lines = scaleLines({ baseMidi: 60, octaveSpan: 0 }, 'chromatic');
    expect(lines.map((l) => l.midi)).toEqual([60]);
    expect(lines[0].pos).toBe(0);
  });
});
