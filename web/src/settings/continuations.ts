const STORAGE_KEY = 'tott.continuations';

// "Show how to continue": off unless the user turned it on.
export function savedContinuations(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveContinuations(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the choice still works for this visit.
  }
}
