const STORAGE_KEY = 'tott.started';

// True until the user has pressed Start once on this device.
export function isFirstRun(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markStarted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode: the hint comes back next visit.
  }
}
