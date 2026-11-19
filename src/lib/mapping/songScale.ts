import { NOTE_NAMES } from './noteNames';
import { SCALES, SCALE_LABELS, type ScaleId } from './scales';
import type { ChromaResult } from './chroma';

/**
 * Turns the pitch-class histogram of a recording into a scale the instrument
 * can play: which pitch classes to lay out as guide lines, and which part of
 * the screen they occupy.
 *
 * The pitch classes are the primary output and the named key is secondary, on
 * purpose. A major key and its relative minor share all seven notes, so the
 * label is genuinely ambiguous while the set of notes is not - the player gets
 * the right frets even when the key name is a coin toss.
 */

export interface KeyCandidate {
  tonic: number;
  scale: ScaleId;
  /** Template correlation minus the out-of-key penalty. */
  score: number;
  label: string;
}

export interface SongScale {
  /** Pitch classes to use as the song's frets, ascending, 0 = C. */
  pitchClasses: number[];
  /** Best-fitting key, or null when the recording is too unclear to name one. */
  tonic: number | null;
  scale: ScaleId | null;
  /** "C major" when a key was found, otherwise a note list. */
  label: string;
  /** 0..1; low when the top two keys fit almost equally well. */
  confidence: number;
  /** Runner-up keys, best first, so the UI can show the ambiguity. */
  candidates: KeyCandidate[];
  /** Base note and span that put the song's register across the long axis. */
  baseMidi: number;
  octaveSpan: number;
  tuningCents: number;
  lowMidi: number;
  highMidi: number;
}

/**
 * Krumhansl-Kessler key profiles: the measured sense of stability listeners
 * give each scale degree, strongest at the tonic.
 *
 * These are used rather than hand-picked weights because they are the standard,
 * independently validated template for key finding, and because a made-up
 * weighting breaks ties arbitrarily: on a plain set of the seven white keys,
 * nothing in the data can separate C major from A minor, so the decision has to
 * come from the profile, not from floating-point noise.
 */
const KK_MAJOR: readonly number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KK_MINOR: readonly number[] = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

/** Scales the key finder may report; `chromatic` would fit anything. */
const CANDIDATE_SCALES: readonly ScaleId[] = [
  'major',
  'naturalMinor',
  'dorian',
  'mixolydian',
  'majorPentatonic',
  'minorPentatonic',
  'blues',
];

/**
 * A scale degree must carry at least this fraction of the strongest pitch
 * class to count as present at all.
 *
 * Set by the melody case rather than the accompaniment: a note played once for
 * a bar against a sustained pad carries around a fifth of the pad's energy, and
 * it is a real note of the song. Below roughly a tenth the bin is indistinguishable
 * from the bleed a loud note leaves in its neighbours, so the floor cannot go
 * much lower without turning spectral leakage into frets.
 */
export const SUPPORT_FRACTION = 0.12;

/**
 * An out-of-key note must be this strong to be added anyway. Passing tones and
 * borrowed chords are real notes in the song; a weak bin is just noise.
 */
export const STRONG_FRACTION = 0.45;

/** Below this many present pitch classes the recording is not a song. */
export const MIN_PITCH_CLASSES = 3;

/** Weight of the out-of-key energy subtracted from the template correlation. */
const OUTSIDE_PENALTY = 0.35;

/** Rotation of a profile by `tonic` semitones, giving a 12-vector. */
function rotate(profile: readonly number[], tonic: number): number[] {
  const template = new Array<number>(12).fill(0);
  for (let semitone = 0; semitone < 12; semitone += 1) {
    template[((tonic + semitone) % 12 + 12) % 12] = profile[semitone];
  }
  return template;
}

/**
 * Template for a key.
 *
 * Major and natural minor use the measured profiles directly. The modes reuse
 * the major profile rotated to the mode's own tonic, which is the standard
 * approximation: a mode is a rotation of the major scale, so its stability
 * pattern is the same shape. The pentatonic and blues scales keep only the
 * profile values on their own degrees, since a note the scale does not contain
 * cannot be a degree of it.
 */
function keyTemplate(tonic: number, scale: ScaleId): number[] {
  const base =
    scale === 'naturalMinor' || scale === 'minorPentatonic' || scale === 'blues'
      ? KK_MINOR
      : KK_MAJOR;

  if (scale === 'major') return rotate(KK_MAJOR, tonic);
  if (scale === 'naturalMinor') return rotate(KK_MINOR, tonic);

  const degrees = new Set(SCALES[scale]);
  const restricted = base.map((value, semitone) => (degrees.has(semitone) ? value : 0));
  return rotate(restricted, tonic);
}

/**
 * Pearson correlation of two 12-vectors.
 *
 * Deliberately not a plain cosine: a template that zeroes out the notes a scale
 * does not contain would *gain* similarity by having a smaller norm, so a mode
 * that omits a note the song plays could outscore the scale that contains it.
 * Subtracting the mean makes an absent note a negative contribution instead of
 * a free pass, which is what makes the comparison honest.
 */
function correlation(a: readonly number[], b: readonly number[]): number {
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < 12; i += 1) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= 12;
  meanB /= 12;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 12; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    dot += da * db;
    normA += da * da;
    normB += db * db;
  }
  return normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
}

