import type { SocketStatus } from '../socket/useSocket';

// Three dots: how sure the suggestion is. Never a percentage.
export function confidenceDots(confidence: number): 1 | 2 | 3 {
  if (confidence >= 0.85) return 3;
  if (confidence >= 0.65) return 2;
  return 1;
}

// The one line shown when something is wrong, most important first. null when all is well.
export function statusLine(s: {
  connection: SocketStatus;
  guesserDown: boolean;
  // Why the guesser is down, when the server knows: a refused key, or a busy service.
  guesserReason?: 'key' | 'busy' | undefined;
}): string | null {
  if (s.connection === 'other-tab')
    return 'Another tab is already listening. Close it to listen here.';
  if (s.connection === 'reconnecting') return 'Not connected. Reconnecting…';
  if (s.guesserDown) {
    if (s.guesserReason === 'key')
      return 'Your Anthropic key isn\u2019t working. Check it in Settings.';
    if (s.guesserReason === 'busy')
      return 'Suggestions paused for a moment; the AI service is busy.';
    return 'Suggestions are unavailable right now. Listening continues.';
  }
  return null;
}
