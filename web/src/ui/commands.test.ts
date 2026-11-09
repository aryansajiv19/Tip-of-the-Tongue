import { describe, expect, it } from 'vitest';
import { commandForKey, modifierLabel, pickForKey } from './commands';

const key = (code: string, mods: Partial<Parameters<typeof commandForKey>[0]> = {}) =>
  commandForKey({
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...mods,
  });

describe('commandForKey', () => {
  it('Cmd or Ctrl + \\ toggles the overlay', () => {
    expect(key('Backslash', { metaKey: true })).toBe('toggle-visible');
    expect(key('Backslash', { ctrlKey: true })).toBe('toggle-visible');
  });

  it('Cmd or Ctrl + Enter asks for a word', () => {
    expect(key('Enter', { metaKey: true })).toBe('manual');
    expect(key('Enter', { ctrlKey: true })).toBe('manual');
  });

  it('Cmd or Ctrl + Shift + N starts a new conversation, and N alone or without Shift does not', () => {
    expect(key('KeyN', { metaKey: true, shiftKey: true })).toBe('new-conversation');
    expect(key('KeyN', { ctrlKey: true, shiftKey: true })).toBe('new-conversation');
    expect(key('KeyN', { metaKey: true })).toBeNull();
    expect(key('KeyN', { shiftKey: true })).toBeNull();
    expect(key('KeyN', { metaKey: true, ctrlKey: true, shiftKey: true })).toBeNull();
    expect(key('KeyN', { metaKey: true, shiftKey: true, altKey: true })).toBeNull();
    expect(key('KeyN', { metaKey: true, shiftKey: true, repeat: true })).toBeNull();
    expect(key('KeyM', { metaKey: true, shiftKey: true })).toBeNull();
  });

  it('needs exactly one of Cmd and Ctrl', () => {
    expect(key('Enter')).toBeNull();
    expect(key('Enter', { metaKey: true, ctrlKey: true })).toBeNull();
  });

  it('ignores other keys, extra modifiers and key repeat', () => {
    expect(key('KeyA', { metaKey: true })).toBeNull();
    expect(key('Enter', { metaKey: true, shiftKey: true })).toBeNull();
    expect(key('Enter', { metaKey: true, altKey: true })).toBeNull();
    expect(key('Backslash', { metaKey: true, repeat: true })).toBeNull();
  });
});

describe('modifierLabel', () => {
  it('is the command key on a Mac and Ctrl elsewhere', () => {
    expect(modifierLabel('MacIntel')).toBe('⌘');
    expect(modifierLabel('iPhone')).toBe('⌘');
    expect(modifierLabel('Win32')).toBe('Ctrl');
    expect(modifierLabel('Linux x86_64')).toBe('Ctrl');
    expect(modifierLabel('')).toBe('Ctrl');
  });
});

describe('pickForKey', () => {
  const pick = (code: string, mods: Partial<Parameters<typeof pickForKey>[0]> = {}) =>
    pickForKey({
      code,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      ...mods,
    });

  it('Cmd or Ctrl + 1, 2, 3 picks the first, second or third suggestion', () => {
    expect(pick('Digit1', { metaKey: true })).toBe(0);
    expect(pick('Digit2', { ctrlKey: true })).toBe(1);
    expect(pick('Digit3', { metaKey: true })).toBe(2);
    expect(pick('Numpad2', { ctrlKey: true })).toBe(1);
  });

  it('ignores other digits, a bare digit, other modifiers, both Cmd and Ctrl, and key repeat', () => {
    expect(pick('Digit4', { metaKey: true })).toBeNull();
    expect(pick('Digit0', { metaKey: true })).toBeNull();
    expect(pick('Digit1')).toBeNull();
    expect(pick('Digit1', { metaKey: true, altKey: true })).toBeNull();
    expect(pick('Digit1', { metaKey: true, shiftKey: true })).toBeNull();
    expect(pick('Digit1', { metaKey: true, ctrlKey: true })).toBeNull();
    expect(pick('Digit1', { metaKey: true, repeat: true })).toBeNull();
    expect(pick('KeyA', { metaKey: true })).toBeNull();
  });
});
