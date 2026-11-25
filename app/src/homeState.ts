// What the app window may receive from the overlay, and send back. Pure, so it can be tested
// without Electron. A bad message from a page is dropped (undefined), never half-applied.
export interface RecentWord {
  word: string;
  accepted: boolean;
  at: number;
}

const MAX_RECENT = 30;
const MAX_WORD = 100;

export function parseRecent(payload: unknown): RecentWord[] | undefined {
  if (!Array.isArray(payload) || payload.length > MAX_RECENT) return undefined;
  const ok = payload.every((r: unknown) => {
    const { word, accepted, at } = (r ?? {}) as Partial<Record<keyof RecentWord, unknown>>;
    return (
      typeof word === 'string' &&
      word.length > 0 &&
      word.length <= MAX_WORD &&
      typeof accepted === 'boolean' &&
      typeof at === 'number' &&
      Number.isFinite(at)
    );
  });
  return ok
    ? payload.map(({ word, accepted, at }: RecentWord) => ({ word, accepted, at }))
    : undefined;
}

export const HOME_COMMANDS = ['toggle-listening', 'new-conversation', 'show-overlay'] as const;
export type HomeCommand = (typeof HOME_COMMANDS)[number];

export const parseHomeCommand = (payload: unknown): HomeCommand | undefined =>
  HOME_COMMANDS.find((c) => c === payload);
