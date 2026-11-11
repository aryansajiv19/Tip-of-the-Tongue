import type { ClientEvent } from '../../../server/src/events';

// "About you": who the user is and the words they need, kept on this device only. The limits match
// the server's (server/src/events.ts), which rejects anything larger.
export const MAX_WORDS = 100;
export const MAX_WORD_CHARS = 40;
export const MAX_TEXT_CHARS = 80;
const STORAGE_KEY = 'tott.aboutYou';

export interface About {
  name: string;
  role: string;
  // As typed: one word or phrase per line, or separated by commas.
  words: string;
}

export interface AboutState {
  about: About;
  // Words the user accepted in earlier meetings (the words only, never what was said), oldest first.
  remembered: string[];
}

export const emptyAbout: AboutState = { about: { name: '', role: '', words: '' }, remembered: [] };

// Control and line-break characters become spaces: the server refuses them.
export const clean = (text: string) =>
  text
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasWord = (list: string[], word: string) =>
  list.some((w) => w.toLowerCase() === word.toLowerCase());

// "Northwind, SOC 2" or one per line, to a clean list: no blanks, no repeats (ignoring case), no
// word over the limit, at most `max` (MAX_WORDS unless told otherwise).
export function parseWords(text: string, max = MAX_WORDS): string[] {
  const out: string[] = [];
  for (const piece of text.split(/[\n,;]/)) {
    const word = clean(piece);
    if (word && word.length <= MAX_WORD_CHARS && !hasWord(out, word)) out.push(word);
    if (out.length === max) break;
  }
  return out;
}

// Add an accepted word as the newest; the oldest go once there are more than MAX_WORDS.
export function rememberWord(list: string[], raw: string): string[] {
  const word = clean(raw);
  if (!word || word.length > MAX_WORD_CHARS) return list;
  return [...list.filter((w) => w.toLowerCase() !== word.toLowerCase()), word].slice(-MAX_WORDS);
}

export const isEmpty = (s: AboutState) =>
  !s.about.name.trim() &&
  !s.about.role.trim() &&
  parseWords(s.about.words).length === 0 &&
  s.remembered.length === 0;

export function profileEvent(s: AboutState): ClientEvent {
  const name = clean(s.about.name).slice(0, MAX_TEXT_CHARS);
  const role = clean(s.about.role).slice(0, MAX_TEXT_CHARS);
  return {
    type: 'session.profile',
    ...(name ? { name } : {}),
    ...(role ? { role } : {}),
    words: parseWords(s.about.words),
    remembered: s.remembered,
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function load(storage: Store | null): AboutState {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return emptyAbout;
    const { about, remembered } = raw as { about?: Partial<About>; remembered?: unknown };
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    return {
      about: {
        name: text(about?.name, MAX_TEXT_CHARS),
        role: text(about?.role, MAX_TEXT_CHARS),
        words: text(about?.words, 5000),
      },
      remembered: Array.isArray(remembered)
        ? remembered.filter((w): w is string => typeof w === 'string').reduce(rememberWord, [])
        : [],
    };
  } catch {
    return emptyAbout;
  }
}

// The saved state with a subscribe/snapshot pair, for useSyncExternalStore. Every change is saved
// at once. A storage that is missing or full (private mode) still works for this visit.
export function createAboutYou(storage: Store | null) {
  let state = load(storage);
  const listeners = new Set<() => void>();
  const set = (next: AboutState) => {
    state = next;
    try {
      if (isEmpty(next)) storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not saved; the change still applies to this visit.
    }
    listeners.forEach((l) => l());
  };
  return {
    snapshot: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setAbout: (patch: Partial<About>) => set({ ...state, about: { ...state.about, ...patch } }),
    remember: (word: string) => {
      const remembered = rememberWord(state.remembered, word);
      if (remembered.join('\n') !== state.remembered.join('\n')) set({ ...state, remembered });
    },
    forget: () => set({ ...state, remembered: [] }),
    removeRemembered: (word: string) => {
      const remembered = state.remembered.filter((w) => w !== word);
      if (remembered.length !== state.remembered.length) set({ ...state, remembered });
    },
    clearAbout: () => set({ ...state, about: emptyAbout.about }),
    forgetAll: () => set(emptyAbout),
  };
}

function browserStorage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export const aboutYou = createAboutYou(browserStorage());
