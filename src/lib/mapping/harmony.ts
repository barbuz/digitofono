import { clamp01, nearestInScale } from './pitch';
import { isInScale, type ScaleId } from './scales';

/**
 * Harmony intervals above the root, in semitones: a major third and a perfect
 * fifth, i.e. a major triad. Each note is then snapped into the current scale
 * (see `harmonyMidiValues`), so the same intervals become a minor or modal
 * triad where the scale calls for one instead of clashing with it.
 */
export const HARMONY_INTERVALS_SEMITONES: readonly number[] = [4, 7];

/** Number of notes the full chord adds on top of the root. */
export const MAX_HARMONY_NOTES = HARMONY_INTERVALS_SEMITONES.length;

/**
 * MIDI values of the harmony notes above `rootMidi`, one per
 * `HARMONY_INTERVALS_SEMITONES` entry, in ascending order.
 *
 * Each interval note is pulled to the nearest scale degree, so the chord is a
 * diatonic triad: a major third and fifth in the chromatic scale (already exact
 * in-scale), and the scale's own third/fifth in any other scale. The result is
 * forced strictly ascending so a sparse scale cannot collapse two notes onto
 * the same pitch.
 */
export function harmonyMidiValues(rootMidi: number, scale: ScaleId): number[] {
  const values: number[] = [];
  let floor = rootMidi;

  for (const interval of HARMONY_INTERVALS_SEMITONES) {
    let note = rootMidi + interval;
    if (!isInScale(note, scale)) note = nearestInScale(note, scale);
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
