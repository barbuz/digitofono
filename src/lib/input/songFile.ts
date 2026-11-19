import type { SongScale } from '../mapping/songScale';
import type { AnalysisRequest, AnalysisResponse } from './analysis.worker';

/**
 * Turns a local audio file into a scale, entirely on the device.
 *
 * Mirrors `MicListener` and `Player`: Svelte-free, driven by plain method calls
 * from the UI. The file is read with `FileReader`, decoded by Web Audio and
 * analysed in a worker; nothing is uploaded, and no audio is played back.
 */

/** Rate the analysis runs at. 11 kHz keeps it cheap and still covers the band. */
export const ANALYSIS_SAMPLE_RATE = 11025;

/**
 * Only the first part of a track is analysed. A song states its scale in the
 * first verse, and the cap keeps a long file to a couple of seconds of work on
 * a phone.
 */
export const MAX_ANALYSIS_SECONDS = 90;

export interface SongFileEvents {
  onProgress?: (fraction: number) => void;
}

export class SongAnalyser {
  private worker: Worker | null = null;
  private events: SongFileEvents;

  constructor(events: SongFileEvents = {}) {
    this.events = events;
  }

  /**
   * Decode `file`, downsample it and return the scale it uses.
   *
   * Resolves with `null` when the recording has too little pitched content to
   * name notes (speech, drums, near-silence) rather than guessing.
   */
  async analyse(file: File): Promise<SongScale | null> {
    const bytes = await file.arrayBuffer();
    const samples = await this.toMonoSamples(bytes);
    return this.analyseSamples(samples, ANALYSIS_SAMPLE_RATE);
  }

  /** Release the worker. Safe to call more than once. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  /**
   * Decode and resample in one step.
   *
   * `OfflineAudioContext` is given the target rate, so `decodeAudioData`
   * resamples while decoding and there is no separate resampling pass. Its
   * length argument is a placeholder: `decodeAudioData` returns the buffer the
   * file actually contains.
   */
  private async toMonoSamples(bytes: ArrayBuffer): Promise<Float32Array> {
    const OfflineContext =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!OfflineContext) throw new Error('Audio decoding is not supported here.');

    const context = new OfflineContext(1, ANALYSIS_SAMPLE_RATE, ANALYSIS_SAMPLE_RATE);
    const buffer = await context.decodeAudioData(bytes);

    // Mixing to mono is what the chroma wants: a stereo split of the same note
    // would otherwise count twice.
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    const limit = Math.min(
      left.length,
      Math.floor(MAX_ANALYSIS_SECONDS * ANALYSIS_SAMPLE_RATE),
    );

    const mono = new Float32Array(limit);
    for (let i = 0; i < limit; i += 1) {
      mono[i] = right ? (left[i] + right[i]) / 2 : left[i];
    }
    return mono;
  }

  private analyseSamples(samples: Float32Array, sampleRate: number): Promise<SongScale | null> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    const worker = this.worker;

    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
        const message = event.data;
        if (message.kind === 'progress') {
          this.events.onProgress?.(message.fraction);
          return;
        }
        worker.onmessage = null;
        worker.onerror = null;
        if (message.kind === 'error') {
          reject(new Error(message.message));
          return;
        }
        resolve(message.song);
      };

      worker.onerror = (event) => {
        worker.onmessage = null;
        worker.onerror = null;
        reject(new Error(event.message || 'Audio analysis failed.'));
      };

      const request: AnalysisRequest = { samples, sampleRate };
      worker.postMessage(request, [samples.buffer]);
    });
  }
}
