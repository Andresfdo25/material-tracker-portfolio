// persist.ts — thin localStorage wrapper. This is a real local tool, so the working
// draft, published reports, and display settings survive a page reload.
const NAMESPACE = 'material-tracker:v1:';

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(NAMESPACE + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(NAMESPACE + key, JSON.stringify(value));
  } catch {
    // storage unavailable (private browsing quota, etc.) — fail silently, state stays in-memory
  }
}

/** Drops everything this app owns and nothing else — the public demo's "start over"
 * button. Scoped by NAMESPACE rather than `localStorage.clear()` so it stays safe on a
 * host shared with other apps on the same origin. */
export function clearAll(): void {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(NAMESPACE))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // nothing to do — the reload below still gives the user a clean in-memory app
  }
}
