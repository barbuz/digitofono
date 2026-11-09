import type { Preset } from '../state/schema';

const GLIDE_TAU = 0.012;
const MIN_ATTACK = 0.008;
const EPS = 0.0001;

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
 * One note: two oscillators (dark + bright harmonic tables) summed, then an
 * envelope, level, lowpass filter and panner. Both oscillators share frequency
 * and phase so crossfading them is a click-free spectral interpolation.
 */
export class Voice {
  readonly id: number;

  private readonly ctx: AudioContext;
  private readonly oscDark: OscillatorNode;
  private readonly oscBright: OscillatorNode;
  private readonly darkGain: GainNode;
  private readonly brightGain: GainNode;
  private readonly mix: GainNode;
  private readonly env: GainNode;
  private readonly level: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly panner: StereoPannerNode;

  private preset: Preset | null = null;
  private stopping = false;

  /** Timestamp after which this voice's nodes have fully stopped. */
  freeAt = 0;

  constructor(ctx: AudioContext, out: AudioNode, id: number) {
    this.ctx = ctx;
    this.id = id;

    this.oscDark = ctx.createOscillator();
    this.oscBright = ctx.createOscillator();
    this.darkGain = ctx.createGain();
    this.brightGain = ctx.createGain();
    this.mix = ctx.createGain();
    this.env = ctx.createGain();
    this.level = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.panner = ctx.createStereoPanner();

    this.darkGain.gain.value = 1;
    this.brightGain.gain.value = 0;
    this.env.gain.value = 0;
    this.level.gain.value = 1;
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2500;
    this.filter.Q.value = 0.9;

    this.oscDark.connect(this.darkGain).connect(this.mix);
    this.oscBright.connect(this.brightGain).connect(this.mix);
    this.mix.connect(this.env).connect(this.level).connect(this.filter).connect(this.panner);
    this.panner.connect(out);
  }

  get active(): boolean {
    return !this.stopping && this.preset !== null;
  }

  /** Direct (non-gliding) pitch set, used at note onset. */
  setFrequencyImmediate(hz: number): void {
    const now = this.ctx.currentTime;
    for (const osc of [this.oscDark, this.oscBright]) {
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(hz, now);
    }
  }

  /** Smooth glide for a held note being dragged. */
  glideFrequency(hz: number): void {
    const now = this.ctx.currentTime;
    for (const osc of [this.oscDark, this.oscBright]) {
      osc.frequency.setTargetAtTime(hz, now, GLIDE_TAU);
    }
  }

  setMorph(morph: number): void {
    const now = this.ctx.currentTime;
    const t = Math.max(0, Math.min(1, morph));
    this.darkGain.gain.setTargetAtTime(1 - t, now, GLIDE_TAU);
    this.brightGain.gain.setTargetAtTime(t, now, GLIDE_TAU);
  }

  setCutoff(hz: number): void {
    const now = this.ctx.currentTime;
    const nyquist = this.ctx.sampleRate / 2;
    const clamped = Math.max(40, Math.min(hz, nyquist - 1000));
    this.filter.frequency.setTargetAtTime(clamped, now, GLIDE_TAU);
  }

  setLevel(level: number): void {
    const now = this.ctx.currentTime;
    this.level.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), now, GLIDE_TAU);
  }

  start(params: VoiceParams): void {
    const now = this.ctx.currentTime;
    this.preset = params.preset;
    this.stopping = false;
    this.freeAt = Number.POSITIVE_INFINITY;

    this.oscDark.setPeriodicWave(params.waveDark);
    this.oscBright.setPeriodicWave(params.waveBright);

    this.setFrequencyImmediate(params.frequency);

    this.darkGain.gain.cancelScheduledValues(now);
    this.brightGain.gain.cancelScheduledValues(now);
    this.darkGain.gain.setValueAtTime(1 - params.morph, now);
    this.brightGain.gain.setValueAtTime(params.morph, now);

    this.filter.Q.value = params.preset.filterQ;
    this.setCutoff(params.cutoffHz);

    this.level.gain.cancelScheduledValues(now);
    this.level.gain.setValueAtTime(Math.max(0, Math.min(1, params.level)), now);

    const attack = Math.max(MIN_ATTACK, params.preset.attack);
    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(0, now);
    this.env.gain.linearRampToValueAtTime(1, now + attack);
    this.env.gain.linearRampToValueAtTime(
      Math.max(EPS, params.preset.sustain),
      now + attack + params.preset.decay,
    );

    this.oscDark.start(now);
    this.oscBright.start(now);
  }

  /**
   * Release the voice. `asPluck` lets a quick tap decay like a plucked note
   * instead of stopping as abruptly as a lifted sustained note.
   */
  release(asPluck: boolean): void {
    if (this.stopping || !this.preset) return;

    const now = this.ctx.currentTime;
    const releaseTime = asPluck
      ? Math.max(this.preset.decay, 0.25)
      : Math.max(0.05, this.preset.release);
    const startLevel = Math.max(EPS, this.env.gain.value);

    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(startLevel, now);
    this.env.gain.linearRampToValueAtTime(EPS, now + releaseTime);

    const stopAt = now + releaseTime + 0.03;
    this.oscDark.stop(stopAt);
    this.oscBright.stop(stopAt);

    this.stopping = true;
    this.freeAt = now + releaseTime + 0.05;
  }
}
