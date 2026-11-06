import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { detectStuck } from './detect.js';

const PAUSE_MS = 1500;
const opts = { pauseMs: PAUSE_MS };

// Builds words 300 ms apart (100 ms long). `gap` is the silence after the last word.
function say(text: string, startMs = 0): { words: Word[]; endMs: number } {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({ text: t, startMs: startMs + i * 300, endMs: startMs + i * 300 + 100 }));
  return { words, endMs: words.at(-1)?.endMs ?? startMs };
}

// Detect right after the last word (no pause).
function live(text: string) {
  const { words, endMs } = say(text);
  return detectStuck(words, endMs, opts);
}

// Detect `gap` ms after the last word.
function afterGap(text: string, gap: number) {
  const { words, endMs } = say(text);
  return detectStuck(words, endMs + gap, opts);
}

const reason = (r: ReturnType<typeof live>) => (r.stuck ? r.reason : null);

describe('fluent speech is never stuck', () => {
  const fluent = [
    'I went to the pharmacy this morning and picked up my prescription',
    'The thing is, we shipped it last week',
    'the thing about this plan is that it works',
    'Do you know where the office is',
    'if you know the answer please say so',
    'I would like to renew the analytics licence before the end of the quarter',
    'We talked to the team and they agreed',
    'Thanks, that sounds good to me',
    'I know what you mean',
    'The invoice is ready',
    'Can you send me the report by Friday',
    'It was a long day but we got there in the end',
    'okay',
  ];
  it.each(fluent)('silent on: %s', (text) => {
    expect(live(text)).toEqual({ stuck: false });
    expect(afterGap(text, 5000)).toEqual({ stuck: false });
  });

  it('contains no cue words inside longer words (thingy vs anything)', () => {
    expect(live('Is there anything else you would like to add')).toEqual({ stuck: false });
  });
});

describe('pause', () => {
  it.each([
    'we need to sort out the',
    'I am going to the',
    'send it to my',
    'a list of',
    'salt and',
  ])('a long pause after an unfinished phrase triggers: %s', (text) => {
    expect(reason(afterGap(text, 2000))).toBe('pause');
  });

  it('the same pause after a complete sentence does not trigger', () => {
    expect(afterGap('we shipped it last week', 5000)).toEqual({ stuck: false });
  });

  it('a short pause after an unfinished phrase does not trigger', () => {
    expect(afterGap('we need to sort out the', 500)).toEqual({ stuck: false });
  });

  it('triggers only when the pause is strictly longer than the threshold', () => {
    expect(afterGap('send it to the', PAUSE_MS)).toEqual({ stuck: false });
    expect(reason(afterGap('send it to the', PAUSE_MS + 1))).toBe('pause');
  });

  it('respects a custom threshold', () => {
    const { words, endMs } = say('send it to the');
    expect(detectStuck(words, endMs + 600, { pauseMs: 500 }).stuck).toBe(true);
  });

  it('a trailing filler sound plus a pause triggers', () => {
    expect(afterGap('we need the um', 2000).stuck).toBe(true);
  });

  it('ignores punctuation and case on the last word', () => {
    expect(reason(afterGap('Send it to The,', 2000))).toBe('pause');
  });
});

describe('filler cues', () => {
  it.each([
    'we need to sort out the thing',
    'we need to sort out the yearly what is it called',
    "we need the yearly what's it called",
    'we need the yearly whats it called',
    'we need the yearly What Is It Called',
    'we need the yearly what do you call it',
    'we need the yearly what you call it',
    'send me the whatchamacallit',
    'send me the thingy',
    'we need to um',
    'we need to uh',
    'we need to er',
    'we need the, um, yearly',
    'send me the... the',
    'send me the the',
    'we should, you know',
    'the thing',
  ])('triggers filler: %s', (text) => {
    expect(reason(live(text))).toBe('filler');
  });

  it('"you know" mid-question is not a stall', () => {
    expect(live('do you know')).toEqual({ stuck: false });
  });

  it('"that that" is ordinary English, not repetition', () => {
    expect(live('I think that that is fine')).toEqual({ stuck: false });
  });

  it('a filler is not triggered by the filler sound inside another word', () => {
    expect(live('the summer is here')).toEqual({ stuck: false });
  });

  it('an old filler far back does not fire again', () => {
    const text =
      'um we need that thing for the invoices and then we sent everything to the client on Monday';
    expect(live(text)).toEqual({ stuck: false });
  });

  it('a filler older than the time window does not fire', () => {
    const { words, endMs } = say('what is it called');
    expect(detectStuck(words, endMs + 20_000, opts)).toEqual({ stuck: false });
  });
});

