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

// Detect after a short silence (half the pause threshold), when cue phrases may count.
function paused(text: string) {
  return afterGap(text, PAUSE_MS / 2);
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
    // Browser speech recognition adds no full stop; other providers do.
    expect(afterGap(`${text}.`, 5000)).toEqual({ stuck: false });
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

  it.each([
    'we shipped it last week.',
    'did we ship it?',
    'we shipped it!',
    'he said "we shipped it."',
    'thanks',
    'okay',
    'See you, bye',
  ])('the same pause after a finished sentence does not trigger: %s', (text) => {
    expect(afterGap(text, 3000)).toEqual({ stuck: false });
  });

  it.each(['we should call', 'I talked to', 'my sister lives in', 'we shipped it last week'])(
    'a pause mid-utterance triggers whatever the last word is: %s',
    (text) => {
      expect(reason(afterGap(text, 2000))).toBe('pause');
    },
  );

  it('a fluent sentence with no pause never triggers', () => {
    expect(live('we should call the client about the renewal tomorrow')).toEqual({
      stuck: false,
    });
  });

  it('a pause longer than ten seconds is a conversation that moved on', () => {
    expect(afterGap('we should call', 11_000)).toEqual({ stuck: false });
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
    expect(reason(paused(text))).toBe('filler');
  });

  it('"you know" mid-question is not a stall', () => {
    expect(paused('do you know')).toEqual({ stuck: false });
  });

  it('"that that" is ordinary English, not repetition', () => {
    expect(paused('I think that that is fine')).toEqual({ stuck: false });
  });

  it('a filler is not triggered by the filler sound inside another word', () => {
    expect(paused('the summer is here')).toEqual({ stuck: false });
  });

  it('an old filler far back does not fire again', () => {
    const text =
      'um we need that thing for the invoices and then we sent everything to the client on Monday';
    expect(paused(text)).toEqual({ stuck: false });
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
    expect(reason(paused(text))).toBe('describing');
  });

  it('a description that is far back does not fire', () => {
    const text =
      'the person who does your teeth was lovely and we talked about holidays and weather and football for ages';
    expect(paused(text)).toEqual({ stuck: false });
  });
});

describe('edge cases', () => {
  it('empty input', () => {
    expect(detectStuck([], 1000, opts)).toEqual({ stuck: false });
  });

  it('a single word', () => {
    expect(paused('hello')).toEqual({ stuck: false });
    expect(reason(afterGap('the', 2000))).toBe('pause');
    expect(paused('um').stuck).toBe(true);
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
    expect(paused('send me the th').stuck).toBe(false);
    expect(reason(paused('send me the thing'))).toBe('filler');
  });

  it('a very long transcript is judged on its end only', () => {
    const long = Array.from({ length: 2000 }, () => 'we shipped it').join(' ');
    expect(paused(long)).toEqual({ stuck: false });
    expect(reason(paused(`${long} and then the thing`))).toBe('filler');
  });

  it('contextWindow is the recent text, capped at 60 words', () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    const r = paused(`${text} the thing`);
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
    expect(reason(detectStuck(words, 900 + PAUSE_MS / 2, opts))).toBe('filler');
  });
});

