import { describe, expect, it } from 'vitest';
import { resolveAxes, TIMBRE_MIN_HZ, TIMBRE_MAX_HZ } from './params';
import { PRESETS } from './presets';
import { DEFAULT_SETTINGS, type Settings } from '../state/schema';

const preset = PRESETS.warm;

function settingsWith(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('resolveAxes', () => {
  it('sweeps the cutoff when timbre is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'timbre' });
    expect(resolveAxes(settings, preset, 0).cutoffHz).toBeCloseTo(TIMBRE_MIN_HZ, 6);
    expect(resolveAxes(settings, preset, 1).cutoffHz).toBeCloseTo(TIMBRE_MAX_HZ, 6);
  });

  it('drives the morph when harmonic morph is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'harmonicMorph' });
    expect(resolveAxes(settings, preset, 0).morph).toBeCloseTo(0, 9);
    expect(resolveAxes(settings, preset, 1).morph).toBeCloseTo(1, 9);
  });

  it('drives the level when volume is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'volume' });
    expect(resolveAxes(settings, preset, 0).level).toBe(0);
    expect(resolveAxes(settings, preset, 1).level).toBe(1);
  });

  it('fades the harmony in when harmony is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'harmony' });
    // One end is the bare note, the other the full chord.
    expect(resolveAxes(settings, preset, 0).harmony).toEqual([0, 0, 0]);
    expect(resolveAxes(settings, preset, 1).harmony).toEqual([1, 1, 1]);
  });

  it('follows the selected voicing so the gains line up with the ratios', () => {
    const settings = settingsWith({ shortAxis: 'harmony', harmonyVoicing: 'octaves' });
    // The octave below (distance 12) is the octaves voicing's nearest note, so
    // it is already full a quarter of the way across the axis.
    expect(resolveAxes(settings, preset, 0.25).harmony[0]).toBeCloseTo(1, 9);
  });

  it('leaves the harmony silent when it is not the short axis', () => {
    for (const shortAxis of ['timbre', 'harmonicMorph', 'volume'] as const) {
      const axes = resolveAxes(settingsWith({ shortAxis }), preset, 1);
      expect(axes.harmony.every((g) => g === 0)).toBe(true);
    }
  });

  it('falls back to the preset when an axis is not selected', () => {
    const axes = resolveAxes(settingsWith({ shortAxis: 'harmony' }), preset, 0.5);
    expect(axes.cutoffHz).toBe(preset.filterDefaultHz);
    expect(axes.morph).toBe(preset.morphDefault);
    expect(axes.level).toBe(1);
  });
});
