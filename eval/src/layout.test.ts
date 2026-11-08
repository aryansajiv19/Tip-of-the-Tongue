import { describe, expect, it } from 'vitest';
import { isStall, layoutScenario, lineAt } from './layout.js';
import type { Scenario } from './scenarios.js';

const sc = (lines: Scenario['lines'], extra: Partial<Scenario> = {}): Scenario => ({
  id: 't',
  type: 'x',
  split: 'dev',
  title: 't',
  lines,
  ...extra,
});

describe('layoutScenario', () => {
  it('puts lines one after the other with a short gap between turns', () => {
    const [a, b] = layoutScenario(
      sc([
        { s: 'me', t: 'one two' },
        { s: 'other', t: 'three' },
      ]),
    );
    expect(a?.words.map((w) => w.text)).toEqual(['one', 'two']);
    expect((b?.startMs ?? 0) - (a?.endMs ?? 0)).toBe(700);
  });

  it('waits longer after a stall, and honours an explicit gap', () => {
    const [a, b, c] = layoutScenario(
      sc([
        { s: 'me', t: 'the... thing', w: 'pen' },
        { s: 'me', t: 'pen', gap: 100 },
        { s: 'me', t: 'ok' },
      ]),
    );
    expect((b?.startMs ?? 0) - (a?.endMs ?? 0)).toBe(3000);
    expect((c?.startMs ?? 0) - (b?.endMs ?? 0)).toBe(100);
  });

  it('puts a 2 s silence at each "..." and follows the scenario speed and pause settings', () => {
    const [slow] = layoutScenario(sc([{ s: 'me', t: 'a... b' }]));
    expect((slow?.words[1]?.startMs ?? 0) - (slow?.words[0]?.endMs ?? 0)).toBe(2000);
    const [fast] = layoutScenario(sc([{ s: 'me', t: 'a... b c' }], { wordMs: 160, stallMs: 1100 }));
    expect((fast?.words[1]?.startMs ?? 0) - (fast?.words[0]?.endMs ?? 0)).toBe(1100);
    expect((fast?.words[2]?.startMs ?? 0) - (fast?.words[1]?.startMs ?? 0)).toBe(160);
  });
});

describe('what the session hears', () => {
  it('has no punctuation and no dots, but keeps the silence', () => {
    const [p] = layoutScenario(sc([{ s: 'me', t: "Well, it's the... thing. Right? Yes!" }]));
    expect(p?.words.map((w) => w.text)).toEqual(['Well', "it's", 'the', 'thing', 'Right', 'Yes']);
    expect((p?.words[3]?.startMs ?? 0) - (p?.words[2]?.endMs ?? 0)).toBe(2000);
  });
  it('drops a lone "..." instead of sending an empty word', () => {
    const [p] = layoutScenario(sc([{ s: 'me', t: 'a ... b' }]));
    expect(p?.words.map((w) => w.text)).toEqual(['a', 'b']);
  });
});

describe('isStall', () => {
  it('is a line of the user with a target, unless they find it themselves', () => {
    expect(isStall({ s: 'me', t: 'x', w: 'a' })).toBe(true);
    expect(isStall({ s: 'me', t: 'x', w: 'a', recover: true })).toBe(false);
    expect(isStall({ s: 'me', t: 'x' })).toBe(false);
    expect(isStall({ s: 'other', t: 'x', w: 'a' })).toBe(false);
  });
});

describe('lineAt', () => {
  it('names the line of the last word that had finished by then', () => {
    const placed = layoutScenario(
      sc([
        { s: 'me', t: 'one two' },
        { s: 'other', t: 'three four' },
      ]),
    );
    expect(lineAt(placed, 0)).toBe(-1);
    expect(lineAt(placed, (placed[0]?.endMs ?? 0) + 100)).toBe(0);
    expect(lineAt(placed, (placed[1]?.endMs ?? 0) + 100)).toBe(1);
  });
});
