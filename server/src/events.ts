// The WebSocket contract between web and server. Times are epoch milliseconds.
import { z } from 'zod';

// Caps keep one message small; the socket also has a byte limit (see app.ts).
export const MAX_WORDS_PER_EVENT = 300;

// The languages the user can speak in (Deepgram's codes; "multi" follows a mix of languages).
export const LANGUAGES = ['en', 'multi', 'es', 'fr', 'de', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];
// "About you": how many words, and how long a word or a name can be. The page keeps to the same.
export const MAX_PROFILE_WORDS = 100;
export const MAX_PROFILE_WORD_CHARS = 40;
// No control, format or line-break characters: these words go into a prompt.
const ProfileText = z
  .string()
  .max(80)
  .regex(/^[^\p{C}\p{Zl}\p{Zp}]*$/u);
const ProfileWord = z
  .string()
  .min(1)
  .max(MAX_PROFILE_WORD_CHARS)
  .regex(/^[^\p{C}\p{Zl}\p{Zp}]+$/u);

const WordSchema = z.object({
  text: z.string().min(1).max(100),
  startMs: z.number().finite(),
  endMs: z.number().finite(),
  // STT confidence 0..1, when the provider gives one.
  confidence: z.number().min(0).max(1).optional(),
  // Which voice said it (0, 1, ...), when speech-to-text separates speakers. Labels can change.
  speaker: z.number().int().min(0).max(31).optional(),
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
  // `source` is the file the text came from, when it came from one.
  z.object({
    type: z.literal('session.brief'),
    text: z.string().max(50_000),
    source: z.string().max(200).optional(),
  }),
  // "About you" from the page: personal words for the guesser and the speech recogniser. Words
  // are plain text without control characters; all sizes are capped. Replaces the previous one.
  z.object({
    type: z.literal('session.profile'),
    name: ProfileText.optional(),
    role: ProfileText.optional(),
    words: z.array(ProfileWord).max(MAX_PROFILE_WORDS),
    remembered: z.array(ProfileWord).max(MAX_PROFILE_WORDS),
  }),
  // How the user wants to be helped. 'ask': suggestions only when they ask (Cmd/Ctrl+Enter) or say
  // a cue such as "what's it called", never after a mere pause. 'sound' and 'word' only differ in
  // what the page shows (the first sound, or the whole word), so the server treats them alike.
  z.object({ type: z.literal('session.help'), level: z.enum(['ask', 'sound', 'word']) }),
  // The user clicked a suggested word. Counts like saying it.
  z.object({
    type: z.literal('guess.picked'),
    id: z.string().max(64),
    word: z.string().min(1).max(100),
  }),
  // Turns the developer debug stream on or off for this connection. Off by default.
  z.object({ type: z.literal('session.debug'), on: z.boolean() }),
  // How long the user pauses before we look for a word (slower speakers need longer), in ms.
  // minConfidence: how sure a guess must be before it is offered (0.3 to 0.9).
  // language: what the user speaks; "multi" is for switching between languages mid-sentence.
  // Every field is optional: the page sends only what it has.
  z.object({
    type: z.literal('session.settings'),
    pauseMs: z.number().min(800).max(5000).optional(),
    minConfidence: z.number().min(0.3).max(0.9).optional(),
    language: z.enum(LANGUAGES).optional(),
  }),
  // The microphone level crossed into (voiced) or out of (silent) speech-like sound. Sent only
  // on changes; atMs is when the change began. Lets the server tell a real silence from an
  // STT lag, and hear a hum that speech recognition drops.
  z.object({ type: z.literal('voice.activity'), voiced: z.boolean(), atMs: z.number().finite() }),
  // The user asks for a suggestion now (Space key), without waiting for a pause.
  z.object({ type: z.literal('stuck.manual') }),
  // A new conversation: forget what was heard and any suggestion in progress. The brief and
  // settings stay.
  z.object({ type: z.literal('session.reset') }),
]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export type StuckReason = 'pause' | 'filler' | 'describing' | 'hum' | 'manual';

export interface Candidate {
  word: string;
  confidence: number;
  // The few words likely to come next, when the sentence clearly goes on and they are predictable
  // (at most 40 characters and 4 words, and only on a candidate of 0.8 or more). Shown after the word; accepting still means `word` only.
  continuation?: string;
  // The name of the loaded document the word appears in, when it does.
  source?: string;
}

// What the server reports while debug is on: what it heard, what the detector decided, each
// guesser call, each gate decision, and how speech-to-text is set up. Contains what was said.
export type DebugInfo =
  // The pause that counts as a stall for how this user talks (the setting scaled to their pace).
  | { kind: 'pace'; pauseMs: number }
  | { kind: 'transcript'; final: boolean; text: string }
  | { kind: 'detector'; stuck: boolean; reason?: StuckReason; silenceMs: number; sinceMs?: number }
  | {
      kind: 'guess';
      // Started early, before the stall was confirmed.
      speculative: boolean;
      // The speaker went on (or the session ended) before it was used.
      stale: boolean;
      candidates: Candidate[];
      abstain: boolean;
      error: boolean;
      latencyMs: number;
    }
  | { kind: 'gate'; offered: boolean; reason?: string; words?: string[] }
  | { kind: 'stt'; mode: 'deepgram' | 'browser'; keyterms: string[] }
  // Which voice is taken to be the user's, and why it changed.
  | {
      kind: 'speaker';
      me: number | undefined;
      why: 'first words' | 'accepted' | 'manual' | 'new stream' | 'new conversation';
    };

// Sent by the server. `id` ties an offer to its later withdrawn/accepted/expired event.
export type ServerEvent =
  // Sent on connect, and again with 'browser' if server-side speech-to-text fails.
  // 'deepgram': the browser streams raw audio as binary frames (16 kHz mono 16-bit PCM).
  // 'browser': the browser runs its own speech recognition and sends transcript events.
  // Every 15 s, so the page can tell a dead connection from a quiet one.
  | { type: 'heartbeat' }
  | { type: 'session.ready'; stt: 'deepgram' | 'browser'; guesser: 'claude' | 'mock' }
  // Server-side transcript (Deepgram only), so the page can show what was heard.
  | { type: 'transcript.partial' | 'transcript.final'; words: Word[] }
  | { type: 'stuck.detected'; reason: StuckReason; contextWindow: string }
  | { type: 'guess.offered'; id: string; candidates: Candidate[]; latencyMs: number }
  | { type: 'guess.withdrawn'; id: string; reason: 'self-recovered' | 'timeout' }
  | { type: 'guess.accepted'; id: string; word: string; afterMs: number }
  | { type: 'guess.expired'; id: string }
  // A stall was confirmed but no suggestion followed (not confident enough, or the speaker went
  // on): whatever the page shows for "looking for the word" can stop.
  | { type: 'guess.idle' }
  // Answers session.reset. Everything the server sent before this belongs to the old
  // conversation; the page ignores it.
  | { type: 'session.cleared' }
  // The guesser is failing (ok: false) or working again (ok: true). Sent only on a change.
  // reason: 'key' = the API key was refused (401/403), 'busy' = rate limited or overloaded.
  | { type: 'guesser.status'; ok: boolean; reason?: 'key' | 'busy' }
  // The key terms of the loaded brief (at most 60), sent when they are ready and again if the
  // list changes. Empty when the brief is cleared.
  | { type: 'brief.terms'; terms: string[] }
  // Only while the client has turned debug on.
  | { type: 'debug'; atMs: number; info: DebugInfo };
