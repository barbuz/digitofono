import { clamp01, nearestInScale } from './pitch';
import { isInScale, type ScaleId } from './scales';

/**
 * How the harmony notes above the root are chosen.
 *
 * - `diatonic` snaps the intervals into the current scale, so the chord stays
 *   consonant in every scale.
 * - `major` uses the intervals verbatim, ignoring the scale - a fixed major
 *   seventh chord on every root.
 * - `octaves` ignores the intervals and spreads octaves around the root: one
 *   octave below, one above and two above, the most scale-independent voicing.
 */
export type HarmonyVoicing = 'diatonic' | 'major' | 'octaves';

export const HARMONY_VOICING_IDS: readonly HarmonyVoicing[] = ['diatonic', 'major', 'octaves'];

export const HARMONY_VOICING_LABELS: Record<HarmonyVoicing, string> = {
  diatonic: 'Diatonic (in scale)',
  major: 'Major 7th (fixed)',
  octaves: 'Octaves (fixed)',
};

/**
 * Harmony intervals above the root, in semitones: a major third, a perfect
 * fifth and a major seventh, i.e. a major seventh chord. The `diatonic` voicing
 * snaps each note into the current scale (see `harmonyMidiValues`) so the same
 * intervals become the scale's own seventh chord instead of clashing with it.
 */
export const HARMONY_INTERVALS_SEMITONES: readonly number[] = [4, 7, 11];

/**
 * Octave offsets used by the `octaves` voicing: one octave below the root, then
 * one and two octaves above it. The lowest note deliberately sits under the
 * root, so this voicing is not confined to notes above the played pitch.
 */
const OCTAVE_INTERVALS: readonly number[] = [-12, 12, 24];

/** Number of notes the full chord adds on top of the root. */
export const MAX_HARMONY_NOTES = HARMONY_INTERVALS_SEMITONES.length;

/**
 * Fraction of the short axis at which the *nearest* harmony note reaches full
 * level. The farthest note reaches full at the end of the axis (1), so a note's
 * ramp simply starts earlier and is steeper the closer its interval is to the
 * root.
 */
export const HARMONY_FULL_AT = 0.25;

/**
 * MIDI values of the harmony notes for `rootMidi`, one per interval, in
 * ascending order.
 *
 * With the `diatonic` voicing each interval note is pulled to the nearest scale
 * degree, so the chord is a diatonic seventh: a major seventh in the chromatic
 * scale (already exact in-scale) and the scale's own third/fifth/seventh
 * elsewhere. The `major` voicing uses the same intervals verbatim, ignoring the
 * scale. Both stack above the root and are forced strictly ascending, so a
 * sparse scale cannot collapse two notes onto the same pitch.
 *
 * The `octaves` voicing is different: it spreads octaves around the root (one
 * below, one and two above), so its lowest note is intentionally under the root
 * and the "above the root" bump does not apply.
 */
export function harmonyMidiValues(
  rootMidi: number,
  scale: ScaleId,
  voicing: HarmonyVoicing = 'diatonic',
): number[] {
  if (voicing === 'octaves') {
    return OCTAVE_INTERVALS.map((interval) => rootMidi + interval);
  }

  const values: number[] = [];
  let floor = rootMidi;

  for (const interval of HARMONY_INTERVALS_SEMITONES) {
    let note = rootMidi + interval;
    if (voicing === 'diatonic' && !isInScale(note, scale)) {
      note = nearestInScale(note, scale);
    }
    // Keep the stack ascending: bump a note (or a scale that folds one back
    // onto the root) up an octave until it clears the previous note.
    while (note <= floor) note += 12;
    values.push(note);
    floor = note;
  }

  return values;
}

/**
 * Level of each harmony note at a short-axis position, parallel to the ratios
 * returned by `harmonyMidiValues` (so the gains line up with the voicing's
 * notes). At 0 the root sounds bare and at 1 the whole chord is in.
 *
 * Unlike a sequential fade-in, every note starts rising as soon as the axis
 * leaves 0: a note's ramp is steeper the closer its interval is to the root,
 * measured in semitones regardless of sign, so a note below the root ramps like
 * one above it. The nearest note reaches full at `HARMONY_FULL_AT` and the
 * farthest at 1, which means the last note is already audible well before the
 * axis ends. All gains stay monotonic and continuous, so the morph is
 * click-free.
 */
export function harmonyGains(pos: number, voicing: HarmonyVoicing = 'diatonic'): number[] {
  const t = clamp01(pos);
  const distances = harmonyIntervals(voicing).map(Math.abs);
  const nearest = Math.min(...distances);
  const farthest = Math.max(...distances);
  return distances.map((distance) => {
    // The nearest note is full at `HARMONY_FULL_AT`, the farthest at 1; a
    // voicing whose notes all share one distance (none do today) collapses to a
    // single ramp.
    const spread = (distance - nearest) / (farthest - nearest || 1);
    const fullAt = HARMONY_FULL_AT + (1 - HARMONY_FULL_AT) * spread;
    return clamp01(t / fullAt);
  });
}

/** The intervals `harmonyMidiValues` uses for a voicing, for parallel gains. */
function harmonyIntervals(voicing: HarmonyVoicing): readonly number[] {
  return voicing === 'octaves' ? OCTAVE_INTERVALS : HARMONY_INTERVALS_SEMITONES;
}
