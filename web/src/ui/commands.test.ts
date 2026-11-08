import { describe, expect, it } from 'vitest';
import { commandForKey, modifierLabel } from './commands';

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
