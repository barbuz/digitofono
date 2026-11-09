import { describe, it, expect } from 'vitest';
import {
  midiToFrequency,
  frequencyToMidi,
  midiToNoteName,
  positionToMidi,
  midiToPosition,
  nearestInScale,
  positionToSnappedMidi,
} from './pitch';
import { SCALES } from './scales';

const RANGE = { baseMidi: 48, octaveSpan: 3 };

describe('midiToFrequency', () => {
  it('maps A4 to 440 Hz and C4 to ~261.63 Hz', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6255653, 4);
  });

  it('is the inverse of frequencyToMidi', () => {
    for (const midi of [21, 48, 60, 69, 84, 108]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 9);
    }
  });

  it('doubles frequency per octave', () => {
    expect(midiToFrequency(72) / midiToFrequency(60)).toBeCloseTo(2, 9);
  });
});

describe('midiToNoteName', () => {
  it('uses scientific pitch notation', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToNoteName(48)).toBe('C3');
    expect(midiToNoteName(61)).toBe('C#4');
  });
});

describe('positionToMidi', () => {
  it('spans the configured range logarithmically', () => {
    expect(positionToMidi(0, RANGE)).toBeCloseTo(48, 9);
    expect(positionToMidi(1, RANGE)).toBeCloseTo(48 + 36, 9);
    expect(positionToMidi(0.5, RANGE)).toBeCloseTo(66, 9);
  });

  it('clamps out-of-range positions', () => {
    expect(positionToMidi(-0.5, RANGE)).toBeCloseTo(48, 9);
    expect(positionToMidi(1.5, RANGE)).toBeCloseTo(84, 9);
  });

  it('is monotonic non-decreasing', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 100; i += 1) {
      const value = positionToMidi(i / 100, RANGE);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('round-trips with midiToPosition', () => {
    for (const pos of [0, 0.25, 0.5, 0.75, 1]) {
      expect(midiToPosition(positionToMidi(pos, RANGE), RANGE)).toBeCloseTo(pos, 9);
    }
  });
});

describe('nearestInScale', () => {
  it('rounds to the nearest semitone for chromatic', () => {
    expect(nearestInScale(60.2, 'chromatic')).toBe(60);
    expect(nearestInScale(60.8, 'chromatic')).toBe(61);
  });

  it('finds a member of a pentatonic scale', () => {
    const result = nearestInScale(61, 'majorPentatonic');
    expect(SCALES.majorPentatonic).toContain(((result % 12) + 12) % 12);
  });

  it('breaks ties toward the lower note', () => {
    expect(nearestInScale(60.5, 'chromatic')).toBe(60);
  });
});

describe('positionToSnappedMidi', () => {
  it('is the identity when strength is 0', () => {
    for (let i = 0; i <= 20; i += 1) {
      const pos = i / 20;
      expect(positionToSnappedMidi(pos, RANGE, 'chromatic', 0)).toBeCloseTo(
        positionToMidi(pos, RANGE),
        9,
      );
    }
  });

  it('lands exactly on a scale degree when strength is 1', () => {
    for (let i = 0; i <= 40; i += 1) {
      const pos = i / 40;
      const midi = positionToSnappedMidi(pos, RANGE, 'major', 1);
      expect(Number.isInteger(midi)).toBe(true);
      expect(SCALES.major).toContain(((midi % 12) + 12) % 12);
    }
  });

  it('stays monotonic non-decreasing at every strength', () => {
    for (const strength of [0, 0.25, 0.6, 1]) {
      let previous = -Infinity;
      for (let i = 0; i <= 200; i += 1) {
        const value = positionToSnappedMidi(i / 200, RANGE, 'major', strength);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });

  it('pulls toward the scale degree without overshooting it', () => {
    const raw = positionToMidi(0.37, RANGE);
    const nearest = nearestInScale(raw, 'major');
    const snapped = positionToSnappedMidi(0.37, RANGE, 'major', 0.5);
    expect(Math.abs(snapped - nearest)).toBeLessThan(Math.abs(raw - nearest));
    expect(Math.sign(snapped - raw)).toBe(Math.sign(nearest - raw));
  });
});
