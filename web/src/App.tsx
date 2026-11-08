import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent, Word } from '../../server/src/events';
import { RotateCcw } from 'lucide-react';
import { Settings } from './ui/Settings';
import { SuggestionCard } from './ui/SuggestionCard';
import { cardReducer, emptyCard } from './ui/cardState';
import { statusLine } from './ui/cardView';
import { createResetGate } from './ui/resetGate';
import { useCardClock } from './ui/useCardClock';
import { useManualKey } from './audio/useManualKey';
import { useMic } from './audio/useMic';
import { useVoice } from './audio/useVoice';
import { useSocket } from './socket/useSocket';
import { speechSupported, useSpeech } from './speech/useSpeech';
import { stampWords } from './speech/stampWords';
import { TYPED_FINAL_DELAY_MS, typedSteps } from './speech/typedWords';
import { saveDebug, savedDebug } from './settings/debug';
import { saveMicId, savedMicId } from './settings/mic';
import {
  SENSITIVITIES,
  saveSensitivity,
  savedSensitivity,
  type Sensitivity,
} from './settings/sensitivity';
import './app.css';

const MAX_WORDS = 60;

const text = (words: Word[]) => words.map((w) => w.text).join(' ');

export function App() {
  const [card, dispatchCard] = useReducer(cardReducer, emptyCard);
  const gate = useRef(createResetGate()).current;
  const [micId, setMicId] = useState<string | null>(savedMicId);
  const [debugOn, setDebugOn] = useState(savedDebug);
  const [heard, setHeard] = useState<string[]>([]);
  const [partial, setPartial] = useState('');
  const [brief, setBrief] = useState('');
  const [briefSent, setBriefSent] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  // null until the user chooses, so the server's own defaults apply until then.
  const [sensitivity, setSensitivity] = useState<Sensitivity | null>(savedSensitivity);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [guesserDown, setGuesserDown] = useState(false);

  // Who recognises speech: the server (Deepgram, audio streamed from here) or this browser.
  const [stt, setStt] = useState<'deepgram' | 'browser'>('browser');
  const [notice, setNotice] = useState('');
  const sttRef = useRef(stt);

  const onServerEvent = useCallback(
    (e: ServerEvent) => {
      if (e.type === 'guesser.status') return setGuesserDown(!e.ok);
      if (e.type === 'session.ready') {
        // A new connection is a new server session.
        gate.connected();
        dispatchCard({ type: 'clear' });
        if (sttRef.current === 'deepgram' && e.stt === 'browser') {
          setNotice('Switched to this browser\u2019s speech recognition.');
        }
        sttRef.current = e.stt;
        return setStt(e.stt);
      }
      // Anything the server sent before it answered a reset belongs to the old conversation.
      if (!gate.pass(e)) return;
      dispatchCard({ type: 'server', event: e, nowMs: Date.now() });
      if (e.type === 'transcript.partial') setPartial(text(e.words));
      else if (e.type === 'transcript.final') {
        setPartial('');
        setHeard((h) => [...h, ...e.words.map((w) => w.text)].slice(-MAX_WORDS));
      }
    },
    [gate],
  );
  const { status, send, sendBinary } = useSocket(onServerEvent, debugOn);
  const mic = useMic(sendBinary, micId);

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
  const speech = useSpeech({ onPartial: sendPartial, onFinal: sendFinal, debug: debugOn });
  const { trace } = speech;

  // One Start/Pause for both ways of listening. `wanted` is what the user asked for.
  const wanted = useRef(false);
  const { start: startSpeech, stop: stopSpeech } = speech;
  const { start: startMic, stop: stopMic } = mic;
  const listening = stt === 'deepgram' ? mic.capturing : speech.listening;
  const error = stt === 'deepgram' ? mic.error : speech.error;
  useVoice(listening, (voiced, atMs) => send({ type: 'voice.activity', voiced, atMs }), micId);
  useManualKey(listening, () => send({ type: 'stuck.manual' }));
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

  useEffect(() => {
    if (status === 'connected' && sensitivity !== null) {
      const { pauseMs, minConfidence } = SENSITIVITIES[sensitivity];
      send({ type: 'session.settings', pauseMs, minConfidence } satisfies ClientEvent);
    }
  }, [status, sensitivity, send]);

  const changeSensitivity = (value: Sensitivity) => {
    setSensitivity(value);
    saveSensitivity(value);
  };

  const dismissCard = useCallback(() => dispatchCard({ type: 'dismiss' }), []);
  useCardClock(card.view !== null, dispatchCard);
  const problem = statusLine({ micError: error, connection: status, guesserDown });
  const { reset: resetSpeech } = speech;

  // A new conversation: forget what was heard here and on the server. The brief and settings stay.
  const newConversation = () => {
    timers.current.forEach(clearTimeout);
    gate.reset();
    dispatchCard({ type: 'clear' });
    setHeard([]);
    setPartial('');
    resetSpeech();
    send({ type: 'session.reset' });
  };

  const openDebugView = () =>
    window.open('/?view=debug', 'tott-debug', 'popup,width=480,height=720');
  const changeDebug = (on: boolean) => {
    setDebugOn(on);
    saveDebug(on);
  };
  const changeMic = (id: string | null) => {
    setMicId(id);
    saveMicId(id);
  };

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
    <main className="page">
      <header className="top">
        <h1>Tip of the Tongue</h1>
        <div className="pills">
          <p role="status" className={`pill pill-${status}`}>
            <span className="sr-only">Server: </span>
            {status}
          </p>
          <p className="pill pill-plain">Speech: {stt === 'deepgram' ? 'Deepgram' : 'browser'}</p>
          <button type="button" className="btn btn-small" onClick={newConversation}>
            <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" /> New conversation
          </button>
          <Settings
            sensitivity={sensitivity}
            onSensitivity={changeSensitivity}
            micId={micId}
            onMic={changeMic}
            debugOn={debugOn}
            onDebug={changeDebug}
            onOpenDebugView={openDebugView}
            onDownloadTrace={downloadTrace}
          />
        </div>
      </header>

      <section aria-labelledby="listen-h" className="card listen">
        <h2 id="listen-h" className="sr-only">
          Listening
        </h2>
        {canListen ? (
          <>
            <div className="actions">
              <button
                type="button"
                className={listening ? 'btn btn-primary btn-on' : 'btn btn-primary'}
                onClick={listening ? pauseListening : startListening}
              >
                {listening ? 'Pause listening' : 'Start listening'}
              </button>
              <button type="button" className="btn" disabled title="Not available yet">
                What&apos;s the word?
              </button>
            </div>
            <p role="status" className="listen-state">
              <span className={listening ? 'dot dot-on' : 'dot'} aria-hidden="true" />
              {!listening
                ? 'Not listening'
                : status === 'connected'
                  ? 'Listening'
                  : 'Listening paused: not connected to the server, so no word suggestions'}
            </p>
          </>
        ) : (
          <p role="alert" className="notice">
            This browser has no speech recognition. Use Chrome or Edge, or try the test input below.
          </p>
        )}
        <p role="status" className="notice notice-quiet">
          {notice}
        </p>
      </section>

      <SuggestionCard
        card={card}
        problem={problem}
        onPick={(id, word) => {
          dispatchCard({ type: 'picked', word, nowMs: Date.now() });
          send({ type: 'guess.picked', id, word });
        }}
        onDismiss={dismissCard}
      />

      <section aria-labelledby="tx-h" className="card transcript">
        <h2 id="tx-h">Transcript</h2>
        <p className="reading">
          {heard.length === 0 && !partial && (
            <span className="muted">What you say will appear here.</span>
          )}
          {heard.join(' ')}
          {partial && <span className="muted"> {partial}</span>}
        </p>
      </section>

      <details className="card fold">
        <summary>Before the meeting</summary>
        <div className="field">
          <label htmlFor="brief">
            Meeting brief (optional): agenda, names, product or client terms
          </label>
          <textarea
            id="brief"
            rows={4}
            maxLength={50_000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <button type="button" className="btn btn-small" onClick={() => setBriefSent(brief)}>
            Use this brief
          </button>
        </div>
      </details>

      {/* Without speech recognition this is the only way in, so it starts open. */}
      <details className="card fold" open={!canListen}>
        <summary>Test without a mic</summary>
        <div className="field">
          <label htmlFor="typed">Type a phrase; it is sent as speech, one word every 300 ms</label>
          <div className="row">
            <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button
              type="button"
              className="btn btn-small"
              onClick={playTyped}
              disabled={!typed.trim()}
            >
              Send as speech
            </button>
          </div>
        </div>
      </details>
    </main>
  );
}
