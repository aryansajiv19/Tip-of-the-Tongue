const STORAGE_KEY = 'tott.micId';

// The microphone the user picked, or null for the system default.
export function savedMicId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveMicId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the choice still works for this visit.
  }
}

export interface MicOption {
  id: string;
  label: string;
}

// The choices for the microphone list: inputs only, the browser's "default" and "communications"
// aliases left out (the first entry already means the system default), and a name for devices
// whose label is hidden until the user has allowed the microphone.
export function micOptions(
  devices: readonly Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>[],
) {
  const inputs = devices.filter(
    (d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications',
  );
  return inputs.map((d, i): MicOption => ({
    id: d.deviceId,
    label: d.label || `Microphone ${i + 1}`,
  }));
}
