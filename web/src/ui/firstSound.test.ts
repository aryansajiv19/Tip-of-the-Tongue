import { describe, expect, it } from 'vitest';
import { cue, firstSound } from './firstSound';

describe('firstSound', () => {
  it('is the first letter', () => {
    expect(firstSound('waiting list')).toBe('w');
    expect(firstSound('pharmacy')).toBe('ph');
    expect(firstSound('renewal')).toBe('r');
  });

  it("keeps letters that sound as one together, in the word's own case", () => {
    expect(firstSound('chemist')).toBe('ch');
    expect(firstSound('Shop')).toBe('Sh');
    expect(firstSound('THE')).toBe('TH');
    expect(firstSound('whisk')).toBe('wh');
    expect(firstSound('quote')).toBe('qu');
  });

  it('gives one character for a digit, a symbol or an accented letter', () => {
    expect(firstSound('3D printer')).toBe('3');
    expect(firstSound('$ARR')).toBe('$');
    expect(firstSound('école')).toBe('é');
    expect(firstSound('😀 smile')).toBe('😀');
  });

  it('ignores leading space, and is empty for nothing', () => {
    expect(firstSound('  kettle')).toBe('k');
    expect(firstSound('')).toBe('');
    expect(firstSound('   ')).toBe('');
  });

  it('never gives the whole of a one- or two-letter word away beyond its start', () => {
    expect(firstSound('a')).toBe('a');
    expect(firstSound('ok')).toBe('o');
  });
});

describe('cue', () => {
  it('adds an ellipsis', () => {
    expect(cue('waiting list')).toBe('w…');
    expect(cue('chemist')).toBe('ch…');
  });
});
