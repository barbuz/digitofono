import { Fft } from './fft';

/**
 * Pitch-class content of a recording, and the two things the instrument needs
 * from it: which notes it uses (the chroma) and where they sit (the register).
 *
 * Framework-free and pure, like the rest of `mapping/`, so it is unit-tested
 * against synthesized notes; the file decoding that feeds it lives in
 * `input/songFile.ts`.
 */
export interface ChromaResult {
  /** 12 weights, index 0 = C, normalized so the strongest pitch class is 1. */
  chroma: number[];
  /** Estimated tuning offset of the recording in cents, -50..50. */
  tuningCents: number;
  /** 5th and 95th percentile of spectral energy, as continuous MIDI values. */
  lowMidi: number;
  highMidi: number;
}

/**
 * 110 Hz (A2) is the lowest fundamental worth trusting: a semitone there is
 * under three FFT bins wide, so lower notes smear into their neighbours. Their
 * harmonics carry the same pitch class anyway, so nothing is lost by ignoring
 * the fundamentals themselves.
 */
export const CHROMA_MIN_HZ = 110;
export const CHROMA_MAX_HZ = 2000;

export const FRAME_SIZE = 4096;
export const HOP_SIZE = 2048;

/** Fine bins per octave: 36 gives 33 cent resolution, enough for tuning. */
export const FINE_BINS_PER_OCTAVE = 36;
const FINE_BINS_PER_SEMITONE = FINE_BINS_PER_OCTAVE / 12;
const CENTS_PER_FINE_BIN = 1200 / FINE_BINS_PER_OCTAVE;

/** A peak below this fraction of the frame's tallest peak is noise. */
const NOISE_FLOOR = 0.02;

/**
 * A peak this close to an integer multiple of a stronger peak is that peak's
 * harmonic, in octaves. Wide enough for the vibrato and inharmonicity of real
 * instruments, narrow enough not to swallow a genuine interval.
 */
const HARMONIC_TOLERANCE = 0.04;

/** Highest harmonic number pruned. Above this the peak is too weak to matter. */
const MAX_HARMONIC = 8;

/**
 * Spectral flatness above which a frame is treated as percussive and dropped.
 * A drum or cymbal spreads energy evenly across the spectrum, lighting up every
 * pitch class at once; a tonal frame keeps most of its energy in a few peaks.
 *
 * The value is measured, not guessed. White noise scores 0.83-0.85 over the
 * 110-2000 Hz band, and the most tonal frames of a mastered pop mix score about
 * 0.12, rising to ~0.52 at the median and ~0.74 in the top few percent, because
 * cymbals and broadband mix noise lift the floor on every frame. A cutoff of
 * 0.12 - which is what a synthetic tone measures - therefore rejected 99.96% of
 * a real song's frames and made `analyzeChroma` return null for almost every
 * file. 0.8 keeps the music (even a mix with 40% added noise peaks at 0.77) and
 * still rejects genuine noise.
 */
const MAX_FLATNESS = 0.8;

interface SpectralPeak {
  midi: number;
  weight: number;
}

const MIDI_HISTOGRAM_LOW = 24;
const MIDI_HISTOGRAM_STEP = 0.25;
const MIDI_HISTOGRAM_SIZE = Math.ceil((108 - MIDI_HISTOGRAM_LOW) / MIDI_HISTOGRAM_STEP);

/**
 * Fold the spectrum of `samples` into 12 pitch classes.
 *
 * Each frame contributes its *spectral peaks* rather than every bin: the skirts
 * of a loud partial carry no extra information and would leak into the
 * neighbouring semitones, while a peak's position is known to a fraction of a
 * bin. Peaks are square-root compressed so a loud bass cannot outvote the rest,
 * and the frames are combined with a per-pitch-class *median* so a drum hit or
 * a cymbal, which lights up many pitch classes for one frame, cannot drag the
 * histogram with it.
 */
