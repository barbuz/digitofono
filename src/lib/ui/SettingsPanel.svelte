<script lang="ts">
  import { isPresetId, PRESETS, PRESET_IDS } from '../audio/presets';
  import { SCALE_IDS, SCALE_LABELS } from '../mapping/scales';
  import { HARMONY_VOICING_IDS, HARMONY_VOICING_LABELS } from '../mapping/harmony';
  import { NOTE_NAMES, midiToNoteName } from '../mapping/pitch';
  import {
    ATTACK_MAX,
    ATTACK_MIN,
    AXIS_TARGETS,
    DECAY_MAX,
    DECAY_MIN,
    RELEASE_MAX,
    RELEASE_MIN,
    SHORT_AXIS_LABELS,
    timbreHzForPosition,
    type ShortAxisId,
  } from '../mapping/shortAxis';
  import {
    applyPreset,
    resetSettings,
    toneValues,
    updateSettings,
    updateTone,
  } from '../state/settings';
  import {
    deleteUserPreset,
    isUserPresetId,
    saveUserPreset,
    userPresets,
  } from '../state/userPresets';
  import { clearSongScale, setSongScale } from '../state/songScale';
  import { SongAnalyser } from '../input/songFile';
  import AppMark from './AppMark.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import { BUILD_INFO, formatBuildLabel } from '../version';
  import type { Settings, ToneState } from '../state/schema';
  import type { ScaleId } from '../mapping/scales';
  import type { HarmonyVoicing } from '../mapping/harmony';
  import type { SongScale } from '../mapping/songScale';

  const barbuzMark = `${import.meta.env.BASE_URL}barbuz-mark.svg`;

  let {
    settings,
    open = $bindable(false),
    song = $bindable(null),
  }: {
    settings: Settings;
    open?: boolean;
    song?: SongScale | null;
  } = $props();

  let analyser: SongAnalyser | null = null;
  let analysing = $state(false);
  let progress = $state(0);
  let songError: string | null = $state(null);
  let presetName = $state('');
  let saveStatus: string | null = $state(null);

  const selectedPresetId = $derived(
    settings.preset === 'custom' ||
      (!isPresetId(settings.preset) &&
        !$userPresets.some((preset) => preset.id === settings.preset))
      ? 'custom'
      : settings.preset,
  );

  function timeToPos(value: number, min: number, max: number): number {
    const clamped = Math.max(min, Math.min(max, value));
    return Math.log(clamped / min) / Math.log(max / min);
  }

  function posToTime(pos: number, min: number, max: number): number {
    return min * Math.pow(max / min, Math.max(0, Math.min(1, pos)));
  }

  function setTone(field: keyof ToneState, value: number): void {
    updateTone({ [field]: value } as Partial<ToneState>);
    saveStatus = null;
  }

  function onPresetChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === 'custom') return;

    if (isPresetId(value)) {
      applyPreset(PRESETS[value]);
      saveStatus = null;
      return;
    }

    const saved = $userPresets.find((preset) => preset.id === value);
    if (saved) {
      applyPreset(saved);
      saveStatus = null;
    }
  }

  function saveCurrentPreset(): void {
    const name = presetName.trim();
    if (!name) return;
    const saved = saveUserPreset(name, toneValues(settings));
    updateSettings({ preset: saved.id });
    presetName = '';
    saveStatus = `Saved “${saved.name}”`;
  }

  function deleteCurrentPreset(): void {
    if (!isUserPresetId(settings.preset)) return;
    const name = $userPresets.find((preset) => preset.id === settings.preset)?.name ?? 'Preset';
    deleteUserPreset(settings.preset);
    updateSettings({ preset: 'custom' });
    saveStatus = `Deleted “${name}”`;
  }

  async function onSongFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Clear immediately so picking the same file twice fires again.
    input.value = '';
    if (!file) return;

    analyser ??= new SongAnalyser({
      onProgress: (fraction) => (progress = fraction),
    });

    analysing = true;
    progress = 0;
    songError = null;

    try {
      const learned = await analyser.analyse(file);
      if (!learned) {
        songError = 'No clear notes found in that file.';
        return;
      }
      // Opening a song is the whole point, so its scale is applied at once.
      song = learned;
      setSongScale(learned);
      updateSettings({ baseMidi: learned.baseMidi, octaveSpan: learned.octaveSpan });
    } catch (error) {
      songError = error instanceof Error ? error.message : String(error);
    } finally {
      analysing = false;
      progress = 0;
    }
  }

  function clearSong(): void {
    song = null;
    clearSongScale();
    songError = null;
  }

  const baseNoteOptions = Array.from({ length: 5 }, (_, octave) =>
    NOTE_NAMES.map((name, pc) => ({
      midi: (octave + 1) * 12 + pc,
      label: `${name}${octave}`,
    })),
  ).flat();

  function handleNumber(
    field: 'octaveSpan' | 'snapStrength' | 'volume' | 'reverbAmount' | 'ensemble' | 'vibrato' | 'scaleLines',
  ) {
    return (event: Event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      updateSettings({ [field]: value });
    };
  }

  // Escape hatch for a stale install: drop every cache and service worker, then
  // reload so the device fetches the current build from the network.
  async function forceUpdate(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload();
  }
