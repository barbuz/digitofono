<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Player, type ActiveTouch, type SurfaceGeometry } from '../input/player';
  import { rippleVisual, rippleAlive, EXPAND_MS } from './ripple';
  import type { Settings } from '../state/schema';

  let { settings }: { settings: Settings } = $props();

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let player: Player | null = null;
  let geometry: SurfaceGeometry = {
    longLength: 1,
    shortLength: 1,
    longIsVertical: true,
  };

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
    gradient.addColorStop(0, 'rgba(90, 120, 200, 0.05)');
    gradient.addColorStop(1, 'rgba(120, 200, 255, 0.16)');

    ctx.fillStyle = gradient;
    if (vertical) {
      ctx.fillRect(0, 0, laneThickness, height);
    } else {
      ctx.fillRect(0, height - laneThickness, width, laneThickness);
    }

    // Active glow: a soft radial following each held finger.
    for (const touch of touches) {
      const px = touch.x * dpr;
      const py = touch.y * dpr;
      const radius = (touch.held ? 90 : 55) * dpr;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, radius);
      glow.addColorStop(0, 'rgba(140, 200, 255, 0.32)');
      glow.addColorStop(1, 'rgba(140, 200, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Touch markers: expand quickly, then linger so the last-played notes stay
    // visible as a reference.
    const decayMs = settings.rippleDecay * 1000;
    ripples = ripples.filter((r) => rippleAlive(now - r.start, decayMs));
    for (const ripple of ripples) {
      const age = now - ripple.start;
      const { radius, alpha, dotAlpha } = rippleVisual(reducedMotion ? Math.max(age, EXPAND_MS) : age, decayMs);
      const px = ripple.x * dpr;
      const py = ripple.y * dpr;

      if (dotAlpha > 0.01) {
        ctx.fillStyle = `rgba(180, 220, 255, ${dotAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      if (alpha > 0.01) {
        ctx.strokeStyle = `rgba(160, 210, 255, ${alpha})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(px, py, radius * dpr, 0, Math.PI * 2);
        ctx.stroke();
      }
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
    measure();

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
      cancelAnimationFrame(rafId);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
  });

  // Keep the player in sync with settings changes.
  $effect(() => {
    player?.updateSettings(settings);
  });
</script>

<div class="surface" bind:this={container}>
  <canvas
    bind:this={canvas}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    aria-label="Digitofono playing surface. Tap or drag to play."
  ></canvas>

  <div class="notes" aria-live="polite">
    {#each touches as touch (touch.pointerId)}
      <span class="note">{touch.noteName}</span>
    {/each}
  </div>
</div>

<style>
  .surface {
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at 50% 40%, #12161f 0%, #0b0d12 70%);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .notes {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 1rem);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.75rem;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
    color: rgba(180, 215, 255, 0.75);
    font-size: 1rem;
    letter-spacing: 0.05em;
  }

  .note {
    padding: 0.15rem 0.5rem;
    border-radius: 0.4rem;
    background: rgba(140, 200, 255, 0.08);
  }
</style>
