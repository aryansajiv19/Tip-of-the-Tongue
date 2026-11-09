import { describe, expect, it } from 'vitest';
import { otherVoiceFor, speechText, USER_VOICES } from './say.js';

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
