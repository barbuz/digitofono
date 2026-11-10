# Digitofono — Product & Technical Specification

**Digitofono** (from *digito* — finger — and *fono* — sound) is a streamlined
touchscreen musical instrument: a near-blank surface where tapping or sliding
produces a pleasing, continuously-pitched tone. Designed to be played on a phone,
installed as a PWA, and deployed as static files to GitHub Pages.

Repository: https://github.com/barbuz/digitofono

Status: **Draft v0.3** — all defaults confirmed; no open questions.

---

## 1. Vision

An instrument you can carry in your pocket and practice anywhere, whose design is
**not constrained by the physical limits of classical instruments**. No strings to
reach, no keys to stretch across, no fixed register, no breath limit. The screen is
the whole instrument surface.

Design principles, in priority order:

1. **Sounds good.** Warm, rich, expressive tones — never sharp beeps or buzzy clicks.
2. **Playable.** A player can reliably hit in-tune notes and deliberately bend them.
3. **Immediate.** Open the app and make a sound within one gesture.
4. **Uncluttered.** Near-blank surface; only the feedback needed to play.
5. **Lightweight.** Small bundle, offline-capable, installable, low latency.

Non-goals (v1): MIDI export, sheet music, multi-user/collaboration, cloud sync,
iOS parity (Android + desktop browsers first; iOS is a stretch target).

---

## 2. Confirmed decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Interaction model | **Both**: quick tap = plucked note; press-and-hold = sustained gliding tone |
| 2 | Pitch quantization | **Soft snap to scale**, strength adjustable 0.0–1.0 (0 = fully free glide) |
| 3 | Short axis | **User-selectable** between *Timbre (brightness)*, *Harmonic morph*, *Harmony (chord)*, *Volume* |
| 4 | Primary target | **Android Chrome** first; desktop browsers for development |
| 5 | Visuals | Near-blank + **ripple/glow at each touch point** and a pitch indicator |
| 6 | Rotation | **Locked at load** — no runtime orientation handling; **portrait** |
| 6a | Default range | **`baseMidi=48` (C3), 3 octaves** |
| 6b | Default short axis | **Timbre** |
| 7 | Deployment | **GitHub Pages** (static hosting, HTTPS) |
| 8 | Sound quality | Explicit requirement: pleasing, warm tones (see §6) |

---

## 3. Interaction model

### 3.1 Axes

The screen is treated as a 2D control surface:

- **Long axis → pitch.** Logarithmic mapping (see §5). In the default portrait
  orientation the long axis is vertical.
- **Short axis → one assignable parameter** (Timbre / Harmonic morph / Harmony /
  Volume, §7). Left/right (horizontal) in portrait.

### 3.2 Gestures

| Gesture | Behaviour |
|---------|-----------|
| **Tap** (press + lift under `TAP_MS`, ~180 ms) | Fire a short **plucked note** at the tap position; envelope runs to completion independent of finger |
| **Hold / drag** (press and keep down, move) | Start a **sustained voice**; pitch (and short-axis parameter) glide continuously as the finger moves; sound stops on lift |
| **Multi-touch** | One voice per active pointer (polyphony), independent per finger |
| **Lift / cancel** | Release the voice with the release stage of the envelope |

A single press is ambiguous only at the boundary; resolved by elapsed time at lift
(if lifted before `TAP_MS`, it is a tap; otherwise it is a hold). During the hold,
the tone is already sounding — so the player always gets immediate audio, and the
tap case simply retriggers as a pluck on lift. (Implementation note: start a
sustained voice on `pointerdown` immediately; if released under `TAP_MS`, convert
it into a plucked note by switching to the pluck envelope. This guarantees zero
perceived latency.)

### 3.3 Locked orientation

At app load, read the current viewport dimensions and orientation and use them for
the lifetime of the session. Do **not** handle `orientationchange` / `resize`.
The manifest requests a fixed orientation (`portrait`). If the user rotates the
device mid-session, the layout does not reflow; the surface is simply cropped/
letterboxed. (Documented limitation, per decision 6.)

### 3.4 Pointer handling

- Pointer Events only (`pointerdown` / `pointermove` / `pointerup` / `pointercancel`),
  tracked by `pointerId` in a `Map<number, Voice>`.
