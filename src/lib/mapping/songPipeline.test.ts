import { describe, expect, it } from 'vitest';
import { analyzeChroma } from './chroma';
import { songScaleFromChroma } from './songScale';
import { isInScale } from './scales';
import { midiToFrequency } from './pitch';

/**
 * The whole analysis chain, from samples to playable frets.
 *
 * The unit tests cover each stage; this pins that the stages agree with each
 * other, which is where a feature like this actually breaks: a scale that looks
 * right in isolation but whose pitch classes the mapping layer never plays.
 */

const SAMPLE_RATE = 11025;

function addTone(
  buffer: Float32Array,
  start: number,
  duration: number,
  midi: number,
  amplitude = 0.3,
): void {
  const frequency = midiToFrequency(midi);
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

/** A short passage over a C major triad, melody included. */
function cMajorSong(): Float32Array {
  const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * 4));
  addTone(buffer, 0, 4, 48, 0.25);
  addTone(buffer, 0, 4, 52, 0.25);
  addTone(buffer, 0, 4, 55, 0.25);
  // Melody: G, A, B, C - all in C major, one at a time.
  addTone(buffer, 0.2, 0.7, 67);
  addTone(buffer, 1.0, 0.7, 69);
  addTone(buffer, 1.8, 0.7, 71);
  addTone(buffer, 2.6, 0.7, 72);
  return buffer;
}

function analyse(samples: Float32Array) {
  const chroma = analyzeChroma(samples, SAMPLE_RATE);
  expect(chroma).not.toBeNull();
  const song = songScaleFromChroma(chroma!);
  expect(song).not.toBeNull();
  return song!;
}

describe('song analysis pipeline', () => {
  it('finds the song key from a real passage', () => {
    const song = analyse(cMajorSong());
    expect(song.tonic).toBe(0);
    expect(song.scale).toBe('major');
    expect(song.label).toBe('C major');
  });

  it('produces pitch classes the mapping layer will actually play', () => {
    const song = analyse(cMajorSong());

    // Every selected pitch class must be playable: the guide lines and the
    // snap-to-scale both ask `isInScale`, so this is the contract.
    for (let midi = song.baseMidi; midi <= song.baseMidi + song.octaveSpan * 12; midi += 1) {
      const pc = ((midi % 12) + 12) % 12;
      expect(isInScale(midi, song.pitchClasses)).toBe(song.pitchClasses.includes(pc));
    }
  });

  it('keeps the song notes and drops notes it never plays', () => {
    const song = analyse(cMajorSong());
    // C, E, G, A and B are played; F and the black keys are not.
    for (const pc of [0, 4, 7, 9, 11]) {
      expect(song.pitchClasses).toContain(pc);
    }
    expect(song.pitchClasses).not.toContain(1);
    expect(song.pitchClasses).not.toContain(6);
  });

  it('drops an in-key note the song never actually plays', () => {
    // C major without any E: the frets are the notes that sound, not the whole
    // theoretical key, which is the point of laying them out from the audio.
    const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * 4));
    addTone(buffer, 0, 4, 48, 0.25);
    addTone(buffer, 0, 4, 55, 0.25);
    addTone(buffer, 0.5, 0.7, 69);
    addTone(buffer, 1.4, 0.7, 71);
    addTone(buffer, 2.3, 0.7, 72);

    const song = analyse(buffer);
    expect(song.pitchClasses).not.toContain(4);
    expect(song.pitchClasses).toContain(0);
  });

  it('fits the axis to the register the song occupies', () => {
    const song = analyse(cMajorSong());
    expect(song.baseMidi).toBeLessThanOrEqual(48);
    expect(song.baseMidi + song.octaveSpan * 12).toBeGreaterThanOrEqual(72);
    // And not wastefully wide: the whole point of fitting the axis.
    expect(song.octaveSpan).toBeLessThanOrEqual(5);
  });

  it('recovers a transposed song', () => {
    const buffer = new Float32Array(Math.ceil(SAMPLE_RATE * 3));
    addTone(buffer, 0, 3, 50, 0.25);
    addTone(buffer, 0, 3, 57, 0.25);
    addTone(buffer, 0.3, 0.8, 62);
    addTone(buffer, 1.2, 0.8, 66);
    addTone(buffer, 2.0, 0.8, 69);

    const song = analyse(buffer);
    expect(song.tonic).toBe(2);
    expect(song.pitchClasses).toContain(6);
    expect(song.pitchClasses).toContain(9);
  });

  it('refuses to invent a scale from unpitched noise', () => {
    const noise = new Float32Array(SAMPLE_RATE * 3);
    let seed = 1;
    for (let i = 0; i < noise.length; i += 1) {
      // Deterministic white noise, which has no pitch classes at all.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = (seed / 0x7fffffff - 0.5) * 0.6;
    }
    const chroma = analyzeChroma(noise, SAMPLE_RATE);
    // Either the analysis finds nothing, or the key finder is unimpressed
    // enough that no scale is proposed - but never a confident answer.
    const song = chroma ? songScaleFromChroma(chroma) : null;
    expect(song === null || song.confidence < 0.9).toBe(true);
  });
});

