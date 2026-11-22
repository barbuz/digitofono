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
- The harmonizer (`mapping/harmony.ts`) is both a *short-axis option* and a stored
  tone value, not a separate mode: at `shortPos = 0` on the axis it sounds the
  bare note, and every harmony note starts
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
  via a per-note gain, never started later. When the harmony axis is not selected
  and the fixed harmony amount is zero, `Player` passes empty ratios and the voice
  keeps its original two oscillators; a positive fixed amount builds the chord
  graph off-axis.
- Presets are snapshots, not runtime modes. Every value a preset controls lives in
  `Settings` as part of `ToneState`; `PRESETS` only supplies values to copy.
  Selecting a preset calls `applyPreset`, which copies the values and sets `preset`
  to the id. Editing any tone slider calls `updateTone`, which sets
  `preset: 'custom'`. `resolveAxes`, `Voice` and `AudioEngine` must never read
  `settings.preset` to derive sound; the preset field is a UI label only.
- The wave tables are parametric: `harmonicTable(tilt, even)` in `waves.ts`.
  `even = 0` is odd-only/hollow, `even = 1` keeps every partial with the same
  `1/n^tilt` rolloff. This replaced the hand-written amplitude arrays so every
  preset value maps to a slider. Presets were re-voiced to the nearest point in
  that family; the bell table is the only approximation.
- User presets live in `state/userPresets.ts` under
  `digitofono.userPresets.v1`, separate from the settings blob. They store a
  `ToneState` snapshot, never the short-axis assignment or global settings. Saving
  a name that already exists updates that preset instead of duplicating it.
- A v2 settings blob from before this overhaul has only `preset`. `load()` must
  hydrate the tone fields from that preset (`PRESETS[parsed.preset].values`) before
  applying `...parsed`, or a saved Bell silently loads warm's cutoff and morph.
