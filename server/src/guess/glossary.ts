import Anthropic from '@anthropic-ai/sdk';
import { errorName, failureInfo, modelOptions } from './guesser.js';

// A brief longer than this is not sent whole: the guesser gets a glossary plus the start.
export const LONG_BRIEF_CHARS = 3000;
const HEAD_CHARS = 1500;
const MAX_TERMS = 60;
const MAX_TOKENS = 600;

const SYSTEM = `List the key terms from this document that someone might need to recall mid-conversation: technical terms and abbreviations, product, company and people names, and important figures. At most ${MAX_TERMS} items, comma-separated, exactly as written in the document. No explanations.`;

// Turns the model's list into one clean line: no bullets, no repeats, at most 60 terms.
export function parseGlossary(text: string): string | undefined {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const term = raw
      .trim()
      .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
    const key = term.toLowerCase();
    if (term && !seen.has(key)) {
      seen.add(key);
      terms.push(term);
    }
  }
  return terms.length === 0 ? undefined : terms.slice(0, MAX_TERMS).join(', ');
}

// What the guesser sees as the brief. Short briefs go through whole; a long document becomes its
// glossary plus the first part (the glossary alone loses the gist, the start alone loses the terms).
export function briefForGuesser(doc: string, glossary?: string): string {
  if (doc.length <= LONG_BRIEF_CHARS) return doc;
  const head = doc.slice(0, HEAD_CHARS);
  return glossary ? `Key terms: ${glossary}\n\n${head}` : head;
}

// One call per pasted document. Never throws: on any failure there is no glossary and the
// guesser falls back to the start of the document.
export type GlossaryBuilder = (doc: string) => Promise<string | undefined>;

export function createGlossaryBuilder(
  cfg: {
    apiKey?: string;
    model: string;
    timeoutMs: number;
    onFailure?: (info: { status?: number; error: string }) => void;
  },
  // Injectable so tests never touch the network.
  client?: Pick<Anthropic, 'messages'>,
): GlossaryBuilder {
  if (!cfg.apiKey && !client) return () => Promise.resolve(undefined);
  const api = client ?? new Anthropic({ apiKey: cfg.apiKey, maxRetries: 0 });
  return async (doc) => {
    try {
      const options = modelOptions(cfg.model);
      const reply = await api.messages.create(
        {
          model: cfg.model,
          ...options,
          max_tokens: Math.max(MAX_TOKENS, options.max_tokens),
          system: SYSTEM,
          messages: [{ role: 'user', content: doc }],
        },
        { timeout: cfg.timeoutMs },
      );
      return parseGlossary(reply.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
    } catch (err) {
      const { status } = failureInfo(err);
      cfg.onFailure?.({ ...(status ? { status } : {}), error: errorName(err) });
      return undefined;
    }
  };
}
