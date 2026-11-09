import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebugInfo, ServerEvent, Word } from './events.js';
import { mockGuesser } from './guess/mock.js';
import { ProfileSchema } from './guess/profile.js';
import { createSession } from './session.js';

const T0 = 1_000_000;

function setup(extra: Partial<Parameters<typeof createSession>[1]> = {}) {
  const events: ServerEvent[] = [];
  const onKeytermsChange = vi.fn();
  const session = createSession((e) => events.push(e), {
    guess: mockGuesser,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    now: () => Date.now(),
    onKeytermsChange,
    sttMode: () => 'deepgram',
    ...extra,
  });
  const say = (text: string) => {
    const words: Word[] = text.split(' ').map((w, i) => {
      const at = Date.now() + i * 300;
      return { text: w, startMs: at, endMs: at + 250 };
    });
    vi.advanceTimersByTime(words.length * 300);
    session.handle({ type: 'transcript.final', words });
  };
  const debug = (): DebugInfo[] => events.flatMap((e) => (e.type === 'debug' ? [e.info] : []));
  return { session, events, say, debug, onKeytermsChange };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const stall = 'I need to go to the the place where you get medicine';

describe('debug off', () => {
  it('sends no debug events at all, through a whole stall and offer', async () => {
    const { session, events, say } = setup();
    session.handle({ type: 'session.brief', text: 'Northwind review' });
    say(stall);
    await vi.advanceTimersByTimeAsync(2500);
    expect(events.some((e) => e.type === 'guess.offered')).toBe(true);
    expect(events.filter((e) => e.type === 'debug')).toEqual([]);
    session.close();
  });

  it('stops sending when it is turned off again', async () => {
    const { session, events, say } = setup();
    session.handle({ type: 'session.debug', on: true });
    say('hello there');
    session.handle({ type: 'session.debug', on: false });
    const before = events.length;
    say(stall);
    await vi.advanceTimersByTimeAsync(2500);
    expect(events.slice(before).filter((e) => e.type === 'debug')).toEqual([]);
    session.close();
  });
});

describe('debug on', () => {
  it('reports how speech-to-text is set up as soon as it is turned on', () => {
    const profile = ProfileSchema.parse({ pets: { dog: 'Biscuit' } });
    const { session, debug } = setup({ profile });
    session.handle({ type: 'session.debug', on: true });
    expect(debug()).toEqual([{ kind: 'stt', mode: 'deepgram', keyterms: ['Biscuit'] }]);
    session.close();
  });

  it('reports the raw transcript, fillers included', () => {
    const { session, debug, say } = setup();
    session.handle({ type: 'session.debug', on: true });
    say('so um the thing');
    expect(debug()).toContainEqual({ kind: 'transcript', final: true, text: 'so um the thing' });
    session.close();
  });

  it('reports the detector only when its decision changes, then the guess and the gate', async () => {
    const { session, debug, say } = setup();
    session.handle({ type: 'session.debug', on: true });
    say(stall);
    await vi.advanceTimersByTimeAsync(3000);
    const kinds = debug().map((d) => d.kind);
    expect(kinds.filter((k) => k === 'detector').length).toBeLessThanOrEqual(3);
    const detector = debug().filter((d) => d.kind === 'detector');
    expect(detector.at(-1)).toMatchObject({ stuck: true });
    const guess = debug().find((d) => d.kind === 'guess');
    expect(guess).toMatchObject({ abstain: false, error: false, stale: false });
    expect(guess?.kind === 'guess' && guess.candidates[0]?.word).toBe('pharmacy');
    expect(debug().find((d) => d.kind === 'gate')).toEqual({
      kind: 'gate',
      offered: true,
      words: expect.arrayContaining(['pharmacy']) as string[],
    });
    session.close();
  });

  it('reports why the gate stayed silent', async () => {
    const { session, debug, say } = setup();
    session.handle({ type: 'session.debug', on: true });
    say('can you pass the the thing for cutting bread knife');
    await vi.advanceTimersByTimeAsync(3000);
    expect(debug().find((d) => d.kind === 'gate')).toEqual({
      kind: 'gate',
      offered: false,
      reason: 'self-recovered',
    });
    session.close();
  });
});

describe('keyterms', () => {
  it('starts with the profile and changes when a brief with names arrives', () => {
    const profile = ProfileSchema.parse({ pets: { dog: 'Biscuit' } });
    const { session, onKeytermsChange, debug } = setup({ profile });
    expect(session.keyterms()).toEqual(['Biscuit']);
    session.handle({ type: 'session.debug', on: true });
    session.handle({ type: 'session.brief', text: 'We review the SOC 2 audit with Northwind.' });
    expect(session.keyterms()).toEqual(['Biscuit', 'SOC 2', 'Northwind']);
    expect(onKeytermsChange).toHaveBeenCalledTimes(1);
    expect(debug().at(-1)).toEqual({
      kind: 'stt',
      mode: 'deepgram',
      keyterms: ['Biscuit', 'SOC 2', 'Northwind'],
    });
    session.close();
  });

  it('does not restart speech-to-text when the terms did not change', () => {
    const { session, onKeytermsChange } = setup();
    session.handle({ type: 'session.brief', text: 'all lower case, nothing special' });
    session.handle({ type: 'session.brief', text: 'still nothing special here' });
    expect(onKeytermsChange).not.toHaveBeenCalled();
    session.close();
  });

  it('switches to the glossary terms for a long brief once it is ready', async () => {
    const long = `Lumenfield overview. ${'x '.repeat(2000)}`;
    const { session, onKeytermsChange } = setup({
      buildGlossary: () => Promise.resolve('churn rate, SOC 2'),
    });
    session.handle({ type: 'session.brief', text: long });
    await vi.advanceTimersByTimeAsync(10);
    expect(session.keyterms()).toEqual(['churn rate', 'SOC 2']);
    expect(onKeytermsChange).toHaveBeenCalled();
    session.close();
  });
});

describe('language', () => {
  it('starts in English and tells speech-to-text once for each change', () => {
    const onLanguageChange = vi.fn();
    const { session } = setup({ onLanguageChange });
    expect(session.language()).toBe('en');
    session.handle({ type: 'session.settings', language: 'es' });
    session.handle({ type: 'session.settings', language: 'es' });
    expect(session.language()).toBe('es');
    expect(onLanguageChange.mock.calls).toEqual([['es']]);
    session.handle({ type: 'session.settings', language: 'en' });
    expect(onLanguageChange.mock.calls).toEqual([['es'], ['en']]);
  });

  it('keeps the language when the settings carry only the pause', () => {
    const onLanguageChange = vi.fn();
    const { session } = setup({ onLanguageChange });
    session.handle({ type: 'session.settings', language: 'de' });
    session.handle({ type: 'session.settings', pauseMs: 2000 });
    expect(session.language()).toBe('de');
    expect(onLanguageChange).toHaveBeenCalledTimes(1);
  });
});
