<script lang="ts">
  import { PRESETS, PRESET_IDS } from '../audio/presets';
  import { SCALE_IDS, SCALE_LABELS } from '../mapping/scales';
  import { SHORT_AXIS_IDS, SHORT_AXIS_LABELS } from '../mapping/shortAxis';
  import { NOTE_NAMES } from '../mapping/pitch';
  import { updateSettings, resetSettings } from '../state/settings';
  import type { Settings } from '../state/schema';
  import type { ScaleId } from '../mapping/scales';
  import type { ShortAxisId } from '../mapping/shortAxis';
  import type { PresetId } from '../state/schema';

  let { settings, open = $bindable(false) }: { settings: Settings; open?: boolean } = $props();

  const baseNoteOptions = Array.from({ length: 5 }, (_, octave) =>
    NOTE_NAMES.map((name, pc) => ({
      midi: (octave + 1) * 12 + pc,
      label: `${name}${octave}`,
    })),
  ).flat();

  function handleNumber(field: 'baseMidi' | 'octaveSpan' | 'snapStrength' | 'volume' | 'reverbAmount' | 'polyphony') {
    return (event: Event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      updateSettings({ [field]: value });
    };
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
      <span class="hint">0 = free glide</span>
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
      Polyphony: {settings.polyphony}
      <input
        type="range"
        min="1"
        max="16"
        step="1"
        value={settings.polyphony}
        oninput={handleNumber('polyphony')}
      />
    </label>

    <label class="checkbox">
      <input
        type="checkbox"
        checked={settings.haptics}
        onchange={(e) => updateSettings({ haptics: e.currentTarget.checked })}
      />
      Haptics
    </label>

    <button class="reset" onclick={resetSettings}>Reset to defaults</button>
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

  .checkbox {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .checkbox input {
    width: auto;
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
</style>
