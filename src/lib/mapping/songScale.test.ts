import { describe, expect, it } from 'vitest';
import {
  fitRange,
  rankKeys,
  selectPitchClasses,
  songScaleFromChroma,
  MIN_PITCH_CLASSES,
} from './songScale';
import type { ChromaResult } from './chroma';
import { SCALES } from './scales';

/** Chroma with the given pitch classes at full weight and the rest at zero. */
function chromaOf(pitchClasses: number[], weight = 1): number[] {
  const chroma = new Array<number>(12).fill(0);
  for (const pc of pitchClasses) chroma[((pc % 12) + 12) % 12] = weight;
  return chroma;
}

/**
 * Chroma of a real passage: the tonic and fifth are played most, the leading
 * tone and mediant less. A perfectly flat chroma carries no tonic information
 * at all, so it cannot test key finding.
 */
function tonalChroma(tonic: number, scale: 'major' | 'naturalMinor'): number[] {
  const weights =
    scale === 'major'
      ? [1, 0.2, 0.55, 0.2, 0.65, 0.45, 0.2, 0.8, 0.2, 0.5, 0.2, 0.35]
      : [1, 0.2, 0.45, 0.75, 0.2, 0.5, 0.2, 0.8, 0.55, 0.2, 0.35, 0.2];
  const degrees = scale === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const chroma = new Array<number>(12).fill(0);
  for (const degree of degrees) {
    chroma[((tonic + degree) % 12 + 12) % 12] = weights[degree];
  }
  return chroma;
}

function result(overrides: Partial<ChromaResult> = {}): ChromaResult {
  return {
    chroma: tonalChroma(0, 'major'),
    tuningCents: 0,
    lowMidi: 55,
    highMidi: 79,
    ...overrides,
  };
}

describe('rankKeys', () => {
  it('finds C major from a tonal passage', () => {
    const best = rankKeys(tonalChroma(0, 'major'))[0];
    expect(best.tonic).toBe(0);
    expect(best.scale).toBe('major');
  });

  it('finds other major keys too', () => {
    for (const tonic of [2, 5, 7, 10]) {
      const best = rankKeys(tonalChroma(tonic, 'major'))[0];
      expect(best.tonic).toBe(tonic);
      expect(best.scale).toBe('major');
    }
  });

  it('finds the relative minor when the minor third is emphasised', () => {
    // A minor and C major share all seven notes; only the emphasis on A, C# and
    // G tells them apart.
    const best = rankKeys(tonalChroma(9, 'naturalMinor'))[0];
    expect(best.tonic).toBe(9);
    expect(best.scale).toBe('naturalMinor');
  });

  it('finds a mode instead of forcing major or minor', () => {
    // D dorian: the white keys with D leading. Dorian's signature is the
    // natural sixth (B), which is what separates it from D natural minor.
    const chroma = chromaOf([0, 2, 4, 5, 7, 9, 11]);
    chroma[2] = 1;
    chroma[9] = 0.9;
    chroma[11] = 0.7;
    chroma[5] = 0.6;
    for (const pc of [0, 4, 7]) chroma[pc] = 0.25;
    const best = rankKeys(chroma)[0];
    expect(best.tonic).toBe(2);
    expect(best.scale).toBe('dorian');
  });

  it('finds a pentatonic scale from five notes', () => {
    const chroma = chromaOf([0, 2, 4, 7, 9]);
    chroma[0] = 1;
    chroma[7] = 0.85;
    chroma[4] = 0.6;
    chroma[2] = 0.45;
    chroma[9] = 0.4;
    const best = rankKeys(chroma)[0];
    expect(best.tonic).toBe(0);
    expect(best.scale).toBe('majorPentatonic');
  });

  it('still names the right notes when the key itself is ambiguous', () => {
    // Seven equally loud white keys fit several rotations of the scale, so the
    // key label is a coin toss - but every candidate uses the same seven notes,
    // so the frets are right whichever label wins.
    const chroma = chromaOf([0, 2, 4, 5, 7, 9, 11]);
    const song = songScaleFromChroma(result({ chroma }))!;
    expect(song.pitchClasses).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(song.candidates.length).toBe(3);
  });

  it('returns nothing for an empty chroma', () => {
    expect(rankKeys(new Array(12).fill(0))).toEqual([]);
  });

  it('ranks every tonic and scale, best first', () => {
    const candidates = rankKeys(chromaOf([0, 2, 4, 5, 7, 9, 11]));
    expect(candidates.length).toBe(12 * 7);
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });

  it('labels candidates with the note name and scale', () => {
    const best = rankKeys(tonalChroma(0, 'major'))[0];
    expect(best.label).toBe('C major');
  });
});

