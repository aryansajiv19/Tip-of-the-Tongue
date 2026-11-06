import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent, Word } from '../../server/src/events';
import { Offer } from './offer/Offer';
import { offerReducer } from './offer/offerState';
import { useSocket } from './socket/useSocket';
import { speechSupported, useSpeech } from './speech/useSpeech';
import { stampWords } from './speech/stampWords';
import { TYPED_FINAL_DELAY_MS, typedSteps } from './speech/typedWords';

const MAX_LINES = 50;

const text = (words: Word[]) => words.map((w) => w.text).join(' ');

export function App() {
  const [offer, dispatch] = useReducer(offerReducer, null);
  const [lines, setLines] = useState<string[]>([]);
  const [partial, setPartial] = useState('');
  const [brief, setBrief] = useState('');
  const [briefSent, setBriefSent] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [guesserDown, setGuesserDown] = useState(false);

  const onServerEvent = useCallback((e: ServerEvent) => {
    dispatch(e);
    if (e.type === 'guesser.status') setGuesserDown(!e.ok);
  }, []);
  const { status, send } = useSocket(onServerEvent);

  // A dropped connection ends the server session, so its guesser problem is forgotten too.
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status !== 'connected') setGuesserDown(false);
  }

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

      <p role="status">
        {guesserDown ? 'Word suggestions are unavailable right now; listening continues.' : ''}
      </p>

      <Offer offer={offer} onClear={clearOffer} />

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
