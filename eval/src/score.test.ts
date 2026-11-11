import { describe, expect, it } from 'vitest';
import { layoutScenario } from './layout.js';
import type { Offer } from './replay.js';
import { scoreScenario, summarize } from './score.js';
import type { Scenario } from './scenarios.js';

const lines: Scenario['lines'] = [
  { s: 'me', t: 'the... place for medicine', w: 'pharmacy', a: ['pharmacy', 'chemist'] }, // 0 stall
  { s: 'other', t: 'ok sure' }, // 1
  { s: 'me', t: 'so I think... we should go' }, // 2 fluent
  { s: 'me', t: 'the... pen, yes the pen', w: 'pen', recover: true }, // 3 self-recovery
  { s: 'me', t: 'the... thing for cutting', w: 'knife' }, // 4 stall
  { s: 'me', t: 'the... yellow fruit', w: 'banana' }, // 5 stall
];
const placed = layoutScenario({ id: 's', type: 't', split: 'dev', title: 't', lines });
const offer = (line: number, words: string[], silenceMs = 1500): Offer => ({
  atMs: 0,
  line,
  silenceMs,
  candidates: words.map((word) => ({ word, confidence: 0.8 })),
});

describe('scoreScenario', () => {
  it('marks each stall correct, wrong or missed', () => {
    const s = scoreScenario('s', 't', placed, [offer(0, ['pharmacy']), offer(4, ['spoon'])]);
    expect(s.stalls.map((x) => x.outcome)).toEqual(['correct', 'wrong', 'miss']);
  });

  it('counts top-1 only when the right word is first, and reads acceptable forms', () => {
    const first = scoreScenario('s', 't', placed, [offer(0, ["Chemist's", 'pharmacy'])]);
    expect(first.stalls[0]).toMatchObject({ outcome: 'correct', top1: true });
    const second = scoreScenario('s', 't', placed, [offer(0, ['hospital', 'pharmacy'])]);
    expect(second.stalls[0]).toMatchObject({ outcome: 'correct', top1: false });
  });

  it('counts wrong pop-ups shown on a stall even when a right one follows', () => {
    const s = scoreScenario('s', 't', placed, [offer(0, ['hospital']), offer(0, ['pharmacy'])]);
    expect(s.stalls[0]).toMatchObject({ outcome: 'correct', wrongShown: 1 });
    expect(summarize([s]).wrongShown).toBe(1);
  });

  it('records how long the silence was for a correct pop-up only', () => {
    const s = scoreScenario('s', 't', placed, [
      offer(0, ['pharmacy'], 1800),
      offer(4, ['spoon'], 900),
    ]);
    expect(s.stalls[0]?.silenceMs).toBe(1800);
    expect(s.stalls[1]?.silenceMs).toBeUndefined();
  });

  it('counts pop-ups in fluent lines, in self-recoveries and on the other speaker', () => {
    const s = scoreScenario('s', 't', placed, [offer(1, ['x']), offer(2, ['x']), offer(3, ['x'])]);
    expect(s.other).toEqual({ lines: 1, popups: 1 });
    expect(s.fluent).toEqual({ lines: 1, popups: 1 });
    expect(s.selfRecovered).toEqual({ lines: 1, popups: 1 });
  });

  it('counts a line once however many pop-ups it got', () => {
    const s = scoreScenario('s', 't', placed, [offer(2, ['x']), offer(2, ['y'])]);
    expect(s.fluent.popups).toBe(1);
  });

  it('has nothing to flag when there are no pop-ups', () => {
    const s = scoreScenario('s', 't', placed, []);
    expect(s.fluent.popups + s.other.popups + s.selfRecovered.popups).toBe(0);
    expect(s.stalls.every((x) => x.outcome === 'miss')).toBe(true);
  });
});

describe('summarize', () => {
  it('adds up scenarios and takes silence percentiles over the correct ones', () => {
    const a = scoreScenario('a', 't', placed, [offer(0, ['pharmacy'], 1000)]);
    const b = scoreScenario('b', 't', placed, [offer(0, ['pharmacy'], 2000), offer(2, ['x'])]);
    const s = summarize([a, b]);
    expect(s.scenarios).toBe(2);
    expect(s.stalls).toBe(6);
    expect(s.correct).toEqual({ hits: 2, total: 6 });
    expect(s.missed).toBe(4);
    expect(s.fluent).toEqual({ hits: 1, total: 2 });
    expect(s.silenceP50).toBe(1000);
    expect(s.silenceP95).toBe(2000);
  });

  it('copes with no scenarios', () => {
    const s = summarize([]);
    expect(s.stalls).toBe(0);
    expect(s.correct).toEqual({ hits: 0, total: 0 });
    expect(s.silenceP50).toBeUndefined();
  });
});

describe('late right words', () => {
  const at = (line: number, words: string[], atMs: number): Offer => ({
    ...offer(line, words),
    atMs,
  });
  const next = placed[1]?.startMs ?? 0; // the other person's line after the stall on line 0

  it('counts a missed stall whose right word came up in the first 2 s of the next line', () => {
    const s = scoreScenario('s', 't', placed, [at(1, ['pharmacy'], next + 1600)]);
    expect(s.stalls[0]).toMatchObject({ outcome: 'miss', late: true });
    expect(summarize([s])).toMatchObject({ missed: 3, late: 1 });
    expect(summarize([s]).correct.hits).toBe(0);
  });
  it('does not count a later one, a wrong word, or a stall that was answered in time', () => {
    expect(
      scoreScenario('s', 't', placed, [at(1, ['pharmacy'], next + 2500)]).stalls[0]?.late,
    ).toBeUndefined();
    expect(
      scoreScenario('s', 't', placed, [at(1, ['hospital'], next + 500)]).stalls[0]?.late,
    ).toBeUndefined();
    const both = scoreScenario('s', 't', placed, [
      offer(0, ['pharmacy']),
      at(1, ['pharmacy'], next + 500),
    ]);
    expect(both.stalls[0]).toMatchObject({ outcome: 'correct' });
    expect(both.stalls[0]?.late).toBeUndefined();
  });
});
