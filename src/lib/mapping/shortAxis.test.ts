import { describe, it, expect } from 'vitest';
import {
  ATTACK_MAX,
  ATTACK_MIN,
  AXIS_TARGETS,
  axisValueForPosition,
  FILTER_Q_MAX,
  FILTER_Q_MIN,
  RELEASE_MAX,
  RELEASE_MIN,
  SETUP_SLIDER_IDS,
  SETUP_TARGETS,
  SHORT_AXIS_IDS,
  shortAxisToCutoff,
  shortAxisToMorph,
  shortAxisToGain,
  timbreHzForPosition,
  timbrePositionForHz,
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

describe('timbrePositionForHz', () => {
  it('round-trips through the cutoff curve', () => {
    for (const hz of [300, 800, 2500, 5000, 8000]) {
      expect(timbreHzForPosition(timbrePositionForHz(hz))).toBeCloseTo(hz, 6);
    }
  });

  it('clamps to the sweep bounds', () => {
    expect(timbrePositionForHz(100)).toBe(0);
    expect(timbrePositionForHz(20000)).toBe(1);
  });
});

describe('axisValueForPosition', () => {
  it('interpolates linear targets', () => {
    expect(axisValueForPosition('filterQ', 0)).toBeCloseTo(FILTER_Q_MIN, 9);
    expect(axisValueForPosition('filterQ', 0.5)).toBeCloseTo(
      (FILTER_Q_MIN + FILTER_Q_MAX) / 2,
      9,
    );
    expect(axisValueForPosition('filterQ', 1)).toBeCloseTo(FILTER_Q_MAX, 9);
  });

  it('sweeps log targets exponentially', () => {
    expect(axisValueForPosition('attack', 0)).toBeCloseTo(ATTACK_MIN, 9);
    expect(axisValueForPosition('attack', 0.5)).toBeCloseTo(
      Math.sqrt(ATTACK_MIN * ATTACK_MAX),
      9,
    );
    expect(axisValueForPosition('attack', 1)).toBeCloseTo(ATTACK_MAX, 9);
  });

  it('covers every log target monotonically', () => {
    for (const id of ['attack', 'decay', 'release'] as const) {
      let previous = -Infinity;
      for (let i = 0; i <= 20; i += 1) {
        const value = axisValueForPosition(id, i / 20);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it('clamps out-of-range positions', () => {
    expect(axisValueForPosition('release', -1)).toBeCloseTo(RELEASE_MIN, 9);
    expect(axisValueForPosition('release', 2)).toBeCloseTo(RELEASE_MAX, 9);
  });
});

describe('short-axis target list', () => {
  it('keeps setup-only sliders out of the axis choices', () => {
    expect(SHORT_AXIS_IDS).not.toContain('masterVolume');
    for (const id of SETUP_SLIDER_IDS) {
      expect(SHORT_AXIS_IDS as string[]).not.toContain(id);
    }
  });

  it('declares a usable extent and help text for every axis target', () => {
    for (const id of SHORT_AXIS_IDS) {
      const target = AXIS_TARGETS[id];
      expect(target.min).toBeLessThan(target.max);
      expect(target.step).toBeGreaterThan(0);
      expect(target.description.length).toBeGreaterThan(0);
    }
  });

  it('declares a usable extent and help text for every setup slider', () => {
    for (const id of SETUP_SLIDER_IDS) {
      const target = SETUP_TARGETS[id];
      expect(target.min).toBeLessThan(target.max);
      expect(target.step).toBeGreaterThan(0);
      expect(target.description.length).toBeGreaterThan(0);
    }
  });
});
