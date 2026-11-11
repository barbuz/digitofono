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
  mode: at `shortPos = 0` it sounds the bare note, and every harmony note starts
  fading in as soon as the axis advances, each at a rate set by its absolute
  semitone distance from the root, up to the full four-note chord (root + major
  third, fifth and seventh). The nearest note is full at `HARMONY_FULL_AT`
  (a quarter of the way), the farthest at the end of the axis. The
  `harmonyVoicing` setting picks the intervals:
  `diatonic` (default) snaps them to the current scale so the chord stays
  consonant everywhere; `major` uses the intervals verbatim and `octaves` spreads
  octaves around the root (one below, one and two above), both ignoring the scale.
  In the chromatic scale `diatonic` and `major` are identical, since every pitch
  class is in scale and the snapping never fires. Each harmony note is its own
  dark/bright oscillator pair on the same voice; because `OscillatorNode` is
  single-use, all pairs are built at onset (even the silent ones) and faded in
  via a per-note gain, never started later. When the harmony axis is not selected,
  `Player` passes empty ratios and the voice keeps its original two oscillators.
- Adding a *new* field to `Settings` does not need a `SETTINGS_VERSION` bump: the
  store merges `{ ...DEFAULT_SETTINGS, ...stored }`, so an older blob simply picks
  up the new default. Bump the version only when an *existing* default changes and
  a saved value would otherwise mask it (see the note above).
- Polyphony is a fixed `MAX_VOICES` (10), not a setting. A phone registers fewer
  simultaneous touches than any sensible cap, so it bounds CPU rather than
  expressing a musical choice. Don't reintroduce a slider for it.
- `AudioEngine.allocate` bounds the sounding voices through *pool growth*: the
  pool never exceeds `MAX_VOICES`, and voices are only handed out from the pool.
  The `find(reusable)` fast path runs before the cap check and ignores it, so a
  cap that could be lowered at runtime would not be honoured once the pool had
  grown - that is exactly why a polyphony of 1 still sounded several notes. Keep
  the cap constant.
- Microphone listening (`settings.listen`, off by default) highlights the pitch
  heard around the instrument. The pure detector is `mapping/pitchDetect.ts`
  (McLeod NSDF pitch detection; framework-free and unit-tested with generated
  sines). The browser plumbing is `input/mic.ts` (a Svelte-free class mirroring
  `Player`: `getUserMedia` → `AnalyserNode` → `detectPitch` per rAF, with a short
  hold so brief dropouts don't flicker the marker). `PlaySurface.svelte` draws the
  heard pitch with the same `midiToPosition` mapping as the scale lines. Two rules
  matter: the mic stream is connected to the analyser **only**, never to
  `destination` (routing it to output would feed back through the phone speaker);
  and `listen` must stay opt-in, never part of the first-gesture path, because
  `getUserMedia` requires a permission prompt and would break the
  "open and make a sound in one gesture" promise. `listen` is an additive field,
  so it needs no `SETTINGS_VERSION` bump.

## Deployment

GitHub Pages project site: the Vite `base` must stay `/<repo>/` (currently
`/digitofono/`), and the service worker scope and manifest `start_url` must match
it. Breaking this makes the PWA fail to install silently.
