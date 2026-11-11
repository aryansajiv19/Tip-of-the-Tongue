import { z } from 'zod';
import type { Candidate } from '../events.js';

const MAX_CANDIDATES = 3;
// A word or a short name. Anything longer is the model rambling, and would not fit the pop-up.
const MAX_WORD_CHARS = 60;
// The words that may follow the guess: a short phrase, never a sentence.
const MAX_CONTINUATION_CHARS = 40;
const MAX_CONTINUATION_WORDS = 5;
const abstain = (): { candidates: Candidate[]; abstain: boolean } => ({
  candidates: [],
  abstain: true,
});

// Models sometimes send confidence as a string ("0.8"); accept that, reject anything non-numeric.
const CandidateSchema = z.object({
  word: z.string().trim().min(1).max(MAX_WORD_CHARS),
  confidence: z.union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())]),
  // Anything that is not a short phrase is dropped; the word itself is still good.
  continuation: z
    .string()
    .trim()
    .max(MAX_CONTINUATION_CHARS)
    .refine((t) => t.split(/\s+/).length <= MAX_CONTINUATION_WORDS)
    .optional()
    .catch(undefined),
});
const ReplySchema = z.object({
  candidates: z.array(z.unknown()).default([]),
  abstain: z.boolean().default(false),
});

// Pulls the first {...} span out of the text, which skips code fences and surrounding prose.
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

// Index just past the first complete {...} object in a growing text, or undefined while it is
// still open. Lets the caller stop reading a stream as soon as the JSON closes.
export function firstObjectEnd(text: string): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = text.indexOf('{'); i !== -1 && i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return undefined;
}

export function parseGuess(text: string): { candidates: Candidate[]; abstain: boolean } {
  const reply = ReplySchema.safeParse(extractJson(text));
  if (!reply.success || reply.data.abstain) return abstain();

  const valid: Candidate[] = [];
  for (const raw of reply.data.candidates) {
    const item = CandidateSchema.safeParse(raw);
    if (!item.success || !Number.isFinite(item.data.confidence)) continue;
    valid.push({
      word: item.data.word,
      confidence: Math.min(1, Math.max(0, item.data.confidence)),
      ...(item.data.continuation ? { continuation: item.data.continuation } : {}),
    });
  }

  valid.sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<string>();
  const candidates = valid
    .filter((c) => {
      const key = c.word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES);

  return candidates.length === 0 ? abstain() : { candidates, abstain: false };
}
