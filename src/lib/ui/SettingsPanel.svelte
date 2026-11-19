<script lang="ts">
  import { PRESETS, PRESET_IDS } from '../audio/presets';
  import { SCALE_IDS, SCALE_LABELS } from '../mapping/scales';
  import { SHORT_AXIS_IDS, SHORT_AXIS_LABELS } from '../mapping/shortAxis';
  import { HARMONY_VOICING_IDS, HARMONY_VOICING_LABELS } from '../mapping/harmony';
  import { NOTE_NAMES, midiToNoteName } from '../mapping/pitch';
  import { updateSettings, resetSettings } from '../state/settings';
  import { clearSongScale, setSongScale } from '../state/songScale';
  import { SongAnalyser } from '../input/songFile';
  import { BUILD_INFO, formatBuildLabel } from '../version';
  import type { Settings } from '../state/schema';
  import type { ScaleId } from '../mapping/scales';
  import type { ShortAxisId } from '../mapping/shortAxis';
  import type { HarmonyVoicing } from '../mapping/harmony';
  import type { PresetId } from '../state/schema';
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

  function handleNumber(field: 'baseMidi' | 'octaveSpan' | 'snapStrength' | 'volume' | 'reverbAmount' | 'ensemble' | 'vibrato' | 'scaleLines') {
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
      <select
        value={settings.preset}
        onchange={(e) => updateSettings({ preset: (e.currentTarget.value as PresetId) })}
      >
        {#each PRESET_IDS as id}
          <option value={id}>{PRESETS[id].name}</option>
        {/each}
      </select>
    </label>

    <label>
      Short axis
      <select
        value={settings.shortAxis}
        onchange={(e) =>
          updateSettings({ shortAxis: (e.currentTarget.value as ShortAxisId) })}
      >
        {#each SHORT_AXIS_IDS as id}
          <option value={id}>{SHORT_AXIS_LABELS[id]}</option>
        {/each}
      </select>
    </label>

    {#if settings.shortAxis === 'harmony'}
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
    {/if}

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
      Volume: {Math.round(settings.volume * 100)}%
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
