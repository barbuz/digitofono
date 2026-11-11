import { detectPitch, type DetectedPitch, type PitchDetectOptions } from '../mapping/pitchDetect';

export interface MicListenerOptions extends PitchDetectOptions {
  /**
   * Frames with no pitch needed before the highlight clears. Momentary
   * dropouts (a plucked note's decay, a breath) would otherwise make the marker
   * flicker off and on between every note.
   */
  holdFrames?: number;
}

export const DEFAULT_HOLD_FRAMES = 4;

export interface MicListenerEvents {
  onPitch?: (pitch: DetectedPitch | null) => void;
  onError?: (error: unknown) => void;
}

/**
 * Captures microphone audio, runs the pure detector on each animation frame and
 * reports the detected pitch. Deliberately Svelte-free and driven by plain
 * method calls, mirroring `Player`; the UI subscribes to `onPitch`.
 *
 * The stream is routed to the analyser and nothing else - it is never connected
 * to `destination`, so the microphone is not played back through the speaker
 * (which on a phone would feed straight back into the mic).
 */
export class MicListener {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private rafId = 0;
  private running = false;
  private misses = 0;
  private options: MicListenerOptions;
  private events: MicListenerEvents;

  constructor(events: MicListenerEvents = {}, options: MicListenerOptions = {}) {
    this.events = events;
    this.options = options;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Request the microphone and begin listening. Must be called from a user
   * gesture (a settings toggle counts). Throws if the browser has no
   * `mediaDevices` (e.g. an insecure origin) or the user denies access.
   */
  async start(): Promise<void> {
    if (this.running) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone unavailable (requires HTTPS).');
    }

    // Disable the voice-processing chain: AGC and noise suppression reshape the
    // signal and hurt pitch tracking, and echo cancellation can cancel the
    // instrument's own notes when the phone is both playing and listening.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    });

    const ctx = new AudioContext();
    await ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    ctx.createMediaStreamSource(stream).connect(analyser);

    this.stream = stream;
    this.ctx = ctx;
    this.analyser = analyser;
    this.buffer = new Float32Array(analyser.fftSize);
    this.misses = 0;
    this.running = true;

    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this.sample();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Stop listening and release the microphone. Safe to call when not running. */
  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = null;
    this.analyser = null;
    this.buffer = null;
    this.ctx = null;
    this.events.onPitch?.(null);
  }

  private sample(): void {
    if (!this.analyser || !this.buffer || !this.ctx) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const pitch = detectPitch(this.buffer, this.ctx.sampleRate, this.options);

    if (pitch) {
      this.misses = 0;
      this.events.onPitch?.(pitch);
      return;
    }

    // Hold the last pitch through brief dropouts, then clear.
    this.misses += 1;
    if (this.misses >= (this.options.holdFrames ?? DEFAULT_HOLD_FRAMES)) {
      this.events.onPitch?.(null);
    }
  }
}
