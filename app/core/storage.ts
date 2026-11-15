/**
 * Small preferences kept in the browser. Storage can be unavailable (private mode, blocked
 * site data): reads then answer null and writes are dropped, and the app goes on without it.
 */

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The value still applies to this page; it just is not remembered.
  }
}

export function removePreference(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to remove from a storage that cannot be reached.
  }
}
