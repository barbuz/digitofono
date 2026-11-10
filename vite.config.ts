import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project sites are served from /<repo>/, so the base path must
// match or the service worker scope and asset URLs silently break.
const base = process.env.VITE_BASE ?? '/digitofono/';

function gitShortSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

// Stamped into the bundle so a device can report which build it is running.
// Without this an installed PWA serving a stale cached bundle is indistinguishable
// from one that simply has no visible change.
const buildInfo = {
  version: pkg.version,
  sha: gitShortSha(),
  time: new Date().toISOString(),
};

export default defineConfig({
  base,
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Digitofono',
        short_name: 'Digitofono',
        description: 'A streamlined touchscreen musical instrument.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
} as never);
