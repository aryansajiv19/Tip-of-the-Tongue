import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './useManualKey';

describe('isTypingTarget', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'])(
    '%s keeps its own Space',
    (tagName) => expect(isTypingTarget({ tagName })).toBe(true),
  );

  it('an editable element keeps its own Space', () =>
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true));

  it.each(['BODY', 'DIV', 'MAIN', 'P', 'SECTION'])('%s lets Space ask for a word', (tagName) =>
    expect(isTypingTarget({ tagName })).toBe(false),
  );

  it('no target (focus on the page) lets Space ask', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({})).toBe(false);
  });
});
