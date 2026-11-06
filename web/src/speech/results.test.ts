import { describe, expect, it } from 'vitest';
import type { Word } from '../../../server/src/events';
import {
  applyResults,
  emptySpeech,
  flushSpeech,
  type RawResult,
  type SpeechState,
} from './results';

const f = (transcript: string): RawResult => ({ isFinal: true, transcript });
const i = (transcript: string): RawResult => ({ isFinal: false, transcript });
const texts = (ws: Word[] | null) => ws?.map((w) => w.text) ?? null;

// Feeds a sequence of `event.results` lists like Chrome would, and records what the server gets.
function run(steps: RawResult[][], startMs = 1000, stepMs = 300) {
  let state: SpeechState = emptySpeech;
  const finals: Word[] = [];
  const log: { final: string[] | null; partial: string[] | null }[] = [];
  steps.forEach((results, k) => {
    const u = applyResults(state, results, startMs + k * stepMs);
    state = u.state;
    if (u.final) finals.push(...u.final);
    log.push({ final: texts(u.final), partial: texts(u.partial) });
  });
  return { state, finals, log };
}

describe('applyResults with the shapes real Chrome produces', () => {
  it('one hypothesis split into several interim results is one partial', () => {
    const { log, finals } = run([
      [i('I need')],
      [i('I need'), i(' to go')],
      [i('I need'), i(' to go to the')],
    ]);
    expect(log.map((l) => l.partial)).toEqual([
      ['I', 'need'],
      ['I', 'need', 'to', 'go'],
      ['I', 'need', 'to', 'go', 'to', 'the'],
    ]);
    expect(finals).toEqual([]);
  });

  it('per-word finals send each word once, in order, with the time it was first heard', () => {
    const { finals, log } = run([
      [f('I')],
      [f('I'), f(' need')],
      [f('I'), f(' need'), f(' to')],
      [f('I'), f(' need'), f(' to'), f(' go')],
    ]);
    expect(log.map((l) => l.final)).toEqual([['I'], ['need'], ['to'], ['go']]);
    expect(finals.map((w) => [w.text, w.startMs])).toEqual([
      ['I', 1000],
      ['need', 1300],
      ['to', 1600],
      ['go', 1900],
    ]);
    expect(log.every((l) => l.partial === null)).toBe(true);
  });

  it('a final arriving while the next chunk is still interim splits them correctly', () => {
    const { log } = run([[i('I need to')], [f('I need'), i(' to')], [f('I need'), f(' to go')]]);
    expect(log[1]).toEqual({ final: ['I', 'need'], partial: ['to'] });
    expect(log[2]).toEqual({ final: ['to', 'go'], partial: null });
  });

  it('keeps the old time of an interim word after it becomes final', () => {
    const { finals } = run([[i('the thing')], [f('the thing')]]);
    expect(finals.map((w) => w.startMs)).toEqual([1000, 1000]);
  });

  it('a rewrite across a chunk boundary keeps times and does not resend finals', () => {
    const { finals, log } = run([
      [f('we need'), i(' the thing')],
      [f('we need'), i(' a thing')],
      [f('we need'), f(' a thing')],
    ]);
    expect(texts(finals)).toEqual(['we', 'need', 'a', 'thing']);
    expect(finals.map((w) => w.startMs)).toEqual([1000, 1000, 1000, 1000]);
    expect(log[1]).toEqual({
      final: null,
      partial: ['a', 'thing'],
    });
  });

  it('a final that Chrome later shortens does not send or unsend anything', () => {
    const { finals, log } = run([[f('one two three')], [f('one two')]]);
    expect(texts(finals)).toEqual(['one', 'two', 'three']);
    expect(log[1]).toEqual({ final: null, partial: null });
  });

  it('a repeated identical event sends nothing new', () => {
    const { log } = run([[i('hello there')], [i('hello there')]]);
    expect(log[1]).toEqual({ final: null, partial: null });
  });

  it('resends the interim after a final, because a final empties the server partial', () => {
    const { log } = run([[i('a b c')], [f('a'), i(' b c')]]);
    expect(log[1]).toEqual({ final: ['a'], partial: ['b', 'c'] });
  });

  it('keeps old times while the interim grows, so a pause stays measurable', () => {
    const { state } = run([[i('the')], [i('the thing')], [i('the thing')]]);
    expect(state.words.map((w) => w.startMs)).toEqual([1000, 1300]);
  });

  it('joins chunks with or without leading spaces and ignores punctuation-only chunks', () => {
    const { state } = run([[i('I need'), i('to go'), i('-'), i('  now.')]]);
    expect(texts(state.words)).toEqual(['I', 'need', 'to', 'go', 'now.']);
  });

  it('handles an empty result list and blank results', () => {
    expect(applyResults(emptySpeech, [], 1)).toEqual({
      state: emptySpeech,
      final: null,
      partial: null,
    });
    const u = applyResults(emptySpeech, [i(''), f('  ')], 1);
    expect(u.final).toBeNull();
    expect(u.partial).toBeNull();
  });

  it('a long session sends every word exactly once overall', () => {
    const sentence = 'we need to sort out the yearly renewal of the analytics licence'.split(' ');
    const steps: RawResult[][] = [];
    for (let k = 1; k <= sentence.length; k++) {
      const done = sentence.slice(0, k - 1).map((w) => f(w));
      steps.push([...done, i(sentence[k - 1] ?? '')]);
    }
    steps.push(sentence.map((w) => f(w)));
    const { finals } = run(steps);
    expect(texts(finals)).toEqual(sentence);
  });
});

describe('flushSpeech', () => {
  it('turns the interim words into one final with their original times and resets', () => {
    const { state } = run([[f('a'), i(' b c')]]);
    const flushed = flushSpeech(state);
    expect(texts(flushed.final)).toEqual(['b', 'c']);
    expect(flushed.final?.map((w) => w.startMs)).toEqual([1000, 1000]);
    expect(flushed.state).toEqual(emptySpeech);
  });

  it('sends nothing when everything was already final or nothing was heard', () => {
    expect(flushSpeech(run([[f('a b')]]).state).final).toBeNull();
    expect(flushSpeech(emptySpeech).final).toBeNull();
  });
});
