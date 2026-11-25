<script lang="ts">
  let { size = 26 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="digitofono">
  <defs>
    <radialGradient id="digitofono-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8cc8ff" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#8cc8ff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="var(--bg)" />
  <circle cx="32" cy="32" r="22" fill="url(#digitofono-glow)" />
  <circle cx="32" cy="32" r="9" fill="#8cc8ff" />
</svg>
