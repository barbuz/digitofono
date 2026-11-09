import { describe, it, expect } from 'vitest';
import { SCALES, isInScale } from './scales';

describe('scales', () => {
  it('defines chromatic with all twelve pitch classes', () => {
    expect(SCALES.chromatic).toHaveLength(12);
    for (let pc = 0; pc < 12; pc += 1) {
      expect(SCALES.chromatic).toContain(pc);
    }
  });

  it('defines the major scale correctly', () => {
    expect([...SCALES.major].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('always includes the tonic (pitch class 0)', () => {
    for (const degrees of Object.values(SCALES)) {
      expect(degrees).toContain(0);
    }
  });

  it('keeps every pitch class within 0-11 and unique', () => {
    for (const degrees of Object.values(SCALES)) {
      for (const pc of degrees) {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThanOrEqual(11);
      }
      expect(new Set(degrees).size).toBe(degrees.length);
    }
  });

  it('checks membership across octaves and negatives', () => {
    expect(isInScale(60, 'major')).toBe(true);
    expect(isInScale(61, 'major')).toBe(false);
    expect(isInScale(72, 'major')).toBe(true);
    expect(isInScale(-12, 'major')).toBe(true);
  });
});
