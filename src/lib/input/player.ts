import { AudioEngine } from '../audio/AudioEngine';
import { Voice } from '../audio/Voice';
import { resolveAxes } from '../audio/params';
import { positionToSnappedMidi, midiToFrequency, midiToNoteName } from '../mapping/pitch';
import { harmonyMidiValues } from '../mapping/harmony';
import { trackCutoffForPitch } from '../mapping/shortAxis';
import type { ScaleSpec } from '../mapping/scales';
import type { Settings } from '../state/schema';

/** Presses shorter than this become plucked notes on lift; longer ones sustain. */
export const TAP_MS = 180;

export interface SurfaceGeometry {
  longLength: number;
  shortLength: number;
  /** Whether the long axis is the vertical screen axis. */
  longIsVertical: boolean;
}

export interface ActiveTouch {
  pointerId: number;
  x: number;
  y: number;
  pitchPos: number;
  shortPos: number;
  noteName: string;
  held: boolean;
}

interface TouchState {
  voice: Voice;
  startTime: number;
  pitchPos: number;
  shortPos: number;
  x: number;
  y: number;
  released: boolean;
}

export interface PlayerEvents {
  onTouchChange?: (touches: ActiveTouch[]) => void;
  onRipple?: (x: number, y: number) => void;
}

/**
 * Routes pointer positions to voices: starts a sustained voice immediately on
 * press (so the first touch always sounds), then converts to a pluck if the
 * press was short. Owns the touch bookkeeping the visuals read from.
 */
export class Player {
  private engine: AudioEngine;
  private touches = new Map<number, TouchState>();
  private settings: Settings;
  private geometry: SurfaceGeometry;
  private events: PlayerEvents;
  /**
   * A scale learned from a song, overriding `settings.scale` while it is set.
   * Null means the instrument plays the built-in scale.
   */
  private songPitchClasses: readonly number[] | null = null;

  constructor(
    settings: Settings,
    geometry: SurfaceGeometry,
    events: PlayerEvents = {},
    engine: AudioEngine = new AudioEngine(),
  ) {
    this.settings = settings;
    this.geometry = geometry;
    this.events = events;
    this.engine = engine;
    this.applySettings(settings);
  }

  get audio(): AudioEngine {
    return this.engine;
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.applySettings(settings);
  }

  updateGeometry(geometry: SurfaceGeometry): void {
    this.geometry = geometry;
  }

  /** Play a scale learned from a song, or `null` to return to the built-in one. */
  updateSongScale(pitchClasses: readonly number[] | null): void {
    this.songPitchClasses = pitchClasses && pitchClasses.length > 0 ? pitchClasses : null;
  }

  /** The scale actually in force: the song's when one is loaded. */
  private get activeScale(): ScaleSpec {
    return this.songPitchClasses ?? this.settings.scale;
  }

  private applySettings(settings: Settings): void {
    this.engine.setWaveShape(settings);
    this.engine.setMasterVolume(settings.volume);
    this.engine.setReverbAmount(settings.reverbAmount);
    this.engine.setEnsemble(settings.ensemble);
    this.engine.setVibrato(settings.vibrato);
  }

  /** Convert a screen point to normalized long/short axis positions. */
  private toAxes(x: number, y: number): { pitchPos: number; shortPos: number } {
    const { longLength, shortLength, longIsVertical } = this.geometry;
    const longCoord = longIsVertical ? y : x;
    const shortCoord = longIsVertical ? x : y;
    const pitchPos = 1 - clamp(longCoord / longLength);
    const shortPos = clamp(shortCoord / shortLength);
    return { pitchPos, shortPos };
  }

  private midiFor(pitchPos: number): number {
    return positionToSnappedMidi(
      pitchPos,
      { baseMidi: this.settings.baseMidi, octaveSpan: this.settings.octaveSpan },
      this.activeScale,
      this.settings.snapStrength,
    );
  }

  private frequencyFor(pitchPos: number): number {
    return midiToFrequency(this.midiFor(pitchPos));
  }

  private noteNameFor(pitchPos: number): string {
    return midiToNoteName(this.midiFor(pitchPos));
  }

