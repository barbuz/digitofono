/**
 * Timing for the touch markers left on the playing surface.
 *
 * A marker expands quickly while the finger is still moving, then holds its
 * size for the rest of its life so it reads as a stable "note I already played"
 * dot rather than a ring that keeps growing until it vanishes. Slowing the fade
 * is therefore about the linger time, not a slower expansion.
 */

/** Time from tap to full expansion, in milliseconds. */
export const EXPAND_MS = 160;

/** Radius the marker expands to, in CSS pixels (scaled by the caller's dpr). */
export const RING_RADIUS = 24;

export interface RippleVisual {
  /** Current ring radius in CSS pixels. */
  radius: number;
  /** Stroke opacity, 0..1. */
  alpha: number;
  /** Filled-dot opacity, 0..1. */
  dotAlpha: number;
}

/**
 * Visual state of a marker `ageMs` after the tap, for a marker that should
 * linger for `decayMs` in total.
 */
export function rippleVisual(ageMs: number, decayMs: number): RippleVisual {
  const total = Math.max(EXPAND_MS, decayMs);
  const age = Math.max(0, Math.min(ageMs, total));

  const growth = Math.min(1, age / EXPAND_MS);
  // Ease-out so the ring arrives without a hard stop.
  const eased = 1 - (1 - growth) * (1 - growth);
  const radius = 4 + eased * (RING_RADIUS - 4);

  const remaining = 1 - age / total;
  const alpha = remaining * 0.6;
  const dotAlpha = remaining * 0.35;

  return { radius, alpha, dotAlpha };
}

/** Whether a marker of the given age is still worth drawing. */
export function rippleAlive(ageMs: number, decayMs: number): boolean {
  return ageMs < Math.max(EXPAND_MS, decayMs);
}
