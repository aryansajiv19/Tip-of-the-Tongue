import { describe, expect, it, vi } from 'vitest';
import {
  MAX_WORDS,
  createAboutYou,
  isEmpty,
  emptyAbout,
  parseWords,
  profileEvent,
  rememberWord,
} from './aboutYou';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void Reflect.deleteProperty(data, k),
  };
}

describe('parseWords', () => {
  it('splits on commas, semicolons and lines, trimming and skipping blanks', () => {
    expect(parseWords('Northwind, SOC 2\n\n  heparin ;Okafor,, ')).toEqual([
      'Northwind',
      'SOC 2',
      'heparin',
      'Okafor',
    ]);
  });

  it('drops repeats whatever their case, and words over 40 characters', () => {
    expect(parseWords('ARR, arr, Arr\n' + 'x'.repeat(41) + '\n' + 'y'.repeat(40))).toEqual([
      'ARR',
      'y'.repeat(40),
    ]);
  });

  it('strips control characters rather than sending them', () => {
    expect(parseWords('a\u0000b, c d\te')).toEqual(['a b', 'c d e']);
  });

  it('keeps at most 100', () => {
    const many = Array.from({ length: 250 }, (_, i) => `w${i}`).join(',');
    const out = parseWords(many);
    expect(out).toHaveLength(MAX_WORDS);
    expect(out[0]).toBe('w0');
  });
});

describe('rememberWord', () => {
  it('adds the newest last', () => {
    expect(rememberWord(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('moves a repeat (any case) to the newest place instead of doubling it', () => {
    expect(rememberWord(['a', 'B', 'c'], 'b')).toEqual(['a', 'c', 'b']);
  });

  it('drops the oldest beyond 100', () => {
    let list: string[] = [];
    for (let i = 0; i < 130; i++) list = rememberWord(list, `w${i}`);
    expect(list).toHaveLength(100);
    expect(list[0]).toBe('w30');
    expect(list.at(-1)).toBe('w129');
  });

  it('ignores blanks and words that are too long, returning the same list', () => {
    const list = ['a'];
    expect(rememberWord(list, '   ')).toBe(list);
    expect(rememberWord(list, 'x'.repeat(41))).toBe(list);
  });
});

describe('profileEvent', () => {
  it('is a session.profile with only what is filled in', () => {
    const state = {
      about: { name: ' Dana ', role: '', words: 'Northwind, SOC 2' },
      remembered: ['Biscuit'],
    };
    expect(profileEvent(state)).toEqual({
      type: 'session.profile',
      name: 'Dana',
      words: ['Northwind', 'SOC 2'],
      remembered: ['Biscuit'],
    });
  });

  it('cuts a name or role at 80 characters', () => {
    const e = profileEvent({
      about: { name: 'n'.repeat(200), role: '', words: '' },
      remembered: [],
    });
    expect(e.type === 'session.profile' && e.name).toHaveLength(80);
  });
});

describe('isEmpty', () => {
  it('is true only when nothing is set', () => {
    expect(isEmpty(emptyAbout)).toBe(true);
    expect(isEmpty({ about: { name: ' ', role: '', words: ' , ' }, remembered: [] })).toBe(true);
    expect(isEmpty({ about: { name: '', role: '', words: '' }, remembered: ['a'] })).toBe(false);
  });
});

describe('createAboutYou', () => {
  it('saves every change and loads it again', () => {
    const storage = fakeStorage();
    const a = createAboutYou(storage);
    a.setAbout({ name: 'Dana', words: 'Northwind' });
    a.remember('SOC 2');
    const b = createAboutYou(storage);
    expect(b.snapshot()).toEqual({
      about: { name: 'Dana', role: '', words: 'Northwind' },
      remembered: ['SOC 2'],
    });
  });

  it('forgets only the remembered words, and says so to listeners', () => {
    const a = createAboutYou(fakeStorage());
    const listener = vi.fn();
    a.subscribe(listener);
    a.setAbout({ role: 'nurse' });
    a.remember('heparin');
    a.forget();
    expect(a.snapshot().remembered).toEqual([]);
    expect(a.snapshot().about.role).toBe('nurse');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('removes its storage key when everything is cleared', () => {
    const storage = fakeStorage();
    const a = createAboutYou(storage);
    a.remember('x');
    expect(Object.keys(storage.data)).toEqual(['tott.aboutYou']);
    a.forget();
    expect(storage.data).toEqual({});
  });

  it('does not notify when a repeated word changes nothing', () => {
    const a = createAboutYou(fakeStorage());
    a.remember('x');
    const listener = vi.fn();
    a.subscribe(listener);
    a.remember('x');
    expect(listener).not.toHaveBeenCalled();
  });

  it('survives garbage in storage and clips oversized saved values', () => {
    expect(createAboutYou(fakeStorage({ 'tott.aboutYou': '{nope' })).snapshot()).toEqual(
      emptyAbout,
    );
    expect(createAboutYou(fakeStorage({ 'tott.aboutYou': '"x"' })).snapshot()).toEqual(emptyAbout);
    const hostile = JSON.stringify({
      about: { name: 'n'.repeat(500), role: 5, words: null },
      remembered: [
        1,
        'a',
        'a\u0000b',
        'x'.repeat(100),
        ...Array.from({ length: 300 }, (_, i) => `w${i}`),
      ],
    });
    const s = createAboutYou(fakeStorage({ 'tott.aboutYou': hostile })).snapshot();
    expect(s.about.name).toHaveLength(80);
    expect(s.about.role).toBe('');
    expect(s.remembered.length).toBeLessThanOrEqual(100);
    expect(s.remembered.every((w) => w.length <= 40 && !w.includes('\u0000'))).toBe(true);
  });

  it('still works when storage is missing or throws', () => {
    const a = createAboutYou(null);
    a.remember('x');
    expect(a.snapshot().remembered).toEqual(['x']);
    const broken = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    const b = createAboutYou(broken);
    b.remember('y');
    expect(b.snapshot().remembered).toEqual(['y']);
  });
});

describe('removing what is kept', () => {
  const seeded = () => {
    const store = createAboutYou(null);
    store.setAbout({ name: 'Sam', role: 'CFO', words: 'Northwind' });
    store.remember('renewal');
    store.remember('chemist');
    return store;
  };

  it('removes one remembered word and keeps the rest and About you', () => {
    const store = seeded();
    store.removeRemembered('renewal');
    expect(store.snapshot().remembered).toEqual(['chemist']);
    expect(store.snapshot().about.name).toBe('Sam');
  });

  it('clears About you and keeps the remembered words', () => {
    const store = seeded();
    store.clearAbout();
    expect(store.snapshot().about).toEqual({ name: '', role: '', words: '' });
    expect(store.snapshot().remembered).toEqual(['renewal', 'chemist']);
  });

  it('forgets everything, and the saved copy goes too', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const store = createAboutYou(storage);
    store.setAbout({ name: 'Sam' });
    store.remember('renewal');
    expect(data.size).toBe(1);
    store.forgetAll();
    expect(store.snapshot()).toEqual({ about: { name: '', role: '', words: '' }, remembered: [] });
    expect(data.size).toBe(0);
  });
});
