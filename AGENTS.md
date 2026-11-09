# AGENTS.md

Repository guidance for automated agents working on Digitofono.

## What this is

A PWA touchscreen musical instrument (Svelte 5 + Vite + TypeScript). See
`SPEC.md` for the full design; the code follows it closely.

## Commands

```bash
npm install
npm run dev        # dev server
npm test           # Vitest unit tests
npm run check      # svelte-check + tsc
npm run build      # production build -> dist/
npm run icons      # regenerate PWA icons
```

Always run `npm test` and `npm run check` before considering work complete.
There is no browser-based test harness; audio and touch behaviour must be
verified on a real device.

## Conventions

- Pure logic (pitch mapping, scale quantization, axis mapping) belongs in
  `src/lib/mapping/` and must stay framework-free and unit-tested.
- The audio engine (`src/lib/audio/`) must not import Svelte. It is driven by
  plain method calls from `src/lib/input/player.ts`.
- Never set an `AudioParam` to a new value instantly; use `setTargetAtTime` or a
  ramp. Instant changes cause audible clicks. The one exception is note onset,
  where `setValueAtTime` is correct.
- Keep the default scale `chromatic` and the default short axis `timbre` unless
  the spec changes.

## Deployment

GitHub Pages project site: the Vite `base` must stay `/<repo>/` (currently
`/digitofono/`), and the service worker scope and manifest `start_url` must match
it. Breaking this makes the PWA fail to install silently.
