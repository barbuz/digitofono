import { Voice } from './Voice';
import { buildPeriodicWave, buildImpulseResponse } from './waves';
import { PRESETS } from './presets';
import type { Preset } from '../state/schema';

/**
 * Global pitch vibrato. `detune` is in cents and independent of frequency, so
 * one LFO can drive every voice's oscillators through a single shared node.
 * A pitch that is always moving has no fixed reference to sound wrong against,
 * which is what makes small tuning errors less noticeable.
 */
export const VIBRATO_HZ = 5.2;
export const VIBRATO_MAX_CENTS = 22;

/**
 * Ensemble chorus: a short modulated delay summed with the dry signal. The
 * delay modulation detunes the copy slightly, so the note beats against itself
 * the way a detuned unison does, smearing the pitch without changing it.
 */
export const CHORUS_HZ = 0.7;
export const CHORUS_MAX_WET = 0.7;
const CHORUS_BASE_DELAY = 0.018;
const CHORUS_DEPTH = 0.0035;

/**
 * Fixed voice-pool size. Ten is more fingers than a phone will register
 * simultaneously, so notes are never dropped for want of a voice, while the
 * cap still bounds CPU on dense chords. Beyond it the oldest voice is stolen.
 */
export const MAX_VOICES = 10;

/**
 * Owns the AudioContext, the master bus (compressor, limiter, reverb send) and
 * the voice pool. Nothing here touches Svelte; the UI drives it through plain
 * method calls.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private readonly createContext: () => AudioContext;
  private voiceBus: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private reverbSend: GainNode | null = null;
  private reverbReturn: GainNode | null = null;
  private chorusWet: GainNode | null = null;
  private vibratoDepth: GainNode | null = null;

  private pool: Voice[] = [];
  private preset: Preset = PRESETS.warm;
  private waveDark: PeriodicWave | null = null;
  private waveBright: PeriodicWave | null = null;

  // Settings arrive from the Player constructor, before the context exists.
  // Storing them lets `init` apply the real values instead of the hardcoded
  // bus defaults, which otherwise persisted until a control was touched.
  private desiredVolume = 1;
  private desiredReverb = 0.12;
  private desiredEnsemble = 0;
  private desiredVibrato = 0;

  constructor(createContext: () => AudioContext = defaultContext) {
    this.createContext = createContext;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Must be called from a user gesture on mobile browsers. */
  async ensureRunning(): Promise<void> {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
  }

  private init(): void {
    const ctx = this.createContext();
    this.ctx = ctx;

    this.voiceBus = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.limiter = ctx.createDynamicsCompressor();

    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.25;

    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;

    this.voiceBus.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.reverbSend = ctx.createGain();
    this.reverbReturn = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = buildImpulseResponse(ctx, 1.4, 2.6);
    this.reverbSend.gain.value = 1;
    this.reverbReturn.gain.value = 0.12;
    this.voiceBus.connect(this.reverbSend);
    this.reverbSend.connect(convolver);
    convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.compressor);

    this.buildChorus();
    this.buildVibrato();

    this.buildWaveTables();

    // Apply whatever the Player already pushed, so the first note sounds with
    // the user's volume, reverb, ensemble and vibrato rather than defaults.
    this.setMasterVolume(this.desiredVolume);
    this.setReverbAmount(this.desiredReverb);
    this.setEnsemble(this.desiredEnsemble);
    this.setVibrato(this.desiredVibrato);
  }

  /**
   * Ensemble chorus on the voice bus. The delayed copy is a second path into
   * the compressor alongside the dry signal, so the wet gain doubles as the
   * ensemble depth control.
   */
  private buildChorus(): void {
    if (!this.ctx || !this.voiceBus) return;
    const ctx = this.ctx;

    const dry = ctx.createGain();
    const delay = ctx.createDelay(0.1);
    const wet = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();

    dry.gain.value = 1;
    delay.delayTime.value = CHORUS_BASE_DELAY;
    wet.gain.value = 0;

    lfo.type = 'sine';
    lfo.frequency.value = CHORUS_HZ;
    lfoDepth.gain.value = CHORUS_DEPTH;

    lfo.connect(lfoDepth).connect(delay.delayTime);
    lfo.start();

    this.voiceBus.connect(dry).connect(this.compressor!);
    this.voiceBus.connect(delay).connect(wet).connect(this.compressor!);

    this.chorusWet = wet;
  }

  /**
   * One LFO, one depth gain, shared by every voice: each voice connects its
   * oscillators' `detune` to the same node, so the whole instrument vibratos in
   * phase without a per-voice oscillator.
   */
  private buildVibrato(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = VIBRATO_HZ;
    depth.gain.value = 0;
    lfo.connect(depth);
    lfo.start();

    this.vibratoDepth = depth;
  }

  private buildWaveTables(): void {
    if (!this.ctx) return;
    this.waveDark = buildPeriodicWave(this.ctx, this.preset.waveDark);
    this.waveBright = buildPeriodicWave(this.ctx, this.preset.waveBright);
  }

  setPreset(preset: Preset): void {
    this.preset = preset;
    if (this.ctx) this.buildWaveTables();
  }

  setMasterVolume(value: number): void {
    this.desiredVolume = value;
    if (this.masterGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1, value));
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
  }

  setReverbAmount(value: number): void {
    this.desiredReverb = value;
    if (this.reverbReturn && this.ctx) {
      const clamped = Math.max(0, Math.min(1, value));
      this.reverbReturn.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  setEnsemble(value: number): void {
    this.desiredEnsemble = value;
    if (this.chorusWet && this.ctx) {
      const clamped = Math.max(0, Math.min(1, value));
      this.chorusWet.gain.setTargetAtTime(clamped * CHORUS_MAX_WET, this.ctx.currentTime, 0.05);
    }
  }

  setVibrato(value: number): void {
    this.desiredVibrato = value;
    if (this.vibratoDepth && this.ctx) {
      const clamped = Math.max(0, Math.min(1, value));
      this.vibratoDepth.gain.setTargetAtTime(clamped * VIBRATO_MAX_CENTS, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Allocate a voice, stealing the oldest if the pool is at capacity.
   *
   * The cap is enforced through pool growth: the pool never exceeds
   * MAX_VOICES, and a voice is only ever handed out from the pool, so the
   * number of voices sounding at once is bounded by MAX_VOICES too. This is
   * only sound because MAX_VOICES is a constant. A *lowerable* cap would break
   * it, because a pool that has already grown past the new cap keeps handing
   * out its existing voices - which is exactly how a polyphony of 1 used to
   * still sound several notes.
   */
  allocate(): Voice | null {
    if (!this.ctx || !this.voiceBus || !this.waveDark || !this.waveBright) return null;

    const free = this.pool.find((v) => v.reusable);
    if (free) return free;

    if (this.pool.length < MAX_VOICES) {
      const voice = new Voice(this.ctx, this.voiceBus, this.pool.length, this.vibratoDepth);
      this.pool.push(voice);
      return voice;
    }

    // Steal the oldest active voice so a new note is never silently dropped.
    const victim = this.pool.find((v) => v.active) ?? this.pool[0] ?? null;
    if (victim) victim.release(false);
    return victim;
  }

  get currentWaveDark(): PeriodicWave | null {
    return this.waveDark;
  }

  get currentWaveBright(): PeriodicWave | null {
    return this.waveBright;
  }

  get currentPreset(): Preset {
    return this.preset;
  }
}

function defaultContext(): AudioContext {
  return new AudioContext({ latencyHint: 'interactive' });
}
