import { useCallback, useEffect, useRef, useState } from 'react';
import { initialHealth, inputHealth, noteLevel, noteWords, type InputHealth } from './inputHealth';

// While `listening`, judges once a second whether the microphone and the words agree (see
// inputHealth.ts). Feed it every level reading and every arrival of words.
export function useInputHealth(listening: boolean) {
  const state = useRef(initialHealth);
  const [health, setHealth] = useState<InputHealth>('ok');

  useEffect(() => {
    state.current = initialHealth;
    if (!listening) return;
    const timer = setInterval(() => setHealth(inputHealth(state.current, Date.now())), 1000);
    return () => {
      clearInterval(timer);
      setHealth('ok');
    };
  }, [listening]);

  const level = useCallback((rms: number) => {
    state.current = noteLevel(state.current, rms, Date.now());
  }, []);
  const words = useCallback(() => {
    state.current = noteWords(state.current, Date.now());
  }, []);
  return { health, level, words };
}
