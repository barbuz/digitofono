import { describe, it, expect } from 'vitest';
import { detectPitch, rms } from './pitchDetect';
import { midiToFrequency } from './pitch';

const SAMPLE_RATE = 48000;
const N = 4096;

function sine(frequency: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
  }
  return out;
}

/** A fundamental plus harmonics, to exercise the octave-error case. */
function harmonicTone(frequency: number, partials: number[]): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    let value = 0;
    partials.forEach((amp, h) => {
      value += amp * Math.sin((2 * Math.PI * frequency * (h + 1) * i) / SAMPLE_RATE);
    });
    out[i] = value;
  }
  return out;
}

describe('rms', () => {
  it('is zero for silence and ~amplitude/sqrt(2) for a sine', () => {
    expect(rms(new Float32Array(N))).toBe(0);
    expect(rms(sine(440, 0.5))).toBeCloseTo(0.5 / Math.SQRT2, 3);
  });
});

describe('detectPitch', () => {
  it('recovers the frequency of a plain sine', () => {
    for (const hz of [110, 220, 261.6255653, 440, 880]) {
      const result = detectPitch(sine(hz), SAMPLE_RATE);
      expect(result).not.toBeNull();
      expect(result!.frequency).toBeCloseTo(hz, 1);
    }
  });

  it('maps a detected frequency to the matching MIDI value', () => {
    const result = detectPitch(sine(midiToFrequency(69)), SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(result!.midi).toBeCloseTo(69, 1);
  });

  it('does not report the octave above a rich tone', () => {
    // Strong 2nd harmonic: a plain autocorrelation can lock onto 2x the period.
    const result = detectPitch(harmonicTone(220, [1, 0.9, 0.6, 0.4]), SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(result!.frequency).toBeCloseTo(220, 1);
  });

  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(N), SAMPLE_RATE)).toBeNull();
  });

  it('returns null for a quiet frame below the RMS threshold', () => {
    expect(detectPitch(sine(440, 0.001), SAMPLE_RATE)).toBeNull();
  });

  it('returns null for white noise (no clear period)', () => {
    let seed = 12345;
    const noise = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      // Deterministic LCG so the case never flakes.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    expect(detectPitch(noise, SAMPLE_RATE)).toBeNull();
  });

  it('rejects frames that are too short to hold a period', () => {
    expect(detectPitch(sine(440).subarray(0, 8), SAMPLE_RATE)).toBeNull();
  });

  it('rejects a frequency range that cannot be searched', () => {
    expect(detectPitch(sine(440), SAMPLE_RATE, { minHz: 1000, maxHz: 100 })).toBeNull();
  });
});
