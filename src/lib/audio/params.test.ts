import { describe, expect, it } from 'vitest';
import { resolveAxes, TIMBRE_MIN_HZ, TIMBRE_MAX_HZ } from './params';
import { DEFAULT_SETTINGS, type Settings } from '../state/schema';
import { harmonyGains } from '../mapping/harmony';
import {
  ATTACK_MAX,
  ATTACK_MIN,
  FILTER_Q_MAX,
  FILTER_Q_MIN,
  shortAxisToCutoff,
  shortAxisToGain,
} from '../mapping/shortAxis';

function settingsWith(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('resolveAxes', () => {
  it('sweeps the cutoff when timbre is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'timbre' });
    expect(resolveAxes(settings, 0).cutoffHz).toBeCloseTo(TIMBRE_MIN_HZ, 6);
    expect(resolveAxes(settings, 1).cutoffHz).toBeCloseTo(TIMBRE_MAX_HZ, 6);
  });

  it('drives the morph when harmonic morph is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'harmonicMorph' });
    expect(resolveAxes(settings, 0).morph).toBeCloseTo(0, 9);
    expect(resolveAxes(settings, 1).morph).toBeCloseTo(1, 9);
  });

  it('drives the level when volume is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'volume' });
    expect(resolveAxes(settings, 0).level).toBe(0);
    expect(resolveAxes(settings, 1).level).toBe(1);
  });

  it('fades the harmony in when harmony is the short axis', () => {
    const settings = settingsWith({ shortAxis: 'harmony' });
    // One end is the bare note, the other the full chord.
    expect(resolveAxes(settings, 0).harmony).toEqual([0, 0, 0]);
    expect(resolveAxes(settings, 1).harmony).toEqual([1, 1, 1]);
  });

  it('follows the selected voicing so the gains line up with the ratios', () => {
    const settings = settingsWith({ shortAxis: 'harmony', harmonyVoicing: 'octaves' });
    // The octave below (distance 12) is the octaves voicing's nearest note, so
    // it is already full a quarter of the way across the axis.
    expect(resolveAxes(settings, 0.25).harmony[0]).toBeCloseTo(1, 9);
  });

  it('uses the stored values for every parameter that is not the axis', () => {
    const settings = settingsWith({
      shortAxis: 'timbre',
      timbre: 0.4,
      morph: 0.6,
      voiceLevel: 0.8,
      harmony: 0.3,
    });

    const axes = resolveAxes(settings, 0.5);
    // Timbre is the axis, so it follows the finger; the rest stay stored.
    expect(axes.cutoffHz).toBeCloseTo(shortAxisToCutoff(0.5), 6);
    expect(axes.morph).toBeCloseTo(0.6, 9);
    expect(axes.level).toBeCloseTo(shortAxisToGain(0.8), 9);
    expect(axes.harmony).toEqual(harmonyGains(0.3, 'diatonic'));
  });

  it('lets a different axis override only its own stored value', () => {
    const settings = settingsWith({
      shortAxis: 'volume',
      timbre: 0.4,
      morph: 0.6,
      voiceLevel: 0.2,
      harmony: 0.3,
    });

    const axes = resolveAxes(settings, 1);
    expect(axes.cutoffHz).toBeCloseTo(shortAxisToCutoff(0.4), 6);
    expect(axes.morph).toBeCloseTo(0.6, 9);
    expect(axes.level).toBeCloseTo(1, 9);
    expect(axes.harmony).toEqual(harmonyGains(0.3, 'diatonic'));
  });

  it('leaves the harmony silent when its stored amount is zero', () => {
    for (const shortAxis of ['timbre', 'harmonicMorph', 'volume'] as const) {
      const axes = resolveAxes(settingsWith({ shortAxis, harmony: 0 }), 1);
      expect(axes.harmony.every((gain) => gain === 0)).toBe(true);
    }
  });
});

describe('resolveAxes generalized targets', () => {
  it('sweeps filter resonance', () => {
    const settings = settingsWith({ shortAxis: 'filterQ' });
    expect(resolveAxes(settings, 0).filterQ).toBeCloseTo(FILTER_Q_MIN, 9);
    expect(resolveAxes(settings, 1).filterQ).toBeCloseTo(FILTER_Q_MAX, 9);
  });

  it('resolves the envelope from the axis', () => {
    const settings = settingsWith({ shortAxis: 'attack' });
    expect(resolveAxes(settings, 0).envelope.attack).toBeCloseTo(ATTACK_MIN, 9);
    expect(resolveAxes(settings, 1).envelope.attack).toBeCloseTo(ATTACK_MAX, 9);
  });

  it('resolves the wave shape from the axis', () => {
    const settings = settingsWith({ shortAxis: 'darkTilt', darkTilt: 1.2 });
    expect(resolveAxes(settings, 0).waveShape.darkTilt).toBeCloseTo(0.3, 9);
    expect(resolveAxes(settings, 1).waveShape.darkTilt).toBeCloseTo(3, 9);
  });

  it('resolves global targets', () => {
    const settings = settingsWith({
      shortAxis: 'reverb',
      snapStrength: 0.4,
      volume: 0.3,
      reverbAmount: 0.2,
    });
    const axes = resolveAxes(settings, 1);
    expect(axes.reverbAmount).toBeCloseTo(1, 9);
    expect(axes.snapStrength).toBeCloseTo(0.4, 9);
  });

  it('leaves every other value at its stored setting', () => {
    const settings = settingsWith({
      shortAxis: 'reverb',
      timbre: 0.4,
      morph: 0.6,
      voiceLevel: 0.8,
      harmony: 0.3,
      filterQ: 1.4,
      attack: 0.2,
      reverbAmount: 0.2,
    });
    const axes = resolveAxes(settings, 0.5);
    expect(axes.cutoffHz).toBeCloseTo(shortAxisToCutoff(0.4), 6);
    expect(axes.morph).toBeCloseTo(0.6, 9);
    expect(axes.level).toBeCloseTo(shortAxisToGain(0.8), 9);
    expect(axes.harmony).toEqual(harmonyGains(0.3, 'diatonic'));
    expect(axes.filterQ).toBeCloseTo(1.4, 9);
    expect(axes.envelope.attack).toBeCloseTo(0.2, 9);
    expect(axes.reverbAmount).toBeCloseTo(0.5, 9);
  });
});
