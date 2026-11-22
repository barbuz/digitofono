import { describe, expect, it } from 'vitest';
import { analyzeChroma, frameSizeFor } from './chroma';
import { midiToFrequency } from './pitch';

const SAMPLE_RATE = 11025;

/** A tone with a few harmonics, so peak picking has something realistic. */
function addTone(
  buffer: Float32Array,
  start: number,
  duration: number,
  midi: number,
  amplitude = 0.3,
  detuneCents = 0,
): void {
  const frequency = midiToFrequency(midi) * Math.pow(2, detuneCents / 1200);
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.floor((start + duration) * SAMPLE_RATE));
  for (let i = startSample; i < endSample; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.min(1, (i - startSample) / 400) * Math.min(1, (endSample - i) / 400);
    let value = 0;
    for (let h = 1; h <= 4; h += 1) {
      value += (amplitude / h) * Math.sin(2 * Math.PI * frequency * h * t);
    }
    buffer[i] += value * envelope;
  }
}

function melody(notes: number[], detuneCents = 0, secondsEach = 0.4): Float32Array {
  const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * (notes.length * secondsEach + 0.5)));
  notes.forEach((midi, index) => {
    addTone(buffer, index * secondsEach, secondsEach, midi, 0.3, detuneCents);
  });
  return buffer;
}

/** Pitch classes above a fraction of the peak, as a set. */
function classesAbove(chroma: number[], fraction: number): number[] {
  const peak = Math.max(...chroma);
  return chroma
    .map((value, pc) => ({ value, pc }))
    .filter((entry) => entry.value >= peak * fraction)
    .map((entry) => entry.pc);
}

describe('frameSizeFor', () => {
  it('keeps the window the same length in time at every rate', () => {
    for (const rate of [8000, 11025, 22050, 32000, 44100, 48000]) {
      const seconds = frameSizeFor(rate) / rate;
      // Within one power-of-two step of the 372 ms reference window.
      expect(seconds).toBeGreaterThan(0.26);
      expect(seconds).toBeLessThan(0.53);
    }
  });

  it('returns a power of two, which the FFT requires', () => {
    for (const rate of [8000, 11025, 16000, 22050, 32000, 44100, 48000, 96000]) {
      const size = frameSizeFor(rate);
      expect(size & (size - 1)).toBe(0);
    }
  });

  it('leaves the 11 kHz analysis exactly as it was', () => {
    expect(frameSizeFor(11025)).toBe(4096);
  });

  it('gives a semitone near the bottom of the band several bins at any rate', () => {
    // A2 (110 Hz) to A#2 (116.54 Hz) is 6.54 Hz; it must not collapse into one
    // bin, which is what a fixed sample-count frame did at high rates.
    const semitoneHz = midiToFrequency(69) * (Math.pow(2, 1 / 12) - 1);
    for (const rate of [11025, 22050, 44100, 48000]) {
      expect(semitoneHz / (rate / frameSizeFor(rate))).toBeGreaterThan(1.5);
    }
  });
});