/**
 * Score every tonic/scale pair. Energy outside the key is subtracted rather
 * than ignored: the better fit explains the song's notes *and* leaves little
 * unexplained, which is what separates C major from, say, F major on the same
 * material.
 */
export function rankKeys(chroma: readonly number[]): KeyCandidate[] {
  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return [];

  const candidates: KeyCandidate[] = [];
  for (const scale of CANDIDATE_SCALES) {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      const template = keyTemplate(tonic, scale);
      let outside = 0;
      for (let pc = 0; pc < 12; pc += 1) {
        if (template[pc] === 0) outside += chroma[pc];
      }
      candidates.push({
        tonic,
        scale,
        score: correlation(chroma, template) - OUTSIDE_PENALTY * (outside / total),
        label: `${NOTE_NAMES[tonic]} ${SCALE_LABELS[scale].toLowerCase()}`,
      });
    }
  }

  candidates.sort(compareCandidates);
  return candidates;
}

/**
 * Best fit first. An exact tie is a real outcome, not an accident: a set of
 * notes with no emphasis among them fits every rotation of the scale equally
 * well, because a rotation permutes the same values. Nothing in the audio can
 * break that, so the tie is broken toward the major key - the relative major is
 * the likelier reading of an ambiguous passage - and then toward the lower
 * tonic, so the result is at least deterministic.
 */
function compareCandidates(a: KeyCandidate, b: KeyCandidate): number {
  const byScore = b.score - a.score;
  if (Math.abs(byScore) > 1e-9) return byScore;
  if (a.scale === 'major' && b.scale !== 'major') return -1;
  if (b.scale === 'major' && a.scale !== 'major') return 1;
  return a.tonic - b.tonic;
}

/** Pitch classes carrying enough weight to be notes of the song. */
export function presentPitchClasses(chroma: readonly number[]): number[] {
  const peak = Math.max(...chroma);
  if (!(peak > 0)) return [];
  const support = peak * SUPPORT_FRACTION;

  const present: number[] = [];
  for (let pc = 0; pc < 12; pc += 1) {
    if (chroma[pc] >= support) present.push(pc);
  }
  return present;
}

/**
 * Pitch classes to lay out as frets: the key's supported degrees plus any
 * out-of-key note strong enough to be deliberate.
 */
export function selectPitchClasses(chroma: readonly number[], key: KeyCandidate | null): number[] {
  const peak = Math.max(...chroma);
  if (!(peak > 0)) return [];

  const support = peak * SUPPORT_FRACTION;
  const strong = peak * STRONG_FRACTION;
  const degrees = key
    ? new Set(SCALES[key.scale].map((degree) => ((key.tonic + degree) % 12 + 12) % 12))
    : null;

  const selected: number[] = [];
  for (let pc = 0; pc < 12; pc += 1) {
    const inKey = degrees ? degrees.has(pc) : false;
    if (inKey ? chroma[pc] >= support : chroma[pc] >= strong) selected.push(pc);
  }

  // A threshold that guts the key (a sparse arrangement, a quiet section) is
  // less trustworthy than the key itself, so fall back to the full scale.
  if (degrees && selected.length < MIN_PITCH_CLASSES) {
    return [...degrees].sort((a, b) => a - b);
  }
  return selected;
}

/**
 * Base note and span that spread the song's register across the long axis.
 *
 * A semitone of margin at each end keeps the highest and lowest notes off the
 * extreme edges, where a guide line would sit half off-screen. The span snaps
 * to the half-octave steps the settings offer.
 */
export function fitRange(
  lowMidi: number,
  highMidi: number,
): { baseMidi: number; octaveSpan: number } {
  const low = clamp(Math.floor(lowMidi) - 1, 12, 71);
  const high = Math.max(Math.ceil(highMidi) + 1, low + 12);

  let octaveSpan = clamp(Math.ceil(((high - low) / 12) * 2) / 2, 1, 5);
  while (low + octaveSpan * 12 < high && octaveSpan < 5) octaveSpan += 0.5;

  return { baseMidi: low, octaveSpan };
}

export function songScaleFromChroma(result: ChromaResult): SongScale | null {
  if (presentPitchClasses(result.chroma).length < MIN_PITCH_CLASSES) return null;

  const candidates = rankKeys(result.chroma);
  const key = candidates[0] ?? null;
  const pitchClasses = selectPitchClasses(result.chroma, key);
  if (pitchClasses.length < MIN_PITCH_CLASSES) return null;

  const runnerUp = candidates[1];
  const margin = key && runnerUp ? key.score - runnerUp.score : key ? 1 : 0;
  const { baseMidi, octaveSpan } = fitRange(result.lowMidi, result.highMidi);

  return {
    pitchClasses,
    tonic: key ? key.tonic : null,
    scale: key ? key.scale : null,
    label: key ? key.label : pitchClasses.map((pc) => NOTE_NAMES[pc]).join(' '),
    // The top two fits differ by well under 0.05 for a genuinely ambiguous
    // track, and by more than 0.1 for a clear one.
    confidence: clamp(margin / 0.1, 0, 1),
    candidates: candidates.slice(0, 3),
    baseMidi,
    octaveSpan,
    tuningCents: result.tuningCents,
    lowMidi: result.lowMidi,
    highMidi: result.highMidi,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return value < min ? min : value > max ? max : value;
}
