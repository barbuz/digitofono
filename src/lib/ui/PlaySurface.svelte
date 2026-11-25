<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Player, type ActiveTouch, type SurfaceGeometry } from '../input/player';
  import { MicListener } from '../input/mic';
  import { scaleLines } from '../mapping/scaleLines';
  import { midiToPosition, midiToNoteName } from '../mapping/pitch';
  import type { ScaleSpec } from '../mapping/scales';
  import type { Settings } from '../state/schema';
  import type { SongScale } from '../mapping/songScale';

  let {
    settings,
    song = null,
  }: { settings: Settings; song?: SongScale | null } = $props();

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let player: Player | null = null;
  let mic: MicListener | null = null;
  let geometry: SurfaceGeometry = {
    longLength: 1,
    shortLength: 1,
    longIsVertical: true,
  };

  /** Pitch heard from the microphone, or null when nothing is playing. */
  let heardMidi: number | null = $state(null);
  let micError: string | null = $state(null);

  interface Ripple {
    x: number;
    y: number;
    start: number;
  }

  let touches = $state<ActiveTouch[]>([]);
  let ripples: Ripple[] = [];
  let rafId = 0;
  let dpr = 1;
  let reducedMotion = false;

  type Rgb = [number, number, number];
  let palette = {
    accent: [61, 123, 255] as Rgb,
    warning: [240, 180, 41] as Rgb,
    text: [231, 234, 242] as Rgb,
    muted: [138, 148, 170] as Rgb,
  };

  function readRgb(name: string, fallback: Rgb): Rgb {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const match = /^#([0-9a-f]{6})$/i.exec(raw);
    if (!match) return fallback;
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function rgba([r, g, b]: Rgb, alpha: number): string {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * The scale the instrument is playing: a song's pitch classes when one is
   * loaded, otherwise the built-in scale from the settings.
   */
  const activeScale = $derived<ScaleSpec>(song ? song.pitchClasses : settings.scale);

  /**
   * The range the axis spans. A song brings its own, fitted to its register, so
   * its notes spread across the whole surface instead of bunching at one end.
   */
  const activeRange = $derived(
    song
      ? { baseMidi: song.baseMidi, octaveSpan: song.octaveSpan }
      : { baseMidi: settings.baseMidi, octaveSpan: settings.octaveSpan },
  );

  function measure(): void {
    const rect = container.getBoundingClientRect();
    const longIsVertical = rect.height >= rect.width;
    geometry = {
      longLength: longIsVertical ? rect.height : rect.width,
      shortLength: longIsVertical ? rect.width : rect.height,
      longIsVertical,
    };
    player?.updateGeometry(geometry);

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  function render(now: number): void {
    rafId = requestAnimationFrame(render);
    if (!ctx) return;
    const { width, height } = canvas;

    ctx.clearRect(0, 0, width, height);

    // Pitch lane: a subtle gradient along the long axis as a playing reference.
    const vertical = geometry.longIsVertical;
    const laneThickness = 2 * dpr;
    const gradient = vertical
      ? ctx.createLinearGradient(0, height, 0, 0)
      : ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, rgba(palette.accent, 0.05));
    gradient.addColorStop(1, rgba(palette.accent, 0.18));

    ctx.fillStyle = gradient;
    if (vertical) {
      ctx.fillRect(0, 0, laneThickness, height);
    } else {
      ctx.fillRect(0, height - laneThickness, width, laneThickness);
    }

    // Scale guide lines: one per step of the current scale, so the player can
    // see where the notes are. Opacity 0 hides them entirely.
    if (settings.scaleLines > 0.01) {
      const lines = scaleLines(activeRange, activeScale);
      ctx.lineWidth = 1 * dpr;
      for (const line of lines) {
        const alpha = settings.scaleLines * (line.isTonic ? 1 : 0.6);
        ctx.strokeStyle = line.isTonic
          ? rgba(palette.text, alpha)
          : rgba(palette.muted, alpha * 0.7);
        ctx.beginPath();
        if (vertical) {
          const py = (1 - line.pos) * height;
          ctx.moveTo(0, py);
          ctx.lineTo(width, py);
        } else {
          const px = (1 - line.pos) * width;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, height);
        }
        ctx.stroke();
      }
    }

    // Heard pitch: a brighter marker at the pitch coming from the microphone,
    // using the same long-axis mapping as the guide lines so it lines up with
    // the scale steps. Only drawn while a pitch is being detected.
    if (heardMidi !== null) {
      const pos = midiToPosition(heardMidi, activeRange);
      const inside = pos > 0 && pos < 1;
      ctx.save();
      ctx.lineWidth = 2.5 * dpr;
      ctx.strokeStyle = rgba(palette.warning, inside ? 0.9 : 0.45);
      ctx.setLineDash(inside ? [] : [6 * dpr, 6 * dpr]);
      ctx.beginPath();
      if (vertical) {
        const py = (1 - pos) * height;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      } else {
        const px = (1 - pos) * width;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Active glow: a soft radial following each held finger.
    for (const touch of touches) {
      const px = touch.x * dpr;
      const py = touch.y * dpr;
      const radius = (touch.held ? 90 : 55) * dpr;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, radius);
      glow.addColorStop(0, rgba(palette.accent, 0.32));
      glow.addColorStop(1, rgba(palette.accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Touch ripples: expanding, fading rings.
    ripples = ripples.filter((r) => now - r.start < 450);
    for (const ripple of ripples) {
      const t = reducedMotion ? 1 : (now - ripple.start) / 450;
      const radius = (10 + t * 80) * dpr;
      const alpha = (1 - t) * 0.5;
      ctx.strokeStyle = rgba(palette.accent, alpha);
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(ripple.x * dpr, ripple.y * dpr, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    void player?.pointerDown(event.pointerId, event.clientX - rect.left, event.clientY - rect.top);
  }

  function onPointerMove(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    const events = event.getCoalescedEvents?.() ?? [event];
    for (const e of events) {
      player?.pointerMove(event.pointerId, e.clientX - rect.left, e.clientY - rect.top);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    player?.pointerUp(event.pointerId);
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    palette = {
      accent: readRgb('--accent', palette.accent),
      warning: readRgb('--warning', palette.warning),
      text: readRgb('--text', palette.text),
      muted: readRgb('--muted', palette.muted),
    };
    measure();

    // Chrome Android fires its long-press haptic from the gesture recognizer,
    // not from the contextmenu event: preventing contextmenu alone still leaves
    // the buzz. Calling preventDefault on touchstart cancels the recognizer
    // before it arms, which is what actually stops it. Pointer events are used
    // for playing, so suppressing the touch default costs nothing here.
    const suppressLongPress = (event: TouchEvent) => event.preventDefault();
    canvas.addEventListener('touchstart', suppressLongPress, { passive: false });

    player = new Player(settings, geometry, {
      onTouchChange: (list) => {
        touches = list;
      },
      onRipple: (x, y) => {
        ripples.push({ x, y, start: performance.now() });
      },
    });

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    rafId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('touchstart', suppressLongPress);
      cancelAnimationFrame(rafId);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
    mic?.stop();
  });

  // Keep the player in sync with settings changes.
  $effect(() => {
    player?.updateSettings(settings);
  });

  // A learned scale replaces the built-in one until it is cleared.
  $effect(() => {
    player?.updateSongScale(song ? song.pitchClasses : null);
  });

  // Follow the `listen` setting. The permission prompt is exactly why this is
  // opt-in and triggered only by the toggle, never by the first play gesture;
  // the microphone stream is routed to the analyser only, never to the output.
  $effect(() => {
    if (!settings.listen) {
      mic?.stop();
      micError = null;
      return;
    }

    if (!mic) {
      mic = new MicListener({
        onPitch: (pitch) => {
          heardMidi = pitch ? pitch.midi : null;
        },
      });
    }

    void mic.start().catch((error) => {
      micError = error instanceof Error ? error.message : String(error);
      mic?.stop();
    });
  });
</script>

<div class="surface" bind:this={container}>
  <canvas
    bind:this={canvas}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="digitofono playing surface. tap or drag to play."
  ></canvas>

  <div class="notes" aria-live="polite">
    {#each touches as touch (touch.pointerId)}
      <span class="note">{touch.noteName}</span>
    {/each}
  </div>

  {#if settings.listen}
    <div class="heard" aria-live="polite">
      {#if micError}
        <span class="heard-error">Microphone: {micError}</span>
      {:else if heardMidi !== null}
        <span class="heard-note">{midiToNoteName(heardMidi)}</span>
      {:else}
        <span class="heard-idle">listening…</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .surface {
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at 50% 40%, var(--surface) 0%, var(--bg) 70%);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }

  .notes {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 1rem);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.75rem;
    pointer-events: none;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--text);
    font-size: 1rem;
    letter-spacing: 0.04em;
  }

  .note {
    padding: 0.15rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .heard {
    position: absolute;
    bottom: calc(env(safe-area-inset-bottom) + 1rem);
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 0.88rem;
    letter-spacing: 0.04em;
  }

  .heard-note {
    padding: 0.15rem 0.65rem;
    border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    color: var(--warning);
  }

  .heard-idle {
    color: var(--muted);
  }

  .heard-error {
    color: var(--danger);
  }
</style>
