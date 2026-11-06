import { describe, expect, it } from 'vitest';
import type { DebugInfo } from '../../../server/src/events';
import { emptyDebug, reduceDebug, type DebugEvent } from './debugState';

const ev = (info: DebugInfo, atMs = 1): DebugEvent => ({ type: 'debug', atMs, info });
const detector = (n: number): DebugInfo => ({ kind: 'detector', stuck: false, silenceMs: n });

describe('reduceDebug', () => {
  it('collects final transcript words, fillers included, and the live partial', () => {
    let s = reduceDebug(emptyDebug, ev({ kind: 'transcript', final: false, text: 'so um' }), 100);
    expect(s.partial).toBe('so um');
    expect(s.heard).toEqual([]);
    s = reduceDebug(s, ev({ kind: 'transcript', final: true, text: 'so um the thing' }), 200);
    expect(s.heard).toEqual(['so', 'um', 'the', 'thing']);
    expect(s.partial).toBe('');
  });

  it('keeps transcript lines out of the event list', () => {
    const s = reduceDebug(emptyDebug, ev({ kind: 'transcript', final: true, text: 'hi' }), 1);
    expect(s.events).toEqual([]);
  });

  it('moves the silence clock only when words arrive', () => {
    let s = reduceDebug(emptyDebug, ev({ kind: 'transcript', final: false, text: 'hi' }), 500);
    expect(s.lastWordAt).toBe(500);
    s = reduceDebug(s, ev({ kind: 'transcript', final: false, text: '' }), 900);
    expect(s.lastWordAt).toBe(500);
    s = reduceDebug(s, ev(detector(10)), 1000);
    expect(s.lastWordAt).toBe(500);
  });

  it('keeps only the last 20 events', () => {
    let s = emptyDebug;
    for (let i = 0; i < 30; i++) s = reduceDebug(s, ev(detector(i), i), i);
    expect(s.events).toHaveLength(20);
    expect(s.events[0]?.atMs).toBe(10);
    expect(s.events.at(-1)?.atMs).toBe(29);
  });

  it('keeps the latest speech-to-text setup', () => {
    const first: DebugInfo = { kind: 'stt', mode: 'browser', keyterms: [] };
    const second: DebugInfo = { kind: 'stt', mode: 'deepgram', keyterms: ['SOC 2'] };
    const s = reduceDebug(reduceDebug(emptyDebug, ev(first), 1), ev(second), 2);
    expect(s.stt).toEqual(second);
  });

  it('keeps only the last 60 heard words', () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    const s = reduceDebug(emptyDebug, ev({ kind: 'transcript', final: true, text }), 1);
    expect(s.heard).toHaveLength(60);
    expect(s.heard.at(-1)).toBe('w99');
  });
});
