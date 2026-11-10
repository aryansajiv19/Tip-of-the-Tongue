import { describe, expect, it } from 'vitest';
import { micErrorMessage } from './micError';

const BLOCKED = 'Allow the microphone in System Settings.';
const fail = (name: string) => micErrorMessage(new DOMException('x', name), BLOCKED);

describe('micErrorMessage', () => {
  it('says to allow access when the browser or system blocked it', () => {
    expect(fail('NotAllowedError')).toBe(BLOCKED);
    expect(fail('SecurityError')).toBe(BLOCKED);
  });

  it('names another app when the device cannot be read (a call app holding it on Windows)', () => {
    expect(fail('NotReadableError')).toMatch(/another app/i);
    expect(fail('NotReadableError')).toMatch(/Settings/);
  });

  it('says there is no microphone when none is found', () => {
    expect(fail('NotFoundError')).toMatch(/no microphone found/i);
  });

  it('gives plain words for anything else, with no error names or codes', () => {
    const messages = [
      fail('AbortError'),
      fail('OverconstrainedError'),
      micErrorMessage(new Error('boom'), BLOCKED),
      micErrorMessage('x', BLOCKED),
    ];
    for (const message of messages) {
      expect(message).toMatch(/microphone/i);
      expect(message).not.toMatch(/Error|DOMException|boom/);
    }
  });
});
