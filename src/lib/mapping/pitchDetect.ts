import { frequencyToMidi } from './pitch';

/**
 * Monophonic pitch detection from raw time-domain samples.
 *
 * Framework-free and pure, like the rest of `mapping/`, so it can be unit-tested
 * by feeding it a generated sine. This is the part of the listening feature that
 * hides real bugs; the browser plumbing around it (getUserMedia, AnalyserNode)
 * lives in `input/mic.ts`.
 */
export interface PitchDetectOptions {
  /** Lowest frequency considered, Hz. */
  minHz?: number;
  /** Highest frequency considered, Hz. */
  maxHz?: number;
  /** Minimum RMS for a frame to count as sound at all. */
  rmsThreshold?: number;
  /** Minimum NSDF peak height (0..1) for a frame to count as a pitch. */
  minClarity?: number;
}

export interface DetectedPitch {
  frequency: number;
  /** Continuous MIDI value for `frequency`. */
  midi: number;
  /** Normalized correlation height at the chosen period, 0..1. */
  clarity: number;
}

/**
 * 65 Hz is below the instrument's own low end (C3, ~131 Hz) and below most
 * melodic material, while still leaving the lag range small enough to stay cheap
 * on a phone. 2 kHz covers the top of the instrument and the melody above it.
 */
export const DEFAULT_MIN_HZ = 65;
export const DEFAULT_MAX_HZ = 2000;
export const DEFAULT_RMS_THRESHOLD = 0.008;
export const DEFAULT_MIN_CLARITY = 0.6;

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Detect the pitch of a monophonic frame, or null when the frame is silent or
 * not periodic enough to name a note.
 *
 * Uses the McLeod Pitch Method: compute the normalized square difference
 * function (NSDF) over the lag range, then take the *first* prominent peak
 * rather than the global maximum. Normalizing makes the peak height comparable
 * across frames, so one clarity threshold works at any loudness; preferring the
 * first prominent peak avoids the octave errors a plain autocorrelation suffers
 * on harmonically rich tones (its second peak, at twice the period, is often
 * just as tall as the true one). The chosen peak is refined by parabolic
 * interpolation so the result is not quantized to whole samples.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: PitchDetectOptions = {},
): DetectedPitch | null {
  const minHz = options.minHz ?? DEFAULT_MIN_HZ;
  const maxHz = options.maxHz ?? DEFAULT_MAX_HZ;
  const rmsThreshold = options.rmsThreshold ?? DEFAULT_RMS_THRESHOLD;
  const minClarity = options.minClarity ?? DEFAULT_MIN_CLARITY;

  const n = samples.length;
  if (n < 4 || !(sampleRate > 0) || minHz >= maxHz) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minHz));
  if (maxLag <= minLag + 1) return null;

  // Remove the DC offset: a constant bias would otherwise dominate the
  // difference function and hide the periodicity.
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += samples[i];
  mean /= n;

  const centered = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i += 1) {
    const value = samples[i] - mean;
    centered[i] = value;
    energy += value * value;
  }
  if (Math.sqrt(energy / n) < rmsThreshold) return null;

  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let acf = 0;
    let norm = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i += 1) {
      const a = centered[i];
      const b = centered[i + lag];
      acf += a * b;
      norm += a * a + b * b;
    }
    nsdf[lag] = norm > 0 ? (2 * acf) / norm : 0;
  }

  let globalMax = 0;
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    const value = nsdf[lag];
    if (value > nsdf[lag - 1] && value >= nsdf[lag + 1] && value > globalMax) {
      globalMax = value;
    }
  }
  if (globalMax <= 0) return null;

  // The first peak within 10% of the tallest is the fundamental period; later,
  // taller-looking peaks are its octave multiples.
  let best = -1;
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    const value = nsdf[lag];
    if (value > nsdf[lag - 1] && value >= nsdf[lag + 1] && value >= 0.9 * globalMax) {
      best = lag;
      break;
    }
  }
  if (best < 0) return null;

  const clarity = nsdf[best];
  if (clarity < minClarity) return null;

  const yPrev = nsdf[best - 1];
  const yHere = nsdf[best];
  const yNext = nsdf[best + 1];
  const denom = yPrev - 2 * yHere + yNext;
  const shift = denom !== 0 ? (0.5 * (yPrev - yNext)) / denom : 0;
  const refinedLag = best + Math.max(-1, Math.min(1, shift));

  const frequency = sampleRate / refinedLag;
  if (!Number.isFinite(frequency) || frequency <= 0) return null;

  return { frequency, midi: frequencyToMidi(frequency), clarity };
}
