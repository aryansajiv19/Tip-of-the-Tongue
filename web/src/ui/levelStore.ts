// The latest microphone level, read by the waveform. A tiny external store so a 20-a-second
// update redraws only the waveform, not the whole page.
let level = 0;
const listeners = new Set<() => void>();

export const levelStore = {
  set(next: number) {
    if (next === level) return;
    level = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => level,
};