- `setPointerCapture` on the surface so drags off-screen keep control.
- `touch-action: none`, `user-select: none`, `overscroll-behavior: none`,
  `-webkit-tap-highlight-color: transparent` on the surface.
- Use `getCoalescedEvents()` on `pointermove` for smooth glide sampling.
- Handle `pointercancel` (interrupt, system gesture) by releasing the voice —
  prevents stuck notes.
- On the first `pointerdown`, `AudioContext.resume()` (mandatory unlock gesture).

---

## 4. Layout & geometry

- Full-viewport `<canvas>` (single canvas, DPR-aware, capped at 2× for perf).
- `viewport-fit=cover`; safe-area insets applied to non-playing UI only (settings
  button), never to the pitch mapping.
- **Long axis** = the greater of `innerWidth`/`innerHeight` at load.
- **Short axis** = the lesser dimension.
- Normalize both to `[0,1]`. Pitch `0` is at the "low" end (bottom in portrait);
  pitch `1` at the "high" end.

Coordinate model:

```
pitchPos = (longAxisCoord) / (longAxisLength)   // 0..1, clamped
shortPos = (shortAxisCoord) / (shortAxisLength) // 0..1, clamped
```

---

## 5. Pitch mapping

### 5.1 Continuous (logarithmic) mapping

Pitch is **logarithmic**, never linear, so equal screen distances are equal musical
intervals.

```
baseMidi   = configurable, default 48  (C3, 130.81 Hz)
octaveSpan = configurable, default 3.0 (three octaves across the long axis)
midiFloat  = baseMidi + pitchPos * 12 * octaveSpan
frequency  = 440 * 2^((midiFloat - 69) / 12)
```

### 5.2 Soft snap to scale

```
scale      : set of pitch classes, e.g. major = {0,2,4,5,7,9,11}
snapStrength : 0.0 .. 1.0   (0 = fully free, 1 = locked to semitones)

lo, hi     = consecutive scale degrees bracketing midiFloat
half       = (hi - lo) / 2                    # half the gap to the neighbour
lock       = snapStrength * half              # width of the locked region
distance   = min(midiFloat - lo, hi - midiFloat)
nearest    = the closer of lo, hi

if lock >= half            -> blended = nearest            # full quantization
if distance <= lock        -> blended = nearest            # corrected onto the note
otherwise:
    t       = (distance - lock) / (half - lock)            # 0 at the lock edge, 1 at the midpoint
    blended = nearest + (midpoint - nearest) * t           # release to the midpoint
frequency  = 440 * 2^((blended - 69) / 12)
```

The pull is **strongest close to a degree and fades to nothing at the midpoint**
between two degrees. Within `lock` semitones of a degree the pitch is exactly
that degree, so a small playing error is corrected outright; beyond the locked
region the pitch follows the finger again, so any pitch between two degrees
stays reachable. Raising `snapStrength` widens the locked region until, at 1, the
locked regions meet and the mapping becomes plain quantization.

This is deliberately the *opposite* of a distance-proportional pull
(`blended = midiFloat + snapStrength * (nearest - midiFloat)`), which drags
hardest exactly where the player is furthest from a note and so makes it
impossible to leave the scale on purpose. The correction is saturated at its
maximum near the degree, which is also the strongest pull possible without
overshooting the note.

Properties to guarantee (unit-tested):

- `snapStrength = 0` ⇒ `blended === midiFloat` (identity; pure glide).
- `snapStrength = 1` ⇒ `blended` is exactly a scale degree.
- Mapping is monotonic non-decreasing in `pitchPos` (no pitch jumps while sliding).
- The correction never overshoots the degree it pulls toward.
- Below full strength, every pitch between two degrees remains reachable.

### 5.3 Scales

**v1 ships `chromatic` only**, and it is the **default**. With chromatic, snapping
rounds to the nearest semitone, so `snapStrength` behaves as a pure
"free-glide ↔ in-tune" control.

The mapping layer is written generically (a scale is just a set of pitch classes),
so additional scales are a data change, not a code change. Candidate scales for a
later release: Major, Natural Minor, Harmonic Minor, Major Pentatonic, Minor
Pentatonic, Blues, Dorian, Mixolydian, Lydian, Phrygian, Whole-tone.

### 5.4 Glide

Pitch changes are applied with `setTargetAtTime` (time constant ~0.012 s) so glides
are smooth and click-free. A new tap sets frequency directly at note start (no
glide from a previous note).

