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
  /**
   * Frequency ratio of each harmony note to the root, in ascending order.
   * Empty when the harmonizer is off, in which case only the root is built -
   * so the two-oscillator graph is preserved for the non-harmony axes.
   */
  harmonyRatios: number[];
  /** Initial level of each harmony note, parallel to `harmonyRatios`. */
  harmonyLevels: number[];
}

/**
 * The oscillator pair for one note of a voice: a dark and a bright oscillator
 * at the same frequency whose harmonic tables are crossfaded. `noteGain` is the
 * note's own level (the root is always 1, harmony notes fade in with the short
 * axis) and is independent of the morph so the two can be driven separately.
 */
interface NoteNodes {
  oscDark: OscillatorNode;
  oscBright: OscillatorNode;
  darkGain: GainNode;
  brightGain: GainNode;
  noteGain: GainNode;
  /** This note's frequency as a multiple of the root's, kept while gliding. */
  ratio: number;
}

/**
 * One note (optionally harmonised into a chord). The node graph is built on
 * `start` and torn down on `release`, because `OscillatorNode` is single-use: an
 * oscillator that has been stopped can never be started again. Reusing a Voice
 * object across notes therefore means rebuilding its nodes each time.
 *
 * Within a note the two oscillators share frequency and phase, so crossfading
 * their harmonic tables is a click-free spectral interpolation. Every note of a
 * chord runs its own pair, so the harmony notes share the root's timbre.
 */
export class Voice {
  readonly id: number;

  private readonly ctx: AudioContext;
  private readonly out: AudioNode;
  /**
   * Shared vibrato source. It is a node (the LFO depth gain), not an
   * `AudioParam`: the connection runs from it *into* each oscillator's
   * `detune`, so modulating in cents shifts every voice together.
   */
  private readonly vibrato: AudioNode | null;

  private notes: NoteNodes[] = [];
  private env: GainNode | null = null;
  private level: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private panner: StereoPannerNode | null = null;
  private preset: Preset | null = null;
  /** The root note's current frequency, so harmony notes can be retuned to it. */
  private rootFrequency = 0;

  private playing = false;
  private releasing = false;

  /** Timestamp after which this voice's nodes have fully stopped. */
  freeAt = 0;

  constructor(ctx: AudioContext, out: AudioNode, id: number, vibrato: AudioNode | null = null) {
    this.ctx = ctx;
    this.out = out;
    this.id = id;
    this.vibrato = vibrato;
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

    const env = this.ctx.createGain();
    const level = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const panner = this.ctx.createStereoPanner();

    filter.type = 'lowpass';
    filter.Q.value = params.preset.filterQ;
    filter.frequency.setValueAtTime(clampCutoff(this.ctx, params.cutoffHz), now);

    env.gain.setValueAtTime(0, now);
    level.gain.value = clamp01(params.level);
    env.connect(level).connect(filter).connect(panner);
    panner.connect(this.out);
    this.env = env;

    // The root always sounds; harmony notes are added on top. A harmony note
    // whose level is 0 is still built (cheaply) so it can fade in later without
    // an oscillator start, which is not possible after the note has begun.
    this.rootFrequency = params.frequency;
    this.notes = [this.buildNote(params, 1, 1, params.morph, now)];
    for (let i = 0; i < params.harmonyRatios.length; i += 1) {
      const ratio = params.harmonyRatios[i];
      const noteLevel = params.harmonyLevels[i] ?? 0;
      this.notes.push(this.buildNote(params, ratio, noteLevel, params.morph, now));
    }

    const attack = Math.max(MIN_ATTACK, params.preset.attack);
    env.gain.linearRampToValueAtTime(1, now + attack);
    env.gain.linearRampToValueAtTime(
      Math.max(EPS, params.preset.sustain),
      now + attack + params.preset.decay,
    );

    for (const note of this.notes) {
      note.oscDark.start(now);
      note.oscBright.start(now);
    }

    this.level = level;
    this.filter = filter;
    this.panner = panner;
    this.preset = params.preset;
    this.playing = true;
    this.releasing = false;
    this.freeAt = Number.POSITIVE_INFINITY;
  }

