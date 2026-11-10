export interface BuildInfo {
  /** package.json version at build time. */
  version: string;
  /** Short git commit the bundle was built from. */
  sha: string;
  /** ISO timestamp of the build. */
  time: string;
}

declare const __BUILD_INFO__: BuildInfo;

/**
 * Build stamp injected by Vite at compile time and shown in the settings panel.
 * An installed PWA can keep serving a stale cached bundle with no visible sign,
 * so the running build has to be inspectable to tell "not updated yet" apart
 * from "updated but nothing changed on screen".
 */
export const BUILD_INFO: BuildInfo =
  typeof __BUILD_INFO__ === 'undefined'
    ? { version: '0.0.0', sha: 'unknown', time: new Date(0).toISOString() }
    : __BUILD_INFO__;

export function formatBuildLabel(info: BuildInfo = BUILD_INFO): string {
  return `v${info.version} · ${info.sha}`;
}