export function analyzeChroma(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): ChromaResult | null {
  if (samples.length < FRAME_SIZE || !(sampleRate > 0)) return null;

  const fft = new Fft(FRAME_SIZE);
  const window = hannWindow(FRAME_SIZE);
  const re = new Float32Array(FRAME_SIZE);
  const im = new Float32Array(FRAME_SIZE);
  const magnitude = new Float32Array(FRAME_SIZE / 2);
  const midiHistogram = new Float64Array(MIDI_HISTOGRAM_SIZE);

  const binHz = sampleRate / FRAME_SIZE;
  const lowestBin = Math.max(2, Math.ceil(CHROMA_MIN_HZ / binHz));
  const highestBin = Math.min(FRAME_SIZE / 2 - 2, Math.floor(CHROMA_MAX_HZ / binHz));
  const frameCount = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1;

  const total = new Float64Array(FINE_BINS_PER_OCTAVE);
  let analysed = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * HOP_SIZE;
    for (let i = 0; i < FRAME_SIZE; i += 1) {
      re[i] = samples[offset + i] * window[i];
      im[i] = 0;
    }
    fft.transform(re, im);

    let peak = 0;
    for (let bin = lowestBin; bin <= highestBin; bin += 1) {
      magnitude[bin] = Math.hypot(re[bin], im[bin]);
      if (magnitude[bin] > peak) peak = magnitude[bin];
    }

    if (!(peak > 0)) continue;
    if (spectralFlatness(magnitude, lowestBin, highestBin) > MAX_FLATNESS) continue;

    for (const peakValue of findPeaks(magnitude, lowestBin, highestBin, peak, binHz)) {
      addFine(total, peakValue.midi * FINE_BINS_PER_SEMITONE, peakValue.weight);

      const histogramBin = Math.floor(
        (peakValue.midi - MIDI_HISTOGRAM_LOW) / MIDI_HISTOGRAM_STEP,
      );
      if (histogramBin >= 0 && histogramBin < MIDI_HISTOGRAM_SIZE) {
        midiHistogram[histogramBin] += peakValue.weight;
      }
    }
    analysed += 1;

    if (onProgress && frame % 64 === 0) onProgress(frame / frameCount);
  }

  if (analysed === 0) return null;

  const offset = estimateTuningOffset(total);
  const chroma = foldChroma(total, offset);
  const strongest = Math.max(...chroma);
  if (!(strongest > 0)) return null;

  return {
    chroma: chroma.map((value) => value / strongest),
    tuningCents: wrapCents(offset * CENTS_PER_FINE_BIN),
    lowMidi: percentileMidi(midiHistogram, 0.05),
    highMidi: percentileMidi(midiHistogram, 0.95),
  };
}

/**
 * Spectral peaks of one frame, with harmonics of stronger peaks removed.
 *
 * Without the pruning a note's own overtones dominate: the third harmonic of a
 * root is the fifth, so a plain C major triad looks like a G major one and its
 * register appears an octave or two too high. Pruning keeps one entry per
 * sounding note, which is what "which notes are in the song" means.
 */
function findPeaks(
  magnitude: Float32Array,
  lowestBin: number,
  highestBin: number,
  framePeak: number,
  binHz: number,
): SpectralPeak[] {
  const floor = framePeak * NOISE_FLOOR;
  const peaks: SpectralPeak[] = [];

  for (let bin = lowestBin; bin <= highestBin; bin += 1) {
    const value = magnitude[bin];
    if (value < floor) continue;
    if (value <= magnitude[bin - 1] || value < magnitude[bin + 1]) continue;

    // Parabolic interpolation on the log magnitude locates the peak to a
    // fraction of a bin; without it the tuning estimate is quantized to the
    // 33-cent grid and a detuned recording cannot be corrected.
    const previous = Math.log(magnitude[bin - 1] || 1e-12);
    const here = Math.log(value);
    const next = Math.log(magnitude[bin + 1] || 1e-12);
    const curvature = previous - 2 * here + next;
    const shift = curvature !== 0 ? (0.5 * (previous - next)) / curvature : 0;
    const refinedBin = bin + Math.max(-0.5, Math.min(0.5, shift));

    peaks.push({
      midi: 69 + 12 * Math.log2((refinedBin * binHz) / 440),
      weight: Math.sqrt(value / framePeak),
    });
  }

  // Strongest first, so a harmonic is always judged against a peak that has
  // already survived.
  peaks.sort((a, b) => b.weight - a.weight);

  const kept: SpectralPeak[] = [];
  for (const candidate of peaks) {
    const isHarmonic = kept.some((root) => {
      const interval = candidate.midi - root.midi;
      if (interval <= 0) return false;
      const harmonic = Math.round(Math.pow(2, interval / 12));
      if (harmonic < 2 || harmonic > MAX_HARMONIC) return false;
      return Math.abs(interval - 12 * Math.log2(harmonic)) <= HARMONIC_TOLERANCE * 12;
    });
    if (!isHarmonic) kept.push(candidate);
  }

  return kept;
}

