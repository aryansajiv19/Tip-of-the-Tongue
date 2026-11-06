import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClientEvent, Word } from '../../server/src/events';
import { Offer } from './offer/Offer';
import { offerReducer } from './offer/offerState';
import { useSocket } from './socket/useSocket';
import { speechSupported, useSpeech } from './speech/useSpeech';
import { stampWords } from './speech/stampWords';
import { TYPED_FINAL_DELAY_MS, typedSteps } from './speech/typedWords';

const MAX_LINES = 50;
const PAUSE_KEY = 'tott.pauseSeconds';
const DEFAULT_PAUSE_S = 1.5;

// The saved setting, or null if the user never changed it (then the server's default applies).
function savedPause(): number | null {
  try {
    const n = Number(localStorage.getItem(PAUSE_KEY));
    return n >= 0.8 && n <= 5 ? n : null;
  } catch {
    return null;
  }
}

const text = (words: Word[]) => words.map((w) => w.text).join(' ');

export function App() {
  const [offer, dispatch] = useReducer(offerReducer, null);
  const [lines, setLines] = useState<string[]>([]);
  const [partial, setPartial] = useState('');
  const [brief, setBrief] = useState('');
  const [briefSent, setBriefSent] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [pauseS, setPauseS] = useState<number | null>(savedPause);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { status, send } = useSocket(dispatch);

  const sendPartial = useCallback(
    (words: Word[]) => {
      setPartial(text(words));
      send({ type: 'transcript.partial', words });
    },
    [send],
  );
  const sendFinal = useCallback(
    (words: Word[]) => {
      setPartial('');
      setLines((l) => [...l, text(words)].slice(-MAX_LINES));
      send({ type: 'transcript.final', words });
    },
    [send],
  );
  const { listening, error, start, stop } = useSpeech({
    onPartial: sendPartial,
    onFinal: sendFinal,
  });

  // The brief is session state on the server: send it again after a reconnect.
  useEffect(() => {
    if (status === 'connected' && briefSent !== null) {
      send({ type: 'session.brief', text: briefSent } satisfies ClientEvent);
    }
  }, [status, briefSent, send]);

  // Only sent once the user has chosen a value, so the server's STUCK_PAUSE_MS applies until then.
  useEffect(() => {
    if (status === 'connected' && pauseS !== null) {
      send({ type: 'session.settings', pauseMs: Math.round(pauseS * 1000) } satisfies ClientEvent);
    }
  }, [status, pauseS, send]);

  const changePause = (seconds: number) => {
    setPauseS(seconds);
    try {
      localStorage.setItem(PAUSE_KEY, String(seconds));
    } catch {
      // Private mode: the setting still works for this visit.
    }
  };

  const clearOffer = useCallback(() => dispatch({ type: 'offer.clear' }), []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // No-mic test: words arrive 300 ms apart, then ~1 s of silence, then a final (as Chrome does).
  const playTyped = () => {
    timers.current.forEach(clearTimeout);
    let prev: Word[] = [];
    const steps = typedSteps(typed);
    const lastMs = steps.at(-1)?.delayMs ?? 0;
    timers.current = steps.map(({ transcript, delayMs }) =>
      setTimeout(() => {
        prev = stampWords(prev, transcript, Date.now());
        sendPartial(prev);
      }, delayMs),
    );
    timers.current.push(setTimeout(() => sendFinal(prev), lastMs + TYPED_FINAL_DELAY_MS));
    setTyped('');
  };

  return (
    <main>
      <h1>Tip of the Tongue</h1>
      <p role="status">Server: {status}</p>

      <section aria-labelledby="listen-h">
        <h2 id="listen-h">Listening</h2>
        {speechSupported ? (
          <>
            <button type="button" onClick={listening ? stop : start}>
              {listening ? 'Pause listening' : 'Start listening'}
            </button>
            <p role="status">
              {!listening
                ? 'Not listening'
                : status === 'connected'
                  ? '● Listening'
                  : '● Listening paused: not connected to the server, so no word suggestions'}
            </p>
          </>
        ) : (
          <p role="alert">
            This browser has no speech recognition. Use Chrome or Edge, or try the test input below.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>

      <Offer offer={offer} onClear={clearOffer} />

      <section aria-labelledby="settings-h">
        <h2 id="settings-h">Settings</h2>
        <label htmlFor="pause">
          Wait before suggesting: {(pauseS ?? DEFAULT_PAUSE_S).toFixed(1)} s
        </label>
        <input
          id="pause"
          type="range"
          min={0.8}
          max={5}
          step={0.1}
          value={pauseS ?? DEFAULT_PAUSE_S}
          onChange={(e) => changePause(Number(e.target.value))}
        />
      </section>

      <section aria-labelledby="brief-h">
        <h2 id="brief-h">Meeting brief (optional)</h2>
        <label htmlFor="brief">Agenda, names, product or client terms</label>
        <textarea
          id="brief"
          rows={4}
          maxLength={5000}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <button type="button" onClick={() => setBriefSent(brief)}>
          Use this brief
        </button>
      </section>

      <section aria-labelledby="tx-h">
        <h2 id="tx-h">Transcript</h2>
        <ul>
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        {partial && <p aria-label="Heard so far">{partial}</p>}
      </section>

      <section aria-labelledby="test-h">
        <h2 id="test-h">Test input (no mic)</h2>
        <label htmlFor="typed">Type a phrase; it is sent as speech, one word every 300 ms</label>
        <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="button" onClick={playTyped} disabled={!typed.trim()}>
          Send as speech
        </button>
      </section>
    </main>
  );
}
