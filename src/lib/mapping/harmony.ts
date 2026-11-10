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
 * Level of each harmony note at a short-axis position, parallel to
 * `HARMONY_INTERVALS_SEMITONES`. Note `i` fades in across its own equal slice of
 * the axis, so 0 sounds the single root note and 1 sounds the full chord; the
 * ramp within each slice keeps the morph continuous and click-free.
 */
export function harmonyGains(pos: number): number[] {
  const t = clamp01(pos);
  const count = MAX_HARMONY_NOTES;
  return Array.from({ length: count }, (_, i) => {
    const start = i / count;
    const end = (i + 1) / count;
    return clamp01((t - start) / (end - start));
  });
}
