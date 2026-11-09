import { useEffect, useRef } from 'react';

// Space should only ask for a word when it isn't being used for something else.
const OWN_SPACE_ROLES = [
  'button',
  'radio',
  'checkbox',
  'switch',
  'tab',
  'menuitem',
  'option',
  'link',
];

export function isTypingTarget(
  el: {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (n: string) => string | null;
  } | null,
) {
  if (!el) return false;
  if (OWN_SPACE_ROLES.includes(el.getAttribute?.('role') ?? '')) return true;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(el.tagName ?? '');
}

// Pressing Space (with focus on the page itself, not a field or button) calls `onAsk`.
export function useManualKey(enabled: boolean, onAsk: () => void) {
  const handler = useRef(onAsk);
  useEffect(() => {
    handler.current = onAsk;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      e.preventDefault(); // otherwise the page scrolls
      handler.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
