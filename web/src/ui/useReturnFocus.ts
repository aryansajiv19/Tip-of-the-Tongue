import { useEffect, useRef } from 'react';

// For a panel that opens from a button: focus moves into the panel when it opens and goes back to
// what had focus (the button) when it closes. Attach the returned ref to the panel, which needs
// tabIndex={-1}.
export function useReturnFocus<T extends HTMLElement>() {
  const panel = useRef<T>(null);
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return panel;
}