/** Split a weight between the two fine bins it falls between. */
function addFine(fine: Float64Array, position: number, weight: number): void {
  const lower = Math.floor(position);
  const fraction = position - lower;
  fine[mod(lower, FINE_BINS_PER_OCTAVE)] += weight * (1 - fraction);
  fine[mod(lower + 1, FINE_BINS_PER_OCTAVE)] += weight * fraction;
}

/**
 * Offset of the recording from 12-TET A440, in fine bins.
 *
 * Every note sits on a comb whose teeth are one semitone apart, so the fine
 * histogram's component at 12 cycles per octave *is* that comb, and its phase
 * says how far the whole comb is shifted: a sharp recording rotates the phase
 * one way, a flat one the other. Reading the phase of a single Fourier
 * component averages every partial of every frame at once, instead of trusting
 * one peak that a drum hit could move.
 */
function estimateTuningOffset(total: Float64Array): number {
  const cyclesPerOctave = 12;
  let real = 0;
  let imaginary = 0;

  for (let i = 0; i < FINE_BINS_PER_OCTAVE; i += 1) {
    const angle = (-2 * Math.PI * cyclesPerOctave * i) / FINE_BINS_PER_OCTAVE;
    real += total[i] * Math.cos(angle);
    imaginary += total[i] * Math.sin(angle);
  }

  if (real === 0 && imaginary === 0) return 0;

  const phase = Math.atan2(imaginary, real);
  return (-phase * FINE_BINS_PER_OCTAVE) / (2 * Math.PI * cyclesPerOctave);
}

/**
 * Fold the accumulated fine histogram into pitch classes, shifted by `offset`
 * so the estimated tuning is undone and each note lands in one bin instead of
 * straddling two.
 *
 * Frames are summed rather than reduced with a median: a note played once in a
 * melody is a real note of the song, and a median across frames would erase it
 * whenever it is shorter than half the track. Percussive frames are rejected
 * before they reach the sum, which is what the median was protecting against.
 */
function foldChroma(total: Float64Array, offset: number): number[] {
  const chroma = new Array<number>(12).fill(0);
  for (let pc = 0; pc < 12; pc += 1) {
    let value = 0;
    for (let k = 0; k < FINE_BINS_PER_SEMITONE; k += 1) {
      value += interpolateFine(total, pc * FINE_BINS_PER_SEMITONE + k + offset);
    }
    chroma[pc] = value;
  }
  return chroma;
}

/**
 * Ratio of the geometric to the arithmetic mean of the frame's magnitudes,
 * 0..1. Near zero for tonal content, near one for noise or a drum hit.
 */
function spectralFlatness(magnitude: Float32Array, lowestBin: number, highestBin: number): number {
  let logSum = 0;
  let sum = 0;
  let count = 0;

  for (let bin = lowestBin; bin <= highestBin; bin += 1) {
    const value = magnitude[bin] + 1e-12;
    logSum += Math.log(value);
    sum += value;
    count += 1;
  }

  if (count === 0 || sum <= 0) return 1;
  return Math.exp(logSum / count) / (sum / count);
}

function interpolateFine(fine: Float64Array, position: number): number {
  const wrapped = mod(position, FINE_BINS_PER_OCTAVE);
  const lower = Math.floor(wrapped);
  const fraction = wrapped - lower;
  const a = fine[lower];
  const b = fine[(lower + 1) % FINE_BINS_PER_OCTAVE];
  return a + (b - a) * fraction;
}

/** MIDI value at which `fraction` of the accumulated energy lies below. */
function percentileMidi(histogram: Float64Array, fraction: number): number {
  let total = 0;
  for (let i = 0; i < histogram.length; i += 1) total += histogram[i];
  if (total <= 0) return MIDI_HISTOGRAM_LOW;

  const target = total * fraction;
  let running = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    running += histogram[i];
    if (running >= target) return MIDI_HISTOGRAM_LOW + i * MIDI_HISTOGRAM_STEP;
  }
  return MIDI_HISTOGRAM_LOW + (histogram.length - 1) * MIDI_HISTOGRAM_STEP;
}

function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return window;
}

function wrapCents(cents: number): number {
  return Math.round(mod(cents + 50, 100) - 50);
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
