// The WebSocket contract between web and server. Times are epoch milliseconds.
import { z } from 'zod';

export const WordSchema = z.object({
  text: z.string().min(1),
  startMs: z.number(),
  endMs: z.number(),
  // STT confidence 0..1, when the provider gives one.
  confidence: z.number().min(0).max(1).optional(),
});
export type Word = z.infer<typeof WordSchema>;

// Sent by the browser. Partial = the utterance so far (replaces the previous partial);
// final = the utterance is complete and its words are fixed.
export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transcript.partial'), words: z.array(WordSchema) }),
  z.object({ type: z.literal('transcript.final'), words: z.array(WordSchema) }),
  // Optional meeting brief: agenda, names, terms. Plain text.
  z.object({ type: z.literal('session.brief'), text: z.string().max(5000) }),
]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export type StuckReason = 'pause' | 'filler' | 'describing';

export interface Candidate {
  word: string;
  confidence: number;
}

// Sent by the server. `id` ties an offer to its later withdrawn/accepted/expired event.
export type ServerEvent =
  | { type: 'stuck.detected'; reason: StuckReason; contextWindow: string }
  | { type: 'guess.offered'; id: string; candidates: Candidate[]; latencyMs: number }
  | { type: 'guess.withdrawn'; id: string; reason: 'self-recovered' | 'timeout' }
  | { type: 'guess.accepted'; id: string; word: string; afterMs: number }
  | { type: 'guess.expired'; id: string };