describe('analyzeChroma', () => {
  it('returns null for silence and for buffers shorter than a frame', () => {
    expect(analyzeChroma(new Float32Array(SAMPLE_RATE), SAMPLE_RATE)).toBeNull();
    expect(analyzeChroma(new Float32Array(64), SAMPLE_RATE)).toBeNull();
  });

  it('puts a C major triad on C, E and G and nothing else', () => {
    const buffer = new Float32Array(SAMPLE_RATE * 3);
    addTone(buffer, 0, 3, 60);
    addTone(buffer, 0, 3, 64);
    addTone(buffer, 0, 3, 67);

    const result = analyzeChroma(buffer, SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(classesAbove(result!.chroma, 0.35).sort()).toEqual([0, 4, 7]);
  });

  it('keeps a melody note that is played once among held accompaniment', () => {
    const buffer = new Float32Array(SAMPLE_RATE * 6);
    addTone(buffer, 0, 6, 48, 0.25);
    addTone(buffer, 0, 6, 55, 0.25);
    addTone(buffer, 2, 0.6, 73, 0.3);

    const result = analyzeChroma(buffer, SAMPLE_RATE);
    const chroma = result!.chroma;
    // The melody note is one short, quiet event against two long held notes,
    // so it will not dominate - but it must still be visible.
    expect(chroma[1]).toBeGreaterThan(chroma[3]);
    expect(chroma[1]).toBeGreaterThan(chroma[10]);
  });

  it('reports no tuning offset for an in-tune recording', () => {
    const result = analyzeChroma(melody([60, 62, 64, 65, 67, 69, 71, 72]), SAMPLE_RATE);
    expect(Math.abs(result!.tuningCents)).toBeLessThanOrEqual(6);
  });

  it('recovers a sharp and a flat tuning offset', () => {
    const sharp = analyzeChroma(melody([60, 64, 67, 72], 30), SAMPLE_RATE);
    expect(sharp!.tuningCents).toBeGreaterThan(20);
    expect(sharp!.tuningCents).toBeLessThan(40);

    const flat = analyzeChroma(melody([60, 64, 67, 72], -25), SAMPLE_RATE);
    expect(flat!.tuningCents).toBeLessThan(-15);
    expect(flat!.tuningCents).toBeGreaterThan(-35);
  });

  it('keeps the pitch classes correct when the recording is detuned', () => {
    // A detuned recording must still name the right notes: the offset is
    // measured so it can be undone before folding. The *set* is what matters -
    // a chord's root is inferred, not the loudest bin, since a root's own third
    // harmonic reinforces the fifth.
    const result = analyzeChroma(melody([60, 64, 67], 35), SAMPLE_RATE);
    expect(classesAbove(result!.chroma, 0.35).sort()).toEqual([0, 4, 7]);
  });

  it('reports the register the music occupies', () => {
    const low = analyzeChroma(melody([48, 50, 52]), SAMPLE_RATE);
    const high = analyzeChroma(melody([72, 74, 76]), SAMPLE_RATE);

    expect(low!.lowMidi).toBeLessThan(high!.lowMidi);
    expect(low!.highMidi).toBeLessThan(high!.highMidi);
    expect(low!.lowMidi).toBeGreaterThan(40);
    expect(low!.highMidi).toBeLessThan(60);
    expect(high!.lowMidi).toBeGreaterThan(65);
    expect(high!.highMidi).toBeLessThan(85);
  });

  it('reports progress while analysing', () => {
    const fractions: number[] = [];
    analyzeChroma(melody([60, 64, 67, 72]), SAMPLE_RATE, (fraction) => fractions.push(fraction));
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});

describe('bass profile', () => {
  /** A bass line: long low notes, the way a real one is played. */
  function bassLine(notes: number[], secondsEach = 2): Float32Array {
    const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * (notes.length * secondsEach + 2)));
    notes.forEach((midi, index) => {
      addTone(buffer, index * secondsEach, secondsEach, midi, 0.5);
    });
    return buffer;
  }

  it('names the lowest voice, which is what tells a key from its relatives', () => {
    // A C major triad cannot say whether the key is C, or F, or A minor: they
    // share these notes. The bass can.
    const result = analyzeChroma(bassLine([36, 36, 48, 36]), SAMPLE_RATE);

    expect(result).not.toBeNull();
    expect(result!.bass[0]).toBeCloseTo(1, 1);
    expect(result!.bass[5]).toBeLessThan(0.2);
  });

  it('follows a bass line that moves', () => {
    const result = analyzeChroma(bassLine([36, 43, 36, 43]), SAMPLE_RATE);

    expect(result).not.toBeNull();
    // C and G share the profile roughly evenly, and nothing else competes.
    expect(result!.bass[0]).toBeGreaterThan(0.4);
    expect(result!.bass[7]).toBeGreaterThan(0.4);
    expect(result!.bass[1]).toBeLessThan(0.2);
    expect(result!.bass[2]).toBeLessThan(0.2);
  });

  it('ignores a kick drum, which lives in the same band but is not a note', () => {
    // A kick is a fast downward sweep, loud and tonal enough to pass a flatness
    // gate, and it crosses every pitch class on the way down. It has no
    // harmonics, which is the only thing that separates it from a bass note.
    // Without this gate a four-on-the-floor track votes for a random key.
    const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * 8));
    for (let beat = 0; beat < 16; beat += 1) {
      const start = Math.floor(beat * 0.5 * SAMPLE_RATE);
      for (let i = 0; i < 0.1 * SAMPLE_RATE && start + i < buffer.length; i += 1) {
        const t = i / SAMPLE_RATE;
        buffer[start + i] +=
          0.45 * Math.exp(-t * 24) * Math.sin(2 * Math.PI * (55 * Math.exp(-t * 30) + 45) * t);
      }
    }

    const result = analyzeChroma(buffer, SAMPLE_RATE);

    expect(result).not.toBeNull();
    expect(Math.max(...result!.bass)).toBe(0);
  });

  it('reports no bass rather than a guess when there is none', () => {
    // All zeros means "no evidence", which the key finder must not read as
    // twelve equally likely tonics.
    const result = analyzeChroma(melody([72, 74, 76, 79]), SAMPLE_RATE);

    expect(result).not.toBeNull();
    expect(result!.bass.every((value) => value === 0)).toBe(true);
  });

  it('normalizes the profile so only its shape is used', () => {
    const quiet = analyzeChroma(bassLine([36, 36, 48]), SAMPLE_RATE);
    const loud = analyzeChroma(bassLine([36, 36, 48]).map((value) => value * 0.25), SAMPLE_RATE);

    expect(quiet).not.toBeNull();
    expect(loud).not.toBeNull();
    quiet!.bass.forEach((value, index) => {
      expect(value).toBeCloseTo(loud!.bass[index], 2);
    });
  });
});

describe('band edge', () => {
  /**
   * Two notes of equal amplitude must come back with equal weight. A2 sits
   * exactly on CHROMA_MIN_HZ and B2 does not, so a hard band edge inflates A2
   * purely because of where it falls - measured at 1.39x before the taper.
   */
  it('weighs notes either side of the low cutoff equally', () => {
    const a = melody([45], 0, 2);
    const b = melody([47], 0, 2);
    const mix = new Float32Array(Math.min(a.length, b.length));
    for (let i = 0; i < mix.length; i += 1) mix[i] = a[i] + b[i];

    const result = analyzeChroma(mix, SAMPLE_RATE);
    expect(result).not.toBeNull();

    const ratio = result!.chroma[9] / result!.chroma[11];
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.15);
  });

  it('still hears the lowest note of the band', () => {
    const result = analyzeChroma(melody([45, 45, 57, 57]), SAMPLE_RATE);
    expect(result).not.toBeNull();
    const { chroma } = result!;
    expect(chroma[9] / Math.max(...chroma)).toBeGreaterThan(0.5);
  });
});
