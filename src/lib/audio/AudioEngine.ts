import { Voice } from './Voice';
import { buildPeriodicWave, buildImpulseResponse } from './waves';
import { PRESETS } from './presets';
import type { Preset } from '../state/schema';

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

  private pool: Voice[] = [];
  private maxVoices = 8;
  private preset: Preset = PRESETS.warm;
  private waveDark: PeriodicWave | null = null;
  private waveBright: PeriodicWave | null = null;

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

    this.buildWaveTables();
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

  setPolyphony(max: number): void {
    this.maxVoices = Math.max(1, Math.min(16, Math.floor(max)));
  }

  setMasterVolume(value: number): void {
    if (this.masterGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1, value));
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
  }

  setReverbAmount(value: number): void {
    if (this.reverbReturn && this.ctx) {
      const clamped = Math.max(0, Math.min(1, value));
      this.reverbReturn.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  /** Allocate a voice, stealing the oldest if the pool is at capacity. */
  allocate(): Voice | null {
    if (!this.ctx || !this.voiceBus || !this.waveDark || !this.waveBright) return null;

    const free = this.pool.find((v) => v.reusable);
    if (free) return free;

    if (this.pool.length < this.maxVoices) {
      const voice = new Voice(this.ctx, this.voiceBus, this.pool.length);
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