describe('selectPitchClasses', () => {
  it('keeps the key degrees the song actually uses', () => {
    // C major but F and B are barely touched, so they are not frets.
    const chroma = chromaOf([0, 2, 4, 5, 7, 9, 11]);
    chroma[5] = 0.05;
    chroma[11] = 0.05;
    const key = rankKeys(chroma)[0];
    expect(selectPitchClasses(chroma, key)).toEqual([0, 2, 4, 7, 9]);
  });

  it('keeps a strong out-of-key note, which is a real borrowed note', () => {
    // C major with a strong Ab: a borrowed chord, not noise. The key degrees
    // have to carry a realistic spread - an all-equal chroma cannot tell a
    // borrowed chord from the chords around it, and no recording looks like that.
    const chroma = chromaOf([0, 2, 4, 5, 7, 9, 11]);
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) chroma[pc] = 0.5 + (pc % 4) * 0.05;
    chroma[8] = 0.6;
    const key = rankKeys(chroma)[0];
    expect(selectPitchClasses(chroma, key)).toContain(8);
  });

  it('drops a weak out-of-key note as noise', () => {
    const chroma = chromaOf([0, 2, 4, 5, 7, 9, 11]);
    chroma[1] = 0.1;
    const key = rankKeys(chroma)[0];
    expect(selectPitchClasses(chroma, key)).not.toContain(1);
  });

  it('falls back to the whole key when too few degrees survive', () => {
    // A very sparse chroma would otherwise leave an unplayable scale.
    const chroma = chromaOf([0, 2, 4, 5, 7, 9, 11]);
    chroma[0] = 1;
    for (const pc of [2, 4, 5, 7, 9, 11]) chroma[pc] = 0.02;
    const key = rankKeys(chroma)[0];
    const selected = selectPitchClasses(chroma, key);
    expect(selected.length).toBeGreaterThanOrEqual(MIN_PITCH_CLASSES);
    expect(selected).toEqual([...SCALES[key.scale]].map((d) => (key.tonic + d) % 12).sort((a, b) => a - b));
  });

  it('falls back to strong notes when no key was found', () => {
    const chroma = chromaOf([0, 4, 7]);
    expect(selectPitchClasses(chroma, null)).toEqual([0, 4, 7]);
  });

  it('returns nothing for an empty chroma', () => {
    expect(selectPitchClasses(new Array(12).fill(0), null)).toEqual([]);
  });
});

describe('fitRange', () => {
  it('spreads the song across the axis with a semitone of margin', () => {
    const range = fitRange(55, 79);
    expect(range.baseMidi).toBe(54);
    expect(range.baseMidi + range.octaveSpan * 12).toBeGreaterThanOrEqual(80);
  });

  it('never asks for a span outside the settings range', () => {
    for (const [low, high] of [[55, 57], [30, 100], [60, 60]] as const) {
      const range = fitRange(low, high);
      expect(range.octaveSpan).toBeGreaterThanOrEqual(1);
      expect(range.octaveSpan).toBeLessThanOrEqual(5);
      expect(range.baseMidi).toBeGreaterThanOrEqual(12);
      expect(range.baseMidi).toBeLessThanOrEqual(71);
    }
  });

  it('covers the whole song', () => {
    for (const [low, high] of [[55, 79], [40, 62], [70, 88]] as const) {
      const range = fitRange(low, high);
      expect(range.baseMidi).toBeLessThanOrEqual(low);
      expect(range.baseMidi + range.octaveSpan * 12).toBeGreaterThanOrEqual(high);
    }
  });
});

describe('songScaleFromChroma', () => {
  it('returns the key, its pitch classes and the fitted range', () => {
    const song = songScaleFromChroma(result());
    expect(song).not.toBeNull();
    expect(song!.tonic).toBe(0);
    expect(song!.scale).toBe('major');
    expect(song!.label).toBe('C major');
    expect(song!.pitchClasses).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(song!.baseMidi).toBe(54);
    expect(song!.octaveSpan).toBeGreaterThan(0);
  });

  it('reports low confidence when two keys fit almost equally', () => {
    const song = songScaleFromChroma(result());
    expect(song!.confidence).toBeLessThan(1);
  });

  it('lists the runner-up keys so the ambiguity is visible', () => {
    const song = songScaleFromChroma(result());
    expect(song!.candidates.length).toBe(3);
    expect(song!.candidates[0].score).toBeGreaterThanOrEqual(song!.candidates[1].score);
  });

  it('carries the tuning estimate through', () => {
    const song = songScaleFromChroma(result({ tuningCents: 12 }));
    expect(song!.tuningCents).toBe(12);
  });

  it('returns null when the chroma is too sparse to be a song', () => {
    expect(songScaleFromChroma(result({ chroma: new Array(12).fill(0) }))).toBeNull();
    expect(songScaleFromChroma(result({ chroma: chromaOf([0]) }))).toBeNull();
  });
});
