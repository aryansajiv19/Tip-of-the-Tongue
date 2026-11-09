import { describe, expect, it } from 'vitest';
import { voicePick } from './liveReport.js';

const labels = (userLabel: number | undefined) => ({
  userLabel,
  otherLabel: undefined,
  words: 0,
  right: 0,
  heard: [],
});

describe('voicePick', () => {
  it("is right when the chosen voice number is the number the user's words were given", () => {
    expect(voicePick({ chosen: 1, labels: labels(1) })).toBe('right');
  });
  it('is wrong when they differ', () => {
    expect(voicePick({ chosen: 0, labels: labels(1) })).toBe('wrong');
  });
  it("is none when nothing was chosen or the user's words were never labelled", () => {
    expect(voicePick({ chosen: undefined, labels: labels(1) })).toBe('none');
    expect(voicePick({ chosen: 0, labels: labels(undefined) })).toBe('none');
  });
});
