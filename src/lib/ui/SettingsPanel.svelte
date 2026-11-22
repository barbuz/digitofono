<script lang="ts">
  import { isPresetId, PRESETS, PRESET_IDS } from '../audio/presets';
  import { SCALE_IDS, SCALE_LABELS } from '../mapping/scales';
  import { HARMONY_VOICING_IDS, HARMONY_VOICING_LABELS } from '../mapping/harmony';
  import { NOTE_NAMES, midiToNoteName } from '../mapping/pitch';
  import { timbreHzForPosition } from '../mapping/shortAxis';
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
  import { BUILD_INFO, formatBuildLabel } from '../version';
  import type { Settings, ToneState } from '../state/schema';
  import type { ScaleId } from '../mapping/scales';
  import type { HarmonyVoicing } from '../mapping/harmony';
  import type { SongScale } from '../mapping/songScale';

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

  const ATTACK_MIN = 0.005;
  const ATTACK_MAX = 1;
  const DECAY_MIN = 0.02;
  const DECAY_MAX = 2;
  const RELEASE_MIN = 0.02;
  const RELEASE_MAX = 3;

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

{#if open}
  <div class="backdrop" role="presentation" onclick={() => (open = false)}></div>
  <aside class="panel" aria-label="Settings">
    <header>
      <h2>Settings</h2>
      <button class="close" onclick={() => (open = false)} aria-label="Close settings">✕</button>
    </header>

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

    <div class="tone-row" class:active={settings.shortAxis === 'timbre'}>
      <div class="tone-head">
        <span>Timbre (brightness)</span>
        <label class="axis-pick">
          <input
            type="radio"
            name="shortAxis"
            value="timbre"
            checked={settings.shortAxis === 'timbre'}
            onchange={() => updateSettings({ shortAxis: 'timbre' })}
          />
          Axis
        </label>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.005"
        value={settings.timbre}
        disabled={settings.shortAxis === 'timbre'}
        oninput={(e) => setTone('timbre', Number(e.currentTarget.value))}
      />
      <span class="hint">
        {Math.round(timbreHzForPosition(settings.timbre))} Hz
        {#if settings.shortAxis === 'timbre'} · touch controls this{/if}
      </span>
    </div>

    <div class="tone-row" class:active={settings.shortAxis === 'harmonicMorph'}>
      <div class="tone-head">
        <span>Harmonic morph</span>
        <label class="axis-pick">
          <input
            type="radio"
            name="shortAxis"
            value="harmonicMorph"
            checked={settings.shortAxis === 'harmonicMorph'}
            onchange={() => updateSettings({ shortAxis: 'harmonicMorph' })}
          />
          Axis
        </label>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.morph}
        disabled={settings.shortAxis === 'harmonicMorph'}
        oninput={(e) => setTone('morph', Number(e.currentTarget.value))}
      />
      <span class="hint">
        {Math.round(settings.morph * 100)}% bright
        {#if settings.shortAxis === 'harmonicMorph'} · touch controls this{/if}
      </span>
    </div>

    <div class="tone-row" class:active={settings.shortAxis === 'harmony'}>
      <div class="tone-head">
        <span>Harmony</span>
        <label class="axis-pick">
          <input
            type="radio"
            name="shortAxis"
            value="harmony"
            checked={settings.shortAxis === 'harmony'}
            onchange={() => updateSettings({ shortAxis: 'harmony' })}
          />
          Axis
        </label>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.harmony}
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

    <div class="tone-row" class:active={settings.shortAxis === 'volume'}>
      <div class="tone-head">
        <span>Touch volume</span>
        <label class="axis-pick">
          <input
            type="radio"
            name="shortAxis"
            value="volume"
            checked={settings.shortAxis === 'volume'}
            onchange={() => updateSettings({ shortAxis: 'volume' })}
          />
          Axis
        </label>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.voiceLevel}
        disabled={settings.shortAxis === 'volume'}
        oninput={(e) => setTone('voiceLevel', Number(e.currentTarget.value))}
      />
      <span class="hint">
        {Math.round(settings.voiceLevel * 100)}%
        {#if settings.shortAxis === 'volume'} · touch controls this{/if}
      </span>
    </div>

    <label>
      Filter resonance: {settings.filterQ.toFixed(2)}
      <input
        type="range"
        min="0.3"
        max="3"
        step="0.05"
        value={settings.filterQ}
        oninput={(e) => setTone('filterQ', Number(e.currentTarget.value))}
      />
    </label>

    <h3>Envelope</h3>

    <label>
      Attack: {settings.attack.toFixed(3)} s
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={timeToPos(settings.attack, ATTACK_MIN, ATTACK_MAX)}
        oninput={(e) =>
          setTone('attack', posToTime(Number(e.currentTarget.value), ATTACK_MIN, ATTACK_MAX))}
      />
    </label>

    <label>
      Decay: {settings.decay.toFixed(3)} s
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={timeToPos(settings.decay, DECAY_MIN, DECAY_MAX)}
        oninput={(e) =>
          setTone('decay', posToTime(Number(e.currentTarget.value), DECAY_MIN, DECAY_MAX))}
      />
    </label>

    <label>
      Sustain: {Math.round(settings.sustain * 100)}%
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.sustain}
        oninput={(e) => setTone('sustain', Number(e.currentTarget.value))}
      />
    </label>

    <label>
      Release: {settings.release.toFixed(3)} s
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={timeToPos(settings.release, RELEASE_MIN, RELEASE_MAX)}
        oninput={(e) =>
          setTone('release', posToTime(Number(e.currentTarget.value), RELEASE_MIN, RELEASE_MAX))}
      />
    </label>

    <h3>Wave shape</h3>

    <label>
      Dark tilt: {settings.darkTilt.toFixed(2)}
      <span class="hint">higher rolls off the upper partials faster</span>
      <input
        type="range"
        min="0.3"
        max="3"
        step="0.05"
        value={settings.darkTilt}
        oninput={(e) => setTone('darkTilt', Number(e.currentTarget.value))}
      />
    </label>

    <label>
      Dark even partials: {Math.round(settings.darkEven * 100)}%
      <span class="hint">0 = hollow/odd-only, 100% = all partials</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.darkEven}
        oninput={(e) => setTone('darkEven', Number(e.currentTarget.value))}
      />
    </label>

    <label>
      Bright tilt: {settings.brightTilt.toFixed(2)}
      <input
        type="range"
        min="0.3"
        max="3"
        step="0.05"
        value={settings.brightTilt}
        oninput={(e) => setTone('brightTilt', Number(e.currentTarget.value))}
      />
    </label>

    <label>
      Bright even partials: {Math.round(settings.brightEven * 100)}%
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.brightEven}
        oninput={(e) => setTone('brightEven', Number(e.currentTarget.value))}
      />
    </label>

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

    <label>
      Octaves: {settings.octaveSpan.toFixed(1)}
      <input
        type="range"
        min="1"
        max="5"
        step="0.5"
        value={settings.octaveSpan}
        oninput={handleNumber('octaveSpan')}
      />
    </label>

    <label>
      Snap strength: {settings.snapStrength.toFixed(2)}
      <span class="hint">0 = free glide; higher corrects small errors, still free between notes</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={settings.snapStrength}
        oninput={handleNumber('snapStrength')}
      />
    </label>

    <label>
      Master volume: {Math.round(settings.volume * 100)}%
      <input
        type="range"
        min="0"
        max="1"
        step="0.02"
        value={settings.volume}
        oninput={handleNumber('volume')}
      />
    </label>

    <label>
      Reverb: {Math.round(settings.reverbAmount * 100)}%
      <input
        type="range"
        min="0"
        max="1"
        step="0.02"
        value={settings.reverbAmount}
        oninput={handleNumber('reverbAmount')}
      />
    </label>

    <label>
      Ensemble: {Math.round(settings.ensemble * 100)}%
      <span class="hint">detuned chorus; blurs the pitch</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={settings.ensemble}
        oninput={handleNumber('ensemble')}
      />
    </label>

    <label>
      Vibrato: {Math.round(settings.vibrato * 100)}%
      <span class="hint">pitch movement; softens tuning errors</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={settings.vibrato}
        oninput={handleNumber('vibrato')}
      />
    </label>

    <label>
      Scale lines: {Math.round(settings.scaleLines * 100)}%
      <span class="hint">guide lines at each scale step; 0 hides them</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={settings.scaleLines}
        oninput={handleNumber('scaleLines')}
      />
    </label>

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

    <footer class="build">
      <span>Build {formatBuildLabel(BUILD_INFO)}</span>
      <button class="update" onclick={forceUpdate}>Force update</button>
    </footer>
  </aside>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
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
    background: #151a24;
    color: #dbe6f5;
    z-index: 11;
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  h3 {
    margin: 0.35rem 0 -0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.65;
  }

  .close {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.2rem;
    cursor: pointer;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
  }

  .hint {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-row input[type='checkbox'] {
    width: 1rem;
    height: 1rem;
  }

  select,
  input[type='range'] {
    width: 100%;
  }

  select {
    padding: 0.4rem;
    border-radius: 0.4rem;
    border: 1px solid #2b3646;
    background: #1c2430;
    color: inherit;
  }

  .tone-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.6rem;
    border-radius: 0.45rem;
    border: 1px solid #2b3646;
    background: #1a2230;
  }

  .tone-row.active {
    border-color: #4a7fb5;
    background: #1d2a3a;
  }

  .tone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .axis-pick {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .axis-pick input[type='radio'] {
    width: 1rem;
    height: 1rem;
  }

  .save-preset {
    display: flex;
    gap: 0.4rem;
  }

  .save-preset input {
    flex: 1;
    min-width: 0;
    padding: 0.4rem;
    border-radius: 0.4rem;
    border: 1px solid #2b3646;
    background: #1c2430;
    color: inherit;
  }

  .save-preset button,
  .delete-preset {
    padding: 0.4rem 0.6rem;
    border-radius: 0.4rem;
    border: 1px solid #2b3646;
    background: #232d3b;
    color: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .save-preset button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .delete-preset {
    align-self: flex-start;
    color: #ffb4b4;
  }

  .song {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.6rem;
    border-radius: 0.4rem;
    border: 1px solid #2b3646;
    background: #1c2430;
  }

  .song-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .song-clear {
    align-self: flex-start;
    padding: 0.3rem 0.6rem;
    border-radius: 0.4rem;
    border: 1px solid #2b3646;
    background: #232d3b;
    color: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .error {
    font-size: 0.75rem;
    color: #ff9c9c;
  }

  input[type='file'] {
    font-size: 0.8rem;
  }

  .reset {
    margin-top: auto;
    padding: 0.5rem;
    border-radius: 0.4rem;
    border: 1px solid #2b3646;
    background: #1c2430;
    color: inherit;
    cursor: pointer;
  }

  .build {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: #7d8ea6;
  }

  .update {
    padding: 0.35rem 0.6rem;
    border-radius: 0.4rem;
    border: 1px solid #2b3646;
    background: #1c2430;
    color: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }
</style>
