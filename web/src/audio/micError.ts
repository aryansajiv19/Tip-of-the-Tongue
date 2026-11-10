// What to tell the user when the microphone cannot be opened, from the error getUserMedia gave.
// NotReadableError is what Windows gives when a meeting app (Zoom, Teams) has the device in
// exclusive mode, and what any system refusing to start the device gives; macOS shares the
// microphone and rarely does.
// `blocked` is the wording for a refusal, which depends on the system (see ui/desktop.ts).
export function micErrorMessage(err: unknown, blocked: string): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return blocked;
  if (name === 'NotReadableError')
    return 'Another app may be using the microphone. Close the call or recording app, or choose a different microphone in Settings, then press Start.';
  if (name === 'NotFoundError') return 'No microphone found. Plug one in, then press Start.';
  return 'Could not start the microphone. Check that one is connected, then press Start.';
}