describe('describing cues', () => {
  it.each([
    'I need the thing you use for cutting bread',
    'I need the thing I wear on my wrist',
    'we go to the place where you get medicine',
    'I have to see the man who fixes the heating',
    'I have to see the person who does your teeth',
    "it's like a long yellow fruit",
    'its like a bridge but for trains',
    'pass me the one that I had yesterday',
    'pass me the round one you screw in',
    'the tool we use for invoices',
    'Please open the app we use for invoices',
    'we flew from the big where all the planes go',
    'the glass thing you screw in',
    'The Place Where They Print Money',
  ])('triggers describing: %s', (text) => {
    expect(reason(live(text))).toBe('describing');
  });

  it('a description that is far back does not fire', () => {
    const text =
      'the person who does your teeth was lovely and we talked about holidays and weather and football for ages';
    expect(live(text)).toEqual({ stuck: false });
  });
});

describe('edge cases', () => {
  it('empty input', () => {
    expect(detectStuck([], 1000, opts)).toEqual({ stuck: false });
  });

  it('a single word', () => {
    expect(live('hello')).toEqual({ stuck: false });
    expect(reason(afterGap('the', 2000))).toBe('pause');
    expect(live('um').stuck).toBe(true);
  });

  it('words with only punctuation are ignored', () => {
    const { words, endMs } = say('... ,');
    expect(detectStuck(words, endMs + 5000, opts)).toEqual({ stuck: false });
  });

  it('out-of-order timestamps still use the real last word', () => {
    const words: Word[] = [
      { text: 'the', startMs: 600, endMs: 700 },
      { text: 'send', startMs: 0, endMs: 100 },
      { text: 'it', startMs: 300, endMs: 400 },
      { text: 'to', startMs: 450, endMs: 550 },
    ];
    expect(reason(detectStuck(words, 700 + 2000, opts))).toBe('pause');
  });

  it('a partial (still being spoken) word list works the same', () => {
    expect(live('send me the th').stuck).toBe(false);
    expect(reason(live('send me the thing'))).toBe('filler');
  });

  it('a very long transcript is judged on its end only', () => {
    const long = Array.from({ length: 2000 }, () => 'we shipped it').join(' ');
    expect(live(long)).toEqual({ stuck: false });
    expect(reason(live(`${long} and then the thing`))).toBe('filler');
  });

  it('contextWindow is the recent text, capped at 60 words', () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    const r = live(`${text} the thing`);
    expect(r.stuck && r.contextWindow.split(' ')).toHaveLength(60);
    expect(r.stuck && r.contextWindow.endsWith('the thing')).toBe(true);
  });

  it('does not change the input array', () => {
    const { words, endMs } = say('b a');
    const copy = structuredClone(words);
    detectStuck(words, endMs, opts);
    expect(words).toEqual(copy);
  });

  it('multi-word text in one word object is handled', () => {
    const words: Word[] = [{ text: "what's it called", startMs: 0, endMs: 900 }];
    expect(reason(detectStuck(words, 900, opts))).toBe('filler');
  });
});

describe('data/eval/circumlocutions.json', () => {
  interface Item {
    id: string;
    utterance: string;
    category: string;
  }
  const file = new URL('../../../data/eval/circumlocutions.json', import.meta.url);
  const items = (JSON.parse(readFileSync(file, 'utf8')) as { items: Item[] }).items;
  const stalls = items.filter((i) => !['not_stuck', 'self_recovered'].includes(i.category));

  it('flags most written circumlocutions from the text alone', () => {
    const missed = stalls.filter((i) => !live(i.utterance).stuck).map((i) => i.id);
    expect(stalls.length - missed.length).toBeGreaterThanOrEqual(Math.ceil(stalls.length * 0.7));
  });

  it('stays silent on the not_stuck items', () => {
    for (const i of items.filter((x) => x.category === 'not_stuck')) {
      expect(live(i.utterance), i.id).toEqual({ stuck: false });
    }
  });

  it('stays silent on the self_recovered items once the word is said', () => {
    for (const i of items.filter((x) => x.category === 'self_recovered')) {
      expect(live(i.utterance), i.id).toEqual({ stuck: false });
    }
  });

  it('every circumlocution cut off at its stall point triggers on a pause', () => {
    // Cut each utterance where the first "the"/"my" hesitation sits, then pause.
    const cut = stalls
      .map((i) => /^(.*?\b(?:the|my)\b)\.\.\./.exec(i.utterance)?.[1])
      .filter((x): x is string => Boolean(x));
    expect(cut.length).toBeGreaterThan(0);
    for (const text of cut) expect(afterGap(text, 2000).stuck, text).toBe(true);
  });
});
