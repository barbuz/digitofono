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
- Song scale learning (`SettingsPanel` -> "Learn the scale from a song") reads a
  local audio file and lays out the notes the song actually plays as frets. The
  pure chain is `mapping/chroma.ts` (FFT -> spectral peaks -> pitch-class
  histogram -> tuning offset -> register) and `mapping/songScale.ts` (key
  finding -> pitch-class selection -> axis fit); both are framework-free and
  unit-tested, including an end-to-end `songPipeline.test.ts`. The browser
  plumbing is `input/songFile.ts` (decode with an `OfflineAudioContext` at
  `ANALYSIS_SAMPLE_RATE`, so decoding resamples in one pass) plus
  `input/analysis.worker.ts`, because a minute of audio through thousands of
  FFTs would stutter the surface on the main thread. Three rules matter:
  - The **pitch classes are the output and the key name is secondary**. A major
    key and its relative minor share all seven notes, so the label is genuinely
    ambiguous while the fret set is not. `selectPitchClasses` keeps the key's
    supported degrees plus any out-of-key note strong enough to be deliberate,
    and falls back to the whole key when thresholds would leave fewer than
    `MIN_PITCH_CLASSES`.
  - Frames are **summed, not median-reduced**. A melody note played once is a
    real note of the song and a median across frames erases it; percussive
    frames are rejected up front by spectral flatness instead. `SUPPORT_FRACTION`
    is set by the melody case (a bar-long note against a sustained pad carries
    ~0.17 of the peak), so do not raise it back to a "clean" 0.2 without
    breaking melody detection.
  - `MAX_FLATNESS` is **0.8, and it is measured on real music, not on tones**.
    This is the one threshold that must never be "tidied" back down. Spectral
    flatness is taken over an absolute band, so it scales with how much the
    recording's noise floor fills that band: a synthetic sine scores ~0.0, but a
    mastered pop mix scores ~0.12 even on its most tonal frames, ~0.52 at the
    median and ~0.74 near the top, because cymbals and mix noise lift every
    frame. The original 0.12 cutoff rejected 99.96% of a real MP3's frames, so
    `analyzeChroma` returned null and the UI reported "no clear notes found in
    the file" for nearly every real song. 0.8 keeps music even with 40% added
    noise (that peaks at 0.77) and still rejects white noise (0.83-0.85). Do not
    replace it with a percentile cut either: that keeps the *most* tonal frames,
    which are the ones without the melody, so it silently drops melody notes.
  - Out-of-key notes are judged against the **median in-key note**
    (`OUT_OF_KEY_RATIO`), never against the loudest pitch class. In a real mix
    the weakest of the twelve bins sits near half the strongest, so a bar
    measured from the peak admits all twelve notes to every song; the median
    tracks each recording's own floor. `songPipeline.test.ts` synthesises a
    dense mix - chords, melody, kick, hats and a noise floor - in eight keys and
    asserts the exact fret set, plus a guard that unpitched noise still yields
    null. Any change to the gates or thresholds must keep those passing.
  - The key finder uses the Krumhansl-Kessler profiles with **Pearson
    correlation**, never plain cosine: a template that zeroes the notes a scale
    omits would otherwise gain similarity from its smaller norm and a mode could
    outscore the scale that contains the song's notes. An exact tie is a real
    outcome (a flat set of notes fits every rotation), so `compareCandidates`
    breaks it deterministically.
  A learned scale is **session-only** and lives in `state/songScale.ts`, not in
  `Settings`: it is an experiment against one track, not a preference, and
  keeping it out is why this needed no `SETTINGS_VERSION` bump. `Player`
  overrides `settings.scale` through `updateSongScale`, and `PlaySurface` draws
  both the guide lines and the axis span from the song when one is loaded. Never
  route the analysed file to `destination` - it is analysed, never played.

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
- Song import (`input/songFile.ts` → `mapping/chroma.ts` → `mapping/songScale.ts`)
  lays out frets from an audio file. `chroma.ts` runs two passes: the main one
  over 110-2000 Hz, which finds the notes, and `analyseBass` over 55-165 Hz,
  which finds the tonic. Both matter, for different reasons.
- The bass pass exists because the notes alone cannot name a key: C major, F
  major and A minor share the same pitch classes, and only the bass says which
  is home. Its band must reach E3 (~165 Hz), not stop at E2. A bass line sits
  about an octave above what a listener calls "the bass", so a band that stops at
  130 Hz cannot see a bass note at D3 (147 Hz) at all and instead latches onto an
  octave-below artifact of whatever else is sounding - which named A as the tonic
  of a D major test passage.
- The bass pass must reject a kick drum, which lives in the same band: a kick is a
  fast downward sweep, loud and tonal enough to pass a flatness gate, and it
  crosses every pitch class on the way down. Harmonics are the only discriminator,
  and they must be measured *relative to the peak's own fundamental*, not to the
  band's median. The median of a wide band is dominated by noise and drums, so it
  collapses as the band widens and the gate silently stops working. A kick scores
  ~0.10, real bass ~0.25, a clean bass tone ~0.34; the threshold is 0.18.
- `analyseBass` returns all-zeros when it finds no pitched bass. That is "no
  evidence", and `rankKeys` must only apply `BASS_TONIC_WEIGHT` when the profile
  is non-zero, or a bass-free track would get a random tonic bonus.
- Confidence is measured on `templateScore` (the template fit alone), against the
  best-fitting *other* key - not against the next entry in score order. The bass
  prior reorders that list, so comparing to the runner-up in score order measures
  the chosen key against a rival the prior already demoted and overclaims. A key
  that only won because of the prior correctly reports low confidence.
- Known limitation: a semitone apart at A3 (207.65 vs 220 Hz) is not a resolution
  problem - at 11 kHz with a 4096 frame the FFT already has ~4.9 bins per semitone
  there. The main pass counts *peaks* and weights them by `sqrt`, so a weak
  spectral smear counts nearly as much as a real note. High-resolution analysis of
  the reference track shows the Ab band actually holds more energy than A (1.24x),
  yet A wins on peak count. Fixing this means an energy-based chroma rather than
  peak counting; it is a larger change and not yet made.

## Deployment

GitHub Pages project site: the Vite `base` must stay `/<repo>/` (currently
`/digitofono/`), and the service worker scope and manifest `start_url` must match
it. Breaking this makes the PWA fail to install silently.
