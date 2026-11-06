import { z } from 'zod';
import type { Candidate } from '../events.js';

const MAX_CANDIDATES = 3;
const abstain = (): { candidates: Candidate[]; abstain: boolean } => ({
  candidates: [],
  abstain: true,
});

// Models sometimes send confidence as a string ("0.8"); accept that, reject anything non-numeric.
const CandidateSchema = z.object({
  word: z.string().trim().min(1),
  confidence: z.union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())]),
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
