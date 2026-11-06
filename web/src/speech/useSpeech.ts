import { useCallback, useEffect, useRef, useState } from 'react';
import type { Word } from '../../../server/src/events';
import { stampWords } from './stampWords';

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

  const beginRef = useRef<() => void>(() => undefined);
  const begin = useCallback(() => {
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || 'en-GB';
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result) continue;
        words.current = stampWords(words.current, result[0].transcript, Date.now());
        if (result.isFinal) {
          if (words.current.length) handlers.current.onFinal(words.current);
          words.current = [];
        } else if (words.current.length) {
          handlers.current.onPartial(words.current);
        }
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
      words.current = [];
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
  }, []);

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
    rec.current?.stop();
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.stop();
    },
    [],
  );

  return { listening, error, start, stop };
}
