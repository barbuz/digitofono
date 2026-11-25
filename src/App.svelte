<script lang="ts">
  import PlaySurface from './lib/ui/PlaySurface.svelte';
  import SettingsPanel from './lib/ui/SettingsPanel.svelte';
  import { settings } from './lib/state/settings';
  import { songScale } from './lib/state/songScale';

  let panelOpen = $state(false);
</script>

<PlaySurface settings={$settings} song={$songScale.song} />

<button
  class="gear"
  aria-label="Open settings"
  onclick={() => (panelOpen = true)}
  style="top: calc(env(safe-area-inset-top) + 0.75rem)"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
    <circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="7" cy="17" r="2.2" fill="currentColor" stroke="none" />
  </svg>
</button>

<SettingsPanel bind:open={panelOpen} settings={$settings} />

<style>
  .gear {
    position: fixed;
    right: calc(env(safe-area-inset-right) + 0.75rem);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    color: var(--text);
    box-shadow: var(--shadow);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 5;
    transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  }

  .gear svg {
    width: 1.3rem;
    height: 1.3rem;
  }

  .gear:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .gear:active {
    transform: scale(0.96);
  }
</style>
