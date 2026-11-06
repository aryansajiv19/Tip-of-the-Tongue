import { useCallback, useEffect, useRef, useState } from 'react';
import type { Word } from '../../../server/src/events';
import { flushPending, isStale, stampResult } from './stampWords';

// The Web Speech API is not in TypeScript's DOM types, so declare the little we use.
interface Alternative {
  transcript: string;
}
interface Result {
  isFinal: boolean;
  0: Alternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: Result };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor =
  (window as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
    .SpeechRecognition ??
  (window as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export const speechSupported = Ctor !== undefined;

const RESTART_DELAY_MS = 250;
// In a quiet room this restarts the recognizer about every 20 s (a brief gap): cheaper than missing a silent stall.
const WATCHDOG_CHECK_MS = 5000;

// Errors after which restarting would just fail again.
const FATAL: Record<string, string> = {
  'not-allowed':
    'Microphone access was blocked. Allow it in the browser address bar, then press Start.',
  'service-not-allowed': 'Speech recognition is not allowed in this browser. Try Chrome or Edge.',
  'audio-capture': 'No microphone was found. Connect one, then press Start.',
  'language-not-supported': 'This language is not supported by speech recognition.',
};

interface Handlers {
  onPartial: (words: Word[]) => void;
  onFinal: (words: Word[]) => void;
}

export function useSpeech({ onPartial, onFinal }: Handlers) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wanted = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const words = useRef<Word[]>([]);
  const handlers = useRef({ onPartial, onFinal });
  useEffect(() => {
    handlers.current = { onPartial, onFinal };
  });

  // Send any unfinalised partial as a final before recognition ends or restarts.
  const flush = useCallback(() => {
    const { send, rest } = flushPending(words.current);
    words.current = rest;
    if (send) handlers.current.onFinal(send);
  }, []);

  const beginRef = useRef<() => void>(() => undefined);
  const lastEvent = useRef(0); // set by begin() before the watchdog can run
  const begin = useCallback(() => {
    if (!Ctor) return;
    const touch = () => {
      lastEvent.current = Date.now();
    };
    touch();
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || 'en-GB';
    r.onstart = touch;
    r.onresult = (e) => {
      touch();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result) continue;
        const { words: heard, rest } = stampResult(
          words.current,
          result[0].transcript,
          result.isFinal,
          Date.now(),
        );
        words.current = rest;
        if (!heard.length) continue;
        if (result.isFinal) handlers.current.onFinal(heard);
        else handlers.current.onPartial(heard);
      }
    };
    r.onerror = (e) => {
      const message = FATAL[e.error];
      if (message) {
        wanted.current = false;
        setError(message);
        setListening(false);
      }
    };
    // Chrome ends the session after a stretch of silence; start again while listening.
    r.onend = () => {
      if (rec.current !== r) return; // an instance we already replaced
      touch();
      flush();
      if (wanted.current) setTimeout(() => wanted.current && beginRef.current(), RESTART_DELAY_MS);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setError('Could not start the microphone. Press Start to try again.');
      wanted.current = false;
      setListening(false);
    }
  }, [flush]);

  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const start = useCallback(() => {
    if (!Ctor || wanted.current) return;
    setError(null);
    wanted.current = true;
    setListening(true);
    begin();
  }, [begin]);

  const stop = useCallback(() => {
    wanted.current = false;
    setListening(false);
    flush();
    if (rec.current) rec.current.onresult = null;
    rec.current?.stop();
  }, [flush]);

  // Replace the recognizer with a fresh one. Its predecessor's late events are ignored.
  const restart = useCallback(() => {
    if (!wanted.current) return;
    const old = rec.current;
    rec.current = null;
    if (old) old.onresult = null; // a late result from the old recognizer would repeat the flushed words
    flush();
    old?.stop();
    begin();
  }, [begin, flush]);

  // Chrome can stop recognition without telling us, and stops it when the tab is hidden.
  useEffect(() => {
    const timer = setInterval(() => {
      if (isStale(wanted.current, lastEvent.current, Date.now())) restart();
    }, WATCHDOG_CHECK_MS);
    const onVisible = () => (document.visibilityState === 'visible' ? restart() : flush());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [restart, flush]);

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.stop();
    },
    [],
  );

  return { listening, error, start, stop };
}
