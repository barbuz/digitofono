import { AudioEngine } from '../audio/AudioEngine';
import { Voice } from '../audio/Voice';
import { resolveAxes } from '../audio/params';
import { PRESETS } from '../audio/presets';
import { positionToSnappedMidi, midiToFrequency, midiToNoteName } from '../mapping/pitch';
import { trackCutoffForPitch } from '../mapping/shortAxis';
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
  private engine = new AudioEngine();
  private touches = new Map<number, TouchState>();
  private settings: Settings;
  private geometry: SurfaceGeometry;
  private events: PlayerEvents;

  constructor(settings: Settings, geometry: SurfaceGeometry, events: PlayerEvents = {}) {
    this.settings = settings;
    this.geometry = geometry;
    this.events = events;
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

  private applySettings(settings: Settings): void {
    const preset = PRESETS[settings.preset];
    this.engine.setPreset(preset);
    this.engine.setPolyphony(settings.polyphony);
    this.engine.setMasterVolume(settings.volume);
    this.engine.setReverbAmount(settings.reverbAmount);
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

  private frequencyFor(pitchPos: number): number {
    const midi = positionToSnappedMidi(
      pitchPos,
      { baseMidi: this.settings.baseMidi, octaveSpan: this.settings.octaveSpan },
      this.settings.scale,
      this.settings.snapStrength,
    );
    return midiToFrequency(midi);
  }

  private noteNameFor(pitchPos: number): string {
    const midi = positionToSnappedMidi(
      pitchPos,
      { baseMidi: this.settings.baseMidi, octaveSpan: this.settings.octaveSpan },
      this.settings.scale,
      this.settings.snapStrength,
    );
    return midiToNoteName(midi);
  }

  async pointerDown(pointerId: number, x: number, y: number): Promise<void> {
    await this.engine.ensureRunning();

    const { pitchPos, shortPos } = this.toAxes(x, y);
    const preset = PRESETS[this.settings.preset];
    const axes = resolveAxes(this.settings, preset, shortPos);
    const frequency = this.frequencyFor(pitchPos);

    const voice = this.engine.allocate();
    if (!voice || !this.engine.currentWaveDark || !this.engine.currentWaveBright) return;

    voice.start({
      preset,
      waveDark: this.engine.currentWaveDark,
      waveBright: this.engine.currentWaveBright,
      frequency,
      morph: axes.morph,
      cutoffHz: trackCutoffForPitch(axes.cutoffHz, frequency),
      level: axes.level,
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
    if (this.settings.haptics) navigator.vibrate?.(8);
    this.emit();
  }

  pointerMove(pointerId: number, x: number, y: number): void {
    const state = this.touches.get(pointerId);
    if (!state || state.released) return;

    const { pitchPos, shortPos } = this.toAxes(x, y);
    const preset = PRESETS[this.settings.preset];
    const axes = resolveAxes(this.settings, preset, shortPos);
    const frequency = this.frequencyFor(pitchPos);

    state.voice.glideFrequency(frequency);
    state.voice.setMorph(axes.morph);
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