describe('data/eval/circumlocutions.json', () => {
  interface Item {
    id: string;
    utterance: string;
    category: string;
    split: string;
    pause?: boolean;
  }
  const file = new URL('../../../data/eval/circumlocutions.json', import.meta.url);
  const items = (JSON.parse(readFileSync(file, 'utf8')) as { items: Item[] }).items;

  // Same timing model as the eval runner: 300 ms per word, a "..." is a 2000 ms gap, and the
  // detector is asked every 200 ms until 2 s after the last word. "Fired" = at least once.
  function fires(utterance: string): boolean {
    const words: Word[] = [];
    let startMs = 0;
    for (const text of utterance.split(/\s+/).filter(Boolean)) {
      words.push({ text, startMs, endMs: startMs + 100 });
      startMs += text.includes('...') ? 2100 : 300;
    }
    const lastEnd = Math.max(...words.map((w) => w.endMs));
    for (let now = 100; now <= lastEnd + 2000; now += 200) {
      const heard = words.filter((w) => w.endMs <= now);
      if (detectStuck(heard, now, opts).stuck) return true;
    }
    return false;
  }

  const stall = (i: Item) => !['not_stuck', 'self_recovered'].includes(i.category);
  const rate = (split: string) => {
    const set = items.filter((i) => i.split === split && stall(i));
    const hit = set.filter((i) => fires(i.utterance));
    return { hit: hit.length, total: set.length, missed: set.filter((i) => !hit.includes(i)) };
  };

  it('fires on at least 70% of dev stall items', () => {
    const r = rate('dev');
    expect(
      r.hit / r.total,
      `missed: ${r.missed.map((i) => i.id).join(' ')}`,
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('prints the holdout rate without asserting on it', () => {
    const r = rate('holdout');
    console.info(`holdout stall items detected: ${r.hit}/${r.total}`);
  });

  it('stays silent on every dev not_stuck item', () => {
    // Fluent sentences with a thinking pause (pause: true) fire the detector by design; the guesser is the filter for those.
    for (const i of items.filter(
      (x) => x.category === 'not_stuck' && x.split === 'dev' && !x.pause,
    )) {
      // With browser speech recognition (no full stop) every utterance ends in a pause that
      // looks like a hesitation; the guesser has to filter those. With punctuated words, as
      // other providers send, the detector itself stays silent.
      expect(fires(`${i.utterance}.`), i.id).toBe(false);
    }
  });
});

describe('sinceMs: where the search for the missing word starts', () => {
  const since = (text: string, gap: number) => {
    const r = afterGap(text, gap);
    return r.stuck ? r.sinceMs : undefined;
  };
  // say() puts word i at i*300 and ends it 100 ms later.
  it('pause: just before the last word, so that word counts as said', () => {
    expect(since('send it to the', 2000)).toBe(3 * 300 - 1);
  });
  it('describing: the end of the first word of the cue', () => {
    expect(since('I need the thing you use for cutting bread', 800)).toBe(2 * 300 + 100);
  });
  it('filler: the end of the repeated determiner', () => {
    expect(since('pass me the the', 800)).toBe(3 * 300 + 100);
  });
  it('filler: the end of the filler sound', () => {
    expect(since('we need to um', 800)).toBe(3 * 300 + 100);
  });
  it('after a stall marker: the end of the repeated determiner', () => {
    expect(since('take the the soft round yellow thing under my head', 800)).toBe(2 * 300 + 100);
  });
  it('after a stall marker: the end of the word before a long gap', () => {
    const words: Word[] = [
      { text: 'put', startMs: 0, endMs: 100 },
      { text: 'it', startMs: 200, endMs: 300 },
      { text: 'in', startMs: 2500, endMs: 2600 },
      { text: 'there', startMs: 2800, endMs: 2900 },
    ];
    const r = detectStuck(words, 2900 + 800, opts);
    expect(r.stuck && r.sinceMs).toBe(300);
  });
  describe('a long gap between two voices is a turn change, not a stall marker', () => {
    const turns = (second: number): Word[] => [
      { text: 'a', startMs: 0, endMs: 100, speaker: 0 },
      { text: 'little', startMs: 200, endMs: 300, speaker: 0 },
      { text: 'each', startMs: 2500, endMs: 2600, speaker: second },
      { text: 'day', startMs: 2800, endMs: 2900, speaker: second },
      { text: 'slowly', startMs: 3100, endMs: 3200, speaker: 0 },
    ];
    it('the same voice going quiet for 2 s and carrying on still is a marker', () => {
      const r = detectStuck(turns(0), 3200 + 800, opts);
      expect(r.stuck && r.reason).toBe('describing');
    });
    it('the other voice answering in the gap is not', () => {
      expect(detectStuck(turns(1), 3200 + 800, opts)).toEqual({ stuck: false });
    });
  });
  it('a stall that the speaker repaired ("yes", "sorry") does not fire', () => {
    expect(afterGap('I left it in the the car yes the car', 800)).toEqual({ stuck: false });
  });
});

describe('cue phrases need a short silence', () => {
  it.each([
    'the thing you said was right',
    'the man who called yesterday',
    "it's like a dream",
    'what is it called in French',
    'we need the thing',
    'it was um',
    'we should you know',
  ])('fluent, no silence: %s', (text) => {
    expect(live(text)).toEqual({ stuck: false });
    expect(afterGap(text, PAUSE_MS / 2 - 1)).toEqual({ stuck: false });
  });

  it.each([
    'the thing you said was right',
    'the man who called yesterday',
    "it's like a dream",
    'what is it called in French',
    'we need the thing',
  ])('same words followed by a short silence trigger: %s', (text) => {
    expect(paused(text).stuck).toBe(true);
  });

  it('exactly half the threshold counts as silence', () => {
    expect(afterGap('the person who does your teeth', PAUSE_MS / 2).stuck).toBe(true);
  });
});

describe('early signal', () => {
  const early = (text: string, gap: number) => {
    const { words, endMs } = say(text);
    return detectStuck(words, endMs + gap, { pauseMs: PAUSE_MS, earlyMs: 300 });
  };

  it('fires after the short silence, where the normal check does not yet', () => {
    expect(early('we should call', 200)).toEqual({ stuck: false });
    expect(early('we should call', 400).stuck).toBe(true);
    expect(afterGap('we should call', 400)).toEqual({ stuck: false });
  });

  it('stays silent after a finished sentence', () => {
    expect(early('we shipped it.', 1000)).toEqual({ stuck: false });
  });

  it('a cue starts the search at the cue, not at the last word', () => {
    const r = afterGap('can you pass the the thing for cutting bread knife', 2000);
    // "the the" ends at word 4 (index 4): 4 * 300 + 100.
    expect(r.stuck && r.sinceMs).toBe(4 * 300 + 100);
  });
});

describe('with the microphone level (voice)', () => {
  // Words end at `end`; `voice` is described relative to it.
  const phrase = (text: string) => say(text);
  const quietSince = (sinceMs: number, lastVoiced?: { startMs: number; endMs: number }) => ({
    voiced: false,
    sinceMs,
    ...(lastVoiced ? { lastVoiced } : {}),
  });

  it('confirms a pause: unfinished phrase, silent for the full pause time', () => {
    const { words, endMs } = phrase('we need to talk about the');
    const r = detectStuck(words, endMs + 1700, { pauseMs: PAUSE_MS, voice: quietSince(endMs) });
    expect(reason(r)).toBe('pause');
  });

  it('rejects a word-gap pause while the user is still making sound (speech recognition lag)', () => {
    const { words, endMs } = phrase('we need to talk about the');
    const voiced = { voiced: true, sinceMs: endMs + 1000 };
    expect(reason(detectStuck(words, endMs + 2000, { pauseMs: PAUSE_MS }))).toBe('pause');
    expect(detectStuck(words, endMs + 2000, { pauseMs: PAUSE_MS, voice: voiced }).stuck).toBe(
      false,
    );
  });

  it('waits for the sound itself to be silent for the pause time, not just the word gap', () => {
    const { words, endMs } = phrase('we need to talk about the');
    // Sound ended 500 ms ago although the last word was 1700 ms ago.
    const voice = quietSince(endMs + 1200, { startMs: endMs - 600, endMs: endMs + 1200 });
    expect(detectStuck(words, endMs + 1700, { pauseMs: PAUSE_MS, voice }).stuck).toBe(false);
    expect(reason(detectStuck(words, endMs + 2800, { pauseMs: PAUSE_MS, voice }))).toBe('pause');
  });

  it('does not fire after a complete sentence, however long the silence', () => {
    const { words, endMs } = phrase('we shipped the release on Tuesday.');
    const voice = quietSince(endMs);
    expect(detectStuck(words, endMs + 4000, { pauseMs: PAUSE_MS, voice }).stuck).toBe(false);
    const humAfter = quietSince(endMs + 1200, { startMs: endMs + 200, endMs: endMs + 1200 });
    expect(detectStuck(words, endMs + 3000, { pauseMs: PAUSE_MS, voice: humAfter }).stuck).toBe(
      false,
    );
  });

  it('ignores a cue phrase while the user is still making sound', () => {
    const { words, endMs } = phrase('we need the thing you use for');
    const voiced = { voiced: true, sinceMs: endMs + 100 };
    expect(detectStuck(words, endMs + 900, { pauseMs: PAUSE_MS, voice: voiced }).stuck).toBe(false);
    const quiet = quietSince(endMs);
    expect(detectStuck(words, endMs + 900, { pauseMs: PAUSE_MS, voice: quiet }).stuck).toBe(true);
  });

  describe('hum', () => {
    const base = phrase('we need to sort out the');
    // A 1 s hum starting 300 ms after the last word.
    const hum = (lengthMs = 1000) => {
      const startMs = base.endMs + 300;
      return quietSince(startMs + lengthMs, { startMs, endMs: startMs + lengthMs });
    };

    it('is a stall cue once the hum has ended and it has been quiet for half the pause time', () => {
      const v = hum();
      const humEnd = base.endMs + 1300;
      const at = (quietFor: number) =>
        detectStuck(base.words, humEnd + quietFor, { pauseMs: PAUSE_MS, voice: v });
      expect(at(500).stuck).toBe(false);
      expect(reason(at(800))).toBe('hum');
    });

    it('does not trigger on a short sound (a breath, a click)', () => {
      const r = detectStuck(base.words, base.endMs + 1700, {
        pauseMs: PAUSE_MS,
        voice: hum(400),
      });
      expect(r.stuck).toBe(false);
    });

    it('does not trigger while the hum is still going', () => {
      const voiced = { voiced: true, sinceMs: base.endMs + 300 };
      expect(
        detectStuck(base.words, base.endMs + 2000, { pauseMs: PAUSE_MS, voice: voiced }).stuck,
      ).toBe(false);
    });

    it('humming and then saying a word does not trigger', () => {
      const withWord = [
        ...base.words,
        { text: 'renewal', startMs: base.endMs + 1500, endMs: base.endMs + 1900 },
      ];
      const r = detectStuck(withWord, base.endMs + 2700, { pauseMs: PAUSE_MS, voice: hum() });
      expect(r.stuck).toBe(false);
    });

    it('does not count the sound of the last word itself as a hum', () => {
      // One long stretch of sound that started before the last word ended: ordinary speech.
      const speech = quietSince(base.endMs + 200, {
        startMs: base.endMs - 1500,
        endMs: base.endMs + 200,
      });
      const r = detectStuck(base.words, base.endMs + 1000, { pauseMs: PAUSE_MS, voice: speech });
      expect(r.stuck).toBe(false);
    });

    it('starts the search at the hum, so words said after it count as the answer', () => {
      const r = detectStuck(base.words, base.endMs + 2100, { pauseMs: PAUSE_MS, voice: hum() });
      expect(r.stuck && r.sinceMs).toBe(base.endMs + 300);
    });
  });

  it('behaves as before when there is no voice information', () => {
    const { words, endMs } = phrase('we need to talk about the');
    expect(reason(detectStuck(words, endMs + 1700, { pauseMs: PAUSE_MS }))).toBe('pause');
  });
});

describe('stuttering is not word-finding', () => {
  it('stays silent in a long pause after a begun word', () => {
    for (const text of [
      'I would like a c-',
      'I would like a c- c-',
      'and then I need a b-b-',
      'I want coffee coffee',
      'it is ssso',
    ]) {
      expect(afterGap(text, 4000)).toEqual({ stuck: false });
      expect(afterGap(text, 2000)).toEqual({ stuck: false });
    }
  });

  it('stays silent in pauses once there were two repetitions, whatever the last word is', () => {
    const text = 'I c- c- cannot find b- b- the answer to that now';
    expect(afterGap(text, 2500)).toEqual({ stuck: false });
  });

  it('still lets a cue phrase in: "what is it called" after a block is a request', () => {
    const r = afterGap('I would like a c- c- what is it called', PAUSE_MS / 2);
    expect(reason(r)).not.toBeNull();
  });

  it('does NOT go quiet for a typical speaker who says "the the" twice in 20 seconds', () => {
    const { words, endMs } = say('I went to the the shop and then I looked for the the thing');
    // They stop after "the thing": a pause after "the the" and the sentence unfinished.
    expect(detectStuck(words, endMs + 2000, opts).stuck).toBe(true);
    // and the same when the repeated words are not the last ones
    const second = say('on the the list of people who want it, the the one that');
    expect(detectStuck(second.words, second.endMs + 2000, opts).stuck).toBe(true);
  });

  it('does not take "very very" or a co-worker for stuttering', () => {
    const { words, endMs } = say('that was very very good and my co-worker was');
    expect(detectStuck(words, endMs + 2000, opts).stuck).toBe(true);
  });
});

describe('self-corrections', () => {
  it('names the word they took back, so it is not offered', () => {
    const r = afterGap('pass me the fork no the', 2000);
    expect(r.stuck && r.rejected).toBe('fork');
    const r2 = afterGap('we should call Dan I mean the', 2000);
    expect(r2.stuck && r2.rejected).toBe('dan');
    const r3 = afterGap('it is in the kitchen sorry the', 2000);
    expect(r3.stuck && r3.rejected).toBe('kitchen');
  });

  it('is also found when the pause comes right after the take-back', () => {
    const r = afterGap('hand me the spanner no', 2000);
    expect(r.stuck && r.rejected).toBe('spanner');
  });

  it('leaves ordinary no and sorry alone', () => {
    for (const text of [
      'there is no problem with that at all',
      'I have no idea what to do next',
      'no no we are fine thanks',
      'sorry I am late',
    ]) {
      const r = afterGap(text, 2000);
      expect(r.stuck && r.rejected).toBeFalsy();
    }
  });
});

describe('generic words are a cue', () => {
  it('"thing" and "stuff" in place of a name count like a filler', () => {
    expect(reason(paused('I need to buy the thing'))).not.toBeNull();
    expect(reason(paused('we put it with the stuff'))).not.toBeNull();
  });
  it('but "the stuff is" and "the thing is" are ordinary speech', () => {
    expect(paused('the stuff is in the car')).toEqual({ stuck: false });
    expect(paused('the thing is we are late')).toEqual({ stuck: false });
  });
});
