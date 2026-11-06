export const TYPED_WORD_MS = 300;

// For the no-mic test box: the phrase as growing prefixes, each with the delay
// (ms after the start) at which it would be "heard". Silence follows the last one.
export function typedSteps(phrase: string): { transcript: string; delayMs: number }[] {
  const tokens = phrase.split(/\s+/).filter(Boolean);
  return tokens.map((_, i) => ({
    transcript: tokens.slice(0, i + 1).join(' '),
    delayMs: (i + 1) * TYPED_WORD_MS,
  }));
}
