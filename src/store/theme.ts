// theme.ts — light/dark appearance, persisted in localStorage and applied as a
// data-theme attribute on <html> (colors.css overrides the palette for dark).
export type Theme = 'light' | 'dark';
const KEY = 'material-tracker:v1:theme';

export function getTheme(): Theme {
  try {
    return window.localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t);
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    // storage unavailable — theme stays for this session only
  }
}

/** Called once at startup (main.tsx) before render to avoid a flash. */
export function initTheme(): void {
  document.documentElement.setAttribute('data-theme', getTheme());
}