  /** Build one dark/bright oscillator pair, wired into the voice envelope. */
  private buildNote(
    params: VoiceParams,
    ratio: number,
    noteLevel: number,
    morph: number,
    now: number,
  ): NoteNodes {
    const oscDark = this.ctx.createOscillator();
    const oscBright = this.ctx.createOscillator();
    const darkGain = this.ctx.createGain();
    const brightGain = this.ctx.createGain();
    const noteGain = this.ctx.createGain();

    oscDark.setPeriodicWave(params.waveDark);
    oscBright.setPeriodicWave(params.waveBright);
    oscDark.frequency.setValueAtTime(params.frequency * ratio, now);
    oscBright.frequency.setValueAtTime(params.frequency * ratio, now);
    if (this.vibrato) {
      this.vibrato.connect(oscDark.detune);
      this.vibrato.connect(oscBright.detune);
    }

    darkGain.gain.value = 1 - morph;
    brightGain.gain.value = morph;
    noteGain.gain.value = clamp01(noteLevel);

    oscDark.connect(darkGain).connect(noteGain);
    oscBright.connect(brightGain).connect(noteGain);
    noteGain.connect(this.env!);

    return { oscDark, oscBright, darkGain, brightGain, noteGain, ratio };
  }

  /**
   * Smooth glide for a held note being dragged. Each harmony note keeps its
   * ratio to the root, so a chord transposes as a chord instead of collapsing
   * onto the root's new frequency.
   */
  glideFrequency(hz: number): void {
    if (this.notes.length === 0) return;
    const now = this.ctx.currentTime;
    this.rootFrequency = hz;
    for (const note of this.notes) {
      this.retune(note, hz * note.ratio, now);
    }
  }

  setMorph(morph: number): void {
    if (this.notes.length === 0) return;
    const now = this.ctx.currentTime;
    const t = clamp01(morph);
    for (const note of this.notes) {
      note.darkGain.gain.setTargetAtTime(1 - t, now, GLIDE_TAU);
      note.brightGain.gain.setTargetAtTime(t, now, GLIDE_TAU);
    }
  }

  /**
   * Set each harmony note's ratio and level, both parallel to the arrays passed
   * to `start`. The ratios change while dragging because the chord is diatonic:
   * a new root degree means new intervals. The levels are independent of the
   * morph, so both axes can be driven at once.
   */
  setHarmony(ratios: number[], levels: number[]): void {
    const now = this.ctx.currentTime;
    for (let i = 0; i < levels.length; i += 1) {
      const note = this.notes[i + 1];
      if (!note) continue;
      note.ratio = ratios[i] ?? note.ratio;
      this.retune(note, this.rootFrequency * note.ratio, now);
      note.noteGain.gain.setTargetAtTime(clamp01(levels[i]), now, GLIDE_TAU);
    }
  }

  private retune(note: NoteNodes, hz: number, now: number): void {
    note.oscDark.frequency.setTargetAtTime(hz, now, GLIDE_TAU);
    note.oscBright.frequency.setTargetAtTime(hz, now, GLIDE_TAU);
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
    if (!this.env || this.notes.length === 0 || !this.preset) return;

    const now = this.ctx.currentTime;
    const releaseTime = asPluck
      ? Math.max(this.preset.decay, 0.25)
      : Math.max(0.05, this.preset.release);

    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(Math.max(EPS, this.env.gain.value), now);
    this.env.gain.linearRampToValueAtTime(EPS, now + releaseTime);

    const stopAt = now + releaseTime + STOP_PADDING;
    for (const note of this.notes) {
      note.oscDark.stop(stopAt);
      note.oscBright.stop(stopAt);
    }

    this.releasing = true;
    this.playing = false;
    this.freeAt = now + releaseTime + STOP_PADDING + 0.02;
  }

  private dispose(): void {
    // Disconnecting a node drops its outgoing connections but leaves the
    // shared vibrato wired to its `detune` params, so those are cut explicitly
    // or every rebuild would leave the old oscillators held by the LFO.
    for (const note of this.notes) {
      if (this.vibrato) {
        this.vibrato.disconnect(note.oscDark.detune);
        this.vibrato.disconnect(note.oscBright.detune);
      }
      note.oscDark.disconnect();
      note.oscBright.disconnect();
      note.darkGain.disconnect();
      note.brightGain.disconnect();
      note.noteGain.disconnect();
    }

    this.env?.disconnect();
    this.level?.disconnect();
    this.filter?.disconnect();
    this.panner?.disconnect();

    this.notes = [];
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
