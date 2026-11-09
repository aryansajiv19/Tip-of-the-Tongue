import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { disfluency, inStutterMode } from './disfluency.js';

const say = (text: string, startMs = 0): Word[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({ text: t, startMs: startMs + i * 300, endMs: startMs + i * 300 + 100 }));
const NOW = 20_000;

describe('disfluency', () => {
  it('counts part-word repetitions: "c- c- coffee", "b-b-bag"', () => {
    expect(disfluency(say('I would like a c- c- coffee please'), NOW).events).toBe(2);
    expect(disfluency(say('and a b-b-bag'), NOW).events).toBe(1);
    expect(disfluency(say('I s-s-sorry about that'), NOW).events).toBe(1);
  });

  it('counts a short start repeated as the whole word, and a held sound', () => {
    expect(disfluency(say('a c coffee'), NOW).events).toBe(1);
    expect(disfluency(say('the com computer is slow'), NOW).events).toBe(1);
    expect(disfluency(say('it is ssso hard to say'), NOW).events).toBe(1);
  });

  it('counts the same long word said again while pushing it out', () => {
    expect(disfluency(say('I want coffee coffee please'), NOW).events).toBe(1);
  });

  it('does NOT count whole-word repetition of small words: typical word-searching', () => {
    for (const text of [
      'I need the the thing',
      'on the the list',
      'we went to to the shop',
      'I I think so',
      'it is a a long story',
      'to the, the plan',
    ]) {
      expect(disfluency(say(text), NOW).events).toBe(0);
    }
  });

  it('does not count intensifiers or real hyphenated words', () => {
    expect(disfluency(say('that was very very good'), NOW).events).toBe(0);
    expect(disfluency(say('my co-worker is really really nice'), NOW).events).toBe(0);
    expect(disfluency(say('a well-known pharmacy'), NOW).events).toBe(0);
  });

  it('says when the speech stops on a begun word', () => {
    expect(disfluency(say('I would like a c-'), NOW).atEnd).toBe(true);
    expect(disfluency(say('I would like a c- c-'), NOW).atEnd).toBe(true);
    expect(disfluency(say('and then ssso'), NOW).atEnd).toBe(true);
    expect(disfluency(say('I want coffee coffee'), NOW).atEnd).toBe(true);
    expect(disfluency(say('I want a coffee'), NOW).atEnd).toBe(false);
    expect(disfluency(say('I need the the'), NOW).atEnd).toBe(false);
  });

  it('only looks at the last 20 seconds', () => {
    const old = say('a c- c- coffee', 0);
    expect(disfluency(old, 60_000).events).toBe(0);
  });

  it('strips the pause marks the recogniser or the scenarios leave on a word', () => {
    expect(disfluency(say('a c-... c-... coffee'), NOW).events).toBe(2);
  });
});

describe('inStutterMode', () => {
  it('needs two repetitions in the window, or to stop right on one', () => {
    expect(inStutterMode({ events: 1, atEnd: false })).toBe(false);
    expect(inStutterMode({ events: 2, atEnd: false })).toBe(true);
    expect(inStutterMode({ events: 1, atEnd: true })).toBe(true);
  });
});