---

## 6. Audio engine

Web Audio API. All nodes are created once per voice and reused; nothing is
allocated inside the render loop.

### 6.1 Signal graph

```
                 ┌── oscDark  (PeriodicWave A) ──► oscDarkGain ─┐
                 │                                              ├─► voiceMix
                 │                                              │
                 ├── oscBright (PeriodicWave B) ─► oscBrightGain┘   (harmonic morph = crossfade)
                 │
   voiceMix ─► voiceEnv (ADSR gain) ─► voiceFilter (lowpass, timbre) ─► voicePan
                                                                        │
                                                                        ▼
                                                                   voiceBus (master)
                                                                        │
                          ┌─────────────────────────────────────────────┤
                          ▼                                             ▼
                    dryGain ──► masterComp ──► limiter ──► destination   reverbSend ─► convolver ─► reverbReturn ─► masterComp
```

- **oscDark / oscBright**: two `OscillatorNode`s at the *same* frequency, using two
  `PeriodicWave` tables built from harmonic amplitude arrays with **all-sine phase
  (phase 0)**. Because they share frequency and phase, summing them yields a
  spectrum that is the linear interpolation of the two tables — so crossfading
  `oscDarkGain`/`oscBrightGain` gives a **click-free, continuous harmonic morph**.
- **voiceEnv**: `GainNode` driven by an ADSR envelope (§6.3).
- **voiceFilter**: `BiquadFilterNode`, `lowpass`, cutoff = brightness (§7.1),
  `Q ≈ 0.9`, with key tracking so higher notes stay bright.
- **voicePan**: `StereoPannerNode`, optional (pan from short axis is *not* a v1
  short-axis option; reserved for a later feature).
- **masterComp**: `DynamicsCompressorNode` (threshold −12 dB, knee 12, ratio 4)
  for glue.
- **limiter**: a second `DynamicsCompressorNode` configured as a limiter
  (threshold −3 dB, knee 0, ratio 20, attack 0.002, release 0.15) to prevent
  clipping on dense chords.
- **reverb**: `ConvolverNode` with a **procedurally generated** impulse response
  (exponentially decaying noise, ~1.4 s, stereo) — no asset download. Small wet
  (~12%), fed via a send so it never muddies the dry signal.
- **ensemble**: `DelayNode` (~18 ms) whose delay time is modulated by a 0.7 Hz
  LFO, summed with the dry signal at the master compressor. Modulating the delay
  detunes the copy slightly, so each note beats against itself the way a detuned
  unison does — the pitch smears into a shimmer instead of sitting at one exact
  frequency. The wet gain is the ensemble depth control (0 = bypass).
- **vibrato**: a single 5.2 Hz LFO into a depth gain, shared by every voice. Each
  voice connects that node to both oscillators' `detune` (cents, so it is
  frequency-independent), giving the whole instrument an in-phase pitch movement
  without a per-voice LFO. Depth 0 = bypass. A pitch that is always moving has no
  fixed reference to sound wrong against, so small tuning errors are far less
  noticeable — the same reason singers use vibrato.

### 6.1.1 Why the tuning-forgiveness controls exist

Playing a continuous-pitch surface by touch, small errors are unavoidable, and a
pure steady tone makes every one of them obvious: the ear locks onto an
unambiguous reference and hears the deviation. The fix is not more harmonics —
a richer harmonic tone gives the ear *more* pitch cues and can make mistuning
worse. It is to make the pitch less definite, via detuned unison (ensemble) and
movement (vibrato). Both are settings, subtle by default and fully bypassable,
because this is a taste call best tuned by ear.

### 6.2 Making it sound *pleasing* (explicit requirement)

Concrete rules that keep it far from "sharp beeps":

1. **No raw square/saw waves.** Timbre comes from shaped `PeriodicWave` tables with
   partials rolled off (e.g. amplitudes ≈ `1/n^1.3`), giving a warm, hollow, glassy
   character.
2. **Always filtered.** Every voice passes a lowpass filter. Cutoff tracks pitch so
   high notes are not harsh. Default cutoff ~2.5 kHz at mid-range.
3. **No instant transitions.** Attack ≥ 8 ms; every parameter change uses
   `setTargetAtTime` or a short ramp. Instant `frequency`/`gain` assignment is
   banned (source of clicks).
