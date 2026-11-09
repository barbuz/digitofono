<script lang="ts">
  import PlaySurface from './lib/ui/PlaySurface.svelte';
  import SettingsPanel from './lib/ui/SettingsPanel.svelte';
  import { settings } from './lib/state/settings';

  let panelOpen = $state(false);
</script>

<PlaySurface settings={$settings} />

<button
  class="gear"
  aria-label="Open settings"
  onclick={() => (panelOpen = true)}
  style="top: calc(env(safe-area-inset-top) + 0.75rem)"
>
  ⚙
</button>

<SettingsPanel bind:open={panelOpen} settings={$settings} />

<style>
  .gear {
    position: fixed;
    right: calc(env(safe-area-inset-right) + 0.75rem);
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: none;
    background: rgba(140, 200, 255, 0.1);
    color: rgba(180, 215, 255, 0.85);
    font-size: 1.2rem;
    cursor: pointer;
    z-index: 5;
  }

  .gear:active {
    background: rgba(140, 200, 255, 0.2);
  }
</style>
