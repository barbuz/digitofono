export type ScaleId =
  | 'chromatic'
  | 'major'
  | 'naturalMinor'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'blues'
  | 'dorian'
  | 'mixolydian';

/**
 * Pitch classes (semitones above the tonic, 0-11). v1 only ships `chromatic`,
 * but the mapping layer is generic so new scales are a data-only change.
 */
export const SCALES: Record<ScaleId, readonly number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

export const SCALE_LABELS: Record<ScaleId, string> = {
  chromatic: 'Chromatic',
  major: 'Major',
  naturalMinor: 'Natural minor',
  majorPentatonic: 'Major pentatonic',
  minorPentatonic: 'Minor pentatonic',
  blues: 'Blues',
  dorian: 'Dorian',
  mixolydian: 'Mixolydian',
};

export function isInScale(midi: number, scale: ScaleId): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return SCALES[scale].includes(pc);
}
