/** Day/night theme: OS default, persisted manual override, shared face classes. */
import { get, writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'digitofono:theme';

export const THEMES: Record<string, Theme> = {
  LIGHT: 'light',
  DARK: 'dark',
};

export function isTheme(value: unknown): value is Theme {
  return value === THEMES.LIGHT || value === THEMES.DARK;
}

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? THEMES.DARK : THEMES.LIGHT;
}

export function nextTheme(theme: Theme): Theme {
  return theme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function apply(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.remove('face--barbuz', 'face--leo');
  root.classList.add(theme === THEMES.DARK ? 'face--barbuz' : 'face--leo');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === THEMES.DARK ? '#0a0e17' : '#faf8f3');
  }
}

function persist(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

const state = writable<Theme>(resolveTheme(readStored(), systemPrefersDark()));
let initialized = false;

export const theme = {
  subscribe: state.subscribe,
  init(): void {
    if (initialized) return;
    initialized = true;
    const current = resolveTheme(readStored(), systemPrefersDark());
    apply(current);
    state.set(current);

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener?.('change', (event) => {
        if (readStored()) return;
        const next = event.matches ? THEMES.DARK : THEMES.LIGHT;
        apply(next);
        state.set(next);
      });
    }
  },
  set(value: Theme): void {
    if (!isTheme(value)) return;
    apply(value);
    state.set(value);
    persist(value);
  },
  toggle(): void {
    this.set(nextTheme(get(state)));
  },
};