/**
 * The bug this guards against: the flatness gate used to reject *every* frame
 * of a real recording, because its cutoff (0.12) was calibrated on synthetic
 * tones, which measure near zero, while a mastered mix measures ~0.5 even on
 * its most tonal frames. `analyzeChroma` then returned null and the UI said
 * "no clear notes found in the file" for almost any real song.
 *
 * A dense mix is therefore the test input, not a clean triad: percussion, hats
 * and a broadband noise floor on every frame, which is what an actual MP3
 * sounds like after decoding.
 */
function denseMix(tonic: number, intervals: readonly number[], noise: number, seed: number): Float32Array {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };

  const length = SAMPLE_RATE * 8;
  const buffer = new Float32Array(length);
  const frequency = (midi: number) => midiToFrequency(midi);
  const at = (pc: number) => 48 + (((pc - 48) % 12) + 12) % 12;

  // Chords on I - V - vi - IV, drawn from the scale.
  const progression = [0, 4, 5, 3].map((degree) => {
    const root = at((tonic + intervals[degree % intervals.length]) % 12);
    return [root, root + (intervals.includes(4) ? 4 : 3), root + 7];
  });
  progression.forEach((chord, index) => {
    const start = Math.floor(index * 2 * SAMPLE_RATE);
    const end = Math.floor((index + 1) * 2 * SAMPLE_RATE);
    for (let i = start; i < end && i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      let value = 0;
      for (const note of chord) {
        for (let h = 1; h <= 6; h += 1) {
          value += (0.08 / h) * Math.sin(2 * Math.PI * frequency(note) * h * t);
        }
      }
      buffer[i] += value;
    }
  });

  // A melody that uses degrees the chords do not, so the fret set must be wider
  // than the harmony alone.
  const tune = [0, 2, 4, 1, 3, 5, 4, 0, 2, 4, 6, 5, 3, 1, 0, 2];
  tune.forEach((step, index) => {
    const midi = 72 + ((tonic + intervals[step % intervals.length]) % 12);
    const start = Math.floor(index * 0.5 * SAMPLE_RATE);
    const end = Math.floor((index * 0.5 + 0.45) * SAMPLE_RATE);
    for (let i = start; i < end && i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      const envelope = Math.min(1, (i - start) / 300, (end - i) / 300);
      let value = 0;
      for (let h = 1; h <= 5; h += 1) {
        value += (0.1 / h) * Math.sin(2 * Math.PI * frequency(midi) * h * t);
      }
      buffer[i] += value * envelope;
    }
  });

  for (let beat = 0; beat < 16; beat += 1) {
    const start = Math.floor(beat * 0.5 * SAMPLE_RATE);
    for (let i = 0; i < 0.1 * SAMPLE_RATE && start + i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      buffer[start + i] += 0.45 * Math.exp(-t * 24) * Math.sin(2 * Math.PI * (55 * Math.exp(-t * 30) + 45) * t);
    }
  }
  for (let hat = 0; hat < 32; hat += 1) {
    const start = Math.floor((hat * 0.25 + 0.1) * SAMPLE_RATE);
    for (let i = 0; i < 0.05 * SAMPLE_RATE && start + i < length; i += 1) {
      buffer[start + i] += 0.15 * Math.exp(-(i / SAMPLE_RATE) * 90) * (random() * 2 - 1);
    }
  }

  for (let i = 0; i < length; i += 1) buffer[i] += noise * (random() * 2 - 1);

  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(buffer[i]));
  for (let i = 0; i < length; i += 1) buffer[i] /= peak || 1;
  return buffer;
}

describe('analysis of a dense mix', () => {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];

  const cases: readonly [string, number, readonly number[]][] = [
    ['C major', 0, MAJOR],
    ['G major', 7, MAJOR],
    ['E major', 4, MAJOR],
    ['Eb major', 3, MAJOR],
    ['A minor', 9, MINOR],
    ['D minor', 2, MINOR],
    ['F# minor', 6, MINOR],
    ['G minor', 7, MINOR],
  ];

  for (const [name, tonic, intervals] of cases) {
    it(`finds the notes of ${name} through percussion and noise`, () => {
      const buffer = denseMix(tonic, intervals, 0.05, tonic * 13 + 7);
      const result = analyzeChroma(buffer, SAMPLE_RATE);
      expect(result).not.toBeNull();

      const song = songScaleFromChroma(result!);
      expect(song).not.toBeNull();

      const expected = intervals.map((degree) => (tonic + degree) % 12).sort((a, b) => a - b);
      expect(song!.pitchClasses).toEqual(expected);
    });
  }

  it('still refuses unpitched noise, so the gate has not simply been disabled', () => {
    let state = 99;
    const random = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const buffer = new Float32Array(SAMPLE_RATE * 6);
    for (let i = 0; i < buffer.length; i += 1) buffer[i] = random() * 2 - 1;

    expect(analyzeChroma(buffer, SAMPLE_RATE)).toBeNull();
  });
});
