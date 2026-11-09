# Digitofono

A streamlined touchscreen musical instrument. Tap or drag anywhere on a
near-blank surface and it sings: the long axis sets a continuous pitch, and the
short axis shapes the tone.

Play it: https://barbuz.github.io/digitofono/

The design goals and full specification live in [SPEC.md](./SPEC.md).

## Playing

- **Tap** for a short plucked note.
- **Press and drag** for a sustained tone that glides as you move.
- **Multi-touch** plays several notes at once.
- Open the gear icon for presets, scales, snap strength, and the short-axis
  assignment.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (pitch, scales, short-axis mapping)
npm run check      # svelte-check + TypeScript
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run icons      # regenerate PWA icons into public/icons
```

Requires Node 22+.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which tests, builds,
and publishes to GitHub Pages. The build uses a `/<repo>/` base path because
project Pages sites are served from a subpath; the service worker scope and
manifest `start_url` follow it automatically.

To enable, set **Settings → Pages → Source** to **GitHub Actions** once in the
repository.

## Architecture

```
src/
  lib/
    audio/    AudioEngine (master bus), Voice, waves, presets, params
    input/    Player - pointer routing and tap/hold classification
    mapping/  pitch, scales, shortAxis  (pure functions, unit-tested)
    state/    settings store and schema
    ui/       PlaySurface (canvas), SettingsPanel
```

The audio engine and the mapping layer are plain TypeScript with no framework
dependency; Svelte only renders the surface and the settings UI.
