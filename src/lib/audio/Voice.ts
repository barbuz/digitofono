import type { Preset } from '../state/schema';

const GLIDE_TAU = 0.012;
const MIN_ATTACK = 0.008;
const EPS = 0.0001;
const STOP_PADDING = 0.03;

export interface VoiceParams {
  preset: Preset;
  waveDark: PeriodicWave;
  waveBright: PeriodicWave;
  frequency: number;
  morph: number;
  cutoffHz: number;
  level: number;
}

/**
 * One note. The node graph is built on `start` and torn down on `release`,
 * because `OscillatorNode` is single-use: an oscillator that has been stopped
 * can never be started again. Reusing a Voice object across notes therefore
 * means rebuilding its nodes each time.
 *
 * The two oscillators share frequency and phase, so crossfading their harmonic
 * tables is a click-free spectral interpolation.
 */
export class Voice {
  readonly id: number;

  private readonly ctx: AudioContext;
  private readonly out: AudioNode;

  private oscDark: OscillatorNode | null = null;
  private oscBright: OscillatorNode | null = null;
  private darkGain: GainNode | null = null;
  private brightGain: GainNode | null = null;
  private env: GainNode | null = null;
  private level: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private panner: StereoPannerNode | null = null;
  private preset: Preset | null = null;

  private playing = false;
  private releasing = false;

  /** Timestamp after which this voice's nodes have fully stopped. */
  freeAt = 0;

  constructor(ctx: AudioContext, out: AudioNode, id: number) {
    this.ctx = ctx;
    this.out = out;
    this.id = id;
  }

  /** A voice can be reused once its nodes have fully stopped. */
  get reusable(): boolean {
    return !this.playing && this.ctx.currentTime >= this.freeAt;
  }

  get active(): boolean {
    return this.playing;
  }

  start(params: VoiceParams): void {
    const now = this.ctx.currentTime;
    this.dispose();

    const oscDark = this.ctx.createOscillator();
    const oscBright = this.ctx.createOscillator();
    const darkGain = this.ctx.createGain();
    const brightGain = this.ctx.createGain();
    const env = this.ctx.createGain();
    const level = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const panner = this.ctx.createStereoPanner();

    oscDark.setPeriodicWave(params.waveDark);
    oscBright.setPeriodicWave(params.waveBright);
    oscDark.frequency.setValueAtTime(params.frequency, now);
    oscBright.frequency.setValueAtTime(params.frequency, now);

    darkGain.gain.value = 1 - params.morph;
    brightGain.gain.value = params.morph;

    filter.type = 'lowpass';
    filter.Q.value = params.preset.filterQ;
    filter.frequency.setValueAtTime(clampCutoff(this.ctx, params.cutoffHz), now);

    env.gain.setValueAtTime(0, now);
    level.gain.value = clamp01(params.level);

    oscDark.connect(darkGain).connect(env);
    oscBright.connect(brightGain).connect(env);
    env.connect(level).connect(filter).connect(panner);
    panner.connect(this.out);

    const attack = Math.max(MIN_ATTACK, params.preset.attack);
    env.gain.linearRampToValueAtTime(1, now + attack);
    env.gain.linearRampToValueAtTime(
      Math.max(EPS, params.preset.sustain),
      now + attack + params.preset.decay,
    );

    oscDark.start(now);
    oscBright.start(now);

    this.oscDark = oscDark;
    this.oscBright = oscBright;
    this.darkGain = darkGain;
    this.brightGain = brightGain;
    this.env = env;
    this.level = level;
    this.filter = filter;
    this.panner = panner;
    this.preset = params.preset;
    this.playing = true;
    this.releasing = false;
    this.freeAt = Number.POSITIVE_INFINITY;
  }

  /** Smooth glide for a held note being dragged. */
  glideFrequency(hz: number): void {
    if (!this.oscDark || !this.oscBright) return;
    const now = this.ctx.currentTime;
    this.oscDark.frequency.setTargetAtTime(hz, now, GLIDE_TAU);
    this.oscBright.frequency.setTargetAtTime(hz, now, GLIDE_TAU);
  }

  setMorph(morph: number): void {
    if (!this.darkGain || !this.brightGain) return;
    const now = this.ctx.currentTime;
    const t = clamp01(morph);
    this.darkGain.gain.setTargetAtTime(1 - t, now, GLIDE_TAU);
    this.brightGain.gain.setTargetAtTime(t, now, GLIDE_TAU);
  }

  setCutoff(hz: number): void {
    if (!this.filter) return;
    const now = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(clampCutoff(this.ctx, hz), now, GLIDE_TAU);
  }

  setLevel(level: number): void {
    if (!this.level) return;
    const now = this.ctx.currentTime;
    this.level.gain.setTargetAtTime(clamp01(level), now, GLIDE_TAU);
  }

  /**
   * Release the voice. `asPluck` lets a quick tap decay like a plucked note
   * instead of stopping as abruptly as a lifted sustained note.
   */
  release(asPluck: boolean): void {
    if (!this.playing || this.releasing) return;
    if (!this.env || !this.oscDark || !this.oscBright || !this.preset) return;

    const now = this.ctx.currentTime;
    const releaseTime = asPluck
      ? Math.max(this.preset.decay, 0.25)
      : Math.max(0.05, this.preset.release);

    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(Math.max(EPS, this.env.gain.value), now);
    this.env.gain.linearRampToValueAtTime(EPS, now + releaseTime);

    const stopAt = now + releaseTime + STOP_PADDING;
    this.oscDark.stop(stopAt);
    this.oscBright.stop(stopAt);

    this.releasing = true;
    this.playing = false;
    this.freeAt = now + releaseTime + STOP_PADDING + 0.02;
  }

  private dispose(): void {
    this.oscDark?.disconnect();
    this.oscBright?.disconnect();
    this.darkGain?.disconnect();
    this.brightGain?.disconnect();
    this.env?.disconnect();
    this.level?.disconnect();
    this.filter?.disconnect();
    this.panner?.disconnect();

    this.oscDark = null;
    this.oscBright = null;
    this.darkGain = null;
    this.brightGain = null;
    this.env = null;
    this.level = null;
    this.filter = null;
    this.panner = null;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampCutoff(ctx: AudioContext, hz: number): number {
  const nyquist = ctx.sampleRate / 2;
  return Math.max(40, Math.min(hz, nyquist - 1000));
}