</script>

{#snippet axisPicker(id: ShortAxisId)}
  <label class="axis-pick">
    <input
      type="radio"
      name="shortAxis"
      value={id}
      checked={settings.shortAxis === id}
      aria-label={`Use ${SHORT_AXIS_LABELS[id]} as the short axis`}
      onchange={() => updateSettings({ shortAxis: id })}
    />
    Axis
  </label>
{/snippet}

{#snippet sliderRow(
  id: ShortAxisId,
  value: number,
  oninput: (event: Event & { currentTarget: HTMLInputElement }) => void,
  hint: string,
)}
  {@const target = AXIS_TARGETS[id]}
  {@const uiMin = target.curve === 'log' ? 0 : target.min}
  {@const uiMax = target.curve === 'log' ? 1 : target.max}
  <div class="tone-row" class:active={settings.shortAxis === id}>
    <div class="tone-head">
      <span>{target.label}</span>
      {@render axisPicker(id)}
    </div>
    <input
      type="range"
      min={uiMin}
      max={uiMax}
      step={target.step}
      {value}
      aria-label={target.label}
      disabled={settings.shortAxis === id}
      {oninput}
    />
    {#if hint}
      <span class="hint">{hint}</span>
    {/if}
    {#if settings.shortAxis === id}
      <span class="hint">touch controls this</span>
    {/if}
  </div>
{/snippet}

{#snippet plainSliderRow(
  title: string,
  value: number,
  min: number,
  max: number,
  step: number,
  oninput: (event: Event & { currentTarget: HTMLInputElement }) => void,
  hint: string,
)}
  <div class="tone-row">
    <div class="tone-head">
      <span>{title}</span>
    </div>
    <input type="range" {min} {max} {step} {value} aria-label={title} {oninput} />
    {#if hint}
      <span class="hint">{hint}</span>
    {/if}
  </div>
{/snippet}

{#if open}
  <div class="backdrop" role="presentation" onclick={() => (open = false)}></div>
  <aside class="panel" aria-label="Settings">
    <header>
      <h2>Settings</h2>
      <button class="close" onclick={() => (open = false)} aria-label="Close settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="theme-row">
      <span>Theme</span>
      <ThemeToggle />
    </div>

    <label>
      Preset
      <select value={selectedPresetId} onchange={onPresetChange}>
        {#each PRESET_IDS as id}
          <option value={id}>{PRESETS[id].name}</option>
        {/each}
        {#each $userPresets as preset}
          <option value={preset.id}>{preset.name}</option>
        {/each}
        {#if selectedPresetId === 'custom'}
          <option value="custom" disabled>Custom</option>
        {/if}
      </select>
    </label>

    {#if selectedPresetId === 'custom'}
      <div class="save-preset">
        <input
          bind:value={presetName}
          placeholder="Preset name"
          maxlength="40"
          aria-label="Preset name"
        />
        <button onclick={saveCurrentPreset} disabled={!presetName.trim()}>Save preset</button>
      </div>
    {/if}

    {#if isUserPresetId(settings.preset)}
      <button class="delete-preset" onclick={deleteCurrentPreset}>Delete this preset</button>
    {/if}

    {#if saveStatus}
      <span class="hint">{saveStatus}</span>
    {/if}

    <h3>Tone</h3>

    {@render sliderRow(
      'timbre',
      settings.timbre,
      (e) => setTone('timbre', Number(e.currentTarget.value)),
      `${Math.round(timbreHzForPosition(settings.timbre))} Hz`,
    )}

    {@render sliderRow(
      'harmonicMorph',
      settings.morph,
      (e) => setTone('morph', Number(e.currentTarget.value)),
      `${Math.round(settings.morph * 100)}% bright`,
    )}

    <div class="tone-row" class:active={settings.shortAxis === 'harmony'}>
      <div class="tone-head">
        <span>{AXIS_TARGETS.harmony.label}</span>
        {@render axisPicker('harmony')}
      </div>
      <input
        type="range"
        min={AXIS_TARGETS.harmony.min}
        max={AXIS_TARGETS.harmony.max}
        step={AXIS_TARGETS.harmony.step}
        value={settings.harmony}
        aria-label={AXIS_TARGETS.harmony.label}
        disabled={settings.shortAxis === 'harmony'}
        oninput={(e) => setTone('harmony', Number(e.currentTarget.value))}
      />
      <span class="hint">
        {settings.harmony === 0 ? 'off' : `${Math.round(settings.harmony * 100)}% chord`}
        {#if settings.shortAxis === 'harmony'} · touch controls this{/if}
      </span>
      <label>
        Harmony voicing
        <select
          value={settings.harmonyVoicing}
          onchange={(e) =>
            updateSettings({ harmonyVoicing: (e.currentTarget.value as HarmonyVoicing) })}
        >
          {#each HARMONY_VOICING_IDS as id}
            <option value={id}>{HARMONY_VOICING_LABELS[id]}</option>
          {/each}
        </select>
      </label>
    </div>

    {@render sliderRow(
      'volume',
      settings.voiceLevel,
      (e) => setTone('voiceLevel', Number(e.currentTarget.value)),
      `${Math.round(settings.voiceLevel * 100)}%`,
    )}

    {@render sliderRow(
      'filterQ',
      settings.filterQ,
      (e) => setTone('filterQ', Number(e.currentTarget.value)),
      `${settings.filterQ.toFixed(2)}`,
    )}

    <h3>Envelope</h3>

    {@render sliderRow(
      'attack',
      timeToPos(settings.attack, ATTACK_MIN, ATTACK_MAX),
      (e) => setTone('attack', posToTime(Number(e.currentTarget.value), ATTACK_MIN, ATTACK_MAX)),
      `${settings.attack.toFixed(3)} s`,
    )}

    {@render sliderRow(
      'decay',
      timeToPos(settings.decay, DECAY_MIN, DECAY_MAX),
      (e) => setTone('decay', posToTime(Number(e.currentTarget.value), DECAY_MIN, DECAY_MAX)),
      `${settings.decay.toFixed(3)} s`,
    )}

    {@render sliderRow(
      'sustain',
      settings.sustain,
      (e) => setTone('sustain', Number(e.currentTarget.value)),
      `${Math.round(settings.sustain * 100)}%`,
    )}

    {@render sliderRow(
      'release',
      timeToPos(settings.release, RELEASE_MIN, RELEASE_MAX),
      (e) => setTone('release', posToTime(Number(e.currentTarget.value), RELEASE_MIN, RELEASE_MAX)),
      `${settings.release.toFixed(3)} s`,
    )}

    <h3>Wave shape</h3>

    {@render sliderRow(
      'darkTilt',
      settings.darkTilt,
      (e) => setTone('darkTilt', Number(e.currentTarget.value)),
      `${settings.darkTilt.toFixed(2)} · higher rolls off the upper partials faster`,
    )}

    {@render sliderRow(
      'darkEven',
      settings.darkEven,
      (e) => setTone('darkEven', Number(e.currentTarget.value)),
      `${Math.round(settings.darkEven * 100)}% · 0 = hollow/odd-only, 100% = all partials`,
    )}

    {@render sliderRow(
      'brightTilt',
      settings.brightTilt,
      (e) => setTone('brightTilt', Number(e.currentTarget.value)),
      `${settings.brightTilt.toFixed(2)}`,
    )}

    {@render sliderRow(
      'brightEven',
      settings.brightEven,
      (e) => setTone('brightEven', Number(e.currentTarget.value)),
      `${Math.round(settings.brightEven * 100)}%`,
    )}

    {#if song}
      <div class="song">
        <div class="song-head">
          <strong>{song.label}</strong>
          <span class="hint">
            {Math.round(song.confidence * 100)}% confident · {song.pitchClasses.length} notes
          </span>
        </div>
        <span class="hint">
          {song.pitchClasses.map((pc) => NOTE_NAMES[pc]).join(' ')} ·
          {midiToNoteName(song.lowMidi)}–{midiToNoteName(song.highMidi)}
          {#if Math.abs(song.tuningCents) >= 5}
            · tuning {song.tuningCents > 0 ? '+' : ''}{song.tuningCents}¢
          {/if}
        </span>
        {#if song.candidates.length > 1}
          <span class="hint">
            also possible: {song.candidates
              .slice(1)
              .map((candidate) => candidate.label)
              .join(', ')}
          </span>
        {/if}
        <button class="song-clear" onclick={clearSong}>Back to {SCALE_LABELS[settings.scale]}</button>
      </div>
    {/if}

    <label>
      Scale
      <select
        value={settings.scale}
        onchange={(e) => updateSettings({ scale: (e.currentTarget.value as ScaleId) })}
      >
        {#each SCALE_IDS as id}
          <option value={id}>{SCALE_LABELS[id]}</option>
        {/each}
      </select>
    </label>

    <label>
      Base note
      <select
        value={settings.baseMidi}
        onchange={(e) => updateSettings({ baseMidi: Number(e.currentTarget.value) })}
      >
        {#each baseNoteOptions as option}
          <option value={option.midi}>{option.label}</option>
        {/each}
      </select>
    </label>

    <h3>Performance</h3>

    {@render plainSliderRow(
      `Octaves: ${settings.octaveSpan.toFixed(1)}`,
      settings.octaveSpan,
      1,
      5,
      0.5,
      handleNumber('octaveSpan'),
      '',
    )}

    {@render sliderRow(
      'snapStrength',
      settings.snapStrength,
      handleNumber('snapStrength'),
      `${settings.snapStrength.toFixed(2)} · 0 = free glide; higher corrects small errors, still free between notes`,
    )}

    {@render sliderRow(
      'masterVolume',
      settings.volume,
      handleNumber('volume'),
      `${Math.round(settings.volume * 100)}%`,
    )}

    {@render sliderRow(
      'reverb',
      settings.reverbAmount,
      handleNumber('reverbAmount'),
      `${Math.round(settings.reverbAmount * 100)}%`,
    )}

    {@render sliderRow(
      'ensemble',
      settings.ensemble,
      handleNumber('ensemble'),
      `${Math.round(settings.ensemble * 100)}% · detuned chorus; blurs the pitch`,
    )}

    {@render sliderRow(
      'vibrato',
      settings.vibrato,
      handleNumber('vibrato'),
      `${Math.round(settings.vibrato * 100)}% · pitch movement; softens tuning errors`,
    )}

    {@render plainSliderRow(
      `Scale lines: ${Math.round(settings.scaleLines * 100)}%`,
      settings.scaleLines,
      0,
      1,
      0.05,
      handleNumber('scaleLines'),
      'guide lines at each scale step; 0 hides them',
    )}

    <label class="toggle">
      <span class="toggle-row">
        <input
          type="checkbox"
          checked={settings.listen}
          onchange={(e) => updateSettings({ listen: e.currentTarget.checked })}
        />
        Listen to microphone
      </span>
      <span class="hint">
        highlight the pitch of music playing around the instrument. Needs mic
        permission; audio is analysed on-device and never recorded.
      </span>
    </label>

    <label class="file">
      Learn the scale from a song
      <span class="hint">
        picks the notes an audio file uses and lays them out as frets. The file
        is analysed on this device and never uploaded.
      </span>
      <input
        type="file"
        accept="audio/*"
        disabled={analysing}
        onchange={onSongFile}
      />
      {#if analysing}
        <span class="hint">Listening… {Math.round(progress * 100)}%</span>
      {/if}
      {#if songError}
        <span class="error">{songError}</span>
      {/if}
    </label>

    <button class="reset" onclick={resetSettings}>Reset to defaults</button>

    <footer class="about">
      <div class="about-brand">
        <AppMark size={24} />
        <span>digitofono</span>
      </div>
      <p class="about-links">
        <a class="about-barbuz" href="https://barbuz.github.io" aria-label="made by barbuz">
          <img class="about-barbuz-mark" src={barbuzMark} alt="" />
          <span>made by <strong>barbuz</strong></span>
        </a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/barbuz/digitofono">source <span aria-hidden="true">↗</span></a>
        <span aria-hidden="true">·</span>
        <a href="https://donate.stripe.com/9B6eVd1madcF8Dt8yp1gs00">leave a tip <span aria-hidden="true">↗</span></a>
      </p>
      <div class="build">
        <span>Build {formatBuildLabel(BUILD_INFO)}</span>
        <button class="update" onclick={forceUpdate}>Force update</button>
      </div>
    </footer>
  </aside>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(6, 9, 15, 0.62);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    z-index: 10;
  }

  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(22rem, 88vw);
    padding: 1.25rem;
    padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
    overflow-y: auto;
    background: var(--surface);
    color: var(--text);
    border-left: 1px solid var(--line);
    box-shadow: var(--shadow);
    z-index: 11;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  .theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
  }

  h3 {
    margin: 0.35rem 0 -0.25rem;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--muted);
    transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }

  .close svg {
    width: 0.95rem;
    height: 0.95rem;
  }

  .close:hover {
    border-color: var(--accent);
    color: var(--text);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.88rem;
    font-weight: 500;
  }

  .hint {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--muted);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-row input[type='checkbox'] {
    -webkit-appearance: none;
    appearance: none;
    width: 1.05rem;
    height: 1.05rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--surface-2);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }

  .toggle-row input[type='checkbox']:checked {
    border-color: var(--accent);
    background-color: var(--accent);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-size: 80%;
    background-position: center;
    background-repeat: no-repeat;
  }

  .axis-pick input[type='radio'] {
    accent-color: var(--accent);
    width: 1rem;
    height: 1rem;
  }

  select,
  input[type='range'] {
    width: 100%;
  }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    height: 1.1rem;
    background: transparent;
    cursor: pointer;
  }

  input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--muted) 30%, transparent);
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--muted) 30%, transparent);
  }

  input[type='range']::-moz-range-progress {
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--accent);
  }

  input[type='range']::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--accent);
  }

  select {
    padding: 0.45rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--text);
  }

  .tone-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--surface-2);
  }

  .tone-row.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
  }

  .tone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.88rem;
  }

  .axis-pick {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--muted);
  }

  .save-preset {
    display: flex;
    gap: 0.4rem;
  }

  .save-preset input {
    flex: 1;
    min-width: 0;
    padding: 0.45rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--text);
  }

  .save-preset button,
  .delete-preset,
  .song-clear,
  .update,
  .reset {
    padding: 0.42rem 0.65rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 500;
    transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .save-preset button:hover,
  .song-clear:hover,
  .update:hover,
  .reset:hover {
    border-color: var(--accent);
  }

  .save-preset button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .delete-preset {
    align-self: flex-start;
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 40%, var(--line));
  }

  .song {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.6rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--surface-2);
  }

  .song-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .song-clear {
    align-self: flex-start;
  }

  .error {
    font-size: 0.75rem;
    color: var(--danger);
  }

  input[type='file'] {
    font-size: 0.78rem;
    color: var(--muted);
  }

  input[type='file']::file-selector-button {
    margin-right: 0.5rem;
    padding: 0.42rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  input[type='file']::file-selector-button:hover {
    border-color: var(--accent);
  }

  .reset {
    color: var(--text);
  }

  .about {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }

  .about-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-display);
    font-weight: var(--font-display-weight);
    font-size: 1.12rem;
    letter-spacing: -0.02em;
  }

  .about-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--muted);
  }

  .about-links a {
    color: var(--muted);
    text-decoration: none;
    transition: color var(--dur-fast) var(--ease);
  }

  .about-links a:hover {
    color: var(--accent);
  }

  .about-barbuz {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .about-barbuz-mark {
    height: 1.05em;
    width: auto;
    display: block;
  }

  .about-barbuz strong {
    color: var(--text);
    font-weight: 600;
  }

  .about-barbuz:hover strong {
    color: inherit;
  }

  .build {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--muted);
  }

  .update {
    font-size: 0.7rem;
  }
</style>
