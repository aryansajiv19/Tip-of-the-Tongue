// The WebSocket contract between web and server. Times are epoch milliseconds.
import { z } from 'zod';

// Caps keep one message small; the socket also has a byte limit (see app.ts).
export const MAX_WORDS_PER_EVENT = 300;

const WordSchema = z.object({
  text: z.string().min(1).max(100),
  startMs: z.number().finite(),
  endMs: z.number().finite(),
  // STT confidence 0..1, when the provider gives one.
  confidence: z.number().min(0).max(1).optional(),
});
export type Word = z.infer<typeof WordSchema>;

// Sent by the browser. Partial = the utterance so far (replaces the previous partial);
// final = the utterance is complete and its words are fixed.
export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('transcript.partial'),
    words: z.array(WordSchema).max(MAX_WORDS_PER_EVENT),
  }),
  z.object({
    type: z.literal('transcript.final'),
    words: z.array(WordSchema).max(MAX_WORDS_PER_EVENT),
  }),
  // Optional meeting brief: agenda, names, terms. Plain text.
  z.object({ type: z.literal('session.brief'), text: z.string().max(50_000) }),
  // The user clicked a suggested word. Counts like saying it.
  z.object({
    type: z.literal('guess.picked'),
    id: z.string().max(64),
    word: z.string().min(1).max(100),
  }),
  // How long the user pauses before we look for a word (slower speakers need longer), in ms.
  z.object({ type: z.literal('session.settings'), pauseMs: z.number().min(800).max(5000) }),
  // The microphone level crossed into (voiced) or out of (silent) speech-like sound. Sent only
  // on changes; atMs is when the change began. Lets the server tell a real silence from an
  // STT lag, and hear a hum that speech recognition drops.
  z.object({ type: z.literal('voice.activity'), voiced: z.boolean(), atMs: z.number().finite() }),
  // The user asks for a suggestion now (Space key), without waiting for a pause.
  z.object({ type: z.literal('stuck.manual') }),
]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export type StuckReason = 'pause' | 'filler' | 'describing' | 'hum' | 'manual';

export interface Candidate {
  word: string;
  confidence: number;
}

// Sent by the server. `id` ties an offer to its later withdrawn/accepted/expired event.
export type ServerEvent =
  // Sent on connect, and again with 'browser' if server-side speech-to-text fails.
  // 'deepgram': the browser streams raw audio as binary frames (16 kHz mono 16-bit PCM).
  // 'browser': the browser runs its own speech recognition and sends transcript events.
  | { type: 'session.ready'; stt: 'deepgram' | 'browser' }
  // Server-side transcript (Deepgram only), so the page can show what was heard.
  | { type: 'transcript.partial' | 'transcript.final'; words: Word[] }
  | { type: 'stuck.detected'; reason: StuckReason; contextWindow: string }
  | { type: 'guess.offered'; id: string; candidates: Candidate[]; latencyMs: number }
  | { type: 'guess.withdrawn'; id: string; reason: 'self-recovered' | 'timeout' }
  | { type: 'guess.accepted'; id: string; word: string; afterMs: number }
  | { type: 'guess.expired'; id: string }
  // The guesser is failing (ok: false) or working again (ok: true). Sent only on a change.
  | { type: 'guesser.status'; ok: boolean };
