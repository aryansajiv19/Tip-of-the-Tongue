const STORAGE_KEY = 'tott.debug';

// Debug is off unless the user turned it on in Settings.
export function savedDebug(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDebug(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the switch still works for this visit.
  }
}