4. **Slight detune/width.** Two voices per note detuned ±4 cents (or a small
   chorus) for richness — reserved as a preset option to control CPU.
5. **Master limiting + gentle glue compression** so chords bloom instead of clip.
6. **A touch of reverb** for space.
7. **Perceptual loudness curve** (see §7.3) so dynamics feel musical.

### 6.3 Envelopes

- **Pluck (tap):** attack 0.010 s → decay 0.45 s → sustain 0 → release 0.20 s.
  Runs to completion regardless of finger; the voice is freed at the end.
- **Sustain (hold):** attack 0.015 s → decay 0.20 s → sustain 0.85 → release 0.18 s
  on lift.
- Implemented with `setValueAtTime` + `linearRampToValueAtTime` /
  `setTargetAtTime`; envelope times are parameters of a preset.

### 6.4 Polyphony & voice management

- Max concurrent voices: **10, fixed**. One per pointer, capped. Not exposed in
  the UI: ten is more fingers than a phone registers at once, so the cap is a CPU
  bound rather than a musical control.
- Voice stealing: if at cap, steal the **oldest** voice (fade it out over ~30 ms,
  don't hard-cut).
- Voice pool: pre-allocate `Voice` objects; reuse to avoid GC in hot paths.

### 6.5 Latency & context

- `new AudioContext({ latencyHint: 'interactive' })`.
- Resume on first user gesture; on `visibilitychange` re-resume if suspended.
- Target end-to-end latency: **≤ 40 ms** on a mid-range Android device; measure in
  Phase 0. (Primary risk — see §13.)

---

## 7. Short-axis parameter

A single setting `shortAxis` selects one of four mappings. Exactly one is active at
a time; the others take fixed values from the preset.

### 7.1 Timbre (brightness) — *default*

Lowpass cutoff, mapped exponentially so the sweep feels even:

```
cutoffHz = minCutoff * (maxCutoff / minCutoff) ^ shortPos
// defaults: minCutoff = 300 Hz, maxCutoff = 8000 Hz
```

Plus key tracking: `effectiveCutoff = cutoffHz * (freq / 261.63)^0.5`, clamped to
Nyquist − 1 kHz. `Q ≈ 0.9` (a little resonance for character, not whistling).

### 7.2 Harmonic morph

Crossfade between two harmonic tables (§6.1):

```
oscBrightGain = shortPos
oscDarkGain   = 1 - shortPos
```

Default tables:

- **A (dark/hollow):** odd-dominant, fast rolloff — clarinet-ish / mellow.
- **B (bright/glassy):** richer upper partials — bell/glass.

Additional tables can be added as presets; the crossfade mechanism is generic.

### 7.3 Harmony (chord)

Stacks harmony notes above the played note to build a chord. Unlike the other
axes this one changes *how many notes* sound, not the timbre of one:

- At `shortPos = 0` the voice is the bare note.
- The harmony notes fade in one at a time across the axis, so the middle of the
  travel is a two-note interval and the far end is the full four-note chord.

The intervals are a major third, a perfect fifth and a major seventh (a major
seventh chord), chosen by a `harmonyVoicing` setting (`mapping/harmony.ts`):

- **`diatonic`** *(default)* — each interval is **snapped to the nearest degree of
  the current scale**. In the chromatic scale this is a plain major seventh chord;
  in a minor or modal scale the third/fifth/seventh take the scale's own notes, so
  the chord never clashes with what is being played.
- **`major`** — the intervals are used verbatim, ignoring the scale. A fixed major
  seventh chord on every root, so the harmony is the same regardless of scale.
- **`octaves`** — the most scale-independent voicing: plain octaves above the root
  (one, two and three octaves up). Not a chord at all, but a fixed, consonant stack
  that is identical on every root and every scale.

Whichever voicing is active, the stack is forced strictly ascending, so a sparse
scale cannot fold two notes onto the same pitch.

Each harmony note runs its own dark/bright oscillator pair at the root frequency
times the note's ratio, and the whole chord transposes together when the pitch
glides. Because `OscillatorNode` is single-use, all pairs are built at note onset
(even the silent ones) so they can fade in later without an oscillator start.

```
noteLevels[i] = clamp01((shortPos - i/N) / (1/N))   // N = number of harmony notes
```

### 7.4 Volume

Perceptual (roughly equal-loudness) curve rather than raw amplitude:

```
gain = (shortPos^2)          // simple perceptual approximation, 0..1
// or dB: gainDb = lerp(-60, 0, shortPos); gain = 10^(gainDb/20)
```

Note: there is no natural "neutral" position for volume; whichever end the finger
rests at is the level. Documented behaviour.

### 7.5 Non-selected parameters

When a parameter is not the short axis, it is set by the preset:

- If short axis ≠ Timbre → filter cutoff fixed at preset value (e.g. 2.5 kHz).
- If short axis ≠ Harmonic morph → fixed crossfade (e.g. 0.35 toward bright).
- If short axis ≠ Harmony → no harmony notes; a plain single note.
- If short axis ≠ Volume → fixed master voice gain (e.g. −10 dB).

---

## 8. Visuals

Single canvas, `requestAnimationFrame` loop, DPR-aware (cap 2×). Dim palette so the
surface stays "near blank"; the instrument is heard, not read.

- **Touch ripple:** expanding, fading ring at each pointerdown position
  (radius 0→~80 px over ~450 ms, alpha 0.5→0).
- **Active glow:** soft radial gradient following each held finger, brightness
  proportional to voice activity.
- **Pitch indicator:** a thin lane/line on the long axis marking current pitch, plus
  a small note-name label (updates live, including the snapped note when snapping
  is on).
- **Scale lines:** faint guide lines across the short axis at every step of the
  chosen scale, so the notes are visible before you play them. Opacity is a
  setting (`scaleLines`, 0 = hidden). The tonic of each octave is drawn a little
  stronger than the other degrees. Placement reuses the pitch mapping, so a line
  sits exactly where that note sounds.
- Respect `prefers-reduced-motion`: disable expanding ripples, keep a static glow.

---

## 9. Tech stack & project structure

- **Svelte 5** + **Vite** + **TypeScript**.
- **vite-plugin-pwa** (Workbox) for manifest + service worker.
- **Vitest** for unit tests.
- **Canvas 2D** for rendering. No UI framework beyond Svelte for settings.
- Audio engine lives in plain TS classes **outside** Svelte reactivity; Svelte
  handles only settings UI, lifecycle, and persistence.

```
src/
  main.ts
  App.svelte
  lib/
    audio/
      AudioEngine.ts      // context, master bus, reverb, limiter
      Voice.ts            // per-note graph + envelope + lifecycle
      waves.ts            // PeriodicWave table builders
      presets.ts          // instrument presets (envelope, filter, tables)
    input/
      pointer.ts          // pointer → Voice routing, tap/hold classification
    mapping/
      pitch.ts            // log pitch + soft snap (pure, unit-tested)
      scales.ts           // scale definitions
      shortAxis.ts        // timbre / morph / volume mapping (pure)
      harmony.ts          // chord intervals + fade-in (pure)
    state/
      settings.ts         // Svelte stores + localStorage persistence
      schema.ts           // Settings/Preset TypeScript types
    ui/
      PlaySurface.svelte  // canvas + rAF + pointer wiring
      SettingsPanel.svelte
      NoteDisplay.svelte
  styles/                 // global css, safe-area, no-scroll
public/
  icons/                  // 192, 512, maskable, apple-touch-icon
  manifest handled by plugin
.github/workflows/deploy.yml
```

---

## 10. PWA & deployment (GitHub Pages)

- **Manifest:** `name`, `short_name`, `display: standalone`, `orientation: portrait`,
  `theme_color`, `background_color`, 192/512 icons + one `maskable`, `start_url`
  and `scope` set to the Pages subpath.
- **GitHub Pages base path:** project pages serve at
  `https://<user>.github.io/<repo>/`, so Vite `base` **must** be `'/<repo>/'`.
  `vite-plugin-pwa` inherits `base` for the service worker scope — verify the SW
  registers and controls the subpath (common failure mode).
- **Fullscreen:** standalone display mode; `viewport-fit=cover`; hide scrollbars;
  prevent pull-to-refresh (`overscroll-behavior: none`).
- **Offline:** service worker precaches app shell; instrument works with no network.
- **Update visibility:** the build's version and short commit are stamped into the
  bundle at compile time and shown in the settings panel, with a "Force update"
  control that clears caches and service workers. An installed PWA can keep
  serving a stale cached bundle with no on-screen sign, so without a build stamp
  "has not updated yet" and "updated but nothing looks different" are
  indistinguishable.
- **Wake lock:** request `screen` wake lock after first gesture; re-acquire on
  `visibilitychange`. (Requires HTTPS — Pages provides it.)
- **Haptics:** none. An app-level tick was removed: a vibration short enough to
  feel like a touch response is not reliably actuated, and longer values read as
  a buzz rather than feedback. Chrome Android's own long-press haptic is
  suppressed instead by calling `preventDefault()` on `touchstart`; preventing
  the `contextmenu` event alone does **not** stop it, because the haptic is
  fired by the gesture recognizer, not the menu event. `-webkit-touch-callout:
  none` and `user-select: none` cover the callout and text-selection paths.
- **Deploy workflow:** GitHub Actions → build → `actions/upload-pages-artifact` →
  `actions/deploy-pages`. Trigger on push to `main`.
- Repo will include a `CNAME`-free setup (default `github.io` URL) unless a custom
  domain is requested later.

---

## 11. Settings & persistence

Persisted to `localStorage` (single JSON blob, versioned). Types:

```ts
type Scale = 'chromatic' | 'major' | 'minor' | 'majorPentatonic' | ...;
type ShortAxis = 'timbre' | 'harmonicMorph' | 'volume';

interface Settings {
  version: number;
  baseMidi: number;        // default 48
  octaveSpan: number;      // default 3
  scale: Scale;            // default 'chromatic' (only scale in v1)
  snapStrength: number;    // 0..1, default 0.2
  shortAxis: ShortAxis;    // default 'timbre'
  volume: number;          // master 0..1, default 0.8
  reverbAmount: number;    // 0..1, default 0.12
  ensemble: number;        // 0..1, default 0.75 (detuned chorus)
  vibrato: number;         // 0..1, default 0.2 (pitch movement)
  scaleLines: number;      // 0..1 opacity, default 0.5
  preset: PresetId;        // default 'warm'
  reducedMotionOverride?: boolean;
}

interface Preset {
  id: PresetId;
  name: string;
  attack: number; decay: number; sustain: number; release: number;
  filterDefaultHz: number; filterQ: number;
  morphDefault: number;
  waveDark: number[];      // harmonic amplitudes
  waveBright: number[];
}
```

Built-in presets: `warm` (default, warm/glassy), `hollow` (clarinet-ish),
`bell`, `pad` (slow attack), `pluck` (kalimba-ish).

Settings panel: scale, base note, octave span, snap strength slider (with a clear
"0 = free glide" marker), short-axis selector, preset selector, master volume,
reverb, ensemble, vibrato, scale-line opacity.

---

## 12. Testing & QA

### 12.1 Automated (Vitest)

Pure-function coverage is where real bugs hide:

- `pitch.ts`: log mapping monotonicity; `snapStrength=0` identity;
  `snapStrength=1` lands exactly on scale degrees; the lock-and-release snap shape
  (small errors corrected, midpoint released, no overshoot, off-scale pitches
  reachable below full strength); clamping at 0/1; octave span
  math; tie-breaking determinism; frequency accuracy vs known MIDI values
  (A4=440, C4≈261.63).
- `scales.ts`: each scale's pitch-class sets are correct.
- `shortAxis.ts`: exponential timbre mapping monotonic; morph gains sum to 1;
  volume curve monotonic.
- `harmony.ts`: diatonic intervals snapped into every scale, `major`/`octaves`
  voicings scale-independent, stack strictly ascending for every voicing; fade-in
  silent at 0 and full at 1, monotonic per note.
- Settings serialization round-trip; version migration no-op for v1.

### 12.2 Manual device checklist (Phase 0+)

- [ ] First tap produces sound immediately (no second tap needed) on Android Chrome.
- [ ] No clicks/pops on note start, glide, or release.
- [ ] Tap vs. hold both behave correctly at the boundary.
- [ ] Multi-touch: 3–4 simultaneous fingers, independent pitches, no stuck notes.
- [ ] Pitch is in tune with snapping on; glide is free with strength 0.
- [ ] Short-axis switch changes the right parameter live.
- [ ] No page scroll/zoom/pull-to-refresh while playing.
- [ ] Screen stays awake during play.
- [ ] Works offline after first load; installable to home screen.
- [ ] Measured latency acceptable (< ~40 ms target).
- [ ] No audio glitches at max polyphony.

---

## 13. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Android Chrome audio latency too high | Kills playability | Measure in Phase 0; tune `latencyHint`, keep graph shallow; fallback: AudioWorklet DSP or Capacitor shell |
| Clicks/pops | Feels amateur | Enforce ramps; never set gain/freq instantly; envelope min attack |
| CPU limits (morph/harmony oscillators × polyphony) | Dropouts | Cap polyphony; 2 oscillators per note, ≤ 4 notes/voice when harmony is on; harmony notes only built while the harmony axis is selected |
| GitHub Pages base-path SW scope | PWA silently broken | Explicit `base`; verify SW scope in deployed build early |
| Pitch precision vs expressiveness | Hard to play melodies | Soft-snap with adjustable strength (core feature) |
| Locked orientation cropping on rotation | Minor UX | Documented; manifest locks portrait |
| iOS Safari (stretch) | N/A v1 | Explicitly out of scope for v1 |

---

## 14. Roadmap

**Phase 0 — Sound on the phone (MVP).** Vite+Svelte+PWA skeleton; full-screen canvas;
pointer handling; one filtered voice; log pitch on long axis; volume on short axis;
envelopes; iOS/Android unlock; deploy pipeline to GitHub Pages. *Goal: playable
today, latency measured.*

**Phase 1 — Audio quality.** Warm `PeriodicWave` presets; master limiter/compressor;
procedural reverb; click-free glide everywhere; latency tuning; the `warm` preset
as default.

**Phase 2 — Playability.** Soft snap + strength slider; scales; base note/octave
span; note-name display; tap-vs-hold classification; multi-touch polyphony; voice
stealing.

**Phase 3 — Timbre & short axis.** Harmonic-morph engine (dual PeriodicWave
crossfade); assignable short axis (timbre / morph / harmony / volume); presets
(`hollow`, `bell`, `pad`, `pluck`).

**Phase 4 — Practice features.** Recording/looping
(`MediaStreamDestination` + `MediaRecorder`), wake lock, persisted settings.

**Phase 5 — Polish.** Ripple/glow visuals finalization, reduced-motion,
accessibility, touch calibration.

---

## 15. Acceptance criteria (v1)

1. Installing the PWA from GitHub Pages on Android and tapping the screen produces
   an immediate, warm, click-free tone.
2. Tapping gives a plucked note; holding gives a sustained tone that glides as the
   finger moves and stops on lift.
3. Pitch is logarithmic across the long axis; with snapping on, notes are reliably
   in tune; with strength 0, pitch is fully free.
4. The short axis is switchable between timbre, harmonic morph, and volume, and the
   change is audible live.
5. Up to 8 simultaneous voices with no dropouts, stuck notes, or clipping.
6. Ripples/glow render at ~60 fps.
7. Works offline and is installable; screen stays awake while playing.
8. All pure-function unit tests pass.

---

## 16. Deferred / future features

Everything below is explicitly **out of scope for v1** and listed only so the
architecture does not preclude it. None of these are commitments.

| Feature | Notes |
|---------|-------|
| **Recording / looping** | Capture performance via `MediaStreamDestination` + `MediaRecorder`; overdub loop layer. Phase 4. |
| **Additional scales** | Data-only change once the generic scale layer exists (Major, Minor, Pentatonic, Blues, modes). |
| **Custom / user-defined scales** | Let the player build their own pitch-class sets. |
| **Preset editor** | Expose envelope/filter/wave parameters to the player instead of fixed presets. |
| **More harmonic tables** | Extra dark/bright pairs for the morph engine; importable wavetables. |
| **Per-voice detune / unison** | Two detuned oscillators per note for width (CPU-gated). |
| **Pan as a short-axis option** | Reserved; weak on phone speakers, good on headphones. |
| **Vibrato / modulation** | LFO-driven pitch or filter modulation from a secondary touch or tilt. |
| **Tilt / motion control** | Device orientation as an additional expressive axis. |
| **MIDI in/out** | Web MIDI for external controllers and DAW use. |
| **Export to audio file** | Render a performance to a downloadable file. |
| **iOS Safari support** | Latency and unlock differences; stretch target beyond v1. |
| **Native shell (Capacitor)** | Fallback if browser latency proves unacceptable. |
| **Cloud sync of settings/presets** | Currently local-only. |
| **Touch calibration** | Per-device offset/gain tuning for the surface. |
