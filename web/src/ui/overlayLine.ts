import type { SocketStatus } from '../socket/useSocket';

export const FIRST_RUN_LINE =
  'Press play and talk. If you lose a word, pause and I\u2019ll offer up to 3.';
export const LISTENING_LINE = 'Listening. I\u2019ll only speak up when you pause on a word.';
const OFFLINE_LINE = 'Listening paused: not connected to the server, so no word suggestions';

// The one calm line under the pill. Being offline comes first, then a notice (e.g. a switch of
// speech recognition); the first-run hint shows until the user has pressed Start once.
export function overlayLine(s: {
  listening: boolean;
  connection: SocketStatus;
  notice: string;
  firstRun: boolean;
}): string {
  if (s.listening && s.connection !== 'connected') return OFFLINE_LINE;
  if (s.notice) return s.notice;
  if (s.listening) return LISTENING_LINE;
  return s.firstRun ? FIRST_RUN_LINE : '';
}

// The last few words heard, for the faint "Heard: \u2026" line. Empty when nothing was heard.
export function heardLine(words: string[], max = 6): string {
  return words.length === 0 ? '' : `Heard: ${words.slice(-max).join(' ')}`;
}