- The harmony graph is built whenever the harmony axis is selected, even at
  `shortPos = 0` where every level is silent, so it can fade in as the finger
  moves. It is also built off-axis when a fixed harmony amount is > 0. Checking
  only "any level > 0" drops the axis-at-zero case and the chord can never fade
  in.
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
  - `MAX_ANALYSIS_SECONDS = 90` is **load-bearing, not a shortcut**. Measured
    against five tracks with verified keys (see
    `/workspace/tools/song-analysis/README.md`), the first 90 s scores 4/5,
    the whole track 2/5, and 30 s sections with a majority vote 3/5. Summing
    more audio lets later sections dilute the key statement: *Yesterday* is
    correct at 90 s and flips to the wrong pitch-class set at 120 s, and *Baby
    One More Time* does the same. Do not remove the cap to "use the whole
    song" - it makes the feature worse. The tuning estimate is stable to ~1
    cent across window lengths, so the degradation is not a drifting pitch
    reference.
  - Ground truth for this feature must be **measured, not inferred**. A
    Krumhansl-profile key finder scored 13/24 on synthesized songs, reporting
    every minor key as its parallel major; using it as the reference produced
    two false bug reports. Measure energy on the specific semitone, in the
    octave where it is resolvable. Relative keys share a pitch-class set, so
    a label flip between them is harmless; only a set change affects the frets.
  - `CHROMA_MIN_HZ = 110` is **exactly A2 (110.00 Hz)**, and that coincidence was
    the whole of the A/Ab mislabelling. Ab2 is 103.83 Hz, so it fell below the
    cutoff and was discarded, while A2 sat on the first analysed bin and
    survived. Octave 2 contributed 169.9 to A and **zero** to Ab; remove that
    octave and Ab wins on Albatraoz by 61. The chroma was not saying "A is
    stronger", it was saying "Ab was never measured where it was strongest".
  - **The fix is `EDGE_TAPER_SEMITONES`, not moving the cutoff.** Peaks are
    weighted by a raised-cosine ramp over one semitone at each end of the band,
    so no single pitch class sits on an unattenuated edge. Measured on two equal
    tones A2+B2, the hard edge returned A/B = 1.39; the taper returns 0.80. Do
    **not** lower `CHROMA_MIN_HZ` instead: 95 Hz scores 3/7 and 80 Hz 2/7,
    because the band below 110 Hz is mostly kick and rumble. The regression test
    in `chroma.test.ts` pins the A2/B2 ratio and fails if the taper is removed.
  - The taper does what it was written for: on Albatraoz it drops A from 0.990
    to 0.756, so the track is no longer labelled with an A it does not contain.
    It does **not** make the track's note set correct - see the open F# bug
    below. Taper width is load-bearing; 0.5 and 0.75 are too narrow to move A.
  - Do not "fix" the edge by widening the magnitude scan beyond the band to make
    the `magnitude[bin] > magnitude[bin-1]` neighbour test valid at the borders.
    That was measured and is neutral-to-harmful (it admits the very low content
    the cutoff exists to reject), so `findPeaks` still scans only the band.
  - **Known open bug: both Albatraoz and I'm Still Standing gain one spurious
    note**, and it is the same bug twice. The track's chroma is very flat, so an
    out-of-key note clears the in-key median and passes the gate:
    - Albatraoz: selected `C D D# F F# G G# A#` - extra F#, a tie against the
      real F in every octave (0.94, 1.11, 0.95, 1.28, 0.97).
    - I'm Still Standing: selected `C C# D# F F# G# A A#` - extra A, a tie
      against the real G# (G#/A = 1.088, F/F# = 1.089 from the app's own
      chroma). The key *label* is right here (A# minor: minor third C# 1.205
      beats major third D 1.074, bass A# strongest at 1.209), so only the note
      set is wrong.
    Both are ties by the project's own decisiveness rule (a pair needs >=1.15 or
    <=0.87 to decide), and in both the app keeps the *upper* semitone. Do not
    treat a tie as a note.
  - **`OUT_OF_KEY_RATIO` is 1.3, and that is a deliberate trade, not a free win.**
    The bar sits above 1 because the in-key median is not the right height for a
    *flat* chroma: every bin of a dense mix carries bleed from its neighbours, so
    a semitone that is not in the song still lands at 1.03-1.18x the median. At 1
    the borrowed-note branch fired on 3 of 10 tracks and **every** firing was
    wrong (Albatraoz F# at 1.05x, I'm Still Standing A at 1.18x, Ballata
    dell'amore cieco G# at 1.03x and A# at 1.08x). At 1.3 the corpus is 10/10.
  - **But the branch now fires on 0 of 10 tracks**, because no pitch class in
    any of those recordings exceeds 1.35x the median. So in practice this is "the
    seven-note key, no borrowed notes". The corpus contains no true positive for
    the borrowed-note feature, so 1.3 is the best value the evidence supports,
    not a value proven to preserve borrowed chords. If a song with a real
    borrowed chord appears, measure where that note sits before trusting the bar.
    A note at 1.09x is *not* evidence of a borrowed chord - that is inside the
    measured noise band, and `songScale.test.ts` now pins it as a drop.
  - The threshold is a symptom-level knob. The cause is that the chroma is too
    flat to separate a note from bleed; a sharper chroma would need no such bar.
  - **A song that changes key has no correct single answer**, and no threshold
    helps. `Ballata dell'amore cieco` is A natural minor until ~95 s then A#
    natural minor; the union of the two keys is all twelve pitch classes. The app
    analyses only `MAX_ANALYSIS_SECONDS = 90` (`input/songFile.ts`) and folds
    that into one chroma (`input/analysis.worker.ts`), so its label describes the
    first 90 s. For that window A natural minor *is* the correct answer, and 1.3
    returns exactly `C D E F G A B`. Section-wise analysis is a known future
    feature, not a bug in this constant.
  - Attempts measured and rejected for the spurious note, so they are not
    repeated: `MAX_HARMONIC` 10-16 (F# unchanged at 0.85); pruning against
    sub-band bass roots (C2's 11th harmonic is F#) (no change); `NOISE_FLOOR`
    0.04-0.08 (chroma stays flat); judging out-of-key notes against the in-key
    *peak* instead of the median (0/8 to 5/8); `CHROMA_MAX_HZ` 1000-1500 (6/8);
    linear peak weight instead of `sqrt` (flatness gets worse, Elton flips to
    A# major); and forcing the tuning offset to 0 (5/8, Elton unchanged). The
    cause is upstream: a flat chroma cannot separate a note from bleed. Improve
    chroma contrast, not the selection threshold.

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
- The main pass's window length is derived from the sample rate, not fixed at a
  sample count: `frameSizeFor(rate)` keeps it at ~372 ms, which is 4096 samples
  at 11 kHz (unchanged) and 16384 at 44.1 kHz. A fixed 4096-point frame is 372 ms
  at 11 kHz but only 93 ms at 44.1 kHz, where a semitone at A2 is *less* than one
  bin wide - raising the decode rate would then make resolution worse, and did:
  the same song was reported as a different key at each rate. Keep the window
  constant in time and the answer stops depending on the rate.
- `CHROMA_MIN_HZ` is a hard band edge, and where it lands is arbitrary because
  `lowestBin = ceil(110 / binHz)` rounds to a bin. At 11 kHz the band starts at
  110.4 Hz, so A2 (110.0 Hz) leaks into the first kept bin while Ab2 (103.8 Hz) is
  cut entirely - the low octave, where the key evidence is, gets discarded and a
  biased top octave decides. This is a known open issue, not yet fixed.
- Known limitation: the main pass counts *peaks* and weights them by `sqrt`, so a
  weak spectral smear counts nearly as much as a real note. On Albatraoz and
  Britney (both C natural minor) the app over-scores A against Ab and can report
  C dorian or G natural minor instead of C natural minor. Do not explain this as a
  harmonic artifact: notching every D and every F fundamental out of the audio
  left the phantom A *higher*, so it is not the third harmonic of D or the fifth
  of F. On clean synthetic material the same code returns the correct frets, so
  the bias needs a dense real mix to appear. Fixing it means an energy-based
  chroma rather than peak counting; it is a larger change and not yet made.

## Deployment

GitHub Pages project site: the Vite `base` must stay `/<repo>/` (currently
`/digitofono/`), and the service worker scope and manifest `start_url` must match
it. Breaking this makes the PWA fail to install silently.
