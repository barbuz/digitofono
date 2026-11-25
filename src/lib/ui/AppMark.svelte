<script lang="ts">
  let { size = 26 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="digitofono">
  <defs>
    <mask id="digitofono-node">
      <rect width="64" height="64" fill="#fff" />
      <circle cx="32" cy="32" r="8.5" fill="#000" />
    </mask>
  </defs>
  <rect width="64" height="64" rx="14" fill="var(--bg)" />
  <g mask="url(#digitofono-node)">
    <path d="M32 9V55" stroke="var(--text)" stroke-width="4" stroke-linecap="round" />
    <path d="M24 17H40M24 47H40" stroke="var(--text)" stroke-width="3" stroke-linecap="round" opacity="0.55" />
  </g>
  <circle cx="32" cy="32" r="6.5" fill="none" stroke="var(--accent)" stroke-width="3.5" />
</svg>
