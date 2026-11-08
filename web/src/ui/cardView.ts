import type { SocketStatus } from '../socket/useSocket';

// Three dots: how sure the suggestion is. Never a percentage.
export function confidenceDots(confidence: number): 1 | 2 | 3 {
  if (confidence >= 0.85) return 3;
  if (confidence >= 0.65) return 2;
  return 1;
}

// The one line shown when something is wrong, most important first. null when all is well.
export function statusLine(s: {
  micError: string | null;
  connection: SocketStatus;
  guesserDown: boolean;
}): string | null {
  if (s.micError) return s.micError;
  if (s.connection === 'reconnecting') return 'Not connected. Reconnecting…';
  if (s.guesserDown) return 'Suggestions are unavailable right now. Listening continues.';
  return null;
}
