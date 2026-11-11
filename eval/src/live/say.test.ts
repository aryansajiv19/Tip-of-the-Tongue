import { describe, expect, it } from 'vitest';
import {
  cacheKey,
  otherVoiceFor,
  otherVoicesFor,
  sayArgs,
  speechText,
  USER_VOICES,
} from './say.js';

describe('speechText', () => {
  it('turns each "..." into silence of the given length', () => {
    expect(speechText('the... place... where', 2000)).toBe(
      'the [[slnc 2000]] place [[slnc 2000]] where',
    );
  });
  it('handles a "..." at the start or end and leaves other text alone', () => {
    expect(speechText('... hello, there.', 1100)).toBe('[[slnc 1100]] hello, there.');
    expect(speechText('wait...', 800)).toBe('wait [[slnc 800]]');
    expect(speechText('no pauses here', 2000)).toBe('no pauses here');
  });
});

describe('otherVoiceFor', () => {
  it('gives a voice of the other gender, and never the same voice', () => {
    for (const v of USER_VOICES) expect(otherVoiceFor(v)).not.toBe(v);
    expect(otherVoiceFor('Daniel')).toBe('Samantha');
    expect(otherVoiceFor('Rishi')).toBe('Samantha');
    expect(otherVoiceFor('Karen')).toBe('Daniel');
    expect(otherVoiceFor('Samantha')).toBe('Daniel');
  });
});

describe('speaking rate', () => {
  it('passes -r to say only when a rate is given', () => {
    expect(sayArgs('Daniel', 'a.wav', 'hi')).not.toContain('-r');
    expect(sayArgs('Daniel', 'a.wav', 'hi', 120).slice(0, 4)).toEqual([
      '-v',
      'Daniel',
      '-r',
      '120',
    ]);
  });
  it('keeps one cached rendering per rate, and the old key when there is no rate', () => {
    expect(cacheKey('Daniel', 'hi', 120)).not.toBe(cacheKey('Daniel', 'hi', 240));
    expect(cacheKey('Daniel', 'hi', 120)).not.toBe(cacheKey('Daniel', 'hi'));
  });
});

describe('otherVoicesFor', () => {
  it("gives distinct voices, none the user's, the usual contrast first", () => {
    for (const v of USER_VOICES) {
      const others = otherVoicesFor(v, 3);
      expect(others).toHaveLength(3);
      expect(new Set([v, ...others]).size).toBe(4);
      expect(others[0]).toBe(otherVoiceFor(v));
    }
  });
});
