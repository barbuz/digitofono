import { isInScale, type ScaleId } from './scales';
import { midiToPosition, type PitchRange } from './pitch';

/** A single scale step, placed along the long axis of the playing surface. */
export interface ScaleLine {
  /** The MIDI note of this scale step. */
  midi: number;
  /** Normalized position along the long axis, 0 (low) .. 1 (high). */
  pos: number;
  /** True for the tonic of each octave, so it can be drawn a little stronger. */
  isTonic: boolean;
}

/**
 * Every step of `scale` reachable within `range`, in ascending pitch order.
 *
 * This is what the on-screen guide lines are drawn from, so it deliberately
 * uses the same position mapping as playback: a line sits exactly where the
 * snapped pitch for that note would be played.
 */
export function scaleLines(range: PitchRange, scale: ScaleId): ScaleLine[] {
  const lowest = Math.ceil(range.baseMidi);
  const highest = Math.floor(range.baseMidi + 12 * range.octaveSpan);
  const tonicPc = ((Math.round(range.baseMidi) % 12) + 12) % 12;

  const lines: ScaleLine[] = [];
  for (let midi = lowest; midi <= highest; midi += 1) {
    if (!isInScale(midi, scale)) continue;
    lines.push({
      midi,
      pos: midiToPosition(midi, range),
      isTonic: ((midi % 12) + 12) % 12 === tonicPc,
    });
  }
  return lines;
}
