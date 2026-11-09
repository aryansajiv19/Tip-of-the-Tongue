import type { ServerEvent } from '../../../server/src/events';

// A word offered during this conversation, and whether the user took it.
export interface RecentWord {
  word: string;
  accepted: boolean;
}

const MAX_RECENT = 30;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Newest first. Offered words are listed once; accepting one marks it.
export function recentWords(list: RecentWord[], event: ServerEvent): RecentWord[] {
  if (event.type === 'guess.offered') {
    const fresh = event.candidates
      .map((c) => c.word)
      .filter((w, i, all) => all.findIndex((x) => same(x, w)) === i)
      .map((word) => ({ word, accepted: list.some((r) => same(r.word, word) && r.accepted) }));
    const kept = list.filter((r) => !fresh.some((f) => same(f.word, r.word)));
    return [...fresh, ...kept].slice(0, MAX_RECENT);
  }
  if (event.type === 'guess.accepted') {
    const rest = list.filter((r) => !same(r.word, event.word));
    return [{ word: event.word, accepted: true }, ...rest].slice(0, MAX_RECENT);
  }
  return list;
}
