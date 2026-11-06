import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent, Word } from '../../server/src/events';
import { Offer } from './offer/Offer';
import { offerReducer } from './offer/offerState';
import { useMic } from './audio/useMic';
import { useSocket } from './socket/useSocket';
import { speechSupported, useSpeech } from './speech/useSpeech';
import { stampWords } from './speech/stampWords';
import { TYPED_FINAL_DELAY_MS, typedSteps } from './speech/typedWords';

const MAX_WORDS = 60;
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
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
  const [heard, setHeard] = useState<string[]>([]);
  const [partial, setPartial] = useState('');
  const [brief, setBrief] = useState('');
  const [briefSent, setBriefSent] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [pauseS, setPauseS] = useState<number | null>(savedPause);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [guesserDown, setGuesserDown] = useState(false);

  // Who recognises speech: the server (Deepgram, audio streamed from here) or this browser.
  const [stt, setStt] = useState<'deepgram' | 'browser'>('browser');
  const [notice, setNotice] = useState('');
  const sttRef = useRef(stt);

  const onServerEvent = useCallback((e: ServerEvent) => {
    dispatch(e);
    if (e.type === 'guesser.status') setGuesserDown(!e.ok);
    else if (e.type === 'session.ready') {
      if (sttRef.current === 'deepgram' && e.stt === 'browser') {
        setNotice('Switched to this browser\u2019s speech recognition.');
      }
      sttRef.current = e.stt;
      setStt(e.stt);
    } else if (e.type === 'transcript.partial') setPartial(text(e.words));
    else if (e.type === 'transcript.final') {
      setPartial('');
      setHeard((h) => [...h, ...e.words.map((w) => w.text)].slice(-MAX_WORDS));
    }
  }, []);
  const { status, send, sendBinary } = useSocket(onServerEvent);
  const mic = useMic(sendBinary);

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
      setHeard((h) => [...h, ...words.map((w) => w.text)].slice(-MAX_WORDS));
      send({ type: 'transcript.final', words });
    },
    [send],
  );
  const speech = useSpeech({ onPartial: sendPartial, onFinal: sendFinal, debug: DEBUG });
  const { trace } = speech;

  // One Start/Pause for both ways of listening. `wanted` is what the user asked for.
  const wanted = useRef(false);
  const { start: startSpeech, stop: stopSpeech } = speech;
  const { start: startMic, stop: stopMic } = mic;
  const listening = stt === 'deepgram' ? mic.capturing : speech.listening;
  const error = stt === 'deepgram' ? mic.error : speech.error;
  const canListen = stt === 'deepgram' || speechSupported;

  const startListening = () => {
    wanted.current = true;
    setNotice('');
    if (stt === 'deepgram') void startMic();
    else startSpeech();
  };
  const pauseListening = () => {
    wanted.current = false;
    stopSpeech();
    stopMic();
  };
  // The server can switch the speech recognition (e.g. Deepgram fails): carry on listening.
  useEffect(() => {
    if (!wanted.current) return;
    if (stt === 'deepgram') {
      stopSpeech();
      void startMic();
    } else {
      stopMic();
      startSpeech();
    }
  }, [stt, startSpeech, stopSpeech, startMic, stopMic]);

  const downloadTrace = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(trace(), null, 1)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'speech-trace.json';
    a.click();
    URL.revokeObjectURL(url);
  };

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
        {canListen ? (
          <>
            <button type="button" onClick={listening ? pauseListening : startListening}>
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
        <p role="status">{notice}</p>
      </section>

      <p role="status">
        {guesserDown ? 'Word suggestions are unavailable right now; listening continues.' : ''}
      </p>

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
        <p>
          {heard.join(' ')}
          {partial && <span style={{ color: '#595959' }}> {partial}</span>}
        </p>
        {DEBUG && (
          <button type="button" onClick={downloadTrace}>
            Download speech trace
          </button>
        )}
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
