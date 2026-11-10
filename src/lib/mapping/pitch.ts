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
 * The two consecutive scale degrees bracketing `midi`: the closest degree at or
 * below it and the closest at or above it. Both equal `midi` when it sits on a
 * degree.
 */
function bracketingDegrees(midi: number, scale: ScaleId): { lo: number; hi: number } {
  let lo = Math.floor(midi);
  while (!isInScale(lo, scale)) lo -= 1;
  let hi = Math.ceil(midi);
  while (!isInScale(hi, scale)) hi += 1;
  return { lo, hi };
}

/**
 * Soft snap: pulls the continuous pitch onto the nearest scale degree.
 *
 * The pull is *strongest when you are close to a degree and fades to nothing at
 * the midpoint between two degrees*. Within `lock` semitones of a degree the
 * result is exactly that degree, so a small playing error is corrected outright.
 * Outside that region the pitch follows the finger again, so any pitch between
 * two degrees stays reachable. `strength` widens the locked region: 0 is the
 * identity (free glide) and 1 locks the whole interval (plain quantization).
 *
 * A distance-proportional pull would do the opposite - drag hardest exactly
 * where the player is furthest from a note, making it impossible to leave the
 * scale on purpose. Saturating the correction at its maximum near the degree is
 * also the strongest pull possible without overshooting the note, and keeping it
 * continuous and monotonic means no pitch jumps while sliding.
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

  const { lo, hi } = bracketingDegrees(raw, scale);
  if (lo === hi) return raw;

  const half = (hi - lo) / 2;
  const lock = s * half;
  const dLo = raw - lo;
  const dHi = hi - raw;
  const nearest = dLo <= dHi ? lo : hi;

  // At full strength the locked regions meet, leaving plain quantization.
  if (lock >= half) return nearest;

  const distance = Math.min(dLo, dHi);
  if (distance <= lock) return nearest;

  // Outside the lock the pull fades to nothing at the midpoint, so the mapping
  // stays continuous and every pitch between two degrees remains reachable.
  const t = (distance - lock) / (half - lock);
  const midpoint = lo + half;
  return nearest + (midpoint - nearest) * t;
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
