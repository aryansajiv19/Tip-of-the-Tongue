import { useCallback, useEffect, useRef, useState } from 'react';
import type { Word } from '../../../server/src/events';
import { applyResults, emptySpeech, flushSpeech, resetSpeech, type SpeechState } from './results';
import { isStale } from './stampWords';
import { MIC_BLOCKED } from '../ui/desktop';

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
  'not-allowed': MIC_BLOCKED,
  'service-not-allowed': 'Speech recognition is not allowed in this browser. Try Chrome or Edge.',
  'audio-capture': 'No microphone was found. Connect one, then press Start.',
  'language-not-supported': 'This language is not supported by speech recognition.',
};

interface Handlers {
  // Words still being recognised; replaces the previous partial.
  onPartial: (words: Word[]) => void;
  // Words that just became final: each word arrives here once, in order.
  onFinal: (words: Word[]) => void;
  // Record raw recognition events so they can be downloaded (?debug=1).
  debug?: boolean;
}

export interface TraceEntry {
  t: number;
  event: 'start' | 'result' | 'end' | 'error';
  resultIndex?: number;
  results?: { isFinal: boolean; transcript: string }[];
  error?: string;
}

export function useSpeech({ onPartial, onFinal, debug = false }: Handlers) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wanted = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const speech = useRef<SpeechState>(emptySpeech);
  const trace = useRef<TraceEntry[]>([]);
  const record = useCallback(
    (entry: Omit<TraceEntry, 't'>) => {
      if (debug) trace.current.push({ t: Date.now(), ...entry });
    },
    [debug],
  );
  const handlers = useRef({ onPartial, onFinal });
  useEffect(() => {
    handlers.current = { onPartial, onFinal };
  });

  // Send any unfinalised partial as a final before recognition ends or restarts.
  const flush = useCallback(() => {
    const { state, final } = flushSpeech(speech.current);
    speech.current = state;
    if (final) handlers.current.onFinal(final);
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
    r.onstart = () => {
      touch();
      record({ event: 'start' });
    };
    r.onresult = (e) => {
      touch();
      const results = Array.from({ length: e.results.length }, (_, i) => {
        const result = e.results[i];
        return { isFinal: result?.isFinal ?? false, transcript: result?.[0].transcript ?? '' };
      });
      record({ event: 'result', resultIndex: e.resultIndex, results });
      const update = applyResults(speech.current, results, Date.now());
      speech.current = update.state;
      if (update.final) handlers.current.onFinal(update.final);
      if (update.partial) handlers.current.onPartial(update.partial);
    };
    r.onerror = (e) => {
      record({ event: 'error', error: e.error });
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
      record({ event: 'end' });
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
  }, [flush, record]);

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

  // A new conversation: words heard so far are not sent again.
  const reset = useCallback(() => {
    speech.current = resetSpeech(speech.current);
  }, []);

  return { listening, error, start, stop, reset, trace: () => trace.current };
}
