import type { ClientEvent } from '../../../server/src/events';
import { MAX_TEXT_CHARS, clean, parseWords } from './aboutYou';
import type { Pack } from '../skills/packs';

// Skills: topic packs (built in) and the user's own, kept on this device. The server takes at most
// 5 at once (server/src/events.ts); the page keeps its own skills to 60 words each.
export const MAX_ACTIVE = 5;
export const MAX_CUSTOM_TERMS = 60;
export const MAX_DESCRIPTION_CHARS = 300;
const STORAGE_KEY = 'tott.skills';

export interface CustomSkill {
  id: string;
  name: string;
  description: string;
  // As typed: one word or phrase per line, or separated by commas.
  terms: string;
}

export interface SkillsState {
  // Ids of the built-in packs that are on.
  packs: string[];
  custom: CustomSkill[];
}

export const emptySkills: SkillsState = { packs: [], custom: [] };

export const activeCount = (s: SkillsState) => s.packs.length + s.custom.length;
export const isEmpty = (s: SkillsState) => activeCount(s) === 0;
export const isFull = (s: SkillsState) => activeCount(s) >= MAX_ACTIVE;

// The event for the server: packs first (their hint is the description), then the user's own. A
// skill without a name is skipped.
export function skillsEvent(s: SkillsState, packs: Pack[]): ClientEvent {
  const fromPacks = packs
    .filter((p) => s.packs.includes(p.id))
    .map((p) => ({ name: p.name, description: p.hint, terms: p.terms }));
  const own = s.custom.flatMap((c) => {
    const name = clean(c.name).slice(0, MAX_TEXT_CHARS);
    const description = clean(c.description).slice(0, MAX_DESCRIPTION_CHARS);
    return name
      ? [
          {
            name,
            ...(description ? { description } : {}),
            terms: parseWords(c.terms, MAX_CUSTOM_TERMS),
          },
        ]
      : [];
  });
  return { type: 'session.skills', skills: [...fromPacks, ...own].slice(0, MAX_ACTIVE) };
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function load(storage: Store | null): SkillsState {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return emptySkills;
    const { packs, custom } = raw as { packs?: unknown; custom?: unknown };
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    const state: SkillsState = {
      packs: Array.isArray(packs) ? packs.filter((p): p is string => typeof p === 'string') : [],
      custom: Array.isArray(custom)
        ? custom.flatMap((c: Partial<CustomSkill> | null) =>
            c && typeof c.id === 'string' && text(c.name, MAX_TEXT_CHARS)
              ? [
                  {
                    id: c.id,
                    name: text(c.name, MAX_TEXT_CHARS),
                    description: text(c.description, MAX_DESCRIPTION_CHARS),
                    terms: text(c.terms, 5000),
                  },
                ]
              : [],
          )
        : [],
    };
    // Never more than the server takes, whatever was stored.
    return {
      packs: state.packs.slice(0, MAX_ACTIVE),
      custom: state.custom.slice(0, MAX_ACTIVE - Math.min(state.packs.length, MAX_ACTIVE)),
    };
  } catch {
    return emptySkills;
  }
}

// Same shape as createAboutYou: a subscribe/snapshot pair, every change saved at once.
export function createSkills(storage: Store | null) {
  let state = load(storage);
  const listeners = new Set<() => void>();
  const set = (next: SkillsState) => {
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
    // Turning a pack on does nothing when 5 skills are already on.
    setPack: (id: string, on: boolean) => {
      const has = state.packs.includes(id);
      if (on && !has && !isFull(state)) set({ ...state, packs: [...state.packs, id] });
      else if (!on && has) set({ ...state, packs: state.packs.filter((p) => p !== id) });
    },
    // A new skill (no id yet) needs room; one that already exists is replaced in place.
    saveCustom: (skill: Omit<CustomSkill, 'id'> & { id?: string }) => {
      if (!clean(skill.name)) return;
      const existing = state.custom.some((c) => c.id === skill.id);
      if (!existing && isFull(state)) return;
      const next = { ...skill, id: skill.id ?? crypto.randomUUID(), name: clean(skill.name) };
      set({
        ...state,
        custom: existing
          ? state.custom.map((c) => (c.id === next.id ? next : c))
          : [...state.custom, next],
      });
    },
    removeCustom: (id: string) =>
      set({ ...state, custom: state.custom.filter((c) => c.id !== id) }),
    forgetAll: () => set(emptySkills),
  };
}

function browserStorage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export const skills = createSkills(browserStorage());
