import { describe, it, expect } from 'vitest';
import {
  shortAxisToCutoff,
  shortAxisToMorph,
  shortAxisToGain,
  trackCutoffForPitch,
} from './shortAxis';

const TIMBRE = { minHz: 300, maxHz: 8000 };

describe('shortAxisToCutoff', () => {
  it('hits the bounds at the ends', () => {
    expect(shortAxisToCutoff(0, TIMBRE)).toBeCloseTo(300, 6);
    expect(shortAxisToCutoff(1, TIMBRE)).toBeCloseTo(8000, 6);
  });

  it('is monotonic increasing', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 50; i += 1) {
      const value = shortAxisToCutoff(i / 50, TIMBRE);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('clamps out-of-range positions', () => {
    expect(shortAxisToCutoff(-1, TIMBRE)).toBeCloseTo(300, 6);
    expect(shortAxisToCutoff(2, TIMBRE)).toBeCloseTo(8000, 6);
  });
});

describe('shortAxisToMorph', () => {
  it('produces crossfade weights that sum to 1', () => {
    for (let i = 0; i <= 10; i += 1) {
      const { brightGain, darkGain } = shortAxisToMorph(i / 10);
      expect(brightGain + darkGain).toBeCloseTo(1, 9);
    }
  });
});

describe('shortAxisToGain', () => {
  it('is silent at 0 and full at 1', () => {
    expect(shortAxisToGain(0)).toBe(0);
    expect(shortAxisToGain(1)).toBe(1);
  });

  it('is monotonic non-decreasing', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 50; i += 1) {
      const value = shortAxisToGain(i / 50);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('trackCutoffForPitch', () => {
  it('leaves the reference pitch unchanged', () => {
    expect(trackCutoffForPitch(2500, 261.63)).toBeCloseTo(2500, 3);
  });

  it('raises the cutoff for higher notes', () => {
    expect(trackCutoffForPitch(2500, 523.26)).toBeGreaterThan(2500);
  });
});
