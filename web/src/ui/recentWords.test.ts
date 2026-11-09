import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../../server/src/events';
import { recentWords, type RecentWord } from './recentWords';

const offered = (...words: string[]): ServerEvent => ({
  type: 'guess.offered',
  id: 'a',
  latencyMs: 5,
  candidates: words.map((word) => ({ word, confidence: 0.8 })),
});
const accepted = (word: string): ServerEvent => ({
  type: 'guess.accepted',
  id: 'a',
  word,
  afterMs: 100,
});

describe('recentWords', () => {
  it('lists offered words, newest first', () => {
    const a = recentWords([], offered('renewal', 'chemist'));
    const b = recentWords(a, offered('whisk'));
    expect(b.map((r) => r.word)).toEqual(['whisk', 'renewal', 'chemist']);
    expect(b.every((r) => !r.accepted)).toBe(true);
  });

  it('marks an accepted word, even when it was an alternative', () => {
    const list = recentWords(recentWords([], offered('renewal', 'chemist')), accepted('chemist'));
    expect(list).toEqual([
      { word: 'chemist', accepted: true },
      { word: 'renewal', accepted: false },
    ]);
  });

  it('lists a word once, ignoring case, and keeps it accepted if offered again', () => {
    let list: RecentWord[] = recentWords([], offered('Renewal'));
    list = recentWords(list, accepted('renewal'));
    list = recentWords(list, offered('renewal', 'RENEWAL'));
    expect(list).toEqual([{ word: 'renewal', accepted: true }]);
  });

  it('keeps at most 30 and ignores other events', () => {
    const many = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const list = recentWords([], offered(...many));
    expect(list).toHaveLength(30);
    expect(recentWords(list, { type: 'guess.idle' })).toBe(list);
  });
});
