import { isInScale, type ScaleId } from './scales';

export const A4_MIDI = 69;
export const A4_HZ = 440;

export function midiToFrequency(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function frequencyToMidi(freq: number): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_HZ);
}

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

/** Scientific pitch notation, e.g. 60 -> "C4", 69 -> "A4". */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

export interface PitchRange {
  baseMidi: number;
  octaveSpan: number;
}

/**
 * Continuous MIDI value for a normalized position along the long axis.
 * Logarithmic by construction: equal screen distance = equal musical interval.
 */
export function positionToMidi(pos: number, range: PitchRange): number {
  const clamped = clamp01(pos);
  return range.baseMidi + clamped * 12 * range.octaveSpan;
}

/** Inverse of `positionToMidi`; useful for drawing scale marks. */
export function midiToPosition(midi: number, range: PitchRange): number {
  return clamp01((midi - range.baseMidi) / (12 * range.octaveSpan));
}

/**
 * Nearest scale degree to `midi`. Ties break toward the lower note so the
 * result is deterministic.
 */
export function nearestInScale(midi: number, scale: ScaleId): number {
  const lower = Math.floor(midi);
  const upper = Math.ceil(midi);

  let best = lower;
  let bestDistance = Infinity;

  // Scan a full octave either side; prefer the lower candidate on a tie so the
  // result is deterministic.
  for (let candidate = lower - 12; candidate <= upper + 12; candidate += 1) {
    if (!isInScale(candidate, scale)) continue;
    const distance = Math.abs(candidate - midi);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

/**
 * Soft snap: blends the continuous pitch toward the nearest scale degree.
 * `strength = 0` is the identity (free glide); `strength = 1` lands exactly on
 * a scale degree. The result is monotonic non-decreasing in `pos`.
 */
export function positionToSnappedMidi(
  pos: number,
  range: PitchRange,
  scale: ScaleId,
  strength: number,
): number {
  const raw = positionToMidi(pos, range);
  const s = clamp01(strength);
  if (s === 0) return raw;
  const nearest = nearestInScale(raw, scale);
  return raw + s * (nearest - raw);
}

/** Convenience: normalized position straight to frequency in Hz. */
export function positionToFrequency(
  pos: number,
  range: PitchRange,
  scale: ScaleId,
  strength: number,
): number {
  return midiToFrequency(positionToSnappedMidi(pos, range, scale, strength));
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}
