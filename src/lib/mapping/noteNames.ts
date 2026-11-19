/**
 * Pitch-class names in C-based order, index 0 = C.
 *
 * Lives apart from `pitch.ts` so `scales.ts` can name a scale built from a
 * song's pitch classes without importing the module that imports it.
 */
export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