  /**
   * Frequency ratios of the harmony notes above the root at `pitchPos`. Built
   * whenever any harmony level is positive, so a fixed harmony amount works
   * even when the short axis is something else.
   */
  private harmonyRatiosFor(pitchPos: number, levels: number[]): number[] {
    // On the harmony axis the levels start at 0 at shortPos 0 but can rise as
    // the finger moves, so the graph must be built even when the initial levels
    // are silent. A fixed amount below the axis only needs the graph when it is
    // actually audible.
    if (this.settings.shortAxis !== 'harmony' && !levels.some((level) => level > 0)) return [];
    const rootMidi = this.midiFor(pitchPos);
    const rootHz = midiToFrequency(rootMidi);
    return harmonyMidiValues(rootMidi, this.activeScale, this.settings.harmonyVoicing).map(
      (midi) => midiToFrequency(midi) / rootHz,
    );
  }

  pointerDown(pointerId: number, x: number, y: number): void {
    // Build the context synchronously so the touch state is registered before
    // any pointerup can arrive; the resume promise is deliberately not awaited,
    // otherwise a fast tap on a cold context would be lost and leave an
    // unreleased voice sounding forever.
    this.engine.ensureRunning().catch(() => {});

    const { pitchPos, shortPos } = this.toAxes(x, y);
    const axes = resolveAxes(this.settings, shortPos);
    const frequency = this.frequencyFor(pitchPos);

    const voice = this.engine.allocate();
    if (!voice || !this.engine.currentWaveDark || !this.engine.currentWaveBright) return;

    // The pool may have handed us a voice that another finger still holds
    // (voice stealing when polyphony is exhausted). Drop that stale touch so
    // the old finger cannot keep steering the new note.
    for (const [otherId, other] of this.touches) {
      if (other.voice === voice) this.touches.delete(otherId);
    }

    voice.start({
      envelope: {
        attack: this.settings.attack,
        decay: this.settings.decay,
        sustain: this.settings.sustain,
        release: this.settings.release,
      },
      filterQ: this.settings.filterQ,
      waveDark: this.engine.currentWaveDark,
      waveBright: this.engine.currentWaveBright,
      frequency,
      morph: axes.morph,
      cutoffHz: trackCutoffForPitch(axes.cutoffHz, frequency),
      level: axes.level,
      harmonyRatios: this.harmonyRatiosFor(pitchPos, axes.harmony),
      harmonyLevels: axes.harmony,
    });

    this.touches.set(pointerId, {
      voice,
      startTime: performance.now(),
      pitchPos,
      shortPos,
      x,
      y,
      released: false,
    });

    this.events.onRipple?.(x, y);
    this.emit();
  }

  pointerMove(pointerId: number, x: number, y: number): void {
    const state = this.touches.get(pointerId);
    if (!state || state.released) return;

    const { pitchPos, shortPos } = this.toAxes(x, y);
    const axes = resolveAxes(this.settings, shortPos);
    const frequency = this.frequencyFor(pitchPos);

    state.voice.glideFrequency(frequency);
    state.voice.setMorph(axes.morph);
    state.voice.setHarmony(this.harmonyRatiosFor(pitchPos, axes.harmony), axes.harmony);
    state.voice.setCutoff(trackCutoffForPitch(axes.cutoffHz, frequency));
    state.voice.setLevel(axes.level);

    state.pitchPos = pitchPos;
    state.shortPos = shortPos;
    state.x = x;
    state.y = y;
    this.emit();
  }

  pointerUp(pointerId: number): void {
    const state = this.touches.get(pointerId);
    if (!state) return;

    const heldMs = performance.now() - state.startTime;
    state.voice.release(heldMs < TAP_MS);
    this.touches.delete(pointerId);
    this.emit();
  }

  private emit(): void {
    if (!this.events.onTouchChange) return;
    const list: ActiveTouch[] = [];
    for (const [pointerId, state] of this.touches) {
      list.push({
        pointerId,
        x: state.x,
        y: state.y,
        pitchPos: state.pitchPos,
        shortPos: state.shortPos,
        noteName: this.noteNameFor(state.pitchPos),
        held: performance.now() - state.startTime >= TAP_MS,
      });
    }
    this.events.onTouchChange(list);
  }
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
