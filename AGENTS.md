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
- `OscillatorNode` and `AudioBufferSourceNode` are single-use: once stopped they
  can never be started again. `Voice` therefore builds its node graph in
  `start()` and discards it in `release()`. Never cache oscillators on a pooled
  voice and restart them; that throws `InvalidStateError` and silently loses a
  note.
- `Player.pointerDown` must stay synchronous. It initialises the AudioContext
  synchronously and only fires the `resume()` promise in the background, so the
  touch is registered before a fast `pointerup` can arrive. Awaiting the context
  here reintroduces a bug where the first tap is lost and its voice sounds
  forever.
- Keep the default scale `chromatic` and the default short axis `timbre` unless
  the spec changes.
- Changing a value in `DEFAULT_SETTINGS` only affects fresh installs. The store
  merges `{ ...DEFAULT_SETTINGS, ...stored }`, so a saved blob wins. To push new
  defaults to existing devices, bump `SETTINGS_VERSION` (the storage key derives
  from it, so a bump starts a clean key). `settings.test.ts` pins this and fails
  if the version is not bumped.
- The harmonizer (`mapping/harmony.ts`) is a *short-axis option*, not a separate
  mode: at `shortPos = 0` it sounds the bare note, and harmony notes fade in one
  at a time as the axis advances to the full triad. Intervals are a major third
  and fifth snapped to the current scale, so the chord stays diatonic. Each
  harmony note is its own dark/bright oscillator pair on the same voice; because
  `OscillatorNode` is single-use, all pairs are built at onset (even the silent
  ones) and faded in via a per-note gain, never started later. When the harmony
  axis is not selected, `Player` passes empty ratios and the voice keeps its
  original two oscillators.
- Polyphony is a fixed `MAX_VOICES` (10), not a setting. A phone registers fewer
  simultaneous touches than any sensible cap, so it bounds CPU rather than
  expressing a musical choice. Don't reintroduce a slider for it.
- `AudioEngine.allocate` bounds the sounding voices through *pool growth*: the
  pool never exceeds `MAX_VOICES`, and voices are only handed out from the pool.
  The `find(reusable)` fast path runs before the cap check and ignores it, so a
  cap that could be lowered at runtime would not be honoured once the pool had
  grown - that is exactly why a polyphony of 1 still sounded several notes. Keep
  the cap constant.

## Deployment

GitHub Pages project site: the Vite `base` must stay `/<repo>/` (currently
`/digitofono/`), and the service worker scope and manifest `start_url` must match
it. Breaking this makes the PWA fail to install silently.
