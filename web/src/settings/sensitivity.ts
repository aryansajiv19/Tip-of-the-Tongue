// "How eager should it be?" as one choice instead of two numbers. Balanced matches the
// server's own defaults.
export const SENSITIVITIES = {
  calm: { label: 'Calm', pauseMs: 2500, minConfidence: 0.75 },
  balanced: { label: 'Balanced', pauseMs: 1500, minConfidence: 0.6 },
  eager: { label: 'Eager', pauseMs: 900, minConfidence: 0.45 },
} as const;

export type Sensitivity = keyof typeof SENSITIVITIES;

export const SENSITIVITY_KEYS = Object.keys(SENSITIVITIES) as Sensitivity[];

const STORAGE_KEY = 'tott.sensitivity';

export const isSensitivity = (v: unknown): v is Sensitivity =>
  typeof v === 'string' && Object.hasOwn(SENSITIVITIES, v);

// The saved choice, or null if the user never made one (then the server's defaults apply).
export function savedSensitivity(): Sensitivity | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isSensitivity(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveSensitivity(value: Sensitivity): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode: the choice still works for this visit.
  }
}

// One plain sentence for each choice, with the real pause it waits for.
export function sensitivityHint(key: Sensitivity): string {
  const secs = `${SENSITIVITIES[key].pauseMs / 1000} s`;
  if (key === 'calm') return `Speaks up after a ${secs} pause, and only when quite sure.`;
  if (key === 'eager') return `Speaks up after a ${secs} pause, even when less sure.`;
  return `Speaks up after a ${secs} pause. A good place to start.`;
}
