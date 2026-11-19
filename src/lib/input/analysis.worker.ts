import { analyzeChroma } from '../mapping/chroma';
import { songScaleFromChroma, type SongScale } from '../mapping/songScale';

/**
 * Runs the spectral analysis off the main thread.
 *
 * A 90-second track is a few million samples through thousands of FFTs; on a
 * mid-range phone that is long enough to stutter the playing surface if it ran
 * on the main thread. The worker owns no audio nodes and no DOM, and the file
 * it analyses never leaves the device.
 */
export interface AnalysisRequest {
  samples: Float32Array;
  sampleRate: number;
}

export type AnalysisResponse =
  | { kind: 'progress'; fraction: number }
  | { kind: 'done'; song: SongScale | null }
  | { kind: 'error'; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (message: AnalysisResponse, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const { samples, sampleRate } = event.data;

  try {
    const chroma = analyzeChroma(samples, sampleRate, (fraction) => {
      scope.postMessage({ kind: 'progress', fraction });
    });

    if (!chroma) {
      scope.postMessage({ kind: 'done', song: null });
      return;
    }

    scope.postMessage({ kind: 'done', song: songScaleFromChroma(chroma) });
  } catch (error) {
    scope.postMessage({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
